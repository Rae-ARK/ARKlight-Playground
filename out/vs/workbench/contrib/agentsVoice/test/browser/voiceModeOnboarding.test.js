import assert from "assert";
import * as dom from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AgentsVoiceStorageKeys } from "../../common/agentsVoice.js";
import { IVoiceSessionController } from "../../../chat/browser/voiceClient/voiceSessionController.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { VoiceModeOnboardingBanner, VoiceModeOnboardingService } from "../../browser/voiceModeOnboarding.js";
suite("Voice Mode onboarding", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class TestTelemetryService extends NullTelemetryServiceShape {
    constructor(events) {
      super();
      this.events = events;
    }
    publicLog2(eventName, data) {
      if (eventName) {
        this.events.push({ name: eventName, data });
      }
    }
  }
  function createHost(store) {
    const root = dom.$("div");
    root.tabIndex = 0;
    const container = dom.append(root, dom.$(".voice-mode-onboarding-container"));
    document.body.appendChild(root);
    store.add(toDisposable(() => root.remove()));
    return { root, container, focused: 0 };
  }
  function register(service, host) {
    return service.registerHost(host.container, host.root, () => {
      host.focused++;
      host.root.focus();
    });
  }
  function createService(store, executed = [], holds = [], telemetryEvents = [], screenReaderOptimized = false) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(IAccessibilityService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeScreenReaderOptimized = Event.None;
        this.onDidChangeReducedMotion = Event.None;
      }
      isScreenReaderOptimized() {
        return screenReaderOptimized;
      }
      isMotionReduced() {
        return false;
      }
    }());
    instantiationService.stub(ICommandService, new class extends mock() {
      executeCommand(id) {
        executed.push(id);
        return Promise.resolve(void 0);
      }
    }());
    instantiationService.stub(IVoiceSessionController, new class extends mock() {
      constructor() {
        super(...arguments);
        this.voiceState = constObservable("idle");
      }
      setAutoListenHeld(held) {
        holds.push(held);
      }
      stopListening() {
      }
      pttDown() {
      }
      pttUp() {
      }
    }());
    instantiationService.stub(ITelemetryService, new TestTelemetryService(telemetryEvents));
    return store.add(instantiationService.createInstance(VoiceModeOnboardingService));
  }
  test("auditions a voice, dismisses, and never returns", () => {
    const telemetryEvents = [];
    const service = createService(disposables, [], [], telemetryEvents);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const shown = host.container.classList.contains("has-voice-mode-onboarding");
    const selectedOnOpen = host.container.querySelectorAll(".voice-mode-onboarding-voice.selected").length;
    const voices = [...host.container.querySelectorAll(".voice-mode-onboarding-voice-label")].map((element) => element.textContent);
    const voicesLabel = host.container.querySelector(".voice-mode-onboarding-voices-label")?.textContent;
    const microphonePickerHidden = host.container.querySelector(".voice-mode-onboarding-microphone-picker")?.hidden;
    host.container.querySelector(".voice-mode-onboarding-voice").click();
    const selectedAfterPick = host.container.querySelectorAll(".voice-mode-onboarding-voice.selected").length;
    host.container.querySelector(".voice-mode-onboarding-close").click();
    const shownAfterClose = host.container.classList.contains("has-voice-mode-onboarding");
    service.showIfNeeded();
    const shownAgain = host.container.classList.contains("has-voice-mode-onboarding");
    assert.deepStrictEqual(
      {
        shown,
        microphonePickerHidden,
        selectedOnOpen,
        voices,
        voicesLabel,
        selectedAfterPick,
        shownAfterClose,
        shownAgain,
        telemetryEvents
      },
      {
        shown: true,
        microphonePickerHidden: true,
        selectedOnOpen: 0,
        voices: ["Maya (Default)", "Victoria", "Kevin", "Daniel"],
        voicesLabel: "Agent Voice:",
        selectedAfterPick: 1,
        shownAfterClose: false,
        shownAgain: false,
        telemetryEvents: [
          { name: "voiceModeOnboarding.action", data: { action: "shown", source: "automatic" } },
          { name: "voiceModeOnboarding.action", data: { action: "selectVoice", source: "automatic" } },
          { name: "voiceModeOnboarding.action", data: { action: "close", source: "automatic" } }
        ]
      }
    );
  });
  test("clicking the playing voice stops its preview without changing the selection", () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(IAccessibilityService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeScreenReaderOptimized = Event.None;
        this.onDidChangeReducedMotion = Event.None;
      }
      isScreenReaderOptimized() {
        return false;
      }
      isMotionReduced() {
        return false;
      }
    }());
    const audio = document.createElement("audio");
    let playCount = 0;
    let pauseCount = 0;
    audio.play = () => {
      playCount++;
      return Promise.resolve();
    };
    audio.pause = () => pauseCount++;
    const host = createHost(disposables);
    disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
      container: host.container,
      onDismiss: () => void 0,
      source: "manual",
      audioFactory: () => audio
    }));
    const maya = host.container.querySelector(".voice-mode-onboarding-voice");
    maya.click();
    const playingAfterFirstClick = maya.classList.contains("playing");
    const ariaLabelAfterFirstClick = maya.getAttribute("aria-label");
    maya.click();
    assert.deepStrictEqual(
      {
        label: maya.querySelector(".voice-mode-onboarding-voice-label")?.textContent,
        playCount,
        pauseCount,
        playingAfterFirstClick,
        ariaLabelAfterFirstClick,
        playingAfterSecondClick: maya.classList.contains("playing"),
        ariaLabelAfterSecondClick: maya.getAttribute("aria-label"),
        selectedAfterSecondClick: maya.classList.contains("selected")
      },
      {
        label: "Maya (Default)",
        playCount: 1,
        pauseCount: 1,
        playingAfterFirstClick: true,
        ariaLabelAfterFirstClick: "Stop Maya (Default) preview.",
        playingAfterSecondClick: false,
        ariaLabelAfterSecondClick: "Maya (Default). Hear this voice and use it for every conversation.",
        selectedAfterSecondClick: true
      }
    );
  });
  test("previews the native voice per language and keeps the chooser only for English", () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(IAccessibilityService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeScreenReaderOptimized = Event.None;
        this.onDidChangeReducedMotion = Event.None;
      }
      isScreenReaderOptimized() {
        return false;
      }
      isMotionReduced() {
        return false;
      }
    }());
    const cases = [
      { language: "de-DE", options: 1, chooser: false, sample: "de_marc_neutral.mp3" },
      { language: "es-MX", options: 1, chooser: false, sample: "es-ES_maria_neutral.mp3" },
      { language: "fr-CA", options: 1, chooser: false, sample: "fr_david_neutral.mp3" },
      { language: "it-IT", options: 1, chooser: false, sample: "it_eva_neutral.mp3" },
      { language: "ja-JP", options: 1, chooser: false, sample: "ja_aruha_neutral.mp3" },
      { language: "ko-KR", options: 1, chooser: false, sample: "ko_jiyon_neutral.mp3" },
      { language: "pt-PT", options: 1, chooser: false, sample: "pt-BR_gil_neutral.mp3" },
      { language: "zh-TW", options: 1, chooser: false, sample: "zh_wuzhi_neutral.mp3" },
      { language: "en-GB", options: 4, chooser: true, sample: "maya_neutral.mp3" },
      { language: "is", options: 4, chooser: true, sample: "maya_neutral.mp3" }
    ];
    const actual = [];
    for (const { language } of cases) {
      const host = createHost(disposables);
      const audio = document.createElement("audio");
      audio.play = () => Promise.resolve();
      disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
        container: host.container,
        onDismiss: () => void 0,
        source: "manual",
        audioFactory: () => audio,
        voiceLanguage: language
      }));
      const options = host.container.querySelectorAll(".voice-mode-onboarding-voice").length;
      const chooser = !!host.container.querySelector('.voice-mode-onboarding-voices[role="radiogroup"]');
      host.container.querySelector(".voice-mode-onboarding-voice").click();
      const sample = audio.src.split(/[?#]/)[0].split("/").pop() ?? "";
      actual.push({ language, options, chooser, sample });
    }
    assert.deepStrictEqual(actual, cases);
  });
  test("can be shown again manually", () => {
    const telemetryEvents = [];
    const service = createService(disposables, [], [], telemetryEvents);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    const shown = service.show();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.deepStrictEqual(
      { shown, telemetryEvents },
      {
        shown: true,
        telemetryEvents: [
          { name: "voiceModeOnboarding.action", data: { action: "shown", source: "manual" } },
          { name: "voiceModeOnboarding.action", data: { action: "close", source: "manual" } }
        ]
      }
    );
  });
  test("can be dismissed without choosing a voice", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.strictEqual(host.container.classList.contains("has-voice-mode-onboarding"), false);
  });
  test("focuses the introduction in screen reader mode", () => {
    const service = createService(disposables, [], [], [], true);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const card = host.container.querySelector(".voice-mode-onboarding-banner");
    assert.deepStrictEqual(
      {
        activeElement: document.activeElement,
        card,
        tabIndex: card?.tabIndex,
        closeIcon: host.container.querySelector(".voice-mode-onboarding-close .codicon")?.className,
        listeningNotice: host.container.querySelector(".voice-mode-onboarding-listening-notice")
      },
      {
        activeElement: card,
        card,
        tabIndex: -1,
        closeIcon: "codicon codicon-close-compact",
        listeningNotice: null
      }
    );
  });
  test("asking twice in one session leaves exactly one card", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    service.showIfNeeded();
    assert.deepStrictEqual(
      {
        visible: host.container.classList.contains("has-voice-mode-onboarding"),
        cards: host.container.querySelectorAll(".voice-mode-onboarding-banner").length
      },
      { visible: true, cards: 1 }
    );
  });
  test("keeps its one showing when there is no chat to dock to", () => {
    const service = createService(disposables);
    service.showIfNeeded();
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    assert.strictEqual(host.container.classList.contains("has-voice-mode-onboarding"), true);
  });
  test("the settings link opens Voice Mode settings", () => {
    const executed = [];
    const service = createService(disposables, executed);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const links = [...host.container.querySelectorAll(".voice-mode-onboarding-description a")];
    for (const link of links) {
      link.click();
    }
    assert.deepStrictEqual(
      { labels: links.map((link) => link.textContent), executed },
      {
        labels: ["settings"],
        executed: ["agentsVoice.openSettings"]
      }
    );
  });
  test("does not block Voice Mode from listening while the card is up", () => {
    const holds = [];
    const service = createService(disposables, [], holds);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.deepStrictEqual(holds, []);
  });
  test("the one appearance is only spent once the card is really up", () => {
    let cardWhenStored;
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(IVoiceSessionController, new class extends mock() {
      constructor() {
        super(...arguments);
        this.voiceState = constObservable("idle");
      }
      setAutoListenHeld() {
      }
      stopListening() {
      }
    }());
    const host = createHost(disposables);
    const storageService = instantiationService.get(IStorageService);
    const store = storageService.store.bind(storageService);
    instantiationService.stub(IStorageService, new Proxy(storageService, {
      get: (target, property, receiver) => property === "store" ? (key, value, scope, target2) => {
        if (key === AgentsVoiceStorageKeys.IntroBannerShown) {
          cardWhenStored = {
            visible: host.container.classList.contains("has-voice-mode-onboarding"),
            cards: host.container.querySelectorAll(".voice-mode-onboarding-banner").length
          };
        }
        store(key, value, scope, target2);
      } : Reflect.get(target, property, receiver)
    }));
    const service = disposables.add(instantiationService.createInstance(VoiceModeOnboardingService));
    disposables.add(register(service, host));
    service.showIfNeeded();
    assert.deepStrictEqual(cardWhenStored, { visible: true, cards: 1 });
  });
  test("hands focus back to the chat input when dismissed from the keyboard", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const close = host.container.querySelector(".voice-mode-onboarding-close");
    close.focus();
    const dismissedFromInside = dom.isAncestorOfActiveElement(host.container);
    close.click();
    assert.deepStrictEqual(
      { dismissedFromInside, focused: host.focused },
      { dismissedFromInside: true, focused: 1 }
    );
  });
  test("leaves focus alone when the card is dismissed from elsewhere", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const elsewhere = document.body.appendChild(dom.$("div"));
    disposables.add(toDisposable(() => elsewhere.remove()));
    elsewhere.tabIndex = 0;
    elsewhere.focus();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.strictEqual(host.focused, 0);
  });
  test("attaches to the most recently focused host", () => {
    const service = createService(disposables);
    const first = createHost(disposables);
    const second = createHost(disposables);
    disposables.add(register(service, first));
    disposables.add(register(service, second));
    second.root.focus();
    second.root.dispatchEvent(new FocusEvent("focus"));
    service.showIfNeeded();
    assert.deepStrictEqual(
      {
        first: first.container.classList.contains("has-voice-mode-onboarding"),
        second: second.container.classList.contains("has-voice-mode-onboarding")
      },
      { first: false, second: true }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FnZW50c1ZvaWNlL3Rlc3QvYnJvd3Nlci92b2ljZU1vZGVPbmJvYXJkaW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50c1ZvaWNlU3RvcmFnZUtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRzVm9pY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIFZvaWNlU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VTZXNzaW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lciwgVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZvaWNlTW9kZU9uYm9hcmRpbmcuanMnO1xuXG5zdWl0ZSgnVm9pY2UgTW9kZSBvbmJvYXJkaW5nJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0aW50ZXJmYWNlIElUZXN0SG9zdCB7IHJvb3Q6IEhUTUxFbGVtZW50OyBjb250YWluZXI6IEhUTUxFbGVtZW50OyBmb2N1c2VkOiBudW1iZXIgfVxuXHRpbnRlcmZhY2UgSVRlbGVtZXRyeUV2ZW50IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBkYXRhOiB1bmtub3duIH1cblxuXHRjbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRcdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZXZlbnRzOiBJVGVsZW1ldHJ5RXZlbnRbXSkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBwdWJsaWNMb2cyKGV2ZW50TmFtZT86IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdFx0dGhpcy5ldmVudHMucHVzaCh7IG5hbWU6IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVIb3N0KHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KTogSVRlc3RIb3N0IHtcblx0XHRjb25zdCByb290ID0gZG9tLiQoJ2RpdicpO1xuXHRcdHJvb3QudGFiSW5kZXggPSAwO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY29udGFpbmVyJykpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocm9vdCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByb290LnJlbW92ZSgpKSk7XG5cdFx0cmV0dXJuIHsgcm9vdCwgY29udGFpbmVyLCBmb2N1c2VkOiAwIH07XG5cdH1cblxuXHRmdW5jdGlvbiByZWdpc3RlcihzZXJ2aWNlOiBWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSwgaG9zdDogSVRlc3RIb3N0KSB7XG5cdFx0cmV0dXJuIHNlcnZpY2UucmVnaXN0ZXJIb3N0KGhvc3QuY29udGFpbmVyLCBob3N0LnJvb3QsICgpID0+IHtcblx0XHRcdGhvc3QuZm9jdXNlZCsrO1xuXHRcdFx0aG9zdC5yb290LmZvY3VzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBleGVjdXRlZDogc3RyaW5nW10gPSBbXSwgaG9sZHM6IGJvb2xlYW5bXSA9IFtdLCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW10sIHNjcmVlblJlYWRlck9wdGltaXplZCA9IGZhbHNlKTogVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Uge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2liaWxpdHlTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSBpc1NjcmVlblJlYWRlck9wdGltaXplZCgpOiBib29sZWFuIHsgcmV0dXJuIHNjcmVlblJlYWRlck9wdGltaXplZDsgfVxuXHRcdFx0b3ZlcnJpZGUgaXNNb3Rpb25SZWR1Y2VkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29tbWFuZFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZXhlY3V0ZUNvbW1hbmQoaWQ6IHN0cmluZyk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdGV4ZWN1dGVkLnB1c2goaWQpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVm9pY2VTZXNzaW9uQ29udHJvbGxlciwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVm9pY2VTZXNzaW9uQ29udHJvbGxlcj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB2b2ljZVN0YXRlID0gY29uc3RPYnNlcnZhYmxlPFZvaWNlU3RhdGU+KCdpZGxlJyk7XG5cdFx0XHRvdmVycmlkZSBzZXRBdXRvTGlzdGVuSGVsZChoZWxkOiBib29sZWFuKTogdm9pZCB7IGhvbGRzLnB1c2goaGVsZCk7IH1cblx0XHRcdG92ZXJyaWRlIHN0b3BMaXN0ZW5pbmcoKTogdm9pZCB7IH1cblx0XHRcdG92ZXJyaWRlIHB0dERvd24oKTogdm9pZCB7IH1cblx0XHRcdG92ZXJyaWRlIHB0dFVwKCk6IHZvaWQgeyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKHRlbGVtZXRyeUV2ZW50cykpO1xuXHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UpKTtcblx0fVxuXG5cdHRlc3QoJ2F1ZGl0aW9ucyBhIHZvaWNlLCBkaXNtaXNzZXMsIGFuZCBuZXZlciByZXR1cm5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeUV2ZW50czogSVRlbGVtZXRyeUV2ZW50W10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcywgW10sIFtdLCB0ZWxlbWV0cnlFdmVudHMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRjb25zdCBzaG93biA9IGhvc3QuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGFzLXZvaWNlLW1vZGUtb25ib2FyZGluZycpO1xuXG5cdFx0Ly8gTm90aGluZyBpcyBjaG9zZW4gdW50aWwgdGhlIHVzZXIgY2hvb3NlczogdGhlIGNhcmQgYXNrcyBhIHF1ZXN0aW9uXG5cdFx0Ly8gcmF0aGVyIHRoYW4gYXJyaXZpbmcgd2l0aCBhbiBhbnN3ZXIgYWxyZWFkeSBmaWxsZWQgaW4uXG5cdFx0Y29uc3Qgc2VsZWN0ZWRPbk9wZW4gPSBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlLnNlbGVjdGVkJykubGVuZ3RoO1xuXHRcdGNvbnN0IHZvaWNlcyA9IFsuLi5ob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS1sYWJlbCcpXS5tYXAoZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50KTtcblx0XHRjb25zdCB2b2ljZXNMYWJlbCA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlcy1sYWJlbCcpPy50ZXh0Q29udGVudDtcblx0XHRjb25zdCBtaWNyb3Bob25lUGlja2VySGlkZGVuID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctbWljcm9waG9uZS1waWNrZXInKT8uaGlkZGVuO1xuXHRcdGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlJykhLmNsaWNrKCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBZnRlclBpY2sgPSBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlLnNlbGVjdGVkJykubGVuZ3RoO1xuXG5cdFx0Ly8gRGlzbWlzc2FsIGlzIG5ldmVyIGdhdGVkLCBhbmQgaGF2aW5nIGJlZW4gc2VlbiBpdCBtdXN0IG5vdCBjb21lIGJhY2suXG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY2xvc2UnKSEuY2xpY2soKTtcblx0XHRjb25zdCBzaG93bkFmdGVyQ2xvc2UgPSBob3N0LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy12b2ljZS1tb2RlLW9uYm9hcmRpbmcnKTtcblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXHRcdGNvbnN0IHNob3duQWdhaW4gPSBob3N0LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy12b2ljZS1tb2RlLW9uYm9hcmRpbmcnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHNob3duLFxuXHRcdFx0XHRtaWNyb3Bob25lUGlja2VySGlkZGVuLFxuXHRcdFx0XHRzZWxlY3RlZE9uT3Blbixcblx0XHRcdFx0dm9pY2VzLFxuXHRcdFx0XHR2b2ljZXNMYWJlbCxcblx0XHRcdFx0c2VsZWN0ZWRBZnRlclBpY2ssXG5cdFx0XHRcdHNob3duQWZ0ZXJDbG9zZSxcblx0XHRcdFx0c2hvd25BZ2Fpbixcblx0XHRcdFx0dGVsZW1ldHJ5RXZlbnRzLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2hvd246IHRydWUsXG5cdFx0XHRcdG1pY3JvcGhvbmVQaWNrZXJIaWRkZW46IHRydWUsXG5cdFx0XHRcdHNlbGVjdGVkT25PcGVuOiAwLFxuXHRcdFx0XHR2b2ljZXM6IFsnTWF5YSAoRGVmYXVsdCknLCAnVmljdG9yaWEnLCAnS2V2aW4nLCAnRGFuaWVsJ10sXG5cdFx0XHRcdHZvaWNlc0xhYmVsOiAnQWdlbnQgVm9pY2U6Jyxcblx0XHRcdFx0c2VsZWN0ZWRBZnRlclBpY2s6IDEsXG5cdFx0XHRcdHNob3duQWZ0ZXJDbG9zZTogZmFsc2UsXG5cdFx0XHRcdHNob3duQWdhaW46IGZhbHNlLFxuXHRcdFx0XHR0ZWxlbWV0cnlFdmVudHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnc2hvd24nLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnc2VsZWN0Vm9pY2UnLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnY2xvc2UnLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGlja2luZyB0aGUgcGxheWluZyB2b2ljZSBzdG9wcyBpdHMgcHJldmlldyB3aXRob3V0IGNoYW5naW5nIHRoZSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY2Nlc3NpYmlsaXR5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWNjZXNzaWJpbGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VSZWR1Y2VkTW90aW9uID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGlzTW90aW9uUmVkdWNlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhdWRpbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJyk7XG5cdFx0bGV0IHBsYXlDb3VudCA9IDA7XG5cdFx0bGV0IHBhdXNlQ291bnQgPSAwO1xuXHRcdGF1ZGlvLnBsYXkgPSAoKSA9PiB7XG5cdFx0XHRwbGF5Q291bnQrKztcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9O1xuXHRcdGF1ZGlvLnBhdXNlID0gKCkgPT4gcGF1c2VDb3VudCsrO1xuXG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVPbmJvYXJkaW5nQmFubmVyLCB7XG5cdFx0XHRjb250YWluZXI6IGhvc3QuY29udGFpbmVyLFxuXHRcdFx0b25EaXNtaXNzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzb3VyY2U6ICdtYW51YWwnLFxuXHRcdFx0YXVkaW9GYWN0b3J5OiAoKSA9PiBhdWRpbyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtYXlhID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UnKSE7XG5cdFx0bWF5YS5jbGljaygpO1xuXHRcdGNvbnN0IHBsYXlpbmdBZnRlckZpcnN0Q2xpY2sgPSBtYXlhLmNsYXNzTGlzdC5jb250YWlucygncGxheWluZycpO1xuXHRcdGNvbnN0IGFyaWFMYWJlbEFmdGVyRmlyc3RDbGljayA9IG1heWEuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0bWF5YS5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IG1heWEucXVlcnlTZWxlY3RvcignLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS1sYWJlbCcpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0cGxheUNvdW50LFxuXHRcdFx0XHRwYXVzZUNvdW50LFxuXHRcdFx0XHRwbGF5aW5nQWZ0ZXJGaXJzdENsaWNrLFxuXHRcdFx0XHRhcmlhTGFiZWxBZnRlckZpcnN0Q2xpY2ssXG5cdFx0XHRcdHBsYXlpbmdBZnRlclNlY29uZENsaWNrOiBtYXlhLmNsYXNzTGlzdC5jb250YWlucygncGxheWluZycpLFxuXHRcdFx0XHRhcmlhTGFiZWxBZnRlclNlY29uZENsaWNrOiBtYXlhLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0XHRzZWxlY3RlZEFmdGVyU2Vjb25kQ2xpY2s6IG1heWEuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWxlY3RlZCcpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdNYXlhIChEZWZhdWx0KScsXG5cdFx0XHRcdHBsYXlDb3VudDogMSxcblx0XHRcdFx0cGF1c2VDb3VudDogMSxcblx0XHRcdFx0cGxheWluZ0FmdGVyRmlyc3RDbGljazogdHJ1ZSxcblx0XHRcdFx0YXJpYUxhYmVsQWZ0ZXJGaXJzdENsaWNrOiAnU3RvcCBNYXlhIChEZWZhdWx0KSBwcmV2aWV3LicsXG5cdFx0XHRcdHBsYXlpbmdBZnRlclNlY29uZENsaWNrOiBmYWxzZSxcblx0XHRcdFx0YXJpYUxhYmVsQWZ0ZXJTZWNvbmRDbGljazogJ01heWEgKERlZmF1bHQpLiBIZWFyIHRoaXMgdm9pY2UgYW5kIHVzZSBpdCBmb3IgZXZlcnkgY29udmVyc2F0aW9uLicsXG5cdFx0XHRcdHNlbGVjdGVkQWZ0ZXJTZWNvbmRDbGljazogdHJ1ZSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aWV3cyB0aGUgbmF0aXZlIHZvaWNlIHBlciBsYW5ndWFnZSBhbmQga2VlcHMgdGhlIGNob29zZXIgb25seSBmb3IgRW5nbGlzaCcsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY2Nlc3NpYmlsaXR5U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVJlZHVjZWRNb3Rpb24gPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0b3ZlcnJpZGUgaXNNb3Rpb25SZWR1Y2VkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHR9KTtcblxuXHRcdC8vIEEgbGFuZ3VhZ2UgVm9pY2UgTW9kZSBzcGVha3MgbmF0aXZlbHkgc2hvd3MgaXRzIG9uZSB2b2ljZSB3aXRoIG5vXG5cdFx0Ly8gY2hvb3NlcjsgRW5nbGlzaCBhbmQgbGFuZ3VhZ2VzIHdpdGhvdXQgYSBuYXRpdmUgdm9pY2Uga2VlcCB0aGUgZm91ci5cblx0XHRjb25zdCBjYXNlcyA9IFtcblx0XHRcdHsgbGFuZ3VhZ2U6ICdkZS1ERScsIG9wdGlvbnM6IDEsIGNob29zZXI6IGZhbHNlLCBzYW1wbGU6ICdkZV9tYXJjX25ldXRyYWwubXAzJyB9LFxuXHRcdFx0eyBsYW5ndWFnZTogJ2VzLU1YJywgb3B0aW9uczogMSwgY2hvb3NlcjogZmFsc2UsIHNhbXBsZTogJ2VzLUVTX21hcmlhX25ldXRyYWwubXAzJyB9LFxuXHRcdFx0eyBsYW5ndWFnZTogJ2ZyLUNBJywgb3B0aW9uczogMSwgY2hvb3NlcjogZmFsc2UsIHNhbXBsZTogJ2ZyX2RhdmlkX25ldXRyYWwubXAzJyB9LFxuXHRcdFx0eyBsYW5ndWFnZTogJ2l0LUlUJywgb3B0aW9uczogMSwgY2hvb3NlcjogZmFsc2UsIHNhbXBsZTogJ2l0X2V2YV9uZXV0cmFsLm1wMycgfSxcblx0XHRcdHsgbGFuZ3VhZ2U6ICdqYS1KUCcsIG9wdGlvbnM6IDEsIGNob29zZXI6IGZhbHNlLCBzYW1wbGU6ICdqYV9hcnVoYV9uZXV0cmFsLm1wMycgfSxcblx0XHRcdHsgbGFuZ3VhZ2U6ICdrby1LUicsIG9wdGlvbnM6IDEsIGNob29zZXI6IGZhbHNlLCBzYW1wbGU6ICdrb19qaXlvbl9uZXV0cmFsLm1wMycgfSxcblx0XHRcdHsgbGFuZ3VhZ2U6ICdwdC1QVCcsIG9wdGlvbnM6IDEsIGNob29zZXI6IGZhbHNlLCBzYW1wbGU6ICdwdC1CUl9naWxfbmV1dHJhbC5tcDMnIH0sXG5cdFx0XHR7IGxhbmd1YWdlOiAnemgtVFcnLCBvcHRpb25zOiAxLCBjaG9vc2VyOiBmYWxzZSwgc2FtcGxlOiAnemhfd3V6aGlfbmV1dHJhbC5tcDMnIH0sXG5cdFx0XHR7IGxhbmd1YWdlOiAnZW4tR0InLCBvcHRpb25zOiA0LCBjaG9vc2VyOiB0cnVlLCBzYW1wbGU6ICdtYXlhX25ldXRyYWwubXAzJyB9LFxuXHRcdFx0eyBsYW5ndWFnZTogJ2lzJywgb3B0aW9uczogNCwgY2hvb3NlcjogdHJ1ZSwgc2FtcGxlOiAnbWF5YV9uZXV0cmFsLm1wMycgfSxcblx0XHRdO1xuXHRcdGNvbnN0IGFjdHVhbDogeyBsYW5ndWFnZTogc3RyaW5nOyBvcHRpb25zOiBudW1iZXI7IGNob29zZXI6IGJvb2xlYW47IHNhbXBsZTogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB7IGxhbmd1YWdlIH0gb2YgY2FzZXMpIHtcblx0XHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRcdGNvbnN0IGF1ZGlvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXVkaW8nKTtcblx0XHRcdGF1ZGlvLnBsYXkgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVPbmJvYXJkaW5nQmFubmVyLCB7XG5cdFx0XHRcdGNvbnRhaW5lcjogaG9zdC5jb250YWluZXIsXG5cdFx0XHRcdG9uRGlzbWlzczogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRzb3VyY2U6ICdtYW51YWwnLFxuXHRcdFx0XHRhdWRpb0ZhY3Rvcnk6ICgpID0+IGF1ZGlvLFxuXHRcdFx0XHR2b2ljZUxhbmd1YWdlOiBsYW5ndWFnZSxcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UnKS5sZW5ndGg7XG5cdFx0XHRjb25zdCBjaG9vc2VyID0gISFob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlc1tyb2xlPVwicmFkaW9ncm91cFwiXScpO1xuXHRcdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UnKSEuY2xpY2soKTtcblx0XHRcdGNvbnN0IHNhbXBsZSA9IGF1ZGlvLnNyYy5zcGxpdCgvWz8jXS8pWzBdLnNwbGl0KCcvJykucG9wKCkgPz8gJyc7XG5cdFx0XHRhY3R1YWwucHVzaCh7IGxhbmd1YWdlLCBvcHRpb25zLCBjaG9vc2VyLCBzYW1wbGUgfSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGNhc2VzKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGJlIHNob3duIGFnYWluIG1hbnVhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeUV2ZW50czogSVRlbGVtZXRyeUV2ZW50W10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcywgW10sIFtdLCB0ZWxlbWV0cnlFdmVudHMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0Y29uc3Qgc2hvd24gPSBzZXJ2aWNlLnNob3coKTtcblx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgc2hvd24sIHRlbGVtZXRyeUV2ZW50cyB9LFxuXHRcdFx0e1xuXHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0dGVsZW1ldHJ5RXZlbnRzOiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAndm9pY2VNb2RlT25ib2FyZGluZy5hY3Rpb24nLCBkYXRhOiB7IGFjdGlvbjogJ3Nob3duJywgc291cmNlOiAnbWFudWFsJyB9IH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAndm9pY2VNb2RlT25ib2FyZGluZy5hY3Rpb24nLCBkYXRhOiB7IGFjdGlvbjogJ2Nsb3NlJywgc291cmNlOiAnbWFudWFsJyB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGJlIGRpc21pc3NlZCB3aXRob3V0IGNob29zaW5nIGEgdm9pY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3QuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGFzLXZvaWNlLW1vZGUtb25ib2FyZGluZycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvY3VzZXMgdGhlIGludHJvZHVjdGlvbiBpbiBzY3JlZW4gcmVhZGVyIG1vZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMsIFtdLCBbXSwgW10sIHRydWUpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRjb25zdCBjYXJkID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctYmFubmVyJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRhY3RpdmVFbGVtZW50OiBkb2N1bWVudC5hY3RpdmVFbGVtZW50LFxuXHRcdFx0XHRjYXJkLFxuXHRcdFx0XHR0YWJJbmRleDogY2FyZD8udGFiSW5kZXgsXG5cdFx0XHRcdGNsb3NlSWNvbjogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZSAuY29kaWNvbicpPy5jbGFzc05hbWUsXG5cdFx0XHRcdGxpc3RlbmluZ05vdGljZTogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1saXN0ZW5pbmctbm90aWNlJyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhY3RpdmVFbGVtZW50OiBjYXJkLFxuXHRcdFx0XHRjYXJkLFxuXHRcdFx0XHR0YWJJbmRleDogLTEsXG5cdFx0XHRcdGNsb3NlSWNvbjogJ2NvZGljb24gY29kaWNvbi1jbG9zZS1jb21wYWN0Jyxcblx0XHRcdFx0bGlzdGVuaW5nTm90aWNlOiBudWxsLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fza2luZyB0d2ljZSBpbiBvbmUgc2Vzc2lvbiBsZWF2ZXMgZXhhY3RseSBvbmUgY2FyZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlcihzZXJ2aWNlLCBob3N0KSk7XG5cblx0XHQvLyBWb2ljZSBNb2RlIHJlcG9ydHMgY29ubmVjdGluZyBhbmQgdGhlbiBjb25uZWN0ZWQsIHNvIHRoZSB0cmlnZ2VyIGZpcmVzXG5cdFx0Ly8gbW9yZSB0aGFuIG9uY2UgZm9yIGEgc2luZ2xlIHNlc3Npb24gc3RhcnQuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dmlzaWJsZTogaG9zdC5jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtdm9pY2UtbW9kZS1vbmJvYXJkaW5nJyksXG5cdFx0XHRcdGNhcmRzOiBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWJhbm5lcicpLmxlbmd0aCxcblx0XHRcdH0sXG5cdFx0XHR7IHZpc2libGU6IHRydWUsIGNhcmRzOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBpdHMgb25lIHNob3dpbmcgd2hlbiB0aGVyZSBpcyBubyBjaGF0IHRvIGRvY2sgdG8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gTm90aGluZyByZWdpc3RlcmVkIHlldDogdGhlIGludHJvZHVjdGlvbiBjYW5ub3QgYmUgc2hvd24sIGFuZCBtdXN0IG5vdFxuXHRcdC8vIGJ1cm4gaXRzIHNpbmdsZSBhcHBlYXJhbmNlIGRvaW5nIG5vdGhpbmcuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblxuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtdm9pY2UtbW9kZS1vbmJvYXJkaW5nJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgc2V0dGluZ3MgbGluayBvcGVucyBWb2ljZSBNb2RlIHNldHRpbmdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4ZWN1dGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzLCBleGVjdXRlZCk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlcihzZXJ2aWNlLCBob3N0KSk7XG5cblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXHRcdGNvbnN0IGxpbmtzID0gWy4uLmhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWRlc2NyaXB0aW9uIGEnKV07XG5cdFx0Zm9yIChjb25zdCBsaW5rIG9mIGxpbmtzKSB7XG5cdFx0XHRsaW5rLmNsaWNrKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgbGFiZWxzOiBsaW5rcy5tYXAobGluayA9PiBsaW5rLnRleHRDb250ZW50KSwgZXhlY3V0ZWQgfSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWxzOiBbJ3NldHRpbmdzJ10sXG5cdFx0XHRcdGV4ZWN1dGVkOiBbJ2FnZW50c1ZvaWNlLm9wZW5TZXR0aW5ncyddLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJsb2NrIFZvaWNlIE1vZGUgZnJvbSBsaXN0ZW5pbmcgd2hpbGUgdGhlIGNhcmQgaXMgdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9sZHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzLCBbXSwgaG9sZHMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChob2xkcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgb25lIGFwcGVhcmFuY2UgaXMgb25seSBzcGVudCBvbmNlIHRoZSBjYXJkIGlzIHJlYWxseSB1cCcsICgpID0+IHtcblx0XHQvLyBUaGUgZ3VhcmFudGVlIGlzIG9yZGVyaW5nLiBBbnl0aGluZyB0aGUgY2FyZCBuZWVkcyBhdCBjb25zdHJ1Y3Rpb24gY2FuXG5cdFx0Ly8gdGhyb3csIGFuZCBpZiB0aGUga2V5IHdlcmUgd3JpdHRlbiBmaXJzdCB0aGUgdXNlciB3b3VsZCBzaWxlbnRseSBsb3NlXG5cdFx0Ly8gdGhlaXIgb25seSBzaG93aW5nIC0gc28gYnkgdGhlIHRpbWUgaXQgaXMgd3JpdHRlbiB0aGUgY2FyZCBtdXN0IGFscmVhZHlcblx0XHQvLyBiZSBidWlsdCBhbmQgYXR0YWNoZWQuXG5cdFx0bGV0IGNhcmRXaGVuU3RvcmVkOiB7IHZpc2libGU6IGJvb2xlYW47IGNhcmRzOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdm9pY2VTdGF0ZSA9IGNvbnN0T2JzZXJ2YWJsZTxWb2ljZVN0YXRlPignaWRsZScpO1xuXHRcdFx0b3ZlcnJpZGUgc2V0QXV0b0xpc3RlbkhlbGQoKTogdm9pZCB7IH1cblx0XHRcdG92ZXJyaWRlIHN0b3BMaXN0ZW5pbmcoKTogdm9pZCB7IH1cblx0XHR9KTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yZSA9IHN0b3JhZ2VTZXJ2aWNlLnN0b3JlLmJpbmQoc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBuZXcgUHJveHkoc3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdGdldDogKHRhcmdldCwgcHJvcGVydHksIHJlY2VpdmVyKSA9PiBwcm9wZXJ0eSA9PT0gJ3N0b3JlJ1xuXHRcdFx0XHQ/IChrZXk6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4sIHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDI6IFN0b3JhZ2VUYXJnZXQpID0+IHtcblx0XHRcdFx0XHRpZiAoa2V5ID09PSBBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLkludHJvQmFubmVyU2hvd24pIHtcblx0XHRcdFx0XHRcdGNhcmRXaGVuU3RvcmVkID0ge1xuXHRcdFx0XHRcdFx0XHR2aXNpYmxlOiBob3N0LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy12b2ljZS1tb2RlLW9uYm9hcmRpbmcnKSxcblx0XHRcdFx0XHRcdFx0Y2FyZHM6IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctYmFubmVyJykubGVuZ3RoLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c3RvcmUoa2V5LCB2YWx1ZSwgc2NvcGUsIHRhcmdldDIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdDogUmVmbGVjdC5nZXQodGFyZ2V0LCBwcm9wZXJ0eSwgcmVjZWl2ZXIpLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhcmRXaGVuU3RvcmVkLCB7IHZpc2libGU6IHRydWUsIGNhcmRzOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kcyBmb2N1cyBiYWNrIHRvIHRoZSBjaGF0IGlucHV0IHdoZW4gZGlzbWlzc2VkIGZyb20gdGhlIGtleWJvYXJkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyKHNlcnZpY2UsIGhvc3QpKTtcblxuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cdFx0Y29uc3QgY2xvc2UgPSBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZScpITtcblx0XHRjbG9zZS5mb2N1cygpO1xuXHRcdGNvbnN0IGRpc21pc3NlZEZyb21JbnNpZGUgPSBkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudChob3N0LmNvbnRhaW5lcik7XG5cdFx0Y2xvc2UuY2xpY2soKTtcblxuXHRcdC8vIERpc21pc3NpbmcgZnJvbSBpbnNpZGUgdGhlIGNhcmQgbXVzdCBub3QgZHJvcCB0aGUgY2FyZXQgb24gdGhlIGJvZHkuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgZGlzbWlzc2VkRnJvbUluc2lkZSwgZm9jdXNlZDogaG9zdC5mb2N1c2VkIH0sXG5cdFx0XHR7IGRpc21pc3NlZEZyb21JbnNpZGU6IHRydWUsIGZvY3VzZWQ6IDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyBmb2N1cyBhbG9uZSB3aGVuIHRoZSBjYXJkIGlzIGRpc21pc3NlZCBmcm9tIGVsc2V3aGVyZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlcihzZXJ2aWNlLCBob3N0KSk7XG5cblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXHRcdGNvbnN0IGVsc2V3aGVyZSA9IGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZG9tLiQoJ2RpdicpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGVsc2V3aGVyZS5yZW1vdmUoKSkpO1xuXHRcdGVsc2V3aGVyZS50YWJJbmRleCA9IDA7XG5cdFx0ZWxzZXdoZXJlLmZvY3VzKCk7XG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY2xvc2UnKSEuY2xpY2soKTtcblxuXHRcdC8vIFRoZSB1c2VyIGFscmVhZHkgbW92ZWQgb247IHlhbmtpbmcgdGhlIGNhcmV0IGJhY2sgd291bGQgYmUgcnVkZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5mb2N1c2VkLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYXR0YWNoZXMgdG8gdGhlIG1vc3QgcmVjZW50bHkgZm9jdXNlZCBob3N0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlcihzZXJ2aWNlLCBmaXJzdCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlcihzZXJ2aWNlLCBzZWNvbmQpKTtcblxuXHRcdC8vIFRoZSByZW5kZXJlciBydW5uaW5nIHRoZXNlIHRlc3RzIGRvZXMgbm90IHJlbGlhYmx5IGhhbmQgb3V0IHJlYWwgZm9jdXMsXG5cdFx0Ly8gc28gcmFpc2UgdGhlIHNhbWUgZXZlbnQgdGhlIGZvY3VzIHRyYWNrZXIgbGlzdGVucyBmb3IuXG5cdFx0c2Vjb25kLnJvb3QuZm9jdXMoKTtcblx0XHRzZWNvbmQucm9vdC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdmb2N1cycpKTtcblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Zmlyc3Q6IGZpcnN0LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy12b2ljZS1tb2RlLW9uYm9hcmRpbmcnKSxcblx0XHRcdFx0c2Vjb25kOiBzZWNvbmQuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGFzLXZvaWNlLW1vZGUtb25ib2FyZGluZycpLFxuXHRcdFx0fSxcblx0XHRcdHsgZmlyc3Q6IGZhbHNlLCBzZWNvbmQ6IHRydWUgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYTtBQUN0QixTQUEwQixvQkFBb0I7QUFDOUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQW9EO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsK0JBQTJDO0FBQ3BE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
