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
import * as dom from "../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../base/browser/domStylesheets.js";
import { ToolBar } from "../../../base/browser/ui/toolbar/toolbar.js";
import { Button } from "../../../base/browser/ui/button/button.js";
import { CountBadge } from "../../../base/browser/ui/countBadge/countBadge.js";
import { ProgressBar } from "../../../base/browser/ui/progressbar/progressbar.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, MutableDisposable, dispose } from "../../../base/common/lifecycle.js";
import Severity from "../../../base/common/severity.js";
import { isString } from "../../../base/common/types.js";
import { isModifierKey } from "../../../base/common/keyCodes.js";
import { localize } from "../../../nls.js";
import { QuickInputHideReason, QuickPickFocus } from "../common/quickInput.js";
import { QuickInputBox } from "./quickInputBox.js";
import { QuickPick, backButton, InputBox, QuickWidget, InQuickInputContextKey, QuickInputTypeContextKey, EndOfQuickInputBoxContextKey, QuickInputAlignmentContextKey } from "./quickInput.js";
import { ILayoutService } from "../../layout/browser/layoutService.js";
import { mainWindow } from "../../../base/browser/window.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { QuickInputList } from "./quickInputList.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import "./quickInputActions.js";
import { autorun, observableValue } from "../../../base/common/observable.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { Platform, platform, setTimeout0 } from "../../../base/common/platform.js";
import { getWindowControlsStyle, WindowControlsStyle } from "../../window/common/window.js";
import { getZoomFactor } from "../../../base/browser/browser.js";
import { TriStateCheckbox, createToggleActionViewItemProvider } from "../../../base/browser/ui/toggle/toggle.js";
import { defaultCheckboxStyles } from "../../theme/browser/defaultStyles.js";
import { QuickInputTreeController } from "./tree/quickInputTreeController.js";
import { QuickTree } from "./tree/quickTree.js";
import { AnchorAlignment, AnchorPosition, layout2d } from "../../../base/common/layout.js";
import { getAnchorRect } from "../../../base/browser/ui/contextview/contextview.js";
const $ = dom.$;
const VIEWSTATE_STORAGE_KEY = "workbench.quickInput.viewState";
const QUICK_INPUT_MOTION_CLOSING_CLASS = "quick-input-widget-closing";
const QUICK_INPUT_OVERLAY_CLASS = "quick-input-widget-overlay";
const QUICK_INPUT_CLOSE_ANIMATION_DURATION = 150;
const QUICK_INPUT_MOTION_ANCESTOR_CLASSES = ["style-override", "monaco-enable-motion"];
let QuickInputController = class extends Disposable {
  constructor(options, layoutService, instantiationService, contextKeyService, storageService, contextMenuService) {
    super();
    this.options = options;
    this.layoutService = layoutService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.contextMenuService = contextMenuService;
    this.enabled = true;
    this.onDidAcceptEmitter = this._register(new Emitter());
    this.onDidCustomEmitter = this._register(new Emitter());
    this.onDidTriggerButtonEmitter = this._register(new Emitter());
    this.keyMods = { ctrlCmd: false, alt: false, shift: false };
    this.controller = null;
    this.onShowEmitter = this._register(new Emitter());
    this.onShow = this.onShowEmitter.event;
    this.onHideEmitter = this._register(new Emitter());
    this.onHide = this.onHideEmitter.event;
    this.closeAnimation = this._register(new MutableDisposable());
    this._alignment = observableValue(this, "top");
    this.alignment = this._alignment;
    this.backButton = backButton;
    this.inQuickInputContext = InQuickInputContextKey.bindTo(contextKeyService);
    this.quickInputTypeContext = QuickInputTypeContextKey.bindTo(contextKeyService);
    this.endOfQuickInputBoxContext = EndOfQuickInputBoxContextKey.bindTo(contextKeyService);
    this.idPrefix = options.idPrefix;
    this._container = options.container;
    this.styles = options.styles;
    this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => this.registerKeyModsListeners(window, disposables), { window: mainWindow, disposables: this._store }));
    this._register(dom.onWillUnregisterWindow((window) => {
      if (this.ui && dom.getWindow(this.ui.container) === window) {
        this.reparentUI(this.layoutService.mainContainer);
        this.layout(this.layoutService.mainContainerDimension, this.layoutService.mainContainerOffset.quickPickTop);
      }
    }));
    this.viewState = this.loadViewState();
  }
  get currentQuickInput() {
    return this.controller ?? void 0;
  }
  get container() {
    return this._container;
  }
  registerKeyModsListeners(window, disposables) {
    const listener = (e) => {
      this.keyMods.ctrlCmd = e.ctrlKey || e.metaKey;
      this.keyMods.alt = e.altKey;
      this.keyMods.shift = e.shiftKey;
    };
    for (const event of [dom.EventType.KEY_DOWN, dom.EventType.KEY_UP, dom.EventType.MOUSE_DOWN]) {
      disposables.add(dom.addDisposableListener(window, event, listener, true));
    }
  }
  getUI(showInActiveContainer) {
    if (this.ui) {
      if (showInActiveContainer) {
        if (dom.getWindow(this._container) !== dom.getWindow(this.layoutService.activeContainer)) {
          this.reparentUI(this.layoutService.activeContainer);
          this.layout(this.layoutService.activeContainerDimension, this.layoutService.activeContainerOffset.quickPickTop);
        }
      }
      return this.ui;
    }
    const container = dom.append(this._container, $(".quick-input-widget.show-file-icons"));
    container.tabIndex = -1;
    container.style.display = "none";
    const styleSheet = domStylesheetsJs.createStyleSheet(container);
    const titleBar = dom.append(container, $(".quick-input-titlebar"));
    const leftActionBar = this._register(new ToolBar(titleBar, this.contextMenuService, {
      hoverDelegate: this.options.hoverDelegate,
      actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
      icon: true,
      label: false
    }));
    leftActionBar.getElement().classList.add("quick-input-left-action-bar");
    const title = dom.append(titleBar, $(".quick-input-title"));
    const rightActionBar = this._register(new ToolBar(titleBar, this.contextMenuService, {
      hoverDelegate: this.options.hoverDelegate,
      actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
      icon: true,
      label: false
    }));
    rightActionBar.getElement().classList.add("quick-input-right-action-bar");
    const headerContainer = dom.append(container, $(".quick-input-header"));
    const checkAll = this._register(new TriStateCheckbox(localize("quickInput.checkAll", "Toggle all checkboxes"), false, { ...defaultCheckboxStyles, size: 15 }));
    dom.append(headerContainer, checkAll.domNode);
    this._register(checkAll.onChange(() => {
      const checked = checkAll.checked;
      list.setAllVisibleChecked(checked === true);
    }));
    this._register(dom.addDisposableListener(checkAll.domNode, dom.EventType.CLICK, (e) => {
      if (e.x || e.y) {
        inputBox.setFocus();
      }
    }));
    const description2 = dom.append(headerContainer, $(".quick-input-description"));
    const inputContainer = dom.append(headerContainer, $(".quick-input-and-message"));
    const filterContainer = dom.append(inputContainer, $(".quick-input-filter"));
    const inputBox = this._register(new QuickInputBox(filterContainer, this.styles.inputBox, this.styles.toggle));
    inputBox.setAttribute("aria-describedby", `${this.idPrefix}message`);
    const visibleCountContainer = dom.append(filterContainer, $(".quick-input-visible-count"));
    visibleCountContainer.setAttribute("aria-live", "polite");
    visibleCountContainer.setAttribute("aria-atomic", "true");
    const visibleCount = this._register(new CountBadge(visibleCountContainer, { countFormat: localize({ key: "quickInput.visibleCount", comment: ["This tells the user how many items are shown in a list of items to select from. The items can be anything. Currently not visible, but read by screen readers."] }, "{0} Results") }, this.styles.countBadge));
    const countContainer = dom.append(filterContainer, $(".quick-input-count"));
    countContainer.setAttribute("aria-live", "polite");
    const count = this._register(new CountBadge(countContainer, { countFormat: localize({ key: "quickInput.countSelected", comment: ["This tells the user how many items are selected in a list of items to select from. The items can be anything."] }, "{0} Selected") }, this.styles.countBadge));
    const inlineActionBar = this._register(new ToolBar(headerContainer, this.contextMenuService, {
      hoverDelegate: this.options.hoverDelegate,
      actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
      icon: true,
      label: false
    }));
    inlineActionBar.getElement().classList.add("quick-input-inline-action-bar");
    const okContainer = dom.append(headerContainer, $(".quick-input-action"));
    const ok = this._register(new Button(okContainer, this.styles.button));
    ok.label = localize("ok", "OK");
    this._register(ok.onDidClick((e) => {
      this.onDidAcceptEmitter.fire();
    }));
    const customButtonContainer = dom.append(headerContainer, $(".quick-input-action"));
    const customButton = this._register(new Button(customButtonContainer, { ...this.styles.button, supportIcons: true }));
    customButton.label = localize("custom", "Custom");
    this._register(customButton.onDidClick((e) => {
      this.onDidCustomEmitter.fire();
    }));
    const message = dom.append(inputContainer, $(`#${this.idPrefix}message.quick-input-message`));
    const progressBar = this._register(new ProgressBar(container, this.styles.progressBar));
    progressBar.getContainer().classList.add("quick-input-progress");
    const widget = dom.append(container, $(".quick-input-html-widget"));
    widget.tabIndex = -1;
    const description1 = dom.append(container, $(".quick-input-description"));
    const listId = this.idPrefix + "list";
    const list = this._register(this.instantiationService.createInstance(QuickInputList, container, this.options.hoverDelegate, this.options.linkOpenerDelegate, listId, this.styles));
    inputBox.setAttribute("aria-controls", listId);
    this._register(list.onDidChangeFocus(() => {
      if (inputBox.hasFocus()) {
        const activeDescendant = list.getActiveDescendant();
        if (activeDescendant) {
          inputBox.setAttribute("aria-activedescendant", activeDescendant);
          inputBox.setListFocusMode(true);
        } else {
          inputBox.removeAttribute("aria-activedescendant");
          inputBox.setListFocusMode(false);
        }
      }
    }));
    this._register(list.onChangedAllVisibleChecked((checked) => {
      checkAll.checked = checked;
    }));
    this._register(list.onChangedVisibleCount((c) => {
      visibleCount.setCount(c);
    }));
    this._register(list.onChangedCheckedCount((c) => {
      setTimeout0(() => count.setCount(c));
    }));
    this._register(list.onLeave(() => {
      setTimeout(() => {
        if (!this.controller) {
          return;
        }
        inputBox.setFocus();
        if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
          list.clearFocus();
        }
      }, 0);
    }));
    const tree = this._register(this.instantiationService.createInstance(
      QuickInputTreeController,
      container,
      this.options.hoverDelegate,
      this.styles
    ));
    this._register(tree.tree.onDidChangeFocus(() => {
      if (inputBox.hasFocus()) {
        const activeDescendant = tree.getActiveDescendant();
        if (activeDescendant) {
          inputBox.setAttribute("aria-activedescendant", activeDescendant);
          inputBox.setListFocusMode(true);
        } else {
          inputBox.removeAttribute("aria-activedescendant");
          inputBox.setListFocusMode(false);
        }
      }
    }));
    this._register(tree.onLeave(() => {
      setTimeout(() => {
        if (!this.controller) {
          return;
        }
        inputBox.setFocus();
        tree.tree.setFocus([]);
      }, 0);
    }));
    this._register(tree.onDidAccept(() => {
      this.onDidAcceptEmitter.fire();
    }));
    this._register(tree.tree.onDidChangeContentHeight(() => this.updateLayout()));
    const focusTracker = dom.trackFocus(container);
    this._register(focusTracker);
    this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e) => {
      const ui = this.getUI();
      if (dom.isAncestor(e.relatedTarget, ui.inputContainer)) {
        const value = ui.inputBox.isSelectionAtEnd();
        if (this.endOfQuickInputBoxContext.get() !== value) {
          this.endOfQuickInputBoxContext.set(value);
        }
      }
      if (dom.isAncestor(e.relatedTarget, ui.container)) {
        return;
      }
      this.inQuickInputContext.set(true);
      this.previousFocusElement = dom.isHTMLElement(e.relatedTarget) ? e.relatedTarget : void 0;
    }, true));
    this._register(focusTracker.onDidBlur(() => {
      if (!this.getUI().ignoreFocusOut && !this.options.ignoreFocusOut()) {
        this.hide(QuickInputHideReason.Blur);
      }
      this.inQuickInputContext.set(false);
      this.endOfQuickInputBoxContext.set(false);
      this.previousFocusElement = void 0;
    }));
    this._register(inputBox.onKeyDown((e) => {
      const value = this.getUI().inputBox.isSelectionAtEnd();
      if (this.endOfQuickInputBoxContext.get() !== value) {
        this.endOfQuickInputBoxContext.set(value);
      }
      if (!isModifierKey(e.keyCode)) {
        inputBox.removeAttribute("aria-activedescendant");
        inputBox.setListFocusMode(false);
      }
    }));
    this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e) => {
      inputBox.setFocus();
    }));
    this.dndController = this._register(this.instantiationService.createInstance(
      QuickInputDragAndDropController,
      this._container,
      container,
      [
        {
          node: titleBar,
          includeChildren: true,
          excludeNodes: [leftActionBar.getElement(), rightActionBar.getElement()]
        },
        {
          node: headerContainer,
          includeChildren: false
        }
      ],
      this.viewState
    ));
    this._register(autorun((reader) => {
      const dndViewState = this.dndController?.dndViewState.read(reader);
      if (!dndViewState) {
        return;
      }
      if (dndViewState.top !== void 0 && dndViewState.left !== void 0) {
        this.viewState = {
          ...this.viewState,
          top: dndViewState.top,
          left: dndViewState.left
        };
      } else {
        this.viewState = void 0;
      }
      this.updateLayout();
      if (dndViewState.done) {
        this.saveViewState(this.viewState);
      }
    }));
    this._register(autorun((reader) => {
      this._alignment.set(this.dndController.alignment.read(reader), void 0);
    }));
    this.ui = {
      container,
      styleSheet,
      leftActionBar,
      titleBar,
      title,
      description1,
      description2,
      widget,
      rightActionBar,
      inlineActionBar,
      checkAll,
      inputContainer,
      filterContainer,
      inputBox,
      visibleCountContainer,
      visibleCount,
      countContainer,
      count,
      okContainer,
      ok,
      message,
      customButtonContainer,
      customButton,
      list,
      tree,
      progressBar,
      onDidAccept: this.onDidAcceptEmitter.event,
      onDidCustom: this.onDidCustomEmitter.event,
      onDidTriggerButton: this.onDidTriggerButtonEmitter.event,
      ignoreFocusOut: false,
      keyMods: this.keyMods,
      show: (controller) => this.show(controller),
      hide: () => this.hide(),
      setVisibilities: (visibilities) => this.setVisibilities(visibilities),
      setEnabled: (enabled) => this.setEnabled(enabled),
      setContextKey: (contextKey) => this.options.setContextKey(contextKey),
      linkOpenerDelegate: (content) => this.options.linkOpenerDelegate(content)
    };
    this.updateStyles();
    return this.ui;
  }
  reparentUI(container) {
    if (this.ui) {
      this._container = container;
      dom.append(this._container, this.ui.container);
      this.dndController?.reparentUI(this._container);
    }
  }
  pick(picks, options = {}, token = CancellationToken.None) {
    return new Promise((doResolve, reject) => {
      let resolve = (result) => {
        resolve = doResolve;
        options.onKeyMods?.(input.keyMods);
        doResolve(result);
      };
      if (token.isCancellationRequested) {
        resolve(void 0);
        return;
      }
      const input = this.createQuickPick({ useSeparators: true });
      let activeItem;
      const disposables = [
        input,
        input.onDidAccept(() => {
          if (input.canSelectMany) {
            resolve(input.selectedItems.slice());
            input.hide();
          } else {
            const result = input.activeItems[0];
            if (result) {
              resolve(result);
              input.hide();
            }
          }
        }),
        input.onDidChangeActive((items) => {
          const focused = items[0];
          if (focused && options.onDidFocus) {
            options.onDidFocus(focused);
          }
        }),
        input.onDidChangeSelection((items) => {
          if (!input.canSelectMany) {
            const result = items[0];
            if (result) {
              resolve(result);
              input.hide();
            }
          }
        }),
        input.onDidTriggerItemButton((event) => options.onDidTriggerItemButton && options.onDidTriggerItemButton({
          ...event,
          removeItem: () => {
            const index = input.items.indexOf(event.item);
            if (index !== -1) {
              const items = input.items.slice();
              const removed = items.splice(index, 1);
              const activeItems = input.activeItems.filter((activeItem2) => activeItem2 !== removed[0]);
              const keepScrollPositionBefore = input.keepScrollPosition;
              input.keepScrollPosition = true;
              input.items = items;
              if (activeItems) {
                input.activeItems = activeItems;
              }
              input.keepScrollPosition = keepScrollPositionBefore;
            }
          }
        })),
        input.onDidTriggerSeparatorButton((event) => options.onDidTriggerSeparatorButton?.(event)),
        input.onDidChangeValue((value) => {
          if (activeItem && !value && (input.activeItems.length !== 1 || input.activeItems[0] !== activeItem)) {
            input.activeItems = [activeItem];
          }
        }),
        token.onCancellationRequested(() => {
          input.hide();
        }),
        input.onDidHide(() => {
          dispose(disposables);
          resolve(void 0);
        })
      ];
      input.title = options.title;
      if (options.value) {
        input.value = options.value;
      }
      input.canSelectMany = !!options.canPickMany;
      input.placeholder = options.placeHolder;
      input.prompt = options.prompt;
      input.ignoreFocusOut = !!options.ignoreFocusLost;
      input.matchOnDescription = !!options.matchOnDescription;
      input.matchOnDetail = !!options.matchOnDetail;
      if (options.sortByLabel !== void 0) {
        input.sortByLabel = options.sortByLabel;
      }
      input.matchOnLabel = options.matchOnLabel === void 0 || options.matchOnLabel;
      input.quickNavigate = options.quickNavigate;
      input.hideInput = !!options.hideInput;
      input.contextKey = options.contextKey;
      input.anchor = options.anchor;
      input.anchorPosition = options.anchorPosition;
      input.busy = true;
      Promise.all([picks, options.activeItem]).then(([items, _activeItem]) => {
        activeItem = _activeItem;
        input.busy = false;
        input.items = items;
        if (input.canSelectMany) {
          input.selectedItems = items.filter((item) => item.type !== "separator" && item.picked);
        }
        if (activeItem) {
          input.activeItems = [activeItem];
        }
      });
      input.show();
      Promise.resolve(picks).then(void 0, (err) => {
        reject(err);
        input.hide();
      });
    });
  }
  setValidationOnInput(input, validationResult) {
    if (validationResult && isString(validationResult)) {
      input.severity = Severity.Error;
      input.validationMessage = validationResult;
    } else if (validationResult && !isString(validationResult)) {
      input.severity = validationResult.severity;
      input.validationMessage = validationResult.content;
    } else {
      input.severity = Severity.Ignore;
      input.validationMessage = void 0;
    }
  }
  input(options = {}, token = CancellationToken.None) {
    return new Promise((resolve) => {
      if (token.isCancellationRequested) {
        resolve(void 0);
        return;
      }
      const input = this.createInputBox();
      const validateInput = options.validateInput || (() => Promise.resolve(void 0));
      const onDidValueChange = Event.debounce(input.onDidChangeValue, (last, cur) => cur, 100);
      let validationValue = options.value || "";
      let validation = Promise.resolve(validateInput(validationValue));
      const disposables = [
        input,
        onDidValueChange((value) => {
          if (value !== validationValue) {
            validation = Promise.resolve(validateInput(value));
            validationValue = value;
          }
          validation.then((result) => {
            if (value === validationValue) {
              this.setValidationOnInput(input, result);
            }
          });
        }),
        input.onDidAccept(() => {
          const value = input.value;
          if (value !== validationValue) {
            validation = Promise.resolve(validateInput(value));
            validationValue = value;
          }
          validation.then((result) => {
            if (!result || !isString(result) && result.severity !== Severity.Error) {
              resolve(value);
              input.hide();
            } else if (value === validationValue) {
              this.setValidationOnInput(input, result);
            }
          });
        }),
        token.onCancellationRequested(() => {
          input.hide();
        }),
        input.onDidHide(() => {
          dispose(disposables);
          resolve(void 0);
        })
      ];
      input.title = options.title;
      input.value = options.value || "";
      input.valueSelection = options.valueSelection;
      input.prompt = options.prompt;
      input.placeholder = options.placeHolder;
      input.password = !!options.password;
      input.ignoreFocusOut = !!options.ignoreFocusLost;
      input.show();
    });
  }
  createQuickPick(options = { useSeparators: false }) {
    const ui = this.getUI(true);
    return new QuickPick(ui);
  }
  createInputBox() {
    const ui = this.getUI(true);
    return new InputBox(ui);
  }
  setAlignment(alignment) {
    if (this.controller?.anchor) {
      return;
    }
    this.dndController?.setAlignment(alignment);
  }
  createQuickWidget() {
    const ui = this.getUI(true);
    return new QuickWidget(ui);
  }
  createQuickTree() {
    const ui = this.getUI(true);
    return new QuickTree(ui);
  }
  show(controller) {
    this.completeCloseAnimation();
    const ui = this.getUI(true);
    const oldController = this.controller;
    this.controller = controller;
    oldController?.didHide();
    if (dom.isHTMLElement(controller.anchor)) {
      const anchorWindow = dom.getWindow(controller.anchor);
      if (dom.getWindow(this._container) !== anchorWindow) {
        this.reparentUI(this.layoutService.getContainer(anchorWindow));
      }
    }
    this.setEnabled(true);
    ui.leftActionBar.setActions([]);
    ui.title.textContent = "";
    ui.description1.textContent = "";
    ui.description2.textContent = "";
    dom.reset(ui.widget);
    ui.rightActionBar.setActions([]);
    ui.inlineActionBar.setActions([]);
    ui.checkAll.checked = false;
    ui.inputBox.placeholder = "";
    ui.inputBox.password = false;
    ui.inputBox.showDecoration(Severity.Ignore);
    ui.visibleCount.setCount(0);
    ui.count.setCount(0);
    ui.countContainer.style.right = "4px";
    dom.reset(ui.message);
    ui.progressBar.stop();
    ui.progressBar.getContainer().setAttribute("aria-hidden", "true");
    ui.list.setElements([]);
    ui.list.matchOnDescription = false;
    ui.list.matchOnDetail = false;
    ui.list.matchOnLabel = true;
    ui.list.sortByLabel = true;
    ui.tree.updateFilterOptions({
      matchOnDescription: false,
      matchOnLabel: true
    });
    ui.tree.sortByLabel = true;
    ui.ignoreFocusOut = false;
    ui.inputBox.toggles = void 0;
    ui.inputBox.actions = void 0;
    ui.inputBox.setHeight(void 0);
    const backKeybindingLabel = this.options.backKeybindingLabel();
    backButton.tooltip = backKeybindingLabel ? localize("quickInput.backWithKeybinding", "Back ({0})", backKeybindingLabel) : localize("quickInput.back", "Back");
    this.overlayLayoutCorrection = void 0;
    ui.container.classList.toggle(QUICK_INPUT_OVERLAY_CLASS, controller.anchorPosition === "overlay");
    ui.container.style.display = "";
    this.updateLayout();
    this.dndController?.setEnabled(!controller.anchor);
    this.dndController?.layoutContainer();
    if (controller.anchor) {
      this._alignment.set("custom", void 0);
    } else {
      this._alignment.set(this.dndController?.alignment.get() ?? "top", void 0);
    }
    this.onShowEmitter.fire();
    ui.inputBox.setFocus();
    this.quickInputTypeContext.set(controller.type);
  }
  isVisible() {
    return !!this.controller;
  }
  setVisibilities(visibilities) {
    const ui = this.getUI();
    ui.title.style.display = visibilities.title ? "" : "none";
    ui.description1.style.display = visibilities.description && (visibilities.inputBox || visibilities.checkAll) ? "" : "none";
    ui.description2.style.display = visibilities.description && !(visibilities.inputBox || visibilities.checkAll) ? "" : "none";
    ui.checkAll.domNode.style.display = visibilities.checkAll ? "" : "none";
    ui.inputContainer.style.display = visibilities.inputBox ? "" : "none";
    ui.filterContainer.style.display = visibilities.inputBox ? "" : "none";
    ui.visibleCountContainer.style.display = visibilities.visibleCount ? "" : "none";
    ui.countContainer.style.display = visibilities.count ? "" : "none";
    ui.okContainer.style.display = visibilities.ok ? "" : "none";
    ui.customButtonContainer.style.display = visibilities.customButton ? "" : "none";
    ui.message.style.display = visibilities.message ? "" : "none";
    ui.progressBar.getContainer().style.display = visibilities.progressBar ? "" : "none";
    ui.list.displayed = !!visibilities.list;
    ui.tree.displayed = !!visibilities.tree;
    ui.container.classList.toggle("show-checkboxes", !!visibilities.checkBox);
    ui.container.classList.toggle("hidden-input", !visibilities.inputBox && !visibilities.description);
    this.overlayLayoutCorrection = void 0;
    this.updateLayout();
  }
  setEnabled(enabled) {
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      const ui = this.getUI();
      for (let i = 0; i < ui.leftActionBar.getItemsLength(); i++) {
        const action = ui.leftActionBar.getItemAction(i);
        if (action) {
          action.enabled = enabled;
        }
      }
      for (let i = 0; i < ui.rightActionBar.getItemsLength(); i++) {
        const action = ui.rightActionBar.getItemAction(i);
        if (action) {
          action.enabled = enabled;
        }
      }
      if (enabled) {
        ui.checkAll.enable();
      } else {
        ui.checkAll.disable();
      }
      ui.inputBox.enabled = enabled;
      ui.ok.enabled = enabled;
      ui.list.enabled = enabled;
    }
  }
  hide(reason) {
    const controller = this.controller;
    if (!controller) {
      return;
    }
    controller.willHide(reason);
    const container = this.ui?.container;
    const focusChanged = container && !dom.isAncestorOfActiveElement(container);
    this.controller = null;
    this.onHideEmitter.fire();
    if (container) {
      if (!container.classList.contains(QUICK_INPUT_OVERLAY_CLASS) && dom.hasParentWithClass(container, QUICK_INPUT_MOTION_ANCESTOR_CLASSES)) {
        container.inert = true;
        container.classList.add(QUICK_INPUT_MOTION_CLOSING_CLASS);
        this.closeAnimation.value = disposableTimeout(() => this.completeCloseAnimation(), QUICK_INPUT_CLOSE_ANIMATION_DURATION);
      } else {
        container.style.display = "none";
      }
    }
    if (!focusChanged) {
      let currentElement = this.previousFocusElement;
      while (currentElement && !currentElement.offsetParent) {
        currentElement = currentElement.parentElement ?? void 0;
      }
      if (currentElement?.offsetParent) {
        currentElement.focus();
        this.previousFocusElement = void 0;
      } else {
        this.options.returnFocus();
      }
    }
    controller.didHide(reason);
  }
  completeCloseAnimation() {
    if (!this.closeAnimation.value) {
      return;
    }
    this.closeAnimation.clear();
    const container = this.ui?.container;
    if (container) {
      container.inert = false;
      container.classList.remove(QUICK_INPUT_MOTION_CLOSING_CLASS);
      container.style.display = "none";
    }
  }
  dispose() {
    this.completeCloseAnimation();
    super.dispose();
  }
  focus() {
    if (this.isVisible()) {
      const ui = this.getUI();
      if (ui.inputBox.enabled) {
        ui.inputBox.setFocus();
      } else {
        ui.list.domFocus();
      }
    }
  }
  toggle() {
    if (!this.isVisible()) {
      return;
    }
    if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
      this.getUI().list.toggleCheckbox();
    } else if (this.controller instanceof QuickTree) {
      this.getUI().tree.toggleCheckbox();
    }
  }
  toggleHover() {
    if (this.isVisible() && this.controller instanceof QuickPick) {
      this.getUI().list.toggleHover();
    }
  }
  navigate(next, quickNavigate) {
    if (this.isVisible() && this.getUI().list.displayed) {
      this.getUI().list.focus(next ? QuickPickFocus.Next : QuickPickFocus.Previous);
      if (quickNavigate && this.controller instanceof QuickPick) {
        this.controller.quickNavigate = quickNavigate;
      }
    }
  }
  async accept(keyMods = { alt: false, ctrlCmd: false, shift: false }) {
    this.keyMods.alt = keyMods.alt;
    this.keyMods.ctrlCmd = keyMods.ctrlCmd;
    this.keyMods.shift = keyMods.shift;
    this.onDidAcceptEmitter.fire();
  }
  async back() {
    this.onDidTriggerButtonEmitter.fire(this.backButton);
  }
  async cancel(reason) {
    this.hide(reason);
  }
  layout(dimension, titleBarOffset) {
    this.dimension = dimension;
    this.titleBarOffset = titleBarOffset;
    this.overlayLayoutCorrection = void 0;
    this.updateLayout();
  }
  updateLayout() {
    if (this.ui && this.isVisible()) {
      const style = this.ui.container.style;
      let width = Math.min(this.dimension.width * 0.62, QuickInputController.MAX_WIDTH);
      style.width = width + "px";
      let listHeight = this.dimension && this.dimension.height * 0.4;
      let overlayAnchor;
      if (this.controller?.anchor) {
        const target = this.controller.anchor;
        const isElement = dom.isHTMLElement(target);
        const anchorWindow = isElement ? dom.getWindow(target) : dom.getActiveWindow();
        const container = this.layoutService.getContainer(anchorWindow).getBoundingClientRect();
        const verticalPadding = 6 + 26 + 16;
        let anchor = getAnchorRect(target);
        let preferredAnchorPosition = AnchorPosition.ABOVE;
        let listHeightRatio = 0.2;
        let maxListHeight = 200;
        if (this.controller.anchorPosition === "overlay") {
          overlayAnchor = anchor;
          this.ui.inputBox.setHeight(anchor.height);
          width = anchor.width;
          listHeightRatio = 0.4;
          anchor = { ...anchor, height: 0 };
          maxListHeight = Math.min(400, container.bottom - anchor.top - verticalPadding);
          preferredAnchorPosition = AnchorPosition.BELOW;
        } else {
          width = 380;
        }
        listHeight = this.dimension ? Math.min(this.dimension.height * listHeightRatio, maxListHeight) : maxListHeight;
        const containerHeight = Math.floor(listHeight) + verticalPadding;
        const { top, left, right, bottom, anchorAlignment, anchorPosition } = layout2d(container, { width, height: containerHeight }, anchor, { anchorPosition: preferredAnchorPosition });
        if (anchorAlignment === AnchorAlignment.RIGHT) {
          style.right = `${right}px`;
          style.left = "initial";
        } else {
          style.left = `${left}px`;
          style.right = "initial";
        }
        if (anchorPosition === AnchorPosition.ABOVE) {
          style.bottom = `${bottom}px`;
          style.top = "initial";
        } else {
          style.top = `${top}px`;
          style.bottom = "initial";
        }
        style.width = `${width}px`;
        style.height = "";
      } else {
        style.top = `${this.viewState?.top !== void 0 ? Math.round(this.dimension.height * this.viewState.top) : this.titleBarOffset}px`;
        style.left = `${Math.round(this.dimension.width * (this.viewState?.left ?? 0.5) - width / 2)}px`;
        style.right = "";
        style.bottom = "";
        style.height = "";
      }
      if (overlayAnchor) {
        this.alignOverlayInput(overlayAnchor);
      }
      this.ui.inputBox.layout();
      this.ui.list.layout(listHeight);
      this.ui.tree.layout(listHeight);
    }
  }
  alignOverlayInput(anchor) {
    const style = this.ui.container.style;
    let correction = this.overlayLayoutCorrection;
    if (!correction || correction.anchor.left !== anchor.left || correction.anchor.top !== anchor.top || correction.anchor.width !== anchor.width || correction.anchor.height !== anchor.height) {
      this.ui.inputBox.layout();
      const input = this.ui.filterContainer.getBoundingClientRect();
      correction = this.overlayLayoutCorrection = {
        anchor,
        left: anchor.left - input.left,
        right: input.right - (anchor.left + anchor.width),
        top: anchor.top - input.top,
        bottom: input.bottom - (anchor.top + anchor.height),
        width: anchor.width - input.width
      };
    }
    style.width = `${parseFloat(style.width) + correction.width}px`;
    if (style.left !== "initial") {
      style.left = `${parseFloat(style.left) + correction.left}px`;
    } else {
      style.right = `${parseFloat(style.right) + correction.right}px`;
    }
    if (style.top !== "initial") {
      style.top = `${parseFloat(style.top) + correction.top}px`;
    } else {
      style.bottom = `${parseFloat(style.bottom) + correction.bottom}px`;
    }
  }
  applyStyles(styles) {
    this.styles = styles;
    this.updateStyles();
  }
  updateStyles() {
    if (this.ui) {
      const {
        quickInputTitleBackground,
        quickInputBackground,
        quickInputForeground,
        widgetBorder
      } = this.styles.widget;
      this.ui.titleBar.style.backgroundColor = quickInputTitleBackground ?? "";
      this.ui.container.style.backgroundColor = quickInputBackground ?? "";
      this.ui.container.style.color = quickInputForeground ?? "";
      this.ui.container.style.border = widgetBorder ? `1px solid ${widgetBorder}` : "";
      this.ui.list.style(this.styles.list);
      this.ui.tree.tree.style(this.styles.list);
      const content = [];
      if (this.styles.pickerGroup.pickerGroupBorder) {
        content.push(`.quick-input-list .quick-input-list-entry { border-top-color:  ${this.styles.pickerGroup.pickerGroupBorder}; }`);
      }
      if (this.styles.pickerGroup.pickerGroupForeground) {
        content.push(`.quick-input-list .quick-input-list-separator { color:  ${this.styles.pickerGroup.pickerGroupForeground}; }`);
      }
      if (this.styles.pickerGroup.pickerGroupForeground) {
        content.push(`.quick-input-list .quick-input-list-separator-as-item { color: var(--vscode-descriptionForeground); }`);
      }
      if (this.styles.keybindingLabel.keybindingLabelBackground || this.styles.keybindingLabel.keybindingLabelBorder || this.styles.keybindingLabel.keybindingLabelBottomBorder || this.styles.keybindingLabel.keybindingLabelShadow || this.styles.keybindingLabel.keybindingLabelForeground) {
        content.push(".quick-input-list .monaco-keybinding > .monaco-keybinding-key {");
        if (this.styles.keybindingLabel.keybindingLabelBackground) {
          content.push(`background-color: ${this.styles.keybindingLabel.keybindingLabelBackground};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelBorder) {
          content.push(`border-color: ${this.styles.keybindingLabel.keybindingLabelBorder};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelBottomBorder) {
          content.push(`border-bottom-color: ${this.styles.keybindingLabel.keybindingLabelBottomBorder};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelShadow) {
          content.push(`box-shadow: inset 0 -1px 0 ${this.styles.keybindingLabel.keybindingLabelShadow};`);
        }
        if (this.styles.keybindingLabel.keybindingLabelForeground) {
          content.push(`color: ${this.styles.keybindingLabel.keybindingLabelForeground};`);
        }
        content.push("}");
      }
      const newStyles = content.join("\n");
      if (newStyles !== this.ui.styleSheet.textContent) {
        this.ui.styleSheet.textContent = newStyles;
      }
    }
  }
  loadViewState() {
    try {
      const data = JSON.parse(this.storageService.get(VIEWSTATE_STORAGE_KEY, StorageScope.APPLICATION, "{}"));
      if (data.top !== void 0 || data.left !== void 0) {
        return data;
      }
    } catch {
    }
    return void 0;
  }
  saveViewState(viewState) {
    const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;
    if (!isMainWindow) {
      return;
    }
    if (viewState !== void 0) {
      this.storageService.store(VIEWSTATE_STORAGE_KEY, JSON.stringify(viewState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(VIEWSTATE_STORAGE_KEY, StorageScope.APPLICATION);
    }
  }
};
QuickInputController.MAX_WIDTH = 600;
QuickInputController = __decorateClass([
  __decorateParam(1, ILayoutService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IContextMenuService)
], QuickInputController);
let QuickInputDragAndDropController = class extends Disposable {
  constructor(_container, _quickInputContainer, _quickInputDragAreas, initialViewState, _layoutService, contextKeyService, configurationService) {
    super();
    this._container = _container;
    this._quickInputContainer = _quickInputContainer;
    this._quickInputDragAreas = _quickInputDragAreas;
    this._layoutService = _layoutService;
    this.configurationService = configurationService;
    this.dndViewState = observableValue(this, void 0);
    this._enabled = true;
    this._snapThreshold = 20;
    this._snapLineHorizontalRatio = 0.25;
    this._alignment = observableValue(this, "top");
    this.alignment = this._alignment;
    this._quickInputAlignmentContext = QuickInputAlignmentContextKey.bindTo(contextKeyService);
    const customWindowControls = getWindowControlsStyle(this.configurationService) === WindowControlsStyle.CUSTOM;
    this._controlsOnLeft = customWindowControls && platform === Platform.Mac;
    this._controlsOnRight = customWindowControls && (platform === Platform.Windows || platform === Platform.Linux);
    this._registerLayoutListener();
    this.registerMouseListeners();
    this.dndViewState.set({ ...initialViewState, done: true }, void 0);
    if (initialViewState?.top !== void 0 && initialViewState?.left !== void 0) {
      this._setAlignmentState(void 0);
    }
  }
  reparentUI(container) {
    this._container = container;
  }
  layoutContainer(dimension = this._layoutService.activeContainerDimension) {
    if (!this._enabled) {
      return;
    }
    const state = this.dndViewState.get();
    const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
    if (state?.top !== void 0 && state?.left !== void 0) {
      const a = Math.round(state.left * 100) / 100;
      const b = dimension.width;
      const c = dragAreaRect.width;
      const d = a * b - c / 2;
      this._layout(state.top * dimension.height, d);
    }
  }
  setEnabled(enabled) {
    this._enabled = enabled;
    this._quickInputContainer.classList.toggle("no-drag", !enabled);
  }
  _setAlignmentState(value) {
    this._quickInputAlignmentContext.set(value);
    this._alignment.set(value ?? "custom", void 0);
  }
  setAlignment(alignment, done = true) {
    if (alignment === "top") {
      this.dndViewState.set({
        top: this._getTopSnapValue() / this._container.clientHeight,
        left: (this._getCenterXSnapValue() + this._quickInputContainer.clientWidth / 2) / this._container.clientWidth,
        done
      }, void 0);
      this._setAlignmentState("top");
    } else if (alignment === "center") {
      this.dndViewState.set({
        top: this._getCenterYSnapValue() / this._container.clientHeight,
        left: (this._getCenterXSnapValue() + this._quickInputContainer.clientWidth / 2) / this._container.clientWidth,
        done
      }, void 0);
      this._setAlignmentState("center");
    } else {
      this.dndViewState.set({ top: alignment.top, left: alignment.left, done }, void 0);
      this._setAlignmentState(void 0);
    }
  }
  _registerLayoutListener() {
    this._register(Event.filter(this._layoutService.onDidLayoutContainer, (e) => e.container === this._container)((e) => this.layoutContainer(e.dimension)));
  }
  registerMouseListeners() {
    const dragArea = this._quickInputContainer;
    this._register(dom.addDisposableGenericMouseUpListener(dragArea, (event) => {
      if (!this._enabled) {
        return;
      }
      const originEvent = new StandardMouseEvent(dom.getWindow(dragArea), event);
      if (originEvent.detail !== 2) {
        return;
      }
      const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
      if (!area || area.excludeNodes?.some((node) => dom.isAncestor(originEvent.target, node))) {
        return;
      }
      this.dndViewState.set({ top: void 0, left: void 0, done: true }, void 0);
      this._setAlignmentState("top");
    }));
    this._register(dom.addDisposableGenericMouseDownListener(dragArea, (e) => {
      if (!this._enabled) {
        return;
      }
      const activeWindow = dom.getWindow(this._layoutService.activeContainer);
      const originEvent = new StandardMouseEvent(activeWindow, e);
      const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
      if (!area || area.excludeNodes?.some((node) => dom.isAncestor(originEvent.target, node))) {
        return;
      }
      const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
      const dragOffsetX = originEvent.browserEvent.clientX - dragAreaRect.left;
      const dragOffsetY = originEvent.browserEvent.clientY - dragAreaRect.top;
      let isMovingQuickInput = false;
      const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e2) => {
        const mouseMoveEvent = new StandardMouseEvent(activeWindow, e2);
        mouseMoveEvent.preventDefault();
        if (!isMovingQuickInput) {
          isMovingQuickInput = true;
        }
        this._layout(e2.clientY - dragOffsetY, e2.clientX - dragOffsetX);
      });
      const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e2) => {
        if (isMovingQuickInput) {
          const state = this.dndViewState.get();
          this.dndViewState.set({ top: state?.top, left: state?.left, done: true }, void 0);
        }
        mouseMoveListener.dispose();
        mouseUpListener.dispose();
      });
    }));
  }
  _layout(topCoordinate, leftCoordinate) {
    const snapCoordinateYTop = this._getTopSnapValue();
    const snapCoordinateY = this._getCenterYSnapValue();
    const snapCoordinateX = this._getCenterXSnapValue();
    topCoordinate = Math.max(0, Math.min(topCoordinate, this._container.clientHeight - this._quickInputContainer.clientHeight));
    if (topCoordinate < this._layoutService.activeContainerOffset.top) {
      if (this._controlsOnLeft) {
        leftCoordinate = Math.max(leftCoordinate, 80 / getZoomFactor(dom.getActiveWindow()));
      } else if (this._controlsOnRight) {
        leftCoordinate = Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth - 140 / getZoomFactor(dom.getActiveWindow()));
      }
    }
    const snappingToTop = Math.abs(topCoordinate - snapCoordinateYTop) < this._snapThreshold;
    topCoordinate = snappingToTop ? snapCoordinateYTop : topCoordinate;
    const snappingToCenter = Math.abs(topCoordinate - snapCoordinateY) < this._snapThreshold;
    topCoordinate = snappingToCenter ? snapCoordinateY : topCoordinate;
    const top = topCoordinate / this._container.clientHeight;
    leftCoordinate = Math.max(0, Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth));
    const snappingToCenterX = Math.abs(leftCoordinate - snapCoordinateX) < this._snapThreshold;
    leftCoordinate = snappingToCenterX ? snapCoordinateX : leftCoordinate;
    const b = this._container.clientWidth;
    const c = this._quickInputContainer.clientWidth;
    const d = leftCoordinate;
    const left = (d + c / 2) / b;
    this.dndViewState.set({ top, left, done: false }, void 0);
    if (snappingToCenterX) {
      if (snappingToTop) {
        this._setAlignmentState("top");
        return;
      } else if (snappingToCenter) {
        this._setAlignmentState("center");
        return;
      }
    }
    this._setAlignmentState(void 0);
  }
  _getTopSnapValue() {
    return this._layoutService.activeContainerOffset.quickPickTop;
  }
  _getCenterYSnapValue() {
    return Math.round(this._container.clientHeight * this._snapLineHorizontalRatio);
  }
  _getCenterXSnapValue() {
    return Math.round(this._container.clientWidth / 2) - Math.round(this._quickInputContainer.clientWidth / 2);
  }
};
QuickInputDragAndDropController = __decorateClass([
  __decorateParam(4, ILayoutService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService)
], QuickInputDragAndDropController);
export {
  QuickInputController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9xdWlja0lucHV0Q29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzSnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IENvdW50QmFkZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY291bnRCYWRnZS9jb3VudEJhZGdlLmpzJztcbmltcG9ydCB7IFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBpc01vZGlmaWVyS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUlucHV0Qm94LCBJSW5wdXRPcHRpb25zLCBJS2V5TW9kcywgSVBpY2tPcHRpb25zLCBJUXVpY2tJbnB1dCwgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja05hdmlnYXRlQ29uZmlndXJhdGlvbiwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIElRdWlja1dpZGdldCwgUXVpY2tJbnB1dEhpZGVSZWFzb24sIFF1aWNrUGlja0lucHV0LCBRdWlja1BpY2tGb2N1cywgUXVpY2tJbnB1dFR5cGUsIElRdWlja1RyZWUsIElRdWlja1RyZWVJdGVtLCBRdWlja0lucHV0QWxpZ25tZW50IH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dEJveCB9IGZyb20gJy4vcXVpY2tJbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0VUksIFdyaXRlYWJsZSwgSVF1aWNrSW5wdXRTdHlsZXMsIElRdWlja0lucHV0T3B0aW9ucywgUXVpY2tQaWNrLCBiYWNrQnV0dG9uLCBJbnB1dEJveCwgVmlzaWJpbGl0aWVzLCBRdWlja1dpZGdldCwgSW5RdWlja0lucHV0Q29udGV4dEtleSwgUXVpY2tJbnB1dFR5cGVDb250ZXh0S2V5LCBFbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0S2V5LCBRdWlja0lucHV0QWxpZ25tZW50Q29udGV4dEtleSB9IGZyb20gJy4vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0TGlzdCB9IGZyb20gJy4vcXVpY2tJbnB1dExpc3QuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0ICcuL3F1aWNrSW5wdXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFBsYXRmb3JtLCBwbGF0Zm9ybSwgc2V0VGltZW91dDAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3dDb250cm9sc1N0eWxlLCBXaW5kb3dDb250cm9sc1N0eWxlIH0gZnJvbSAnLi4vLi4vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgZ2V0Wm9vbUZhY3RvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IFRyaVN0YXRlQ2hlY2tib3gsIGNyZWF0ZVRvZ2dsZUFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dFRyZWVDb250cm9sbGVyIH0gZnJvbSAnLi90cmVlL3F1aWNrSW5wdXRUcmVlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBRdWlja1RyZWUgfSBmcm9tICcuL3RyZWUvcXVpY2tUcmVlLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgQW5jaG9yUG9zaXRpb24sIElSZWN0LCBsYXlvdXQyZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xheW91dC5qcyc7XG5pbXBvcnQgeyBnZXRBbmNob3JSZWN0LCBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5jb25zdCBWSUVXU1RBVEVfU1RPUkFHRV9LRVkgPSAnd29ya2JlbmNoLnF1aWNrSW5wdXQudmlld1N0YXRlJztcbmNvbnN0IFFVSUNLX0lOUFVUX01PVElPTl9DTE9TSU5HX0NMQVNTID0gJ3F1aWNrLWlucHV0LXdpZGdldC1jbG9zaW5nJztcbmNvbnN0IFFVSUNLX0lOUFVUX09WRVJMQVlfQ0xBU1MgPSAncXVpY2staW5wdXQtd2lkZ2V0LW92ZXJsYXknO1xuY29uc3QgUVVJQ0tfSU5QVVRfQ0xPU0VfQU5JTUFUSU9OX0RVUkFUSU9OID0gMTUwO1xuY29uc3QgUVVJQ0tfSU5QVVRfTU9USU9OX0FOQ0VTVE9SX0NMQVNTRVMgPSBbJ3N0eWxlLW92ZXJyaWRlJywgJ21vbmFjby1lbmFibGUtbW90aW9uJ107XG5cbnR5cGUgUXVpY2tJbnB1dFZpZXdTdGF0ZSA9IHtcblx0cmVhZG9ubHkgdG9wPzogbnVtYmVyO1xuXHRyZWFkb25seSBsZWZ0PzogbnVtYmVyO1xufTtcblxudHlwZSBRdWlja0lucHV0T3ZlcmxheUxheW91dENvcnJlY3Rpb24gPSB7XG5cdHJlYWRvbmx5IGFuY2hvcjogSVJlY3Q7XG5cdHJlYWRvbmx5IGxlZnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcmlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgdG9wOiBudW1iZXI7XG5cdHJlYWRvbmx5IGJvdHRvbTogbnVtYmVyO1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xufTtcblxuZXhwb3J0IGNsYXNzIFF1aWNrSW5wdXRDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9XSURUSCA9IDYwMDsgLy8gTWF4IHRvdGFsIHdpZHRoIG9mIHF1aWNrIGlucHV0IHdpZGdldFxuXG5cdHByaXZhdGUgaWRQcmVmaXg6IHN0cmluZztcblx0cHJpdmF0ZSB1aTogUXVpY2tJbnB1dFVJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRpbWVuc2lvbj86IGRvbS5JRGltZW5zaW9uO1xuXHRwcml2YXRlIHRpdGxlQmFyT2Zmc2V0PzogbnVtYmVyO1xuXHRwcml2YXRlIG92ZXJsYXlMYXlvdXRDb3JyZWN0aW9uOiBRdWlja0lucHV0T3ZlcmxheUxheW91dENvcnJlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZW5hYmxlZCA9IHRydWU7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRBY2NlcHRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDdXN0b21FbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja0lucHV0QnV0dG9uPigpKTtcblx0cHJpdmF0ZSBrZXlNb2RzOiBXcml0ZWFibGU8SUtleU1vZHM+ID0geyBjdHJsQ21kOiBmYWxzZSwgYWx0OiBmYWxzZSwgc2hpZnQ6IGZhbHNlIH07XG5cblx0cHJpdmF0ZSBjb250cm9sbGVyOiBJUXVpY2tJbnB1dCB8IG51bGwgPSBudWxsO1xuXHRnZXQgY3VycmVudFF1aWNrSW5wdXQoKSB7IHJldHVybiB0aGlzLmNvbnRyb2xsZXIgPz8gdW5kZWZpbmVkOyB9XG5cblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0Z2V0IGNvbnRhaW5lcigpIHsgcmV0dXJuIHRoaXMuX2NvbnRhaW5lcjsgfVxuXG5cdHByaXZhdGUgc3R5bGVzOiBJUXVpY2tJbnB1dFN0eWxlcztcblxuXHRwcml2YXRlIG9uU2hvd0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25TaG93ID0gdGhpcy5vblNob3dFbWl0dGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgb25IaWRlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkhpZGUgPSB0aGlzLm9uSGlkZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBwcmV2aW91c0ZvY3VzRWxlbWVudD86IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgdmlld1N0YXRlOiBRdWlja0lucHV0Vmlld1N0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRuZENvbnRyb2xsZXI6IFF1aWNrSW5wdXREcmFnQW5kRHJvcENvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2xvc2VBbmltYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsaWdubWVudCA9IG9ic2VydmFibGVWYWx1ZTxRdWlja0lucHV0QWxpZ25tZW50Pih0aGlzLCAndG9wJyk7XG5cdHJlYWRvbmx5IGFsaWdubWVudDogSU9ic2VydmFibGU8UXVpY2tJbnB1dEFsaWdubWVudD4gPSB0aGlzLl9hbGlnbm1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpblF1aWNrSW5wdXRDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0VHlwZUNvbnRleHQ6IElDb250ZXh0S2V5PFF1aWNrSW5wdXRUeXBlPjtcblx0cHJpdmF0ZSByZWFkb25seSBlbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG9wdGlvbnM6IElRdWlja0lucHV0T3B0aW9ucyxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaW5RdWlja0lucHV0Q29udGV4dCA9IEluUXVpY2tJbnB1dENvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnF1aWNrSW5wdXRUeXBlQ29udGV4dCA9IFF1aWNrSW5wdXRUeXBlQ29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZW5kT2ZRdWlja0lucHV0Qm94Q29udGV4dCA9IEVuZE9mUXVpY2tJbnB1dEJveENvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaWRQcmVmaXggPSBvcHRpb25zLmlkUHJlZml4O1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IG9wdGlvbnMuY29udGFpbmVyO1xuXHRcdHRoaXMuc3R5bGVzID0gb3B0aW9ucy5zdHlsZXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKGRvbS5vbkRpZFJlZ2lzdGVyV2luZG93LCAoeyB3aW5kb3csIGRpc3Bvc2FibGVzIH0pID0+IHRoaXMucmVnaXN0ZXJLZXlNb2RzTGlzdGVuZXJzKHdpbmRvdywgZGlzcG9zYWJsZXMpLCB7IHdpbmRvdzogbWFpbldpbmRvdywgZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlIH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20ub25XaWxsVW5yZWdpc3RlcldpbmRvdyh3aW5kb3cgPT4ge1xuXHRcdFx0aWYgKHRoaXMudWkgJiYgZG9tLmdldFdpbmRvdyh0aGlzLnVpLmNvbnRhaW5lcikgPT09IHdpbmRvdykge1xuXHRcdFx0XHQvLyBUaGUgd2luZG93IHRoaXMgcXVpY2sgaW5wdXQgaXMgY29udGFpbmVkIGluIGlzIGFib3V0IHRvXG5cdFx0XHRcdC8vIGNsb3NlLCBzbyB3ZSBoYXZlIHRvIG1ha2Ugc3VyZSB0byByZXBhcmVudCBpdCBiYWNrIHRvIGFuXG5cdFx0XHRcdC8vIGV4aXN0aW5nIHBhcmVudCB0byBub3QgbG9vc2UgZnVuY3Rpb25hbGl0eS5cblx0XHRcdFx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTU4NzApXG5cdFx0XHRcdHRoaXMucmVwYXJlbnRVSSh0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lcik7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyRGltZW5zaW9uLCB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lck9mZnNldC5xdWlja1BpY2tUb3ApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnZpZXdTdGF0ZSA9IHRoaXMubG9hZFZpZXdTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlcktleU1vZHNMaXN0ZW5lcnMod2luZG93OiBXaW5kb3csIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRjb25zdCBsaXN0ZW5lciA9IChlOiBLZXlib2FyZEV2ZW50IHwgTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5rZXlNb2RzLmN0cmxDbWQgPSBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5O1xuXHRcdFx0dGhpcy5rZXlNb2RzLmFsdCA9IGUuYWx0S2V5O1xuXHRcdFx0dGhpcy5rZXlNb2RzLnNoaWZ0ID0gZS5zaGlmdEtleTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBldmVudCBvZiBbZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZG9tLkV2ZW50VHlwZS5LRVlfVVAsIGRvbS5FdmVudFR5cGUuTU9VU0VfRE9XTl0pIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdywgZXZlbnQsIGxpc3RlbmVyLCB0cnVlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRVSShzaG93SW5BY3RpdmVDb250YWluZXI/OiBib29sZWFuKTogUXVpY2tJbnB1dFVJIHtcblx0XHRpZiAodGhpcy51aSkge1xuXHRcdFx0Ly8gSW4gb3JkZXIgdG8gc3VwcG9ydCBhdXggd2luZG93cywgcmUtcGFyZW50IHRoZSBjb250cm9sbGVyXG5cdFx0XHQvLyBpZiB0aGUgb3JpZ2luYWwgZXZlbnQgaXMgZnJvbSBhIGRpZmZlcmVudCBkb2N1bWVudFxuXHRcdFx0aWYgKHNob3dJbkFjdGl2ZUNvbnRhaW5lcikge1xuXHRcdFx0XHRpZiAoZG9tLmdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpICE9PSBkb20uZ2V0V2luZG93KHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXBhcmVudFVJKHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIpO1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJEaW1lbnNpb24sIHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJPZmZzZXQucXVpY2tQaWNrVG9wKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy51aTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LXdpZGdldC5zaG93LWZpbGUtaWNvbnMnKSk7XG5cdFx0Y29udGFpbmVyLnRhYkluZGV4ID0gLTE7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRjb25zdCBzdHlsZVNoZWV0ID0gZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVTdHlsZVNoZWV0KGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0aXRsZUJhciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtdGl0bGViYXInKSk7XG5cblx0XHRjb25zdCBsZWZ0QWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvb2xCYXIodGl0bGVCYXIsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLm9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGNyZWF0ZVRvZ2dsZUFjdGlvblZpZXdJdGVtUHJvdmlkZXIodGhpcy5zdHlsZXMudG9nZ2xlKSxcblx0XHRcdGljb246IHRydWUsXG5cdFx0XHRsYWJlbDogZmFsc2Vcblx0XHR9KSk7XG5cdFx0bGVmdEFjdGlvbkJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgncXVpY2staW5wdXQtbGVmdC1hY3Rpb24tYmFyJyk7XG5cblx0XHRjb25zdCB0aXRsZSA9IGRvbS5hcHBlbmQodGl0bGVCYXIsICQoJy5xdWljay1pbnB1dC10aXRsZScpKTtcblxuXHRcdGNvbnN0IHJpZ2h0QWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvb2xCYXIodGl0bGVCYXIsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLm9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGNyZWF0ZVRvZ2dsZUFjdGlvblZpZXdJdGVtUHJvdmlkZXIodGhpcy5zdHlsZXMudG9nZ2xlKSxcblx0XHRcdGljb246IHRydWUsXG5cdFx0XHRsYWJlbDogZmFsc2Vcblx0XHR9KSk7XG5cdFx0cmlnaHRBY3Rpb25CYXIuZ2V0RWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ3F1aWNrLWlucHV0LXJpZ2h0LWFjdGlvbi1iYXInKTtcblxuXHRcdGNvbnN0IGhlYWRlckNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtaGVhZGVyJykpO1xuXG5cdFx0Y29uc3QgY2hlY2tBbGwgPSB0aGlzLl9yZWdpc3RlcihuZXcgVHJpU3RhdGVDaGVja2JveChsb2NhbGl6ZSgncXVpY2tJbnB1dC5jaGVja0FsbCcsIFwiVG9nZ2xlIGFsbCBjaGVja2JveGVzXCIpLCBmYWxzZSwgeyAuLi5kZWZhdWx0Q2hlY2tib3hTdHlsZXMsIHNpemU6IDE1IH0pKTtcblx0XHRkb20uYXBwZW5kKGhlYWRlckNvbnRhaW5lciwgY2hlY2tBbGwuZG9tTm9kZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hlY2tBbGwub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2hlY2tlZCA9IGNoZWNrQWxsLmNoZWNrZWQ7XG5cdFx0XHRsaXN0LnNldEFsbFZpc2libGVDaGVja2VkKGNoZWNrZWQgPT09IHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNoZWNrQWxsLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKGUueCB8fCBlLnkpIHsgLy8gQXZvaWQgJ2NsaWNrJyB0cmlnZ2VyZWQgYnkgJ3NwYWNlJy4uLlxuXHRcdFx0XHRpbnB1dEJveC5zZXRGb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uMiA9IGRvbS5hcHBlbmQoaGVhZGVyQ29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSBkb20uYXBwZW5kKGhlYWRlckNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWFuZC1tZXNzYWdlJykpO1xuXHRcdGNvbnN0IGZpbHRlckNvbnRhaW5lciA9IGRvbS5hcHBlbmQoaW5wdXRDb250YWluZXIsICQoJy5xdWljay1pbnB1dC1maWx0ZXInKSk7XG5cblx0XHRjb25zdCBpbnB1dEJveCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBRdWlja0lucHV0Qm94KGZpbHRlckNvbnRhaW5lciwgdGhpcy5zdHlsZXMuaW5wdXRCb3gsIHRoaXMuc3R5bGVzLnRvZ2dsZSkpO1xuXHRcdGlucHV0Qm94LnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmliZWRieScsIGAke3RoaXMuaWRQcmVmaXh9bWVzc2FnZWApO1xuXG5cdFx0Y29uc3QgdmlzaWJsZUNvdW50Q29udGFpbmVyID0gZG9tLmFwcGVuZChmaWx0ZXJDb250YWluZXIsICQoJy5xdWljay1pbnB1dC12aXNpYmxlLWNvdW50JykpO1xuXHRcdHZpc2libGVDb3VudENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblx0XHR2aXNpYmxlQ291bnRDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWF0b21pYycsICd0cnVlJyk7XG5cdFx0Y29uc3QgdmlzaWJsZUNvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvdW50QmFkZ2UodmlzaWJsZUNvdW50Q29udGFpbmVyLCB7IGNvdW50Rm9ybWF0OiBsb2NhbGl6ZSh7IGtleTogJ3F1aWNrSW5wdXQudmlzaWJsZUNvdW50JywgY29tbWVudDogWydUaGlzIHRlbGxzIHRoZSB1c2VyIGhvdyBtYW55IGl0ZW1zIGFyZSBzaG93biBpbiBhIGxpc3Qgb2YgaXRlbXMgdG8gc2VsZWN0IGZyb20uIFRoZSBpdGVtcyBjYW4gYmUgYW55dGhpbmcuIEN1cnJlbnRseSBub3QgdmlzaWJsZSwgYnV0IHJlYWQgYnkgc2NyZWVuIHJlYWRlcnMuJ10gfSwgXCJ7MH0gUmVzdWx0c1wiKSB9LCB0aGlzLnN0eWxlcy5jb3VudEJhZGdlKSk7XG5cblx0XHRjb25zdCBjb3VudENvbnRhaW5lciA9IGRvbS5hcHBlbmQoZmlsdGVyQ29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtY291bnQnKSk7XG5cdFx0Y291bnRDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cdFx0Y29uc3QgY291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ291bnRCYWRnZShjb3VudENvbnRhaW5lciwgeyBjb3VudEZvcm1hdDogbG9jYWxpemUoeyBrZXk6ICdxdWlja0lucHV0LmNvdW50U2VsZWN0ZWQnLCBjb21tZW50OiBbJ1RoaXMgdGVsbHMgdGhlIHVzZXIgaG93IG1hbnkgaXRlbXMgYXJlIHNlbGVjdGVkIGluIGEgbGlzdCBvZiBpdGVtcyB0byBzZWxlY3QgZnJvbS4gVGhlIGl0ZW1zIGNhbiBiZSBhbnl0aGluZy4nXSB9LCBcInswfSBTZWxlY3RlZFwiKSB9LCB0aGlzLnN0eWxlcy5jb3VudEJhZGdlKSk7XG5cblx0XHRjb25zdCBpbmxpbmVBY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9vbEJhcihoZWFkZXJDb250YWluZXIsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLm9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGNyZWF0ZVRvZ2dsZUFjdGlvblZpZXdJdGVtUHJvdmlkZXIodGhpcy5zdHlsZXMudG9nZ2xlKSxcblx0XHRcdGljb246IHRydWUsXG5cdFx0XHRsYWJlbDogZmFsc2Vcblx0XHR9KSk7XG5cdFx0aW5saW5lQWN0aW9uQmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdxdWljay1pbnB1dC1pbmxpbmUtYWN0aW9uLWJhcicpO1xuXG5cdFx0Y29uc3Qgb2tDb250YWluZXIgPSBkb20uYXBwZW5kKGhlYWRlckNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWFjdGlvbicpKTtcblx0XHRjb25zdCBvayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24ob2tDb250YWluZXIsIHRoaXMuc3R5bGVzLmJ1dHRvbikpO1xuXHRcdG9rLmxhYmVsID0gbG9jYWxpemUoJ29rJywgXCJPS1wiKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihvay5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0dGhpcy5vbkRpZEFjY2VwdEVtaXR0ZXIuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGN1c3RvbUJ1dHRvbkNvbnRhaW5lciA9IGRvbS5hcHBlbmQoaGVhZGVyQ29udGFpbmVyLCAkKCcucXVpY2staW5wdXQtYWN0aW9uJykpO1xuXHRcdGNvbnN0IGN1c3RvbUJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oY3VzdG9tQnV0dG9uQ29udGFpbmVyLCB7IC4uLnRoaXMuc3R5bGVzLmJ1dHRvbiwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRjdXN0b21CdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY3VzdG9tJywgXCJDdXN0b21cIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3VzdG9tQnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB7XG5cdFx0XHR0aGlzLm9uRGlkQ3VzdG9tRW1pdHRlci5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IGRvbS5hcHBlbmQoaW5wdXRDb250YWluZXIsICQoYCMke3RoaXMuaWRQcmVmaXh9bWVzc2FnZS5xdWljay1pbnB1dC1tZXNzYWdlYCkpO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvZ3Jlc3NCYXIoY29udGFpbmVyLCB0aGlzLnN0eWxlcy5wcm9ncmVzc0JhcikpO1xuXHRcdHByb2dyZXNzQmFyLmdldENvbnRhaW5lcigpLmNsYXNzTGlzdC5hZGQoJ3F1aWNrLWlucHV0LXByb2dyZXNzJyk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWh0bWwtd2lkZ2V0JykpO1xuXHRcdHdpZGdldC50YWJJbmRleCA9IC0xO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24xID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5xdWljay1pbnB1dC1kZXNjcmlwdGlvbicpKTtcblxuXHRcdC8vIExpc3Rcblx0XHRjb25zdCBsaXN0SWQgPSB0aGlzLmlkUHJlZml4ICsgJ2xpc3QnO1xuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrSW5wdXRMaXN0LCBjb250YWluZXIsIHRoaXMub3B0aW9ucy5ob3ZlckRlbGVnYXRlLCB0aGlzLm9wdGlvbnMubGlua09wZW5lckRlbGVnYXRlLCBsaXN0SWQsIHRoaXMuc3R5bGVzKSk7XG5cdFx0aW5wdXRCb3guc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgbGlzdElkKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uRGlkQ2hhbmdlRm9jdXMoKCkgPT4ge1xuXHRcdFx0aWYgKGlucHV0Qm94Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlRGVzY2VuZGFudCA9IGxpc3QuZ2V0QWN0aXZlRGVzY2VuZGFudCgpO1xuXHRcdFx0XHRpZiAoYWN0aXZlRGVzY2VuZGFudCkge1xuXHRcdFx0XHRcdGlucHV0Qm94LnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50JywgYWN0aXZlRGVzY2VuZGFudCk7XG5cdFx0XHRcdFx0aW5wdXRCb3guc2V0TGlzdEZvY3VzTW9kZSh0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbnB1dEJveC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xuXHRcdFx0XHRcdGlucHV0Qm94LnNldExpc3RGb2N1c01vZGUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25DaGFuZ2VkQWxsVmlzaWJsZUNoZWNrZWQoY2hlY2tlZCA9PiB7XG5cdFx0XHQvLyBUT0RPOiBTdXBwb3J0IHRyaS1zdGF0ZSBjaGVja2JveCB3aGVuIHdlIHJlbW92ZSB0aGUgLmluZGVudCBwcm9wZXJ0eSB0aGF0IGlzIGZha2luZyB0cmVlIHN0cnVjdHVyZS5cblx0XHRcdGNoZWNrQWxsLmNoZWNrZWQgPSBjaGVja2VkO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uQ2hhbmdlZFZpc2libGVDb3VudChjID0+IHtcblx0XHRcdHZpc2libGVDb3VudC5zZXRDb3VudChjKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlzdC5vbkNoYW5nZWRDaGVja2VkQ291bnQoYyA9PiB7XG5cdFx0XHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0OiBXaXRob3V0IHRoaXMgc2V0VGltZW91dCwgdGhlIHNjcmVlbiByZWFkZXIgd2lsbCBub3QgcmVhZCBvdXRcblx0XHRcdC8vIHRoZSBmaW5hbCBjb3VudCBvZiBjaGVja2VkIGl0ZW1zIGNvcnJlY3RseS4gSW52ZXN0aWdhdGUgYSBiZXR0ZXIgd2F5XG5cdFx0XHQvLyB0byBkbyB0aGlzLiByZWYgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1ODYxN1xuXHRcdFx0c2V0VGltZW91dDAoKCkgPT4gY291bnQuc2V0Q291bnQoYykpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uTGVhdmUoKCkgPT4ge1xuXHRcdFx0Ly8gRGVmZXIgdG8gYXZvaWQgdGhlIGlucHV0IGZpZWxkIHJlYWN0aW5nIHRvIHRoZSB0cmlnZ2VyaW5nIGtleS5cblx0XHRcdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwMzY3NVxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5jb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlucHV0Qm94LnNldEZvY3VzKCk7XG5cdFx0XHRcdGlmICh0aGlzLmNvbnRyb2xsZXIgaW5zdGFuY2VvZiBRdWlja1BpY2sgJiYgdGhpcy5jb250cm9sbGVyLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0XHRsaXN0LmNsZWFyRm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJlZVxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UXVpY2tJbnB1dFRyZWVDb250cm9sbGVyLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0dGhpcy5vcHRpb25zLmhvdmVyRGVsZWdhdGUsXG5cdFx0XHR0aGlzLnN0eWxlc1xuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUudHJlZS5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHtcblx0XHRcdGlmIChpbnB1dEJveC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZURlc2NlbmRhbnQgPSB0cmVlLmdldEFjdGl2ZURlc2NlbmRhbnQoKTtcblx0XHRcdFx0aWYgKGFjdGl2ZURlc2NlbmRhbnQpIHtcblx0XHRcdFx0XHRpbnB1dEJveC5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIGFjdGl2ZURlc2NlbmRhbnQpO1xuXHRcdFx0XHRcdGlucHV0Qm94LnNldExpc3RGb2N1c01vZGUodHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5wdXRCb3gucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnKTtcblx0XHRcdFx0XHRpbnB1dEJveC5zZXRMaXN0Rm9jdXNNb2RlKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0cmVlLm9uTGVhdmUoKCkgPT4ge1xuXHRcdFx0Ly8gRGVmZXIgdG8gYXZvaWQgdGhlIGlucHV0IGZpZWxkIHJlYWN0aW5nIHRvIHRoZSB0cmlnZ2VyaW5nIGtleS5cblx0XHRcdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwMzY3NVxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5jb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlucHV0Qm94LnNldEZvY3VzKCk7XG5cdFx0XHRcdHRyZWUudHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHR9LCAwKTtcblx0XHR9KSk7XG5cdFx0Ly8gV2lyZSB1cCB0cmVlJ3MgYWNjZXB0IGV2ZW50IHRvIHRoZSBVSSdzIGFjY2VwdCBlbWl0dGVyIGZvciBub24tcGlja2FibGUgaXRlbXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0cmVlLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodHJlZS50cmVlLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoKSA9PiB0aGlzLnVwZGF0ZUxheW91dCgpKSk7XG5cblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSBkb20udHJhY2tGb2N1cyhjb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsIGRvbS5FdmVudFR5cGUuRk9DVVMsIGUgPT4ge1xuXHRcdFx0Y29uc3QgdWkgPSB0aGlzLmdldFVJKCk7XG5cdFx0XHRpZiAoZG9tLmlzQW5jZXN0b3IoZS5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50LCB1aS5pbnB1dENvbnRhaW5lcikpIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSB1aS5pbnB1dEJveC5pc1NlbGVjdGlvbkF0RW5kKCk7XG5cdFx0XHRcdGlmICh0aGlzLmVuZE9mUXVpY2tJbnB1dEJveENvbnRleHQuZ2V0KCkgIT09IHZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5lbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0LnNldCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIElnbm9yZSBmb2N1cyBldmVudHMgd2l0aGluIGNvbnRhaW5lclxuXHRcdFx0aWYgKGRvbS5pc0FuY2VzdG9yKGUucmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCwgdWkuY29udGFpbmVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmluUXVpY2tJbnB1dENvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5wcmV2aW91c0ZvY3VzRWxlbWVudCA9IGRvbS5pc0hUTUxFbGVtZW50KGUucmVsYXRlZFRhcmdldCkgPyBlLnJlbGF0ZWRUYXJnZXQgOiB1bmRlZmluZWQ7XG5cdFx0fSwgdHJ1ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmdldFVJKCkuaWdub3JlRm9jdXNPdXQgJiYgIXRoaXMub3B0aW9ucy5pZ25vcmVGb2N1c091dCgpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZShRdWlja0lucHV0SGlkZVJlYXNvbi5CbHVyKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuaW5RdWlja0lucHV0Q29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5lbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLnByZXZpb3VzRm9jdXNFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dEJveC5vbktleURvd24oZSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuZ2V0VUkoKS5pbnB1dEJveC5pc1NlbGVjdGlvbkF0RW5kKCk7XG5cdFx0XHRpZiAodGhpcy5lbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0LmdldCgpICE9PSB2YWx1ZSkge1xuXHRcdFx0XHR0aGlzLmVuZE9mUXVpY2tJbnB1dEJveENvbnRleHQuc2V0KHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdC8vIEFsbG93IHNjcmVlbiByZWFkZXJzIHRvIHJlYWQgd2hhdCdzIGluIHRoZSBpbnB1dFxuXHRcdFx0Ly8gTm90ZTogdGhpcyB3b3JrcyBmb3IgYXJyb3cga2V5cyBhbmQgc2VsZWN0aW9uIGNoYW5nZXMsXG5cdFx0XHQvLyBidXQgbm90IGZvciBkZWxldGlvbnMgc2luY2UgdGhhdCBvZnRlbiB0cmlnZ2VycyBhXG5cdFx0XHQvLyBjaGFuZ2UgaW4gdGhlIGxpc3QuXG5cdFx0XHQvLyBEb24ndCByZW1vdmUgYXJpYS1hY3RpdmVkZXNjZW5kYW50IHdoZW4gb25seSBtb2RpZmllciBrZXlzIGFyZSBwcmVzc2VkXG5cdFx0XHQvLyB0byBwcmV2ZW50IHNjcmVlbiByZWFkZXIgcmUtYW5ub3VuY2VtZW50cyB3aGVuIHVzZXJzIHByZXNzIEN0cmwgdG8gc2lsZW5jZSBzcGVlY2guXG5cdFx0XHQvLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzEwMzJcblx0XHRcdGlmICghaXNNb2RpZmllcktleShlLmtleUNvZGUpKSB7XG5cdFx0XHRcdGlucHV0Qm94LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XG5cdFx0XHRcdC8vIFJlc2V0IEFSSUEgcG9wdXAgbW9kZSB0byBhbGxvdyBub3JtYWwgdGV4dCBlZGl0aW5nIHdpdGggYXJyb3cga2V5c1xuXHRcdFx0XHRpbnB1dEJveC5zZXRMaXN0Rm9jdXNNb2RlKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsIGRvbS5FdmVudFR5cGUuRk9DVVMsIChlOiBGb2N1c0V2ZW50KSA9PiB7XG5cdFx0XHRpbnB1dEJveC5zZXRGb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERyYWcgYW5kIERyb3Agc3VwcG9ydFxuXHRcdHRoaXMuZG5kQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRRdWlja0lucHV0RHJhZ0FuZERyb3BDb250cm9sbGVyLFxuXHRcdFx0dGhpcy5fY29udGFpbmVyLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0W1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bm9kZTogdGl0bGVCYXIsXG5cdFx0XHRcdFx0aW5jbHVkZUNoaWxkcmVuOiB0cnVlLFxuXHRcdFx0XHRcdGV4Y2x1ZGVOb2RlczogW2xlZnRBY3Rpb25CYXIuZ2V0RWxlbWVudCgpLCByaWdodEFjdGlvbkJhci5nZXRFbGVtZW50KCldXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRub2RlOiBoZWFkZXJDb250YWluZXIsXG5cdFx0XHRcdFx0aW5jbHVkZUNoaWxkcmVuOiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0dGhpcy52aWV3U3RhdGVcblx0XHQpKTtcblxuXHRcdC8vIERuRCB1cGRhdGUgbGF5b3V0XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZG5kVmlld1N0YXRlID0gdGhpcy5kbmRDb250cm9sbGVyPy5kbmRWaWV3U3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFkbmRWaWV3U3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZG5kVmlld1N0YXRlLnRvcCAhPT0gdW5kZWZpbmVkICYmIGRuZFZpZXdTdGF0ZS5sZWZ0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy52aWV3U3RhdGUgPSB7XG5cdFx0XHRcdFx0Li4udGhpcy52aWV3U3RhdGUsXG5cdFx0XHRcdFx0dG9wOiBkbmRWaWV3U3RhdGUudG9wLFxuXHRcdFx0XHRcdGxlZnQ6IGRuZFZpZXdTdGF0ZS5sZWZ0XG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBSZXNldCBwb3NpdGlvbi9zaXplXG5cdFx0XHRcdHRoaXMudmlld1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZUxheW91dCgpO1xuXG5cdFx0XHQvLyBTYXZlIHBvc2l0aW9uXG5cdFx0XHRpZiAoZG5kVmlld1N0YXRlLmRvbmUpIHtcblx0XHRcdFx0dGhpcy5zYXZlVmlld1N0YXRlKHRoaXMudmlld1N0YXRlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBNaXJyb3IgRG5EIGFsaWdubWVudCBpbnRvIHRoZSBzdGFibGUgb2JzZXJ2YWJsZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX2FsaWdubWVudC5zZXQodGhpcy5kbmRDb250cm9sbGVyIS5hbGlnbm1lbnQucmVhZChyZWFkZXIpLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudWkgPSB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRzdHlsZVNoZWV0LFxuXHRcdFx0bGVmdEFjdGlvbkJhcixcblx0XHRcdHRpdGxlQmFyLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRkZXNjcmlwdGlvbjEsXG5cdFx0XHRkZXNjcmlwdGlvbjIsXG5cdFx0XHR3aWRnZXQsXG5cdFx0XHRyaWdodEFjdGlvbkJhcixcblx0XHRcdGlubGluZUFjdGlvbkJhcixcblx0XHRcdGNoZWNrQWxsLFxuXHRcdFx0aW5wdXRDb250YWluZXIsXG5cdFx0XHRmaWx0ZXJDb250YWluZXIsXG5cdFx0XHRpbnB1dEJveCxcblx0XHRcdHZpc2libGVDb3VudENvbnRhaW5lcixcblx0XHRcdHZpc2libGVDb3VudCxcblx0XHRcdGNvdW50Q29udGFpbmVyLFxuXHRcdFx0Y291bnQsXG5cdFx0XHRva0NvbnRhaW5lcixcblx0XHRcdG9rLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGN1c3RvbUJ1dHRvbkNvbnRhaW5lcixcblx0XHRcdGN1c3RvbUJ1dHRvbixcblx0XHRcdGxpc3QsXG5cdFx0XHR0cmVlLFxuXHRcdFx0cHJvZ3Jlc3NCYXIsXG5cdFx0XHRvbkRpZEFjY2VwdDogdGhpcy5vbkRpZEFjY2VwdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZEN1c3RvbTogdGhpcy5vbkRpZEN1c3RvbUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZFRyaWdnZXJCdXR0b246IHRoaXMub25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5ldmVudCxcblx0XHRcdGlnbm9yZUZvY3VzT3V0OiBmYWxzZSxcblx0XHRcdGtleU1vZHM6IHRoaXMua2V5TW9kcyxcblx0XHRcdHNob3c6IGNvbnRyb2xsZXIgPT4gdGhpcy5zaG93KGNvbnRyb2xsZXIpLFxuXHRcdFx0aGlkZTogKCkgPT4gdGhpcy5oaWRlKCksXG5cdFx0XHRzZXRWaXNpYmlsaXRpZXM6IHZpc2liaWxpdGllcyA9PiB0aGlzLnNldFZpc2liaWxpdGllcyh2aXNpYmlsaXRpZXMpLFxuXHRcdFx0c2V0RW5hYmxlZDogZW5hYmxlZCA9PiB0aGlzLnNldEVuYWJsZWQoZW5hYmxlZCksXG5cdFx0XHRzZXRDb250ZXh0S2V5OiBjb250ZXh0S2V5ID0+IHRoaXMub3B0aW9ucy5zZXRDb250ZXh0S2V5KGNvbnRleHRLZXkpLFxuXHRcdFx0bGlua09wZW5lckRlbGVnYXRlOiBjb250ZW50ID0+IHRoaXMub3B0aW9ucy5saW5rT3BlbmVyRGVsZWdhdGUoY29udGVudClcblx0XHR9O1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdFx0cmV0dXJuIHRoaXMudWk7XG5cdH1cblxuXHRwcml2YXRlIHJlcGFyZW50VUkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVpKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0XHRkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgdGhpcy51aS5jb250YWluZXIpO1xuXHRcdFx0dGhpcy5kbmRDb250cm9sbGVyPy5yZXBhcmVudFVJKHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG5cblx0cGljazxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0sIE8gZXh0ZW5kcyBJUGlja09wdGlvbnM8VD4+KHBpY2tzOiBQcm9taXNlPFF1aWNrUGlja0lucHV0PFQ+W10+IHwgUXVpY2tQaWNrSW5wdXQ8VD5bXSwgb3B0aW9uczogSVBpY2tPcHRpb25zPFQ+ID0ge30sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPChPIGV4dGVuZHMgeyBjYW5QaWNrTWFueTogdHJ1ZSB9ID8gVFtdIDogVCkgfCB1bmRlZmluZWQ+IHtcblx0XHR0eXBlIFIgPSAoTyBleHRlbmRzIHsgY2FuUGlja01hbnk6IHRydWUgfSA/IFRbXSA6IFQpIHwgdW5kZWZpbmVkO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxSPigoZG9SZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCByZXNvbHZlID0gKHJlc3VsdDogUikgPT4ge1xuXHRcdFx0XHRyZXNvbHZlID0gZG9SZXNvbHZlO1xuXHRcdFx0XHRvcHRpb25zLm9uS2V5TW9kcz8uKGlucHV0LmtleU1vZHMpO1xuXHRcdFx0XHRkb1Jlc29sdmUocmVzdWx0KTtcblx0XHRcdH07XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuY3JlYXRlUXVpY2tQaWNrPFQ+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRcdGxldCBhY3RpdmVJdGVtOiBUIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBbXG5cdFx0XHRcdGlucHV0LFxuXHRcdFx0XHRpbnB1dC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlucHV0LmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoPFI+aW5wdXQuc2VsZWN0ZWRJdGVtcy5zbGljZSgpKTtcblx0XHRcdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gaW5wdXQuYWN0aXZlSXRlbXNbMF07XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoPFI+cmVzdWx0KTtcblx0XHRcdFx0XHRcdFx0aW5wdXQuaGlkZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHRcdGlucHV0Lm9uRGlkQ2hhbmdlQWN0aXZlKGl0ZW1zID0+IHtcblx0XHRcdFx0XHRjb25zdCBmb2N1c2VkID0gaXRlbXNbMF07XG5cdFx0XHRcdFx0aWYgKGZvY3VzZWQgJiYgb3B0aW9ucy5vbkRpZEZvY3VzKSB7XG5cdFx0XHRcdFx0XHRvcHRpb25zLm9uRGlkRm9jdXMoZm9jdXNlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0aW5wdXQub25EaWRDaGFuZ2VTZWxlY3Rpb24oaXRlbXMgPT4ge1xuXHRcdFx0XHRcdGlmICghaW5wdXQuY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gaXRlbXNbMF07XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoPFI+cmVzdWx0KTtcblx0XHRcdFx0XHRcdFx0aW5wdXQuaGlkZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHRcdGlucHV0Lm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oZXZlbnQgPT4gb3B0aW9ucy5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uICYmIG9wdGlvbnMub25EaWRUcmlnZ2VySXRlbUJ1dHRvbih7XG5cdFx0XHRcdFx0Li4uZXZlbnQsXG5cdFx0XHRcdFx0cmVtb3ZlSXRlbTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBpbnB1dC5pdGVtcy5pbmRleE9mKGV2ZW50Lml0ZW0pO1xuXHRcdFx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IGlucHV0Lml0ZW1zLnNsaWNlKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlbW92ZWQgPSBpdGVtcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVJdGVtcyA9IGlucHV0LmFjdGl2ZUl0ZW1zLmZpbHRlcihhY3RpdmVJdGVtID0+IGFjdGl2ZUl0ZW0gIT09IHJlbW92ZWRbMF0pO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBrZWVwU2Nyb2xsUG9zaXRpb25CZWZvcmUgPSBpbnB1dC5rZWVwU2Nyb2xsUG9zaXRpb247XG5cdFx0XHRcdFx0XHRcdGlucHV0LmtlZXBTY3JvbGxQb3NpdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGlucHV0Lml0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdFx0XHRcdGlmIChhY3RpdmVJdGVtcykge1xuXHRcdFx0XHRcdFx0XHRcdGlucHV0LmFjdGl2ZUl0ZW1zID0gYWN0aXZlSXRlbXM7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aW5wdXQua2VlcFNjcm9sbFBvc2l0aW9uID0ga2VlcFNjcm9sbFBvc2l0aW9uQmVmb3JlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRpbnB1dC5vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24oZXZlbnQgPT4gb3B0aW9ucy5vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24/LihldmVudCkpLFxuXHRcdFx0XHRpbnB1dC5vbkRpZENoYW5nZVZhbHVlKHZhbHVlID0+IHtcblx0XHRcdFx0XHRpZiAoYWN0aXZlSXRlbSAmJiAhdmFsdWUgJiYgKGlucHV0LmFjdGl2ZUl0ZW1zLmxlbmd0aCAhPT0gMSB8fCBpbnB1dC5hY3RpdmVJdGVtc1swXSAhPT0gYWN0aXZlSXRlbSkpIHtcblx0XHRcdFx0XHRcdGlucHV0LmFjdGl2ZUl0ZW1zID0gW2FjdGl2ZUl0ZW1dO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHRcdHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRpbnB1dC5oaWRlKCk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRpbnB1dC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2UoZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSksXG5cdFx0XHRdO1xuXHRcdFx0aW5wdXQudGl0bGUgPSBvcHRpb25zLnRpdGxlO1xuXHRcdFx0aWYgKG9wdGlvbnMudmFsdWUpIHtcblx0XHRcdFx0aW5wdXQudmFsdWUgPSBvcHRpb25zLnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0aW5wdXQuY2FuU2VsZWN0TWFueSA9ICEhb3B0aW9ucy5jYW5QaWNrTWFueTtcblx0XHRcdGlucHV0LnBsYWNlaG9sZGVyID0gb3B0aW9ucy5wbGFjZUhvbGRlcjtcblx0XHRcdGlucHV0LnByb21wdCA9IG9wdGlvbnMucHJvbXB0O1xuXHRcdFx0aW5wdXQuaWdub3JlRm9jdXNPdXQgPSAhIW9wdGlvbnMuaWdub3JlRm9jdXNMb3N0O1xuXHRcdFx0aW5wdXQubWF0Y2hPbkRlc2NyaXB0aW9uID0gISFvcHRpb25zLm1hdGNoT25EZXNjcmlwdGlvbjtcblx0XHRcdGlucHV0Lm1hdGNoT25EZXRhaWwgPSAhIW9wdGlvbnMubWF0Y2hPbkRldGFpbDtcblx0XHRcdGlmIChvcHRpb25zLnNvcnRCeUxhYmVsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aW5wdXQuc29ydEJ5TGFiZWwgPSBvcHRpb25zLnNvcnRCeUxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0aW5wdXQubWF0Y2hPbkxhYmVsID0gKG9wdGlvbnMubWF0Y2hPbkxhYmVsID09PSB1bmRlZmluZWQpIHx8IG9wdGlvbnMubWF0Y2hPbkxhYmVsOyAvLyBkZWZhdWx0IHRvIHRydWVcblx0XHRcdGlucHV0LnF1aWNrTmF2aWdhdGUgPSBvcHRpb25zLnF1aWNrTmF2aWdhdGU7XG5cdFx0XHRpbnB1dC5oaWRlSW5wdXQgPSAhIW9wdGlvbnMuaGlkZUlucHV0O1xuXHRcdFx0aW5wdXQuY29udGV4dEtleSA9IG9wdGlvbnMuY29udGV4dEtleTtcblx0XHRcdGlucHV0LmFuY2hvciA9IG9wdGlvbnMuYW5jaG9yO1xuXHRcdFx0aW5wdXQuYW5jaG9yUG9zaXRpb24gPSBvcHRpb25zLmFuY2hvclBvc2l0aW9uO1xuXHRcdFx0aW5wdXQuYnVzeSA9IHRydWU7XG5cdFx0XHRQcm9taXNlLmFsbChbcGlja3MsIG9wdGlvbnMuYWN0aXZlSXRlbV0pXG5cdFx0XHRcdC50aGVuKChbaXRlbXMsIF9hY3RpdmVJdGVtXSkgPT4ge1xuXHRcdFx0XHRcdGFjdGl2ZUl0ZW0gPSBfYWN0aXZlSXRlbTtcblx0XHRcdFx0XHRpbnB1dC5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdFx0aW5wdXQuaXRlbXMgPSBpdGVtcztcblx0XHRcdFx0XHRpZiAoaW5wdXQuY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0XHRcdFx0aW5wdXQuc2VsZWN0ZWRJdGVtcyA9IGl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaXRlbS5waWNrZWQpIGFzIFRbXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGFjdGl2ZUl0ZW0pIHtcblx0XHRcdFx0XHRcdGlucHV0LmFjdGl2ZUl0ZW1zID0gW2FjdGl2ZUl0ZW1dO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRpbnB1dC5zaG93KCk7XG5cdFx0XHRQcm9taXNlLnJlc29sdmUocGlja3MpLnRoZW4odW5kZWZpbmVkLCBlcnIgPT4ge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdFx0aW5wdXQuaGlkZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFZhbGlkYXRpb25PbklucHV0KGlucHV0OiBJSW5wdXRCb3gsIHZhbGlkYXRpb25SZXN1bHQ6IHN0cmluZyB8IHtcblx0XHRjb250ZW50OiBzdHJpbmc7XG5cdFx0c2V2ZXJpdHk6IFNldmVyaXR5O1xuXHR9IHwgbnVsbCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh2YWxpZGF0aW9uUmVzdWx0ICYmIGlzU3RyaW5nKHZhbGlkYXRpb25SZXN1bHQpKSB7XG5cdFx0XHRpbnB1dC5zZXZlcml0eSA9IFNldmVyaXR5LkVycm9yO1xuXHRcdFx0aW5wdXQudmFsaWRhdGlvbk1lc3NhZ2UgPSB2YWxpZGF0aW9uUmVzdWx0O1xuXHRcdH0gZWxzZSBpZiAodmFsaWRhdGlvblJlc3VsdCAmJiAhaXNTdHJpbmcodmFsaWRhdGlvblJlc3VsdCkpIHtcblx0XHRcdGlucHV0LnNldmVyaXR5ID0gdmFsaWRhdGlvblJlc3VsdC5zZXZlcml0eTtcblx0XHRcdGlucHV0LnZhbGlkYXRpb25NZXNzYWdlID0gdmFsaWRhdGlvblJlc3VsdC5jb250ZW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnB1dC5zZXZlcml0eSA9IFNldmVyaXR5Lklnbm9yZTtcblx0XHRcdGlucHV0LnZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGlucHV0KG9wdGlvbnM6IElJbnB1dE9wdGlvbnMgPSB7fSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5jcmVhdGVJbnB1dEJveCgpO1xuXHRcdFx0Y29uc3QgdmFsaWRhdGVJbnB1dCA9IG9wdGlvbnMudmFsaWRhdGVJbnB1dCB8fCAoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCkpO1xuXHRcdFx0Y29uc3Qgb25EaWRWYWx1ZUNoYW5nZSA9IEV2ZW50LmRlYm91bmNlKGlucHV0Lm9uRGlkQ2hhbmdlVmFsdWUsIChsYXN0LCBjdXIpID0+IGN1ciwgMTAwKTtcblx0XHRcdGxldCB2YWxpZGF0aW9uVmFsdWUgPSBvcHRpb25zLnZhbHVlIHx8ICcnO1xuXHRcdFx0bGV0IHZhbGlkYXRpb24gPSBQcm9taXNlLnJlc29sdmUodmFsaWRhdGVJbnB1dCh2YWxpZGF0aW9uVmFsdWUpKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gW1xuXHRcdFx0XHRpbnB1dCxcblx0XHRcdFx0b25EaWRWYWx1ZUNoYW5nZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlICE9PSB2YWxpZGF0aW9uVmFsdWUpIHtcblx0XHRcdFx0XHRcdHZhbGlkYXRpb24gPSBQcm9taXNlLnJlc29sdmUodmFsaWRhdGVJbnB1dCh2YWx1ZSkpO1xuXHRcdFx0XHRcdFx0dmFsaWRhdGlvblZhbHVlID0gdmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHZhbGlkYXRpb24udGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHZhbHVlID09PSB2YWxpZGF0aW9uVmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zZXRWYWxpZGF0aW9uT25JbnB1dChpbnB1dCwgcmVzdWx0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdGlucHV0Lm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGlucHV0LnZhbHVlO1xuXHRcdFx0XHRcdGlmICh2YWx1ZSAhPT0gdmFsaWRhdGlvblZhbHVlKSB7XG5cdFx0XHRcdFx0XHR2YWxpZGF0aW9uID0gUHJvbWlzZS5yZXNvbHZlKHZhbGlkYXRlSW5wdXQodmFsdWUpKTtcblx0XHRcdFx0XHRcdHZhbGlkYXRpb25WYWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR2YWxpZGF0aW9uLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRcdGlmICghcmVzdWx0IHx8ICghaXNTdHJpbmcocmVzdWx0KSAmJiByZXN1bHQuc2V2ZXJpdHkgIT09IFNldmVyaXR5LkVycm9yKSkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0aW5wdXQuaGlkZSgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gdmFsaWRhdGlvblZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0VmFsaWRhdGlvbk9uSW5wdXQoaW5wdXQsIHJlc3VsdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0aW5wdXQuaGlkZSgpO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0aW5wdXQub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NlKGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XTtcblxuXHRcdFx0aW5wdXQudGl0bGUgPSBvcHRpb25zLnRpdGxlO1xuXHRcdFx0aW5wdXQudmFsdWUgPSBvcHRpb25zLnZhbHVlIHx8ICcnO1xuXHRcdFx0aW5wdXQudmFsdWVTZWxlY3Rpb24gPSBvcHRpb25zLnZhbHVlU2VsZWN0aW9uO1xuXHRcdFx0aW5wdXQucHJvbXB0ID0gb3B0aW9ucy5wcm9tcHQ7XG5cdFx0XHRpbnB1dC5wbGFjZWhvbGRlciA9IG9wdGlvbnMucGxhY2VIb2xkZXI7XG5cdFx0XHRpbnB1dC5wYXNzd29yZCA9ICEhb3B0aW9ucy5wYXNzd29yZDtcblx0XHRcdGlucHV0Lmlnbm9yZUZvY3VzT3V0ID0gISFvcHRpb25zLmlnbm9yZUZvY3VzTG9zdDtcblx0XHRcdGlucHV0LnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdGJhY2tCdXR0b24gPSBiYWNrQnV0dG9uO1xuXG5cdGNyZWF0ZVF1aWNrUGljazxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+KG9wdGlvbnM6IHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTogSVF1aWNrUGljazxULCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT47XG5cdGNyZWF0ZVF1aWNrUGljazxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+KG9wdGlvbnM/OiB7IHVzZVNlcGFyYXRvcnM6IGJvb2xlYW4gfSk6IElRdWlja1BpY2s8VCwgeyB1c2VTZXBhcmF0b3JzOiBmYWxzZSB9Pjtcblx0Y3JlYXRlUXVpY2tQaWNrPFQgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbT4ob3B0aW9uczogeyB1c2VTZXBhcmF0b3JzOiBib29sZWFuIH0gPSB7IHVzZVNlcGFyYXRvcnM6IGZhbHNlIH0pOiBJUXVpY2tQaWNrPFQsIHsgdXNlU2VwYXJhdG9yczogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3QgdWkgPSB0aGlzLmdldFVJKHRydWUpO1xuXHRcdHJldHVybiBuZXcgUXVpY2tQaWNrPFQsIHR5cGVvZiBvcHRpb25zPih1aSk7XG5cdH1cblxuXHRjcmVhdGVJbnB1dEJveCgpOiBJSW5wdXRCb3gge1xuXHRcdGNvbnN0IHVpID0gdGhpcy5nZXRVSSh0cnVlKTtcblx0XHRyZXR1cm4gbmV3IElucHV0Qm94KHVpKTtcblx0fVxuXG5cdHNldEFsaWdubWVudChhbGlnbm1lbnQ6ICd0b3AnIHwgJ2NlbnRlcicgfCB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRyb2xsZXI/LmFuY2hvcikge1xuXHRcdFx0cmV0dXJuOyAvLyBhbmNob3JlZCBpbnB1dHMgb3duIHRoZWlyIG93biBwb3NpdGlvbmluZ1xuXHRcdH1cblx0XHR0aGlzLmRuZENvbnRyb2xsZXI/LnNldEFsaWdubWVudChhbGlnbm1lbnQpO1xuXHR9XG5cblx0Y3JlYXRlUXVpY2tXaWRnZXQoKTogSVF1aWNrV2lkZ2V0IHtcblx0XHRjb25zdCB1aSA9IHRoaXMuZ2V0VUkodHJ1ZSk7XG5cdFx0cmV0dXJuIG5ldyBRdWlja1dpZGdldCh1aSk7XG5cdH1cblxuXHRjcmVhdGVRdWlja1RyZWU8VCBleHRlbmRzIElRdWlja1RyZWVJdGVtPigpOiBJUXVpY2tUcmVlPFQ+IHtcblx0XHRjb25zdCB1aSA9IHRoaXMuZ2V0VUkodHJ1ZSk7XG5cdFx0cmV0dXJuIG5ldyBRdWlja1RyZWU8VD4odWkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93KGNvbnRyb2xsZXI6IElRdWlja0lucHV0KSB7XG5cdFx0dGhpcy5jb21wbGV0ZUNsb3NlQW5pbWF0aW9uKCk7XG5cdFx0Y29uc3QgdWkgPSB0aGlzLmdldFVJKHRydWUpO1xuXHRcdGNvbnN0IG9sZENvbnRyb2xsZXIgPSB0aGlzLmNvbnRyb2xsZXI7XG5cdFx0dGhpcy5jb250cm9sbGVyID0gY29udHJvbGxlcjtcblx0XHRvbGRDb250cm9sbGVyPy5kaWRIaWRlKCk7XG5cblx0XHQvLyBBbmNob3JlZCBjb250cm9sbGVycyBhbHdheXMgcmVuZGVyIGluIHRoZSB3aW5kb3cgdGhhdCBvd25zIHRoZWlyIGFuY2hvciBlbGVtZW50LlxuXHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChjb250cm9sbGVyLmFuY2hvcikpIHtcblx0XHRcdGNvbnN0IGFuY2hvcldpbmRvdyA9IGRvbS5nZXRXaW5kb3coY29udHJvbGxlci5hbmNob3IpO1xuXHRcdFx0aWYgKGRvbS5nZXRXaW5kb3codGhpcy5fY29udGFpbmVyKSAhPT0gYW5jaG9yV2luZG93KSB7XG5cdFx0XHRcdHRoaXMucmVwYXJlbnRVSSh0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGFuY2hvcldpbmRvdykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuc2V0RW5hYmxlZCh0cnVlKTtcblx0XHR1aS5sZWZ0QWN0aW9uQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdHVpLnRpdGxlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dWkuZGVzY3JpcHRpb24xLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dWkuZGVzY3JpcHRpb24yLnRleHRDb250ZW50ID0gJyc7XG5cdFx0ZG9tLnJlc2V0KHVpLndpZGdldCk7XG5cdFx0dWkucmlnaHRBY3Rpb25CYXIuc2V0QWN0aW9ucyhbXSk7XG5cdFx0dWkuaW5saW5lQWN0aW9uQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdHVpLmNoZWNrQWxsLmNoZWNrZWQgPSBmYWxzZTtcblx0XHQvLyB1aS5pbnB1dEJveC52YWx1ZSA9ICcnOyBBdm9pZCB0cmlnZ2VyaW5nIGFuIGV2ZW50LlxuXHRcdHVpLmlucHV0Qm94LnBsYWNlaG9sZGVyID0gJyc7XG5cdFx0dWkuaW5wdXRCb3gucGFzc3dvcmQgPSBmYWxzZTtcblx0XHR1aS5pbnB1dEJveC5zaG93RGVjb3JhdGlvbihTZXZlcml0eS5JZ25vcmUpO1xuXHRcdHVpLnZpc2libGVDb3VudC5zZXRDb3VudCgwKTtcblx0XHR1aS5jb3VudC5zZXRDb3VudCgwKTtcblx0XHR1aS5jb3VudENvbnRhaW5lci5zdHlsZS5yaWdodCA9ICc0cHgnO1xuXHRcdGRvbS5yZXNldCh1aS5tZXNzYWdlKTtcblx0XHR1aS5wcm9ncmVzc0Jhci5zdG9wKCk7XG5cdFx0dWkucHJvZ3Jlc3NCYXIuZ2V0Q29udGFpbmVyKCkuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dWkubGlzdC5zZXRFbGVtZW50cyhbXSk7XG5cdFx0dWkubGlzdC5tYXRjaE9uRGVzY3JpcHRpb24gPSBmYWxzZTtcblx0XHR1aS5saXN0Lm1hdGNoT25EZXRhaWwgPSBmYWxzZTtcblx0XHR1aS5saXN0Lm1hdGNoT25MYWJlbCA9IHRydWU7XG5cdFx0dWkubGlzdC5zb3J0QnlMYWJlbCA9IHRydWU7XG5cdFx0dWkudHJlZS51cGRhdGVGaWx0ZXJPcHRpb25zKHtcblx0XHRcdG1hdGNoT25EZXNjcmlwdGlvbjogZmFsc2UsXG5cdFx0XHRtYXRjaE9uTGFiZWw6IHRydWVcblx0XHR9KTtcblx0XHR1aS50cmVlLnNvcnRCeUxhYmVsID0gdHJ1ZTtcblx0XHR1aS5pZ25vcmVGb2N1c091dCA9IGZhbHNlO1xuXHRcdHVpLmlucHV0Qm94LnRvZ2dsZXMgPSB1bmRlZmluZWQ7XG5cdFx0dWkuaW5wdXRCb3guYWN0aW9ucyA9IHVuZGVmaW5lZDtcblx0XHR1aS5pbnB1dEJveC5zZXRIZWlnaHQodW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGJhY2tLZXliaW5kaW5nTGFiZWwgPSB0aGlzLm9wdGlvbnMuYmFja0tleWJpbmRpbmdMYWJlbCgpO1xuXHRcdGJhY2tCdXR0b24udG9vbHRpcCA9IGJhY2tLZXliaW5kaW5nTGFiZWwgPyBsb2NhbGl6ZSgncXVpY2tJbnB1dC5iYWNrV2l0aEtleWJpbmRpbmcnLCBcIkJhY2sgKHswfSlcIiwgYmFja0tleWJpbmRpbmdMYWJlbCkgOiBsb2NhbGl6ZSgncXVpY2tJbnB1dC5iYWNrJywgXCJCYWNrXCIpO1xuXG5cdFx0dGhpcy5vdmVybGF5TGF5b3V0Q29ycmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR1aS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShRVUlDS19JTlBVVF9PVkVSTEFZX0NMQVNTLCBjb250cm9sbGVyLmFuY2hvclBvc2l0aW9uID09PSAnb3ZlcmxheScpO1xuXHRcdHVpLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy51cGRhdGVMYXlvdXQoKTtcblx0XHR0aGlzLmRuZENvbnRyb2xsZXI/LnNldEVuYWJsZWQoIWNvbnRyb2xsZXIuYW5jaG9yKTtcblx0XHR0aGlzLmRuZENvbnRyb2xsZXI/LmxheW91dENvbnRhaW5lcigpO1xuXHRcdGlmIChjb250cm9sbGVyLmFuY2hvcikge1xuXHRcdFx0Ly8gQW5jaG9yZWQgcXVpY2sgaW5wdXRzIGFyZSBwb3NpdGlvbmVkIG5lYXIgYSBzcGVjaWZpYyBlbGVtZW50LCBub3Rcblx0XHRcdC8vIGF0IHRoZSBkZWZhdWx0IHRvcCBsb2NhdGlvbiwgc28gcmVwb3J0IHRoZW0gYXMgY3VzdG9tLXBvc2l0aW9uZWQuXG5cdFx0XHR0aGlzLl9hbGlnbm1lbnQuc2V0KCdjdXN0b20nLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBSZS1zeW5jIGZyb20gRG5EIGluIGNhc2UgYSBwcmV2aW91cyBhbmNob3JlZCBpbnB1dCBsZWZ0IHVzIHN0YWxlLlxuXHRcdFx0dGhpcy5fYWxpZ25tZW50LnNldCh0aGlzLmRuZENvbnRyb2xsZXI/LmFsaWdubWVudC5nZXQoKSA/PyAndG9wJywgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5vblNob3dFbWl0dGVyLmZpcmUoKTtcblx0XHR1aS5pbnB1dEJveC5zZXRGb2N1cygpO1xuXHRcdHRoaXMucXVpY2tJbnB1dFR5cGVDb250ZXh0LnNldChjb250cm9sbGVyLnR5cGUpO1xuXHR9XG5cblx0aXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuY29udHJvbGxlcjtcblx0fVxuXG5cdHByaXZhdGUgc2V0VmlzaWJpbGl0aWVzKHZpc2liaWxpdGllczogVmlzaWJpbGl0aWVzKSB7XG5cdFx0Y29uc3QgdWkgPSB0aGlzLmdldFVJKCk7XG5cdFx0dWkudGl0bGUuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy50aXRsZSA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLmRlc2NyaXB0aW9uMS5zdHlsZS5kaXNwbGF5ID0gdmlzaWJpbGl0aWVzLmRlc2NyaXB0aW9uICYmICh2aXNpYmlsaXRpZXMuaW5wdXRCb3ggfHwgdmlzaWJpbGl0aWVzLmNoZWNrQWxsKSA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLmRlc2NyaXB0aW9uMi5zdHlsZS5kaXNwbGF5ID0gdmlzaWJpbGl0aWVzLmRlc2NyaXB0aW9uICYmICEodmlzaWJpbGl0aWVzLmlucHV0Qm94IHx8IHZpc2liaWxpdGllcy5jaGVja0FsbCkgPyAnJyA6ICdub25lJztcblx0XHR1aS5jaGVja0FsbC5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmlsaXRpZXMuY2hlY2tBbGwgPyAnJyA6ICdub25lJztcblx0XHR1aS5pbnB1dENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmlzaWJpbGl0aWVzLmlucHV0Qm94ID8gJycgOiAnbm9uZSc7XG5cdFx0dWkuZmlsdGVyQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmlsaXRpZXMuaW5wdXRCb3ggPyAnJyA6ICdub25lJztcblx0XHR1aS52aXNpYmxlQ291bnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy52aXNpYmxlQ291bnQgPyAnJyA6ICdub25lJztcblx0XHR1aS5jb3VudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmlzaWJpbGl0aWVzLmNvdW50ID8gJycgOiAnbm9uZSc7XG5cdFx0dWkub2tDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5vayA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLmN1c3RvbUJ1dHRvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmlzaWJpbGl0aWVzLmN1c3RvbUJ1dHRvbiA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLm1lc3NhZ2Uuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5tZXNzYWdlID8gJycgOiAnbm9uZSc7XG5cdFx0dWkucHJvZ3Jlc3NCYXIuZ2V0Q29udGFpbmVyKCkuc3R5bGUuZGlzcGxheSA9IHZpc2liaWxpdGllcy5wcm9ncmVzc0JhciA/ICcnIDogJ25vbmUnO1xuXHRcdHVpLmxpc3QuZGlzcGxheWVkID0gISF2aXNpYmlsaXRpZXMubGlzdDtcblx0XHR1aS50cmVlLmRpc3BsYXllZCA9ICEhdmlzaWJpbGl0aWVzLnRyZWU7XG5cdFx0dWkuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Nob3ctY2hlY2tib3hlcycsICEhdmlzaWJpbGl0aWVzLmNoZWNrQm94KTtcblx0XHR1aS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuLWlucHV0JywgIXZpc2liaWxpdGllcy5pbnB1dEJveCAmJiAhdmlzaWJpbGl0aWVzLmRlc2NyaXB0aW9uKTtcblx0XHR0aGlzLm92ZXJsYXlMYXlvdXRDb3JyZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudXBkYXRlTGF5b3V0KCk7IC8vIFRPRE9cblx0fVxuXG5cdHByaXZhdGUgc2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG5cdFx0aWYgKGVuYWJsZWQgIT09IHRoaXMuZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gZW5hYmxlZDtcblx0XHRcdGNvbnN0IHVpID0gdGhpcy5nZXRVSSgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB1aS5sZWZ0QWN0aW9uQmFyLmdldEl0ZW1zTGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB1aS5sZWZ0QWN0aW9uQmFyLmdldEl0ZW1BY3Rpb24oaSk7XG5cdFx0XHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdFx0XHRhY3Rpb24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdWkucmlnaHRBY3Rpb25CYXIuZ2V0SXRlbXNMZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHVpLnJpZ2h0QWN0aW9uQmFyLmdldEl0ZW1BY3Rpb24oaSk7XG5cdFx0XHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdFx0XHRhY3Rpb24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChlbmFibGVkKSB7XG5cdFx0XHRcdHVpLmNoZWNrQWxsLmVuYWJsZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dWkuY2hlY2tBbGwuZGlzYWJsZSgpO1xuXHRcdFx0fVxuXHRcdFx0dWkuaW5wdXRCb3guZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHR1aS5vay5lbmFibGVkID0gZW5hYmxlZDtcblx0XHRcdHVpLmxpc3QuZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0fVxuXHR9XG5cblx0aGlkZShyZWFzb24/OiBRdWlja0lucHV0SGlkZVJlYXNvbikge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmNvbnRyb2xsZXI7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIud2lsbEhpZGUocmVhc29uKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudWk/LmNvbnRhaW5lcjtcblx0XHRjb25zdCBmb2N1c0NoYW5nZWQgPSBjb250YWluZXIgJiYgIWRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGNvbnRhaW5lcik7XG5cdFx0dGhpcy5jb250cm9sbGVyID0gbnVsbDtcblx0XHR0aGlzLm9uSGlkZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdGlmIChjb250YWluZXIpIHtcblx0XHRcdGlmICghY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucyhRVUlDS19JTlBVVF9PVkVSTEFZX0NMQVNTKSAmJiBkb20uaGFzUGFyZW50V2l0aENsYXNzKGNvbnRhaW5lciwgUVVJQ0tfSU5QVVRfTU9USU9OX0FOQ0VTVE9SX0NMQVNTRVMpKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5pbmVydCA9IHRydWU7XG5cdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFFVSUNLX0lOUFVUX01PVElPTl9DTE9TSU5HX0NMQVNTKTtcblx0XHRcdFx0dGhpcy5jbG9zZUFuaW1hdGlvbi52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuY29tcGxldGVDbG9zZUFuaW1hdGlvbigpLCBRVUlDS19JTlBVVF9DTE9TRV9BTklNQVRJT05fRFVSQVRJT04pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghZm9jdXNDaGFuZ2VkKSB7XG5cdFx0XHRsZXQgY3VycmVudEVsZW1lbnQgPSB0aGlzLnByZXZpb3VzRm9jdXNFbGVtZW50O1xuXHRcdFx0d2hpbGUgKGN1cnJlbnRFbGVtZW50ICYmICFjdXJyZW50RWxlbWVudC5vZmZzZXRQYXJlbnQpIHtcblx0XHRcdFx0Y3VycmVudEVsZW1lbnQgPSBjdXJyZW50RWxlbWVudC5wYXJlbnRFbGVtZW50ID8/IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50RWxlbWVudD8ub2Zmc2V0UGFyZW50KSB7XG5cdFx0XHRcdGN1cnJlbnRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdHRoaXMucHJldmlvdXNGb2N1c0VsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm9wdGlvbnMucmV0dXJuRm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29udHJvbGxlci5kaWRIaWRlKHJlYXNvbik7XG5cdH1cblxuXHRwcml2YXRlIGNvbXBsZXRlQ2xvc2VBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNsb3NlQW5pbWF0aW9uLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jbG9zZUFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudWk/LmNvbnRhaW5lcjtcblx0XHRpZiAoY29udGFpbmVyKSB7XG5cdFx0XHRjb250YWluZXIuaW5lcnQgPSBmYWxzZTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKFFVSUNLX0lOUFVUX01PVElPTl9DTE9TSU5HX0NMQVNTKTtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wbGV0ZUNsb3NlQW5pbWF0aW9uKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Zm9jdXMoKSB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdGNvbnN0IHVpID0gdGhpcy5nZXRVSSgpO1xuXHRcdFx0aWYgKHVpLmlucHV0Qm94LmVuYWJsZWQpIHtcblx0XHRcdFx0dWkuaW5wdXRCb3guc2V0Rm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVpLmxpc3QuZG9tRm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b2dnbGUoKSB7XG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvbnRyb2xsZXIgaW5zdGFuY2VvZiBRdWlja1BpY2sgJiYgdGhpcy5jb250cm9sbGVyLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdHRoaXMuZ2V0VUkoKS5saXN0LnRvZ2dsZUNoZWNrYm94KCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNvbnRyb2xsZXIgaW5zdGFuY2VvZiBRdWlja1RyZWUpIHtcblx0XHRcdHRoaXMuZ2V0VUkoKS50cmVlLnRvZ2dsZUNoZWNrYm94KCk7XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlSG92ZXIoKSB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkgJiYgdGhpcy5jb250cm9sbGVyIGluc3RhbmNlb2YgUXVpY2tQaWNrKSB7XG5cdFx0XHR0aGlzLmdldFVJKCkubGlzdC50b2dnbGVIb3ZlcigpO1xuXHRcdH1cblx0fVxuXG5cdG5hdmlnYXRlKG5leHQ6IGJvb2xlYW4sIHF1aWNrTmF2aWdhdGU/OiBJUXVpY2tOYXZpZ2F0ZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSAmJiB0aGlzLmdldFVJKCkubGlzdC5kaXNwbGF5ZWQpIHtcblx0XHRcdHRoaXMuZ2V0VUkoKS5saXN0LmZvY3VzKG5leHQgPyBRdWlja1BpY2tGb2N1cy5OZXh0IDogUXVpY2tQaWNrRm9jdXMuUHJldmlvdXMpO1xuXHRcdFx0aWYgKHF1aWNrTmF2aWdhdGUgJiYgdGhpcy5jb250cm9sbGVyIGluc3RhbmNlb2YgUXVpY2tQaWNrKSB7XG5cdFx0XHRcdHRoaXMuY29udHJvbGxlci5xdWlja05hdmlnYXRlID0gcXVpY2tOYXZpZ2F0ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBhY2NlcHQoa2V5TW9kczogSUtleU1vZHMgPSB7IGFsdDogZmFsc2UsIGN0cmxDbWQ6IGZhbHNlLCBzaGlmdDogZmFsc2UgfSkge1xuXHRcdC8vIFdoZW4gYWNjZXB0aW5nIHRoZSBpdGVtIHByb2dyYW1tYXRpY2FsbHksIGl0IGlzIGltcG9ydGFudCB0aGF0XG5cdFx0Ly8gd2UgdXBkYXRlIGBrZXlNb2RzYCBlaXRoZXIgZnJvbSB0aGUgcHJvdmlkZWQgc2V0IG9yIHVuc2V0IGl0XG5cdFx0Ly8gYmVjYXVzZSB0aGUgYWNjZXB0IGRpZCBub3QgaGFwcGVuIGZyb20gbW91c2Ugb3Iga2V5Ym9hcmRcblx0XHQvLyBpbnRlcmFjdGlvbiBvbiB0aGUgbGlzdCBpdHNlbGZcblx0XHR0aGlzLmtleU1vZHMuYWx0ID0ga2V5TW9kcy5hbHQ7XG5cdFx0dGhpcy5rZXlNb2RzLmN0cmxDbWQgPSBrZXlNb2RzLmN0cmxDbWQ7XG5cdFx0dGhpcy5rZXlNb2RzLnNoaWZ0ID0ga2V5TW9kcy5zaGlmdDtcblxuXHRcdHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGJhY2soKSB7XG5cdFx0dGhpcy5vbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyLmZpcmUodGhpcy5iYWNrQnV0dG9uKTtcblx0fVxuXG5cdGFzeW5jIGNhbmNlbChyZWFzb24/OiBRdWlja0lucHV0SGlkZVJlYXNvbikge1xuXHRcdHRoaXMuaGlkZShyZWFzb24pO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogZG9tLklEaW1lbnNpb24sIHRpdGxlQmFyT2Zmc2V0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHR0aGlzLnRpdGxlQmFyT2Zmc2V0ID0gdGl0bGVCYXJPZmZzZXQ7XG5cdFx0dGhpcy5vdmVybGF5TGF5b3V0Q29ycmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnVwZGF0ZUxheW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMYXlvdXQoKSB7XG5cdFx0aWYgKHRoaXMudWkgJiYgdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0Y29uc3Qgc3R5bGUgPSB0aGlzLnVpLmNvbnRhaW5lci5zdHlsZTtcblx0XHRcdGxldCB3aWR0aCA9IE1hdGgubWluKHRoaXMuZGltZW5zaW9uIS53aWR0aCAqIDAuNjIgLyogZ29sZGVuIGN1dCAqLywgUXVpY2tJbnB1dENvbnRyb2xsZXIuTUFYX1dJRFRIKTtcblx0XHRcdHN0eWxlLndpZHRoID0gd2lkdGggKyAncHgnO1xuXG5cdFx0XHRsZXQgbGlzdEhlaWdodCA9IHRoaXMuZGltZW5zaW9uICYmIHRoaXMuZGltZW5zaW9uLmhlaWdodCAqIDAuNDtcblx0XHRcdGxldCBvdmVybGF5QW5jaG9yOiBJUmVjdCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gUG9zaXRpb25cblx0XHRcdGlmICh0aGlzLmNvbnRyb2xsZXI/LmFuY2hvcikge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmNvbnRyb2xsZXIuYW5jaG9yIGFzIEhUTUxFbGVtZW50IHwgSUFuY2hvcjtcblx0XHRcdFx0Y29uc3QgaXNFbGVtZW50ID0gZG9tLmlzSFRNTEVsZW1lbnQodGFyZ2V0KTtcblx0XHRcdFx0Y29uc3QgYW5jaG9yV2luZG93ID0gaXNFbGVtZW50ID8gZG9tLmdldFdpbmRvdyh0YXJnZXQpIDogZG9tLmdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGFuY2hvcldpbmRvdykuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdGNvbnN0IHZlcnRpY2FsUGFkZGluZyA9IDYgKyAyNiArIDE2OyAvLyBBY2NvdW50cyBmb3IgaW5wdXQgYm94IGFuZCBwYWRkaW5nXG5cblx0XHRcdFx0bGV0IGFuY2hvciA9IGdldEFuY2hvclJlY3QodGFyZ2V0KTtcblx0XHRcdFx0bGV0IHByZWZlcnJlZEFuY2hvclBvc2l0aW9uID0gQW5jaG9yUG9zaXRpb24uQUJPVkU7XG5cdFx0XHRcdGxldCBsaXN0SGVpZ2h0UmF0aW8gPSAwLjI7XG5cdFx0XHRcdGxldCBtYXhMaXN0SGVpZ2h0ID0gMjAwO1xuXG5cdFx0XHRcdGlmICh0aGlzLmNvbnRyb2xsZXIuYW5jaG9yUG9zaXRpb24gPT09ICdvdmVybGF5Jykge1xuXHRcdFx0XHRcdG92ZXJsYXlBbmNob3IgPSBhbmNob3I7XG5cdFx0XHRcdFx0dGhpcy51aS5pbnB1dEJveC5zZXRIZWlnaHQoYW5jaG9yLmhlaWdodCk7XG5cdFx0XHRcdFx0d2lkdGggPSBhbmNob3Iud2lkdGg7XG5cdFx0XHRcdFx0bGlzdEhlaWdodFJhdGlvID0gMC40O1xuXHRcdFx0XHRcdGFuY2hvciA9IHsgLi4uYW5jaG9yLCBoZWlnaHQ6IDAgfTtcblx0XHRcdFx0XHRtYXhMaXN0SGVpZ2h0ID0gTWF0aC5taW4oNDAwLCBjb250YWluZXIuYm90dG9tIC0gYW5jaG9yLnRvcCAtIHZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRcdFx0cHJlZmVycmVkQW5jaG9yUG9zaXRpb24gPSBBbmNob3JQb3NpdGlvbi5CRUxPVztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR3aWR0aCA9IDM4MDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxpc3RIZWlnaHQgPSB0aGlzLmRpbWVuc2lvbiA/IE1hdGgubWluKHRoaXMuZGltZW5zaW9uLmhlaWdodCAqIGxpc3RIZWlnaHRSYXRpbywgbWF4TGlzdEhlaWdodCkgOiBtYXhMaXN0SGVpZ2h0O1xuXG5cdFx0XHRcdC8vIEJld2FyZTpcblx0XHRcdFx0Ly8gV2UgbmVlZCB0byBhZGQgc29tZSBleHRyYSBwaXhlbHMgdG8gdGhlIGhlaWdodCB0byBhY2NvdW50IGZvciB0aGUgaW5wdXQgYW5kIHBhZGRpbmcuXG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lckhlaWdodCA9IE1hdGguZmxvb3IobGlzdEhlaWdodCkgKyB2ZXJ0aWNhbFBhZGRpbmc7XG5cdFx0XHRcdGNvbnN0IHsgdG9wLCBsZWZ0LCByaWdodCwgYm90dG9tLCBhbmNob3JBbGlnbm1lbnQsIGFuY2hvclBvc2l0aW9uIH0gPSBsYXlvdXQyZChjb250YWluZXIsIHsgd2lkdGgsIGhlaWdodDogY29udGFpbmVySGVpZ2h0IH0sIGFuY2hvciwgeyBhbmNob3JQb3NpdGlvbjogcHJlZmVycmVkQW5jaG9yUG9zaXRpb24gfSk7XG5cblx0XHRcdFx0aWYgKGFuY2hvckFsaWdubWVudCA9PT0gQW5jaG9yQWxpZ25tZW50LlJJR0hUKSB7XG5cdFx0XHRcdFx0c3R5bGUucmlnaHQgPSBgJHtyaWdodH1weGA7XG5cdFx0XHRcdFx0c3R5bGUubGVmdCA9ICdpbml0aWFsJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0XHRcdFx0c3R5bGUucmlnaHQgPSAnaW5pdGlhbCc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYW5jaG9yUG9zaXRpb24gPT09IEFuY2hvclBvc2l0aW9uLkFCT1ZFKSB7XG5cdFx0XHRcdFx0c3R5bGUuYm90dG9tID0gYCR7Ym90dG9tfXB4YDtcblx0XHRcdFx0XHRzdHlsZS50b3AgPSAnaW5pdGlhbCc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdFx0XHRzdHlsZS5ib3R0b20gPSAnaW5pdGlhbCc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0c3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdHlsZS50b3AgPSBgJHt0aGlzLnZpZXdTdGF0ZT8udG9wICE9PSB1bmRlZmluZWQgPyBNYXRoLnJvdW5kKHRoaXMuZGltZW5zaW9uIS5oZWlnaHQgKiB0aGlzLnZpZXdTdGF0ZS50b3ApIDogdGhpcy50aXRsZUJhck9mZnNldH1weGA7XG5cdFx0XHRcdHN0eWxlLmxlZnQgPSBgJHtNYXRoLnJvdW5kKCh0aGlzLmRpbWVuc2lvbiEud2lkdGggKiAodGhpcy52aWV3U3RhdGU/LmxlZnQgPz8gMC41IC8qIGNlbnRlciAqLykpIC0gKHdpZHRoIC8gMikpfXB4YDtcblx0XHRcdFx0c3R5bGUucmlnaHQgPSAnJztcblx0XHRcdFx0c3R5bGUuYm90dG9tID0gJyc7XG5cdFx0XHRcdHN0eWxlLmhlaWdodCA9ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3ZlcmxheUFuY2hvcikge1xuXHRcdFx0XHR0aGlzLmFsaWduT3ZlcmxheUlucHV0KG92ZXJsYXlBbmNob3IpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHRcdHRoaXMudWkubGlzdC5sYXlvdXQobGlzdEhlaWdodCk7XG5cdFx0XHR0aGlzLnVpLnRyZWUubGF5b3V0KGxpc3RIZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWxpZ25PdmVybGF5SW5wdXQoYW5jaG9yOiBJUmVjdCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0eWxlID0gdGhpcy51aSEuY29udGFpbmVyLnN0eWxlO1xuXHRcdGxldCBjb3JyZWN0aW9uID0gdGhpcy5vdmVybGF5TGF5b3V0Q29ycmVjdGlvbjtcblx0XHRpZiAoIWNvcnJlY3Rpb24gfHwgY29ycmVjdGlvbi5hbmNob3IubGVmdCAhPT0gYW5jaG9yLmxlZnQgfHwgY29ycmVjdGlvbi5hbmNob3IudG9wICE9PSBhbmNob3IudG9wIHx8IGNvcnJlY3Rpb24uYW5jaG9yLndpZHRoICE9PSBhbmNob3Iud2lkdGggfHwgY29ycmVjdGlvbi5hbmNob3IuaGVpZ2h0ICE9PSBhbmNob3IuaGVpZ2h0KSB7XG5cdFx0XHR0aGlzLnVpIS5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy51aSEuZmlsdGVyQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29ycmVjdGlvbiA9IHRoaXMub3ZlcmxheUxheW91dENvcnJlY3Rpb24gPSB7XG5cdFx0XHRcdGFuY2hvcixcblx0XHRcdFx0bGVmdDogYW5jaG9yLmxlZnQgLSBpbnB1dC5sZWZ0LFxuXHRcdFx0XHRyaWdodDogaW5wdXQucmlnaHQgLSAoYW5jaG9yLmxlZnQgKyBhbmNob3Iud2lkdGgpLFxuXHRcdFx0XHR0b3A6IGFuY2hvci50b3AgLSBpbnB1dC50b3AsXG5cdFx0XHRcdGJvdHRvbTogaW5wdXQuYm90dG9tIC0gKGFuY2hvci50b3AgKyBhbmNob3IuaGVpZ2h0KSxcblx0XHRcdFx0d2lkdGg6IGFuY2hvci53aWR0aCAtIGlucHV0LndpZHRoLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRzdHlsZS53aWR0aCA9IGAke3BhcnNlRmxvYXQoc3R5bGUud2lkdGgpICsgY29ycmVjdGlvbi53aWR0aH1weGA7XG5cdFx0aWYgKHN0eWxlLmxlZnQgIT09ICdpbml0aWFsJykge1xuXHRcdFx0c3R5bGUubGVmdCA9IGAke3BhcnNlRmxvYXQoc3R5bGUubGVmdCkgKyBjb3JyZWN0aW9uLmxlZnR9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdHlsZS5yaWdodCA9IGAke3BhcnNlRmxvYXQoc3R5bGUucmlnaHQpICsgY29ycmVjdGlvbi5yaWdodH1weGA7XG5cdFx0fVxuXHRcdGlmIChzdHlsZS50b3AgIT09ICdpbml0aWFsJykge1xuXHRcdFx0c3R5bGUudG9wID0gYCR7cGFyc2VGbG9hdChzdHlsZS50b3ApICsgY29ycmVjdGlvbi50b3B9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdHlsZS5ib3R0b20gPSBgJHtwYXJzZUZsb2F0KHN0eWxlLmJvdHRvbSkgKyBjb3JyZWN0aW9uLmJvdHRvbX1weGA7XG5cdFx0fVxuXHR9XG5cblx0YXBwbHlTdHlsZXMoc3R5bGVzOiBJUXVpY2tJbnB1dFN0eWxlcykge1xuXHRcdHRoaXMuc3R5bGVzID0gc3R5bGVzO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0eWxlcygpIHtcblx0XHRpZiAodGhpcy51aSkge1xuXHRcdFx0Y29uc3Qge1xuXHRcdFx0XHRxdWlja0lucHV0VGl0bGVCYWNrZ3JvdW5kLCBxdWlja0lucHV0QmFja2dyb3VuZCwgcXVpY2tJbnB1dEZvcmVncm91bmQsIHdpZGdldEJvcmRlcixcblx0XHRcdH0gPSB0aGlzLnN0eWxlcy53aWRnZXQ7XG5cdFx0XHR0aGlzLnVpLnRpdGxlQmFyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHF1aWNrSW5wdXRUaXRsZUJhY2tncm91bmQgPz8gJyc7XG5cdFx0XHR0aGlzLnVpLmNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBxdWlja0lucHV0QmFja2dyb3VuZCA/PyAnJztcblx0XHRcdHRoaXMudWkuY29udGFpbmVyLnN0eWxlLmNvbG9yID0gcXVpY2tJbnB1dEZvcmVncm91bmQgPz8gJyc7XG5cdFx0XHR0aGlzLnVpLmNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSB3aWRnZXRCb3JkZXIgPyBgMXB4IHNvbGlkICR7d2lkZ2V0Qm9yZGVyfWAgOiAnJztcblx0XHRcdHRoaXMudWkubGlzdC5zdHlsZSh0aGlzLnN0eWxlcy5saXN0KTtcblx0XHRcdHRoaXMudWkudHJlZS50cmVlLnN0eWxlKHRoaXMuc3R5bGVzLmxpc3QpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKHRoaXMuc3R5bGVzLnBpY2tlckdyb3VwLnBpY2tlckdyb3VwQm9yZGVyKSB7XG5cdFx0XHRcdGNvbnRlbnQucHVzaChgLnF1aWNrLWlucHV0LWxpc3QgLnF1aWNrLWlucHV0LWxpc3QtZW50cnkgeyBib3JkZXItdG9wLWNvbG9yOiAgJHt0aGlzLnN0eWxlcy5waWNrZXJHcm91cC5waWNrZXJHcm91cEJvcmRlcn07IH1gKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnN0eWxlcy5waWNrZXJHcm91cC5waWNrZXJHcm91cEZvcmVncm91bmQpIHtcblx0XHRcdFx0Y29udGVudC5wdXNoKGAucXVpY2staW5wdXQtbGlzdCAucXVpY2staW5wdXQtbGlzdC1zZXBhcmF0b3IgeyBjb2xvcjogICR7dGhpcy5zdHlsZXMucGlja2VyR3JvdXAucGlja2VyR3JvdXBGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc3R5bGVzLnBpY2tlckdyb3VwLnBpY2tlckdyb3VwRm9yZWdyb3VuZCkge1xuXHRcdFx0XHRjb250ZW50LnB1c2goYC5xdWljay1pbnB1dC1saXN0IC5xdWljay1pbnB1dC1saXN0LXNlcGFyYXRvci1hcy1pdGVtIHsgY29sb3I6IHZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpOyB9YCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQmFja2dyb3VuZCB8fFxuXHRcdFx0XHR0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm9yZGVyIHx8XG5cdFx0XHRcdHRoaXMuc3R5bGVzLmtleWJpbmRpbmdMYWJlbC5rZXliaW5kaW5nTGFiZWxCb3R0b21Cb3JkZXIgfHxcblx0XHRcdFx0dGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbFNoYWRvdyB8fFxuXHRcdFx0XHR0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsRm9yZWdyb3VuZCkge1xuXHRcdFx0XHRjb250ZW50LnB1c2goJy5xdWljay1pbnB1dC1saXN0IC5tb25hY28ta2V5YmluZGluZyA+IC5tb25hY28ta2V5YmluZGluZy1rZXkgeycpO1xuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEJhY2tncm91bmQpIHtcblx0XHRcdFx0XHRjb250ZW50LnB1c2goYGJhY2tncm91bmQtY29sb3I6ICR7dGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEJhY2tncm91bmR9O2ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm9yZGVyKSB7XG5cdFx0XHRcdFx0Ly8gT3JkZXIgbWF0dGVycyBoZXJlLiBgYm9yZGVyLWNvbG9yYCBtdXN0IGNvbWUgYmVmb3JlIGBib3JkZXItYm90dG9tLWNvbG9yYC5cblx0XHRcdFx0XHRjb250ZW50LnB1c2goYGJvcmRlci1jb2xvcjogJHt0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm9yZGVyfTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEJvdHRvbUJvcmRlcikge1xuXHRcdFx0XHRcdGNvbnRlbnQucHVzaChgYm9yZGVyLWJvdHRvbS1jb2xvcjogJHt0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsQm90dG9tQm9yZGVyfTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbFNoYWRvdykge1xuXHRcdFx0XHRcdGNvbnRlbnQucHVzaChgYm94LXNoYWRvdzogaW5zZXQgMCAtMXB4IDAgJHt0aGlzLnN0eWxlcy5rZXliaW5kaW5nTGFiZWwua2V5YmluZGluZ0xhYmVsU2hhZG93fTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zdHlsZXMua2V5YmluZGluZ0xhYmVsLmtleWJpbmRpbmdMYWJlbEZvcmVncm91bmQpIHtcblx0XHRcdFx0XHRjb250ZW50LnB1c2goYGNvbG9yOiAke3RoaXMuc3R5bGVzLmtleWJpbmRpbmdMYWJlbC5rZXliaW5kaW5nTGFiZWxGb3JlZ3JvdW5kfTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250ZW50LnB1c2goJ30nKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3U3R5bGVzID0gY29udGVudC5qb2luKCdcXG4nKTtcblx0XHRcdGlmIChuZXdTdHlsZXMgIT09IHRoaXMudWkuc3R5bGVTaGVldC50ZXh0Q29udGVudCkge1xuXHRcdFx0XHR0aGlzLnVpLnN0eWxlU2hlZXQudGV4dENvbnRlbnQgPSBuZXdTdHlsZXM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkVmlld1N0YXRlKCk6IFF1aWNrSW5wdXRWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkYXRhID0gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChWSUVXU1RBVEVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJ3t9JykpO1xuXHRcdFx0aWYgKGRhdGEudG9wICE9PSB1bmRlZmluZWQgfHwgZGF0YS5sZWZ0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7IH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVWaWV3U3RhdGUodmlld1N0YXRlOiBRdWlja0lucHV0Vmlld1N0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNNYWluV2luZG93ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lciA9PT0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXI7XG5cdFx0aWYgKCFpc01haW5XaW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodmlld1N0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVklFV1NUQVRFX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeSh2aWV3U3RhdGUpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFZJRVdTVEFURV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVpY2tJbnB1dENvbnRyb2xsZXJIb3N0IGV4dGVuZHMgSUxheW91dFNlcnZpY2UgeyB9XG5cbmNsYXNzIFF1aWNrSW5wdXREcmFnQW5kRHJvcENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZG5kVmlld1N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPHsgdG9wPzogbnVtYmVyOyBsZWZ0PzogbnVtYmVyOyBkb25lOiBib29sZWFuIH0gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSBfZW5hYmxlZCA9IHRydWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc25hcFRocmVzaG9sZCA9IDIwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbmFwTGluZUhvcml6b250YWxSYXRpbyA9IDAuMjU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJvbHNPbkxlZnQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyb2xzT25SaWdodDogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0QWxpZ25tZW50Q29udGV4dDogSUNvbnRleHRLZXk8J2NlbnRlcicgfCAndG9wJyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsaWdubWVudCA9IG9ic2VydmFibGVWYWx1ZTxRdWlja0lucHV0QWxpZ25tZW50Pih0aGlzLCAndG9wJyk7XG5cdHJlYWRvbmx5IGFsaWdubWVudDogSU9ic2VydmFibGU8UXVpY2tJbnB1dEFsaWdubWVudD4gPSB0aGlzLl9hbGlnbm1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0Q29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIF9xdWlja0lucHV0RHJhZ0FyZWFzOiB7IG5vZGU6IEhUTUxFbGVtZW50OyBpbmNsdWRlQ2hpbGRyZW46IGJvb2xlYW47IGV4Y2x1ZGVOb2Rlcz86IEhUTUxFbGVtZW50W10gfVtdLFxuXHRcdGluaXRpYWxWaWV3U3RhdGU6IFF1aWNrSW5wdXRWaWV3U3RhdGUgfCB1bmRlZmluZWQsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3F1aWNrSW5wdXRBbGlnbm1lbnRDb250ZXh0ID0gUXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdXN0b21XaW5kb3dDb250cm9scyA9IGdldFdpbmRvd0NvbnRyb2xzU3R5bGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgPT09IFdpbmRvd0NvbnRyb2xzU3R5bGUuQ1VTVE9NO1xuXG5cdFx0Ly8gRG8gbm90IGFsbG93IHRoZSB3aWRnZXQgdG8gb3ZlcmZsb3cgb3IgdW5kZXJmbG93IHdpbmRvdyBjb250cm9scy5cblx0XHQvLyBVc2UgQ1NTIGNhbGN1bGF0aW9ucyB0byBhdm9pZCBoYXZpbmcgdG8gZm9yY2UgbGF5b3V0IHdpdGggYC5jbGllbnRXaWR0aGBcblx0XHR0aGlzLl9jb250cm9sc09uTGVmdCA9IGN1c3RvbVdpbmRvd0NvbnRyb2xzICYmIHBsYXRmb3JtID09PSBQbGF0Zm9ybS5NYWM7XG5cdFx0dGhpcy5fY29udHJvbHNPblJpZ2h0ID0gY3VzdG9tV2luZG93Q29udHJvbHMgJiYgKHBsYXRmb3JtID09PSBQbGF0Zm9ybS5XaW5kb3dzIHx8IHBsYXRmb3JtID09PSBQbGF0Zm9ybS5MaW51eCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMYXlvdXRMaXN0ZW5lcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJNb3VzZUxpc3RlbmVycygpO1xuXHRcdHRoaXMuZG5kVmlld1N0YXRlLnNldCh7IC4uLmluaXRpYWxWaWV3U3RhdGUsIGRvbmU6IHRydWUgfSwgdW5kZWZpbmVkKTtcblx0XHQvLyBJbml0aWFsaXplIGFsaWdubWVudCBmcm9tIHJlc3RvcmVkIHN0YXRlLiBUaGUgZXhhY3Qgc25hcCBhbGlnbm1lbnQgd2lsbFxuXHRcdC8vIGJlIHJlZmluZWQgaW4gbGF5b3V0Q29udGFpbmVyKCkgb25jZSBwaXhlbCBkaW1lbnNpb25zIGFyZSBhdmFpbGFibGUuXG5cdFx0aWYgKGluaXRpYWxWaWV3U3RhdGU/LnRvcCAhPT0gdW5kZWZpbmVkICYmIGluaXRpYWxWaWV3U3RhdGU/LmxlZnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRyZXBhcmVudFVJKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdH1cblxuXHRsYXlvdXRDb250YWluZXIoZGltZW5zaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJEaW1lbnNpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZG5kVmlld1N0YXRlLmdldCgpO1xuXHRcdGNvbnN0IGRyYWdBcmVhUmVjdCA9IHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0aWYgKHN0YXRlPy50b3AgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZT8ubGVmdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBhID0gTWF0aC5yb3VuZChzdGF0ZS5sZWZ0ICogMWUyKSAvIDFlMjtcblx0XHRcdGNvbnN0IGIgPSBkaW1lbnNpb24ud2lkdGg7XG5cdFx0XHRjb25zdCBjID0gZHJhZ0FyZWFSZWN0LndpZHRoO1xuXHRcdFx0Y29uc3QgZCA9IGEgKiBiIC0gYyAvIDI7XG5cdFx0XHR0aGlzLl9sYXlvdXQoc3RhdGUudG9wICogZGltZW5zaW9uLmhlaWdodCwgZCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0dGhpcy5fcXVpY2tJbnB1dENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCduby1kcmFnJywgIWVuYWJsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0QWxpZ25tZW50U3RhdGUodmFsdWU6ICd0b3AnIHwgJ2NlbnRlcicgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9xdWlja0lucHV0QWxpZ25tZW50Q29udGV4dC5zZXQodmFsdWUpO1xuXHRcdHRoaXMuX2FsaWdubWVudC5zZXQodmFsdWUgPz8gJ2N1c3RvbScsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRBbGlnbm1lbnQoYWxpZ25tZW50OiAndG9wJyB8ICdjZW50ZXInIHwgeyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyIH0sIGRvbmUgPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKGFsaWdubWVudCA9PT0gJ3RvcCcpIHtcblx0XHRcdHRoaXMuZG5kVmlld1N0YXRlLnNldCh7XG5cdFx0XHRcdHRvcDogdGhpcy5fZ2V0VG9wU25hcFZhbHVlKCkgLyB0aGlzLl9jb250YWluZXIuY2xpZW50SGVpZ2h0LFxuXHRcdFx0XHRsZWZ0OiAodGhpcy5fZ2V0Q2VudGVyWFNuYXBWYWx1ZSgpICsgKHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuY2xpZW50V2lkdGggLyAyKSkgLyB0aGlzLl9jb250YWluZXIuY2xpZW50V2lkdGgsXG5cdFx0XHRcdGRvbmVcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZXRBbGlnbm1lbnRTdGF0ZSgndG9wJyk7XG5cdFx0fSBlbHNlIGlmIChhbGlnbm1lbnQgPT09ICdjZW50ZXInKSB7XG5cdFx0XHR0aGlzLmRuZFZpZXdTdGF0ZS5zZXQoe1xuXHRcdFx0XHR0b3A6IHRoaXMuX2dldENlbnRlcllTbmFwVmFsdWUoKSAvIHRoaXMuX2NvbnRhaW5lci5jbGllbnRIZWlnaHQsXG5cdFx0XHRcdGxlZnQ6ICh0aGlzLl9nZXRDZW50ZXJYU25hcFZhbHVlKCkgKyAodGhpcy5fcXVpY2tJbnB1dENvbnRhaW5lci5jbGllbnRXaWR0aCAvIDIpKSAvIHRoaXMuX2NvbnRhaW5lci5jbGllbnRXaWR0aCxcblx0XHRcdFx0ZG9uZVxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3NldEFsaWdubWVudFN0YXRlKCdjZW50ZXInKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kbmRWaWV3U3RhdGUuc2V0KHsgdG9wOiBhbGlnbm1lbnQudG9wLCBsZWZ0OiBhbGlnbm1lbnQubGVmdCwgZG9uZSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckxheW91dExpc3RlbmVyKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkTGF5b3V0Q29udGFpbmVyLCBlID0+IGUuY29udGFpbmVyID09PSB0aGlzLl9jb250YWluZXIpKChlKSA9PiB0aGlzLmxheW91dENvbnRhaW5lcihlLmRpbWVuc2lvbikpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNb3VzZUxpc3RlbmVycygpOiB2b2lkIHtcblx0XHRjb25zdCBkcmFnQXJlYSA9IHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXI7XG5cblx0XHQvLyBEb3VibGUgY2xpY2tcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZVVwTGlzdGVuZXIoZHJhZ0FyZWEsIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3JpZ2luRXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3coZHJhZ0FyZWEpLCBldmVudCk7XG5cdFx0XHRpZiAob3JpZ2luRXZlbnQuZGV0YWlsICE9PSAyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWdub3JlIGV2ZW50IGlmIHRoZSB0YXJnZXQgaXMgbm90IHRoZSBkcmFnIGFyZWFcblx0XHRcdGNvbnN0IGFyZWEgPSB0aGlzLl9xdWlja0lucHV0RHJhZ0FyZWFzLmZpbmQoKHsgbm9kZSwgaW5jbHVkZUNoaWxkcmVuIH0pID0+IGluY2x1ZGVDaGlsZHJlbiA/IGRvbS5pc0FuY2VzdG9yKG9yaWdpbkV2ZW50LnRhcmdldCwgbm9kZSkgOiBvcmlnaW5FdmVudC50YXJnZXQgPT09IG5vZGUpO1xuXHRcdFx0aWYgKCFhcmVhIHx8IGFyZWEuZXhjbHVkZU5vZGVzPy5zb21lKG5vZGUgPT4gZG9tLmlzQW5jZXN0b3Iob3JpZ2luRXZlbnQudGFyZ2V0LCBub2RlKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRuZFZpZXdTdGF0ZS5zZXQoeyB0b3A6IHVuZGVmaW5lZCwgbGVmdDogdW5kZWZpbmVkLCBkb25lOiB0cnVlIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZXRBbGlnbm1lbnRTdGF0ZSgndG9wJyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTW91c2UgZG93blxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGRyYWdBcmVhLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLl9sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBvcmlnaW5FdmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoYWN0aXZlV2luZG93LCBlKTtcblxuXHRcdFx0Ly8gSWdub3JlIGV2ZW50IGlmIHRoZSB0YXJnZXQgaXMgbm90IHRoZSBkcmFnIGFyZWFcblx0XHRcdGNvbnN0IGFyZWEgPSB0aGlzLl9xdWlja0lucHV0RHJhZ0FyZWFzLmZpbmQoKHsgbm9kZSwgaW5jbHVkZUNoaWxkcmVuIH0pID0+IGluY2x1ZGVDaGlsZHJlbiA/IGRvbS5pc0FuY2VzdG9yKG9yaWdpbkV2ZW50LnRhcmdldCwgbm9kZSkgOiBvcmlnaW5FdmVudC50YXJnZXQgPT09IG5vZGUpO1xuXHRcdFx0aWYgKCFhcmVhIHx8IGFyZWEuZXhjbHVkZU5vZGVzPy5zb21lKG5vZGUgPT4gZG9tLmlzQW5jZXN0b3Iob3JpZ2luRXZlbnQudGFyZ2V0LCBub2RlKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb3VzZSBwb3NpdGlvbiBvZmZzZXQgcmVsYXRpdmUgdG8gZHJhZ0FyZWFcblx0XHRcdGNvbnN0IGRyYWdBcmVhUmVjdCA9IHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCBkcmFnT2Zmc2V0WCA9IG9yaWdpbkV2ZW50LmJyb3dzZXJFdmVudC5jbGllbnRYIC0gZHJhZ0FyZWFSZWN0LmxlZnQ7XG5cdFx0XHRjb25zdCBkcmFnT2Zmc2V0WSA9IG9yaWdpbkV2ZW50LmJyb3dzZXJFdmVudC5jbGllbnRZIC0gZHJhZ0FyZWFSZWN0LnRvcDtcblxuXHRcdFx0bGV0IGlzTW92aW5nUXVpY2tJbnB1dCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgbW91c2VNb3ZlTGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZU1vdmVMaXN0ZW5lcihhY3RpdmVXaW5kb3csIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vdXNlTW92ZUV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChhY3RpdmVXaW5kb3csIGUpO1xuXHRcdFx0XHRtb3VzZU1vdmVFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRcdGlmICghaXNNb3ZpbmdRdWlja0lucHV0KSB7XG5cdFx0XHRcdFx0aXNNb3ZpbmdRdWlja0lucHV0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2xheW91dChlLmNsaWVudFkgLSBkcmFnT2Zmc2V0WSwgZS5jbGllbnRYIC0gZHJhZ09mZnNldFgpO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBtb3VzZVVwTGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZVVwTGlzdGVuZXIoYWN0aXZlV2luZG93LCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNNb3ZpbmdRdWlja0lucHV0KSB7XG5cdFx0XHRcdFx0Ly8gU2F2ZSBwb3NpdGlvblxuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5kbmRWaWV3U3RhdGUuZ2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5kbmRWaWV3U3RhdGUuc2V0KHsgdG9wOiBzdGF0ZT8udG9wLCBsZWZ0OiBzdGF0ZT8ubGVmdCwgZG9uZTogdHJ1ZSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGlzcG9zZSBsaXN0ZW5lcnNcblx0XHRcdFx0bW91c2VNb3ZlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRtb3VzZVVwTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0KHRvcENvb3JkaW5hdGU6IG51bWJlciwgbGVmdENvb3JkaW5hdGU6IG51bWJlcikge1xuXHRcdGNvbnN0IHNuYXBDb29yZGluYXRlWVRvcCA9IHRoaXMuX2dldFRvcFNuYXBWYWx1ZSgpO1xuXHRcdGNvbnN0IHNuYXBDb29yZGluYXRlWSA9IHRoaXMuX2dldENlbnRlcllTbmFwVmFsdWUoKTtcblx0XHRjb25zdCBzbmFwQ29vcmRpbmF0ZVggPSB0aGlzLl9nZXRDZW50ZXJYU25hcFZhbHVlKCk7XG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBxdWljayBpbnB1dCBpcyBub3QgbW92ZWQgb3V0c2lkZSB0aGUgY29udGFpbmVyXG5cdFx0dG9wQ29vcmRpbmF0ZSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRvcENvb3JkaW5hdGUsIHRoaXMuX2NvbnRhaW5lci5jbGllbnRIZWlnaHQgLSB0aGlzLl9xdWlja0lucHV0Q29udGFpbmVyLmNsaWVudEhlaWdodCkpO1xuXG5cdFx0aWYgKHRvcENvb3JkaW5hdGUgPCB0aGlzLl9sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lck9mZnNldC50b3ApIHtcblx0XHRcdGlmICh0aGlzLl9jb250cm9sc09uTGVmdCkge1xuXHRcdFx0XHRsZWZ0Q29vcmRpbmF0ZSA9IE1hdGgubWF4KGxlZnRDb29yZGluYXRlLCA4MCAvIGdldFpvb21GYWN0b3IoZG9tLmdldEFjdGl2ZVdpbmRvdygpKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2NvbnRyb2xzT25SaWdodCkge1xuXHRcdFx0XHRsZWZ0Q29vcmRpbmF0ZSA9IE1hdGgubWluKGxlZnRDb29yZGluYXRlLCB0aGlzLl9jb250YWluZXIuY2xpZW50V2lkdGggLSB0aGlzLl9xdWlja0lucHV0Q29udGFpbmVyLmNsaWVudFdpZHRoIC0gKDE0MCAvIGdldFpvb21GYWN0b3IoZG9tLmdldEFjdGl2ZVdpbmRvdygpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNuYXBwaW5nVG9Ub3AgPSBNYXRoLmFicyh0b3BDb29yZGluYXRlIC0gc25hcENvb3JkaW5hdGVZVG9wKSA8IHRoaXMuX3NuYXBUaHJlc2hvbGQ7XG5cdFx0dG9wQ29vcmRpbmF0ZSA9IHNuYXBwaW5nVG9Ub3AgPyBzbmFwQ29vcmRpbmF0ZVlUb3AgOiB0b3BDb29yZGluYXRlO1xuXHRcdGNvbnN0IHNuYXBwaW5nVG9DZW50ZXIgPSBNYXRoLmFicyh0b3BDb29yZGluYXRlIC0gc25hcENvb3JkaW5hdGVZKSA8IHRoaXMuX3NuYXBUaHJlc2hvbGQ7XG5cdFx0dG9wQ29vcmRpbmF0ZSA9IHNuYXBwaW5nVG9DZW50ZXIgPyBzbmFwQ29vcmRpbmF0ZVkgOiB0b3BDb29yZGluYXRlO1xuXHRcdGNvbnN0IHRvcCA9IHRvcENvb3JkaW5hdGUgLyB0aGlzLl9jb250YWluZXIuY2xpZW50SGVpZ2h0O1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBxdWljayBpbnB1dCBpcyBub3QgbW92ZWQgb3V0c2lkZSB0aGUgY29udGFpbmVyXG5cdFx0bGVmdENvb3JkaW5hdGUgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihsZWZ0Q29vcmRpbmF0ZSwgdGhpcy5fY29udGFpbmVyLmNsaWVudFdpZHRoIC0gdGhpcy5fcXVpY2tJbnB1dENvbnRhaW5lci5jbGllbnRXaWR0aCkpO1xuXHRcdGNvbnN0IHNuYXBwaW5nVG9DZW50ZXJYID0gTWF0aC5hYnMobGVmdENvb3JkaW5hdGUgLSBzbmFwQ29vcmRpbmF0ZVgpIDwgdGhpcy5fc25hcFRocmVzaG9sZDtcblx0XHRsZWZ0Q29vcmRpbmF0ZSA9IHNuYXBwaW5nVG9DZW50ZXJYID8gc25hcENvb3JkaW5hdGVYIDogbGVmdENvb3JkaW5hdGU7XG5cblx0XHRjb25zdCBiID0gdGhpcy5fY29udGFpbmVyLmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IGMgPSB0aGlzLl9xdWlja0lucHV0Q29udGFpbmVyLmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IGQgPSBsZWZ0Q29vcmRpbmF0ZTtcblx0XHRjb25zdCBsZWZ0ID0gKGQgKyBjIC8gMikgLyBiO1xuXG5cdFx0dGhpcy5kbmRWaWV3U3RhdGUuc2V0KHsgdG9wLCBsZWZ0LCBkb25lOiBmYWxzZSB9LCB1bmRlZmluZWQpO1xuXHRcdGlmIChzbmFwcGluZ1RvQ2VudGVyWCkge1xuXHRcdFx0aWYgKHNuYXBwaW5nVG9Ub3ApIHtcblx0XHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUoJ3RvcCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2UgaWYgKHNuYXBwaW5nVG9DZW50ZXIpIHtcblx0XHRcdFx0dGhpcy5fc2V0QWxpZ25tZW50U3RhdGUoJ2NlbnRlcicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NldEFsaWdubWVudFN0YXRlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb3BTbmFwVmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyT2Zmc2V0LnF1aWNrUGlja1RvcDtcblx0fVxuXG5cdHByaXZhdGUgX2dldENlbnRlcllTbmFwVmFsdWUoKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5fY29udGFpbmVyLmNsaWVudEhlaWdodCAqIHRoaXMuX3NuYXBMaW5lSG9yaXpvbnRhbFJhdGlvKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENlbnRlclhTbmFwVmFsdWUoKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5fY29udGFpbmVyLmNsaWVudFdpZHRoIC8gMikgLSBNYXRoLnJvdW5kKHRoaXMuX3F1aWNrSW5wdXRDb250YWluZXIuY2xpZW50V2lkdGggLyAyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUN2QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQTBDLG1CQUFtQixlQUFlO0FBQ3JGLE9BQU8sY0FBYztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFrSyxzQkFBc0Msc0JBQXVGO0FBQy9SLFNBQVMscUJBQXFCO0FBQzlCLFNBQXlFLFdBQVcsWUFBWSxVQUF3QixhQUFhLHdCQUF3QiwwQkFBMEIsOEJBQThCLHFDQUFxQztBQUMxUCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFzQiwwQkFBMEI7QUFDaEQsT0FBTztBQUNQLFNBQXNCLFNBQVMsdUJBQXVCO0FBQ3RELFNBQVMsMEJBQTBC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
