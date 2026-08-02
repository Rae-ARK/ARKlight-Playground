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
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { equals } from "../../../base/common/arrays.js";
import { TimeoutTimer } from "../../../base/common/async.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter, EventBufferer } from "../../../base/common/event.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { isIOS } from "../../../base/common/platform.js";
import Severity from "../../../base/common/severity.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import "./media/quickInput.css";
import { localize } from "../../../nls.js";
import { ItemActivation, NO_KEY_MODS, QuickInputButtonLocation, QuickInputHideReason, QuickInputType, QuickPickFocus } from "../common/quickInput.js";
import { quickInputButtonToAction, quickInputButtonsToActionArrays, renderQuickInputDescription } from "./quickInputUtils.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../hover/browser/hover.js";
import { ContextKeyExpr, RawContextKey } from "../../contextkey/common/contextkey.js";
import { observableValue } from "../../../base/common/observable.js";
const inQuickInputContextKeyValue = "inQuickInput";
const InQuickInputContextKey = new RawContextKey(inQuickInputContextKeyValue, false, localize("inQuickInput", "Whether keyboard focus is inside the quick input control"));
const inQuickInputContext = ContextKeyExpr.has(inQuickInputContextKeyValue);
const quickInputAlignmentContextKeyValue = "quickInputAlignment";
const QuickInputAlignmentContextKey = new RawContextKey(quickInputAlignmentContextKeyValue, "top", localize("quickInputAlignment", "The alignment of the quick input"));
const quickInputTypeContextKeyValue = "quickInputType";
const QuickInputTypeContextKey = new RawContextKey(quickInputTypeContextKeyValue, void 0, localize("quickInputType", "The type of the currently visible quick input"));
const endOfQuickInputBoxContextKeyValue = "cursorAtEndOfQuickInputBox";
const EndOfQuickInputBoxContextKey = new RawContextKey(endOfQuickInputBoxContextKeyValue, false, localize("cursorAtEndOfQuickInputBox", "Whether the cursor in the quick input is at the end of the input box"));
const endOfQuickInputBoxContext = ContextKeyExpr.has(endOfQuickInputBoxContextKeyValue);
const backButton = {
  iconClass: ThemeIcon.asClassName(Codicon.quickInputBack),
  tooltip: localize("quickInput.back", "Back"),
  handle: -1
  // TODO
};
const _QuickInput = class _QuickInput extends Disposable {
  constructor(ui) {
    super();
    this.ui = ui;
    this._visible = observableValue("visible", false);
    this._enabled = true;
    this._busy = false;
    this._ignoreFocusOut = false;
    this._leftButtons = [];
    this._rightButtons = [];
    this._inlineButtons = [];
    this._inputButtons = [];
    this.buttonsUpdated = false;
    this.noValidationMessage = _QuickInput.noPromptMessage;
    this._severity = Severity.Ignore;
    this.onDidTriggerButtonEmitter = this._register(new Emitter());
    this.onDidHideEmitter = this._register(new Emitter());
    this.onWillHideEmitter = this._register(new Emitter());
    this.onDisposeEmitter = this._register(new Emitter());
    this.visibleDisposables = this._register(new DisposableStore());
    this.onDidTriggerButton = this.onDidTriggerButtonEmitter.event;
    this.onDidHide = this.onDidHideEmitter.event;
    this.onWillHide = this.onWillHideEmitter.event;
    this.onDispose = this.onDisposeEmitter.event;
  }
  get visible() {
    return this._visible.get();
  }
  get title() {
    return this._title;
  }
  set title(title) {
    this._title = title;
    this.update();
  }
  get description() {
    return this._description;
  }
  set description(description) {
    this._description = description;
    this.update();
  }
  get step() {
    return this._steps;
  }
  set step(step) {
    this._steps = step;
    this.update();
  }
  get totalSteps() {
    return this._totalSteps;
  }
  set totalSteps(totalSteps) {
    this._totalSteps = totalSteps;
    this.update();
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(enabled) {
    this._enabled = enabled;
    this.update();
  }
  get contextKey() {
    return this._contextKey;
  }
  set contextKey(contextKey) {
    this._contextKey = contextKey;
    this.update();
  }
  get busy() {
    return this._busy;
  }
  set busy(busy) {
    this._busy = busy;
    this.update();
  }
  get ignoreFocusOut() {
    return this._ignoreFocusOut;
  }
  set ignoreFocusOut(ignoreFocusOut) {
    const shouldUpdate = this._ignoreFocusOut !== ignoreFocusOut && !isIOS;
    this._ignoreFocusOut = ignoreFocusOut && !isIOS;
    if (shouldUpdate) {
      this.update();
    }
  }
  get titleButtons() {
    return this._leftButtons.length ? [...this._leftButtons, this._rightButtons] : this._rightButtons;
  }
  get buttons() {
    return [
      ...this._leftButtons,
      ...this._rightButtons,
      ...this._inlineButtons,
      ...this._inputButtons
    ];
  }
  set buttons(buttons) {
    const leftButtons = [];
    const rightButtons = [];
    const inlineButtons = [];
    const inputButtons = [];
    for (const button of buttons) {
      if (button === backButton) {
        leftButtons.push(button);
      } else {
        switch (button.location) {
          case QuickInputButtonLocation.Inline:
            inlineButtons.push(button);
            break;
          case QuickInputButtonLocation.Input:
            inputButtons.push(button);
            break;
          default:
            rightButtons.push(button);
            break;
        }
      }
    }
    this._leftButtons = leftButtons;
    this._rightButtons = rightButtons;
    this._inlineButtons = inlineButtons;
    this._inputButtons = inputButtons;
    this.buttonsUpdated = true;
    this.update();
  }
  get validationMessage() {
    return this._validationMessage;
  }
  set validationMessage(validationMessage) {
    this._validationMessage = validationMessage;
    this.update();
  }
  get severity() {
    return this._severity;
  }
  set severity(severity) {
    this._severity = severity;
    this.update();
  }
  show() {
    if (this.visible) {
      return;
    }
    this.visibleDisposables.add(
      this.ui.onDidTriggerButton((button) => {
        if (this.buttons.indexOf(button) !== -1) {
          this.onDidTriggerButtonEmitter.fire(button);
        }
      })
    );
    this.ui.show(this);
    this._visible.set(true, void 0);
    this._lastValidationMessage = void 0;
    this._lastSeverity = void 0;
    if (this.buttons.length) {
      this.buttonsUpdated = true;
    }
    this.update();
  }
  hide() {
    if (!this.visible) {
      return;
    }
    this.ui.hide();
  }
  didHide(reason = QuickInputHideReason.Other) {
    this._visible.set(false, void 0);
    this.visibleDisposables.clear();
    this.onDidHideEmitter.fire({ reason });
  }
  willHide(reason = QuickInputHideReason.Other) {
    this.onWillHideEmitter.fire({ reason });
  }
  update() {
    if (!this.visible) {
      return;
    }
    const title = this.getTitle();
    if (title && this.ui.title.textContent !== title) {
      this.ui.title.textContent = title;
    } else if (!title && this.ui.title.innerHTML !== "&nbsp;") {
      this.ui.title.innerText = "\xA0";
    }
    const description = this.getDescription();
    if (this.ui.description1.textContent !== description) {
      this.ui.description1.textContent = description;
    }
    if (this.ui.description2.textContent !== description) {
      this.ui.description2.textContent = description;
    }
    if (this.busy && !this.busyDelay) {
      this.busyDelay = new TimeoutTimer();
      this.busyDelay.setIfNotSet(() => {
        if (this.visible) {
          this.ui.progressBar.infinite();
          this.ui.progressBar.getContainer().removeAttribute("aria-hidden");
        }
      }, 800);
    }
    if (!this.busy && this.busyDelay) {
      this.ui.progressBar.stop();
      this.ui.progressBar.getContainer().setAttribute("aria-hidden", "true");
      this.busyDelay.cancel();
      this.busyDelay = void 0;
    }
    if (this.buttonsUpdated) {
      this.buttonsUpdated = false;
      const leftActions = quickInputButtonsToActionArrays(
        this._leftButtons,
        "left-button",
        (button) => this.onDidTriggerButtonEmitter.fire(button)
      );
      this.ui.leftActionBar.setActions(leftActions.primary, leftActions.secondary);
      const rightActions = quickInputButtonsToActionArrays(
        this._rightButtons,
        "right-button",
        (button) => this.onDidTriggerButtonEmitter.fire(button)
      );
      this.ui.rightActionBar.setActions(rightActions.primary, rightActions.secondary);
      const inlineActions = quickInputButtonsToActionArrays(
        this._inlineButtons,
        "inline-button",
        (button) => this.onDidTriggerButtonEmitter.fire(button)
      );
      this.ui.inlineActionBar.setActions(inlineActions.primary, inlineActions.secondary);
      const inputButtonOffset = this._inputButtons.length * 22;
      this.ui.countContainer.style.right = inputButtonOffset > 0 ? `${4 + inputButtonOffset}px` : "4px";
      this.ui.inputBox.actions = this._inputButtons.map((button, index) => quickInputButtonToAction(
        button,
        `id-${index}`,
        async () => this.onDidTriggerButtonEmitter.fire(button)
      ));
    }
    this.ui.ignoreFocusOut = this.ignoreFocusOut;
    this.ui.setEnabled(this.enabled);
    this.ui.setContextKey(this.contextKey);
    const validationMessage = this.validationMessage || this.noValidationMessage;
    if (this._lastValidationMessage !== validationMessage) {
      this._lastValidationMessage = validationMessage;
      dom.reset(this.ui.message);
      if (validationMessage) {
        renderQuickInputDescription(validationMessage, this.ui.message, {
          callback: (content) => {
            this.ui.linkOpenerDelegate(content);
          },
          disposables: this.visibleDisposables
        });
      }
    }
    if (this._lastSeverity !== this.severity) {
      this._lastSeverity = this.severity;
      this.showMessageDecoration(this.severity);
    }
  }
  getTitle() {
    if (this.title && this.step) {
      return `${this.title} (${this.getSteps()})`;
    }
    if (this.title) {
      return this.title;
    }
    if (this.step) {
      return this.getSteps();
    }
    return "";
  }
  getDescription() {
    return this.description || "";
  }
  getSteps() {
    if (this.step && this.totalSteps) {
      return localize("quickInput.steps", "{0}/{1}", this.step, this.totalSteps);
    }
    if (this.step) {
      return String(this.step);
    }
    return "";
  }
  showMessageDecoration(severity) {
    this.ui.inputBox.showDecoration(severity);
    if (severity !== Severity.Ignore) {
      const styles = this.ui.inputBox.stylesForType(severity);
      this.ui.message.style.color = styles.foreground ? `${styles.foreground}` : "";
      this.ui.message.style.backgroundColor = styles.background ? `${styles.background}` : "";
      this.ui.message.style.border = styles.border ? `1px solid ${styles.border}` : "";
      this.ui.message.style.marginBottom = "-2px";
    } else {
      this.ui.message.style.color = "";
      this.ui.message.style.backgroundColor = "";
      this.ui.message.style.border = "";
      this.ui.message.style.marginBottom = "";
    }
  }
  dispose() {
    this.hide();
    this.onDisposeEmitter.fire();
    super.dispose();
  }
};
_QuickInput.noPromptMessage = localize("inputModeEntry", "Press 'Enter' to confirm your input or 'Escape' to cancel");
let QuickInput = _QuickInput;
const _QuickPick = class _QuickPick extends QuickInput {
  constructor(ui) {
    super(ui);
    this._value = "";
    this.onDidChangeValueEmitter = this._register(new Emitter());
    this.onWillAcceptEmitter = this._register(new Emitter());
    this.onDidAcceptEmitter = this._register(new Emitter());
    this.onDidCustomEmitter = this._register(new Emitter());
    this._items = [];
    this.itemsUpdated = false;
    this._canSelectMany = false;
    this._canAcceptInBackground = false;
    this._matchOnDescription = false;
    this._matchOnDetail = false;
    this._matchOnLabel = true;
    this._matchOnLabelMode = "fuzzy";
    this._sortByLabel = true;
    this._keepScrollPosition = false;
    this._itemActivation = ItemActivation.FIRST;
    this._activeItems = [];
    this.activeItemsUpdated = false;
    this.activeItemsToConfirm = [];
    this.onDidChangeActiveEmitter = this._register(new Emitter());
    this._selectedItems = [];
    this.selectedItemsUpdated = false;
    this.selectedItemsToConfirm = [];
    this.onDidChangeSelectionEmitter = this._register(new Emitter());
    this.onDidTriggerItemButtonEmitter = this._register(new Emitter());
    this.onDidTriggerSeparatorButtonEmitter = this._register(new Emitter());
    this.valueSelectionUpdated = true;
    this._ok = "default";
    this._customButton = false;
    this._customButtonSecondary = false;
    this._focusEventBufferer = new EventBufferer();
    this.type = QuickInputType.QuickPick;
    this.filterValue = (value) => value;
    this.onDidChangeValue = this.onDidChangeValueEmitter.event;
    this.onWillAccept = this.onWillAcceptEmitter.event;
    this.onDidAccept = this.onDidAcceptEmitter.event;
    this.onDidCustom = this.onDidCustomEmitter.event;
    this.onDidChangeActive = this.onDidChangeActiveEmitter.event;
    this.onDidChangeSelection = this.onDidChangeSelectionEmitter.event;
    this.onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;
    this.onDidTriggerSeparatorButton = this.onDidTriggerSeparatorButtonEmitter.event;
    this.noValidationMessage = void 0;
  }
  get quickNavigate() {
    return this._quickNavigate;
  }
  set quickNavigate(quickNavigate) {
    this._quickNavigate = quickNavigate;
    this.update();
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this.doSetValue(value);
  }
  doSetValue(value, skipUpdate) {
    if (this._value !== value) {
      this._value = value;
      if (!skipUpdate) {
        this.update();
      }
      if (this.visible) {
        const didFilter = this.ui.list.filter(this.filterValue(this._value));
        if (didFilter) {
          this.trySelectFirst();
        }
      }
      this.onDidChangeValueEmitter.fire(this._value);
    }
  }
  set ariaLabel(ariaLabel) {
    this._ariaLabel = ariaLabel;
    this.update();
  }
  get ariaLabel() {
    return this._ariaLabel;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this._placeholder = placeholder;
    this.update();
  }
  get prompt() {
    return this.noValidationMessage;
  }
  set prompt(prompt) {
    this.noValidationMessage = prompt;
    this.update();
  }
  get items() {
    return this._items;
  }
  get scrollTop() {
    return this.ui.list.scrollTop;
  }
  set scrollTop(scrollTop) {
    this.ui.list.scrollTop = scrollTop;
  }
  set items(items) {
    this._items = items;
    this.itemsUpdated = true;
    this.update();
  }
  get canSelectMany() {
    return this._canSelectMany;
  }
  set canSelectMany(canSelectMany) {
    this._canSelectMany = canSelectMany;
    this.update();
  }
  get canAcceptInBackground() {
    return this._canAcceptInBackground;
  }
  set canAcceptInBackground(canAcceptInBackground) {
    this._canAcceptInBackground = canAcceptInBackground;
  }
  get matchOnDescription() {
    return this._matchOnDescription;
  }
  set matchOnDescription(matchOnDescription) {
    this._matchOnDescription = matchOnDescription;
    this.update();
  }
  get matchOnDetail() {
    return this._matchOnDetail;
  }
  set matchOnDetail(matchOnDetail) {
    this._matchOnDetail = matchOnDetail;
    this.update();
  }
  get matchOnLabel() {
    return this._matchOnLabel;
  }
  set matchOnLabel(matchOnLabel) {
    this._matchOnLabel = matchOnLabel;
    this.update();
  }
  get matchOnLabelMode() {
    return this._matchOnLabelMode;
  }
  set matchOnLabelMode(matchOnLabelMode) {
    this._matchOnLabelMode = matchOnLabelMode;
    this.update();
  }
  get sortByLabel() {
    return this._sortByLabel;
  }
  set sortByLabel(sortByLabel) {
    this._sortByLabel = sortByLabel;
    this.update();
  }
  get keepScrollPosition() {
    return this._keepScrollPosition;
  }
  set keepScrollPosition(keepScrollPosition) {
    this._keepScrollPosition = keepScrollPosition;
  }
  get itemActivation() {
    return this._itemActivation;
  }
  set itemActivation(itemActivation) {
    this._itemActivation = itemActivation;
  }
  get activeItems() {
    return this._activeItems;
  }
  set activeItems(activeItems) {
    this._activeItems = activeItems;
    this.activeItemsUpdated = true;
    this.update();
  }
  get selectedItems() {
    return this._selectedItems;
  }
  set selectedItems(selectedItems) {
    this._selectedItems = selectedItems;
    this.selectedItemsUpdated = true;
    this.update();
  }
  get keyMods() {
    if (this._quickNavigate) {
      return NO_KEY_MODS;
    }
    return this.ui.keyMods;
  }
  get valueSelection() {
    const selection = this.ui.inputBox.getSelection();
    if (!selection) {
      return void 0;
    }
    return [selection.start, selection.end];
  }
  set valueSelection(valueSelection) {
    this._valueSelection = valueSelection;
    this.valueSelectionUpdated = true;
    this.update();
  }
  get customButton() {
    return this._customButton;
  }
  set customButton(showCustomButton) {
    this._customButton = showCustomButton;
    this.update();
  }
  get customLabel() {
    return this._customButtonLabel;
  }
  set customLabel(label) {
    this._customButtonLabel = label;
    this.update();
  }
  get customHover() {
    return this._customButtonHover;
  }
  set customHover(hover) {
    this._customButtonHover = hover;
    this.update();
  }
  get customButtonSecondary() {
    return this._customButtonSecondary;
  }
  set customButtonSecondary(secondary) {
    this._customButtonSecondary = secondary ?? false;
    this.update();
  }
  get ok() {
    return this._ok;
  }
  set ok(showOkButton) {
    this._ok = showOkButton;
    this.update();
  }
  get okLabel() {
    return this._okLabel ?? localize("ok", "OK");
  }
  set okLabel(okLabel) {
    this._okLabel = okLabel;
    this.update();
  }
  inputHasFocus() {
    return this.visible ? this.ui.inputBox.hasFocus() : false;
  }
  focusOnInput() {
    this.ui.inputBox.setFocus();
  }
  get hideInput() {
    return !!this._hideInput;
  }
  set hideInput(hideInput) {
    this._hideInput = hideInput;
    this.update();
  }
  get hideCountBadge() {
    return !!this._hideCountBadge;
  }
  set hideCountBadge(hideCountBadge) {
    this._hideCountBadge = hideCountBadge;
    this.update();
  }
  get hideCheckAll() {
    return !!this._hideCheckAll;
  }
  set hideCheckAll(hideCheckAll) {
    this._hideCheckAll = hideCheckAll;
    this.update();
  }
  trySelectFirst() {
    if (!this.canSelectMany) {
      this.ui.list.focus(QuickPickFocus.First);
    }
  }
  show() {
    if (!this.visible) {
      this.visibleDisposables.add(
        this.ui.inputBox.onDidChange((value) => {
          this.doSetValue(
            value,
            true
            /* skip update since this originates from the UI */
          );
        })
      );
      this.visibleDisposables.add(this.ui.onDidAccept(() => {
        if (this.canSelectMany) {
          if (!this.ui.list.getCheckedElements().length) {
            this._selectedItems = [];
            this.onDidChangeSelectionEmitter.fire(this.selectedItems);
          }
        } else if (this.activeItems[0]) {
          this._selectedItems = [this.activeItems[0]];
          this.onDidChangeSelectionEmitter.fire(this.selectedItems);
        }
        this.handleAccept(false);
      }));
      this.visibleDisposables.add(this.ui.onDidCustom(() => {
        this.onDidCustomEmitter.fire();
      }));
      this.visibleDisposables.add(this._focusEventBufferer.wrapEvent(
        this.ui.list.onDidChangeFocus,
        // Only fire the last event
        (_, e) => e
      )((focusedItems) => {
        if (this.activeItemsUpdated) {
          return;
        }
        if (this.activeItemsToConfirm !== this._activeItems && equals(focusedItems, this._activeItems, (a, b) => a === b)) {
          return;
        }
        this._activeItems = focusedItems;
        this.onDidChangeActiveEmitter.fire(focusedItems);
      }));
      this.visibleDisposables.add(this.ui.list.onDidChangeSelection(({ items: selectedItems, event }) => {
        if (this.canSelectMany && !selectedItems.some((i) => i.pickable === false)) {
          if (selectedItems.length) {
            this.ui.list.setSelectedElements([]);
          }
          return;
        }
        if (this.selectedItemsToConfirm !== this._selectedItems && equals(selectedItems, this._selectedItems, (a, b) => a === b)) {
          return;
        }
        this._selectedItems = selectedItems;
        this.onDidChangeSelectionEmitter.fire(selectedItems);
        if (selectedItems.length) {
          this.handleAccept(
            dom.isMouseEvent(event) && event.button === 1
            /* mouse middle click */
          );
        }
      }));
      this.visibleDisposables.add(this.ui.list.onChangedCheckedElements((checkedItems) => {
        if (!this.canSelectMany || !this.visible) {
          return;
        }
        if (this.selectedItemsToConfirm !== this._selectedItems && equals(checkedItems, this._selectedItems, (a, b) => a === b)) {
          return;
        }
        this._selectedItems = checkedItems;
        this.onDidChangeSelectionEmitter.fire(checkedItems);
      }));
      this.visibleDisposables.add(this.ui.list.onButtonTriggered((event) => this.onDidTriggerItemButtonEmitter.fire(event)));
      this.visibleDisposables.add(this.ui.list.onSeparatorButtonTriggered((event) => this.onDidTriggerSeparatorButtonEmitter.fire(event)));
      this.visibleDisposables.add(this.registerQuickNavigation());
      this.valueSelectionUpdated = true;
    }
    super.show();
  }
  handleAccept(inBackground) {
    let veto = false;
    this.onWillAcceptEmitter.fire({ veto: () => veto = true });
    if (!veto) {
      this.onDidAcceptEmitter.fire({ inBackground });
    }
  }
  registerQuickNavigation() {
    return dom.addDisposableListener(this.ui.container, dom.EventType.KEY_UP, (e) => {
      if (this.canSelectMany || !this._quickNavigate) {
        return;
      }
      const keyboardEvent = new StandardKeyboardEvent(e);
      const keyCode = keyboardEvent.keyCode;
      const quickNavKeys = this._quickNavigate.keybindings;
      const wasTriggerKeyPressed = quickNavKeys.some((k) => {
        const chords = k.getChords();
        if (chords.length > 1) {
          return false;
        }
        if (chords[0].shiftKey && keyCode === KeyCode.Shift) {
          if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) {
            return false;
          }
          return true;
        }
        if (chords[0].altKey && keyCode === KeyCode.Alt) {
          return true;
        }
        if (chords[0].ctrlKey && keyCode === KeyCode.Ctrl) {
          return true;
        }
        if (chords[0].metaKey && keyCode === KeyCode.Meta) {
          return true;
        }
        return false;
      });
      if (wasTriggerKeyPressed) {
        if (this.activeItems[0]) {
          this._selectedItems = [this.activeItems[0]];
          this.onDidChangeSelectionEmitter.fire(this.selectedItems);
          this.handleAccept(false);
        }
        this._quickNavigate = void 0;
      }
    });
  }
  update() {
    if (!this.visible) {
      return;
    }
    const scrollTopBefore = this.keepScrollPosition ? this.scrollTop : 0;
    const hasDescription = !!this.description;
    const visibilities = {
      title: !!this.title || !!this.step || !!this.titleButtons.length,
      description: hasDescription,
      checkAll: this.canSelectMany && !this._hideCheckAll,
      checkBox: this.canSelectMany,
      inputBox: !this._hideInput,
      progressBar: !this._hideInput || hasDescription,
      visibleCount: true,
      count: this.canSelectMany && !this._hideCountBadge,
      ok: this.ok === "default" ? this.canSelectMany : this.ok,
      list: true,
      message: !!this.validationMessage || !!this.prompt,
      customButton: this.customButton
    };
    this.ui.setVisibilities(visibilities);
    super.update();
    if (this.ui.inputBox.value !== this.value) {
      this.ui.inputBox.value = this.value;
    }
    if (this.valueSelectionUpdated) {
      this.valueSelectionUpdated = false;
      this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
    }
    if (this.ui.inputBox.placeholder !== (this.placeholder || "")) {
      this.ui.inputBox.placeholder = this.placeholder || "";
    }
    let ariaLabel = this.ariaLabel;
    if (!ariaLabel && visibilities.inputBox) {
      ariaLabel = this.placeholder;
      if (this.title) {
        ariaLabel = ariaLabel ? `${ariaLabel} - ${this.title}` : this.title;
      }
      if (!ariaLabel) {
        ariaLabel = _QuickPick.DEFAULT_ARIA_LABEL;
      }
    }
    if (this.ui.list.ariaLabel !== ariaLabel) {
      this.ui.list.ariaLabel = ariaLabel ?? null;
    }
    if (this.ui.inputBox.ariaLabel !== ariaLabel) {
      this.ui.inputBox.ariaLabel = ariaLabel ?? "input";
    }
    this.ui.list.matchOnDescription = this.matchOnDescription;
    this.ui.list.matchOnDetail = this.matchOnDetail;
    this.ui.list.matchOnLabel = this.matchOnLabel;
    this.ui.list.matchOnLabelMode = this.matchOnLabelMode;
    this.ui.list.sortByLabel = this.sortByLabel;
    if (this.itemsUpdated) {
      this.itemsUpdated = false;
      this._focusEventBufferer.bufferEvents(() => {
        this.ui.list.setElements(this.items);
        this.ui.list.shouldLoop = !this.canSelectMany;
        this.ui.list.filter(this.filterValue(this.ui.inputBox.value));
        switch (this._itemActivation) {
          case ItemActivation.NONE:
            this._itemActivation = ItemActivation.FIRST;
            break;
          case ItemActivation.SECOND:
            this.ui.list.focus(QuickPickFocus.Second);
            this._itemActivation = ItemActivation.FIRST;
            break;
          case ItemActivation.LAST:
            this.ui.list.focus(QuickPickFocus.Last);
            this._itemActivation = ItemActivation.FIRST;
            break;
          default:
            this.trySelectFirst();
            break;
        }
      });
    }
    if (this.ui.container.classList.contains("show-checkboxes") !== !!this.canSelectMany) {
      if (this.canSelectMany) {
        this.ui.list.clearFocus();
      } else {
        this.trySelectFirst();
      }
    }
    if (this.activeItemsUpdated) {
      this.activeItemsUpdated = false;
      this.activeItemsToConfirm = this._activeItems;
      this.ui.list.setFocusedElements(this.activeItems);
      if (this.activeItemsToConfirm === this._activeItems) {
        this.activeItemsToConfirm = null;
      }
    }
    if (this.selectedItemsUpdated) {
      this.selectedItemsUpdated = false;
      this.selectedItemsToConfirm = this._selectedItems;
      if (this.canSelectMany) {
        this.ui.list.setCheckedElements(this.selectedItems);
      } else {
        this.ui.list.setSelectedElements(this.selectedItems);
      }
      if (this.selectedItemsToConfirm === this._selectedItems) {
        this.selectedItemsToConfirm = null;
      }
    }
    this.ui.ok.label = this.okLabel || "";
    this.ui.customButton.label = this.customLabel || "";
    this.ui.customButton.element.title = this.customHover || "";
    this.ui.customButton.secondary = this.customButtonSecondary || false;
    if (!visibilities.inputBox) {
      this.ui.list.domFocus();
      if (this.canSelectMany) {
        this.ui.list.focus(QuickPickFocus.First);
      }
    }
    if (this.keepScrollPosition) {
      this.scrollTop = scrollTopBefore;
    }
  }
  focus(focus) {
    this.ui.list.focus(focus);
    if (this.canSelectMany) {
      this.ui.list.domFocus();
    }
  }
  accept(inBackground) {
    if (inBackground && !this._canAcceptInBackground) {
      return;
    }
    if (this.activeItems[0] && !this._canSelectMany) {
      this._selectedItems = [this.activeItems[0]];
      this.onDidChangeSelectionEmitter.fire(this.selectedItems);
    }
    this.handleAccept(inBackground ?? false);
  }
};
_QuickPick.DEFAULT_ARIA_LABEL = localize("quickInputBox.ariaLabel", "Type to narrow down results.");
let QuickPick = _QuickPick;
class InputBox extends QuickInput {
  constructor() {
    super(...arguments);
    this._value = "";
    this.valueSelectionUpdated = true;
    this._password = false;
    this.onDidValueChangeEmitter = this._register(new Emitter());
    this.onDidAcceptEmitter = this._register(new Emitter());
    this.type = QuickInputType.InputBox;
    this.onDidChangeValue = this.onDidValueChangeEmitter.event;
    this.onDidAccept = this.onDidAcceptEmitter.event;
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = value || "";
    this.update();
  }
  get valueSelection() {
    const selection = this.ui.inputBox.getSelection();
    if (!selection) {
      return void 0;
    }
    return [selection.start, selection.end];
  }
  set valueSelection(valueSelection) {
    this._valueSelection = valueSelection;
    this.valueSelectionUpdated = true;
    this.update();
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this._placeholder = placeholder;
    this.update();
  }
  get ariaLabel() {
    return this._ariaLabel;
  }
  set ariaLabel(ariaLabel) {
    this._ariaLabel = ariaLabel;
    this.update();
  }
  get password() {
    return this._password;
  }
  set password(password) {
    this._password = password;
    this.update();
  }
  get prompt() {
    return this._prompt;
  }
  set prompt(prompt) {
    this._prompt = prompt;
    this.noValidationMessage = prompt ? localize("inputModeEntryDescription", "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", prompt) : QuickInput.noPromptMessage;
    this.update();
  }
  show() {
    if (!this.visible) {
      this.visibleDisposables.add(
        this.ui.inputBox.onDidChange((value) => {
          if (value === this.value) {
            return;
          }
          this._value = value;
          this.onDidValueChangeEmitter.fire(value);
        })
      );
      this.visibleDisposables.add(this.ui.onDidAccept(() => this.onDidAcceptEmitter.fire()));
      this.valueSelectionUpdated = true;
    }
    super.show();
  }
  accept() {
    this.onDidAcceptEmitter.fire();
  }
  update() {
    if (!this.visible) {
      return;
    }
    this.ui.container.classList.remove("hidden-input");
    const visibilities = {
      title: !!this.title || !!this.step || !!this.titleButtons.length,
      description: !!this.description || !!this.step,
      inputBox: true,
      message: true,
      progressBar: true
    };
    this.ui.setVisibilities(visibilities);
    super.update();
    if (this.ui.inputBox.value !== this.value) {
      this.ui.inputBox.value = this.value;
    }
    if (this.valueSelectionUpdated) {
      this.valueSelectionUpdated = false;
      this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
    }
    if (this.ui.inputBox.placeholder !== (this.placeholder || "")) {
      this.ui.inputBox.placeholder = this.placeholder || "";
    }
    if (this.ui.inputBox.password !== this.password) {
      this.ui.inputBox.password = this.password;
    }
    let ariaLabel = this.ariaLabel;
    if (!ariaLabel && visibilities.inputBox) {
      ariaLabel = this.placeholder ? this.title ? `${this.placeholder} - ${this.title}` : this.placeholder : this.title ? this.title : "input";
    }
    if (this.ui.inputBox.ariaLabel !== ariaLabel) {
      this.ui.inputBox.ariaLabel = ariaLabel || "input";
    }
  }
}
class QuickWidget extends QuickInput {
  constructor() {
    super(...arguments);
    this.type = QuickInputType.QuickWidget;
    this._widgetUpdated = false;
  }
  get widget() {
    return this._widget;
  }
  set widget(widget) {
    if (this._widget !== widget) {
      this._widget = widget;
      this._widgetUpdated = true;
      this.update();
    }
  }
  update() {
    if (!this.visible) {
      return;
    }
    this.ui.setVisibilities({
      title: !!this.title || !!this.step || !!this.titleButtons.length,
      description: !!this.description || !!this.step
    });
    if (this._widgetUpdated) {
      this._widgetUpdated = false;
      if (this._widget) {
        dom.reset(this.ui.widget, this._widget);
      } else {
        dom.reset(this.ui.widget);
      }
    }
    super.update();
  }
}
let QuickInputHoverDelegate = class extends WorkbenchHoverDelegate {
  constructor(configurationService, hoverService) {
    super("mouse", void 0, (options) => this.getOverrideOptions(options), configurationService, hoverService);
  }
  getOverrideOptions(options) {
    const showHoverHint = (dom.isHTMLElement(options.content) ? options.content.textContent ?? "" : typeof options.content === "string" ? options.content : options.content.value).includes("\n");
    return {
      persistence: {
        hideOnKeyDown: false
      },
      appearance: {
        showHoverHint,
        skipFadeInAnimation: true
      }
    };
  }
};
QuickInputHoverDelegate = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IHoverService)
], QuickInputHoverDelegate);
export {
  EndOfQuickInputBoxContextKey,
  InQuickInputContextKey,
  InputBox,
  QuickInput,
  QuickInputAlignmentContextKey,
  QuickInputHoverDelegate,
  QuickInputTypeContextKey,
  QuickPick,
  QuickWidget,
  backButton,
  endOfQuickInputBoxContext,
  endOfQuickInputBoxContextKeyValue,
  inQuickInputContext,
  inQuickInputContextKeyValue,
  quickInputAlignmentContextKeyValue,
  quickInputTypeContextKeyValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9xdWlja0lucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uLCBJQnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSwgSUNvdW50QmFkZ2VTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY291bnRCYWRnZS9jb3VudEJhZGdlLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlLCBJSG92ZXJEZWxlZ2F0ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBJSW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdMYWJlbFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NCYXJTdHlsZXMsIFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IElUb2dnbGVTdHlsZXMsIFRyaVN0YXRlQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBFdmVudEJ1ZmZlcmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0lPUyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3F1aWNrSW5wdXQuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnB1dEJveCwgSUtleU1vZHMsIElRdWlja0lucHV0LCBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRIaWRlRXZlbnQsIElRdWlja05hdmlnYXRlQ29uZmlndXJhdGlvbiwgSVF1aWNrUGljaywgSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50LCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja0l0ZW1CdXR0b25FdmVudCwgSVF1aWNrUGlja1NlcGFyYXRvciwgSVF1aWNrUGlja1NlcGFyYXRvckJ1dHRvbkV2ZW50LCBJUXVpY2tQaWNrV2lsbEFjY2VwdEV2ZW50LCBJUXVpY2tXaWRnZXQsIEl0ZW1BY3RpdmF0aW9uLCBOT19LRVlfTU9EUywgUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uLCBRdWlja0lucHV0SGlkZVJlYXNvbiwgUXVpY2tJbnB1dFR5cGUsIFF1aWNrUGlja0ZvY3VzIH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dEJveCB9IGZyb20gJy4vcXVpY2tJbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBxdWlja0lucHV0QnV0dG9uVG9BY3Rpb24sIHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMsIHJlbmRlclF1aWNrSW5wdXREZXNjcmlwdGlvbiB9IGZyb20gJy4vcXVpY2tJbnB1dFV0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dExpc3QgfSBmcm9tICcuL3F1aWNrSW5wdXRMaXN0LmpzJztcbmltcG9ydCB0eXBlIHsgSUhvdmVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dFRyZWVDb250cm9sbGVyIH0gZnJvbSAnLi90cmVlL3F1aWNrSW5wdXRUcmVlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuZXhwb3J0IGNvbnN0IGluUXVpY2tJbnB1dENvbnRleHRLZXlWYWx1ZSA9ICdpblF1aWNrSW5wdXQnO1xuZXhwb3J0IGNvbnN0IEluUXVpY2tJbnB1dENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihpblF1aWNrSW5wdXRDb250ZXh0S2V5VmFsdWUsIGZhbHNlLCBsb2NhbGl6ZSgnaW5RdWlja0lucHV0JywgXCJXaGV0aGVyIGtleWJvYXJkIGZvY3VzIGlzIGluc2lkZSB0aGUgcXVpY2sgaW5wdXQgY29udHJvbFwiKSk7XG5leHBvcnQgY29uc3QgaW5RdWlja0lucHV0Q29udGV4dCA9IENvbnRleHRLZXlFeHByLmhhcyhpblF1aWNrSW5wdXRDb250ZXh0S2V5VmFsdWUpO1xuXG5leHBvcnQgY29uc3QgcXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXlWYWx1ZSA9ICdxdWlja0lucHV0QWxpZ25tZW50JztcbmV4cG9ydCBjb25zdCBRdWlja0lucHV0QWxpZ25tZW50Q29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PCd0b3AnIHwgJ2NlbnRlcicgfCB1bmRlZmluZWQ+KHF1aWNrSW5wdXRBbGlnbm1lbnRDb250ZXh0S2V5VmFsdWUsICd0b3AnLCBsb2NhbGl6ZSgncXVpY2tJbnB1dEFsaWdubWVudCcsIFwiVGhlIGFsaWdubWVudCBvZiB0aGUgcXVpY2sgaW5wdXRcIikpO1xuXG5leHBvcnQgY29uc3QgcXVpY2tJbnB1dFR5cGVDb250ZXh0S2V5VmFsdWUgPSAncXVpY2tJbnB1dFR5cGUnO1xuZXhwb3J0IGNvbnN0IFF1aWNrSW5wdXRUeXBlQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PFF1aWNrSW5wdXRUeXBlPihxdWlja0lucHV0VHlwZUNvbnRleHRLZXlWYWx1ZSwgdW5kZWZpbmVkLCBsb2NhbGl6ZSgncXVpY2tJbnB1dFR5cGUnLCBcIlRoZSB0eXBlIG9mIHRoZSBjdXJyZW50bHkgdmlzaWJsZSBxdWljayBpbnB1dFwiKSk7XG5cbmV4cG9ydCBjb25zdCBlbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0S2V5VmFsdWUgPSAnY3Vyc29yQXRFbmRPZlF1aWNrSW5wdXRCb3gnO1xuZXhwb3J0IGNvbnN0IEVuZE9mUXVpY2tJbnB1dEJveENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihlbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0S2V5VmFsdWUsIGZhbHNlLCBsb2NhbGl6ZSgnY3Vyc29yQXRFbmRPZlF1aWNrSW5wdXRCb3gnLCBcIldoZXRoZXIgdGhlIGN1cnNvciBpbiB0aGUgcXVpY2sgaW5wdXQgaXMgYXQgdGhlIGVuZCBvZiB0aGUgaW5wdXQgYm94XCIpKTtcbmV4cG9ydCBjb25zdCBlbmRPZlF1aWNrSW5wdXRCb3hDb250ZXh0ID0gQ29udGV4dEtleUV4cHIuaGFzKGVuZE9mUXVpY2tJbnB1dEJveENvbnRleHRLZXlWYWx1ZSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1aWNrSW5wdXRPcHRpb25zIHtcblx0aWRQcmVmaXg6IHN0cmluZztcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0aWdub3JlRm9jdXNPdXQoKTogYm9vbGVhbjtcblx0YmFja0tleWJpbmRpbmdMYWJlbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHNldENvbnRleHRLZXkoaWQ/OiBzdHJpbmcpOiB2b2lkO1xuXHRsaW5rT3BlbmVyRGVsZWdhdGUoY29udGVudDogc3RyaW5nKTogdm9pZDtcblx0cmV0dXJuRm9jdXMoKTogdm9pZDtcblx0LyoqXG5cdCAqIEB0b2RvIFdpdGggSUhvdmVyIGluIHZzL2VkaXRvciwgY2FuIHdlIGRlcGVuZCBvbiB0aGUgc2VydmljZSBkaXJlY3RseVxuXHQgKiBpbnN0ZWFkIG9mIHBhc3NpbmcgaXQgdGhyb3VnaCBhIGhvdmVyIGRlbGVnYXRlP1xuXHQgKi9cblx0aG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGU7XG5cdHN0eWxlczogSVF1aWNrSW5wdXRTdHlsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1aWNrSW5wdXRTdHlsZXMge1xuXHRyZWFkb25seSB3aWRnZXQ6IElRdWlja0lucHV0V2lkZ2V0U3R5bGVzO1xuXHRyZWFkb25seSBpbnB1dEJveDogSUlucHV0Qm94U3R5bGVzO1xuXHRyZWFkb25seSB0b2dnbGU6IElUb2dnbGVTdHlsZXM7XG5cdHJlYWRvbmx5IGNvdW50QmFkZ2U6IElDb3VudEJhZGdlU3R5bGVzO1xuXHRyZWFkb25seSBidXR0b246IElCdXR0b25TdHlsZXM7XG5cdHJlYWRvbmx5IHByb2dyZXNzQmFyOiBJUHJvZ3Jlc3NCYXJTdHlsZXM7XG5cdHJlYWRvbmx5IGtleWJpbmRpbmdMYWJlbDogSUtleWJpbmRpbmdMYWJlbFN0eWxlcztcblx0cmVhZG9ubHkgbGlzdDogSUxpc3RTdHlsZXM7XG5cdHJlYWRvbmx5IHBpY2tlckdyb3VwOiB7IHBpY2tlckdyb3VwQm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHBpY2tlckdyb3VwRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1aWNrSW5wdXRXaWRnZXRTdHlsZXMge1xuXHRyZWFkb25seSBxdWlja0lucHV0QmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBxdWlja0lucHV0Rm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBxdWlja0lucHV0VGl0bGVCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHdpZGdldEJvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB3aWRnZXRTaGFkb3c6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IHR5cGUgV3JpdGVhYmxlPFQ+ID0geyAtcmVhZG9ubHkgW1AgaW4ga2V5b2YgVF06IFRbUF0gfTtcblxuZXhwb3J0IGNvbnN0IGJhY2tCdXR0b24gPSB7XG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucXVpY2tJbnB1dEJhY2spLFxuXHR0b29sdGlwOiBsb2NhbGl6ZSgncXVpY2tJbnB1dC5iYWNrJywgXCJCYWNrXCIpLFxuXHRoYW5kbGU6IC0xIC8vIFRPRE9cbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgUXVpY2tJbnB1dFVJIHtcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0c3R5bGVTaGVldDogSFRNTFN0eWxlRWxlbWVudDtcblx0bGVmdEFjdGlvbkJhcjogVG9vbEJhcjtcblx0dGl0bGVCYXI6IEhUTUxFbGVtZW50O1xuXHR0aXRsZTogSFRNTEVsZW1lbnQ7XG5cdGRlc2NyaXB0aW9uMTogSFRNTEVsZW1lbnQ7XG5cdGRlc2NyaXB0aW9uMjogSFRNTEVsZW1lbnQ7XG5cdHdpZGdldDogSFRNTEVsZW1lbnQ7XG5cdHJpZ2h0QWN0aW9uQmFyOiBUb29sQmFyO1xuXHRpbmxpbmVBY3Rpb25CYXI6IFRvb2xCYXI7XG5cdGNoZWNrQWxsOiBUcmlTdGF0ZUNoZWNrYm94O1xuXHRpbnB1dENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGZpbHRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGlucHV0Qm94OiBRdWlja0lucHV0Qm94O1xuXHR2aXNpYmxlQ291bnRDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHR2aXNpYmxlQ291bnQ6IENvdW50QmFkZ2U7XG5cdGNvdW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0Y291bnQ6IENvdW50QmFkZ2U7XG5cdG9rQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0b2s6IEJ1dHRvbjtcblx0bWVzc2FnZTogSFRNTEVsZW1lbnQ7XG5cdGN1c3RvbUJ1dHRvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGN1c3RvbUJ1dHRvbjogQnV0dG9uO1xuXHRwcm9ncmVzc0JhcjogUHJvZ3Jlc3NCYXI7XG5cdGxpc3Q6IFF1aWNrSW5wdXRMaXN0O1xuXHR0cmVlOiBRdWlja0lucHV0VHJlZUNvbnRyb2xsZXI7XG5cdHJlYWRvbmx5IG9uRGlkQWNjZXB0OiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDdXN0b206IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJCdXR0b246IEV2ZW50PElRdWlja0lucHV0QnV0dG9uPjtcblx0aWdub3JlRm9jdXNPdXQ6IGJvb2xlYW47XG5cdGtleU1vZHM6IFdyaXRlYWJsZTxJS2V5TW9kcz47XG5cdHNob3coY29udHJvbGxlcjogUXVpY2tJbnB1dCk6IHZvaWQ7XG5cdHNldFZpc2liaWxpdGllcyh2aXNpYmlsaXRpZXM6IFZpc2liaWxpdGllcyk6IHZvaWQ7XG5cdHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQ7XG5cdHNldENvbnRleHRLZXkoY29udGV4dEtleT86IHN0cmluZyk6IHZvaWQ7XG5cdGxpbmtPcGVuZXJEZWxlZ2F0ZShjb250ZW50OiBzdHJpbmcpOiB2b2lkO1xuXHRoaWRlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIFZpc2liaWxpdGllcyA9IHtcblx0dGl0bGU/OiBib29sZWFuO1xuXHRkZXNjcmlwdGlvbj86IGJvb2xlYW47XG5cdGNoZWNrQWxsPzogYm9vbGVhbjtcblx0aW5wdXRCb3g/OiBib29sZWFuO1xuXHRjaGVja0JveD86IGJvb2xlYW47XG5cdHZpc2libGVDb3VudD86IGJvb2xlYW47XG5cdGNvdW50PzogYm9vbGVhbjtcblx0bWVzc2FnZT86IGJvb2xlYW47XG5cdGxpc3Q/OiBib29sZWFuO1xuXHR0cmVlPzogYm9vbGVhbjtcblx0b2s/OiBib29sZWFuO1xuXHRjdXN0b21CdXR0b24/OiBib29sZWFuO1xuXHRwcm9ncmVzc0Jhcj86IGJvb2xlYW47XG59O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgUXVpY2tJbnB1dCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUXVpY2tJbnB1dCB7XG5cdHByb3RlY3RlZCBzdGF0aWMgcmVhZG9ubHkgbm9Qcm9tcHRNZXNzYWdlID0gbG9jYWxpemUoJ2lucHV0TW9kZUVudHJ5JywgXCJQcmVzcyAnRW50ZXInIHRvIGNvbmZpcm0geW91ciBpbnB1dCBvciAnRXNjYXBlJyB0byBjYW5jZWxcIik7XG5cblx0cHJvdGVjdGVkIF92aXNpYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCd2aXNpYmxlJywgZmFsc2UpO1xuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGVwczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90b3RhbFN0ZXBzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2VuYWJsZWQgPSB0cnVlO1xuXHRwcml2YXRlIF9jb250ZXh0S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2J1c3kgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaWdub3JlRm9jdXNPdXQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbGVmdEJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0cHJpdmF0ZSBfcmlnaHRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdHByaXZhdGUgX2lubGluZUJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0cHJpdmF0ZSBfaW5wdXRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdHByaXZhdGUgYnV0dG9uc1VwZGF0ZWQgPSBmYWxzZTtcblx0cHJvdGVjdGVkIG5vVmFsaWRhdGlvbk1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IFF1aWNrSW5wdXQubm9Qcm9tcHRNZXNzYWdlO1xuXHRwcml2YXRlIF92YWxpZGF0aW9uTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0VmFsaWRhdGlvbk1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2V2ZXJpdHk6IFNldmVyaXR5ID0gU2V2ZXJpdHkuSWdub3JlO1xuXHRwcml2YXRlIF9sYXN0U2V2ZXJpdHk6IFNldmVyaXR5IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tJbnB1dEJ1dHRvbj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRIaWRlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja0lucHV0SGlkZUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbldpbGxIaWRlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja0lucHV0SGlkZUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpc3Bvc2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHZpc2libGVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBidXN5RGVsYXk6IFRpbWVvdXRUaW1lciB8IHVuZGVmaW5lZDtcblxuXHRhYnN0cmFjdCB0eXBlOiBRdWlja0lucHV0VHlwZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgdWk6IFF1aWNrSW5wdXRVSVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCB2aXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlLmdldCgpO1xuXHR9XG5cblx0Z2V0IHRpdGxlKCkge1xuXHRcdHJldHVybiB0aGlzLl90aXRsZTtcblx0fVxuXG5cdHNldCB0aXRsZSh0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fdGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGRlc2NyaXB0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9kZXNjcmlwdGlvbjtcblx0fVxuXG5cdHNldCBkZXNjcmlwdGlvbihkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHN0ZXAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0ZXBzO1xuXHR9XG5cblx0c2V0IHN0ZXAoc3RlcDogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fc3RlcHMgPSBzdGVwO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgdG90YWxTdGVwcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fdG90YWxTdGVwcztcblx0fVxuXG5cdHNldCB0b3RhbFN0ZXBzKHRvdGFsU3RlcHM6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3RvdGFsU3RlcHMgPSB0b3RhbFN0ZXBzO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgZW5hYmxlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZDtcblx0fVxuXG5cdHNldCBlbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9lbmFibGVkID0gZW5hYmxlZDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGNvbnRleHRLZXkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRLZXk7XG5cdH1cblxuXHRzZXQgY29udGV4dEtleShjb250ZXh0S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jb250ZXh0S2V5ID0gY29udGV4dEtleTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGJ1c3koKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1c3k7XG5cdH1cblxuXHRzZXQgYnVzeShidXN5OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fYnVzeSA9IGJ1c3k7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBpZ25vcmVGb2N1c091dCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faWdub3JlRm9jdXNPdXQ7XG5cdH1cblxuXHRzZXQgaWdub3JlRm9jdXNPdXQoaWdub3JlRm9jdXNPdXQ6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBzaG91bGRVcGRhdGUgPSB0aGlzLl9pZ25vcmVGb2N1c091dCAhPT0gaWdub3JlRm9jdXNPdXQgJiYgIWlzSU9TO1xuXHRcdHRoaXMuX2lnbm9yZUZvY3VzT3V0ID0gaWdub3JlRm9jdXNPdXQgJiYgIWlzSU9TO1xuXHRcdGlmIChzaG91bGRVcGRhdGUpIHtcblx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldCB0aXRsZUJ1dHRvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xlZnRCdXR0b25zLmxlbmd0aFxuXHRcdFx0PyBbLi4udGhpcy5fbGVmdEJ1dHRvbnMsIHRoaXMuX3JpZ2h0QnV0dG9uc11cblx0XHRcdDogdGhpcy5fcmlnaHRCdXR0b25zO1xuXHR9XG5cblx0Z2V0IGJ1dHRvbnMoKSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLnRoaXMuX2xlZnRCdXR0b25zLFxuXHRcdFx0Li4udGhpcy5fcmlnaHRCdXR0b25zLFxuXHRcdFx0Li4udGhpcy5faW5saW5lQnV0dG9ucyxcblx0XHRcdC4uLnRoaXMuX2lucHV0QnV0dG9uc1xuXHRcdF07XG5cdH1cblxuXHRzZXQgYnV0dG9ucyhidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdKSB7XG5cdFx0Y29uc3QgbGVmdEJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0XHRjb25zdCByaWdodEJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0XHRjb25zdCBpbmxpbmVCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0Y29uc3QgaW5wdXRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGJ1dHRvbiBvZiBidXR0b25zKSB7XG5cdFx0XHRpZiAoYnV0dG9uID09PSBiYWNrQnV0dG9uKSB7XG5cdFx0XHRcdGxlZnRCdXR0b25zLnB1c2goYnV0dG9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN3aXRjaCAoYnV0dG9uLmxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0Y2FzZSBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24uSW5saW5lOlxuXHRcdFx0XHRcdFx0aW5saW5lQnV0dG9ucy5wdXNoKGJ1dHRvbik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbi5JbnB1dDpcblx0XHRcdFx0XHRcdGlucHV0QnV0dG9ucy5wdXNoKGJ1dHRvbik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmlnaHRCdXR0b25zLnB1c2goYnV0dG9uKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGVmdEJ1dHRvbnMgPSBsZWZ0QnV0dG9ucztcblx0XHR0aGlzLl9yaWdodEJ1dHRvbnMgPSByaWdodEJ1dHRvbnM7XG5cdFx0dGhpcy5faW5saW5lQnV0dG9ucyA9IGlubGluZUJ1dHRvbnM7XG5cdFx0dGhpcy5faW5wdXRCdXR0b25zID0gaW5wdXRCdXR0b25zO1xuXHRcdHRoaXMuYnV0dG9uc1VwZGF0ZWQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgdmFsaWRhdGlvbk1lc3NhZ2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlO1xuXHR9XG5cblx0c2V0IHZhbGlkYXRpb25NZXNzYWdlKHZhbGlkYXRpb25NZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl92YWxpZGF0aW9uTWVzc2FnZSA9IHZhbGlkYXRpb25NZXNzYWdlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgc2V2ZXJpdHkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NldmVyaXR5O1xuXHR9XG5cblx0c2V0IHNldmVyaXR5KHNldmVyaXR5OiBTZXZlcml0eSkge1xuXHRcdHRoaXMuX3NldmVyaXR5ID0gc2V2ZXJpdHk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlckJ1dHRvbiA9IHRoaXMub25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5ldmVudDtcblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0dGhpcy51aS5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuYnV0dG9ucy5pbmRleE9mKGJ1dHRvbikgIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyLmZpcmUoYnV0dG9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0KTtcblx0XHR0aGlzLnVpLnNob3codGhpcyk7XG5cblx0XHQvLyB1cGRhdGUgcHJvcGVydGllcyBpbiB0aGUgY29udHJvbGxlciB0aGF0IGdldCByZXNldCBpbiB0aGUgdWkuc2hvdygpIGNhbGxcblx0XHR0aGlzLl92aXNpYmxlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdC8vIFRoaXMgZW5zdXJlcyB0aGUgbWVzc2FnZS9wcm9tcHQgZ2V0cyByZW5kZXJlZFxuXHRcdHRoaXMuX2xhc3RWYWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHQvLyBUaGlzIGVuc3VyZXMgdGhlIGlucHV0IGJveCBoYXMgdGhlIHJpZ2h0IHNldmVyaXR5IGFwcGxpZWRcblx0XHR0aGlzLl9sYXN0U2V2ZXJpdHkgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuYnV0dG9ucy5sZW5ndGgpIHtcblx0XHRcdC8vIGlmIHRoZXJlIGFyZSBidXR0b25zLCB0aGUgdWkuc2hvdygpIGNsZWFycyB0aGVtIG91dCBvZiB0aGUgVUkgc28gd2Ugc2hvdWxkXG5cdFx0XHQvLyByZXJlbmRlciB0aGVtLlxuXHRcdFx0dGhpcy5idXR0b25zVXBkYXRlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy51aS5oaWRlKCk7XG5cdH1cblxuXHRkaWRIaWRlKHJlYXNvbiA9IFF1aWNrSW5wdXRIaWRlUmVhc29uLk90aGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLm9uRGlkSGlkZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbiB9KTtcblx0fVxuXG5cdHJlYWRvbmx5IG9uRGlkSGlkZSA9IHRoaXMub25EaWRIaWRlRW1pdHRlci5ldmVudDtcblxuXHR3aWxsSGlkZShyZWFzb24gPSBRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlcik6IHZvaWQge1xuXHRcdHRoaXMub25XaWxsSGlkZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbiB9KTtcblx0fVxuXHRyZWFkb25seSBvbldpbGxIaWRlID0gdGhpcy5vbldpbGxIaWRlRW1pdHRlci5ldmVudDtcblxuXHRwcm90ZWN0ZWQgdXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5nZXRUaXRsZSgpO1xuXHRcdGlmICh0aXRsZSAmJiB0aGlzLnVpLnRpdGxlLnRleHRDb250ZW50ICE9PSB0aXRsZSkge1xuXHRcdFx0dGhpcy51aS50aXRsZS50ZXh0Q29udGVudCA9IHRpdGxlO1xuXHRcdH0gZWxzZSBpZiAoIXRpdGxlICYmIHRoaXMudWkudGl0bGUuaW5uZXJIVE1MICE9PSAnJm5ic3A7Jykge1xuXHRcdFx0dGhpcy51aS50aXRsZS5pbm5lclRleHQgPSAnXFx1MDBhMCc7XG5cdFx0fVxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5nZXREZXNjcmlwdGlvbigpO1xuXHRcdGlmICh0aGlzLnVpLmRlc2NyaXB0aW9uMS50ZXh0Q29udGVudCAhPT0gZGVzY3JpcHRpb24pIHtcblx0XHRcdHRoaXMudWkuZGVzY3JpcHRpb24xLnRleHRDb250ZW50ID0gZGVzY3JpcHRpb247XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVpLmRlc2NyaXB0aW9uMi50ZXh0Q29udGVudCAhPT0gZGVzY3JpcHRpb24pIHtcblx0XHRcdHRoaXMudWkuZGVzY3JpcHRpb24yLnRleHRDb250ZW50ID0gZGVzY3JpcHRpb247XG5cdFx0fVxuXHRcdGlmICh0aGlzLmJ1c3kgJiYgIXRoaXMuYnVzeURlbGF5KSB7XG5cdFx0XHR0aGlzLmJ1c3lEZWxheSA9IG5ldyBUaW1lb3V0VGltZXIoKTtcblx0XHRcdHRoaXMuYnVzeURlbGF5LnNldElmTm90U2V0KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMudWkucHJvZ3Jlc3NCYXIuaW5maW5pdGUoKTtcblx0XHRcdFx0XHR0aGlzLnVpLnByb2dyZXNzQmFyLmdldENvbnRhaW5lcigpLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgODAwKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmJ1c3kgJiYgdGhpcy5idXN5RGVsYXkpIHtcblx0XHRcdHRoaXMudWkucHJvZ3Jlc3NCYXIuc3RvcCgpO1xuXHRcdFx0dGhpcy51aS5wcm9ncmVzc0Jhci5nZXRDb250YWluZXIoKS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdHRoaXMuYnVzeURlbGF5LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5idXN5RGVsYXkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmJ1dHRvbnNVcGRhdGVkKSB7XG5cdFx0XHR0aGlzLmJ1dHRvbnNVcGRhdGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBsZWZ0QWN0aW9ucyA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoXG5cdFx0XHRcdHRoaXMuX2xlZnRCdXR0b25zLFxuXHRcdFx0XHQnbGVmdC1idXR0b24nLFxuXHRcdFx0XHQoYnV0dG9uKSA9PiB0aGlzLm9uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIuZmlyZShidXR0b24pXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy51aS5sZWZ0QWN0aW9uQmFyLnNldEFjdGlvbnMobGVmdEFjdGlvbnMucHJpbWFyeSwgbGVmdEFjdGlvbnMuc2Vjb25kYXJ5KTtcblx0XHRcdGNvbnN0IHJpZ2h0QWN0aW9ucyA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoXG5cdFx0XHRcdHRoaXMuX3JpZ2h0QnV0dG9ucyxcblx0XHRcdFx0J3JpZ2h0LWJ1dHRvbicsXG5cdFx0XHRcdChidXR0b24pID0+IHRoaXMub25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5maXJlKGJ1dHRvbilcblx0XHRcdCk7XG5cdFx0XHR0aGlzLnVpLnJpZ2h0QWN0aW9uQmFyLnNldEFjdGlvbnMocmlnaHRBY3Rpb25zLnByaW1hcnksIHJpZ2h0QWN0aW9ucy5zZWNvbmRhcnkpO1xuXHRcdFx0Y29uc3QgaW5saW5lQWN0aW9ucyA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoXG5cdFx0XHRcdHRoaXMuX2lubGluZUJ1dHRvbnMsXG5cdFx0XHRcdCdpbmxpbmUtYnV0dG9uJyxcblx0XHRcdFx0KGJ1dHRvbikgPT4gdGhpcy5vbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyLmZpcmUoYnV0dG9uKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMudWkuaW5saW5lQWN0aW9uQmFyLnNldEFjdGlvbnMoaW5saW5lQWN0aW9ucy5wcmltYXJ5LCBpbmxpbmVBY3Rpb25zLnNlY29uZGFyeSk7XG5cdFx0XHQvLyBBZGp1c3QgY291bnQgYmFkZ2UgcG9zaXRpb24gYmFzZWQgb24gaW5wdXQgYnV0dG9ucyAoZWFjaCBidXR0b24vdG9nZ2xlIGlzIH4yMnB4IHdpZGUpXG5cdFx0XHRjb25zdCBpbnB1dEJ1dHRvbk9mZnNldCA9IHRoaXMuX2lucHV0QnV0dG9ucy5sZW5ndGggKiAyMjtcblx0XHRcdHRoaXMudWkuY291bnRDb250YWluZXIuc3R5bGUucmlnaHQgPSBpbnB1dEJ1dHRvbk9mZnNldCA+IDAgPyBgJHs0ICsgaW5wdXRCdXR0b25PZmZzZXR9cHhgIDogJzRweCc7XG5cdFx0XHR0aGlzLnVpLmlucHV0Qm94LmFjdGlvbnMgPSB0aGlzLl9pbnB1dEJ1dHRvbnNcblx0XHRcdFx0Lm1hcCgoYnV0dG9uLCBpbmRleCkgPT4gcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uKFxuXHRcdFx0XHRcdGJ1dHRvbixcblx0XHRcdFx0XHRgaWQtJHtpbmRleH1gLFxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHRoaXMub25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5maXJlKGJ1dHRvbilcblx0XHRcdFx0KSk7XG5cdFx0fVxuXHRcdHRoaXMudWkuaWdub3JlRm9jdXNPdXQgPSB0aGlzLmlnbm9yZUZvY3VzT3V0O1xuXHRcdHRoaXMudWkuc2V0RW5hYmxlZCh0aGlzLmVuYWJsZWQpO1xuXHRcdHRoaXMudWkuc2V0Q29udGV4dEtleSh0aGlzLmNvbnRleHRLZXkpO1xuXG5cdFx0Y29uc3QgdmFsaWRhdGlvbk1lc3NhZ2UgPSB0aGlzLnZhbGlkYXRpb25NZXNzYWdlIHx8IHRoaXMubm9WYWxpZGF0aW9uTWVzc2FnZTtcblx0XHRpZiAodGhpcy5fbGFzdFZhbGlkYXRpb25NZXNzYWdlICE9PSB2YWxpZGF0aW9uTWVzc2FnZSkge1xuXHRcdFx0dGhpcy5fbGFzdFZhbGlkYXRpb25NZXNzYWdlID0gdmFsaWRhdGlvbk1lc3NhZ2U7XG5cdFx0XHRkb20ucmVzZXQodGhpcy51aS5tZXNzYWdlKTtcblx0XHRcdGlmICh2YWxpZGF0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRyZW5kZXJRdWlja0lucHV0RGVzY3JpcHRpb24odmFsaWRhdGlvbk1lc3NhZ2UsIHRoaXMudWkubWVzc2FnZSwge1xuXHRcdFx0XHRcdGNhbGxiYWNrOiAoY29udGVudCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy51aS5saW5rT3BlbmVyRGVsZWdhdGUoY29udGVudCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkaXNwb3NhYmxlczogdGhpcy52aXNpYmxlRGlzcG9zYWJsZXMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fbGFzdFNldmVyaXR5ICE9PSB0aGlzLnNldmVyaXR5KSB7XG5cdFx0XHR0aGlzLl9sYXN0U2V2ZXJpdHkgPSB0aGlzLnNldmVyaXR5O1xuXHRcdFx0dGhpcy5zaG93TWVzc2FnZURlY29yYXRpb24odGhpcy5zZXZlcml0eSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUaXRsZSgpIHtcblx0XHRpZiAodGhpcy50aXRsZSAmJiB0aGlzLnN0ZXApIHtcblx0XHRcdHJldHVybiBgJHt0aGlzLnRpdGxlfSAoJHt0aGlzLmdldFN0ZXBzKCl9KWA7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50aXRsZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc3RlcCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0U3RlcHMoKTtcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZXNjcmlwdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5kZXNjcmlwdGlvbiB8fCAnJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RlcHMoKSB7XG5cdFx0aWYgKHRoaXMuc3RlcCAmJiB0aGlzLnRvdGFsU3RlcHMpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncXVpY2tJbnB1dC5zdGVwcycsIFwiezB9L3sxfVwiLCB0aGlzLnN0ZXAsIHRoaXMudG90YWxTdGVwcyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN0ZXApIHtcblx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5zdGVwKTtcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIHNob3dNZXNzYWdlRGVjb3JhdGlvbihzZXZlcml0eTogU2V2ZXJpdHkpIHtcblx0XHR0aGlzLnVpLmlucHV0Qm94LnNob3dEZWNvcmF0aW9uKHNldmVyaXR5KTtcblx0XHRpZiAoc2V2ZXJpdHkgIT09IFNldmVyaXR5Lklnbm9yZSkge1xuXHRcdFx0Y29uc3Qgc3R5bGVzID0gdGhpcy51aS5pbnB1dEJveC5zdHlsZXNGb3JUeXBlKHNldmVyaXR5KTtcblx0XHRcdHRoaXMudWkubWVzc2FnZS5zdHlsZS5jb2xvciA9IHN0eWxlcy5mb3JlZ3JvdW5kID8gYCR7c3R5bGVzLmZvcmVncm91bmR9YCA6ICcnO1xuXHRcdFx0dGhpcy51aS5tZXNzYWdlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHN0eWxlcy5iYWNrZ3JvdW5kID8gYCR7c3R5bGVzLmJhY2tncm91bmR9YCA6ICcnO1xuXHRcdFx0dGhpcy51aS5tZXNzYWdlLnN0eWxlLmJvcmRlciA9IHN0eWxlcy5ib3JkZXIgPyBgMXB4IHNvbGlkICR7c3R5bGVzLmJvcmRlcn1gIDogJyc7XG5cdFx0XHR0aGlzLnVpLm1lc3NhZ2Uuc3R5bGUubWFyZ2luQm90dG9tID0gJy0ycHgnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnVpLm1lc3NhZ2Uuc3R5bGUuY29sb3IgPSAnJztcblx0XHRcdHRoaXMudWkubWVzc2FnZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAnJztcblx0XHRcdHRoaXMudWkubWVzc2FnZS5zdHlsZS5ib3JkZXIgPSAnJztcblx0XHRcdHRoaXMudWkubWVzc2FnZS5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnJztcblx0XHR9XG5cdH1cblxuXHRyZWFkb25seSBvbkRpc3Bvc2UgPSB0aGlzLm9uRGlzcG9zZUVtaXR0ZXIuZXZlbnQ7XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmhpZGUoKTtcblx0XHR0aGlzLm9uRGlzcG9zZUVtaXR0ZXIuZmlyZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja1BpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtLCBPIGV4dGVuZHMgeyB1c2VTZXBhcmF0b3JzOiBib29sZWFuIH0gPSB7IHVzZVNlcGFyYXRvcnM6IGZhbHNlIH0+IGV4dGVuZHMgUXVpY2tJbnB1dCBpbXBsZW1lbnRzIElRdWlja1BpY2s8VCwgTz4ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfQVJJQV9MQUJFTCA9IGxvY2FsaXplKCdxdWlja0lucHV0Qm94LmFyaWFMYWJlbCcsIFwiVHlwZSB0byBuYXJyb3cgZG93biByZXN1bHRzLlwiKTtcblxuXHRwcml2YXRlIF92YWx1ZSA9ICcnO1xuXHRwcml2YXRlIF9hcmlhTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGxhY2Vob2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZVZhbHVlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25XaWxsQWNjZXB0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja1BpY2tXaWxsQWNjZXB0RXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQWNjZXB0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja1BpY2tEaWRBY2NlcHRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDdXN0b21FbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgX2l0ZW1zOiBPIGV4dGVuZHMgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0gPyBBcnJheTxUIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gOiBBcnJheTxUPiA9IFtdO1xuXHRwcml2YXRlIGl0ZW1zVXBkYXRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9jYW5TZWxlY3RNYW55ID0gZmFsc2U7XG5cdHByaXZhdGUgX2NhbkFjY2VwdEluQmFja2dyb3VuZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9tYXRjaE9uRGVzY3JpcHRpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfbWF0Y2hPbkRldGFpbCA9IGZhbHNlO1xuXHRwcml2YXRlIF9tYXRjaE9uTGFiZWwgPSB0cnVlO1xuXHRwcml2YXRlIF9tYXRjaE9uTGFiZWxNb2RlOiAnZnV6enknIHwgJ2NvbnRpZ3VvdXMnID0gJ2Z1enp5Jztcblx0cHJpdmF0ZSBfc29ydEJ5TGFiZWwgPSB0cnVlO1xuXHRwcml2YXRlIF9rZWVwU2Nyb2xsUG9zaXRpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXRlbUFjdGl2YXRpb24gPSBJdGVtQWN0aXZhdGlvbi5GSVJTVDtcblx0cHJpdmF0ZSBfYWN0aXZlSXRlbXM6IFRbXSA9IFtdO1xuXHRwcml2YXRlIGFjdGl2ZUl0ZW1zVXBkYXRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGFjdGl2ZUl0ZW1zVG9Db25maXJtOiBUW10gfCBudWxsID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VFtdPigpKTtcblx0cHJpdmF0ZSBfc2VsZWN0ZWRJdGVtczogVFtdID0gW107XG5cdHByaXZhdGUgc2VsZWN0ZWRJdGVtc1VwZGF0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBzZWxlY3RlZEl0ZW1zVG9Db25maXJtOiBUW10gfCBudWxsID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VFtdPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFRyaWdnZXJJdGVtQnV0dG9uRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQ8VD4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbkVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrU2VwYXJhdG9yQnV0dG9uRXZlbnQ+KCkpO1xuXHRwcml2YXRlIF92YWx1ZVNlbGVjdGlvbjogUmVhZG9ubHk8W251bWJlciwgbnVtYmVyXT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdmFsdWVTZWxlY3Rpb25VcGRhdGVkID0gdHJ1ZTtcblx0cHJpdmF0ZSBfb2s6IGJvb2xlYW4gfCAnZGVmYXVsdCcgPSAnZGVmYXVsdCc7XG5cdHByaXZhdGUgX29rTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VzdG9tQnV0dG9uID0gZmFsc2U7XG5cdHByaXZhdGUgX2N1c3RvbUJ1dHRvbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1c3RvbUJ1dHRvbkhvdmVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1c3RvbUJ1dHRvblNlY29uZGFyeSA9IGZhbHNlO1xuXHRwcml2YXRlIF9xdWlja05hdmlnYXRlOiBJUXVpY2tOYXZpZ2F0ZUNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hpZGVJbnB1dDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGlkZUNvdW50QmFkZ2U6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hpZGVDaGVja0FsbDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9jdXNFdmVudEJ1ZmZlcmVyID0gbmV3IEV2ZW50QnVmZmVyZXIoKTtcblxuXHRyZWFkb25seSB0eXBlID0gUXVpY2tJbnB1dFR5cGUuUXVpY2tQaWNrO1xuXG5cdGNvbnN0cnVjdG9yKHVpOiBRdWlja0lucHV0VUkpIHtcblx0XHRzdXBlcih1aSk7XG5cdFx0dGhpcy5ub1ZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHF1aWNrTmF2aWdhdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrTmF2aWdhdGU7XG5cdH1cblxuXHRzZXQgcXVpY2tOYXZpZ2F0ZShxdWlja05hdmlnYXRlOiBJUXVpY2tOYXZpZ2F0ZUNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9xdWlja05hdmlnYXRlID0gcXVpY2tOYXZpZ2F0ZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZTtcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5kb1NldFZhbHVlKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TZXRWYWx1ZSh2YWx1ZTogc3RyaW5nLCBza2lwVXBkYXRlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92YWx1ZSAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0XHRpZiAoIXNraXBVcGRhdGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0Y29uc3QgZGlkRmlsdGVyID0gdGhpcy51aS5saXN0LmZpbHRlcih0aGlzLmZpbHRlclZhbHVlKHRoaXMuX3ZhbHVlKSk7XG5cdFx0XHRcdGlmIChkaWRGaWx0ZXIpIHtcblx0XHRcdFx0XHR0aGlzLnRyeVNlbGVjdEZpcnN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMub25EaWRDaGFuZ2VWYWx1ZUVtaXR0ZXIuZmlyZSh0aGlzLl92YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0ZmlsdGVyVmFsdWUgPSAodmFsdWU6IHN0cmluZykgPT4gdmFsdWU7XG5cblx0c2V0IGFyaWFMYWJlbChhcmlhTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2FyaWFMYWJlbCA9IGFyaWFMYWJlbDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGFyaWFMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJpYUxhYmVsO1xuXHR9XG5cblx0Z2V0IHBsYWNlaG9sZGVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9wbGFjZWhvbGRlcjtcblx0fVxuXG5cdHNldCBwbGFjZWhvbGRlcihwbGFjZWhvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fcGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHByb21wdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5ub1ZhbGlkYXRpb25NZXNzYWdlO1xuXHR9XG5cblx0c2V0IHByb21wdChwcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMubm9WYWxpZGF0aW9uTWVzc2FnZSA9IHByb21wdDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0b25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMub25EaWRDaGFuZ2VWYWx1ZUVtaXR0ZXIuZXZlbnQ7XG5cblx0b25XaWxsQWNjZXB0ID0gdGhpcy5vbldpbGxBY2NlcHRFbWl0dGVyLmV2ZW50O1xuXHRvbkRpZEFjY2VwdCA9IHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmV2ZW50O1xuXG5cdG9uRGlkQ3VzdG9tID0gdGhpcy5vbkRpZEN1c3RvbUVtaXR0ZXIuZXZlbnQ7XG5cblx0Z2V0IGl0ZW1zKCkge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtcztcblx0fVxuXG5cdGdldCBzY3JvbGxUb3AoKSB7XG5cdFx0cmV0dXJuIHRoaXMudWkubGlzdC5zY3JvbGxUb3A7XG5cdH1cblxuXHRwcml2YXRlIHNldCBzY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcblx0XHR0aGlzLnVpLmxpc3Quc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuXHR9XG5cblx0c2V0IGl0ZW1zKGl0ZW1zOiBPIGV4dGVuZHMgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0gPyBBcnJheTxUIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gOiBBcnJheTxUPikge1xuXHRcdHRoaXMuX2l0ZW1zID0gaXRlbXM7XG5cdFx0dGhpcy5pdGVtc1VwZGF0ZWQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgY2FuU2VsZWN0TWFueSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuU2VsZWN0TWFueTtcblx0fVxuXG5cdHNldCBjYW5TZWxlY3RNYW55KGNhblNlbGVjdE1hbnk6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9jYW5TZWxlY3RNYW55ID0gY2FuU2VsZWN0TWFueTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGNhbkFjY2VwdEluQmFja2dyb3VuZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuQWNjZXB0SW5CYWNrZ3JvdW5kO1xuXHR9XG5cblx0c2V0IGNhbkFjY2VwdEluQmFja2dyb3VuZChjYW5BY2NlcHRJbkJhY2tncm91bmQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9jYW5BY2NlcHRJbkJhY2tncm91bmQgPSBjYW5BY2NlcHRJbkJhY2tncm91bmQ7XG5cdH1cblxuXHRnZXQgbWF0Y2hPbkRlc2NyaXB0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9tYXRjaE9uRGVzY3JpcHRpb247XG5cdH1cblxuXHRzZXQgbWF0Y2hPbkRlc2NyaXB0aW9uKG1hdGNoT25EZXNjcmlwdGlvbjogYm9vbGVhbikge1xuXHRcdHRoaXMuX21hdGNoT25EZXNjcmlwdGlvbiA9IG1hdGNoT25EZXNjcmlwdGlvbjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IG1hdGNoT25EZXRhaWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hdGNoT25EZXRhaWw7XG5cdH1cblxuXHRzZXQgbWF0Y2hPbkRldGFpbChtYXRjaE9uRGV0YWlsOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWF0Y2hPbkRldGFpbCA9IG1hdGNoT25EZXRhaWw7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBtYXRjaE9uTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hdGNoT25MYWJlbDtcblx0fVxuXG5cdHNldCBtYXRjaE9uTGFiZWwobWF0Y2hPbkxhYmVsOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWF0Y2hPbkxhYmVsID0gbWF0Y2hPbkxhYmVsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgbWF0Y2hPbkxhYmVsTW9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbkxhYmVsTW9kZTtcblx0fVxuXG5cdHNldCBtYXRjaE9uTGFiZWxNb2RlKG1hdGNoT25MYWJlbE1vZGU6ICdmdXp6eScgfCAnY29udGlndW91cycpIHtcblx0XHR0aGlzLl9tYXRjaE9uTGFiZWxNb2RlID0gbWF0Y2hPbkxhYmVsTW9kZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IHNvcnRCeUxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9zb3J0QnlMYWJlbDtcblx0fVxuXG5cdHNldCBzb3J0QnlMYWJlbChzb3J0QnlMYWJlbDogYm9vbGVhbikge1xuXHRcdHRoaXMuX3NvcnRCeUxhYmVsID0gc29ydEJ5TGFiZWw7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBrZWVwU2Nyb2xsUG9zaXRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2tlZXBTY3JvbGxQb3NpdGlvbjtcblx0fVxuXG5cdHNldCBrZWVwU2Nyb2xsUG9zaXRpb24oa2VlcFNjcm9sbFBvc2l0aW9uOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fa2VlcFNjcm9sbFBvc2l0aW9uID0ga2VlcFNjcm9sbFBvc2l0aW9uO1xuXHR9XG5cblx0Z2V0IGl0ZW1BY3RpdmF0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtQWN0aXZhdGlvbjtcblx0fVxuXG5cdHNldCBpdGVtQWN0aXZhdGlvbihpdGVtQWN0aXZhdGlvbjogSXRlbUFjdGl2YXRpb24pIHtcblx0XHR0aGlzLl9pdGVtQWN0aXZhdGlvbiA9IGl0ZW1BY3RpdmF0aW9uO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUl0ZW1zKCkge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVJdGVtcztcblx0fVxuXG5cdHNldCBhY3RpdmVJdGVtcyhhY3RpdmVJdGVtczogVFtdKSB7XG5cdFx0dGhpcy5fYWN0aXZlSXRlbXMgPSBhY3RpdmVJdGVtcztcblx0XHR0aGlzLmFjdGl2ZUl0ZW1zVXBkYXRlZCA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdG9uRGlkQ2hhbmdlQWN0aXZlID0gdGhpcy5vbkRpZENoYW5nZUFjdGl2ZUVtaXR0ZXIuZXZlbnQ7XG5cblx0Z2V0IHNlbGVjdGVkSXRlbXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbGVjdGVkSXRlbXM7XG5cdH1cblxuXHRzZXQgc2VsZWN0ZWRJdGVtcyhzZWxlY3RlZEl0ZW1zOiBUW10pIHtcblx0XHR0aGlzLl9zZWxlY3RlZEl0ZW1zID0gc2VsZWN0ZWRJdGVtcztcblx0XHR0aGlzLnNlbGVjdGVkSXRlbXNVcGRhdGVkID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGtleU1vZHMoKSB7XG5cdFx0aWYgKHRoaXMuX3F1aWNrTmF2aWdhdGUpIHtcblx0XHRcdC8vIERpc2FibGUga2V5TW9kcyB3aGVuIHF1aWNrIG5hdmlnYXRlIGlzIGVuYWJsZWRcblx0XHRcdC8vIGJlY2F1c2UgaW4gdGhpcyBtb2RlbCB0aGUgaW50ZXJhY3Rpb24gaXMgcHVyZWx5XG5cdFx0XHQvLyBrZXlib2FyZCBkcml2ZW4gYW5kIEN0cmwvQWx0IGFyZSB0eXBpY2FsbHlcblx0XHRcdC8vIHByZXNzZWQgYW5kIGhvbGQgZHVyaW5nIHRoaXMgaW50ZXJhY3Rpb24uXG5cdFx0XHRyZXR1cm4gTk9fS0VZX01PRFM7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnVpLmtleU1vZHM7XG5cdH1cblxuXHRnZXQgdmFsdWVTZWxlY3Rpb24oKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy51aS5pbnB1dEJveC5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIFtzZWxlY3Rpb24uc3RhcnQsIHNlbGVjdGlvbi5lbmRdO1xuXHR9XG5cblx0c2V0IHZhbHVlU2VsZWN0aW9uKHZhbHVlU2VsZWN0aW9uOiBSZWFkb25seTxbbnVtYmVyLCBudW1iZXJdPiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3ZhbHVlU2VsZWN0aW9uID0gdmFsdWVTZWxlY3Rpb247XG5cdFx0dGhpcy52YWx1ZVNlbGVjdGlvblVwZGF0ZWQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgY3VzdG9tQnV0dG9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21CdXR0b247XG5cdH1cblxuXHRzZXQgY3VzdG9tQnV0dG9uKHNob3dDdXN0b21CdXR0b246IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9jdXN0b21CdXR0b24gPSBzaG93Q3VzdG9tQnV0dG9uO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgY3VzdG9tTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbUJ1dHRvbkxhYmVsO1xuXHR9XG5cblx0c2V0IGN1c3RvbUxhYmVsKGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jdXN0b21CdXR0b25MYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgY3VzdG9tSG92ZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbUJ1dHRvbkhvdmVyO1xuXHR9XG5cblx0c2V0IGN1c3RvbUhvdmVyKGhvdmVyOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jdXN0b21CdXR0b25Ib3ZlciA9IGhvdmVyO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgY3VzdG9tQnV0dG9uU2Vjb25kYXJ5KCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21CdXR0b25TZWNvbmRhcnk7XG5cdH1cblxuXHRzZXQgY3VzdG9tQnV0dG9uU2Vjb25kYXJ5KHNlY29uZGFyeTogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2N1c3RvbUJ1dHRvblNlY29uZGFyeSA9IHNlY29uZGFyeSA/PyBmYWxzZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IG9rKCkge1xuXHRcdHJldHVybiB0aGlzLl9vaztcblx0fVxuXG5cdHNldCBvayhzaG93T2tCdXR0b246IGJvb2xlYW4gfCAnZGVmYXVsdCcpIHtcblx0XHR0aGlzLl9vayA9IHNob3dPa0J1dHRvbjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IG9rTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX29rTGFiZWwgPz8gbG9jYWxpemUoJ29rJywgXCJPS1wiKTtcblx0fVxuXG5cdHNldCBva0xhYmVsKG9rTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX29rTGFiZWwgPSBva0xhYmVsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRpbnB1dEhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpc2libGUgPyB0aGlzLnVpLmlucHV0Qm94Lmhhc0ZvY3VzKCkgOiBmYWxzZTtcblx0fVxuXG5cdGZvY3VzT25JbnB1dCgpIHtcblx0XHR0aGlzLnVpLmlucHV0Qm94LnNldEZvY3VzKCk7XG5cdH1cblxuXHRnZXQgaGlkZUlucHV0KCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2hpZGVJbnB1dDtcblx0fVxuXG5cdHNldCBoaWRlSW5wdXQoaGlkZUlucHV0OiBib29sZWFuKSB7XG5cdFx0dGhpcy5faGlkZUlucHV0ID0gaGlkZUlucHV0O1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgaGlkZUNvdW50QmFkZ2UoKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5faGlkZUNvdW50QmFkZ2U7XG5cdH1cblxuXHRzZXQgaGlkZUNvdW50QmFkZ2UoaGlkZUNvdW50QmFkZ2U6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9oaWRlQ291bnRCYWRnZSA9IGhpZGVDb3VudEJhZGdlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgaGlkZUNoZWNrQWxsKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2hpZGVDaGVja0FsbDtcblx0fVxuXG5cdHNldCBoaWRlQ2hlY2tBbGwoaGlkZUNoZWNrQWxsOiBib29sZWFuKSB7XG5cdFx0dGhpcy5faGlkZUNoZWNrQWxsID0gaGlkZUNoZWNrQWxsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmV2ZW50O1xuXG5cdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b24gPSB0aGlzLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b25FbWl0dGVyLmV2ZW50O1xuXG5cdG9uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbiA9IHRoaXMub25EaWRUcmlnZ2VyU2VwYXJhdG9yQnV0dG9uRW1pdHRlci5ldmVudDtcblxuXHRwcml2YXRlIHRyeVNlbGVjdEZpcnN0KCkge1xuXHRcdGlmICghdGhpcy5jYW5TZWxlY3RNYW55KSB7XG5cdFx0XHR0aGlzLnVpLmxpc3QuZm9jdXMoUXVpY2tQaWNrRm9jdXMuRmlyc3QpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNob3coKSB7XG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0dGhpcy51aS5pbnB1dEJveC5vbkRpZENoYW5nZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5kb1NldFZhbHVlKHZhbHVlLCB0cnVlIC8qIHNraXAgdXBkYXRlIHNpbmNlIHRoaXMgb3JpZ2luYXRlcyBmcm9tIHRoZSBVSSAqLyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnVpLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0XHRcdC8vIGlmIHRoZXJlIGFyZSBubyBjaGVja2VkIGVsZW1lbnRzLCBpdCBtZWFucyB0aGF0IGFuIG9uRGlkQ2hhbmdlU2VsZWN0aW9uIG5ldmVyIGZpcmVkIHRvIG92ZXJ3cml0ZVxuXHRcdFx0XHRcdC8vIGBfc2VsZWN0ZWRJdGVtc2AuIEluIHRoYXQgY2FzZSwgd2Ugc2hvdWxkIGVtaXQgb25lIHdpdGggYW4gZW1wdHkgYXJyYXkgdG8gZW5zdXJlIHRoYXRcblx0XHRcdFx0XHQvLyBgLnNlbGVjdGVkSXRlbXNgIGlzIHVwIHRvIGRhdGUuXG5cdFx0XHRcdFx0aWYgKCF0aGlzLnVpLmxpc3QuZ2V0Q2hlY2tlZEVsZW1lbnRzKCkubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZWxlY3RlZEl0ZW1zID0gW107XG5cdFx0XHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlci5maXJlKHRoaXMuc2VsZWN0ZWRJdGVtcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuYWN0aXZlSXRlbXNbMF0pIHtcblx0XHRcdFx0XHQvLyBGb3Igc2luZ2xlLXNlbGVjdCwgd2Ugc2V0IGBzZWxlY3RlZEl0ZW1zYCB0byB0aGUgaXRlbSB0aGF0IHdhcyBhY2NlcHRlZC5cblx0XHRcdFx0XHR0aGlzLl9zZWxlY3RlZEl0ZW1zID0gW3RoaXMuYWN0aXZlSXRlbXNbMF1dO1xuXHRcdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmZpcmUodGhpcy5zZWxlY3RlZEl0ZW1zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmhhbmRsZUFjY2VwdChmYWxzZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnZpc2libGVEaXNwb3NhYmxlcy5hZGQodGhpcy51aS5vbkRpZEN1c3RvbSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMub25EaWRDdXN0b21FbWl0dGVyLmZpcmUoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9mb2N1c0V2ZW50QnVmZmVyZXIud3JhcEV2ZW50KFxuXHRcdFx0XHR0aGlzLnVpLmxpc3Qub25EaWRDaGFuZ2VGb2N1cyxcblx0XHRcdFx0Ly8gT25seSBmaXJlIHRoZSBsYXN0IGV2ZW50XG5cdFx0XHRcdChfLCBlKSA9PiBlXG5cdFx0XHQpKGZvY3VzZWRJdGVtcyA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmFjdGl2ZUl0ZW1zVXBkYXRlZCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gRXhwZWN0IGFub3RoZXIgZXZlbnQuXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuYWN0aXZlSXRlbXNUb0NvbmZpcm0gIT09IHRoaXMuX2FjdGl2ZUl0ZW1zICYmIGVxdWFscyhmb2N1c2VkSXRlbXMsIHRoaXMuX2FjdGl2ZUl0ZW1zLCAoYSwgYikgPT4gYSA9PT0gYikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYWN0aXZlSXRlbXMgPSBmb2N1c2VkSXRlbXMgYXMgVFtdO1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlRW1pdHRlci5maXJlKGZvY3VzZWRJdGVtcyBhcyBUW10pO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudWkubGlzdC5vbkRpZENoYW5nZVNlbGVjdGlvbigoeyBpdGVtczogc2VsZWN0ZWRJdGVtcywgZXZlbnQgfSkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jYW5TZWxlY3RNYW55ICYmICFzZWxlY3RlZEl0ZW1zLnNvbWUoaSA9PiBpLnBpY2thYmxlID09PSBmYWxzZSkpIHtcblx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHRoaXMudWkubGlzdC5zZXRTZWxlY3RlZEVsZW1lbnRzKFtdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnNlbGVjdGVkSXRlbXNUb0NvbmZpcm0gIT09IHRoaXMuX3NlbGVjdGVkSXRlbXMgJiYgZXF1YWxzKHNlbGVjdGVkSXRlbXMsIHRoaXMuX3NlbGVjdGVkSXRlbXMsIChhLCBiKSA9PiBhID09PSBiKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZEl0ZW1zID0gc2VsZWN0ZWRJdGVtcyBhcyBUW107XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmZpcmUoc2VsZWN0ZWRJdGVtcyBhcyBUW10pO1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWRJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZUFjY2VwdChkb20uaXNNb3VzZUV2ZW50KGV2ZW50KSAmJiBldmVudC5idXR0b24gPT09IDEgLyogbW91c2UgbWlkZGxlIGNsaWNrICovKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudWkubGlzdC5vbkNoYW5nZWRDaGVja2VkRWxlbWVudHMoY2hlY2tlZEl0ZW1zID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmNhblNlbGVjdE1hbnkgfHwgIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zZWxlY3RlZEl0ZW1zVG9Db25maXJtICE9PSB0aGlzLl9zZWxlY3RlZEl0ZW1zICYmIGVxdWFscyhjaGVja2VkSXRlbXMsIHRoaXMuX3NlbGVjdGVkSXRlbXMsIChhLCBiKSA9PiBhID09PSBiKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZEl0ZW1zID0gY2hlY2tlZEl0ZW1zIGFzIFRbXTtcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZVNlbGVjdGlvbkVtaXR0ZXIuZmlyZShjaGVja2VkSXRlbXMgYXMgVFtdKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnVpLmxpc3Qub25CdXR0b25UcmlnZ2VyZWQoZXZlbnQgPT4gdGhpcy5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uRW1pdHRlci5maXJlKGV2ZW50IGFzIElRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQ8VD4pKSk7XG5cdFx0XHR0aGlzLnZpc2libGVEaXNwb3NhYmxlcy5hZGQodGhpcy51aS5saXN0Lm9uU2VwYXJhdG9yQnV0dG9uVHJpZ2dlcmVkKGV2ZW50ID0+IHRoaXMub25EaWRUcmlnZ2VyU2VwYXJhdG9yQnV0dG9uRW1pdHRlci5maXJlKGV2ZW50KSkpO1xuXHRcdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMucmVnaXN0ZXJRdWlja05hdmlnYXRpb24oKSk7XG5cdFx0XHR0aGlzLnZhbHVlU2VsZWN0aW9uVXBkYXRlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHN1cGVyLnNob3coKTsgLy8gVE9ETzogV2h5IGhhdmUgc2hvdygpIGJ1YmJsZSB1cCB3aGlsZSB1cGRhdGUoKSB0cmlja2xlcyBkb3duP1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBY2NlcHQoaW5CYWNrZ3JvdW5kOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBGaWd1cmUgb3V0IHZldG8gdmlhIGBvbldpbGxBY2NlcHRgIGV2ZW50XG5cdFx0bGV0IHZldG8gPSBmYWxzZTtcblx0XHR0aGlzLm9uV2lsbEFjY2VwdEVtaXR0ZXIuZmlyZSh7IHZldG86ICgpID0+IHZldG8gPSB0cnVlIH0pO1xuXG5cdFx0Ly8gQ29udGludWUgd2l0aCBgb25EaWRBY2NlcHRgIGlmIG5vIHZldG9cblx0XHRpZiAoIXZldG8pIHtcblx0XHRcdHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmZpcmUoeyBpbkJhY2tncm91bmQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclF1aWNrTmF2aWdhdGlvbigpIHtcblx0XHRyZXR1cm4gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnVpLmNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5LRVlfVVAsIGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY2FuU2VsZWN0TWFueSB8fCAhdGhpcy5fcXVpY2tOYXZpZ2F0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGtleWJvYXJkRXZlbnQ6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRjb25zdCBrZXlDb2RlID0ga2V5Ym9hcmRFdmVudC5rZXlDb2RlO1xuXG5cdFx0XHQvLyBTZWxlY3QgZWxlbWVudCB3aGVuIGtleXMgYXJlIHByZXNzZWQgdGhhdCBzaWduYWwgaXRcblx0XHRcdGNvbnN0IHF1aWNrTmF2S2V5cyA9IHRoaXMuX3F1aWNrTmF2aWdhdGUua2V5YmluZGluZ3M7XG5cdFx0XHRjb25zdCB3YXNUcmlnZ2VyS2V5UHJlc3NlZCA9IHF1aWNrTmF2S2V5cy5zb21lKGsgPT4ge1xuXHRcdFx0XHRjb25zdCBjaG9yZHMgPSBrLmdldENob3JkcygpO1xuXHRcdFx0XHRpZiAoY2hvcmRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY2hvcmRzWzBdLnNoaWZ0S2V5ICYmIGtleUNvZGUgPT09IEtleUNvZGUuU2hpZnQpIHtcblx0XHRcdFx0XHRpZiAoa2V5Ym9hcmRFdmVudC5jdHJsS2V5IHx8IGtleWJvYXJkRXZlbnQuYWx0S2V5IHx8IGtleWJvYXJkRXZlbnQubWV0YUtleSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB0aGlzIGlzIGFuIG9wdGltaXN0aWMgY2hlY2sgZm9yIHRoZSBzaGlmdCBrZXkgYmVpbmcgdXNlZCB0byBuYXZpZ2F0ZSBiYWNrIGluIHF1aWNrIGlucHV0XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY2hvcmRzWzBdLmFsdEtleSAmJiBrZXlDb2RlID09PSBLZXlDb2RlLkFsdCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNob3Jkc1swXS5jdHJsS2V5ICYmIGtleUNvZGUgPT09IEtleUNvZGUuQ3RybCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNob3Jkc1swXS5tZXRhS2V5ICYmIGtleUNvZGUgPT09IEtleUNvZGUuTWV0YSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh3YXNUcmlnZ2VyS2V5UHJlc3NlZCkge1xuXHRcdFx0XHRpZiAodGhpcy5hY3RpdmVJdGVtc1swXSkge1xuXHRcdFx0XHRcdHRoaXMuX3NlbGVjdGVkSXRlbXMgPSBbdGhpcy5hY3RpdmVJdGVtc1swXV07XG5cdFx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZVNlbGVjdGlvbkVtaXR0ZXIuZmlyZSh0aGlzLnNlbGVjdGVkSXRlbXMpO1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlQWNjZXB0KGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBVbnNldCBxdWljayBuYXZpZ2F0ZSBhZnRlciBwcmVzcy4gSXQgaXMgb25seSB2YWxpZCBvbmNlXG5cdFx0XHRcdC8vIGFuZCBzaG91bGQgbm90IHJlc3VsdCBpbiBhbnkgYmVoYXZpb3VyIGNoYW5nZSBhZnRlcndhcmRzXG5cdFx0XHRcdC8vIGlmIHRoZSBwaWNrZXIgcmVtYWlucyBvcGVuIGJlY2F1c2UgdGhlcmUgd2FzIG5vIGFjdGl2ZSBpdGVtXG5cdFx0XHRcdHRoaXMuX3F1aWNrTmF2aWdhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIHN0b3JlIHRoZSBzY3JvbGxUb3AgYmVmb3JlIGl0IGlzIHJlc2V0XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wQmVmb3JlID0gdGhpcy5rZWVwU2Nyb2xsUG9zaXRpb24gPyB0aGlzLnNjcm9sbFRvcCA6IDA7XG5cdFx0Y29uc3QgaGFzRGVzY3JpcHRpb24gPSAhIXRoaXMuZGVzY3JpcHRpb247XG5cdFx0Y29uc3QgdmlzaWJpbGl0aWVzOiBWaXNpYmlsaXRpZXMgPSB7XG5cdFx0XHR0aXRsZTogISF0aGlzLnRpdGxlIHx8ICEhdGhpcy5zdGVwIHx8ICEhdGhpcy50aXRsZUJ1dHRvbnMubGVuZ3RoLFxuXHRcdFx0ZGVzY3JpcHRpb246IGhhc0Rlc2NyaXB0aW9uLFxuXHRcdFx0Y2hlY2tBbGw6IHRoaXMuY2FuU2VsZWN0TWFueSAmJiAhdGhpcy5faGlkZUNoZWNrQWxsLFxuXHRcdFx0Y2hlY2tCb3g6IHRoaXMuY2FuU2VsZWN0TWFueSxcblx0XHRcdGlucHV0Qm94OiAhdGhpcy5faGlkZUlucHV0LFxuXHRcdFx0cHJvZ3Jlc3NCYXI6ICF0aGlzLl9oaWRlSW5wdXQgfHwgaGFzRGVzY3JpcHRpb24sXG5cdFx0XHR2aXNpYmxlQ291bnQ6IHRydWUsXG5cdFx0XHRjb3VudDogdGhpcy5jYW5TZWxlY3RNYW55ICYmICF0aGlzLl9oaWRlQ291bnRCYWRnZSxcblx0XHRcdG9rOiB0aGlzLm9rID09PSAnZGVmYXVsdCcgPyB0aGlzLmNhblNlbGVjdE1hbnkgOiB0aGlzLm9rLFxuXHRcdFx0bGlzdDogdHJ1ZSxcblx0XHRcdG1lc3NhZ2U6ICEhdGhpcy52YWxpZGF0aW9uTWVzc2FnZSB8fCAhIXRoaXMucHJvbXB0LFxuXHRcdFx0Y3VzdG9tQnV0dG9uOiB0aGlzLmN1c3RvbUJ1dHRvblxuXHRcdH07XG5cdFx0dGhpcy51aS5zZXRWaXNpYmlsaXRpZXModmlzaWJpbGl0aWVzKTtcblx0XHRzdXBlci51cGRhdGUoKTtcblx0XHRpZiAodGhpcy51aS5pbnB1dEJveC52YWx1ZSAhPT0gdGhpcy52YWx1ZSkge1xuXHRcdFx0dGhpcy51aS5pbnB1dEJveC52YWx1ZSA9IHRoaXMudmFsdWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZhbHVlU2VsZWN0aW9uVXBkYXRlZCkge1xuXHRcdFx0dGhpcy52YWx1ZVNlbGVjdGlvblVwZGF0ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMudWkuaW5wdXRCb3guc2VsZWN0KHRoaXMuX3ZhbHVlU2VsZWN0aW9uICYmIHsgc3RhcnQ6IHRoaXMuX3ZhbHVlU2VsZWN0aW9uWzBdLCBlbmQ6IHRoaXMuX3ZhbHVlU2VsZWN0aW9uWzFdIH0pO1xuXHRcdH1cblx0XHRpZiAodGhpcy51aS5pbnB1dEJveC5wbGFjZWhvbGRlciAhPT0gKHRoaXMucGxhY2Vob2xkZXIgfHwgJycpKSB7XG5cdFx0XHR0aGlzLnVpLmlucHV0Qm94LnBsYWNlaG9sZGVyID0gKHRoaXMucGxhY2Vob2xkZXIgfHwgJycpO1xuXHRcdH1cblxuXHRcdGxldCBhcmlhTGFiZWwgPSB0aGlzLmFyaWFMYWJlbDtcblx0XHQvLyBPbmx5IHNldCBhcmlhIGxhYmVsIHRvIHRoZSBpbnB1dCBib3ggcGxhY2Vob2xkZXIgaWYgd2UgYWN0dWFsbHkgaGF2ZSBhbiBpbnB1dCBib3guXG5cdFx0aWYgKCFhcmlhTGFiZWwgJiYgdmlzaWJpbGl0aWVzLmlucHV0Qm94KSB7XG5cdFx0XHRhcmlhTGFiZWwgPSB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdFx0Ly8gSWYgd2UgaGF2ZSBhIHRpdGxlLCBpbmNsdWRlIGl0IGluIHRoZSBhcmlhIGxhYmVsLlxuXHRcdFx0aWYgKHRoaXMudGl0bGUpIHtcblx0XHRcdFx0YXJpYUxhYmVsID0gYXJpYUxhYmVsXG5cdFx0XHRcdFx0PyBgJHthcmlhTGFiZWx9IC0gJHt0aGlzLnRpdGxlfWBcblx0XHRcdFx0XHQ6IHRoaXMudGl0bGU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWFyaWFMYWJlbCkge1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBRdWlja1BpY2suREVGQVVMVF9BUklBX0xBQkVMO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy51aS5saXN0LmFyaWFMYWJlbCAhPT0gYXJpYUxhYmVsKSB7XG5cdFx0XHR0aGlzLnVpLmxpc3QuYXJpYUxhYmVsID0gYXJpYUxhYmVsID8/IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVpLmlucHV0Qm94LmFyaWFMYWJlbCAhPT0gYXJpYUxhYmVsKSB7XG5cdFx0XHR0aGlzLnVpLmlucHV0Qm94LmFyaWFMYWJlbCA9IGFyaWFMYWJlbCA/PyAnaW5wdXQnO1xuXHRcdH1cblx0XHR0aGlzLnVpLmxpc3QubWF0Y2hPbkRlc2NyaXB0aW9uID0gdGhpcy5tYXRjaE9uRGVzY3JpcHRpb247XG5cdFx0dGhpcy51aS5saXN0Lm1hdGNoT25EZXRhaWwgPSB0aGlzLm1hdGNoT25EZXRhaWw7XG5cdFx0dGhpcy51aS5saXN0Lm1hdGNoT25MYWJlbCA9IHRoaXMubWF0Y2hPbkxhYmVsO1xuXHRcdHRoaXMudWkubGlzdC5tYXRjaE9uTGFiZWxNb2RlID0gdGhpcy5tYXRjaE9uTGFiZWxNb2RlO1xuXHRcdHRoaXMudWkubGlzdC5zb3J0QnlMYWJlbCA9IHRoaXMuc29ydEJ5TGFiZWw7XG5cdFx0aWYgKHRoaXMuaXRlbXNVcGRhdGVkKSB7XG5cdFx0XHR0aGlzLml0ZW1zVXBkYXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZm9jdXNFdmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMudWkubGlzdC5zZXRFbGVtZW50cyh0aGlzLml0ZW1zKTtcblx0XHRcdFx0Ly8gV2Ugd2FudCBmb2N1cyB0byBleGlzdCBpbiB0aGUgbGlzdCBpZiB0aGVyZSBhcmUgaXRlbXMgc28gdGhhdCBzcGFjZSBjYW4gYmUgdXNlZCB0byB0b2dnbGVcblx0XHRcdFx0dGhpcy51aS5saXN0LnNob3VsZExvb3AgPSAhdGhpcy5jYW5TZWxlY3RNYW55O1xuXHRcdFx0XHR0aGlzLnVpLmxpc3QuZmlsdGVyKHRoaXMuZmlsdGVyVmFsdWUodGhpcy51aS5pbnB1dEJveC52YWx1ZSkpO1xuXHRcdFx0XHRzd2l0Y2ggKHRoaXMuX2l0ZW1BY3RpdmF0aW9uKSB7XG5cdFx0XHRcdFx0Y2FzZSBJdGVtQWN0aXZhdGlvbi5OT05FOlxuXHRcdFx0XHRcdFx0dGhpcy5faXRlbUFjdGl2YXRpb24gPSBJdGVtQWN0aXZhdGlvbi5GSVJTVDsgLy8gb25seSB2YWxpZCBvbmNlLCB0aGVuIHVuc2V0XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIEl0ZW1BY3RpdmF0aW9uLlNFQ09ORDpcblx0XHRcdFx0XHRcdHRoaXMudWkubGlzdC5mb2N1cyhRdWlja1BpY2tGb2N1cy5TZWNvbmQpO1xuXHRcdFx0XHRcdFx0dGhpcy5faXRlbUFjdGl2YXRpb24gPSBJdGVtQWN0aXZhdGlvbi5GSVJTVDsgLy8gb25seSB2YWxpZCBvbmNlLCB0aGVuIHVuc2V0XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIEl0ZW1BY3RpdmF0aW9uLkxBU1Q6XG5cdFx0XHRcdFx0XHR0aGlzLnVpLmxpc3QuZm9jdXMoUXVpY2tQaWNrRm9jdXMuTGFzdCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9pdGVtQWN0aXZhdGlvbiA9IEl0ZW1BY3RpdmF0aW9uLkZJUlNUOyAvLyBvbmx5IHZhbGlkIG9uY2UsIHRoZW4gdW5zZXRcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR0aGlzLnRyeVNlbGVjdEZpcnN0KCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVpLmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3Nob3ctY2hlY2tib3hlcycpICE9PSAhIXRoaXMuY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0aWYgKHRoaXMuY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0XHR0aGlzLnVpLmxpc3QuY2xlYXJGb2N1cygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cnlTZWxlY3RGaXJzdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5hY3RpdmVJdGVtc1VwZGF0ZWQpIHtcblx0XHRcdHRoaXMuYWN0aXZlSXRlbXNVcGRhdGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLmFjdGl2ZUl0ZW1zVG9Db25maXJtID0gdGhpcy5fYWN0aXZlSXRlbXM7XG5cdFx0XHR0aGlzLnVpLmxpc3Quc2V0Rm9jdXNlZEVsZW1lbnRzKHRoaXMuYWN0aXZlSXRlbXMpO1xuXHRcdFx0aWYgKHRoaXMuYWN0aXZlSXRlbXNUb0NvbmZpcm0gPT09IHRoaXMuX2FjdGl2ZUl0ZW1zKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZlSXRlbXNUb0NvbmZpcm0gPSBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5zZWxlY3RlZEl0ZW1zVXBkYXRlZCkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZEl0ZW1zVXBkYXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5zZWxlY3RlZEl0ZW1zVG9Db25maXJtID0gdGhpcy5fc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmICh0aGlzLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdFx0dGhpcy51aS5saXN0LnNldENoZWNrZWRFbGVtZW50cyh0aGlzLnNlbGVjdGVkSXRlbXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51aS5saXN0LnNldFNlbGVjdGVkRWxlbWVudHModGhpcy5zZWxlY3RlZEl0ZW1zKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnNlbGVjdGVkSXRlbXNUb0NvbmZpcm0gPT09IHRoaXMuX3NlbGVjdGVkSXRlbXMpIHtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZEl0ZW1zVG9Db25maXJtID0gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy51aS5vay5sYWJlbCA9IHRoaXMub2tMYWJlbCB8fCAnJztcblx0XHR0aGlzLnVpLmN1c3RvbUJ1dHRvbi5sYWJlbCA9IHRoaXMuY3VzdG9tTGFiZWwgfHwgJyc7XG5cdFx0dGhpcy51aS5jdXN0b21CdXR0b24uZWxlbWVudC50aXRsZSA9IHRoaXMuY3VzdG9tSG92ZXIgfHwgJyc7XG5cdFx0dGhpcy51aS5jdXN0b21CdXR0b24uc2Vjb25kYXJ5ID0gdGhpcy5jdXN0b21CdXR0b25TZWNvbmRhcnkgfHwgZmFsc2U7XG5cdFx0aWYgKCF2aXNpYmlsaXRpZXMuaW5wdXRCb3gpIHtcblx0XHRcdC8vIHdlIG5lZWQgdG8gbW92ZSBmb2N1cyBpbnRvIHRoZSB0cmVlIHRvIGRldGVjdCBrZXliaW5kaW5nc1xuXHRcdFx0Ly8gcHJvcGVybHkgd2hlbiB0aGUgaW5wdXQgYm94IGlzIG5vdCB2aXNpYmxlIChxdWljayBuYXYpXG5cdFx0XHR0aGlzLnVpLmxpc3QuZG9tRm9jdXMoKTtcblxuXHRcdFx0Ly8gRm9jdXMgdGhlIGZpcnN0IGVsZW1lbnQgaW4gdGhlIGxpc3QgaWYgbXVsdGlzZWxlY3QgaXMgZW5hYmxlZFxuXHRcdFx0aWYgKHRoaXMuY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0XHR0aGlzLnVpLmxpc3QuZm9jdXMoUXVpY2tQaWNrRm9jdXMuRmlyc3QpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNldCB0aGUgc2Nyb2xsIHBvc2l0aW9uIHRvIHdoYXQgaXQgd2FzIGJlZm9yZSB1cGRhdGluZyB0aGUgaXRlbXNcblx0XHRpZiAodGhpcy5rZWVwU2Nyb2xsUG9zaXRpb24pIHtcblx0XHRcdHRoaXMuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wQmVmb3JlO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzKGZvY3VzOiBRdWlja1BpY2tGb2N1cyk6IHZvaWQge1xuXHRcdHRoaXMudWkubGlzdC5mb2N1cyhmb2N1cyk7XG5cdFx0Ly8gVG8gYWxsb3cgdGhpbmdzIGxpa2Ugc3BhY2UgdG8gY2hlY2svdW5jaGVjayBpdGVtc1xuXHRcdGlmICh0aGlzLmNhblNlbGVjdE1hbnkpIHtcblx0XHRcdHRoaXMudWkubGlzdC5kb21Gb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGFjY2VwdChpbkJhY2tncm91bmQ/OiBib29sZWFuIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGluQmFja2dyb3VuZCAmJiAhdGhpcy5fY2FuQWNjZXB0SW5CYWNrZ3JvdW5kKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5lZWRzIHRvIGJlIGVuYWJsZWRcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY3RpdmVJdGVtc1swXSAmJiAhdGhpcy5fY2FuU2VsZWN0TWFueSkge1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IFt0aGlzLmFjdGl2ZUl0ZW1zWzBdXTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmZpcmUodGhpcy5zZWxlY3RlZEl0ZW1zKTtcblx0XHR9XG5cdFx0dGhpcy5oYW5kbGVBY2NlcHQoaW5CYWNrZ3JvdW5kID8/IGZhbHNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5wdXRCb3ggZXh0ZW5kcyBRdWlja0lucHV0IGltcGxlbWVudHMgSUlucHV0Qm94IHtcblx0cHJpdmF0ZSBfdmFsdWUgPSAnJztcblx0cHJpdmF0ZSBfdmFsdWVTZWxlY3Rpb246IFJlYWRvbmx5PFtudW1iZXIsIG51bWJlcl0+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZhbHVlU2VsZWN0aW9uVXBkYXRlZCA9IHRydWU7XG5cdHByaXZhdGUgX3BsYWNlaG9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FyaWFMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wYXNzd29yZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFZhbHVlQ2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRBY2NlcHRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cmVhZG9ubHkgdHlwZSA9IFF1aWNrSW5wdXRUeXBlLklucHV0Qm94O1xuXG5cdGdldCB2YWx1ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XG5cdH1cblxuXHRzZXQgdmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMuX3ZhbHVlID0gdmFsdWUgfHwgJyc7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCB2YWx1ZVNlbGVjdGlvbigpIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnVpLmlucHV0Qm94LmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghc2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gW3NlbGVjdGlvbi5zdGFydCwgc2VsZWN0aW9uLmVuZF07XG5cdH1cblxuXHRzZXQgdmFsdWVTZWxlY3Rpb24odmFsdWVTZWxlY3Rpb246IFJlYWRvbmx5PFtudW1iZXIsIG51bWJlcl0+IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fdmFsdWVTZWxlY3Rpb24gPSB2YWx1ZVNlbGVjdGlvbjtcblx0XHR0aGlzLnZhbHVlU2VsZWN0aW9uVXBkYXRlZCA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBwbGFjZWhvbGRlcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fcGxhY2Vob2xkZXI7XG5cdH1cblxuXHRzZXQgcGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FyaWFMYWJlbDtcblx0fVxuXG5cdHNldCBhcmlhTGFiZWwoYXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGdldCBwYXNzd29yZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcGFzc3dvcmQ7XG5cdH1cblxuXHRzZXQgcGFzc3dvcmQocGFzc3dvcmQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9wYXNzd29yZCA9IHBhc3N3b3JkO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRnZXQgcHJvbXB0KCkge1xuXHRcdHJldHVybiB0aGlzLl9wcm9tcHQ7XG5cdH1cblxuXHRzZXQgcHJvbXB0KHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fcHJvbXB0ID0gcHJvbXB0O1xuXHRcdHRoaXMubm9WYWxpZGF0aW9uTWVzc2FnZSA9IHByb21wdFxuXHRcdFx0PyBsb2NhbGl6ZSgnaW5wdXRNb2RlRW50cnlEZXNjcmlwdGlvbicsIFwiezB9IChQcmVzcyAnRW50ZXInIHRvIGNvbmZpcm0gb3IgJ0VzY2FwZScgdG8gY2FuY2VsKVwiLCBwcm9tcHQpXG5cdFx0XHQ6IFF1aWNrSW5wdXQubm9Qcm9tcHRNZXNzYWdlO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbHVlID0gdGhpcy5vbkRpZFZhbHVlQ2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRyZWFkb25seSBvbkRpZEFjY2VwdCA9IHRoaXMub25EaWRBY2NlcHRFbWl0dGVyLmV2ZW50O1xuXG5cdG92ZXJyaWRlIHNob3coKSB7XG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHRoaXMudmlzaWJsZURpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0dGhpcy51aS5pbnB1dEJveC5vbkRpZENoYW5nZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlID09PSB0aGlzLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZFZhbHVlQ2hhbmdlRW1pdHRlci5maXJlKHZhbHVlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0dGhpcy52aXNpYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudWkub25EaWRBY2NlcHQoKCkgPT4gdGhpcy5vbkRpZEFjY2VwdEVtaXR0ZXIuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLnZhbHVlU2VsZWN0aW9uVXBkYXRlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHN1cGVyLnNob3coKTtcblx0fVxuXG5cdGFjY2VwdCgpOiB2b2lkIHtcblx0XHR0aGlzLm9uRGlkQWNjZXB0RW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy51aS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuLWlucHV0Jyk7XG5cdFx0Y29uc3QgdmlzaWJpbGl0aWVzOiBWaXNpYmlsaXRpZXMgPSB7XG5cdFx0XHR0aXRsZTogISF0aGlzLnRpdGxlIHx8ICEhdGhpcy5zdGVwIHx8ICEhdGhpcy50aXRsZUJ1dHRvbnMubGVuZ3RoLFxuXHRcdFx0ZGVzY3JpcHRpb246ICEhdGhpcy5kZXNjcmlwdGlvbiB8fCAhIXRoaXMuc3RlcCxcblx0XHRcdGlucHV0Qm94OiB0cnVlLFxuXHRcdFx0bWVzc2FnZTogdHJ1ZSxcblx0XHRcdHByb2dyZXNzQmFyOiB0cnVlXG5cdFx0fTtcblxuXHRcdHRoaXMudWkuc2V0VmlzaWJpbGl0aWVzKHZpc2liaWxpdGllcyk7XG5cdFx0c3VwZXIudXBkYXRlKCk7XG5cdFx0aWYgKHRoaXMudWkuaW5wdXRCb3gudmFsdWUgIT09IHRoaXMudmFsdWUpIHtcblx0XHRcdHRoaXMudWkuaW5wdXRCb3gudmFsdWUgPSB0aGlzLnZhbHVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy52YWx1ZVNlbGVjdGlvblVwZGF0ZWQpIHtcblx0XHRcdHRoaXMudmFsdWVTZWxlY3Rpb25VcGRhdGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnVpLmlucHV0Qm94LnNlbGVjdCh0aGlzLl92YWx1ZVNlbGVjdGlvbiAmJiB7IHN0YXJ0OiB0aGlzLl92YWx1ZVNlbGVjdGlvblswXSwgZW5kOiB0aGlzLl92YWx1ZVNlbGVjdGlvblsxXSB9KTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudWkuaW5wdXRCb3gucGxhY2Vob2xkZXIgIT09ICh0aGlzLnBsYWNlaG9sZGVyIHx8ICcnKSkge1xuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5wbGFjZWhvbGRlciA9ICh0aGlzLnBsYWNlaG9sZGVyIHx8ICcnKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudWkuaW5wdXRCb3gucGFzc3dvcmQgIT09IHRoaXMucGFzc3dvcmQpIHtcblx0XHRcdHRoaXMudWkuaW5wdXRCb3gucGFzc3dvcmQgPSB0aGlzLnBhc3N3b3JkO1xuXHRcdH1cblx0XHRsZXQgYXJpYUxhYmVsID0gdGhpcy5hcmlhTGFiZWw7XG5cdFx0Ly8gT25seSBzZXQgYXJpYSBsYWJlbCB0byB0aGUgaW5wdXQgYm94IHBsYWNlaG9sZGVyIGlmIHdlIGFjdHVhbGx5IGhhdmUgYW4gaW5wdXQgYm94LlxuXHRcdGlmICghYXJpYUxhYmVsICYmIHZpc2liaWxpdGllcy5pbnB1dEJveCkge1xuXHRcdFx0YXJpYUxhYmVsID0gdGhpcy5wbGFjZWhvbGRlclxuXHRcdFx0XHQ/IHRoaXMudGl0bGVcblx0XHRcdFx0XHQ/IGAke3RoaXMucGxhY2Vob2xkZXJ9IC0gJHt0aGlzLnRpdGxlfWBcblx0XHRcdFx0XHQ6IHRoaXMucGxhY2Vob2xkZXJcblx0XHRcdFx0OiB0aGlzLnRpdGxlXG5cdFx0XHRcdFx0PyB0aGlzLnRpdGxlXG5cdFx0XHRcdFx0OiAnaW5wdXQnO1xuXHRcdH1cblx0XHRpZiAodGhpcy51aS5pbnB1dEJveC5hcmlhTGFiZWwgIT09IGFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy51aS5pbnB1dEJveC5hcmlhTGFiZWwgPSBhcmlhTGFiZWwgfHwgJ2lucHV0Jztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrV2lkZ2V0IGV4dGVuZHMgUXVpY2tJbnB1dCBpbXBsZW1lbnRzIElRdWlja1dpZGdldCB7XG5cdHJlYWRvbmx5IHR5cGUgPSBRdWlja0lucHV0VHlwZS5RdWlja1dpZGdldDtcblxuXHRwcml2YXRlIF93aWRnZXQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93aWRnZXRVcGRhdGVkID0gZmFsc2U7XG5cblx0Z2V0IHdpZGdldCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0O1xuXHR9XG5cblx0c2V0IHdpZGdldCh3aWRnZXQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCAhPT0gd2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl93aWRnZXQgPSB3aWRnZXQ7XG5cdFx0XHR0aGlzLl93aWRnZXRVcGRhdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnVpLnNldFZpc2liaWxpdGllcyh7XG5cdFx0XHR0aXRsZTogISF0aGlzLnRpdGxlIHx8ICEhdGhpcy5zdGVwIHx8ICEhdGhpcy50aXRsZUJ1dHRvbnMubGVuZ3RoLFxuXHRcdFx0ZGVzY3JpcHRpb246ICEhdGhpcy5kZXNjcmlwdGlvbiB8fCAhIXRoaXMuc3RlcFxuXHRcdH0pO1xuXHRcdGlmICh0aGlzLl93aWRnZXRVcGRhdGVkKSB7XG5cdFx0XHR0aGlzLl93aWRnZXRVcGRhdGVkID0gZmFsc2U7XG5cdFx0XHRpZiAodGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHRcdGRvbS5yZXNldCh0aGlzLnVpLndpZGdldCwgdGhpcy5fd2lkZ2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRvbS5yZXNldCh0aGlzLnVpLndpZGdldCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN1cGVyLnVwZGF0ZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja0lucHV0SG92ZXJEZWxlZ2F0ZSBleHRlbmRzIFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ21vdXNlJywgdW5kZWZpbmVkLCAob3B0aW9ucykgPT4gdGhpcy5nZXRPdmVycmlkZU9wdGlvbnMob3B0aW9ucyksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPdmVycmlkZU9wdGlvbnMob3B0aW9uczogSUhvdmVyRGVsZWdhdGVPcHRpb25zKTogUGFydGlhbDxJSG92ZXJPcHRpb25zPiB7XG5cdFx0Ly8gT25seSBzaG93IHRoZSBob3ZlciBoaW50IGlmIHRoZSBjb250ZW50IGlzIG9mIGEgZGVjZW50IHNpemVcblx0XHRjb25zdCBzaG93SG92ZXJIaW50ID0gKFxuXHRcdFx0ZG9tLmlzSFRNTEVsZW1lbnQob3B0aW9ucy5jb250ZW50KVxuXHRcdFx0XHQ/IG9wdGlvbnMuY29udGVudC50ZXh0Q29udGVudCA/PyAnJ1xuXHRcdFx0XHQ6IHR5cGVvZiBvcHRpb25zLmNvbnRlbnQgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0PyBvcHRpb25zLmNvbnRlbnRcblx0XHRcdFx0XHQ6IG9wdGlvbnMuY29udGVudC52YWx1ZVxuXHRcdCkuaW5jbHVkZXMoJ1xcbicpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBlcnNpc3RlbmNlOiB7XG5cdFx0XHRcdGhpZGVPbktleURvd246IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0c2hvd0hvdmVySGludCxcblx0XHRcdFx0c2tpcEZhZGVJbkFuaW1hdGlvbjogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFVdEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQWdCLHFCQUFxQjtBQUM5QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGFBQWE7QUFDdEIsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsaUJBQWlCO0FBQzFCLE9BQU87QUFDUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFnUyxnQkFBZ0IsYUFBYSwwQkFBMEIsc0JBQXNCLGdCQUFnQixzQkFBc0I7QUFFblosU0FBUywwQkFBMEIsaUNBQWlDLG1DQUFtQztBQUN2RyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWUsOEJBQThCO0FBR3RELFNBQVMsZ0JBQWdCLHFCQUFxQjtBQUU5QyxTQUFTLHVCQUF1QjtBQUV6QixNQUFNLDhCQUE4QjtBQUNwQyxNQUFNLHlCQUF5QixJQUFJLGNBQXVCLDZCQUE2QixPQUFPLFNBQVMsZ0JBQWdCLDBEQUEwRCxDQUFDO0FBQ2xMLE1BQU0sc0JBQXNCLGVBQWUsSUFBSSwyQkFBMkI7QUFFMUUsTUFBTSxxQ0FBcUM7QUFDM0MsTUFBTSxnQ0FBZ0MsSUFBSSxjQUE0QyxvQ0FBb0MsT0FBTyxTQUFTLHVCQUF1QixrQ0FBa0MsQ0FBQztBQUVwTSxNQUFNLGdDQUFnQztBQUN0QyxNQUFNLDJCQUEyQixJQUFJLGNBQThCLCtCQUErQixRQUFXLFNBQVMsa0JBQWtCLCtDQUErQyxDQUFDO0FBRXhMLE1BQU0sb0NBQW9DO0FBQzFDLE1BQU0sK0JBQStCLElBQUksY0FBdUIsbUNBQW1DLE9BQU8sU0FBUyw4QkFBOEIsc0VBQXNF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
