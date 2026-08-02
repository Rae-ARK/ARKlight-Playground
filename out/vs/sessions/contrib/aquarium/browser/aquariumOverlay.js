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
import { addDisposableGenericMouseDownListener, addDisposableGenericMouseMoveListener, addDisposableListener, EventType, getWindow, scheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { createInstantHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchLayoutService, Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { SessionsAquariumActiveContext } from "../../../common/contextkeys.js";
import { disposeSharedFishDefs, Fish, pickRandomSpecies } from "./fish.js";
import { FishFeedingStreak } from "./fishFeedingStreak.js";
const SESSIONS_DEVELOPER_JOY_ENABLED_SETTING = "sessions.developerJoy.enabled";
const FISH_COUNT = 50;
const FISH_MIN_SIZE = 22;
const FISH_MAX_SIZE = 48;
const FISH_GROWTH_FACTOR = 1.08;
const SCATTER_RADIUS = 145;
const SCATTER_RADIUS_SQ = SCATTER_RADIUS * SCATTER_RADIUS;
const EAT_RADIUS = 14;
const FOOD_DETECT_RADIUS = 160;
const FOOD_DETECT_RADIUS_SQ = FOOD_DETECT_RADIUS * FOOD_DETECT_RADIUS;
const MAX_FOOD = 12;
const WALL_MARGIN = 36;
const BASE_SPEED = 24;
const MAX_SPEED = 50;
const MAX_SPEED_SQ = MAX_SPEED * MAX_SPEED;
const PANIC_MAX_SPEED = 240;
const PANIC_MAX_SPEED_SQ = PANIC_MAX_SPEED * PANIC_MAX_SPEED;
const PANIC_DURATION_MS = 600;
const EXIT_DURATION_MS = 900;
const ACTIVE_FRAME_INTERVAL_MS = 1e3 / 30;
const DART_RATE_PER_SECOND = 0.04;
const DART_IMPULSE = 150;
const ENABLED_STORAGE_KEY = "sessions.developerJoy.enabled";
const ACTION_VISIBLE_STORAGE_KEY = "sessions.aquarium.action.visible";
const FISH_HUNGER_ICONS = {
  happy: Codicon.fish1Happy,
  neutral: Codicon.fish1Neutral,
  sad: Codicon.fish1Sad,
  verySad: Codicon.fish1VerySad
};
const IAquariumService = createDecorator("aquariumService");
let AquariumService = class extends Disposable {
  constructor(layoutService, contextKeyService, hoverService, storageService, configurationService, accessibilityService, telemetryService) {
    super();
    this.layoutService = layoutService;
    this.hoverService = hoverService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.telemetryService = telemetryService;
    this.mounts = /* @__PURE__ */ new Set();
    this.activeRef = this._register(new MutableDisposable());
    this.pendingExit = this._register(new MutableDisposable());
    this._actionVisible = observableValue(this, true);
    this.actionVisible = this._actionVisible;
    this.mainContainer = layoutService.mainContainer;
    this.activeContextKey = SessionsAquariumActiveContext.bindTo(contextKeyService);
    this.streak = new FishFeedingStreak(storageService);
    this._actionVisible.set(this.storageService.getBoolean(ACTION_VISIBLE_STORAGE_KEY, StorageScope.APPLICATION, true), void 0);
    this.hungerRefreshScheduler = this._register(new RunOnceScheduler(() => {
      this.updateAllToggleButtonsVisual(!!this.activeRef.value);
    }, 0));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, ACTION_VISIBLE_STORAGE_KEY, this._store)(() => {
      this.setActionVisible(this.storageService.getBoolean(ACTION_VISIBLE_STORAGE_KEY, StorageScope.APPLICATION, true));
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING)) {
        this.applyFeatureEnabledState();
      }
    }));
  }
  mountToggle(parent) {
    const doc = parent.ownerDocument;
    const button = doc.createElement("button");
    button.className = "agents-aquarium-toggle";
    button.type = "button";
    this.updateToggleButtonVisual(button, !!this.activeRef.value);
    const store = new DisposableStore();
    store.add(addDisposableListener(button, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    }));
    const hoverDelegate = store.add(createInstantHoverDelegate());
    store.add(this.hoverService.setupManagedHover(
      hoverDelegate,
      button,
      () => this.getToggleLabel(!!this.activeRef.value)
    ));
    parent.appendChild(button);
    const mount = { button, hostVisible: true };
    this.mounts.add(mount);
    this.applyFeatureEnabledStateForButton(button);
    this.reconcileActivation();
    this.scheduleHungerRefresh();
    return {
      setHostVisible: (visible) => {
        if (mount.hostVisible === visible) {
          return;
        }
        mount.hostVisible = visible;
        this.reconcileActivation();
      },
      dispose: () => {
        store.dispose();
        button.remove();
        this.mounts.delete(mount);
        if (this.mounts.size === 0) {
          this.hungerRefreshScheduler.cancel();
        }
        this.reconcileActivation();
      }
    };
  }
  toggleActionVisibility() {
    const visible = !this._actionVisible.get();
    this.setActionVisible(visible);
    this.storageService.store(ACTION_VISIBLE_STORAGE_KEY, visible, StorageScope.APPLICATION, StorageTarget.USER);
    this.accessibilityService.status(visible ? localize("aquarium.action.shown", "Aquarium action shown") : localize("aquarium.action.hidden", "Aquarium action hidden"));
    return visible;
  }
  simulateStreak(count, alive) {
    this.streak.simulate(count, alive);
    this.updateAllToggleButtonsVisual(!!this.activeRef.value);
  }
  setActionVisible(visible) {
    this._actionVisible.set(visible, void 0);
    for (const mount of this.mounts) {
      this.applyFeatureEnabledStateForButton(mount.button);
    }
  }
  /**
   * Activate when at least one mount is host-visible and the user has it on;
   * otherwise deactivate synchronously (no fade) so the aquarium can't flash
   * behind a sibling view during a view swap.
   */
  reconcileActivation() {
    const anyHostVisible = this.hasVisibleMount();
    if (anyHostVisible && this.isFeatureEnabled() && this.isStoredEnabled() && !this.activeRef.value) {
      this.activate(
        /* persist */
        false
      );
    } else if (!anyHostVisible) {
      this.pendingExit.clear();
      if (this.activeRef.value) {
        this.deactivate(
          /* persist */
          false,
          /* animate */
          false
        );
      }
    }
  }
  hasVisibleMount() {
    for (const m of this.mounts) {
      if (m.hostVisible) {
        return true;
      }
    }
    return false;
  }
  isFeatureEnabled() {
    return this.configurationService.getValue(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING) === true;
  }
  isStoredEnabled() {
    return this.storageService.getBoolean(ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false);
  }
  setStoredEnabled(enabled) {
    this.storageService.store(ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
  }
  applyFeatureEnabledState() {
    for (const mount of this.mounts) {
      this.applyFeatureEnabledStateForButton(mount.button);
    }
    if (!this.isFeatureEnabled() && this.activeRef.value) {
      this.deactivate(
        /* persist */
        false
      );
    } else if (this.isFeatureEnabled()) {
      this.reconcileActivation();
    }
  }
  applyFeatureEnabledStateForButton(button) {
    button.style.display = this.isFeatureEnabled() && this._actionVisible.get() ? "" : "none";
  }
  updateToggleButtonVisual(button, active) {
    button.classList.toggle("active", active);
    this.streak.collectExpired();
    const streak = this.streak.count;
    const revivable = streak > 0 ? 0 : this.streak.revivableCount;
    const hungerIcon = FISH_HUNGER_ICONS[this.streak.hungerState];
    const icon = active ? Codicon.close : hungerIcon;
    button.replaceChildren();
    const iconSpan = button.ownerDocument.createElement("span");
    iconSpan.setAttribute("aria-hidden", "true");
    addIconClasses(iconSpan, icon);
    if (!active) {
      button.appendChild(iconSpan);
    }
    const showStreak = streak > 0 || revivable > 0;
    button.classList.toggle("has-streak", showStreak);
    if (showStreak) {
      const streakSpan = button.ownerDocument.createElement("span");
      streakSpan.className = "agents-aquarium-toggle-streak";
      streakSpan.setAttribute("aria-hidden", "true");
      if (active) {
        const hungerIconSpan = button.ownerDocument.createElement("span");
        addIconClasses(hungerIconSpan, hungerIcon);
        streakSpan.appendChild(hungerIconSpan);
      }
      if (streak > 0) {
        streakSpan.append(String(streak));
      } else {
        streakSpan.classList.add("revivable");
        streakSpan.append(localize("aquarium.reviveBadge", "{0} \xB7 Feed again to revive", revivable));
      }
      button.appendChild(streakSpan);
    }
    if (active) {
      button.appendChild(iconSpan);
    }
    const label = this.getToggleLabel(active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", label);
  }
  getToggleLabel(active) {
    const base = active ? localize("aquarium.hide", "Hide Aquarium") : localize("aquarium.show", "Show Aquarium");
    const streak = this.streak.count;
    if (streak > 0) {
      const hungerDescription = getFishHungerDescription(this.streak.hungerState);
      return streak === 1 ? localize("aquarium.streakLabel.one", "{0} \u2014 {1} \u2014 {2} day feeding streak", base, hungerDescription, streak) : localize("aquarium.streakLabel.other", "{0} \u2014 {1} \u2014 {2} days feeding streak", base, hungerDescription, streak);
    }
    const revivable = this.streak.revivableCount;
    if (revivable > 0) {
      return revivable === 1 ? localize("aquarium.reviveLabel.one", "{0} \u2014 feed a fish to revive your {1} day streak", base, revivable) : localize("aquarium.reviveLabel.other", "{0} \u2014 feed a fish to revive your {1} day streak", base, revivable);
    }
    return base;
  }
  toggle() {
    const willActivate = !this.activeRef.value;
    this.telemetryService.publicLog2("vscodeAgents.aquarium/toggle", {
      activated: willActivate
    });
    if (this.activeRef.value) {
      this.deactivate(
        /* persist */
        true
      );
    } else if (this.hasVisibleMount()) {
      this.activate(
        /* persist */
        true
      );
    }
  }
  updateAllToggleButtonsVisual(active) {
    for (const mount of this.mounts) {
      this.updateToggleButtonVisual(mount.button, active);
    }
    this.scheduleHungerRefresh();
  }
  scheduleHungerRefresh() {
    this.hungerRefreshScheduler.cancel();
    if (this.mounts.size === 0) {
      return;
    }
    const delay = this.streak.millisecondsUntilHungerStateChange;
    if (delay !== void 0) {
      this.hungerRefreshScheduler.schedule(delay);
    }
  }
  /** @param persist false when restoring previously-stored state. */
  activate(persist) {
    if (this.activeRef.value) {
      return;
    }
    this.pendingExit.clear();
    let active;
    try {
      active = createActiveAquarium(this.mainContainer, this.layoutService, this.accessibilityService, () => this.handleFishFed());
    } catch (e) {
      console.error("[aquarium] failed to activate", e);
      return;
    }
    if (!active) {
      return;
    }
    this.activeRef.value = active;
    this.activeContextKey.set(true);
    this.updateAllToggleButtonsVisual(true);
    if (persist) {
      this.setStoredEnabled(true);
    }
    this.streak.collectExpired();
    this.updateAllToggleButtonsVisual(true);
  }
  /** Called whenever a fish eats a pellet. */
  handleFishFed() {
    const before = this.streak.count;
    const result = this.streak.recordFeed();
    if (result.count !== before || result.revived) {
      this.updateAllToggleButtonsVisual(!!this.activeRef.value);
    }
  }
  /**
   * @param persist false when tearing down for non-user reasons.
   * @param animate false to dispose synchronously (no fade-out). Used for
   * host-driven teardown where running a 900ms fade would let fish stay
   * visible while the next view layers on top.
   */
  deactivate(persist, animate = true) {
    if (!animate) {
      this.activeRef.clear();
      this.activeContextKey.set(false);
      this.updateAllToggleButtonsVisual(false);
      if (persist) {
        this.setStoredEnabled(false);
      }
      return;
    }
    const active = this.activeRef.clearAndLeak();
    if (!active) {
      return;
    }
    this.activeContextKey.set(false);
    this.updateAllToggleButtonsVisual(false);
    const pending = active.exit(() => {
      if (this.pendingExit.value === pending) {
        this.pendingExit.clear();
      }
    });
    this.pendingExit.value = pending;
    if (persist) {
      this.setStoredEnabled(false);
    }
  }
};
AquariumService = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IAccessibilityService),
  __decorateParam(6, ITelemetryService)
], AquariumService);
function createActiveAquarium(mainContainer, layoutService, accessibilityService, onFishFed) {
  const targetWindow = getWindow(mainContainer);
  const sessionsContainer = layoutService.getContainer(targetWindow, Parts.SESSIONS_PART);
  if (!sessionsContainer || !layoutService.isVisible(Parts.SESSIONS_PART, targetWindow)) {
    return void 0;
  }
  const store = new DisposableStore();
  const doc = targetWindow.document;
  const water = doc.createElement("div");
  water.className = "agents-aquarium-water";
  water.setAttribute("aria-hidden", "true");
  sessionsContainer.insertBefore(water, sessionsContainer.firstChild);
  sessionsContainer.classList.add("aquarium-active");
  store.add(toDisposable(() => {
    water.remove();
    sessionsContainer.classList.remove("aquarium-active");
  }));
  const fishLayer = doc.createElement("div");
  fishLayer.className = "agents-aquarium-fish-layer";
  water.appendChild(fishLayer);
  const foodLayer = doc.createElement("div");
  foodLayer.className = "agents-aquarium-food-layer";
  water.appendChild(foodLayer);
  const bounds = { width: 0, height: 0 };
  const waterScreenOffset = { left: 0, top: 0 };
  const updateBounds = () => {
    bounds.width = water.clientWidth;
    bounds.height = water.clientHeight;
    const rect = water.getBoundingClientRect();
    waterScreenOffset.left = rect.left;
    waterScreenOffset.top = rect.top;
  };
  const fish = [];
  updateBounds();
  const resizeObserver = new ResizeObserver(() => {
    updateBounds();
    for (const f of fish) {
      f.positionX = Math.min(f.positionX, Math.max(0, bounds.width - f.size));
      f.positionY = Math.min(f.positionY, Math.max(0, bounds.height - f.size));
    }
  });
  resizeObserver.observe(water);
  store.add(toDisposable(() => resizeObserver.disconnect()));
  for (let i = 0; i < FISH_COUNT; i++) {
    const size = randomBetween(FISH_MIN_SIZE, FISH_MAX_SIZE);
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(BASE_SPEED * 0.6, BASE_SPEED * 1.2);
    const f = new Fish({
      species: pickRandomSpecies(),
      size,
      positionX: randomBetween(0, Math.max(1, bounds.width - size)),
      positionY: randomBetween(0, Math.max(1, bounds.height - size)),
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed
    }, targetWindow.document);
    fish.push(f);
  }
  const SYNC_BATCH = Math.ceil(FISH_COUNT / 2);
  const firstBatch = targetWindow.document.createDocumentFragment();
  for (let i = 0; i < Math.min(SYNC_BATCH, fish.length); i++) {
    firstBatch.appendChild(fish[i].element);
  }
  fishLayer.appendChild(firstBatch);
  let exiting = false;
  if (SYNC_BATCH < fish.length) {
    const deferred = scheduleAtNextAnimationFrame(targetWindow, () => {
      if (exiting) {
        return;
      }
      const restBatch = targetWindow.document.createDocumentFragment();
      for (let i = SYNC_BATCH; i < fish.length; i++) {
        restBatch.appendChild(fish[i].element);
      }
      fishLayer.appendChild(restBatch);
      const fadeIn2 = scheduleAtNextAnimationFrame(targetWindow, () => {
        if (exiting) {
          return;
        }
        for (let i = SYNC_BATCH; i < fish.length; i++) {
          const localIndex = i - SYNC_BATCH;
          const delay = Math.min(localIndex * 12, 400);
          fish[i].element.style.transitionDelay = `${delay}ms`;
          fish[i].element.classList.add("visible");
        }
      });
      store.add(fadeIn2);
    });
    store.add(deferred);
  }
  store.add(toDisposable(() => {
    for (const f of fish) {
      f.element.remove();
    }
    disposeSharedFishDefs(targetWindow.document);
  }));
  const food = [];
  const removeFood = (pellet) => {
    const idx = food.indexOf(pellet);
    if (idx !== -1) {
      food.splice(idx, 1);
      pellet.element.remove();
    }
  };
  let boundsDirty = false;
  const markBoundsDirty = () => {
    boundsDirty = true;
  };
  store.add(addDisposableListener(targetWindow, EventType.RESIZE, markBoundsDirty, { passive: true }));
  store.add(addDisposableListener(targetWindow, "scroll", markBoundsDirty, { passive: true, capture: true }));
  let mouseX = -1e6;
  let mouseY = -1e6;
  const resetMousePosition = () => {
    mouseX = -1e6;
    mouseY = -1e6;
  };
  store.add(addDisposableGenericMouseMoveListener(mainContainer, (e) => {
    mouseX = e.clientX - waterScreenOffset.left;
    mouseY = e.clientY - waterScreenOffset.top;
  }));
  store.add(addDisposableListener(mainContainer, EventType.MOUSE_LEAVE, resetMousePosition, { passive: true }));
  store.add(addDisposableListener(mainContainer, EventType.POINTER_LEAVE, resetMousePosition, { passive: true }));
  store.add(addDisposableGenericMouseDownListener(mainContainer, (e) => {
    if (e.button !== 0) {
      return;
    }
    const target = e.target;
    if (!isBackgroundClick(target)) {
      return;
    }
    updateBounds();
    const dropX = e.clientX - waterScreenOffset.left;
    const dropY = e.clientY - waterScreenOffset.top;
    if (dropX < 0 || dropY < 0 || dropX > bounds.width || dropY > bounds.height) {
      return;
    }
    spawnFood(dropX, dropY);
  }));
  function spawnFood(dropX, dropY) {
    while (food.length >= MAX_FOOD) {
      const oldest = food[0];
      removeFood(oldest);
    }
    const el = doc.createElement("div");
    el.className = "agents-aquarium-food";
    el.style.transform = `translate(${dropX}px, ${dropY}px)`;
    foodLayer.appendChild(el);
    food.push({ element: el, positionX: dropX, positionY: dropY, fallSpeed: randomBetween(20, 35) });
  }
  let lastFrame = performance.now();
  let rafDisposable;
  const stopAnimation = () => {
    rafDisposable?.dispose();
    rafDisposable = void 0;
  };
  const startAnimation = () => {
    if (rafDisposable || accessibilityService.isMotionReduced()) {
      return;
    }
    lastFrame = performance.now();
    rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
  };
  const tick = () => {
    rafDisposable = void 0;
    const now = performance.now();
    const elapsedMs = now - lastFrame;
    if (elapsedMs < ACTIVE_FRAME_INTERVAL_MS) {
      rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
      return;
    }
    const dtMs = Math.min(elapsedMs, 100);
    const dt = dtMs / 1e3;
    lastFrame = now;
    if (boundsDirty) {
      boundsDirty = false;
      updateBounds();
    }
    if (!accessibilityService.isMotionReduced() && targetWindow.document.visibilityState !== "hidden") {
      updateFood(dt);
      updateFish(dt);
    }
    if (!accessibilityService.isMotionReduced()) {
      rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
    }
  };
  function updateFood(dt) {
    for (let i = food.length - 1; i >= 0; i--) {
      const pellet = food[i];
      pellet.positionY += pellet.fallSpeed * dt;
      pellet.element.style.transform = `translate(${pellet.positionX.toFixed(1)}px, ${pellet.positionY.toFixed(1)}px)`;
      if (pellet.positionY > bounds.height + 10) {
        removeFood(pellet);
      }
    }
  }
  function updateFish(dt) {
    const now = performance.now();
    for (const f of fish) {
      const centerX = f.positionX + f.size / 2;
      const centerY = f.positionY + f.size / 2;
      const wallEscapeAngle = computeWallAvoidAngle(centerX, centerY, bounds.width, bounds.height);
      if (wallEscapeAngle !== void 0) {
        const turnDelta = shortestAngleDelta(f.wanderAngle, wallEscapeAngle);
        const maxTurnPerFrame = 4 * dt;
        f.wanderAngle += Math.max(-maxTurnPerFrame, Math.min(maxTurnPerFrame, turnDelta));
      } else {
        f.wanderAngle += (Math.random() - 0.5) * 1.2 * dt + (Math.random() - 0.5) * 0.04;
      }
      const thrust = 32;
      let accelX = Math.cos(f.wanderAngle) * thrust;
      let accelY = Math.sin(f.wanderAngle) * thrust;
      if (Math.random() < DART_RATE_PER_SECOND * dt) {
        const dartAngle = Math.random() * Math.PI * 2;
        f.velocityX += Math.cos(dartAngle) * DART_IMPULSE;
        f.velocityY += Math.sin(dartAngle) * DART_IMPULSE;
        f.panicUntil = now + PANIC_DURATION_MS;
      }
      if (centerX < WALL_MARGIN) {
        accelX += (WALL_MARGIN - centerX) * 6;
      } else if (centerX > bounds.width - WALL_MARGIN) {
        accelX -= (centerX - (bounds.width - WALL_MARGIN)) * 6;
      }
      if (centerY < WALL_MARGIN) {
        accelY += (WALL_MARGIN - centerY) * 6;
      } else if (centerY > bounds.height - WALL_MARGIN) {
        accelY -= (centerY - (bounds.height - WALL_MARGIN)) * 6;
      }
      const mouseDeltaX = centerX - mouseX;
      const mouseDeltaY = centerY - mouseY;
      const mouseDistSq = mouseDeltaX * mouseDeltaX + mouseDeltaY * mouseDeltaY;
      if (mouseDistSq < SCATTER_RADIUS_SQ) {
        const mouseDist = Math.max(Math.sqrt(mouseDistSq), 1);
        const force = (1 - mouseDist / SCATTER_RADIUS) * 1100;
        accelX += mouseDeltaX / mouseDist * force;
        accelY += mouseDeltaY / mouseDist * force;
        f.panicUntil = now + PANIC_DURATION_MS;
      }
      let nearestPellet;
      let nearestDistSq = FOOD_DETECT_RADIUS_SQ;
      for (const pellet of food) {
        const foodDeltaX = pellet.positionX - centerX;
        const foodDeltaY = pellet.positionY - centerY;
        const distSq = foodDeltaX * foodDeltaX + foodDeltaY * foodDeltaY;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestPellet = pellet;
        }
      }
      if (nearestPellet) {
        const nearestDist = Math.max(Math.sqrt(nearestDistSq), 1);
        if (nearestDist < EAT_RADIUS) {
          removeFood(nearestPellet);
          f.grow(FISH_GROWTH_FACTOR);
          onFishFed?.();
        } else {
          accelX += (nearestPellet.positionX - centerX) / nearestDist * 200;
          accelY += (nearestPellet.positionY - centerY) / nearestDist * 200;
        }
      }
      f.velocityX += accelX * dt;
      f.velocityY += accelY * dt;
      const speedSq = f.velocityX * f.velocityX + f.velocityY * f.velocityY;
      const maxSpeed = now < f.panicUntil ? PANIC_MAX_SPEED : MAX_SPEED;
      const maxSpeedSq = now < f.panicUntil ? PANIC_MAX_SPEED_SQ : MAX_SPEED_SQ;
      if (speedSq > maxSpeedSq) {
        const speed = Math.sqrt(speedSq);
        f.velocityX = f.velocityX / speed * maxSpeed;
        f.velocityY = f.velocityY / speed * maxSpeed;
      }
      f.positionX += f.velocityX * dt;
      f.positionY += f.velocityY * dt;
      f.positionX = clamp(f.positionX, -f.size * 0.25, bounds.width - f.size * 0.75);
      f.positionY = clamp(f.positionY, -f.size * 0.25, bounds.height - f.size * 0.75);
      f.applyTransform(dt);
    }
  }
  store.add(accessibilityService.onDidChangeReducedMotion(() => {
    if (accessibilityService.isMotionReduced()) {
      stopAnimation();
    } else {
      startAnimation();
    }
  }));
  store.add(toDisposable(() => stopAnimation()));
  startAnimation();
  const fadeIn = scheduleAtNextAnimationFrame(targetWindow, () => {
    if (exiting) {
      return;
    }
    water.classList.add("visible");
    for (let i = 0; i < Math.min(SYNC_BATCH, fish.length); i++) {
      const f = fish[i];
      const delay = Math.min(i * 12, 400);
      f.element.style.transitionDelay = `${delay}ms`;
      f.element.classList.add("visible");
    }
  });
  store.add(fadeIn);
  const result = new class extends Disposable {
    constructor() {
      super();
      this._register(store);
    }
    exit(onDidComplete) {
      if (exiting) {
        return toDisposable(() => this.dispose());
      }
      exiting = true;
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        const delay = Math.min(i * 12, 400);
        f.element.style.transitionDelay = `${delay}ms`;
        f.element.classList.remove("visible");
      }
      water.classList.remove("visible");
      let timer = setTimeout(() => {
        timer = void 0;
        this.dispose();
        onDidComplete();
      }, EXIT_DURATION_MS);
      return toDisposable(() => {
        if (timer !== void 0) {
          clearTimeout(timer);
          timer = void 0;
        }
        this.dispose();
      });
    }
  }();
  return result;
}
function isBackgroundClick(target) {
  if (!target) {
    return false;
  }
  if (target.closest('input, textarea, select, button, a, [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="menuitem"], [role="tab"], .monaco-editor, .scroll-decoration, .monaco-list-row')) {
    return false;
  }
  return true;
}
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
function clamp(value, min, max) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
function addIconClasses(element, icon) {
  const iconClasses = ThemeIcon.asClassName(icon).split(/\s+/).filter(Boolean);
  for (const cls of iconClasses) {
    element.classList.add(cls);
  }
}
function getFishHungerDescription(state) {
  switch (state) {
    case "happy":
      return localize("aquarium.hunger.happy", "fish is happy");
    case "neutral":
      return localize("aquarium.hunger.neutral", "fish is getting hungry");
    case "sad":
      return localize("aquarium.hunger.sad", "fish is hungry");
    case "verySad":
      return localize("aquarium.hunger.verySad", "fish is starving");
  }
}
function computeWallAvoidAngle(centerX, centerY, width, height) {
  let escapeX = 0;
  let escapeY = 0;
  if (centerX < WALL_MARGIN) {
    escapeX += (WALL_MARGIN - centerX) / WALL_MARGIN;
  } else if (centerX > width - WALL_MARGIN) {
    escapeX -= (centerX - (width - WALL_MARGIN)) / WALL_MARGIN;
  }
  if (centerY < WALL_MARGIN) {
    escapeY += (WALL_MARGIN - centerY) / WALL_MARGIN;
  } else if (centerY > height - WALL_MARGIN) {
    escapeY -= (centerY - (height - WALL_MARGIN)) / WALL_MARGIN;
  }
  if (escapeX === 0 && escapeY === 0) {
    return void 0;
  }
  return Math.atan2(escapeY, escapeX) + (Math.random() - 0.5) * 0.4;
}
function shortestAngleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  } else if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}
export {
  AquariumService,
  IAquariumService,
  SESSIONS_DEVELOPER_JOY_ENABLED_SETTING
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXF1YXJpdW0vYnJvd3Nlci9hcXVhcml1bU92ZXJsYXkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyLCBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlTW92ZUxpc3RlbmVyLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZ2V0V2luZG93LCBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25zQXF1YXJpdW1BY3RpdmVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IGRpc3Bvc2VTaGFyZWRGaXNoRGVmcywgRmlzaCwgcGlja1JhbmRvbVNwZWNpZXMgfSBmcm9tICcuL2Zpc2guanMnO1xuaW1wb3J0IHsgRmlzaEZlZWRpbmdTdHJlYWssIHR5cGUgRmlzaEh1bmdlclN0YXRlIH0gZnJvbSAnLi9maXNoRmVlZGluZ1N0cmVhay5qcyc7XG5cbmV4cG9ydCBjb25zdCBTRVNTSU9OU19ERVZFTE9QRVJfSk9ZX0VOQUJMRURfU0VUVElORyA9ICdzZXNzaW9ucy5kZXZlbG9wZXJKb3kuZW5hYmxlZCc7XG5cbmNvbnN0IEZJU0hfQ09VTlQgPSA1MDtcbmNvbnN0IEZJU0hfTUlOX1NJWkUgPSAyMjtcbmNvbnN0IEZJU0hfTUFYX1NJWkUgPSA0ODtcbi8qKiBFYWNoIGVhdGVuIHBlbGxldCBtdWx0aXBsaWVzIHRoZSBmaXNoJ3Mgc2l6ZSBieSB0aGlzLiBVbmJvdW5kZWQgb24gcHVycG9zZS4gKi9cbmNvbnN0IEZJU0hfR1JPV1RIX0ZBQ1RPUiA9IDEuMDg7XG5cbmNvbnN0IFNDQVRURVJfUkFESVVTID0gMTQ1O1xuY29uc3QgU0NBVFRFUl9SQURJVVNfU1EgPSBTQ0FUVEVSX1JBRElVUyAqIFNDQVRURVJfUkFESVVTO1xuY29uc3QgRUFUX1JBRElVUyA9IDE0O1xuY29uc3QgRk9PRF9ERVRFQ1RfUkFESVVTID0gMTYwO1xuY29uc3QgRk9PRF9ERVRFQ1RfUkFESVVTX1NRID0gRk9PRF9ERVRFQ1RfUkFESVVTICogRk9PRF9ERVRFQ1RfUkFESVVTO1xuY29uc3QgTUFYX0ZPT0QgPSAxMjtcbi8qKiBTb2Z0IG1hcmdpbiB3aGVyZSBmaXNoIHN0YXJ0IHRvIHR1cm4gYmFjay4gKi9cbmNvbnN0IFdBTExfTUFSR0lOID0gMzY7XG5cbmNvbnN0IEJBU0VfU1BFRUQgPSAyNDtcbmNvbnN0IE1BWF9TUEVFRCA9IDUwO1xuY29uc3QgTUFYX1NQRUVEX1NRID0gTUFYX1NQRUVEICogTUFYX1NQRUVEO1xuY29uc3QgUEFOSUNfTUFYX1NQRUVEID0gMjQwO1xuY29uc3QgUEFOSUNfTUFYX1NQRUVEX1NRID0gUEFOSUNfTUFYX1NQRUVEICogUEFOSUNfTUFYX1NQRUVEO1xuY29uc3QgUEFOSUNfRFVSQVRJT05fTVMgPSA2MDA7XG5jb25zdCBFWElUX0RVUkFUSU9OX01TID0gOTAwO1xuXG4vKiogRGVjb3JhdGl2ZSBlZmZlY3Q6IDMwSHoga2VlcHMgbW90aW9uIHNtb290aCBlbm91Z2ggd2hpbGUgaGFsdmluZyBKUyB3b3JrLiAqL1xuY29uc3QgQUNUSVZFX0ZSQU1FX0lOVEVSVkFMX01TID0gMTAwMCAvIDMwO1xuXG4vKiogUGVyLWZpc2ggcGVyLXNlY29uZCBwcm9iYWJpbGl0eSBvZiBzdGFydGluZyBhIHNwb250YW5lb3VzIGJ1cnN0LiAqL1xuY29uc3QgREFSVF9SQVRFX1BFUl9TRUNPTkQgPSAwLjA0O1xuY29uc3QgREFSVF9JTVBVTFNFID0gMTUwO1xuXG5jb25zdCBFTkFCTEVEX1NUT1JBR0VfS0VZID0gJ3Nlc3Npb25zLmRldmVsb3BlckpveS5lbmFibGVkJztcbmNvbnN0IEFDVElPTl9WSVNJQkxFX1NUT1JBR0VfS0VZID0gJ3Nlc3Npb25zLmFxdWFyaXVtLmFjdGlvbi52aXNpYmxlJztcblxuY29uc3QgRklTSF9IVU5HRVJfSUNPTlM6IFJlY29yZDxGaXNoSHVuZ2VyU3RhdGUsIFRoZW1lSWNvbj4gPSB7XG5cdGhhcHB5OiBDb2RpY29uLmZpc2gxSGFwcHksXG5cdG5ldXRyYWw6IENvZGljb24uZmlzaDFOZXV0cmFsLFxuXHRzYWQ6IENvZGljb24uZmlzaDFTYWQsXG5cdHZlcnlTYWQ6IENvZGljb24uZmlzaDFWZXJ5U2FkLFxufTtcblxuaW50ZXJmYWNlIElGb29kUGVsbGV0IHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTERpdkVsZW1lbnQ7XG5cdHBvc2l0aW9uWDogbnVtYmVyO1xuXHRwb3NpdGlvblk6IG51bWJlcjtcblx0ZmFsbFNwZWVkOiBudW1iZXI7XG59XG5cbi8qKlxuICogT3ducyB0aGUgdG9nZ2xlIGJ1dHRvbihzKSwgdGhlIHBlcnNpc3RlZCBvbi9vZmYgcHJlZmVyZW5jZSwgYW5kIHRoZSBhY3RpdmVcbiAqIGFxdWFyaXVtLiBIb3N0cyBjYWxsIHtAbGluayBJQXF1YXJpdW1TZXJ2aWNlLm1vdW50VG9nZ2xlfSB0byBhdHRhY2ggYSBidXR0b25cbiAqIGFzIGEgY2hpbGQgb2YgdGhlaXIgY29udGFpbmVyOyB0aGUgYWN0aXZlIGFxdWFyaXVtIGl0c2VsZiBpcyBtb3VudGVkIGluc2lkZVxuICogdGhlIGNoYXQgYmFyIHBhcnQgc28gdGhlIGNoYXQgaW5wdXQgbmF0dXJhbGx5IHBhaW50cyBvbiB0b3Agb2YgdGhlIHdhdGVyLlxuICovXG5leHBvcnQgY29uc3QgSUFxdWFyaXVtU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQXF1YXJpdW1TZXJ2aWNlPignYXF1YXJpdW1TZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFxdWFyaXVtU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgdGhlIGFxdWFyaXVtIGFjdGlvbiBpcyB2aXNpYmxlIG9uIGl0cyBtb3VudGVkIGhvc3RzLiAqL1xuXHRyZWFkb25seSBhY3Rpb25WaXNpYmxlOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHQvKipcblx0ICogTW91bnQgYSB0b2dnbGUgYnV0dG9uIGludG8gYHBhcmVudGAuIFJldHVybnMgYSBoYW5kbGUgdGhhdCBleHBvc2VzIGFcblx0ICoge0BsaW5rIElNb3VudGVkVG9nZ2xlSGFuZGxlLnNldEhvc3RWaXNpYmxlfSBob29rIHNvIGNhbGxlcnMgY2FuIGtlZXAgdGhlXG5cdCAqIGFxdWFyaXVtIHRpZWQgdG8gdGhlaXIgb3duIHZpc2liaWxpdHkgKGUuZy4gYSB2aWV3IHBhbmUpLiBEaXNwb3NpbmcgdGhlXG5cdCAqIGhhbmRsZSByZW1vdmVzIHRoZSBidXR0b24gYW5kIHRlYXJzIGRvd24gdGhlIGFjdGl2ZSBhcXVhcml1bSBpZiBpdCB3YXNcblx0ICogdGhlIGxhc3QgbW91bnQuXG5cdCAqL1xuXHRtb3VudFRvZ2dsZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSU1vdW50ZWRUb2dnbGVIYW5kbGU7XG5cblx0LyoqIFRvZ2dsZXMgYW5kIHBlcnNpc3RzIHRoZSBhcXVhcml1bSBhY3Rpb24gdmlzaWJpbGl0eS4gKi9cblx0dG9nZ2xlQWN0aW9uVmlzaWJpbGl0eSgpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBEZXZlbG9wbWVudC9kZW1vIGhvb2s6IGZvcmNlIHRoZSBwZXJzaXN0ZWQgZmVlZGluZyBzdHJlYWsgaW50byBhIHNwZWNpZmljXG5cdCAqIHN0YXRlIGFuZCByZWZyZXNoIHRoZSB0b2dnbGUgdG9vbHRpcChzKSBsaXZlLiBXaGVuIGBhbGl2ZWAgaXMgZmFsc2UgdGhlXG5cdCAqIHN0cmVhayBpcyBwYXJrZWQgYXMgYSBkaWVkL3Jldml2YWJsZSBzdHJlYWsgYW5kIHRoZSByZXZpdmFsIHByb21wdCBpc1xuXHQgKiBvZmZlcmVkICh3aGVuIGFuIGFxdWFyaXVtIGlzIGFjdGl2ZSkuIEEgYGNvdW50YCBvZiAwIGNsZWFycyB0aGUgc3RyZWFrLlxuXHQgKi9cblx0c2ltdWxhdGVTdHJlYWsoY291bnQ6IG51bWJlciwgYWxpdmU6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNb3VudGVkVG9nZ2xlSGFuZGxlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHQvKipcblx0ICogSW5mb3JtIHRoZSBzZXJ2aWNlIHdoZXRoZXIgdGhpcyBtb3VudCdzIGhvc3QgaXMgY3VycmVudGx5IHZpc2libGUuIFRoZVxuXHQgKiBhcXVhcml1bSBpcyBvbmx5IGNvbnNpZGVyZWQgYWN0aXZlIHdoZW4gYXQgbGVhc3Qgb25lIG1vdW50IGlzIHZpc2libGU7XG5cdCAqIHdoZW4gdGhlIGxhc3QgdmlzaWJsZSBtb3VudCBnb2VzIGludmlzaWJsZSB0aGUgYXF1YXJpdW0gaXMgZGlzcG9zZWRcblx0ICogc3luY2hyb25vdXNseSAobm8gZmFkZS1vdXQpIHNvIGl0IGNhbm5vdCBmbGFzaCBiZWhpbmQgYSBzaWJsaW5nIHZpZXcuXG5cdCAqIEhvc3RzIHRoYXQgZG9uJ3QgY2FyZSBjYW4gbGVhdmUgdGhpcyBhbG9uZSBcdTIwMTQgbW91bnRzIGRlZmF1bHQgdG8gdmlzaWJsZS5cblx0ICovXG5cdHNldEhvc3RWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSU1vdW50ZWRUb2dnbGUge1xuXHRyZWFkb25seSBidXR0b246IEhUTUxCdXR0b25FbGVtZW50O1xuXHRob3N0VmlzaWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEFxdWFyaXVtU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQXF1YXJpdW1TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW91bnRzID0gbmV3IFNldDxJTW91bnRlZFRvZ2dsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUFjdGl2ZUFxdWFyaXVtPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nRXhpdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RyZWFrOiBGaXNoRmVlZGluZ1N0cmVhaztcblx0cHJpdmF0ZSByZWFkb25seSBodW5nZXJSZWZyZXNoU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25WaXNpYmxlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRydWUpO1xuXHRyZWFkb25seSBhY3Rpb25WaXNpYmxlOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2FjdGlvblZpc2libGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyID0gbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyO1xuXHRcdHRoaXMuYWN0aXZlQ29udGV4dEtleSA9IFNlc3Npb25zQXF1YXJpdW1BY3RpdmVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zdHJlYWsgPSBuZXcgRmlzaEZlZWRpbmdTdHJlYWsoc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX2FjdGlvblZpc2libGUuc2V0KHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihBQ1RJT05fVklTSUJMRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCB0cnVlKSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmh1bmdlclJlZnJlc2hTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUFsbFRvZ2dsZUJ1dHRvbnNWaXN1YWwoISF0aGlzLmFjdGl2ZVJlZi52YWx1ZSk7XG5cdFx0fSwgMCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgQUNUSU9OX1ZJU0lCTEVfU1RPUkFHRV9LRVksIHRoaXMuX3N0b3JlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnNldEFjdGlvblZpc2libGUodGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEFDVElPTl9WSVNJQkxFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIHRydWUpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihTRVNTSU9OU19ERVZFTE9QRVJfSk9ZX0VOQUJMRURfU0VUVElORykpIHtcblx0XHRcdFx0dGhpcy5hcHBseUZlYXR1cmVFbmFibGVkU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRtb3VudFRvZ2dsZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSU1vdW50ZWRUb2dnbGVIYW5kbGUge1xuXHRcdGNvbnN0IGRvYyA9IHBhcmVudC5vd25lckRvY3VtZW50O1xuXHRcdGNvbnN0IGJ1dHRvbiA9IGRvYy5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcblx0XHRidXR0b24uY2xhc3NOYW1lID0gJ2FnZW50cy1hcXVhcml1bS10b2dnbGUnO1xuXHRcdGJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdFx0dGhpcy51cGRhdGVUb2dnbGVCdXR0b25WaXN1YWwoYnV0dG9uLCAhIXRoaXMuYWN0aXZlUmVmLnZhbHVlKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0Ly8gRG9uJ3QgYnViYmxlIGludG8gdGhlIGNoYXQgd2lkZ2V0J3Mgb3duIGNsaWNrIGhhbmRsZXJzLlxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMudG9nZ2xlKCk7XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBzdG9yZS5hZGQoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHRcdGJ1dHRvbixcblx0XHRcdCgpID0+IHRoaXMuZ2V0VG9nZ2xlTGFiZWwoISF0aGlzLmFjdGl2ZVJlZi52YWx1ZSksXG5cdFx0KSk7XG5cblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcblxuXHRcdGNvbnN0IG1vdW50OiBJTW91bnRlZFRvZ2dsZSA9IHsgYnV0dG9uLCBob3N0VmlzaWJsZTogdHJ1ZSB9O1xuXHRcdHRoaXMubW91bnRzLmFkZChtb3VudCk7XG5cdFx0dGhpcy5hcHBseUZlYXR1cmVFbmFibGVkU3RhdGVGb3JCdXR0b24oYnV0dG9uKTtcblx0XHR0aGlzLnJlY29uY2lsZUFjdGl2YXRpb24oKTtcblx0XHR0aGlzLnNjaGVkdWxlSHVuZ2VyUmVmcmVzaCgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldEhvc3RWaXNpYmxlOiAodmlzaWJsZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRpZiAobW91bnQuaG9zdFZpc2libGUgPT09IHZpc2libGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bW91bnQuaG9zdFZpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0XHR0aGlzLnJlY29uY2lsZUFjdGl2YXRpb24oKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0YnV0dG9uLnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLm1vdW50cy5kZWxldGUobW91bnQpO1xuXHRcdFx0XHRpZiAodGhpcy5tb3VudHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuaHVuZ2VyUmVmcmVzaFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlY29uY2lsZUFjdGl2YXRpb24oKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHRvZ2dsZUFjdGlvblZpc2liaWxpdHkoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9ICF0aGlzLl9hY3Rpb25WaXNpYmxlLmdldCgpO1xuXHRcdHRoaXMuc2V0QWN0aW9uVmlzaWJsZSh2aXNpYmxlKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFDVElPTl9WSVNJQkxFX1NUT1JBR0VfS0VZLCB2aXNpYmxlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5zdGF0dXModmlzaWJsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnYXF1YXJpdW0uYWN0aW9uLnNob3duJywgXCJBcXVhcml1bSBhY3Rpb24gc2hvd25cIilcblx0XHRcdDogbG9jYWxpemUoJ2FxdWFyaXVtLmFjdGlvbi5oaWRkZW4nLCBcIkFxdWFyaXVtIGFjdGlvbiBoaWRkZW5cIikpO1xuXHRcdHJldHVybiB2aXNpYmxlO1xuXHR9XG5cblx0c2ltdWxhdGVTdHJlYWsoY291bnQ6IG51bWJlciwgYWxpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnN0cmVhay5zaW11bGF0ZShjb3VudCwgYWxpdmUpO1xuXHRcdHRoaXMudXBkYXRlQWxsVG9nZ2xlQnV0dG9uc1Zpc3VhbCghIXRoaXMuYWN0aXZlUmVmLnZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aW9uVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aW9uVmlzaWJsZS5zZXQodmlzaWJsZSwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IG1vdW50IG9mIHRoaXMubW91bnRzKSB7XG5cdFx0XHR0aGlzLmFwcGx5RmVhdHVyZUVuYWJsZWRTdGF0ZUZvckJ1dHRvbihtb3VudC5idXR0b24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBY3RpdmF0ZSB3aGVuIGF0IGxlYXN0IG9uZSBtb3VudCBpcyBob3N0LXZpc2libGUgYW5kIHRoZSB1c2VyIGhhcyBpdCBvbjtcblx0ICogb3RoZXJ3aXNlIGRlYWN0aXZhdGUgc3luY2hyb25vdXNseSAobm8gZmFkZSkgc28gdGhlIGFxdWFyaXVtIGNhbid0IGZsYXNoXG5cdCAqIGJlaGluZCBhIHNpYmxpbmcgdmlldyBkdXJpbmcgYSB2aWV3IHN3YXAuXG5cdCAqL1xuXHRwcml2YXRlIHJlY29uY2lsZUFjdGl2YXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgYW55SG9zdFZpc2libGUgPSB0aGlzLmhhc1Zpc2libGVNb3VudCgpO1xuXHRcdGlmIChhbnlIb3N0VmlzaWJsZSAmJiB0aGlzLmlzRmVhdHVyZUVuYWJsZWQoKSAmJiB0aGlzLmlzU3RvcmVkRW5hYmxlZCgpICYmICF0aGlzLmFjdGl2ZVJlZi52YWx1ZSkge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZSgvKiBwZXJzaXN0ICovIGZhbHNlKTtcblx0XHR9IGVsc2UgaWYgKCFhbnlIb3N0VmlzaWJsZSkge1xuXHRcdFx0Ly8gSG9zdCBoaWRlOiBkaXNwb3NlIGFueSBhY3RpdmUgYXF1YXJpdW0gc3luY2hyb25vdXNseSBBTkQgY2FuY2VsXG5cdFx0XHQvLyBhbnkgaW4tZmxpZ2h0IGFuaW1hdGVkIGV4aXQgKGZyb20gYSBwcmlvciB1c2VyIHRvZ2dsZS1vZmYpIHNvIGl0XG5cdFx0XHQvLyBjYW4ndCBrZWVwIHBhaW50aW5nIGZpc2ggYmVoaW5kIHdoYXRldmVyIHZpZXcgdG9vayBvdXIgcGxhY2UuXG5cdFx0XHR0aGlzLnBlbmRpbmdFeGl0LmNsZWFyKCk7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVSZWYudmFsdWUpIHtcblx0XHRcdFx0dGhpcy5kZWFjdGl2YXRlKC8qIHBlcnNpc3QgKi8gZmFsc2UsIC8qIGFuaW1hdGUgKi8gZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFzVmlzaWJsZU1vdW50KCk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgbSBvZiB0aGlzLm1vdW50cykge1xuXHRcdFx0aWYgKG0uaG9zdFZpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgaXNGZWF0dXJlRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihTRVNTSU9OU19ERVZFTE9QRVJfSk9ZX0VOQUJMRURfU0VUVElORykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGlzU3RvcmVkRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEVOQUJMRURfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdG9yZWRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEVOQUJMRURfU1RPUkFHRV9LRVksIGVuYWJsZWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlGZWF0dXJlRW5hYmxlZFN0YXRlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbW91bnQgb2YgdGhpcy5tb3VudHMpIHtcblx0XHRcdHRoaXMuYXBwbHlGZWF0dXJlRW5hYmxlZFN0YXRlRm9yQnV0dG9uKG1vdW50LmJ1dHRvbik7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5pc0ZlYXR1cmVFbmFibGVkKCkgJiYgdGhpcy5hY3RpdmVSZWYudmFsdWUpIHtcblx0XHRcdC8vIFNldHRpbmcgdHVybmVkIG9mZiBcdTIwMTQgZG9uJ3QgcGVyc2lzdCBzbyB0aGUgcHJpb3IgcHJlZmVyZW5jZSBzdXJ2aXZlcyBhIHJlLWVuYWJsZS5cblx0XHRcdHRoaXMuZGVhY3RpdmF0ZSgvKiBwZXJzaXN0ICovIGZhbHNlKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNGZWF0dXJlRW5hYmxlZCgpKSB7XG5cdFx0XHR0aGlzLnJlY29uY2lsZUFjdGl2YXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5RmVhdHVyZUVuYWJsZWRTdGF0ZUZvckJ1dHRvbihidXR0b246IEhUTUxCdXR0b25FbGVtZW50KTogdm9pZCB7XG5cdFx0YnV0dG9uLnN0eWxlLmRpc3BsYXkgPSB0aGlzLmlzRmVhdHVyZUVuYWJsZWQoKSAmJiB0aGlzLl9hY3Rpb25WaXNpYmxlLmdldCgpID8gJycgOiAnbm9uZSc7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRvZ2dsZUJ1dHRvblZpc3VhbChidXR0b246IEhUTUxCdXR0b25FbGVtZW50LCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRidXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgYWN0aXZlKTtcblx0XHR0aGlzLnN0cmVhay5jb2xsZWN0RXhwaXJlZCgpO1xuXHRcdGNvbnN0IHN0cmVhayA9IHRoaXMuc3RyZWFrLmNvdW50O1xuXHRcdGNvbnN0IHJldml2YWJsZSA9IHN0cmVhayA+IDAgPyAwIDogdGhpcy5zdHJlYWsucmV2aXZhYmxlQ291bnQ7XG5cdFx0Y29uc3QgaHVuZ2VySWNvbiA9IEZJU0hfSFVOR0VSX0lDT05TW3RoaXMuc3RyZWFrLmh1bmdlclN0YXRlXTtcblx0XHRjb25zdCBpY29uID0gYWN0aXZlID8gQ29kaWNvbi5jbG9zZSA6IGh1bmdlckljb247XG5cblx0XHQvLyBCdWlsZCB0aGUgaWNvbiBhcyBhIHJlYWwgRE9NIGNoaWxkIGluc3RlYWQgb2YgaW5uZXJIVE1MIHRvIHNhdGlzZnkgVHJ1c3RlZCBUeXBlcy5cblx0XHRidXR0b24ucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0Y29uc3QgaWNvblNwYW4gPSBidXR0b24ub3duZXJEb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0Ly8gVGhlIGljb24gaXMgcHVyZWx5IGRlY29yYXRpdmU7IHRoZSBidXR0b24gYWxyZWFkeSBoYXMgYW4gYXJpYS1sYWJlbC5cblx0XHRpY29uU3Bhbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRhZGRJY29uQ2xhc3NlcyhpY29uU3BhbiwgaWNvbik7XG5cdFx0aWYgKCFhY3RpdmUpIHtcblx0XHRcdGJ1dHRvbi5hcHBlbmRDaGlsZChpY29uU3Bhbik7XG5cdFx0fVxuXG5cdFx0Ly8gU3VyZmFjZSB0aGUgZmVlZGluZyBzdHJlYWsgYXMgYSB2aXNpYmxlIGJhZGdlIGJlc2lkZSB0aGUgaWNvbiAobm90IGFcblx0XHQvLyBub3RpZmljYXRpb24pOiBhIGxpdmUgc3RyZWFrIHNob3dzIHRoZSBjb3VudCwgd2hpbGUgYSBkaWVkIHN0cmVha1xuXHRcdC8vIHNob3dzIGEgcXVpZXQgaGludCB0aGF0IGZlZWRpbmcgYSBmaXNoIHdpbGwgcmV2aXZlIGl0LlxuXHRcdGNvbnN0IHNob3dTdHJlYWsgPSBzdHJlYWsgPiAwIHx8IHJldml2YWJsZSA+IDA7XG5cdFx0YnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1zdHJlYWsnLCBzaG93U3RyZWFrKTtcblx0XHRpZiAoc2hvd1N0cmVhaykge1xuXHRcdFx0Y29uc3Qgc3RyZWFrU3BhbiA9IGJ1dHRvbi5vd25lckRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdHN0cmVha1NwYW4uY2xhc3NOYW1lID0gJ2FnZW50cy1hcXVhcml1bS10b2dnbGUtc3RyZWFrJztcblx0XHRcdHN0cmVha1NwYW4uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRcdGNvbnN0IGh1bmdlckljb25TcGFuID0gYnV0dG9uLm93bmVyRG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0XHRhZGRJY29uQ2xhc3NlcyhodW5nZXJJY29uU3BhbiwgaHVuZ2VySWNvbik7XG5cdFx0XHRcdHN0cmVha1NwYW4uYXBwZW5kQ2hpbGQoaHVuZ2VySWNvblNwYW4pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0cmVhayA+IDApIHtcblx0XHRcdFx0c3RyZWFrU3Bhbi5hcHBlbmQoU3RyaW5nKHN0cmVhaykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RyZWFrU3Bhbi5jbGFzc0xpc3QuYWRkKCdyZXZpdmFibGUnKTtcblx0XHRcdFx0c3RyZWFrU3Bhbi5hcHBlbmQobG9jYWxpemUoJ2FxdWFyaXVtLnJldml2ZUJhZGdlJywgXCJ7MH0gXHUwMEI3IEZlZWQgYWdhaW4gdG8gcmV2aXZlXCIsIHJldml2YWJsZSkpO1xuXHRcdFx0fVxuXHRcdFx0YnV0dG9uLmFwcGVuZENoaWxkKHN0cmVha1NwYW4pO1xuXHRcdH1cblx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRidXR0b24uYXBwZW5kQ2hpbGQoaWNvblNwYW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5nZXRUb2dnbGVMYWJlbChhY3RpdmUpO1xuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhhY3RpdmUpKTtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbGFiZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb2dnbGVMYWJlbChhY3RpdmU6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGJhc2UgPSBhY3RpdmUgPyBsb2NhbGl6ZSgnYXF1YXJpdW0uaGlkZScsIFwiSGlkZSBBcXVhcml1bVwiKSA6IGxvY2FsaXplKCdhcXVhcml1bS5zaG93JywgXCJTaG93IEFxdWFyaXVtXCIpO1xuXHRcdGNvbnN0IHN0cmVhayA9IHRoaXMuc3RyZWFrLmNvdW50O1xuXHRcdGlmIChzdHJlYWsgPiAwKSB7XG5cdFx0XHRjb25zdCBodW5nZXJEZXNjcmlwdGlvbiA9IGdldEZpc2hIdW5nZXJEZXNjcmlwdGlvbih0aGlzLnN0cmVhay5odW5nZXJTdGF0ZSk7XG5cdFx0XHRyZXR1cm4gc3RyZWFrID09PSAxXG5cdFx0XHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhcXVhcml1bS5zdHJlYWtMYWJlbC5vbmUnLCBcInswfSBcdTIwMTQgezF9IFx1MjAxNCB7Mn0gZGF5IGZlZWRpbmcgc3RyZWFrXCIsIGJhc2UsIGh1bmdlckRlc2NyaXB0aW9uLCBzdHJlYWspXG5cdFx0XHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhcXVhcml1bS5zdHJlYWtMYWJlbC5vdGhlcicsIFwiezB9IFx1MjAxNCB7MX0gXHUyMDE0IHsyfSBkYXlzIGZlZWRpbmcgc3RyZWFrXCIsIGJhc2UsIGh1bmdlckRlc2NyaXB0aW9uLCBzdHJlYWspO1xuXHRcdH1cblx0XHRjb25zdCByZXZpdmFibGUgPSB0aGlzLnN0cmVhay5yZXZpdmFibGVDb3VudDtcblx0XHRpZiAocmV2aXZhYmxlID4gMCkge1xuXHRcdFx0Ly8gQSBkaWVkIHN0cmVhayB0aGF0IGNvbWVzIGJhY2sgdG8gbGlmZSBieSBmZWVkaW5nIGEgZmlzaCBhZ2Fpbi5cblx0XHRcdHJldHVybiByZXZpdmFibGUgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYXF1YXJpdW0ucmV2aXZlTGFiZWwub25lJywgXCJ7MH0gXHUyMDE0IGZlZWQgYSBmaXNoIHRvIHJldml2ZSB5b3VyIHsxfSBkYXkgc3RyZWFrXCIsIGJhc2UsIHJldml2YWJsZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXF1YXJpdW0ucmV2aXZlTGFiZWwub3RoZXInLCBcInswfSBcdTIwMTQgZmVlZCBhIGZpc2ggdG8gcmV2aXZlIHlvdXIgezF9IGRheSBzdHJlYWtcIiwgYmFzZSwgcmV2aXZhYmxlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZSgpOiB2b2lkIHtcblx0XHRjb25zdCB3aWxsQWN0aXZhdGUgPSAhdGhpcy5hY3RpdmVSZWYudmFsdWU7XG5cdFx0dHlwZSBBcXVhcml1bVRvZ2dsZUV2ZW50ID0ge1xuXHRcdFx0YWN0aXZhdGVkOiBib29sZWFuO1xuXHRcdH07XG5cdFx0dHlwZSBBcXVhcml1bVRvZ2dsZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0YWN0aXZhdGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgdG9nZ2xlIGFjdGl2YXRlZCAodHJ1ZSkgb3IgZGVhY3RpdmF0ZWQgKGZhbHNlKSB0aGUgYXF1YXJpdW0uJyB9O1xuXHRcdFx0b3duZXI6ICdqdXN0c2NoZW4nO1xuXHRcdFx0Y29tbWVudDogJ1RyYWNrcyBob3cgb2Z0ZW4gdXNlcnMgY2xpY2sgdGhlIEFnZW50cyB3aW5kb3cgYXF1YXJpdW0gZWFzdGVyLWVnZyB0b2dnbGUuJztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFxdWFyaXVtVG9nZ2xlRXZlbnQsIEFxdWFyaXVtVG9nZ2xlQ2xhc3NpZmljYXRpb24+KCd2c2NvZGVBZ2VudHMuYXF1YXJpdW0vdG9nZ2xlJywge1xuXHRcdFx0YWN0aXZhdGVkOiB3aWxsQWN0aXZhdGUsXG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuYWN0aXZlUmVmLnZhbHVlKSB7XG5cdFx0XHR0aGlzLmRlYWN0aXZhdGUoLyogcGVyc2lzdCAqLyB0cnVlKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaGFzVmlzaWJsZU1vdW50KCkpIHtcblx0XHRcdHRoaXMuYWN0aXZhdGUoLyogcGVyc2lzdCAqLyB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFsbFRvZ2dsZUJ1dHRvbnNWaXN1YWwoYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBtb3VudCBvZiB0aGlzLm1vdW50cykge1xuXHRcdFx0dGhpcy51cGRhdGVUb2dnbGVCdXR0b25WaXN1YWwobW91bnQuYnV0dG9uLCBhY3RpdmUpO1xuXHRcdH1cblx0XHR0aGlzLnNjaGVkdWxlSHVuZ2VyUmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUh1bmdlclJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy5odW5nZXJSZWZyZXNoU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdGlmICh0aGlzLm1vdW50cy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRlbGF5ID0gdGhpcy5zdHJlYWsubWlsbGlzZWNvbmRzVW50aWxIdW5nZXJTdGF0ZUNoYW5nZTtcblx0XHRpZiAoZGVsYXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5odW5nZXJSZWZyZXNoU2NoZWR1bGVyLnNjaGVkdWxlKGRlbGF5KTtcblx0XHR9XG5cdH1cblxuXHQvKiogQHBhcmFtIHBlcnNpc3QgZmFsc2Ugd2hlbiByZXN0b3JpbmcgcHJldmlvdXNseS1zdG9yZWQgc3RhdGUuICovXG5cdHByaXZhdGUgYWN0aXZhdGUocGVyc2lzdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFjdGl2ZVJlZi52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCBleGl0IHNvIGl0cyBkZWxheWVkIGRpc3Bvc2UgY2FuJ3QgdGVhciBkb3duXG5cdFx0Ly8gdGhlIG5ldyBhcXVhcml1bSdzIHNoYXJlZCBTVkcgZGVmcy5cblx0XHR0aGlzLnBlbmRpbmdFeGl0LmNsZWFyKCk7XG5cdFx0bGV0IGFjdGl2ZTogSUFjdGl2ZUFxdWFyaXVtIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhY3RpdmUgPSBjcmVhdGVBY3RpdmVBcXVhcml1bSh0aGlzLm1haW5Db250YWluZXIsIHRoaXMubGF5b3V0U2VydmljZSwgdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZSwgKCkgPT4gdGhpcy5oYW5kbGVGaXNoRmVkKCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1thcXVhcml1bV0gZmFpbGVkIHRvIGFjdGl2YXRlJywgZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIE5vIGhvc3QgKGUuZy4gY2hhdCBiYXIgaXNuJ3QgdmlzaWJsZSB5ZXQpIFx1MjAxNCBsZWF2ZSB0aGUgdG9nZ2xlXG5cdFx0Ly8gdW50b3VjaGVkIGFuZCBkb24ndCBwZXJzaXN0OyBhIGxhdGVyIHRvZ2dsZSBhdHRlbXB0IHdpbGwgcmV0cnkuXG5cdFx0aWYgKCFhY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5hY3RpdmVSZWYudmFsdWUgPSBhY3RpdmU7XG5cdFx0dGhpcy5hY3RpdmVDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHR0aGlzLnVwZGF0ZUFsbFRvZ2dsZUJ1dHRvbnNWaXN1YWwodHJ1ZSk7XG5cdFx0aWYgKHBlcnNpc3QpIHtcblx0XHRcdHRoaXMuc2V0U3RvcmVkRW5hYmxlZCh0cnVlKTtcblx0XHR9XG5cdFx0Ly8gUGFyayBhIHN0cmVhayB0aGF0IGFnZWQgb3V0IHdoaWxlIHRoZSBhcXVhcml1bSB3YXMgY2xvc2VkIHNvIGl0IHNob3dzXG5cdFx0Ly8gdXAgYXMgYSByZXZpdmFibGUgYmFkZ2Ugb24gdGhlIHRvZ2dsZS5cblx0XHR0aGlzLnN0cmVhay5jb2xsZWN0RXhwaXJlZCgpO1xuXHRcdHRoaXMudXBkYXRlQWxsVG9nZ2xlQnV0dG9uc1Zpc3VhbCh0cnVlKTtcblx0fVxuXG5cdC8qKiBDYWxsZWQgd2hlbmV2ZXIgYSBmaXNoIGVhdHMgYSBwZWxsZXQuICovXG5cdHByaXZhdGUgaGFuZGxlRmlzaEZlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBiZWZvcmUgPSB0aGlzLnN0cmVhay5jb3VudDtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnN0cmVhay5yZWNvcmRGZWVkKCk7XG5cdFx0Ly8gUmVmcmVzaCB0aGUgdG9nZ2xlIHNvIHRoZSBzdHJlYWsgYmFkZ2Ugc3RheXMgaW4gc3luYyAoY291bnQgY2hhbmdlIG9yXG5cdFx0Ly8gYSBkaWVkIHN0cmVhayByZXZpdmVkIGJhY2sgdG8gbGlmZSBieSB0aGlzIGZlZWQpLlxuXHRcdGlmIChyZXN1bHQuY291bnQgIT09IGJlZm9yZSB8fCByZXN1bHQucmV2aXZlZCkge1xuXHRcdFx0dGhpcy51cGRhdGVBbGxUb2dnbGVCdXR0b25zVmlzdWFsKCEhdGhpcy5hY3RpdmVSZWYudmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAcGFyYW0gcGVyc2lzdCBmYWxzZSB3aGVuIHRlYXJpbmcgZG93biBmb3Igbm9uLXVzZXIgcmVhc29ucy5cblx0ICogQHBhcmFtIGFuaW1hdGUgZmFsc2UgdG8gZGlzcG9zZSBzeW5jaHJvbm91c2x5IChubyBmYWRlLW91dCkuIFVzZWQgZm9yXG5cdCAqIGhvc3QtZHJpdmVuIHRlYXJkb3duIHdoZXJlIHJ1bm5pbmcgYSA5MDBtcyBmYWRlIHdvdWxkIGxldCBmaXNoIHN0YXlcblx0ICogdmlzaWJsZSB3aGlsZSB0aGUgbmV4dCB2aWV3IGxheWVycyBvbiB0b3AuXG5cdCAqL1xuXHRwcml2YXRlIGRlYWN0aXZhdGUocGVyc2lzdDogYm9vbGVhbiwgYW5pbWF0ZTogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRpZiAoIWFuaW1hdGUpIHtcblx0XHRcdHRoaXMuYWN0aXZlUmVmLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmFjdGl2ZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMudXBkYXRlQWxsVG9nZ2xlQnV0dG9uc1Zpc3VhbChmYWxzZSk7XG5cdFx0XHRpZiAocGVyc2lzdCkge1xuXHRcdFx0XHR0aGlzLnNldFN0b3JlZEVuYWJsZWQoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBEZXRhY2ggZnJvbSBhY3RpdmVSZWYgV0lUSE9VVCBkaXNwb3NpbmcgKGNsZWFyQW5kTGVhaykgc28gdGhlIGV4aXRcblx0XHQvLyBhbmltYXRpb24gY2FuIHJ1bjsgdGhlIHJldHVybmVkIGhhbmRsZSBmcm9tIGFjdGl2ZS5leGl0KCkgaXMgcGFya2VkXG5cdFx0Ly8gaW4gYHBlbmRpbmdFeGl0YCBhbmQgZGlzcG9zZXMgdGhlIHVuZGVybHlpbmcgc3RvcmUgZWl0aGVyIHdoZW4gdGhlXG5cdFx0Ly8gYW5pbWF0aW9uIGNvbXBsZXRlcywgd2hlbiB0aGUgc2VydmljZSB0ZWFycyBkb3duLCBvciB3aGVuIGEgcmFwaWRcblx0XHQvLyByZS1hY3RpdmF0ZSByZXBsYWNlcyBpdC5cblx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLmFjdGl2ZVJlZi5jbGVhckFuZExlYWsoKTtcblx0XHRpZiAoIWFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFjdGl2ZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZUFsbFRvZ2dsZUJ1dHRvbnNWaXN1YWwoZmFsc2UpO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBhY3RpdmUuZXhpdCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5wZW5kaW5nRXhpdC52YWx1ZSA9PT0gcGVuZGluZykge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdFeGl0LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5wZW5kaW5nRXhpdC52YWx1ZSA9IHBlbmRpbmc7XG5cdFx0aWYgKHBlcnNpc3QpIHtcblx0XHRcdHRoaXMuc2V0U3RvcmVkRW5hYmxlZChmYWxzZSk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJQWN0aXZlQXF1YXJpdW0gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBUcmlnZ2VyIHRoZSBleGl0IGFuaW1hdGlvbiBhbmQgZGlzcG9zZSB3aGVuIGl0IGNvbXBsZXRlcy4gRGlzcG9zaW5nIHRoZVxuXHQgKiByZXR1cm5lZCBoYW5kbGUgYmVmb3JlIHRoZSBhbmltYXRpb24gZmluaXNoZXMgZGlzcG9zZXMgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRleGl0KG9uRGlkQ29tcGxldGU6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgbGl2ZSBhcXVhcml1bTogd2F0ZXIsIGZpc2gsIGZvb2QsIG1vdXNlIGhhbmRsaW5nLCBSQUYgbG9vcC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgdGhlIGNoYXQgYmFyIGlzbid0IGF2YWlsYWJsZSBzbyBjYWxsZXJzIGNhbiBiYWlsXG4gKiB3aXRob3V0IGxlYXZpbmcgdGhlIHRvZ2dsZSBidXR0b24gc3R1Y2sgaW4gYW4gXCJhY3RpdmUgYnV0IGludmlzaWJsZVwiIHN0YXRlLlxuICovXG5mdW5jdGlvbiBjcmVhdGVBY3RpdmVBcXVhcml1bShtYWluQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG9uRmlzaEZlZD86ICgpID0+IHZvaWQpOiBJQWN0aXZlQXF1YXJpdW0gfCB1bmRlZmluZWQge1xuXHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3cobWFpbkNvbnRhaW5lcik7XG5cblx0Ly8gSG9zdCBpbnNpZGUgdGhlIGNoYXQgYmFyIHNvIGNoYXQgaW5wdXQgVUkgbmF0dXJhbGx5IHBhaW50cyBvbiB0b3AgXHUyMDE0XG5cdC8vIG5vIHotaW5kZXggZ3ltbmFzdGljcyByZXF1aXJlZC5cblx0Y29uc3Qgc2Vzc2lvbnNDb250YWluZXIgPSBsYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcih0YXJnZXRXaW5kb3csIFBhcnRzLlNFU1NJT05TX1BBUlQpO1xuXHRpZiAoIXNlc3Npb25zQ29udGFpbmVyIHx8ICFsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TRVNTSU9OU19QQVJULCB0YXJnZXRXaW5kb3cpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBkb2MgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQ7XG5cdGNvbnN0IHdhdGVyID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHR3YXRlci5jbGFzc05hbWUgPSAnYWdlbnRzLWFxdWFyaXVtLXdhdGVyJztcblx0Ly8gRGVjb3JhdGl2ZTogaGlkZSB0aGUgZW50aXJlIHN1YnRyZWUgZnJvbSBhMTF5IHRyZWUuXG5cdHdhdGVyLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHQvLyBGaXJzdCBjaGlsZCBzbyBzdWJzZXF1ZW50IGNoYXQgYmFyIGNvbnRlbnQgcGFpbnRzIG92ZXIgaXQuXG5cdHNlc3Npb25zQ29udGFpbmVyLmluc2VydEJlZm9yZSh3YXRlciwgc2Vzc2lvbnNDb250YWluZXIuZmlyc3RDaGlsZCk7XG5cdC8vIFNlc3Npb25zIEdyaWQgd3JhcHMgdGhlIGNoYXQgY29udGVudCBpbiBgLnNlc3Npb24tdmlld2AgLyBgLnNlc3Npb24tdmlldy1jb250ZW50YFxuXHQvLyB3aXRoIG9wYXF1ZSBiYWNrZ3JvdW5kcyAoc2VlIHNlc3Npb25zUGFydC5jc3MpLiBNYXJrIHRoZSBwYXJ0IHNvIGEgc2NvcGVkXG5cdC8vIENTUyBvdmVycmlkZSBjYW4gY2xlYXIgdGhvc2UgYmFja2dyb3VuZHMgYW5kIGxldCB0aGUgd2F0ZXIgbGF5ZXIgc2hvdyB0aHJvdWdoLlxuXHRzZXNzaW9uc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhcXVhcml1bS1hY3RpdmUnKTtcblx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0d2F0ZXIucmVtb3ZlKCk7XG5cdFx0c2Vzc2lvbnNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYXF1YXJpdW0tYWN0aXZlJyk7XG5cdH0pKTtcblxuXHRjb25zdCBmaXNoTGF5ZXIgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGZpc2hMYXllci5jbGFzc05hbWUgPSAnYWdlbnRzLWFxdWFyaXVtLWZpc2gtbGF5ZXInO1xuXHR3YXRlci5hcHBlbmRDaGlsZChmaXNoTGF5ZXIpO1xuXG5cdGNvbnN0IGZvb2RMYXllciA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0Zm9vZExheWVyLmNsYXNzTmFtZSA9ICdhZ2VudHMtYXF1YXJpdW0tZm9vZC1sYXllcic7XG5cdHdhdGVyLmFwcGVuZENoaWxkKGZvb2RMYXllcik7XG5cblx0Y29uc3QgYm91bmRzID0geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG5cdC8vIENhY2hlZCBzbyB0aGUgcGVyLW1vdXNlbW92ZSBoYW5kbGVyIGRvZXNuJ3QgdHJpZ2dlciBhIGxheW91dCBmbHVzaC5cblx0Y29uc3Qgd2F0ZXJTY3JlZW5PZmZzZXQgPSB7IGxlZnQ6IDAsIHRvcDogMCB9O1xuXHRjb25zdCB1cGRhdGVCb3VuZHMgPSAoKSA9PiB7XG5cdFx0Ym91bmRzLndpZHRoID0gd2F0ZXIuY2xpZW50V2lkdGg7XG5cdFx0Ym91bmRzLmhlaWdodCA9IHdhdGVyLmNsaWVudEhlaWdodDtcblx0XHRjb25zdCByZWN0ID0gd2F0ZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0d2F0ZXJTY3JlZW5PZmZzZXQubGVmdCA9IHJlY3QubGVmdDtcblx0XHR3YXRlclNjcmVlbk9mZnNldC50b3AgPSByZWN0LnRvcDtcblx0fTtcblxuXHRjb25zdCBmaXNoOiBGaXNoW10gPSBbXTtcblxuXHR1cGRhdGVCb3VuZHMoKTtcblx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKCkgPT4ge1xuXHRcdHVwZGF0ZUJvdW5kcygpO1xuXHRcdGZvciAoY29uc3QgZiBvZiBmaXNoKSB7XG5cdFx0XHRmLnBvc2l0aW9uWCA9IE1hdGgubWluKGYucG9zaXRpb25YLCBNYXRoLm1heCgwLCBib3VuZHMud2lkdGggLSBmLnNpemUpKTtcblx0XHRcdGYucG9zaXRpb25ZID0gTWF0aC5taW4oZi5wb3NpdGlvblksIE1hdGgubWF4KDAsIGJvdW5kcy5oZWlnaHQgLSBmLnNpemUpKTtcblx0XHR9XG5cdH0pO1xuXHRyZXNpemVPYnNlcnZlci5vYnNlcnZlKHdhdGVyKTtcblx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IEZJU0hfQ09VTlQ7IGkrKykge1xuXHRcdGNvbnN0IHNpemUgPSByYW5kb21CZXR3ZWVuKEZJU0hfTUlOX1NJWkUsIEZJU0hfTUFYX1NJWkUpO1xuXHRcdGNvbnN0IGFuZ2xlID0gTWF0aC5yYW5kb20oKSAqIE1hdGguUEkgKiAyO1xuXHRcdGNvbnN0IHNwZWVkID0gcmFuZG9tQmV0d2VlbihCQVNFX1NQRUVEICogMC42LCBCQVNFX1NQRUVEICogMS4yKTtcblx0XHRjb25zdCBmID0gbmV3IEZpc2goe1xuXHRcdFx0c3BlY2llczogcGlja1JhbmRvbVNwZWNpZXMoKSxcblx0XHRcdHNpemUsXG5cdFx0XHRwb3NpdGlvblg6IHJhbmRvbUJldHdlZW4oMCwgTWF0aC5tYXgoMSwgYm91bmRzLndpZHRoIC0gc2l6ZSkpLFxuXHRcdFx0cG9zaXRpb25ZOiByYW5kb21CZXR3ZWVuKDAsIE1hdGgubWF4KDEsIGJvdW5kcy5oZWlnaHQgLSBzaXplKSksXG5cdFx0XHR2ZWxvY2l0eVg6IE1hdGguY29zKGFuZ2xlKSAqIHNwZWVkLFxuXHRcdFx0dmVsb2NpdHlZOiBNYXRoLnNpbihhbmdsZSkgKiBzcGVlZCxcblx0XHR9LCB0YXJnZXRXaW5kb3cuZG9jdW1lbnQpO1xuXHRcdGZpc2gucHVzaChmKTtcblx0fVxuXHQvLyBTcGF3biBpbiB0d28gYmF0Y2hlczogZmlyc3QgaGFsZiBzeW5jaHJvbm91cyAoc2luZ2xlIGxheW91dCBwYXNzIHZpYVxuXHQvLyBEb2N1bWVudEZyYWdtZW50KSwgcmVzdCBvbiB0aGUgbmV4dCBmcmFtZSBzbyB0aGUgdG9nZ2xlIGNsaWNrIHN0YXlzIHNuYXBweS5cblx0Y29uc3QgU1lOQ19CQVRDSCA9IE1hdGguY2VpbChGSVNIX0NPVU5UIC8gMik7XG5cdGNvbnN0IGZpcnN0QmF0Y2ggPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWluKFNZTkNfQkFUQ0gsIGZpc2gubGVuZ3RoKTsgaSsrKSB7XG5cdFx0Zmlyc3RCYXRjaC5hcHBlbmRDaGlsZChmaXNoW2ldLmVsZW1lbnQpO1xuXHR9XG5cdGZpc2hMYXllci5hcHBlbmRDaGlsZChmaXJzdEJhdGNoKTtcblx0bGV0IGV4aXRpbmcgPSBmYWxzZTtcblxuXHRpZiAoU1lOQ19CQVRDSCA8IGZpc2gubGVuZ3RoKSB7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgKCkgPT4ge1xuXHRcdFx0aWYgKGV4aXRpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdEJhdGNoID0gdGFyZ2V0V2luZG93LmRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRcdGZvciAobGV0IGkgPSBTWU5DX0JBVENIOyBpIDwgZmlzaC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRyZXN0QmF0Y2guYXBwZW5kQ2hpbGQoZmlzaFtpXS5lbGVtZW50KTtcblx0XHRcdH1cblx0XHRcdGZpc2hMYXllci5hcHBlbmRDaGlsZChyZXN0QmF0Y2gpO1xuXHRcdFx0Ly8gQWRkIGAudmlzaWJsZWAgb24gdGhlIE5FWFQgZnJhbWUgc28gYSBwYWludCBhdCBvcGFjaXR5OjAgaGFwcGVuc1xuXHRcdFx0Ly8gZmlyc3QgXHUyMDE0IGd1YXJhbnRlZXMgdGhlIENTUyB0cmFuc2l0aW9uIGZpcmVzLlxuXHRcdFx0Y29uc3QgZmFkZUluID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csICgpID0+IHtcblx0XHRcdFx0aWYgKGV4aXRpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChsZXQgaSA9IFNZTkNfQkFUQ0g7IGkgPCBmaXNoLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbG9jYWxJbmRleCA9IGkgLSBTWU5DX0JBVENIO1xuXHRcdFx0XHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5taW4obG9jYWxJbmRleCAqIDEyLCA0MDApO1xuXHRcdFx0XHRcdGZpc2hbaV0uZWxlbWVudC5zdHlsZS50cmFuc2l0aW9uRGVsYXkgPSBgJHtkZWxheX1tc2A7XG5cdFx0XHRcdFx0ZmlzaFtpXS5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRzdG9yZS5hZGQoZmFkZUluKTtcblx0XHR9KTtcblx0XHRzdG9yZS5hZGQoZGVmZXJyZWQpO1xuXHR9XG5cdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZiBvZiBmaXNoKSB7XG5cdFx0XHRmLmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0fVxuXHRcdC8vIFRlYXIgZG93biBzaGFyZWQgU1ZHIGRlZnMgc28gd2UgZG9uJ3QgbGVhayBhY3Jvc3MgcmVsb2Fkcy5cblx0XHRkaXNwb3NlU2hhcmVkRmlzaERlZnModGFyZ2V0V2luZG93LmRvY3VtZW50KTtcblx0fSkpO1xuXG5cdGNvbnN0IGZvb2Q6IElGb29kUGVsbGV0W10gPSBbXTtcblx0Y29uc3QgcmVtb3ZlRm9vZCA9IChwZWxsZXQ6IElGb29kUGVsbGV0KSA9PiB7XG5cdFx0Y29uc3QgaWR4ID0gZm9vZC5pbmRleE9mKHBlbGxldCk7XG5cdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdGZvb2Quc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRwZWxsZXQuZWxlbWVudC5yZW1vdmUoKTtcblx0XHR9XG5cdH07XG5cblx0Ly8gTGlzdGVuIG9uIHRoZSBtYWluIGNvbnRhaW5lciBzbyB3ZSBhbHdheXMga25vdyBjdXJzb3IgcG9zaXRpb24gZXZlblxuXHQvLyB3aGVuIG92ZXIgdGhlIGNoYXQgaW5wdXQgKHdhdGVyIGhhcyBwb2ludGVyLWV2ZW50czpub25lKS5cblx0Ly9cblx0Ly8gQ29hbGVzY2UgdXBkYXRlQm91bmRzKCkgYWNyb3NzIHNjcm9sbC9yZXNpemUgc3Rvcm1zOiBzY3JvbGwgd2l0aCBjYXB0dXJlXG5cdC8vIGZpcmVzIGZvciBBTlkgZGVzY2VuZGFudCBzY3JvbGwsIGFuZCB1cGRhdGVCb3VuZHMoKSByZWFkcyBsYXlvdXQuIE1hcmtcblx0Ly8gZGlydHkgaGVyZSBhbmQgbGV0IHRoZSBSQUYgdGljayByZWZyZXNoIGF0IG1vc3Qgb25jZSBwZXIgZnJhbWUuXG5cdGxldCBib3VuZHNEaXJ0eSA9IGZhbHNlO1xuXHRjb25zdCBtYXJrQm91bmRzRGlydHkgPSAoKSA9PiB7IGJvdW5kc0RpcnR5ID0gdHJ1ZTsgfTtcblx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3csIEV2ZW50VHlwZS5SRVNJWkUsIG1hcmtCb3VuZHNEaXJ0eSwgeyBwYXNzaXZlOiB0cnVlIH0pKTtcblx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3csICdzY3JvbGwnLCBtYXJrQm91bmRzRGlydHksIHsgcGFzc2l2ZTogdHJ1ZSwgY2FwdHVyZTogdHJ1ZSB9KSk7XG5cblx0bGV0IG1vdXNlWCA9IC0xZTY7XG5cdGxldCBtb3VzZVkgPSAtMWU2O1xuXHRjb25zdCByZXNldE1vdXNlUG9zaXRpb24gPSAoKSA9PiB7XG5cdFx0bW91c2VYID0gLTFlNjtcblx0XHRtb3VzZVkgPSAtMWU2O1xuXHR9O1xuXHQvLyBHZW5lcmljIGhlbHBlcnMgc28gdGhpcyBhbHNvIHdvcmtzIHVuZGVyIGlPUyBwb2ludGVyIGV2ZW50cy5cblx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VNb3ZlTGlzdGVuZXIobWFpbkNvbnRhaW5lciwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRtb3VzZVggPSBlLmNsaWVudFggLSB3YXRlclNjcmVlbk9mZnNldC5sZWZ0O1xuXHRcdG1vdXNlWSA9IGUuY2xpZW50WSAtIHdhdGVyU2NyZWVuT2Zmc2V0LnRvcDtcblx0fSkpO1xuXHQvLyBCb3RoIG1vdXNlbGVhdmUgQU5EIHBvaW50ZXJsZWF2ZSBzbyByZXNldCB3b3JrcyBvbiB0b3VjaC9wb2ludGVyLW9ubHkgcGxhdGZvcm1zLlxuXHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5Db250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgcmVzZXRNb3VzZVBvc2l0aW9uLCB7IHBhc3NpdmU6IHRydWUgfSkpO1xuXHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5Db250YWluZXIsIEV2ZW50VHlwZS5QT0lOVEVSX0xFQVZFLCByZXNldE1vdXNlUG9zaXRpb24sIHsgcGFzc2l2ZTogdHJ1ZSB9KSk7XG5cblx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIobWFpbkNvbnRhaW5lciwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHQvLyBPbmx5IHNwYXduIGZvb2Qgb24gcGxhaW4gbGVmdCBjbGlja3MgYWdhaW5zdCBiYWNrZ3JvdW5kLWlzaCBzdXJmYWNlcy5cblx0XHRpZiAoZS5idXR0b24gIT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGlmICghaXNCYWNrZ3JvdW5kQ2xpY2sodGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBSZWZyZXNoIG9uY2UgdG8gYmUgc2FmZSAobW91c2Vkb3duIGlzIHJhcmUpLlxuXHRcdHVwZGF0ZUJvdW5kcygpO1xuXHRcdGNvbnN0IGRyb3BYID0gZS5jbGllbnRYIC0gd2F0ZXJTY3JlZW5PZmZzZXQubGVmdDtcblx0XHRjb25zdCBkcm9wWSA9IGUuY2xpZW50WSAtIHdhdGVyU2NyZWVuT2Zmc2V0LnRvcDtcblx0XHRpZiAoZHJvcFggPCAwIHx8IGRyb3BZIDwgMCB8fCBkcm9wWCA+IGJvdW5kcy53aWR0aCB8fCBkcm9wWSA+IGJvdW5kcy5oZWlnaHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c3Bhd25Gb29kKGRyb3BYLCBkcm9wWSk7XG5cdH0pKTtcblxuXHRmdW5jdGlvbiBzcGF3bkZvb2QoZHJvcFg6IG51bWJlciwgZHJvcFk6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIENhcCBjb25jdXJyZW50IGZvb2Q6IGRyb3AgdGhlIG9sZGVzdCBwZWxsZXQgdG8gbWFrZSByb29tLlxuXHRcdHdoaWxlIChmb29kLmxlbmd0aCA+PSBNQVhfRk9PRCkge1xuXHRcdFx0Y29uc3Qgb2xkZXN0ID0gZm9vZFswXTtcblx0XHRcdHJlbW92ZUZvb2Qob2xkZXN0KTtcblx0XHR9XG5cdFx0Y29uc3QgZWwgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWwuY2xhc3NOYW1lID0gJ2FnZW50cy1hcXVhcml1bS1mb29kJztcblx0XHRlbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7ZHJvcFh9cHgsICR7ZHJvcFl9cHgpYDtcblx0XHRmb29kTGF5ZXIuYXBwZW5kQ2hpbGQoZWwpO1xuXHRcdGZvb2QucHVzaCh7IGVsZW1lbnQ6IGVsLCBwb3NpdGlvblg6IGRyb3BYLCBwb3NpdGlvblk6IGRyb3BZLCBmYWxsU3BlZWQ6IHJhbmRvbUJldHdlZW4oMjAsIDM1KSB9KTtcblx0fVxuXG5cdGxldCBsYXN0RnJhbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0bGV0IHJhZkRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0IHN0b3BBbmltYXRpb24gPSAoKSA9PiB7XG5cdFx0cmFmRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHJhZkRpc3Bvc2FibGUgPSB1bmRlZmluZWQ7XG5cdH07XG5cdGNvbnN0IHN0YXJ0QW5pbWF0aW9uID0gKCkgPT4ge1xuXHRcdGlmIChyYWZEaXNwb3NhYmxlIHx8IGFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxhc3RGcmFtZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHRcdHJhZkRpc3Bvc2FibGUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgdGljayk7XG5cdH07XG5cblx0Y29uc3QgdGljayA9ICgpID0+IHtcblx0XHRyYWZEaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHRcdGNvbnN0IGVsYXBzZWRNcyA9IG5vdyAtIGxhc3RGcmFtZTtcblx0XHRpZiAoZWxhcHNlZE1zIDwgQUNUSVZFX0ZSQU1FX0lOVEVSVkFMX01TKSB7XG5cdFx0XHRyYWZEaXNwb3NhYmxlID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csIHRpY2spO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGR0TXMgPSBNYXRoLm1pbihlbGFwc2VkTXMsIDEwMCk7IC8vIGNsYW1wIGJpZyBzdGFsbHNcblx0XHRjb25zdCBkdCA9IGR0TXMgLyAxMDAwO1xuXHRcdGxhc3RGcmFtZSA9IG5vdztcblxuXHRcdGlmIChib3VuZHNEaXJ0eSkge1xuXHRcdFx0Ym91bmRzRGlydHkgPSBmYWxzZTtcblx0XHRcdHVwZGF0ZUJvdW5kcygpO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgd29yayB3aGVuIHdpbmRvdyBpcyBoaWRkZW4gKFJBRiBzdGF5cyBhbGl2ZSBsYXppbHkpLlxuXHRcdGlmICghYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkgJiYgdGFyZ2V0V2luZG93LmRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSAhPT0gJ2hpZGRlbicpIHtcblx0XHRcdHVwZGF0ZUZvb2QoZHQpO1xuXHRcdFx0dXBkYXRlRmlzaChkdCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFhY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0cmFmRGlzcG9zYWJsZSA9IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCB0aWNrKTtcblx0XHR9XG5cdH07XG5cblx0ZnVuY3Rpb24gdXBkYXRlRm9vZChkdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IGZvb2QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHBlbGxldCA9IGZvb2RbaV07XG5cdFx0XHRwZWxsZXQucG9zaXRpb25ZICs9IHBlbGxldC5mYWxsU3BlZWQgKiBkdDtcblx0XHRcdHBlbGxldC5lbGVtZW50LnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtwZWxsZXQucG9zaXRpb25YLnRvRml4ZWQoMSl9cHgsICR7cGVsbGV0LnBvc2l0aW9uWS50b0ZpeGVkKDEpfXB4KWA7XG5cdFx0XHRpZiAocGVsbGV0LnBvc2l0aW9uWSA+IGJvdW5kcy5oZWlnaHQgKyAxMCkge1xuXHRcdFx0XHRyZW1vdmVGb29kKHBlbGxldCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gdXBkYXRlRmlzaChkdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm93ID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0Zm9yIChjb25zdCBmIG9mIGZpc2gpIHtcblx0XHRcdGNvbnN0IGNlbnRlclggPSBmLnBvc2l0aW9uWCArIGYuc2l6ZSAvIDI7XG5cdFx0XHRjb25zdCBjZW50ZXJZID0gZi5wb3NpdGlvblkgKyBmLnNpemUgLyAyO1xuXG5cdFx0XHQvLyBXYWxsIHN0ZWVyaW5nOiB0dXJuIHRoZSBoZWFkaW5nIChub3QganVzdCBhY2NlbGVyYXRpb24pIGF3YXkgZnJvbVxuXHRcdFx0Ly8gd2FsbHMsIG90aGVyd2lzZSBmaXNoIHBhcmsgYWdhaW5zdCB0aGUgZWRnZSB3aXRoIHRoZWlyIHRocnVzdFxuXHRcdFx0Ly8gcGlubmluZyB0aGVtIGluIHBsYWNlLlxuXHRcdFx0Y29uc3Qgd2FsbEVzY2FwZUFuZ2xlID0gY29tcHV0ZVdhbGxBdm9pZEFuZ2xlKGNlbnRlclgsIGNlbnRlclksIGJvdW5kcy53aWR0aCwgYm91bmRzLmhlaWdodCk7XG5cdFx0XHRpZiAod2FsbEVzY2FwZUFuZ2xlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gVHVybiBhdCB1cCB0byA0IHJhZC9zIHRvd2FyZCB0aGUgc2FmZSBkaXJlY3Rpb24uXG5cdFx0XHRcdGNvbnN0IHR1cm5EZWx0YSA9IHNob3J0ZXN0QW5nbGVEZWx0YShmLndhbmRlckFuZ2xlLCB3YWxsRXNjYXBlQW5nbGUpO1xuXHRcdFx0XHRjb25zdCBtYXhUdXJuUGVyRnJhbWUgPSA0ICogZHQ7XG5cdFx0XHRcdGYud2FuZGVyQW5nbGUgKz0gTWF0aC5tYXgoLW1heFR1cm5QZXJGcmFtZSwgTWF0aC5taW4obWF4VHVyblBlckZyYW1lLCB0dXJuRGVsdGEpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEZyZWUgd2F0ZXI6IGRyaWZ0IHRoZSBoZWFkaW5nIGJ5IGEgc21hbGwgcmFuZG9tIGRlbHRhLlxuXHRcdFx0XHRmLndhbmRlckFuZ2xlICs9IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDEuMiAqIGR0ICsgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMC4wNDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGhydXN0ID0gMzI7XG5cdFx0XHRsZXQgYWNjZWxYID0gTWF0aC5jb3MoZi53YW5kZXJBbmdsZSkgKiB0aHJ1c3Q7XG5cdFx0XHRsZXQgYWNjZWxZID0gTWF0aC5zaW4oZi53YW5kZXJBbmdsZSkgKiB0aHJ1c3Q7XG5cblx0XHRcdC8vIFNwb250YW5lb3VzIGRhcnQgd2l0aCBicmllZiBwYW5pYyBzbyBpdCBjYW4gZXhjZWVkIG5vcm1hbCBtYXggc3BlZWQuXG5cdFx0XHRpZiAoTWF0aC5yYW5kb20oKSA8IERBUlRfUkFURV9QRVJfU0VDT05EICogZHQpIHtcblx0XHRcdFx0Y29uc3QgZGFydEFuZ2xlID0gTWF0aC5yYW5kb20oKSAqIE1hdGguUEkgKiAyO1xuXHRcdFx0XHRmLnZlbG9jaXR5WCArPSBNYXRoLmNvcyhkYXJ0QW5nbGUpICogREFSVF9JTVBVTFNFO1xuXHRcdFx0XHRmLnZlbG9jaXR5WSArPSBNYXRoLnNpbihkYXJ0QW5nbGUpICogREFSVF9JTVBVTFNFO1xuXHRcdFx0XHRmLnBhbmljVW50aWwgPSBub3cgKyBQQU5JQ19EVVJBVElPTl9NUztcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2FsbCByZXBlbCBcdTIwMTQgYmFja3N0b3Agc28gYSBmaXNoIGVudGVyaW5nIHRoZSBtYXJnaW4gaXMgcHVzaGVkIGlud2FyZCBpbW1lZGlhdGVseS5cblx0XHRcdGlmIChjZW50ZXJYIDwgV0FMTF9NQVJHSU4pIHtcblx0XHRcdFx0YWNjZWxYICs9IChXQUxMX01BUkdJTiAtIGNlbnRlclgpICogNjtcblx0XHRcdH0gZWxzZSBpZiAoY2VudGVyWCA+IGJvdW5kcy53aWR0aCAtIFdBTExfTUFSR0lOKSB7XG5cdFx0XHRcdGFjY2VsWCAtPSAoY2VudGVyWCAtIChib3VuZHMud2lkdGggLSBXQUxMX01BUkdJTikpICogNjtcblx0XHRcdH1cblx0XHRcdGlmIChjZW50ZXJZIDwgV0FMTF9NQVJHSU4pIHtcblx0XHRcdFx0YWNjZWxZICs9IChXQUxMX01BUkdJTiAtIGNlbnRlclkpICogNjtcblx0XHRcdH0gZWxzZSBpZiAoY2VudGVyWSA+IGJvdW5kcy5oZWlnaHQgLSBXQUxMX01BUkdJTikge1xuXHRcdFx0XHRhY2NlbFkgLT0gKGNlbnRlclkgLSAoYm91bmRzLmhlaWdodCAtIFdBTExfTUFSR0lOKSkgKiA2O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb3VzZSBzY2F0dGVyXG5cdFx0XHRjb25zdCBtb3VzZURlbHRhWCA9IGNlbnRlclggLSBtb3VzZVg7XG5cdFx0XHRjb25zdCBtb3VzZURlbHRhWSA9IGNlbnRlclkgLSBtb3VzZVk7XG5cdFx0XHRjb25zdCBtb3VzZURpc3RTcSA9IG1vdXNlRGVsdGFYICogbW91c2VEZWx0YVggKyBtb3VzZURlbHRhWSAqIG1vdXNlRGVsdGFZO1xuXHRcdFx0aWYgKG1vdXNlRGlzdFNxIDwgU0NBVFRFUl9SQURJVVNfU1EpIHtcblx0XHRcdFx0Y29uc3QgbW91c2VEaXN0ID0gTWF0aC5tYXgoTWF0aC5zcXJ0KG1vdXNlRGlzdFNxKSwgMSk7XG5cdFx0XHRcdGNvbnN0IGZvcmNlID0gKDEgLSBtb3VzZURpc3QgLyBTQ0FUVEVSX1JBRElVUykgKiAxMTAwO1xuXHRcdFx0XHRhY2NlbFggKz0gKG1vdXNlRGVsdGFYIC8gbW91c2VEaXN0KSAqIGZvcmNlO1xuXHRcdFx0XHRhY2NlbFkgKz0gKG1vdXNlRGVsdGFZIC8gbW91c2VEaXN0KSAqIGZvcmNlO1xuXHRcdFx0XHRmLnBhbmljVW50aWwgPSBub3cgKyBQQU5JQ19EVVJBVElPTl9NUztcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VlayBuZWFyZXN0IGZvb2Qgd2l0aGluIEZPT0RfREVURUNUX1JBRElVU1xuXHRcdFx0bGV0IG5lYXJlc3RQZWxsZXQ6IElGb29kUGVsbGV0IHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IG5lYXJlc3REaXN0U3EgPSBGT09EX0RFVEVDVF9SQURJVVNfU1E7XG5cdFx0XHRmb3IgKGNvbnN0IHBlbGxldCBvZiBmb29kKSB7XG5cdFx0XHRcdGNvbnN0IGZvb2REZWx0YVggPSBwZWxsZXQucG9zaXRpb25YIC0gY2VudGVyWDtcblx0XHRcdFx0Y29uc3QgZm9vZERlbHRhWSA9IHBlbGxldC5wb3NpdGlvblkgLSBjZW50ZXJZO1xuXHRcdFx0XHRjb25zdCBkaXN0U3EgPSBmb29kRGVsdGFYICogZm9vZERlbHRhWCArIGZvb2REZWx0YVkgKiBmb29kRGVsdGFZO1xuXHRcdFx0XHRpZiAoZGlzdFNxIDwgbmVhcmVzdERpc3RTcSkge1xuXHRcdFx0XHRcdG5lYXJlc3REaXN0U3EgPSBkaXN0U3E7XG5cdFx0XHRcdFx0bmVhcmVzdFBlbGxldCA9IHBlbGxldDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG5lYXJlc3RQZWxsZXQpIHtcblx0XHRcdFx0Y29uc3QgbmVhcmVzdERpc3QgPSBNYXRoLm1heChNYXRoLnNxcnQobmVhcmVzdERpc3RTcSksIDEpO1xuXHRcdFx0XHRpZiAobmVhcmVzdERpc3QgPCBFQVRfUkFESVVTKSB7XG5cdFx0XHRcdFx0cmVtb3ZlRm9vZChuZWFyZXN0UGVsbGV0KTtcblx0XHRcdFx0XHRmLmdyb3coRklTSF9HUk9XVEhfRkFDVE9SKTtcblx0XHRcdFx0XHRvbkZpc2hGZWQ/LigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFjY2VsWCArPSAobmVhcmVzdFBlbGxldC5wb3NpdGlvblggLSBjZW50ZXJYKSAvIG5lYXJlc3REaXN0ICogMjAwO1xuXHRcdFx0XHRcdGFjY2VsWSArPSAobmVhcmVzdFBlbGxldC5wb3NpdGlvblkgLSBjZW50ZXJZKSAvIG5lYXJlc3REaXN0ICogMjAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGYudmVsb2NpdHlYICs9IGFjY2VsWCAqIGR0O1xuXHRcdFx0Zi52ZWxvY2l0eVkgKz0gYWNjZWxZICogZHQ7XG5cblx0XHRcdGNvbnN0IHNwZWVkU3EgPSBmLnZlbG9jaXR5WCAqIGYudmVsb2NpdHlYICsgZi52ZWxvY2l0eVkgKiBmLnZlbG9jaXR5WTtcblx0XHRcdGNvbnN0IG1heFNwZWVkID0gbm93IDwgZi5wYW5pY1VudGlsID8gUEFOSUNfTUFYX1NQRUVEIDogTUFYX1NQRUVEO1xuXHRcdFx0Y29uc3QgbWF4U3BlZWRTcSA9IG5vdyA8IGYucGFuaWNVbnRpbCA/IFBBTklDX01BWF9TUEVFRF9TUSA6IE1BWF9TUEVFRF9TUTtcblx0XHRcdGlmIChzcGVlZFNxID4gbWF4U3BlZWRTcSkge1xuXHRcdFx0XHRjb25zdCBzcGVlZCA9IE1hdGguc3FydChzcGVlZFNxKTtcblx0XHRcdFx0Zi52ZWxvY2l0eVggPSAoZi52ZWxvY2l0eVggLyBzcGVlZCkgKiBtYXhTcGVlZDtcblx0XHRcdFx0Zi52ZWxvY2l0eVkgPSAoZi52ZWxvY2l0eVkgLyBzcGVlZCkgKiBtYXhTcGVlZDtcblx0XHRcdH1cblxuXHRcdFx0Zi5wb3NpdGlvblggKz0gZi52ZWxvY2l0eVggKiBkdDtcblx0XHRcdGYucG9zaXRpb25ZICs9IGYudmVsb2NpdHlZICogZHQ7XG5cblx0XHRcdC8vIEhhcmQgY2xhbXAgc2FmZXR5IG5ldC5cblx0XHRcdGYucG9zaXRpb25YID0gY2xhbXAoZi5wb3NpdGlvblgsIC1mLnNpemUgKiAwLjI1LCBib3VuZHMud2lkdGggLSBmLnNpemUgKiAwLjc1KTtcblx0XHRcdGYucG9zaXRpb25ZID0gY2xhbXAoZi5wb3NpdGlvblksIC1mLnNpemUgKiAwLjI1LCBib3VuZHMuaGVpZ2h0IC0gZi5zaXplICogMC43NSk7XG5cblx0XHRcdGYuYXBwbHlUcmFuc2Zvcm0oZHQpO1xuXHRcdH1cblx0fVxuXG5cdHN0b3JlLmFkZChhY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVJlZHVjZWRNb3Rpb24oKCkgPT4ge1xuXHRcdGlmIChhY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0c3RvcEFuaW1hdGlvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydEFuaW1hdGlvbigpO1xuXHRcdH1cblx0fSkpO1xuXHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHN0b3BBbmltYXRpb24oKSkpO1xuXHRzdGFydEFuaW1hdGlvbigpO1xuXG5cdC8vIEZpcnN0LWJhdGNoIGZhZGUtaW4gKHRoZSBkZWZlcnJlZCBiYXRjaCBmYWRlcyBpbiB3aGVuIGl0IG1vdW50cykuXG5cdGNvbnN0IGZhZGVJbiA9IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCAoKSA9PiB7XG5cdFx0aWYgKGV4aXRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2F0ZXIuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oU1lOQ19CQVRDSCwgZmlzaC5sZW5ndGgpOyBpKyspIHtcblx0XHRcdGNvbnN0IGYgPSBmaXNoW2ldO1xuXHRcdFx0Ly8gU2xpZ2h0IHN0YWdnZXIsIGNhcHBlZCBhdCB+NDAwbXMgc28gaXQgZG9lc24ndCBkcmFnIG9uLlxuXHRcdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1pbihpICogMTIsIDQwMCk7XG5cdFx0XHRmLmVsZW1lbnQuc3R5bGUudHJhbnNpdGlvbkRlbGF5ID0gYCR7ZGVsYXl9bXNgO1xuXHRcdFx0Zi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHR9XG5cdH0pO1xuXHRzdG9yZS5hZGQoZmFkZUluKTtcblxuXHRjb25zdCByZXN1bHQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFjdGl2ZUFxdWFyaXVtIHtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JlKTtcblx0XHR9XG5cblx0XHRleGl0KG9uRGlkQ29tcGxldGU6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0XHRpZiAoZXhpdGluZykge1xuXHRcdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuZGlzcG9zZSgpKTtcblx0XHRcdH1cblx0XHRcdGV4aXRpbmcgPSB0cnVlO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZpc2gubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZiA9IGZpc2hbaV07XG5cdFx0XHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oaSAqIDEyLCA0MDApO1xuXHRcdFx0XHRmLmVsZW1lbnQuc3R5bGUudHJhbnNpdGlvbkRlbGF5ID0gYCR7ZGVsYXl9bXNgO1xuXHRcdFx0XHRmLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXHRcdFx0fVxuXHRcdFx0d2F0ZXIuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXG5cdFx0XHRsZXQgdGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdFx0b25EaWRDb21wbGV0ZSgpO1xuXHRcdFx0fSwgRVhJVF9EVVJBVElPTl9NUyk7XG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0aWYgKHRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHRcdHRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9O1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKiBUcnVlIGZvciBjbGlja3Mgbm90IG9uIGEgY29udHJvbCBcdTIwMTQgaS5lLiBzYWZlIHRhcmdldHMgZm9yIHNwYXduaW5nIGZvb2QuICovXG5mdW5jdGlvbiBpc0JhY2tncm91bmRDbGljayh0YXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRpZiAoIXRhcmdldCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAodGFyZ2V0LmNsb3Nlc3QoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBidXR0b24sIGEsIFtyb2xlPVwiYnV0dG9uXCJdLCBbcm9sZT1cImxpbmtcIl0sIFtyb2xlPVwidGV4dGJveFwiXSwgW3JvbGU9XCJjb21ib2JveFwiXSwgW3JvbGU9XCJtZW51aXRlbVwiXSwgW3JvbGU9XCJ0YWJcIl0sIC5tb25hY28tZWRpdG9yLCAuc2Nyb2xsLWRlY29yYXRpb24sIC5tb25hY28tbGlzdC1yb3cnKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gcmFuZG9tQmV0d2VlbihtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gbWluICsgTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pO1xufVxuXG5mdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAobWF4IDwgbWluKSB7XG5cdFx0cmV0dXJuIG1pbjtcblx0fVxuXHRyZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodmFsdWUsIG1pbiksIG1heCk7XG59XG5cbmZ1bmN0aW9uIGFkZEljb25DbGFzc2VzKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpY29uOiBUaGVtZUljb24pOiB2b2lkIHtcblx0Y29uc3QgaWNvbkNsYXNzZXMgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbikuc3BsaXQoL1xccysvKS5maWx0ZXIoQm9vbGVhbik7XG5cdGZvciAoY29uc3QgY2xzIG9mIGljb25DbGFzc2VzKSB7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKGNscyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RmlzaEh1bmdlckRlc2NyaXB0aW9uKHN0YXRlOiBGaXNoSHVuZ2VyU3RhdGUpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSAnaGFwcHknOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhcXVhcml1bS5odW5nZXIuaGFwcHknLCBcImZpc2ggaXMgaGFwcHlcIik7XG5cdFx0Y2FzZSAnbmV1dHJhbCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FxdWFyaXVtLmh1bmdlci5uZXV0cmFsJywgXCJmaXNoIGlzIGdldHRpbmcgaHVuZ3J5XCIpO1xuXHRcdGNhc2UgJ3NhZCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FxdWFyaXVtLmh1bmdlci5zYWQnLCBcImZpc2ggaXMgaHVuZ3J5XCIpO1xuXHRcdGNhc2UgJ3ZlcnlTYWQnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhcXVhcml1bS5odW5nZXIudmVyeVNhZCcsIFwiZmlzaCBpcyBzdGFydmluZ1wiKTtcblx0fVxufVxuXG4vKipcbiAqIElmIHRoZSBmaXNoIGlzIGluc2lkZSB0aGUgd2FsbCBtYXJnaW4sIHJldHVybiB0aGUgaGVhZGluZyAocmFkaWFucykgcG9pbnRpbmdcbiAqIGJhY2sgaW50byBvcGVuIHdhdGVyLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIGZpc2ggaXMgY29tZm9ydGFibHkgYXdheVxuICogZnJvbSBhbGwgd2FsbHMuIERpcmVjdGlvbiBzdW1zIHBlci13YWxsIHZlY3RvcnMgd2VpZ2h0ZWQgYnkgZW5jcm9hY2htZW50LFxuICogd2l0aCBhIHNtYWxsIHRhbmdlbnRpYWwgcGVydHVyYmF0aW9uIHNvIG5laWdoYm9ycyBkb24ndCBhbGwgY29udmVyZ2UgdG8gdGhlXG4gKiBzYW1lIGhlYWRpbmcuXG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVXYWxsQXZvaWRBbmdsZShjZW50ZXJYOiBudW1iZXIsIGNlbnRlclk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRsZXQgZXNjYXBlWCA9IDA7XG5cdGxldCBlc2NhcGVZID0gMDtcblx0aWYgKGNlbnRlclggPCBXQUxMX01BUkdJTikge1xuXHRcdGVzY2FwZVggKz0gKFdBTExfTUFSR0lOIC0gY2VudGVyWCkgLyBXQUxMX01BUkdJTjtcblx0fSBlbHNlIGlmIChjZW50ZXJYID4gd2lkdGggLSBXQUxMX01BUkdJTikge1xuXHRcdGVzY2FwZVggLT0gKGNlbnRlclggLSAod2lkdGggLSBXQUxMX01BUkdJTikpIC8gV0FMTF9NQVJHSU47XG5cdH1cblx0aWYgKGNlbnRlclkgPCBXQUxMX01BUkdJTikge1xuXHRcdGVzY2FwZVkgKz0gKFdBTExfTUFSR0lOIC0gY2VudGVyWSkgLyBXQUxMX01BUkdJTjtcblx0fSBlbHNlIGlmIChjZW50ZXJZID4gaGVpZ2h0IC0gV0FMTF9NQVJHSU4pIHtcblx0XHRlc2NhcGVZIC09IChjZW50ZXJZIC0gKGhlaWdodCAtIFdBTExfTUFSR0lOKSkgLyBXQUxMX01BUkdJTjtcblx0fVxuXHRpZiAoZXNjYXBlWCA9PT0gMCAmJiBlc2NhcGVZID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gTWF0aC5hdGFuMihlc2NhcGVZLCBlc2NhcGVYKSArIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDAuNDtcbn1cblxuLyoqIFNtYWxsZXN0IHNpZ25lZCBhbmd1bGFyIGRlbHRhIGZyb20gYGZyb21gIHRvIGB0b2AsIGluIFstUEksIFBJXS4gKi9cbmZ1bmN0aW9uIHNob3J0ZXN0QW5nbGVEZWx0YShmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiBudW1iZXIge1xuXHRsZXQgZGVsdGEgPSAodG8gLSBmcm9tKSAlIChNYXRoLlBJICogMik7XG5cdGlmIChkZWx0YSA+IE1hdGguUEkpIHtcblx0XHRkZWx0YSAtPSBNYXRoLlBJICogMjtcblx0fSBlbHNlIGlmIChkZWx0YSA8IC1NYXRoLlBJKSB7XG5cdFx0ZGVsdGEgKz0gTWF0aC5QSSAqIDI7XG5cdH1cblx0cmV0dXJuIGRlbHRhO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVDQUF1Qyx1Q0FBdUMsdUJBQXVCLFdBQVcsV0FBVyxvQ0FBb0M7QUFDeEssU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFzQix1QkFBdUI7QUFDN0MsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJB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
