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
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Action } from "../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { posix } from "../../../../base/common/path.js";
import { commonSuffixLength } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { getActionBarActions, getContextMenuActions, MenuEntryActionViewItem, SubmenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { asCssVariable, textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { CALLSTACK_VIEW_ID, CONTEXT_CALLSTACK_FOCUSED, CONTEXT_CALLSTACK_ITEM_STOPPED, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD, CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_STACK_FRAME_SUPPORTS_RESTART, getStateLabel, IDebugService, isFrameDeemphasized, State } from "../common/debug.js";
import { StackFrame, Thread, ThreadAndSessionIds } from "../common/debugModel.js";
import { isSessionAttach } from "../common/debugUtils.js";
import { renderViewTree } from "./baseDebugView.js";
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from "./debugCommands.js";
import * as icons from "./debugIcons.js";
import { createDisconnectMenuItemAction } from "./debugToolBar.js";
const $ = dom.$;
function getSessionContext(element) {
  return {
    sessionId: element.getId()
  };
}
function getThreadContext(element) {
  return {
    ...getSessionContext(element.session),
    threadId: element.getId()
  };
}
function getStackFrameContext(element) {
  return {
    ...getThreadContext(element.thread),
    frameId: element.getId(),
    frameName: element.name,
    frameLocation: { range: element.range, source: element.source.raw }
  };
}
function getContext(element) {
  if (element instanceof StackFrame) {
    return getStackFrameContext(element);
  } else if (element instanceof Thread) {
    return getThreadContext(element);
  } else if (isDebugSession(element)) {
    return getSessionContext(element);
  } else {
    return void 0;
  }
}
function getContextForContributedActions(element) {
  if (element instanceof StackFrame) {
    if (element.source.inMemory) {
      return element.source.raw.path || element.source.reference || element.source.name;
    }
    return element.source.uri.toString();
  }
  if (element instanceof Thread) {
    return element.threadId;
  }
  if (isDebugSession(element)) {
    return element.getId();
  }
  return "";
}
function getSpecificSourceName(stackFrame) {
  let callStack = stackFrame.thread.getStaleCallStack();
  callStack = callStack.length > 0 ? callStack : stackFrame.thread.getCallStack();
  const otherSources = callStack.map((sf) => sf.source).filter((s) => s !== stackFrame.source);
  let suffixLength = 0;
  otherSources.forEach((s) => {
    if (s.name === stackFrame.source.name) {
      suffixLength = Math.max(suffixLength, commonSuffixLength(stackFrame.source.uri.path, s.uri.path));
    }
  });
  if (suffixLength === 0) {
    return stackFrame.source.name;
  }
  const from = Math.max(0, stackFrame.source.uri.path.lastIndexOf(posix.sep, stackFrame.source.uri.path.length - suffixLength - 1));
  return (from > 0 ? "..." : "") + stackFrame.source.uri.path.substring(from);
}
async function expandTo(session, tree) {
  if (session.parentSession) {
    await expandTo(session.parentSession, tree);
  }
  await tree.expand(session);
}
let CallStackView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, themeService, hoverService, menuService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.options = options;
    this.debugService = debugService;
    this.menuService = menuService;
    this.needsRefresh = false;
    this.ignoreSelectionChangedEvent = false;
    this.ignoreFocusStackFrameEvent = false;
    this.autoExpandedSessions = /* @__PURE__ */ new Set();
    this.selectionNeedsUpdate = false;
    this.onCallStackChangeScheduler = this._register(new RunOnceScheduler(async () => {
      const sessions = this.debugService.getModel().getSessions();
      if (sessions.length === 0) {
        this.autoExpandedSessions.clear();
      }
      const thread = sessions.length === 1 && sessions[0].getAllThreads().length === 1 ? sessions[0].getAllThreads()[0] : void 0;
      const stoppedDetails = sessions.length === 1 ? sessions[0].getStoppedDetails() : void 0;
      if (stoppedDetails && (thread || typeof stoppedDetails.threadId !== "number")) {
        this.stateMessageLabel.textContent = stoppedDescription(stoppedDetails);
        this.stateMessageLabelHover.update(stoppedText(stoppedDetails));
        this.stateMessageLabel.classList.toggle("exception", stoppedDetails.reason === "exception");
        this.stateMessage.hidden = false;
      } else if (sessions.length === 1 && sessions[0].state === State.Running) {
        this.stateMessageLabel.textContent = localize({ key: "running", comment: ["indicates state"] }, "Running");
        this.stateMessageLabelHover.update(sessions[0].getLabel());
        this.stateMessageLabel.classList.remove("exception");
        this.stateMessage.hidden = false;
      } else {
        this.stateMessage.hidden = true;
      }
      this.updateActions();
      this.needsRefresh = false;
      await this.tree.updateChildren();
      try {
        const toExpand = /* @__PURE__ */ new Set();
        sessions.forEach((s) => {
          if (s.parentSession && !this.autoExpandedSessions.has(s.parentSession)) {
            toExpand.add(s.parentSession);
          }
        });
        for (const session of toExpand) {
          await expandTo(session, this.tree);
          this.autoExpandedSessions.add(session);
        }
      } catch (e) {
      }
      if (this.selectionNeedsUpdate) {
        this.selectionNeedsUpdate = false;
        await this.updateTreeSelection();
      }
    }, 50));
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.options.title);
    this.stateMessage = dom.append(container, $("span.call-stack-state-message"));
    this.stateMessage.hidden = true;
    this.stateMessageLabel = dom.append(this.stateMessage, $("span.label"));
    this.stateMessageLabelHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.stateMessage, ""));
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-call-stack");
    const treeContainer = renderViewTree(container);
    this.dataSource = new CallStackDataSource(this.debugService);
    this.tree = this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, "CallStackView", treeContainer, new CallStackDelegate(), new CallStackCompressionDelegate(this.debugService), [
      this.instantiationService.createInstance(SessionsRenderer),
      this.instantiationService.createInstance(ThreadsRenderer),
      this.instantiationService.createInstance(StackFramesRenderer),
      this.instantiationService.createInstance(ErrorsRenderer),
      new LoadMoreRenderer(),
      new ShowMoreRenderer()
    ], this.dataSource, {
      accessibilityProvider: new CallStackAccessibilityProvider(),
      compressionEnabled: true,
      autoExpandSingleChildren: true,
      identityProvider: {
        getId: (element) => {
          if (typeof element === "string") {
            return element;
          }
          if (element instanceof Array) {
            return `showMore ${element[0].getId()}`;
          }
          return element.getId();
        }
      },
      keyboardNavigationLabelProvider: {
        getKeyboardNavigationLabel: (e) => {
          if (isDebugSession(e)) {
            return e.getLabel();
          }
          if (e instanceof Thread) {
            return `${e.name} ${e.stateLabel}`;
          }
          if (e instanceof StackFrame || typeof e === "string") {
            return e;
          }
          if (e instanceof ThreadAndSessionIds) {
            return LoadMoreRenderer.LABEL;
          }
          return localize("showMoreStackFrames2", "Show More Stack Frames");
        },
        getCompressedNodeKeyboardNavigationLabel: (e) => {
          const firstItem = e[0];
          if (isDebugSession(firstItem)) {
            return firstItem.getLabel();
          }
          return "";
        }
      },
      expandOnlyOnTwistieClick: true,
      overrideStyles: this.getLocationBasedColors().listOverrideStyles
    });
    CONTEXT_CALLSTACK_FOCUSED.bindTo(this.tree.contextKeyService);
    this.tree.setInput(this.debugService.getModel());
    this._register(this.tree);
    this._register(this.tree.onDidOpen(async (e) => {
      if (this.ignoreSelectionChangedEvent) {
        return;
      }
      const focusStackFrame = (stackFrame, thread, session, options = {}) => {
        this.ignoreFocusStackFrameEvent = true;
        try {
          this.debugService.focusStackFrame(stackFrame, thread, session, { ...options, ...{ explicit: true } });
        } finally {
          this.ignoreFocusStackFrameEvent = false;
        }
      };
      const element = e.element;
      if (element instanceof StackFrame) {
        const opts = {
          preserveFocus: e.editorOptions.preserveFocus,
          sideBySide: e.sideBySide,
          pinned: e.editorOptions.pinned
        };
        focusStackFrame(element, element.thread, element.thread.session, opts);
      }
      if (element instanceof Thread) {
        focusStackFrame(void 0, element, element.session);
      }
      if (isDebugSession(element)) {
        focusStackFrame(void 0, void 0, element);
      }
      if (element instanceof ThreadAndSessionIds) {
        const session = this.debugService.getModel().getSession(element.sessionId);
        const thread = session && session.getThread(element.threadId);
        if (thread) {
          const totalFrames = thread.stoppedDetails?.totalFrames;
          const remainingFramesCount = typeof totalFrames === "number" ? totalFrames - thread.getCallStack().length : void 0;
          await thread.fetchCallStack(remainingFramesCount);
          await this.tree.updateChildren();
        }
      }
      if (element instanceof Array) {
        element.forEach((sf) => this.dataSource.deemphasizedStackFramesToShow.add(sf));
        this.tree.updateChildren();
      }
    }));
    this._register(this.debugService.getModel().onDidChangeCallStack(() => {
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        return;
      }
      if (!this.onCallStackChangeScheduler.isScheduled()) {
        this.onCallStackChangeScheduler.schedule();
      }
    }));
    const onFocusChange = Event.any(this.debugService.getViewModel().onDidFocusStackFrame, this.debugService.getViewModel().onDidFocusSession);
    this._register(onFocusChange(async () => {
      if (this.ignoreFocusStackFrameEvent) {
        return;
      }
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        this.selectionNeedsUpdate = true;
        return;
      }
      if (this.onCallStackChangeScheduler.isScheduled()) {
        this.selectionNeedsUpdate = true;
        return;
      }
      await this.updateTreeSelection();
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    if (this.debugService.state === State.Stopped) {
      this.onCallStackChangeScheduler.schedule(0);
    }
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.onCallStackChangeScheduler.schedule();
      }
    }));
    this._register(this.debugService.onDidNewSession((s) => {
      const sessionListeners = [];
      sessionListeners.push(s.onDidChangeName(() => {
        if (this.tree.hasNode(s)) {
          this.tree.rerender(s);
        }
      }));
      sessionListeners.push(s.onDidEndAdapter(() => dispose(sessionListeners)));
      if (s.parentSession) {
        this.autoExpandedSessions.delete(s.parentSession);
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
  async updateTreeSelection() {
    if (!this.tree || !this.tree.getInput()) {
      return;
    }
    const updateSelectionAndReveal = (element) => {
      this.ignoreSelectionChangedEvent = true;
      try {
        this.tree.setSelection([element]);
        if (this.tree.getRelativeTop(element) === null) {
          this.tree.reveal(element, 0.5);
        } else {
          this.tree.reveal(element);
        }
      } catch (e) {
      } finally {
        this.ignoreSelectionChangedEvent = false;
      }
    };
    const thread = this.debugService.getViewModel().focusedThread;
    const session = this.debugService.getViewModel().focusedSession;
    const stackFrame = this.debugService.getViewModel().focusedStackFrame;
    if (!thread) {
      if (!session) {
        this.tree.setSelection([]);
      } else {
        updateSelectionAndReveal(session);
      }
    } else {
      try {
        await expandTo(thread.session, this.tree);
      } catch (e) {
      }
      try {
        await this.tree.expand(thread);
      } catch (e) {
      }
      const toReveal = stackFrame || session;
      if (toReveal) {
        updateSelectionAndReveal(toReveal);
      }
    }
  }
  onContextMenu(e) {
    const element = e.element;
    let overlay = [];
    if (isDebugSession(element)) {
      overlay = getSessionContextOverlay(element);
    } else if (element instanceof Thread) {
      overlay = getThreadContextOverlay(element);
    } else if (element instanceof StackFrame) {
      overlay = getStackFrameContextOverlay(element);
    }
    const contextKeyService = this.contextKeyService.createOverlay(overlay);
    const menu = this.menuService.getMenuActions(MenuId.DebugCallStackContext, contextKeyService, { arg: getContextForContributedActions(element), shouldForwardArgs: true });
    const result = getContextMenuActions(menu, "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => result.secondary,
      getActionsContext: () => getContext(element)
    });
  }
};
CallStackView = __decorateClass([
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
  __decorateParam(11, IMenuService)
], CallStackView);
function getSessionContextOverlay(session) {
  return [
    [CONTEXT_CALLSTACK_ITEM_TYPE.key, "session"],
    [CONTEXT_CALLSTACK_SESSION_IS_ATTACH.key, isSessionAttach(session)],
    [CONTEXT_CALLSTACK_ITEM_STOPPED.key, session.state === State.Stopped],
    [CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD.key, session.getAllThreads().length === 1]
  ];
}
let SessionsRenderer = class {
  constructor(instantiationService, contextKeyService, hoverService, menuService) {
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.menuService = menuService;
  }
  get templateId() {
    return SessionsRenderer.ID;
  }
  renderTemplate(container) {
    const session = dom.append(container, $(".session"));
    dom.append(session, $(ThemeIcon.asCSSSelector(icons.callstackViewSession)));
    const name = dom.append(session, $(".name"));
    const stateLabel = dom.append(session, $("span.state.label.monaco-count-badge.long"));
    const templateDisposable = new DisposableStore();
    const label = templateDisposable.add(new HighlightedLabel(name));
    const stopActionViewItemDisposables = templateDisposable.add(new DisposableStore());
    const actionBar = templateDisposable.add(new ActionBar(session, {
      actionViewItemProvider: (action, options) => {
        if ((action.id === STOP_ID || action.id === DISCONNECT_ID) && action instanceof MenuItemAction) {
          stopActionViewItemDisposables.clear();
          const item = this.instantiationService.invokeFunction((accessor) => createDisconnectMenuItemAction(action, stopActionViewItemDisposables, accessor, { ...options, menuAsChild: false }));
          if (item) {
            return item;
          }
        }
        if (action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        } else if (action instanceof SubmenuItemAction) {
          return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
        return void 0;
      }
    }));
    const elementDisposable = templateDisposable.add(new DisposableStore());
    return { session, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
  }
  renderElement(element, _, data) {
    this.doRenderElement(element.element, createMatches(element.filterData), data);
  }
  renderCompressedElements(node, _index, templateData) {
    const lastElement = node.element.elements[node.element.elements.length - 1];
    const matches = createMatches(node.filterData);
    this.doRenderElement(lastElement, matches, templateData);
  }
  doRenderElement(session, matches, data) {
    const sessionHover = data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.session, localize({ key: "session", comment: ["Session is a noun"] }, "Session")));
    data.label.set(session.getLabel(), matches);
    const stoppedDetails = session.getStoppedDetails();
    const thread = session.getAllThreads().find((t) => t.stopped);
    const contextKeyService = this.contextKeyService.createOverlay(getSessionContextOverlay(session));
    const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));
    const setupActionBar = () => {
      data.actionBar.clear();
      const { primary } = getActionBarActions(menu.getActions({ arg: getContextForContributedActions(session), shouldForwardArgs: true }), "inline");
      data.actionBar.push(primary, { icon: true, label: false });
      data.actionBar.context = getContext(session);
    };
    data.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
    setupActionBar();
    data.stateLabel.style.display = "";
    if (stoppedDetails) {
      data.stateLabel.textContent = stoppedDescription(stoppedDetails);
      sessionHover.update(`${session.getLabel()}: ${stoppedText(stoppedDetails)}`);
      data.stateLabel.classList.toggle("exception", stoppedDetails.reason === "exception");
    } else if (thread && thread.stoppedDetails) {
      data.stateLabel.textContent = stoppedDescription(thread.stoppedDetails);
      sessionHover.update(`${session.getLabel()}: ${stoppedText(thread.stoppedDetails)}`);
      data.stateLabel.classList.toggle("exception", thread.stoppedDetails.reason === "exception");
    } else {
      data.stateLabel.textContent = localize({ key: "running", comment: ["indicates state"] }, "Running");
      data.stateLabel.classList.remove("exception");
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
  disposeElement(_element, _, templateData) {
    templateData.elementDisposable.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposable.clear();
  }
};
SessionsRenderer.ID = "session";
SessionsRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IMenuService)
], SessionsRenderer);
function getThreadContextOverlay(thread) {
  return [
    [CONTEXT_CALLSTACK_ITEM_TYPE.key, "thread"],
    [CONTEXT_CALLSTACK_ITEM_STOPPED.key, thread.stopped]
  ];
}
let ThreadsRenderer = class {
  constructor(contextKeyService, hoverService, menuService) {
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.menuService = menuService;
  }
  get templateId() {
    return ThreadsRenderer.ID;
  }
  renderTemplate(container) {
    const thread = dom.append(container, $(".thread"));
    const name = dom.append(thread, $(".name"));
    const stateLabel = dom.append(thread, $("span.state.label.monaco-count-badge.long"));
    const templateDisposable = new DisposableStore();
    const label = templateDisposable.add(new HighlightedLabel(name));
    const actionBar = templateDisposable.add(new ActionBar(thread));
    const elementDisposable = templateDisposable.add(new DisposableStore());
    return { thread, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
  }
  renderElement(element, _index, data) {
    const thread = element.element;
    data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.thread, thread.name));
    data.label.set(thread.name, createMatches(element.filterData));
    data.stateLabel.textContent = thread.stateLabel;
    data.stateLabel.classList.toggle("exception", thread.stoppedDetails?.reason === "exception");
    const contextKeyService = this.contextKeyService.createOverlay(getThreadContextOverlay(thread));
    const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));
    const setupActionBar = () => {
      data.actionBar.clear();
      const { primary } = getActionBarActions(menu.getActions({ arg: getContextForContributedActions(thread), shouldForwardArgs: true }), "inline");
      data.actionBar.push(primary, { icon: true, label: false });
      data.actionBar.context = getContext(thread);
    };
    data.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
    setupActionBar();
  }
  renderCompressedElements(_node, _index, _templateData) {
    throw new Error("Method not implemented.");
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposable.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
};
ThreadsRenderer.ID = "thread";
ThreadsRenderer = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, IMenuService)
], ThreadsRenderer);
function getStackFrameContextOverlay(stackFrame) {
  return [
    [CONTEXT_CALLSTACK_ITEM_TYPE.key, "stackFrame"],
    [CONTEXT_STACK_FRAME_SUPPORTS_RESTART.key, stackFrame.canRestart]
  ];
}
let StackFramesRenderer = class {
  constructor(hoverService, labelService, notificationService) {
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.notificationService = notificationService;
  }
  get templateId() {
    return StackFramesRenderer.ID;
  }
  renderTemplate(container) {
    const stackFrame = dom.append(container, $(".stack-frame"));
    const labelDiv = dom.append(stackFrame, $("span.label.expression"));
    const file = dom.append(stackFrame, $(".file"));
    const fileName = dom.append(file, $("span.file-name"));
    const wrapper = dom.append(file, $("span.line-number-wrapper"));
    const lineNumber = dom.append(wrapper, $("span.line-number.monaco-count-badge"));
    const templateDisposable = new DisposableStore();
    const elementDisposables = new DisposableStore();
    templateDisposable.add(elementDisposables);
    const label = templateDisposable.add(new HighlightedLabel(labelDiv));
    const actionBar = templateDisposable.add(new ActionBar(stackFrame));
    return { file, fileName, label, lineNumber, stackFrame, actionBar, templateDisposable, elementDisposables };
  }
  renderElement(element, index, data) {
    const stackFrame = element.element;
    data.stackFrame.classList.toggle("disabled", !stackFrame.source || !stackFrame.source.available || isFrameDeemphasized(stackFrame));
    data.stackFrame.classList.toggle("label", stackFrame.presentationHint === "label");
    const hasActions = !!stackFrame.thread.session.capabilities.supportsRestartFrame && stackFrame.presentationHint !== "label" && stackFrame.presentationHint !== "subtle" && stackFrame.canRestart;
    data.stackFrame.classList.toggle("has-actions", hasActions);
    let title = stackFrame.source.inMemory ? stackFrame.source.uri.path : this.labelService.getUriLabel(stackFrame.source.uri);
    if (stackFrame.source.raw.origin) {
      title += `
${stackFrame.source.raw.origin}`;
    }
    data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.file, title));
    data.label.set(stackFrame.name, createMatches(element.filterData), stackFrame.name);
    data.fileName.textContent = getSpecificSourceName(stackFrame);
    if (stackFrame.range.startLineNumber !== void 0) {
      data.lineNumber.textContent = `${stackFrame.range.startLineNumber}`;
      if (stackFrame.range.startColumn) {
        data.lineNumber.textContent += `:${stackFrame.range.startColumn}`;
      }
      data.lineNumber.classList.remove("unavailable");
    } else {
      data.lineNumber.classList.add("unavailable");
    }
    data.actionBar.clear();
    if (hasActions) {
      const action = data.elementDisposables.add(new Action("debug.callStack.restartFrame", localize("restartFrame", "Restart Frame"), ThemeIcon.asClassName(icons.debugRestartFrame), true, async () => {
        try {
          await stackFrame.restart();
        } catch (e) {
          this.notificationService.error(e);
        }
      }));
      data.actionBar.push(action, { icon: true, label: false });
    }
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
};
StackFramesRenderer.ID = "stackFrame";
StackFramesRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, INotificationService)
], StackFramesRenderer);
let ErrorsRenderer = class {
  constructor(hoverService) {
    this.hoverService = hoverService;
  }
  get templateId() {
    return ErrorsRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, $(".error"));
    return { label, templateDisposable: new DisposableStore() };
  }
  renderElement(element, index, data) {
    const error = element.element;
    data.label.textContent = error;
    data.templateDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.label, error));
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeTemplate(templateData) {
  }
};
ErrorsRenderer.ID = "error";
ErrorsRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], ErrorsRenderer);
const _LoadMoreRenderer = class _LoadMoreRenderer {
  constructor() {
  }
  get templateId() {
    return _LoadMoreRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, $(".load-all"));
    label.style.color = asCssVariable(textLinkForeground);
    return { label };
  }
  renderElement(element, index, data) {
    data.label.textContent = _LoadMoreRenderer.LABEL;
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeTemplate(templateData) {
  }
};
_LoadMoreRenderer.ID = "loadMore";
_LoadMoreRenderer.LABEL = localize("loadAllStackFrames", "Load More Stack Frames");
let LoadMoreRenderer = _LoadMoreRenderer;
const _ShowMoreRenderer = class _ShowMoreRenderer {
  constructor() {
  }
  get templateId() {
    return _ShowMoreRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, $(".show-more"));
    label.style.color = asCssVariable(textLinkForeground);
    return { label };
  }
  renderElement(element, index, data) {
    const stackFrames = element.element;
    if (stackFrames.every((sf) => !!(sf.source && sf.source.origin && sf.source.origin === stackFrames[0].source.origin))) {
      data.label.textContent = localize("showMoreAndOrigin", "Show {0} More: {1}", stackFrames.length, stackFrames[0].source.origin);
    } else {
      data.label.textContent = localize("showMoreStackFrames", "Show {0} More Stack Frames", stackFrames.length);
    }
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Method not implemented.");
  }
  disposeTemplate(templateData) {
  }
};
_ShowMoreRenderer.ID = "showMore";
let ShowMoreRenderer = _ShowMoreRenderer;
class CallStackDelegate {
  getHeight(element) {
    if (element instanceof StackFrame && element.presentationHint === "label") {
      return 16;
    }
    if (element instanceof ThreadAndSessionIds || element instanceof Array) {
      return 16;
    }
    return 22;
  }
  getTemplateId(element) {
    if (isDebugSession(element)) {
      return SessionsRenderer.ID;
    }
    if (element instanceof Thread) {
      return ThreadsRenderer.ID;
    }
    if (element instanceof StackFrame) {
      return StackFramesRenderer.ID;
    }
    if (typeof element === "string") {
      return ErrorsRenderer.ID;
    }
    if (element instanceof ThreadAndSessionIds) {
      return LoadMoreRenderer.ID;
    }
    return ShowMoreRenderer.ID;
  }
}
function stoppedText(stoppedDetails) {
  return stoppedDetails.text ?? stoppedDescription(stoppedDetails);
}
function stoppedDescription(stoppedDetails) {
  return stoppedDetails.description || (stoppedDetails.reason ? localize({ key: "pausedOn", comment: ["indicates reason for program being paused"] }, "Paused on {0}", stoppedDetails.reason) : localize("paused", "Paused"));
}
function isDebugModel(obj) {
  return !!obj && typeof obj.getSessions === "function";
}
function isDebugSession(obj) {
  return !!obj && typeof obj.getAllThreads === "function";
}
class CallStackDataSource {
  constructor(debugService) {
    this.debugService = debugService;
    this.deemphasizedStackFramesToShow = /* @__PURE__ */ new WeakSet();
  }
  hasChildren(element) {
    if (isDebugSession(element)) {
      const threads = element.getAllThreads();
      return threads.length > 1 || threads.length === 1 && threads[0].stopped || !!this.debugService.getModel().getSessions().find((s) => s.parentSession === element);
    }
    return isDebugModel(element) || element instanceof Thread && element.stopped;
  }
  async getChildren(element) {
    if (isDebugModel(element)) {
      const sessions = element.getSessions();
      if (sessions.length === 0) {
        return Promise.resolve([]);
      }
      if (sessions.length > 1 || this.debugService.getViewModel().isMultiSessionView()) {
        return Promise.resolve(sessions.filter((s) => !s.parentSession));
      }
      const threads = sessions[0].getAllThreads();
      return threads.length === 1 ? this.getThreadChildren(threads[0]) : Promise.resolve(threads);
    } else if (isDebugSession(element)) {
      const childSessions = this.debugService.getModel().getSessions().filter((s) => s.parentSession === element);
      const threads = element.getAllThreads();
      if (threads.length === 1) {
        const children = await this.getThreadChildren(threads[0]);
        return children.concat(childSessions);
      }
      return Promise.resolve(threads.concat(childSessions));
    } else {
      return this.getThreadChildren(element);
    }
  }
  getThreadChildren(thread) {
    return this.getThreadCallstack(thread).then((children) => {
      const result = [];
      children.forEach((child, index) => {
        if (child instanceof StackFrame && child.source && isFrameDeemphasized(child)) {
          if (!this.deemphasizedStackFramesToShow.has(child)) {
            if (result.length) {
              const last = result[result.length - 1];
              if (last instanceof Array) {
                last.push(child);
                return;
              }
            }
            const nextChild = index < children.length - 1 ? children[index + 1] : void 0;
            if (nextChild instanceof StackFrame && nextChild.source && isFrameDeemphasized(nextChild)) {
              result.push([child]);
              return;
            }
          }
        }
        result.push(child);
      });
      return result;
    });
  }
  async getThreadCallstack(thread) {
    let callStack = thread.getCallStack();
    if (!callStack || !callStack.length) {
      await thread.fetchCallStack();
      callStack = thread.getCallStack();
    }
    if (callStack.length === 1 && thread.session.capabilities.supportsDelayedStackTraceLoading && thread.stoppedDetails && thread.stoppedDetails.totalFrames && thread.stoppedDetails.totalFrames > 1) {
      callStack = callStack.concat(thread.getStaleCallStack().slice(1));
    }
    if (thread.stoppedDetails && thread.stoppedDetails.framesErrorMessage) {
      callStack = callStack.concat([thread.stoppedDetails.framesErrorMessage]);
    }
    if (!thread.reachedEndOfCallStack && thread.stoppedDetails) {
      callStack = callStack.concat([new ThreadAndSessionIds(thread.session.getId(), thread.threadId)]);
    }
    return callStack;
  }
}
class CallStackAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize({ comment: ["Debug is a noun in this context, not a verb."], key: "callStackAriaLabel" }, "Debug Call Stack");
  }
  getWidgetRole() {
    return "treegrid";
  }
  getRole(_element) {
    return "row";
  }
  getAriaLabel(element) {
    if (element instanceof Thread) {
      return localize({ key: "threadAriaLabel", comment: ['Placeholders stand for the thread name and the thread state.For example "Thread 1" and "Stopped'] }, "Thread {0} {1}", element.name, element.stateLabel);
    }
    if (element instanceof StackFrame) {
      return localize("stackFrameAriaLabel", "Stack Frame {0}, line {1}, {2}", element.name, element.range.startLineNumber, getSpecificSourceName(element));
    }
    if (isDebugSession(element)) {
      const thread = element.getAllThreads().find((t) => t.stopped);
      const state = thread ? thread.stateLabel : localize({ key: "running", comment: ["indicates state"] }, "Running");
      return localize({ key: "sessionLabel", comment: ['Placeholders stand for the session name and the session state. For example "Launch Program" and "Running"'] }, "Session {0} {1}", element.getLabel(), state);
    }
    if (typeof element === "string") {
      return element;
    }
    if (element instanceof Array) {
      return localize("showMoreStackFrames", "Show {0} More Stack Frames", element.length);
    }
    return LoadMoreRenderer.LABEL;
  }
}
class CallStackCompressionDelegate {
  constructor(debugService) {
    this.debugService = debugService;
  }
  isIncompressible(stat) {
    if (isDebugSession(stat)) {
      if (stat.compact) {
        return false;
      }
      const sessions = this.debugService.getModel().getSessions();
      if (sessions.some((s) => s.parentSession === stat && s.compact)) {
        return false;
      }
      return true;
    }
    return true;
  }
}
registerAction2(class Collapse extends ViewAction {
  constructor() {
    super({
      id: "callStack.collapse",
      viewId: CALLSTACK_VIEW_ID,
      title: localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      precondition: CONTEXT_DEBUG_STATE.isEqualTo(getStateLabel(State.Stopped)),
      menu: {
        id: MenuId.ViewTitle,
        order: 10,
        group: "navigation",
        when: ContextKeyExpr.equals("view", CALLSTACK_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
function registerCallStackInlineMenuItem(id, title, icon, when, order, precondition) {
  MenuRegistry.appendMenuItem(MenuId.DebugCallStackContext, {
    group: "inline",
    order,
    when,
    command: { id, title, icon, precondition }
  });
}
const threadOrSessionWithOneThread = ContextKeyExpr.or(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("thread"), ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session"), CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD));
registerCallStackInlineMenuItem(PAUSE_ID, PAUSE_LABEL, icons.debugPause, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED.toNegated()), 10, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated());
registerCallStackInlineMenuItem(CONTINUE_ID, CONTINUE_LABEL, icons.debugContinue, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED), 10);
registerCallStackInlineMenuItem(STEP_OVER_ID, STEP_OVER_LABEL, icons.debugStepOver, threadOrSessionWithOneThread, 20, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_INTO_ID, STEP_INTO_LABEL, icons.debugStepInto, threadOrSessionWithOneThread, 30, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_OUT_ID, STEP_OUT_LABEL, icons.debugStepOut, threadOrSessionWithOneThread, 40, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(RESTART_SESSION_ID, RESTART_LABEL, icons.debugRestart, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session"), 50);
registerCallStackInlineMenuItem(STOP_ID, STOP_LABEL, icons.debugStop, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH.toNegated(), CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session")), 60);
registerCallStackInlineMenuItem(DISCONNECT_ID, DISCONNECT_LABEL, icons.debugDisconnect, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("session")), 60);
export {
  CallStackView,
  getContext,
  getContextForContributedActions,
  getSpecificSourceName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvY2FsbFN0YWNrVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFyaWFSb2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBIaWdobGlnaHRlZExhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXRjaGVzLCBGdXp6eVNjb3JlLCBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcG9zaXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGNvbW1vblN1ZmZpeExlbmd0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvblRpdGxlLCBJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uQmFyQWN0aW9ucywgZ2V0Q29udGV4dE1lbnVBY3Rpb25zLCBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgU3VibWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBDb250ZXh0S2V5VmFsdWUsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgdGV4dExpbmtGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld0FjdGlvbiwgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IENBTExTVEFDS19WSUVXX0lELCBDT05URVhUX0NBTExTVEFDS19GT0NVU0VELCBDT05URVhUX0NBTExTVEFDS19JVEVNX1NUT1BQRUQsIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRSwgQ09OVEVYVF9DQUxMU1RBQ0tfU0VTU0lPTl9IQVNfT05FX1RIUkVBRCwgQ09OVEVYVF9DQUxMU1RBQ0tfU0VTU0lPTl9JU19BVFRBQ0gsIENPTlRFWFRfREVCVUdfU1RBVEUsIENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX05PX0RFQlVHLCBDT05URVhUX1NUQUNLX0ZSQU1FX1NVUFBPUlRTX1JFU1RBUlQsIGdldFN0YXRlTGFiZWwsIElEZWJ1Z01vZGVsLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJUmF3U3RvcHBlZERldGFpbHMsIGlzRnJhbWVEZWVtcGhhc2l6ZWQsIElTdGFja0ZyYW1lLCBJVGhyZWFkLCBTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBTdGFja0ZyYW1lLCBUaHJlYWQsIFRocmVhZEFuZFNlc3Npb25JZHMgfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBpc1Nlc3Npb25BdHRhY2ggfSBmcm9tICcuLi9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyByZW5kZXJWaWV3VHJlZSB9IGZyb20gJy4vYmFzZURlYnVnVmlldy5qcyc7XG5pbXBvcnQgeyBDT05USU5VRV9JRCwgQ09OVElOVUVfTEFCRUwsIERJU0NPTk5FQ1RfSUQsIERJU0NPTk5FQ1RfTEFCRUwsIFBBVVNFX0lELCBQQVVTRV9MQUJFTCwgUkVTVEFSVF9MQUJFTCwgUkVTVEFSVF9TRVNTSU9OX0lELCBTVEVQX0lOVE9fSUQsIFNURVBfSU5UT19MQUJFTCwgU1RFUF9PVVRfSUQsIFNURVBfT1VUX0xBQkVMLCBTVEVQX09WRVJfSUQsIFNURVBfT1ZFUl9MQUJFTCwgU1RPUF9JRCwgU1RPUF9MQUJFTCB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGlzY29ubmVjdE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi9kZWJ1Z1Rvb2xCYXIuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbnR5cGUgQ2FsbFN0YWNrSXRlbSA9IElTdGFja0ZyYW1lIHwgSVRocmVhZCB8IElEZWJ1Z1Nlc3Npb24gfCBzdHJpbmcgfCBUaHJlYWRBbmRTZXNzaW9uSWRzIHwgSVN0YWNrRnJhbWVbXTtcblxuaW50ZXJmYWNlIElDYWxsU3RhY2tJdGVtQ29udGV4dCB7XG5cdHNlc3Npb25JZDogc3RyaW5nO1xuXHR0aHJlYWRJZD86IHN0cmluZztcblx0ZnJhbWVJZD86IHN0cmluZztcblx0ZnJhbWVOYW1lPzogc3RyaW5nO1xuXHRmcmFtZUxvY2F0aW9uPzogeyByYW5nZTogSVJhbmdlOyBzb3VyY2U6IERlYnVnUHJvdG9jb2wuU291cmNlIH07XG59XG5cbmZ1bmN0aW9uIGdldFNlc3Npb25Db250ZXh0KGVsZW1lbnQ6IElEZWJ1Z1Nlc3Npb24pOiBJQ2FsbFN0YWNrSXRlbUNvbnRleHQge1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogZWxlbWVudC5nZXRJZCgpXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFRocmVhZENvbnRleHQoZWxlbWVudDogSVRocmVhZCk6IElDYWxsU3RhY2tJdGVtQ29udGV4dCB7XG5cdHJldHVybiB7XG5cdFx0Li4uZ2V0U2Vzc2lvbkNvbnRleHQoZWxlbWVudC5zZXNzaW9uKSxcblx0XHR0aHJlYWRJZDogZWxlbWVudC5nZXRJZCgpXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFN0YWNrRnJhbWVDb250ZXh0KGVsZW1lbnQ6IFN0YWNrRnJhbWUpOiBJQ2FsbFN0YWNrSXRlbUNvbnRleHQge1xuXHRyZXR1cm4ge1xuXHRcdC4uLmdldFRocmVhZENvbnRleHQoZWxlbWVudC50aHJlYWQpLFxuXHRcdGZyYW1lSWQ6IGVsZW1lbnQuZ2V0SWQoKSxcblx0XHRmcmFtZU5hbWU6IGVsZW1lbnQubmFtZSxcblx0XHRmcmFtZUxvY2F0aW9uOiB7IHJhbmdlOiBlbGVtZW50LnJhbmdlLCBzb3VyY2U6IGVsZW1lbnQuc291cmNlLnJhdyB9XG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250ZXh0KGVsZW1lbnQ6IENhbGxTdGFja0l0ZW0gfCBudWxsKTogSUNhbGxTdGFja0l0ZW1Db250ZXh0IHwgdW5kZWZpbmVkIHtcblx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTdGFja0ZyYW1lKSB7XG5cdFx0cmV0dXJuIGdldFN0YWNrRnJhbWVDb250ZXh0KGVsZW1lbnQpO1xuXHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUaHJlYWQpIHtcblx0XHRyZXR1cm4gZ2V0VGhyZWFkQ29udGV4dChlbGVtZW50KTtcblx0fSBlbHNlIGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdHJldHVybiBnZXRTZXNzaW9uQ29udGV4dChlbGVtZW50KTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8vIEV4dGVuc2lvbnMgZGVwZW5kIG9uIHRoaXMgY29udGV4dCwgc2hvdWxkIG5vdCBiZSBjaGFuZ2VkIGV2ZW4gdGhvdWdoIGl0IGlzIG5vdCBmdWxseSBkZXRlcm1pbmlzdGljXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGV4dEZvckNvbnRyaWJ1dGVkQWN0aW9ucyhlbGVtZW50OiBDYWxsU3RhY2tJdGVtIHwgbnVsbCk6IHN0cmluZyB8IG51bWJlciB7XG5cdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU3RhY2tGcmFtZSkge1xuXHRcdGlmIChlbGVtZW50LnNvdXJjZS5pbk1lbW9yeSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuc291cmNlLnJhdy5wYXRoIHx8IGVsZW1lbnQuc291cmNlLnJlZmVyZW5jZSB8fCBlbGVtZW50LnNvdXJjZS5uYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50LnNvdXJjZS51cmkudG9TdHJpbmcoKTtcblx0fVxuXHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZCkge1xuXHRcdHJldHVybiBlbGVtZW50LnRocmVhZElkO1xuXHR9XG5cdGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdHJldHVybiBlbGVtZW50LmdldElkKCk7XG5cdH1cblxuXHRyZXR1cm4gJyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTcGVjaWZpY1NvdXJjZU5hbWUoc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUpOiBzdHJpbmcge1xuXHQvLyBUbyByZWR1Y2UgZmxhc2hpbmcgb2YgdGhlIHBhdGggbmFtZSBhbmQgdGhlIHdheSB3ZSBmZXRjaCBzdGFjayBmcmFtZXNcblx0Ly8gV2UgbmVlZCB0byBjb21wdXRlIHRoZSBzb3VyY2UgbmFtZSBiYXNlZCBvbiB0aGUgb3RoZXIgZnJhbWVzIGluIHRoZSBzdGFsZSBjYWxsIHN0YWNrXG5cdGxldCBjYWxsU3RhY2sgPSAoPFRocmVhZD5zdGFja0ZyYW1lLnRocmVhZCkuZ2V0U3RhbGVDYWxsU3RhY2soKTtcblx0Y2FsbFN0YWNrID0gY2FsbFN0YWNrLmxlbmd0aCA+IDAgPyBjYWxsU3RhY2sgOiBzdGFja0ZyYW1lLnRocmVhZC5nZXRDYWxsU3RhY2soKTtcblx0Y29uc3Qgb3RoZXJTb3VyY2VzID0gY2FsbFN0YWNrLm1hcChzZiA9PiBzZi5zb3VyY2UpLmZpbHRlcihzID0+IHMgIT09IHN0YWNrRnJhbWUuc291cmNlKTtcblx0bGV0IHN1ZmZpeExlbmd0aCA9IDA7XG5cdG90aGVyU291cmNlcy5mb3JFYWNoKHMgPT4ge1xuXHRcdGlmIChzLm5hbWUgPT09IHN0YWNrRnJhbWUuc291cmNlLm5hbWUpIHtcblx0XHRcdHN1ZmZpeExlbmd0aCA9IE1hdGgubWF4KHN1ZmZpeExlbmd0aCwgY29tbW9uU3VmZml4TGVuZ3RoKHN0YWNrRnJhbWUuc291cmNlLnVyaS5wYXRoLCBzLnVyaS5wYXRoKSk7XG5cdFx0fVxuXHR9KTtcblx0aWYgKHN1ZmZpeExlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBzdGFja0ZyYW1lLnNvdXJjZS5uYW1lO1xuXHR9XG5cblx0Y29uc3QgZnJvbSA9IE1hdGgubWF4KDAsIHN0YWNrRnJhbWUuc291cmNlLnVyaS5wYXRoLmxhc3RJbmRleE9mKHBvc2l4LnNlcCwgc3RhY2tGcmFtZS5zb3VyY2UudXJpLnBhdGgubGVuZ3RoIC0gc3VmZml4TGVuZ3RoIC0gMSkpO1xuXHRyZXR1cm4gKGZyb20gPiAwID8gJy4uLicgOiAnJykgKyBzdGFja0ZyYW1lLnNvdXJjZS51cmkucGF0aC5zdWJzdHJpbmcoZnJvbSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4cGFuZFRvKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIHRyZWU6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SURlYnVnTW9kZWwsIENhbGxTdGFja0l0ZW0sIEZ1enp5U2NvcmU+KTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmIChzZXNzaW9uLnBhcmVudFNlc3Npb24pIHtcblx0XHRhd2FpdCBleHBhbmRUbyhzZXNzaW9uLnBhcmVudFNlc3Npb24sIHRyZWUpO1xuXHR9XG5cdGF3YWl0IHRyZWUuZXhwYW5kKHNlc3Npb24pO1xufVxuXG5leHBvcnQgY2xhc3MgQ2FsbFN0YWNrVmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblx0cHJpdmF0ZSBzdGF0ZU1lc3NhZ2UhOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdHByaXZhdGUgc3RhdGVNZXNzYWdlTGFiZWwhOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdHByaXZhdGUgc3RhdGVNZXNzYWdlTGFiZWxIb3ZlciE6IElNYW5hZ2VkSG92ZXI7XG5cdHByaXZhdGUgb25DYWxsU3RhY2tDaGFuZ2VTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgbmVlZHNSZWZyZXNoID0gZmFsc2U7XG5cdHByaXZhdGUgaWdub3JlU2VsZWN0aW9uQ2hhbmdlZEV2ZW50ID0gZmFsc2U7XG5cdHByaXZhdGUgaWdub3JlRm9jdXNTdGFja0ZyYW1lRXZlbnQgPSBmYWxzZTtcblxuXHRwcml2YXRlIGRhdGFTb3VyY2UhOiBDYWxsU3RhY2tEYXRhU291cmNlO1xuXHRwcml2YXRlIHRyZWUhOiBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPElEZWJ1Z01vZGVsLCBDYWxsU3RhY2tJdGVtLCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSBhdXRvRXhwYW5kZWRTZXNzaW9ucyA9IG5ldyBTZXQ8SURlYnVnU2Vzc2lvbj4oKTtcblx0cHJpdmF0ZSBzZWxlY3Rpb25OZWVkc1VwZGF0ZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgb3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHQvLyBDcmVhdGUgc2NoZWR1bGVyIHRvIHByZXZlbnQgdW5uZWNlc3NhcnkgZmxhc2hpbmcgb2YgdHJlZSB3aGVuIHJlYWN0aW5nIHRvIGNoYW5nZXNcblx0XHR0aGlzLm9uQ2FsbFN0YWNrQ2hhbmdlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gT25seSBzaG93IHRoZSBnbG9iYWwgcGF1c2UgbWVzc2FnZSBpZiB3ZSBkbyBub3QgZGlzcGxheSB0aHJlYWRzLlxuXHRcdFx0Ly8gT3RoZXJ3aXNlIHRoZXJlIHdpbGwgYmUgYSBwYXVzZSBtZXNzYWdlIHBlciB0aHJlYWQgYW5kIHRoZXJlIGlzIG5vIG5lZWQgZm9yIGEgZ2xvYmFsIG9uZS5cblx0XHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpO1xuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmF1dG9FeHBhbmRlZFNlc3Npb25zLmNsZWFyKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRocmVhZCA9IHNlc3Npb25zLmxlbmd0aCA9PT0gMSAmJiBzZXNzaW9uc1swXS5nZXRBbGxUaHJlYWRzKCkubGVuZ3RoID09PSAxID8gc2Vzc2lvbnNbMF0uZ2V0QWxsVGhyZWFkcygpWzBdIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc3RvcHBlZERldGFpbHMgPSBzZXNzaW9ucy5sZW5ndGggPT09IDEgPyBzZXNzaW9uc1swXS5nZXRTdG9wcGVkRGV0YWlscygpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHN0b3BwZWREZXRhaWxzICYmICh0aHJlYWQgfHwgdHlwZW9mIHN0b3BwZWREZXRhaWxzLnRocmVhZElkICE9PSAnbnVtYmVyJykpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2VMYWJlbC50ZXh0Q29udGVudCA9IHN0b3BwZWREZXNjcmlwdGlvbihzdG9wcGVkRGV0YWlscyk7XG5cdFx0XHRcdHRoaXMuc3RhdGVNZXNzYWdlTGFiZWxIb3Zlci51cGRhdGUoc3RvcHBlZFRleHQoc3RvcHBlZERldGFpbHMpKTtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2VMYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdleGNlcHRpb24nLCBzdG9wcGVkRGV0YWlscy5yZWFzb24gPT09ICdleGNlcHRpb24nKTtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2UuaGlkZGVuID0gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMSAmJiBzZXNzaW9uc1swXS5zdGF0ZSA9PT0gU3RhdGUuUnVubmluZykge1xuXHRcdFx0XHR0aGlzLnN0YXRlTWVzc2FnZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoeyBrZXk6ICdydW5uaW5nJywgY29tbWVudDogWydpbmRpY2F0ZXMgc3RhdGUnXSB9LCBcIlJ1bm5pbmdcIik7XG5cdFx0XHRcdHRoaXMuc3RhdGVNZXNzYWdlTGFiZWxIb3Zlci51cGRhdGUoc2Vzc2lvbnNbMF0uZ2V0TGFiZWwoKSk7XG5cdFx0XHRcdHRoaXMuc3RhdGVNZXNzYWdlTGFiZWwuY2xhc3NMaXN0LnJlbW92ZSgnZXhjZXB0aW9uJyk7XG5cdFx0XHRcdHRoaXMuc3RhdGVNZXNzYWdlLmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1lc3NhZ2UuaGlkZGVuID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXG5cdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB0b0V4cGFuZCA9IG5ldyBTZXQ8SURlYnVnU2Vzc2lvbj4oKTtcblx0XHRcdFx0c2Vzc2lvbnMuZm9yRWFjaChzID0+IHtcblx0XHRcdFx0XHQvLyBBdXRvbWF0aWNhbGx5IGV4cGFuZCBzZXNzaW9ucyB0aGF0IGhhdmUgY2hpbGRyZW4sIGJ1dCBvbmx5IGRvIHRoaXMgb25jZS5cblx0XHRcdFx0XHRpZiAocy5wYXJlbnRTZXNzaW9uICYmICF0aGlzLmF1dG9FeHBhbmRlZFNlc3Npb25zLmhhcyhzLnBhcmVudFNlc3Npb24pKSB7XG5cdFx0XHRcdFx0XHR0b0V4cGFuZC5hZGQocy5wYXJlbnRTZXNzaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdG9FeHBhbmQpIHtcblx0XHRcdFx0XHRhd2FpdCBleHBhbmRUbyhzZXNzaW9uLCB0aGlzLnRyZWUpO1xuXHRcdFx0XHRcdHRoaXMuYXV0b0V4cGFuZGVkU2Vzc2lvbnMuYWRkKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIElnbm9yZSB0cmVlIGV4cGFuZCBlcnJvcnMgaWYgZWxlbWVudCBubyBsb25nZXIgcHJlc2VudFxuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc2VsZWN0aW9uTmVlZHNVcGRhdGUpIHtcblx0XHRcdFx0dGhpcy5zZWxlY3Rpb25OZWVkc1VwZGF0ZSA9IGZhbHNlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVRyZWVTZWxlY3Rpb24oKTtcblx0XHRcdH1cblx0XHR9LCA1MCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJIZWFkZXJUaXRsZShjb250YWluZXIsIHRoaXMub3B0aW9ucy50aXRsZSk7XG5cblx0XHR0aGlzLnN0YXRlTWVzc2FnZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLmNhbGwtc3RhY2stc3RhdGUtbWVzc2FnZScpKTtcblx0XHR0aGlzLnN0YXRlTWVzc2FnZS5oaWRkZW4gPSB0cnVlO1xuXHRcdHRoaXMuc3RhdGVNZXNzYWdlTGFiZWwgPSBkb20uYXBwZW5kKHRoaXMuc3RhdGVNZXNzYWdlLCAkKCdzcGFuLmxhYmVsJykpO1xuXHRcdHRoaXMuc3RhdGVNZXNzYWdlTGFiZWxIb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLnN0YXRlTWVzc2FnZSwgJycpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RlYnVnLXBhbmUnKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGVidWctY2FsbC1zdGFjaycpO1xuXHRcdGNvbnN0IHRyZWVDb250YWluZXIgPSByZW5kZXJWaWV3VHJlZShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5kYXRhU291cmNlID0gbmV3IENhbGxTdGFja0RhdGFTb3VyY2UodGhpcy5kZWJ1Z1NlcnZpY2UpO1xuXHRcdHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJRGVidWdNb2RlbCwgQ2FsbFN0YWNrSXRlbSwgRnV6enlTY29yZT4sICdDYWxsU3RhY2tWaWV3JywgdHJlZUNvbnRhaW5lciwgbmV3IENhbGxTdGFja0RlbGVnYXRlKCksIG5ldyBDYWxsU3RhY2tDb21wcmVzc2lvbkRlbGVnYXRlKHRoaXMuZGVidWdTZXJ2aWNlKSwgW1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc1JlbmRlcmVyKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGhyZWFkc1JlbmRlcmVyKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhY2tGcmFtZXNSZW5kZXJlciksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVycm9yc1JlbmRlcmVyKSxcblx0XHRcdG5ldyBMb2FkTW9yZVJlbmRlcmVyKCksXG5cdFx0XHRuZXcgU2hvd01vcmVSZW5kZXJlcigpXG5cdFx0XSwgdGhpcy5kYXRhU291cmNlLCB7XG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBDYWxsU3RhY2tBY2Nlc3NpYmlsaXR5UHJvdmlkZXIoKSxcblx0XHRcdGNvbXByZXNzaW9uRW5hYmxlZDogdHJ1ZSxcblx0XHRcdGF1dG9FeHBhbmRTaW5nbGVDaGlsZHJlbjogdHJ1ZSxcblx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0SWQ6IChlbGVtZW50OiBDYWxsU3RhY2tJdGVtKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBlbGVtZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBgc2hvd01vcmUgJHtlbGVtZW50WzBdLmdldElkKCl9YDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5nZXRJZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGU6IENhbGxTdGFja0l0ZW0pID0+IHtcblx0XHRcdFx0XHRpZiAoaXNEZWJ1Z1Nlc3Npb24oZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlLmdldExhYmVsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgVGhyZWFkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYCR7ZS5uYW1lfSAke2Uuc3RhdGVMYWJlbH1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFN0YWNrRnJhbWUgfHwgdHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBUaHJlYWRBbmRTZXNzaW9uSWRzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gTG9hZE1vcmVSZW5kZXJlci5MQUJFTDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nob3dNb3JlU3RhY2tGcmFtZXMyJywgXCJTaG93IE1vcmUgU3RhY2sgRnJhbWVzXCIpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZTogQ2FsbFN0YWNrSXRlbVtdKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZmlyc3RJdGVtID0gZVswXTtcblx0XHRcdFx0XHRpZiAoaXNEZWJ1Z1Nlc3Npb24oZmlyc3RJdGVtKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZpcnN0SXRlbS5nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzXG5cdFx0fSk7XG5cblx0XHRDT05URVhUX0NBTExTVEFDS19GT0NVU0VELmJpbmRUbyh0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy50cmVlLnNldElucHV0KHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkT3Blbihhc3luYyBlID0+IHtcblx0XHRcdGlmICh0aGlzLmlnbm9yZVNlbGVjdGlvbkNoYW5nZWRFdmVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvY3VzU3RhY2tGcmFtZSA9IChzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZCwgdGhyZWFkOiBJVGhyZWFkIHwgdW5kZWZpbmVkLCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBvcHRpb25zOiB7IGV4cGxpY2l0PzogYm9vbGVhbjsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW47IHNpZGVCeVNpZGU/OiBib29sZWFuOyBwaW5uZWQ/OiBib29sZWFuIH0gPSB7fSkgPT4ge1xuXHRcdFx0XHR0aGlzLmlnbm9yZUZvY3VzU3RhY2tGcmFtZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUoc3RhY2tGcmFtZSwgdGhyZWFkLCBzZXNzaW9uLCB7IC4uLm9wdGlvbnMsIC4uLnsgZXhwbGljaXQ6IHRydWUgfSB9KTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLmlnbm9yZUZvY3VzU3RhY2tGcmFtZUV2ZW50ID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFN0YWNrRnJhbWUpIHtcblx0XHRcdFx0Y29uc3Qgb3B0cyA9IHtcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cyxcblx0XHRcdFx0XHRzaWRlQnlTaWRlOiBlLnNpZGVCeVNpZGUsXG5cdFx0XHRcdFx0cGlubmVkOiBlLmVkaXRvck9wdGlvbnMucGlubmVkXG5cdFx0XHRcdH07XG5cdFx0XHRcdGZvY3VzU3RhY2tGcmFtZShlbGVtZW50LCBlbGVtZW50LnRocmVhZCwgZWxlbWVudC50aHJlYWQuc2Vzc2lvbiwgb3B0cyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZCkge1xuXHRcdFx0XHRmb2N1c1N0YWNrRnJhbWUodW5kZWZpbmVkLCBlbGVtZW50LCBlbGVtZW50LnNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRcdGZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwgZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZEFuZFNlc3Npb25JZHMpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbihlbGVtZW50LnNlc3Npb25JZCk7XG5cdFx0XHRcdGNvbnN0IHRocmVhZCA9IHNlc3Npb24gJiYgc2Vzc2lvbi5nZXRUaHJlYWQoZWxlbWVudC50aHJlYWRJZCk7XG5cdFx0XHRcdGlmICh0aHJlYWQpIHtcblx0XHRcdFx0XHRjb25zdCB0b3RhbEZyYW1lcyA9IHRocmVhZC5zdG9wcGVkRGV0YWlscz8udG90YWxGcmFtZXM7XG5cdFx0XHRcdFx0Y29uc3QgcmVtYWluaW5nRnJhbWVzQ291bnQgPSB0eXBlb2YgdG90YWxGcmFtZXMgPT09ICdudW1iZXInID8gKHRvdGFsRnJhbWVzIC0gdGhyZWFkLmdldENhbGxTdGFjaygpLmxlbmd0aCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Ly8gR2V0IGFsbCB0aGUgcmVtYWluaW5nIGZyYW1lc1xuXHRcdFx0XHRcdGF3YWl0ICg8VGhyZWFkPnRocmVhZCkuZmV0Y2hDYWxsU3RhY2socmVtYWluaW5nRnJhbWVzQ291bnQpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0XHRcdGVsZW1lbnQuZm9yRWFjaChzZiA9PiB0aGlzLmRhdGFTb3VyY2UuZGVlbXBoYXNpemVkU3RhY2tGcmFtZXNUb1Nob3cuYWRkKHNmKSk7XG5cdFx0XHRcdHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VDYWxsU3RhY2soKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLm9uQ2FsbFN0YWNrQ2hhbmdlU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5vbkNhbGxTdGFja0NoYW5nZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBvbkZvY3VzQ2hhbmdlID0gRXZlbnQuYW55PHVua25vd24+KHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRm9jdXNTdGFja0ZyYW1lLCB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU2Vzc2lvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25Gb2N1c0NoYW5nZShhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pZ25vcmVGb2N1c1N0YWNrRnJhbWVFdmVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5zZWxlY3Rpb25OZWVkc1VwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLm9uQ2FsbFN0YWNrQ2hhbmdlU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5zZWxlY3Rpb25OZWVkc1VwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVUcmVlU2VsZWN0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHQvLyBTY2hlZHVsZSB0aGUgdXBkYXRlIG9mIHRoZSBjYWxsIHN0YWNrIHRyZWUgaWYgdGhlIHZpZXdsZXQgaXMgb3BlbmVkIGFmdGVyIGEgc2Vzc2lvbiBzdGFydGVkICMxNDY4NFxuXHRcdGlmICh0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSA9PT0gU3RhdGUuU3RvcHBlZCkge1xuXHRcdFx0dGhpcy5vbkNhbGxTdGFja0NoYW5nZVNjaGVkdWxlci5zY2hlZHVsZSgwKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLm5lZWRzUmVmcmVzaCkge1xuXHRcdFx0XHR0aGlzLm9uQ2FsbFN0YWNrQ2hhbmdlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWROZXdTZXNzaW9uKHMgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkxpc3RlbmVyczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5wdXNoKHMub25EaWRDaGFuZ2VOYW1lKCgpID0+IHtcblx0XHRcdFx0Ly8gdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuIGlzIGNhbGxlZCBvbiBhIGRlbGF5IGFmdGVyIGEgc2Vzc2lvbiBpcyBhZGRlZCxcblx0XHRcdFx0Ly8gc28gZG9uJ3QgcmVyZW5kZXIgaWYgdGhlIHRyZWUgZG9lc24ndCBoYXZlIHRoZSBub2RlIHlldFxuXHRcdFx0XHRpZiAodGhpcy50cmVlLmhhc05vZGUocykpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUucmVyZW5kZXIocyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHNlc3Npb25MaXN0ZW5lcnMucHVzaChzLm9uRGlkRW5kQWRhcHRlcigoKSA9PiBkaXNwb3NlKHNlc3Npb25MaXN0ZW5lcnMpKSk7XG5cdFx0XHRpZiAocy5wYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdC8vIEEgc2Vzc2lvbiB3ZSBhbHJlYWR5IGV4cGFuZGVkIGhhcyBhIG5ldyBjaGlsZCBzZXNzaW9uLCBhbGxvdyB0byBleHBhbmQgaXQgYWdhaW4uXG5cdFx0XHRcdHRoaXMuYXV0b0V4cGFuZGVkU2Vzc2lvbnMuZGVsZXRlKHMucGFyZW50U2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0Y29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmNvbGxhcHNlQWxsKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVRyZWVTZWxlY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnRyZWUgfHwgIXRoaXMudHJlZS5nZXRJbnB1dCgpKSB7XG5cdFx0XHQvLyBUcmVlIG5vdCBpbml0aWFsaXplZCB5ZXRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVTZWxlY3Rpb25BbmRSZXZlYWwgPSAoZWxlbWVudDogSVN0YWNrRnJhbWUgfCBJRGVidWdTZXNzaW9uKSA9PiB7XG5cdFx0XHR0aGlzLmlnbm9yZVNlbGVjdGlvbkNoYW5nZWRFdmVudCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtlbGVtZW50XSk7XG5cdFx0XHRcdC8vIElmIHRoZSBlbGVtZW50IGlzIG91dHNpZGUgb2YgdGhlIHNjcmVlbiBib3VuZHMsXG5cdFx0XHRcdC8vIHBvc2l0aW9uIGl0IGluIHRoZSBtaWRkbGVcblx0XHRcdFx0aWYgKHRoaXMudHJlZS5nZXRSZWxhdGl2ZVRvcChlbGVtZW50KSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5yZXZlYWwoZWxlbWVudCwgMC41KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKGVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7IH1cblx0XHRcdGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLmlnbm9yZVNlbGVjdGlvbkNoYW5nZWRFdmVudCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkVGhyZWFkO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRjb25zdCBzdGFja0ZyYW1lID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0aWYgKCF0aHJlYWQpIHtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVwZGF0ZVNlbGVjdGlvbkFuZFJldmVhbChzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWdub3JlIGVycm9ycyBmcm9tIHRoaXMgZXhwYW5zaW9ucyBiZWNhdXNlIHdlIGFyZSBub3QgYXdhcmUgaWYgd2UgcmVuZGVyZWQgdGhlIHRocmVhZHMgYW5kIHNlc3Npb25zIG9yIHdlIGhpZGUgdGhlbSB0byBkZWNsdXR0ZXIgdGhlIHZpZXdcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGV4cGFuZFRvKHRocmVhZC5zZXNzaW9uLCB0aGlzLnRyZWUpO1xuXHRcdFx0fSBjYXRjaCAoZSkgeyB9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKHRocmVhZCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7IH1cblxuXHRcdFx0Y29uc3QgdG9SZXZlYWwgPSBzdGFja0ZyYW1lIHx8IHNlc3Npb247XG5cdFx0XHRpZiAodG9SZXZlYWwpIHtcblx0XHRcdFx0dXBkYXRlU2VsZWN0aW9uQW5kUmV2ZWFsKHRvUmV2ZWFsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PENhbGxTdGFja0l0ZW0+KTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHRsZXQgb3ZlcmxheTogW3N0cmluZywgQ29udGV4dEtleVZhbHVlXVtdID0gW107XG5cdFx0aWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRvdmVybGF5ID0gZ2V0U2Vzc2lvbkNvbnRleHRPdmVybGF5KGVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZCkge1xuXHRcdFx0b3ZlcmxheSA9IGdldFRocmVhZENvbnRleHRPdmVybGF5KGVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFN0YWNrRnJhbWUpIHtcblx0XHRcdG92ZXJsYXkgPSBnZXRTdGFja0ZyYW1lQ29udGV4dE92ZXJsYXkoZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkob3ZlcmxheSk7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnQ2FsbFN0YWNrQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UsIHsgYXJnOiBnZXRDb250ZXh0Rm9yQ29udHJpYnV0ZWRBY3Rpb25zKGVsZW1lbnQpLCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRDb250ZXh0TWVudUFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gcmVzdWx0LnNlY29uZGFyeSxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBnZXRDb250ZXh0KGVsZW1lbnQpXG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUaHJlYWRUZW1wbGF0ZURhdGEge1xuXHR0aHJlYWQ6IEhUTUxFbGVtZW50O1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0c3RhdGVMYWJlbDogSFRNTFNwYW5FbGVtZW50O1xuXHRsYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdGVsZW1lbnREaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG59XG5cbmludGVyZmFjZSBJU2Vzc2lvblRlbXBsYXRlRGF0YSB7XG5cdHNlc3Npb246IEhUTUxFbGVtZW50O1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0c3RhdGVMYWJlbDogSFRNTFNwYW5FbGVtZW50O1xuXHRsYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdGVsZW1lbnREaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG59XG5cbmludGVyZmFjZSBJRXJyb3JUZW1wbGF0ZURhdGEge1xuXHRsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5pbnRlcmZhY2UgSUxhYmVsVGVtcGxhdGVEYXRhIHtcblx0bGFiZWw6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVN0YWNrRnJhbWVUZW1wbGF0ZURhdGEge1xuXHRzdGFja0ZyYW1lOiBIVE1MRWxlbWVudDtcblx0ZmlsZTogSFRNTEVsZW1lbnQ7XG5cdGZpbGVOYW1lOiBIVE1MRWxlbWVudDtcblx0bGluZU51bWJlcjogSFRNTEVsZW1lbnQ7XG5cdGxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0dGVtcGxhdGVEaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5mdW5jdGlvbiBnZXRTZXNzaW9uQ29udGV4dE92ZXJsYXkoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IFtzdHJpbmcsIENvbnRleHRLZXlWYWx1ZV1bXSB7XG5cdHJldHVybiBbXG5cdFx0W0NPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRS5rZXksICdzZXNzaW9uJ10sXG5cdFx0W0NPTlRFWFRfQ0FMTFNUQUNLX1NFU1NJT05fSVNfQVRUQUNILmtleSwgaXNTZXNzaW9uQXR0YWNoKHNlc3Npb24pXSxcblx0XHRbQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9TVE9QUEVELmtleSwgc2Vzc2lvbi5zdGF0ZSA9PT0gU3RhdGUuU3RvcHBlZF0sXG5cdFx0W0NPTlRFWFRfQ0FMTFNUQUNLX1NFU1NJT05fSEFTX09ORV9USFJFQUQua2V5LCBzZXNzaW9uLmdldEFsbFRocmVhZHMoKS5sZW5ndGggPT09IDFdLFxuXHRdO1xufVxuXG5jbGFzcyBTZXNzaW9uc1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJRGVidWdTZXNzaW9uLCBGdXp6eVNjb3JlLCBJU2Vzc2lvblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU2Vzc2lvbnNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2Vzc2lvblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbicpKTtcblx0XHRkb20uYXBwZW5kKHNlc3Npb24sICQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuY2FsbHN0YWNrVmlld1Nlc3Npb24pKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQoc2Vzc2lvbiwgJCgnLm5hbWUnKSk7XG5cdFx0Y29uc3Qgc3RhdGVMYWJlbCA9IGRvbS5hcHBlbmQoc2Vzc2lvbiwgJCgnc3Bhbi5zdGF0ZS5sYWJlbC5tb25hY28tY291bnQtYmFkZ2UubG9uZycpKTtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKG5hbWUpKTtcblxuXHRcdGNvbnN0IHN0b3BBY3Rpb25WaWV3SXRlbURpc3Bvc2FibGVzID0gdGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IEFjdGlvbkJhcihzZXNzaW9uLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmICgoYWN0aW9uLmlkID09PSBTVE9QX0lEIHx8IGFjdGlvbi5pZCA9PT0gRElTQ09OTkVDVF9JRCkgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRzdG9wQWN0aW9uVmlld0l0ZW1EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGNyZWF0ZURpc2Nvbm5lY3RNZW51SXRlbUFjdGlvbihhY3Rpb24gYXMgTWVudUl0ZW1BY3Rpb24sIHN0b3BBY3Rpb25WaWV3SXRlbURpc3Bvc2FibGVzLCBhY2Nlc3NvciwgeyAuLi5vcHRpb25zLCBtZW51QXNDaGlsZDogZmFsc2UgfSkpO1xuXHRcdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Ym1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZSA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRyZXR1cm4geyBzZXNzaW9uLCBuYW1lLCBzdGF0ZUxhYmVsLCBsYWJlbCwgYWN0aW9uQmFyLCBlbGVtZW50RGlzcG9zYWJsZSwgdGVtcGxhdGVEaXNwb3NhYmxlIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJRGVidWdTZXNzaW9uLCBGdXp6eVNjb3JlPiwgXzogbnVtYmVyLCBkYXRhOiBJU2Vzc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuZG9SZW5kZXJFbGVtZW50KGVsZW1lbnQuZWxlbWVudCwgY3JlYXRlTWF0Y2hlcyhlbGVtZW50LmZpbHRlckRhdGEpLCBkYXRhKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJRGVidWdTZXNzaW9uPiwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXNzaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSBub2RlLmVsZW1lbnQuZWxlbWVudHNbbm9kZS5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IG1hdGNoZXMgPSBjcmVhdGVNYXRjaGVzKG5vZGUuZmlsdGVyRGF0YSk7XG5cdFx0dGhpcy5kb1JlbmRlckVsZW1lbnQobGFzdEVsZW1lbnQsIG1hdGNoZXMsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGRvUmVuZGVyRWxlbWVudChzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBtYXRjaGVzOiBJTWF0Y2hbXSwgZGF0YTogSVNlc3Npb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSG92ZXIgPSBkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5zZXNzaW9uLCBsb2NhbGl6ZSh7IGtleTogJ3Nlc3Npb24nLCBjb21tZW50OiBbJ1Nlc3Npb24gaXMgYSBub3VuJ10gfSwgXCJTZXNzaW9uXCIpKSk7XG5cdFx0ZGF0YS5sYWJlbC5zZXQoc2Vzc2lvbi5nZXRMYWJlbCgpLCBtYXRjaGVzKTtcblx0XHRjb25zdCBzdG9wcGVkRGV0YWlscyA9IHNlc3Npb24uZ2V0U3RvcHBlZERldGFpbHMoKTtcblx0XHRjb25zdCB0aHJlYWQgPSBzZXNzaW9uLmdldEFsbFRocmVhZHMoKS5maW5kKHQgPT4gdC5zdG9wcGVkKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KGdldFNlc3Npb25Db250ZXh0T3ZlcmxheShzZXNzaW9uKSk7XG5cdFx0Y29uc3QgbWVudSA9IGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuRGVidWdDYWxsU3RhY2tDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Y29uc3Qgc2V0dXBBY3Rpb25CYXIgPSAoKSA9PiB7XG5cdFx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXG5cdFx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgYXJnOiBnZXRDb250ZXh0Rm9yQ29udHJpYnV0ZWRBY3Rpb25zKHNlc3Npb24pLCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSwgJ2lubGluZScpO1xuXHRcdFx0ZGF0YS5hY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRcdC8vIFdlIG5lZWQgdG8gc2V0IG91ciBpbnRlcm5hbCBjb250ZXh0IG9uIHRoZSBhY3Rpb24gYmFyLCBzaW5jZSBvdXIgY29tbWFuZHMgZGVwZW5kIG9uIHRoYXQgb25lXG5cdFx0XHQvLyBXaGlsZSB0aGUgZXh0ZXJuYWwgY29udGV4dCBvdXIgZXh0ZW5zaW9ucyByZWx5IG9uXG5cdFx0XHRkYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gZ2V0Q29udGV4dChzZXNzaW9uKTtcblx0XHR9O1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4gc2V0dXBBY3Rpb25CYXIoKSkpO1xuXHRcdHNldHVwQWN0aW9uQmFyKCk7XG5cblx0XHRkYXRhLnN0YXRlTGFiZWwuc3R5bGUuZGlzcGxheSA9ICcnO1xuXG5cdFx0aWYgKHN0b3BwZWREZXRhaWxzKSB7XG5cdFx0XHRkYXRhLnN0YXRlTGFiZWwudGV4dENvbnRlbnQgPSBzdG9wcGVkRGVzY3JpcHRpb24oc3RvcHBlZERldGFpbHMpO1xuXHRcdFx0c2Vzc2lvbkhvdmVyLnVwZGF0ZShgJHtzZXNzaW9uLmdldExhYmVsKCl9OiAke3N0b3BwZWRUZXh0KHN0b3BwZWREZXRhaWxzKX1gKTtcblx0XHRcdGRhdGEuc3RhdGVMYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdleGNlcHRpb24nLCBzdG9wcGVkRGV0YWlscy5yZWFzb24gPT09ICdleGNlcHRpb24nKTtcblx0XHR9IGVsc2UgaWYgKHRocmVhZCAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMpIHtcblx0XHRcdGRhdGEuc3RhdGVMYWJlbC50ZXh0Q29udGVudCA9IHN0b3BwZWREZXNjcmlwdGlvbih0aHJlYWQuc3RvcHBlZERldGFpbHMpO1xuXHRcdFx0c2Vzc2lvbkhvdmVyLnVwZGF0ZShgJHtzZXNzaW9uLmdldExhYmVsKCl9OiAke3N0b3BwZWRUZXh0KHRocmVhZC5zdG9wcGVkRGV0YWlscyl9YCk7XG5cdFx0XHRkYXRhLnN0YXRlTGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnZXhjZXB0aW9uJywgdGhyZWFkLnN0b3BwZWREZXRhaWxzLnJlYXNvbiA9PT0gJ2V4Y2VwdGlvbicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnN0YXRlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSh7IGtleTogJ3J1bm5pbmcnLCBjb21tZW50OiBbJ2luZGljYXRlcyBzdGF0ZSddIH0sIFwiUnVubmluZ1wiKTtcblx0XHRcdGRhdGEuc3RhdGVMYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdleGNlcHRpb24nKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJU2Vzc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX2VsZW1lbnQ6IElUcmVlTm9kZTxJRGVidWdTZXNzaW9uLCBGdXp6eVNjb3JlPiwgXzogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXNzaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElEZWJ1Z1Nlc3Npb24+LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2Vzc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFRocmVhZENvbnRleHRPdmVybGF5KHRocmVhZDogSVRocmVhZCk6IFtzdHJpbmcsIENvbnRleHRLZXlWYWx1ZV1bXSB7XG5cdHJldHVybiBbXG5cdFx0W0NPTlRFWFRfQ0FMTFNUQUNLX0lURU1fVFlQRS5rZXksICd0aHJlYWQnXSxcblx0XHRbQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9TVE9QUEVELmtleSwgdGhyZWFkLnN0b3BwZWRdXG5cdF07XG59XG5cbmNsYXNzIFRocmVhZHNSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVRocmVhZCwgRnV6enlTY29yZSwgSVRocmVhZFRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGhyZWFkJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBUaHJlYWRzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVRocmVhZFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgdGhyZWFkID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy50aHJlYWQnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQodGhyZWFkLCAkKCcubmFtZScpKTtcblx0XHRjb25zdCBzdGF0ZUxhYmVsID0gZG9tLmFwcGVuZCh0aHJlYWQsICQoJ3NwYW4uc3RhdGUubGFiZWwubW9uYWNvLWNvdW50LWJhZGdlLmxvbmcnKSk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKG5hbWUpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IEFjdGlvbkJhcih0aHJlYWQpKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZSA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdHJldHVybiB7IHRocmVhZCwgbmFtZSwgc3RhdGVMYWJlbCwgbGFiZWwsIGFjdGlvbkJhciwgZWxlbWVudERpc3Bvc2FibGUsIHRlbXBsYXRlRGlzcG9zYWJsZSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8SVRocmVhZCwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJVGhyZWFkVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhyZWFkID0gZWxlbWVudC5lbGVtZW50O1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLnRocmVhZCwgdGhyZWFkLm5hbWUpKTtcblx0XHRkYXRhLmxhYmVsLnNldCh0aHJlYWQubmFtZSwgY3JlYXRlTWF0Y2hlcyhlbGVtZW50LmZpbHRlckRhdGEpKTtcblx0XHRkYXRhLnN0YXRlTGFiZWwudGV4dENvbnRlbnQgPSB0aHJlYWQuc3RhdGVMYWJlbDtcblx0XHRkYXRhLnN0YXRlTGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnZXhjZXB0aW9uJywgdGhyZWFkLnN0b3BwZWREZXRhaWxzPy5yZWFzb24gPT09ICdleGNlcHRpb24nKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KGdldFRocmVhZENvbnRleHRPdmVybGF5KHRocmVhZCkpO1xuXHRcdGNvbnN0IG1lbnUgPSBkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkRlYnVnQ2FsbFN0YWNrQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHNldHVwQWN0aW9uQmFyID0gKCkgPT4ge1xuXHRcdFx0ZGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3QgeyBwcmltYXJ5IH0gPSBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IGFyZzogZ2V0Q29udGV4dEZvckNvbnRyaWJ1dGVkQWN0aW9ucyh0aHJlYWQpLCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSwgJ2lubGluZScpO1xuXHRcdFx0ZGF0YS5hY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRcdC8vIFdlIG5lZWQgdG8gc2V0IG91ciBpbnRlcm5hbCBjb250ZXh0IG9uIHRoZSBhY3Rpb24gYmFyLCBzaW5jZSBvdXIgY29tbWFuZHMgZGVwZW5kIG9uIHRoYXQgb25lXG5cdFx0XHQvLyBXaGlsZSB0aGUgZXh0ZXJuYWwgY29udGV4dCBvdXIgZXh0ZW5zaW9ucyByZWx5IG9uXG5cdFx0XHRkYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gZ2V0Q29udGV4dCh0aHJlYWQpO1xuXHRcdH07XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQobWVudS5vbkRpZENoYW5nZSgoKSA9PiBzZXR1cEFjdGlvbkJhcigpKSk7XG5cdFx0c2V0dXBBY3Rpb25CYXIoKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhfbm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVRocmVhZD4sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgX3RlbXBsYXRlRGF0YTogSVRocmVhZFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KF9lbGVtZW50OiBJVHJlZU5vZGU8SVRocmVhZCwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUaHJlYWRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElUaHJlYWRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRTdGFja0ZyYW1lQ29udGV4dE92ZXJsYXkoc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUpOiBbc3RyaW5nLCBDb250ZXh0S2V5VmFsdWVdW10ge1xuXHRyZXR1cm4gW1xuXHRcdFtDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUua2V5LCAnc3RhY2tGcmFtZSddLFxuXHRcdFtDT05URVhUX1NUQUNLX0ZSQU1FX1NVUFBPUlRTX1JFU1RBUlQua2V5LCBzdGFja0ZyYW1lLmNhblJlc3RhcnRdXG5cdF07XG59XG5cbmNsYXNzIFN0YWNrRnJhbWVzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElTdGFja0ZyYW1lLCBGdXp6eVNjb3JlLCBJU3RhY2tGcmFtZVRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc3RhY2tGcmFtZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU3RhY2tGcmFtZXNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU3RhY2tGcmFtZVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc3RhY2stZnJhbWUnKSk7XG5cdFx0Y29uc3QgbGFiZWxEaXYgPSBkb20uYXBwZW5kKHN0YWNrRnJhbWUsICQoJ3NwYW4ubGFiZWwuZXhwcmVzc2lvbicpKTtcblx0XHRjb25zdCBmaWxlID0gZG9tLmFwcGVuZChzdGFja0ZyYW1lLCAkKCcuZmlsZScpKTtcblx0XHRjb25zdCBmaWxlTmFtZSA9IGRvbS5hcHBlbmQoZmlsZSwgJCgnc3Bhbi5maWxlLW5hbWUnKSk7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IGRvbS5hcHBlbmQoZmlsZSwgJCgnc3Bhbi5saW5lLW51bWJlci13cmFwcGVyJykpO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBkb20uYXBwZW5kKHdyYXBwZXIsICQoJ3NwYW4ubGluZS1udW1iZXIubW9uYWNvLWNvdW50LWJhZGdlJykpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKGVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGxhYmVsRGl2KSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgQWN0aW9uQmFyKHN0YWNrRnJhbWUpKTtcblxuXHRcdHJldHVybiB7IGZpbGUsIGZpbGVOYW1lLCBsYWJlbCwgbGluZU51bWJlciwgc3RhY2tGcmFtZSwgYWN0aW9uQmFyLCB0ZW1wbGF0ZURpc3Bvc2FibGUsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8SVN0YWNrRnJhbWUsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJU3RhY2tGcmFtZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSBlbGVtZW50LmVsZW1lbnQ7XG5cdFx0ZGF0YS5zdGFja0ZyYW1lLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIXN0YWNrRnJhbWUuc291cmNlIHx8ICFzdGFja0ZyYW1lLnNvdXJjZS5hdmFpbGFibGUgfHwgaXNGcmFtZURlZW1waGFzaXplZChzdGFja0ZyYW1lKSk7XG5cdFx0ZGF0YS5zdGFja0ZyYW1lLmNsYXNzTGlzdC50b2dnbGUoJ2xhYmVsJywgc3RhY2tGcmFtZS5wcmVzZW50YXRpb25IaW50ID09PSAnbGFiZWwnKTtcblx0XHRjb25zdCBoYXNBY3Rpb25zID0gISFzdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Jlc3RhcnRGcmFtZSAmJiBzdGFja0ZyYW1lLnByZXNlbnRhdGlvbkhpbnQgIT09ICdsYWJlbCcgJiYgc3RhY2tGcmFtZS5wcmVzZW50YXRpb25IaW50ICE9PSAnc3VidGxlJyAmJiBzdGFja0ZyYW1lLmNhblJlc3RhcnQ7XG5cdFx0ZGF0YS5zdGFja0ZyYW1lLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1hY3Rpb25zJywgaGFzQWN0aW9ucyk7XG5cblx0XHRsZXQgdGl0bGUgPSBzdGFja0ZyYW1lLnNvdXJjZS5pbk1lbW9yeSA/IHN0YWNrRnJhbWUuc291cmNlLnVyaS5wYXRoIDogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoc3RhY2tGcmFtZS5zb3VyY2UudXJpKTtcblx0XHRpZiAoc3RhY2tGcmFtZS5zb3VyY2UucmF3Lm9yaWdpbikge1xuXHRcdFx0dGl0bGUgKz0gYFxcbiR7c3RhY2tGcmFtZS5zb3VyY2UucmF3Lm9yaWdpbn1gO1xuXHRcdH1cblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuZmlsZSwgdGl0bGUpKTtcblxuXHRcdGRhdGEubGFiZWwuc2V0KHN0YWNrRnJhbWUubmFtZSwgY3JlYXRlTWF0Y2hlcyhlbGVtZW50LmZpbHRlckRhdGEpLCBzdGFja0ZyYW1lLm5hbWUpO1xuXHRcdGRhdGEuZmlsZU5hbWUudGV4dENvbnRlbnQgPSBnZXRTcGVjaWZpY1NvdXJjZU5hbWUoc3RhY2tGcmFtZSk7XG5cdFx0aWYgKHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRhdGEubGluZU51bWJlci50ZXh0Q29udGVudCA9IGAke3N0YWNrRnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfWA7XG5cdFx0XHRpZiAoc3RhY2tGcmFtZS5yYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0XHRkYXRhLmxpbmVOdW1iZXIudGV4dENvbnRlbnQgKz0gYDoke3N0YWNrRnJhbWUucmFuZ2Uuc3RhcnRDb2x1bW59YDtcblx0XHRcdH1cblx0XHRcdGRhdGEubGluZU51bWJlci5jbGFzc0xpc3QucmVtb3ZlKCd1bmF2YWlsYWJsZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmxpbmVOdW1iZXIuY2xhc3NMaXN0LmFkZCgndW5hdmFpbGFibGUnKTtcblx0XHR9XG5cblx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGlmIChoYXNBY3Rpb25zKSB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbignZGVidWcuY2FsbFN0YWNrLnJlc3RhcnRGcmFtZScsIGxvY2FsaXplKCdyZXN0YXJ0RnJhbWUnLCBcIlJlc3RhcnQgRnJhbWVcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29ucy5kZWJ1Z1Jlc3RhcnRGcmFtZSksIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBzdGFja0ZyYW1lLnJlc3RhcnQoKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGF0YS5hY3Rpb25CYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJU3RhY2tGcmFtZT4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTdGFja0ZyYW1lVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJU3RhY2tGcmFtZSwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVN0YWNrRnJhbWVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJU3RhY2tGcmFtZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEVycm9yc1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxzdHJpbmcsIEZ1enp5U2NvcmUsIElFcnJvclRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXJyb3InO1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEVycm9yc1JlbmRlcmVyLklEO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUVycm9yVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuZXJyb3InKSk7XG5cblx0XHRyZXR1cm4geyBsYWJlbCwgdGVtcGxhdGVEaXNwb3NhYmxlOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPHN0cmluZywgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElFcnJvclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGVycm9yID0gZWxlbWVudC5lbGVtZW50O1xuXHRcdGRhdGEubGFiZWwudGV4dENvbnRlbnQgPSBlcnJvcjtcblx0XHRkYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEubGFiZWwsIGVycm9yKSk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8c3RyaW5nPiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUVycm9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUVycm9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmNsYXNzIExvYWRNb3JlUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFRocmVhZEFuZFNlc3Npb25JZHMsIEZ1enp5U2NvcmUsIElMYWJlbFRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnbG9hZE1vcmUnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnbG9hZEFsbFN0YWNrRnJhbWVzJywgXCJMb2FkIE1vcmUgU3RhY2sgRnJhbWVzXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gTG9hZE1vcmVSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJTGFiZWxUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5sb2FkLWFsbCcpKTtcblx0XHRsYWJlbC5zdHlsZS5jb2xvciA9IGFzQ3NzVmFyaWFibGUodGV4dExpbmtGb3JlZ3JvdW5kKTtcblx0XHRyZXR1cm4geyBsYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8VGhyZWFkQW5kU2Vzc2lvbklkcywgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElMYWJlbFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEubGFiZWwudGV4dENvbnRlbnQgPSBMb2FkTW9yZVJlbmRlcmVyLkxBQkVMO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFRocmVhZEFuZFNlc3Npb25JZHM+LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTGFiZWxUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJTGFiZWxUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cbn1cblxuY2xhc3MgU2hvd01vcmVSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVN0YWNrRnJhbWVbXSwgRnV6enlTY29yZSwgSUxhYmVsVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzaG93TW9yZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7IH1cblxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFNob3dNb3JlUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUxhYmVsVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2hvdy1tb3JlJykpO1xuXHRcdGxhYmVsLnN0eWxlLmNvbG9yID0gYXNDc3NWYXJpYWJsZSh0ZXh0TGlua0ZvcmVncm91bmQpO1xuXHRcdHJldHVybiB7IGxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJU3RhY2tGcmFtZVtdLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUxhYmVsVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZXMgPSBlbGVtZW50LmVsZW1lbnQ7XG5cdFx0aWYgKHN0YWNrRnJhbWVzLmV2ZXJ5KHNmID0+ICEhKHNmLnNvdXJjZSAmJiBzZi5zb3VyY2Uub3JpZ2luICYmIHNmLnNvdXJjZS5vcmlnaW4gPT09IHN0YWNrRnJhbWVzWzBdLnNvdXJjZS5vcmlnaW4pKSkge1xuXHRcdFx0ZGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzaG93TW9yZUFuZE9yaWdpbicsIFwiU2hvdyB7MH0gTW9yZTogezF9XCIsIHN0YWNrRnJhbWVzLmxlbmd0aCwgc3RhY2tGcmFtZXNbMF0uc291cmNlLm9yaWdpbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEubGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2hvd01vcmVTdGFja0ZyYW1lcycsIFwiU2hvdyB7MH0gTW9yZSBTdGFjayBGcmFtZXNcIiwgc3RhY2tGcmFtZXMubGVuZ3RoKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVN0YWNrRnJhbWVbXT4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElMYWJlbFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElMYWJlbFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxufVxuXG5jbGFzcyBDYWxsU3RhY2tEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPENhbGxTdGFja0l0ZW0+IHtcblxuXHRnZXRIZWlnaHQoZWxlbWVudDogQ2FsbFN0YWNrSXRlbSk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTdGFja0ZyYW1lICYmIGVsZW1lbnQucHJlc2VudGF0aW9uSGludCA9PT0gJ2xhYmVsJykge1xuXHRcdFx0cmV0dXJuIDE2O1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZEFuZFNlc3Npb25JZHMgfHwgZWxlbWVudCBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0XHRyZXR1cm4gMTY7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBDYWxsU3RhY2tJdGVtKTogc3RyaW5nIHtcblx0XHRpZiAoaXNEZWJ1Z1Nlc3Npb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBTZXNzaW9uc1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZCkge1xuXHRcdFx0cmV0dXJuIFRocmVhZHNSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTdGFja0ZyYW1lKSB7XG5cdFx0XHRyZXR1cm4gU3RhY2tGcmFtZXNSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBlbGVtZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIEVycm9yc1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZEFuZFNlc3Npb25JZHMpIHtcblx0XHRcdHJldHVybiBMb2FkTW9yZVJlbmRlcmVyLklEO1xuXHRcdH1cblxuXHRcdC8vIGVsZW1lbnQgaW5zdGFuY2VvZiBBcnJheVxuXHRcdHJldHVybiBTaG93TW9yZVJlbmRlcmVyLklEO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHN0b3BwZWRUZXh0KHN0b3BwZWREZXRhaWxzOiBJUmF3U3RvcHBlZERldGFpbHMpOiBzdHJpbmcge1xuXHRyZXR1cm4gc3RvcHBlZERldGFpbHMudGV4dCA/PyBzdG9wcGVkRGVzY3JpcHRpb24oc3RvcHBlZERldGFpbHMpO1xufVxuXG5mdW5jdGlvbiBzdG9wcGVkRGVzY3JpcHRpb24oc3RvcHBlZERldGFpbHM6IElSYXdTdG9wcGVkRGV0YWlscyk6IHN0cmluZyB7XG5cdHJldHVybiBzdG9wcGVkRGV0YWlscy5kZXNjcmlwdGlvbiB8fFxuXHRcdChzdG9wcGVkRGV0YWlscy5yZWFzb24gPyBsb2NhbGl6ZSh7IGtleTogJ3BhdXNlZE9uJywgY29tbWVudDogWydpbmRpY2F0ZXMgcmVhc29uIGZvciBwcm9ncmFtIGJlaW5nIHBhdXNlZCddIH0sIFwiUGF1c2VkIG9uIHswfVwiLCBzdG9wcGVkRGV0YWlscy5yZWFzb24pIDogbG9jYWxpemUoJ3BhdXNlZCcsIFwiUGF1c2VkXCIpKTtcbn1cblxuZnVuY3Rpb24gaXNEZWJ1Z01vZGVsKG9iajogdW5rbm93bik6IG9iaiBpcyBJRGVidWdNb2RlbCB7XG5cdHJldHVybiAhIW9iaiAmJiB0eXBlb2YgKG9iaiBhcyBJRGVidWdNb2RlbCkuZ2V0U2Vzc2lvbnMgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzRGVidWdTZXNzaW9uKG9iajogdW5rbm93bik6IG9iaiBpcyBJRGVidWdTZXNzaW9uIHtcblx0cmV0dXJuICEhb2JqICYmIHR5cGVvZiAob2JqIGFzIElEZWJ1Z1Nlc3Npb24pLmdldEFsbFRocmVhZHMgPT09ICdmdW5jdGlvbic7XG59XG5cbmNsYXNzIENhbGxTdGFja0RhdGFTb3VyY2UgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPElEZWJ1Z01vZGVsLCBDYWxsU3RhY2tJdGVtPiB7XG5cdGRlZW1waGFzaXplZFN0YWNrRnJhbWVzVG9TaG93ID0gbmV3IFdlYWtTZXQ8SVN0YWNrRnJhbWU+KCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UpIHsgfVxuXG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IElEZWJ1Z01vZGVsIHwgQ2FsbFN0YWNrSXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgdGhyZWFkcyA9IGVsZW1lbnQuZ2V0QWxsVGhyZWFkcygpO1xuXHRcdFx0cmV0dXJuICh0aHJlYWRzLmxlbmd0aCA+IDEpIHx8ICh0aHJlYWRzLmxlbmd0aCA9PT0gMSAmJiB0aHJlYWRzWzBdLnN0b3BwZWQpIHx8ICEhKHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy5wYXJlbnRTZXNzaW9uID09PSBlbGVtZW50KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlzRGVidWdNb2RlbChlbGVtZW50KSB8fCAoZWxlbWVudCBpbnN0YW5jZW9mIFRocmVhZCAmJiBlbGVtZW50LnN0b3BwZWQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudDogSURlYnVnTW9kZWwgfCBDYWxsU3RhY2tJdGVtKTogUHJvbWlzZTxDYWxsU3RhY2tJdGVtW10+IHtcblx0XHRpZiAoaXNEZWJ1Z01vZGVsKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGVsZW1lbnQuZ2V0U2Vzc2lvbnMoKTtcblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID4gMSB8fCB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5pc011bHRpU2Vzc2lvblZpZXcoKSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHNlc3Npb25zLmZpbHRlcihzID0+ICFzLnBhcmVudFNlc3Npb24pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGhyZWFkcyA9IHNlc3Npb25zWzBdLmdldEFsbFRocmVhZHMoKTtcblx0XHRcdC8vIE9ubHkgc2hvdyB0aGUgdGhyZWFkcyBpbiB0aGUgY2FsbCBzdGFjayBpZiB0aGVyZSBpcyBtb3JlIHRoYW4gMSB0aHJlYWQuXG5cdFx0XHRyZXR1cm4gdGhyZWFkcy5sZW5ndGggPT09IDEgPyB0aGlzLmdldFRocmVhZENoaWxkcmVuKDxUaHJlYWQ+dGhyZWFkc1swXSkgOiBQcm9taXNlLnJlc29sdmUodGhyZWFkcyk7XG5cdFx0fSBlbHNlIGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgY2hpbGRTZXNzaW9ucyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKS5maWx0ZXIocyA9PiBzLnBhcmVudFNlc3Npb24gPT09IGVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgdGhyZWFkczogQ2FsbFN0YWNrSXRlbVtdID0gZWxlbWVudC5nZXRBbGxUaHJlYWRzKCk7XG5cdFx0XHRpZiAodGhyZWFkcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gRG8gbm90IHNob3cgdGhyZWFkIHdoZW4gdGhlcmUgaXMgb25seSBvbmUgdG8gYmUgY29tcGFjdC5cblx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCB0aGlzLmdldFRocmVhZENoaWxkcmVuKDxUaHJlYWQ+dGhyZWFkc1swXSk7XG5cdFx0XHRcdHJldHVybiBjaGlsZHJlbi5jb25jYXQoY2hpbGRTZXNzaW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhyZWFkcy5jb25jYXQoY2hpbGRTZXNzaW9ucykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRUaHJlYWRDaGlsZHJlbig8VGhyZWFkPmVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VGhyZWFkQ2hpbGRyZW4odGhyZWFkOiBUaHJlYWQpOiBQcm9taXNlPENhbGxTdGFja0l0ZW1bXT4ge1xuXHRcdHJldHVybiB0aGlzLmdldFRocmVhZENhbGxzdGFjayh0aHJlYWQpLnRoZW4oY2hpbGRyZW4gPT4ge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgc29tZSBzdGFjayBmcmFtZXMgc2hvdWxkIGJlIGhpZGRlbiB1bmRlciBhIHBhcmVudCBlbGVtZW50IHNpbmNlIHRoZXkgYXJlIGRlZW1waGFzaXplZFxuXHRcdFx0Y29uc3QgcmVzdWx0OiBDYWxsU3RhY2tJdGVtW10gPSBbXTtcblx0XHRcdGNoaWxkcmVuLmZvckVhY2goKGNoaWxkLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBTdGFja0ZyYW1lICYmIGNoaWxkLnNvdXJjZSAmJiBpc0ZyYW1lRGVlbXBoYXNpemVkKGNoaWxkKSkge1xuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoZSB1c2VyIGNsaWNrZWQgdG8gc2hvdyB0aGUgZGVlbXBoYXNpemVkIHNvdXJjZVxuXHRcdFx0XHRcdGlmICghdGhpcy5kZWVtcGhhc2l6ZWRTdGFja0ZyYW1lc1RvU2hvdy5oYXMoY2hpbGQpKSB7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsYXN0ID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRcdFx0aWYgKGxhc3QgaW5zdGFuY2VvZiBBcnJheSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIENvbGxlY3QgYWxsIHRoZSBzdGFja2ZyYW1lcyB0aGF0IHdpbGwgYmUgXCJjb2xsYXBzZWRcIlxuXHRcdFx0XHRcdFx0XHRcdGxhc3QucHVzaChjaGlsZCk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IG5leHRDaGlsZCA9IGluZGV4IDwgY2hpbGRyZW4ubGVuZ3RoIC0gMSA/IGNoaWxkcmVuW2luZGV4ICsgMV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAobmV4dENoaWxkIGluc3RhbmNlb2YgU3RhY2tGcmFtZSAmJiBuZXh0Q2hpbGQuc291cmNlICYmIGlzRnJhbWVEZWVtcGhhc2l6ZWQobmV4dENoaWxkKSkge1xuXHRcdFx0XHRcdFx0XHQvLyBTdGFydCBjb2xsZWN0aW5nIHN0YWNrZnJhbWVzIHRoYXQgd2lsbCBiZSBcImNvbGxhcHNlZFwiXG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKFtjaGlsZF0pO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0LnB1c2goY2hpbGQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFRocmVhZENhbGxzdGFjayh0aHJlYWQ6IFRocmVhZCk6IFByb21pc2U8QXJyYXk8SVN0YWNrRnJhbWUgfCBzdHJpbmcgfCBUaHJlYWRBbmRTZXNzaW9uSWRzPj4ge1xuXHRcdGxldCBjYWxsU3RhY2s6IEFycmF5PElTdGFja0ZyYW1lIHwgc3RyaW5nIHwgVGhyZWFkQW5kU2Vzc2lvbklkcz4gPSB0aHJlYWQuZ2V0Q2FsbFN0YWNrKCk7XG5cdFx0aWYgKCFjYWxsU3RhY2sgfHwgIWNhbGxTdGFjay5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRocmVhZC5mZXRjaENhbGxTdGFjaygpO1xuXHRcdFx0Y2FsbFN0YWNrID0gdGhyZWFkLmdldENhbGxTdGFjaygpO1xuXHRcdH1cblxuXHRcdGlmIChjYWxsU3RhY2subGVuZ3RoID09PSAxICYmIHRocmVhZC5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0RlbGF5ZWRTdGFja1RyYWNlTG9hZGluZyAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMgJiYgdGhyZWFkLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzICYmIHRocmVhZC5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lcyA+IDEpIHtcblx0XHRcdC8vIFRvIHJlZHVjZSBmbGFzaGluZyBvZiB0aGUgY2FsbCBzdGFjayB2aWV3IHNpbXBseSBhcHBlbmQgdGhlIHN0YWxlIGNhbGwgc3RhY2tcblx0XHRcdC8vIG9uY2Ugd2UgaGF2ZSB0aGUgY29ycmVjdCBkYXRhIHRoZSB0cmVlIHdpbGwgcmVmcmVzaCBhbmQgd2Ugd2lsbCBubyBsb25nZXIgZGlzcGxheSBpdC5cblx0XHRcdGNhbGxTdGFjayA9IGNhbGxTdGFjay5jb25jYXQodGhyZWFkLmdldFN0YWxlQ2FsbFN0YWNrKCkuc2xpY2UoMSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aHJlYWQuc3RvcHBlZERldGFpbHMgJiYgdGhyZWFkLnN0b3BwZWREZXRhaWxzLmZyYW1lc0Vycm9yTWVzc2FnZSkge1xuXHRcdFx0Y2FsbFN0YWNrID0gY2FsbFN0YWNrLmNvbmNhdChbdGhyZWFkLnN0b3BwZWREZXRhaWxzLmZyYW1lc0Vycm9yTWVzc2FnZV0pO1xuXHRcdH1cblx0XHRpZiAoIXRocmVhZC5yZWFjaGVkRW5kT2ZDYWxsU3RhY2sgJiYgdGhyZWFkLnN0b3BwZWREZXRhaWxzKSB7XG5cdFx0XHRjYWxsU3RhY2sgPSBjYWxsU3RhY2suY29uY2F0KFtuZXcgVGhyZWFkQW5kU2Vzc2lvbklkcyh0aHJlYWQuc2Vzc2lvbi5nZXRJZCgpLCB0aHJlYWQudGhyZWFkSWQpXSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhbGxTdGFjaztcblx0fVxufVxuXG5jbGFzcyBDYWxsU3RhY2tBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxDYWxsU3RhY2tJdGVtPiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKHsgY29tbWVudDogWydEZWJ1ZyBpcyBhIG5vdW4gaW4gdGhpcyBjb250ZXh0LCBub3QgYSB2ZXJiLiddLCBrZXk6ICdjYWxsU3RhY2tBcmlhTGFiZWwnIH0sIFwiRGVidWcgQ2FsbCBTdGFja1wiKTtcblx0fVxuXG5cdGdldFdpZGdldFJvbGUoKTogQXJpYVJvbGUge1xuXHRcdC8vIFVzZSB0cmVlZ3JpZCBhcyBhIHJvbGUgc2luY2UgZWFjaCBlbGVtZW50IGNhbiBoYXZlIGFkZGl0aW9uYWwgYWN0aW9ucyBpbnNpZGUgIzE0NjIxMFxuXHRcdHJldHVybiAndHJlZWdyaWQnO1xuXHR9XG5cblx0Z2V0Um9sZShfZWxlbWVudDogQ2FsbFN0YWNrSXRlbSk6IEFyaWFSb2xlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gJ3Jvdyc7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogQ2FsbFN0YWNrSXRlbSk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUaHJlYWQpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSh7IGtleTogJ3RocmVhZEFyaWFMYWJlbCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXJzIHN0YW5kIGZvciB0aGUgdGhyZWFkIG5hbWUgYW5kIHRoZSB0aHJlYWQgc3RhdGUuRm9yIGV4YW1wbGUgXCJUaHJlYWQgMVwiIGFuZCBcIlN0b3BwZWQnXSB9LCBcIlRocmVhZCB7MH0gezF9XCIsIGVsZW1lbnQubmFtZSwgZWxlbWVudC5zdGF0ZUxhYmVsKTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTdGFja0ZyYW1lKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3N0YWNrRnJhbWVBcmlhTGFiZWwnLCBcIlN0YWNrIEZyYW1lIHswfSwgbGluZSB7MX0sIHsyfVwiLCBlbGVtZW50Lm5hbWUsIGVsZW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBnZXRTcGVjaWZpY1NvdXJjZU5hbWUoZWxlbWVudCkpO1xuXHRcdH1cblx0XHRpZiAoaXNEZWJ1Z1Nlc3Npb24oZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHRocmVhZCA9IGVsZW1lbnQuZ2V0QWxsVGhyZWFkcygpLmZpbmQodCA9PiB0LnN0b3BwZWQpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aHJlYWQgPyB0aHJlYWQuc3RhdGVMYWJlbCA6IGxvY2FsaXplKHsga2V5OiAncnVubmluZycsIGNvbW1lbnQ6IFsnaW5kaWNhdGVzIHN0YXRlJ10gfSwgXCJSdW5uaW5nXCIpO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKHsga2V5OiAnc2Vzc2lvbkxhYmVsJywgY29tbWVudDogWydQbGFjZWhvbGRlcnMgc3RhbmQgZm9yIHRoZSBzZXNzaW9uIG5hbWUgYW5kIHRoZSBzZXNzaW9uIHN0YXRlLiBGb3IgZXhhbXBsZSBcIkxhdW5jaCBQcm9ncmFtXCIgYW5kIFwiUnVubmluZ1wiJ10gfSwgXCJTZXNzaW9uIHswfSB7MX1cIiwgZWxlbWVudC5nZXRMYWJlbCgpLCBzdGF0ZSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nob3dNb3JlU3RhY2tGcmFtZXMnLCBcIlNob3cgezB9IE1vcmUgU3RhY2sgRnJhbWVzXCIsIGVsZW1lbnQubGVuZ3RoKTtcblx0XHR9XG5cblx0XHQvLyBlbGVtZW50IGluc3RhbmNlb2YgVGhyZWFkQW5kU2Vzc2lvbklkc1xuXHRcdHJldHVybiBMb2FkTW9yZVJlbmRlcmVyLkxBQkVMO1xuXHR9XG59XG5cbmNsYXNzIENhbGxTdGFja0NvbXByZXNzaW9uRGVsZWdhdGUgaW1wbGVtZW50cyBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGU8Q2FsbFN0YWNrSXRlbT4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlKSB7IH1cblxuXHRpc0luY29tcHJlc3NpYmxlKHN0YXQ6IENhbGxTdGFja0l0ZW0pOiBib29sZWFuIHtcblx0XHRpZiAoaXNEZWJ1Z1Nlc3Npb24oc3RhdCkpIHtcblx0XHRcdGlmIChzdGF0LmNvbXBhY3QpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCk7XG5cdFx0XHRpZiAoc2Vzc2lvbnMuc29tZShzID0+IHMucGFyZW50U2Vzc2lvbiA9PT0gc3RhdCAmJiBzLmNvbXBhY3QpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbGxhcHNlIGV4dGVuZHMgVmlld0FjdGlvbjxDYWxsU3RhY2tWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnY2FsbFN0YWNrLmNvbGxhcHNlJyxcblx0XHRcdHZpZXdJZDogQ0FMTFNUQUNLX1ZJRVdfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvbGxhcHNlJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbyhnZXRTdGF0ZUxhYmVsKFN0YXRlLlN0b3BwZWQpKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ0FMTFNUQUNLX1ZJRVdfSUQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBDYWxsU3RhY2tWaWV3KSB7XG5cdFx0dmlldy5jb2xsYXBzZUFsbCgpO1xuXHR9XG59KTtcblxuZnVuY3Rpb24gcmVnaXN0ZXJDYWxsU3RhY2tJbmxpbmVNZW51SXRlbShpZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nIHwgSUNvbW1hbmRBY3Rpb25UaXRsZSwgaWNvbjogSWNvbiwgd2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24sIG9yZGVyOiBudW1iZXIsIHByZWNvbmRpdGlvbj86IENvbnRleHRLZXlFeHByZXNzaW9uKTogdm9pZCB7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRGVidWdDYWxsU3RhY2tDb250ZXh0LCB7XG5cdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdG9yZGVyLFxuXHRcdHdoZW4sXG5cdFx0Y29tbWFuZDogeyBpZCwgdGl0bGUsIGljb24sIHByZWNvbmRpdGlvbiB9XG5cdH0pO1xufVxuXG5jb25zdCB0aHJlYWRPclNlc3Npb25XaXRoT25lVGhyZWFkID0gQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9UWVBFLmlzRXF1YWxUbygndGhyZWFkJyksIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUuaXNFcXVhbFRvKCdzZXNzaW9uJyksIENPTlRFWFRfQ0FMTFNUQUNLX1NFU1NJT05fSEFTX09ORV9USFJFQUQpKSE7XG5yZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKFBBVVNFX0lELCBQQVVTRV9MQUJFTCwgaWNvbnMuZGVidWdQYXVzZSwgQ29udGV4dEtleUV4cHIuYW5kKHRocmVhZE9yU2Vzc2lvbldpdGhPbmVUaHJlYWQsIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fU1RPUFBFRC50b05lZ2F0ZWQoKSkhLCAxMCwgQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfTk9fREVCVUcudG9OZWdhdGVkKCkpO1xucmVnaXN0ZXJDYWxsU3RhY2tJbmxpbmVNZW51SXRlbShDT05USU5VRV9JRCwgQ09OVElOVUVfTEFCRUwsIGljb25zLmRlYnVnQ29udGludWUsIENvbnRleHRLZXlFeHByLmFuZCh0aHJlYWRPclNlc3Npb25XaXRoT25lVGhyZWFkLCBDT05URVhUX0NBTExTVEFDS19JVEVNX1NUT1BQRUQpISwgMTApO1xucmVnaXN0ZXJDYWxsU3RhY2tJbmxpbmVNZW51SXRlbShTVEVQX09WRVJfSUQsIFNURVBfT1ZFUl9MQUJFTCwgaWNvbnMuZGVidWdTdGVwT3ZlciwgdGhyZWFkT3JTZXNzaW9uV2l0aE9uZVRocmVhZCwgMjAsIENPTlRFWFRfQ0FMTFNUQUNLX0lURU1fU1RPUFBFRCk7XG5yZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKFNURVBfSU5UT19JRCwgU1RFUF9JTlRPX0xBQkVMLCBpY29ucy5kZWJ1Z1N0ZXBJbnRvLCB0aHJlYWRPclNlc3Npb25XaXRoT25lVGhyZWFkLCAzMCwgQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9TVE9QUEVEKTtcbnJlZ2lzdGVyQ2FsbFN0YWNrSW5saW5lTWVudUl0ZW0oU1RFUF9PVVRfSUQsIFNURVBfT1VUX0xBQkVMLCBpY29ucy5kZWJ1Z1N0ZXBPdXQsIHRocmVhZE9yU2Vzc2lvbldpdGhPbmVUaHJlYWQsIDQwLCBDT05URVhUX0NBTExTVEFDS19JVEVNX1NUT1BQRUQpO1xucmVnaXN0ZXJDYWxsU3RhY2tJbmxpbmVNZW51SXRlbShSRVNUQVJUX1NFU1NJT05fSUQsIFJFU1RBUlRfTEFCRUwsIGljb25zLmRlYnVnUmVzdGFydCwgQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9UWVBFLmlzRXF1YWxUbygnc2Vzc2lvbicpLCA1MCk7XG5yZWdpc3RlckNhbGxTdGFja0lubGluZU1lbnVJdGVtKFNUT1BfSUQsIFNUT1BfTEFCRUwsIGljb25zLmRlYnVnU3RvcCwgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQ0FMTFNUQUNLX1NFU1NJT05fSVNfQVRUQUNILnRvTmVnYXRlZCgpLCBDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUuaXNFcXVhbFRvKCdzZXNzaW9uJykpISwgNjApO1xucmVnaXN0ZXJDYWxsU3RhY2tJbmxpbmVNZW51SXRlbShESVNDT05ORUNUX0lELCBESVNDT05ORUNUX0xBQkVMLCBpY29ucy5kZWJ1Z0Rpc2Nvbm5lY3QsIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0NBTExTVEFDS19TRVNTSU9OX0lTX0FUVEFDSCwgQ09OVEVYVF9DQUxMU1RBQ0tfSVRFTV9UWVBFLmlzRXF1YWxUbygnc2Vzc2lvbicpKSEsIDYwKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsK0JBQStCO0FBT3hDLFNBQVMsY0FBYztBQUN2QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXlDO0FBQ2xELFNBQVMsaUJBQWlCLGVBQTRCO0FBQ3RELFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHFCQUFxQix1QkFBdUIseUJBQXlCLGtDQUFrQztBQUNoSCxTQUFTLGNBQWMsUUFBUSxnQkFBZ0IsY0FBYyxpQkFBaUIseUJBQXlCO0FBQ3ZHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQXVELDBCQUEw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
