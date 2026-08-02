import assert from "assert";
import * as dom from "../../../../../base/browser/dom.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { buildMicrophoneOptions, DictationOnboardingBanner, DictationOnboardingService, indexOfMicrophone } from "../../browser/speechToText/dictationOnboarding.js";
function device(kind, deviceId, label) {
  return { kind, deviceId, label, groupId: "", toJSON: () => ({}) };
}
suite("Dictation onboarding", () => {
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
    const container = dom.append(root, dom.$(".dictation-onboarding-container"));
    document.body.appendChild(root);
    store.add(toDisposable(() => root.remove()));
    return { root, container };
  }
  function createService(store, executed, telemetryEvents = []) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    if (executed) {
      instantiationService.stub(ICommandService, {
        executeCommand: async (id) => {
          executed.push(id);
        }
      });
    }
    instantiationService.stub(ITelemetryService, new TestTelemetryService(telemetryEvents));
    return store.add(instantiationService.createInstance(DictationOnboardingService));
  }
  test("labels the physical default microphone without listing it twice", () => {
    const options = buildMicrophoneOptions([
      // The virtual entries duplicate a real device under a synthetic id.
      device("audioinput", "default", "Default - Studio Mic"),
      device("audioinput", "communications", "Communications - Studio Mic"),
      device("audioinput", "mic-a", "Studio Mic"),
      // Same device reported twice, and a device that is not a microphone.
      device("audioinput", "mic-a", "Studio Mic"),
      device("audiooutput", "speaker-a", "Speakers"),
      // Labels stay empty until permission has been granted at least once.
      device("audioinput", "abcdefghij-unlabelled", "")
    ]);
    assert.deepStrictEqual(options, [
      { deviceId: "", label: "Studio Mic (System default)" },
      { deviceId: "abcdefghij-unlabelled", label: "Unknown device (abcdefgh)" }
    ]);
  });
  test("uses the first physical microphone when the virtual default has no identity", () => {
    const options = buildMicrophoneOptions([
      device("audioinput", "default", "System default"),
      device("audioinput", "mic-a", "Studio Mic"),
      device("audioinput", "mic-b", "Built-in Mic")
    ]);
    assert.deepStrictEqual(options, [
      { deviceId: "", label: "Studio Mic (System default)" },
      { deviceId: "mic-b", label: "Built-in Mic" }
    ]);
  });
  test("falls back to the system default when the remembered device is gone", () => {
    const options = buildMicrophoneOptions([
      device("audioinput", "default", "Default - Built-in Mic"),
      device("audioinput", "built-in", "Built-in Mic"),
      device("audioinput", "mic-a", "Studio Mic")
    ]);
    assert.deepStrictEqual(
      {
        remembered: indexOfMicrophone(options, "mic-a"),
        systemDefault: indexOfMicrophone(options, ""),
        unplugged: indexOfMicrophone(options, "mic-that-was-unplugged")
      },
      { remembered: 1, systemDefault: 0, unplugged: 0 }
    );
  });
  test("shows alongside the first dictation, then never returns", () => {
    const telemetryEvents = [];
    const service = createService(disposables, void 0, telemetryEvents);
    const host = createHost(disposables);
    disposables.add(service.registerHost(host.container, host.root));
    const shownFirstTime = service.showIfNeeded();
    const shown = host.container.classList.contains("has-dictation-onboarding");
    const closeIcon = host.container.querySelector(".dictation-onboarding-close .codicon")?.className;
    const hasMicrophoneControls = host.container.querySelector(".dictation-onboarding-device") !== null;
    const hasWaveform = host.container.querySelector(".dictation-onboarding-waveform") !== null;
    host.container.querySelector(".dictation-onboarding-close").click();
    const shownAgain = service.showIfNeeded();
    assert.deepStrictEqual(
      {
        shownFirstTime,
        shown,
        closeIcon,
        hasMicrophoneControls,
        hasWaveform,
        visibleAfterClose: host.container.classList.contains("has-dictation-onboarding"),
        shownAgain,
        telemetryEvents
      },
      {
        shownFirstTime: true,
        shown: true,
        closeIcon: "codicon codicon-close",
        hasMicrophoneControls: true,
        hasWaveform: true,
        visibleAfterClose: false,
        shownAgain: false,
        telemetryEvents: [
          { name: "dictationOnboarding.action", data: { action: "shown", source: "automatic" } },
          { name: "dictationOnboarding.action", data: { action: "close", source: "automatic" } }
        ]
      }
    );
  });
  test("shows populated microphone picker after dictation acquires permission without another capture", async () => {
    const host = createHost(disposables);
    let getUserMediaCalls = 0;
    const selectedDeviceIds = [];
    const mediaDevices = Object.assign(new EventTarget(), {
      enumerateDevices: async () => [
        device("audioinput", "default", "Default - Studio Mic"),
        device("audioinput", "studio", "Studio Mic"),
        device("audioinput", "built-in", "Built-in Mic")
      ],
      getUserMedia: async () => {
        getUserMediaCalls++;
        throw new Error("Automatic onboarding must not acquire a stream");
      }
    });
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const banner = disposables.add(instantiationService.createInstance(DictationOnboardingBanner, {
      container: host.container,
      onDismiss: () => {
      },
      previewMicrophone: false,
      source: "automatic"
    }, mediaDevices));
    const analyser = new class extends mock() {
      constructor() {
        super(...arguments);
        this.fftSize = 256;
      }
    }();
    await banner.refreshMicrophones(analyser, async (deviceId) => {
      selectedDeviceIds.push(deviceId);
      return analyser;
    });
    const picker = host.container.querySelector(".dictation-onboarding-picker select");
    picker.selectedIndex = 1;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    assert.deepStrictEqual(
      {
        pickerHidden: host.container.querySelector(".dictation-onboarding-picker")?.hidden,
        options: Array.from(host.container.querySelectorAll(".dictation-onboarding-picker option"), (option) => option.textContent),
        hasWaveform: host.container.querySelector(".dictation-onboarding-waveform") !== null,
        getUserMediaCalls,
        selectedDeviceIds
      },
      {
        pickerHidden: false,
        options: ["Studio Mic (System default)", "Built-in Mic"],
        hasWaveform: true,
        getUserMediaCalls: 0,
        selectedDeviceIds: ["built-in"]
      }
    );
  });
  test("escape dismisses the card", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(service.registerHost(host.container, host.root));
    service.showIfNeeded();
    host.container.querySelector(".dictation-onboarding-banner").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    assert.strictEqual(host.container.classList.contains("has-dictation-onboarding"), false);
  });
  test("dictates straight away when there is no chat input to dock to", () => {
    const service = createService(disposables);
    assert.strictEqual(service.showIfNeeded(), false);
  });
  test("showing again replaces the card rather than hiding it", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(service.registerHost(host.container, host.root));
    service.show();
    service.show();
    assert.deepStrictEqual(
      {
        visible: host.container.classList.contains("has-dictation-onboarding"),
        cards: host.container.querySelectorAll(".dictation-onboarding-banner").length,
        hasMicrophoneControls: host.container.querySelector(".dictation-onboarding-device") !== null,
        hasWaveform: host.container.querySelector(".dictation-onboarding-waveform") !== null,
        microphonePickerHidden: host.container.querySelector(".dictation-onboarding-picker")?.hidden
      },
      { visible: true, cards: 1, hasMicrophoneControls: true, hasWaveform: true, microphonePickerHidden: true }
    );
  });
  test("reset shows the introduction on the next dictation", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(service.registerHost(host.container, host.root));
    service.showIfNeeded();
    host.container.querySelector(".dictation-onboarding-close").click();
    service.reset();
    assert.strictEqual(service.showIfNeeded(), true);
  });
  test("attaches to the most recently focused host", () => {
    const service = createService(disposables);
    const first = createHost(disposables);
    const second = createHost(disposables);
    disposables.add(service.registerHost(first.container, first.root));
    disposables.add(service.registerHost(second.container, second.root));
    second.root.focus();
    second.root.dispatchEvent(new FocusEvent("focus"));
    service.showIfNeeded();
    assert.deepStrictEqual(
      {
        first: first.container.classList.contains("has-dictation-onboarding"),
        second: second.container.classList.contains("has-dictation-onboarding")
      },
      { first: false, second: true }
    );
  });
  test("offers a way to change the settings and how dictation writes", () => {
    const executed = [];
    const telemetryEvents = [];
    const service = createService(disposables, executed, telemetryEvents);
    const host = createHost(disposables);
    disposables.add(service.registerHost(host.container, host.root));
    service.show();
    const links = host.container.querySelectorAll(".dictation-onboarding-description a");
    links.forEach((link) => link.click());
    assert.deepStrictEqual(
      {
        count: links.length,
        // Every link has to be reachable without a mouse, not just the first.
        keyboardReachable: Array.from(links).every((link) => link.tabIndex === 0),
        executed,
        telemetryEvents
      },
      {
        count: 2,
        keyboardReachable: true,
        executed: ["workbench.action.openSettings", "workbench.action.chat.configureDictationInstructions"],
        telemetryEvents: [
          { name: "dictationOnboarding.action", data: { action: "shown", source: "manual" } },
          { name: "dictationOnboarding.action", data: { action: "openSettings", source: "manual" } },
          { name: "dictationOnboarding.action", data: { action: "openInstructions", source: "manual" } }
        ]
      }
    );
  });
  test("disposing the host it is docked to takes the card down with it", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    const registration = service.registerHost(host.container, host.root);
    service.show();
    registration.dispose();
    assert.deepStrictEqual(
      {
        visible: host.container.classList.contains("has-dictation-onboarding"),
        cards: host.container.querySelectorAll(".dictation-onboarding-banner").length
      },
      { visible: false, cards: 0 }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2RpY3RhdGlvbk9uYm9hcmRpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgYnVpbGRNaWNyb3Bob25lT3B0aW9ucywgRGljdGF0aW9uT25ib2FyZGluZ0Jhbm5lciwgRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UsIGluZGV4T2ZNaWNyb3Bob25lIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uT25ib2FyZGluZy5qcyc7XG5cbi8qKiBNaW5pbWFsIHN0YW5kLWluIGZvciB0aGUgYnJvd3NlcidzIGRldmljZSBkZXNjcmlwdG9yLiAqL1xuZnVuY3Rpb24gZGV2aWNlKGtpbmQ6IE1lZGlhRGV2aWNlS2luZCwgZGV2aWNlSWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyk6IE1lZGlhRGV2aWNlSW5mbyB7XG5cdHJldHVybiB7IGtpbmQsIGRldmljZUlkLCBsYWJlbCwgZ3JvdXBJZDogJycsIHRvSlNPTjogKCkgPT4gKHt9KSB9O1xufVxuXG5zdWl0ZSgnRGljdGF0aW9uIG9uYm9hcmRpbmcnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0aW50ZXJmYWNlIElUZWxlbWV0cnlFdmVudCB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgZGF0YTogdW5rbm93biB9XG5cblx0Y2xhc3MgVGVzdFRlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGV2ZW50czogSVRlbGVtZXRyeUV2ZW50W10pIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRpZiAoZXZlbnROYW1lKSB7XG5cdFx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSG9zdChzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IHsgcm9vdDogSFRNTEVsZW1lbnQ7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfSB7XG5cdFx0Y29uc3Qgcm9vdCA9IGRvbS4kKCdkaXYnKTtcblx0XHRyb290LnRhYkluZGV4ID0gMDtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uYXBwZW5kKHJvb3QsIGRvbS4kKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctY29udGFpbmVyJykpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocm9vdCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByb290LnJlbW92ZSgpKSk7XG5cdFx0cmV0dXJuIHsgcm9vdCwgY29udGFpbmVyIH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBleGVjdXRlZD86IHN0cmluZ1tdLCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW10pOiBEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRpZiAoZXhlY3V0ZWQpIHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7XG5cdFx0XHRcdGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoaWQ6IHN0cmluZykgPT4geyBleGVjdXRlZC5wdXNoKGlkKTsgfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdH1cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UodGVsZW1ldHJ5RXZlbnRzKSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSkpO1xuXHR9XG5cblx0dGVzdCgnbGFiZWxzIHRoZSBwaHlzaWNhbCBkZWZhdWx0IG1pY3JvcGhvbmUgd2l0aG91dCBsaXN0aW5nIGl0IHR3aWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBidWlsZE1pY3JvcGhvbmVPcHRpb25zKFtcblx0XHRcdC8vIFRoZSB2aXJ0dWFsIGVudHJpZXMgZHVwbGljYXRlIGEgcmVhbCBkZXZpY2UgdW5kZXIgYSBzeW50aGV0aWMgaWQuXG5cdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnZGVmYXVsdCcsICdEZWZhdWx0IC0gU3R1ZGlvIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2NvbW11bmljYXRpb25zJywgJ0NvbW11bmljYXRpb25zIC0gU3R1ZGlvIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdC8vIFNhbWUgZGV2aWNlIHJlcG9ydGVkIHR3aWNlLCBhbmQgYSBkZXZpY2UgdGhhdCBpcyBub3QgYSBtaWNyb3Bob25lLlxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdGRldmljZSgnYXVkaW9vdXRwdXQnLCAnc3BlYWtlci1hJywgJ1NwZWFrZXJzJyksXG5cdFx0XHQvLyBMYWJlbHMgc3RheSBlbXB0eSB1bnRpbCBwZXJtaXNzaW9uIGhhcyBiZWVuIGdyYW50ZWQgYXQgbGVhc3Qgb25jZS5cblx0XHRcdGRldmljZSgnYXVkaW9pbnB1dCcsICdhYmNkZWZnaGlqLXVubGFiZWxsZWQnLCAnJyksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMsIFtcblx0XHRcdHsgZGV2aWNlSWQ6ICcnLCBsYWJlbDogJ1N0dWRpbyBNaWMgKFN5c3RlbSBkZWZhdWx0KScgfSxcblx0XHRcdHsgZGV2aWNlSWQ6ICdhYmNkZWZnaGlqLXVubGFiZWxsZWQnLCBsYWJlbDogJ1Vua25vd24gZGV2aWNlIChhYmNkZWZnaCknIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGZpcnN0IHBoeXNpY2FsIG1pY3JvcGhvbmUgd2hlbiB0aGUgdmlydHVhbCBkZWZhdWx0IGhhcyBubyBpZGVudGl0eScsICgpID0+IHtcblx0XHRjb25zdCBvcHRpb25zID0gYnVpbGRNaWNyb3Bob25lT3B0aW9ucyhbXG5cdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnZGVmYXVsdCcsICdTeXN0ZW0gZGVmYXVsdCcpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdGRldmljZSgnYXVkaW9pbnB1dCcsICdtaWMtYicsICdCdWlsdC1pbiBNaWMnKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucywgW1xuXHRcdFx0eyBkZXZpY2VJZDogJycsIGxhYmVsOiAnU3R1ZGlvIE1pYyAoU3lzdGVtIGRlZmF1bHQpJyB9LFxuXHRcdFx0eyBkZXZpY2VJZDogJ21pYy1iJywgbGFiZWw6ICdCdWlsdC1pbiBNaWMnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHN5c3RlbSBkZWZhdWx0IHdoZW4gdGhlIHJlbWVtYmVyZWQgZGV2aWNlIGlzIGdvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGJ1aWxkTWljcm9waG9uZU9wdGlvbnMoW1xuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2RlZmF1bHQnLCAnRGVmYXVsdCAtIEJ1aWx0LWluIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2J1aWx0LWluJywgJ0J1aWx0LWluIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHJlbWVtYmVyZWQ6IGluZGV4T2ZNaWNyb3Bob25lKG9wdGlvbnMsICdtaWMtYScpLFxuXHRcdFx0XHRzeXN0ZW1EZWZhdWx0OiBpbmRleE9mTWljcm9waG9uZShvcHRpb25zLCAnJyksXG5cdFx0XHRcdHVucGx1Z2dlZDogaW5kZXhPZk1pY3JvcGhvbmUob3B0aW9ucywgJ21pYy10aGF0LXdhcy11bnBsdWdnZWQnKSxcblx0XHRcdH0sXG5cdFx0XHR7IHJlbWVtYmVyZWQ6IDEsIHN5c3RlbURlZmF1bHQ6IDAsIHVucGx1Z2dlZDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgYWxvbmdzaWRlIHRoZSBmaXJzdCBkaWN0YXRpb24sIHRoZW4gbmV2ZXIgcmV0dXJucycsICgpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW107XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMsIHVuZGVmaW5lZCwgdGVsZW1ldHJ5RXZlbnRzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJIb3N0KGhvc3QuY29udGFpbmVyLCBob3N0LnJvb3QpKTtcblxuXHRcdGNvbnN0IHNob3duRmlyc3RUaW1lID0gc2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRjb25zdCBzaG93biA9IGhvc3QuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGFzLWRpY3RhdGlvbi1vbmJvYXJkaW5nJyk7XG5cblx0XHRjb25zdCBjbG9zZUljb24gPSBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctY2xvc2UgLmNvZGljb24nKT8uY2xhc3NOYW1lO1xuXHRcdGNvbnN0IGhhc01pY3JvcGhvbmVDb250cm9scyA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kaWN0YXRpb24tb25ib2FyZGluZy1kZXZpY2UnKSAhPT0gbnVsbDtcblx0XHRjb25zdCBoYXNXYXZlZm9ybSA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kaWN0YXRpb24tb25ib2FyZGluZy13YXZlZm9ybScpICE9PSBudWxsO1xuXHRcdGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctY2xvc2UnKSEuY2xpY2soKTtcblx0XHRjb25zdCBzaG93bkFnYWluID0gc2VydmljZS5zaG93SWZOZWVkZWQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHNob3duRmlyc3RUaW1lLCBzaG93biwgY2xvc2VJY29uLFxuXHRcdFx0XHRoYXNNaWNyb3Bob25lQ29udHJvbHMsXG5cdFx0XHRcdGhhc1dhdmVmb3JtLFxuXHRcdFx0XHR2aXNpYmxlQWZ0ZXJDbG9zZTogaG9zdC5jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtZGljdGF0aW9uLW9uYm9hcmRpbmcnKSxcblx0XHRcdFx0c2hvd25BZ2Fpbixcblx0XHRcdFx0dGVsZW1ldHJ5RXZlbnRzLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2hvd25GaXJzdFRpbWU6IHRydWUsIHNob3duOiB0cnVlLCBjbG9zZUljb246ICdjb2RpY29uIGNvZGljb24tY2xvc2UnLFxuXHRcdFx0XHRoYXNNaWNyb3Bob25lQ29udHJvbHM6IHRydWUsXG5cdFx0XHRcdGhhc1dhdmVmb3JtOiB0cnVlLFxuXHRcdFx0XHR2aXNpYmxlQWZ0ZXJDbG9zZTogZmFsc2UsXG5cdFx0XHRcdHNob3duQWdhaW46IGZhbHNlLFxuXHRcdFx0XHR0ZWxlbWV0cnlFdmVudHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICdkaWN0YXRpb25PbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnc2hvd24nLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdkaWN0YXRpb25PbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnY2xvc2UnLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBwb3B1bGF0ZWQgbWljcm9waG9uZSBwaWNrZXIgYWZ0ZXIgZGljdGF0aW9uIGFjcXVpcmVzIHBlcm1pc3Npb24gd2l0aG91dCBhbm90aGVyIGNhcHR1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGxldCBnZXRVc2VyTWVkaWFDYWxscyA9IDA7XG5cdFx0Y29uc3Qgc2VsZWN0ZWREZXZpY2VJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgbWVkaWFEZXZpY2VzID0gT2JqZWN0LmFzc2lnbihuZXcgRXZlbnRUYXJnZXQoKSwge1xuXHRcdFx0ZW51bWVyYXRlRGV2aWNlczogYXN5bmMgKCkgPT4gW1xuXHRcdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnZGVmYXVsdCcsICdEZWZhdWx0IC0gU3R1ZGlvIE1pYycpLFxuXHRcdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnc3R1ZGlvJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2J1aWx0LWluJywgJ0J1aWx0LWluIE1pYycpLFxuXHRcdFx0XSxcblx0XHRcdGdldFVzZXJNZWRpYTogYXN5bmMgKCk6IFByb21pc2U8TWVkaWFTdHJlYW0+ID0+IHtcblx0XHRcdFx0Z2V0VXNlck1lZGlhQ2FsbHMrKztcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdXRvbWF0aWMgb25ib2FyZGluZyBtdXN0IG5vdCBhY3F1aXJlIGEgc3RyZWFtJyk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgYmFubmVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpY3RhdGlvbk9uYm9hcmRpbmdCYW5uZXIsIHtcblx0XHRcdGNvbnRhaW5lcjogaG9zdC5jb250YWluZXIsXG5cdFx0XHRvbkRpc21pc3M6ICgpID0+IHsgfSxcblx0XHRcdHByZXZpZXdNaWNyb3Bob25lOiBmYWxzZSxcblx0XHRcdHNvdXJjZTogJ2F1dG9tYXRpYycsXG5cdFx0fSwgbWVkaWFEZXZpY2VzKSk7XG5cblx0XHRjb25zdCBhbmFseXNlciA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8QW5hbHlzZXJOb2RlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZmdFNpemUgPSAyNTY7XG5cdFx0fTtcblx0XHRhd2FpdCBiYW5uZXIucmVmcmVzaE1pY3JvcGhvbmVzKGFuYWx5c2VyLCBhc3luYyBkZXZpY2VJZCA9PiB7XG5cdFx0XHRzZWxlY3RlZERldmljZUlkcy5wdXNoKGRldmljZUlkKTtcblx0XHRcdHJldHVybiBhbmFseXNlcjtcblx0XHR9KTtcblx0XHRjb25zdCBwaWNrZXIgPSBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxTZWxlY3RFbGVtZW50PignLmRpY3RhdGlvbi1vbmJvYXJkaW5nLXBpY2tlciBzZWxlY3QnKSE7XG5cdFx0cGlja2VyLnNlbGVjdGVkSW5kZXggPSAxO1xuXHRcdHBpY2tlci5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHBpY2tlckhpZGRlbjogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5kaWN0YXRpb24tb25ib2FyZGluZy1waWNrZXInKT8uaGlkZGVuLFxuXHRcdFx0XHRvcHRpb25zOiBBcnJheS5mcm9tKGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTE9wdGlvbkVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctcGlja2VyIG9wdGlvbicpLCBvcHRpb24gPT4gb3B0aW9uLnRleHRDb250ZW50KSxcblx0XHRcdFx0aGFzV2F2ZWZvcm06IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kaWN0YXRpb24tb25ib2FyZGluZy13YXZlZm9ybScpICE9PSBudWxsLFxuXHRcdFx0XHRnZXRVc2VyTWVkaWFDYWxscyxcblx0XHRcdFx0c2VsZWN0ZWREZXZpY2VJZHMsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwaWNrZXJIaWRkZW46IGZhbHNlLFxuXHRcdFx0XHRvcHRpb25zOiBbJ1N0dWRpbyBNaWMgKFN5c3RlbSBkZWZhdWx0KScsICdCdWlsdC1pbiBNaWMnXSxcblx0XHRcdFx0aGFzV2F2ZWZvcm06IHRydWUsXG5cdFx0XHRcdGdldFVzZXJNZWRpYUNhbGxzOiAwLFxuXHRcdFx0XHRzZWxlY3RlZERldmljZUlkczogWydidWlsdC1pbiddLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZSBkaXNtaXNzZXMgdGhlIGNhcmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3QoaG9zdC5jb250YWluZXIsIGhvc3Qucm9vdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWJhbm5lcicpIVxuXHRcdFx0LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VzY2FwZScsIGtleUNvZGU6IDI3LCBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1kaWN0YXRpb24tb25ib2FyZGluZycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpY3RhdGVzIHN0cmFpZ2h0IGF3YXkgd2hlbiB0aGVyZSBpcyBubyBjaGF0IGlucHV0IHRvIGRvY2sgdG8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd2luZyBhZ2FpbiByZXBsYWNlcyB0aGUgY2FyZCByYXRoZXIgdGhhbiBoaWRpbmcgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3QoaG9zdC5jb250YWluZXIsIGhvc3Qucm9vdCkpO1xuXG5cdFx0c2VydmljZS5zaG93KCk7XG5cdFx0c2VydmljZS5zaG93KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHR2aXNpYmxlOiBob3N0LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1kaWN0YXRpb24tb25ib2FyZGluZycpLFxuXHRcdFx0XHRjYXJkczogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWJhbm5lcicpLmxlbmd0aCxcblx0XHRcdFx0aGFzTWljcm9waG9uZUNvbnRyb2xzOiBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctZGV2aWNlJykgIT09IG51bGwsXG5cdFx0XHRcdGhhc1dhdmVmb3JtOiBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctd2F2ZWZvcm0nKSAhPT0gbnVsbCxcblx0XHRcdFx0bWljcm9waG9uZVBpY2tlckhpZGRlbjogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5kaWN0YXRpb24tb25ib2FyZGluZy1waWNrZXInKT8uaGlkZGVuLFxuXHRcdFx0fSxcblx0XHRcdHsgdmlzaWJsZTogdHJ1ZSwgY2FyZHM6IDEsIGhhc01pY3JvcGhvbmVDb250cm9sczogdHJ1ZSwgaGFzV2F2ZWZvcm06IHRydWUsIG1pY3JvcGhvbmVQaWNrZXJIaWRkZW46IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2V0IHNob3dzIHRoZSBpbnRyb2R1Y3Rpb24gb24gdGhlIG5leHQgZGljdGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJIb3N0KGhvc3QuY29udGFpbmVyLCBob3N0LnJvb3QpKTtcblxuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5kaWN0YXRpb24tb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXHRcdHNlcnZpY2UucmVzZXQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnNob3dJZk5lZWRlZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYXR0YWNoZXMgdG8gdGhlIG1vc3QgcmVjZW50bHkgZm9jdXNlZCBob3N0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVySG9zdChmaXJzdC5jb250YWluZXIsIGZpcnN0LnJvb3QpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3Qoc2Vjb25kLmNvbnRhaW5lciwgc2Vjb25kLnJvb3QpKTtcblxuXHRcdC8vIFRoZSByZW5kZXJlciBydW5uaW5nIHRoZXNlIHRlc3RzIGRvZXMgbm90IHJlbGlhYmx5IGhhbmQgb3V0IHJlYWwgZm9jdXMsXG5cdFx0Ly8gc28gcmFpc2UgdGhlIHNhbWUgZXZlbnQgdGhlIGZvY3VzIHRyYWNrZXIgbGlzdGVucyBmb3IuXG5cdFx0c2Vjb25kLnJvb3QuZm9jdXMoKTtcblx0XHRzZWNvbmQucm9vdC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdmb2N1cycpKTtcblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Zmlyc3Q6IGZpcnN0LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1kaWN0YXRpb24tb25ib2FyZGluZycpLFxuXHRcdFx0XHRzZWNvbmQ6IHNlY29uZC5jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtZGljdGF0aW9uLW9uYm9hcmRpbmcnKSxcblx0XHRcdH0sXG5cdFx0XHR7IGZpcnN0OiBmYWxzZSwgc2Vjb25kOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZlcnMgYSB3YXkgdG8gY2hhbmdlIHRoZSBzZXR0aW5ncyBhbmQgaG93IGRpY3RhdGlvbiB3cml0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhlY3V0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgdGVsZW1ldHJ5RXZlbnRzOiBJVGVsZW1ldHJ5RXZlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzLCBleGVjdXRlZCwgdGVsZW1ldHJ5RXZlbnRzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJIb3N0KGhvc3QuY29udGFpbmVyLCBob3N0LnJvb3QpKTtcblxuXHRcdHNlcnZpY2Uuc2hvdygpO1xuXHRcdGNvbnN0IGxpbmtzID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MQW5jaG9yRWxlbWVudD4oJy5kaWN0YXRpb24tb25ib2FyZGluZy1kZXNjcmlwdGlvbiBhJyk7XG5cdFx0bGlua3MuZm9yRWFjaChsaW5rID0+IGxpbmsuY2xpY2soKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRjb3VudDogbGlua3MubGVuZ3RoLFxuXHRcdFx0XHQvLyBFdmVyeSBsaW5rIGhhcyB0byBiZSByZWFjaGFibGUgd2l0aG91dCBhIG1vdXNlLCBub3QganVzdCB0aGUgZmlyc3QuXG5cdFx0XHRcdGtleWJvYXJkUmVhY2hhYmxlOiBBcnJheS5mcm9tKGxpbmtzKS5ldmVyeShsaW5rID0+IGxpbmsudGFiSW5kZXggPT09IDApLFxuXHRcdFx0XHRleGVjdXRlZCxcblx0XHRcdFx0dGVsZW1ldHJ5RXZlbnRzLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y291bnQ6IDIsXG5cdFx0XHRcdGtleWJvYXJkUmVhY2hhYmxlOiB0cnVlLFxuXHRcdFx0XHRleGVjdXRlZDogWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29uZmlndXJlRGljdGF0aW9uSW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRcdHRlbGVtZXRyeUV2ZW50czogW1xuXHRcdFx0XHRcdHsgbmFtZTogJ2RpY3RhdGlvbk9uYm9hcmRpbmcuYWN0aW9uJywgZGF0YTogeyBhY3Rpb246ICdzaG93bicsIHNvdXJjZTogJ21hbnVhbCcgfSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ2RpY3RhdGlvbk9uYm9hcmRpbmcuYWN0aW9uJywgZGF0YTogeyBhY3Rpb246ICdvcGVuU2V0dGluZ3MnLCBzb3VyY2U6ICdtYW51YWwnIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdkaWN0YXRpb25PbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnb3Blbkluc3RydWN0aW9ucycsIHNvdXJjZTogJ21hbnVhbCcgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2luZyB0aGUgaG9zdCBpdCBpcyBkb2NrZWQgdG8gdGFrZXMgdGhlIGNhcmQgZG93biB3aXRoIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gc2VydmljZS5yZWdpc3Rlckhvc3QoaG9zdC5jb250YWluZXIsIGhvc3Qucm9vdCk7XG5cblx0XHRzZXJ2aWNlLnNob3coKTtcblx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dmlzaWJsZTogaG9zdC5jb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtZGljdGF0aW9uLW9uYm9hcmRpbmcnKSxcblx0XHRcdFx0Y2FyZHM6IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kaWN0YXRpb24tb25ib2FyZGluZy1iYW5uZXInKS5sZW5ndGgsXG5cdFx0XHR9LFxuXHRcdFx0eyB2aXNpYmxlOiBmYWxzZSwgY2FyZHM6IDAgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQTBCLG9CQUFvQjtBQUM5QyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx3QkFBd0IsMkJBQTJCLDRCQUE0Qix5QkFBeUI7QUFHakgsU0FBUyxPQUFPLE1BQXVCLFVBQWtCLE9BQWdDO0FBQ3hGLFNBQU8sRUFBRSxNQUFNLFVBQVUsT0FBTyxTQUFTLElBQUksUUFBUSxPQUFPLENBQUMsR0FBRztBQUNqRTtBQUVBLE1BQU0sd0JBQXdCLE1BQU07QUFFbkMsUUFBTSxjQUFjLHdDQUF3QztBQUFBLEVBRzVELE1BQU0sNkJBQTZCLDBCQUEwQjtBQUFBLElBQzVELFlBQTZCLFFBQTJCO0FBQ3ZELFlBQU07QUFEc0I7QUFBQSxJQUU3QjtBQUFBLElBRVMsV0FBVyxXQUFvQixNQUFzQjtBQUM3RCxVQUFJLFdBQVc7QUFDZCxhQUFLLE9BQU8sS0FBSyxFQUFFLE1BQU0sV0FBVyxLQUFLLENBQUM7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsV0FBUyxXQUFXLE9BQW9GO0FBQ3ZHLFVBQU0sT0FBTyxJQUFJLEVBQUUsS0FBSztBQUN4QixTQUFLLFdBQVc7QUFDaEIsVUFBTSxZQUFZLElBQUksT0FBTyxNQUFNLElBQUksRUFBRSxpQ0FBaUMsQ0FBQztBQUMzRSxhQUFTLEtBQUssWUFBWSxJQUFJO0FBQzlCLFVBQU0sSUFBSSxhQUFhLE1BQU0sS0FBSyxPQUFPLENBQUMsQ0FBQztBQUMzQyxXQUFPLEVBQUUsTUFBTSxVQUFVO0FBQUEsRUFDMUI7QUFFQSxXQUFTLGNBQWMsT0FBcUMsVUFBcUIsa0JBQXFDLENBQUMsR0FBK0I7QUFDckosVUFBTSx1QkFBdUIsOEJBQThCLFFBQVcsS0FBSztBQUMzRSxRQUFJLFVBQVU7QUFDYiwyQkFBcUIsS0FBSyxpQkFBaUI7QUFBQSxRQUMxQyxnQkFBZ0IsT0FBTyxPQUFlO0FBQUUsbUJBQVMsS0FBSyxFQUFFO0FBQUEsUUFBRztBQUFBLE1BQzVELENBQStCO0FBQUEsSUFDaEM7QUFDQSx5QkFBcUIsS0FBSyxtQkFBbUIsSUFBSSxxQkFBcUIsZUFBZSxDQUFDO0FBQ3RGLFdBQU8sTUFBTSxJQUFJLHFCQUFxQixlQUFlLDBCQUEwQixDQUFDO0FBQUEsRUFDakY7QUFFQSxPQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFVBQU0sVUFBVSx1QkFBdUI7QUFBQTtBQUFBLE1BRXRDLE9BQU8sY0FBYyxXQUFXLHNCQUFzQjtBQUFBLE1BQ3RELE9BQU8sY0FBYyxrQkFBa0IsNkJBQTZCO0FBQUEsTUFDcEUsT0FBTyxjQUFjLFNBQVMsWUFBWTtBQUFBO0FBQUEsTUFFMUMsT0FBTyxjQUFjLFNBQVMsWUFBWTtBQUFBLE1BQzFDLE9BQU8sZUFBZSxhQUFhLFVBQVU7QUFBQTtBQUFBLE1BRTdDLE9BQU8sY0FBYyx5QkFBeUIsRUFBRTtBQUFBLElBQ2pELENBQUM7QUFFRCxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsRUFBRSxVQUFVLElBQUksT0FBTyw4QkFBOEI7QUFBQSxNQUNyRCxFQUFFLFVBQVUseUJBQXlCLE9BQU8sNEJBQTRCO0FBQUEsSUFDekUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0VBQStFLE1BQU07QUFDekYsVUFBTSxVQUFVLHVCQUF1QjtBQUFBLE1BQ3RDLE9BQU8sY0FBYyxXQUFXLGdCQUFnQjtBQUFBLE1BQ2hELE9BQU8sY0FBYyxTQUFTLFlBQVk7QUFBQSxNQUMxQyxPQUFPLGNBQWMsU0FBUyxjQUFjO0FBQUEsSUFDN0MsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUMvQixFQUFFLFVBQVUsSUFBSSxPQUFPLDhCQUE4QjtBQUFBLE1BQ3JELEVBQUUsVUFBVSxTQUFTLE9BQU8sZUFBZTtBQUFBLElBQzVDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFVBQU0sVUFBVSx1QkFBdUI7QUFBQSxNQUN0QyxPQUFPLGNBQWMsV0FBVyx3QkFBd0I7QUFBQSxNQUN4RCxPQUFPLGNBQWMsWUFBWSxjQUFjO0FBQUEsTUFDL0MsT0FBTyxjQUFjLFNBQVMsWUFBWTtBQUFBLElBQzNDLENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsWUFBWSxrQkFBa0IsU0FBUyxPQUFPO0FBQUEsUUFDOUMsZUFBZSxrQkFBa0IsU0FBUyxFQUFFO0FBQUEsUUFDNUMsV0FBVyxrQkFBa0IsU0FBUyx3QkFBd0I7QUFBQSxNQUMvRDtBQUFBLE1BQ0EsRUFBRSxZQUFZLEdBQUcsZUFBZSxHQUFHLFdBQVcsRUFBRTtBQUFBLElBQUM7QUFBQSxFQUNuRCxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLGtCQUFxQyxDQUFDO0FBQzVDLFVBQU0sVUFBVSxjQUFjLGFBQWEsUUFBVyxlQUFlO0FBQ3JFLFVBQU0sT0FBTyxXQUFXLFdBQVc7QUFDbkMsZ0JBQVksSUFBSSxRQUFRLGFBQWEsS0FBSyxXQUFXLEtBQUssSUFBSSxDQUFDO0FBRS9ELFVBQU0saUJBQWlCLFFBQVEsYUFBYTtBQUM1QyxVQUFNLFFBQVEsS0FBSyxVQUFVLFVBQVUsU0FBUywwQkFBMEI7QUFFMUUsVUFBTSxZQUFZLEtBQUssVUFBVSxjQUFjLHNDQUFzQyxHQUFHO0FBQ3hGLFVBQU0sd0JBQXdCLEtBQUssVUFBVSxjQUFjLDhCQUE4QixNQUFNO0FBQy9GLFVBQU0sY0FBYyxLQUFLLFVBQVUsY0FBYyxnQ0FBZ0MsTUFBTTtBQUN2RixTQUFLLFVBQVUsY0FBMkIsNkJBQTZCLEVBQUcsTUFBTTtBQUNoRixVQUFNLGFBQWEsUUFBUSxhQUFhO0FBRXhDLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQztBQUFBLFFBQWdCO0FBQUEsUUFBTztBQUFBLFFBQ3ZCO0FBQUEsUUFDQTtBQUFBLFFBQ0EsbUJBQW1CLEtBQUssVUFBVSxVQUFVLFNBQVMsMEJBQTBCO0FBQUEsUUFDL0U7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLGdCQUFnQjtBQUFBLFFBQU0sT0FBTztBQUFBLFFBQU0sV0FBVztBQUFBLFFBQzlDLHVCQUF1QjtBQUFBLFFBQ3ZCLGFBQWE7QUFBQSxRQUNiLG1CQUFtQjtBQUFBLFFBQ25CLFlBQVk7QUFBQSxRQUNaLGlCQUFpQjtBQUFBLFVBQ2hCLEVBQUUsTUFBTSw4QkFBOEIsTUFBTSxFQUFFLFFBQVEsU0FBUyxRQUFRLFlBQVksRUFBRTtBQUFBLFVBQ3JGLEVBQUUsTUFBTSw4QkFBOEIsTUFBTSxFQUFFLFFBQVEsU0FBUyxRQUFRLFlBQVksRUFBRTtBQUFBLFFBQ3RGO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLGlHQUFpRyxZQUFZO0FBQ2pILFVBQU0sT0FBTyxXQUFXLFdBQVc7QUFDbkMsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxvQkFBOEIsQ0FBQztBQUNyQyxVQUFNLGVBQWUsT0FBTyxPQUFPLElBQUksWUFBWSxHQUFHO0FBQUEsTUFDckQsa0JBQWtCLFlBQVk7QUFBQSxRQUM3QixPQUFPLGNBQWMsV0FBVyxzQkFBc0I7QUFBQSxRQUN0RCxPQUFPLGNBQWMsVUFBVSxZQUFZO0FBQUEsUUFDM0MsT0FBTyxjQUFjLFlBQVksY0FBYztBQUFBLE1BQ2hEO0FBQUEsTUFDQSxjQUFjLFlBQWtDO0FBQy9DO0FBQ0EsY0FBTSxJQUFJLE1BQU0sZ0RBQWdEO0FBQUEsTUFDakU7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLHVCQUF1Qiw4QkFBOEIsUUFBVyxXQUFXO0FBQ2pGLFVBQU0sU0FBUyxZQUFZLElBQUkscUJBQXFCLGVBQWUsMkJBQTJCO0FBQUEsTUFDN0YsV0FBVyxLQUFLO0FBQUEsTUFDaEIsV0FBVyxNQUFNO0FBQUEsTUFBRTtBQUFBLE1BQ25CLG1CQUFtQjtBQUFBLE1BQ25CLFFBQVE7QUFBQSxJQUNULEdBQUcsWUFBWSxDQUFDO0FBRWhCLFVBQU0sV0FBVyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLE1BQW5DO0FBQUE7QUFDcEIsYUFBa0IsVUFBVTtBQUFBO0FBQUEsSUFDN0I7QUFDQSxVQUFNLE9BQU8sbUJBQW1CLFVBQVUsT0FBTSxhQUFZO0FBQzNELHdCQUFrQixLQUFLLFFBQVE7QUFDL0IsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUNELFVBQU0sU0FBUyxLQUFLLFVBQVUsY0FBaUMscUNBQXFDO0FBQ3BHLFdBQU8sZ0JBQWdCO0FBQ3ZCLFdBQU8sY0FBYyxJQUFJLE1BQU0sVUFBVSxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFFM0QsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLGNBQWMsS0FBSyxVQUFVLGNBQTJCLDhCQUE4QixHQUFHO0FBQUEsUUFDekYsU0FBUyxNQUFNLEtBQUssS0FBSyxVQUFVLGlCQUFvQyxxQ0FBcUMsR0FBRyxZQUFVLE9BQU8sV0FBVztBQUFBLFFBQzNJLGFBQWEsS0FBSyxVQUFVLGNBQWMsZ0NBQWdDLE1BQU07QUFBQSxRQUNoRjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsY0FBYztBQUFBLFFBQ2QsU0FBUyxDQUFDLCtCQUErQixjQUFjO0FBQUEsUUFDdkQsYUFBYTtBQUFBLFFBQ2IsbUJBQW1CO0FBQUEsUUFDbkIsbUJBQW1CLENBQUMsVUFBVTtBQUFBLE1BQy9CO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssNkJBQTZCLE1BQU07QUFDdkMsVUFBTSxVQUFVLGNBQWMsV0FBVztBQUN6QyxVQUFNLE9BQU8sV0FBVyxXQUFXO0FBQ25DLGdCQUFZLElBQUksUUFBUSxhQUFhLEtBQUssV0FBVyxLQUFLLElBQUksQ0FBQztBQUUvRCxZQUFRLGFBQWE7QUFDckIsU0FBSyxVQUFVLGNBQTJCLDhCQUE4QixFQUN0RSxjQUFjLElBQUksY0FBYyxXQUFXLEVBQUUsS0FBSyxVQUFVLFNBQVMsSUFBSSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBRTNGLFdBQU8sWUFBWSxLQUFLLFVBQVUsVUFBVSxTQUFTLDBCQUEwQixHQUFHLEtBQUs7QUFBQSxFQUN4RixDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFNLFVBQVUsY0FBYyxXQUFXO0FBRXpDLFdBQU8sWUFBWSxRQUFRLGFBQWEsR0FBRyxLQUFLO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxVQUFVLGNBQWMsV0FBVztBQUN6QyxVQUFNLE9BQU8sV0FBVyxXQUFXO0FBQ25DLGdCQUFZLElBQUksUUFBUSxhQUFhLEtBQUssV0FBVyxLQUFLLElBQUksQ0FBQztBQUUvRCxZQUFRLEtBQUs7QUFDYixZQUFRLEtBQUs7QUFFYixXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsU0FBUyxLQUFLLFVBQVUsVUFBVSxTQUFTLDBCQUEwQjtBQUFBLFFBQ3JFLE9BQU8sS0FBSyxVQUFVLGlCQUFpQiw4QkFBOEIsRUFBRTtBQUFBLFFBQ3ZFLHVCQUF1QixLQUFLLFVBQVUsY0FBYyw4QkFBOEIsTUFBTTtBQUFBLFFBQ3hGLGFBQWEsS0FBSyxVQUFVLGNBQWMsZ0NBQWdDLE1BQU07QUFBQSxRQUNoRix3QkFBd0IsS0FBSyxVQUFVLGNBQTJCLDhCQUE4QixHQUFHO0FBQUEsTUFDcEc7QUFBQSxNQUNBLEVBQUUsU0FBUyxNQUFNLE9BQU8sR0FBRyx1QkFBdUIsTUFBTSxhQUFhLE1BQU0sd0JBQXdCLEtBQUs7QUFBQSxJQUFDO0FBQUEsRUFDM0csQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxVQUFVLGNBQWMsV0FBVztBQUN6QyxVQUFNLE9BQU8sV0FBVyxXQUFXO0FBQ25DLGdCQUFZLElBQUksUUFBUSxhQUFhLEtBQUssV0FBVyxLQUFLLElBQUksQ0FBQztBQUUvRCxZQUFRLGFBQWE7QUFDckIsU0FBSyxVQUFVLGNBQTJCLDZCQUE2QixFQUFHLE1BQU07QUFDaEYsWUFBUSxNQUFNO0FBRWQsV0FBTyxZQUFZLFFBQVEsYUFBYSxHQUFHLElBQUk7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxVQUFNLFVBQVUsY0FBYyxXQUFXO0FBQ3pDLFVBQU0sUUFBUSxXQUFXLFdBQVc7QUFDcEMsVUFBTSxTQUFTLFdBQVcsV0FBVztBQUNyQyxnQkFBWSxJQUFJLFFBQVEsYUFBYSxNQUFNLFdBQVcsTUFBTSxJQUFJLENBQUM7QUFDakUsZ0JBQVksSUFBSSxRQUFRLGFBQWEsT0FBTyxXQUFXLE9BQU8sSUFBSSxDQUFDO0FBSW5FLFdBQU8sS0FBSyxNQUFNO0FBQ2xCLFdBQU8sS0FBSyxjQUFjLElBQUksV0FBVyxPQUFPLENBQUM7QUFDakQsWUFBUSxhQUFhO0FBRXJCLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxPQUFPLE1BQU0sVUFBVSxVQUFVLFNBQVMsMEJBQTBCO0FBQUEsUUFDcEUsUUFBUSxPQUFPLFVBQVUsVUFBVSxTQUFTLDBCQUEwQjtBQUFBLE1BQ3ZFO0FBQUEsTUFDQSxFQUFFLE9BQU8sT0FBTyxRQUFRLEtBQUs7QUFBQSxJQUFDO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsVUFBTSxXQUFxQixDQUFDO0FBQzVCLFVBQU0sa0JBQXFDLENBQUM7QUFDNUMsVUFBTSxVQUFVLGNBQWMsYUFBYSxVQUFVLGVBQWU7QUFDcEUsVUFBTSxPQUFPLFdBQVcsV0FBVztBQUNuQyxnQkFBWSxJQUFJLFFBQVEsYUFBYSxLQUFLLFdBQVcsS0FBSyxJQUFJLENBQUM7QUFFL0QsWUFBUSxLQUFLO0FBQ2IsVUFBTSxRQUFRLEtBQUssVUFBVSxpQkFBb0MscUNBQXFDO0FBQ3RHLFVBQU0sUUFBUSxVQUFRLEtBQUssTUFBTSxDQUFDO0FBRWxDLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxPQUFPLE1BQU07QUFBQTtBQUFBLFFBRWIsbUJBQW1CLE1BQU0sS0FBSyxLQUFLLEVBQUUsTUFBTSxVQUFRLEtBQUssYUFBYSxDQUFDO0FBQUEsUUFDdEU7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLFFBQ25CLFVBQVUsQ0FBQyxpQ0FBaUMsc0RBQXNEO0FBQUEsUUFDbEcsaUJBQWlCO0FBQUEsVUFDaEIsRUFBRSxNQUFNLDhCQUE4QixNQUFNLEVBQUUsUUFBUSxTQUFTLFFBQVEsU0FBUyxFQUFFO0FBQUEsVUFDbEYsRUFBRSxNQUFNLDhCQUE4QixNQUFNLEVBQUUsUUFBUSxnQkFBZ0IsUUFBUSxTQUFTLEVBQUU7QUFBQSxVQUN6RixFQUFFLE1BQU0sOEJBQThCLE1BQU0sRUFBRSxRQUFRLG9CQUFvQixRQUFRLFNBQVMsRUFBRTtBQUFBLFFBQzlGO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sVUFBVSxjQUFjLFdBQVc7QUFDekMsVUFBTSxPQUFPLFdBQVcsV0FBVztBQUNuQyxVQUFNLGVBQWUsUUFBUSxhQUFhLEtBQUssV0FBVyxLQUFLLElBQUk7QUFFbkUsWUFBUSxLQUFLO0FBQ2IsaUJBQWEsUUFBUTtBQUVyQixXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsU0FBUyxLQUFLLFVBQVUsVUFBVSxTQUFTLDBCQUEwQjtBQUFBLFFBQ3JFLE9BQU8sS0FBSyxVQUFVLGlCQUFpQiw4QkFBOEIsRUFBRTtBQUFBLE1BQ3hFO0FBQUEsTUFDQSxFQUFFLFNBQVMsT0FBTyxPQUFPLEVBQUU7QUFBQSxJQUFDO0FBQUEsRUFDOUIsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
