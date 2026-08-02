import * as browser from "../../browser.js";
import * as DOM from "../../dom.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { StandardMouseEvent } from "../../mouseEvent.js";
import { EventType, Gesture } from "../../touch.js";
import { cleanMnemonic, HorizontalDirection, Menu, MENU_ESCAPED_MNEMONIC_REGEX, MENU_MNEMONIC_REGEX, VerticalDirection } from "./menu.js";
import { ActionRunner, Separator, SubmenuAction } from "../../../common/actions.js";
import { asArray } from "../../../common/arrays.js";
import { RunOnceScheduler } from "../../../common/async.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { Emitter } from "../../../common/event.js";
import { KeyCode, KeyMod, ScanCode, ScanCodeUtils } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore, dispose } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import * as strings from "../../../common/strings.js";
import "./menubar.css";
import * as nls from "../../../../nls.js";
import { mainWindow } from "../../window.js";
const $ = DOM.$;
var MenubarState = /* @__PURE__ */ ((MenubarState2) => {
  MenubarState2[MenubarState2["HIDDEN"] = 0] = "HIDDEN";
  MenubarState2[MenubarState2["VISIBLE"] = 1] = "VISIBLE";
  MenubarState2[MenubarState2["FOCUSED"] = 2] = "FOCUSED";
  MenubarState2[MenubarState2["OPEN"] = 3] = "OPEN";
  return MenubarState2;
})(MenubarState || {});
const _MenuBar = class _MenuBar extends Disposable {
  constructor(container, options, menuStyle) {
    super();
    this.container = container;
    this.options = options;
    this.menuStyle = menuStyle;
    // Input-related
    this._mnemonicsInUse = false;
    this.openedViaKeyboard = false;
    this.awaitingAltRelease = false;
    this.ignoreNextMouseUp = false;
    this.updatePending = false;
    this.numMenusShown = 0;
    this.overflowLayoutScheduled = void 0;
    this.menuDisposables = this._register(new DisposableStore());
    this.container.setAttribute("role", "menubar");
    if (this.isCompact) {
      this.container.classList.add("compact");
    }
    this.menus = [];
    this.mnemonics = /* @__PURE__ */ new Map();
    this._focusState = 1 /* VISIBLE */;
    this._onVisibilityChange = this._register(new Emitter());
    this._onFocusStateChange = this._register(new Emitter());
    this.createOverflowMenu();
    this.menuUpdater = this._register(new RunOnceScheduler(() => this.update(), 200));
    this.actionRunner = this.options.actionRunner ?? this._register(new ActionRunner());
    this._register(this.actionRunner.onWillRun(() => {
      this.setUnfocusedState();
    }));
    this._register(DOM.ModifierKeyEmitter.getInstance().event(this.onModifierKeyToggled, this));
    this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = true;
      const key = !!e.key ? e.key.toLocaleLowerCase() : "";
      const tabNav = isMacintosh && !this.isCompact;
      if (event.equals(KeyCode.LeftArrow) || tabNav && event.equals(KeyCode.Tab | KeyMod.Shift)) {
        this.focusPrevious();
      } else if (event.equals(KeyCode.RightArrow) || tabNav && event.equals(KeyCode.Tab)) {
        this.focusNext();
      } else if (event.equals(KeyCode.Escape) && this.isFocused && !this.isOpen) {
        this.setUnfocusedState();
      } else if (!this.isOpen && !event.ctrlKey && this.options.enableMnemonics && this.mnemonicsInUse && this.mnemonics.has(key)) {
        const menuIndex = this.mnemonics.get(key);
        this.onMenuTriggered(menuIndex, false);
      } else {
        eventHandled = false;
      }
      if (!this.isCompact && (event.equals(KeyCode.Tab | KeyMod.Shift) || event.equals(KeyCode.Tab))) {
        event.preventDefault();
      }
      if (eventHandled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }));
    const window = DOM.getWindow(this.container);
    this._register(DOM.addDisposableListener(window, DOM.EventType.MOUSE_DOWN, () => {
      if (this.isFocused) {
        this.setUnfocusedState();
      }
    }));
    this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_IN, (e) => {
      const event = e;
      if (event.relatedTarget) {
        if (!this.container.contains(event.relatedTarget)) {
          this.focusToReturn = event.relatedTarget;
        }
      }
    }));
    this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_OUT, (e) => {
      const event = e;
      if (!event.relatedTarget) {
        this.setUnfocusedState();
      } else if (event.relatedTarget && !this.container.contains(event.relatedTarget)) {
        this.focusToReturn = void 0;
        this.setUnfocusedState();
      }
    }));
    this._register(DOM.addDisposableListener(window, DOM.EventType.KEY_DOWN, (e) => {
      if (!this.options.enableMnemonics || !e.altKey || e.ctrlKey || e.defaultPrevented) {
        return;
      }
      const key = e.key.toLocaleLowerCase();
      if (!this.mnemonics.has(key)) {
        return;
      }
      this.mnemonicsInUse = true;
      this.updateMnemonicVisibility(true);
      const menuIndex = this.mnemonics.get(key);
      this.onMenuTriggered(menuIndex, false);
    }));
    this.setUnfocusedState();
  }
  push(arg) {
    const menus = asArray(arg);
    menus.forEach((menuBarMenu) => {
      const menuIndex = this.menus.length;
      const cleanMenuLabel = cleanMnemonic(menuBarMenu.label);
      const mnemonicMatches = MENU_MNEMONIC_REGEX.exec(menuBarMenu.label);
      if (mnemonicMatches) {
        const mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];
        this.registerMnemonic(this.menus.length, mnemonic);
      }
      if (this.isCompact) {
        this.menus.push(menuBarMenu);
      } else {
        const buttonElement = $("div.menubar-menu-button", { "role": "menuitem", "tabindex": -1, "aria-label": cleanMenuLabel, "aria-haspopup": true });
        const titleElement = $("div.menubar-menu-title", { "role": "none", "aria-hidden": true });
        buttonElement.appendChild(titleElement);
        this.container.insertBefore(buttonElement, this.overflowMenu.buttonElement);
        this.updateLabels(titleElement, buttonElement, menuBarMenu.label);
        this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.KEY_UP, (e) => {
          const event = new StandardKeyboardEvent(e);
          let eventHandled = true;
          if ((event.equals(KeyCode.DownArrow) || event.equals(KeyCode.Enter)) && !this.isOpen) {
            this.focusedMenu = { index: menuIndex };
            this.openedViaKeyboard = true;
            this.focusState = 3 /* OPEN */;
          } else {
            eventHandled = false;
          }
          if (eventHandled) {
            event.preventDefault();
            event.stopPropagation();
          }
        }));
        this._register(Gesture.addTarget(buttonElement));
        this._register(DOM.addDisposableListener(buttonElement, EventType.Tap, (e) => {
          if (this.isOpen && this.focusedMenu && this.focusedMenu.holder && DOM.isAncestor(e.initialTarget, this.focusedMenu.holder)) {
            return;
          }
          this.ignoreNextMouseUp = false;
          this.onMenuTriggered(menuIndex, true);
          e.preventDefault();
          e.stopPropagation();
        }));
        this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_DOWN, (e) => {
          const mouseEvent = new StandardMouseEvent(DOM.getWindow(buttonElement), e);
          if (!mouseEvent.leftButton) {
            e.preventDefault();
            return;
          }
          if (!this.isOpen) {
            this.ignoreNextMouseUp = true;
            this.onMenuTriggered(menuIndex, true);
          } else {
            this.ignoreNextMouseUp = false;
          }
          e.preventDefault();
          e.stopPropagation();
        }));
        this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_UP, (e) => {
          if (e.defaultPrevented) {
            return;
          }
          if (!this.ignoreNextMouseUp) {
            if (this.isFocused) {
              this.onMenuTriggered(menuIndex, true);
            }
          } else {
            this.ignoreNextMouseUp = false;
          }
        }));
        this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_ENTER, () => {
          if (this.isOpen && !this.isCurrentMenu(menuIndex)) {
            buttonElement.focus();
            this.cleanupCustomMenu();
            this.showCustomMenu(menuIndex, false);
          } else if (this.isFocused && !this.isOpen) {
            this.focusedMenu = { index: menuIndex };
            buttonElement.focus();
          }
        }));
        this.menus.push({
          label: menuBarMenu.label,
          actions: menuBarMenu.actions,
          buttonElement,
          titleElement
        });
      }
    });
  }
  createOverflowMenu() {
    const label = this.isCompact ? nls.localize("mAppMenu", "Application Menu") : nls.localize("mMore", "More");
    const buttonElement = $("div.menubar-menu-button", { "role": "menuitem", "tabindex": this.isCompact ? 0 : -1, "aria-label": label, "aria-haspopup": true });
    const titleElement = $("div.menubar-menu-title.toolbar-toggle-more" + ThemeIcon.asCSSSelector(Codicon.menuBarMore), { "role": "none", "aria-hidden": true });
    buttonElement.appendChild(titleElement);
    this.container.appendChild(buttonElement);
    buttonElement.style.visibility = "hidden";
    this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = true;
      const triggerKeys = [KeyCode.Enter];
      if (!this.isCompact) {
        triggerKeys.push(KeyCode.DownArrow);
      } else {
        triggerKeys.push(KeyCode.Space);
        if (this.options.compactMode?.horizontal === HorizontalDirection.Right) {
          triggerKeys.push(KeyCode.RightArrow);
        } else if (this.options.compactMode?.horizontal === HorizontalDirection.Left) {
          triggerKeys.push(KeyCode.LeftArrow);
        }
      }
      if (triggerKeys.some((k) => event.equals(k)) && !this.isOpen) {
        this.focusedMenu = { index: _MenuBar.OVERFLOW_INDEX };
        this.openedViaKeyboard = true;
        this.focusState = 3 /* OPEN */;
      } else {
        eventHandled = false;
      }
      if (eventHandled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }));
    this._register(Gesture.addTarget(buttonElement));
    this._register(DOM.addDisposableListener(buttonElement, EventType.Tap, (e) => {
      if (this.isOpen && this.focusedMenu && this.focusedMenu.holder && DOM.isAncestor(e.initialTarget, this.focusedMenu.holder)) {
        return;
      }
      this.ignoreNextMouseUp = false;
      this.onMenuTriggered(_MenuBar.OVERFLOW_INDEX, true);
      e.preventDefault();
      e.stopPropagation();
    }));
    this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_DOWN, (e) => {
      const mouseEvent = new StandardMouseEvent(DOM.getWindow(buttonElement), e);
      if (!mouseEvent.leftButton) {
        e.preventDefault();
        return;
      }
      if (!this.isOpen) {
        this.ignoreNextMouseUp = true;
        this.onMenuTriggered(_MenuBar.OVERFLOW_INDEX, true);
      } else {
        this.ignoreNextMouseUp = false;
      }
      e.preventDefault();
      e.stopPropagation();
    }));
    this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_UP, (e) => {
      if (e.defaultPrevented) {
        return;
      }
      if (!this.ignoreNextMouseUp) {
        if (this.isFocused) {
          this.onMenuTriggered(_MenuBar.OVERFLOW_INDEX, true);
        }
      } else {
        this.ignoreNextMouseUp = false;
      }
    }));
    this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_ENTER, () => {
      if (this.isOpen && !this.isCurrentMenu(_MenuBar.OVERFLOW_INDEX)) {
        this.overflowMenu.buttonElement.focus();
        this.cleanupCustomMenu();
        this.showCustomMenu(_MenuBar.OVERFLOW_INDEX, false);
      } else if (this.isFocused && !this.isOpen) {
        this.focusedMenu = { index: _MenuBar.OVERFLOW_INDEX };
        buttonElement.focus();
      }
    }));
    this.overflowMenu = {
      buttonElement,
      titleElement,
      label: "More",
      actions: []
    };
  }
  updateMenu(menu) {
    const menuToUpdate = this.menus.filter((menuBarMenu) => menuBarMenu.label === menu.label);
    if (menuToUpdate && menuToUpdate.length) {
      menuToUpdate[0].actions = menu.actions;
    }
  }
  dispose() {
    super.dispose();
    this.menus.forEach((menuBarMenu) => {
      menuBarMenu.titleElement?.remove();
      menuBarMenu.buttonElement?.remove();
    });
    this.overflowMenu.titleElement.remove();
    this.overflowMenu.buttonElement.remove();
    dispose(this.overflowLayoutScheduled);
    this.overflowLayoutScheduled = void 0;
  }
  blur() {
    this.setUnfocusedState();
  }
  getWidth() {
    if (!this.isCompact && this.menus) {
      const left = this.menus[0].buttonElement.getBoundingClientRect().left;
      const right = this.hasOverflow ? this.overflowMenu.buttonElement.getBoundingClientRect().right : this.menus[this.menus.length - 1].buttonElement.getBoundingClientRect().right;
      return right - left;
    }
    return 0;
  }
  getHeight() {
    return this.container.clientHeight;
  }
  toggleFocus() {
    if (!this.isFocused && this.options.visibility !== "hidden") {
      this.mnemonicsInUse = true;
      this.focusedMenu = { index: this.numMenusShown > 0 ? 0 : _MenuBar.OVERFLOW_INDEX };
      this.focusState = 2 /* FOCUSED */;
    } else if (!this.isOpen) {
      this.setUnfocusedState();
    }
  }
  updateOverflowAction() {
    if (!this.menus || !this.menus.length) {
      return;
    }
    const overflowMenuOnlyClass = "overflow-menu-only";
    this.container.classList.toggle(overflowMenuOnlyClass, false);
    const sizeAvailable = this.container.offsetWidth;
    let currentSize = 0;
    let full = this.isCompact;
    const prevNumMenusShown = this.numMenusShown;
    this.numMenusShown = 0;
    const showableMenus = this.menus.filter((menu) => menu.buttonElement !== void 0 && menu.titleElement !== void 0);
    for (const menuBarMenu of showableMenus) {
      if (!full) {
        const size = menuBarMenu.buttonElement.offsetWidth;
        if (currentSize + size > sizeAvailable) {
          full = true;
        } else {
          currentSize += size;
          this.numMenusShown++;
          if (this.numMenusShown > prevNumMenusShown) {
            menuBarMenu.buttonElement.style.visibility = "visible";
          }
        }
      }
      if (full) {
        menuBarMenu.buttonElement.style.visibility = "hidden";
      }
    }
    if (this.numMenusShown - 1 <= showableMenus.length / 4) {
      for (const menuBarMenu of showableMenus) {
        menuBarMenu.buttonElement.style.visibility = "hidden";
      }
      full = true;
      this.numMenusShown = 0;
      currentSize = 0;
    }
    if (this.isCompact) {
      this.overflowMenu.actions = [];
      for (let idx = this.numMenusShown; idx < this.menus.length; idx++) {
        this.overflowMenu.actions.push(new SubmenuAction(`menubar.submenu.${this.menus[idx].label}`, this.menus[idx].label, this.menus[idx].actions || []));
      }
      const compactMenuActions = this.options.getCompactMenuActions?.();
      if (compactMenuActions && compactMenuActions.length) {
        this.overflowMenu.actions.push(new Separator());
        this.overflowMenu.actions.push(...compactMenuActions);
      }
      this.overflowMenu.buttonElement.style.visibility = "visible";
    } else if (full) {
      while (currentSize + this.overflowMenu.buttonElement.offsetWidth > sizeAvailable && this.numMenusShown > 0) {
        this.numMenusShown--;
        const size = showableMenus[this.numMenusShown].buttonElement.offsetWidth;
        showableMenus[this.numMenusShown].buttonElement.style.visibility = "hidden";
        currentSize -= size;
      }
      this.overflowMenu.actions = [];
      for (let idx = this.numMenusShown; idx < showableMenus.length; idx++) {
        this.overflowMenu.actions.push(new SubmenuAction(`menubar.submenu.${showableMenus[idx].label}`, showableMenus[idx].label, showableMenus[idx].actions || []));
      }
      if (this.overflowMenu.buttonElement.nextElementSibling !== showableMenus[this.numMenusShown].buttonElement) {
        this.overflowMenu.buttonElement.remove();
        this.container.insertBefore(this.overflowMenu.buttonElement, showableMenus[this.numMenusShown].buttonElement);
      }
      this.overflowMenu.buttonElement.style.visibility = "visible";
    } else {
      this.overflowMenu.buttonElement.remove();
      this.container.appendChild(this.overflowMenu.buttonElement);
      this.overflowMenu.buttonElement.style.visibility = "hidden";
    }
    this.container.classList.toggle(overflowMenuOnlyClass, this.numMenusShown === 0);
  }
  updateLabels(titleElement, buttonElement, label) {
    const cleanMenuLabel = cleanMnemonic(label);
    if (this.options.enableMnemonics) {
      const cleanLabel = strings.escape(label);
      MENU_ESCAPED_MNEMONIC_REGEX.lastIndex = 0;
      let escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(cleanLabel);
      while (escMatch && escMatch[1]) {
        escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(cleanLabel);
      }
      const replaceDoubleEscapes = (str) => str.replace(/&amp;&amp;/g, "&amp;");
      if (escMatch) {
        titleElement.textContent = "";
        titleElement.append(
          strings.ltrim(replaceDoubleEscapes(cleanLabel.substr(0, escMatch.index)), " "),
          $("mnemonic", { "aria-hidden": "true" }, escMatch[3]),
          strings.rtrim(replaceDoubleEscapes(cleanLabel.substr(escMatch.index + escMatch[0].length)), " ")
        );
      } else {
        titleElement.textContent = replaceDoubleEscapes(cleanLabel).trim();
      }
    } else {
      titleElement.textContent = cleanMenuLabel.replace(/&&/g, "&");
    }
    const mnemonicMatches = MENU_MNEMONIC_REGEX.exec(label);
    if (mnemonicMatches) {
      const mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];
      if (this.options.enableMnemonics) {
        buttonElement.setAttribute("aria-keyshortcuts", "Alt+" + mnemonic.toLocaleLowerCase());
      } else {
        buttonElement.removeAttribute("aria-keyshortcuts");
      }
    }
  }
  update(options) {
    if (options) {
      this.options = options;
    }
    if (this.isFocused) {
      this.updatePending = true;
      return;
    }
    this.menus.forEach((menuBarMenu) => {
      if (!menuBarMenu.buttonElement || !menuBarMenu.titleElement) {
        return;
      }
      this.updateLabels(menuBarMenu.titleElement, menuBarMenu.buttonElement, menuBarMenu.label);
    });
    if (!this.overflowLayoutScheduled) {
      this.overflowLayoutScheduled = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.container), () => {
        this.updateOverflowAction();
        this.overflowLayoutScheduled = void 0;
      });
    }
    this.setUnfocusedState();
  }
  registerMnemonic(menuIndex, mnemonic) {
    this.mnemonics.set(mnemonic.toLocaleLowerCase(), menuIndex);
  }
  hideMenubar() {
    if (this.container.style.display !== "none") {
      this.container.style.display = "none";
      this._onVisibilityChange.fire(false);
    }
  }
  showMenubar() {
    if (this.container.style.display !== "flex") {
      this.container.style.display = "flex";
      this._onVisibilityChange.fire(true);
      this.updateOverflowAction();
    }
  }
  get focusState() {
    return this._focusState;
  }
  set focusState(value) {
    if (this._focusState >= 2 /* FOCUSED */ && value < 2 /* FOCUSED */) {
      if (this.updatePending) {
        this.menuUpdater.schedule();
        this.updatePending = false;
      }
    }
    if (value === this._focusState) {
      return;
    }
    const isVisible = this.isVisible;
    const isOpen = this.isOpen;
    const isFocused = this.isFocused;
    this._focusState = value;
    switch (value) {
      case 0 /* HIDDEN */:
        if (isVisible) {
          this.hideMenubar();
        }
        if (isOpen) {
          this.cleanupCustomMenu();
        }
        if (isFocused) {
          this.focusedMenu = void 0;
          if (this.focusToReturn) {
            this.focusToReturn.focus();
            this.focusToReturn = void 0;
          }
        }
        break;
      case 1 /* VISIBLE */:
        if (!isVisible) {
          this.showMenubar();
        }
        if (isOpen) {
          this.cleanupCustomMenu();
        }
        if (isFocused) {
          if (this.focusedMenu) {
            if (this.focusedMenu.index === _MenuBar.OVERFLOW_INDEX) {
              this.overflowMenu.buttonElement.blur();
            } else {
              this.menus[this.focusedMenu.index].buttonElement?.blur();
            }
          }
          this.focusedMenu = void 0;
          if (this.focusToReturn) {
            this.focusToReturn.focus();
            this.focusToReturn = void 0;
          }
        }
        break;
      case 2 /* FOCUSED */:
        if (!isVisible) {
          this.showMenubar();
        }
        if (isOpen) {
          this.cleanupCustomMenu();
        }
        if (this.focusedMenu) {
          if (this.focusedMenu.index === 0 && this.numMenusShown === 0) {
            this.focusedMenu.index = _MenuBar.OVERFLOW_INDEX;
          }
          if (this.focusedMenu.index === _MenuBar.OVERFLOW_INDEX) {
            this.overflowMenu.buttonElement.focus();
          } else {
            this.menus[this.focusedMenu.index].buttonElement?.focus();
          }
        }
        break;
      case 3 /* OPEN */:
        if (!isVisible) {
          this.showMenubar();
        }
        if (this.focusedMenu) {
          this.cleanupCustomMenu();
          this.showCustomMenu(this.focusedMenu.index, this.openedViaKeyboard);
        }
        break;
    }
    this._focusState = value;
    this._onFocusStateChange.fire(this.focusState >= 2 /* FOCUSED */);
  }
  get isVisible() {
    return this.focusState >= 1 /* VISIBLE */;
  }
  get isFocused() {
    return this.focusState >= 2 /* FOCUSED */;
  }
  get isOpen() {
    return this.focusState >= 3 /* OPEN */;
  }
  get hasOverflow() {
    return this.isCompact || this.numMenusShown < this.menus.length;
  }
  get isCompact() {
    return this.options.compactMode !== void 0;
  }
  setUnfocusedState() {
    if (this.options.visibility === "toggle" || this.options.visibility === "hidden") {
      this.focusState = 0 /* HIDDEN */;
    } else if (this.options.visibility === "classic" && browser.isFullscreen(mainWindow)) {
      this.focusState = 0 /* HIDDEN */;
    } else {
      this.focusState = 1 /* VISIBLE */;
    }
    this.ignoreNextMouseUp = false;
    this.mnemonicsInUse = false;
    this.updateMnemonicVisibility(false);
  }
  focusPrevious() {
    if (!this.focusedMenu || this.numMenusShown === 0) {
      return;
    }
    let newFocusedIndex = (this.focusedMenu.index - 1 + this.numMenusShown) % this.numMenusShown;
    if (this.focusedMenu.index === _MenuBar.OVERFLOW_INDEX) {
      newFocusedIndex = this.numMenusShown - 1;
    } else if (this.focusedMenu.index === 0 && this.hasOverflow) {
      newFocusedIndex = _MenuBar.OVERFLOW_INDEX;
    }
    if (newFocusedIndex === this.focusedMenu.index) {
      return;
    }
    if (this.isOpen) {
      this.cleanupCustomMenu();
      this.showCustomMenu(newFocusedIndex);
    } else if (this.isFocused) {
      this.focusedMenu.index = newFocusedIndex;
      if (newFocusedIndex === _MenuBar.OVERFLOW_INDEX) {
        this.overflowMenu.buttonElement.focus();
      } else {
        this.menus[newFocusedIndex].buttonElement?.focus();
      }
    }
  }
  focusNext() {
    if (!this.focusedMenu || this.numMenusShown === 0) {
      return;
    }
    let newFocusedIndex = (this.focusedMenu.index + 1) % this.numMenusShown;
    if (this.focusedMenu.index === _MenuBar.OVERFLOW_INDEX) {
      newFocusedIndex = 0;
    } else if (this.focusedMenu.index === this.numMenusShown - 1) {
      newFocusedIndex = _MenuBar.OVERFLOW_INDEX;
    }
    if (newFocusedIndex === this.focusedMenu.index) {
      return;
    }
    if (this.isOpen) {
      this.cleanupCustomMenu();
      this.showCustomMenu(newFocusedIndex);
    } else if (this.isFocused) {
      this.focusedMenu.index = newFocusedIndex;
      if (newFocusedIndex === _MenuBar.OVERFLOW_INDEX) {
        this.overflowMenu.buttonElement.focus();
      } else {
        this.menus[newFocusedIndex].buttonElement?.focus();
      }
    }
  }
  updateMnemonicVisibility(visible) {
    if (this.menus) {
      this.menus.forEach((menuBarMenu) => {
        if (menuBarMenu.titleElement && menuBarMenu.titleElement.children.length) {
          const child = menuBarMenu.titleElement.children.item(0);
          if (child) {
            child.style.textDecoration = this.options.alwaysOnMnemonics || visible ? "underline" : "";
          }
        }
      });
    }
  }
  get mnemonicsInUse() {
    return this._mnemonicsInUse;
  }
  set mnemonicsInUse(value) {
    this._mnemonicsInUse = value;
  }
  get shouldAltKeyFocus() {
    if (isMacintosh) {
      return false;
    }
    if (!this.options.disableAltFocus) {
      return true;
    }
    if (this.options.visibility === "toggle") {
      return true;
    }
    return false;
  }
  get onVisibilityChange() {
    return this._onVisibilityChange.event;
  }
  get onFocusStateChange() {
    return this._onFocusStateChange.event;
  }
  onMenuTriggered(menuIndex, clicked) {
    if (this.isOpen) {
      if (this.isCurrentMenu(menuIndex)) {
        this.setUnfocusedState();
      } else {
        this.cleanupCustomMenu();
        this.showCustomMenu(menuIndex, this.openedViaKeyboard);
      }
    } else {
      this.focusedMenu = { index: menuIndex };
      this.openedViaKeyboard = !clicked;
      this.focusState = 3 /* OPEN */;
    }
  }
  onModifierKeyToggled(modifierKeyStatus) {
    const allModifiersReleased = !modifierKeyStatus.altKey && !modifierKeyStatus.ctrlKey && !modifierKeyStatus.shiftKey && !modifierKeyStatus.metaKey;
    if (this.options.visibility === "hidden") {
      return;
    }
    if (modifierKeyStatus.event && this.shouldAltKeyFocus) {
      if (ScanCodeUtils.toEnum(modifierKeyStatus.event.code) === ScanCode.AltLeft) {
        modifierKeyStatus.event.preventDefault();
      }
    }
    if (this.isFocused && modifierKeyStatus.lastKeyPressed === "alt" && modifierKeyStatus.altKey) {
      this.setUnfocusedState();
      this.mnemonicsInUse = false;
      this.awaitingAltRelease = true;
    }
    if (allModifiersReleased && modifierKeyStatus.lastKeyPressed === "alt" && modifierKeyStatus.lastKeyReleased === "alt") {
      if (!this.awaitingAltRelease) {
        if (!this.isFocused && this.shouldAltKeyFocus) {
          this.mnemonicsInUse = true;
          this.focusedMenu = { index: this.numMenusShown > 0 ? 0 : _MenuBar.OVERFLOW_INDEX };
          this.focusState = 2 /* FOCUSED */;
        } else if (!this.isOpen) {
          this.setUnfocusedState();
        }
      }
    }
    if (!modifierKeyStatus.altKey && modifierKeyStatus.lastKeyReleased === "alt") {
      this.awaitingAltRelease = false;
    }
    if (this.options.enableMnemonics && this.menus && !this.isOpen) {
      this.updateMnemonicVisibility(!this.awaitingAltRelease && modifierKeyStatus.altKey || this.mnemonicsInUse);
    }
  }
  isCurrentMenu(menuIndex) {
    if (!this.focusedMenu) {
      return false;
    }
    return this.focusedMenu.index === menuIndex;
  }
  cleanupCustomMenu() {
    if (this.focusedMenu) {
      if (this.focusedMenu.index === _MenuBar.OVERFLOW_INDEX) {
        this.overflowMenu.buttonElement.focus();
      } else {
        this.menus[this.focusedMenu.index].buttonElement?.focus();
      }
      if (this.focusedMenu.holder) {
        this.focusedMenu.holder.parentElement?.classList.remove("open");
        this.focusedMenu.holder.remove();
      }
      this.focusedMenu.widget?.dispose();
      this.focusedMenu = { index: this.focusedMenu.index };
    }
    this.menuDisposables.clear();
  }
  showCustomMenu(menuIndex, selectFirst = true) {
    const actualMenuIndex = menuIndex >= this.numMenusShown ? _MenuBar.OVERFLOW_INDEX : menuIndex;
    const customMenu = actualMenuIndex === _MenuBar.OVERFLOW_INDEX ? this.overflowMenu : this.menus[actualMenuIndex];
    if (!customMenu.actions || !customMenu.buttonElement || !customMenu.titleElement) {
      return;
    }
    const menuHolder = $("div.menubar-menu-items-holder", { "title": "" });
    customMenu.buttonElement.classList.add("open");
    const titleBoundingRect = customMenu.titleElement.getBoundingClientRect();
    const titleBoundingRectZoom = DOM.getDomNodeZoomLevel(customMenu.titleElement);
    if (this.options.compactMode?.horizontal === HorizontalDirection.Right) {
      menuHolder.style.left = `${titleBoundingRect.left + this.container.clientWidth}px`;
    } else if (this.options.compactMode?.horizontal === HorizontalDirection.Left) {
      const windowWidth = DOM.getWindow(this.container).innerWidth;
      menuHolder.style.right = `${windowWidth - titleBoundingRect.left}px`;
      menuHolder.style.left = "auto";
    } else {
      menuHolder.style.left = `${titleBoundingRect.left * titleBoundingRectZoom}px`;
    }
    if (this.options.compactMode?.vertical === VerticalDirection.Above) {
      menuHolder.style.top = `${titleBoundingRect.top - this.menus.length * 30 + this.container.clientHeight}px`;
    } else if (this.options.compactMode?.vertical === VerticalDirection.Below) {
      menuHolder.style.top = `${titleBoundingRect.top}px`;
    } else {
      menuHolder.style.top = `${titleBoundingRect.bottom * titleBoundingRectZoom}px`;
    }
    customMenu.buttonElement.appendChild(menuHolder);
    const menuOptions = {
      getKeyBinding: this.options.getKeybinding,
      actionRunner: this.actionRunner,
      enableMnemonics: this.options.alwaysOnMnemonics || this.mnemonicsInUse && this.options.enableMnemonics,
      ariaLabel: customMenu.buttonElement.getAttribute("aria-label") ?? void 0,
      expandDirection: this.isCompact ? this.options.compactMode : { horizontal: HorizontalDirection.Right, vertical: VerticalDirection.Below },
      useEventAsContext: true
    };
    const menuWidget = this.menuDisposables.add(new Menu(menuHolder, customMenu.actions, menuOptions, this.menuStyle));
    this.menuDisposables.add(menuWidget.onDidCancel(() => {
      this.focusState = 2 /* FOCUSED */;
    }));
    if (actualMenuIndex !== menuIndex) {
      menuWidget.trigger(menuIndex - this.numMenusShown);
    } else {
      menuWidget.focus(selectFirst);
    }
    this.focusedMenu = {
      index: actualMenuIndex,
      holder: menuHolder,
      widget: menuWidget
    };
  }
};
_MenuBar.OVERFLOW_INDEX = -1;
let MenuBar = _MenuBar;
export {
  MenuBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9tZW51L21lbnViYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBicm93c2VyIGZyb20gJy4uLy4uL2Jyb3dzZXIuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlLCBHZXN0dXJlLCBHZXN0dXJlRXZlbnQgfSBmcm9tICcuLi8uLi90b3VjaC5qcyc7XG5pbXBvcnQgeyBjbGVhbk1uZW1vbmljLCBIb3Jpem9udGFsRGlyZWN0aW9uLCBJTWVudURpcmVjdGlvbiwgSU1lbnVPcHRpb25zLCBJTWVudVN0eWxlcywgTWVudSwgTUVOVV9FU0NBUEVEX01ORU1PTklDX1JFR0VYLCBNRU5VX01ORU1PTklDX1JFR0VYLCBWZXJ0aWNhbERpcmVjdGlvbiB9IGZyb20gJy4vbWVudS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIElBY3Rpb25SdW5uZXIsIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCwgU2NhbkNvZGUsIFNjYW5Db2RlVXRpbHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICcuL21lbnViYXIuY3NzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uL3dpbmRvdy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuZXhwb3J0IGludGVyZmFjZSBJTWVudUJhck9wdGlvbnMge1xuXHRlbmFibGVNbmVtb25pY3M/OiBib29sZWFuO1xuXHRkaXNhYmxlQWx0Rm9jdXM/OiBib29sZWFuO1xuXHR2aXNpYmlsaXR5Pzogc3RyaW5nO1xuXHRnZXRLZXliaW5kaW5nPzogKGFjdGlvbjogSUFjdGlvbikgPT4gUmVzb2x2ZWRLZXliaW5kaW5nIHwgdW5kZWZpbmVkO1xuXHRhbHdheXNPbk1uZW1vbmljcz86IGJvb2xlYW47XG5cdGNvbXBhY3RNb2RlPzogSU1lbnVEaXJlY3Rpb247XG5cdGFjdGlvblJ1bm5lcj86IElBY3Rpb25SdW5uZXI7XG5cdGdldENvbXBhY3RNZW51QWN0aW9ucz86ICgpID0+IElBY3Rpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNZW51QmFyTWVudSB7XG5cdGFjdGlvbnM6IElBY3Rpb25bXTtcblx0bGFiZWw6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE1lbnVCYXJNZW51V2l0aEVsZW1lbnRzIGV4dGVuZHMgTWVudUJhck1lbnUge1xuXHR0aXRsZUVsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0YnV0dG9uRWxlbWVudD86IEhUTUxFbGVtZW50O1xufVxuXG5lbnVtIE1lbnViYXJTdGF0ZSB7XG5cdEhJRERFTixcblx0VklTSUJMRSxcblx0Rk9DVVNFRCxcblx0T1BFTlxufVxuXG5leHBvcnQgY2xhc3MgTWVudUJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBPVkVSRkxPV19JTkRFWDogbnVtYmVyID0gLTE7XG5cblx0cHJpdmF0ZSBtZW51czogTWVudUJhck1lbnVXaXRoRWxlbWVudHNbXTtcblxuXHRwcml2YXRlIG92ZXJmbG93TWVudSE6IE1lbnVCYXJNZW51V2l0aEVsZW1lbnRzICYgeyB0aXRsZUVsZW1lbnQ6IEhUTUxFbGVtZW50OyBidXR0b25FbGVtZW50OiBIVE1MRWxlbWVudCB9O1xuXG5cdHByaXZhdGUgZm9jdXNlZE1lbnU6IHtcblx0XHRpbmRleDogbnVtYmVyO1xuXHRcdGhvbGRlcj86IEhUTUxFbGVtZW50O1xuXHRcdHdpZGdldD86IE1lbnU7XG5cdH0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBmb2N1c1RvUmV0dXJuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtZW51VXBkYXRlcjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHQvLyBJbnB1dC1yZWxhdGVkXG5cdHByaXZhdGUgX21uZW1vbmljc0luVXNlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgb3BlbmVkVmlhS2V5Ym9hcmQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBhd2FpdGluZ0FsdFJlbGVhc2U6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBpZ25vcmVOZXh0TW91c2VVcDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIG1uZW1vbmljczogTWFwPHN0cmluZywgbnVtYmVyPjtcblxuXHRwcml2YXRlIHVwZGF0ZVBlbmRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZm9jdXNTdGF0ZTogTWVudWJhclN0YXRlO1xuXHRwcml2YXRlIGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblZpc2liaWxpdHlDaGFuZ2U6IEVtaXR0ZXI8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRm9jdXNTdGF0ZUNoYW5nZTogRW1pdHRlcjxib29sZWFuPjtcblxuXHRwcml2YXRlIG51bU1lbnVzU2hvd246IG51bWJlciA9IDA7XG5cdHByaXZhdGUgb3ZlcmZsb3dMYXlvdXRTY2hlZHVsZWQ6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWVudURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByaXZhdGUgb3B0aW9uczogSU1lbnVCYXJPcHRpb25zLCBwcml2YXRlIG1lbnVTdHlsZTogSU1lbnVTdHlsZXMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21lbnViYXInKTtcblx0XHRpZiAodGhpcy5pc0NvbXBhY3QpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbXBhY3QnKTtcblx0XHR9XG5cblx0XHR0aGlzLm1lbnVzID0gW107XG5cdFx0dGhpcy5tbmVtb25pY3MgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdFx0dGhpcy5fZm9jdXNTdGF0ZSA9IE1lbnViYXJTdGF0ZS5WSVNJQkxFO1xuXG5cdFx0dGhpcy5fb25WaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdFx0dGhpcy5fb25Gb2N1c1N0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cblx0XHR0aGlzLmNyZWF0ZU92ZXJmbG93TWVudSgpO1xuXG5cdFx0dGhpcy5tZW51VXBkYXRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMudXBkYXRlKCksIDIwMCkpO1xuXG5cdFx0dGhpcy5hY3Rpb25SdW5uZXIgPSB0aGlzLm9wdGlvbnMuYWN0aW9uUnVubmVyID8/IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY3Rpb25SdW5uZXIub25XaWxsUnVuKCgpID0+IHtcblx0XHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uTW9kaWZpZXJLZXlFbWl0dGVyLmdldEluc3RhbmNlKCkuZXZlbnQodGhpcy5vbk1vZGlmaWVyS2V5VG9nZ2xlZCwgdGhpcykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGxldCBldmVudEhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3Qga2V5ID0gISFlLmtleSA/IGUua2V5LnRvTG9jYWxlTG93ZXJDYXNlKCkgOiAnJztcblxuXHRcdFx0Y29uc3QgdGFiTmF2ID0gaXNNYWNpbnRvc2ggJiYgIXRoaXMuaXNDb21wYWN0O1xuXG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuTGVmdEFycm93KSB8fCAodGFiTmF2ICYmIGV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYiB8IEtleU1vZC5TaGlmdCkpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNQcmV2aW91cygpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSB8fCAodGFiTmF2ICYmIGV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNOZXh0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkgJiYgdGhpcy5pc0ZvY3VzZWQgJiYgIXRoaXMuaXNPcGVuKSB7XG5cdFx0XHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuaXNPcGVuICYmICFldmVudC5jdHJsS2V5ICYmIHRoaXMub3B0aW9ucy5lbmFibGVNbmVtb25pY3MgJiYgdGhpcy5tbmVtb25pY3NJblVzZSAmJiB0aGlzLm1uZW1vbmljcy5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb25zdCBtZW51SW5kZXggPSB0aGlzLm1uZW1vbmljcy5nZXQoa2V5KSE7XG5cdFx0XHRcdHRoaXMub25NZW51VHJpZ2dlcmVkKG1lbnVJbmRleCwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5ldmVyIGFsbG93IGRlZmF1bHQgdGFiIGJlaGF2aW9yIHdoZW4gbm90IGNvbXBhY3Rcblx0XHRcdGlmICghdGhpcy5pc0NvbXBhY3QgJiYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYiB8IEtleU1vZC5TaGlmdCkgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuVGFiKSkpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2ZW50SGFuZGxlZCkge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB3aW5kb3cgPSBET00uZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdywgRE9NLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIG1vdXNlIGV2ZW50IGlzIG91dHNpZGUgdGhlIG1lbnViYXIgc28gaXQgY291bnRzIGFzIGEgZm9jdXMgb3V0XG5cdFx0XHRpZiAodGhpcy5pc0ZvY3VzZWQpIHtcblx0XHRcdFx0dGhpcy5zZXRVbmZvY3VzZWRTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIERPTS5FdmVudFR5cGUuRk9DVVNfSU4sIChlKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IGU7XG5cblx0XHRcdGlmIChldmVudC5yZWxhdGVkVGFyZ2V0KSB7XG5cdFx0XHRcdGlmICghdGhpcy5jb250YWluZXIuY29udGFpbnMoZXZlbnQucmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzVG9SZXR1cm4gPSBldmVudC5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5GT0NVU19PVVQsIChlKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IGU7XG5cblx0XHRcdC8vIFdlIGFyZSBsb3NpbmcgZm9jdXMgYW5kIHRoZXJlIGlzIG5vIHJlbGF0ZWQgdGFyZ2V0LCBlLmcuIHdlYnZpZXcgY2FzZVxuXHRcdFx0aWYgKCFldmVudC5yZWxhdGVkVGFyZ2V0KSB7XG5cdFx0XHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0XHRcdH1cblx0XHRcdC8vIFdlIGFyZSBsb3NpbmcgZm9jdXMgYW5kIHRoZXJlIGlzIGEgdGFyZ2V0LCByZXNldCBmb2N1c1RvUmV0dXJuIHZhbHVlIGFzIG5vdCB0byByZWRpcmVjdFxuXHRcdFx0ZWxzZSBpZiAoZXZlbnQucmVsYXRlZFRhcmdldCAmJiAhdGhpcy5jb250YWluZXIuY29udGFpbnMoZXZlbnQucmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCkpIHtcblx0XHRcdFx0dGhpcy5mb2N1c1RvUmV0dXJuID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLnNldFVuZm9jdXNlZFN0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3csIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMub3B0aW9ucy5lbmFibGVNbmVtb25pY3MgfHwgIWUuYWx0S2V5IHx8IGUuY3RybEtleSB8fCBlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBrZXkgPSBlLmtleS50b0xvY2FsZUxvd2VyQ2FzZSgpO1xuXHRcdFx0aWYgKCF0aGlzLm1uZW1vbmljcy5oYXMoa2V5KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubW5lbW9uaWNzSW5Vc2UgPSB0cnVlO1xuXHRcdFx0dGhpcy51cGRhdGVNbmVtb25pY1Zpc2liaWxpdHkodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IG1lbnVJbmRleCA9IHRoaXMubW5lbW9uaWNzLmdldChrZXkpITtcblx0XHRcdHRoaXMub25NZW51VHJpZ2dlcmVkKG1lbnVJbmRleCwgZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0fVxuXG5cdHB1c2goYXJnOiBNZW51QmFyTWVudSB8IE1lbnVCYXJNZW51W10pOiB2b2lkIHtcblx0XHRjb25zdCBtZW51czogTWVudUJhck1lbnVbXSA9IGFzQXJyYXkoYXJnKTtcblxuXHRcdG1lbnVzLmZvckVhY2goKG1lbnVCYXJNZW51KSA9PiB7XG5cdFx0XHRjb25zdCBtZW51SW5kZXggPSB0aGlzLm1lbnVzLmxlbmd0aDtcblx0XHRcdGNvbnN0IGNsZWFuTWVudUxhYmVsID0gY2xlYW5NbmVtb25pYyhtZW51QmFyTWVudS5sYWJlbCk7XG5cblx0XHRcdGNvbnN0IG1uZW1vbmljTWF0Y2hlcyA9IE1FTlVfTU5FTU9OSUNfUkVHRVguZXhlYyhtZW51QmFyTWVudS5sYWJlbCk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIG1uZW1vbmljc1xuXHRcdFx0aWYgKG1uZW1vbmljTWF0Y2hlcykge1xuXHRcdFx0XHRjb25zdCBtbmVtb25pYyA9ICEhbW5lbW9uaWNNYXRjaGVzWzFdID8gbW5lbW9uaWNNYXRjaGVzWzFdIDogbW5lbW9uaWNNYXRjaGVzWzNdO1xuXG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJNbmVtb25pYyh0aGlzLm1lbnVzLmxlbmd0aCwgbW5lbW9uaWMpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5pc0NvbXBhY3QpIHtcblx0XHRcdFx0dGhpcy5tZW51cy5wdXNoKG1lbnVCYXJNZW51KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbkVsZW1lbnQgPSAkKCdkaXYubWVudWJhci1tZW51LWJ1dHRvbicsIHsgJ3JvbGUnOiAnbWVudWl0ZW0nLCAndGFiaW5kZXgnOiAtMSwgJ2FyaWEtbGFiZWwnOiBjbGVhbk1lbnVMYWJlbCwgJ2FyaWEtaGFzcG9wdXAnOiB0cnVlIH0pO1xuXHRcdFx0XHRjb25zdCB0aXRsZUVsZW1lbnQgPSAkKCdkaXYubWVudWJhci1tZW51LXRpdGxlJywgeyAncm9sZSc6ICdub25lJywgJ2FyaWEtaGlkZGVuJzogdHJ1ZSB9KTtcblxuXHRcdFx0XHRidXR0b25FbGVtZW50LmFwcGVuZENoaWxkKHRpdGxlRWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmluc2VydEJlZm9yZShidXR0b25FbGVtZW50LCB0aGlzLm92ZXJmbG93TWVudS5idXR0b25FbGVtZW50KTtcblxuXHRcdFx0XHR0aGlzLnVwZGF0ZUxhYmVscyh0aXRsZUVsZW1lbnQsIGJ1dHRvbkVsZW1lbnQsIG1lbnVCYXJNZW51LmxhYmVsKTtcblxuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbkVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX1VQLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0XHRsZXQgZXZlbnRIYW5kbGVkID0gdHJ1ZTtcblxuXHRcdFx0XHRcdGlmICgoZXZlbnQuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpICYmICF0aGlzLmlzT3Blbikge1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c2VkTWVudSA9IHsgaW5kZXg6IG1lbnVJbmRleCB9O1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuZWRWaWFLZXlib2FyZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLmZvY3VzU3RhdGUgPSBNZW51YmFyU3RhdGUuT1BFTjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGV2ZW50SGFuZGxlZCkge1xuXHRcdFx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KGJ1dHRvbkVsZW1lbnQpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b25FbGVtZW50LCBFdmVudFR5cGUuVGFwLCAoZTogR2VzdHVyZUV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0Ly8gSWdub3JlIHRoaXMgdG91Y2ggaWYgdGhlIG1lbnUgaXMgdG91Y2hlZFxuXHRcdFx0XHRcdGlmICh0aGlzLmlzT3BlbiAmJiB0aGlzLmZvY3VzZWRNZW51ICYmIHRoaXMuZm9jdXNlZE1lbnUuaG9sZGVyICYmIERPTS5pc0FuY2VzdG9yKGUuaW5pdGlhbFRhcmdldCBhcyBIVE1MRWxlbWVudCwgdGhpcy5mb2N1c2VkTWVudS5ob2xkZXIpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5pZ25vcmVOZXh0TW91c2VVcCA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMub25NZW51VHJpZ2dlcmVkKG1lbnVJbmRleCwgdHJ1ZSk7XG5cblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRcdC8vIElnbm9yZSBub24tbGVmdC1jbGlja1xuXHRcdFx0XHRcdGNvbnN0IG1vdXNlRXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KERPTS5nZXRXaW5kb3coYnV0dG9uRWxlbWVudCksIGUpO1xuXHRcdFx0XHRcdGlmICghbW91c2VFdmVudC5sZWZ0QnV0dG9uKSB7XG5cdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzT3Blbikge1xuXHRcdFx0XHRcdFx0Ly8gT3BlbiB0aGUgbWVudSB3aXRoIG1vdXNlIGRvd24gYW5kIGlnbm9yZSB0aGUgZm9sbG93aW5nIG1vdXNlIHVwIGV2ZW50XG5cdFx0XHRcdFx0XHR0aGlzLmlnbm9yZU5leHRNb3VzZVVwID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRoaXMub25NZW51VHJpZ2dlcmVkKG1lbnVJbmRleCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuaWdub3JlTmV4dE1vdXNlVXAgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9VUCwgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoZS5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlnbm9yZU5leHRNb3VzZVVwKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5pc0ZvY3VzZWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5vbk1lbnVUcmlnZ2VyZWQobWVudUluZGV4LCB0cnVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5pZ25vcmVOZXh0TW91c2VVcCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzT3BlbiAmJiAhdGhpcy5pc0N1cnJlbnRNZW51KG1lbnVJbmRleCkpIHtcblx0XHRcdFx0XHRcdGJ1dHRvbkVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0XHRcdHRoaXMuY2xlYW51cEN1c3RvbU1lbnUoKTtcblx0XHRcdFx0XHRcdHRoaXMuc2hvd0N1c3RvbU1lbnUobWVudUluZGV4LCBmYWxzZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmlzRm9jdXNlZCAmJiAhdGhpcy5pc09wZW4pIHtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXNlZE1lbnUgPSB7IGluZGV4OiBtZW51SW5kZXggfTtcblx0XHRcdFx0XHRcdGJ1dHRvbkVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHR0aGlzLm1lbnVzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBtZW51QmFyTWVudS5sYWJlbCxcblx0XHRcdFx0XHRhY3Rpb25zOiBtZW51QmFyTWVudS5hY3Rpb25zLFxuXHRcdFx0XHRcdGJ1dHRvbkVsZW1lbnQ6IGJ1dHRvbkVsZW1lbnQsXG5cdFx0XHRcdFx0dGl0bGVFbGVtZW50OiB0aXRsZUVsZW1lbnRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRjcmVhdGVPdmVyZmxvd01lbnUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmlzQ29tcGFjdCA/IG5scy5sb2NhbGl6ZSgnbUFwcE1lbnUnLCAnQXBwbGljYXRpb24gTWVudScpIDogbmxzLmxvY2FsaXplKCdtTW9yZScsICdNb3JlJyk7XG5cdFx0Y29uc3QgYnV0dG9uRWxlbWVudCA9ICQoJ2Rpdi5tZW51YmFyLW1lbnUtYnV0dG9uJywgeyAncm9sZSc6ICdtZW51aXRlbScsICd0YWJpbmRleCc6IHRoaXMuaXNDb21wYWN0ID8gMCA6IC0xLCAnYXJpYS1sYWJlbCc6IGxhYmVsLCAnYXJpYS1oYXNwb3B1cCc6IHRydWUgfSk7XG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gJCgnZGl2Lm1lbnViYXItbWVudS10aXRsZS50b29sYmFyLXRvZ2dsZS1tb3JlJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24ubWVudUJhck1vcmUpLCB7ICdyb2xlJzogJ25vbmUnLCAnYXJpYS1oaWRkZW4nOiB0cnVlIH0pO1xuXG5cdFx0YnV0dG9uRWxlbWVudC5hcHBlbmRDaGlsZCh0aXRsZUVsZW1lbnQpO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGJ1dHRvbkVsZW1lbnQpO1xuXHRcdGJ1dHRvbkVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b25FbGVtZW50LCBET00uRXZlbnRUeXBlLktFWV9VUCwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGxldCBldmVudEhhbmRsZWQgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCB0cmlnZ2VyS2V5cyA9IFtLZXlDb2RlLkVudGVyXTtcblx0XHRcdGlmICghdGhpcy5pc0NvbXBhY3QpIHtcblx0XHRcdFx0dHJpZ2dlcktleXMucHVzaChLZXlDb2RlLkRvd25BcnJvdyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0cmlnZ2VyS2V5cy5wdXNoKEtleUNvZGUuU3BhY2UpO1xuXG5cdFx0XHRcdGlmICh0aGlzLm9wdGlvbnMuY29tcGFjdE1vZGU/Lmhvcml6b250YWwgPT09IEhvcml6b250YWxEaXJlY3Rpb24uUmlnaHQpIHtcblx0XHRcdFx0XHR0cmlnZ2VyS2V5cy5wdXNoKEtleUNvZGUuUmlnaHRBcnJvdyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5vcHRpb25zLmNvbXBhY3RNb2RlPy5ob3Jpem9udGFsID09PSBIb3Jpem9udGFsRGlyZWN0aW9uLkxlZnQpIHtcblx0XHRcdFx0XHR0cmlnZ2VyS2V5cy5wdXNoKEtleUNvZGUuTGVmdEFycm93KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoKHRyaWdnZXJLZXlzLnNvbWUoayA9PiBldmVudC5lcXVhbHMoaykpICYmICF0aGlzLmlzT3BlbikpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkTWVudSA9IHsgaW5kZXg6IE1lbnVCYXIuT1ZFUkZMT1dfSU5ERVggfTtcblx0XHRcdFx0dGhpcy5vcGVuZWRWaWFLZXlib2FyZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuZm9jdXNTdGF0ZSA9IE1lbnViYXJTdGF0ZS5PUEVOO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChldmVudEhhbmRsZWQpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQoYnV0dG9uRWxlbWVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uRWxlbWVudCwgRXZlbnRUeXBlLlRhcCwgKGU6IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0Ly8gSWdub3JlIHRoaXMgdG91Y2ggaWYgdGhlIG1lbnUgaXMgdG91Y2hlZFxuXHRcdFx0aWYgKHRoaXMuaXNPcGVuICYmIHRoaXMuZm9jdXNlZE1lbnUgJiYgdGhpcy5mb2N1c2VkTWVudS5ob2xkZXIgJiYgRE9NLmlzQW5jZXN0b3IoZS5pbml0aWFsVGFyZ2V0IGFzIEhUTUxFbGVtZW50LCB0aGlzLmZvY3VzZWRNZW51LmhvbGRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmlnbm9yZU5leHRNb3VzZVVwID0gZmFsc2U7XG5cdFx0XHR0aGlzLm9uTWVudVRyaWdnZXJlZChNZW51QmFyLk9WRVJGTE9XX0lOREVYLCB0cnVlKTtcblxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbkVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfRE9XTiwgKGUpID0+IHtcblx0XHRcdC8vIElnbm9yZSBub24tbGVmdC1jbGlja1xuXHRcdFx0Y29uc3QgbW91c2VFdmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoRE9NLmdldFdpbmRvdyhidXR0b25FbGVtZW50KSwgZSk7XG5cdFx0XHRpZiAoIW1vdXNlRXZlbnQubGVmdEJ1dHRvbikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmlzT3Blbikge1xuXHRcdFx0XHQvLyBPcGVuIHRoZSBtZW51IHdpdGggbW91c2UgZG93biBhbmQgaWdub3JlIHRoZSBmb2xsb3dpbmcgbW91c2UgdXAgZXZlbnRcblx0XHRcdFx0dGhpcy5pZ25vcmVOZXh0TW91c2VVcCA9IHRydWU7XG5cdFx0XHRcdHRoaXMub25NZW51VHJpZ2dlcmVkKE1lbnVCYXIuT1ZFUkZMT1dfSU5ERVgsIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5pZ25vcmVOZXh0TW91c2VVcCA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9VUCwgKGUpID0+IHtcblx0XHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuaWdub3JlTmV4dE1vdXNlVXApIHtcblx0XHRcdFx0aWYgKHRoaXMuaXNGb2N1c2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5vbk1lbnVUcmlnZ2VyZWQoTWVudUJhci5PVkVSRkxPV19JTkRFWCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaWdub3JlTmV4dE1vdXNlVXAgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbkVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfRU5URVIsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzT3BlbiAmJiAhdGhpcy5pc0N1cnJlbnRNZW51KE1lbnVCYXIuT1ZFUkZMT1dfSU5ERVgpKSB7XG5cdFx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmJ1dHRvbkVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0dGhpcy5jbGVhbnVwQ3VzdG9tTWVudSgpO1xuXHRcdFx0XHR0aGlzLnNob3dDdXN0b21NZW51KE1lbnVCYXIuT1ZFUkZMT1dfSU5ERVgsIGZhbHNlKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5pc0ZvY3VzZWQgJiYgIXRoaXMuaXNPcGVuKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZE1lbnUgPSB7IGluZGV4OiBNZW51QmFyLk9WRVJGTE9XX0lOREVYIH07XG5cdFx0XHRcdGJ1dHRvbkVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLm92ZXJmbG93TWVudSA9IHtcblx0XHRcdGJ1dHRvbkVsZW1lbnQ6IGJ1dHRvbkVsZW1lbnQsXG5cdFx0XHR0aXRsZUVsZW1lbnQ6IHRpdGxlRWxlbWVudCxcblx0XHRcdGxhYmVsOiAnTW9yZScsXG5cdFx0XHRhY3Rpb25zOiBbXVxuXHRcdH07XG5cdH1cblxuXHR1cGRhdGVNZW51KG1lbnU6IE1lbnVCYXJNZW51KTogdm9pZCB7XG5cdFx0Y29uc3QgbWVudVRvVXBkYXRlID0gdGhpcy5tZW51cy5maWx0ZXIobWVudUJhck1lbnUgPT4gbWVudUJhck1lbnUubGFiZWwgPT09IG1lbnUubGFiZWwpO1xuXHRcdGlmIChtZW51VG9VcGRhdGUgJiYgbWVudVRvVXBkYXRlLmxlbmd0aCkge1xuXHRcdFx0bWVudVRvVXBkYXRlWzBdLmFjdGlvbnMgPSBtZW51LmFjdGlvbnM7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLm1lbnVzLmZvckVhY2gobWVudUJhck1lbnUgPT4ge1xuXHRcdFx0bWVudUJhck1lbnUudGl0bGVFbGVtZW50Py5yZW1vdmUoKTtcblx0XHRcdG1lbnVCYXJNZW51LmJ1dHRvbkVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5vdmVyZmxvd01lbnUudGl0bGVFbGVtZW50LnJlbW92ZSgpO1xuXHRcdHRoaXMub3ZlcmZsb3dNZW51LmJ1dHRvbkVsZW1lbnQucmVtb3ZlKCk7XG5cblx0XHRkaXNwb3NlKHRoaXMub3ZlcmZsb3dMYXlvdXRTY2hlZHVsZWQpO1xuXHRcdHRoaXMub3ZlcmZsb3dMYXlvdXRTY2hlZHVsZWQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRibHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0fVxuXG5cdGdldFdpZHRoKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLmlzQ29tcGFjdCAmJiB0aGlzLm1lbnVzKSB7XG5cdFx0XHRjb25zdCBsZWZ0ID0gdGhpcy5tZW51c1swXS5idXR0b25FbGVtZW50IS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5sZWZ0O1xuXHRcdFx0Y29uc3QgcmlnaHQgPSB0aGlzLmhhc092ZXJmbG93ID8gdGhpcy5vdmVyZmxvd01lbnUuYnV0dG9uRWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5yaWdodCA6IHRoaXMubWVudXNbdGhpcy5tZW51cy5sZW5ndGggLSAxXS5idXR0b25FbGVtZW50IS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5yaWdodDtcblx0XHRcdHJldHVybiByaWdodCAtIGxlZnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5jb250YWluZXIuY2xpZW50SGVpZ2h0O1xuXHR9XG5cblx0dG9nZ2xlRm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzRm9jdXNlZCAmJiB0aGlzLm9wdGlvbnMudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicpIHtcblx0XHRcdHRoaXMubW5lbW9uaWNzSW5Vc2UgPSB0cnVlO1xuXHRcdFx0dGhpcy5mb2N1c2VkTWVudSA9IHsgaW5kZXg6IHRoaXMubnVtTWVudXNTaG93biA+IDAgPyAwIDogTWVudUJhci5PVkVSRkxPV19JTkRFWCB9O1xuXHRcdFx0dGhpcy5mb2N1c1N0YXRlID0gTWVudWJhclN0YXRlLkZPQ1VTRUQ7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5pc09wZW4pIHtcblx0XHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU92ZXJmbG93QWN0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tZW51cyB8fCAhdGhpcy5tZW51cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdmVyZmxvd01lbnVPbmx5Q2xhc3MgPSAnb3ZlcmZsb3ctbWVudS1vbmx5JztcblxuXHRcdC8vIFJlbW92ZSBvdmVyZmxvdyBvbmx5IHJlc3RyaWN0aW9uIHRvIGFsbG93IHRoZSBtb3N0IHNwYWNlXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShvdmVyZmxvd01lbnVPbmx5Q2xhc3MsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHNpemVBdmFpbGFibGUgPSB0aGlzLmNvbnRhaW5lci5vZmZzZXRXaWR0aDtcblx0XHRsZXQgY3VycmVudFNpemUgPSAwO1xuXHRcdGxldCBmdWxsID0gdGhpcy5pc0NvbXBhY3Q7XG5cdFx0Y29uc3QgcHJldk51bU1lbnVzU2hvd24gPSB0aGlzLm51bU1lbnVzU2hvd247XG5cdFx0dGhpcy5udW1NZW51c1Nob3duID0gMDtcblxuXHRcdGNvbnN0IHNob3dhYmxlTWVudXMgPSB0aGlzLm1lbnVzLmZpbHRlcihtZW51ID0+IG1lbnUuYnV0dG9uRWxlbWVudCAhPT0gdW5kZWZpbmVkICYmIG1lbnUudGl0bGVFbGVtZW50ICE9PSB1bmRlZmluZWQpIGFzIChNZW51QmFyTWVudVdpdGhFbGVtZW50cyAmIHsgdGl0bGVFbGVtZW50OiBIVE1MRWxlbWVudDsgYnV0dG9uRWxlbWVudDogSFRNTEVsZW1lbnQgfSlbXTtcblx0XHRmb3IgKGNvbnN0IG1lbnVCYXJNZW51IG9mIHNob3dhYmxlTWVudXMpIHtcblx0XHRcdGlmICghZnVsbCkge1xuXHRcdFx0XHRjb25zdCBzaXplID0gbWVudUJhck1lbnUuYnV0dG9uRWxlbWVudC5vZmZzZXRXaWR0aDtcblx0XHRcdFx0aWYgKGN1cnJlbnRTaXplICsgc2l6ZSA+IHNpemVBdmFpbGFibGUpIHtcblx0XHRcdFx0XHRmdWxsID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJyZW50U2l6ZSArPSBzaXplO1xuXHRcdFx0XHRcdHRoaXMubnVtTWVudXNTaG93bisrO1xuXHRcdFx0XHRcdGlmICh0aGlzLm51bU1lbnVzU2hvd24gPiBwcmV2TnVtTWVudXNTaG93bikge1xuXHRcdFx0XHRcdFx0bWVudUJhck1lbnUuYnV0dG9uRWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZnVsbCkge1xuXHRcdFx0XHRtZW51QmFyTWVudS5idXR0b25FbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdC8vIElmIGJlbG93IG1pbmltaXVtIG1lbnUgdGhyZXNob2xkLCBzaG93IHRoZSBvdmVyZmxvdyBtZW51IG9ubHkgYXMgaGFtYnVyZ2VyIG1lbnVcblx0XHRpZiAodGhpcy5udW1NZW51c1Nob3duIC0gMSA8PSBzaG93YWJsZU1lbnVzLmxlbmd0aCAvIDQpIHtcblx0XHRcdGZvciAoY29uc3QgbWVudUJhck1lbnUgb2Ygc2hvd2FibGVNZW51cykge1xuXHRcdFx0XHRtZW51QmFyTWVudS5idXR0b25FbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0XHRcdH1cblxuXHRcdFx0ZnVsbCA9IHRydWU7XG5cdFx0XHR0aGlzLm51bU1lbnVzU2hvd24gPSAwO1xuXHRcdFx0Y3VycmVudFNpemUgPSAwO1xuXHRcdH1cblxuXHRcdC8vIE92ZXJmbG93XG5cdFx0aWYgKHRoaXMuaXNDb21wYWN0KSB7XG5cdFx0XHR0aGlzLm92ZXJmbG93TWVudS5hY3Rpb25zID0gW107XG5cdFx0XHRmb3IgKGxldCBpZHggPSB0aGlzLm51bU1lbnVzU2hvd247IGlkeCA8IHRoaXMubWVudXMubGVuZ3RoOyBpZHgrKykge1xuXHRcdFx0XHR0aGlzLm92ZXJmbG93TWVudS5hY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oYG1lbnViYXIuc3VibWVudS4ke3RoaXMubWVudXNbaWR4XS5sYWJlbH1gLCB0aGlzLm1lbnVzW2lkeF0ubGFiZWwsIHRoaXMubWVudXNbaWR4XS5hY3Rpb25zIHx8IFtdKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbXBhY3RNZW51QWN0aW9ucyA9IHRoaXMub3B0aW9ucy5nZXRDb21wYWN0TWVudUFjdGlvbnM/LigpO1xuXHRcdFx0aWYgKGNvbXBhY3RNZW51QWN0aW9ucyAmJiBjb21wYWN0TWVudUFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHR0aGlzLm92ZXJmbG93TWVudS5hY3Rpb25zLnB1c2goLi4uY29tcGFjdE1lbnVBY3Rpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5vdmVyZmxvd01lbnUuYnV0dG9uRWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdH0gZWxzZSBpZiAoZnVsbCkge1xuXHRcdFx0Ly8gQ2FuJ3QgZml0IHRoZSBtb3JlIGJ1dHRvbiwgbmVlZCB0byByZW1vdmUgbW9yZSBtZW51c1xuXHRcdFx0d2hpbGUgKGN1cnJlbnRTaXplICsgdGhpcy5vdmVyZmxvd01lbnUuYnV0dG9uRWxlbWVudC5vZmZzZXRXaWR0aCA+IHNpemVBdmFpbGFibGUgJiYgdGhpcy5udW1NZW51c1Nob3duID4gMCkge1xuXHRcdFx0XHR0aGlzLm51bU1lbnVzU2hvd24tLTtcblx0XHRcdFx0Y29uc3Qgc2l6ZSA9IHNob3dhYmxlTWVudXNbdGhpcy5udW1NZW51c1Nob3duXS5idXR0b25FbGVtZW50Lm9mZnNldFdpZHRoO1xuXHRcdFx0XHRzaG93YWJsZU1lbnVzW3RoaXMubnVtTWVudXNTaG93bl0uYnV0dG9uRWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0XHRcdGN1cnJlbnRTaXplIC09IHNpemU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmFjdGlvbnMgPSBbXTtcblx0XHRcdGZvciAobGV0IGlkeCA9IHRoaXMubnVtTWVudXNTaG93bjsgaWR4IDwgc2hvd2FibGVNZW51cy5sZW5ndGg7IGlkeCsrKSB7XG5cdFx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmFjdGlvbnMucHVzaChuZXcgU3VibWVudUFjdGlvbihgbWVudWJhci5zdWJtZW51LiR7c2hvd2FibGVNZW51c1tpZHhdLmxhYmVsfWAsIHNob3dhYmxlTWVudXNbaWR4XS5sYWJlbCwgc2hvd2FibGVNZW51c1tpZHhdLmFjdGlvbnMgfHwgW10pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub3ZlcmZsb3dNZW51LmJ1dHRvbkVsZW1lbnQubmV4dEVsZW1lbnRTaWJsaW5nICE9PSBzaG93YWJsZU1lbnVzW3RoaXMubnVtTWVudXNTaG93bl0uYnV0dG9uRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLm92ZXJmbG93TWVudS5idXR0b25FbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5pbnNlcnRCZWZvcmUodGhpcy5vdmVyZmxvd01lbnUuYnV0dG9uRWxlbWVudCwgc2hvd2FibGVNZW51c1t0aGlzLm51bU1lbnVzU2hvd25dLmJ1dHRvbkVsZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm92ZXJmbG93TWVudS5idXR0b25FbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAndmlzaWJsZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmJ1dHRvbkVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm92ZXJmbG93TWVudS5idXR0b25FbGVtZW50KTtcblx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmJ1dHRvbkVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIGFyZSBvbmx5IHNob3dpbmcgdGhlIG92ZXJmbG93LCBhZGQgdGhpcyBjbGFzcyB0byBhdm9pZCB0YWtpbmcgdXAgc3BhY2Vcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKG92ZXJmbG93TWVudU9ubHlDbGFzcywgdGhpcy5udW1NZW51c1Nob3duID09PSAwKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFiZWxzKHRpdGxlRWxlbWVudDogSFRNTEVsZW1lbnQsIGJ1dHRvbkVsZW1lbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2xlYW5NZW51TGFiZWwgPSBjbGVhbk1uZW1vbmljKGxhYmVsKTtcblxuXHRcdC8vIFVwZGF0ZSB0aGUgYnV0dG9uIGxhYmVsIHRvIHJlZmxlY3QgbW5lbW9uaWNzXG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmVuYWJsZU1uZW1vbmljcykge1xuXHRcdFx0Y29uc3QgY2xlYW5MYWJlbCA9IHN0cmluZ3MuZXNjYXBlKGxhYmVsKTtcblxuXHRcdFx0Ly8gVGhpcyBpcyBnbG9iYWwgc28gcmVzZXQgaXRcblx0XHRcdE1FTlVfRVNDQVBFRF9NTkVNT05JQ19SRUdFWC5sYXN0SW5kZXggPSAwO1xuXHRcdFx0bGV0IGVzY01hdGNoID0gTUVOVV9FU0NBUEVEX01ORU1PTklDX1JFR0VYLmV4ZWMoY2xlYW5MYWJlbCk7XG5cblx0XHRcdC8vIFdlIGNhbid0IHVzZSBuZWdhdGl2ZSBsb29rYmVoaW5kIHNvIHdlIG1hdGNoIG91ciBuZWdhdGl2ZSBhbmQgc2tpcFxuXHRcdFx0d2hpbGUgKGVzY01hdGNoICYmIGVzY01hdGNoWzFdKSB7XG5cdFx0XHRcdGVzY01hdGNoID0gTUVOVV9FU0NBUEVEX01ORU1PTklDX1JFR0VYLmV4ZWMoY2xlYW5MYWJlbCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlcGxhY2VEb3VibGVFc2NhcGVzID0gKHN0cjogc3RyaW5nKSA9PiBzdHIucmVwbGFjZSgvJmFtcDsmYW1wOy9nLCAnJmFtcDsnKTtcblxuXHRcdFx0aWYgKGVzY01hdGNoKSB7XG5cdFx0XHRcdHRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHR0aXRsZUVsZW1lbnQuYXBwZW5kKFxuXHRcdFx0XHRcdHN0cmluZ3MubHRyaW0ocmVwbGFjZURvdWJsZUVzY2FwZXMoY2xlYW5MYWJlbC5zdWJzdHIoMCwgZXNjTWF0Y2guaW5kZXgpKSwgJyAnKSxcblx0XHRcdFx0XHQkKCdtbmVtb25pYycsIHsgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0sIGVzY01hdGNoWzNdKSxcblx0XHRcdFx0XHRzdHJpbmdzLnJ0cmltKHJlcGxhY2VEb3VibGVFc2NhcGVzKGNsZWFuTGFiZWwuc3Vic3RyKGVzY01hdGNoLmluZGV4ICsgZXNjTWF0Y2hbMF0ubGVuZ3RoKSksICcgJylcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IHJlcGxhY2VEb3VibGVFc2NhcGVzKGNsZWFuTGFiZWwpLnRyaW0oKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gY2xlYW5NZW51TGFiZWwucmVwbGFjZSgvJiYvZywgJyYnKTtcblx0XHR9XG5cblx0XHRjb25zdCBtbmVtb25pY01hdGNoZXMgPSBNRU5VX01ORU1PTklDX1JFR0VYLmV4ZWMobGFiZWwpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgbW5lbW9uaWNzXG5cdFx0aWYgKG1uZW1vbmljTWF0Y2hlcykge1xuXHRcdFx0Y29uc3QgbW5lbW9uaWMgPSAhIW1uZW1vbmljTWF0Y2hlc1sxXSA/IG1uZW1vbmljTWF0Y2hlc1sxXSA6IG1uZW1vbmljTWF0Y2hlc1szXTtcblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5lbmFibGVNbmVtb25pY3MpIHtcblx0XHRcdFx0YnV0dG9uRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEta2V5c2hvcnRjdXRzJywgJ0FsdCsnICsgbW5lbW9uaWMudG9Mb2NhbGVMb3dlckNhc2UoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidXR0b25FbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1rZXlzaG9ydGN1dHMnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR1cGRhdGUob3B0aW9ucz86IElNZW51QmFyT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHVwZGF0ZSB3aGlsZSB1c2luZyB0aGUgbWVudVxuXHRcdGlmICh0aGlzLmlzRm9jdXNlZCkge1xuXHRcdFx0dGhpcy51cGRhdGVQZW5kaW5nID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm1lbnVzLmZvckVhY2gobWVudUJhck1lbnUgPT4ge1xuXHRcdFx0aWYgKCFtZW51QmFyTWVudS5idXR0b25FbGVtZW50IHx8ICFtZW51QmFyTWVudS50aXRsZUVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZUxhYmVscyhtZW51QmFyTWVudS50aXRsZUVsZW1lbnQsIG1lbnVCYXJNZW51LmJ1dHRvbkVsZW1lbnQsIG1lbnVCYXJNZW51LmxhYmVsKTtcblx0XHR9KTtcblxuXHRcdGlmICghdGhpcy5vdmVyZmxvd0xheW91dFNjaGVkdWxlZCkge1xuXHRcdFx0dGhpcy5vdmVyZmxvd0xheW91dFNjaGVkdWxlZCA9IERPTS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKERPTS5nZXRXaW5kb3codGhpcy5jb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlT3ZlcmZsb3dBY3Rpb24oKTtcblx0XHRcdFx0dGhpcy5vdmVyZmxvd0xheW91dFNjaGVkdWxlZCA9IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNbmVtb25pYyhtZW51SW5kZXg6IG51bWJlciwgbW5lbW9uaWM6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubW5lbW9uaWNzLnNldChtbmVtb25pYy50b0xvY2FsZUxvd2VyQ2FzZSgpLCBtZW51SW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlTWVudWJhcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250YWluZXIuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fb25WaXNpYmlsaXR5Q2hhbmdlLmZpcmUoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd01lbnViYXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgIT09ICdmbGV4Jykge1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdHRoaXMuX29uVmlzaWJpbGl0eUNoYW5nZS5maXJlKHRydWUpO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZU92ZXJmbG93QWN0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZm9jdXNTdGF0ZSgpOiBNZW51YmFyU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9mb2N1c1N0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgZm9jdXNTdGF0ZSh2YWx1ZTogTWVudWJhclN0YXRlKSB7XG5cdFx0aWYgKHRoaXMuX2ZvY3VzU3RhdGUgPj0gTWVudWJhclN0YXRlLkZPQ1VTRUQgJiYgdmFsdWUgPCBNZW51YmFyU3RhdGUuRk9DVVNFRCkge1xuXHRcdFx0Ly8gTG9zaW5nIGZvY3VzLCB1cGRhdGUgdGhlIG1lbnUgaWYgbmVlZGVkXG5cblx0XHRcdGlmICh0aGlzLnVwZGF0ZVBlbmRpbmcpIHtcblx0XHRcdFx0dGhpcy5tZW51VXBkYXRlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVBlbmRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodmFsdWUgPT09IHRoaXMuX2ZvY3VzU3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc1Zpc2libGUgPSB0aGlzLmlzVmlzaWJsZTtcblx0XHRjb25zdCBpc09wZW4gPSB0aGlzLmlzT3Blbjtcblx0XHRjb25zdCBpc0ZvY3VzZWQgPSB0aGlzLmlzRm9jdXNlZDtcblxuXHRcdHRoaXMuX2ZvY3VzU3RhdGUgPSB2YWx1ZTtcblxuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgTWVudWJhclN0YXRlLkhJRERFTjpcblx0XHRcdFx0aWYgKGlzVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuaGlkZU1lbnViYXIoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc09wZW4pIHtcblx0XHRcdFx0XHR0aGlzLmNsZWFudXBDdXN0b21NZW51KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNGb2N1c2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c2VkTWVudSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGlmICh0aGlzLmZvY3VzVG9SZXR1cm4pIHtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXNUb1JldHVybi5mb2N1cygpO1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c1RvUmV0dXJuID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1lbnViYXJTdGF0ZS5WSVNJQkxFOlxuXHRcdFx0XHRpZiAoIWlzVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuc2hvd01lbnViYXIoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc09wZW4pIHtcblx0XHRcdFx0XHR0aGlzLmNsZWFudXBDdXN0b21NZW51KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNGb2N1c2VkKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZm9jdXNlZE1lbnUpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmZvY3VzZWRNZW51LmluZGV4ID09PSBNZW51QmFyLk9WRVJGTE9XX0lOREVYKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmJ1dHRvbkVsZW1lbnQuYmx1cigpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5tZW51c1t0aGlzLmZvY3VzZWRNZW51LmluZGV4XS5idXR0b25FbGVtZW50Py5ibHVyKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5mb2N1c2VkTWVudSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGlmICh0aGlzLmZvY3VzVG9SZXR1cm4pIHtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXNUb1JldHVybi5mb2N1cygpO1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c1RvUmV0dXJuID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNZW51YmFyU3RhdGUuRk9DVVNFRDpcblx0XHRcdFx0aWYgKCFpc1Zpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dNZW51YmFyKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNPcGVuKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhbnVwQ3VzdG9tTWVudSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuZm9jdXNlZE1lbnUpIHtcblx0XHRcdFx0XHQvLyBXaGVuIHRoZSBtZW51IGlzIHRvZ2dsZWQgb24sIGl0IG1heSBiZSBpbiBjb21wYWN0IHN0YXRlIGFuZCB0cnlpbmcgdG9cblx0XHRcdFx0XHQvLyBmb2N1cyB0aGUgZmlyc3QgbWVudS4gSW4gdGhpcyBjYXNlIHdlIHNob3VsZCBmb2N1cyB0aGUgb3ZlcmZsb3cgaW5zdGVhZC5cblx0XHRcdFx0XHRpZiAodGhpcy5mb2N1c2VkTWVudS5pbmRleCA9PT0gMCAmJiB0aGlzLm51bU1lbnVzU2hvd24gPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXNlZE1lbnUuaW5kZXggPSBNZW51QmFyLk9WRVJGTE9XX0lOREVYO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0aGlzLmZvY3VzZWRNZW51LmluZGV4ID09PSBNZW51QmFyLk9WRVJGTE9XX0lOREVYKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm92ZXJmbG93TWVudS5idXR0b25FbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubWVudXNbdGhpcy5mb2N1c2VkTWVudS5pbmRleF0uYnV0dG9uRWxlbWVudD8uZm9jdXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1lbnViYXJTdGF0ZS5PUEVOOlxuXHRcdFx0XHRpZiAoIWlzVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuc2hvd01lbnViYXIoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmZvY3VzZWRNZW51KSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhbnVwQ3VzdG9tTWVudSgpO1xuXHRcdFx0XHRcdHRoaXMuc2hvd0N1c3RvbU1lbnUodGhpcy5mb2N1c2VkTWVudS5pbmRleCwgdGhpcy5vcGVuZWRWaWFLZXlib2FyZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZm9jdXNTdGF0ZSA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRm9jdXNTdGF0ZUNoYW5nZS5maXJlKHRoaXMuZm9jdXNTdGF0ZSA+PSBNZW51YmFyU3RhdGUuRk9DVVNFRCk7XG5cdH1cblxuXHRnZXQgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmZvY3VzU3RhdGUgPj0gTWVudWJhclN0YXRlLlZJU0lCTEU7XG5cdH1cblxuXHRwcml2YXRlIGdldCBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZm9jdXNTdGF0ZSA+PSBNZW51YmFyU3RhdGUuRk9DVVNFRDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlzT3BlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5mb2N1c1N0YXRlID49IE1lbnViYXJTdGF0ZS5PUEVOO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaGFzT3ZlcmZsb3coKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNDb21wYWN0IHx8IHRoaXMubnVtTWVudXNTaG93biA8IHRoaXMubWVudXMubGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaXNDb21wYWN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuY29tcGFjdE1vZGUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc2V0VW5mb2N1c2VkU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy52aXNpYmlsaXR5ID09PSAndG9nZ2xlJyB8fCB0aGlzLm9wdGlvbnMudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHtcblx0XHRcdHRoaXMuZm9jdXNTdGF0ZSA9IE1lbnViYXJTdGF0ZS5ISURERU47XG5cdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMudmlzaWJpbGl0eSA9PT0gJ2NsYXNzaWMnICYmIGJyb3dzZXIuaXNGdWxsc2NyZWVuKG1haW5XaW5kb3cpKSB7XG5cdFx0XHR0aGlzLmZvY3VzU3RhdGUgPSBNZW51YmFyU3RhdGUuSElEREVOO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZvY3VzU3RhdGUgPSBNZW51YmFyU3RhdGUuVklTSUJMRTtcblx0XHR9XG5cblx0XHR0aGlzLmlnbm9yZU5leHRNb3VzZVVwID0gZmFsc2U7XG5cdFx0dGhpcy5tbmVtb25pY3NJblVzZSA9IGZhbHNlO1xuXHRcdHRoaXMudXBkYXRlTW5lbW9uaWNWaXNpYmlsaXR5KGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNQcmV2aW91cygpOiB2b2lkIHtcblxuXHRcdGlmICghdGhpcy5mb2N1c2VkTWVudSB8fCB0aGlzLm51bU1lbnVzU2hvd24gPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGxldCBuZXdGb2N1c2VkSW5kZXggPSAodGhpcy5mb2N1c2VkTWVudS5pbmRleCAtIDEgKyB0aGlzLm51bU1lbnVzU2hvd24pICUgdGhpcy5udW1NZW51c1Nob3duO1xuXHRcdGlmICh0aGlzLmZvY3VzZWRNZW51LmluZGV4ID09PSBNZW51QmFyLk9WRVJGTE9XX0lOREVYKSB7XG5cdFx0XHRuZXdGb2N1c2VkSW5kZXggPSB0aGlzLm51bU1lbnVzU2hvd24gLSAxO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5mb2N1c2VkTWVudS5pbmRleCA9PT0gMCAmJiB0aGlzLmhhc092ZXJmbG93KSB7XG5cdFx0XHRuZXdGb2N1c2VkSW5kZXggPSBNZW51QmFyLk9WRVJGTE9XX0lOREVYO1xuXHRcdH1cblxuXHRcdGlmIChuZXdGb2N1c2VkSW5kZXggPT09IHRoaXMuZm9jdXNlZE1lbnUuaW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc09wZW4pIHtcblx0XHRcdHRoaXMuY2xlYW51cEN1c3RvbU1lbnUoKTtcblx0XHRcdHRoaXMuc2hvd0N1c3RvbU1lbnUobmV3Rm9jdXNlZEluZGV4KTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNGb2N1c2VkKSB7XG5cdFx0XHR0aGlzLmZvY3VzZWRNZW51LmluZGV4ID0gbmV3Rm9jdXNlZEluZGV4O1xuXHRcdFx0aWYgKG5ld0ZvY3VzZWRJbmRleCA9PT0gTWVudUJhci5PVkVSRkxPV19JTkRFWCkge1xuXHRcdFx0XHR0aGlzLm92ZXJmbG93TWVudS5idXR0b25FbGVtZW50LmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1lbnVzW25ld0ZvY3VzZWRJbmRleF0uYnV0dG9uRWxlbWVudD8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzTmV4dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZm9jdXNlZE1lbnUgfHwgdGhpcy5udW1NZW51c1Nob3duID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG5ld0ZvY3VzZWRJbmRleCA9ICh0aGlzLmZvY3VzZWRNZW51LmluZGV4ICsgMSkgJSB0aGlzLm51bU1lbnVzU2hvd247XG5cdFx0aWYgKHRoaXMuZm9jdXNlZE1lbnUuaW5kZXggPT09IE1lbnVCYXIuT1ZFUkZMT1dfSU5ERVgpIHtcblx0XHRcdG5ld0ZvY3VzZWRJbmRleCA9IDA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmZvY3VzZWRNZW51LmluZGV4ID09PSB0aGlzLm51bU1lbnVzU2hvd24gLSAxKSB7XG5cdFx0XHRuZXdGb2N1c2VkSW5kZXggPSBNZW51QmFyLk9WRVJGTE9XX0lOREVYO1xuXHRcdH1cblxuXHRcdGlmIChuZXdGb2N1c2VkSW5kZXggPT09IHRoaXMuZm9jdXNlZE1lbnUuaW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc09wZW4pIHtcblx0XHRcdHRoaXMuY2xlYW51cEN1c3RvbU1lbnUoKTtcblx0XHRcdHRoaXMuc2hvd0N1c3RvbU1lbnUobmV3Rm9jdXNlZEluZGV4KTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNGb2N1c2VkKSB7XG5cdFx0XHR0aGlzLmZvY3VzZWRNZW51LmluZGV4ID0gbmV3Rm9jdXNlZEluZGV4O1xuXHRcdFx0aWYgKG5ld0ZvY3VzZWRJbmRleCA9PT0gTWVudUJhci5PVkVSRkxPV19JTkRFWCkge1xuXHRcdFx0XHR0aGlzLm92ZXJmbG93TWVudS5idXR0b25FbGVtZW50LmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1lbnVzW25ld0ZvY3VzZWRJbmRleF0uYnV0dG9uRWxlbWVudD8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1uZW1vbmljVmlzaWJpbGl0eSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVudXMpIHtcblx0XHRcdHRoaXMubWVudXMuZm9yRWFjaChtZW51QmFyTWVudSA9PiB7XG5cdFx0XHRcdGlmIChtZW51QmFyTWVudS50aXRsZUVsZW1lbnQgJiYgbWVudUJhck1lbnUudGl0bGVFbGVtZW50LmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkID0gbWVudUJhck1lbnUudGl0bGVFbGVtZW50LmNoaWxkcmVuLml0ZW0oMCkgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdFx0aWYgKGNoaWxkKSB7XG5cdFx0XHRcdFx0XHRjaGlsZC5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICh0aGlzLm9wdGlvbnMuYWx3YXlzT25NbmVtb25pY3MgfHwgdmlzaWJsZSkgPyAndW5kZXJsaW5lJyA6ICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbW5lbW9uaWNzSW5Vc2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21uZW1vbmljc0luVXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgbW5lbW9uaWNzSW5Vc2UodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9tbmVtb25pY3NJblVzZSA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2hvdWxkQWx0S2V5Rm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMuZGlzYWJsZUFsdEZvY3VzKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnZpc2liaWxpdHkgPT09ICd0b2dnbGUnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uVmlzaWJpbGl0eUNoYW5nZSgpOiBFdmVudDxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uVmlzaWJpbGl0eUNoYW5nZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25Gb2N1c1N0YXRlQ2hhbmdlKCk6IEV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25Gb2N1c1N0YXRlQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1lbnVUcmlnZ2VyZWQobWVudUluZGV4OiBudW1iZXIsIGNsaWNrZWQ6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5pc09wZW4pIHtcblx0XHRcdGlmICh0aGlzLmlzQ3VycmVudE1lbnUobWVudUluZGV4KSkge1xuXHRcdFx0XHR0aGlzLnNldFVuZm9jdXNlZFN0YXRlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNsZWFudXBDdXN0b21NZW51KCk7XG5cdFx0XHRcdHRoaXMuc2hvd0N1c3RvbU1lbnUobWVudUluZGV4LCB0aGlzLm9wZW5lZFZpYUtleWJvYXJkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5mb2N1c2VkTWVudSA9IHsgaW5kZXg6IG1lbnVJbmRleCB9O1xuXHRcdFx0dGhpcy5vcGVuZWRWaWFLZXlib2FyZCA9ICFjbGlja2VkO1xuXHRcdFx0dGhpcy5mb2N1c1N0YXRlID0gTWVudWJhclN0YXRlLk9QRU47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbk1vZGlmaWVyS2V5VG9nZ2xlZChtb2RpZmllcktleVN0YXR1czogRE9NLklNb2RpZmllcktleVN0YXR1cyk6IHZvaWQge1xuXHRcdGNvbnN0IGFsbE1vZGlmaWVyc1JlbGVhc2VkID0gIW1vZGlmaWVyS2V5U3RhdHVzLmFsdEtleSAmJiAhbW9kaWZpZXJLZXlTdGF0dXMuY3RybEtleSAmJiAhbW9kaWZpZXJLZXlTdGF0dXMuc2hpZnRLZXkgJiYgIW1vZGlmaWVyS2V5U3RhdHVzLm1ldGFLZXk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUHJldmVudCBhbHQta2V5IGRlZmF1bHQgaWYgdGhlIG1lbnUgaXMgbm90IGhpZGRlbiBhbmQgd2UgdXNlIGFsdCB0byBmb2N1c1xuXHRcdGlmIChtb2RpZmllcktleVN0YXR1cy5ldmVudCAmJiB0aGlzLnNob3VsZEFsdEtleUZvY3VzKSB7XG5cdFx0XHRpZiAoU2NhbkNvZGVVdGlscy50b0VudW0obW9kaWZpZXJLZXlTdGF0dXMuZXZlbnQuY29kZSkgPT09IFNjYW5Db2RlLkFsdExlZnQpIHtcblx0XHRcdFx0bW9kaWZpZXJLZXlTdGF0dXMuZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBbHQga2V5IHByZXNzZWQgd2hpbGUgbWVudSBpcyBmb2N1c2VkLiBUaGlzIHNob3VsZCByZXR1cm4gZm9jdXMgYXdheSBmcm9tIHRoZSBtZW51YmFyXG5cdFx0aWYgKHRoaXMuaXNGb2N1c2VkICYmIG1vZGlmaWVyS2V5U3RhdHVzLmxhc3RLZXlQcmVzc2VkID09PSAnYWx0JyAmJiBtb2RpZmllcktleVN0YXR1cy5hbHRLZXkpIHtcblx0XHRcdHRoaXMuc2V0VW5mb2N1c2VkU3RhdGUoKTtcblx0XHRcdHRoaXMubW5lbW9uaWNzSW5Vc2UgPSBmYWxzZTtcblx0XHRcdHRoaXMuYXdhaXRpbmdBbHRSZWxlYXNlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDbGVhbiBhbHQga2V5IHByZXNzIGFuZCByZWxlYXNlXG5cdFx0aWYgKGFsbE1vZGlmaWVyc1JlbGVhc2VkICYmIG1vZGlmaWVyS2V5U3RhdHVzLmxhc3RLZXlQcmVzc2VkID09PSAnYWx0JyAmJiBtb2RpZmllcktleVN0YXR1cy5sYXN0S2V5UmVsZWFzZWQgPT09ICdhbHQnKSB7XG5cdFx0XHRpZiAoIXRoaXMuYXdhaXRpbmdBbHRSZWxlYXNlKSB7XG5cdFx0XHRcdGlmICghdGhpcy5pc0ZvY3VzZWQgJiYgdGhpcy5zaG91bGRBbHRLZXlGb2N1cykge1xuXHRcdFx0XHRcdHRoaXMubW5lbW9uaWNzSW5Vc2UgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNlZE1lbnUgPSB7IGluZGV4OiB0aGlzLm51bU1lbnVzU2hvd24gPiAwID8gMCA6IE1lbnVCYXIuT1ZFUkZMT1dfSU5ERVggfTtcblx0XHRcdFx0XHR0aGlzLmZvY3VzU3RhdGUgPSBNZW51YmFyU3RhdGUuRk9DVVNFRDtcblx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy5pc09wZW4pIHtcblx0XHRcdFx0XHR0aGlzLnNldFVuZm9jdXNlZFN0YXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBbHQga2V5IHJlbGVhc2VkXG5cdFx0aWYgKCFtb2RpZmllcktleVN0YXR1cy5hbHRLZXkgJiYgbW9kaWZpZXJLZXlTdGF0dXMubGFzdEtleVJlbGVhc2VkID09PSAnYWx0Jykge1xuXHRcdFx0dGhpcy5hd2FpdGluZ0FsdFJlbGVhc2UgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmVuYWJsZU1uZW1vbmljcyAmJiB0aGlzLm1lbnVzICYmICF0aGlzLmlzT3Blbikge1xuXHRcdFx0dGhpcy51cGRhdGVNbmVtb25pY1Zpc2liaWxpdHkoKCF0aGlzLmF3YWl0aW5nQWx0UmVsZWFzZSAmJiBtb2RpZmllcktleVN0YXR1cy5hbHRLZXkpIHx8IHRoaXMubW5lbW9uaWNzSW5Vc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNDdXJyZW50TWVudShtZW51SW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5mb2N1c2VkTWVudSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmZvY3VzZWRNZW51LmluZGV4ID09PSBtZW51SW5kZXg7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFudXBDdXN0b21NZW51KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmZvY3VzZWRNZW51KSB7XG5cdFx0XHQvLyBSZW1vdmUgZm9jdXMgZnJvbSB0aGUgbWVudXMgZmlyc3Rcblx0XHRcdGlmICh0aGlzLmZvY3VzZWRNZW51LmluZGV4ID09PSBNZW51QmFyLk9WRVJGTE9XX0lOREVYKSB7XG5cdFx0XHRcdHRoaXMub3ZlcmZsb3dNZW51LmJ1dHRvbkVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubWVudXNbdGhpcy5mb2N1c2VkTWVudS5pbmRleF0uYnV0dG9uRWxlbWVudD8uZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZm9jdXNlZE1lbnUuaG9sZGVyKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZE1lbnUuaG9sZGVyLnBhcmVudEVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoJ29wZW4nKTtcblxuXHRcdFx0XHR0aGlzLmZvY3VzZWRNZW51LmhvbGRlci5yZW1vdmUoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5mb2N1c2VkTWVudS53aWRnZXQ/LmRpc3Bvc2UoKTtcblxuXHRcdFx0dGhpcy5mb2N1c2VkTWVudSA9IHsgaW5kZXg6IHRoaXMuZm9jdXNlZE1lbnUuaW5kZXggfTtcblx0XHR9XG5cdFx0dGhpcy5tZW51RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0N1c3RvbU1lbnUobWVudUluZGV4OiBudW1iZXIsIHNlbGVjdEZpcnN0ID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdHVhbE1lbnVJbmRleCA9IG1lbnVJbmRleCA+PSB0aGlzLm51bU1lbnVzU2hvd24gPyBNZW51QmFyLk9WRVJGTE9XX0lOREVYIDogbWVudUluZGV4O1xuXHRcdGNvbnN0IGN1c3RvbU1lbnUgPSBhY3R1YWxNZW51SW5kZXggPT09IE1lbnVCYXIuT1ZFUkZMT1dfSU5ERVggPyB0aGlzLm92ZXJmbG93TWVudSA6IHRoaXMubWVudXNbYWN0dWFsTWVudUluZGV4XTtcblxuXHRcdGlmICghY3VzdG9tTWVudS5hY3Rpb25zIHx8ICFjdXN0b21NZW51LmJ1dHRvbkVsZW1lbnQgfHwgIWN1c3RvbU1lbnUudGl0bGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVudUhvbGRlciA9ICQoJ2Rpdi5tZW51YmFyLW1lbnUtaXRlbXMtaG9sZGVyJywgeyAndGl0bGUnOiAnJyB9KTtcblxuXHRcdGN1c3RvbU1lbnUuYnV0dG9uRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdvcGVuJyk7XG5cblx0XHRjb25zdCB0aXRsZUJvdW5kaW5nUmVjdCA9IGN1c3RvbU1lbnUudGl0bGVFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHRpdGxlQm91bmRpbmdSZWN0Wm9vbSA9IERPTS5nZXREb21Ob2RlWm9vbUxldmVsKGN1c3RvbU1lbnUudGl0bGVFbGVtZW50KTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY29tcGFjdE1vZGU/Lmhvcml6b250YWwgPT09IEhvcml6b250YWxEaXJlY3Rpb24uUmlnaHQpIHtcblx0XHRcdG1lbnVIb2xkZXIuc3R5bGUubGVmdCA9IGAke3RpdGxlQm91bmRpbmdSZWN0LmxlZnQgKyB0aGlzLmNvbnRhaW5lci5jbGllbnRXaWR0aH1weGA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMuY29tcGFjdE1vZGU/Lmhvcml6b250YWwgPT09IEhvcml6b250YWxEaXJlY3Rpb24uTGVmdCkge1xuXHRcdFx0Y29uc3Qgd2luZG93V2lkdGggPSBET00uZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5pbm5lcldpZHRoO1xuXHRcdFx0bWVudUhvbGRlci5zdHlsZS5yaWdodCA9IGAke3dpbmRvd1dpZHRoIC0gdGl0bGVCb3VuZGluZ1JlY3QubGVmdH1weGA7XG5cdFx0XHRtZW51SG9sZGVyLnN0eWxlLmxlZnQgPSAnYXV0byc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lbnVIb2xkZXIuc3R5bGUubGVmdCA9IGAke3RpdGxlQm91bmRpbmdSZWN0LmxlZnQgKiB0aXRsZUJvdW5kaW5nUmVjdFpvb219cHhgO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY29tcGFjdE1vZGU/LnZlcnRpY2FsID09PSBWZXJ0aWNhbERpcmVjdGlvbi5BYm92ZSkge1xuXHRcdFx0Ly8gVE9ET0BiZW5pYmVuaiBEbyBub3QgaGFyZGNvZGUgdGhlIGhlaWdodCBvZiB0aGUgbWVudSBob2xkZXJcblx0XHRcdG1lbnVIb2xkZXIuc3R5bGUudG9wID0gYCR7dGl0bGVCb3VuZGluZ1JlY3QudG9wIC0gdGhpcy5tZW51cy5sZW5ndGggKiAzMCArIHRoaXMuY29udGFpbmVyLmNsaWVudEhlaWdodH1weGA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMuY29tcGFjdE1vZGU/LnZlcnRpY2FsID09PSBWZXJ0aWNhbERpcmVjdGlvbi5CZWxvdykge1xuXHRcdFx0bWVudUhvbGRlci5zdHlsZS50b3AgPSBgJHt0aXRsZUJvdW5kaW5nUmVjdC50b3B9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZW51SG9sZGVyLnN0eWxlLnRvcCA9IGAke3RpdGxlQm91bmRpbmdSZWN0LmJvdHRvbSAqIHRpdGxlQm91bmRpbmdSZWN0Wm9vbX1weGA7XG5cdFx0fVxuXG5cdFx0Y3VzdG9tTWVudS5idXR0b25FbGVtZW50LmFwcGVuZENoaWxkKG1lbnVIb2xkZXIpO1xuXG5cdFx0Y29uc3QgbWVudU9wdGlvbnM6IElNZW51T3B0aW9ucyA9IHtcblx0XHRcdGdldEtleUJpbmRpbmc6IHRoaXMub3B0aW9ucy5nZXRLZXliaW5kaW5nLFxuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lcixcblx0XHRcdGVuYWJsZU1uZW1vbmljczogdGhpcy5vcHRpb25zLmFsd2F5c09uTW5lbW9uaWNzIHx8ICh0aGlzLm1uZW1vbmljc0luVXNlICYmIHRoaXMub3B0aW9ucy5lbmFibGVNbmVtb25pY3MpLFxuXHRcdFx0YXJpYUxhYmVsOiBjdXN0b21NZW51LmJ1dHRvbkVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPz8gdW5kZWZpbmVkLFxuXHRcdFx0ZXhwYW5kRGlyZWN0aW9uOiB0aGlzLmlzQ29tcGFjdCA/IHRoaXMub3B0aW9ucy5jb21wYWN0TW9kZSA6IHsgaG9yaXpvbnRhbDogSG9yaXpvbnRhbERpcmVjdGlvbi5SaWdodCwgdmVydGljYWw6IFZlcnRpY2FsRGlyZWN0aW9uLkJlbG93IH0sXG5cdFx0XHR1c2VFdmVudEFzQ29udGV4dDogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBtZW51V2lkZ2V0ID0gdGhpcy5tZW51RGlzcG9zYWJsZXMuYWRkKG5ldyBNZW51KG1lbnVIb2xkZXIsIGN1c3RvbU1lbnUuYWN0aW9ucywgbWVudU9wdGlvbnMsIHRoaXMubWVudVN0eWxlKSk7XG5cdFx0dGhpcy5tZW51RGlzcG9zYWJsZXMuYWRkKG1lbnVXaWRnZXQub25EaWRDYW5jZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5mb2N1c1N0YXRlID0gTWVudWJhclN0YXRlLkZPQ1VTRUQ7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKGFjdHVhbE1lbnVJbmRleCAhPT0gbWVudUluZGV4KSB7XG5cdFx0XHRtZW51V2lkZ2V0LnRyaWdnZXIobWVudUluZGV4IC0gdGhpcy5udW1NZW51c1Nob3duKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVudVdpZGdldC5mb2N1cyhzZWxlY3RGaXJzdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5mb2N1c2VkTWVudSA9IHtcblx0XHRcdGluZGV4OiBhY3R1YWxNZW51SW5kZXgsXG5cdFx0XHRob2xkZXI6IG1lbnVIb2xkZXIsXG5cdFx0XHR3aWRnZXQ6IG1lbnVXaWRnZXRcblx0XHR9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
