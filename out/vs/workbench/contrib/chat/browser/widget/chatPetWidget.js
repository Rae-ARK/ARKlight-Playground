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
import "./media/chatPet.css";
import * as dom from "../../../../../base/browser/dom.js";
import { GlobalPointerMoveMonitor } from "../../../../../base/browser/globalPointerMoveMonitor.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../../base/common/network.js";
import { autorun, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { localize } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IChatPetService } from "../chatPetService.js";
const CHAT_PET_IDLE_SLEEP_DELAY = 2e4;
const TRANSIENT_STATE_DURATION = 2e3;
const COMPLETE_STATE_DURATION = 2140;
const LOVE_STATE_DURATION = 2940;
const COOL_STATE_DURATION = 3e3;
const WAKE_STATE_DURATION = 880;
const SEARCH_INTERVAL = 1e4;
const DRAG_THRESHOLD = 2;
const KEYBOARD_MOVE_DISTANCE = 8;
const CHAT_PET_SOURCE_SIZE = 96;
const IDLE_FRAME_DURATIONS = Array.from({ length: 50 }, () => 40);
const SLEEP_FRAME_DURATIONS = Array.from({ length: 8 }, () => 300);
const WAKE_FRAME_DURATIONS = [160, 100, 80, 90, 90, 90, 100, 170];
const TYPING_FRAME_DURATIONS = Array.from({ length: 8 }, () => 120);
const SPEECH_FRAME_DURATIONS = [220, 220, 220, 100, 160, 180];
const CLAPPING_FRAME_DURATIONS = [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80];
const LOVE_FRAME_DURATIONS = [200, 200, 380, 100, 80, 1980];
const COOL_FRAME_DURATIONS = [600, 120, 120, 120, 160, 80, 80, 80, 1640];
const SEARCH_FRAME_DURATIONS = [500, 500, 500, 500];
const YAPPING_FRAME_DURATIONS = [300, 240, 1500, 240, 360];
function getChatPetBuddyName(quality) {
  return quality === "stable" ? "buddy-idle-stable" : "buddy-idle-insiders";
}
const spriteSources = /* @__PURE__ */ new Map();
const speechSpriteSources = /* @__PURE__ */ new Map();
function doesChatPetStateTrackCursor(state) {
  return state !== void 0 && state !== "sleep" && state !== "waking" && state !== "typing" && state !== "complete" && state !== "love" && state !== "cool" && state !== "yappingMouthOpen" && state !== "onTheRun" && state !== "searching" && state !== "searchingDown";
}
function getChatPetSpriteName(state, quality) {
  const variant = quality === "stable" ? "stable" : "insiders";
  switch (state) {
    case "love":
      return `buddy-love-${variant}`;
    case "clapping":
      return `buddy-clapping-${variant}`;
    case "cool":
      return `buddy-cool-${variant}`;
    case "onTheRun":
    case "searching":
    case "searchingDown":
      return `buddy-search-${variant}`;
    case "sleep":
      return `buddy-sleep-${variant}`;
    case "waking":
      return `buddy-waking-${variant}`;
    case "typing":
      return `buddy-typing-${variant}`;
    case "rendering":
      return `buddy-rendering-${variant}`;
    case "yappingMouthOpen":
      return `buddy-yapping-${variant}`;
    default:
      return getChatPetBuddyName(quality);
  }
}
function getChatPetFrameDurations(state) {
  switch (state) {
    case "sleep":
      return SLEEP_FRAME_DURATIONS;
    case "waking":
      return WAKE_FRAME_DURATIONS;
    case "typing":
      return TYPING_FRAME_DURATIONS;
    case "rendering":
      return IDLE_FRAME_DURATIONS;
    case "clapping":
      return CLAPPING_FRAME_DURATIONS;
    case "love":
      return LOVE_FRAME_DURATIONS;
    case "cool":
      return COOL_FRAME_DURATIONS;
    case "searching":
      return SEARCH_FRAME_DURATIONS;
    case "onTheRun":
    case "searchingDown":
      return [];
    case "yappingMouthOpen":
      return YAPPING_FRAME_DURATIONS;
    case "yapping":
      return [];
    default:
      return IDLE_FRAME_DURATIONS;
  }
}
function createSpriteSources(name, state, tracksCursor = true) {
  const root = "vs/workbench/contrib/chat/browser/widget/media/chatPet";
  const suffix = tracksCursor ? "-tracking-96" : "-96";
  const frameDurations = getChatPetFrameDurations(state);
  const staticSource = {
    url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.png`).toString(true),
    frameDurations: [],
    iterations: 1
  };
  return {
    animated: frameDurations.length === 0 ? staticSource : {
      url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.spritesheet.png`).toString(true),
      frameDurations,
      iterations: state === "waking" || state === "cool" || state === "searching" ? 1 : Infinity
    },
    reducedMotion: staticSource
  };
}
function getChatPetSpeechFrameDurations() {
  return SPEECH_FRAME_DURATIONS;
}
function getSpriteSources(variant) {
  let sources = spriteSources.get(variant);
  if (!sources) {
    const createStateSpriteSources = (state) => createSpriteSources(getChatPetSpriteName(state, variant), state, doesChatPetStateTrackCursor(state));
    sources = {
      idle: createStateSpriteSources("idle"),
      sleep: createStateSpriteSources("sleep"),
      waking: createStateSpriteSources("waking"),
      typing: createStateSpriteSources("typing"),
      rendering: createStateSpriteSources("rendering"),
      complete: createStateSpriteSources("complete"),
      love: createStateSpriteSources("love"),
      clapping: createStateSpriteSources("clapping"),
      jump: createStateSpriteSources("jump"),
      cool: createStateSpriteSources("cool"),
      yapping: createStateSpriteSources("yapping"),
      yappingMouthOpen: createStateSpriteSources("yappingMouthOpen"),
      onTheRun: createStateSpriteSources("onTheRun"),
      searching: createStateSpriteSources("searching"),
      searchingDown: createStateSpriteSources("searchingDown")
    };
    spriteSources.set(variant, sources);
  }
  return sources;
}
function getSpeechSpriteSources(variant) {
  let sources = speechSpriteSources.get(variant);
  if (!sources) {
    const root = "vs/workbench/contrib/chat/browser/widget/media/chatPet";
    const name = `buddy-speech-${variant}-96`;
    sources = {
      animated: {
        url: FileAccess.asBrowserUri(`${root}/${name}.spritesheet.png`).toString(true),
        frameDurations: SPEECH_FRAME_DURATIONS,
        iterations: Infinity
      },
      reducedMotion: {
        url: FileAccess.asBrowserUri(`${root}/${name}.png`).toString(true),
        frameDurations: [],
        iterations: 1
      }
    };
    speechSpriteSources.set(variant, sources);
  }
  return sources;
}
function doesChatPetStateSpeak(state) {
  return state === "rendering" || state === "yapping" || state === "yappingMouthOpen";
}
function isChatPetImageSource(image, source) {
  return image.getAttribute("src") === source;
}
function getChatPetBaseState(hasActiveRequest, needsInput, hasInput, idleExpired) {
  if (needsInput) {
    return "clapping";
  }
  if (hasActiveRequest) {
    return "rendering";
  }
  if (idleExpired) {
    return "sleep";
  }
  if (hasInput) {
    return "typing";
  }
  return "idle";
}
function isChatPetVisible(enabled, isLatestFocusedWidget) {
  return enabled && isLatestFocusedWidget;
}
function getChatPetRenderedState(baseState, transientState, isDragging) {
  return isDragging ? "idle" : transientState ?? baseState;
}
function getChatPetAnimationFrame(frameDurations, elapsed, iterations) {
  if (frameDurations.length === 0) {
    return { frameIndex: 0, complete: true };
  }
  const totalDuration = frameDurations.reduce((total, duration) => total + duration, 0);
  if (elapsed >= totalDuration * iterations) {
    return { frameIndex: frameDurations.length - 1, complete: true };
  }
  const iterationElapsed = Math.max(0, elapsed) % totalDuration;
  let frameEnd = 0;
  let frameIndex = 0;
  for (; frameIndex < frameDurations.length - 1; frameIndex++) {
    frameEnd += frameDurations[frameIndex];
    if (iterationElapsed < frameEnd) {
      break;
    }
  }
  return { frameIndex, complete: false };
}
function getTransientStateDuration(state) {
  switch (state) {
    case "complete":
      return COMPLETE_STATE_DURATION;
    case "love":
      return LOVE_STATE_DURATION;
    case "cool":
      return COOL_STATE_DURATION;
    case "waking":
      return WAKE_STATE_DURATION;
    default:
      return TRANSIENT_STATE_DURATION;
  }
}
function getChatPetClickInteraction(random, previousInteraction) {
  const interactions = ["love", "jump", "cool", "yapping"];
  const availableInteractions = interactions.filter((interaction) => interaction !== previousInteraction);
  return availableInteractions[Math.min(Math.floor(random * availableInteractions.length), availableInteractions.length - 1)];
}
function getChatPetGazeDirection(cursorX, cursorY, petCenterX, petCenterY) {
  const deltaX = cursorX - petCenterX;
  const deltaY = cursorY - petCenterY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) {
    return [0, 0];
  }
  return [
    Math.round(deltaX / distance),
    Math.round(deltaY / distance)
  ];
}
function getChatPetHorizontalPosition(left, minimumLeft, maximumLeft) {
  return Math.max(minimumLeft, Math.min(Math.max(minimumLeft, maximumLeft), left));
}
let ChatPetWidget = class extends Disposable {
  constructor(parent, dragBounds, model, hasInput, isLatestFocusedWidget, inputChanged, chatPetService, accessibilityService, contextMenuService) {
    super();
    this.parent = parent;
    this.dragBounds = dragBounds;
    this.chatPetService = chatPetService;
    this.accessibilityService = accessibilityService;
    this.contextMenuService = contextMenuService;
    this._pupils = [];
    this._dragMonitor = this._register(new GlobalPointerMoveMonitor());
    this._idleExpired = observableValue(this, false);
    this._transientState = observableValue(this, void 0);
    this._isDragging = observableValue(this, false);
    this._idleScheduler = this._register(new RunOnceScheduler(() => this._idleExpired.set(true, void 0), CHAT_PET_IDLE_SLEEP_DELAY));
    this._transientScheduler = this._register(new RunOnceScheduler(() => this._transientState.set(void 0, void 0), TRANSIENT_STATE_DURATION));
    this._clickSuppressionScheduler = this._register(new RunOnceScheduler(() => this._suppressNextPointerClick = false, 0));
    this._spriteAnimation = this._register(new MutableDisposable());
    this._speechAnimation = this._register(new MutableDisposable());
    this._contextMenuActions = this._register(new MutableDisposable());
    this._motionReduced = false;
    this._enabled = false;
    this._busy = false;
    this._enablementInitialized = false;
    this._hasCustomPosition = false;
    this._suppressNextPointerClick = false;
    this._variant = this.chatPetService.variant.get();
    this._searchScheduler = this._register(new RunOnceScheduler(() => this._trySearch(), SEARCH_INTERVAL));
    this.parent.classList.add("chat-pet-host");
    this._overlay = dom.$(".chat-pet-overlay");
    this.parent.prepend(this._overlay);
    this._register(toDisposable(() => this._overlay.remove()));
    this._button = this._register(new Button(this._overlay, {
      ariaLabel: localize("chatPet.interact", "Interact with the VS Code pet. Use the context menu to put it on the run.")
    }));
    this._button.element.classList.add("chat-pet-button");
    const resizeObserver = this._register(new dom.DisposableResizeObserver("ChatPetWidget.dragBounds", () => {
      if (this._hasCustomPosition) {
        this._setHorizontalPosition(this._getCurrentLeft());
      }
    }, dom.getWindow(this._button.element)));
    this._register(resizeObserver.observe(this.dragBounds));
    this._sprites = [0, 1].map(() => {
      const container = dom.append(this._button.element, dom.$(".chat-pet-sprite.hidden"));
      const canvas = dom.append(container, dom.$("canvas.chat-pet-canvas"));
      canvas.width = CHAT_PET_SOURCE_SIZE;
      canvas.height = CHAT_PET_SOURCE_SIZE;
      canvas.setAttribute("aria-hidden", "true");
      const image = dom.append(container, dom.$("img.chat-pet-spritesheet"));
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      const sprite = { container, image, canvas };
      this._register(dom.addDisposableListener(image, "load", () => this._onImageLoad(sprite)));
      return sprite;
    });
    this._eyes = dom.append(this._button.element, dom.$(".chat-pet-eyes"));
    this._eyes.setAttribute("aria-hidden", "true");
    for (const side of ["left", "right"]) {
      const eye = dom.append(this._eyes, dom.$(`.chat-pet-eye.${side}`));
      this._pupils.push(dom.append(eye, dom.$(".chat-pet-pupil")));
    }
    const speechBubbleContainer = dom.append(this._button.element, dom.$(".chat-pet-speech-bubble.hidden"));
    const speechBubbleCanvas = dom.append(speechBubbleContainer, dom.$("canvas.chat-pet-canvas.chat-pet-speech-canvas"));
    speechBubbleCanvas.width = CHAT_PET_SOURCE_SIZE;
    speechBubbleCanvas.height = CHAT_PET_SOURCE_SIZE;
    speechBubbleCanvas.setAttribute("aria-hidden", "true");
    const speechBubbleImage = dom.append(speechBubbleContainer, dom.$("img.chat-pet-spritesheet"));
    speechBubbleImage.alt = "";
    speechBubbleImage.setAttribute("aria-hidden", "true");
    this._speechBubble = { container: speechBubbleContainer, image: speechBubbleImage, canvas: speechBubbleCanvas };
    this._register(dom.addDisposableListener(speechBubbleImage, "load", () => this._updateSpeechBubble(this._renderedState, true)));
    this._gazeScheduler = this._register(new dom.AnimationFrameScheduler(this._button.element, () => this._updateGaze()));
    this._register(dom.addDisposableListener(dom.getWindow(this._button.element).document, dom.EventType.POINTER_MOVE, (event) => {
      this._cursorPosition = [event.clientX, event.clientY];
      if (this._enabled && doesChatPetStateTrackCursor(this._renderedState)) {
        this._gazeScheduler.schedule();
      }
    }));
    const onAnimationComplete = (event) => {
      if (event.animationName === "chat-pet-enter") {
        this._button.element.classList.remove("entering");
      } else if (event.animationName === "chat-pet-exit" && !this._enabled) {
        this._finishDisable();
      } else if (event.animationName === "chat-pet-yapping-fall" && !this._isDragging.get() && event.target === this._activeSprite?.container && this._button.element.dataset.state === "yapping") {
        this._transientState.set("yappingMouthOpen", void 0);
      } else if (event.animationName === "chat-pet-search-down" && this._button.element.dataset.state === "searchingDown") {
        this._transientState.set(void 0, void 0);
      }
    };
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.ANIMATION_END, onAnimationComplete));
    this._register(dom.addDisposableListener(this._button.element, "animationcancel", onAnimationComplete));
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.POINTER_DOWN, (event) => this._startDrag(event)));
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.KEY_DOWN, (event) => this._onKeyDown(event)));
    this._register(dom.addDisposableListener(this._button.element, dom.EventType.CONTEXT_MENU, (event) => {
      if (!this._enabled) {
        return;
      }
      dom.EventHelper.stop(event, true);
      this._showContextMenu(event);
    }));
    this._register(inputChanged(() => {
      if (this._enabled && !this.chatPetService.onTheRun.get()) {
        this._wake();
      }
    }));
    this._register(this._button.onDidClick((e) => {
      dom.EventHelper.stop(e, true);
      if (this._suppressNextPointerClick && e.type !== dom.EventType.KEY_DOWN) {
        this._suppressNextPointerClick = false;
        this._clickSuppressionScheduler.cancel();
        return;
      }
      if (this.chatPetService.onTheRun.get()) {
        this._transientState.set(void 0, void 0);
        this.chatPetService.setOnTheRun(false);
        return;
      }
      const wasSleeping = this._idleExpired.get() || this._renderedState === "sleep";
      if (wasSleeping) {
        this._wake();
      }
      if (wasSleeping || this._transientState.get() === "waking") {
        status(localize("chatPet.wokeUp", "The VS Code pet woke up"));
        return;
      }
      const interaction = getChatPetClickInteraction(Math.random(), this._lastClickInteraction);
      this._lastClickInteraction = interaction;
      this._showTransientState(interaction);
      switch (interaction) {
        case "love":
          status(localize("chatPet.loved", "The VS Code pet feels loved"));
          break;
        case "jump":
          status(localize("chatPet.jumped", "The VS Code pet jumped"));
          break;
        case "cool":
          status(localize("chatPet.cool", "The VS Code pet put on sunglasses"));
          break;
        case "yapping":
          status(localize("chatPet.yapping", "The VS Code pet is yapping"));
          break;
      }
    }));
    const motionReduced = observableFromEvent(this, this.accessibilityService.onDidChangeReducedMotion, () => this.accessibilityService.isMotionReduced());
    this._register(autorun((reader) => {
      this._motionReduced = motionReduced.read(reader);
      const enabled = isChatPetVisible(this.chatPetService.enabled.read(reader), isLatestFocusedWidget.read(reader));
      const variant = this.chatPetService.variant.read(reader);
      const variantChanged = variant !== this._variant;
      this._variant = variant;
      const onTheRun = this.chatPetService.onTheRun.read(reader);
      this._button.element.classList.toggle("on-the-run", onTheRun);
      this._button.setAriaLabel(onTheRun ? localize("chatPet.restore", "Bring back the VS Code pet") : localize("chatPet.interact", "Interact with the VS Code pet. Use the context menu to put it on the run."));
      const chatModel = model.read(reader);
      const request = chatModel?.lastRequestObs.read(reader);
      const needsInput = !!request?.response?.isPendingConfirmation.read(reader);
      const hasActiveRequest = chatModel?.hasActiveRequest.read(reader) ?? false;
      const inputHasContent = hasInput.read(reader);
      this._busy = hasActiveRequest || needsInput;
      let idleExpired = this._idleExpired.read(reader);
      let transientState = this._transientState.read(reader);
      const isDragging = this._isDragging.read(reader);
      if (!this._enablementInitialized || enabled !== this._enabled) {
        const wasInitialized = this._enablementInitialized;
        this._enablementInitialized = true;
        this._enabled = enabled;
        if (enabled) {
          this._startEnableAnimation();
        } else if (wasInitialized) {
          this._startDisableAnimation();
        } else {
          this._finishDisable();
        }
      }
      if (!enabled) {
        this._idleScheduler.cancel();
        this._searchScheduler.cancel();
        this._transientScheduler.cancel();
        if (transientState !== void 0) {
          this._transientState.set(void 0, void 0);
        }
        if (this._motionReduced) {
          this._finishDisable();
        }
        return;
      }
      if (onTheRun) {
        this._idleScheduler.cancel();
        if (!this._searchScheduler.isScheduled()) {
          this._searchScheduler.schedule();
        }
        const state = transientState === "searching" || transientState === "searchingDown" ? transientState : "onTheRun";
        this._renderState(state, variantChanged);
        return;
      }
      this._searchScheduler.cancel();
      if (this._busy) {
        this._idleScheduler.cancel();
        if (idleExpired) {
          idleExpired = false;
          this._idleExpired.set(false, void 0);
          transientState = this._beginWakeAnimation() ?? transientState;
        }
      } else if (!idleExpired && !this._idleScheduler.isScheduled()) {
        this._idleScheduler.schedule();
      }
      const baseState = getChatPetBaseState(hasActiveRequest, needsInput, inputHasContent, idleExpired);
      this._renderState(getChatPetRenderedState(baseState, transientState, isDragging), variantChanged, isDragging);
    }));
    this._register(autorun((reader) => {
      const chatModel = model.read(reader);
      const response = chatModel?.lastRequestObs.read(reader)?.response;
      if (!response) {
        return;
      }
      reader.store.add(response.onDidChange((e) => {
        if (e.reason === "completedRequest" && !response.isCanceled) {
          this._showTransientState("complete");
        }
      }));
    }));
  }
  _startDrag(event) {
    if (!this._enabled || this.chatPetService.onTheRun.get() || event.button !== 0) {
      return;
    }
    this._wake();
    dom.EventHelper.stop(event);
    this._button.element.focus();
    const startX = event.clientX;
    const startLeft = this._getCurrentLeft();
    let didDrag = false;
    this._dragMonitor.startMonitoring(this._button.element, event.pointerId, event.buttons, (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      if (!didDrag && Math.abs(delta) < DRAG_THRESHOLD) {
        return;
      }
      if (!didDrag) {
        didDrag = true;
        this._button.element.classList.remove("entering");
        this._button.element.classList.add("dragging");
        this._spriteAnimation.clear();
        this._isDragging.set(true, void 0);
      }
      dom.EventHelper.stop(moveEvent, true);
      this._button.element.classList.toggle("resisting", this._setHorizontalPosition(startLeft + delta));
    }, () => {
      this._button.element.classList.remove("dragging", "resisting");
      this._isDragging.set(false, void 0);
      if (didDrag) {
        this._suppressNextPointerClick = true;
        this._clickSuppressionScheduler.schedule();
      }
    });
  }
  _showContextMenu(event) {
    const onTheRun = this.chatPetService.onTheRun.get();
    const actions = new DisposableStore();
    this._contextMenuActions.value = actions;
    const stable = actions.add(new Action("chat.pet.variant.stable", localize("chatPet.variant.stable.action", "Stable Colors"), void 0, true, () => this.chatPetService.setVariant("stable")));
    stable.checked = this.chatPetService.variant.get() === "stable";
    const insiders = actions.add(new Action("chat.pet.variant.insiders", localize("chatPet.variant.insiders.action", "Insiders Colors"), void 0, true, () => this.chatPetService.setVariant("insiders")));
    insiders.checked = this.chatPetService.variant.get() === "insiders";
    const onTheRunAction = actions.add(new Action(
      "chat.pet.onTheRun",
      onTheRun ? localize("chatPet.comeBack.action", "Come Back") : localize("chatPet.goOnTheRun.action", "Go on the Run"),
      void 0,
      true,
      () => {
        this._transientState.set(void 0, void 0);
        this.chatPetService.setOnTheRun(!onTheRun);
      }
    ));
    const separator = new Separator();
    this.contextMenuService.showContextMenu({
      getAnchor: () => new StandardMouseEvent(dom.getWindow(this._button.element), event),
      getActions: () => [
        onTheRunAction,
        separator,
        stable,
        insiders
      ],
      onHide: () => {
        if (this._contextMenuActions.value === actions) {
          this._contextMenuActions.clear();
        }
      }
    });
  }
  _onKeyDown(event) {
    const keyboardEvent = new StandardKeyboardEvent(event);
    let delta;
    let announcement;
    if (keyboardEvent.equals(KeyCode.LeftArrow)) {
      delta = -KEYBOARD_MOVE_DISTANCE;
      announcement = localize("chatPet.movedLeft", "VS Code pet moved left");
    } else if (keyboardEvent.equals(KeyCode.RightArrow)) {
      delta = KEYBOARD_MOVE_DISTANCE;
      announcement = localize("chatPet.movedRight", "VS Code pet moved right");
    } else {
      return;
    }
    this._wake();
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    this._setHorizontalPosition(this._getCurrentLeft() + delta);
    status(announcement);
  }
  _getCurrentLeft() {
    return this._button.element.offsetLeft;
  }
  _setHorizontalPosition(left) {
    const parentBounds = this._overlay.getBoundingClientRect();
    const bounds = this.dragBounds.getBoundingClientRect();
    const minimumLeft = bounds.left - parentBounds.left;
    const maximumLeft = bounds.right - parentBounds.left - this._button.element.offsetWidth;
    const clampedLeft = getChatPetHorizontalPosition(left, minimumLeft, maximumLeft);
    this._button.element.style.left = `${clampedLeft}px`;
    this._button.element.style.right = "auto";
    this._hasCustomPosition = true;
    return clampedLeft !== left;
  }
  _updateGaze() {
    if (!this._cursorPosition) {
      return;
    }
    const bounds = this._button.element.getBoundingClientRect();
    const [x, y] = getChatPetGazeDirection(
      this._cursorPosition[0],
      this._cursorPosition[1],
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2
    );
    for (const pupil of this._pupils) {
      pupil.style.transform = `translate(${x * 2}px, ${y * 2}px)`;
    }
  }
  _startEnableAnimation() {
    this._button.element.classList.remove("hidden", "exiting", "entering");
    this._button.element.tabIndex = 0;
    this._button.element.getBoundingClientRect();
    this._gazeScheduler.schedule();
    if (!this._motionReduced) {
      this._button.element.classList.add("entering");
    }
  }
  _startDisableAnimation() {
    this._button.element.tabIndex = -1;
    this._button.element.classList.remove("entering");
    if (this._motionReduced || this._button.element.classList.contains("hidden")) {
      this._finishDisable();
      return;
    }
    this._button.element.classList.add("exiting");
  }
  _finishDisable() {
    this._button.element.classList.remove("entering", "exiting");
    this._button.element.classList.add("hidden");
    this._spriteAnimation.clear();
    this._speechAnimation.clear();
    this._speechBubble.container.classList.add("hidden");
    this._speechBubble.image.removeAttribute("src");
    this._pendingSprite = void 0;
    this._pendingSource = void 0;
    this._pendingState = void 0;
    this._activeSprite = void 0;
    this._renderedState = void 0;
    for (const sprite of this._sprites) {
      sprite.container.classList.add("hidden");
      sprite.image.removeAttribute("src");
    }
  }
  _showTransientState(state) {
    if (!this.chatPetService.enabled.get()) {
      return;
    }
    this._wake();
    const renderedState = state === "yapping" && this._motionReduced ? "yappingMouthOpen" : state;
    this._transientState.set(renderedState, void 0);
    if (renderedState === "yappingMouthOpen" || renderedState === "yapping") {
      this._transientScheduler.cancel();
    } else {
      this._transientScheduler.schedule(getTransientStateDuration(renderedState));
    }
    if (!this._isDragging.get()) {
      this._renderState(renderedState, true);
    }
  }
  _trySearch() {
    if (!this._enabled || !this.chatPetService.onTheRun.get()) {
      return;
    }
    if (this._motionReduced) {
      this._searchScheduler.schedule();
      return;
    }
    this._transientState.set("searching", void 0);
    this._renderState("searching", true);
    this._searchScheduler.schedule();
  }
  _wake() {
    const wasSleeping = this._idleExpired.get() || this._renderedState === "sleep";
    this._idleExpired.set(false, void 0);
    if (this._busy) {
      this._idleScheduler.cancel();
    } else {
      this._idleScheduler.schedule();
    }
    if (wasSleeping) {
      this._beginWakeAnimation();
    }
  }
  _beginWakeAnimation() {
    if (this._motionReduced) {
      return void 0;
    }
    this._transientState.set("waking", void 0);
    this._transientScheduler.schedule(WAKE_STATE_DURATION);
    return "waking";
  }
  _renderState(state, restart = false, useStaticSprite = false) {
    const sources = getSpriteSources(this._variant)[state];
    const source = this._motionReduced || useStaticSprite ? sources.reducedMotion : sources.animated;
    if (!restart && this._activeSprite && isChatPetImageSource(this._activeSprite.image, source.url)) {
      this._pendingSprite = void 0;
      this._pendingSource = void 0;
      this._pendingState = void 0;
      this._button.element.dataset.state = state;
      this._renderedState = state;
      this._eyes.classList.toggle("tracking", doesChatPetStateTrackCursor(state));
      this._updateSpeechBubble(state, restart);
      return;
    }
    const sprite = this._sprites.find((candidate) => candidate !== this._activeSprite);
    if (!sprite) {
      return;
    }
    this._pendingSprite = sprite;
    this._pendingSource = source;
    this._pendingState = state;
    sprite.image.removeAttribute("src");
    sprite.image.src = source.url;
  }
  _onImageLoad(sprite) {
    if (sprite !== this._pendingSprite || this._pendingSource === void 0 || !isChatPetImageSource(sprite.image, this._pendingSource.url) || this._pendingState === void 0) {
      return;
    }
    this._spriteAnimation.clear();
    this._activeSprite?.container.classList.add("hidden");
    sprite.container.classList.remove("hidden");
    this._activeSprite = sprite;
    const state = this._pendingState;
    this._startSpriteAnimation(this._pendingSource, sprite, this._spriteAnimation, () => this._onSpriteAnimationComplete(sprite, state));
    this._button.element.dataset.state = state;
    this._renderedState = state;
    this._eyes.classList.toggle("tracking", doesChatPetStateTrackCursor(state));
    this._updateSpeechBubble(state, true);
    this._pendingSprite = void 0;
    this._pendingSource = void 0;
    this._pendingState = void 0;
    this._restartEyeAnimation();
    if (doesChatPetStateTrackCursor(this._renderedState)) {
      this._gazeScheduler.schedule();
    }
  }
  _onSpriteAnimationComplete(sprite, state) {
    if (state !== "searching" || sprite !== this._activeSprite || !this.chatPetService.onTheRun.get()) {
      return;
    }
    this._transientState.set("searchingDown", void 0);
    this._button.element.dataset.state = "searchingDown";
    this._renderedState = "searchingDown";
  }
  _startSpriteAnimation(source, sprite, animationDisposable, onComplete) {
    const { frameDurations } = source;
    const { image, canvas } = sprite;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.imageSmoothingEnabled = false;
    const drawFrame = (frameIndex) => {
      context.clearRect(0, 0, CHAT_PET_SOURCE_SIZE, CHAT_PET_SOURCE_SIZE);
      context.drawImage(
        image,
        frameIndex * CHAT_PET_SOURCE_SIZE,
        0,
        CHAT_PET_SOURCE_SIZE,
        CHAT_PET_SOURCE_SIZE,
        0,
        0,
        CHAT_PET_SOURCE_SIZE,
        CHAT_PET_SOURCE_SIZE
      );
    };
    drawFrame(0);
    if (frameDurations.length < 2) {
      return;
    }
    const targetWindow = dom.getWindow(canvas);
    const startTime = targetWindow.performance.now();
    let currentFrame = 0;
    let animationFrame;
    let completed = false;
    const updateFrame = (timestamp) => {
      const frame = getChatPetAnimationFrame(frameDurations, timestamp - startTime, source.iterations);
      if (frame.complete) {
        drawFrame(frame.frameIndex);
        if (!completed) {
          completed = true;
          onComplete?.();
        }
        return;
      }
      if (frame.frameIndex !== currentFrame) {
        currentFrame = frame.frameIndex;
        drawFrame(frame.frameIndex);
      }
      animationFrame = targetWindow.requestAnimationFrame(updateFrame);
    };
    animationFrame = targetWindow.requestAnimationFrame(updateFrame);
    animationDisposable.value = toDisposable(() => {
      if (animationFrame !== void 0) {
        targetWindow.cancelAnimationFrame(animationFrame);
      }
    });
  }
  _updateSpeechBubble(state, restart = false) {
    const visible = doesChatPetStateSpeak(state);
    this._speechBubble.container.classList.toggle("hidden", !visible);
    if (!visible) {
      this._speechAnimation.clear();
      return;
    }
    const sources = getSpeechSpriteSources(this._variant);
    const source = this._motionReduced ? sources.reducedMotion : sources.animated;
    if (!isChatPetImageSource(this._speechBubble.image, source.url)) {
      this._speechAnimation.clear();
      this._speechBubble.image.removeAttribute("src");
      this._speechBubble.image.src = source.url;
      return;
    }
    if (restart && this._speechBubble.image.complete && this._speechBubble.image.naturalWidth > 0) {
      this._speechAnimation.clear();
      this._startSpriteAnimation(source, this._speechBubble, this._speechAnimation);
    }
  }
  _restartEyeAnimation() {
    this._eyes.classList.remove("animated");
    this._eyes.getBoundingClientRect();
    if (!this._motionReduced) {
      this._eyes.classList.add("animated");
    }
  }
};
ChatPetWidget = __decorateClass([
  __decorateParam(6, IChatPetService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, IContextMenuService)
], ChatPetWidget);
export {
  CHAT_PET_IDLE_SLEEP_DELAY,
  ChatPetWidget,
  doesChatPetStateTrackCursor,
  getChatPetAnimationFrame,
  getChatPetBaseState,
  getChatPetBuddyName,
  getChatPetClickInteraction,
  getChatPetFrameDurations,
  getChatPetGazeDirection,
  getChatPetHorizontalPosition,
  getChatPetRenderedState,
  getChatPetSpeechFrameDurations,
  getChatPetSpriteName,
  isChatPetImageSource,
  isChatPetVisible
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFBldFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0UGV0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHbG9iYWxQb2ludGVyTW92ZU1vbml0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZ2xvYmFsUG9pbnRlck1vdmVNb25pdG9yLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRQZXRWYXJpYW50LCBJQ2hhdFBldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0UGV0U2VydmljZS5qcyc7XG5cbmV4cG9ydCB0eXBlIENoYXRQZXRTdGF0ZSA9ICdpZGxlJyB8ICdzbGVlcCcgfCAnd2FraW5nJyB8ICd0eXBpbmcnIHwgJ3JlbmRlcmluZycgfCAnY29tcGxldGUnIHwgJ2xvdmUnIHwgJ2NsYXBwaW5nJyB8ICdqdW1wJyB8ICdjb29sJyB8ICd5YXBwaW5nJyB8ICd5YXBwaW5nTW91dGhPcGVuJyB8ICdvblRoZVJ1bicgfCAnc2VhcmNoaW5nJyB8ICdzZWFyY2hpbmdEb3duJztcbmV4cG9ydCB0eXBlIENoYXRQZXRDbGlja0ludGVyYWN0aW9uID0gRXh0cmFjdDxDaGF0UGV0U3RhdGUsICdsb3ZlJyB8ICdqdW1wJyB8ICdjb29sJyB8ICd5YXBwaW5nJz47XG5cbmV4cG9ydCBjb25zdCBDSEFUX1BFVF9JRExFX1NMRUVQX0RFTEFZID0gMjBfMDAwO1xuY29uc3QgVFJBTlNJRU5UX1NUQVRFX0RVUkFUSU9OID0gMl8wMDA7XG5jb25zdCBDT01QTEVURV9TVEFURV9EVVJBVElPTiA9IDJfMTQwO1xuY29uc3QgTE9WRV9TVEFURV9EVVJBVElPTiA9IDJfOTQwO1xuY29uc3QgQ09PTF9TVEFURV9EVVJBVElPTiA9IDNfMDAwO1xuY29uc3QgV0FLRV9TVEFURV9EVVJBVElPTiA9IDg4MDtcbmNvbnN0IFNFQVJDSF9JTlRFUlZBTCA9IDEwXzAwMDtcbmNvbnN0IERSQUdfVEhSRVNIT0xEID0gMjtcbmNvbnN0IEtFWUJPQVJEX01PVkVfRElTVEFOQ0UgPSA4O1xuY29uc3QgQ0hBVF9QRVRfU09VUkNFX1NJWkUgPSA5NjtcblxuY29uc3QgSURMRV9GUkFNRV9EVVJBVElPTlMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA1MCB9LCAoKSA9PiA0MCk7XG5jb25zdCBTTEVFUF9GUkFNRV9EVVJBVElPTlMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sICgpID0+IDMwMCk7XG5jb25zdCBXQUtFX0ZSQU1FX0RVUkFUSU9OUyA9IFsxNjAsIDEwMCwgODAsIDkwLCA5MCwgOTAsIDEwMCwgMTcwXTtcbmNvbnN0IFRZUElOR19GUkFNRV9EVVJBVElPTlMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sICgpID0+IDEyMCk7XG5jb25zdCBTUEVFQ0hfRlJBTUVfRFVSQVRJT05TID0gWzIyMCwgMjIwLCAyMjAsIDEwMCwgMTYwLCAxODBdO1xuY29uc3QgQ0xBUFBJTkdfRlJBTUVfRFVSQVRJT05TID0gWzgwLCA0MCwgNDAsIDQwLCA4MCwgNDAsIDQwLCA0MCwgNDAsIDgwLCA0MCwgNDAsIDgwXTtcbmNvbnN0IExPVkVfRlJBTUVfRFVSQVRJT05TID0gWzIwMCwgMjAwLCAzODAsIDEwMCwgODAsIDFfOTgwXTtcbmNvbnN0IENPT0xfRlJBTUVfRFVSQVRJT05TID0gWzYwMCwgMTIwLCAxMjAsIDEyMCwgMTYwLCA4MCwgODAsIDgwLCAxXzY0MF07XG5jb25zdCBTRUFSQ0hfRlJBTUVfRFVSQVRJT05TID0gWzUwMCwgNTAwLCA1MDAsIDUwMF07XG5jb25zdCBZQVBQSU5HX0ZSQU1FX0RVUkFUSU9OUyA9IFszMDAsIDI0MCwgMV81MDAsIDI0MCwgMzYwXTtcblxuaW50ZXJmYWNlIENoYXRQZXRTcHJpdGVTb3VyY2Uge1xuXHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0cmVhZG9ubHkgZnJhbWVEdXJhdGlvbnM6IHJlYWRvbmx5IG51bWJlcltdO1xuXHRyZWFkb25seSBpdGVyYXRpb25zOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDaGF0UGV0U3ByaXRlU291cmNlcyB7XG5cdHJlYWRvbmx5IGFuaW1hdGVkOiBDaGF0UGV0U3ByaXRlU291cmNlO1xuXHRyZWFkb25seSByZWR1Y2VkTW90aW9uOiBDaGF0UGV0U3ByaXRlU291cmNlO1xufVxuXG5pbnRlcmZhY2UgQ2hhdFBldFNwcml0ZUVsZW1lbnQge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpbWFnZTogSFRNTEltYWdlRWxlbWVudDtcblx0cmVhZG9ubHkgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRCdWRkeU5hbWUocXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogJ2J1ZGR5LWlkbGUtc3RhYmxlJyB8ICdidWRkeS1pZGxlLWluc2lkZXJzJyB7XG5cdHJldHVybiBxdWFsaXR5ID09PSAnc3RhYmxlJyA/ICdidWRkeS1pZGxlLXN0YWJsZScgOiAnYnVkZHktaWRsZS1pbnNpZGVycyc7XG59XG5cbmNvbnN0IHNwcml0ZVNvdXJjZXMgPSBuZXcgTWFwPENoYXRQZXRWYXJpYW50LCBSZWNvcmQ8Q2hhdFBldFN0YXRlLCBDaGF0UGV0U3ByaXRlU291cmNlcz4+KCk7XG5jb25zdCBzcGVlY2hTcHJpdGVTb3VyY2VzID0gbmV3IE1hcDxDaGF0UGV0VmFyaWFudCwgQ2hhdFBldFNwcml0ZVNvdXJjZXM+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3Ioc3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdGUgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZSAhPT0gJ3NsZWVwJyAmJiBzdGF0ZSAhPT0gJ3dha2luZycgJiYgc3RhdGUgIT09ICd0eXBpbmcnICYmIHN0YXRlICE9PSAnY29tcGxldGUnICYmIHN0YXRlICE9PSAnbG92ZScgJiYgc3RhdGUgIT09ICdjb29sJyAmJiBzdGF0ZSAhPT0gJ3lhcHBpbmdNb3V0aE9wZW4nICYmIHN0YXRlICE9PSAnb25UaGVSdW4nICYmIHN0YXRlICE9PSAnc2VhcmNoaW5nJyAmJiBzdGF0ZSAhPT0gJ3NlYXJjaGluZ0Rvd24nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldFNwcml0ZU5hbWUoc3RhdGU6IENoYXRQZXRTdGF0ZSwgcXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0Y29uc3QgdmFyaWFudCA9IHF1YWxpdHkgPT09ICdzdGFibGUnID8gJ3N0YWJsZScgOiAnaW5zaWRlcnMnO1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSAnbG92ZSc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LWxvdmUtJHt2YXJpYW50fWA7XG5cdFx0Y2FzZSAnY2xhcHBpbmcnOlxuXHRcdFx0cmV0dXJuIGBidWRkeS1jbGFwcGluZy0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdjb29sJzpcblx0XHRcdHJldHVybiBgYnVkZHktY29vbC0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdvblRoZVJ1bic6XG5cdFx0Y2FzZSAnc2VhcmNoaW5nJzpcblx0XHRjYXNlICdzZWFyY2hpbmdEb3duJzpcblx0XHRcdHJldHVybiBgYnVkZHktc2VhcmNoLSR7dmFyaWFudH1gO1xuXHRcdGNhc2UgJ3NsZWVwJzpcblx0XHRcdHJldHVybiBgYnVkZHktc2xlZXAtJHt2YXJpYW50fWA7XG5cdFx0Y2FzZSAnd2FraW5nJzpcblx0XHRcdHJldHVybiBgYnVkZHktd2FraW5nLSR7dmFyaWFudH1gO1xuXHRcdGNhc2UgJ3R5cGluZyc6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LXR5cGluZy0ke3ZhcmlhbnR9YDtcblx0XHRjYXNlICdyZW5kZXJpbmcnOlxuXHRcdFx0cmV0dXJuIGBidWRkeS1yZW5kZXJpbmctJHt2YXJpYW50fWA7XG5cdFx0Y2FzZSAneWFwcGluZ01vdXRoT3Blbic6XG5cdFx0XHRyZXR1cm4gYGJ1ZGR5LXlhcHBpbmctJHt2YXJpYW50fWA7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBnZXRDaGF0UGV0QnVkZHlOYW1lKHF1YWxpdHkpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoc3RhdGU6IENoYXRQZXRTdGF0ZSk6IHJlYWRvbmx5IG51bWJlcltdIHtcblx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdGNhc2UgJ3NsZWVwJzpcblx0XHRcdHJldHVybiBTTEVFUF9GUkFNRV9EVVJBVElPTlM7XG5cdFx0Y2FzZSAnd2FraW5nJzpcblx0XHRcdHJldHVybiBXQUtFX0ZSQU1FX0RVUkFUSU9OUztcblx0XHRjYXNlICd0eXBpbmcnOlxuXHRcdFx0cmV0dXJuIFRZUElOR19GUkFNRV9EVVJBVElPTlM7XG5cdFx0Y2FzZSAncmVuZGVyaW5nJzpcblx0XHRcdHJldHVybiBJRExFX0ZSQU1FX0RVUkFUSU9OUztcblx0XHRjYXNlICdjbGFwcGluZyc6XG5cdFx0XHRyZXR1cm4gQ0xBUFBJTkdfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ2xvdmUnOlxuXHRcdFx0cmV0dXJuIExPVkVfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ2Nvb2wnOlxuXHRcdFx0cmV0dXJuIENPT0xfRlJBTUVfRFVSQVRJT05TO1xuXHRcdGNhc2UgJ3NlYXJjaGluZyc6XG5cdFx0XHRyZXR1cm4gU0VBUkNIX0ZSQU1FX0RVUkFUSU9OUztcblx0XHRjYXNlICdvblRoZVJ1bic6XG5cdFx0Y2FzZSAnc2VhcmNoaW5nRG93bic6XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0Y2FzZSAneWFwcGluZ01vdXRoT3Blbic6XG5cdFx0XHRyZXR1cm4gWUFQUElOR19GUkFNRV9EVVJBVElPTlM7XG5cdFx0Y2FzZSAneWFwcGluZyc6XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBJRExFX0ZSQU1FX0RVUkFUSU9OUztcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTcHJpdGVTb3VyY2VzKG5hbWU6IHN0cmluZywgc3RhdGU6IENoYXRQZXRTdGF0ZSwgdHJhY2tzQ3Vyc29yID0gdHJ1ZSk6IENoYXRQZXRTcHJpdGVTb3VyY2VzIHtcblx0Y29uc3Qgcm9vdCA9ICd2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L21lZGlhL2NoYXRQZXQnO1xuXHRjb25zdCBzdWZmaXggPSB0cmFja3NDdXJzb3IgPyAnLXRyYWNraW5nLTk2JyA6ICctOTYnO1xuXHRjb25zdCBmcmFtZUR1cmF0aW9ucyA9IGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucyhzdGF0ZSk7XG5cdGNvbnN0IHN0YXRpY1NvdXJjZSA9IHtcblx0XHR1cmw6IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGAke3Jvb3R9LyR7bmFtZX0ke3N1ZmZpeH0ucG5nYCkudG9TdHJpbmcodHJ1ZSksXG5cdFx0ZnJhbWVEdXJhdGlvbnM6IFtdLFxuXHRcdGl0ZXJhdGlvbnM6IDEsXG5cdH07XG5cdHJldHVybiB7XG5cdFx0YW5pbWF0ZWQ6IGZyYW1lRHVyYXRpb25zLmxlbmd0aCA9PT0gMCA/IHN0YXRpY1NvdXJjZSA6IHtcblx0XHRcdHVybDogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYCR7cm9vdH0vJHtuYW1lfSR7c3VmZml4fS5zcHJpdGVzaGVldC5wbmdgKS50b1N0cmluZyh0cnVlKSxcblx0XHRcdGZyYW1lRHVyYXRpb25zLFxuXHRcdFx0aXRlcmF0aW9uczogc3RhdGUgPT09ICd3YWtpbmcnIHx8IHN0YXRlID09PSAnY29vbCcgfHwgc3RhdGUgPT09ICdzZWFyY2hpbmcnID8gMSA6IEluZmluaXR5LFxuXHRcdH0sXG5cdFx0cmVkdWNlZE1vdGlvbjogc3RhdGljU291cmNlLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldFNwZWVjaEZyYW1lRHVyYXRpb25zKCk6IHJlYWRvbmx5IG51bWJlcltdIHtcblx0cmV0dXJuIFNQRUVDSF9GUkFNRV9EVVJBVElPTlM7XG59XG5cbmZ1bmN0aW9uIGdldFNwcml0ZVNvdXJjZXModmFyaWFudDogQ2hhdFBldFZhcmlhbnQpOiBSZWNvcmQ8Q2hhdFBldFN0YXRlLCBDaGF0UGV0U3ByaXRlU291cmNlcz4ge1xuXHRsZXQgc291cmNlcyA9IHNwcml0ZVNvdXJjZXMuZ2V0KHZhcmlhbnQpO1xuXHRpZiAoIXNvdXJjZXMpIHtcblx0XHRjb25zdCBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMgPSAoc3RhdGU6IENoYXRQZXRTdGF0ZSkgPT4gY3JlYXRlU3ByaXRlU291cmNlcyhnZXRDaGF0UGV0U3ByaXRlTmFtZShzdGF0ZSwgdmFyaWFudCksIHN0YXRlLCBkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3Ioc3RhdGUpKTtcblx0XHRzb3VyY2VzID0ge1xuXHRcdFx0aWRsZTogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdpZGxlJyksXG5cdFx0XHRzbGVlcDogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdzbGVlcCcpLFxuXHRcdFx0d2FraW5nOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ3dha2luZycpLFxuXHRcdFx0dHlwaW5nOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ3R5cGluZycpLFxuXHRcdFx0cmVuZGVyaW5nOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ3JlbmRlcmluZycpLFxuXHRcdFx0Y29tcGxldGU6IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygnY29tcGxldGUnKSxcblx0XHRcdGxvdmU6IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygnbG92ZScpLFxuXHRcdFx0Y2xhcHBpbmc6IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygnY2xhcHBpbmcnKSxcblx0XHRcdGp1bXA6IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygnanVtcCcpLFxuXHRcdFx0Y29vbDogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdjb29sJyksXG5cdFx0XHR5YXBwaW5nOiBjcmVhdGVTdGF0ZVNwcml0ZVNvdXJjZXMoJ3lhcHBpbmcnKSxcblx0XHRcdHlhcHBpbmdNb3V0aE9wZW46IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygneWFwcGluZ01vdXRoT3BlbicpLFxuXHRcdFx0b25UaGVSdW46IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygnb25UaGVSdW4nKSxcblx0XHRcdHNlYXJjaGluZzogY3JlYXRlU3RhdGVTcHJpdGVTb3VyY2VzKCdzZWFyY2hpbmcnKSxcblx0XHRcdHNlYXJjaGluZ0Rvd246IGNyZWF0ZVN0YXRlU3ByaXRlU291cmNlcygnc2VhcmNoaW5nRG93bicpLFxuXHRcdH07XG5cdFx0c3ByaXRlU291cmNlcy5zZXQodmFyaWFudCwgc291cmNlcyk7XG5cdH1cblxuXHRyZXR1cm4gc291cmNlcztcbn1cblxuZnVuY3Rpb24gZ2V0U3BlZWNoU3ByaXRlU291cmNlcyh2YXJpYW50OiBDaGF0UGV0VmFyaWFudCk6IENoYXRQZXRTcHJpdGVTb3VyY2VzIHtcblx0bGV0IHNvdXJjZXMgPSBzcGVlY2hTcHJpdGVTb3VyY2VzLmdldCh2YXJpYW50KTtcblx0aWYgKCFzb3VyY2VzKSB7XG5cdFx0Y29uc3Qgcm9vdCA9ICd2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L21lZGlhL2NoYXRQZXQnO1xuXHRcdGNvbnN0IG5hbWUgPSBgYnVkZHktc3BlZWNoLSR7dmFyaWFudH0tOTZgO1xuXHRcdHNvdXJjZXMgPSB7XG5cdFx0XHRhbmltYXRlZDoge1xuXHRcdFx0XHR1cmw6IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGAke3Jvb3R9LyR7bmFtZX0uc3ByaXRlc2hlZXQucG5nYCkudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdGZyYW1lRHVyYXRpb25zOiBTUEVFQ0hfRlJBTUVfRFVSQVRJT05TLFxuXHRcdFx0XHRpdGVyYXRpb25zOiBJbmZpbml0eSxcblx0XHRcdH0sXG5cdFx0XHRyZWR1Y2VkTW90aW9uOiB7XG5cdFx0XHRcdHVybDogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYCR7cm9vdH0vJHtuYW1lfS5wbmdgKS50b1N0cmluZyh0cnVlKSxcblx0XHRcdFx0ZnJhbWVEdXJhdGlvbnM6IFtdLFxuXHRcdFx0XHRpdGVyYXRpb25zOiAxLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHNwZWVjaFNwcml0ZVNvdXJjZXMuc2V0KHZhcmlhbnQsIHNvdXJjZXMpO1xuXHR9XG5cdHJldHVybiBzb3VyY2VzO1xufVxuXG5mdW5jdGlvbiBkb2VzQ2hhdFBldFN0YXRlU3BlYWsoc3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdGUgPT09ICdyZW5kZXJpbmcnIHx8IHN0YXRlID09PSAneWFwcGluZycgfHwgc3RhdGUgPT09ICd5YXBwaW5nTW91dGhPcGVuJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhdFBldEltYWdlU291cmNlKGltYWdlOiBQaWNrPEhUTUxJbWFnZUVsZW1lbnQsICdnZXRBdHRyaWJ1dGUnPiwgc291cmNlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGltYWdlLmdldEF0dHJpYnV0ZSgnc3JjJykgPT09IHNvdXJjZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRCYXNlU3RhdGUoaGFzQWN0aXZlUmVxdWVzdDogYm9vbGVhbiwgbmVlZHNJbnB1dDogYm9vbGVhbiwgaGFzSW5wdXQ6IGJvb2xlYW4sIGlkbGVFeHBpcmVkOiBib29sZWFuKTogQ2hhdFBldFN0YXRlIHtcblx0aWYgKG5lZWRzSW5wdXQpIHtcblx0XHRyZXR1cm4gJ2NsYXBwaW5nJztcblx0fVxuXHRpZiAoaGFzQWN0aXZlUmVxdWVzdCkge1xuXHRcdHJldHVybiAncmVuZGVyaW5nJztcblx0fVxuXHRpZiAoaWRsZUV4cGlyZWQpIHtcblx0XHRyZXR1cm4gJ3NsZWVwJztcblx0fVxuXHRpZiAoaGFzSW5wdXQpIHtcblx0XHRyZXR1cm4gJ3R5cGluZyc7XG5cdH1cblx0cmV0dXJuICdpZGxlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhdFBldFZpc2libGUoZW5hYmxlZDogYm9vbGVhbiwgaXNMYXRlc3RGb2N1c2VkV2lkZ2V0OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiBlbmFibGVkICYmIGlzTGF0ZXN0Rm9jdXNlZFdpZGdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRSZW5kZXJlZFN0YXRlKGJhc2VTdGF0ZTogQ2hhdFBldFN0YXRlLCB0cmFuc2llbnRTdGF0ZTogQ2hhdFBldFN0YXRlIHwgdW5kZWZpbmVkLCBpc0RyYWdnaW5nOiBib29sZWFuKTogQ2hhdFBldFN0YXRlIHtcblx0cmV0dXJuIGlzRHJhZ2dpbmcgPyAnaWRsZScgOiB0cmFuc2llbnRTdGF0ZSA/PyBiYXNlU3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnM6IHJlYWRvbmx5IG51bWJlcltdLCBlbGFwc2VkOiBudW1iZXIsIGl0ZXJhdGlvbnM6IG51bWJlcik6IHsgZnJhbWVJbmRleDogbnVtYmVyOyBjb21wbGV0ZTogYm9vbGVhbiB9IHtcblx0aWYgKGZyYW1lRHVyYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB7IGZyYW1lSW5kZXg6IDAsIGNvbXBsZXRlOiB0cnVlIH07XG5cdH1cblxuXHRjb25zdCB0b3RhbER1cmF0aW9uID0gZnJhbWVEdXJhdGlvbnMucmVkdWNlKCh0b3RhbCwgZHVyYXRpb24pID0+IHRvdGFsICsgZHVyYXRpb24sIDApO1xuXHRpZiAoZWxhcHNlZCA+PSB0b3RhbER1cmF0aW9uICogaXRlcmF0aW9ucykge1xuXHRcdHJldHVybiB7IGZyYW1lSW5kZXg6IGZyYW1lRHVyYXRpb25zLmxlbmd0aCAtIDEsIGNvbXBsZXRlOiB0cnVlIH07XG5cdH1cblxuXHRjb25zdCBpdGVyYXRpb25FbGFwc2VkID0gTWF0aC5tYXgoMCwgZWxhcHNlZCkgJSB0b3RhbER1cmF0aW9uO1xuXHRsZXQgZnJhbWVFbmQgPSAwO1xuXHRsZXQgZnJhbWVJbmRleCA9IDA7XG5cdGZvciAoOyBmcmFtZUluZGV4IDwgZnJhbWVEdXJhdGlvbnMubGVuZ3RoIC0gMTsgZnJhbWVJbmRleCsrKSB7XG5cdFx0ZnJhbWVFbmQgKz0gZnJhbWVEdXJhdGlvbnNbZnJhbWVJbmRleF07XG5cdFx0aWYgKGl0ZXJhdGlvbkVsYXBzZWQgPCBmcmFtZUVuZCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7IGZyYW1lSW5kZXgsIGNvbXBsZXRlOiBmYWxzZSB9O1xufVxuXG5mdW5jdGlvbiBnZXRUcmFuc2llbnRTdGF0ZUR1cmF0aW9uKHN0YXRlOiBDaGF0UGV0U3RhdGUpOiBudW1iZXIge1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSAnY29tcGxldGUnOlxuXHRcdFx0cmV0dXJuIENPTVBMRVRFX1NUQVRFX0RVUkFUSU9OO1xuXHRcdGNhc2UgJ2xvdmUnOlxuXHRcdFx0cmV0dXJuIExPVkVfU1RBVEVfRFVSQVRJT047XG5cdFx0Y2FzZSAnY29vbCc6XG5cdFx0XHRyZXR1cm4gQ09PTF9TVEFURV9EVVJBVElPTjtcblx0XHRjYXNlICd3YWtpbmcnOlxuXHRcdFx0cmV0dXJuIFdBS0VfU1RBVEVfRFVSQVRJT047XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBUUkFOU0lFTlRfU1RBVEVfRFVSQVRJT047XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKHJhbmRvbTogbnVtYmVyLCBwcmV2aW91c0ludGVyYWN0aW9uPzogQ2hhdFBldENsaWNrSW50ZXJhY3Rpb24pOiBDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbiB7XG5cdGNvbnN0IGludGVyYWN0aW9uczogcmVhZG9ubHkgQ2hhdFBldENsaWNrSW50ZXJhY3Rpb25bXSA9IFsnbG92ZScsICdqdW1wJywgJ2Nvb2wnLCAneWFwcGluZyddO1xuXHRjb25zdCBhdmFpbGFibGVJbnRlcmFjdGlvbnMgPSBpbnRlcmFjdGlvbnMuZmlsdGVyKGludGVyYWN0aW9uID0+IGludGVyYWN0aW9uICE9PSBwcmV2aW91c0ludGVyYWN0aW9uKTtcblx0cmV0dXJuIGF2YWlsYWJsZUludGVyYWN0aW9uc1tNYXRoLm1pbihNYXRoLmZsb29yKHJhbmRvbSAqIGF2YWlsYWJsZUludGVyYWN0aW9ucy5sZW5ndGgpLCBhdmFpbGFibGVJbnRlcmFjdGlvbnMubGVuZ3RoIC0gMSldO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oY3Vyc29yWDogbnVtYmVyLCBjdXJzb3JZOiBudW1iZXIsIHBldENlbnRlclg6IG51bWJlciwgcGV0Q2VudGVyWTogbnVtYmVyKTogcmVhZG9ubHkgW251bWJlciwgbnVtYmVyXSB7XG5cdGNvbnN0IGRlbHRhWCA9IGN1cnNvclggLSBwZXRDZW50ZXJYO1xuXHRjb25zdCBkZWx0YVkgPSBjdXJzb3JZIC0gcGV0Q2VudGVyWTtcblx0Y29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGRlbHRhWCwgZGVsdGFZKTtcblx0aWYgKGRpc3RhbmNlID09PSAwKSB7XG5cdFx0cmV0dXJuIFswLCAwXTtcblx0fVxuXG5cdHJldHVybiBbXG5cdFx0TWF0aC5yb3VuZChkZWx0YVggLyBkaXN0YW5jZSksXG5cdFx0TWF0aC5yb3VuZChkZWx0YVkgLyBkaXN0YW5jZSksXG5cdF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKGxlZnQ6IG51bWJlciwgbWluaW11bUxlZnQ6IG51bWJlciwgbWF4aW11bUxlZnQ6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heChtaW5pbXVtTGVmdCwgTWF0aC5taW4oTWF0aC5tYXgobWluaW11bUxlZnQsIG1heGltdW1MZWZ0KSwgbGVmdCkpO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFBldFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX292ZXJsYXk6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9idXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3ByaXRlczogcmVhZG9ubHkgQ2hhdFBldFNwcml0ZUVsZW1lbnRbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3BlZWNoQnViYmxlOiBDaGF0UGV0U3ByaXRlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZXllczogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1cGlsczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nYXplU2NoZWR1bGVyOiBkb20uQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RyYWdNb25pdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEdsb2JhbFBvaW50ZXJNb3ZlTW9uaXRvcigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaWRsZUV4cGlyZWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc2llbnRTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxDaGF0UGV0U3RhdGUgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzRHJhZ2dpbmcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pZGxlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5faWRsZUV4cGlyZWQuc2V0KHRydWUsIHVuZGVmaW5lZCksIENIQVRfUEVUX0lETEVfU0xFRVBfREVMQVkpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNpZW50U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgVFJBTlNJRU5UX1NUQVRFX0RVUkFUSU9OKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlYXJjaFNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xpY2tTdXBwcmVzc2lvblNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3N1cHByZXNzTmV4dFBvaW50ZXJDbGljayA9IGZhbHNlLCAwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nwcml0ZUFuaW1hdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3BlZWNoQW5pbWF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudUFjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfY3Vyc29yUG9zaXRpb246IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZVNwcml0ZTogQ2hhdFBldFNwcml0ZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BlbmRpbmdTcHJpdGU6IENoYXRQZXRTcHJpdGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wZW5kaW5nU291cmNlOiBDaGF0UGV0U3ByaXRlU291cmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wZW5kaW5nU3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVuZGVyZWRTdGF0ZTogQ2hhdFBldFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb3Rpb25SZWR1Y2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX2VuYWJsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYnVzeSA9IGZhbHNlO1xuXHRwcml2YXRlIF9lbmFibGVtZW50SW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGFzQ3VzdG9tUG9zaXRpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3VwcHJlc3NOZXh0UG9pbnRlckNsaWNrID0gZmFsc2U7XG5cdHByaXZhdGUgX2xhc3RDbGlja0ludGVyYWN0aW9uOiBDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdmFyaWFudDogQ2hhdFBldFZhcmlhbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZHJhZ0JvdW5kczogSFRNTEVsZW1lbnQsXG5cdFx0bW9kZWw6IElPYnNlcnZhYmxlPElDaGF0TW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdGhhc0lucHV0OiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRpc0xhdGVzdEZvY3VzZWRXaWRnZXQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdGlucHV0Q2hhbmdlZDogKGxpc3RlbmVyOiAoKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZSxcblx0XHRASUNoYXRQZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFBldFNlcnZpY2U6IElDaGF0UGV0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3ZhcmlhbnQgPSB0aGlzLmNoYXRQZXRTZXJ2aWNlLnZhcmlhbnQuZ2V0KCk7XG5cdFx0dGhpcy5fc2VhcmNoU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdHJ5U2VhcmNoKCksIFNFQVJDSF9JTlRFUlZBTCkpO1xuXHRcdHRoaXMucGFyZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGV0LWhvc3QnKTtcblx0XHR0aGlzLl9vdmVybGF5ID0gZG9tLiQoJy5jaGF0LXBldC1vdmVybGF5Jyk7XG5cdFx0dGhpcy5wYXJlbnQucHJlcGVuZCh0aGlzLl9vdmVybGF5KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fb3ZlcmxheS5yZW1vdmUoKSkpO1xuXHRcdHRoaXMuX2J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5fb3ZlcmxheSwge1xuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdFBldC5pbnRlcmFjdCcsIFwiSW50ZXJhY3Qgd2l0aCB0aGUgVlMgQ29kZSBwZXQuIFVzZSB0aGUgY29udGV4dCBtZW51IHRvIHB1dCBpdCBvbiB0aGUgcnVuLlwiKSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1wZXQtYnV0dG9uJyk7XG5cdFx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdFBldFdpZGdldC5kcmFnQm91bmRzJywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2hhc0N1c3RvbVBvc2l0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3NldEhvcml6b250YWxQb3NpdGlvbih0aGlzLl9nZXRDdXJyZW50TGVmdCgpKTtcblx0XHRcdH1cblx0XHR9LCBkb20uZ2V0V2luZG93KHRoaXMuX2J1dHRvbi5lbGVtZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5kcmFnQm91bmRzKSk7XG5cdFx0dGhpcy5fc3ByaXRlcyA9IFswLCAxXS5tYXAoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLl9idXR0b24uZWxlbWVudCwgZG9tLiQoJy5jaGF0LXBldC1zcHJpdGUuaGlkZGVuJykpO1xuXHRcdFx0Y29uc3QgY2FudmFzID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdjYW52YXMuY2hhdC1wZXQtY2FudmFzJykpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuXHRcdFx0Y2FudmFzLndpZHRoID0gQ0hBVF9QRVRfU09VUkNFX1NJWkU7XG5cdFx0XHRjYW52YXMuaGVpZ2h0ID0gQ0hBVF9QRVRfU09VUkNFX1NJWkU7XG5cdFx0XHRjYW52YXMuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCBpbWFnZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnaW1nLmNoYXQtcGV0LXNwcml0ZXNoZWV0JykpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHRpbWFnZS5hbHQgPSAnJztcblx0XHRcdGltYWdlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0Y29uc3Qgc3ByaXRlID0geyBjb250YWluZXIsIGltYWdlLCBjYW52YXMgfTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaW1hZ2UsICdsb2FkJywgKCkgPT4gdGhpcy5fb25JbWFnZUxvYWQoc3ByaXRlKSkpO1xuXHRcdFx0cmV0dXJuIHNwcml0ZTtcblx0XHR9KTtcblx0XHR0aGlzLl9leWVzID0gZG9tLmFwcGVuZCh0aGlzLl9idXR0b24uZWxlbWVudCwgZG9tLiQoJy5jaGF0LXBldC1leWVzJykpO1xuXHRcdHRoaXMuX2V5ZXMuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Zm9yIChjb25zdCBzaWRlIG9mIFsnbGVmdCcsICdyaWdodCddKSB7XG5cdFx0XHRjb25zdCBleWUgPSBkb20uYXBwZW5kKHRoaXMuX2V5ZXMsIGRvbS4kKGAuY2hhdC1wZXQtZXllLiR7c2lkZX1gKSk7XG5cdFx0XHR0aGlzLl9wdXBpbHMucHVzaChkb20uYXBwZW5kKGV5ZSwgZG9tLiQoJy5jaGF0LXBldC1wdXBpbCcpKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNwZWVjaEJ1YmJsZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5fYnV0dG9uLmVsZW1lbnQsIGRvbS4kKCcuY2hhdC1wZXQtc3BlZWNoLWJ1YmJsZS5oaWRkZW4nKSk7XG5cdFx0Y29uc3Qgc3BlZWNoQnViYmxlQ2FudmFzID0gZG9tLmFwcGVuZChzcGVlY2hCdWJibGVDb250YWluZXIsIGRvbS4kKCdjYW52YXMuY2hhdC1wZXQtY2FudmFzLmNoYXQtcGV0LXNwZWVjaC1jYW52YXMnKSkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG5cdFx0c3BlZWNoQnViYmxlQ2FudmFzLndpZHRoID0gQ0hBVF9QRVRfU09VUkNFX1NJWkU7XG5cdFx0c3BlZWNoQnViYmxlQ2FudmFzLmhlaWdodCA9IENIQVRfUEVUX1NPVVJDRV9TSVpFO1xuXHRcdHNwZWVjaEJ1YmJsZUNhbnZhcy5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBzcGVlY2hCdWJibGVJbWFnZSA9IGRvbS5hcHBlbmQoc3BlZWNoQnViYmxlQ29udGFpbmVyLCBkb20uJCgnaW1nLmNoYXQtcGV0LXNwcml0ZXNoZWV0JykpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0c3BlZWNoQnViYmxlSW1hZ2UuYWx0ID0gJyc7XG5cdFx0c3BlZWNoQnViYmxlSW1hZ2Uuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5fc3BlZWNoQnViYmxlID0geyBjb250YWluZXI6IHNwZWVjaEJ1YmJsZUNvbnRhaW5lciwgaW1hZ2U6IHNwZWVjaEJ1YmJsZUltYWdlLCBjYW52YXM6IHNwZWVjaEJ1YmJsZUNhbnZhcyB9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc3BlZWNoQnViYmxlSW1hZ2UsICdsb2FkJywgKCkgPT4gdGhpcy5fdXBkYXRlU3BlZWNoQnViYmxlKHRoaXMuX3JlbmRlcmVkU3RhdGUsIHRydWUpKSk7XG5cdFx0dGhpcy5fZ2F6ZVNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIodGhpcy5fYnV0dG9uLmVsZW1lbnQsICgpID0+IHRoaXMuX3VwZGF0ZUdhemUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZG9tLmdldFdpbmRvdyh0aGlzLl9idXR0b24uZWxlbWVudCkuZG9jdW1lbnQsIGRvbS5FdmVudFR5cGUuUE9JTlRFUl9NT1ZFLCAoZXZlbnQ6IFBvaW50ZXJFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fY3Vyc29yUG9zaXRpb24gPSBbZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WV07XG5cdFx0XHRpZiAodGhpcy5fZW5hYmxlZCAmJiBkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IodGhpcy5fcmVuZGVyZWRTdGF0ZSkpIHtcblx0XHRcdFx0dGhpcy5fZ2F6ZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBvbkFuaW1hdGlvbkNvbXBsZXRlID0gKGV2ZW50OiBBbmltYXRpb25FdmVudCkgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFuaW1hdGlvbk5hbWUgPT09ICdjaGF0LXBldC1lbnRlcicpIHtcblx0XHRcdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZW50ZXJpbmcnKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuYW5pbWF0aW9uTmFtZSA9PT0gJ2NoYXQtcGV0LWV4aXQnICYmICF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaERpc2FibGUoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuYW5pbWF0aW9uTmFtZSA9PT0gJ2NoYXQtcGV0LXlhcHBpbmctZmFsbCcgJiYgIXRoaXMuX2lzRHJhZ2dpbmcuZ2V0KCkgJiYgZXZlbnQudGFyZ2V0ID09PSB0aGlzLl9hY3RpdmVTcHJpdGU/LmNvbnRhaW5lciAmJiB0aGlzLl9idXR0b24uZWxlbWVudC5kYXRhc2V0LnN0YXRlID09PSAneWFwcGluZycpIHtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KCd5YXBwaW5nTW91dGhPcGVuJywgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuYW5pbWF0aW9uTmFtZSA9PT0gJ2NoYXQtcGV0LXNlYXJjaC1kb3duJyAmJiB0aGlzLl9idXR0b24uZWxlbWVudC5kYXRhc2V0LnN0YXRlID09PSAnc2VhcmNoaW5nRG93bicpIHtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fYnV0dG9uLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuQU5JTUFUSU9OX0VORCwgb25BbmltYXRpb25Db21wbGV0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fYnV0dG9uLmVsZW1lbnQsICdhbmltYXRpb25jYW5jZWwnLCBvbkFuaW1hdGlvbkNvbXBsZXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9idXR0b24uZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5QT0lOVEVSX0RPV04sIGV2ZW50ID0+IHRoaXMuX3N0YXJ0RHJhZyhldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2J1dHRvbi5lbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBldmVudCA9PiB0aGlzLl9vbktleURvd24oZXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9idXR0b24uZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGV2ZW50ID0+IHtcblx0XHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9zaG93Q29udGV4dE1lbnUoZXZlbnQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dENoYW5nZWQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VuYWJsZWQgJiYgIXRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fd2FrZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2J1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRpZiAodGhpcy5fc3VwcHJlc3NOZXh0UG9pbnRlckNsaWNrICYmIGUudHlwZSAhPT0gZG9tLkV2ZW50VHlwZS5LRVlfRE9XTikge1xuXHRcdFx0XHR0aGlzLl9zdXBwcmVzc05leHRQb2ludGVyQ2xpY2sgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fY2xpY2tTdXBwcmVzc2lvblNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5jaGF0UGV0U2VydmljZS5zZXRPblRoZVJ1bihmYWxzZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHdhc1NsZWVwaW5nID0gdGhpcy5faWRsZUV4cGlyZWQuZ2V0KCkgfHwgdGhpcy5fcmVuZGVyZWRTdGF0ZSA9PT0gJ3NsZWVwJztcblx0XHRcdGlmICh3YXNTbGVlcGluZykge1xuXHRcdFx0XHR0aGlzLl93YWtlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAod2FzU2xlZXBpbmcgfHwgdGhpcy5fdHJhbnNpZW50U3RhdGUuZ2V0KCkgPT09ICd3YWtpbmcnKSB7XG5cdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC53b2tlVXAnLCBcIlRoZSBWUyBDb2RlIHBldCB3b2tlIHVwXCIpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW50ZXJhY3Rpb24gPSBnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbihNYXRoLnJhbmRvbSgpLCB0aGlzLl9sYXN0Q2xpY2tJbnRlcmFjdGlvbik7XG5cdFx0XHR0aGlzLl9sYXN0Q2xpY2tJbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uO1xuXHRcdFx0dGhpcy5fc2hvd1RyYW5zaWVudFN0YXRlKGludGVyYWN0aW9uKTtcblx0XHRcdHN3aXRjaCAoaW50ZXJhY3Rpb24pIHtcblx0XHRcdFx0Y2FzZSAnbG92ZSc6XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LmxvdmVkJywgXCJUaGUgVlMgQ29kZSBwZXQgZmVlbHMgbG92ZWRcIikpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdqdW1wJzpcblx0XHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXRQZXQuanVtcGVkJywgXCJUaGUgVlMgQ29kZSBwZXQganVtcGVkXCIpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnY29vbCc6XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdjaGF0UGV0LmNvb2wnLCBcIlRoZSBWUyBDb2RlIHBldCBwdXQgb24gc3VuZ2xhc3Nlc1wiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3lhcHBpbmcnOlxuXHRcdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdFBldC55YXBwaW5nJywgXCJUaGUgVlMgQ29kZSBwZXQgaXMgeWFwcGluZ1wiKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW90aW9uUmVkdWNlZCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVJlZHVjZWRNb3Rpb24sICgpID0+IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX21vdGlvblJlZHVjZWQgPSBtb3Rpb25SZWR1Y2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBpc0NoYXRQZXRWaXNpYmxlKHRoaXMuY2hhdFBldFNlcnZpY2UuZW5hYmxlZC5yZWFkKHJlYWRlciksIGlzTGF0ZXN0Rm9jdXNlZFdpZGdldC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0Y29uc3QgdmFyaWFudCA9IHRoaXMuY2hhdFBldFNlcnZpY2UudmFyaWFudC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2YXJpYW50Q2hhbmdlZCA9IHZhcmlhbnQgIT09IHRoaXMuX3ZhcmlhbnQ7XG5cdFx0XHR0aGlzLl92YXJpYW50ID0gdmFyaWFudDtcblx0XHRcdGNvbnN0IG9uVGhlUnVuID0gdGhpcy5jaGF0UGV0U2VydmljZS5vblRoZVJ1bi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdvbi10aGUtcnVuJywgb25UaGVSdW4pO1xuXHRcdFx0dGhpcy5fYnV0dG9uLnNldEFyaWFMYWJlbChvblRoZVJ1blxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0UGV0LnJlc3RvcmUnLCBcIkJyaW5nIGJhY2sgdGhlIFZTIENvZGUgcGV0XCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRQZXQuaW50ZXJhY3QnLCBcIkludGVyYWN0IHdpdGggdGhlIFZTIENvZGUgcGV0LiBVc2UgdGhlIGNvbnRleHQgbWVudSB0byBwdXQgaXQgb24gdGhlIHJ1bi5cIikpO1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gbW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNoYXRNb2RlbD8ubGFzdFJlcXVlc3RPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbmVlZHNJbnB1dCA9ICEhcmVxdWVzdD8ucmVzcG9uc2U/LmlzUGVuZGluZ0NvbmZpcm1hdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYXNBY3RpdmVSZXF1ZXN0ID0gY2hhdE1vZGVsPy5oYXNBY3RpdmVSZXF1ZXN0LnJlYWQocmVhZGVyKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IGlucHV0SGFzQ29udGVudCA9IGhhc0lucHV0LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2J1c3kgPSBoYXNBY3RpdmVSZXF1ZXN0IHx8IG5lZWRzSW5wdXQ7XG5cdFx0XHRsZXQgaWRsZUV4cGlyZWQgPSB0aGlzLl9pZGxlRXhwaXJlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRsZXQgdHJhbnNpZW50U3RhdGUgPSB0aGlzLl90cmFuc2llbnRTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc0RyYWdnaW5nID0gdGhpcy5faXNEcmFnZ2luZy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICghdGhpcy5fZW5hYmxlbWVudEluaXRpYWxpemVkIHx8IGVuYWJsZWQgIT09IHRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3Qgd2FzSW5pdGlhbGl6ZWQgPSB0aGlzLl9lbmFibGVtZW50SW5pdGlhbGl6ZWQ7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZW1lbnRJbml0aWFsaXplZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0RW5hYmxlQW5pbWF0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAod2FzSW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydERpc2FibGVBbmltYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9maW5pc2hEaXNhYmxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuX2lkbGVTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHRpZiAodHJhbnNpZW50U3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3RyYW5zaWVudFN0YXRlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX21vdGlvblJlZHVjZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9maW5pc2hEaXNhYmxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob25UaGVSdW4pIHtcblx0XHRcdFx0dGhpcy5faWRsZVNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0aWYgKCF0aGlzLl9zZWFyY2hTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdHJhbnNpZW50U3RhdGUgPT09ICdzZWFyY2hpbmcnIHx8IHRyYW5zaWVudFN0YXRlID09PSAnc2VhcmNoaW5nRG93bicgPyB0cmFuc2llbnRTdGF0ZSA6ICdvblRoZVJ1bic7XG5cdFx0XHRcdHRoaXMuX3JlbmRlclN0YXRlKHN0YXRlLCB2YXJpYW50Q2hhbmdlZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5jYW5jZWwoKTtcblxuXHRcdFx0aWYgKHRoaXMuX2J1c3kpIHtcblx0XHRcdFx0dGhpcy5faWRsZVNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0aWYgKGlkbGVFeHBpcmVkKSB7XG5cdFx0XHRcdFx0aWRsZUV4cGlyZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9pZGxlRXhwaXJlZC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0dHJhbnNpZW50U3RhdGUgPSB0aGlzLl9iZWdpbldha2VBbmltYXRpb24oKSA/PyB0cmFuc2llbnRTdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghaWRsZUV4cGlyZWQgJiYgIXRoaXMuX2lkbGVTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9pZGxlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJhc2VTdGF0ZSA9IGdldENoYXRQZXRCYXNlU3RhdGUoaGFzQWN0aXZlUmVxdWVzdCwgbmVlZHNJbnB1dCwgaW5wdXRIYXNDb250ZW50LCBpZGxlRXhwaXJlZCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJTdGF0ZShnZXRDaGF0UGV0UmVuZGVyZWRTdGF0ZShiYXNlU3RhdGUsIHRyYW5zaWVudFN0YXRlLCBpc0RyYWdnaW5nKSwgdmFyaWFudENoYW5nZWQsIGlzRHJhZ2dpbmcpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IG1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY2hhdE1vZGVsPy5sYXN0UmVxdWVzdE9icy5yZWFkKHJlYWRlcik/LnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlc3BvbnNlLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5yZWFzb24gPT09ICdjb21wbGV0ZWRSZXF1ZXN0JyAmJiAhcmVzcG9uc2UuaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dUcmFuc2llbnRTdGF0ZSgnY29tcGxldGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0RHJhZyhldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkIHx8IHRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkgfHwgZXZlbnQuYnV0dG9uICE9PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fd2FrZSgpO1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGV2ZW50KTtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5mb2N1cygpO1xuXHRcdGNvbnN0IHN0YXJ0WCA9IGV2ZW50LmNsaWVudFg7XG5cdFx0Y29uc3Qgc3RhcnRMZWZ0ID0gdGhpcy5fZ2V0Q3VycmVudExlZnQoKTtcblx0XHRsZXQgZGlkRHJhZyA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fZHJhZ01vbml0b3Iuc3RhcnRNb25pdG9yaW5nKHRoaXMuX2J1dHRvbi5lbGVtZW50LCBldmVudC5wb2ludGVySWQsIGV2ZW50LmJ1dHRvbnMsIG1vdmVFdmVudCA9PiB7XG5cdFx0XHRjb25zdCBkZWx0YSA9IG1vdmVFdmVudC5jbGllbnRYIC0gc3RhcnRYO1xuXHRcdFx0aWYgKCFkaWREcmFnICYmIE1hdGguYWJzKGRlbHRhKSA8IERSQUdfVEhSRVNIT0xEKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFkaWREcmFnKSB7XG5cdFx0XHRcdGRpZERyYWcgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdlbnRlcmluZycpO1xuXHRcdFx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuXHRcdFx0XHR0aGlzLl9zcHJpdGVBbmltYXRpb24uY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5faXNEcmFnZ2luZy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKG1vdmVFdmVudCwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdyZXNpc3RpbmcnLCB0aGlzLl9zZXRIb3Jpem9udGFsUG9zaXRpb24oc3RhcnRMZWZ0ICsgZGVsdGEpKTtcblx0XHR9LCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycsICdyZXNpc3RpbmcnKTtcblx0XHRcdHRoaXMuX2lzRHJhZ2dpbmcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKGRpZERyYWcpIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NOZXh0UG9pbnRlckNsaWNrID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY2xpY2tTdXBwcmVzc2lvblNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0NvbnRleHRNZW51KGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgb25UaGVSdW4gPSB0aGlzLmNoYXRQZXRTZXJ2aWNlLm9uVGhlUnVuLmdldCgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVBY3Rpb25zLnZhbHVlID0gYWN0aW9ucztcblx0XHRjb25zdCBzdGFibGUgPSBhY3Rpb25zLmFkZChuZXcgQWN0aW9uKCdjaGF0LnBldC52YXJpYW50LnN0YWJsZScsIGxvY2FsaXplKCdjaGF0UGV0LnZhcmlhbnQuc3RhYmxlLmFjdGlvbicsIFwiU3RhYmxlIENvbG9yc1wiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLmNoYXRQZXRTZXJ2aWNlLnNldFZhcmlhbnQoJ3N0YWJsZScpKSk7XG5cdFx0c3RhYmxlLmNoZWNrZWQgPSB0aGlzLmNoYXRQZXRTZXJ2aWNlLnZhcmlhbnQuZ2V0KCkgPT09ICdzdGFibGUnO1xuXHRcdGNvbnN0IGluc2lkZXJzID0gYWN0aW9ucy5hZGQobmV3IEFjdGlvbignY2hhdC5wZXQudmFyaWFudC5pbnNpZGVycycsIGxvY2FsaXplKCdjaGF0UGV0LnZhcmlhbnQuaW5zaWRlcnMuYWN0aW9uJywgXCJJbnNpZGVycyBDb2xvcnNcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy5jaGF0UGV0U2VydmljZS5zZXRWYXJpYW50KCdpbnNpZGVycycpKSk7XG5cdFx0aW5zaWRlcnMuY2hlY2tlZCA9IHRoaXMuY2hhdFBldFNlcnZpY2UudmFyaWFudC5nZXQoKSA9PT0gJ2luc2lkZXJzJztcblx0XHRjb25zdCBvblRoZVJ1bkFjdGlvbiA9IGFjdGlvbnMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQnY2hhdC5wZXQub25UaGVSdW4nLFxuXHRcdFx0b25UaGVSdW4gPyBsb2NhbGl6ZSgnY2hhdFBldC5jb21lQmFjay5hY3Rpb24nLCBcIkNvbWUgQmFja1wiKSA6IGxvY2FsaXplKCdjaGF0UGV0LmdvT25UaGVSdW4uYWN0aW9uJywgXCJHbyBvbiB0aGUgUnVuXCIpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5jaGF0UGV0U2VydmljZS5zZXRPblRoZVJ1bighb25UaGVSdW4pO1xuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IG5ldyBTZXBhcmF0b3IoKTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3codGhpcy5fYnV0dG9uLmVsZW1lbnQpLCBldmVudCksXG5cdFx0XHRnZXRBY3Rpb25zOiAoKTogSUFjdGlvbltdID0+IFtcblx0XHRcdFx0b25UaGVSdW5BY3Rpb24sXG5cdFx0XHRcdHNlcGFyYXRvcixcblx0XHRcdFx0c3RhYmxlLFxuXHRcdFx0XHRpbnNpZGVycyxcblx0XHRcdF0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbnRleHRNZW51QWN0aW9ucy52YWx1ZSA9PT0gYWN0aW9ucykge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51QWN0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRcdGxldCBkZWx0YTogbnVtYmVyO1xuXHRcdGxldCBhbm5vdW5jZW1lbnQ6IHN0cmluZztcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRkZWx0YSA9IC1LRVlCT0FSRF9NT1ZFX0RJU1RBTkNFO1xuXHRcdFx0YW5ub3VuY2VtZW50ID0gbG9jYWxpemUoJ2NoYXRQZXQubW92ZWRMZWZ0JywgXCJWUyBDb2RlIHBldCBtb3ZlZCBsZWZ0XCIpO1xuXHRcdH0gZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSkge1xuXHRcdFx0ZGVsdGEgPSBLRVlCT0FSRF9NT1ZFX0RJU1RBTkNFO1xuXHRcdFx0YW5ub3VuY2VtZW50ID0gbG9jYWxpemUoJ2NoYXRQZXQubW92ZWRSaWdodCcsIFwiVlMgQ29kZSBwZXQgbW92ZWQgcmlnaHRcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl93YWtlKCk7XG5cdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGtleWJvYXJkRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGhpcy5fc2V0SG9yaXpvbnRhbFBvc2l0aW9uKHRoaXMuX2dldEN1cnJlbnRMZWZ0KCkgKyBkZWx0YSk7XG5cdFx0c3RhdHVzKGFubm91bmNlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDdXJyZW50TGVmdCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9idXR0b24uZWxlbWVudC5vZmZzZXRMZWZ0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SG9yaXpvbnRhbFBvc2l0aW9uKGxlZnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHBhcmVudEJvdW5kcyA9IHRoaXMuX292ZXJsYXkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgYm91bmRzID0gdGhpcy5kcmFnQm91bmRzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IG1pbmltdW1MZWZ0ID0gYm91bmRzLmxlZnQgLSBwYXJlbnRCb3VuZHMubGVmdDtcblx0XHRjb25zdCBtYXhpbXVtTGVmdCA9IGJvdW5kcy5yaWdodCAtIHBhcmVudEJvdW5kcy5sZWZ0IC0gdGhpcy5fYnV0dG9uLmVsZW1lbnQub2Zmc2V0V2lkdGg7XG5cdFx0Y29uc3QgY2xhbXBlZExlZnQgPSBnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKGxlZnQsIG1pbmltdW1MZWZ0LCBtYXhpbXVtTGVmdCk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuc3R5bGUubGVmdCA9IGAke2NsYW1wZWRMZWZ0fXB4YDtcblx0XHR0aGlzLl9idXR0b24uZWxlbWVudC5zdHlsZS5yaWdodCA9ICdhdXRvJztcblx0XHR0aGlzLl9oYXNDdXN0b21Qb3NpdGlvbiA9IHRydWU7XG5cdFx0cmV0dXJuIGNsYW1wZWRMZWZ0ICE9PSBsZWZ0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlR2F6ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2N1cnNvclBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm91bmRzID0gdGhpcy5fYnV0dG9uLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgW3gsIHldID0gZ2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oXG5cdFx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvblswXSxcblx0XHRcdHRoaXMuX2N1cnNvclBvc2l0aW9uWzFdLFxuXHRcdFx0Ym91bmRzLmxlZnQgKyBib3VuZHMud2lkdGggLyAyLFxuXHRcdFx0Ym91bmRzLnRvcCArIGJvdW5kcy5oZWlnaHQgLyAyLFxuXHRcdCk7XG5cdFx0Zm9yIChjb25zdCBwdXBpbCBvZiB0aGlzLl9wdXBpbHMpIHtcblx0XHRcdHB1cGlsLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHt4ICogMn1weCwgJHt5ICogMn1weClgO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0RW5hYmxlQW5pbWF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicsICdleGl0aW5nJywgJ2VudGVyaW5nJyk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHRoaXMuX2dhemVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRpZiAoIXRoaXMuX21vdGlvblJlZHVjZWQpIHtcblx0XHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2VudGVyaW5nJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnREaXNhYmxlQW5pbWF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZW50ZXJpbmcnKTtcblx0XHRpZiAodGhpcy5fbW90aW9uUmVkdWNlZCB8fCB0aGlzLl9idXR0b24uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpKSB7XG5cdFx0XHR0aGlzLl9maW5pc2hEaXNhYmxlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2V4aXRpbmcnKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmlzaERpc2FibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZW50ZXJpbmcnLCAnZXhpdGluZycpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdHRoaXMuX3Nwcml0ZUFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX3NwZWVjaEFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX3NwZWVjaEJ1YmJsZS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fc3BlZWNoQnViYmxlLmltYWdlLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0dGhpcy5fcGVuZGluZ1Nwcml0ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wZW5kaW5nU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3BlbmRpbmdTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hY3RpdmVTcHJpdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVuZGVyZWRTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHNwcml0ZSBvZiB0aGlzLl9zcHJpdGVzKSB7XG5cdFx0XHRzcHJpdGUuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0c3ByaXRlLmltYWdlLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1RyYW5zaWVudFN0YXRlKHN0YXRlOiBDaGF0UGV0U3RhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2hhdFBldFNlcnZpY2UuZW5hYmxlZC5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dha2UoKTtcblx0XHRjb25zdCByZW5kZXJlZFN0YXRlID0gc3RhdGUgPT09ICd5YXBwaW5nJyAmJiB0aGlzLl9tb3Rpb25SZWR1Y2VkID8gJ3lhcHBpbmdNb3V0aE9wZW4nIDogc3RhdGU7XG5cdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KHJlbmRlcmVkU3RhdGUsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKHJlbmRlcmVkU3RhdGUgPT09ICd5YXBwaW5nTW91dGhPcGVuJyB8fCByZW5kZXJlZFN0YXRlID09PSAneWFwcGluZycpIHtcblx0XHRcdHRoaXMuX3RyYW5zaWVudFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdHJhbnNpZW50U2NoZWR1bGVyLnNjaGVkdWxlKGdldFRyYW5zaWVudFN0YXRlRHVyYXRpb24ocmVuZGVyZWRTdGF0ZSkpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzRHJhZ2dpbmcuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX3JlbmRlclN0YXRlKHJlbmRlcmVkU3RhdGUsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RyeVNlYXJjaCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQgfHwgIXRoaXMuY2hhdFBldFNlcnZpY2Uub25UaGVSdW4uZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX21vdGlvblJlZHVjZWQpIHtcblx0XHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90cmFuc2llbnRTdGF0ZS5zZXQoJ3NlYXJjaGluZycsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fcmVuZGVyU3RhdGUoJ3NlYXJjaGluZycsIHRydWUpO1xuXHRcdHRoaXMuX3NlYXJjaFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FrZSgpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNTbGVlcGluZyA9IHRoaXMuX2lkbGVFeHBpcmVkLmdldCgpIHx8IHRoaXMuX3JlbmRlcmVkU3RhdGUgPT09ICdzbGVlcCc7XG5cdFx0dGhpcy5faWRsZUV4cGlyZWQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGlmICh0aGlzLl9idXN5KSB7XG5cdFx0XHR0aGlzLl9pZGxlU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pZGxlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHRcdGlmICh3YXNTbGVlcGluZykge1xuXHRcdFx0dGhpcy5fYmVnaW5XYWtlQW5pbWF0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5XYWtlQW5pbWF0aW9uKCk6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX21vdGlvblJlZHVjZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJhbnNpZW50U3RhdGUuc2V0KCd3YWtpbmcnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3RyYW5zaWVudFNjaGVkdWxlci5zY2hlZHVsZShXQUtFX1NUQVRFX0RVUkFUSU9OKTtcblx0XHRyZXR1cm4gJ3dha2luZyc7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdGF0ZShzdGF0ZTogQ2hhdFBldFN0YXRlLCByZXN0YXJ0ID0gZmFsc2UsIHVzZVN0YXRpY1Nwcml0ZSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc291cmNlcyA9IGdldFNwcml0ZVNvdXJjZXModGhpcy5fdmFyaWFudClbc3RhdGVdO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX21vdGlvblJlZHVjZWQgfHwgdXNlU3RhdGljU3ByaXRlID8gc291cmNlcy5yZWR1Y2VkTW90aW9uIDogc291cmNlcy5hbmltYXRlZDtcblx0XHRpZiAoIXJlc3RhcnQgJiYgdGhpcy5fYWN0aXZlU3ByaXRlICYmIGlzQ2hhdFBldEltYWdlU291cmNlKHRoaXMuX2FjdGl2ZVNwcml0ZS5pbWFnZSwgc291cmNlLnVybCkpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTcHJpdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuZGF0YXNldC5zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0dGhpcy5fZXllcy5jbGFzc0xpc3QudG9nZ2xlKCd0cmFja2luZycsIGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcihzdGF0ZSkpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU3BlZWNoQnViYmxlKHN0YXRlLCByZXN0YXJ0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzcHJpdGUgPSB0aGlzLl9zcHJpdGVzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZSAhPT0gdGhpcy5fYWN0aXZlU3ByaXRlKTtcblx0XHRpZiAoIXNwcml0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdTcHJpdGUgPSBzcHJpdGU7XG5cdFx0dGhpcy5fcGVuZGluZ1NvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLl9wZW5kaW5nU3RhdGUgPSBzdGF0ZTtcblx0XHRzcHJpdGUuaW1hZ2UucmVtb3ZlQXR0cmlidXRlKCdzcmMnKTtcblx0XHRzcHJpdGUuaW1hZ2Uuc3JjID0gc291cmNlLnVybDtcblx0fVxuXG5cdHByaXZhdGUgX29uSW1hZ2VMb2FkKHNwcml0ZTogQ2hhdFBldFNwcml0ZUVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAoc3ByaXRlICE9PSB0aGlzLl9wZW5kaW5nU3ByaXRlIHx8IHRoaXMuX3BlbmRpbmdTb3VyY2UgPT09IHVuZGVmaW5lZCB8fCAhaXNDaGF0UGV0SW1hZ2VTb3VyY2Uoc3ByaXRlLmltYWdlLCB0aGlzLl9wZW5kaW5nU291cmNlLnVybCkgfHwgdGhpcy5fcGVuZGluZ1N0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zcHJpdGVBbmltYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9hY3RpdmVTcHJpdGU/LmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRzcHJpdGUuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdHRoaXMuX2FjdGl2ZVNwcml0ZSA9IHNwcml0ZTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3BlbmRpbmdTdGF0ZTtcblx0XHR0aGlzLl9zdGFydFNwcml0ZUFuaW1hdGlvbih0aGlzLl9wZW5kaW5nU291cmNlLCBzcHJpdGUsIHRoaXMuX3Nwcml0ZUFuaW1hdGlvbiwgKCkgPT4gdGhpcy5fb25TcHJpdGVBbmltYXRpb25Db21wbGV0ZShzcHJpdGUsIHN0YXRlKSk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuZGF0YXNldC5zdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX3JlbmRlcmVkU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9leWVzLmNsYXNzTGlzdC50b2dnbGUoJ3RyYWNraW5nJywgZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKHN0YXRlKSk7XG5cdFx0dGhpcy5fdXBkYXRlU3BlZWNoQnViYmxlKHN0YXRlLCB0cnVlKTtcblx0XHR0aGlzLl9wZW5kaW5nU3ByaXRlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3BlbmRpbmdTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcGVuZGluZ1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Jlc3RhcnRFeWVBbmltYXRpb24oKTtcblx0XHRpZiAoZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKHRoaXMuX3JlbmRlcmVkU3RhdGUpKSB7XG5cdFx0XHR0aGlzLl9nYXplU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25TcHJpdGVBbmltYXRpb25Db21wbGV0ZShzcHJpdGU6IENoYXRQZXRTcHJpdGVFbGVtZW50LCBzdGF0ZTogQ2hhdFBldFN0YXRlKTogdm9pZCB7XG5cdFx0aWYgKHN0YXRlICE9PSAnc2VhcmNoaW5nJyB8fCBzcHJpdGUgIT09IHRoaXMuX2FjdGl2ZVNwcml0ZSB8fCAhdGhpcy5jaGF0UGV0U2VydmljZS5vblRoZVJ1bi5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90cmFuc2llbnRTdGF0ZS5zZXQoJ3NlYXJjaGluZ0Rvd24nLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmRhdGFzZXQuc3RhdGUgPSAnc2VhcmNoaW5nRG93bic7XG5cdFx0dGhpcy5fcmVuZGVyZWRTdGF0ZSA9ICdzZWFyY2hpbmdEb3duJztcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0U3ByaXRlQW5pbWF0aW9uKHNvdXJjZTogQ2hhdFBldFNwcml0ZVNvdXJjZSwgc3ByaXRlOiBDaGF0UGV0U3ByaXRlRWxlbWVudCwgYW5pbWF0aW9uRGlzcG9zYWJsZTogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+LCBvbkNvbXBsZXRlPzogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZnJhbWVEdXJhdGlvbnMgfSA9IHNvdXJjZTtcblx0XHRjb25zdCB7IGltYWdlLCBjYW52YXMgfSA9IHNwcml0ZTtcblx0XHRjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRleHQuaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZHJhd0ZyYW1lID0gKGZyYW1lSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29udGV4dC5jbGVhclJlY3QoMCwgMCwgQ0hBVF9QRVRfU09VUkNFX1NJWkUsIENIQVRfUEVUX1NPVVJDRV9TSVpFKTtcblx0XHRcdGNvbnRleHQuZHJhd0ltYWdlKFxuXHRcdFx0XHRpbWFnZSxcblx0XHRcdFx0ZnJhbWVJbmRleCAqIENIQVRfUEVUX1NPVVJDRV9TSVpFLFxuXHRcdFx0XHQwLFxuXHRcdFx0XHRDSEFUX1BFVF9TT1VSQ0VfU0laRSxcblx0XHRcdFx0Q0hBVF9QRVRfU09VUkNFX1NJWkUsXG5cdFx0XHRcdDAsXG5cdFx0XHRcdDAsXG5cdFx0XHRcdENIQVRfUEVUX1NPVVJDRV9TSVpFLFxuXHRcdFx0XHRDSEFUX1BFVF9TT1VSQ0VfU0laRVxuXHRcdFx0KTtcblx0XHR9O1xuXHRcdGRyYXdGcmFtZSgwKTtcblx0XHRpZiAoZnJhbWVEdXJhdGlvbnMubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3coY2FudmFzKTtcblx0XHRjb25zdCBzdGFydFRpbWUgPSB0YXJnZXRXaW5kb3cucGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0bGV0IGN1cnJlbnRGcmFtZSA9IDA7XG5cdFx0bGV0IGFuaW1hdGlvbkZyYW1lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbXBsZXRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHVwZGF0ZUZyYW1lID0gKHRpbWVzdGFtcDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBmcmFtZSA9IGdldENoYXRQZXRBbmltYXRpb25GcmFtZShmcmFtZUR1cmF0aW9ucywgdGltZXN0YW1wIC0gc3RhcnRUaW1lLCBzb3VyY2UuaXRlcmF0aW9ucyk7XG5cdFx0XHRpZiAoZnJhbWUuY29tcGxldGUpIHtcblx0XHRcdFx0ZHJhd0ZyYW1lKGZyYW1lLmZyYW1lSW5kZXgpO1xuXHRcdFx0XHRpZiAoIWNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdGNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0b25Db21wbGV0ZT8uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZyYW1lLmZyYW1lSW5kZXggIT09IGN1cnJlbnRGcmFtZSkge1xuXHRcdFx0XHRjdXJyZW50RnJhbWUgPSBmcmFtZS5mcmFtZUluZGV4O1xuXHRcdFx0XHRkcmF3RnJhbWUoZnJhbWUuZnJhbWVJbmRleCk7XG5cdFx0XHR9XG5cdFx0XHRhbmltYXRpb25GcmFtZSA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUodXBkYXRlRnJhbWUpO1xuXHRcdH07XG5cdFx0YW5pbWF0aW9uRnJhbWUgPSB0YXJnZXRXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHVwZGF0ZUZyYW1lKTtcblx0XHRhbmltYXRpb25EaXNwb3NhYmxlLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmIChhbmltYXRpb25GcmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRhcmdldFdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShhbmltYXRpb25GcmFtZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTcGVlY2hCdWJibGUoc3RhdGU6IENoYXRQZXRTdGF0ZSB8IHVuZGVmaW5lZCwgcmVzdGFydCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGRvZXNDaGF0UGV0U3RhdGVTcGVhayhzdGF0ZSk7XG5cdFx0dGhpcy5fc3BlZWNoQnViYmxlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhdmlzaWJsZSk7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9zcGVlY2hBbmltYXRpb24uY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VzID0gZ2V0U3BlZWNoU3ByaXRlU291cmNlcyh0aGlzLl92YXJpYW50KTtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl9tb3Rpb25SZWR1Y2VkID8gc291cmNlcy5yZWR1Y2VkTW90aW9uIDogc291cmNlcy5hbmltYXRlZDtcblx0XHRpZiAoIWlzQ2hhdFBldEltYWdlU291cmNlKHRoaXMuX3NwZWVjaEJ1YmJsZS5pbWFnZSwgc291cmNlLnVybCkpIHtcblx0XHRcdHRoaXMuX3NwZWVjaEFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdFx0dGhpcy5fc3BlZWNoQnViYmxlLmltYWdlLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0XHR0aGlzLl9zcGVlY2hCdWJibGUuaW1hZ2Uuc3JjID0gc291cmNlLnVybDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHJlc3RhcnQgJiYgdGhpcy5fc3BlZWNoQnViYmxlLmltYWdlLmNvbXBsZXRlICYmIHRoaXMuX3NwZWVjaEJ1YmJsZS5pbWFnZS5uYXR1cmFsV2lkdGggPiAwKSB7XG5cdFx0XHR0aGlzLl9zcGVlY2hBbmltYXRpb24uY2xlYXIoKTtcblx0XHRcdHRoaXMuX3N0YXJ0U3ByaXRlQW5pbWF0aW9uKHNvdXJjZSwgdGhpcy5fc3BlZWNoQnViYmxlLCB0aGlzLl9zcGVlY2hBbmltYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RhcnRFeWVBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fZXllcy5jbGFzc0xpc3QucmVtb3ZlKCdhbmltYXRlZCcpO1xuXHRcdHRoaXMuX2V5ZXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0aWYgKCF0aGlzLl9tb3Rpb25SZWR1Y2VkKSB7XG5cdFx0XHR0aGlzLl9leWVzLmNsYXNz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
