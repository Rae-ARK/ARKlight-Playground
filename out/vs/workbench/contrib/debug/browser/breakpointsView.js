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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox, TriStateCheckbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Orientation } from "../../../../base/browser/ui/splitview/splitview.js";
import { Action } from "../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import * as resources from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { Constants } from "../../../../base/common/uint.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize, localize2 } from "../../../../nls.js";
import { getActionBarActions, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { BREAKPOINTS_VIEW_ID, BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_BREAKPOINT_HAS_MODES, CONTEXT_BREAKPOINT_INPUT_FOCUSED, CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES, CONTEXT_BREAKPOINT_ITEM_TYPE, CONTEXT_BREAKPOINT_SUPPORTS_CONDITION, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_IN_DEBUG_MODE, CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, DEBUG_SCHEME, DataBreakpointSetType, DebuggerString, IDebugService, State } from "../common/debug.js";
import { Breakpoint, DataBreakpoint, ExceptionBreakpoint, FunctionBreakpoint, InstructionBreakpoint } from "../common/debugModel.js";
import { DisassemblyViewInput } from "../common/disassemblyViewInput.js";
import * as icons from "./debugIcons.js";
import { equals } from "../../../../base/common/arrays.js";
import { hasKey } from "../../../../base/common/types.js";
const $ = dom.$;
function createCheckbox(disposables) {
  const checkbox = new Checkbox("", false, defaultCheckboxStyles);
  checkbox.domNode.tabIndex = -1;
  disposables.add(checkbox);
  return checkbox;
}
const MAX_VISIBLE_BREAKPOINTS = 9;
function getExpandedBodySize(model, sessionId, countLimit) {
  const length = model.getBreakpoints().length + model.getExceptionBreakpointsForSession(sessionId).length + model.getFunctionBreakpoints().length + model.getDataBreakpoints().length + model.getInstructionBreakpoints().length;
  return Math.min(countLimit, length) * 22;
}
class BreakpointsFolderItem {
  constructor(uri, breakpoints) {
    this.uri = uri;
    this.breakpoints = breakpoints;
  }
  getId() {
    return this.uri.toString();
  }
  get enabled() {
    return this.breakpoints.every((bp) => bp.enabled);
  }
  get indeterminate() {
    const enabledCount = this.breakpoints.filter((bp) => bp.enabled).length;
    return enabledCount > 0 && enabledCount < this.breakpoints.length;
  }
}
function getModeKindForBreakpoint(breakpoint) {
  const kind = breakpoint instanceof Breakpoint ? "source" : breakpoint instanceof InstructionBreakpoint ? "instruction" : "exception";
  return kind;
}
let BreakpointsView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, instantiationService, themeService, editorService, contextViewService, configurationService, viewDescriptorService, contextKeyService, openerService, labelService, menuService, hoverService, languageService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.editorService = editorService;
    this.contextViewService = contextViewService;
    this.labelService = labelService;
    this.languageService = languageService;
    this.needsRefresh = false;
    this.needsStateChange = false;
    this.ignoreLayout = false;
    this.collapsedState = /* @__PURE__ */ new Set();
    this.menu = menuService.createMenu(MenuId.DebugBreakpointsContext, contextKeyService);
    this._register(this.menu);
    this.breakpointItemType = CONTEXT_BREAKPOINT_ITEM_TYPE.bindTo(contextKeyService);
    this.breakpointIsDataBytes = CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES.bindTo(contextKeyService);
    this.breakpointHasMultipleModes = CONTEXT_BREAKPOINT_HAS_MODES.bindTo(contextKeyService);
    this.breakpointSupportsCondition = CONTEXT_BREAKPOINT_SUPPORTS_CONDITION.bindTo(contextKeyService);
    this.breakpointInputFocused = CONTEXT_BREAKPOINT_INPUT_FOCUSED.bindTo(contextKeyService);
    this._register(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
    this._register(this.debugService.getViewModel().onDidFocusSession(() => this.onBreakpointsChange()));
    this._register(this.debugService.onDidChangeState(() => this.onStateChange()));
    this.hintDelayer = this._register(new RunOnceScheduler(() => this.updateBreakpointsHint(true), 4e3));
  }
  getPresentation() {
    return this.configurationService.getValue("debug.breakpointsView.presentation");
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-breakpoints");
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "BreakpointsView",
      container,
      new BreakpointsDelegate(this),
      [
        this.instantiationService.createInstance(BreakpointsFolderRenderer),
        this.instantiationService.createInstance(BreakpointsRenderer, this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType),
        new ExceptionBreakpointsRenderer(this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType, this.debugService, this.hoverService),
        new ExceptionBreakpointInputRenderer(this, this.debugService, this.contextViewService),
        this.instantiationService.createInstance(FunctionBreakpointsRenderer, this.menu, this.breakpointSupportsCondition, this.breakpointItemType),
        new FunctionBreakpointInputRenderer(this, this.debugService, this.contextViewService, this.hoverService, this.labelService),
        this.instantiationService.createInstance(DataBreakpointsRenderer, this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType, this.breakpointIsDataBytes),
        new DataBreakpointInputRenderer(this, this.debugService, this.contextViewService, this.hoverService, this.labelService),
        this.instantiationService.createInstance(InstructionBreakpointsRenderer)
      ],
      {
        compressionEnabled: this.getPresentation() === "tree",
        hideTwistiesOfChildlessElements: true,
        identityProvider: {
          getId: (element) => element.getId()
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            if (element instanceof BreakpointsFolderItem) {
              return resources.basenameOrAuthority(element.uri);
            }
            if (element instanceof Breakpoint) {
              return `${resources.basenameOrAuthority(element.uri)}:${element.lineNumber}`;
            }
            if (element instanceof FunctionBreakpoint) {
              return element.name;
            }
            if (element instanceof DataBreakpoint) {
              return element.description;
            }
            if (element instanceof ExceptionBreakpoint) {
              return element.label || element.filter;
            }
            if (element instanceof InstructionBreakpoint) {
              return `0x${element.address.toString(16)}`;
            }
            return "";
          },
          getCompressedNodeKeyboardNavigationLabel: (elements) => {
            return elements.map((e) => {
              if (e instanceof BreakpointsFolderItem) {
                return resources.basenameOrAuthority(e.uri);
              }
              return "";
            }).join("/");
          }
        },
        accessibilityProvider: new BreakpointsAccessibilityProvider(this.debugService, this.labelService),
        multipleSelectionSupport: false,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(this.tree);
    CONTEXT_BREAKPOINTS_FOCUSED.bindTo(this.tree.contextKeyService);
    this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
    this._register(this.tree.onMouseMiddleClick(async ({ element }) => {
      if (element instanceof Breakpoint) {
        await this.debugService.removeBreakpoints(element.getId());
      } else if (element instanceof FunctionBreakpoint) {
        await this.debugService.removeFunctionBreakpoints(element.getId());
      } else if (element instanceof DataBreakpoint) {
        await this.debugService.removeDataBreakpoints(element.getId());
      } else if (element instanceof InstructionBreakpoint) {
        await this.debugService.removeInstructionBreakpoints(element.instructionReference, element.offset);
      } else if (element instanceof BreakpointsFolderItem) {
        await this.debugService.removeBreakpoints(element.breakpoints.map((bp) => bp.getId()));
      }
    }));
    this._register(this.tree.onDidOpen(async (e) => {
      const element = e.element;
      if (!element) {
        return;
      }
      if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.button === 1) {
        return;
      }
      if (element instanceof Breakpoint) {
        openBreakpointSource(element, e.sideBySide, e.editorOptions.preserveFocus || false, e.editorOptions.pinned || !e.editorOptions.preserveFocus, this.debugService, this.editorService);
      }
      if (element instanceof InstructionBreakpoint) {
        const disassemblyView = await this.editorService.openEditor(DisassemblyViewInput.instance);
        disassemblyView.goToInstructionAndOffset(element.instructionReference, element.offset, dom.isMouseEvent(e.browserEvent) && e.browserEvent.detail === 2);
      }
      if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.detail === 2 && element instanceof FunctionBreakpoint && element !== this.inputBoxData?.breakpoint) {
        this.renderInputBox({ breakpoint: element, type: "name" });
      }
    }));
    this._register(this.tree.onKeyDown((e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Space) && !dom.isEditableElement(e.target)) {
        const focused = this.tree.getFocus();
        if (focused.length > 0) {
          const element = focused[0];
          if (element && !(element instanceof BreakpointsFolderItem)) {
            this.debugService.enableOrDisableBreakpoints(!element.enabled, element);
            event.preventDefault();
            event.stopPropagation();
          }
        }
      }
    }));
    this._register(this.tree.onDidChangeCollapseState((e) => {
      const element = e.node.element;
      if (element instanceof BreakpointsFolderItem) {
        if (e.node.collapsed) {
          this.collapsedState.add(element.getId());
        } else {
          this.collapsedState.delete(element.getId());
        }
        this.updateSize();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.breakpointsView.presentation")) {
        const presentation = this.getPresentation();
        this.tree.updateOptions({ compressionEnabled: presentation === "tree" });
        this.onBreakpointsChange();
      }
    }));
    this.setTreeInput();
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible) {
        if (this.needsRefresh) {
          this.onBreakpointsChange();
        }
        if (this.needsStateChange) {
          this.onStateChange();
        }
      }
    }));
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    this._register(containerModel.onDidChangeAllViewDescriptors(() => {
      this.updateSize();
    }));
  }
  renderHeaderTitle(container, title) {
    super.renderHeaderTitle(container, title);
    const iconLabelContainer = dom.append(container, $("span.breakpoint-warning"));
    this.hintContainer = this._register(new IconLabel(iconLabelContainer, {
      supportIcons: true,
      hoverDelegate: {
        showHover: (options, focus) => this.hoverService.showInstantHover({ content: options.content, target: this.hintContainer.element }, focus),
        delay: this.configurationService.getValue("workbench.hover.delay")
      }
    }));
    dom.hide(this.hintContainer.element);
  }
  focus() {
    super.focus();
    this.tree?.domFocus();
  }
  renderInputBox(data) {
    this._inputBoxData = data;
    this.onBreakpointsChange();
    this._inputBoxData = void 0;
  }
  get inputBoxData() {
    return this._inputBoxData;
  }
  layoutBody(height, width) {
    if (this.ignoreLayout) {
      return;
    }
    super.layoutBody(height, width);
    this.tree?.layout(height, width);
    try {
      this.ignoreLayout = true;
      this.updateSize();
    } finally {
      this.ignoreLayout = false;
    }
  }
  onTreeContextMenu(e) {
    const element = e.element;
    if (element instanceof BreakpointsFolderItem) {
      this.breakpointItemType.set("breakpointFolder");
      const { secondary: secondary2 } = getContextMenuActions(this.menu.getActions({ arg: element, shouldForwardArgs: false }), "inline");
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => secondary2,
        getActionsContext: () => element
      });
      return;
    }
    const type = element instanceof Breakpoint ? "breakpoint" : element instanceof ExceptionBreakpoint ? "exceptionBreakpoint" : element instanceof FunctionBreakpoint ? "functionBreakpoint" : element instanceof DataBreakpoint ? "dataBreakpoint" : element instanceof InstructionBreakpoint ? "instructionBreakpoint" : void 0;
    this.breakpointItemType.set(type);
    const session = this.debugService.getViewModel().focusedSession;
    const conditionSupported = element instanceof ExceptionBreakpoint ? element.supportsCondition : !session || !!session.capabilities.supportsConditionalBreakpoints;
    this.breakpointSupportsCondition.set(conditionSupported);
    this.breakpointIsDataBytes.set(element instanceof DataBreakpoint && element.src.type === DataBreakpointSetType.Address);
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes(getModeKindForBreakpoint(element)).length > 1);
    const { secondary } = getContextMenuActions(this.menu.getActions({ arg: e.element, shouldForwardArgs: false }), "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => secondary,
      getActionsContext: () => element
    });
  }
  updateSize() {
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    const rowHeight = 22;
    this.minimumBodySize = this.orientation === Orientation.VERTICAL ? Math.min(MAX_VISIBLE_BREAKPOINTS * rowHeight, this.tree.contentHeight) : 170;
    this.maximumBodySize = this.orientation === Orientation.VERTICAL && containerModel.visibleViewDescriptors.length > 1 ? this.tree.contentHeight : Number.POSITIVE_INFINITY;
  }
  updateBreakpointsHint(delayed = false) {
    if (!this.hintContainer) {
      return;
    }
    const currentType = this.debugService.getViewModel().focusedSession?.configuration.type;
    const dbg = currentType ? this.debugService.getAdapterManager().getDebugger(currentType) : void 0;
    const message = dbg?.strings?.[DebuggerString.UnverifiedBreakpoints];
    const debuggerHasUnverifiedBps = message && this.debugService.getModel().getBreakpoints().filter((bp) => {
      if (bp.verified || !bp.enabled) {
        return false;
      }
      const langId = this.languageService.guessLanguageIdByFilepathOrFirstLine(bp.uri);
      return langId && dbg.interestedInLanguage(langId);
    });
    if (message && debuggerHasUnverifiedBps?.length && this.debugService.getModel().areBreakpointsActivated()) {
      if (delayed) {
        const mdown = new MarkdownString(void 0, { isTrusted: true }).appendMarkdown(message);
        this.hintContainer.setLabel("$(warning)", void 0, { title: { markdown: mdown, markdownNotSupportedFallback: message } });
        dom.show(this.hintContainer.element);
      } else {
        this.hintDelayer.schedule();
      }
    } else {
      dom.hide(this.hintContainer.element);
    }
  }
  onBreakpointsChange() {
    if (this.isBodyVisible()) {
      if (this.tree) {
        this.setTreeInput();
        this.needsRefresh = false;
      }
      this.updateBreakpointsHint();
      this.updateSize();
    } else {
      this.needsRefresh = true;
    }
  }
  onStateChange() {
    if (this.isBodyVisible()) {
      this.needsStateChange = false;
      const thread = this.debugService.getViewModel().focusedThread;
      let found = false;
      if (thread && thread.stoppedDetails && thread.stoppedDetails.hitBreakpointIds && thread.stoppedDetails.hitBreakpointIds.length > 0) {
        const hitBreakpointIds = thread.stoppedDetails.hitBreakpointIds;
        const elements = this.flatElements;
        const hitElement = elements.find((e) => {
          const id = e.getIdFromAdapter(thread.session.getId());
          return typeof id === "number" && hitBreakpointIds.indexOf(id) !== -1;
        });
        if (hitElement) {
          this.tree.setFocus([hitElement]);
          this.tree.setSelection([hitElement]);
          found = true;
          this.autoFocusedElement = hitElement;
        }
      }
      if (!found) {
        const focus = this.tree.getFocus();
        const selection = this.tree.getSelection();
        if (this.autoFocusedElement && equals(focus, selection) && selection.includes(this.autoFocusedElement)) {
          this.tree.setFocus([]);
          this.tree.setSelection([]);
        }
        this.autoFocusedElement = void 0;
      }
      this.updateBreakpointsHint();
    } else {
      this.needsStateChange = true;
    }
  }
  setTreeInput() {
    const treeInput = this.getTreeElements();
    this.tree.setChildren(null, treeInput);
  }
  getTreeElements() {
    const model = this.debugService.getModel();
    const sessionId = this.debugService.getViewModel().focusedSession?.getId();
    const showAsTree = this.getPresentation() === "tree";
    const result = [];
    for (const exBp of model.getExceptionBreakpointsForSession(sessionId)) {
      result.push({ element: exBp, incompressible: true });
    }
    for (const funcBp of model.getFunctionBreakpoints()) {
      result.push({ element: funcBp, incompressible: true });
    }
    for (const dataBp of model.getDataBreakpoints()) {
      result.push({ element: dataBp, incompressible: true });
    }
    const sourceBreakpoints = model.getBreakpoints();
    if (showAsTree && sourceBreakpoints.length > 0) {
      const breakpointsByUri = /* @__PURE__ */ new Map();
      for (const bp of sourceBreakpoints) {
        const key = bp.uri.toString();
        if (!breakpointsByUri.has(key)) {
          breakpointsByUri.set(key, []);
        }
        breakpointsByUri.get(key).push(bp);
      }
      for (const [uriStr, breakpoints] of breakpointsByUri) {
        const uri = URI.parse(uriStr);
        const folderItem = new BreakpointsFolderItem(uri, breakpoints);
        breakpoints.sort((a, b) => a.lineNumber - b.lineNumber);
        const children = breakpoints.map((bp) => ({
          element: bp,
          incompressible: false
        }));
        result.push({
          element: folderItem,
          incompressible: false,
          collapsed: this.collapsedState.has(folderItem.getId()),
          children
        });
      }
    } else {
      for (const bp of sourceBreakpoints) {
        result.push({ element: bp, incompressible: true });
      }
    }
    for (const instrBp of model.getInstructionBreakpoints()) {
      result.push({ element: instrBp, incompressible: true });
    }
    return result;
  }
  get flatElements() {
    const model = this.debugService.getModel();
    const sessionId = this.debugService.getViewModel().focusedSession?.getId();
    const elements = model.getExceptionBreakpointsForSession(sessionId).concat(model.getFunctionBreakpoints()).concat(model.getDataBreakpoints()).concat(model.getBreakpoints()).concat(model.getInstructionBreakpoints());
    return elements;
  }
};
BreakpointsView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IContextViewService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IOpenerService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, ILanguageService)
], BreakpointsView);
class BreakpointsDelegate {
  constructor(view) {
    this.view = view;
  }
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof BreakpointsFolderItem) {
      return BreakpointsFolderRenderer.ID;
    }
    if (element instanceof Breakpoint) {
      return BreakpointsRenderer.ID;
    }
    if (element instanceof FunctionBreakpoint) {
      const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
      if (!element.name || inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
        return FunctionBreakpointInputRenderer.ID;
      }
      return FunctionBreakpointsRenderer.ID;
    }
    if (element instanceof ExceptionBreakpoint) {
      const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
      if (inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
        return ExceptionBreakpointInputRenderer.ID;
      }
      return ExceptionBreakpointsRenderer.ID;
    }
    if (element instanceof DataBreakpoint) {
      const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
      if (inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
        return DataBreakpointInputRenderer.ID;
      }
      return DataBreakpointsRenderer.ID;
    }
    if (element instanceof InstructionBreakpoint) {
      return InstructionBreakpointsRenderer.ID;
    }
    return "";
  }
}
const breakpointIdToActionBarDomeNode = /* @__PURE__ */ new Map();
let BreakpointsFolderRenderer = class {
  constructor(debugService, labelService, hoverService) {
    this.debugService = debugService;
    this.labelService = labelService;
    this.hoverService = hoverService;
  }
  get templateId() {
    return BreakpointsFolderRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.container = container;
    container.classList.add("breakpoint", "breakpoint-folder");
    data.templateDisposables.add(toDisposable(() => {
      container.classList.remove("breakpoint", "breakpoint-folder");
    }));
    data.checkbox = new TriStateCheckbox("", false, defaultCheckboxStyles);
    data.checkbox.domNode.tabIndex = -1;
    data.templateDisposables.add(data.checkbox);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      const checked = data.checkbox.checked;
      const enabled = checked === "mixed" ? true : checked;
      for (const bp of data.context.breakpoints) {
        this.debugService.enableOrDisableBreakpoints(enabled, bp);
      }
    }));
    dom.append(data.container, data.checkbox.domNode);
    data.name = dom.append(data.container, $("span.name"));
    dom.append(data.container, $("span.file-path"));
    data.actionBar = new ActionBar(data.container);
    data.templateDisposables.add(data.actionBar);
    return data;
  }
  renderElement(node, _index, data) {
    const folderItem = node.element;
    data.context = folderItem;
    data.name.textContent = this.labelService.getUriBasenameLabel(folderItem.uri);
    data.container.classList.toggle("disabled", !this.debugService.getModel().areBreakpointsActivated());
    const fullPath = this.labelService.getUriLabel(folderItem.uri, { relative: true });
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.container, fullPath));
    if (folderItem.indeterminate) {
      data.checkbox.checked = "mixed";
    } else {
      data.checkbox.checked = folderItem.enabled;
    }
    data.actionBar.clear();
    const removeAction = data.elementDisposables.add(new Action(
      "debug.removeBreakpointsInFile",
      localize("removeBreakpointsInFile", "Remove Breakpoints in File"),
      ThemeIcon.asClassName(Codicon.close),
      true,
      async () => {
        for (const bp of folderItem.breakpoints) {
          await this.debugService.removeBreakpoints(bp.getId());
        }
      }
    ));
    data.actionBar.push(removeAction, { icon: true, label: false });
  }
  renderCompressedElements(node, _index, data) {
    const elements = node.element.elements;
    const folderItem = elements[elements.length - 1];
    data.context = folderItem;
    const names = elements.map((e) => resources.basenameOrAuthority(e.uri));
    data.name.textContent = names.join("/");
    const fullPath = this.labelService.getUriLabel(folderItem.uri, { relative: true });
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.container, fullPath));
    if (folderItem.indeterminate) {
      data.checkbox.checked = "mixed";
    } else {
      data.checkbox.checked = folderItem.enabled;
    }
    data.actionBar.clear();
    const removeAction = data.elementDisposables.add(new Action(
      "debug.removeBreakpointsInFile",
      localize("removeBreakpointsInFile", "Remove Breakpoints in File"),
      ThemeIcon.asClassName(Codicon.close),
      true,
      async () => {
        for (const bp of folderItem.breakpoints) {
          await this.debugService.removeBreakpoints(bp.getId());
        }
      }
    ));
    data.actionBar.push(removeAction, { icon: true, label: false });
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
BreakpointsFolderRenderer.ID = "breakpointFolder";
BreakpointsFolderRenderer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IHoverService)
], BreakpointsFolderRenderer);
let BreakpointsRenderer = class {
  constructor(menu, breakpointHasMultipleModes, breakpointSupportsCondition, breakpointItemType, debugService, hoverService, labelService, textModelService) {
    this.menu = menu;
    this.breakpointHasMultipleModes = breakpointHasMultipleModes;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.textModelService = textModelService;
  }
  get templateId() {
    return BreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = container;
    container.classList.add("breakpoint");
    data.templateDisposables.add(toDisposable(() => {
      container.classList.remove("breakpoint");
    }));
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.filePath = dom.append(data.breakpoint, $("span.file-path"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, index, data) {
    const breakpoint = node.element;
    data.context = breakpoint;
    if (node.depth > 1) {
      this.renderBreakpointLineLabel(breakpoint, data);
    } else {
      this.renderBreakpointFileLabel(breakpoint, data);
    }
    this.renderBreakpointCommon(breakpoint, data);
  }
  renderCompressedElements(node, index, data) {
    const breakpoint = node.element.elements[node.element.elements.length - 1];
    data.context = breakpoint;
    this.renderBreakpointFileLabel(breakpoint, data);
    this.renderBreakpointCommon(breakpoint, data);
  }
  renderBreakpointCommon(breakpoint, data) {
    data.breakpoint.classList.toggle("disabled", !this.debugService.getModel().areBreakpointsActivated());
    let badgeContent = breakpoint.lineNumber.toString();
    if (breakpoint.column) {
      badgeContent += `:${breakpoint.column}`;
    }
    if (breakpoint.modeLabel) {
      badgeContent = `${breakpoint.modeLabel}: ${badgeContent}`;
    }
    data.badge.textContent = badgeContent;
    data.checkbox.checked = breakpoint.enabled;
    const { message, icon } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), breakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, breakpoint.message || message || ""));
    const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
    if (debugActive && !breakpoint.verified) {
      data.breakpoint.classList.add("disabled");
    }
    const session = this.debugService.getViewModel().focusedSession;
    this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
    this.breakpointItemType.set("breakpoint");
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes("source").length > 1);
    const { primary } = getActionBarActions(this.menu.getActions({ arg: breakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(breakpoint.getId(), data.actionBar.domNode);
  }
  renderBreakpointFileLabel(breakpoint, data) {
    data.name.textContent = resources.basenameOrAuthority(breakpoint.uri);
    data.filePath.textContent = this.labelService.getUriLabel(resources.dirname(breakpoint.uri), { relative: true });
  }
  renderBreakpointLineLabel(breakpoint, data) {
    data.name.textContent = localize("loading", "Loading...");
    data.filePath.textContent = "";
    this.textModelService.createModelReference(breakpoint.uri).then((reference) => {
      if (data.context !== breakpoint) {
        reference.dispose();
        return;
      }
      data.elementDisposables.add(reference);
      const model = reference.object.textEditorModel;
      if (model && breakpoint.lineNumber <= model.getLineCount()) {
        const lineContent = model.getLineContent(breakpoint.lineNumber).trim();
        data.name.textContent = lineContent || localize("emptyLine", "(empty line)");
      } else {
        data.name.textContent = localize("lineNotFound", "(line not found)");
      }
    }).catch(() => {
      if (data.context === breakpoint) {
        data.name.textContent = localize("cannotLoadLine", "(cannot load line)");
      }
    });
  }
  disposeElement(node, index, template) {
    template.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
BreakpointsRenderer.ID = "breakpoints";
BreakpointsRenderer = __decorateClass([
  __decorateParam(4, IDebugService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, ITextModelService)
], BreakpointsRenderer);
const _ExceptionBreakpointsRenderer = class _ExceptionBreakpointsRenderer {
  constructor(menu, breakpointHasMultipleModes, breakpointSupportsCondition, breakpointItemType, debugService, hoverService) {
    this.menu = menu;
    this.breakpointHasMultipleModes = breakpointHasMultipleModes;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.debugService = debugService;
    this.hoverService = hoverService;
  }
  get templateId() {
    return _ExceptionBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.condition = dom.append(data.breakpoint, $("span.condition"));
    data.breakpoint.classList.add("exception");
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, index, data) {
    const exceptionBreakpoint = node.element;
    this.renderExceptionBreakpoint(exceptionBreakpoint, data);
  }
  renderCompressedElements(node, index, data) {
    const exceptionBreakpoint = node.element.elements[node.element.elements.length - 1];
    this.renderExceptionBreakpoint(exceptionBreakpoint, data);
  }
  renderExceptionBreakpoint(exceptionBreakpoint, data) {
    data.context = exceptionBreakpoint;
    data.name.textContent = exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`;
    const exceptionBreakpointtitle = exceptionBreakpoint.verified ? exceptionBreakpoint.description || data.name.textContent : exceptionBreakpoint.message || localize("unverifiedExceptionBreakpoint", "Unverified Exception Breakpoint");
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, exceptionBreakpointtitle));
    data.breakpoint.classList.toggle("disabled", !exceptionBreakpoint.verified);
    data.checkbox.checked = exceptionBreakpoint.enabled;
    data.condition.textContent = exceptionBreakpoint.condition || "";
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.condition, localize("expressionCondition", "Expression condition: {0}", exceptionBreakpoint.condition)));
    if (exceptionBreakpoint.modeLabel) {
      data.badge.textContent = exceptionBreakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
    this.breakpointSupportsCondition.set(exceptionBreakpoint.supportsCondition);
    this.breakpointItemType.set("exceptionBreakpoint");
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes("exception").length > 1);
    const { primary } = getActionBarActions(this.menu.getActions({ arg: exceptionBreakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(exceptionBreakpoint.getId(), data.actionBar.domNode);
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_ExceptionBreakpointsRenderer.ID = "exceptionbreakpoints";
let ExceptionBreakpointsRenderer = _ExceptionBreakpointsRenderer;
let FunctionBreakpointsRenderer = class {
  constructor(menu, breakpointSupportsCondition, breakpointItemType, debugService, hoverService, labelService) {
    this.menu = menu;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return FunctionBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.condition = dom.append(data.breakpoint, $("span.condition"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, _index, data) {
    this.renderFunctionBreakpoint(node.element, data);
  }
  renderCompressedElements(node, _index, data) {
    this.renderFunctionBreakpoint(node.element.elements[node.element.elements.length - 1], data);
  }
  renderFunctionBreakpoint(functionBreakpoint, data) {
    data.context = functionBreakpoint;
    data.name.textContent = functionBreakpoint.name;
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), functionBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ? message : ""));
    data.checkbox.checked = functionBreakpoint.enabled;
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, message ? message : ""));
    if (functionBreakpoint.condition && functionBreakpoint.hitCondition) {
      data.condition.textContent = localize("expressionAndHitCount", "Condition: {0} | Hit Count: {1}", functionBreakpoint.condition, functionBreakpoint.hitCondition);
    } else {
      data.condition.textContent = functionBreakpoint.condition || functionBreakpoint.hitCondition || "";
    }
    if (functionBreakpoint.modeLabel) {
      data.badge.textContent = functionBreakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
    const session = this.debugService.getViewModel().focusedSession;
    data.breakpoint.classList.toggle("disabled", session && !session.capabilities.supportsFunctionBreakpoints || !this.debugService.getModel().areBreakpointsActivated());
    if (session && !session.capabilities.supportsFunctionBreakpoints) {
      data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, localize("functionBreakpointsNotSupported", "Function breakpoints are not supported by this debug type")));
    }
    this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
    this.breakpointItemType.set("functionBreakpoint");
    const { primary } = getActionBarActions(this.menu.getActions({ arg: functionBreakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(functionBreakpoint.getId(), data.actionBar.domNode);
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
FunctionBreakpointsRenderer.ID = "functionbreakpoints";
FunctionBreakpointsRenderer = __decorateClass([
  __decorateParam(3, IDebugService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, ILabelService)
], FunctionBreakpointsRenderer);
let DataBreakpointsRenderer = class {
  constructor(menu, breakpointHasMultipleModes, breakpointSupportsCondition, breakpointItemType, breakpointIsDataBytes, debugService, hoverService, labelService) {
    this.menu = menu;
    this.breakpointHasMultipleModes = breakpointHasMultipleModes;
    this.breakpointSupportsCondition = breakpointSupportsCondition;
    this.breakpointItemType = breakpointItemType;
    this.breakpointIsDataBytes = breakpointIsDataBytes;
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return DataBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.accessType = dom.append(data.breakpoint, $("span.access-type"));
    data.condition = dom.append(data.breakpoint, $("span.condition"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, _index, data) {
    this.renderDataBreakpoint(node.element, data);
  }
  renderCompressedElements(node, _index, data) {
    this.renderDataBreakpoint(node.element.elements[node.element.elements.length - 1], data);
  }
  renderDataBreakpoint(dataBreakpoint, data) {
    data.context = dataBreakpoint;
    data.name.textContent = dataBreakpoint.description;
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), dataBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ? message : ""));
    data.checkbox.checked = dataBreakpoint.enabled;
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, message ? message : ""));
    if (dataBreakpoint.modeLabel) {
      data.badge.textContent = dataBreakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
    const session = this.debugService.getViewModel().focusedSession;
    data.breakpoint.classList.toggle("disabled", session && !session.capabilities.supportsDataBreakpoints || !this.debugService.getModel().areBreakpointsActivated());
    if (session && !session.capabilities.supportsDataBreakpoints) {
      data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, localize("dataBreakpointsNotSupported", "Data breakpoints are not supported by this debug type")));
    }
    if (dataBreakpoint.accessType) {
      const accessType = dataBreakpoint.accessType === "read" ? localize("read", "Read") : dataBreakpoint.accessType === "write" ? localize("write", "Write") : localize("access", "Access");
      data.accessType.textContent = accessType;
    } else {
      data.accessType.textContent = "";
    }
    if (dataBreakpoint.condition && dataBreakpoint.hitCondition) {
      data.condition.textContent = localize("expressionAndHitCount", "Condition: {0} | Hit Count: {1}", dataBreakpoint.condition, dataBreakpoint.hitCondition);
    } else {
      data.condition.textContent = dataBreakpoint.condition || dataBreakpoint.hitCondition || "";
    }
    this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
    this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes("data").length > 1);
    this.breakpointItemType.set("dataBreakpoint");
    this.breakpointIsDataBytes.set(dataBreakpoint.src.type === DataBreakpointSetType.Address);
    const { primary } = getActionBarActions(this.menu.getActions({ arg: dataBreakpoint, shouldForwardArgs: true }), "inline");
    data.actionBar.clear();
    data.actionBar.push(primary, { icon: true, label: false });
    breakpointIdToActionBarDomeNode.set(dataBreakpoint.getId(), data.actionBar.domNode);
    this.breakpointIsDataBytes.reset();
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
DataBreakpointsRenderer.ID = "databreakpoints";
DataBreakpointsRenderer = __decorateClass([
  __decorateParam(5, IDebugService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, ILabelService)
], DataBreakpointsRenderer);
let InstructionBreakpointsRenderer = class {
  constructor(debugService, hoverService, labelService) {
    this.debugService = debugService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return InstructionBreakpointsRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.elementDisposables = new DisposableStore();
    data.templateDisposables = new DisposableStore();
    data.templateDisposables.add(data.elementDisposables);
    data.breakpoint = dom.append(container, $(".breakpoint"));
    data.icon = $(".icon");
    data.checkbox = createCheckbox(data.templateDisposables);
    data.templateDisposables.add(data.checkbox.onChange(() => {
      this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
    }));
    dom.append(data.breakpoint, data.icon);
    dom.append(data.breakpoint, data.checkbox.domNode);
    data.name = dom.append(data.breakpoint, $("span.name"));
    data.address = dom.append(data.breakpoint, $("span.file-path"));
    data.actionBar = new ActionBar(data.breakpoint);
    data.templateDisposables.add(data.actionBar);
    const badgeContainer = dom.append(data.breakpoint, $(".badge-container"));
    data.badge = dom.append(badgeContainer, $("span.line-number.monaco-count-badge"));
    return data;
  }
  renderElement(node, index, data) {
    this.renderInstructionBreakpoint(node.element, data);
  }
  renderCompressedElements(node, index, data) {
    this.renderInstructionBreakpoint(node.element.elements[node.element.elements.length - 1], data);
  }
  renderInstructionBreakpoint(breakpoint, data) {
    data.context = breakpoint;
    data.breakpoint.classList.toggle("disabled", !this.debugService.getModel().areBreakpointsActivated());
    data.name.textContent = "0x" + breakpoint.address.toString(16);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.name, localize("debug.decimal.address", "Decimal Address: {0}", breakpoint.address.toString())));
    data.checkbox.checked = breakpoint.enabled;
    const { message, icon } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), breakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.breakpoint, breakpoint.message || message || ""));
    const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
    if (debugActive && !breakpoint.verified) {
      data.breakpoint.classList.add("disabled");
    }
    if (breakpoint.modeLabel) {
      data.badge.textContent = breakpoint.modeLabel;
      data.badge.style.display = "block";
    } else {
      data.badge.style.display = "none";
    }
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
InstructionBreakpointsRenderer.ID = "instructionBreakpoints";
InstructionBreakpointsRenderer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, ILabelService)
], InstructionBreakpointsRenderer);
const _FunctionBreakpointInputRenderer = class _FunctionBreakpointInputRenderer {
  constructor(view, debugService, contextViewService, hoverService, labelService) {
    this.view = view;
    this.debugService = debugService;
    this.contextViewService = contextViewService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return _FunctionBreakpointInputRenderer.ID;
  }
  renderTemplate(container) {
    const template = /* @__PURE__ */ Object.create(null);
    const toDispose = new DisposableStore();
    const breakpoint = dom.append(container, $(".breakpoint"));
    template.icon = $(".icon");
    template.checkbox = createCheckbox(toDispose);
    dom.append(breakpoint, template.icon);
    dom.append(breakpoint, template.checkbox.domNode);
    this.view.breakpointInputFocused.set(true);
    const inputBoxContainer = dom.append(breakpoint, $(".inputBoxContainer"));
    const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles });
    toDispose.add(inputBox);
    const wrapUp = (success) => {
      template.updating = true;
      try {
        this.view.breakpointInputFocused.set(false);
        const id = template.breakpoint.getId();
        if (success) {
          if (template.type === "name") {
            this.debugService.updateFunctionBreakpoint(id, { name: inputBox.value });
          }
          if (template.type === "condition") {
            this.debugService.updateFunctionBreakpoint(id, { condition: inputBox.value });
          }
          if (template.type === "hitCount") {
            this.debugService.updateFunctionBreakpoint(id, { hitCondition: inputBox.value });
          }
        } else {
          if (template.type === "name" && !template.breakpoint.name) {
            this.debugService.removeFunctionBreakpoints(id);
          } else {
            this.view.renderInputBox(void 0);
          }
        }
      } finally {
        template.updating = false;
      }
    };
    toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, "keydown", (e) => {
      const isEscape = e.equals(KeyCode.Escape);
      const isEnter = e.equals(KeyCode.Enter);
      if (isEscape || isEnter) {
        e.preventDefault();
        e.stopPropagation();
        wrapUp(isEnter);
      }
    }));
    toDispose.add(dom.addDisposableListener(inputBox.inputElement, "blur", () => {
      if (!template.updating) {
        wrapUp(!!inputBox.value);
      }
    }));
    template.inputBox = inputBox;
    template.elementDisposables = new DisposableStore();
    template.templateDisposables = toDispose;
    template.templateDisposables.add(template.elementDisposables);
    return template;
  }
  renderElement(node, _index, data) {
    const functionBreakpoint = node.element;
    data.breakpoint = functionBreakpoint;
    data.type = this.view.inputBoxData?.type || "name";
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), functionBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ? message : ""));
    data.checkbox.checked = functionBreakpoint.enabled;
    data.checkbox.disable();
    data.inputBox.value = functionBreakpoint.name || "";
    let placeholder = localize("functionBreakpointPlaceholder", "Function to break on");
    let ariaLabel = localize("functionBreakPointInputAriaLabel", "Type function breakpoint.");
    if (data.type === "condition") {
      data.inputBox.value = functionBreakpoint.condition || "";
      placeholder = localize("functionBreakpointExpressionPlaceholder", "Break when expression evaluates to true");
      ariaLabel = localize("functionBreakPointExpresionAriaLabel", "Type expression. Function breakpoint will break when expression evaluates to true");
    } else if (data.type === "hitCount") {
      data.inputBox.value = functionBreakpoint.hitCondition || "";
      placeholder = localize("functionBreakpointHitCountPlaceholder", "Break when hit count is met");
      ariaLabel = localize("functionBreakPointHitCountAriaLabel", "Type hit count. Function breakpoint will break when hit count is met.");
    }
    data.inputBox.setAriaLabel(ariaLabel);
    data.inputBox.setPlaceHolder(placeholder);
    setTimeout(() => {
      data.inputBox.focus();
      data.inputBox.select();
    }, 0);
  }
  renderCompressedElements(node, _index, data) {
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_FunctionBreakpointInputRenderer.ID = "functionbreakpointinput";
let FunctionBreakpointInputRenderer = _FunctionBreakpointInputRenderer;
const _DataBreakpointInputRenderer = class _DataBreakpointInputRenderer {
  constructor(view, debugService, contextViewService, hoverService, labelService) {
    this.view = view;
    this.debugService = debugService;
    this.contextViewService = contextViewService;
    this.hoverService = hoverService;
    this.labelService = labelService;
  }
  get templateId() {
    return _DataBreakpointInputRenderer.ID;
  }
  renderTemplate(container) {
    const template = /* @__PURE__ */ Object.create(null);
    const toDispose = new DisposableStore();
    const breakpoint = dom.append(container, $(".breakpoint"));
    template.icon = $(".icon");
    template.checkbox = createCheckbox(toDispose);
    dom.append(breakpoint, template.icon);
    dom.append(breakpoint, template.checkbox.domNode);
    this.view.breakpointInputFocused.set(true);
    const inputBoxContainer = dom.append(breakpoint, $(".inputBoxContainer"));
    const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles });
    toDispose.add(inputBox);
    const wrapUp = (success) => {
      template.updating = true;
      try {
        this.view.breakpointInputFocused.set(false);
        const id = template.breakpoint.getId();
        if (success) {
          if (template.type === "condition") {
            this.debugService.updateDataBreakpoint(id, { condition: inputBox.value });
          }
          if (template.type === "hitCount") {
            this.debugService.updateDataBreakpoint(id, { hitCondition: inputBox.value });
          }
        } else {
          this.view.renderInputBox(void 0);
        }
      } finally {
        template.updating = false;
      }
    };
    toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, "keydown", (e) => {
      const isEscape = e.equals(KeyCode.Escape);
      const isEnter = e.equals(KeyCode.Enter);
      if (isEscape || isEnter) {
        e.preventDefault();
        e.stopPropagation();
        wrapUp(isEnter);
      }
    }));
    toDispose.add(dom.addDisposableListener(inputBox.inputElement, "blur", () => {
      if (!template.updating) {
        wrapUp(!!inputBox.value);
      }
    }));
    template.inputBox = inputBox;
    template.elementDisposables = new DisposableStore();
    template.templateDisposables = toDispose;
    template.templateDisposables.add(template.elementDisposables);
    return template;
  }
  renderElement(node, _index, data) {
    const dataBreakpoint = node.element;
    data.breakpoint = dataBreakpoint;
    data.type = this.view.inputBoxData?.type || "condition";
    const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), dataBreakpoint, this.labelService, this.debugService.getModel());
    data.icon.className = ThemeIcon.asClassName(icon);
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.icon, message ?? ""));
    data.checkbox.checked = dataBreakpoint.enabled;
    data.checkbox.disable();
    data.inputBox.value = "";
    let placeholder = "";
    let ariaLabel = "";
    if (data.type === "condition") {
      data.inputBox.value = dataBreakpoint.condition || "";
      placeholder = localize("dataBreakpointExpressionPlaceholder", "Break when expression evaluates to true");
      ariaLabel = localize("dataBreakPointExpresionAriaLabel", "Type expression. Data breakpoint will break when expression evaluates to true");
    } else if (data.type === "hitCount") {
      data.inputBox.value = dataBreakpoint.hitCondition || "";
      placeholder = localize("dataBreakpointHitCountPlaceholder", "Break when hit count is met");
      ariaLabel = localize("dataBreakPointHitCountAriaLabel", "Type hit count. Data breakpoint will break when hit count is met.");
    }
    data.inputBox.setAriaLabel(ariaLabel);
    data.inputBox.setPlaceHolder(placeholder);
    setTimeout(() => {
      data.inputBox.focus();
      data.inputBox.select();
    }, 0);
  }
  renderCompressedElements(node, _index, data) {
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_DataBreakpointInputRenderer.ID = "databreakpointinput";
let DataBreakpointInputRenderer = _DataBreakpointInputRenderer;
const _ExceptionBreakpointInputRenderer = class _ExceptionBreakpointInputRenderer {
  constructor(view, debugService, contextViewService) {
    this.view = view;
    this.debugService = debugService;
    this.contextViewService = contextViewService;
  }
  get templateId() {
    return _ExceptionBreakpointInputRenderer.ID;
  }
  renderTemplate(container) {
    const toDispose = new DisposableStore();
    const breakpoint = dom.append(container, $(".breakpoint"));
    breakpoint.classList.add("exception");
    const checkbox = createCheckbox(toDispose);
    dom.append(breakpoint, checkbox.domNode);
    this.view.breakpointInputFocused.set(true);
    const inputBoxContainer = dom.append(breakpoint, $(".inputBoxContainer"));
    const inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
      ariaLabel: localize("exceptionBreakpointAriaLabel", "Type exception breakpoint condition"),
      inputBoxStyles: defaultInputBoxStyles
    });
    toDispose.add(inputBox);
    const wrapUp = (success) => {
      if (!templateData.currentBreakpoint) {
        return;
      }
      this.view.breakpointInputFocused.set(false);
      let newCondition = templateData.currentBreakpoint.condition;
      if (success) {
        newCondition = inputBox.value !== "" ? inputBox.value : void 0;
      }
      this.debugService.setExceptionBreakpointCondition(templateData.currentBreakpoint, newCondition);
    };
    toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, "keydown", (e) => {
      const isEscape = e.equals(KeyCode.Escape);
      const isEnter = e.equals(KeyCode.Enter);
      if (isEscape || isEnter) {
        e.preventDefault();
        e.stopPropagation();
        wrapUp(isEnter);
      }
    }));
    toDispose.add(dom.addDisposableListener(inputBox.inputElement, "blur", () => {
      setTimeout(() => {
        wrapUp(true);
      });
    }));
    const elementDisposables = new DisposableStore();
    toDispose.add(elementDisposables);
    const templateData = {
      inputBox,
      checkbox,
      templateDisposables: toDispose,
      elementDisposables: new DisposableStore()
    };
    return templateData;
  }
  renderElement(node, _index, data) {
    const exceptionBreakpoint = node.element;
    const placeHolder = exceptionBreakpoint.conditionDescription || localize("exceptionBreakpointPlaceholder", "Break when expression evaluates to true");
    data.inputBox.setPlaceHolder(placeHolder);
    data.currentBreakpoint = exceptionBreakpoint;
    data.checkbox.checked = exceptionBreakpoint.enabled;
    data.checkbox.disable();
    data.inputBox.value = exceptionBreakpoint.condition || "";
    setTimeout(() => {
      data.inputBox.focus();
      data.inputBox.select();
    }, 0);
  }
  renderCompressedElements(node, _index, data) {
  }
  disposeElement(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_ExceptionBreakpointInputRenderer.ID = "exceptionbreakpointinput";
let ExceptionBreakpointInputRenderer = _ExceptionBreakpointInputRenderer;
class BreakpointsAccessibilityProvider {
  constructor(debugService, labelService) {
    this.debugService = debugService;
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return localize("breakpoints", "Breakpoints");
  }
  getRole() {
    return "checkbox";
  }
  isChecked(element) {
    if (element instanceof BreakpointsFolderItem) {
      return element.enabled;
    }
    return element.enabled;
  }
  getAriaLabel(element) {
    if (element instanceof BreakpointsFolderItem) {
      return localize("breakpointFolder", "Breakpoints in {0}, {1} breakpoints", resources.basenameOrAuthority(element.uri), element.breakpoints.length);
    }
    if (element instanceof ExceptionBreakpoint) {
      return element.toString();
    }
    const { message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), element, this.labelService, this.debugService.getModel());
    const toString = element.toString();
    return message ? `${toString}, ${message}` : toString;
  }
}
function openBreakpointSource(breakpoint, sideBySide, preserveFocus, pinned, debugService, editorService) {
  if (breakpoint.uri.scheme === DEBUG_SCHEME && debugService.state === State.Inactive) {
    return Promise.resolve(void 0);
  }
  const selection = breakpoint.endLineNumber ? {
    startLineNumber: breakpoint.lineNumber,
    endLineNumber: breakpoint.endLineNumber,
    startColumn: breakpoint.column || 1,
    endColumn: breakpoint.endColumn || Constants.MAX_SAFE_SMALL_INTEGER
  } : {
    startLineNumber: breakpoint.lineNumber,
    startColumn: breakpoint.column || 1,
    endLineNumber: breakpoint.lineNumber,
    endColumn: breakpoint.column || Constants.MAX_SAFE_SMALL_INTEGER
  };
  return editorService.openEditor({
    resource: breakpoint.uri,
    options: {
      preserveFocus,
      selection,
      revealIfOpened: true,
      selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
      pinned
    }
  }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
}
function getBreakpointMessageAndIcon(state, breakpointsActivated, breakpoint, labelService, debugModel) {
  const debugActive = state === State.Running || state === State.Stopped;
  const breakpointIcon = breakpoint instanceof DataBreakpoint ? icons.dataBreakpoint : breakpoint instanceof FunctionBreakpoint ? icons.functionBreakpoint : breakpoint.logMessage ? icons.logBreakpoint : icons.breakpoint;
  if (!breakpoint.enabled || !breakpointsActivated) {
    return {
      icon: breakpointIcon.disabled,
      message: breakpoint.logMessage ? localize("disabledLogpoint", "Disabled Logpoint") : localize("disabledBreakpoint", "Disabled Breakpoint")
    };
  }
  const appendMessage = (text) => {
    return breakpoint.message ? text.concat(", " + breakpoint.message) : text;
  };
  if (debugActive && breakpoint instanceof Breakpoint && breakpoint.pending) {
    return {
      icon: icons.breakpoint.pending
    };
  }
  if (debugActive && !breakpoint.verified) {
    return {
      icon: breakpointIcon.unverified,
      message: breakpoint.message ? breakpoint.message : breakpoint.logMessage ? localize("unverifiedLogpoint", "Unverified Logpoint") : localize("unverifiedBreakpoint", "Unverified Breakpoint"),
      showAdapterUnverifiedMessage: true
    };
  }
  if (breakpoint instanceof DataBreakpoint) {
    if (!breakpoint.supported) {
      return {
        icon: breakpointIcon.unverified,
        message: localize("dataBreakpointUnsupported", "Data breakpoints not supported by this debug type")
      };
    }
    return {
      icon: breakpointIcon.regular,
      message: breakpoint.message || localize("dataBreakpoint", "Data Breakpoint")
    };
  }
  if (breakpoint instanceof FunctionBreakpoint) {
    if (!breakpoint.supported) {
      return {
        icon: breakpointIcon.unverified,
        message: localize("functionBreakpointUnsupported", "Function breakpoints not supported by this debug type")
      };
    }
    const messages = [];
    messages.push(breakpoint.message || localize("functionBreakpoint", "Function Breakpoint"));
    if (breakpoint.condition) {
      messages.push(localize("expression", "Condition: {0}", breakpoint.condition));
    }
    if (breakpoint.hitCondition) {
      messages.push(localize("hitCount", "Hit Count: {0}", breakpoint.hitCondition));
    }
    return {
      icon: breakpointIcon.regular,
      message: appendMessage(messages.join("\n"))
    };
  }
  if (breakpoint instanceof InstructionBreakpoint) {
    if (!breakpoint.supported) {
      return {
        icon: breakpointIcon.unverified,
        message: localize("instructionBreakpointUnsupported", "Instruction breakpoints not supported by this debug type")
      };
    }
    const messages = [];
    if (breakpoint.message) {
      messages.push(breakpoint.message);
    } else if (breakpoint.instructionReference) {
      messages.push(localize("instructionBreakpointAtAddress", "Instruction breakpoint at address {0}", breakpoint.instructionReference));
    } else {
      messages.push(localize("instructionBreakpoint", "Instruction breakpoint"));
    }
    if (breakpoint.hitCondition) {
      messages.push(localize("hitCount", "Hit Count: {0}", breakpoint.hitCondition));
    }
    return {
      icon: breakpointIcon.regular,
      message: appendMessage(messages.join("\n"))
    };
  }
  let triggeringBreakpoint;
  if (breakpoint instanceof Breakpoint && breakpoint.triggeredBy) {
    triggeringBreakpoint = debugModel.getBreakpoints().find((bp) => bp.getId() === breakpoint.triggeredBy);
  }
  if (breakpoint.logMessage || breakpoint.condition || breakpoint.hitCondition || triggeringBreakpoint) {
    const messages = [];
    let icon = breakpoint.logMessage ? icons.logBreakpoint.regular : icons.conditionalBreakpoint.regular;
    if (!breakpoint.supported) {
      icon = icons.debugBreakpointUnsupported;
      messages.push(localize("breakpointUnsupported", "Breakpoints of this type are not supported by the debugger"));
    }
    if (breakpoint.logMessage) {
      messages.push(localize("logMessage", "Log Message: {0}", breakpoint.logMessage));
    }
    if (breakpoint.condition) {
      messages.push(localize("expression", "Condition: {0}", breakpoint.condition));
    }
    if (breakpoint.hitCondition) {
      messages.push(localize("hitCount", "Hit Count: {0}", breakpoint.hitCondition));
    }
    if (triggeringBreakpoint) {
      messages.push(localize("triggeredBy", "Hit after breakpoint: {0}", `${labelService.getUriLabel(triggeringBreakpoint.uri, { relative: true })}: ${triggeringBreakpoint.lineNumber}`));
    }
    return {
      icon,
      message: appendMessage(messages.join("\n"))
    };
  }
  const message = breakpoint.message ? breakpoint.message : breakpoint instanceof Breakpoint && labelService ? labelService.getUriLabel(breakpoint.uri) : localize("breakpoint", "Breakpoint");
  return {
    icon: breakpointIcon.regular,
    message
  };
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.addFunctionBreakpointAction",
      title: {
        ...localize2("addFunctionBreakpoint", "Add Function Breakpoint"),
        mnemonicTitle: localize({ key: "miFunctionBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Function Breakpoint...")
      },
      f1: true,
      icon: icons.watchExpressionsAddFuncBreakpoint,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 10,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }, {
        id: MenuId.MenubarNewBreakpointMenu,
        group: "1_breakpoints",
        order: 3,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    const viewService = accessor.get(IViewsService);
    await viewService.openView(BREAKPOINTS_VIEW_ID);
    debugService.addFunctionBreakpoint();
  }
});
class MemoryBreakpointAction extends Action2 {
  async run(accessor, existingBreakpoint) {
    const debugService = accessor.get(IDebugService);
    const session = debugService.getViewModel().focusedSession;
    if (!session) {
      return;
    }
    let defaultValue = void 0;
    if (existingBreakpoint && existingBreakpoint.src.type === DataBreakpointSetType.Address) {
      defaultValue = `${existingBreakpoint.src.address} + ${existingBreakpoint.src.bytes}`;
    }
    const quickInput = accessor.get(IQuickInputService);
    const notifications = accessor.get(INotificationService);
    const range = await this.getRange(quickInput, defaultValue);
    if (!range) {
      return;
    }
    let info;
    try {
      info = await session.dataBytesBreakpointInfo(range.address, range.bytes);
    } catch (e) {
      notifications.error(localize("dataBreakpointError", "Failed to set data breakpoint at {0}: {1}", range.address, e.message));
    }
    if (!info?.dataId) {
      return;
    }
    let accessType = "write";
    if (info.accessTypes && info.accessTypes?.length > 1) {
      const accessTypes = info.accessTypes.map((type) => ({ label: type }));
      const selectedAccessType = await quickInput.pick(accessTypes, { placeHolder: localize("dataBreakpointAccessType", "Select the access type to monitor") });
      if (!selectedAccessType) {
        return;
      }
      accessType = selectedAccessType.label;
    }
    const src = { type: DataBreakpointSetType.Address, ...range };
    if (existingBreakpoint) {
      await debugService.removeDataBreakpoints(existingBreakpoint.getId());
    }
    await debugService.addDataBreakpoint({
      description: info.description,
      src,
      canPersist: true,
      accessTypes: info.accessTypes,
      accessType,
      initialSessionData: { session, dataId: info.dataId }
    });
  }
  getRange(quickInput, defaultValue) {
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      const input = disposables.add(quickInput.createInputBox());
      input.prompt = localize("dataBreakpointMemoryRangePrompt", "Enter a memory range in which to break");
      input.placeholder = localize("dataBreakpointMemoryRangePlaceholder", "Absolute range (0x1234 - 0x1300) or range of bytes after an address (0x1234 + 0xff)");
      if (defaultValue) {
        input.value = defaultValue;
        input.valueSelection = [0, defaultValue.length];
      }
      disposables.add(input.onDidChangeValue((e) => {
        const err = this.parseAddress(e, false);
        input.validationMessage = err?.error;
      }));
      disposables.add(input.onDidAccept(() => {
        const r = this.parseAddress(input.value, true);
        if (hasKey(r, { error: true })) {
          input.validationMessage = r.error;
        } else {
          resolve(r);
        }
        input.dispose();
      }));
      disposables.add(input.onDidHide(() => {
        resolve(void 0);
        disposables.dispose();
      }));
      input.ignoreFocusOut = true;
      input.show();
    });
  }
  parseAddress(range, isFinal) {
    const parts = /^(\S+)\s*(?:([+-])\s*(\S+))?/.exec(range);
    if (!parts) {
      return { error: localize("dataBreakpointAddrFormat", 'Address should be a range of numbers the form "[Start] - [End]" or "[Start] + [Bytes]"') };
    }
    const isNum = (e) => isFinal ? /^0x[0-9a-f]*|[0-9]*$/i.test(e) : /^0x[0-9a-f]+|[0-9]+$/i.test(e);
    const [, startStr, sign = "+", endStr = "1"] = parts;
    for (const n of [startStr, endStr]) {
      if (!isNum(n)) {
        return { error: localize("dataBreakpointAddrStartEnd", 'Number must be a decimal integer or hex value starting with "0x", got {0}', n) };
      }
    }
    if (!isFinal) {
      return;
    }
    const start = BigInt(startStr);
    const end = BigInt(endStr);
    const address = `0x${start.toString(16)}`;
    if (sign === "-") {
      if (start > end) {
        return { error: localize("dataBreakpointAddrOrder", "End ({1}) should be greater than Start ({0})", startStr, endStr) };
      }
      return { address, bytes: Number(end - start) };
    }
    return { address, bytes: Number(end) };
  }
}
registerAction2(class extends MemoryBreakpointAction {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.addDataBreakpointOnAddress",
      title: {
        ...localize2("addDataBreakpointOnAddress", "Add Data Breakpoint at Address"),
        mnemonicTitle: localize({ key: "miDataBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Data Breakpoint...")
      },
      f1: true,
      icon: icons.watchExpressionsAddDataBreakpoint,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 11,
        when: ContextKeyExpr.and(CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID))
      }, {
        id: MenuId.MenubarNewBreakpointMenu,
        group: "1_breakpoints",
        order: 4,
        when: CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED
      }]
    });
  }
});
registerAction2(class extends MemoryBreakpointAction {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.editDataBreakpointOnAddress",
      title: localize2("editDataBreakpointOnAddress", "Edit Address..."),
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        when: ContextKeyExpr.and(CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES),
        group: "navigation",
        order: 15
      }]
    });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.toggleBreakpointsActivatedAction",
      title: localize2("activateBreakpoints", "Toggle Activate Breakpoints"),
      f1: true,
      icon: icons.breakpointsActivate,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 20,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.setBreakpointsActivated(!debugService.getModel().areBreakpointsActivated());
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.removeBreakpoint",
      title: localize("removeBreakpoint", "Remove Breakpoint"),
      icon: Codicon.removeClose,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "3_modification",
        order: 10,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint")
      }, {
        id: MenuId.DebugBreakpointsContext,
        group: "inline",
        order: 20,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint")
      }]
    });
  }
  async run(accessor, breakpoint) {
    const debugService = accessor.get(IDebugService);
    if (breakpoint instanceof Breakpoint) {
      await debugService.removeBreakpoints(breakpoint.getId());
    } else if (breakpoint instanceof FunctionBreakpoint) {
      await debugService.removeFunctionBreakpoints(breakpoint.getId());
    } else if (breakpoint instanceof DataBreakpoint) {
      await debugService.removeDataBreakpoints(breakpoint.getId());
    } else if (breakpoint instanceof InstructionBreakpoint) {
      await debugService.removeInstructionBreakpoints(breakpoint.instructionReference, breakpoint.offset);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.removeAllBreakpoints",
      title: {
        ...localize2("removeAllBreakpoints", "Remove All Breakpoints"),
        mnemonicTitle: localize({ key: "miRemoveAllBreakpoints", comment: ["&& denotes a mnemonic"] }, "Remove &&All Breakpoints")
      },
      f1: true,
      icon: icons.breakpointsRemoveAll,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 30,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }, {
        id: MenuId.DebugBreakpointsContext,
        group: "3_modification",
        order: 20,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }, {
        id: MenuId.MenubarDebugMenu,
        group: "5_breakpoints",
        order: 3,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.removeBreakpoints();
    debugService.removeFunctionBreakpoints();
    debugService.removeDataBreakpoints();
    debugService.removeInstructionBreakpoints();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.enableAllBreakpoints",
      title: {
        ...localize2("enableAllBreakpoints", "Enable All Breakpoints"),
        mnemonicTitle: localize({ key: "miEnableAllBreakpoints", comment: ["&& denotes a mnemonic"] }, "&&Enable All Breakpoints")
      },
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "z_commands",
        order: 10,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }, {
        id: MenuId.MenubarDebugMenu,
        group: "5_breakpoints",
        order: 1,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    await debugService.enableOrDisableBreakpoints(true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.disableAllBreakpoints",
      title: {
        ...localize2("disableAllBreakpoints", "Disable All Breakpoints"),
        mnemonicTitle: localize({ key: "miDisableAllBreakpoints", comment: ["&& denotes a mnemonic"] }, "Disable A&&ll Breakpoints")
      },
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "z_commands",
        order: 20,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }, {
        id: MenuId.MenubarDebugMenu,
        group: "5_breakpoints",
        order: 2,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    await debugService.enableOrDisableBreakpoints(false);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.reapplyBreakpointsAction",
      title: localize2("reapplyAllBreakpoints", "Reapply All Breakpoints"),
      f1: true,
      precondition: CONTEXT_IN_DEBUG_MODE,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "z_commands",
        order: 30,
        when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("exceptionBreakpoint"))
      }]
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    await debugService.setBreakpointsActivated(true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.viewlet.action.toggleBreakpointsPresentation",
      title: localize2("toggleBreakpointsPresentation", "Toggle Breakpoints View Presentation"),
      f1: true,
      icon: icons.breakpointsViewIcon,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 10,
        when: ContextKeyExpr.equals("view", BREAKPOINTS_VIEW_ID)
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentPresentation = configurationService.getValue("debug.breakpointsView.presentation");
    const newPresentation = currentPresentation === "tree" ? "list" : "tree";
    await configurationService.updateValue("debug.breakpointsView.presentation", newPresentation);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editBreakpoint",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editCondition", "Edit Condition..."),
      icon: Codicon.edit,
      precondition: CONTEXT_BREAKPOINT_SUPPORTS_CONDITION,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo("functionBreakpoint"),
        group: "navigation",
        order: 10
      }, {
        id: MenuId.DebugBreakpointsContext,
        group: "inline",
        order: 10
      }]
    });
  }
  async runInView(accessor, view, breakpoint) {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    if (breakpoint instanceof Breakpoint) {
      const editor = await openBreakpointSource(breakpoint, false, false, true, debugService, editorService);
      if (editor) {
        const codeEditor = editor.getControl();
        if (isCodeEditor(codeEditor)) {
          codeEditor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(breakpoint.lineNumber, breakpoint.column);
        }
      }
    } else if (breakpoint instanceof FunctionBreakpoint) {
      const contextMenuService = accessor.get(IContextMenuService);
      const actions = [
        new Action("breakpoint.editCondition", localize("editCondition", "Edit Condition..."), void 0, true, async () => view.renderInputBox({ breakpoint, type: "condition" })),
        new Action("breakpoint.editCondition", localize("editHitCount", "Edit Hit Count..."), void 0, true, async () => view.renderInputBox({ breakpoint, type: "hitCount" }))
      ];
      const domNode = breakpointIdToActionBarDomeNode.get(breakpoint.getId());
      if (domNode) {
        contextMenuService.showContextMenu({
          getActions: () => actions,
          getAnchor: () => domNode,
          onHide: () => dispose(actions)
        });
      }
    } else {
      view.renderInputBox({ breakpoint, type: "condition" });
    }
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editFunctionBreakpoint",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editBreakpoint", "Edit Function Condition..."),
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "navigation",
        order: 10,
        when: CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("functionBreakpoint")
      }]
    });
  }
  runInView(_accessor, view, breakpoint) {
    view.renderInputBox({ breakpoint, type: "name" });
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editFunctionBreakpointHitCount",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editHitCount", "Edit Hit Count..."),
      precondition: CONTEXT_BREAKPOINT_SUPPORTS_CONDITION,
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "navigation",
        order: 20,
        when: ContextKeyExpr.or(CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("functionBreakpoint"), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("dataBreakpoint"))
      }]
    });
  }
  runInView(_accessor, view, breakpoint) {
    view.renderInputBox({ breakpoint, type: "hitCount" });
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.editBreakpointMode",
      viewId: BREAKPOINTS_VIEW_ID,
      title: localize("editMode", "Edit Mode..."),
      menu: [{
        id: MenuId.DebugBreakpointsContext,
        group: "navigation",
        order: 20,
        when: ContextKeyExpr.and(
          CONTEXT_BREAKPOINT_HAS_MODES,
          ContextKeyExpr.or(CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("breakpoint"), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("exceptionBreakpoint"), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo("instructionBreakpoint"))
        )
      }]
    });
  }
  async runInView(accessor, view, breakpoint) {
    const debugService = accessor.get(IDebugService);
    const kind = getModeKindForBreakpoint(breakpoint);
    const modes = debugService.getModel().getBreakpointModes(kind);
    const picked = await accessor.get(IQuickInputService).pick(
      modes.map((mode) => ({ label: mode.label, description: mode.description, mode: mode.mode })),
      { placeHolder: localize("selectBreakpointMode", "Select Breakpoint Mode") }
    );
    if (!picked) {
      return;
    }
    if (kind === "source") {
      const data = /* @__PURE__ */ new Map();
      data.set(breakpoint.getId(), { mode: picked.mode, modeLabel: picked.label });
      debugService.updateBreakpoints(breakpoint.originalUri, data, false);
    } else if (breakpoint instanceof InstructionBreakpoint) {
      debugService.removeInstructionBreakpoints(breakpoint.instructionReference, breakpoint.offset);
      debugService.addInstructionBreakpoint({ ...breakpoint.toJSON(), mode: picked.mode, modeLabel: picked.label });
    } else if (breakpoint instanceof ExceptionBreakpoint) {
      breakpoint.mode = picked.mode;
      breakpoint.modeLabel = picked.label;
      debugService.setExceptionBreakpointCondition(breakpoint, breakpoint.condition);
    }
  }
});
export {
  BreakpointsFolderItem,
  BreakpointsView,
  getBreakpointMessageAndIcon,
  getExpandedBodySize,
  openBreakpointSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvYnJlYWtwb2ludHNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQsIFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFyaWFSb2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCwgVHJpU3RhdGVDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVFbGVtZW50LCBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zLCBnZXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMsIGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3QWN0aW9uLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQlJFQUtQT0lOVFNfVklFV19JRCwgQlJFQUtQT0lOVF9FRElUT1JfQ09OVFJJQlVUSU9OX0lELCBDT05URVhUX0JSRUFLUE9JTlRTX0VYSVNULCBDT05URVhUX0JSRUFLUE9JTlRTX0ZPQ1VTRUQsIENPTlRFWFRfQlJFQUtQT0lOVF9IQVNfTU9ERVMsIENPTlRFWFRfQlJFQUtQT0lOVF9JTlBVVF9GT0NVU0VELCBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9JU19EQVRBX0JZVEVTLCBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLCBDT05URVhUX0JSRUFLUE9JTlRfU1VQUE9SVFNfQ09ORElUSU9OLCBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsIENPTlRFWFRfSU5fREVCVUdfTU9ERSwgQ09OVEVYVF9TRVRfREFUQV9CUkVBS1BPSU5UX0JZVEVTX1NVUFBPUlRFRCwgREVCVUdfU0NIRU1FLCBEYXRhQnJlYWtwb2ludFNldFR5cGUsIERhdGFCcmVha3BvaW50U291cmNlLCBEZWJ1Z2dlclN0cmluZywgSUJhc2VCcmVha3BvaW50LCBJQnJlYWtwb2ludCwgSUJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24sIElCcmVha3BvaW50VXBkYXRlRGF0YSwgSURhdGFCcmVha3BvaW50LCBJRGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UsIElEZWJ1Z01vZGVsLCBJRGVidWdTZXJ2aWNlLCBJRW5hYmxlbWVudCwgSUV4Y2VwdGlvbkJyZWFrcG9pbnQsIElGdW5jdGlvbkJyZWFrcG9pbnQsIElJbnN0cnVjdGlvbkJyZWFrcG9pbnQsIFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IEJyZWFrcG9pbnQsIERhdGFCcmVha3BvaW50LCBFeGNlcHRpb25CcmVha3BvaW50LCBGdW5jdGlvbkJyZWFrcG9pbnQsIEluc3RydWN0aW9uQnJlYWtwb2ludCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IERpc2Fzc2VtYmx5Vmlld0lucHV0IH0gZnJvbSAnLi4vY29tbW9uL2Rpc2Fzc2VtYmx5Vmlld0lucHV0LmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNhc3NlbWJseVZpZXcgfSBmcm9tICcuL2Rpc2Fzc2VtYmx5Vmlldy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoZWNrYm94KGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBDaGVja2JveCB7XG5cdGNvbnN0IGNoZWNrYm94ID0gbmV3IENoZWNrYm94KCcnLCBmYWxzZSwgZGVmYXVsdENoZWNrYm94U3R5bGVzKTtcblx0Y2hlY2tib3guZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRkaXNwb3NhYmxlcy5hZGQoY2hlY2tib3gpO1xuXG5cdHJldHVybiBjaGVja2JveDtcbn1cblxuY29uc3QgTUFYX1ZJU0lCTEVfQlJFQUtQT0lOVFMgPSA5O1xuZXhwb3J0IGZ1bmN0aW9uIGdldEV4cGFuZGVkQm9keVNpemUobW9kZWw6IElEZWJ1Z01vZGVsLCBzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgY291bnRMaW1pdDogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgbGVuZ3RoID0gbW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5sZW5ndGggKyBtb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbklkKS5sZW5ndGggKyBtb2RlbC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCkubGVuZ3RoICsgbW9kZWwuZ2V0RGF0YUJyZWFrcG9pbnRzKCkubGVuZ3RoICsgbW9kZWwuZ2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpLmxlbmd0aDtcblx0cmV0dXJuIE1hdGgubWluKGNvdW50TGltaXQsIGxlbmd0aCkgKiAyMjtcbn1cbnR5cGUgQnJlYWtwb2ludEl0ZW0gPSBJQnJlYWtwb2ludCB8IElGdW5jdGlvbkJyZWFrcG9pbnQgfCBJRGF0YUJyZWFrcG9pbnQgfCBJRXhjZXB0aW9uQnJlYWtwb2ludCB8IElJbnN0cnVjdGlvbkJyZWFrcG9pbnQ7XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGZpbGUgbm9kZSBpbiB0aGUgYnJlYWtwb2ludHMgdHJlZSB0aGF0IGdyb3VwcyBicmVha3BvaW50cyBieSBmaWxlLlxuICovXG5leHBvcnQgY2xhc3MgQnJlYWtwb2ludHNGb2xkZXJJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgdXJpOiBVUkksXG5cdFx0cmVhZG9ubHkgYnJlYWtwb2ludHM6IElCcmVha3BvaW50W11cblx0KSB7IH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnVyaS50b1N0cmluZygpO1xuXHR9XG5cblx0Z2V0IGVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJlYWtwb2ludHMuZXZlcnkoYnAgPT4gYnAuZW5hYmxlZCk7XG5cdH1cblxuXHRnZXQgaW5kZXRlcm1pbmF0ZSgpOiBib29sZWFuIHtcblx0XHRjb25zdCBlbmFibGVkQ291bnQgPSB0aGlzLmJyZWFrcG9pbnRzLmZpbHRlcihicCA9PiBicC5lbmFibGVkKS5sZW5ndGg7XG5cdFx0cmV0dXJuIGVuYWJsZWRDb3VudCA+IDAgJiYgZW5hYmxlZENvdW50IDwgdGhpcy5icmVha3BvaW50cy5sZW5ndGg7XG5cdH1cbn1cblxudHlwZSBCcmVha3BvaW50VHJlZUVsZW1lbnQgPSBCcmVha3BvaW50c0ZvbGRlckl0ZW0gfCBCcmVha3BvaW50SXRlbTtcblxuaW50ZXJmYWNlIElucHV0Qm94RGF0YSB7XG5cdGJyZWFrcG9pbnQ6IElGdW5jdGlvbkJyZWFrcG9pbnQgfCBJRXhjZXB0aW9uQnJlYWtwb2ludCB8IElEYXRhQnJlYWtwb2ludDtcblx0dHlwZTogJ2NvbmRpdGlvbicgfCAnaGl0Q291bnQnIHwgJ25hbWUnO1xufVxuXG5mdW5jdGlvbiBnZXRNb2RlS2luZEZvckJyZWFrcG9pbnQoYnJlYWtwb2ludDogSUJyZWFrcG9pbnQpIHtcblx0Y29uc3Qga2luZCA9IGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50ID8gJ3NvdXJjZScgOiBicmVha3BvaW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50ID8gJ2luc3RydWN0aW9uJyA6ICdleGNlcHRpb24nO1xuXHRyZXR1cm4ga2luZDtcbn1cblxuZXhwb3J0IGNsYXNzIEJyZWFrcG9pbnRzVmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRwcml2YXRlIHRyZWUhOiBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlPEJyZWFrcG9pbnRUcmVlRWxlbWVudCwgdm9pZD47XG5cdHByaXZhdGUgbmVlZHNSZWZyZXNoID0gZmFsc2U7XG5cdHByaXZhdGUgbmVlZHNTdGF0ZUNoYW5nZSA9IGZhbHNlO1xuXHRwcml2YXRlIGlnbm9yZUxheW91dCA9IGZhbHNlO1xuXHRwcml2YXRlIG1lbnU6IElNZW51O1xuXHRwcml2YXRlIGJyZWFrcG9pbnRJdGVtVHlwZTogSUNvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBicmVha3BvaW50SXNEYXRhQnl0ZXM6IElDb250ZXh0S2V5PGJvb2xlYW4gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIGJyZWFrcG9pbnRIYXNNdWx0aXBsZU1vZGVzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBicmVha3BvaW50U3VwcG9ydHNDb25kaXRpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9pbnB1dEJveERhdGE6IElucHV0Qm94RGF0YSB8IHVuZGVmaW5lZDtcblx0YnJlYWtwb2ludElucHV0Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgYXV0b0ZvY3VzZWRFbGVtZW50OiBCcmVha3BvaW50SXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb2xsYXBzZWRTdGF0ZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgaGludENvbnRhaW5lcjogSWNvbkxhYmVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhpbnREZWxheWVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdHByaXZhdGUgZ2V0UHJlc2VudGF0aW9uKCk6ICd0cmVlJyB8ICdsaXN0JyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3RyZWUnIHwgJ2xpc3QnPignZGVidWcuYnJlYWtwb2ludHNWaWV3LnByZXNlbnRhdGlvbicpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0dGhpcy5tZW51ID0gbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1lbnUpO1xuXHRcdHRoaXMuYnJlYWtwb2ludEl0ZW1UeXBlID0gQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYnJlYWtwb2ludElzRGF0YUJ5dGVzID0gQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fSVNfREFUQV9CWVRFUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMgPSBDT05URVhUX0JSRUFLUE9JTlRfSEFTX01PREVTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5icmVha3BvaW50U3VwcG9ydHNDb25kaXRpb24gPSBDT05URVhUX0JSRUFLUE9JTlRfU1VQUE9SVFNfQ09ORElUSU9OLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5icmVha3BvaW50SW5wdXRGb2N1c2VkID0gQ09OVEVYVF9CUkVBS1BPSU5UX0lOUFVUX0ZPQ1VTRUQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMoKCkgPT4gdGhpcy5vbkJyZWFrcG9pbnRzQ2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU2Vzc2lvbigoKSA9PiB0aGlzLm9uQnJlYWtwb2ludHNDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUoKCkgPT4gdGhpcy5vblN0YXRlQ2hhbmdlKCkpKTtcblx0XHR0aGlzLmhpbnREZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy51cGRhdGVCcmVha3BvaW50c0hpbnQodHJ1ZSksIDQwMDApKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGVidWctcGFuZScpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkZWJ1Zy1icmVha3BvaW50cycpO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8QnJlYWtwb2ludFRyZWVFbGVtZW50LCB2b2lkPixcblx0XHRcdCdCcmVha3BvaW50c1ZpZXcnLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IEJyZWFrcG9pbnRzRGVsZWdhdGUodGhpcyksXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJlYWtwb2ludHNGb2xkZXJSZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJlYWtwb2ludHNSZW5kZXJlciwgdGhpcy5tZW51LCB0aGlzLmJyZWFrcG9pbnRIYXNNdWx0aXBsZU1vZGVzLCB0aGlzLmJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbiwgdGhpcy5icmVha3BvaW50SXRlbVR5cGUpLFxuXHRcdFx0XHRuZXcgRXhjZXB0aW9uQnJlYWtwb2ludHNSZW5kZXJlcih0aGlzLm1lbnUsIHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMsIHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLCB0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZSwgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMuaG92ZXJTZXJ2aWNlKSxcblx0XHRcdFx0bmV3IEV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyKHRoaXMsIHRoaXMuZGVidWdTZXJ2aWNlLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRnVuY3Rpb25CcmVha3BvaW50c1JlbmRlcmVyLCB0aGlzLm1lbnUsIHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLCB0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZSksXG5cdFx0XHRcdG5ldyBGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyKHRoaXMsIHRoaXMuZGVidWdTZXJ2aWNlLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgdGhpcy5ob3ZlclNlcnZpY2UsIHRoaXMubGFiZWxTZXJ2aWNlKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEYXRhQnJlYWtwb2ludHNSZW5kZXJlciwgdGhpcy5tZW51LCB0aGlzLmJyZWFrcG9pbnRIYXNNdWx0aXBsZU1vZGVzLCB0aGlzLmJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbiwgdGhpcy5icmVha3BvaW50SXRlbVR5cGUsIHRoaXMuYnJlYWtwb2ludElzRGF0YUJ5dGVzKSxcblx0XHRcdFx0bmV3IERhdGFCcmVha3BvaW50SW5wdXRSZW5kZXJlcih0aGlzLCB0aGlzLmRlYnVnU2VydmljZSwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHRoaXMuaG92ZXJTZXJ2aWNlLCB0aGlzLmxhYmVsU2VydmljZSksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdHJ1Y3Rpb25CcmVha3BvaW50c1JlbmRlcmVyKSxcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdGNvbXByZXNzaW9uRW5hYmxlZDogdGhpcy5nZXRQcmVzZW50YXRpb24oKSA9PT0gJ3RyZWUnLFxuXHRcdFx0XHRoaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzOiB0cnVlLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQ6IChlbGVtZW50OiBCcmVha3BvaW50VHJlZUVsZW1lbnQpID0+IGVsZW1lbnQuZ2V0SWQoKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlbGVtZW50OiBCcmVha3BvaW50VHJlZUVsZW1lbnQpID0+IHtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludHNGb2xkZXJJdGVtKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eShlbGVtZW50LnVyaSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGAke3Jlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KGVsZW1lbnQudXJpKX06JHtlbGVtZW50LmxpbmVOdW1iZXJ9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50Lm5hbWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBFeGNlcHRpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmxhYmVsIHx8IGVsZW1lbnQuZmlsdGVyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGAweCR7ZWxlbWVudC5hZGRyZXNzLnRvU3RyaW5nKDE2KX1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0Q29tcHJlc3NlZE5vZGVLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGVsZW1lbnRzOiBCcmVha3BvaW50VHJlZUVsZW1lbnRbXSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnRzLm1hcChlID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBCcmVha3BvaW50c0ZvbGRlckl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkoZS51cmkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0XHRcdH0pLmpvaW4oJy8nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IEJyZWFrcG9pbnRzQWNjZXNzaWJpbGl0eVByb3ZpZGVyKHRoaXMuZGVidWdTZXJ2aWNlLCB0aGlzLmxhYmVsU2VydmljZSksXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHRcdH1cblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZSk7XG5cblx0XHRDT05URVhUX0JSRUFLUE9JTlRTX0ZPQ1VTRUQuYmluZFRvKHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Db250ZXh0TWVudSh0aGlzLm9uVHJlZUNvbnRleHRNZW51LCB0aGlzKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Nb3VzZU1pZGRsZUNsaWNrKGFzeW5jICh7IGVsZW1lbnQgfSkgPT4ge1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cyhlbGVtZW50LmdldElkKCkpO1xuXHRcdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlRGF0YUJyZWFrcG9pbnRzKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhlbGVtZW50Lmluc3RydWN0aW9uUmVmZXJlbmNlLCBlbGVtZW50Lm9mZnNldCk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50c0ZvbGRlckl0ZW0pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoZWxlbWVudC5icmVha3BvaW50cy5tYXAoYnAgPT4gYnAuZ2V0SWQoKSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRvbS5pc01vdXNlRXZlbnQoZS5icm93c2VyRXZlbnQpICYmIGUuYnJvd3NlckV2ZW50LmJ1dHRvbiA9PT0gMSkgeyAvLyBtaWRkbGUgY2xpY2tcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcblx0XHRcdFx0b3BlbkJyZWFrcG9pbnRTb3VyY2UoZWxlbWVudCwgZS5zaWRlQnlTaWRlLCBlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cyB8fCBmYWxzZSwgZS5lZGl0b3JPcHRpb25zLnBpbm5lZCB8fCAhZS5lZGl0b3JPcHRpb25zLnByZXNlcnZlRm9jdXMsIHRoaXMuZGVidWdTZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0Y29uc3QgZGlzYXNzZW1ibHlWaWV3ID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoRGlzYXNzZW1ibHlWaWV3SW5wdXQuaW5zdGFuY2UpO1xuXHRcdFx0XHQvLyBGb2N1cyBvbiBkb3VibGUgY2xpY2tcblx0XHRcdFx0KGRpc2Fzc2VtYmx5VmlldyBhcyBEaXNhc3NlbWJseVZpZXcpLmdvVG9JbnN0cnVjdGlvbkFuZE9mZnNldChlbGVtZW50Lmluc3RydWN0aW9uUmVmZXJlbmNlLCBlbGVtZW50Lm9mZnNldCwgZG9tLmlzTW91c2VFdmVudChlLmJyb3dzZXJFdmVudCkgJiYgZS5icm93c2VyRXZlbnQuZGV0YWlsID09PSAyKTtcblx0XHRcdH1cblx0XHRcdGlmIChkb20uaXNNb3VzZUV2ZW50KGUuYnJvd3NlckV2ZW50KSAmJiBlLmJyb3dzZXJFdmVudC5kZXRhaWwgPT09IDIgJiYgZWxlbWVudCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCAmJiBlbGVtZW50ICE9PSB0aGlzLmlucHV0Qm94RGF0YT8uYnJlYWtwb2ludCkge1xuXHRcdFx0XHQvLyBkb3VibGUgY2xpY2tcblx0XHRcdFx0dGhpcy5yZW5kZXJJbnB1dEJveCh7IGJyZWFrcG9pbnQ6IGVsZW1lbnQsIHR5cGU6ICduYW1lJyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25LZXlEb3duKGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSAmJiAhZG9tLmlzRWRpdGFibGVFbGVtZW50KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkge1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdGlmIChmb2N1c2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBlbGVtZW50ID0gZm9jdXNlZFswXTtcblx0XHRcdFx0XHRpZiAoZWxlbWVudCAmJiAhKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50c0ZvbGRlckl0ZW0pKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghZWxlbWVudC5lbmFibGVkLCBlbGVtZW50KTtcblx0XHRcdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayBjb2xsYXBzZWQgc3RhdGUgYW5kIHVwZGF0ZSBzaXplIChpdGVtcyBhcmUgZXhwYW5kZWQgYnkgZGVmYXVsdClcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKGUgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGUubm9kZS5lbGVtZW50O1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50c0ZvbGRlckl0ZW0pIHtcblx0XHRcdFx0aWYgKGUubm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZFN0YXRlLmFkZChlbGVtZW50LmdldElkKCkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY29sbGFwc2VkU3RhdGUuZGVsZXRlKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gY29uZmlndXJhdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcuYnJlYWtwb2ludHNWaWV3LnByZXNlbnRhdGlvbicpKSB7XG5cdFx0XHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IHRoaXMuZ2V0UHJlc2VudGF0aW9uKCk7XG5cdFx0XHRcdHRoaXMudHJlZS51cGRhdGVPcHRpb25zKHsgY29tcHJlc3Npb25FbmFibGVkOiBwcmVzZW50YXRpb24gPT09ICd0cmVlJyB9KTtcblx0XHRcdFx0dGhpcy5vbkJyZWFrcG9pbnRzQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zZXRUcmVlSW5wdXQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdGlmICh0aGlzLm5lZWRzUmVmcmVzaCkge1xuXHRcdFx0XHRcdHRoaXMub25CcmVha3BvaW50c0NoYW5nZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMubmVlZHNTdGF0ZUNoYW5nZSkge1xuXHRcdFx0XHRcdHRoaXMub25TdGF0ZUNoYW5nZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpISk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGFpbmVyTW9kZWwub25EaWRDaGFuZ2VBbGxWaWV3RGVzY3JpcHRvcnMoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJIZWFkZXJUaXRsZShjb250YWluZXIsIHRpdGxlKTtcblxuXHRcdGNvbnN0IGljb25MYWJlbENvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLmJyZWFrcG9pbnQtd2FybmluZycpKTtcblx0XHR0aGlzLmhpbnRDb250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgSWNvbkxhYmVsKGljb25MYWJlbENvbnRhaW5lciwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLCBob3ZlckRlbGVnYXRlOiB7XG5cdFx0XHRcdHNob3dIb3ZlcjogKG9wdGlvbnMsIGZvY3VzPykgPT4gdGhpcy5ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7IGNvbnRlbnQ6IG9wdGlvbnMuY29udGVudCwgdGFyZ2V0OiB0aGlzLmhpbnRDb250YWluZXIhLmVsZW1lbnQgfSwgZm9jdXMpLFxuXHRcdFx0XHRkZWxheTogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCd3b3JrYmVuY2guaG92ZXIuZGVsYXknKVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkb20uaGlkZSh0aGlzLmhpbnRDb250YWluZXIuZWxlbWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMudHJlZT8uZG9tRm9jdXMoKTtcblx0fVxuXG5cdHJlbmRlcklucHV0Qm94KGRhdGE6IElucHV0Qm94RGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2lucHV0Qm94RGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5vbkJyZWFrcG9pbnRzQ2hhbmdlKCk7XG5cdFx0dGhpcy5faW5wdXRCb3hEYXRhID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IGlucHV0Qm94RGF0YSgpOiBJbnB1dEJveERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dEJveERhdGE7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlnbm9yZUxheW91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlPy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuaWdub3JlTGF5b3V0ID0gdHJ1ZTtcblx0XHRcdHRoaXMudXBkYXRlU2l6ZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmlnbm9yZUxheW91dCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25UcmVlQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PEJyZWFrcG9pbnRUcmVlRWxlbWVudCB8IG51bGw+KTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkge1xuXHRcdFx0Ly8gRm9yIGZvbGRlciBpdGVtcywgc2hvdyBmaWxlLWxldmVsIGNvbnRleHQgbWVudVxuXHRcdFx0dGhpcy5icmVha3BvaW50SXRlbVR5cGUuc2V0KCdicmVha3BvaW50Rm9sZGVyJyk7XG5cdFx0XHRjb25zdCB7IHNlY29uZGFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKHRoaXMubWVudS5nZXRBY3Rpb25zKHsgYXJnOiBlbGVtZW50LCBzaG91bGRGb3J3YXJkQXJnczogZmFsc2UgfSksICdpbmxpbmUnKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHNlY29uZGFyeSxcblx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGVsZW1lbnRcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR5cGUgPSBlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCA/ICdicmVha3BvaW50JyA6IGVsZW1lbnQgaW5zdGFuY2VvZiBFeGNlcHRpb25CcmVha3BvaW50ID8gJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnIDpcblx0XHRcdGVsZW1lbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQgPyAnZnVuY3Rpb25CcmVha3BvaW50JyA6IGVsZW1lbnQgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCA/ICdkYXRhQnJlYWtwb2ludCcgOlxuXHRcdFx0XHRlbGVtZW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50ID8gJ2luc3RydWN0aW9uQnJlYWtwb2ludCcgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5icmVha3BvaW50SXRlbVR5cGUuc2V0KHR5cGUpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRjb25zdCBjb25kaXRpb25TdXBwb3J0ZWQgPSBlbGVtZW50IGluc3RhbmNlb2YgRXhjZXB0aW9uQnJlYWtwb2ludCA/IGVsZW1lbnQuc3VwcG9ydHNDb25kaXRpb24gOiAoIXNlc3Npb24gfHwgISFzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMpO1xuXHRcdHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLnNldChjb25kaXRpb25TdXBwb3J0ZWQpO1xuXHRcdHRoaXMuYnJlYWtwb2ludElzRGF0YUJ5dGVzLnNldChlbGVtZW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQgJiYgZWxlbWVudC5zcmMudHlwZSA9PT0gRGF0YUJyZWFrcG9pbnRTZXRUeXBlLkFkZHJlc3MpO1xuXHRcdHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMuc2V0KHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludE1vZGVzKGdldE1vZGVLaW5kRm9yQnJlYWtwb2ludChlbGVtZW50IGFzIElCcmVha3BvaW50KSkubGVuZ3RoID4gMSk7XG5cblx0XHRjb25zdCB7IHNlY29uZGFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKHRoaXMubWVudS5nZXRBY3Rpb25zKHsgYXJnOiBlLmVsZW1lbnQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KSwgJ2lubGluZScpO1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBzZWNvbmRhcnksXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZWxlbWVudFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTaXplKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh0aGlzLmlkKSEpO1xuXG5cdFx0Ly8gQ2FsY3VsYXRlIHZpc2libGUgcm93IGNvdW50IGZyb20gdHJlZSdzIGNvbnRlbnQgaGVpZ2h0XG5cdFx0Ly8gRWFjaCByb3cgaXMgMjJweCBoaWdoXG5cdFx0Y29uc3Qgcm93SGVpZ2h0ID0gMjI7XG5cblx0XHR0aGlzLm1pbmltdW1Cb2R5U2l6ZSA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gTWF0aC5taW4oTUFYX1ZJU0lCTEVfQlJFQUtQT0lOVFMgKiByb3dIZWlnaHQsIHRoaXMudHJlZS5jb250ZW50SGVpZ2h0KSA6IDE3MDtcblx0XHR0aGlzLm1heGltdW1Cb2R5U2l6ZSA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMICYmIGNvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID4gMSA/IHRoaXMudHJlZS5jb250ZW50SGVpZ2h0IDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCcmVha3BvaW50c0hpbnQoZGVsYXllZCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhpbnRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VHlwZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uPy5jb25maWd1cmF0aW9uLnR5cGU7XG5cdFx0Y29uc3QgZGJnID0gY3VycmVudFR5cGUgPyB0aGlzLmRlYnVnU2VydmljZS5nZXRBZGFwdGVyTWFuYWdlcigpLmdldERlYnVnZ2VyKGN1cnJlbnRUeXBlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtZXNzYWdlID0gZGJnPy5zdHJpbmdzPy5bRGVidWdnZXJTdHJpbmcuVW52ZXJpZmllZEJyZWFrcG9pbnRzXTtcblx0XHRjb25zdCBkZWJ1Z2dlckhhc1VudmVyaWZpZWRCcHMgPSBtZXNzYWdlICYmIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoKS5maWx0ZXIoYnAgPT4ge1xuXHRcdFx0aWYgKGJwLnZlcmlmaWVkIHx8ICFicC5lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFuZ0lkID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKGJwLnVyaSk7XG5cdFx0XHRyZXR1cm4gbGFuZ0lkICYmIGRiZy5pbnRlcmVzdGVkSW5MYW5ndWFnZShsYW5nSWQpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKG1lc3NhZ2UgJiYgZGVidWdnZXJIYXNVbnZlcmlmaWVkQnBzPy5sZW5ndGggJiYgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKSB7XG5cdFx0XHRpZiAoZGVsYXllZCkge1xuXHRcdFx0XHRjb25zdCBtZG93biA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgaXNUcnVzdGVkOiB0cnVlIH0pLmFwcGVuZE1hcmtkb3duKG1lc3NhZ2UpO1xuXHRcdFx0XHR0aGlzLmhpbnRDb250YWluZXIuc2V0TGFiZWwoJyQod2FybmluZyknLCB1bmRlZmluZWQsIHsgdGl0bGU6IHsgbWFya2Rvd246IG1kb3duLCBtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBtZXNzYWdlIH0gfSk7XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuaGludENvbnRhaW5lci5lbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaGludERlbGF5ZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG9tLmhpZGUodGhpcy5oaW50Q29udGFpbmVyLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25CcmVha3BvaW50c0NoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdFx0dGhpcy5zZXRUcmVlSW5wdXQoKTtcblx0XHRcdFx0dGhpcy5uZWVkc1JlZnJlc2ggPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlQnJlYWtwb2ludHNIaW50KCk7XG5cdFx0XHR0aGlzLnVwZGF0ZVNpemUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5uZWVkc1JlZnJlc2ggPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25TdGF0ZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMubmVlZHNTdGF0ZUNoYW5nZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFRocmVhZDtcblx0XHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHRocmVhZCAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMgJiYgdGhyZWFkLnN0b3BwZWREZXRhaWxzLmhpdEJyZWFrcG9pbnRJZHMgJiYgdGhyZWFkLnN0b3BwZWREZXRhaWxzLmhpdEJyZWFrcG9pbnRJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBoaXRCcmVha3BvaW50SWRzID0gdGhyZWFkLnN0b3BwZWREZXRhaWxzLmhpdEJyZWFrcG9pbnRJZHM7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5mbGF0RWxlbWVudHM7XG5cdFx0XHRcdGNvbnN0IGhpdEVsZW1lbnQgPSBlbGVtZW50cy5maW5kKGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlkID0gZS5nZXRJZEZyb21BZGFwdGVyKHRocmVhZC5zZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0XHRcdHJldHVybiB0eXBlb2YgaWQgPT09ICdudW1iZXInICYmIGhpdEJyZWFrcG9pbnRJZHMuaW5kZXhPZihpZCkgIT09IC0xO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGhpdEVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW2hpdEVsZW1lbnRdKTtcblx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtoaXRFbGVtZW50XSk7XG5cdFx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuYXV0b0ZvY3VzZWRFbGVtZW50ID0gaGl0RWxlbWVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFmb3VuZCkge1xuXHRcdFx0XHQvLyBEZXNlbGVjdCBicmVha3BvaW50IGluIGJyZWFrcG9pbnQgdmlldyB3aGVuIG5vIGxvbmdlciBzdG9wcGVkIG9uIGl0ICMxMjU1Mjhcblx0XHRcdFx0Y29uc3QgZm9jdXMgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRpZiAodGhpcy5hdXRvRm9jdXNlZEVsZW1lbnQgJiYgZXF1YWxzKGZvY3VzLCBzZWxlY3Rpb24pICYmIHNlbGVjdGlvbi5pbmNsdWRlcyh0aGlzLmF1dG9Gb2N1c2VkRWxlbWVudCkpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuYXV0b0ZvY3VzZWRFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVCcmVha3BvaW50c0hpbnQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5uZWVkc1N0YXRlQ2hhbmdlID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldFRyZWVJbnB1dCgpOiB2b2lkIHtcblx0XHRjb25zdCB0cmVlSW5wdXQgPSB0aGlzLmdldFRyZWVFbGVtZW50cygpO1xuXHRcdHRoaXMudHJlZS5zZXRDaGlsZHJlbihudWxsLCB0cmVlSW5wdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmVlRWxlbWVudHMoKTogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxCcmVha3BvaW50VHJlZUVsZW1lbnQ+W10ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbj8uZ2V0SWQoKTtcblx0XHRjb25zdCBzaG93QXNUcmVlID0gdGhpcy5nZXRQcmVzZW50YXRpb24oKSA9PT0gJ3RyZWUnO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PEJyZWFrcG9pbnRUcmVlRWxlbWVudD5bXSA9IFtdO1xuXG5cdFx0Ly8gRXhjZXB0aW9uIGJyZWFrcG9pbnRzIGF0IHRoZSB0b3AgKHJvb3QgbGV2ZWwpXG5cdFx0Zm9yIChjb25zdCBleEJwIG9mIG1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IGVsZW1lbnQ6IGV4QnAsIGluY29tcHJlc3NpYmxlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIEZ1bmN0aW9uIGJyZWFrcG9pbnRzIChyb290IGxldmVsKVxuXHRcdGZvciAoY29uc3QgZnVuY0JwIG9mIG1vZGVsLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKSkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBlbGVtZW50OiBmdW5jQnAsIGluY29tcHJlc3NpYmxlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIERhdGEgYnJlYWtwb2ludHMgKHJvb3QgbGV2ZWwpXG5cdFx0Zm9yIChjb25zdCBkYXRhQnAgb2YgbW9kZWwuZ2V0RGF0YUJyZWFrcG9pbnRzKCkpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgZWxlbWVudDogZGF0YUJwLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHQvLyBTb3VyY2UgYnJlYWtwb2ludHMgLSBncm91cCBieSBmaWxlIGlmIHNob3dBc1RyZWUgaXMgZW5hYmxlZFxuXHRcdGNvbnN0IHNvdXJjZUJyZWFrcG9pbnRzID0gbW9kZWwuZ2V0QnJlYWtwb2ludHMoKTtcblx0XHRpZiAoc2hvd0FzVHJlZSAmJiBzb3VyY2VCcmVha3BvaW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBHcm91cCBicmVha3BvaW50cyBieSBVUklcblx0XHRcdGNvbnN0IGJyZWFrcG9pbnRzQnlVcmkgPSBuZXcgTWFwPHN0cmluZywgSUJyZWFrcG9pbnRbXT4oKTtcblx0XHRcdGZvciAoY29uc3QgYnAgb2Ygc291cmNlQnJlYWtwb2ludHMpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gYnAudXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmICghYnJlYWtwb2ludHNCeVVyaS5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdGJyZWFrcG9pbnRzQnlVcmkuc2V0KGtleSwgW10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrcG9pbnRzQnlVcmkuZ2V0KGtleSkhLnB1c2goYnApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDcmVhdGUgZm9sZGVyIGl0ZW1zIGZvciBlYWNoIGZpbGVcblx0XHRcdGZvciAoY29uc3QgW3VyaVN0ciwgYnJlYWtwb2ludHNdIG9mIGJyZWFrcG9pbnRzQnlVcmkpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHVyaVN0cik7XG5cdFx0XHRcdGNvbnN0IGZvbGRlckl0ZW0gPSBuZXcgQnJlYWtwb2ludHNGb2xkZXJJdGVtKHVyaSwgYnJlYWtwb2ludHMpO1xuXG5cdFx0XHRcdC8vIFNvcnQgYnJlYWtwb2ludHMgYnkgbGluZSBudW1iZXJcblx0XHRcdFx0YnJlYWtwb2ludHMuc29ydCgoYSwgYikgPT4gYS5saW5lTnVtYmVyIC0gYi5saW5lTnVtYmVyKTtcblxuXHRcdFx0XHRjb25zdCBjaGlsZHJlbjogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxCcmVha3BvaW50VHJlZUVsZW1lbnQ+W10gPSBicmVha3BvaW50cy5tYXAoYnAgPT4gKHtcblx0XHRcdFx0XHRlbGVtZW50OiBicCxcblx0XHRcdFx0XHRpbmNvbXByZXNzaWJsZTogZmFsc2Vcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRlbGVtZW50OiBmb2xkZXJJdGVtLFxuXHRcdFx0XHRcdGluY29tcHJlc3NpYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRjb2xsYXBzZWQ6IHRoaXMuY29sbGFwc2VkU3RhdGUuaGFzKGZvbGRlckl0ZW0uZ2V0SWQoKSksXG5cdFx0XHRcdFx0Y2hpbGRyZW5cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZsYXQgbW9kZSAtIGp1c3QgYWRkIGFsbCBzb3VyY2UgYnJlYWtwb2ludHNcblx0XHRcdGZvciAoY29uc3QgYnAgb2Ygc291cmNlQnJlYWtwb2ludHMpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBlbGVtZW50OiBicCwgaW5jb21wcmVzc2libGU6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdHJ1Y3Rpb24gYnJlYWtwb2ludHMgKHJvb3QgbGV2ZWwpXG5cdFx0Zm9yIChjb25zdCBpbnN0ckJwIG9mIG1vZGVsLmdldEluc3RydWN0aW9uQnJlYWtwb2ludHMoKSkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBlbGVtZW50OiBpbnN0ckJwLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZmxhdEVsZW1lbnRzKCk6IEJyZWFrcG9pbnRJdGVtW10ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbj8uZ2V0SWQoKTtcblx0XHRjb25zdCBlbGVtZW50cyA9ICg8UmVhZG9ubHlBcnJheTxJRW5hYmxlbWVudD4+bW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKHNlc3Npb25JZCkpLmNvbmNhdChtb2RlbC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCkpLmNvbmNhdChtb2RlbC5nZXREYXRhQnJlYWtwb2ludHMoKSkuY29uY2F0KG1vZGVsLmdldEJyZWFrcG9pbnRzKCkpLmNvbmNhdChtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCkpO1xuXG5cdFx0cmV0dXJuIGVsZW1lbnRzIGFzIEJyZWFrcG9pbnRJdGVtW107XG5cdH1cbn1cblxuY2xhc3MgQnJlYWtwb2ludHNEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEJyZWFrcG9pbnRUcmVlRWxlbWVudD4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgdmlldzogQnJlYWtwb2ludHNWaWV3KSB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0Z2V0SGVpZ2h0KF9lbGVtZW50OiBCcmVha3BvaW50VHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogQnJlYWtwb2ludFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkge1xuXHRcdFx0cmV0dXJuIEJyZWFrcG9pbnRzRm9sZGVyUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCkge1xuXHRcdFx0cmV0dXJuIEJyZWFrcG9pbnRzUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRjb25zdCBpbnB1dEJveEJyZWFrcG9pbnQgPSB0aGlzLnZpZXcuaW5wdXRCb3hEYXRhPy5icmVha3BvaW50O1xuXHRcdFx0aWYgKCFlbGVtZW50Lm5hbWUgfHwgKGlucHV0Qm94QnJlYWtwb2ludCAmJiBpbnB1dEJveEJyZWFrcG9pbnQuZ2V0SWQoKSA9PT0gZWxlbWVudC5nZXRJZCgpKSkge1xuXHRcdFx0XHRyZXR1cm4gRnVuY3Rpb25CcmVha3BvaW50SW5wdXRSZW5kZXJlci5JRDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIEZ1bmN0aW9uQnJlYWtwb2ludHNSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBFeGNlcHRpb25CcmVha3BvaW50KSB7XG5cdFx0XHRjb25zdCBpbnB1dEJveEJyZWFrcG9pbnQgPSB0aGlzLnZpZXcuaW5wdXRCb3hEYXRhPy5icmVha3BvaW50O1xuXHRcdFx0aWYgKGlucHV0Qm94QnJlYWtwb2ludCAmJiBpbnB1dEJveEJyZWFrcG9pbnQuZ2V0SWQoKSA9PT0gZWxlbWVudC5nZXRJZCgpKSB7XG5cdFx0XHRcdHJldHVybiBFeGNlcHRpb25CcmVha3BvaW50SW5wdXRSZW5kZXJlci5JRDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBFeGNlcHRpb25CcmVha3BvaW50c1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50KSB7XG5cdFx0XHRjb25zdCBpbnB1dEJveEJyZWFrcG9pbnQgPSB0aGlzLnZpZXcuaW5wdXRCb3hEYXRhPy5icmVha3BvaW50O1xuXHRcdFx0aWYgKGlucHV0Qm94QnJlYWtwb2ludCAmJiBpbnB1dEJveEJyZWFrcG9pbnQuZ2V0SWQoKSA9PT0gZWxlbWVudC5nZXRJZCgpKSB7XG5cdFx0XHRcdHJldHVybiBEYXRhQnJlYWtwb2ludElucHV0UmVuZGVyZXIuSUQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBEYXRhQnJlYWtwb2ludHNSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdHJldHVybiBJbnN0cnVjdGlvbkJyZWFrcG9pbnRzUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQmFzZUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEge1xuXHRicmVha3BvaW50OiBIVE1MRWxlbWVudDtcblx0bmFtZTogSFRNTEVsZW1lbnQ7XG5cdGNoZWNrYm94OiBDaGVja2JveDtcblx0Y29udGV4dDogQnJlYWtwb2ludEl0ZW07XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHR0ZW1wbGF0ZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRiYWRnZTogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJQmFzZUJyZWFrcG9pbnRXaXRoSWNvblRlbXBsYXRlRGF0YSBleHRlbmRzIElCYXNlQnJlYWtwb2ludFRlbXBsYXRlRGF0YSB7XG5cdGljb246IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRXaXRoSWNvblRlbXBsYXRlRGF0YSB7XG5cdGZpbGVQYXRoOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElFeGNlcHRpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhIGV4dGVuZHMgSUJhc2VCcmVha3BvaW50VGVtcGxhdGVEYXRhIHtcblx0Y29uZGl0aW9uOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElGdW5jdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRXaXRoSWNvblRlbXBsYXRlRGF0YSB7XG5cdGNvbmRpdGlvbjogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJRGF0YUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRXaXRoSWNvblRlbXBsYXRlRGF0YSB7XG5cdGFjY2Vzc1R5cGU6IEhUTUxFbGVtZW50O1xuXHRjb25kaXRpb246IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUluc3RydWN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSBleHRlbmRzIElCYXNlQnJlYWtwb2ludFdpdGhJY29uVGVtcGxhdGVEYXRhIHtcblx0YWRkcmVzczogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEge1xuXHRpbnB1dEJveDogSW5wdXRCb3g7XG5cdGNoZWNrYm94OiBDaGVja2JveDtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdGJyZWFrcG9pbnQ6IElGdW5jdGlvbkJyZWFrcG9pbnQ7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHR5cGU6ICdoaXRDb3VudCcgfCAnY29uZGl0aW9uJyB8ICduYW1lJztcblx0dXBkYXRpbmc/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEge1xuXHRpbnB1dEJveDogSW5wdXRCb3g7XG5cdGNoZWNrYm94OiBDaGVja2JveDtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdGJyZWFrcG9pbnQ6IElEYXRhQnJlYWtwb2ludDtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0dHlwZTogJ2hpdENvdW50JyB8ICdjb25kaXRpb24nIHwgJ25hbWUnO1xuXHR1cGRhdGluZz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJRXhjZXB0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhIHtcblx0aW5wdXRCb3g6IElucHV0Qm94O1xuXHRjaGVja2JveDogQ2hlY2tib3g7XG5cdGN1cnJlbnRCcmVha3BvaW50PzogSUV4Y2VwdGlvbkJyZWFrcG9pbnQ7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJQnJlYWtwb2ludHNGb2xkZXJUZW1wbGF0ZURhdGEge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRjaGVja2JveDogVHJpU3RhdGVDaGVja2JveDtcblx0bmFtZTogSFRNTEVsZW1lbnQ7XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRjb250ZXh0OiBCcmVha3BvaW50c0ZvbGRlckl0ZW07XG5cdHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNvbnN0IGJyZWFrcG9pbnRJZFRvQWN0aW9uQmFyRG9tZU5vZGUgPSBuZXcgTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+KCk7XG5cbmNsYXNzIEJyZWFrcG9pbnRzRm9sZGVyUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPEJyZWFrcG9pbnRzRm9sZGVySXRlbSwgdm9pZCwgSUJyZWFrcG9pbnRzRm9sZGVyVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2JyZWFrcG9pbnRGb2xkZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBCcmVha3BvaW50c0ZvbGRlclJlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElCcmVha3BvaW50c0ZvbGRlclRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSUJyZWFrcG9pbnRzRm9sZGVyVGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cblx0XHRkYXRhLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYnJlYWtwb2ludCcsICdicmVha3BvaW50LWZvbGRlcicpO1xuXG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2JyZWFrcG9pbnQnLCAnYnJlYWtwb2ludC1mb2xkZXInKTtcblx0XHR9KSk7XG5cblx0XHRkYXRhLmNoZWNrYm94ID0gbmV3IFRyaVN0YXRlQ2hlY2tib3goJycsIGZhbHNlLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpO1xuXHRcdGRhdGEuY2hlY2tib3guZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5jaGVja2JveCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IGNoZWNrZWQgPSBkYXRhLmNoZWNrYm94LmNoZWNrZWQ7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gY2hlY2tlZCA9PT0gJ21peGVkJyA/IHRydWUgOiBjaGVja2VkO1xuXHRcdFx0Zm9yIChjb25zdCBicCBvZiBkYXRhLmNvbnRleHQuYnJlYWtwb2ludHMpIHtcblx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlZCwgYnApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoZGF0YS5jb250YWluZXIsIGRhdGEuY2hlY2tib3guZG9tTm9kZSk7XG5cdFx0ZGF0YS5uYW1lID0gZG9tLmFwcGVuZChkYXRhLmNvbnRhaW5lciwgJCgnc3Bhbi5uYW1lJykpO1xuXHRcdGRvbS5hcHBlbmQoZGF0YS5jb250YWluZXIsICQoJ3NwYW4uZmlsZS1wYXRoJykpO1xuXG5cdFx0ZGF0YS5hY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGRhdGEuY29udGFpbmVyKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuYWN0aW9uQmFyKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8QnJlYWtwb2ludHNGb2xkZXJJdGVtLCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElCcmVha3BvaW50c0ZvbGRlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGZvbGRlckl0ZW0gPSBub2RlLmVsZW1lbnQ7XG5cdFx0ZGF0YS5jb250ZXh0ID0gZm9sZGVySXRlbTtcblxuXHRcdGRhdGEubmFtZS50ZXh0Q29udGVudCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwoZm9sZGVySXRlbS51cmkpO1xuXHRcdGRhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIXRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSk7XG5cblx0XHRjb25zdCBmdWxsUGF0aCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGZvbGRlckl0ZW0udXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5jb250YWluZXIsIGZ1bGxQYXRoKSk7XG5cblx0XHQvLyBTZXQgY2hlY2tib3ggc3RhdGVcblx0XHRpZiAoZm9sZGVySXRlbS5pbmRldGVybWluYXRlKSB7XG5cdFx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSAnbWl4ZWQnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBmb2xkZXJJdGVtLmVuYWJsZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHJlbW92ZSBhY3Rpb25cblx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGNvbnN0IHJlbW92ZUFjdGlvbiA9IGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J2RlYnVnLnJlbW92ZUJyZWFrcG9pbnRzSW5GaWxlJyxcblx0XHRcdGxvY2FsaXplKCdyZW1vdmVCcmVha3BvaW50c0luRmlsZScsIFwiUmVtb3ZlIEJyZWFrcG9pbnRzIGluIEZpbGVcIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0XHR0cnVlLFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGJwIG9mIGZvbGRlckl0ZW0uYnJlYWtwb2ludHMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicC5nZXRJZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLnB1c2gocmVtb3ZlQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxCcmVha3BvaW50c0ZvbGRlckl0ZW0+LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElCcmVha3BvaW50c0ZvbGRlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gbm9kZS5lbGVtZW50LmVsZW1lbnRzO1xuXHRcdGNvbnN0IGZvbGRlckl0ZW0gPSBlbGVtZW50c1tlbGVtZW50cy5sZW5ndGggLSAxXTtcblx0XHRkYXRhLmNvbnRleHQgPSBmb2xkZXJJdGVtO1xuXG5cdFx0Ly8gRm9yIGNvbXByZXNzZWQgbm9kZXMsIHNob3cgdGhlIGNvbWJpbmVkIHBhdGhcblx0XHRjb25zdCBuYW1lcyA9IGVsZW1lbnRzLm1hcChlID0+IHJlc291cmNlcy5iYXNlbmFtZU9yQXV0aG9yaXR5KGUudXJpKSk7XG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gbmFtZXMuam9pbignLycpO1xuXG5cdFx0Y29uc3QgZnVsbFBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmb2xkZXJJdGVtLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuY29udGFpbmVyLCBmdWxsUGF0aCkpO1xuXG5cdFx0Ly8gU2V0IGNoZWNrYm94IHN0YXRlXG5cdFx0aWYgKGZvbGRlckl0ZW0uaW5kZXRlcm1pbmF0ZSkge1xuXHRcdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gJ21peGVkJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gZm9sZGVySXRlbS5lbmFibGVkO1xuXHRcdH1cblxuXHRcdC8vIEFkZCByZW1vdmUgYWN0aW9uXG5cdFx0ZGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRjb25zdCByZW1vdmVBY3Rpb24gPSBkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdCdkZWJ1Zy5yZW1vdmVCcmVha3BvaW50c0luRmlsZScsXG5cdFx0XHRsb2NhbGl6ZSgncmVtb3ZlQnJlYWtwb2ludHNJbkZpbGUnLCBcIlJlbW92ZSBCcmVha3BvaW50cyBpbiBGaWxlXCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBicCBvZiBmb2xkZXJJdGVtLmJyZWFrcG9pbnRzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnAuZ2V0SWQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKHJlbW92ZUFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8QnJlYWtwb2ludHNGb2xkZXJJdGVtLCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQnJlYWtwb2ludHNGb2xkZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPEJyZWFrcG9pbnRzRm9sZGVySXRlbT4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElCcmVha3BvaW50c0ZvbGRlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElCcmVha3BvaW50c0ZvbGRlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBCcmVha3BvaW50c1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJQnJlYWtwb2ludCwgdm9pZCwgSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1lbnU6IElNZW51LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXM6IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPixcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRJdGVtVHlwZTogSUNvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPixcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZVxuXHQpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnYnJlYWtwb2ludHMnO1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBCcmVha3BvaW50c1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElCcmVha3BvaW50VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMpO1xuXG5cdFx0ZGF0YS5icmVha3BvaW50ID0gY29udGFpbmVyO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdicmVha3BvaW50Jyk7XG5cblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYnJlYWtwb2ludCcpO1xuXHRcdH0pKTtcblxuXHRcdGRhdGEuaWNvbiA9ICQoJy5pY29uJyk7XG5cdFx0ZGF0YS5jaGVja2JveCA9IGNyZWF0ZUNoZWNrYm94KGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcyk7XG5cblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWRhdGEuY29udGV4dC5lbmFibGVkLCBkYXRhLmNvbnRleHQpO1xuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmljb24pO1xuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0ZGF0YS5uYW1lID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJ3NwYW4ubmFtZScpKTtcblxuXHRcdGRhdGEuZmlsZVBhdGggPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnc3Bhbi5maWxlLXBhdGgnKSk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGRhdGEuYnJlYWtwb2ludCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmFjdGlvbkJhcik7XG5cdFx0Y29uc3QgYmFkZ2VDb250YWluZXIgPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnLmJhZGdlLWNvbnRhaW5lcicpKTtcblx0XHRkYXRhLmJhZGdlID0gZG9tLmFwcGVuZChiYWRnZUNvbnRhaW5lciwgJCgnc3Bhbi5saW5lLW51bWJlci5tb25hY28tY291bnQtYmFkZ2UnKSk7XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElCcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBicmVha3BvaW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdGRhdGEuY29udGV4dCA9IGJyZWFrcG9pbnQ7XG5cblx0XHRpZiAobm9kZS5kZXB0aCA+IDEpIHtcblx0XHRcdHRoaXMucmVuZGVyQnJlYWtwb2ludExpbmVMYWJlbChicmVha3BvaW50LCBkYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJCcmVha3BvaW50RmlsZUxhYmVsKGJyZWFrcG9pbnQsIGRhdGEpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyQnJlYWtwb2ludENvbW1vbihicmVha3BvaW50LCBkYXRhKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGJyZWFrcG9pbnQgPSBub2RlLmVsZW1lbnQuZWxlbWVudHNbbm9kZS5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdGRhdGEuY29udGV4dCA9IGJyZWFrcG9pbnQ7XG5cdFx0dGhpcy5yZW5kZXJCcmVha3BvaW50RmlsZUxhYmVsKGJyZWFrcG9pbnQsIGRhdGEpO1xuXHRcdHRoaXMucmVuZGVyQnJlYWtwb2ludENvbW1vbihicmVha3BvaW50LCBkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQnJlYWtwb2ludENvbW1vbihicmVha3BvaW50OiBJQnJlYWtwb2ludCwgZGF0YTogSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmJyZWFrcG9pbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKTtcblx0XHRsZXQgYmFkZ2VDb250ZW50ID0gYnJlYWtwb2ludC5saW5lTnVtYmVyLnRvU3RyaW5nKCk7XG5cdFx0aWYgKGJyZWFrcG9pbnQuY29sdW1uKSB7XG5cdFx0XHRiYWRnZUNvbnRlbnQgKz0gYDoke2JyZWFrcG9pbnQuY29sdW1ufWA7XG5cdFx0fVxuXHRcdGlmIChicmVha3BvaW50Lm1vZGVMYWJlbCkge1xuXHRcdFx0YmFkZ2VDb250ZW50ID0gYCR7YnJlYWtwb2ludC5tb2RlTGFiZWx9OiAke2JhZGdlQ29udGVudH1gO1xuXHRcdH1cblx0XHRkYXRhLmJhZGdlLnRleHRDb250ZW50ID0gYmFkZ2VDb250ZW50O1xuXHRcdGRhdGEuY2hlY2tib3guY2hlY2tlZCA9IGJyZWFrcG9pbnQuZW5hYmxlZDtcblxuXHRcdGNvbnN0IHsgbWVzc2FnZSwgaWNvbiB9ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCksIGJyZWFrcG9pbnQsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpKTtcblx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5icmVha3BvaW50LCBicmVha3BvaW50Lm1lc3NhZ2UgfHwgbWVzc2FnZSB8fCAnJykpO1xuXG5cdFx0Y29uc3QgZGVidWdBY3RpdmUgPSB0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSA9PT0gU3RhdGUuUnVubmluZyB8fCB0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSA9PT0gU3RhdGUuU3RvcHBlZDtcblx0XHRpZiAoZGVidWdBY3RpdmUgJiYgIWJyZWFrcG9pbnQudmVyaWZpZWQpIHtcblx0XHRcdGRhdGEuYnJlYWtwb2ludC5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHR0aGlzLmJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbi5zZXQoIXNlc3Npb24gfHwgISFzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMpO1xuXHRcdHRoaXMuYnJlYWtwb2ludEl0ZW1UeXBlLnNldCgnYnJlYWtwb2ludCcpO1xuXHRcdHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMuc2V0KHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludE1vZGVzKCdzb3VyY2UnKS5sZW5ndGggPiAxKTtcblx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnModGhpcy5tZW51LmdldEFjdGlvbnMoeyBhcmc6IGJyZWFrcG9pbnQsIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCAnaW5saW5lJyk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdGJyZWFrcG9pbnRJZFRvQWN0aW9uQmFyRG9tZU5vZGUuc2V0KGJyZWFrcG9pbnQuZ2V0SWQoKSwgZGF0YS5hY3Rpb25CYXIuZG9tTm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckJyZWFrcG9pbnRGaWxlTGFiZWwoYnJlYWtwb2ludDogSUJyZWFrcG9pbnQsIGRhdGE6IElCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gcmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkoYnJlYWtwb2ludC51cmkpO1xuXHRcdGRhdGEuZmlsZVBhdGgudGV4dENvbnRlbnQgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZXMuZGlybmFtZShicmVha3BvaW50LnVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckJyZWFrcG9pbnRMaW5lTGFiZWwoYnJlYWtwb2ludDogSUJyZWFrcG9pbnQsIGRhdGE6IElCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIik7XG5cdFx0ZGF0YS5maWxlUGF0aC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0dGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGJyZWFrcG9pbnQudXJpKS50aGVuKHJlZmVyZW5jZSA9PiB7XG5cdFx0XHRpZiAoZGF0YS5jb250ZXh0ICE9PSBicmVha3BvaW50KSB7XG5cdFx0XHRcdHJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChyZWZlcmVuY2UpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdGlmIChtb2RlbCAmJiBicmVha3BvaW50LmxpbmVOdW1iZXIgPD0gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChicmVha3BvaW50LmxpbmVOdW1iZXIpLnRyaW0oKTtcblx0XHRcdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gbGluZUNvbnRlbnQgfHwgbG9jYWxpemUoJ2VtcHR5TGluZScsIFwiKGVtcHR5IGxpbmUpXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xpbmVOb3RGb3VuZCcsIFwiKGxpbmUgbm90IGZvdW5kKVwiKTtcblx0XHRcdH1cblx0XHR9KS5jYXRjaCgoKSA9PiB7XG5cdFx0XHRpZiAoZGF0YS5jb250ZXh0ID09PSBicmVha3BvaW50KSB7XG5cdFx0XHRcdGRhdGEubmFtZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjYW5ub3RMb2FkTGluZScsIFwiKGNhbm5vdCBsb2FkIGxpbmUpXCIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElCcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElCcmVha3BvaW50Piwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRXhjZXB0aW9uQnJlYWtwb2ludHNSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SUV4Y2VwdGlvbkJyZWFrcG9pbnQsIHZvaWQsIElFeGNlcHRpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBtZW51OiBJTWVudSxcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRIYXNNdWx0aXBsZU1vZGVzOiBJQ29udGV4dEtleTxib29sZWFuPixcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSBicmVha3BvaW50SXRlbVR5cGU6IElDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleGNlcHRpb25icmVha3BvaW50cyc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIEV4Y2VwdGlvbkJyZWFrcG9pbnRzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRhdGE6IElFeGNlcHRpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0ZGF0YS5icmVha3BvaW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5icmVha3BvaW50JykpO1xuXG5cdFx0ZGF0YS5jaGVja2JveCA9IGNyZWF0ZUNoZWNrYm94KGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcyk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFkYXRhLmNvbnRleHQuZW5hYmxlZCwgZGF0YS5jb250ZXh0KTtcblx0XHR9KSk7XG5cblx0XHRkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgZGF0YS5jaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdGRhdGEubmFtZSA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLm5hbWUnKSk7XG5cdFx0ZGF0YS5jb25kaXRpb24gPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnc3Bhbi5jb25kaXRpb24nKSk7XG5cdFx0ZGF0YS5icmVha3BvaW50LmNsYXNzTGlzdC5hZGQoJ2V4Y2VwdGlvbicpO1xuXG5cdFx0ZGF0YS5hY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGRhdGEuYnJlYWtwb2ludCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmFjdGlvbkJhcik7XG5cdFx0Y29uc3QgYmFkZ2VDb250YWluZXIgPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnLmJhZGdlLWNvbnRhaW5lcicpKTtcblx0XHRkYXRhLmJhZGdlID0gZG9tLmFwcGVuZChiYWRnZUNvbnRhaW5lciwgJCgnc3Bhbi5saW5lLW51bWJlci5tb25hY28tY291bnQtYmFkZ2UnKSk7XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElFeGNlcHRpb25CcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBleGNlcHRpb25CcmVha3BvaW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdHRoaXMucmVuZGVyRXhjZXB0aW9uQnJlYWtwb2ludChleGNlcHRpb25CcmVha3BvaW50LCBkYXRhKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJRXhjZXB0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4Y2VwdGlvbkJyZWFrcG9pbnQgPSBub2RlLmVsZW1lbnQuZWxlbWVudHNbbm9kZS5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdHRoaXMucmVuZGVyRXhjZXB0aW9uQnJlYWtwb2ludChleGNlcHRpb25CcmVha3BvaW50LCBkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRXhjZXB0aW9uQnJlYWtwb2ludChleGNlcHRpb25CcmVha3BvaW50OiBJRXhjZXB0aW9uQnJlYWtwb2ludCwgZGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmNvbnRleHQgPSBleGNlcHRpb25CcmVha3BvaW50O1xuXHRcdGRhdGEubmFtZS50ZXh0Q29udGVudCA9IGV4Y2VwdGlvbkJyZWFrcG9pbnQubGFiZWwgfHwgYCR7ZXhjZXB0aW9uQnJlYWtwb2ludC5maWx0ZXJ9IGV4Y2VwdGlvbnNgO1xuXHRcdGNvbnN0IGV4Y2VwdGlvbkJyZWFrcG9pbnR0aXRsZSA9IGV4Y2VwdGlvbkJyZWFrcG9pbnQudmVyaWZpZWQgPyAoZXhjZXB0aW9uQnJlYWtwb2ludC5kZXNjcmlwdGlvbiB8fCBkYXRhLm5hbWUudGV4dENvbnRlbnQpIDogZXhjZXB0aW9uQnJlYWtwb2ludC5tZXNzYWdlIHx8IGxvY2FsaXplKCd1bnZlcmlmaWVkRXhjZXB0aW9uQnJlYWtwb2ludCcsIFwiVW52ZXJpZmllZCBFeGNlcHRpb24gQnJlYWtwb2ludFwiKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuYnJlYWtwb2ludCwgZXhjZXB0aW9uQnJlYWtwb2ludHRpdGxlKSk7XG5cdFx0ZGF0YS5icmVha3BvaW50LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWV4Y2VwdGlvbkJyZWFrcG9pbnQudmVyaWZpZWQpO1xuXHRcdGRhdGEuY2hlY2tib3guY2hlY2tlZCA9IGV4Y2VwdGlvbkJyZWFrcG9pbnQuZW5hYmxlZDtcblx0XHRkYXRhLmNvbmRpdGlvbi50ZXh0Q29udGVudCA9IGV4Y2VwdGlvbkJyZWFrcG9pbnQuY29uZGl0aW9uIHx8ICcnO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5jb25kaXRpb24sIGxvY2FsaXplKCdleHByZXNzaW9uQ29uZGl0aW9uJywgXCJFeHByZXNzaW9uIGNvbmRpdGlvbjogezB9XCIsIGV4Y2VwdGlvbkJyZWFrcG9pbnQuY29uZGl0aW9uKSkpO1xuXG5cdFx0aWYgKGV4Y2VwdGlvbkJyZWFrcG9pbnQubW9kZUxhYmVsKSB7XG5cdFx0XHRkYXRhLmJhZGdlLnRleHRDb250ZW50ID0gZXhjZXB0aW9uQnJlYWtwb2ludC5tb2RlTGFiZWw7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0dGhpcy5icmVha3BvaW50U3VwcG9ydHNDb25kaXRpb24uc2V0KChleGNlcHRpb25CcmVha3BvaW50IGFzIEV4Y2VwdGlvbkJyZWFrcG9pbnQpLnN1cHBvcnRzQ29uZGl0aW9uKTtcblx0XHR0aGlzLmJyZWFrcG9pbnRJdGVtVHlwZS5zZXQoJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKTtcblx0XHR0aGlzLmJyZWFrcG9pbnRIYXNNdWx0aXBsZU1vZGVzLnNldCh0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRNb2RlcygnZXhjZXB0aW9uJykubGVuZ3RoID4gMSk7XG5cdFx0Y29uc3QgeyBwcmltYXJ5IH0gPSBnZXRBY3Rpb25CYXJBY3Rpb25zKHRoaXMubWVudS5nZXRBY3Rpb25zKHsgYXJnOiBleGNlcHRpb25CcmVha3BvaW50LCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSwgJ2lubGluZScpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRicmVha3BvaW50SWRUb0FjdGlvbkJhckRvbWVOb2RlLnNldChleGNlcHRpb25CcmVha3BvaW50LmdldElkKCksIGRhdGEuYWN0aW9uQmFyLmRvbU5vZGUpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElFeGNlcHRpb25CcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUV4Y2VwdGlvbkJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElFeGNlcHRpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEZ1bmN0aW9uQnJlYWtwb2ludHNSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8RnVuY3Rpb25CcmVha3BvaW50LCB2b2lkLCBJRnVuY3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBtZW51OiBJTWVudSxcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSBicmVha3BvaW50SXRlbVR5cGU6IElDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD4sXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2Z1bmN0aW9uYnJlYWtwb2ludHMnO1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBGdW5jdGlvbkJyZWFrcG9pbnRzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMpO1xuXHRcdGRhdGEuYnJlYWtwb2ludCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYnJlYWtwb2ludCcpKTtcblxuXHRcdGRhdGEuaWNvbiA9ICQoJy5pY29uJyk7XG5cdFx0ZGF0YS5jaGVja2JveCA9IGNyZWF0ZUNoZWNrYm94KGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcyk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFkYXRhLmNvbnRleHQuZW5hYmxlZCwgZGF0YS5jb250ZXh0KTtcblx0XHR9KSk7XG5cblx0XHRkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgZGF0YS5pY29uKTtcblx0XHRkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgZGF0YS5jaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdGRhdGEubmFtZSA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLm5hbWUnKSk7XG5cdFx0ZGF0YS5jb25kaXRpb24gPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnc3Bhbi5jb25kaXRpb24nKSk7XG5cblx0XHRkYXRhLmFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZGF0YS5icmVha3BvaW50KTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuYWN0aW9uQmFyKTtcblx0XHRjb25zdCBiYWRnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCcuYmFkZ2UtY29udGFpbmVyJykpO1xuXHRcdGRhdGEuYmFkZ2UgPSBkb20uYXBwZW5kKGJhZGdlQ29udGFpbmVyLCAkKCdzcGFuLmxpbmUtbnVtYmVyLm1vbmFjby1jb3VudC1iYWRnZScpKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8RnVuY3Rpb25CcmVha3BvaW50LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElGdW5jdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckZ1bmN0aW9uQnJlYWtwb2ludChub2RlLmVsZW1lbnQsIGRhdGEpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPEZ1bmN0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyRnVuY3Rpb25CcmVha3BvaW50KG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV0sIGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGdW5jdGlvbkJyZWFrcG9pbnQoZnVuY3Rpb25CcmVha3BvaW50OiBGdW5jdGlvbkJyZWFrcG9pbnQsIGRhdGE6IElGdW5jdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmNvbnRleHQgPSBmdW5jdGlvbkJyZWFrcG9pbnQ7XG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gZnVuY3Rpb25CcmVha3BvaW50Lm5hbWU7XG5cdFx0Y29uc3QgeyBpY29uLCBtZXNzYWdlIH0gPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24odGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgZnVuY3Rpb25CcmVha3BvaW50LCB0aGlzLmxhYmVsU2VydmljZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKSk7XG5cdFx0ZGF0YS5pY29uLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuaWNvbiwgbWVzc2FnZSA/IG1lc3NhZ2UgOiAnJykpO1xuXHRcdGRhdGEuY2hlY2tib3guY2hlY2tlZCA9IGZ1bmN0aW9uQnJlYWtwb2ludC5lbmFibGVkO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5icmVha3BvaW50LCBtZXNzYWdlID8gbWVzc2FnZSA6ICcnKSk7XG5cdFx0aWYgKGZ1bmN0aW9uQnJlYWtwb2ludC5jb25kaXRpb24gJiYgZnVuY3Rpb25CcmVha3BvaW50LmhpdENvbmRpdGlvbikge1xuXHRcdFx0ZGF0YS5jb25kaXRpb24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZXhwcmVzc2lvbkFuZEhpdENvdW50JywgXCJDb25kaXRpb246IHswfSB8IEhpdCBDb3VudDogezF9XCIsIGZ1bmN0aW9uQnJlYWtwb2ludC5jb25kaXRpb24sIGZ1bmN0aW9uQnJlYWtwb2ludC5oaXRDb25kaXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmNvbmRpdGlvbi50ZXh0Q29udGVudCA9IGZ1bmN0aW9uQnJlYWtwb2ludC5jb25kaXRpb24gfHwgZnVuY3Rpb25CcmVha3BvaW50LmhpdENvbmRpdGlvbiB8fCAnJztcblx0XHR9XG5cblx0XHRpZiAoZnVuY3Rpb25CcmVha3BvaW50Lm1vZGVMYWJlbCkge1xuXHRcdFx0ZGF0YS5iYWRnZS50ZXh0Q29udGVudCA9IGZ1bmN0aW9uQnJlYWtwb2ludC5tb2RlTGFiZWw7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBmdW5jdGlvbiBicmVha3BvaW50cyBhcyBkaXNhYmxlZCBpZiBkZWFjdGl2YXRlZCBvciBpZiBkZWJ1ZyB0eXBlIGRvZXMgbm90IHN1cHBvcnQgdGhlbSAjOTA5OVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRkYXRhLmJyZWFrcG9pbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAoc2Vzc2lvbiAmJiAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzKSB8fCAhdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKTtcblx0XHRpZiAoc2Vzc2lvbiAmJiAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzKSB7XG5cdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuYnJlYWtwb2ludCwgbG9jYWxpemUoJ2Z1bmN0aW9uQnJlYWtwb2ludHNOb3RTdXBwb3J0ZWQnLCBcIkZ1bmN0aW9uIGJyZWFrcG9pbnRzIGFyZSBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgZGVidWcgdHlwZVwiKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uLnNldCghc2Vzc2lvbiB8fCAhIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyk7XG5cdFx0dGhpcy5icmVha3BvaW50SXRlbVR5cGUuc2V0KCdmdW5jdGlvbkJyZWFrcG9pbnQnKTtcblx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnModGhpcy5tZW51LmdldEFjdGlvbnMoeyBhcmc6IGZ1bmN0aW9uQnJlYWtwb2ludCwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSksICdpbmxpbmUnKTtcblx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLnB1c2gocHJpbWFyeSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0YnJlYWtwb2ludElkVG9BY3Rpb25CYXJEb21lTm9kZS5zZXQoZnVuY3Rpb25CcmVha3BvaW50LmdldElkKCksIGRhdGEuYWN0aW9uQmFyLmRvbU5vZGUpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPEZ1bmN0aW9uQnJlYWtwb2ludCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8RnVuY3Rpb25CcmVha3BvaW50Piwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElGdW5jdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRGF0YUJyZWFrcG9pbnRzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPERhdGFCcmVha3BvaW50LCB2b2lkLCBJRGF0YUJyZWFrcG9pbnRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1lbnU6IElNZW51LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXM6IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgYnJlYWtwb2ludFN1cHBvcnRzQ29uZGl0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPixcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRJdGVtVHlwZTogSUNvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIGJyZWFrcG9pbnRJc0RhdGFCeXRlczogSUNvbnRleHRLZXk8Ym9vbGVhbiB8IHVuZGVmaW5lZD4sXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2RhdGFicmVha3BvaW50cyc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIERhdGFCcmVha3BvaW50c1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEYXRhQnJlYWtwb2ludFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSURhdGFCcmVha3BvaW50VGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLmJyZWFrcG9pbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJyZWFrcG9pbnQnKSk7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMpO1xuXG5cdFx0ZGF0YS5pY29uID0gJCgnLmljb24nKTtcblx0XHRkYXRhLmNoZWNrYm94ID0gY3JlYXRlQ2hlY2tib3goZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWRhdGEuY29udGV4dC5lbmFibGVkLCBkYXRhLmNvbnRleHQpO1xuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmljb24pO1xuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0ZGF0YS5uYW1lID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJ3NwYW4ubmFtZScpKTtcblx0XHRkYXRhLmFjY2Vzc1R5cGUgPSBkb20uYXBwZW5kKGRhdGEuYnJlYWtwb2ludCwgJCgnc3Bhbi5hY2Nlc3MtdHlwZScpKTtcblx0XHRkYXRhLmNvbmRpdGlvbiA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLmNvbmRpdGlvbicpKTtcblxuXHRcdGRhdGEuYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihkYXRhLmJyZWFrcG9pbnQpO1xuXHRcdGRhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZGF0YS5hY3Rpb25CYXIpO1xuXHRcdGNvbnN0IGJhZGdlQ29udGFpbmVyID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJy5iYWRnZS1jb250YWluZXInKSk7XG5cdFx0ZGF0YS5iYWRnZSA9IGRvbS5hcHBlbmQoYmFkZ2VDb250YWluZXIsICQoJ3NwYW4ubGluZS1udW1iZXIubW9uYWNvLWNvdW50LWJhZGdlJykpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxEYXRhQnJlYWtwb2ludCwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJRGF0YUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckRhdGFCcmVha3BvaW50KG5vZGUuZWxlbWVudCwgZGF0YSk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8RGF0YUJyZWFrcG9pbnQ+LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElEYXRhQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyRGF0YUJyZWFrcG9pbnQobm9kZS5lbGVtZW50LmVsZW1lbnRzW25vZGUuZWxlbWVudC5lbGVtZW50cy5sZW5ndGggLSAxXSwgZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRhdGFCcmVha3BvaW50KGRhdGFCcmVha3BvaW50OiBEYXRhQnJlYWtwb2ludCwgZGF0YTogSURhdGFCcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5jb250ZXh0ID0gZGF0YUJyZWFrcG9pbnQ7XG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gZGF0YUJyZWFrcG9pbnQuZGVzY3JpcHRpb247XG5cdFx0Y29uc3QgeyBpY29uLCBtZXNzYWdlIH0gPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24odGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgZGF0YUJyZWFrcG9pbnQsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpKTtcblx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5pY29uLCBtZXNzYWdlID8gbWVzc2FnZSA6ICcnKSk7XG5cdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gZGF0YUJyZWFrcG9pbnQuZW5hYmxlZDtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuYnJlYWtwb2ludCwgbWVzc2FnZSA/IG1lc3NhZ2UgOiAnJykpO1xuXG5cdFx0aWYgKGRhdGFCcmVha3BvaW50Lm1vZGVMYWJlbCkge1xuXHRcdFx0ZGF0YS5iYWRnZS50ZXh0Q29udGVudCA9IGRhdGFCcmVha3BvaW50Lm1vZGVMYWJlbDtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBNYXJrIGRhdGEgYnJlYWtwb2ludHMgYXMgZGlzYWJsZWQgaWYgZGVhY3RpdmF0ZWQgb3IgaWYgZGVidWcgdHlwZSBkb2VzIG5vdCBzdXBwb3J0IHRoZW1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0ZGF0YS5icmVha3BvaW50LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgKHNlc3Npb24gJiYgIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzKSB8fCAhdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKTtcblx0XHRpZiAoc2Vzc2lvbiAmJiAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEYXRhQnJlYWtwb2ludHMpIHtcblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5icmVha3BvaW50LCBsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRzTm90U3VwcG9ydGVkJywgXCJEYXRhIGJyZWFrcG9pbnRzIGFyZSBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgZGVidWcgdHlwZVwiKSkpO1xuXHRcdH1cblx0XHRpZiAoZGF0YUJyZWFrcG9pbnQuYWNjZXNzVHlwZSkge1xuXHRcdFx0Y29uc3QgYWNjZXNzVHlwZSA9IGRhdGFCcmVha3BvaW50LmFjY2Vzc1R5cGUgPT09ICdyZWFkJyA/IGxvY2FsaXplKCdyZWFkJywgXCJSZWFkXCIpIDogZGF0YUJyZWFrcG9pbnQuYWNjZXNzVHlwZSA9PT0gJ3dyaXRlJyA/IGxvY2FsaXplKCd3cml0ZScsIFwiV3JpdGVcIikgOiBsb2NhbGl6ZSgnYWNjZXNzJywgXCJBY2Nlc3NcIik7XG5cdFx0XHRkYXRhLmFjY2Vzc1R5cGUudGV4dENvbnRlbnQgPSBhY2Nlc3NUeXBlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmFjY2Vzc1R5cGUudGV4dENvbnRlbnQgPSAnJztcblx0XHR9XG5cdFx0aWYgKGRhdGFCcmVha3BvaW50LmNvbmRpdGlvbiAmJiBkYXRhQnJlYWtwb2ludC5oaXRDb25kaXRpb24pIHtcblx0XHRcdGRhdGEuY29uZGl0aW9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2V4cHJlc3Npb25BbmRIaXRDb3VudCcsIFwiQ29uZGl0aW9uOiB7MH0gfCBIaXQgQ291bnQ6IHsxfVwiLCBkYXRhQnJlYWtwb2ludC5jb25kaXRpb24sIGRhdGFCcmVha3BvaW50LmhpdENvbmRpdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuY29uZGl0aW9uLnRleHRDb250ZW50ID0gZGF0YUJyZWFrcG9pbnQuY29uZGl0aW9uIHx8IGRhdGFCcmVha3BvaW50LmhpdENvbmRpdGlvbiB8fCAnJztcblx0XHR9XG5cblx0XHR0aGlzLmJyZWFrcG9pbnRTdXBwb3J0c0NvbmRpdGlvbi5zZXQoIXNlc3Npb24gfHwgISFzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMpO1xuXHRcdHRoaXMuYnJlYWtwb2ludEhhc011bHRpcGxlTW9kZXMuc2V0KHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludE1vZGVzKCdkYXRhJykubGVuZ3RoID4gMSk7XG5cdFx0dGhpcy5icmVha3BvaW50SXRlbVR5cGUuc2V0KCdkYXRhQnJlYWtwb2ludCcpO1xuXHRcdHRoaXMuYnJlYWtwb2ludElzRGF0YUJ5dGVzLnNldChkYXRhQnJlYWtwb2ludC5zcmMudHlwZSA9PT0gRGF0YUJyZWFrcG9pbnRTZXRUeXBlLkFkZHJlc3MpO1xuXHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyh0aGlzLm1lbnUuZ2V0QWN0aW9ucyh7IGFyZzogZGF0YUJyZWFrcG9pbnQsIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCAnaW5saW5lJyk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdGJyZWFrcG9pbnRJZFRvQWN0aW9uQmFyRG9tZU5vZGUuc2V0KGRhdGFCcmVha3BvaW50LmdldElkKCksIGRhdGEuYWN0aW9uQmFyLmRvbU5vZGUpO1xuXHRcdHRoaXMuYnJlYWtwb2ludElzRGF0YUJ5dGVzLnJlc2V0KCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8RGF0YUJyZWFrcG9pbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElEYXRhQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8RGF0YUJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRGF0YUJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQmFzZUJyZWFrcG9pbnRXaXRoSWNvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBJbnN0cnVjdGlvbkJyZWFrcG9pbnRzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElJbnN0cnVjdGlvbkJyZWFrcG9pbnQsIHZvaWQsIElJbnN0cnVjdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnaW5zdHJ1Y3Rpb25CcmVha3BvaW50cyc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIEluc3RydWN0aW9uQnJlYWtwb2ludHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0ZGF0YS5icmVha3BvaW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5icmVha3BvaW50JykpO1xuXG5cdFx0ZGF0YS5pY29uID0gJCgnLmljb24nKTtcblx0XHRkYXRhLmNoZWNrYm94ID0gY3JlYXRlQ2hlY2tib3goZGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzKTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWRhdGEuY29udGV4dC5lbmFibGVkLCBkYXRhLmNvbnRleHQpO1xuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmljb24pO1xuXHRcdGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCBkYXRhLmNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0ZGF0YS5uYW1lID0gZG9tLmFwcGVuZChkYXRhLmJyZWFrcG9pbnQsICQoJ3NwYW4ubmFtZScpKTtcblxuXHRcdGRhdGEuYWRkcmVzcyA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCdzcGFuLmZpbGUtcGF0aCcpKTtcblx0XHRkYXRhLmFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZGF0YS5icmVha3BvaW50KTtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGRhdGEuYWN0aW9uQmFyKTtcblx0XHRjb25zdCBiYWRnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGF0YS5icmVha3BvaW50LCAkKCcuYmFkZ2UtY29udGFpbmVyJykpO1xuXHRcdGRhdGEuYmFkZ2UgPSBkb20uYXBwZW5kKGJhZGdlQ29udGFpbmVyLCAkKCdzcGFuLmxpbmUtbnVtYmVyLm1vbmFjby1jb3VudC1iYWRnZScpKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUluc3RydWN0aW9uQnJlYWtwb2ludCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckluc3RydWN0aW9uQnJlYWtwb2ludChub2RlLmVsZW1lbnQsIGRhdGEpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElJbnN0cnVjdGlvbkJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUluc3RydWN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVySW5zdHJ1Y3Rpb25CcmVha3BvaW50KG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV0sIGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbnN0cnVjdGlvbkJyZWFrcG9pbnQoYnJlYWtwb2ludDogSUluc3RydWN0aW9uQnJlYWtwb2ludCwgZGF0YTogSUluc3RydWN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuY29udGV4dCA9IGJyZWFrcG9pbnQ7XG5cdFx0ZGF0YS5icmVha3BvaW50LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIXRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSk7XG5cblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSAnMHgnICsgYnJlYWtwb2ludC5hZGRyZXNzLnRvU3RyaW5nKDE2KTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEubmFtZSwgbG9jYWxpemUoJ2RlYnVnLmRlY2ltYWwuYWRkcmVzcycsIFwiRGVjaW1hbCBBZGRyZXNzOiB7MH1cIiwgYnJlYWtwb2ludC5hZGRyZXNzLnRvU3RyaW5nKCkpKSk7XG5cdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gYnJlYWtwb2ludC5lbmFibGVkO1xuXG5cdFx0Y29uc3QgeyBtZXNzYWdlLCBpY29uIH0gPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24odGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgYnJlYWtwb2ludCwgdGhpcy5sYWJlbFNlcnZpY2UsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpO1xuXHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmJyZWFrcG9pbnQsIGJyZWFrcG9pbnQubWVzc2FnZSB8fCBtZXNzYWdlIHx8ICcnKSk7XG5cblx0XHRjb25zdCBkZWJ1Z0FjdGl2ZSA9IHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5SdW5uaW5nIHx8IHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkO1xuXHRcdGlmIChkZWJ1Z0FjdGl2ZSAmJiAhYnJlYWtwb2ludC52ZXJpZmllZCkge1xuXHRcdFx0ZGF0YS5icmVha3BvaW50LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKGJyZWFrcG9pbnQubW9kZUxhYmVsKSB7XG5cdFx0XHRkYXRhLmJhZGdlLnRleHRDb250ZW50ID0gYnJlYWtwb2ludC5tb2RlTGFiZWw7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElJbnN0cnVjdGlvbkJyZWFrcG9pbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElJbnN0cnVjdGlvbkJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUluc3RydWN0aW9uQnJlYWtwb2ludFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBGdW5jdGlvbkJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJRnVuY3Rpb25CcmVha3BvaW50LCB2b2lkLCBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHZpZXc6IEJyZWFrcG9pbnRzVmlldyxcblx0XHRwcml2YXRlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRwcml2YXRlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcml2YXRlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHsgfVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdmdW5jdGlvbmJyZWFrcG9pbnRpbnB1dCc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIEZ1bmN0aW9uQnJlYWtwb2ludElucHV0UmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZ1bmN0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0ZW1wbGF0ZTogSUZ1bmN0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBicmVha3BvaW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5icmVha3BvaW50JykpO1xuXHRcdHRlbXBsYXRlLmljb24gPSAkKCcuaWNvbicpO1xuXHRcdHRlbXBsYXRlLmNoZWNrYm94ID0gY3JlYXRlQ2hlY2tib3godG9EaXNwb3NlKTtcblxuXHRcdGRvbS5hcHBlbmQoYnJlYWtwb2ludCwgdGVtcGxhdGUuaWNvbik7XG5cdFx0ZG9tLmFwcGVuZChicmVha3BvaW50LCB0ZW1wbGF0ZS5jaGVja2JveC5kb21Ob2RlKTtcblx0XHR0aGlzLnZpZXcuYnJlYWtwb2ludElucHV0Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0Y29uc3QgaW5wdXRCb3hDb250YWluZXIgPSBkb20uYXBwZW5kKGJyZWFrcG9pbnQsICQoJy5pbnB1dEJveENvbnRhaW5lcicpKTtcblxuXG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBuZXcgSW5wdXRCb3goaW5wdXRCb3hDb250YWluZXIsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7IGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSk7XG5cblx0XHR0b0Rpc3Bvc2UuYWRkKGlucHV0Qm94KTtcblxuXHRcdGNvbnN0IHdyYXBVcCA9IChzdWNjZXNzOiBib29sZWFuKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS51cGRhdGluZyA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnZpZXcuYnJlYWtwb2ludElucHV0Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRjb25zdCBpZCA9IHRlbXBsYXRlLmJyZWFrcG9pbnQuZ2V0SWQoKTtcblxuXHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdGlmICh0ZW1wbGF0ZS50eXBlID09PSAnbmFtZScpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludChpZCwgeyBuYW1lOiBpbnB1dEJveC52YWx1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRlbXBsYXRlLnR5cGUgPT09ICdjb25kaXRpb24nKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS51cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnQoaWQsIHsgY29uZGl0aW9uOiBpbnB1dEJveC52YWx1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRlbXBsYXRlLnR5cGUgPT09ICdoaXRDb3VudCcpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludChpZCwgeyBoaXRDb25kaXRpb246IGlucHV0Qm94LnZhbHVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAodGVtcGxhdGUudHlwZSA9PT0gJ25hbWUnICYmICF0ZW1wbGF0ZS5icmVha3BvaW50Lm5hbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoaWQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnZpZXcucmVuZGVySW5wdXRCb3godW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRlbXBsYXRlLnVwZGF0aW5nID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRvRGlzcG9zZS5hZGQoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgJ2tleWRvd24nLCAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGlzRXNjYXBlID0gZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpO1xuXHRcdFx0Y29uc3QgaXNFbnRlciA9IGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpO1xuXHRcdFx0aWYgKGlzRXNjYXBlIHx8IGlzRW50ZXIpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR3cmFwVXAoaXNFbnRlcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRvRGlzcG9zZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsICdibHVyJywgKCkgPT4ge1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZS51cGRhdGluZykge1xuXHRcdFx0XHR3cmFwVXAoISFpbnB1dEJveC52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGUuaW5wdXRCb3ggPSBpbnB1dEJveDtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGVtcGxhdGUudGVtcGxhdGVEaXNwb3NhYmxlcyA9IHRvRGlzcG9zZTtcblx0XHR0ZW1wbGF0ZS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMpO1xuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPEZ1bmN0aW9uQnJlYWtwb2ludCwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBmdW5jdGlvbkJyZWFrcG9pbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0ZGF0YS5icmVha3BvaW50ID0gZnVuY3Rpb25CcmVha3BvaW50O1xuXHRcdGRhdGEudHlwZSA9IHRoaXMudmlldy5pbnB1dEJveERhdGE/LnR5cGUgfHwgJ25hbWUnOyAvLyBJZiB0aGVyZSBpcyBubyB0eXBlIHNldCB0YWtlIHRoZSAnbmFtZScgYXMgdGhlIGRlZmF1bHRcblx0XHRjb25zdCB7IGljb24sIG1lc3NhZ2UgfSA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbih0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBmdW5jdGlvbkJyZWFrcG9pbnQsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpKTtcblxuXHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmljb24sIG1lc3NhZ2UgPyBtZXNzYWdlIDogJycpKTtcblx0XHRkYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBmdW5jdGlvbkJyZWFrcG9pbnQuZW5hYmxlZDtcblx0XHRkYXRhLmNoZWNrYm94LmRpc2FibGUoKTtcblx0XHRkYXRhLmlucHV0Qm94LnZhbHVlID0gZnVuY3Rpb25CcmVha3BvaW50Lm5hbWUgfHwgJyc7XG5cblx0XHRsZXQgcGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha3BvaW50UGxhY2Vob2xkZXInLCBcIkZ1bmN0aW9uIHRvIGJyZWFrIG9uXCIpO1xuXHRcdGxldCBhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha1BvaW50SW5wdXRBcmlhTGFiZWwnLCBcIlR5cGUgZnVuY3Rpb24gYnJlYWtwb2ludC5cIik7XG5cdFx0aWYgKGRhdGEudHlwZSA9PT0gJ2NvbmRpdGlvbicpIHtcblx0XHRcdGRhdGEuaW5wdXRCb3gudmFsdWUgPSBmdW5jdGlvbkJyZWFrcG9pbnQuY29uZGl0aW9uIHx8ICcnO1xuXHRcdFx0cGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha3BvaW50RXhwcmVzc2lvblBsYWNlaG9sZGVyJywgXCJCcmVhayB3aGVuIGV4cHJlc3Npb24gZXZhbHVhdGVzIHRvIHRydWVcIik7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha1BvaW50RXhwcmVzaW9uQXJpYUxhYmVsJywgXCJUeXBlIGV4cHJlc3Npb24uIEZ1bmN0aW9uIGJyZWFrcG9pbnQgd2lsbCBicmVhayB3aGVuIGV4cHJlc3Npb24gZXZhbHVhdGVzIHRvIHRydWVcIik7XG5cdFx0fSBlbHNlIGlmIChkYXRhLnR5cGUgPT09ICdoaXRDb3VudCcpIHtcblx0XHRcdGRhdGEuaW5wdXRCb3gudmFsdWUgPSBmdW5jdGlvbkJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uIHx8ICcnO1xuXHRcdFx0cGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnZnVuY3Rpb25CcmVha3BvaW50SGl0Q291bnRQbGFjZWhvbGRlcicsIFwiQnJlYWsgd2hlbiBoaXQgY291bnQgaXMgbWV0XCIpO1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2Z1bmN0aW9uQnJlYWtQb2ludEhpdENvdW50QXJpYUxhYmVsJywgXCJUeXBlIGhpdCBjb3VudC4gRnVuY3Rpb24gYnJlYWtwb2ludCB3aWxsIGJyZWFrIHdoZW4gaGl0IGNvdW50IGlzIG1ldC5cIik7XG5cdFx0fVxuXHRcdGRhdGEuaW5wdXRCb3guc2V0QXJpYUxhYmVsKGFyaWFMYWJlbCk7XG5cdFx0ZGF0YS5pbnB1dEJveC5zZXRQbGFjZUhvbGRlcihwbGFjZWhvbGRlcik7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGRhdGEuaW5wdXRCb3guZm9jdXMoKTtcblx0XHRcdGRhdGEuaW5wdXRCb3guc2VsZWN0KCk7XG5cdFx0fSwgMCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUZ1bmN0aW9uQnJlYWtwb2ludD4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUZ1bmN0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gRnVuY3Rpb24gYnJlYWtwb2ludHMgYXJlIG5vdCBjb21wcmVzc2libGVcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJRnVuY3Rpb25CcmVha3BvaW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElGdW5jdGlvbkJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRnVuY3Rpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRGF0YUJyZWFrcG9pbnRJbnB1dFJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJRGF0YUJyZWFrcG9pbnQsIHZvaWQsIElEYXRhQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB2aWV3OiBCcmVha3BvaW50c1ZpZXcsXG5cdFx0cHJpdmF0ZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7IH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZGF0YWJyZWFrcG9pbnRpbnB1dCc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIERhdGFCcmVha3BvaW50SW5wdXRSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGF0YUJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgdGVtcGxhdGU6IElEYXRhQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBicmVha3BvaW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5icmVha3BvaW50JykpO1xuXHRcdHRlbXBsYXRlLmljb24gPSAkKCcuaWNvbicpO1xuXHRcdHRlbXBsYXRlLmNoZWNrYm94ID0gY3JlYXRlQ2hlY2tib3godG9EaXNwb3NlKTtcblxuXHRcdGRvbS5hcHBlbmQoYnJlYWtwb2ludCwgdGVtcGxhdGUuaWNvbik7XG5cdFx0ZG9tLmFwcGVuZChicmVha3BvaW50LCB0ZW1wbGF0ZS5jaGVja2JveC5kb21Ob2RlKTtcblx0XHR0aGlzLnZpZXcuYnJlYWtwb2ludElucHV0Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0Y29uc3QgaW5wdXRCb3hDb250YWluZXIgPSBkb20uYXBwZW5kKGJyZWFrcG9pbnQsICQoJy5pbnB1dEJveENvbnRhaW5lcicpKTtcblxuXG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBuZXcgSW5wdXRCb3goaW5wdXRCb3hDb250YWluZXIsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7IGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSk7XG5cdFx0dG9EaXNwb3NlLmFkZChpbnB1dEJveCk7XG5cblx0XHRjb25zdCB3cmFwVXAgPSAoc3VjY2VzczogYm9vbGVhbikgPT4ge1xuXHRcdFx0dGVtcGxhdGUudXBkYXRpbmcgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy52aWV3LmJyZWFrcG9pbnRJbnB1dEZvY3VzZWQuc2V0KGZhbHNlKTtcblx0XHRcdFx0Y29uc3QgaWQgPSB0ZW1wbGF0ZS5icmVha3BvaW50LmdldElkKCk7XG5cblx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRpZiAodGVtcGxhdGUudHlwZSA9PT0gJ2NvbmRpdGlvbicpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnVwZGF0ZURhdGFCcmVha3BvaW50KGlkLCB7IGNvbmRpdGlvbjogaW5wdXRCb3gudmFsdWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0ZW1wbGF0ZS50eXBlID09PSAnaGl0Q291bnQnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS51cGRhdGVEYXRhQnJlYWtwb2ludChpZCwgeyBoaXRDb25kaXRpb246IGlucHV0Qm94LnZhbHVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnZpZXcucmVuZGVySW5wdXRCb3godW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGVtcGxhdGUudXBkYXRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dG9EaXNwb3NlLmFkZChkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCAna2V5ZG93bicsIChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgaXNFc2NhcGUgPSBlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSk7XG5cdFx0XHRjb25zdCBpc0VudGVyID0gZS5lcXVhbHMoS2V5Q29kZS5FbnRlcik7XG5cdFx0XHRpZiAoaXNFc2NhcGUgfHwgaXNFbnRlcikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHdyYXBVcChpc0VudGVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dG9EaXNwb3NlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgJ2JsdXInLCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRlbXBsYXRlLnVwZGF0aW5nKSB7XG5cdFx0XHRcdHdyYXBVcCghIWlucHV0Qm94LnZhbHVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZS5pbnB1dEJveCA9IGlucHV0Qm94O1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0ZW1wbGF0ZS50ZW1wbGF0ZURpc3Bvc2FibGVzID0gdG9EaXNwb3NlO1xuXHRcdHRlbXBsYXRlLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8RGF0YUJyZWFrcG9pbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhQnJlYWtwb2ludCA9IG5vZGUuZWxlbWVudDtcblx0XHRkYXRhLmJyZWFrcG9pbnQgPSBkYXRhQnJlYWtwb2ludDtcblx0XHRkYXRhLnR5cGUgPSB0aGlzLnZpZXcuaW5wdXRCb3hEYXRhPy50eXBlIHx8ICdjb25kaXRpb24nOyAvLyBJZiB0aGVyZSBpcyBubyB0eXBlIHNldCB0YWtlIHRoZSAnY29uZGl0aW9uJyBhcyB0aGUgZGVmYXVsdFxuXHRcdGNvbnN0IHsgaWNvbiwgbWVzc2FnZSB9ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCksIGRhdGFCcmVha3BvaW50LCB0aGlzLmxhYmVsU2VydmljZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKSk7XG5cblx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5pY29uLCBtZXNzYWdlID8/ICcnKSk7XG5cdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gZGF0YUJyZWFrcG9pbnQuZW5hYmxlZDtcblx0XHRkYXRhLmNoZWNrYm94LmRpc2FibGUoKTtcblx0XHRkYXRhLmlucHV0Qm94LnZhbHVlID0gJyc7XG5cdFx0bGV0IHBsYWNlaG9sZGVyID0gJyc7XG5cdFx0bGV0IGFyaWFMYWJlbCA9ICcnO1xuXHRcdGlmIChkYXRhLnR5cGUgPT09ICdjb25kaXRpb24nKSB7XG5cdFx0XHRkYXRhLmlucHV0Qm94LnZhbHVlID0gZGF0YUJyZWFrcG9pbnQuY29uZGl0aW9uIHx8ICcnO1xuXHRcdFx0cGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRFeHByZXNzaW9uUGxhY2Vob2xkZXInLCBcIkJyZWFrIHdoZW4gZXhwcmVzc2lvbiBldmFsdWF0ZXMgdG8gdHJ1ZVwiKTtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdkYXRhQnJlYWtQb2ludEV4cHJlc2lvbkFyaWFMYWJlbCcsIFwiVHlwZSBleHByZXNzaW9uLiBEYXRhIGJyZWFrcG9pbnQgd2lsbCBicmVhayB3aGVuIGV4cHJlc3Npb24gZXZhbHVhdGVzIHRvIHRydWVcIik7XG5cdFx0fSBlbHNlIGlmIChkYXRhLnR5cGUgPT09ICdoaXRDb3VudCcpIHtcblx0XHRcdGRhdGEuaW5wdXRCb3gudmFsdWUgPSBkYXRhQnJlYWtwb2ludC5oaXRDb25kaXRpb24gfHwgJyc7XG5cdFx0XHRwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludEhpdENvdW50UGxhY2Vob2xkZXInLCBcIkJyZWFrIHdoZW4gaGl0IGNvdW50IGlzIG1ldFwiKTtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdkYXRhQnJlYWtQb2ludEhpdENvdW50QXJpYUxhYmVsJywgXCJUeXBlIGhpdCBjb3VudC4gRGF0YSBicmVha3BvaW50IHdpbGwgYnJlYWsgd2hlbiBoaXQgY291bnQgaXMgbWV0LlwiKTtcblx0XHR9XG5cdFx0ZGF0YS5pbnB1dEJveC5zZXRBcmlhTGFiZWwoYXJpYUxhYmVsKTtcblx0XHRkYXRhLmlucHV0Qm94LnNldFBsYWNlSG9sZGVyKHBsYWNlaG9sZGVyKTtcblxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0ZGF0YS5pbnB1dEJveC5mb2N1cygpO1xuXHRcdFx0ZGF0YS5pbnB1dEJveC5zZWxlY3QoKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJRGF0YUJyZWFrcG9pbnQ+LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElEYXRhQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gRGF0YSBicmVha3BvaW50cyBhcmUgbm90IGNvbXByZXNzaWJsZVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElEYXRhQnJlYWtwb2ludCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElEYXRhQnJlYWtwb2ludD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElEYXRhQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSURhdGFCcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRXhjZXB0aW9uQnJlYWtwb2ludElucHV0UmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElFeGNlcHRpb25CcmVha3BvaW50LCB2b2lkLCBJRXhjZXB0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB2aWV3OiBCcmVha3BvaW50c1ZpZXcsXG5cdFx0cHJpdmF0ZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdCkge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleGNlcHRpb25icmVha3BvaW50aW5wdXQnO1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBFeGNlcHRpb25CcmVha3BvaW50SW5wdXRSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRXhjZXB0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBicmVha3BvaW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5icmVha3BvaW50JykpO1xuXHRcdGJyZWFrcG9pbnQuY2xhc3NMaXN0LmFkZCgnZXhjZXB0aW9uJyk7XG5cdFx0Y29uc3QgY2hlY2tib3ggPSBjcmVhdGVDaGVja2JveCh0b0Rpc3Bvc2UpO1xuXG5cdFx0ZG9tLmFwcGVuZChicmVha3BvaW50LCBjaGVja2JveC5kb21Ob2RlKTtcblx0XHR0aGlzLnZpZXcuYnJlYWtwb2ludElucHV0Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0Y29uc3QgaW5wdXRCb3hDb250YWluZXIgPSBkb20uYXBwZW5kKGJyZWFrcG9pbnQsICQoJy5pbnB1dEJveENvbnRhaW5lcicpKTtcblx0XHRjb25zdCBpbnB1dEJveCA9IG5ldyBJbnB1dEJveChpbnB1dEJveENvbnRhaW5lciwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2V4Y2VwdGlvbkJyZWFrcG9pbnRBcmlhTGFiZWwnLCBcIlR5cGUgZXhjZXB0aW9uIGJyZWFrcG9pbnQgY29uZGl0aW9uXCIpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlc1xuXHRcdH0pO1xuXG5cblx0XHR0b0Rpc3Bvc2UuYWRkKGlucHV0Qm94KTtcblx0XHRjb25zdCB3cmFwVXAgPSAoc3VjY2VzczogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZURhdGEuY3VycmVudEJyZWFrcG9pbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXcuYnJlYWtwb2ludElucHV0Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdFx0bGV0IG5ld0NvbmRpdGlvbiA9IHRlbXBsYXRlRGF0YS5jdXJyZW50QnJlYWtwb2ludC5jb25kaXRpb247XG5cdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRuZXdDb25kaXRpb24gPSBpbnB1dEJveC52YWx1ZSAhPT0gJycgPyBpbnB1dEJveC52YWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRDb25kaXRpb24odGVtcGxhdGVEYXRhLmN1cnJlbnRCcmVha3BvaW50LCBuZXdDb25kaXRpb24pO1xuXHRcdH07XG5cblx0XHR0b0Rpc3Bvc2UuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsICdrZXlkb3duJywgKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBpc0VzY2FwZSA9IGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKTtcblx0XHRcdGNvbnN0IGlzRW50ZXIgPSBlLmVxdWFscyhLZXlDb2RlLkVudGVyKTtcblx0XHRcdGlmIChpc0VzY2FwZSB8fCBpc0VudGVyKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0d3JhcFVwKGlzRW50ZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCAnYmx1cicsICgpID0+IHtcblx0XHRcdC8vIE5lZWQgdG8gcmVhY3Qgd2l0aCBhIHRpbWVvdXQgb24gdGhlIGJsdXIgZXZlbnQgZHVlIHRvIHBvc3NpYmxlIGNvbmN1cmVudCBzcGxpY2VzICM1NjQ0M1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHdyYXBVcCh0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKGVsZW1lbnREaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZURhdGE6IElFeGNlcHRpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEgPSB7XG5cdFx0XHRpbnB1dEJveCxcblx0XHRcdGNoZWNrYm94LFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlczogdG9EaXNwb3NlLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksXG5cdFx0fTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZURhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxFeGNlcHRpb25CcmVha3BvaW50LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElFeGNlcHRpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBleGNlcHRpb25CcmVha3BvaW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdGNvbnN0IHBsYWNlSG9sZGVyID0gZXhjZXB0aW9uQnJlYWtwb2ludC5jb25kaXRpb25EZXNjcmlwdGlvbiB8fCBsb2NhbGl6ZSgnZXhjZXB0aW9uQnJlYWtwb2ludFBsYWNlaG9sZGVyJywgXCJCcmVhayB3aGVuIGV4cHJlc3Npb24gZXZhbHVhdGVzIHRvIHRydWVcIik7XG5cdFx0ZGF0YS5pbnB1dEJveC5zZXRQbGFjZUhvbGRlcihwbGFjZUhvbGRlcik7XG5cdFx0ZGF0YS5jdXJyZW50QnJlYWtwb2ludCA9IGV4Y2VwdGlvbkJyZWFrcG9pbnQ7XG5cdFx0ZGF0YS5jaGVja2JveC5jaGVja2VkID0gZXhjZXB0aW9uQnJlYWtwb2ludC5lbmFibGVkO1xuXHRcdGRhdGEuY2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdGRhdGEuaW5wdXRCb3gudmFsdWUgPSBleGNlcHRpb25CcmVha3BvaW50LmNvbmRpdGlvbiB8fCAnJztcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGRhdGEuaW5wdXRCb3guZm9jdXMoKTtcblx0XHRcdGRhdGEuaW5wdXRCb3guc2VsZWN0KCk7XG5cdFx0fSwgMCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUV4Y2VwdGlvbkJyZWFrcG9pbnQ+LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElFeGNlcHRpb25CcmVha3BvaW50SW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBFeGNlcHRpb24gYnJlYWtwb2ludHMgYXJlIG5vdCBjb21wcmVzc2libGVcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJRXhjZXB0aW9uQnJlYWtwb2ludCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUV4Y2VwdGlvbkJyZWFrcG9pbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRXhjZXB0aW9uQnJlYWtwb2ludElucHV0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRJbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBCcmVha3BvaW50c0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPEJyZWFrcG9pbnRUcmVlRWxlbWVudD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdicmVha3BvaW50cycsIFwiQnJlYWtwb2ludHNcIik7XG5cdH1cblxuXHRnZXRSb2xlKCk6IEFyaWFSb2xlIHtcblx0XHRyZXR1cm4gJ2NoZWNrYm94Jztcblx0fVxuXG5cdGlzQ2hlY2tlZChlbGVtZW50OiBCcmVha3BvaW50VHJlZUVsZW1lbnQpIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuZW5hYmxlZDtcblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnQuZW5hYmxlZDtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBCcmVha3BvaW50VHJlZUVsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJyZWFrcG9pbnRzRm9sZGVySXRlbSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdicmVha3BvaW50Rm9sZGVyJywgXCJCcmVha3BvaW50cyBpbiB7MH0sIHsxfSBicmVha3BvaW50c1wiLCByZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eShlbGVtZW50LnVyaSksIGVsZW1lbnQuYnJlYWtwb2ludHMubGVuZ3RoKTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEV4Y2VwdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBtZXNzYWdlIH0gPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24odGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgZWxlbWVudCBhcyBJQnJlYWtwb2ludCB8IElEYXRhQnJlYWtwb2ludCB8IElGdW5jdGlvbkJyZWFrcG9pbnQsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpKTtcblx0XHRjb25zdCB0b1N0cmluZyA9IGVsZW1lbnQudG9TdHJpbmcoKTtcblxuXHRcdHJldHVybiBtZXNzYWdlID8gYCR7dG9TdHJpbmd9LCAke21lc3NhZ2V9YCA6IHRvU3RyaW5nO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuQnJlYWtwb2ludFNvdXJjZShicmVha3BvaW50OiBJQnJlYWtwb2ludCwgc2lkZUJ5U2lkZTogYm9vbGVhbiwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgcGlubmVkOiBib29sZWFuLCBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRpZiAoYnJlYWtwb2ludC51cmkuc2NoZW1lID09PSBERUJVR19TQ0hFTUUgJiYgZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5JbmFjdGl2ZSkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGNvbnN0IHNlbGVjdGlvbiA9IGJyZWFrcG9pbnQuZW5kTGluZU51bWJlciA/IHtcblx0XHRzdGFydExpbmVOdW1iZXI6IGJyZWFrcG9pbnQubGluZU51bWJlcixcblx0XHRlbmRMaW5lTnVtYmVyOiBicmVha3BvaW50LmVuZExpbmVOdW1iZXIsXG5cdFx0c3RhcnRDb2x1bW46IGJyZWFrcG9pbnQuY29sdW1uIHx8IDEsXG5cdFx0ZW5kQ29sdW1uOiBicmVha3BvaW50LmVuZENvbHVtbiB8fCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUlxuXHR9IDoge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogYnJlYWtwb2ludC5saW5lTnVtYmVyLFxuXHRcdHN0YXJ0Q29sdW1uOiBicmVha3BvaW50LmNvbHVtbiB8fCAxLFxuXHRcdGVuZExpbmVOdW1iZXI6IGJyZWFrcG9pbnQubGluZU51bWJlcixcblx0XHRlbmRDb2x1bW46IGJyZWFrcG9pbnQuY29sdW1uIHx8IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSXG5cdH07XG5cblx0cmV0dXJuIGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0cmVzb3VyY2U6IGJyZWFrcG9pbnQudXJpLFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdHByZXNlcnZlRm9jdXMsXG5cdFx0XHRzZWxlY3Rpb24sXG5cdFx0XHRyZXZlYWxJZk9wZW5lZDogdHJ1ZSxcblx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0cGlubmVkXG5cdFx0fVxuXHR9LCBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24oc3RhdGU6IFN0YXRlLCBicmVha3BvaW50c0FjdGl2YXRlZDogYm9vbGVhbiwgYnJlYWtwb2ludDogQnJlYWtwb2ludEl0ZW0sIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSwgZGVidWdNb2RlbDogSURlYnVnTW9kZWwpOiB7IG1lc3NhZ2U/OiBzdHJpbmc7IGljb246IFRoZW1lSWNvbjsgc2hvd0FkYXB0ZXJVbnZlcmlmaWVkTWVzc2FnZT86IGJvb2xlYW4gfSB7XG5cdGNvbnN0IGRlYnVnQWN0aXZlID0gc3RhdGUgPT09IFN0YXRlLlJ1bm5pbmcgfHwgc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQ7XG5cblx0Y29uc3QgYnJlYWtwb2ludEljb24gPSBicmVha3BvaW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQgPyBpY29ucy5kYXRhQnJlYWtwb2ludCA6IGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQgPyBpY29ucy5mdW5jdGlvbkJyZWFrcG9pbnQgOiBicmVha3BvaW50LmxvZ01lc3NhZ2UgPyBpY29ucy5sb2dCcmVha3BvaW50IDogaWNvbnMuYnJlYWtwb2ludDtcblxuXHRpZiAoIWJyZWFrcG9pbnQuZW5hYmxlZCB8fCAhYnJlYWtwb2ludHNBY3RpdmF0ZWQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbjogYnJlYWtwb2ludEljb24uZGlzYWJsZWQsXG5cdFx0XHRtZXNzYWdlOiBicmVha3BvaW50LmxvZ01lc3NhZ2UgPyBsb2NhbGl6ZSgnZGlzYWJsZWRMb2dwb2ludCcsIFwiRGlzYWJsZWQgTG9ncG9pbnRcIikgOiBsb2NhbGl6ZSgnZGlzYWJsZWRCcmVha3BvaW50JywgXCJEaXNhYmxlZCBCcmVha3BvaW50XCIpLFxuXHRcdH07XG5cdH1cblxuXHRjb25zdCBhcHBlbmRNZXNzYWdlID0gKHRleHQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIGJyZWFrcG9pbnQubWVzc2FnZSA/IHRleHQuY29uY2F0KCcsICcgKyBicmVha3BvaW50Lm1lc3NhZ2UpIDogdGV4dDtcblx0fTtcblxuXHRpZiAoZGVidWdBY3RpdmUgJiYgYnJlYWtwb2ludCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQgJiYgYnJlYWtwb2ludC5wZW5kaW5nKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGljb246IGljb25zLmJyZWFrcG9pbnQucGVuZGluZ1xuXHRcdH07XG5cdH1cblxuXHRpZiAoZGVidWdBY3RpdmUgJiYgIWJyZWFrcG9pbnQudmVyaWZpZWQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbjogYnJlYWtwb2ludEljb24udW52ZXJpZmllZCxcblx0XHRcdG1lc3NhZ2U6IGJyZWFrcG9pbnQubWVzc2FnZSA/IGJyZWFrcG9pbnQubWVzc2FnZSA6IChicmVha3BvaW50LmxvZ01lc3NhZ2UgPyBsb2NhbGl6ZSgndW52ZXJpZmllZExvZ3BvaW50JywgXCJVbnZlcmlmaWVkIExvZ3BvaW50XCIpIDogbG9jYWxpemUoJ3VudmVyaWZpZWRCcmVha3BvaW50JywgXCJVbnZlcmlmaWVkIEJyZWFrcG9pbnRcIikpLFxuXHRcdFx0c2hvd0FkYXB0ZXJVbnZlcmlmaWVkTWVzc2FnZTogdHJ1ZVxuXHRcdH07XG5cdH1cblxuXHRpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50KSB7XG5cdFx0aWYgKCFicmVha3BvaW50LnN1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWNvbjogYnJlYWtwb2ludEljb24udW52ZXJpZmllZCxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2RhdGFCcmVha3BvaW50VW5zdXBwb3J0ZWQnLCBcIkRhdGEgYnJlYWtwb2ludHMgbm90IHN1cHBvcnRlZCBieSB0aGlzIGRlYnVnIHR5cGVcIiksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpY29uOiBicmVha3BvaW50SWNvbi5yZWd1bGFyLFxuXHRcdFx0bWVzc2FnZTogYnJlYWtwb2ludC5tZXNzYWdlIHx8IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludCcsIFwiRGF0YSBCcmVha3BvaW50XCIpXG5cdFx0fTtcblx0fVxuXG5cdGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0aWYgKCFicmVha3BvaW50LnN1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWNvbjogYnJlYWtwb2ludEljb24udW52ZXJpZmllZCxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Z1bmN0aW9uQnJlYWtwb2ludFVuc3VwcG9ydGVkJywgXCJGdW5jdGlvbiBicmVha3BvaW50cyBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgZGVidWcgdHlwZVwiKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdG1lc3NhZ2VzLnB1c2goYnJlYWtwb2ludC5tZXNzYWdlIHx8IGxvY2FsaXplKCdmdW5jdGlvbkJyZWFrcG9pbnQnLCBcIkZ1bmN0aW9uIEJyZWFrcG9pbnRcIikpO1xuXHRcdGlmIChicmVha3BvaW50LmNvbmRpdGlvbikge1xuXHRcdFx0bWVzc2FnZXMucHVzaChsb2NhbGl6ZSgnZXhwcmVzc2lvbicsIFwiQ29uZGl0aW9uOiB7MH1cIiwgYnJlYWtwb2ludC5jb25kaXRpb24pKTtcblx0XHR9XG5cdFx0aWYgKGJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uKSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGxvY2FsaXplKCdoaXRDb3VudCcsIFwiSGl0IENvdW50OiB7MH1cIiwgYnJlYWtwb2ludC5oaXRDb25kaXRpb24pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbjogYnJlYWtwb2ludEljb24ucmVndWxhcixcblx0XHRcdG1lc3NhZ2U6IGFwcGVuZE1lc3NhZ2UobWVzc2FnZXMuam9pbignXFxuJykpXG5cdFx0fTtcblx0fVxuXG5cdGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSB7XG5cdFx0aWYgKCFicmVha3BvaW50LnN1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWNvbjogYnJlYWtwb2ludEljb24udW52ZXJpZmllZCxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2luc3RydWN0aW9uQnJlYWtwb2ludFVuc3VwcG9ydGVkJywgXCJJbnN0cnVjdGlvbiBicmVha3BvaW50cyBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgZGVidWcgdHlwZVwiKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChicmVha3BvaW50Lm1lc3NhZ2UpIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2goYnJlYWtwb2ludC5tZXNzYWdlKTtcblx0XHR9IGVsc2UgaWYgKGJyZWFrcG9pbnQuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UpIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ2luc3RydWN0aW9uQnJlYWtwb2ludEF0QWRkcmVzcycsIFwiSW5zdHJ1Y3Rpb24gYnJlYWtwb2ludCBhdCBhZGRyZXNzIHswfVwiLCBicmVha3BvaW50Lmluc3RydWN0aW9uUmVmZXJlbmNlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ2luc3RydWN0aW9uQnJlYWtwb2ludCcsIFwiSW5zdHJ1Y3Rpb24gYnJlYWtwb2ludFwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uKSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGxvY2FsaXplKCdoaXRDb3VudCcsIFwiSGl0IENvdW50OiB7MH1cIiwgYnJlYWtwb2ludC5oaXRDb25kaXRpb24pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbjogYnJlYWtwb2ludEljb24ucmVndWxhcixcblx0XHRcdG1lc3NhZ2U6IGFwcGVuZE1lc3NhZ2UobWVzc2FnZXMuam9pbignXFxuJykpXG5cdFx0fTtcblx0fVxuXG5cdC8vIGNhbiBjaGFuZ2UgdGhpcyB3aGVuIGFsbCBicmVha3BvaW50IHN1cHBvcnRzIGRlcGVuZGVudCBicmVha3BvaW50IGNvbmRpdGlvblxuXHRsZXQgdHJpZ2dlcmluZ0JyZWFrcG9pbnQ6IElCcmVha3BvaW50IHwgdW5kZWZpbmVkO1xuXHRpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQgJiYgYnJlYWtwb2ludC50cmlnZ2VyZWRCeSkge1xuXHRcdHRyaWdnZXJpbmdCcmVha3BvaW50ID0gZGVidWdNb2RlbC5nZXRCcmVha3BvaW50cygpLmZpbmQoYnAgPT4gYnAuZ2V0SWQoKSA9PT0gYnJlYWtwb2ludC50cmlnZ2VyZWRCeSk7XG5cdH1cblxuXHRpZiAoYnJlYWtwb2ludC5sb2dNZXNzYWdlIHx8IGJyZWFrcG9pbnQuY29uZGl0aW9uIHx8IGJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uIHx8IHRyaWdnZXJpbmdCcmVha3BvaW50KSB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGljb24gPSBicmVha3BvaW50LmxvZ01lc3NhZ2UgPyBpY29ucy5sb2dCcmVha3BvaW50LnJlZ3VsYXIgOiBpY29ucy5jb25kaXRpb25hbEJyZWFrcG9pbnQucmVndWxhcjtcblx0XHRpZiAoIWJyZWFrcG9pbnQuc3VwcG9ydGVkKSB7XG5cdFx0XHRpY29uID0gaWNvbnMuZGVidWdCcmVha3BvaW50VW5zdXBwb3J0ZWQ7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGxvY2FsaXplKCdicmVha3BvaW50VW5zdXBwb3J0ZWQnLCBcIkJyZWFrcG9pbnRzIG9mIHRoaXMgdHlwZSBhcmUgbm90IHN1cHBvcnRlZCBieSB0aGUgZGVidWdnZXJcIikpO1xuXHRcdH1cblxuXHRcdGlmIChicmVha3BvaW50LmxvZ01lc3NhZ2UpIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2gobG9jYWxpemUoJ2xvZ01lc3NhZ2UnLCBcIkxvZyBNZXNzYWdlOiB7MH1cIiwgYnJlYWtwb2ludC5sb2dNZXNzYWdlKSk7XG5cdFx0fVxuXHRcdGlmIChicmVha3BvaW50LmNvbmRpdGlvbikge1xuXHRcdFx0bWVzc2FnZXMucHVzaChsb2NhbGl6ZSgnZXhwcmVzc2lvbicsIFwiQ29uZGl0aW9uOiB7MH1cIiwgYnJlYWtwb2ludC5jb25kaXRpb24pKTtcblx0XHR9XG5cdFx0aWYgKGJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uKSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGxvY2FsaXplKCdoaXRDb3VudCcsIFwiSGl0IENvdW50OiB7MH1cIiwgYnJlYWtwb2ludC5oaXRDb25kaXRpb24pKTtcblx0XHR9XG5cdFx0aWYgKHRyaWdnZXJpbmdCcmVha3BvaW50KSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGxvY2FsaXplKCd0cmlnZ2VyZWRCeScsIFwiSGl0IGFmdGVyIGJyZWFrcG9pbnQ6IHswfVwiLCBgJHtsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodHJpZ2dlcmluZ0JyZWFrcG9pbnQudXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pfTogJHt0cmlnZ2VyaW5nQnJlYWtwb2ludC5saW5lTnVtYmVyfWApKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbixcblx0XHRcdG1lc3NhZ2U6IGFwcGVuZE1lc3NhZ2UobWVzc2FnZXMuam9pbignXFxuJykpXG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0IG1lc3NhZ2UgPSBicmVha3BvaW50Lm1lc3NhZ2UgPyBicmVha3BvaW50Lm1lc3NhZ2UgOiBicmVha3BvaW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCAmJiBsYWJlbFNlcnZpY2UgPyBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoYnJlYWtwb2ludC51cmkpIDogbG9jYWxpemUoJ2JyZWFrcG9pbnQnLCBcIkJyZWFrcG9pbnRcIik7XG5cdHJldHVybiB7XG5cdFx0aWNvbjogYnJlYWtwb2ludEljb24ucmVndWxhcixcblx0XHRtZXNzYWdlXG5cdH07XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi5hZGRGdW5jdGlvbkJyZWFrcG9pbnRBY3Rpb24nLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdhZGRGdW5jdGlvbkJyZWFrcG9pbnQnLCBcIkFkZCBGdW5jdGlvbiBCcmVha3BvaW50XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRnVuY3Rpb25CcmVha3BvaW50JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRnVuY3Rpb24gQnJlYWtwb2ludC4uLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IGljb25zLndhdGNoRXhwcmVzc2lvbnNBZGRGdW5jQnJlYWtwb2ludCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIEJSRUFLUE9JTlRTX1ZJRVdfSUQpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhck5ld0JyZWFrcG9pbnRNZW51LFxuXHRcdFx0XHRncm91cDogJzFfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGF3YWl0IHZpZXdTZXJ2aWNlLm9wZW5WaWV3KEJSRUFLUE9JTlRTX1ZJRVdfSUQpO1xuXHRcdGRlYnVnU2VydmljZS5hZGRGdW5jdGlvbkJyZWFrcG9pbnQoKTtcblx0fVxufSk7XG5cbmFic3RyYWN0IGNsYXNzIE1lbW9yeUJyZWFrcG9pbnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleGlzdGluZ0JyZWFrcG9pbnQ/OiBJRGF0YUJyZWFrcG9pbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZGVmYXVsdFZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGlmIChleGlzdGluZ0JyZWFrcG9pbnQgJiYgZXhpc3RpbmdCcmVha3BvaW50LnNyYy50eXBlID09PSBEYXRhQnJlYWtwb2ludFNldFR5cGUuQWRkcmVzcykge1xuXHRcdFx0ZGVmYXVsdFZhbHVlID0gYCR7ZXhpc3RpbmdCcmVha3BvaW50LnNyYy5hZGRyZXNzfSArICR7ZXhpc3RpbmdCcmVha3BvaW50LnNyYy5ieXRlc31gO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1aWNrSW5wdXQgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCByYW5nZSA9IGF3YWl0IHRoaXMuZ2V0UmFuZ2UocXVpY2tJbnB1dCwgZGVmYXVsdFZhbHVlKTtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGluZm86IElEYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0aW5mbyA9IGF3YWl0IHNlc3Npb24uZGF0YUJ5dGVzQnJlYWtwb2ludEluZm8ocmFuZ2UuYWRkcmVzcywgcmFuZ2UuYnl0ZXMpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG5vdGlmaWNhdGlvbnMuZXJyb3IobG9jYWxpemUoJ2RhdGFCcmVha3BvaW50RXJyb3InLCBcIkZhaWxlZCB0byBzZXQgZGF0YSBicmVha3BvaW50IGF0IHswfTogezF9XCIsIHJhbmdlLmFkZHJlc3MsIGUubWVzc2FnZSkpO1xuXHRcdH1cblxuXHRcdGlmICghaW5mbz8uZGF0YUlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGFjY2Vzc1R5cGU6IERlYnVnUHJvdG9jb2wuRGF0YUJyZWFrcG9pbnRBY2Nlc3NUeXBlID0gJ3dyaXRlJztcblx0XHRpZiAoaW5mby5hY2Nlc3NUeXBlcyAmJiBpbmZvLmFjY2Vzc1R5cGVzPy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBhY2Nlc3NUeXBlcyA9IGluZm8uYWNjZXNzVHlwZXMubWFwKHR5cGUgPT4gKHsgbGFiZWw6IHR5cGUgfSkpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRBY2Nlc3NUeXBlID0gYXdhaXQgcXVpY2tJbnB1dC5waWNrKGFjY2Vzc1R5cGVzLCB7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRBY2Nlc3NUeXBlJywgXCJTZWxlY3QgdGhlIGFjY2VzcyB0eXBlIHRvIG1vbml0b3JcIikgfSk7XG5cdFx0XHRpZiAoIXNlbGVjdGVkQWNjZXNzVHlwZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGFjY2Vzc1R5cGUgPSBzZWxlY3RlZEFjY2Vzc1R5cGUubGFiZWw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3JjOiBEYXRhQnJlYWtwb2ludFNvdXJjZSA9IHsgdHlwZTogRGF0YUJyZWFrcG9pbnRTZXRUeXBlLkFkZHJlc3MsIC4uLnJhbmdlIH07XG5cdFx0aWYgKGV4aXN0aW5nQnJlYWtwb2ludCkge1xuXHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLnJlbW92ZURhdGFCcmVha3BvaW50cyhleGlzdGluZ0JyZWFrcG9pbnQuZ2V0SWQoKSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmFkZERhdGFCcmVha3BvaW50KHtcblx0XHRcdGRlc2NyaXB0aW9uOiBpbmZvLmRlc2NyaXB0aW9uLFxuXHRcdFx0c3JjLFxuXHRcdFx0Y2FuUGVyc2lzdDogdHJ1ZSxcblx0XHRcdGFjY2Vzc1R5cGVzOiBpbmZvLmFjY2Vzc1R5cGVzLFxuXHRcdFx0YWNjZXNzVHlwZTogYWNjZXNzVHlwZSxcblx0XHRcdGluaXRpYWxTZXNzaW9uRGF0YTogeyBzZXNzaW9uLCBkYXRhSWQ6IGluZm8uZGF0YUlkIH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmFuZ2UocXVpY2tJbnB1dDogSVF1aWNrSW5wdXRTZXJ2aWNlLCBkZWZhdWx0VmFsdWU/OiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8eyBhZGRyZXNzOiBzdHJpbmc7IGJ5dGVzOiBudW1iZXIgfSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXQuY3JlYXRlSW5wdXRCb3goKSk7XG5cdFx0XHRpbnB1dC5wcm9tcHQgPSBsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRNZW1vcnlSYW5nZVByb21wdCcsIFwiRW50ZXIgYSBtZW1vcnkgcmFuZ2UgaW4gd2hpY2ggdG8gYnJlYWtcIik7XG5cdFx0XHRpbnB1dC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludE1lbW9yeVJhbmdlUGxhY2Vob2xkZXInLCAnQWJzb2x1dGUgcmFuZ2UgKDB4MTIzNCAtIDB4MTMwMCkgb3IgcmFuZ2Ugb2YgYnl0ZXMgYWZ0ZXIgYW4gYWRkcmVzcyAoMHgxMjM0ICsgMHhmZiknKTtcblx0XHRcdGlmIChkZWZhdWx0VmFsdWUpIHtcblx0XHRcdFx0aW5wdXQudmFsdWUgPSBkZWZhdWx0VmFsdWU7XG5cdFx0XHRcdGlucHV0LnZhbHVlU2VsZWN0aW9uID0gWzAsIGRlZmF1bHRWYWx1ZS5sZW5ndGhdO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlVmFsdWUoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVyciA9IHRoaXMucGFyc2VBZGRyZXNzKGUsIGZhbHNlKTtcblx0XHRcdFx0aW5wdXQudmFsaWRhdGlvbk1lc3NhZ2UgPSBlcnI/LmVycm9yO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgciA9IHRoaXMucGFyc2VBZGRyZXNzKGlucHV0LnZhbHVlLCB0cnVlKTtcblx0XHRcdFx0aWYgKGhhc0tleShyLCB7IGVycm9yOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0aW5wdXQudmFsaWRhdGlvbk1lc3NhZ2UgPSByLmVycm9yO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUocik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5wdXQuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0aW5wdXQuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0aW5wdXQuc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZUFkZHJlc3MocmFuZ2U6IHN0cmluZywgaXNGaW5hbDogZmFsc2UpOiB7IGVycm9yOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwYXJzZUFkZHJlc3MocmFuZ2U6IHN0cmluZywgaXNGaW5hbDogdHJ1ZSk6IHsgZXJyb3I6IHN0cmluZyB9IHwgeyBhZGRyZXNzOiBzdHJpbmc7IGJ5dGVzOiBudW1iZXIgfTtcblx0cHJpdmF0ZSBwYXJzZUFkZHJlc3MocmFuZ2U6IHN0cmluZywgaXNGaW5hbDogYm9vbGVhbik6IHsgZXJyb3I6IHN0cmluZyB9IHwgeyBhZGRyZXNzOiBzdHJpbmc7IGJ5dGVzOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGFydHMgPSAvXihcXFMrKVxccyooPzooWystXSlcXHMqKFxcUyspKT8vLmV4ZWMocmFuZ2UpO1xuXHRcdGlmICghcGFydHMpIHtcblx0XHRcdHJldHVybiB7IGVycm9yOiBsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRBZGRyRm9ybWF0JywgJ0FkZHJlc3Mgc2hvdWxkIGJlIGEgcmFuZ2Ugb2YgbnVtYmVycyB0aGUgZm9ybSBcIltTdGFydF0gLSBbRW5kXVwiIG9yIFwiW1N0YXJ0XSArIFtCeXRlc11cIicpIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNOdW0gPSAoZTogc3RyaW5nKSA9PiBpc0ZpbmFsID8gL14weFswLTlhLWZdKnxbMC05XSokL2kudGVzdChlKSA6IC9eMHhbMC05YS1mXSt8WzAtOV0rJC9pLnRlc3QoZSk7XG5cdFx0Y29uc3QgWywgc3RhcnRTdHIsIHNpZ24gPSAnKycsIGVuZFN0ciA9ICcxJ10gPSBwYXJ0cztcblxuXHRcdGZvciAoY29uc3QgbiBvZiBbc3RhcnRTdHIsIGVuZFN0cl0pIHtcblx0XHRcdGlmICghaXNOdW0obikpIHtcblx0XHRcdFx0cmV0dXJuIHsgZXJyb3I6IGxvY2FsaXplKCdkYXRhQnJlYWtwb2ludEFkZHJTdGFydEVuZCcsICdOdW1iZXIgbXVzdCBiZSBhIGRlY2ltYWwgaW50ZWdlciBvciBoZXggdmFsdWUgc3RhcnRpbmcgd2l0aCBcXFwiMHhcXFwiLCBnb3QgezB9JywgbikgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWlzRmluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IEJpZ0ludChzdGFydFN0cik7XG5cdFx0Y29uc3QgZW5kID0gQmlnSW50KGVuZFN0cik7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGAweCR7c3RhcnQudG9TdHJpbmcoMTYpfWA7XG5cdFx0aWYgKHNpZ24gPT09ICctJykge1xuXHRcdFx0aWYgKHN0YXJ0ID4gZW5kKSB7XG5cdFx0XHRcdHJldHVybiB7IGVycm9yOiBsb2NhbGl6ZSgnZGF0YUJyZWFrcG9pbnRBZGRyT3JkZXInLCAnRW5kICh7MX0pIHNob3VsZCBiZSBncmVhdGVyIHRoYW4gU3RhcnQgKHswfSknLCBzdGFydFN0ciwgZW5kU3RyKSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgYWRkcmVzcywgYnl0ZXM6IE51bWJlcihlbmQgLSBzdGFydCkgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBhZGRyZXNzLCBieXRlczogTnVtYmVyKGVuZCkgfTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBNZW1vcnlCcmVha3BvaW50QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24uYWRkRGF0YUJyZWFrcG9pbnRPbkFkZHJlc3MnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdhZGREYXRhQnJlYWtwb2ludE9uQWRkcmVzcycsIFwiQWRkIERhdGEgQnJlYWtwb2ludCBhdCBBZGRyZXNzXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRGF0YUJyZWFrcG9pbnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZEYXRhIEJyZWFrcG9pbnQuLi5cIiksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBpY29ucy53YXRjaEV4cHJlc3Npb25zQWRkRGF0YUJyZWFrcG9pbnQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDExLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRfREFUQV9CUkVBS1BPSU5UX0JZVEVTX1NVUFBPUlRFRCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQlJFQUtQT0lOVFNfVklFV19JRCkpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhck5ld0JyZWFrcG9pbnRNZW51LFxuXHRcdFx0XHRncm91cDogJzFfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9TRVRfREFUQV9CUkVBS1BPSU5UX0JZVEVTX1NVUFBPUlRFRFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE1lbW9yeUJyZWFrcG9pbnRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi5lZGl0RGF0YUJyZWFrcG9pbnRPbkFkZHJlc3MnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZWRpdERhdGFCcmVha3BvaW50T25BZGRyZXNzJywgXCJFZGl0IEFkZHJlc3MuLi5cIiksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQnJlYWtwb2ludHNDb250ZXh0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRfREFUQV9CUkVBS1BPSU5UX0JZVEVTX1NVUFBPUlRFRCwgQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fSVNfREFUQV9CWVRFUyksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxNSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24udG9nZ2xlQnJlYWtwb2ludHNBY3RpdmF0ZWRBY3Rpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWN0aXZhdGVCcmVha3BvaW50cycsICdUb2dnbGUgQWN0aXZhdGUgQnJlYWtwb2ludHMnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogaWNvbnMuYnJlYWtwb2ludHNBY3RpdmF0ZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQlJFQUtQT0lOVFNfVklFV19JRClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRkZWJ1Z1NlcnZpY2Uuc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQoIWRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLnJlbW92ZUJyZWFrcG9pbnQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZW1vdmVCcmVha3BvaW50JywgXCJSZW1vdmUgQnJlYWtwb2ludFwiKSxcblx0XHRcdGljb246IENvZGljb24ucmVtb3ZlQ2xvc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQnJlYWtwb2ludHNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzNfbW9kaWZpY2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLm5vdEVxdWFsc1RvKCdleGNlcHRpb25CcmVha3BvaW50Jylcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRvcmRlcjogMjAsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUubm90RXF1YWxzVG8oJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJlYWtwb2ludDogSUJhc2VCcmVha3BvaW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCkge1xuXHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnQuZ2V0SWQoKSk7XG5cdFx0fSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UucmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cyhicmVha3BvaW50LmdldElkKCkpO1xuXHRcdH0gZWxzZSBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50KSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UucmVtb3ZlRGF0YUJyZWFrcG9pbnRzKGJyZWFrcG9pbnQuZ2V0SWQoKSk7XG5cdFx0fSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UucmVtb3ZlSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhicmVha3BvaW50Lmluc3RydWN0aW9uUmVmZXJlbmNlLCBicmVha3BvaW50Lm9mZnNldCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLnJlbW92ZUFsbEJyZWFrcG9pbnRzJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMigncmVtb3ZlQWxsQnJlYWtwb2ludHMnLCBcIlJlbW92ZSBBbGwgQnJlYWtwb2ludHNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlSZW1vdmVBbGxCcmVha3BvaW50cycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJSZW1vdmUgJiZBbGwgQnJlYWtwb2ludHNcIiksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBpY29ucy5icmVha3BvaW50c1JlbW92ZUFsbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMzAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIEJSRUFLUE9JTlRTX1ZJRVdfSUQpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19tb2RpZmljYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMjAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0JSRUFLUE9JTlRTX0VYSVNULCBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLm5vdEVxdWFsc1RvKCdleGNlcHRpb25CcmVha3BvaW50JykpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckRlYnVnTWVudSxcblx0XHRcdFx0Z3JvdXA6ICc1X2JyZWFrcG9pbnRzJyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRkZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoKTtcblx0XHRkZWJ1Z1NlcnZpY2UucmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cygpO1xuXHRcdGRlYnVnU2VydmljZS5yZW1vdmVEYXRhQnJlYWtwb2ludHMoKTtcblx0XHRkZWJ1Z1NlcnZpY2UucmVtb3ZlSW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLmVuYWJsZUFsbEJyZWFrcG9pbnRzJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignZW5hYmxlQWxsQnJlYWtwb2ludHMnLCBcIkVuYWJsZSBBbGwgQnJlYWtwb2ludHNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlFbmFibGVBbGxCcmVha3BvaW50cycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkVuYWJsZSBBbGwgQnJlYWtwb2ludHNcIiksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQlJFQUtQT0lOVFNfRVhJU1QsIENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUubm90RXF1YWxzVG8oJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKSlcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRGVidWdNZW51LFxuXHRcdFx0XHRncm91cDogJzVfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGF3YWl0IGRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyh0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi5kaXNhYmxlQWxsQnJlYWtwb2ludHMnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdkaXNhYmxlQWxsQnJlYWtwb2ludHMnLCBcIkRpc2FibGUgQWxsIEJyZWFrcG9pbnRzXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRGlzYWJsZUFsbEJyZWFrcG9pbnRzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkRpc2FibGUgQSYmbGwgQnJlYWtwb2ludHNcIiksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQlJFQUtQT0lOVFNfRVhJU1QsIENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUubm90RXF1YWxzVG8oJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKSlcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRGVidWdNZW51LFxuXHRcdFx0XHRncm91cDogJzVfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGF3YWl0IGRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhmYWxzZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24ucmVhcHBseUJyZWFrcG9pbnRzQWN0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlYXBwbHlBbGxCcmVha3BvaW50cycsICdSZWFwcGx5IEFsbCBCcmVha3BvaW50cycpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSU5fREVCVUdfTU9ERSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAzMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQlJFQUtQT0lOVFNfRVhJU1QsIENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUubm90RXF1YWxzVG8oJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKSlcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0YXdhaXQgZGVidWdTZXJ2aWNlLnNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLnRvZ2dsZUJyZWFrcG9pbnRzUHJlc2VudGF0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZUJyZWFrcG9pbnRzUHJlc2VudGF0aW9uJywgXCJUb2dnbGUgQnJlYWtwb2ludHMgVmlldyBQcmVzZW50YXRpb25cIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IGljb25zLmJyZWFrcG9pbnRzVmlld0ljb24sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIEJSRUFLUE9JTlRTX1ZJRVdfSUQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGN1cnJlbnRQcmVzZW50YXRpb24gPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnbGlzdCcgfCAndHJlZSc+KCdkZWJ1Zy5icmVha3BvaW50c1ZpZXcucHJlc2VudGF0aW9uJyk7XG5cdFx0Y29uc3QgbmV3UHJlc2VudGF0aW9uID0gY3VycmVudFByZXNlbnRhdGlvbiA9PT0gJ3RyZWUnID8gJ2xpc3QnIDogJ3RyZWUnO1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdkZWJ1Zy5icmVha3BvaW50c1ZpZXcucHJlc2VudGF0aW9uJywgbmV3UHJlc2VudGF0aW9uKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248QnJlYWtwb2ludHNWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVidWcuZWRpdEJyZWFrcG9pbnQnLFxuXHRcdFx0dmlld0lkOiBCUkVBS1BPSU5UU19WSUVXX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdlZGl0Q29uZGl0aW9uJywgXCJFZGl0IENvbmRpdGlvbi4uLlwiKSxcblx0XHRcdGljb246IENvZGljb24uZWRpdCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9CUkVBS1BPSU5UX1NVUFBPUlRTX0NPTkRJVElPTixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfQlJFQUtQT0lOVF9JVEVNX1RZUEUubm90RXF1YWxzVG8oJ2Z1bmN0aW9uQnJlYWtwb2ludCcpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IEJyZWFrcG9pbnRzVmlldywgYnJlYWtwb2ludDogRXhjZXB0aW9uQnJlYWtwb2ludCB8IEJyZWFrcG9pbnQgfCBGdW5jdGlvbkJyZWFrcG9pbnQgfCBEYXRhQnJlYWtwb2ludCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IG9wZW5CcmVha3BvaW50U291cmNlKGJyZWFrcG9pbnQsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgZGVidWdTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IGVkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0XHRcdGlmIChpc0NvZGVFZGl0b3IoY29kZUVkaXRvcikpIHtcblx0XHRcdFx0XHRjb2RlRWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbj4oQlJFQUtQT0lOVF9FRElUT1JfQ09OVFJJQlVUSU9OX0lEKT8uc2hvd0JyZWFrcG9pbnRXaWRnZXQoYnJlYWtwb2ludC5saW5lTnVtYmVyLCBicmVha3BvaW50LmNvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGNvbnN0IGNvbnRleHRNZW51U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dE1lbnVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGFjdGlvbnM6IEFjdGlvbltdID0gW25ldyBBY3Rpb24oJ2JyZWFrcG9pbnQuZWRpdENvbmRpdGlvbicsIGxvY2FsaXplKCdlZGl0Q29uZGl0aW9uJywgXCJFZGl0IENvbmRpdGlvbi4uLlwiKSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB2aWV3LnJlbmRlcklucHV0Qm94KHsgYnJlYWtwb2ludCwgdHlwZTogJ2NvbmRpdGlvbicgfSkpLFxuXHRcdFx0bmV3IEFjdGlvbignYnJlYWtwb2ludC5lZGl0Q29uZGl0aW9uJywgbG9jYWxpemUoJ2VkaXRIaXRDb3VudCcsIFwiRWRpdCBIaXQgQ291bnQuLi5cIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4gdmlldy5yZW5kZXJJbnB1dEJveCh7IGJyZWFrcG9pbnQsIHR5cGU6ICdoaXRDb3VudCcgfSkpXTtcblx0XHRcdGNvbnN0IGRvbU5vZGUgPSBicmVha3BvaW50SWRUb0FjdGlvbkJhckRvbWVOb2RlLmdldChicmVha3BvaW50LmdldElkKCkpO1xuXG5cdFx0XHRpZiAoZG9tTm9kZSkge1xuXHRcdFx0XHRjb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZG9tTm9kZSxcblx0XHRcdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2UoYWN0aW9ucylcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZpZXcucmVuZGVySW5wdXRCb3goeyBicmVha3BvaW50LCB0eXBlOiAnY29uZGl0aW9uJyB9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248QnJlYWtwb2ludHNWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVidWcuZWRpdEZ1bmN0aW9uQnJlYWtwb2ludCcsXG5cdFx0XHR2aWV3SWQ6IEJSRUFLUE9JTlRTX1ZJRVdfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2VkaXRCcmVha3BvaW50JywgXCJFZGl0IEZ1bmN0aW9uIENvbmRpdGlvbi4uLlwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5pc0VxdWFsVG8oJ2Z1bmN0aW9uQnJlYWtwb2ludCcpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogQnJlYWtwb2ludHNWaWV3LCBicmVha3BvaW50OiBJRnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0dmlldy5yZW5kZXJJbnB1dEJveCh7IGJyZWFrcG9pbnQsIHR5cGU6ICduYW1lJyB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248QnJlYWtwb2ludHNWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVidWcuZWRpdEZ1bmN0aW9uQnJlYWtwb2ludEhpdENvdW50Jyxcblx0XHRcdHZpZXdJZDogQlJFQUtQT0lOVFNfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZWRpdEhpdENvdW50JywgXCJFZGl0IEhpdCBDb3VudC4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9CUkVBS1BPSU5UX1NVUFBPUlRTX0NPTkRJVElPTixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5pc0VxdWFsVG8oJ2Z1bmN0aW9uQnJlYWtwb2ludCcpLCBDT05URVhUX0JSRUFLUE9JTlRfSVRFTV9UWVBFLmlzRXF1YWxUbygnZGF0YUJyZWFrcG9pbnQnKSlcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBCcmVha3BvaW50c1ZpZXcsIGJyZWFrcG9pbnQ6IElGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHR2aWV3LnJlbmRlcklucHV0Qm94KHsgYnJlYWtwb2ludCwgdHlwZTogJ2hpdENvdW50JyB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248QnJlYWtwb2ludHNWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVidWcuZWRpdEJyZWFrcG9pbnRNb2RlJyxcblx0XHRcdHZpZXdJZDogQlJFQUtQT0lOVFNfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZWRpdE1vZGUnLCBcIkVkaXQgTW9kZS4uLlwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdCcmVha3BvaW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENPTlRFWFRfQlJFQUtQT0lOVF9IQVNfTU9ERVMsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5pc0VxdWFsVG8oJ2JyZWFrcG9pbnQnKSwgQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5pc0VxdWFsVG8oJ2V4Y2VwdGlvbkJyZWFrcG9pbnQnKSwgQ09OVEVYVF9CUkVBS1BPSU5UX0lURU1fVFlQRS5pc0VxdWFsVG8oJ2luc3RydWN0aW9uQnJlYWtwb2ludCcpKVxuXHRcdFx0XHQpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBCcmVha3BvaW50c1ZpZXcsIGJyZWFrcG9pbnQ6IElCcmVha3BvaW50KSB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGtpbmQgPSBnZXRNb2RlS2luZEZvckJyZWFrcG9pbnQoYnJlYWtwb2ludCk7XG5cdFx0Y29uc3QgbW9kZXMgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50TW9kZXMoa2luZCk7XG5cdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSkucGljayhcblx0XHRcdG1vZGVzLm1hcChtb2RlID0+ICh7IGxhYmVsOiBtb2RlLmxhYmVsLCBkZXNjcmlwdGlvbjogbW9kZS5kZXNjcmlwdGlvbiwgbW9kZTogbW9kZS5tb2RlIH0pKSxcblx0XHRcdHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3RCcmVha3BvaW50TW9kZScsIFwiU2VsZWN0IEJyZWFrcG9pbnQgTW9kZVwiKSB9XG5cdFx0KTtcblxuXHRcdGlmICghcGlja2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGtpbmQgPT09ICdzb3VyY2UnKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIElCcmVha3BvaW50VXBkYXRlRGF0YT4oKTtcblx0XHRcdGRhdGEuc2V0KGJyZWFrcG9pbnQuZ2V0SWQoKSwgeyBtb2RlOiBwaWNrZWQubW9kZSwgbW9kZUxhYmVsOiBwaWNrZWQubGFiZWwgfSk7XG5cdFx0XHRkZWJ1Z1NlcnZpY2UudXBkYXRlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5vcmlnaW5hbFVyaSwgZGF0YSwgZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEluc3RydWN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0ZGVidWdTZXJ2aWNlLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHMoYnJlYWtwb2ludC5pbnN0cnVjdGlvblJlZmVyZW5jZSwgYnJlYWtwb2ludC5vZmZzZXQpO1xuXHRcdFx0ZGVidWdTZXJ2aWNlLmFkZEluc3RydWN0aW9uQnJlYWtwb2ludCh7IC4uLmJyZWFrcG9pbnQudG9KU09OKCksIG1vZGU6IHBpY2tlZC5tb2RlLCBtb2RlTGFiZWw6IHBpY2tlZC5sYWJlbCB9KTtcblx0XHR9IGVsc2UgaWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBFeGNlcHRpb25CcmVha3BvaW50KSB7XG5cdFx0XHRicmVha3BvaW50Lm1vZGUgPSBwaWNrZWQubW9kZTtcblx0XHRcdGJyZWFrcG9pbnQubW9kZUxhYmVsID0gcGlja2VkLmxhYmVsO1xuXHRcdFx0ZGVidWdTZXJ2aWNlLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRDb25kaXRpb24oYnJlYWtwb2ludCwgYnJlYWtwb2ludC5jb25kaXRpb24pOyAvLyBuby1vcCB0byB0cmlnZ2VyIGEgcmUtc2VuZFxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUF5Qiw2QkFBNkI7QUFDdEQsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLHdCQUF3QjtBQUczQyxTQUFTLG1CQUFtQjtBQUk1QixTQUFTLGNBQWM7QUFDdkIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixTQUFTLG9CQUFvQjtBQUN2RCxZQUFZLGVBQWU7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsU0FBZ0IsY0FBYyxRQUFRLHVCQUF1QjtBQUN0RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCLDZCQUE2QjtBQUM3RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFlBQVksZ0JBQWdCO0FBR3JDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsY0FBYyxnQkFBZ0Isa0JBQWtCO0FBQ3pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCLG1DQUFtQywyQkFBMkIsNkJBQTZCLDhCQUE4QixrQ0FBa0MsdUNBQXVDLDhCQUE4Qix1Q0FBdUMsNkJBQTZCLHVCQUF1Qiw2Q0FBNkMsY0FBYyx1QkFBNkMsZ0JBQStKLGVBQStGLGFBQWE7QUFDNXNCLFNBQVMsWUFBWSxnQkFBZ0IscUJBQXFCLG9CQUFvQiw2QkFBNkI7QUFDM0csU0FBUyw0QkFBNEI7QUFDckMsWUFBWSxXQUFXO0FBRXZCLFNBQVMsY0FBYztBQUN2QixTQUFTLGNBQWM7QUFFdkIsTUFBTSxJQUFJLElBQUk7QUFFZCxTQUFTLGVBQWUsYUFBd0M7QUFDL0QsUUFBTSxXQUFXLElBQUksU0FBUyxJQUFJLE9BQU8scUJBQXFCO0FBQzlELFdBQVMsUUFBUSxXQUFXO0FBQzVCLGNBQVksSUFBSSxRQUFRO0FBRXhCLFNBQU87QUFDUjtBQUVBLE1BQU0sMEJBQTBCO0FBQ3pCLFNBQVMsb0JBQW9CLE9BQW9CLFdBQStCLFlBQTRCO0FBQ2xILFFBQU0sU0FBUyxNQUFNLGVBQWUsRUFBRSxTQUFTLE1BQU0sa0NBQWtDLFNBQVMsRUFBRSxTQUFTLE1BQU0sdUJBQXVCLEVBQUUsU0FBUyxNQUFNLG1CQUFtQixFQUFFLFNBQVMsTUFBTSwwQkFBMEIsRUFBRTtBQUN6TixTQUFPLEtBQUssSUFBSSxZQUFZLE1BQU0sSUFBSTtBQUN2QztBQU1PLE1BQU0sc0JBQXNCO0FBQUEsRUFDbEMsWUFDVSxLQUNBLGFBQ1I7QUFGUTtBQUNBO0FBQUEsRUFDTjtBQUFBLEVBRUosUUFBZ0I7QUFDZixXQUFPLEtBQUssSUFBSSxTQUFTO0FBQUEsRUFDMUI7QUFBQSxFQUVBLElBQUksVUFBbUI7QUFDdEIsV0FBTyxLQUFLLFlBQVksTUFBTSxRQUFNLEdBQUcsT0FBTztBQUFBLEVBQy9DO0FBQUEsRUFFQSxJQUFJLGdCQUF5QjtBQUM1QixVQUFNLGVBQWUsS0FBSyxZQUFZLE9BQU8sUUFBTSxHQUFHLE9BQU8sRUFBRTtBQUMvRCxXQUFPLGVBQWUsS0FBSyxlQUFlLEtBQUssWUFBWTtBQUFBLEVBQzVEO0FBQ0Q7QUFTQSxTQUFTLHlCQUF5QixZQUF5QjtBQUMxRCxRQUFNLE9BQU8sc0JBQXNCLGFBQWEsV0FBVyxzQkFBc0Isd0JBQXdCLGdCQUFnQjtBQUN6SCxTQUFPO0FBQ1I7QUFFTyxJQUFNLGtCQUFOLGNBQThCLFNBQVM7QUFBQSxFQXVCN0MsWUFDQyxTQUNxQixvQkFDVyxjQUNaLG1CQUNHLHNCQUNSLGNBQ2tCLGVBQ0ssb0JBQ2Ysc0JBQ0MsdUJBQ0osbUJBQ0osZUFDZ0IsY0FDbEIsYUFDQyxjQUNvQixpQkFDbEM7QUFDRCxVQUFNLFNBQVMsbUJBQW1CLG9CQUFvQixzQkFBc0IsbUJBQW1CLHVCQUF1QixzQkFBc0IsZUFBZSxjQUFjLFlBQVk7QUFmcko7QUFJQztBQUNLO0FBS047QUFHRztBQXBDcEMsU0FBUSxlQUFlO0FBQ3ZCLFNBQVEsbUJBQW1CO0FBQzNCLFNBQVEsZUFBZTtBQVN2QixTQUFRLGlCQUFpQixvQkFBSSxJQUFZO0FBNkJ4QyxTQUFLLE9BQU8sWUFBWSxXQUFXLE9BQU8seUJBQXlCLGlCQUFpQjtBQUNwRixTQUFLLFVBQVUsS0FBSyxJQUFJO0FBQ3hCLFNBQUsscUJBQXFCLDZCQUE2QixPQUFPLGlCQUFpQjtBQUMvRSxTQUFLLHdCQUF3QixzQ0FBc0MsT0FBTyxpQkFBaUI7QUFDM0YsU0FBSyw2QkFBNkIsNkJBQTZCLE9BQU8saUJBQWlCO0FBQ3ZGLFNBQUssOEJBQThCLHNDQUFzQyxPQUFPLGlCQUFpQjtBQUNqRyxTQUFLLHlCQUF5QixpQ0FBaUMsT0FBTyxpQkFBaUI7QUFDdkYsU0FBSyxVQUFVLEtBQUssYUFBYSxTQUFTLEVBQUUsdUJBQXVCLE1BQU0sS0FBSyxvQkFBb0IsQ0FBQyxDQUFDO0FBQ3BHLFNBQUssVUFBVSxLQUFLLGFBQWEsYUFBYSxFQUFFLGtCQUFrQixNQUFNLEtBQUssb0JBQW9CLENBQUMsQ0FBQztBQUNuRyxTQUFLLFVBQVUsS0FBSyxhQUFhLGlCQUFpQixNQUFNLEtBQUssY0FBYyxDQUFDLENBQUM7QUFDN0UsU0FBSyxjQUFjLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNLEtBQUssc0JBQXNCLElBQUksR0FBRyxHQUFJLENBQUM7QUFBQSxFQUNyRztBQUFBLEVBbkNRLGtCQUFtQztBQUMxQyxXQUFPLEtBQUsscUJBQXFCLFNBQTBCLG9DQUFvQztBQUFBLEVBQ2hHO0FBQUEsRUFtQ21CLFdBQVcsV0FBOEI7QUFDM0QsVUFBTSxXQUFXLFNBQVM7QUFFMUIsU0FBSyxRQUFRLFVBQVUsSUFBSSxZQUFZO0FBQ3ZDLGNBQVUsVUFBVSxJQUFJLG1CQUFtQjtBQUUzQyxTQUFLLE9BQU8sS0FBSyxxQkFBcUI7QUFBQSxNQUNyQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLG9CQUFvQixJQUFJO0FBQUEsTUFDNUI7QUFBQSxRQUNDLEtBQUsscUJBQXFCLGVBQWUseUJBQXlCO0FBQUEsUUFDbEUsS0FBSyxxQkFBcUIsZUFBZSxxQkFBcUIsS0FBSyxNQUFNLEtBQUssNEJBQTRCLEtBQUssNkJBQTZCLEtBQUssa0JBQWtCO0FBQUEsUUFDbkssSUFBSSw2QkFBNkIsS0FBSyxNQUFNLEtBQUssNEJBQTRCLEtBQUssNkJBQTZCLEtBQUssb0JBQW9CLEtBQUssY0FBYyxLQUFLLFlBQVk7QUFBQSxRQUM1SyxJQUFJLGlDQUFpQyxNQUFNLEtBQUssY0FBYyxLQUFLLGtCQUFrQjtBQUFBLFFBQ3JGLEtBQUsscUJBQXFCLGVBQWUsNkJBQTZCLEtBQUssTUFBTSxLQUFLLDZCQUE2QixLQUFLLGtCQUFrQjtBQUFBLFFBQzFJLElBQUksZ0NBQWdDLE1BQU0sS0FBSyxjQUFjLEtBQUssb0JBQW9CLEtBQUssY0FBYyxLQUFLLFlBQVk7QUFBQSxRQUMxSCxLQUFLLHFCQUFxQixlQUFlLHlCQUF5QixLQUFLLE1BQU0sS0FBSyw0QkFBNEIsS0FBSyw2QkFBNkIsS0FBSyxvQkFBb0IsS0FBSyxxQkFBcUI7QUFBQSxRQUNuTSxJQUFJLDRCQUE0QixNQUFNLEtBQUssY0FBYyxLQUFLLG9CQUFvQixLQUFLLGNBQWMsS0FBSyxZQUFZO0FBQUEsUUFDdEgsS0FBSyxxQkFBcUIsZUFBZSw4QkFBOEI7QUFBQSxNQUN4RTtBQUFBLE1BQ0E7QUFBQSxRQUNDLG9CQUFvQixLQUFLLGdCQUFnQixNQUFNO0FBQUEsUUFDL0MsaUNBQWlDO0FBQUEsUUFDakMsa0JBQWtCO0FBQUEsVUFDakIsT0FBTyxDQUFDLFlBQW1DLFFBQVEsTUFBTTtBQUFBLFFBQzFEO0FBQUEsUUFDQSxpQ0FBaUM7QUFBQSxVQUNoQyw0QkFBNEIsQ0FBQyxZQUFtQztBQUMvRCxnQkFBSSxtQkFBbUIsdUJBQXVCO0FBQzdDLHFCQUFPLFVBQVUsb0JBQW9CLFFBQVEsR0FBRztBQUFBLFlBQ2pEO0FBQ0EsZ0JBQUksbUJBQW1CLFlBQVk7QUFDbEMscUJBQU8sR0FBRyxVQUFVLG9CQUFvQixRQUFRLEdBQUcsQ0FBQyxJQUFJLFFBQVEsVUFBVTtBQUFBLFlBQzNFO0FBQ0EsZ0JBQUksbUJBQW1CLG9CQUFvQjtBQUMxQyxxQkFBTyxRQUFRO0FBQUEsWUFDaEI7QUFDQSxnQkFBSSxtQkFBbUIsZ0JBQWdCO0FBQ3RDLHFCQUFPLFFBQVE7QUFBQSxZQUNoQjtBQUNBLGdCQUFJLG1CQUFtQixxQkFBcUI7QUFDM0MscUJBQU8sUUFBUSxTQUFTLFFBQVE7QUFBQSxZQUNqQztBQUNBLGdCQUFJLG1CQUFtQix1QkFBdUI7QUFDN0MscUJBQU8sS0FBSyxRQUFRLFFBQVEsU0FBUyxFQUFFLENBQUM7QUFBQSxZQUN6QztBQUNBLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFVBQ0EsMENBQTBDLENBQUMsYUFBc0M7QUFDaEYsbUJBQU8sU0FBUyxJQUFJLE9BQUs7QUFDeEIsa0JBQUksYUFBYSx1QkFBdUI7QUFDdkMsdUJBQU8sVUFBVSxvQkFBb0IsRUFBRSxHQUFHO0FBQUEsY0FDM0M7QUFDQSxxQkFBTztBQUFBLFlBQ1IsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUFBLFVBQ1o7QUFBQSxRQUNEO0FBQUEsUUFDQSx1QkFBdUIsSUFBSSxpQ0FBaUMsS0FBSyxjQUFjLEtBQUssWUFBWTtBQUFBLFFBQ2hHLDBCQUEwQjtBQUFBLFFBQzFCLGdCQUFnQixLQUFLLHVCQUF1QixFQUFFO0FBQUEsTUFDL0M7QUFBQSxJQUNEO0FBQ0EsU0FBSyxVQUFVLEtBQUssSUFBSTtBQUV4QixnQ0FBNEIsT0FBTyxLQUFLLEtBQUssaUJBQWlCO0FBRTlELFNBQUssVUFBVSxLQUFLLEtBQUssY0FBYyxLQUFLLG1CQUFtQixJQUFJLENBQUM7QUFFcEUsU0FBSyxVQUFVLEtBQUssS0FBSyxtQkFBbUIsT0FBTyxFQUFFLFFBQVEsTUFBTTtBQUNsRSxVQUFJLG1CQUFtQixZQUFZO0FBQ2xDLGNBQU0sS0FBSyxhQUFhLGtCQUFrQixRQUFRLE1BQU0sQ0FBQztBQUFBLE1BQzFELFdBQVcsbUJBQW1CLG9CQUFvQjtBQUNqRCxjQUFNLEtBQUssYUFBYSwwQkFBMEIsUUFBUSxNQUFNLENBQUM7QUFBQSxNQUNsRSxXQUFXLG1CQUFtQixnQkFBZ0I7QUFDN0MsY0FBTSxLQUFLLGFBQWEsc0JBQXNCLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDOUQsV0FBVyxtQkFBbUIsdUJBQXVCO0FBQ3BELGNBQU0sS0FBSyxhQUFhLDZCQUE2QixRQUFRLHNCQUFzQixRQUFRLE1BQU07QUFBQSxNQUNsRyxXQUFXLG1CQUFtQix1QkFBdUI7QUFDcEQsY0FBTSxLQUFLLGFBQWEsa0JBQWtCLFFBQVEsWUFBWSxJQUFJLFFBQU0sR0FBRyxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQ3BGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxLQUFLLFVBQVUsT0FBTSxNQUFLO0FBQzdDLFlBQU0sVUFBVSxFQUFFO0FBQ2xCLFVBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxNQUNEO0FBRUEsVUFBSSxJQUFJLGFBQWEsRUFBRSxZQUFZLEtBQUssRUFBRSxhQUFhLFdBQVcsR0FBRztBQUNwRTtBQUFBLE1BQ0Q7QUFFQSxVQUFJLG1CQUFtQixZQUFZO0FBQ2xDLDZCQUFxQixTQUFTLEVBQUUsWUFBWSxFQUFFLGNBQWMsaUJBQWlCLE9BQU8sRUFBRSxjQUFjLFVBQVUsQ0FBQyxFQUFFLGNBQWMsZUFBZSxLQUFLLGNBQWMsS0FBSyxhQUFhO0FBQUEsTUFDcEw7QUFDQSxVQUFJLG1CQUFtQix1QkFBdUI7QUFDN0MsY0FBTSxrQkFBa0IsTUFBTSxLQUFLLGNBQWMsV0FBVyxxQkFBcUIsUUFBUTtBQUV6RixRQUFDLGdCQUFvQyx5QkFBeUIsUUFBUSxzQkFBc0IsUUFBUSxRQUFRLElBQUksYUFBYSxFQUFFLFlBQVksS0FBSyxFQUFFLGFBQWEsV0FBVyxDQUFDO0FBQUEsTUFDNUs7QUFDQSxVQUFJLElBQUksYUFBYSxFQUFFLFlBQVksS0FBSyxFQUFFLGFBQWEsV0FBVyxLQUFLLG1CQUFtQixzQkFBc0IsWUFBWSxLQUFLLGNBQWMsWUFBWTtBQUUxSixhQUFLLGVBQWUsRUFBRSxZQUFZLFNBQVMsTUFBTSxPQUFPLENBQUM7QUFBQSxNQUMxRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssS0FBSyxVQUFVLE9BQUs7QUFDdkMsWUFBTSxRQUFRLElBQUksc0JBQXNCLENBQUM7QUFDekMsVUFBSSxNQUFNLE9BQU8sUUFBUSxLQUFLLEtBQUssQ0FBQyxJQUFJLGtCQUFrQixFQUFFLE1BQXFCLEdBQUc7QUFDbkYsY0FBTSxVQUFVLEtBQUssS0FBSyxTQUFTO0FBQ25DLFlBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsZ0JBQU0sVUFBVSxRQUFRLENBQUM7QUFDekIsY0FBSSxXQUFXLEVBQUUsbUJBQW1CLHdCQUF3QjtBQUMzRCxpQkFBSyxhQUFhLDJCQUEyQixDQUFDLFFBQVEsU0FBUyxPQUFPO0FBQ3RFLGtCQUFNLGVBQWU7QUFDckIsa0JBQU0sZ0JBQWdCO0FBQUEsVUFDdkI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLEtBQUssS0FBSyx5QkFBeUIsT0FBSztBQUN0RCxZQUFNLFVBQVUsRUFBRSxLQUFLO0FBQ3ZCLFVBQUksbUJBQW1CLHVCQUF1QjtBQUM3QyxZQUFJLEVBQUUsS0FBSyxXQUFXO0FBQ3JCLGVBQUssZUFBZSxJQUFJLFFBQVEsTUFBTSxDQUFDO0FBQUEsUUFDeEMsT0FBTztBQUNOLGVBQUssZUFBZSxPQUFPLFFBQVEsTUFBTSxDQUFDO0FBQUEsUUFDM0M7QUFDQSxhQUFLLFdBQVc7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixPQUFLO0FBQ3RFLFVBQUksRUFBRSxxQkFBcUIsb0NBQW9DLEdBQUc7QUFDakUsY0FBTSxlQUFlLEtBQUssZ0JBQWdCO0FBQzFDLGFBQUssS0FBSyxjQUFjLEVBQUUsb0JBQW9CLGlCQUFpQixPQUFPLENBQUM7QUFDdkUsYUFBSyxvQkFBb0I7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxhQUFhO0FBRWxCLFNBQUssVUFBVSxLQUFLLDBCQUEwQixhQUFXO0FBQ3hELFVBQUksU0FBUztBQUNaLFlBQUksS0FBSyxjQUFjO0FBQ3RCLGVBQUssb0JBQW9CO0FBQUEsUUFDMUI7QUFFQSxZQUFJLEtBQUssa0JBQWtCO0FBQzFCLGVBQUssY0FBYztBQUFBLFFBQ3BCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxpQkFBaUIsS0FBSyxzQkFBc0Isc0JBQXNCLEtBQUssc0JBQXNCLHlCQUF5QixLQUFLLEVBQUUsQ0FBRTtBQUNySSxTQUFLLFVBQVUsZUFBZSw4QkFBOEIsTUFBTTtBQUNqRSxXQUFLLFdBQVc7QUFBQSxJQUNqQixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFbUIsa0JBQWtCLFdBQXdCLE9BQXFCO0FBQ2pGLFVBQU0sa0JBQWtCLFdBQVcsS0FBSztBQUV4QyxVQUFNLHFCQUFxQixJQUFJLE9BQU8sV0FBVyxFQUFFLHlCQUF5QixDQUFDO0FBQzdFLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxJQUFJLFVBQVUsb0JBQW9CO0FBQUEsTUFDckUsY0FBYztBQUFBLE1BQU0sZUFBZTtBQUFBLFFBQ2xDLFdBQVcsQ0FBQyxTQUFTLFVBQVcsS0FBSyxhQUFhLGlCQUFpQixFQUFFLFNBQVMsUUFBUSxTQUFTLFFBQVEsS0FBSyxjQUFlLFFBQVEsR0FBRyxLQUFLO0FBQUEsUUFDM0ksT0FBTyxLQUFLLHFCQUFxQixTQUFpQix1QkFBdUI7QUFBQSxNQUMxRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsUUFBSSxLQUFLLEtBQUssY0FBYyxPQUFPO0FBQUEsRUFDcEM7QUFBQSxFQUVTLFFBQWM7QUFDdEIsVUFBTSxNQUFNO0FBQ1osU0FBSyxNQUFNLFNBQVM7QUFBQSxFQUNyQjtBQUFBLEVBRUEsZUFBZSxNQUFzQztBQUNwRCxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQUEsRUFFQSxJQUFJLGVBQXlDO0FBQzVDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVtQixXQUFXLFFBQWdCLE9BQXFCO0FBQ2xFLFFBQUksS0FBSyxjQUFjO0FBQ3RCO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxRQUFRLEtBQUs7QUFDOUIsU0FBSyxNQUFNLE9BQU8sUUFBUSxLQUFLO0FBQy9CLFFBQUk7QUFDSCxXQUFLLGVBQWU7QUFDcEIsV0FBSyxXQUFXO0FBQUEsSUFDakIsVUFBRTtBQUNELFdBQUssZUFBZTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUFBLEVBRVEsa0JBQWtCLEdBQThEO0FBQ3ZGLFVBQU0sVUFBVSxFQUFFO0FBQ2xCLFFBQUksbUJBQW1CLHVCQUF1QjtBQUU3QyxXQUFLLG1CQUFtQixJQUFJLGtCQUFrQjtBQUM5QyxZQUFNLEVBQUUsV0FBQUEsV0FBVSxJQUFJLHNCQUFzQixLQUFLLEtBQUssV0FBVyxFQUFFLEtBQUssU0FBUyxtQkFBbUIsTUFBTSxDQUFDLEdBQUcsUUFBUTtBQUN0SCxXQUFLLG1CQUFtQixnQkFBZ0I7QUFBQSxRQUN2QyxXQUFXLE1BQU0sRUFBRTtBQUFBLFFBQ25CLFlBQVksTUFBTUE7QUFBQSxRQUNsQixtQkFBbUIsTUFBTTtBQUFBLE1BQzFCLENBQUM7QUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLE9BQU8sbUJBQW1CLGFBQWEsZUFBZSxtQkFBbUIsc0JBQXNCLHdCQUNwRyxtQkFBbUIscUJBQXFCLHVCQUF1QixtQkFBbUIsaUJBQWlCLG1CQUNsRyxtQkFBbUIsd0JBQXdCLDBCQUEwQjtBQUN2RSxTQUFLLG1CQUFtQixJQUFJLElBQUk7QUFDaEMsVUFBTSxVQUFVLEtBQUssYUFBYSxhQUFhLEVBQUU7QUFDakQsVUFBTSxxQkFBcUIsbUJBQW1CLHNCQUFzQixRQUFRLG9CQUFxQixDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsYUFBYTtBQUNwSSxTQUFLLDRCQUE0QixJQUFJLGtCQUFrQjtBQUN2RCxTQUFLLHNCQUFzQixJQUFJLG1CQUFtQixrQkFBa0IsUUFBUSxJQUFJLFNBQVMsc0JBQXNCLE9BQU87QUFDdEgsU0FBSywyQkFBMkIsSUFBSSxLQUFLLGFBQWEsU0FBUyxFQUFFLG1CQUFtQix5QkFBeUIsT0FBc0IsQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUVoSixVQUFNLEVBQUUsVUFBVSxJQUFJLHNCQUFzQixLQUFLLEtBQUssV0FBVyxFQUFFLEtBQUssRUFBRSxTQUFTLG1CQUFtQixNQUFNLENBQUMsR0FBRyxRQUFRO0FBRXhILFNBQUssbUJBQW1CLGdCQUFnQjtBQUFBLE1BQ3ZDLFdBQVcsTUFBTSxFQUFFO0FBQUEsTUFDbkIsWUFBWSxNQUFNO0FBQUEsTUFDbEIsbUJBQW1CLE1BQU07QUFBQSxJQUMxQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsYUFBbUI7QUFDMUIsVUFBTSxpQkFBaUIsS0FBSyxzQkFBc0Isc0JBQXNCLEtBQUssc0JBQXNCLHlCQUF5QixLQUFLLEVBQUUsQ0FBRTtBQUlySSxVQUFNLFlBQVk7QUFFbEIsU0FBSyxrQkFBa0IsS0FBSyxnQkFBZ0IsWUFBWSxXQUFXLEtBQUssSUFBSSwwQkFBMEIsV0FBVyxLQUFLLEtBQUssYUFBYSxJQUFJO0FBQzVJLFNBQUssa0JBQWtCLEtBQUssZ0JBQWdCLFlBQVksWUFBWSxlQUFlLHVCQUF1QixTQUFTLElBQUksS0FBSyxLQUFLLGdCQUFnQixPQUFPO0FBQUEsRUFDeko7QUFBQSxFQUVRLHNCQUFzQixVQUFVLE9BQWE7QUFDcEQsUUFBSSxDQUFDLEtBQUssZUFBZTtBQUN4QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQWMsS0FBSyxhQUFhLGFBQWEsRUFBRSxnQkFBZ0IsY0FBYztBQUNuRixVQUFNLE1BQU0sY0FBYyxLQUFLLGFBQWEsa0JBQWtCLEVBQUUsWUFBWSxXQUFXLElBQUk7QUFDM0YsVUFBTSxVQUFVLEtBQUssVUFBVSxlQUFlLHFCQUFxQjtBQUNuRSxVQUFNLDJCQUEyQixXQUFXLEtBQUssYUFBYSxTQUFTLEVBQUUsZUFBZSxFQUFFLE9BQU8sUUFBTTtBQUN0RyxVQUFJLEdBQUcsWUFBWSxDQUFDLEdBQUcsU0FBUztBQUMvQixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sU0FBUyxLQUFLLGdCQUFnQixxQ0FBcUMsR0FBRyxHQUFHO0FBQy9FLGFBQU8sVUFBVSxJQUFJLHFCQUFxQixNQUFNO0FBQUEsSUFDakQsQ0FBQztBQUVELFFBQUksV0FBVywwQkFBMEIsVUFBVSxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixHQUFHO0FBQzFHLFVBQUksU0FBUztBQUNaLGNBQU0sUUFBUSxJQUFJLGVBQWUsUUFBVyxFQUFFLFdBQVcsS0FBSyxDQUFDLEVBQUUsZUFBZSxPQUFPO0FBQ3ZGLGFBQUssY0FBYyxTQUFTLGNBQWMsUUFBVyxFQUFFLE9BQU8sRUFBRSxVQUFVLE9BQU8sOEJBQThCLFFBQVEsRUFBRSxDQUFDO0FBQzFILFlBQUksS0FBSyxLQUFLLGNBQWMsT0FBTztBQUFBLE1BQ3BDLE9BQU87QUFDTixhQUFLLFlBQVksU0FBUztBQUFBLE1BQzNCO0FBQUEsSUFDRCxPQUFPO0FBQ04sVUFBSSxLQUFLLEtBQUssY0FBYyxPQUFPO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBNEI7QUFDbkMsUUFBSSxLQUFLLGNBQWMsR0FBRztBQUN6QixVQUFJLEtBQUssTUFBTTtBQUNkLGFBQUssYUFBYTtBQUNsQixhQUFLLGVBQWU7QUFBQSxNQUNyQjtBQUNBLFdBQUssc0JBQXNCO0FBQzNCLFdBQUssV0FBVztBQUFBLElBQ2pCLE9BQU87QUFDTixXQUFLLGVBQWU7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFzQjtBQUM3QixRQUFJLEtBQUssY0FBYyxHQUFHO0FBQ3pCLFdBQUssbUJBQW1CO0FBQ3hCLFlBQU0sU0FBUyxLQUFLLGFBQWEsYUFBYSxFQUFFO0FBQ2hELFVBQUksUUFBUTtBQUNaLFVBQUksVUFBVSxPQUFPLGtCQUFrQixPQUFPLGVBQWUsb0JBQW9CLE9BQU8sZUFBZSxpQkFBaUIsU0FBUyxHQUFHO0FBQ25JLGNBQU0sbUJBQW1CLE9BQU8sZUFBZTtBQUMvQyxjQUFNLFdBQVcsS0FBSztBQUN0QixjQUFNLGFBQWEsU0FBUyxLQUFLLE9BQUs7QUFDckMsZ0JBQU0sS0FBSyxFQUFFLGlCQUFpQixPQUFPLFFBQVEsTUFBTSxDQUFDO0FBQ3BELGlCQUFPLE9BQU8sT0FBTyxZQUFZLGlCQUFpQixRQUFRLEVBQUUsTUFBTTtBQUFBLFFBQ25FLENBQUM7QUFDRCxZQUFJLFlBQVk7QUFDZixlQUFLLEtBQUssU0FBUyxDQUFDLFVBQVUsQ0FBQztBQUMvQixlQUFLLEtBQUssYUFBYSxDQUFDLFVBQVUsQ0FBQztBQUNuQyxrQkFBUTtBQUNSLGVBQUsscUJBQXFCO0FBQUEsUUFDM0I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLE9BQU87QUFFWCxjQUFNLFFBQVEsS0FBSyxLQUFLLFNBQVM7QUFDakMsY0FBTSxZQUFZLEtBQUssS0FBSyxhQUFhO0FBQ3pDLFlBQUksS0FBSyxzQkFBc0IsT0FBTyxPQUFPLFNBQVMsS0FBSyxVQUFVLFNBQVMsS0FBSyxrQkFBa0IsR0FBRztBQUN2RyxlQUFLLEtBQUssU0FBUyxDQUFDLENBQUM7QUFDckIsZUFBSyxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQUEsUUFDMUI7QUFDQSxhQUFLLHFCQUFxQjtBQUFBLE1BQzNCO0FBQ0EsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QixPQUFPO0FBQ04sV0FBSyxtQkFBbUI7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLFVBQU0sWUFBWSxLQUFLLGdCQUFnQjtBQUN2QyxTQUFLLEtBQUssWUFBWSxNQUFNLFNBQVM7QUFBQSxFQUN0QztBQUFBLEVBRVEsa0JBQW1FO0FBQzFFLFVBQU0sUUFBUSxLQUFLLGFBQWEsU0FBUztBQUN6QyxVQUFNLFlBQVksS0FBSyxhQUFhLGFBQWEsRUFBRSxnQkFBZ0IsTUFBTTtBQUN6RSxVQUFNLGFBQWEsS0FBSyxnQkFBZ0IsTUFBTTtBQUU5QyxVQUFNLFNBQTBELENBQUM7QUFHakUsZUFBVyxRQUFRLE1BQU0sa0NBQWtDLFNBQVMsR0FBRztBQUN0RSxhQUFPLEtBQUssRUFBRSxTQUFTLE1BQU0sZ0JBQWdCLEtBQUssQ0FBQztBQUFBLElBQ3BEO0FBR0EsZUFBVyxVQUFVLE1BQU0sdUJBQXVCLEdBQUc7QUFDcEQsYUFBTyxLQUFLLEVBQUUsU0FBUyxRQUFRLGdCQUFnQixLQUFLLENBQUM7QUFBQSxJQUN0RDtBQUdBLGVBQVcsVUFBVSxNQUFNLG1CQUFtQixHQUFHO0FBQ2hELGFBQU8sS0FBSyxFQUFFLFNBQVMsUUFBUSxnQkFBZ0IsS0FBSyxDQUFDO0FBQUEsSUFDdEQ7QUFHQSxVQUFNLG9CQUFvQixNQUFNLGVBQWU7QUFDL0MsUUFBSSxjQUFjLGtCQUFrQixTQUFTLEdBQUc7QUFFL0MsWUFBTSxtQkFBbUIsb0JBQUksSUFBMkI7QUFDeEQsaUJBQVcsTUFBTSxtQkFBbUI7QUFDbkMsY0FBTSxNQUFNLEdBQUcsSUFBSSxTQUFTO0FBQzVCLFlBQUksQ0FBQyxpQkFBaUIsSUFBSSxHQUFHLEdBQUc7QUFDL0IsMkJBQWlCLElBQUksS0FBSyxDQUFDLENBQUM7QUFBQSxRQUM3QjtBQUNBLHlCQUFpQixJQUFJLEdBQUcsRUFBRyxLQUFLLEVBQUU7QUFBQSxNQUNuQztBQUdBLGlCQUFXLENBQUMsUUFBUSxXQUFXLEtBQUssa0JBQWtCO0FBQ3JELGNBQU0sTUFBTSxJQUFJLE1BQU0sTUFBTTtBQUM1QixjQUFNLGFBQWEsSUFBSSxzQkFBc0IsS0FBSyxXQUFXO0FBRzdELG9CQUFZLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxhQUFhLEVBQUUsVUFBVTtBQUV0RCxjQUFNLFdBQTRELFlBQVksSUFBSSxTQUFPO0FBQUEsVUFDeEYsU0FBUztBQUFBLFVBQ1QsZ0JBQWdCO0FBQUEsUUFDakIsRUFBRTtBQUVGLGVBQU8sS0FBSztBQUFBLFVBQ1gsU0FBUztBQUFBLFVBQ1QsZ0JBQWdCO0FBQUEsVUFDaEIsV0FBVyxLQUFLLGVBQWUsSUFBSSxXQUFXLE1BQU0sQ0FBQztBQUFBLFVBQ3JEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsT0FBTztBQUVOLGlCQUFXLE1BQU0sbUJBQW1CO0FBQ25DLGVBQU8sS0FBSyxFQUFFLFNBQVMsSUFBSSxnQkFBZ0IsS0FBSyxDQUFDO0FBQUEsTUFDbEQ7QUFBQSxJQUNEO0FBR0EsZUFBVyxXQUFXLE1BQU0sMEJBQTBCLEdBQUc7QUFDeEQsYUFBTyxLQUFLLEVBQUUsU0FBUyxTQUFTLGdCQUFnQixLQUFLLENBQUM7QUFBQSxJQUN2RDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxJQUFZLGVBQWlDO0FBQzVDLFVBQU0sUUFBUSxLQUFLLGFBQWEsU0FBUztBQUN6QyxVQUFNLFlBQVksS0FBSyxhQUFhLGFBQWEsRUFBRSxnQkFBZ0IsTUFBTTtBQUN6RSxVQUFNLFdBQXdDLE1BQU0sa0NBQWtDLFNBQVMsRUFBRyxPQUFPLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxPQUFPLE1BQU0sbUJBQW1CLENBQUMsRUFBRSxPQUFPLE1BQU0sZUFBZSxDQUFDLEVBQUUsT0FBTyxNQUFNLDBCQUEwQixDQUFDO0FBRW5QLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFwZGEsa0JBQU47QUFBQSxFQXlCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F2Q1U7QUFzZGIsTUFBTSxvQkFBMkU7QUFBQSxFQUVoRixZQUFvQixNQUF1QjtBQUF2QjtBQUFBLEVBRXBCO0FBQUEsRUFFQSxVQUFVLFVBQXlDO0FBQ2xELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLFNBQXdDO0FBQ3JELFFBQUksbUJBQW1CLHVCQUF1QjtBQUM3QyxhQUFPLDBCQUEwQjtBQUFBLElBQ2xDO0FBQ0EsUUFBSSxtQkFBbUIsWUFBWTtBQUNsQyxhQUFPLG9CQUFvQjtBQUFBLElBQzVCO0FBQ0EsUUFBSSxtQkFBbUIsb0JBQW9CO0FBQzFDLFlBQU0scUJBQXFCLEtBQUssS0FBSyxjQUFjO0FBQ25ELFVBQUksQ0FBQyxRQUFRLFFBQVMsc0JBQXNCLG1CQUFtQixNQUFNLE1BQU0sUUFBUSxNQUFNLEdBQUk7QUFDNUYsZUFBTyxnQ0FBZ0M7QUFBQSxNQUN4QztBQUVBLGFBQU8sNEJBQTRCO0FBQUEsSUFDcEM7QUFDQSxRQUFJLG1CQUFtQixxQkFBcUI7QUFDM0MsWUFBTSxxQkFBcUIsS0FBSyxLQUFLLGNBQWM7QUFDbkQsVUFBSSxzQkFBc0IsbUJBQW1CLE1BQU0sTUFBTSxRQUFRLE1BQU0sR0FBRztBQUN6RSxlQUFPLGlDQUFpQztBQUFBLE1BQ3pDO0FBQ0EsYUFBTyw2QkFBNkI7QUFBQSxJQUNyQztBQUNBLFFBQUksbUJBQW1CLGdCQUFnQjtBQUN0QyxZQUFNLHFCQUFxQixLQUFLLEtBQUssY0FBYztBQUNuRCxVQUFJLHNCQUFzQixtQkFBbUIsTUFBTSxNQUFNLFFBQVEsTUFBTSxHQUFHO0FBQ3pFLGVBQU8sNEJBQTRCO0FBQUEsTUFDcEM7QUFFQSxhQUFPLHdCQUF3QjtBQUFBLElBQ2hDO0FBQ0EsUUFBSSxtQkFBbUIsdUJBQXVCO0FBQzdDLGFBQU8sK0JBQStCO0FBQUEsSUFDdkM7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBOEVBLE1BQU0sa0NBQWtDLG9CQUFJLElBQXlCO0FBRXJFLElBQU0sNEJBQU4sTUFBa0k7QUFBQSxFQUlqSSxZQUNpQyxjQUNBLGNBQ0EsY0FDL0I7QUFIK0I7QUFDQTtBQUNBO0FBQUEsRUFDN0I7QUFBQSxFQUVKLElBQUksYUFBYTtBQUNoQixXQUFPLDBCQUEwQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxlQUFlLFdBQXdEO0FBQ3RFLFVBQU0sT0FBdUMsdUJBQU8sT0FBTyxJQUFJO0FBQy9ELFNBQUsscUJBQXFCLElBQUksZ0JBQWdCO0FBQzlDLFNBQUssc0JBQXNCLElBQUksZ0JBQWdCO0FBQy9DLFNBQUssb0JBQW9CLElBQUksS0FBSyxrQkFBa0I7QUFFcEQsU0FBSyxZQUFZO0FBQ2pCLGNBQVUsVUFBVSxJQUFJLGNBQWMsbUJBQW1CO0FBRXpELFNBQUssb0JBQW9CLElBQUksYUFBYSxNQUFNO0FBQy9DLGdCQUFVLFVBQVUsT0FBTyxjQUFjLG1CQUFtQjtBQUFBLElBQzdELENBQUMsQ0FBQztBQUVGLFNBQUssV0FBVyxJQUFJLGlCQUFpQixJQUFJLE9BQU8scUJBQXFCO0FBQ3JFLFNBQUssU0FBUyxRQUFRLFdBQVc7QUFDakMsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFFBQVE7QUFDMUMsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVMsU0FBUyxNQUFNO0FBQ3pELFlBQU0sVUFBVSxLQUFLLFNBQVM7QUFDOUIsWUFBTSxVQUFVLFlBQVksVUFBVSxPQUFPO0FBQzdDLGlCQUFXLE1BQU0sS0FBSyxRQUFRLGFBQWE7QUFDMUMsYUFBSyxhQUFhLDJCQUEyQixTQUFTLEVBQUU7QUFBQSxNQUN6RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsUUFBSSxPQUFPLEtBQUssV0FBVyxLQUFLLFNBQVMsT0FBTztBQUNoRCxTQUFLLE9BQU8sSUFBSSxPQUFPLEtBQUssV0FBVyxFQUFFLFdBQVcsQ0FBQztBQUNyRCxRQUFJLE9BQU8sS0FBSyxXQUFXLEVBQUUsZ0JBQWdCLENBQUM7QUFFOUMsU0FBSyxZQUFZLElBQUksVUFBVSxLQUFLLFNBQVM7QUFDN0MsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVM7QUFFM0MsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsTUFBOEMsUUFBZ0IsTUFBNEM7QUFDdkgsVUFBTSxhQUFhLEtBQUs7QUFDeEIsU0FBSyxVQUFVO0FBRWYsU0FBSyxLQUFLLGNBQWMsS0FBSyxhQUFhLG9CQUFvQixXQUFXLEdBQUc7QUFDNUUsU0FBSyxVQUFVLFVBQVUsT0FBTyxZQUFZLENBQUMsS0FBSyxhQUFhLFNBQVMsRUFBRSx3QkFBd0IsQ0FBQztBQUVuRyxVQUFNLFdBQVcsS0FBSyxhQUFhLFlBQVksV0FBVyxLQUFLLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFDakYsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxXQUFXLFFBQVEsQ0FBQztBQUczSCxRQUFJLFdBQVcsZUFBZTtBQUM3QixXQUFLLFNBQVMsVUFBVTtBQUFBLElBQ3pCLE9BQU87QUFDTixXQUFLLFNBQVMsVUFBVSxXQUFXO0FBQUEsSUFDcEM7QUFHQSxTQUFLLFVBQVUsTUFBTTtBQUNyQixVQUFNLGVBQWUsS0FBSyxtQkFBbUIsSUFBSSxJQUFJO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLFNBQVMsMkJBQTJCLDRCQUE0QjtBQUFBLE1BQ2hFLFVBQVUsWUFBWSxRQUFRLEtBQUs7QUFBQSxNQUNuQztBQUFBLE1BQ0EsWUFBWTtBQUNYLG1CQUFXLE1BQU0sV0FBVyxhQUFhO0FBQ3hDLGdCQUFNLEtBQUssYUFBYSxrQkFBa0IsR0FBRyxNQUFNLENBQUM7QUFBQSxRQUNyRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLFVBQVUsS0FBSyxjQUFjLEVBQUUsTUFBTSxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLHlCQUF5QixNQUFtRSxRQUFnQixNQUE0QztBQUN2SixVQUFNLFdBQVcsS0FBSyxRQUFRO0FBQzlCLFVBQU0sYUFBYSxTQUFTLFNBQVMsU0FBUyxDQUFDO0FBQy9DLFNBQUssVUFBVTtBQUdmLFVBQU0sUUFBUSxTQUFTLElBQUksT0FBSyxVQUFVLG9CQUFvQixFQUFFLEdBQUcsQ0FBQztBQUNwRSxTQUFLLEtBQUssY0FBYyxNQUFNLEtBQUssR0FBRztBQUV0QyxVQUFNLFdBQVcsS0FBSyxhQUFhLFlBQVksV0FBVyxLQUFLLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFDakYsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxXQUFXLFFBQVEsQ0FBQztBQUczSCxRQUFJLFdBQVcsZUFBZTtBQUM3QixXQUFLLFNBQVMsVUFBVTtBQUFBLElBQ3pCLE9BQU87QUFDTixXQUFLLFNBQVMsVUFBVSxXQUFXO0FBQUEsSUFDcEM7QUFHQSxTQUFLLFVBQVUsTUFBTTtBQUNyQixVQUFNLGVBQWUsS0FBSyxtQkFBbUIsSUFBSSxJQUFJO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLFNBQVMsMkJBQTJCLDRCQUE0QjtBQUFBLE1BQ2hFLFVBQVUsWUFBWSxRQUFRLEtBQUs7QUFBQSxNQUNuQztBQUFBLE1BQ0EsWUFBWTtBQUNYLG1CQUFXLE1BQU0sV0FBVyxhQUFhO0FBQ3hDLGdCQUFNLEtBQUssYUFBYSxrQkFBa0IsR0FBRyxNQUFNLENBQUM7QUFBQSxRQUNyRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLFVBQVUsS0FBSyxjQUFjLEVBQUUsTUFBTSxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLGVBQWUsU0FBaUQsT0FBZSxjQUFvRDtBQUNsSSxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSwwQkFBMEIsTUFBbUUsT0FBZSxjQUFvRDtBQUMvSixpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxnQkFBZ0IsY0FBb0Q7QUFDbkUsaUJBQWEsb0JBQW9CLFFBQVE7QUFBQSxFQUMxQztBQUNEO0FBL0hNLDBCQUVXLEtBQUs7QUFGaEIsNEJBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBaUlOLElBQU0sc0JBQU4sTUFBMkc7QUFBQSxFQUUxRyxZQUNTLE1BQ0EsNEJBQ0EsNkJBQ0Esb0JBQ3dCLGNBQ0EsY0FDQSxjQUNJLGtCQUNuQztBQVJPO0FBQ0E7QUFDQTtBQUNBO0FBQ3dCO0FBQ0E7QUFDQTtBQUNJO0FBQUEsRUFHckM7QUFBQSxFQUlBLElBQUksYUFBYTtBQUNoQixXQUFPLG9CQUFvQjtBQUFBLEVBQzVCO0FBQUEsRUFFQSxlQUFlLFdBQWlEO0FBQy9ELFVBQU0sT0FBZ0MsdUJBQU8sT0FBTyxJQUFJO0FBQ3hELFNBQUsscUJBQXFCLElBQUksZ0JBQWdCO0FBQzlDLFNBQUssc0JBQXNCLElBQUksZ0JBQWdCO0FBQy9DLFNBQUssb0JBQW9CLElBQUksS0FBSyxrQkFBa0I7QUFFcEQsU0FBSyxhQUFhO0FBQ2xCLGNBQVUsVUFBVSxJQUFJLFlBQVk7QUFFcEMsU0FBSyxvQkFBb0IsSUFBSSxhQUFhLE1BQU07QUFDL0MsZ0JBQVUsVUFBVSxPQUFPLFlBQVk7QUFBQSxJQUN4QyxDQUFDLENBQUM7QUFFRixTQUFLLE9BQU8sRUFBRSxPQUFPO0FBQ3JCLFNBQUssV0FBVyxlQUFlLEtBQUssbUJBQW1CO0FBRXZELFNBQUssb0JBQW9CLElBQUksS0FBSyxTQUFTLFNBQVMsTUFBTTtBQUN6RCxXQUFLLGFBQWEsMkJBQTJCLENBQUMsS0FBSyxRQUFRLFNBQVMsS0FBSyxPQUFPO0FBQUEsSUFDakYsQ0FBQyxDQUFDO0FBRUYsUUFBSSxPQUFPLEtBQUssWUFBWSxLQUFLLElBQUk7QUFDckMsUUFBSSxPQUFPLEtBQUssWUFBWSxLQUFLLFNBQVMsT0FBTztBQUVqRCxTQUFLLE9BQU8sSUFBSSxPQUFPLEtBQUssWUFBWSxFQUFFLFdBQVcsQ0FBQztBQUV0RCxTQUFLLFdBQVcsSUFBSSxPQUFPLEtBQUssWUFBWSxFQUFFLGdCQUFnQixDQUFDO0FBQy9ELFNBQUssWUFBWSxJQUFJLFVBQVUsS0FBSyxVQUFVO0FBQzlDLFNBQUssb0JBQW9CLElBQUksS0FBSyxTQUFTO0FBQzNDLFVBQU0saUJBQWlCLElBQUksT0FBTyxLQUFLLFlBQVksRUFBRSxrQkFBa0IsQ0FBQztBQUN4RSxTQUFLLFFBQVEsSUFBSSxPQUFPLGdCQUFnQixFQUFFLHFDQUFxQyxDQUFDO0FBRWhGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLE1BQW9DLE9BQWUsTUFBcUM7QUFDckcsVUFBTSxhQUFhLEtBQUs7QUFDeEIsU0FBSyxVQUFVO0FBRWYsUUFBSSxLQUFLLFFBQVEsR0FBRztBQUNuQixXQUFLLDBCQUEwQixZQUFZLElBQUk7QUFBQSxJQUNoRCxPQUFPO0FBQ04sV0FBSywwQkFBMEIsWUFBWSxJQUFJO0FBQUEsSUFDaEQ7QUFFQSxTQUFLLHVCQUF1QixZQUFZLElBQUk7QUFBQSxFQUM3QztBQUFBLEVBRUEseUJBQXlCLE1BQXlELE9BQWUsTUFBcUM7QUFDckksVUFBTSxhQUFhLEtBQUssUUFBUSxTQUFTLEtBQUssUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUN6RSxTQUFLLFVBQVU7QUFDZixTQUFLLDBCQUEwQixZQUFZLElBQUk7QUFDL0MsU0FBSyx1QkFBdUIsWUFBWSxJQUFJO0FBQUEsRUFDN0M7QUFBQSxFQUVRLHVCQUF1QixZQUF5QixNQUFxQztBQUM1RixTQUFLLFdBQVcsVUFBVSxPQUFPLFlBQVksQ0FBQyxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixDQUFDO0FBQ3BHLFFBQUksZUFBZSxXQUFXLFdBQVcsU0FBUztBQUNsRCxRQUFJLFdBQVcsUUFBUTtBQUN0QixzQkFBZ0IsSUFBSSxXQUFXLE1BQU07QUFBQSxJQUN0QztBQUNBLFFBQUksV0FBVyxXQUFXO0FBQ3pCLHFCQUFlLEdBQUcsV0FBVyxTQUFTLEtBQUssWUFBWTtBQUFBLElBQ3hEO0FBQ0EsU0FBSyxNQUFNLGNBQWM7QUFDekIsU0FBSyxTQUFTLFVBQVUsV0FBVztBQUVuQyxVQUFNLEVBQUUsU0FBUyxLQUFLLElBQUksNEJBQTRCLEtBQUssYUFBYSxPQUFPLEtBQUssYUFBYSxTQUFTLEVBQUUsd0JBQXdCLEdBQUcsWUFBWSxLQUFLLGNBQWMsS0FBSyxhQUFhLFNBQVMsQ0FBQztBQUNsTSxTQUFLLEtBQUssWUFBWSxVQUFVLFlBQVksSUFBSTtBQUNoRCxTQUFLLG1CQUFtQixJQUFJLEtBQUssYUFBYSxrQkFBa0Isd0JBQXdCLE9BQU8sR0FBRyxLQUFLLFlBQVksV0FBVyxXQUFXLFdBQVcsRUFBRSxDQUFDO0FBRXZKLFVBQU0sY0FBYyxLQUFLLGFBQWEsVUFBVSxNQUFNLFdBQVcsS0FBSyxhQUFhLFVBQVUsTUFBTTtBQUNuRyxRQUFJLGVBQWUsQ0FBQyxXQUFXLFVBQVU7QUFDeEMsV0FBSyxXQUFXLFVBQVUsSUFBSSxVQUFVO0FBQUEsSUFDekM7QUFFQSxVQUFNLFVBQVUsS0FBSyxhQUFhLGFBQWEsRUFBRTtBQUNqRCxTQUFLLDRCQUE0QixJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxhQUFhLDhCQUE4QjtBQUN0RyxTQUFLLG1CQUFtQixJQUFJLFlBQVk7QUFDeEMsU0FBSywyQkFBMkIsSUFBSSxLQUFLLGFBQWEsU0FBUyxFQUFFLG1CQUFtQixRQUFRLEVBQUUsU0FBUyxDQUFDO0FBQ3hHLFVBQU0sRUFBRSxRQUFRLElBQUksb0JBQW9CLEtBQUssS0FBSyxXQUFXLEVBQUUsS0FBSyxZQUFZLG1CQUFtQixLQUFLLENBQUMsR0FBRyxRQUFRO0FBQ3BILFNBQUssVUFBVSxNQUFNO0FBQ3JCLFNBQUssVUFBVSxLQUFLLFNBQVMsRUFBRSxNQUFNLE1BQU0sT0FBTyxNQUFNLENBQUM7QUFDekQsb0NBQWdDLElBQUksV0FBVyxNQUFNLEdBQUcsS0FBSyxVQUFVLE9BQU87QUFBQSxFQUMvRTtBQUFBLEVBRVEsMEJBQTBCLFlBQXlCLE1BQXFDO0FBQy9GLFNBQUssS0FBSyxjQUFjLFVBQVUsb0JBQW9CLFdBQVcsR0FBRztBQUNwRSxTQUFLLFNBQVMsY0FBYyxLQUFLLGFBQWEsWUFBWSxVQUFVLFFBQVEsV0FBVyxHQUFHLEdBQUcsRUFBRSxVQUFVLEtBQUssQ0FBQztBQUFBLEVBQ2hIO0FBQUEsRUFFUSwwQkFBMEIsWUFBeUIsTUFBcUM7QUFDL0YsU0FBSyxLQUFLLGNBQWMsU0FBUyxXQUFXLFlBQVk7QUFDeEQsU0FBSyxTQUFTLGNBQWM7QUFFNUIsU0FBSyxpQkFBaUIscUJBQXFCLFdBQVcsR0FBRyxFQUFFLEtBQUssZUFBYTtBQUM1RSxVQUFJLEtBQUssWUFBWSxZQUFZO0FBQ2hDLGtCQUFVLFFBQVE7QUFDbEI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxtQkFBbUIsSUFBSSxTQUFTO0FBQ3JDLFlBQU0sUUFBUSxVQUFVLE9BQU87QUFDL0IsVUFBSSxTQUFTLFdBQVcsY0FBYyxNQUFNLGFBQWEsR0FBRztBQUMzRCxjQUFNLGNBQWMsTUFBTSxlQUFlLFdBQVcsVUFBVSxFQUFFLEtBQUs7QUFDckUsYUFBSyxLQUFLLGNBQWMsZUFBZSxTQUFTLGFBQWEsY0FBYztBQUFBLE1BQzVFLE9BQU87QUFDTixhQUFLLEtBQUssY0FBYyxTQUFTLGdCQUFnQixrQkFBa0I7QUFBQSxNQUNwRTtBQUFBLElBQ0QsQ0FBQyxFQUFFLE1BQU0sTUFBTTtBQUNkLFVBQUksS0FBSyxZQUFZLFlBQVk7QUFDaEMsYUFBSyxLQUFLLGNBQWMsU0FBUyxrQkFBa0Isb0JBQW9CO0FBQUEsTUFDeEU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxlQUFlLE1BQW9DLE9BQWUsVUFBeUM7QUFDMUcsYUFBUyxtQkFBbUIsTUFBTTtBQUFBLEVBQ25DO0FBQUEsRUFFQSwwQkFBMEIsTUFBeUQsT0FBZSxVQUF5QztBQUMxSSxhQUFTLG1CQUFtQixNQUFNO0FBQUEsRUFDbkM7QUFBQSxFQUVBLGdCQUFnQixjQUE2QztBQUM1RCxpQkFBYSxvQkFBb0IsUUFBUTtBQUFBLEVBQzFDO0FBQ0Q7QUFsSk0sb0JBZVcsS0FBSztBQWZoQixzQkFBTjtBQUFBLEVBT0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZHO0FBb0pOLE1BQU0sZ0NBQU4sTUFBTSw4QkFBZ0k7QUFBQSxFQUVySSxZQUNTLE1BQ0EsNEJBQ0EsNkJBQ0Esb0JBQ0EsY0FDUyxjQUNoQjtBQU5PO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDUztBQUFBLEVBR2xCO0FBQUEsRUFJQSxJQUFJLGFBQWE7QUFDaEIsV0FBTyw4QkFBNkI7QUFBQSxFQUNyQztBQUFBLEVBRUEsZUFBZSxXQUEwRDtBQUN4RSxVQUFNLE9BQXlDLHVCQUFPLE9BQU8sSUFBSTtBQUNqRSxTQUFLLHFCQUFxQixJQUFJLGdCQUFnQjtBQUM5QyxTQUFLLHNCQUFzQixJQUFJLGdCQUFnQjtBQUMvQyxTQUFLLG9CQUFvQixJQUFJLEtBQUssa0JBQWtCO0FBQ3BELFNBQUssYUFBYSxJQUFJLE9BQU8sV0FBVyxFQUFFLGFBQWEsQ0FBQztBQUV4RCxTQUFLLFdBQVcsZUFBZSxLQUFLLG1CQUFtQjtBQUN2RCxTQUFLLG9CQUFvQixJQUFJLEtBQUssU0FBUyxTQUFTLE1BQU07QUFDekQsV0FBSyxhQUFhLDJCQUEyQixDQUFDLEtBQUssUUFBUSxTQUFTLEtBQUssT0FBTztBQUFBLElBQ2pGLENBQUMsQ0FBQztBQUVGLFFBQUksT0FBTyxLQUFLLFlBQVksS0FBSyxTQUFTLE9BQU87QUFFakQsU0FBSyxPQUFPLElBQUksT0FBTyxLQUFLLFlBQVksRUFBRSxXQUFXLENBQUM7QUFDdEQsU0FBSyxZQUFZLElBQUksT0FBTyxLQUFLLFlBQVksRUFBRSxnQkFBZ0IsQ0FBQztBQUNoRSxTQUFLLFdBQVcsVUFBVSxJQUFJLFdBQVc7QUFFekMsU0FBSyxZQUFZLElBQUksVUFBVSxLQUFLLFVBQVU7QUFDOUMsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVM7QUFDM0MsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLEtBQUssWUFBWSxFQUFFLGtCQUFrQixDQUFDO0FBQ3hFLFNBQUssUUFBUSxJQUFJLE9BQU8sZ0JBQWdCLEVBQUUscUNBQXFDLENBQUM7QUFFaEYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsTUFBNkMsT0FBZSxNQUE4QztBQUN2SCxVQUFNLHNCQUFzQixLQUFLO0FBQ2pDLFNBQUssMEJBQTBCLHFCQUFxQixJQUFJO0FBQUEsRUFDekQ7QUFBQSxFQUVBLHlCQUF5QixNQUFrRSxPQUFlLE1BQThDO0FBQ3ZKLFVBQU0sc0JBQXNCLEtBQUssUUFBUSxTQUFTLEtBQUssUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUNsRixTQUFLLDBCQUEwQixxQkFBcUIsSUFBSTtBQUFBLEVBQ3pEO0FBQUEsRUFFUSwwQkFBMEIscUJBQTJDLE1BQThDO0FBQzFILFNBQUssVUFBVTtBQUNmLFNBQUssS0FBSyxjQUFjLG9CQUFvQixTQUFTLEdBQUcsb0JBQW9CLE1BQU07QUFDbEYsVUFBTSwyQkFBMkIsb0JBQW9CLFdBQVksb0JBQW9CLGVBQWUsS0FBSyxLQUFLLGNBQWUsb0JBQW9CLFdBQVcsU0FBUyxpQ0FBaUMsaUNBQWlDO0FBQ3ZPLFNBQUssbUJBQW1CLElBQUksS0FBSyxhQUFhLGtCQUFrQix3QkFBd0IsT0FBTyxHQUFHLEtBQUssWUFBWSx3QkFBd0IsQ0FBQztBQUM1SSxTQUFLLFdBQVcsVUFBVSxPQUFPLFlBQVksQ0FBQyxvQkFBb0IsUUFBUTtBQUMxRSxTQUFLLFNBQVMsVUFBVSxvQkFBb0I7QUFDNUMsU0FBSyxVQUFVLGNBQWMsb0JBQW9CLGFBQWE7QUFDOUQsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxXQUFXLFNBQVMsdUJBQXVCLDZCQUE2QixvQkFBb0IsU0FBUyxDQUFDLENBQUM7QUFFOU0sUUFBSSxvQkFBb0IsV0FBVztBQUNsQyxXQUFLLE1BQU0sY0FBYyxvQkFBb0I7QUFDN0MsV0FBSyxNQUFNLE1BQU0sVUFBVTtBQUFBLElBQzVCLE9BQU87QUFDTixXQUFLLE1BQU0sTUFBTSxVQUFVO0FBQUEsSUFDNUI7QUFFQSxTQUFLLDRCQUE0QixJQUFLLG9CQUE0QyxpQkFBaUI7QUFDbkcsU0FBSyxtQkFBbUIsSUFBSSxxQkFBcUI7QUFDakQsU0FBSywyQkFBMkIsSUFBSSxLQUFLLGFBQWEsU0FBUyxFQUFFLG1CQUFtQixXQUFXLEVBQUUsU0FBUyxDQUFDO0FBQzNHLFVBQU0sRUFBRSxRQUFRLElBQUksb0JBQW9CLEtBQUssS0FBSyxXQUFXLEVBQUUsS0FBSyxxQkFBcUIsbUJBQW1CLEtBQUssQ0FBQyxHQUFHLFFBQVE7QUFDN0gsU0FBSyxVQUFVLE1BQU07QUFDckIsU0FBSyxVQUFVLEtBQUssU0FBUyxFQUFFLE1BQU0sTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUN6RCxvQ0FBZ0MsSUFBSSxvQkFBb0IsTUFBTSxHQUFHLEtBQUssVUFBVSxPQUFPO0FBQUEsRUFDeEY7QUFBQSxFQUVBLGVBQWUsTUFBNkMsT0FBZSxjQUFzRDtBQUNoSSxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSwwQkFBMEIsTUFBa0UsT0FBZSxjQUFzRDtBQUNoSyxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxnQkFBZ0IsY0FBc0Q7QUFDckUsaUJBQWEsb0JBQW9CLFFBQVE7QUFBQSxFQUMxQztBQUNEO0FBNUZNLDhCQWFXLEtBQUs7QUFidEIsSUFBTSwrQkFBTjtBQThGQSxJQUFNLDhCQUFOLE1BQWtJO0FBQUEsRUFFakksWUFDUyxNQUNBLDZCQUNBLG9CQUN3QixjQUNBLGNBQ0EsY0FDL0I7QUFOTztBQUNBO0FBQ0E7QUFDd0I7QUFDQTtBQUNBO0FBQUEsRUFHakM7QUFBQSxFQUlBLElBQUksYUFBYTtBQUNoQixXQUFPLDRCQUE0QjtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxlQUFlLFdBQXlEO0FBQ3ZFLFVBQU0sT0FBd0MsdUJBQU8sT0FBTyxJQUFJO0FBQ2hFLFNBQUsscUJBQXFCLElBQUksZ0JBQWdCO0FBQzlDLFNBQUssc0JBQXNCLElBQUksZ0JBQWdCO0FBQy9DLFNBQUssb0JBQW9CLElBQUksS0FBSyxrQkFBa0I7QUFDcEQsU0FBSyxhQUFhLElBQUksT0FBTyxXQUFXLEVBQUUsYUFBYSxDQUFDO0FBRXhELFNBQUssT0FBTyxFQUFFLE9BQU87QUFDckIsU0FBSyxXQUFXLGVBQWUsS0FBSyxtQkFBbUI7QUFDdkQsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVMsU0FBUyxNQUFNO0FBQ3pELFdBQUssYUFBYSwyQkFBMkIsQ0FBQyxLQUFLLFFBQVEsU0FBUyxLQUFLLE9BQU87QUFBQSxJQUNqRixDQUFDLENBQUM7QUFFRixRQUFJLE9BQU8sS0FBSyxZQUFZLEtBQUssSUFBSTtBQUNyQyxRQUFJLE9BQU8sS0FBSyxZQUFZLEtBQUssU0FBUyxPQUFPO0FBRWpELFNBQUssT0FBTyxJQUFJLE9BQU8sS0FBSyxZQUFZLEVBQUUsV0FBVyxDQUFDO0FBQ3RELFNBQUssWUFBWSxJQUFJLE9BQU8sS0FBSyxZQUFZLEVBQUUsZ0JBQWdCLENBQUM7QUFFaEUsU0FBSyxZQUFZLElBQUksVUFBVSxLQUFLLFVBQVU7QUFDOUMsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVM7QUFDM0MsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLEtBQUssWUFBWSxFQUFFLGtCQUFrQixDQUFDO0FBQ3hFLFNBQUssUUFBUSxJQUFJLE9BQU8sZ0JBQWdCLEVBQUUscUNBQXFDLENBQUM7QUFFaEYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsTUFBMkMsUUFBZ0IsTUFBNkM7QUFDckgsU0FBSyx5QkFBeUIsS0FBSyxTQUFTLElBQUk7QUFBQSxFQUNqRDtBQUFBLEVBRUEseUJBQXlCLE1BQWdFLFFBQWdCLE1BQTZDO0FBQ3JKLFNBQUsseUJBQXlCLEtBQUssUUFBUSxTQUFTLEtBQUssUUFBUSxTQUFTLFNBQVMsQ0FBQyxHQUFHLElBQUk7QUFBQSxFQUM1RjtBQUFBLEVBRVEseUJBQXlCLG9CQUF3QyxNQUE2QztBQUNySCxTQUFLLFVBQVU7QUFDZixTQUFLLEtBQUssY0FBYyxtQkFBbUI7QUFDM0MsVUFBTSxFQUFFLE1BQU0sUUFBUSxJQUFJLDRCQUE0QixLQUFLLGFBQWEsT0FBTyxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixHQUFHLG9CQUFvQixLQUFLLGNBQWMsS0FBSyxhQUFhLFNBQVMsQ0FBQztBQUMxTSxTQUFLLEtBQUssWUFBWSxVQUFVLFlBQVksSUFBSTtBQUNoRCxTQUFLLG1CQUFtQixJQUFJLEtBQUssYUFBYSxrQkFBa0Isd0JBQXdCLE9BQU8sR0FBRyxLQUFLLE1BQU0sVUFBVSxVQUFVLEVBQUUsQ0FBQztBQUNwSSxTQUFLLFNBQVMsVUFBVSxtQkFBbUI7QUFDM0MsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxZQUFZLFVBQVUsVUFBVSxFQUFFLENBQUM7QUFDMUksUUFBSSxtQkFBbUIsYUFBYSxtQkFBbUIsY0FBYztBQUNwRSxXQUFLLFVBQVUsY0FBYyxTQUFTLHlCQUF5QixtQ0FBbUMsbUJBQW1CLFdBQVcsbUJBQW1CLFlBQVk7QUFBQSxJQUNoSyxPQUFPO0FBQ04sV0FBSyxVQUFVLGNBQWMsbUJBQW1CLGFBQWEsbUJBQW1CLGdCQUFnQjtBQUFBLElBQ2pHO0FBRUEsUUFBSSxtQkFBbUIsV0FBVztBQUNqQyxXQUFLLE1BQU0sY0FBYyxtQkFBbUI7QUFDNUMsV0FBSyxNQUFNLE1BQU0sVUFBVTtBQUFBLElBQzVCLE9BQU87QUFDTixXQUFLLE1BQU0sTUFBTSxVQUFVO0FBQUEsSUFDNUI7QUFHQSxVQUFNLFVBQVUsS0FBSyxhQUFhLGFBQWEsRUFBRTtBQUNqRCxTQUFLLFdBQVcsVUFBVSxPQUFPLFlBQWEsV0FBVyxDQUFDLFFBQVEsYUFBYSwrQkFBZ0MsQ0FBQyxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixDQUFDO0FBQ3RLLFFBQUksV0FBVyxDQUFDLFFBQVEsYUFBYSw2QkFBNkI7QUFDakUsV0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxZQUFZLFNBQVMsbUNBQW1DLDJEQUEyRCxDQUFDLENBQUM7QUFBQSxJQUM3TjtBQUVBLFNBQUssNEJBQTRCLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxRQUFRLGFBQWEsOEJBQThCO0FBQ3RHLFNBQUssbUJBQW1CLElBQUksb0JBQW9CO0FBQ2hELFVBQU0sRUFBRSxRQUFRLElBQUksb0JBQW9CLEtBQUssS0FBSyxXQUFXLEVBQUUsS0FBSyxvQkFBb0IsbUJBQW1CLEtBQUssQ0FBQyxHQUFHLFFBQVE7QUFDNUgsU0FBSyxVQUFVLE1BQU07QUFDckIsU0FBSyxVQUFVLEtBQUssU0FBUyxFQUFFLE1BQU0sTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUN6RCxvQ0FBZ0MsSUFBSSxtQkFBbUIsTUFBTSxHQUFHLEtBQUssVUFBVSxPQUFPO0FBQUEsRUFDdkY7QUFBQSxFQUVBLGVBQWUsTUFBMkMsT0FBZSxjQUFxRDtBQUM3SCxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSwwQkFBMEIsTUFBZ0UsT0FBZSxjQUFxRDtBQUM3SixpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxnQkFBZ0IsY0FBcUQ7QUFDcEUsaUJBQWEsb0JBQW9CLFFBQVE7QUFBQSxFQUMxQztBQUNEO0FBckdNLDRCQWFXLEtBQUs7QUFiaEIsOEJBQU47QUFBQSxFQU1HO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVJHO0FBdUdOLElBQU0sMEJBQU4sTUFBc0g7QUFBQSxFQUVySCxZQUNTLE1BQ0EsNEJBQ0EsNkJBQ0Esb0JBQ0EsdUJBQ3dCLGNBQ0EsY0FDQSxjQUMvQjtBQVJPO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDd0I7QUFDQTtBQUNBO0FBQUEsRUFHakM7QUFBQSxFQUlBLElBQUksYUFBYTtBQUNoQixXQUFPLHdCQUF3QjtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxlQUFlLFdBQXFEO0FBQ25FLFVBQU0sT0FBb0MsdUJBQU8sT0FBTyxJQUFJO0FBQzVELFNBQUssYUFBYSxJQUFJLE9BQU8sV0FBVyxFQUFFLGFBQWEsQ0FBQztBQUN4RCxTQUFLLHFCQUFxQixJQUFJLGdCQUFnQjtBQUM5QyxTQUFLLHNCQUFzQixJQUFJLGdCQUFnQjtBQUMvQyxTQUFLLG9CQUFvQixJQUFJLEtBQUssa0JBQWtCO0FBRXBELFNBQUssT0FBTyxFQUFFLE9BQU87QUFDckIsU0FBSyxXQUFXLGVBQWUsS0FBSyxtQkFBbUI7QUFDdkQsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVMsU0FBUyxNQUFNO0FBQ3pELFdBQUssYUFBYSwyQkFBMkIsQ0FBQyxLQUFLLFFBQVEsU0FBUyxLQUFLLE9BQU87QUFBQSxJQUNqRixDQUFDLENBQUM7QUFFRixRQUFJLE9BQU8sS0FBSyxZQUFZLEtBQUssSUFBSTtBQUNyQyxRQUFJLE9BQU8sS0FBSyxZQUFZLEtBQUssU0FBUyxPQUFPO0FBRWpELFNBQUssT0FBTyxJQUFJLE9BQU8sS0FBSyxZQUFZLEVBQUUsV0FBVyxDQUFDO0FBQ3RELFNBQUssYUFBYSxJQUFJLE9BQU8sS0FBSyxZQUFZLEVBQUUsa0JBQWtCLENBQUM7QUFDbkUsU0FBSyxZQUFZLElBQUksT0FBTyxLQUFLLFlBQVksRUFBRSxnQkFBZ0IsQ0FBQztBQUVoRSxTQUFLLFlBQVksSUFBSSxVQUFVLEtBQUssVUFBVTtBQUM5QyxTQUFLLG9CQUFvQixJQUFJLEtBQUssU0FBUztBQUMzQyxVQUFNLGlCQUFpQixJQUFJLE9BQU8sS0FBSyxZQUFZLEVBQUUsa0JBQWtCLENBQUM7QUFDeEUsU0FBSyxRQUFRLElBQUksT0FBTyxnQkFBZ0IsRUFBRSxxQ0FBcUMsQ0FBQztBQUVoRixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxNQUF1QyxRQUFnQixNQUF5QztBQUM3RyxTQUFLLHFCQUFxQixLQUFLLFNBQVMsSUFBSTtBQUFBLEVBQzdDO0FBQUEsRUFFQSx5QkFBeUIsTUFBNEQsUUFBZ0IsTUFBeUM7QUFDN0ksU0FBSyxxQkFBcUIsS0FBSyxRQUFRLFNBQVMsS0FBSyxRQUFRLFNBQVMsU0FBUyxDQUFDLEdBQUcsSUFBSTtBQUFBLEVBQ3hGO0FBQUEsRUFFUSxxQkFBcUIsZ0JBQWdDLE1BQXlDO0FBQ3JHLFNBQUssVUFBVTtBQUNmLFNBQUssS0FBSyxjQUFjLGVBQWU7QUFDdkMsVUFBTSxFQUFFLE1BQU0sUUFBUSxJQUFJLDRCQUE0QixLQUFLLGFBQWEsT0FBTyxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixHQUFHLGdCQUFnQixLQUFLLGNBQWMsS0FBSyxhQUFhLFNBQVMsQ0FBQztBQUN0TSxTQUFLLEtBQUssWUFBWSxVQUFVLFlBQVksSUFBSTtBQUNoRCxTQUFLLG1CQUFtQixJQUFJLEtBQUssYUFBYSxrQkFBa0Isd0JBQXdCLE9BQU8sR0FBRyxLQUFLLE1BQU0sVUFBVSxVQUFVLEVBQUUsQ0FBQztBQUNwSSxTQUFLLFNBQVMsVUFBVSxlQUFlO0FBQ3ZDLFNBQUssbUJBQW1CLElBQUksS0FBSyxhQUFhLGtCQUFrQix3QkFBd0IsT0FBTyxHQUFHLEtBQUssWUFBWSxVQUFVLFVBQVUsRUFBRSxDQUFDO0FBRTFJLFFBQUksZUFBZSxXQUFXO0FBQzdCLFdBQUssTUFBTSxjQUFjLGVBQWU7QUFDeEMsV0FBSyxNQUFNLE1BQU0sVUFBVTtBQUFBLElBQzVCLE9BQU87QUFDTixXQUFLLE1BQU0sTUFBTSxVQUFVO0FBQUEsSUFDNUI7QUFHQSxVQUFNLFVBQVUsS0FBSyxhQUFhLGFBQWEsRUFBRTtBQUNqRCxTQUFLLFdBQVcsVUFBVSxPQUFPLFlBQWEsV0FBVyxDQUFDLFFBQVEsYUFBYSwyQkFBNEIsQ0FBQyxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixDQUFDO0FBQ2xLLFFBQUksV0FBVyxDQUFDLFFBQVEsYUFBYSx5QkFBeUI7QUFDN0QsV0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxZQUFZLFNBQVMsK0JBQStCLHVEQUF1RCxDQUFDLENBQUM7QUFBQSxJQUNyTjtBQUNBLFFBQUksZUFBZSxZQUFZO0FBQzlCLFlBQU0sYUFBYSxlQUFlLGVBQWUsU0FBUyxTQUFTLFFBQVEsTUFBTSxJQUFJLGVBQWUsZUFBZSxVQUFVLFNBQVMsU0FBUyxPQUFPLElBQUksU0FBUyxVQUFVLFFBQVE7QUFDckwsV0FBSyxXQUFXLGNBQWM7QUFBQSxJQUMvQixPQUFPO0FBQ04sV0FBSyxXQUFXLGNBQWM7QUFBQSxJQUMvQjtBQUNBLFFBQUksZUFBZSxhQUFhLGVBQWUsY0FBYztBQUM1RCxXQUFLLFVBQVUsY0FBYyxTQUFTLHlCQUF5QixtQ0FBbUMsZUFBZSxXQUFXLGVBQWUsWUFBWTtBQUFBLElBQ3hKLE9BQU87QUFDTixXQUFLLFVBQVUsY0FBYyxlQUFlLGFBQWEsZUFBZSxnQkFBZ0I7QUFBQSxJQUN6RjtBQUVBLFNBQUssNEJBQTRCLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxRQUFRLGFBQWEsOEJBQThCO0FBQ3RHLFNBQUssMkJBQTJCLElBQUksS0FBSyxhQUFhLFNBQVMsRUFBRSxtQkFBbUIsTUFBTSxFQUFFLFNBQVMsQ0FBQztBQUN0RyxTQUFLLG1CQUFtQixJQUFJLGdCQUFnQjtBQUM1QyxTQUFLLHNCQUFzQixJQUFJLGVBQWUsSUFBSSxTQUFTLHNCQUFzQixPQUFPO0FBQ3hGLFVBQU0sRUFBRSxRQUFRLElBQUksb0JBQW9CLEtBQUssS0FBSyxXQUFXLEVBQUUsS0FBSyxnQkFBZ0IsbUJBQW1CLEtBQUssQ0FBQyxHQUFHLFFBQVE7QUFDeEgsU0FBSyxVQUFVLE1BQU07QUFDckIsU0FBSyxVQUFVLEtBQUssU0FBUyxFQUFFLE1BQU0sTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUN6RCxvQ0FBZ0MsSUFBSSxlQUFlLE1BQU0sR0FBRyxLQUFLLFVBQVUsT0FBTztBQUNsRixTQUFLLHNCQUFzQixNQUFNO0FBQUEsRUFDbEM7QUFBQSxFQUVBLGVBQWUsTUFBdUMsT0FBZSxjQUFpRDtBQUNySCxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSwwQkFBMEIsTUFBNEQsT0FBZSxjQUFpRDtBQUNySixpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxnQkFBZ0IsY0FBeUQ7QUFDeEUsaUJBQWEsb0JBQW9CLFFBQVE7QUFBQSxFQUMxQztBQUNEO0FBakhNLHdCQWVXLEtBQUs7QUFmaEIsMEJBQU47QUFBQSxFQVFHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZHO0FBbUhOLElBQU0saUNBQU4sTUFBNEk7QUFBQSxFQUUzSSxZQUNpQyxjQUNBLGNBQ0EsY0FDL0I7QUFIK0I7QUFDQTtBQUNBO0FBQUEsRUFHakM7QUFBQSxFQUlBLElBQUksYUFBYTtBQUNoQixXQUFPLCtCQUErQjtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxlQUFlLFdBQTREO0FBQzFFLFVBQU0sT0FBMkMsdUJBQU8sT0FBTyxJQUFJO0FBQ25FLFNBQUsscUJBQXFCLElBQUksZ0JBQWdCO0FBQzlDLFNBQUssc0JBQXNCLElBQUksZ0JBQWdCO0FBQy9DLFNBQUssb0JBQW9CLElBQUksS0FBSyxrQkFBa0I7QUFDcEQsU0FBSyxhQUFhLElBQUksT0FBTyxXQUFXLEVBQUUsYUFBYSxDQUFDO0FBRXhELFNBQUssT0FBTyxFQUFFLE9BQU87QUFDckIsU0FBSyxXQUFXLGVBQWUsS0FBSyxtQkFBbUI7QUFDdkQsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVMsU0FBUyxNQUFNO0FBQ3pELFdBQUssYUFBYSwyQkFBMkIsQ0FBQyxLQUFLLFFBQVEsU0FBUyxLQUFLLE9BQU87QUFBQSxJQUNqRixDQUFDLENBQUM7QUFFRixRQUFJLE9BQU8sS0FBSyxZQUFZLEtBQUssSUFBSTtBQUNyQyxRQUFJLE9BQU8sS0FBSyxZQUFZLEtBQUssU0FBUyxPQUFPO0FBRWpELFNBQUssT0FBTyxJQUFJLE9BQU8sS0FBSyxZQUFZLEVBQUUsV0FBVyxDQUFDO0FBRXRELFNBQUssVUFBVSxJQUFJLE9BQU8sS0FBSyxZQUFZLEVBQUUsZ0JBQWdCLENBQUM7QUFDOUQsU0FBSyxZQUFZLElBQUksVUFBVSxLQUFLLFVBQVU7QUFDOUMsU0FBSyxvQkFBb0IsSUFBSSxLQUFLLFNBQVM7QUFDM0MsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLEtBQUssWUFBWSxFQUFFLGtCQUFrQixDQUFDO0FBQ3hFLFNBQUssUUFBUSxJQUFJLE9BQU8sZ0JBQWdCLEVBQUUscUNBQXFDLENBQUM7QUFFaEYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsTUFBK0MsT0FBZSxNQUFnRDtBQUMzSCxTQUFLLDRCQUE0QixLQUFLLFNBQVMsSUFBSTtBQUFBLEVBQ3BEO0FBQUEsRUFFQSx5QkFBeUIsTUFBb0UsT0FBZSxNQUFnRDtBQUMzSixTQUFLLDRCQUE0QixLQUFLLFFBQVEsU0FBUyxLQUFLLFFBQVEsU0FBUyxTQUFTLENBQUMsR0FBRyxJQUFJO0FBQUEsRUFDL0Y7QUFBQSxFQUVRLDRCQUE0QixZQUFvQyxNQUFnRDtBQUN2SCxTQUFLLFVBQVU7QUFDZixTQUFLLFdBQVcsVUFBVSxPQUFPLFlBQVksQ0FBQyxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixDQUFDO0FBRXBHLFNBQUssS0FBSyxjQUFjLE9BQU8sV0FBVyxRQUFRLFNBQVMsRUFBRTtBQUM3RCxTQUFLLG1CQUFtQixJQUFJLEtBQUssYUFBYSxrQkFBa0Isd0JBQXdCLE9BQU8sR0FBRyxLQUFLLE1BQU0sU0FBUyx5QkFBeUIsd0JBQXdCLFdBQVcsUUFBUSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ3RNLFNBQUssU0FBUyxVQUFVLFdBQVc7QUFFbkMsVUFBTSxFQUFFLFNBQVMsS0FBSyxJQUFJLDRCQUE0QixLQUFLLGFBQWEsT0FBTyxLQUFLLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixHQUFHLFlBQVksS0FBSyxjQUFjLEtBQUssYUFBYSxTQUFTLENBQUM7QUFDbE0sU0FBSyxLQUFLLFlBQVksVUFBVSxZQUFZLElBQUk7QUFDaEQsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxZQUFZLFdBQVcsV0FBVyxXQUFXLEVBQUUsQ0FBQztBQUV2SixVQUFNLGNBQWMsS0FBSyxhQUFhLFVBQVUsTUFBTSxXQUFXLEtBQUssYUFBYSxVQUFVLE1BQU07QUFDbkcsUUFBSSxlQUFlLENBQUMsV0FBVyxVQUFVO0FBQ3hDLFdBQUssV0FBVyxVQUFVLElBQUksVUFBVTtBQUFBLElBQ3pDO0FBRUEsUUFBSSxXQUFXLFdBQVc7QUFDekIsV0FBSyxNQUFNLGNBQWMsV0FBVztBQUNwQyxXQUFLLE1BQU0sTUFBTSxVQUFVO0FBQUEsSUFDNUIsT0FBTztBQUNOLFdBQUssTUFBTSxNQUFNLFVBQVU7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGVBQWUsTUFBK0MsT0FBZSxjQUF3RDtBQUNwSSxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSwwQkFBMEIsTUFBb0UsT0FBZSxjQUF3RDtBQUNwSyxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxnQkFBZ0IsY0FBd0Q7QUFDdkUsaUJBQWEsb0JBQW9CLFFBQVE7QUFBQSxFQUMxQztBQUNEO0FBdkZNLCtCQVVXLEtBQUs7QUFWaEIsaUNBQU47QUFBQSxFQUdHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxHO0FBeUZOLE1BQU0sbUNBQU4sTUFBTSxpQ0FBc0k7QUFBQSxFQUUzSSxZQUNTLE1BQ0EsY0FDQSxvQkFDUyxjQUNULGNBQ1A7QUFMTztBQUNBO0FBQ0E7QUFDUztBQUNUO0FBQUEsRUFDTDtBQUFBLEVBSUosSUFBSSxhQUFhO0FBQ2hCLFdBQU8saUNBQWdDO0FBQUEsRUFDeEM7QUFBQSxFQUVBLGVBQWUsV0FBOEQ7QUFDNUUsVUFBTSxXQUFpRCx1QkFBTyxPQUFPLElBQUk7QUFDekUsVUFBTSxZQUFZLElBQUksZ0JBQWdCO0FBRXRDLFVBQU0sYUFBYSxJQUFJLE9BQU8sV0FBVyxFQUFFLGFBQWEsQ0FBQztBQUN6RCxhQUFTLE9BQU8sRUFBRSxPQUFPO0FBQ3pCLGFBQVMsV0FBVyxlQUFlLFNBQVM7QUFFNUMsUUFBSSxPQUFPLFlBQVksU0FBUyxJQUFJO0FBQ3BDLFFBQUksT0FBTyxZQUFZLFNBQVMsU0FBUyxPQUFPO0FBQ2hELFNBQUssS0FBSyx1QkFBdUIsSUFBSSxJQUFJO0FBQ3pDLFVBQU0sb0JBQW9CLElBQUksT0FBTyxZQUFZLEVBQUUsb0JBQW9CLENBQUM7QUFHeEUsVUFBTSxXQUFXLElBQUksU0FBUyxtQkFBbUIsS0FBSyxvQkFBb0IsRUFBRSxnQkFBZ0Isc0JBQXNCLENBQUM7QUFFbkgsY0FBVSxJQUFJLFFBQVE7QUFFdEIsVUFBTSxTQUFTLENBQUMsWUFBcUI7QUFDcEMsZUFBUyxXQUFXO0FBQ3BCLFVBQUk7QUFDSCxhQUFLLEtBQUssdUJBQXVCLElBQUksS0FBSztBQUMxQyxjQUFNLEtBQUssU0FBUyxXQUFXLE1BQU07QUFFckMsWUFBSSxTQUFTO0FBQ1osY0FBSSxTQUFTLFNBQVMsUUFBUTtBQUM3QixpQkFBSyxhQUFhLHlCQUF5QixJQUFJLEVBQUUsTUFBTSxTQUFTLE1BQU0sQ0FBQztBQUFBLFVBQ3hFO0FBQ0EsY0FBSSxTQUFTLFNBQVMsYUFBYTtBQUNsQyxpQkFBSyxhQUFhLHlCQUF5QixJQUFJLEVBQUUsV0FBVyxTQUFTLE1BQU0sQ0FBQztBQUFBLFVBQzdFO0FBQ0EsY0FBSSxTQUFTLFNBQVMsWUFBWTtBQUNqQyxpQkFBSyxhQUFhLHlCQUF5QixJQUFJLEVBQUUsY0FBYyxTQUFTLE1BQU0sQ0FBQztBQUFBLFVBQ2hGO0FBQUEsUUFDRCxPQUFPO0FBQ04sY0FBSSxTQUFTLFNBQVMsVUFBVSxDQUFDLFNBQVMsV0FBVyxNQUFNO0FBQzFELGlCQUFLLGFBQWEsMEJBQTBCLEVBQUU7QUFBQSxVQUMvQyxPQUFPO0FBQ04saUJBQUssS0FBSyxlQUFlLE1BQVM7QUFBQSxVQUNuQztBQUFBLFFBQ0Q7QUFBQSxNQUNELFVBQUU7QUFDRCxpQkFBUyxXQUFXO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBRUEsY0FBVSxJQUFJLElBQUksOEJBQThCLFNBQVMsY0FBYyxXQUFXLENBQUMsTUFBc0I7QUFDeEcsWUFBTSxXQUFXLEVBQUUsT0FBTyxRQUFRLE1BQU07QUFDeEMsWUFBTSxVQUFVLEVBQUUsT0FBTyxRQUFRLEtBQUs7QUFDdEMsVUFBSSxZQUFZLFNBQVM7QUFDeEIsVUFBRSxlQUFlO0FBQ2pCLFVBQUUsZ0JBQWdCO0FBQ2xCLGVBQU8sT0FBTztBQUFBLE1BQ2Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGNBQVUsSUFBSSxJQUFJLHNCQUFzQixTQUFTLGNBQWMsUUFBUSxNQUFNO0FBQzVFLFVBQUksQ0FBQyxTQUFTLFVBQVU7QUFDdkIsZUFBTyxDQUFDLENBQUMsU0FBUyxLQUFLO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGFBQVMsV0FBVztBQUNwQixhQUFTLHFCQUFxQixJQUFJLGdCQUFnQjtBQUNsRCxhQUFTLHNCQUFzQjtBQUMvQixhQUFTLG9CQUFvQixJQUFJLFNBQVMsa0JBQWtCO0FBQzVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLE1BQTJDLFFBQWdCLE1BQWtEO0FBQzFILFVBQU0scUJBQXFCLEtBQUs7QUFDaEMsU0FBSyxhQUFhO0FBQ2xCLFNBQUssT0FBTyxLQUFLLEtBQUssY0FBYyxRQUFRO0FBQzVDLFVBQU0sRUFBRSxNQUFNLFFBQVEsSUFBSSw0QkFBNEIsS0FBSyxhQUFhLE9BQU8sS0FBSyxhQUFhLFNBQVMsRUFBRSx3QkFBd0IsR0FBRyxvQkFBb0IsS0FBSyxjQUFjLEtBQUssYUFBYSxTQUFTLENBQUM7QUFFMU0sU0FBSyxLQUFLLFlBQVksVUFBVSxZQUFZLElBQUk7QUFDaEQsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxNQUFNLFVBQVUsVUFBVSxFQUFFLENBQUM7QUFDcEksU0FBSyxTQUFTLFVBQVUsbUJBQW1CO0FBQzNDLFNBQUssU0FBUyxRQUFRO0FBQ3RCLFNBQUssU0FBUyxRQUFRLG1CQUFtQixRQUFRO0FBRWpELFFBQUksY0FBYyxTQUFTLGlDQUFpQyxzQkFBc0I7QUFDbEYsUUFBSSxZQUFZLFNBQVMsb0NBQW9DLDJCQUEyQjtBQUN4RixRQUFJLEtBQUssU0FBUyxhQUFhO0FBQzlCLFdBQUssU0FBUyxRQUFRLG1CQUFtQixhQUFhO0FBQ3RELG9CQUFjLFNBQVMsMkNBQTJDLHlDQUF5QztBQUMzRyxrQkFBWSxTQUFTLHdDQUF3QyxtRkFBbUY7QUFBQSxJQUNqSixXQUFXLEtBQUssU0FBUyxZQUFZO0FBQ3BDLFdBQUssU0FBUyxRQUFRLG1CQUFtQixnQkFBZ0I7QUFDekQsb0JBQWMsU0FBUyx5Q0FBeUMsNkJBQTZCO0FBQzdGLGtCQUFZLFNBQVMsdUNBQXVDLHVFQUF1RTtBQUFBLElBQ3BJO0FBQ0EsU0FBSyxTQUFTLGFBQWEsU0FBUztBQUNwQyxTQUFLLFNBQVMsZUFBZSxXQUFXO0FBRXhDLGVBQVcsTUFBTTtBQUNoQixXQUFLLFNBQVMsTUFBTTtBQUNwQixXQUFLLFNBQVMsT0FBTztBQUFBLElBQ3RCLEdBQUcsQ0FBQztBQUFBLEVBQ0w7QUFBQSxFQUVBLHlCQUF5QixNQUFpRSxRQUFnQixNQUFrRDtBQUFBLEVBRTVKO0FBQUEsRUFFQSxlQUFlLE1BQTRDLE9BQWUsY0FBMEQ7QUFDbkksaUJBQWEsbUJBQW1CLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRUEsMEJBQTBCLE1BQWlFLE9BQWUsY0FBMEQ7QUFDbkssaUJBQWEsbUJBQW1CLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRUEsZ0JBQWdCLGNBQTBEO0FBQ3pFLGlCQUFhLG9CQUFvQixRQUFRO0FBQUEsRUFDMUM7QUFDRDtBQW5JTSxpQ0FVVyxLQUFLO0FBVnRCLElBQU0sa0NBQU47QUFxSUEsTUFBTSwrQkFBTixNQUFNLDZCQUEwSDtBQUFBLEVBRS9ILFlBQ1MsTUFDQSxjQUNBLG9CQUNTLGNBQ1QsY0FDUDtBQUxPO0FBQ0E7QUFDQTtBQUNTO0FBQ1Q7QUFBQSxFQUNMO0FBQUEsRUFJSixJQUFJLGFBQWE7QUFDaEIsV0FBTyw2QkFBNEI7QUFBQSxFQUNwQztBQUFBLEVBRUEsZUFBZSxXQUEwRDtBQUN4RSxVQUFNLFdBQTZDLHVCQUFPLE9BQU8sSUFBSTtBQUNyRSxVQUFNLFlBQVksSUFBSSxnQkFBZ0I7QUFFdEMsVUFBTSxhQUFhLElBQUksT0FBTyxXQUFXLEVBQUUsYUFBYSxDQUFDO0FBQ3pELGFBQVMsT0FBTyxFQUFFLE9BQU87QUFDekIsYUFBUyxXQUFXLGVBQWUsU0FBUztBQUU1QyxRQUFJLE9BQU8sWUFBWSxTQUFTLElBQUk7QUFDcEMsUUFBSSxPQUFPLFlBQVksU0FBUyxTQUFTLE9BQU87QUFDaEQsU0FBSyxLQUFLLHVCQUF1QixJQUFJLElBQUk7QUFDekMsVUFBTSxvQkFBb0IsSUFBSSxPQUFPLFlBQVksRUFBRSxvQkFBb0IsQ0FBQztBQUd4RSxVQUFNLFdBQVcsSUFBSSxTQUFTLG1CQUFtQixLQUFLLG9CQUFvQixFQUFFLGdCQUFnQixzQkFBc0IsQ0FBQztBQUNuSCxjQUFVLElBQUksUUFBUTtBQUV0QixVQUFNLFNBQVMsQ0FBQyxZQUFxQjtBQUNwQyxlQUFTLFdBQVc7QUFDcEIsVUFBSTtBQUNILGFBQUssS0FBSyx1QkFBdUIsSUFBSSxLQUFLO0FBQzFDLGNBQU0sS0FBSyxTQUFTLFdBQVcsTUFBTTtBQUVyQyxZQUFJLFNBQVM7QUFDWixjQUFJLFNBQVMsU0FBUyxhQUFhO0FBQ2xDLGlCQUFLLGFBQWEscUJBQXFCLElBQUksRUFBRSxXQUFXLFNBQVMsTUFBTSxDQUFDO0FBQUEsVUFDekU7QUFDQSxjQUFJLFNBQVMsU0FBUyxZQUFZO0FBQ2pDLGlCQUFLLGFBQWEscUJBQXFCLElBQUksRUFBRSxjQUFjLFNBQVMsTUFBTSxDQUFDO0FBQUEsVUFDNUU7QUFBQSxRQUNELE9BQU87QUFDTixlQUFLLEtBQUssZUFBZSxNQUFTO0FBQUEsUUFDbkM7QUFBQSxNQUNELFVBQUU7QUFDRCxpQkFBUyxXQUFXO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBRUEsY0FBVSxJQUFJLElBQUksOEJBQThCLFNBQVMsY0FBYyxXQUFXLENBQUMsTUFBc0I7QUFDeEcsWUFBTSxXQUFXLEVBQUUsT0FBTyxRQUFRLE1BQU07QUFDeEMsWUFBTSxVQUFVLEVBQUUsT0FBTyxRQUFRLEtBQUs7QUFDdEMsVUFBSSxZQUFZLFNBQVM7QUFDeEIsVUFBRSxlQUFlO0FBQ2pCLFVBQUUsZ0JBQWdCO0FBQ2xCLGVBQU8sT0FBTztBQUFBLE1BQ2Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGNBQVUsSUFBSSxJQUFJLHNCQUFzQixTQUFTLGNBQWMsUUFBUSxNQUFNO0FBQzVFLFVBQUksQ0FBQyxTQUFTLFVBQVU7QUFDdkIsZUFBTyxDQUFDLENBQUMsU0FBUyxLQUFLO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGFBQVMsV0FBVztBQUNwQixhQUFTLHFCQUFxQixJQUFJLGdCQUFnQjtBQUNsRCxhQUFTLHNCQUFzQjtBQUMvQixhQUFTLG9CQUFvQixJQUFJLFNBQVMsa0JBQWtCO0FBQzVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLE1BQXVDLFFBQWdCLE1BQThDO0FBQ2xILFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssT0FBTyxLQUFLLEtBQUssY0FBYyxRQUFRO0FBQzVDLFVBQU0sRUFBRSxNQUFNLFFBQVEsSUFBSSw0QkFBNEIsS0FBSyxhQUFhLE9BQU8sS0FBSyxhQUFhLFNBQVMsRUFBRSx3QkFBd0IsR0FBRyxnQkFBZ0IsS0FBSyxjQUFjLEtBQUssYUFBYSxTQUFTLENBQUM7QUFFdE0sU0FBSyxLQUFLLFlBQVksVUFBVSxZQUFZLElBQUk7QUFDaEQsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxNQUFNLFdBQVcsRUFBRSxDQUFDO0FBQzNILFNBQUssU0FBUyxVQUFVLGVBQWU7QUFDdkMsU0FBSyxTQUFTLFFBQVE7QUFDdEIsU0FBSyxTQUFTLFFBQVE7QUFDdEIsUUFBSSxjQUFjO0FBQ2xCLFFBQUksWUFBWTtBQUNoQixRQUFJLEtBQUssU0FBUyxhQUFhO0FBQzlCLFdBQUssU0FBUyxRQUFRLGVBQWUsYUFBYTtBQUNsRCxvQkFBYyxTQUFTLHVDQUF1Qyx5Q0FBeUM7QUFDdkcsa0JBQVksU0FBUyxvQ0FBb0MsK0VBQStFO0FBQUEsSUFDekksV0FBVyxLQUFLLFNBQVMsWUFBWTtBQUNwQyxXQUFLLFNBQVMsUUFBUSxlQUFlLGdCQUFnQjtBQUNyRCxvQkFBYyxTQUFTLHFDQUFxQyw2QkFBNkI7QUFDekYsa0JBQVksU0FBUyxtQ0FBbUMsbUVBQW1FO0FBQUEsSUFDNUg7QUFDQSxTQUFLLFNBQVMsYUFBYSxTQUFTO0FBQ3BDLFNBQUssU0FBUyxlQUFlLFdBQVc7QUFFeEMsZUFBVyxNQUFNO0FBQ2hCLFdBQUssU0FBUyxNQUFNO0FBQ3BCLFdBQUssU0FBUyxPQUFPO0FBQUEsSUFDdEIsR0FBRyxDQUFDO0FBQUEsRUFDTDtBQUFBLEVBRUEseUJBQXlCLE1BQTZELFFBQWdCLE1BQThDO0FBQUEsRUFFcEo7QUFBQSxFQUVBLGVBQWUsTUFBd0MsT0FBZSxjQUFzRDtBQUMzSCxpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSwwQkFBMEIsTUFBNkQsT0FBZSxjQUFzRDtBQUMzSixpQkFBYSxtQkFBbUIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxnQkFBZ0IsY0FBc0Q7QUFDckUsaUJBQWEsb0JBQW9CLFFBQVE7QUFBQSxFQUMxQztBQUNEO0FBMUhNLDZCQVVXLEtBQUs7QUFWdEIsSUFBTSw4QkFBTjtBQTRIQSxNQUFNLG9DQUFOLE1BQU0sa0NBQXlJO0FBQUEsRUFFOUksWUFDUyxNQUNBLGNBQ0Esb0JBQ1A7QUFITztBQUNBO0FBQ0E7QUFBQSxFQUdUO0FBQUEsRUFJQSxJQUFJLGFBQWE7QUFDaEIsV0FBTyxrQ0FBaUM7QUFBQSxFQUN6QztBQUFBLEVBRUEsZUFBZSxXQUErRDtBQUM3RSxVQUFNLFlBQVksSUFBSSxnQkFBZ0I7QUFFdEMsVUFBTSxhQUFhLElBQUksT0FBTyxXQUFXLEVBQUUsYUFBYSxDQUFDO0FBQ3pELGVBQVcsVUFBVSxJQUFJLFdBQVc7QUFDcEMsVUFBTSxXQUFXLGVBQWUsU0FBUztBQUV6QyxRQUFJLE9BQU8sWUFBWSxTQUFTLE9BQU87QUFDdkMsU0FBSyxLQUFLLHVCQUF1QixJQUFJLElBQUk7QUFDekMsVUFBTSxvQkFBb0IsSUFBSSxPQUFPLFlBQVksRUFBRSxvQkFBb0IsQ0FBQztBQUN4RSxVQUFNLFdBQVcsSUFBSSxTQUFTLG1CQUFtQixLQUFLLG9CQUFvQjtBQUFBLE1BQ3pFLFdBQVcsU0FBUyxnQ0FBZ0MscUNBQXFDO0FBQUEsTUFDekYsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUdELGNBQVUsSUFBSSxRQUFRO0FBQ3RCLFVBQU0sU0FBUyxDQUFDLFlBQXFCO0FBQ3BDLFVBQUksQ0FBQyxhQUFhLG1CQUFtQjtBQUNwQztBQUFBLE1BQ0Q7QUFFQSxXQUFLLEtBQUssdUJBQXVCLElBQUksS0FBSztBQUMxQyxVQUFJLGVBQWUsYUFBYSxrQkFBa0I7QUFDbEQsVUFBSSxTQUFTO0FBQ1osdUJBQWUsU0FBUyxVQUFVLEtBQUssU0FBUyxRQUFRO0FBQUEsTUFDekQ7QUFDQSxXQUFLLGFBQWEsZ0NBQWdDLGFBQWEsbUJBQW1CLFlBQVk7QUFBQSxJQUMvRjtBQUVBLGNBQVUsSUFBSSxJQUFJLDhCQUE4QixTQUFTLGNBQWMsV0FBVyxDQUFDLE1BQXNCO0FBQ3hHLFlBQU0sV0FBVyxFQUFFLE9BQU8sUUFBUSxNQUFNO0FBQ3hDLFlBQU0sVUFBVSxFQUFFLE9BQU8sUUFBUSxLQUFLO0FBQ3RDLFVBQUksWUFBWSxTQUFTO0FBQ3hCLFVBQUUsZUFBZTtBQUNqQixVQUFFLGdCQUFnQjtBQUNsQixlQUFPLE9BQU87QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixjQUFVLElBQUksSUFBSSxzQkFBc0IsU0FBUyxjQUFjLFFBQVEsTUFBTTtBQUU1RSxpQkFBVyxNQUFNO0FBQ2hCLGVBQU8sSUFBSTtBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBRUYsVUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsY0FBVSxJQUFJLGtCQUFrQjtBQUVoQyxVQUFNLGVBQXNEO0FBQUEsTUFDM0Q7QUFBQSxNQUNBO0FBQUEsTUFDQSxxQkFBcUI7QUFBQSxNQUNyQixvQkFBb0IsSUFBSSxnQkFBZ0I7QUFBQSxJQUN6QztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLE1BQTRDLFFBQWdCLE1BQW1EO0FBQzVILFVBQU0sc0JBQXNCLEtBQUs7QUFDakMsVUFBTSxjQUFjLG9CQUFvQix3QkFBd0IsU0FBUyxrQ0FBa0MseUNBQXlDO0FBQ3BKLFNBQUssU0FBUyxlQUFlLFdBQVc7QUFDeEMsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxTQUFTLFVBQVUsb0JBQW9CO0FBQzVDLFNBQUssU0FBUyxRQUFRO0FBQ3RCLFNBQUssU0FBUyxRQUFRLG9CQUFvQixhQUFhO0FBQ3ZELGVBQVcsTUFBTTtBQUNoQixXQUFLLFNBQVMsTUFBTTtBQUNwQixXQUFLLFNBQVMsT0FBTztBQUFBLElBQ3RCLEdBQUcsQ0FBQztBQUFBLEVBQ0w7QUFBQSxFQUVBLHlCQUF5QixNQUFrRSxRQUFnQixNQUFtRDtBQUFBLEVBRTlKO0FBQUEsRUFFQSxlQUFlLE1BQTZDLE9BQWUsY0FBMkQ7QUFDckksaUJBQWEsbUJBQW1CLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRUEsMEJBQTBCLE1BQWtFLE9BQWUsY0FBMkQ7QUFDckssaUJBQWEsbUJBQW1CLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRUEsZ0JBQWdCLGNBQTJEO0FBQzFFLGlCQUFhLG9CQUFvQixRQUFRO0FBQUEsRUFDMUM7QUFDRDtBQXhHTSxrQ0FVVyxLQUFLO0FBVnRCLElBQU0sbUNBQU47QUEwR0EsTUFBTSxpQ0FBOEY7QUFBQSxFQUVuRyxZQUNrQixjQUNBLGNBQ2hCO0FBRmdCO0FBQ0E7QUFBQSxFQUNkO0FBQUEsRUFFSixxQkFBNkI7QUFDNUIsV0FBTyxTQUFTLGVBQWUsYUFBYTtBQUFBLEVBQzdDO0FBQUEsRUFFQSxVQUFvQjtBQUNuQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsVUFBVSxTQUFnQztBQUN6QyxRQUFJLG1CQUFtQix1QkFBdUI7QUFDN0MsYUFBTyxRQUFRO0FBQUEsSUFDaEI7QUFDQSxXQUFPLFFBQVE7QUFBQSxFQUNoQjtBQUFBLEVBRUEsYUFBYSxTQUErQztBQUMzRCxRQUFJLG1CQUFtQix1QkFBdUI7QUFDN0MsYUFBTyxTQUFTLG9CQUFvQix1Q0FBdUMsVUFBVSxvQkFBb0IsUUFBUSxHQUFHLEdBQUcsUUFBUSxZQUFZLE1BQU07QUFBQSxJQUNsSjtBQUVBLFFBQUksbUJBQW1CLHFCQUFxQjtBQUMzQyxhQUFPLFFBQVEsU0FBUztBQUFBLElBQ3pCO0FBRUEsVUFBTSxFQUFFLFFBQVEsSUFBSSw0QkFBNEIsS0FBSyxhQUFhLE9BQU8sS0FBSyxhQUFhLFNBQVMsRUFBRSx3QkFBd0IsR0FBRyxTQUFnRSxLQUFLLGNBQWMsS0FBSyxhQUFhLFNBQVMsQ0FBQztBQUNoUCxVQUFNLFdBQVcsUUFBUSxTQUFTO0FBRWxDLFdBQU8sVUFBVSxHQUFHLFFBQVEsS0FBSyxPQUFPLEtBQUs7QUFBQSxFQUM5QztBQUNEO0FBRU8sU0FBUyxxQkFBcUIsWUFBeUIsWUFBcUIsZUFBd0IsUUFBaUIsY0FBNkIsZUFBaUU7QUFDek4sTUFBSSxXQUFXLElBQUksV0FBVyxnQkFBZ0IsYUFBYSxVQUFVLE1BQU0sVUFBVTtBQUNwRixXQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsRUFDakM7QUFFQSxRQUFNLFlBQVksV0FBVyxnQkFBZ0I7QUFBQSxJQUM1QyxpQkFBaUIsV0FBVztBQUFBLElBQzVCLGVBQWUsV0FBVztBQUFBLElBQzFCLGFBQWEsV0FBVyxVQUFVO0FBQUEsSUFDbEMsV0FBVyxXQUFXLGFBQWEsVUFBVTtBQUFBLEVBQzlDLElBQUk7QUFBQSxJQUNILGlCQUFpQixXQUFXO0FBQUEsSUFDNUIsYUFBYSxXQUFXLFVBQVU7QUFBQSxJQUNsQyxlQUFlLFdBQVc7QUFBQSxJQUMxQixXQUFXLFdBQVcsVUFBVSxVQUFVO0FBQUEsRUFDM0M7QUFFQSxTQUFPLGNBQWMsV0FBVztBQUFBLElBQy9CLFVBQVUsV0FBVztBQUFBLElBQ3JCLFNBQVM7QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0JBQWdCO0FBQUEsTUFDaEIscUJBQXFCLDhCQUE4QjtBQUFBLE1BQ25EO0FBQUEsSUFDRDtBQUFBLEVBQ0QsR0FBRyxhQUFhLGFBQWEsWUFBWTtBQUMxQztBQUVPLFNBQVMsNEJBQTRCLE9BQWMsc0JBQStCLFlBQTRCLGNBQTZCLFlBQXdHO0FBQ3pQLFFBQU0sY0FBYyxVQUFVLE1BQU0sV0FBVyxVQUFVLE1BQU07QUFFL0QsUUFBTSxpQkFBaUIsc0JBQXNCLGlCQUFpQixNQUFNLGlCQUFpQixzQkFBc0IscUJBQXFCLE1BQU0scUJBQXFCLFdBQVcsYUFBYSxNQUFNLGdCQUFnQixNQUFNO0FBRS9NLE1BQUksQ0FBQyxXQUFXLFdBQVcsQ0FBQyxzQkFBc0I7QUFDakQsV0FBTztBQUFBLE1BQ04sTUFBTSxlQUFlO0FBQUEsTUFDckIsU0FBUyxXQUFXLGFBQWEsU0FBUyxvQkFBb0IsbUJBQW1CLElBQUksU0FBUyxzQkFBc0IscUJBQXFCO0FBQUEsSUFDMUk7QUFBQSxFQUNEO0FBRUEsUUFBTSxnQkFBZ0IsQ0FBQyxTQUF5QjtBQUMvQyxXQUFPLFdBQVcsVUFBVSxLQUFLLE9BQU8sT0FBTyxXQUFXLE9BQU8sSUFBSTtBQUFBLEVBQ3RFO0FBRUEsTUFBSSxlQUFlLHNCQUFzQixjQUFjLFdBQVcsU0FBUztBQUMxRSxXQUFPO0FBQUEsTUFDTixNQUFNLE1BQU0sV0FBVztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUVBLE1BQUksZUFBZSxDQUFDLFdBQVcsVUFBVTtBQUN4QyxXQUFPO0FBQUEsTUFDTixNQUFNLGVBQWU7QUFBQSxNQUNyQixTQUFTLFdBQVcsVUFBVSxXQUFXLFVBQVcsV0FBVyxhQUFhLFNBQVMsc0JBQXNCLHFCQUFxQixJQUFJLFNBQVMsd0JBQXdCLHVCQUF1QjtBQUFBLE1BQzVMLDhCQUE4QjtBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUVBLE1BQUksc0JBQXNCLGdCQUFnQjtBQUN6QyxRQUFJLENBQUMsV0FBVyxXQUFXO0FBQzFCLGFBQU87QUFBQSxRQUNOLE1BQU0sZUFBZTtBQUFBLFFBQ3JCLFNBQVMsU0FBUyw2QkFBNkIsbURBQW1EO0FBQUEsTUFDbkc7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLE1BQ04sTUFBTSxlQUFlO0FBQUEsTUFDckIsU0FBUyxXQUFXLFdBQVcsU0FBUyxrQkFBa0IsaUJBQWlCO0FBQUEsSUFDNUU7QUFBQSxFQUNEO0FBRUEsTUFBSSxzQkFBc0Isb0JBQW9CO0FBQzdDLFFBQUksQ0FBQyxXQUFXLFdBQVc7QUFDMUIsYUFBTztBQUFBLFFBQ04sTUFBTSxlQUFlO0FBQUEsUUFDckIsU0FBUyxTQUFTLGlDQUFpQyx1REFBdUQ7QUFBQSxNQUMzRztBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQXFCLENBQUM7QUFDNUIsYUFBUyxLQUFLLFdBQVcsV0FBVyxTQUFTLHNCQUFzQixxQkFBcUIsQ0FBQztBQUN6RixRQUFJLFdBQVcsV0FBVztBQUN6QixlQUFTLEtBQUssU0FBUyxjQUFjLGtCQUFrQixXQUFXLFNBQVMsQ0FBQztBQUFBLElBQzdFO0FBQ0EsUUFBSSxXQUFXLGNBQWM7QUFDNUIsZUFBUyxLQUFLLFNBQVMsWUFBWSxrQkFBa0IsV0FBVyxZQUFZLENBQUM7QUFBQSxJQUM5RTtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU0sZUFBZTtBQUFBLE1BQ3JCLFNBQVMsY0FBYyxTQUFTLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBRUEsTUFBSSxzQkFBc0IsdUJBQXVCO0FBQ2hELFFBQUksQ0FBQyxXQUFXLFdBQVc7QUFDMUIsYUFBTztBQUFBLFFBQ04sTUFBTSxlQUFlO0FBQUEsUUFDckIsU0FBUyxTQUFTLG9DQUFvQywwREFBMEQ7QUFBQSxNQUNqSDtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQXFCLENBQUM7QUFDNUIsUUFBSSxXQUFXLFNBQVM7QUFDdkIsZUFBUyxLQUFLLFdBQVcsT0FBTztBQUFBLElBQ2pDLFdBQVcsV0FBVyxzQkFBc0I7QUFDM0MsZUFBUyxLQUFLLFNBQVMsa0NBQWtDLHlDQUF5QyxXQUFXLG9CQUFvQixDQUFDO0FBQUEsSUFDbkksT0FBTztBQUNOLGVBQVMsS0FBSyxTQUFTLHlCQUF5Qix3QkFBd0IsQ0FBQztBQUFBLElBQzFFO0FBRUEsUUFBSSxXQUFXLGNBQWM7QUFDNUIsZUFBUyxLQUFLLFNBQVMsWUFBWSxrQkFBa0IsV0FBVyxZQUFZLENBQUM7QUFBQSxJQUM5RTtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU0sZUFBZTtBQUFBLE1BQ3JCLFNBQVMsY0FBYyxTQUFTLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBR0EsTUFBSTtBQUNKLE1BQUksc0JBQXNCLGNBQWMsV0FBVyxhQUFhO0FBQy9ELDJCQUF1QixXQUFXLGVBQWUsRUFBRSxLQUFLLFFBQU0sR0FBRyxNQUFNLE1BQU0sV0FBVyxXQUFXO0FBQUEsRUFDcEc7QUFFQSxNQUFJLFdBQVcsY0FBYyxXQUFXLGFBQWEsV0FBVyxnQkFBZ0Isc0JBQXNCO0FBQ3JHLFVBQU0sV0FBcUIsQ0FBQztBQUM1QixRQUFJLE9BQU8sV0FBVyxhQUFhLE1BQU0sY0FBYyxVQUFVLE1BQU0sc0JBQXNCO0FBQzdGLFFBQUksQ0FBQyxXQUFXLFdBQVc7QUFDMUIsYUFBTyxNQUFNO0FBQ2IsZUFBUyxLQUFLLFNBQVMseUJBQXlCLDREQUE0RCxDQUFDO0FBQUEsSUFDOUc7QUFFQSxRQUFJLFdBQVcsWUFBWTtBQUMxQixlQUFTLEtBQUssU0FBUyxjQUFjLG9CQUFvQixXQUFXLFVBQVUsQ0FBQztBQUFBLElBQ2hGO0FBQ0EsUUFBSSxXQUFXLFdBQVc7QUFDekIsZUFBUyxLQUFLLFNBQVMsY0FBYyxrQkFBa0IsV0FBVyxTQUFTLENBQUM7QUFBQSxJQUM3RTtBQUNBLFFBQUksV0FBVyxjQUFjO0FBQzVCLGVBQVMsS0FBSyxTQUFTLFlBQVksa0JBQWtCLFdBQVcsWUFBWSxDQUFDO0FBQUEsSUFDOUU7QUFDQSxRQUFJLHNCQUFzQjtBQUN6QixlQUFTLEtBQUssU0FBUyxlQUFlLDZCQUE2QixHQUFHLGFBQWEsWUFBWSxxQkFBcUIsS0FBSyxFQUFFLFVBQVUsS0FBSyxDQUFDLENBQUMsS0FBSyxxQkFBcUIsVUFBVSxFQUFFLENBQUM7QUFBQSxJQUNwTDtBQUVBLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxTQUFTLGNBQWMsU0FBUyxLQUFLLElBQUksQ0FBQztBQUFBLElBQzNDO0FBQUEsRUFDRDtBQUVBLFFBQU0sVUFBVSxXQUFXLFVBQVUsV0FBVyxVQUFVLHNCQUFzQixjQUFjLGVBQWUsYUFBYSxZQUFZLFdBQVcsR0FBRyxJQUFJLFNBQVMsY0FBYyxZQUFZO0FBQzNMLFNBQU87QUFBQSxJQUNOLE1BQU0sZUFBZTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUNEO0FBRUEsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsUUFDTixHQUFHLFVBQVUseUJBQXlCLHlCQUF5QjtBQUFBLFFBQy9ELGVBQWUsU0FBUyxFQUFFLEtBQUssd0JBQXdCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLDBCQUEwQjtBQUFBLE1BQ3hIO0FBQUEsTUFDQSxJQUFJO0FBQUEsTUFDSixNQUFNLE1BQU07QUFBQSxNQUNaLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsT0FBTyxRQUFRLG1CQUFtQjtBQUFBLE1BQ3hELEdBQUc7QUFBQSxRQUNGLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLE1BQ1AsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSxjQUFjLFNBQVMsSUFBSSxhQUFhO0FBQzlDLFVBQU0sWUFBWSxTQUFTLG1CQUFtQjtBQUM5QyxpQkFBYSxzQkFBc0I7QUFBQSxFQUNwQztBQUNELENBQUM7QUFFRCxNQUFlLCtCQUErQixRQUFRO0FBQUEsRUFDckQsTUFBTSxJQUFJLFVBQTRCLG9CQUFxRDtBQUMxRixVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSxVQUFVLGFBQWEsYUFBYSxFQUFFO0FBQzVDLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsUUFBSSxlQUFlO0FBQ25CLFFBQUksc0JBQXNCLG1CQUFtQixJQUFJLFNBQVMsc0JBQXNCLFNBQVM7QUFDeEYscUJBQWUsR0FBRyxtQkFBbUIsSUFBSSxPQUFPLE1BQU0sbUJBQW1CLElBQUksS0FBSztBQUFBLElBQ25GO0FBRUEsVUFBTSxhQUFhLFNBQVMsSUFBSSxrQkFBa0I7QUFDbEQsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLG9CQUFvQjtBQUN2RCxVQUFNLFFBQVEsTUFBTSxLQUFLLFNBQVMsWUFBWSxZQUFZO0FBQzFELFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUk7QUFDSCxhQUFPLE1BQU0sUUFBUSx3QkFBd0IsTUFBTSxTQUFTLE1BQU0sS0FBSztBQUFBLElBQ3hFLFNBQVMsR0FBRztBQUNYLG9CQUFjLE1BQU0sU0FBUyx1QkFBdUIsNkNBQTZDLE1BQU0sU0FBUyxFQUFFLE9BQU8sQ0FBQztBQUFBLElBQzNIO0FBRUEsUUFBSSxDQUFDLE1BQU0sUUFBUTtBQUNsQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLGFBQXFEO0FBQ3pELFFBQUksS0FBSyxlQUFlLEtBQUssYUFBYSxTQUFTLEdBQUc7QUFDckQsWUFBTSxjQUFjLEtBQUssWUFBWSxJQUFJLFdBQVMsRUFBRSxPQUFPLEtBQUssRUFBRTtBQUNsRSxZQUFNLHFCQUFxQixNQUFNLFdBQVcsS0FBSyxhQUFhLEVBQUUsYUFBYSxTQUFTLDRCQUE0QixtQ0FBbUMsRUFBRSxDQUFDO0FBQ3hKLFVBQUksQ0FBQyxvQkFBb0I7QUFDeEI7QUFBQSxNQUNEO0FBRUEsbUJBQWEsbUJBQW1CO0FBQUEsSUFDakM7QUFFQSxVQUFNLE1BQTRCLEVBQUUsTUFBTSxzQkFBc0IsU0FBUyxHQUFHLE1BQU07QUFDbEYsUUFBSSxvQkFBb0I7QUFDdkIsWUFBTSxhQUFhLHNCQUFzQixtQkFBbUIsTUFBTSxDQUFDO0FBQUEsSUFDcEU7QUFFQSxVQUFNLGFBQWEsa0JBQWtCO0FBQUEsTUFDcEMsYUFBYSxLQUFLO0FBQUEsTUFDbEI7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaLGFBQWEsS0FBSztBQUFBLE1BQ2xCO0FBQUEsTUFDQSxvQkFBb0IsRUFBRSxTQUFTLFFBQVEsS0FBSyxPQUFPO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLFNBQVMsWUFBZ0MsY0FBdUI7QUFDdkUsV0FBTyxJQUFJLFFBQXdELGFBQVc7QUFDN0UsWUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFlBQU0sUUFBUSxZQUFZLElBQUksV0FBVyxlQUFlLENBQUM7QUFDekQsWUFBTSxTQUFTLFNBQVMsbUNBQW1DLHdDQUF3QztBQUNuRyxZQUFNLGNBQWMsU0FBUyx3Q0FBd0MscUZBQXFGO0FBQzFKLFVBQUksY0FBYztBQUNqQixjQUFNLFFBQVE7QUFDZCxjQUFNLGlCQUFpQixDQUFDLEdBQUcsYUFBYSxNQUFNO0FBQUEsTUFDL0M7QUFDQSxrQkFBWSxJQUFJLE1BQU0saUJBQWlCLE9BQUs7QUFDM0MsY0FBTSxNQUFNLEtBQUssYUFBYSxHQUFHLEtBQUs7QUFDdEMsY0FBTSxvQkFBb0IsS0FBSztBQUFBLE1BQ2hDLENBQUMsQ0FBQztBQUNGLGtCQUFZLElBQUksTUFBTSxZQUFZLE1BQU07QUFDdkMsY0FBTSxJQUFJLEtBQUssYUFBYSxNQUFNLE9BQU8sSUFBSTtBQUM3QyxZQUFJLE9BQU8sR0FBRyxFQUFFLE9BQU8sS0FBSyxDQUFDLEdBQUc7QUFDL0IsZ0JBQU0sb0JBQW9CLEVBQUU7QUFBQSxRQUM3QixPQUFPO0FBQ04sa0JBQVEsQ0FBQztBQUFBLFFBQ1Y7QUFDQSxjQUFNLFFBQVE7QUFBQSxNQUNmLENBQUMsQ0FBQztBQUNGLGtCQUFZLElBQUksTUFBTSxVQUFVLE1BQU07QUFDckMsZ0JBQVEsTUFBUztBQUNqQixvQkFBWSxRQUFRO0FBQUEsTUFDckIsQ0FBQyxDQUFDO0FBQ0YsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxLQUFLO0FBQUEsSUFDWixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBSVEsYUFBYSxPQUFlLFNBQXNGO0FBQ3pILFVBQU0sUUFBUSwrQkFBK0IsS0FBSyxLQUFLO0FBQ3ZELFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTyxFQUFFLE9BQU8sU0FBUyw0QkFBNEIsd0ZBQXdGLEVBQUU7QUFBQSxJQUNoSjtBQUVBLFVBQU0sUUFBUSxDQUFDLE1BQWMsVUFBVSx3QkFBd0IsS0FBSyxDQUFDLElBQUksd0JBQXdCLEtBQUssQ0FBQztBQUN2RyxVQUFNLENBQUMsRUFBRSxVQUFVLE9BQU8sS0FBSyxTQUFTLEdBQUcsSUFBSTtBQUUvQyxlQUFXLEtBQUssQ0FBQyxVQUFVLE1BQU0sR0FBRztBQUNuQyxVQUFJLENBQUMsTUFBTSxDQUFDLEdBQUc7QUFDZCxlQUFPLEVBQUUsT0FBTyxTQUFTLDhCQUE4Qiw2RUFBK0UsQ0FBQyxFQUFFO0FBQUEsTUFDMUk7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsT0FBTyxRQUFRO0FBQzdCLFVBQU0sTUFBTSxPQUFPLE1BQU07QUFDekIsVUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTLEVBQUUsQ0FBQztBQUN2QyxRQUFJLFNBQVMsS0FBSztBQUNqQixVQUFJLFFBQVEsS0FBSztBQUNoQixlQUFPLEVBQUUsT0FBTyxTQUFTLDJCQUEyQixnREFBZ0QsVUFBVSxNQUFNLEVBQUU7QUFBQSxNQUN2SDtBQUNBLGFBQU8sRUFBRSxTQUFTLE9BQU8sT0FBTyxNQUFNLEtBQUssRUFBRTtBQUFBLElBQzlDO0FBRUEsV0FBTyxFQUFFLFNBQVMsT0FBTyxPQUFPLEdBQUcsRUFBRTtBQUFBLEVBQ3RDO0FBQ0Q7QUFFQSxnQkFBZ0IsY0FBYyx1QkFBdUI7QUFBQSxFQUNwRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLFFBQ04sR0FBRyxVQUFVLDhCQUE4QixnQ0FBZ0M7QUFBQSxRQUMzRSxlQUFlLFNBQVMsRUFBRSxLQUFLLG9CQUFvQixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxzQkFBc0I7QUFBQSxNQUNoSDtBQUFBLE1BQ0EsSUFBSTtBQUFBLE1BQ0osTUFBTSxNQUFNO0FBQUEsTUFDWixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUksNkNBQTZDLGVBQWUsT0FBTyxRQUFRLG1CQUFtQixDQUFDO0FBQUEsTUFDekgsR0FBRztBQUFBLFFBQ0YsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsTUFDUCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyx1QkFBdUI7QUFBQSxFQUNwRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLCtCQUErQixpQkFBaUI7QUFBQSxNQUNqRSxNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsTUFBTSxlQUFlLElBQUksNkNBQTZDLHFDQUFxQztBQUFBLFFBQzNHLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHVCQUF1Qiw2QkFBNkI7QUFBQSxNQUNyRSxJQUFJO0FBQUEsTUFDSixNQUFNLE1BQU07QUFBQSxNQUNaLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLE9BQU8sUUFBUSxtQkFBbUI7QUFBQSxNQUN4RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksVUFBa0M7QUFDckMsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLGlCQUFhLHdCQUF3QixDQUFDLGFBQWEsU0FBUyxFQUFFLHdCQUF3QixDQUFDO0FBQUEsRUFDeEY7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsb0JBQW9CLG1CQUFtQjtBQUFBLE1BQ3ZELE1BQU0sUUFBUTtBQUFBLE1BQ2QsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sNkJBQTZCLFlBQVkscUJBQXFCO0FBQUEsTUFDckUsR0FBRztBQUFBLFFBQ0YsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLDZCQUE2QixZQUFZLHFCQUFxQjtBQUFBLE1BQ3JFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsWUFBNEM7QUFDakYsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFFBQUksc0JBQXNCLFlBQVk7QUFDckMsWUFBTSxhQUFhLGtCQUFrQixXQUFXLE1BQU0sQ0FBQztBQUFBLElBQ3hELFdBQVcsc0JBQXNCLG9CQUFvQjtBQUNwRCxZQUFNLGFBQWEsMEJBQTBCLFdBQVcsTUFBTSxDQUFDO0FBQUEsSUFDaEUsV0FBVyxzQkFBc0IsZ0JBQWdCO0FBQ2hELFlBQU0sYUFBYSxzQkFBc0IsV0FBVyxNQUFNLENBQUM7QUFBQSxJQUM1RCxXQUFXLHNCQUFzQix1QkFBdUI7QUFDdkQsWUFBTSxhQUFhLDZCQUE2QixXQUFXLHNCQUFzQixXQUFXLE1BQU07QUFBQSxJQUNuRztBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsUUFDTixHQUFHLFVBQVUsd0JBQXdCLHdCQUF3QjtBQUFBLFFBQzdELGVBQWUsU0FBUyxFQUFFLEtBQUssMEJBQTBCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLDBCQUEwQjtBQUFBLE1BQzFIO0FBQUEsTUFDQSxJQUFJO0FBQUEsTUFDSixNQUFNLE1BQU07QUFBQSxNQUNaLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsT0FBTyxRQUFRLG1CQUFtQjtBQUFBLE1BQ3hELEdBQUc7QUFBQSxRQUNGLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUksMkJBQTJCLDZCQUE2QixZQUFZLHFCQUFxQixDQUFDO0FBQUEsTUFDcEgsR0FBRztBQUFBLFFBQ0YsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsTUFDUCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsSUFBSSxVQUFrQztBQUNyQyxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsaUJBQWEsa0JBQWtCO0FBQy9CLGlCQUFhLDBCQUEwQjtBQUN2QyxpQkFBYSxzQkFBc0I7QUFDbkMsaUJBQWEsNkJBQTZCO0FBQUEsRUFDM0M7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsUUFDTixHQUFHLFVBQVUsd0JBQXdCLHdCQUF3QjtBQUFBLFFBQzdELGVBQWUsU0FBUyxFQUFFLEtBQUssMEJBQTBCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLDBCQUEwQjtBQUFBLE1BQzFIO0FBQUEsTUFDQSxJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUksMkJBQTJCLDZCQUE2QixZQUFZLHFCQUFxQixDQUFDO0FBQUEsTUFDcEgsR0FBRztBQUFBLFFBQ0YsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsTUFDUCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxVQUFNLGFBQWEsMkJBQTJCLElBQUk7QUFBQSxFQUNuRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxRQUNOLEdBQUcsVUFBVSx5QkFBeUIseUJBQXlCO0FBQUEsUUFDL0QsZUFBZSxTQUFTLEVBQUUsS0FBSywyQkFBMkIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsMkJBQTJCO0FBQUEsTUFDNUg7QUFBQSxNQUNBLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsSUFBSSwyQkFBMkIsNkJBQTZCLFlBQVkscUJBQXFCLENBQUM7QUFBQSxNQUNwSCxHQUFHO0FBQUEsUUFDRixJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxNQUNQLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFVBQU0sYUFBYSwyQkFBMkIsS0FBSztBQUFBLEVBQ3BEO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHlCQUF5Qix5QkFBeUI7QUFBQSxNQUNuRSxJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUksMkJBQTJCLDZCQUE2QixZQUFZLHFCQUFxQixDQUFDO0FBQUEsTUFDcEgsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSxhQUFhLHdCQUF3QixJQUFJO0FBQUEsRUFDaEQ7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsaUNBQWlDLHNDQUFzQztBQUFBLE1BQ3hGLElBQUk7QUFBQSxNQUNKLE1BQU0sTUFBTTtBQUFBLE1BQ1osTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsT0FBTyxRQUFRLG1CQUFtQjtBQUFBLE1BQ3hEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFDL0QsVUFBTSxzQkFBc0IscUJBQXFCLFNBQTBCLG9DQUFvQztBQUMvRyxVQUFNLGtCQUFrQix3QkFBd0IsU0FBUyxTQUFTO0FBQ2xFLFVBQU0scUJBQXFCLFlBQVksc0NBQXNDLGVBQWU7QUFBQSxFQUM3RjtBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxXQUE0QjtBQUFBLEVBQ3pELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixRQUFRO0FBQUEsTUFDUixPQUFPLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUFBLE1BQ3BELE1BQU0sUUFBUTtBQUFBLE1BQ2QsY0FBYztBQUFBLE1BQ2QsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU0sNkJBQTZCLFlBQVksb0JBQW9CO0FBQUEsUUFDbkUsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1IsR0FBRztBQUFBLFFBQ0YsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxVQUFVLFVBQTRCLE1BQXVCLFlBQW1HO0FBQ3JLLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxRQUFJLHNCQUFzQixZQUFZO0FBQ3JDLFlBQU0sU0FBUyxNQUFNLHFCQUFxQixZQUFZLE9BQU8sT0FBTyxNQUFNLGNBQWMsYUFBYTtBQUNyRyxVQUFJLFFBQVE7QUFDWCxjQUFNLGFBQWEsT0FBTyxXQUFXO0FBQ3JDLFlBQUksYUFBYSxVQUFVLEdBQUc7QUFDN0IscUJBQVcsZ0JBQStDLGlDQUFpQyxHQUFHLHFCQUFxQixXQUFXLFlBQVksV0FBVyxNQUFNO0FBQUEsUUFDNUo7QUFBQSxNQUNEO0FBQUEsSUFDRCxXQUFXLHNCQUFzQixvQkFBb0I7QUFDcEQsWUFBTSxxQkFBcUIsU0FBUyxJQUFJLG1CQUFtQjtBQUMzRCxZQUFNLFVBQW9CO0FBQUEsUUFBQyxJQUFJLE9BQU8sNEJBQTRCLFNBQVMsaUJBQWlCLG1CQUFtQixHQUFHLFFBQVcsTUFBTSxZQUFZLEtBQUssZUFBZSxFQUFFLFlBQVksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUFBLFFBQ3JNLElBQUksT0FBTyw0QkFBNEIsU0FBUyxnQkFBZ0IsbUJBQW1CLEdBQUcsUUFBVyxNQUFNLFlBQVksS0FBSyxlQUFlLEVBQUUsWUFBWSxNQUFNLFdBQVcsQ0FBQyxDQUFDO0FBQUEsTUFBQztBQUN6SyxZQUFNLFVBQVUsZ0NBQWdDLElBQUksV0FBVyxNQUFNLENBQUM7QUFFdEUsVUFBSSxTQUFTO0FBQ1osMkJBQW1CLGdCQUFnQjtBQUFBLFVBQ2xDLFlBQVksTUFBTTtBQUFBLFVBQ2xCLFdBQVcsTUFBTTtBQUFBLFVBQ2pCLFFBQVEsTUFBTSxRQUFRLE9BQU87QUFBQSxRQUM5QixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssZUFBZSxFQUFFLFlBQVksTUFBTSxZQUFZLENBQUM7QUFBQSxJQUN0RDtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBR0QsZ0JBQWdCLGNBQWMsV0FBNEI7QUFBQSxFQUN6RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQ1IsT0FBTyxTQUFTLGtCQUFrQiw0QkFBNEI7QUFBQSxNQUM5RCxNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSw2QkFBNkIsVUFBVSxvQkFBb0I7QUFBQSxNQUNsRSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsVUFBVSxXQUE2QixNQUF1QixZQUFpQztBQUM5RixTQUFLLGVBQWUsRUFBRSxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQUEsRUFDakQ7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsV0FBNEI7QUFBQSxFQUN6RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQ1IsT0FBTyxTQUFTLGdCQUFnQixtQkFBbUI7QUFBQSxNQUNuRCxjQUFjO0FBQUEsTUFDZCxNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLEdBQUcsNkJBQTZCLFVBQVUsb0JBQW9CLEdBQUcsNkJBQTZCLFVBQVUsZ0JBQWdCLENBQUM7QUFBQSxNQUMvSSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsVUFBVSxXQUE2QixNQUF1QixZQUFpQztBQUM5RixTQUFLLGVBQWUsRUFBRSxZQUFZLE1BQU0sV0FBVyxDQUFDO0FBQUEsRUFDckQ7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsV0FBNEI7QUFBQSxFQUN6RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQ1IsT0FBTyxTQUFTLFlBQVksY0FBYztBQUFBLE1BQzFDLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWU7QUFBQSxVQUNwQjtBQUFBLFVBQ0EsZUFBZSxHQUFHLDZCQUE2QixVQUFVLFlBQVksR0FBRyw2QkFBNkIsVUFBVSxxQkFBcUIsR0FBRyw2QkFBNkIsVUFBVSx1QkFBdUIsQ0FBQztBQUFBLFFBQ3ZNO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxVQUFVLFVBQTRCLE1BQXVCLFlBQXlCO0FBQzNGLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxVQUFNLE9BQU8seUJBQXlCLFVBQVU7QUFDaEQsVUFBTSxRQUFRLGFBQWEsU0FBUyxFQUFFLG1CQUFtQixJQUFJO0FBQzdELFVBQU0sU0FBUyxNQUFNLFNBQVMsSUFBSSxrQkFBa0IsRUFBRTtBQUFBLE1BQ3JELE1BQU0sSUFBSSxXQUFTLEVBQUUsT0FBTyxLQUFLLE9BQU8sYUFBYSxLQUFLLGFBQWEsTUFBTSxLQUFLLEtBQUssRUFBRTtBQUFBLE1BQ3pGLEVBQUUsYUFBYSxTQUFTLHdCQUF3Qix3QkFBd0IsRUFBRTtBQUFBLElBQzNFO0FBRUEsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFNBQVMsVUFBVTtBQUN0QixZQUFNLE9BQU8sb0JBQUksSUFBbUM7QUFDcEQsV0FBSyxJQUFJLFdBQVcsTUFBTSxHQUFHLEVBQUUsTUFBTSxPQUFPLE1BQU0sV0FBVyxPQUFPLE1BQU0sQ0FBQztBQUMzRSxtQkFBYSxrQkFBa0IsV0FBVyxhQUFhLE1BQU0sS0FBSztBQUFBLElBQ25FLFdBQVcsc0JBQXNCLHVCQUF1QjtBQUN2RCxtQkFBYSw2QkFBNkIsV0FBVyxzQkFBc0IsV0FBVyxNQUFNO0FBQzVGLG1CQUFhLHlCQUF5QixFQUFFLEdBQUcsV0FBVyxPQUFPLEdBQUcsTUFBTSxPQUFPLE1BQU0sV0FBVyxPQUFPLE1BQU0sQ0FBQztBQUFBLElBQzdHLFdBQVcsc0JBQXNCLHFCQUFxQjtBQUNyRCxpQkFBVyxPQUFPLE9BQU87QUFDekIsaUJBQVcsWUFBWSxPQUFPO0FBQzlCLG1CQUFhLGdDQUFnQyxZQUFZLFdBQVcsU0FBUztBQUFBLElBQzlFO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbInNlY29uZGFyeSJdCn0K
