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
import { timeout } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { OnboardingDismissReason, OnboardingOutcome } from "../../common/onboardingScenario.js";
import { findOnboardingTarget, openOnboardingTarget } from "./onboardingTarget.js";
import { SpotlightOverlay } from "./spotlightOverlay.js";
import { SPOTLIGHT_PRESENTATION_KIND } from "./spotlightTypes.js";
const TARGET_RESOLVE_TIMEOUT = 2e3;
const TARGET_POLL_INTERVAL = 50;
const TARGET_ANIMATION_SETTLE_TIMEOUT = 600;
let SpotlightPresentation = class extends Disposable {
  constructor(layoutService, hostService, contextKeyService) {
    super();
    this.layoutService = layoutService;
    this.hostService = hostService;
    this.contextKeyService = contextKeyService;
    this.kind = SPOTLIGHT_PRESENTATION_KIND;
  }
  async run(scenario, context) {
    const payload = scenario.presentation.payload;
    const steps = payload?.steps ?? [];
    const stepCount = steps.length;
    if (stepCount === 0) {
      return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
    }
    let lastStepIndex = 0;
    let shown = false;
    const skippedStepIndexes = /* @__PURE__ */ new Set();
    const store = new DisposableStore();
    try {
      const container = this.layoutService.getContainer(context.targetWindow);
      const overlay = store.add(new SpotlightOverlay(container));
      this.hostService.setWindowDimmed(context.targetWindow, true);
      store.add(toDisposable(() => this.hostService.setWindowDimmed(context.targetWindow, false)));
      let aborted = false;
      const targetResolutionCancellation = store.add(new CancellationTokenSource());
      store.add(context.onAbort(() => {
        aborted = true;
        targetResolutionCancellation.cancel();
      }));
      store.add(this.layoutService.onDidLayoutContainer(() => overlay.scheduleLayout()));
      let index = 0;
      let direction = 1;
      while (index >= 0 && index < stepCount && !aborted) {
        const step = steps[index];
        if (step.when && !this.contextKeyService.contextMatchesRules(step.when)) {
          skippedStepIndexes.add(index);
          index += direction;
          continue;
        }
        try {
          await step.onBeforeShow?.();
        } catch (error) {
          onUnexpectedError(error);
        }
        if (aborted) {
          break;
        }
        const target = await this._resolveTarget(context.targetWindow, step.targetId, targetResolutionCancellation.token, step.missingTarget);
        if (aborted) {
          break;
        }
        if (!target) {
          skippedStepIndexes.add(index);
          index += direction;
          continue;
        }
        skippedStepIndexes.delete(index);
        await this._waitForTargetReady(context.targetWindow, target);
        if (aborted) {
          break;
        }
        lastStepIndex = Math.max(lastStepIndex, index);
        shown = true;
        const skippedBefore = Array.from(skippedStepIndexes).filter((skippedIndex) => skippedIndex < index).length;
        const displayStepIndex = index - skippedBefore;
        const displayStepCount = stepCount - skippedStepIndexes.size;
        const end = await this._runStep(overlay, context, step, target, displayStepIndex, displayStepCount);
        overlay.hide();
        switch (end.action) {
          case "next":
            if (index === stepCount - 1) {
              const dismissReason = end.via === "target" ? OnboardingDismissReason.TargetClick : OnboardingDismissReason.Completed;
              return { outcome: OnboardingOutcome.Completed, shown, dismissReason, lastStepIndex, stepCount };
            }
            direction = 1;
            index++;
            break;
          case "back":
            direction = -1;
            index--;
            break;
          case "skip":
            return { outcome: OnboardingOutcome.Skipped, shown, dismissReason: end.reason, lastStepIndex, stepCount };
          case "abort":
            return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount };
        }
      }
      return aborted ? { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount } : { outcome: OnboardingOutcome.Completed, shown, dismissReason: OnboardingDismissReason.Completed, lastStepIndex, stepCount };
    } finally {
      store.dispose();
    }
  }
  async _resolveTarget(targetWindow, targetId, cancellationToken, behavior) {
    if (cancellationToken.isCancellationRequested) {
      return void 0;
    }
    let element = findOnboardingTarget(targetWindow, targetId);
    if (element || behavior?.kind === "skip") {
      return element;
    }
    const timeoutMs = behavior?.kind === "wait" ? Math.max(0, behavior.timeoutMs) : TARGET_RESOLVE_TIMEOUT;
    const deadline = Date.now() + timeoutMs;
    while (!element && Date.now() < deadline && !cancellationToken.isCancellationRequested) {
      try {
        await timeout(TARGET_POLL_INTERVAL, cancellationToken);
      } catch (error) {
        if (cancellationToken.isCancellationRequested) {
          return void 0;
        }
        throw error;
      }
      element = findOnboardingTarget(targetWindow, targetId);
    }
    return element;
  }
  async _waitForTargetReady(targetWindow, target) {
    const animations = this._getActiveFiniteAnimations(target);
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((animation) => animation.finished.catch(() => void 0))),
        timeout(TARGET_ANIMATION_SETTLE_TIMEOUT)
      ]);
    }
    await new Promise((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
  }
  _getActiveFiniteAnimations(target) {
    const animations = [];
    for (let element = target; element; element = element.parentElement) {
      for (const animation of element.getAnimations()) {
        if (animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity) {
          animations.push(animation);
        }
      }
    }
    return animations;
  }
  async _runStep(overlay, context, step, target, index, stepCount) {
    const stepStore = new DisposableStore();
    let ended = false;
    let resolveStep;
    const result = new Promise((resolve) => resolveStep = resolve);
    const done = (end) => {
      if (ended) {
        return;
      }
      ended = true;
      stepStore.dispose();
      resolveStep(end);
    };
    stepStore.add(overlay.onDidClickNext((via) => done({ action: "next", via })));
    stepStore.add(overlay.onDidClickPrevious(() => done({ action: "back" })));
    stepStore.add(overlay.onDidSkip((reason) => done({ action: "skip", reason })));
    stepStore.add(context.onAbort(() => done({ action: "abort" })));
    const content = {
      title: step.title,
      description: step.description,
      stepIndex: index,
      stepCount,
      canGoBack: index > 0,
      isLastStep: index === stepCount - 1
    };
    overlay.show(target, content, {
      placement: step.placement,
      allowTargetInteraction: step.allowTargetInteraction,
      advanceOnTargetClick: step.advanceOnTargetClick,
      hideNext: !!step.advanceWhen,
      targetOverlayVisible: step.openTarget,
      padding: step.padding
    });
    if (step.advanceWhen) {
      const keys = new Set(step.advanceWhen.keys());
      const advanceIfSatisfied = () => {
        if (this.contextKeyService.contextMatchesRules(step.advanceWhen)) {
          done({ action: "next", via: "condition" });
        }
      };
      stepStore.add(this.contextKeyService.onDidChangeContext((event) => {
        if (event.affectsSome(keys)) {
          advanceIfSatisfied();
        }
      }));
      advanceIfSatisfied();
    }
    if (step.openTarget && !ended) {
      try {
        await openOnboardingTarget(target);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
    return result;
  }
};
SpotlightPresentation = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IHostService),
  __decorateParam(2, IContextKeyService)
], SpotlightPresentation);
export {
  SpotlightPresentation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL29uYm9hcmRpbmcvYnJvd3Nlci9zcG90bGlnaHQvc3BvdGxpZ2h0UHJlc2VudGF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiwgSU9uYm9hcmRpbmdSdW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdQcmVzZW50YXRpb24uanMnO1xuaW1wb3J0IHsgSU9uYm9hcmRpbmdSdW5SZXN1bHQsIElPbmJvYXJkaW5nU2NlbmFyaW8sIE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLCBPbmJvYXJkaW5nT3V0Y29tZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vbmJvYXJkaW5nU2NlbmFyaW8uanMnO1xuaW1wb3J0IHsgZmluZE9uYm9hcmRpbmdUYXJnZXQsIG9wZW5PbmJvYXJkaW5nVGFyZ2V0IH0gZnJvbSAnLi9vbmJvYXJkaW5nVGFyZ2V0LmpzJztcbmltcG9ydCB7IElTcG90bGlnaHRDb250ZW50LCBTcG90bGlnaHRPdmVybGF5IH0gZnJvbSAnLi9zcG90bGlnaHRPdmVybGF5LmpzJztcbmltcG9ydCB7IElTcG90bGlnaHRQYXlsb2FkLCBJU3BvdGxpZ2h0U3RlcCwgU3BvdGxpZ2h0TWlzc2luZ1RhcmdldEJlaGF2aW9yLCBTUE9UTElHSFRfUFJFU0VOVEFUSU9OX0tJTkQgfSBmcm9tICcuL3Nwb3RsaWdodFR5cGVzLmpzJztcblxuLyoqIEhvdyBsb25nIHRvIHdhaXQgZm9yIGEgc3RlcCdzIHRhcmdldCBlbGVtZW50IHRvIGFwcGVhciBiZWZvcmUgc2tpcHBpbmcgaXQuICovXG5jb25zdCBUQVJHRVRfUkVTT0xWRV9USU1FT1VUID0gMjAwMDtcbmNvbnN0IFRBUkdFVF9QT0xMX0lOVEVSVkFMID0gNTA7XG5jb25zdCBUQVJHRVRfQU5JTUFUSU9OX1NFVFRMRV9USU1FT1VUID0gNjAwO1xuXG4vKiogVGhlIHRlcm1pbmFsIGFjdGlvbiBvZiBhIHNpbmdsZSBzdGVwLCBjYXJyeWluZyB0aGUgZGF0YSBuZWVkZWQgZm9yIHRlbGVtZXRyeS4gKi9cbnR5cGUgU3RlcEVuZCA9XG5cdHwgeyByZWFkb25seSBhY3Rpb246ICduZXh0JzsgcmVhZG9ubHkgdmlhOiAnYnV0dG9uJyB8ICd0YXJnZXQnIHwgJ2NvbmRpdGlvbicgfVxuXHR8IHsgcmVhZG9ubHkgYWN0aW9uOiAnYmFjaycgfVxuXHR8IHsgcmVhZG9ubHkgYWN0aW9uOiAnc2tpcCc7IHJlYWRvbmx5IHJlYXNvbjogT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uU2tpcEJ1dHRvbiB8IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkVzY2FwZUtleSB9XG5cdHwgeyByZWFkb25seSBhY3Rpb246ICdhYm9ydCcgfTtcblxuLyoqXG4gKiBSZW5kZXJzIHtAbGluayBJU3BvdGxpZ2h0UGF5bG9hZH0gc2NlbmFyaW9zOiBpdCBkaW1zIHRoZSB3aW5kb3cgKGluY2x1ZGluZyB0aGVcbiAqIG5hdGl2ZSB3aW5kb3cgY29udHJvbHMpLCB3YWxrcyB0aGUgc3RlcHMsIGFuZCBzaG93cyBhbiBhbmNob3JlZCBjYWxsb3V0IGZvclxuICogZWFjaC4gSW1wbGVtZW50cyB0aGUgZW5naW5lJ3Mge0BsaW5rIElPbmJvYXJkaW5nUHJlc2VudGF0aW9ufSBjb250cmFjdCBzbyB0aGVcbiAqIHNjZW5hcmlvIGVuZ2luZSBjYW4gZHJpdmUgaXQgd2l0aG91dCBrbm93aW5nIGFueXRoaW5nIGFib3V0IHNwb3RsaWdodHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBTcG90bGlnaHRQcmVzZW50YXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU9uYm9hcmRpbmdQcmVzZW50YXRpb24ge1xuXG5cdHJlYWRvbmx5IGtpbmQgPSBTUE9UTElHSFRfUFJFU0VOVEFUSU9OX0tJTkQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBydW4oc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW8sIGNvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHRjb25zdCBwYXlsb2FkID0gc2NlbmFyaW8ucHJlc2VudGF0aW9uLnBheWxvYWQgYXMgSVNwb3RsaWdodFBheWxvYWQ7XG5cdFx0Y29uc3Qgc3RlcHMgPSBwYXlsb2FkPy5zdGVwcyA/PyBbXTtcblx0XHRjb25zdCBzdGVwQ291bnQgPSBzdGVwcy5sZW5ndGg7XG5cdFx0aWYgKHN0ZXBDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLCBzaG93bjogZmFsc2UsIGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkNvbXBsZXRlZCwgbGFzdFN0ZXBJbmRleDogMCwgc3RlcENvdW50OiAwIH07XG5cdFx0fVxuXG5cdFx0Ly8gRnVydGhlc3Qgc3RlcCB0aGUgdXNlciBhY3R1YWxseSBzYXcgKDAtYmFzZWQpLiBTdGF5cyBhdCB0aGUgbGFzdCBzaG93blxuXHRcdC8vIHN0ZXAgcmVnYXJkbGVzcyBvZiBob3cgdGhlIHJ1biBlbmRzLCBmb3IgdGVsZW1ldHJ5LlxuXHRcdGxldCBsYXN0U3RlcEluZGV4ID0gMDtcblx0XHQvLyBXaGV0aGVyIGF0IGxlYXN0IG9uZSBzdGVwIHdhcyBhY3R1YWxseSByZW5kZXJlZC4gU3RheXMgYGZhbHNlYCBpZiBldmVyeSBzdGVwIGlzXG5cdFx0Ly8gc2tpcHBlZCAobWlzc2luZyB0YXJnZXQgLyB1bnNhdGlzZmllZCBgd2hlbmApIHNvIG5vdGhpbmcgd2FzIGV2ZXIgZGlzcGxheWVkLlxuXHRcdGxldCBzaG93biA9IGZhbHNlO1xuXHRcdGNvbnN0IHNraXBwZWRTdGVwSW5kZXhlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoY29udGV4dC50YXJnZXRXaW5kb3cpO1xuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IHN0b3JlLmFkZChuZXcgU3BvdGxpZ2h0T3ZlcmxheShjb250YWluZXIpKTtcblxuXHRcdFx0Ly8gRGltIHRoZSBuYXRpdmUgd2luZG93IGNvbnRyb2xzIG92ZXJsYXkgaW4gc3luYyB3aXRoIHRoZSBkaW0gbGF5ZXIuXG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLnNldFdpbmRvd0RpbW1lZChjb250ZXh0LnRhcmdldFdpbmRvdywgdHJ1ZSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuaG9zdFNlcnZpY2Uuc2V0V2luZG93RGltbWVkKGNvbnRleHQudGFyZ2V0V2luZG93LCBmYWxzZSkpKTtcblxuXHRcdFx0bGV0IGFib3J0ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRhcmdldFJlc29sdXRpb25DYW5jZWxsYXRpb24gPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdFx0c3RvcmUuYWRkKGNvbnRleHQub25BYm9ydCgoKSA9PiB7XG5cdFx0XHRcdGFib3J0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0YXJnZXRSZXNvbHV0aW9uQ2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBLZWVwIHRoZSBjYWxsb3V0IGdsdWVkIHRvIHRoZSB0YXJnZXQgYXMgdGhlIHdvcmtiZW5jaCByZS1sYXlvdXRzLlxuXHRcdFx0Ly8gU2NoZWR1bGUgdGhlIG1lYXN1cmVtZW50IHNvIGl0IHJ1bnMgYWZ0ZXIgdGhlIGxheW91dCBldmVudCdzIERPTSB3b3JrXG5cdFx0XHQvLyBoYXMgc2V0dGxlZCwgaW5jbHVkaW5nIHBvc2l0aW9uLW9ubHkgc2hpZnRzIHRoYXQgUmVzaXplT2JzZXJ2ZXIgbWlzc2VzLlxuXHRcdFx0c3RvcmUuYWRkKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZExheW91dENvbnRhaW5lcigoKSA9PiBvdmVybGF5LnNjaGVkdWxlTGF5b3V0KCkpKTtcblxuXHRcdFx0bGV0IGluZGV4ID0gMDtcblx0XHRcdGxldCBkaXJlY3Rpb246IDEgfCAtMSA9IDE7XG5cblx0XHRcdHdoaWxlIChpbmRleCA+PSAwICYmIGluZGV4IDwgc3RlcENvdW50ICYmICFhYm9ydGVkKSB7XG5cdFx0XHRcdGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG5cblx0XHRcdFx0aWYgKHN0ZXAud2hlbiAmJiAhdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAud2hlbikpIHtcblx0XHRcdFx0XHRza2lwcGVkU3RlcEluZGV4ZXMuYWRkKGluZGV4KTtcblx0XHRcdFx0XHRpbmRleCArPSBkaXJlY3Rpb247XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHN0ZXAub25CZWZvcmVTaG93Py4oKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFib3J0ZWQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVUYXJnZXQoY29udGV4dC50YXJnZXRXaW5kb3csIHN0ZXAudGFyZ2V0SWQsIHRhcmdldFJlc29sdXRpb25DYW5jZWxsYXRpb24udG9rZW4sIHN0ZXAubWlzc2luZ1RhcmdldCk7XG5cdFx0XHRcdGlmIChhYm9ydGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdFx0XHRza2lwcGVkU3RlcEluZGV4ZXMuYWRkKGluZGV4KTtcblx0XHRcdFx0XHRpbmRleCArPSBkaXJlY3Rpb247XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2tpcHBlZFN0ZXBJbmRleGVzLmRlbGV0ZShpbmRleCk7XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5fd2FpdEZvclRhcmdldFJlYWR5KGNvbnRleHQudGFyZ2V0V2luZG93LCB0YXJnZXQpO1xuXHRcdFx0XHRpZiAoYWJvcnRlZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGFzdFN0ZXBJbmRleCA9IE1hdGgubWF4KGxhc3RTdGVwSW5kZXgsIGluZGV4KTtcblx0XHRcdFx0c2hvd24gPSB0cnVlO1xuXG5cdFx0XHRcdGNvbnN0IHNraXBwZWRCZWZvcmUgPSBBcnJheS5mcm9tKHNraXBwZWRTdGVwSW5kZXhlcykuZmlsdGVyKHNraXBwZWRJbmRleCA9PiBza2lwcGVkSW5kZXggPCBpbmRleCkubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBkaXNwbGF5U3RlcEluZGV4ID0gaW5kZXggLSBza2lwcGVkQmVmb3JlO1xuXHRcdFx0XHRjb25zdCBkaXNwbGF5U3RlcENvdW50ID0gc3RlcENvdW50IC0gc2tpcHBlZFN0ZXBJbmRleGVzLnNpemU7XG5cdFx0XHRcdGNvbnN0IGVuZCA9IGF3YWl0IHRoaXMuX3J1blN0ZXAob3ZlcmxheSwgY29udGV4dCwgc3RlcCwgdGFyZ2V0LCBkaXNwbGF5U3RlcEluZGV4LCBkaXNwbGF5U3RlcENvdW50KTtcblx0XHRcdFx0b3ZlcmxheS5oaWRlKCk7XG5cdFx0XHRcdHN3aXRjaCAoZW5kLmFjdGlvbikge1xuXHRcdFx0XHRcdGNhc2UgJ25leHQnOlxuXHRcdFx0XHRcdFx0aWYgKGluZGV4ID09PSBzdGVwQ291bnQgLSAxKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEFkdmFuY2luZyBwYXN0IHRoZSBmaW5hbCBzdGVwIGNvbXBsZXRlcyB0aGUgdG91ci5cblx0XHRcdFx0XHRcdFx0Y29uc3QgZGlzbWlzc1JlYXNvbiA9IGVuZC52aWEgPT09ICd0YXJnZXQnID8gT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uVGFyZ2V0Q2xpY2sgOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQ7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCwgc2hvd24sIGRpc21pc3NSZWFzb24sIGxhc3RTdGVwSW5kZXgsIHN0ZXBDb3VudCB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZGlyZWN0aW9uID0gMTtcblx0XHRcdFx0XHRcdGluZGV4Kys7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdiYWNrJzpcblx0XHRcdFx0XHRcdGRpcmVjdGlvbiA9IC0xO1xuXHRcdFx0XHRcdFx0aW5kZXgtLTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3NraXAnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuU2tpcHBlZCwgc2hvd24sIGRpc21pc3NSZWFzb246IGVuZC5yZWFzb24sIGxhc3RTdGVwSW5kZXgsIHN0ZXBDb3VudCB9O1xuXHRcdFx0XHRcdGNhc2UgJ2Fib3J0Jzpcblx0XHRcdFx0XHRcdHJldHVybiB7IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQsIHNob3duLCBkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5BYm9ydGVkLCBsYXN0U3RlcEluZGV4LCBzdGVwQ291bnQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYWJvcnRlZFxuXHRcdFx0XHQ/IHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQWJvcnRlZCwgc2hvd24sIGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkFib3J0ZWQsIGxhc3RTdGVwSW5kZXgsIHN0ZXBDb3VudCB9XG5cdFx0XHRcdDogeyBvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQsIHNob3duLCBkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQsIGxhc3RTdGVwSW5kZXgsIHN0ZXBDb3VudCB9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVRhcmdldCh0YXJnZXRXaW5kb3c6IFdpbmRvdywgdGFyZ2V0SWQ6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBiZWhhdmlvcj86IFNwb3RsaWdodE1pc3NpbmdUYXJnZXRCZWhhdmlvcik6IFByb21pc2U8SFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBlbGVtZW50ID0gZmluZE9uYm9hcmRpbmdUYXJnZXQodGFyZ2V0V2luZG93LCB0YXJnZXRJZCk7XG5cdFx0aWYgKGVsZW1lbnQgfHwgYmVoYXZpb3I/LmtpbmQgPT09ICdza2lwJykge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRpbWVvdXRNcyA9IGJlaGF2aW9yPy5raW5kID09PSAnd2FpdCcgPyBNYXRoLm1heCgwLCBiZWhhdmlvci50aW1lb3V0TXMpIDogVEFSR0VUX1JFU09MVkVfVElNRU9VVDtcblx0XHRjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyB0aW1lb3V0TXM7XG5cdFx0d2hpbGUgKCFlbGVtZW50ICYmIERhdGUubm93KCkgPCBkZWFkbGluZSAmJiAhY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoVEFSR0VUX1BPTExfSU5URVJWQUwsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRlbGVtZW50ID0gZmluZE9uYm9hcmRpbmdUYXJnZXQodGFyZ2V0V2luZG93LCB0YXJnZXRJZCk7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvclRhcmdldFJlYWR5KHRhcmdldFdpbmRvdzogV2luZG93LCB0YXJnZXQ6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYW5pbWF0aW9ucyA9IHRoaXMuX2dldEFjdGl2ZUZpbml0ZUFuaW1hdGlvbnModGFyZ2V0KTtcblx0XHRpZiAoYW5pbWF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRQcm9taXNlLmFsbFNldHRsZWQoYW5pbWF0aW9ucy5tYXAoYW5pbWF0aW9uID0+IGFuaW1hdGlvbi5maW5pc2hlZC5jYXRjaCgoKSA9PiB1bmRlZmluZWQpKSksXG5cdFx0XHRcdHRpbWVvdXQoVEFSR0VUX0FOSU1BVElPTl9TRVRUTEVfVElNRU9VVCksXG5cdFx0XHRdKTtcblx0XHR9XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB0YXJnZXRXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlRmluaXRlQW5pbWF0aW9ucyh0YXJnZXQ6IEhUTUxFbGVtZW50KTogQW5pbWF0aW9uW10ge1xuXHRcdGNvbnN0IGFuaW1hdGlvbnM6IEFuaW1hdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gdGFyZ2V0OyBlbGVtZW50OyBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFuaW1hdGlvbiBvZiBlbGVtZW50LmdldEFuaW1hdGlvbnMoKSkge1xuXHRcdFx0XHRpZiAoYW5pbWF0aW9uLnBsYXlTdGF0ZSA9PT0gJ3J1bm5pbmcnICYmIGFuaW1hdGlvbi5lZmZlY3Q/LmdldFRpbWluZygpLml0ZXJhdGlvbnMgIT09IEluZmluaXR5KSB7XG5cdFx0XHRcdFx0YW5pbWF0aW9ucy5wdXNoKGFuaW1hdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFuaW1hdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5TdGVwKG92ZXJsYXk6IFNwb3RsaWdodE92ZXJsYXksIGNvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCwgc3RlcDogSVNwb3RsaWdodFN0ZXAsIHRhcmdldDogSFRNTEVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHN0ZXBDb3VudDogbnVtYmVyKTogUHJvbWlzZTxTdGVwRW5kPiB7XG5cdFx0Y29uc3Qgc3RlcFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBlbmRlZCA9IGZhbHNlO1xuXHRcdGxldCByZXNvbHZlU3RlcDogKGVuZDogU3RlcEVuZCkgPT4gdm9pZDtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbWlzZTxTdGVwRW5kPihyZXNvbHZlID0+IHJlc29sdmVTdGVwID0gcmVzb2x2ZSk7XG5cdFx0Y29uc3QgZG9uZSA9IChlbmQ6IFN0ZXBFbmQpID0+IHtcblx0XHRcdGlmIChlbmRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0XHRzdGVwU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0cmVzb2x2ZVN0ZXAoZW5kKTtcblx0XHR9O1xuXG5cdFx0c3RlcFN0b3JlLmFkZChvdmVybGF5Lm9uRGlkQ2xpY2tOZXh0KHZpYSA9PiBkb25lKHsgYWN0aW9uOiAnbmV4dCcsIHZpYSB9KSkpO1xuXHRcdHN0ZXBTdG9yZS5hZGQob3ZlcmxheS5vbkRpZENsaWNrUHJldmlvdXMoKCkgPT4gZG9uZSh7IGFjdGlvbjogJ2JhY2snIH0pKSk7XG5cdFx0c3RlcFN0b3JlLmFkZChvdmVybGF5Lm9uRGlkU2tpcChyZWFzb24gPT4gZG9uZSh7IGFjdGlvbjogJ3NraXAnLCByZWFzb24gfSkpKTtcblx0XHRzdGVwU3RvcmUuYWRkKGNvbnRleHQub25BYm9ydCgoKSA9PiBkb25lKHsgYWN0aW9uOiAnYWJvcnQnIH0pKSk7XG5cblx0XHRjb25zdCBjb250ZW50OiBJU3BvdGxpZ2h0Q29udGVudCA9IHtcblx0XHRcdHRpdGxlOiBzdGVwLnRpdGxlLFxuXHRcdFx0ZGVzY3JpcHRpb246IHN0ZXAuZGVzY3JpcHRpb24sXG5cdFx0XHRzdGVwSW5kZXg6IGluZGV4LFxuXHRcdFx0c3RlcENvdW50LFxuXHRcdFx0Y2FuR29CYWNrOiBpbmRleCA+IDAsXG5cdFx0XHRpc0xhc3RTdGVwOiBpbmRleCA9PT0gc3RlcENvdW50IC0gMSxcblx0XHR9O1xuXG5cdFx0b3ZlcmxheS5zaG93KHRhcmdldCwgY29udGVudCwge1xuXHRcdFx0cGxhY2VtZW50OiBzdGVwLnBsYWNlbWVudCxcblx0XHRcdGFsbG93VGFyZ2V0SW50ZXJhY3Rpb246IHN0ZXAuYWxsb3dUYXJnZXRJbnRlcmFjdGlvbixcblx0XHRcdGFkdmFuY2VPblRhcmdldENsaWNrOiBzdGVwLmFkdmFuY2VPblRhcmdldENsaWNrLFxuXHRcdFx0aGlkZU5leHQ6ICEhc3RlcC5hZHZhbmNlV2hlbixcblx0XHRcdHRhcmdldE92ZXJsYXlWaXNpYmxlOiBzdGVwLm9wZW5UYXJnZXQsXG5cdFx0XHRwYWRkaW5nOiBzdGVwLnBhZGRpbmcsXG5cdFx0fSk7XG5cblx0XHRpZiAoc3RlcC5hZHZhbmNlV2hlbikge1xuXHRcdFx0Y29uc3Qga2V5cyA9IG5ldyBTZXQoc3RlcC5hZHZhbmNlV2hlbi5rZXlzKCkpO1xuXHRcdFx0Y29uc3QgYWR2YW5jZUlmU2F0aXNmaWVkID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAuYWR2YW5jZVdoZW4pKSB7XG5cdFx0XHRcdFx0ZG9uZSh7IGFjdGlvbjogJ25leHQnLCB2aWE6ICdjb25kaXRpb24nIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0c3RlcFN0b3JlLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChldmVudCA9PiB7XG5cdFx0XHRcdGlmIChldmVudC5hZmZlY3RzU29tZShrZXlzKSkge1xuXHRcdFx0XHRcdGFkdmFuY2VJZlNhdGlzZmllZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRhZHZhbmNlSWZTYXRpc2ZpZWQoKTtcblx0XHR9XG5cblx0XHRpZiAoc3RlcC5vcGVuVGFyZ2V0ICYmICFlbmRlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgb3Blbk9uYm9hcmRpbmdUYXJnZXQodGFyZ2V0KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBb0QseUJBQXlCLHlCQUF5QjtBQUN0RyxTQUFTLHNCQUFzQiw0QkFBNEI7QUFDM0QsU0FBNEIsd0JBQXdCO0FBQ3BELFNBQTRFLG1DQUFtQztBQUcvRyxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLHVCQUF1QjtBQUM3QixNQUFNLGtDQUFrQztBQWVqQyxJQUFNLHdCQUFOLGNBQW9DLFdBQThDO0FBQUEsRUFJeEYsWUFDMkMsZUFDWCxhQUNNLG1CQUNwQztBQUNELFVBQU07QUFKb0M7QUFDWDtBQUNNO0FBTHRDLFNBQVMsT0FBTztBQUFBLEVBUWhCO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBK0IsU0FBK0Q7QUFDdkcsVUFBTSxVQUFVLFNBQVMsYUFBYTtBQUN0QyxVQUFNLFFBQVEsU0FBUyxTQUFTLENBQUM7QUFDakMsVUFBTSxZQUFZLE1BQU07QUFDeEIsUUFBSSxjQUFjLEdBQUc7QUFDcEIsYUFBTyxFQUFFLFNBQVMsa0JBQWtCLFdBQVcsT0FBTyxPQUFPLGVBQWUsd0JBQXdCLFdBQVcsZUFBZSxHQUFHLFdBQVcsRUFBRTtBQUFBLElBQy9JO0FBSUEsUUFBSSxnQkFBZ0I7QUFHcEIsUUFBSSxRQUFRO0FBQ1osVUFBTSxxQkFBcUIsb0JBQUksSUFBWTtBQUUzQyxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsUUFBSTtBQUNILFlBQU0sWUFBWSxLQUFLLGNBQWMsYUFBYSxRQUFRLFlBQVk7QUFDdEUsWUFBTSxVQUFVLE1BQU0sSUFBSSxJQUFJLGlCQUFpQixT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
