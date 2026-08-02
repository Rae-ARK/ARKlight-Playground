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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isNumber } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { SpeechTimeoutDefault } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { ISpeechService, AccessibilityVoiceSettingId, SpeechToTextStatus } from "../../../speech/common/speechService.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../chat/browser/speechToText/chatSpeechToTextService.js";
import { getDictationPreparingLabel } from "../../../chat/browser/speechToText/dictationDownloadRing.js";
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { addDisposableListener, EventType, getActiveWindow } from "../../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { TerminalCommandId } from "../../../terminal/common/terminal.js";
import { TerminalContextKeys } from "../../../terminal/common/terminalContextKey.js";
import { TerminalInitialHintContribution } from "../../inlineHint/browser/terminal.initialHint.contribution.js";
const symbolMap = [
  ["dollar sign", "$"],
  ["double quote", '"'],
  ["open paren", "("],
  ["close paren", ")"],
  ["open parenthesis", "("],
  ["close parenthesis", ")"],
  ["open bracket", "["],
  ["close bracket", "]"],
  ["open brace", "{"],
  ["close brace", "}"],
  ["open angle bracket", "<"],
  ["close angle bracket", ">"],
  ["greater than", ">"],
  ["less than", "<"],
  ["ampersand", "&"],
  ["dollar", "$"],
  ["percent", "%"],
  ["asterisk", "*"],
  ["star", "*"],
  ["plus", "+"],
  ["equals", "="],
  ["exclamation", "!"],
  ["forward slash", "/"],
  ["slash", "/"],
  ["backslash", "\\"],
  ["pipe", "|"],
  ["tilde", "~"],
  ["caret", "^"],
  ["at sign", "@"],
  ["hashtag", "#"],
  ["pound", "#"],
  ["hash", "#"],
  ["colon", ":"],
  ["semicolon", ";"],
  ["underscore", "_"],
  ["hyphen", "-"],
  ["dash", "-"],
  ["dot", "."],
  ["period", "."],
  ["quote", "'"]
];
function postProcessTerminalDictation(text) {
  let input = text.replaceAll(/[.,?;!]/g, "");
  for (const [spoken, symbol] of symbolMap) {
    input = input.replace(new RegExp("\\b" + spoken + "\\b", "gi"), symbol);
  }
  input = input.replace(/^(\s*)([A-Z])/, (_, leading, letter) => leading + letter.toLowerCase());
  return input;
}
let TerminalVoiceSession = class extends Disposable {
  constructor(_speechService, _chatSpeechToTextService, _terminalService, _configurationService, contextKeyService, _hoverService, _keybindingService) {
    super();
    this._speechService = _speechService;
    this._chatSpeechToTextService = _chatSpeechToTextService;
    this._terminalService = _terminalService;
    this._configurationService = _configurationService;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._input = "";
    /** True while the current session is driven by the built-in on-device engine. */
    this._usingBuiltin = false;
    /** True while awaiting the built-in engine's final transcript during accept. */
    this._builtinFinalizing = false;
    this._register(this._terminalService.onDidChangeActiveInstance(() => this.stop()));
    this._register(this._terminalService.onDidDisposeInstance(() => this.stop()));
    this._disposables = this._register(new DisposableStore());
    this._decorationDisposables = this._register(new DisposableStore());
    this._terminalDictationInProgress = TerminalContextKeys.terminalDictationInProgress.bindTo(contextKeyService);
  }
  static getInstance(instantiationService) {
    if (!TerminalVoiceSession._instance) {
      TerminalVoiceSession._instance = instantiationService.createInstance(TerminalVoiceSession);
    }
    return TerminalVoiceSession._instance;
  }
  async start() {
    this.stop();
    const activeInstance = this._terminalService.activeInstance;
    if (activeInstance) {
      TerminalInitialHintContribution.get(activeInstance)?.dispose();
    }
    let voiceTimeout = this._configurationService.getValue(AccessibilityVoiceSettingId.SpeechTimeout);
    if (!isNumber(voiceTimeout) || voiceTimeout < 0) {
      voiceTimeout = SpeechTimeoutDefault;
    }
    this._acceptTranscriptionScheduler = this._disposables.add(new RunOnceScheduler(() => {
      if (this._usingBuiltin) {
        this.stop(true);
        return;
      }
      this._sendText();
      this.stop();
    }, voiceTimeout));
    this._cancellationTokenSource = new CancellationTokenSource();
    this._register(toDisposable(() => this._cancellationTokenSource?.dispose(true)));
    if (this._chatSpeechToTextService.isConfigured) {
      return this._startBuiltin(voiceTimeout);
    }
    const session = await this._speechService.createSpeechToTextSession(this._cancellationTokenSource?.token, "terminal");
    this._disposables.add(session.onDidChange((e) => {
      if (this._cancellationTokenSource?.token.isCancellationRequested) {
        return;
      }
      switch (e.status) {
        case SpeechToTextStatus.Started:
          this._terminalDictationInProgress.set(true);
          if (!this._decoration) {
            this._createDecoration();
          }
          break;
        case SpeechToTextStatus.Recognizing: {
          this._updateInput(e);
          this._renderGhostText(e);
          this._updateDecoration();
          if (voiceTimeout > 0) {
            this._acceptTranscriptionScheduler.cancel();
          }
          break;
        }
        case SpeechToTextStatus.Recognized:
          this._updateInput(e);
          this._sendText();
          this._ghostText?.dispose();
          this._ghostText = void 0;
          this._ghostTextMarker?.dispose();
          this._ghostTextMarker = void 0;
          this._updateDecoration();
          this._input = "";
          break;
        case SpeechToTextStatus.Stopped:
          this.stop();
          break;
      }
    }));
  }
  /**
   * Drive terminal dictation from the built-in on-device engine. Unlike the
   * extension provider (which emits discrete `Recognizing`/`Recognized` events
   * per utterance), the built-in engine streams a single growing cumulative
   * transcript. We render it live as ghost text and keep it staged in
   * `_input`, then send it once the silence timeout elapses or the user stops.
   */
  async _startBuiltin(voiceTimeout) {
    const service = this._chatSpeechToTextService;
    if (service.state !== ChatSpeechToTextState.Idle) {
      this.stop();
      return;
    }
    this._usingBuiltin = true;
    this._terminalDictationInProgress.set(true);
    if (!this._decoration) {
      this._createDecoration();
    }
    const renderPreparing = () => {
      if (this._cancellationTokenSource?.token.isCancellationRequested || this._builtinFinalizing) {
        return;
      }
      if (service.isPreparingModel) {
        this._renderPreparingText(getDictationPreparingLabel(service));
      }
    };
    renderPreparing();
    this._disposables.add(service.onDidChangePreparingModel(() => renderPreparing()));
    this._disposables.add(service.onDidChangeModelDownloadProgress(() => renderPreparing()));
    this._disposables.add(service.onDidUpdateTranscript((update) => {
      if (this._cancellationTokenSource?.token.isCancellationRequested || this._builtinFinalizing) {
        return;
      }
      const event = { status: SpeechToTextStatus.Recognizing, text: update.text };
      this._updateInput(event);
      this._renderGhostText(event);
      this._updateDecoration();
      if (voiceTimeout > 0) {
        this._acceptTranscriptionScheduler.cancel();
        this._acceptTranscriptionScheduler.schedule();
      }
    }));
    this._disposables.add(service.onDidChangeState((state) => {
      if (state === ChatSpeechToTextState.Idle && !this._builtinFinalizing && !this._cancellationTokenSource?.token.isCancellationRequested) {
        this.stop();
      }
    }));
    try {
      await service.start(getActiveWindow(), "terminal");
    } catch {
      this.stop();
    }
  }
  /**
   * Accept the built-in dictation: fetch the engine's final transcript (the
   * last utterance is only returned by `stopAndTranscribe`, not the interim
   * stream), stage it, then tear down and send it. Used by the silence timeout
   * and the Stop Dictation action; abort/error teardown uses `cancel()` instead.
   */
  async _finalizeBuiltinThenStop() {
    let finalText;
    try {
      finalText = await this._chatSpeechToTextService.stopAndTranscribe();
    } catch {
    }
    if (!this._usingBuiltin || this._cancellationTokenSource?.token.isCancellationRequested) {
      return;
    }
    if (finalText !== void 0) {
      this._updateInput({ status: SpeechToTextStatus.Recognized, text: finalText });
    }
    this.stop(true);
  }
  stop(send) {
    if (this._usingBuiltin && send && !this._builtinFinalizing) {
      this._builtinFinalizing = true;
      this._acceptTranscriptionScheduler?.cancel();
      this._finalizeBuiltinThenStop();
      return;
    }
    this._setInactive();
    if (send) {
      this._acceptTranscriptionScheduler.cancel();
      this._sendText();
    }
    this._ghostText = void 0;
    this._decoration?.dispose();
    this._decoration = void 0;
    this._marker?.dispose();
    this._marker = void 0;
    this._ghostTextMarker = void 0;
    this._cancellationTokenSource?.cancel();
    if (this._usingBuiltin) {
      this._chatSpeechToTextService.cancel();
    }
    this._disposables.clear();
    this._input = "";
    this._terminalDictationInProgress.reset();
    this._usingBuiltin = false;
    this._builtinFinalizing = false;
  }
  _sendText() {
    this._terminalService.activeInstance?.sendText(this._input, false);
    alert(localize("terminalVoiceTextInserted", "{0} inserted", this._input));
  }
  _updateInput(e) {
    if (e.text) {
      this._input = " " + postProcessTerminalDictation(e.text);
    }
  }
  _createDecoration() {
    const activeInstance = this._terminalService.activeInstance;
    const xterm = activeInstance?.xterm?.raw;
    if (!xterm) {
      return;
    }
    const onFirstLine = xterm.buffer.active.cursorY === 0;
    const inputLength = this._input.length;
    const xPosition = xterm.buffer.active.cursorX + inputLength;
    this._marker = activeInstance.registerMarker(onFirstLine ? 0 : -1);
    if (!this._marker) {
      return;
    }
    this._decoration = xterm.registerDecoration({
      marker: this._marker,
      layer: "top",
      x: xPosition
    });
    if (!this._decoration) {
      this._marker.dispose();
      this._marker = void 0;
      return;
    }
    this._decoration.onRender((e) => {
      e.classList.add(...ThemeIcon.asClassNameArray(Codicon.micFilled), "terminal-voice", "recording");
      e.style.transform = onFirstLine ? "translate(10px, -2px)" : "translate(-6px, -5px)";
      this._registerMicInteractions(e);
    });
  }
  /**
   * Make the recording mic icon a discoverable Stop affordance: clicking it
   * stops (and accepts) the dictation, mirroring the animated mic button in the
   * editor and chat input, and a hover surfaces the Escape keybinding so the
   * stop gesture is not hidden.
   */
  _registerMicInteractions(element) {
    if (element.dataset.terminalVoiceInteractive) {
      return;
    }
    element.dataset.terminalVoiceInteractive = "true";
    element.style.cursor = "pointer";
    this._decorationDisposables.add(addDisposableListener(element, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this._builtinFinalizing) {
        this.stop(true);
      }
    }));
    const keybindingLabel = this._keybindingService.lookupKeybinding(TerminalCommandId.StopVoice)?.getLabel();
    const title = keybindingLabel ? localize("terminalVoice.stopDictationHover", "Stop Dictation ({0})", keybindingLabel) : localize("terminalVoice.stopDictationHoverNoKeybinding", "Stop Dictation");
    this._decorationDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, title));
  }
  _updateDecoration() {
    this._decorationDisposables.clear();
    this._decoration?.dispose();
    this._marker?.dispose();
    this._decoration = void 0;
    this._marker = void 0;
    this._createDecoration();
  }
  _setInactive() {
    this._decoration?.element?.classList.remove("recording");
  }
  _renderGhostText(e) {
    this._renderGhostTextContent(e.text, "terminal-voice-progress-text");
  }
  /**
   * Render a non-transcript hint (e.g. "Preparing…/Downloading… X%") in the
   * ghost-text slot while the on-device model is still preparing on first use.
   * Styled distinctly from the live transcript so it does not read as speech.
   */
  _renderPreparingText(label) {
    this._renderGhostTextContent(label, "terminal-voice-preparing-text");
  }
  _renderGhostTextContent(text, className) {
    this._ghostText?.dispose();
    if (!text) {
      return;
    }
    const activeInstance = this._terminalService.activeInstance;
    const xterm = activeInstance?.xterm?.raw;
    if (!xterm) {
      return;
    }
    this._ghostTextMarker = activeInstance.registerMarker();
    if (!this._ghostTextMarker) {
      return;
    }
    this._disposables.add(this._ghostTextMarker);
    const onFirstLine = xterm.buffer.active.cursorY === 0;
    this._ghostText = xterm.registerDecoration({
      marker: this._ghostTextMarker,
      layer: "top",
      x: onFirstLine ? xterm.buffer.active.cursorX + 4 : xterm.buffer.active.cursorX + 1
    });
    if (this._ghostText) {
      this._disposables.add(this._ghostText);
    }
    this._ghostText?.onRender((e) => {
      e.classList.add(className);
      e.textContent = text;
      e.style.width = (xterm.cols - xterm.buffer.active.cursorX) / xterm.cols * 100 + "%";
    });
  }
};
TerminalVoiceSession._instance = void 0;
TerminalVoiceSession = __decorateClass([
  __decorateParam(0, ISpeechService),
  __decorateParam(1, IChatSpeechToTextService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IKeybindingService)
], TerminalVoiceSession);
export {
  TerminalVoiceSession,
  postProcessTerminalDictation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi92b2ljZS9icm93c2VyL3Rlcm1pbmFsVm9pY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTcGVlY2hUaW1lb3V0RGVmYXVsdCB9IGZyb20gJy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3BlZWNoU2VydmljZSwgQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLCBJU3BlZWNoVG9UZXh0RXZlbnQsIFNwZWVjaFRvVGV4dFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NwZWVjaC9jb21tb24vc3BlZWNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U3BlZWNoVG9UZXh0U3RhdGUsIElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RGljdGF0aW9uUHJlcGFyaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbkRvd25sb2FkUmluZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYXJrZXIsIElEZWNvcmF0aW9uIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsSW5pdGlhbEhpbnRDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9pbmxpbmVIaW50L2Jyb3dzZXIvdGVybWluYWwuaW5pdGlhbEhpbnQuY29udHJpYnV0aW9uLmpzJztcblxuXG4vKipcbiAqIFNwb2tlbi13b3JkIHRvIHN5bWJvbCBzdWJzdGl0dXRpb25zIGFwcGxpZWQgdG8gdGVybWluYWwgZGljdGF0aW9uLiBPcmRlcmVkIHNvXG4gKiB0aGF0IG11bHRpLXdvcmQgcGhyYXNlcyAoZS5nLiBcImRvbGxhciBzaWduXCIpIGFyZSBtYXRjaGVkIGJlZm9yZSB0aGVpciBzaW5nbGVcbiAqIHdvcmQgZm9ybXMgKGUuZy4gXCJkb2xsYXJcIikuIFRlcm1pbmFsIGRpY3RhdGlvbiBpcyBtb3N0bHkgdXNlZCB0byBjb21wb3NlIHNoZWxsXG4gKiBjb21tYW5kcywgc28gcHVuY3R1YXRpb24gbmFtZXMgbWFwIHRvIHRoZSBsaXRlcmFsIGNoYXJhY3RlcnMgYSBDTEkgZXhwZWN0cy5cbiAqL1xuY29uc3Qgc3ltYm9sTWFwOiBbc3Bva2VuOiBzdHJpbmcsIHN5bWJvbDogc3RyaW5nXVtdID0gW1xuXHRbJ2RvbGxhciBzaWduJywgJyQnXSxcblx0Wydkb3VibGUgcXVvdGUnLCAnXCInXSxcblx0WydvcGVuIHBhcmVuJywgJygnXSxcblx0WydjbG9zZSBwYXJlbicsICcpJ10sXG5cdFsnb3BlbiBwYXJlbnRoZXNpcycsICcoJ10sXG5cdFsnY2xvc2UgcGFyZW50aGVzaXMnLCAnKSddLFxuXHRbJ29wZW4gYnJhY2tldCcsICdbJ10sXG5cdFsnY2xvc2UgYnJhY2tldCcsICddJ10sXG5cdFsnb3BlbiBicmFjZScsICd7J10sXG5cdFsnY2xvc2UgYnJhY2UnLCAnfSddLFxuXHRbJ29wZW4gYW5nbGUgYnJhY2tldCcsICc8J10sXG5cdFsnY2xvc2UgYW5nbGUgYnJhY2tldCcsICc+J10sXG5cdFsnZ3JlYXRlciB0aGFuJywgJz4nXSxcblx0WydsZXNzIHRoYW4nLCAnPCddLFxuXHRbJ2FtcGVyc2FuZCcsICcmJ10sXG5cdFsnZG9sbGFyJywgJyQnXSxcblx0WydwZXJjZW50JywgJyUnXSxcblx0Wydhc3RlcmlzaycsICcqJ10sXG5cdFsnc3RhcicsICcqJ10sXG5cdFsncGx1cycsICcrJ10sXG5cdFsnZXF1YWxzJywgJz0nXSxcblx0WydleGNsYW1hdGlvbicsICchJ10sXG5cdFsnZm9yd2FyZCBzbGFzaCcsICcvJ10sXG5cdFsnc2xhc2gnLCAnLyddLFxuXHRbJ2JhY2tzbGFzaCcsICdcXFxcJ10sXG5cdFsncGlwZScsICd8J10sXG5cdFsndGlsZGUnLCAnfiddLFxuXHRbJ2NhcmV0JywgJ14nXSxcblx0WydhdCBzaWduJywgJ0AnXSxcblx0WydoYXNodGFnJywgJyMnXSxcblx0Wydwb3VuZCcsICcjJ10sXG5cdFsnaGFzaCcsICcjJ10sXG5cdFsnY29sb24nLCAnOiddLFxuXHRbJ3NlbWljb2xvbicsICc7J10sXG5cdFsndW5kZXJzY29yZScsICdfJ10sXG5cdFsnaHlwaGVuJywgJy0nXSxcblx0WydkYXNoJywgJy0nXSxcblx0Wydkb3QnLCAnLiddLFxuXHRbJ3BlcmlvZCcsICcuJ10sXG5cdFsncXVvdGUnLCAnXFwnJ10sXG5dO1xuXG4vKiogQXBwbGllcyB0ZXJtaW5hbC1zcGVjaWZpYyBub3JtYWxpemF0aW9uIHRvIGRpY3RhdGVkIHRleHQuICovXG5leHBvcnQgZnVuY3Rpb24gcG9zdFByb2Nlc3NUZXJtaW5hbERpY3RhdGlvbih0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgaW5wdXQgPSB0ZXh0LnJlcGxhY2VBbGwoL1suLD87IV0vZywgJycpO1xuXHRmb3IgKGNvbnN0IFtzcG9rZW4sIHN5bWJvbF0gb2Ygc3ltYm9sTWFwKSB7XG5cdFx0aW5wdXQgPSBpbnB1dC5yZXBsYWNlKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNwb2tlbiArICdcXFxcYicsICdnaScpLCBzeW1ib2wpO1xuXHR9XG5cdC8vIFNwZWVjaCB0cmFuc2NyaXB0aW9uIGNhcGl0YWxpemVzIHRoZSBmaXJzdCB3b3JkIG9mIGFuIHV0dGVyYW5jZSwgd2hpY2ggaXNcblx0Ly8gdW5leHBlY3RlZCBmb3Igc2hlbGwgY29tbWFuZHMgKGUuZy4gYEVjaG9gIGluc3RlYWQgb2YgYGVjaG9gKS5cblx0aW5wdXQgPSBpbnB1dC5yZXBsYWNlKC9eKFxccyopKFtBLVpdKS8sIChfLCBsZWFkaW5nOiBzdHJpbmcsIGxldHRlcjogc3RyaW5nKSA9PiBsZWFkaW5nICsgbGV0dGVyLnRvTG93ZXJDYXNlKCkpO1xuXHRyZXR1cm4gaW5wdXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFZvaWNlU2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9pbnB1dDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2dob3N0VGV4dDogSURlY29yYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RlY29yYXRpb246IElEZWNvcmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tYXJrZXI6IElNYXJrZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2dob3N0VGV4dE1hcmtlcjogSU1hcmtlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgX2luc3RhbmNlOiBUZXJtaW5hbFZvaWNlU2Vzc2lvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWNjZXB0VHJhbnNjcmlwdGlvblNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0LyoqIFRydWUgd2hpbGUgdGhlIGN1cnJlbnQgc2Vzc2lvbiBpcyBkcml2ZW4gYnkgdGhlIGJ1aWx0LWluIG9uLWRldmljZSBlbmdpbmUuICovXG5cdHByaXZhdGUgX3VzaW5nQnVpbHRpbiA9IGZhbHNlO1xuXHQvKiogVHJ1ZSB3aGlsZSBhd2FpdGluZyB0aGUgYnVpbHQtaW4gZW5naW5lJ3MgZmluYWwgdHJhbnNjcmlwdCBkdXJpbmcgYWNjZXB0LiAqL1xuXHRwcml2YXRlIF9idWlsdGluRmluYWxpemluZyA9IGZhbHNlO1xuXHRzdGF0aWMgZ2V0SW5zdGFuY2UoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFRlcm1pbmFsVm9pY2VTZXNzaW9uIHtcblx0XHRpZiAoIVRlcm1pbmFsVm9pY2VTZXNzaW9uLl9pbnN0YW5jZSkge1xuXHRcdFx0VGVybWluYWxWb2ljZVNlc3Npb24uX2luc3RhbmNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxWb2ljZVNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBUZXJtaW5hbFZvaWNlU2Vzc2lvbi5faW5zdGFuY2U7XG5cdH1cblx0cHJpdmF0ZSBfY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElTcGVlY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NwZWVjaFNlcnZpY2U6IElTcGVlY2hTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2U6IElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlKCgpID0+IHRoaXMuc3RvcCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkRGlzcG9zZUluc3RhbmNlKCgpID0+IHRoaXMuc3RvcCgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5fdGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzID0gVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbERpY3RhdGlvbkluUHJvZ3Jlc3MuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc3RvcCgpO1xuXHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGlmIChhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0VGVybWluYWxJbml0aWFsSGludENvbnRyaWJ1dGlvbi5nZXQoYWN0aXZlSW5zdGFuY2UpPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGxldCB2b2ljZVRpbWVvdXQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KEFjY2Vzc2liaWxpdHlWb2ljZVNldHRpbmdJZC5TcGVlY2hUaW1lb3V0KTtcblx0XHRpZiAoIWlzTnVtYmVyKHZvaWNlVGltZW91dCkgfHwgdm9pY2VUaW1lb3V0IDwgMCkge1xuXHRcdFx0dm9pY2VUaW1lb3V0ID0gU3BlZWNoVGltZW91dERlZmF1bHQ7XG5cdFx0fVxuXHRcdHRoaXMuX2FjY2VwdFRyYW5zY3JpcHRpb25TY2hlZHVsZXIgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGJ1aWx0LWluIGVuZ2luZSByZXR1cm5zIGl0cyBmaW5hbCB1dHRlcmFuY2Ugb25seSBmcm9tXG5cdFx0XHQvLyBzdG9wQW5kVHJhbnNjcmliZSgpLCBzbyBhY2NlcHQgdGhyb3VnaCBzdG9wKHRydWUpIHJhdGhlciB0aGFuXG5cdFx0XHQvLyBzZW5kaW5nIHRoZSBpbnRlcmltIHRleHQgYW5kIGRpc2NhcmRpbmcgdGhlIHJlY29yZGluZy5cblx0XHRcdGlmICh0aGlzLl91c2luZ0J1aWx0aW4pIHtcblx0XHRcdFx0dGhpcy5zdG9wKHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZW5kVGV4dCgpO1xuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0fSwgdm9pY2VUaW1lb3V0KSk7XG5cdFx0dGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdC8vIFByZWZlciB0aGUgYnVpbHQtaW4gb24tZGV2aWNlIGVuZ2luZSAocHJpdmF0ZSwgaW4tYm94KSB3aGVuIGNvbmZpZ3VyZWQsXG5cdFx0Ly8gZmFsbGluZyBiYWNrIHRvIHRoZSBzcGVlY2ggZXh0ZW5zaW9uJ3MgcHJvdmlkZXIgb3RoZXJ3aXNlLlxuXHRcdGlmICh0aGlzLl9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5pc0NvbmZpZ3VyZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zdGFydEJ1aWx0aW4odm9pY2VUaW1lb3V0KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fc3BlZWNoU2VydmljZS5jcmVhdGVTcGVlY2hUb1RleHRTZXNzaW9uKHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlPy50b2tlbiwgJ3Rlcm1pbmFsJyk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbi5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlPy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKGUuc3RhdHVzKSB7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlN0YXJ0ZWQ6XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzLnNldCh0cnVlKTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2RlY29yYXRpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NyZWF0ZURlY29yYXRpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nOiB7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlSW5wdXQoZSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyR2hvc3RUZXh0KGUpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb24oKTtcblx0XHRcdFx0XHRpZiAodm9pY2VUaW1lb3V0ID4gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWNjZXB0VHJhbnNjcmlwdGlvblNjaGVkdWxlciEuY2FuY2VsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQ6XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlSW5wdXQoZSk7XG5cdFx0XHRcdFx0Ly8gU2VuZCB0ZXh0IGltbWVkaWF0ZWx5IGxpa2UgZWRpdG9yIGRpY3RhdGlvblxuXHRcdFx0XHRcdHRoaXMuX3NlbmRUZXh0KCk7XG5cdFx0XHRcdFx0Ly8gQ2xlYXIgZ2hvc3QgdGV4dCBhbmQgaW5wdXQgZm9yIG5leHQgcmVjb2duaXRpb25cblx0XHRcdFx0XHR0aGlzLl9naG9zdFRleHQ/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9naG9zdFRleHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fZ2hvc3RUZXh0TWFya2VyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fZ2hvc3RUZXh0TWFya2VyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdC8vIFVwZGF0ZSBkZWNvcmF0aW9uIHBvc2l0aW9uIGZvciBuZXh0IHJlY29nbml0aW9uXG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuX2lucHV0ID0gJyc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlN0b3BwZWQ6XG5cdFx0XHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERyaXZlIHRlcm1pbmFsIGRpY3RhdGlvbiBmcm9tIHRoZSBidWlsdC1pbiBvbi1kZXZpY2UgZW5naW5lLiBVbmxpa2UgdGhlXG5cdCAqIGV4dGVuc2lvbiBwcm92aWRlciAod2hpY2ggZW1pdHMgZGlzY3JldGUgYFJlY29nbml6aW5nYC9gUmVjb2duaXplZGAgZXZlbnRzXG5cdCAqIHBlciB1dHRlcmFuY2UpLCB0aGUgYnVpbHQtaW4gZW5naW5lIHN0cmVhbXMgYSBzaW5nbGUgZ3Jvd2luZyBjdW11bGF0aXZlXG5cdCAqIHRyYW5zY3JpcHQuIFdlIHJlbmRlciBpdCBsaXZlIGFzIGdob3N0IHRleHQgYW5kIGtlZXAgaXQgc3RhZ2VkIGluXG5cdCAqIGBfaW5wdXRgLCB0aGVuIHNlbmQgaXQgb25jZSB0aGUgc2lsZW5jZSB0aW1lb3V0IGVsYXBzZXMgb3IgdGhlIHVzZXIgc3RvcHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zdGFydEJ1aWx0aW4odm9pY2VUaW1lb3V0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGhpcy5fY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2U7XG5cblx0XHQvLyBPbmx5IG9uZSBkaWN0YXRpb24gY2FuIHJ1biBhdCBhIHRpbWUgKHRoZSBvbi1kZXZpY2UgZW5naW5lIGlzIGEgc2hhcmVkXG5cdFx0Ly8gc2luZ2xldG9uKS4gSWYgaXQgaXMgYWxyZWFkeSByZWNvcmRpbmcgZWxzZXdoZXJlIChjaGF0IGlucHV0IG9yIGFuXG5cdFx0Ly8gZWRpdG9yKSwgYHNlcnZpY2Uuc3RhcnQoKWAgd291bGQgbm8tb3Agd2hpbGUgdGhlc2UgbGlzdGVuZXJzIHN0YXllZFxuXHRcdC8vIGF0dGFjaGVkIGFuZCBzdHJlYW1lZCB0aGF0IG90aGVyIHN1cmZhY2UncyB0cmFuc2NyaXB0IGludG8gdGhlXG5cdFx0Ly8gdGVybWluYWwuIFJlamVjdCBhIG5vbi1pZGxlIGVuZ2luZSBiZWZvcmUgc3Vic2NyaWJpbmcuXG5cdFx0aWYgKHNlcnZpY2Uuc3RhdGUgIT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl91c2luZ0J1aWx0aW4gPSB0cnVlO1xuXHRcdHRoaXMuX3Rlcm1pbmFsRGljdGF0aW9uSW5Qcm9ncmVzcy5zZXQodHJ1ZSk7XG5cdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVEZWNvcmF0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gT24gZmlyc3QgdXNlIHRoZSBtb2RlbCBkb3dubG9hZHMvbG9hZHMgYmVmb3JlIGFueSB0cmFuc2NyaXB0IGFycml2ZXMuXG5cdFx0Ly8gVW5saWtlIHRoZSBjaGF0IGlucHV0ICh3aGljaCBoYXMgYSB0b29sYmFyIGRvd25sb2FkIHJpbmcpLCB0aGUgdGVybWluYWxcblx0XHQvLyBoYXMgbm8gcHJvZ3Jlc3MgYWZmb3JkYW5jZSwgc28gc3VyZmFjZSBhIFwiUHJlcGFyaW5nXHUyMDI2L0Rvd25sb2FkaW5nXHUyMDI2IFglXCJcblx0XHQvLyBoaW50IGluIHRoZSBnaG9zdC10ZXh0IHNsb3QgdW50aWwgdGhlIG1vZGVsIGlzIHJlYWR5IGFuZCByZWFsXG5cdFx0Ly8gdHJhbnNjcmlwdHMgc3RhcnQgc3RyZWFtaW5nLlxuXHRcdGNvbnN0IHJlbmRlclByZXBhcmluZyA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZT8udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgdGhpcy5fYnVpbHRpbkZpbmFsaXppbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlcnZpY2UuaXNQcmVwYXJpbmdNb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJQcmVwYXJpbmdUZXh0KGdldERpY3RhdGlvblByZXBhcmluZ0xhYmVsKHNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJlbmRlclByZXBhcmluZygpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlUHJlcGFyaW5nTW9kZWwoKCkgPT4gcmVuZGVyUHJlcGFyaW5nKCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZU1vZGVsRG93bmxvYWRQcm9ncmVzcygoKSA9PiByZW5kZXJQcmVwYXJpbmcoKSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRVcGRhdGVUcmFuc2NyaXB0KHVwZGF0ZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHRoaXMuX2J1aWx0aW5GaW5hbGl6aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJldXNlIHRoZSBwcm92aWRlci1wYXRoIHJlbmRlcmluZyBieSBzaGFwaW5nIHRoZSBjdW11bGF0aXZlXG5cdFx0XHQvLyB0cmFuc2NyaXB0IGFzIGEgcmVjb2duaXppbmcgZXZlbnQuIFRoZSBzdGFnZWQgdGV4dCBpcyBvbmx5IHNlbnRcblx0XHRcdC8vIG9uY2UgYWNjZXB0ZWQgKHNpbGVuY2UgdGltZW91dCBvciBTdG9wIERpY3RhdGlvbiksIHdoaWNoIGZldGNoZXNcblx0XHRcdC8vIHRoZSBlbmdpbmUncyBmaW5hbCB0cmFuc2NyaXB0LiBUaGUgZmlyc3QgcmVhbCB0cmFuc2NyaXB0IHJlcGxhY2VzXG5cdFx0XHQvLyBhbnkgbGluZ2VyaW5nIFwiUHJlcGFyaW5nXHUyMDI2XCIgaGludC5cblx0XHRcdGNvbnN0IGV2ZW50OiBJU3BlZWNoVG9UZXh0RXZlbnQgPSB7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiB1cGRhdGUudGV4dCB9O1xuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXQoZXZlbnQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyR2hvc3RUZXh0KGV2ZW50KTtcblx0XHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb24oKTtcblx0XHRcdGlmICh2b2ljZVRpbWVvdXQgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdFRyYW5zY3JpcHRpb25TY2hlZHVsZXIhLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRUcmFuc2NyaXB0aW9uU2NoZWR1bGVyIS5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIElmIHRoZSBlbmdpbmUgZW5kcyB0aGUgc2Vzc2lvbiBvbiBpdHMgb3duIChlLmcuIHRoZSBtb2RlbCBmYWlsZWQgdG9cblx0XHQvLyBsb2FkKSwgYWJvcnQgdGhlIHRlcm1pbmFsLXNpZGUgcmVuZGVyaW5nLiBHdWFyZGVkIHNvIG5laXRoZXIgdGhlXG5cdFx0Ly8gYWNjZXB0LXRyaWdnZXJlZCBub3IgdGhlIGFib3J0LXRyaWdnZXJlZCBJZGxlIHRyYW5zaXRpb24gcmUtZW50ZXJzLlxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUoc3RhdGUgPT4ge1xuXHRcdFx0aWYgKHN0YXRlID09PSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZSAmJiAhdGhpcy5fYnVpbHRpbkZpbmFsaXppbmcgJiYgIXRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlPy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5zdGFydChnZXRBY3RpdmVXaW5kb3coKSwgJ3Rlcm1pbmFsJyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBNaWNyb3Bob25lIGFjcXVpc2l0aW9uL2Nvbm5lY3Rpb24gZmFpbHVyZSBpcyBzdXJmYWNlZCBieSB0aGUgc2VydmljZS5cblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBY2NlcHQgdGhlIGJ1aWx0LWluIGRpY3RhdGlvbjogZmV0Y2ggdGhlIGVuZ2luZSdzIGZpbmFsIHRyYW5zY3JpcHQgKHRoZVxuXHQgKiBsYXN0IHV0dGVyYW5jZSBpcyBvbmx5IHJldHVybmVkIGJ5IGBzdG9wQW5kVHJhbnNjcmliZWAsIG5vdCB0aGUgaW50ZXJpbVxuXHQgKiBzdHJlYW0pLCBzdGFnZSBpdCwgdGhlbiB0ZWFyIGRvd24gYW5kIHNlbmQgaXQuIFVzZWQgYnkgdGhlIHNpbGVuY2UgdGltZW91dFxuXHQgKiBhbmQgdGhlIFN0b3AgRGljdGF0aW9uIGFjdGlvbjsgYWJvcnQvZXJyb3IgdGVhcmRvd24gdXNlcyBgY2FuY2VsKClgIGluc3RlYWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9maW5hbGl6ZUJ1aWx0aW5UaGVuU3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZmluYWxUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGZpbmFsVGV4dCA9IGF3YWl0IHRoaXMuX2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLnN0b3BBbmRUcmFuc2NyaWJlKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBGYWxsIGJhY2sgdG8gdGhlIGxhc3QgaW50ZXJpbSB0ZXh0IGFscmVhZHkgc3RhZ2VkIGluIGBfaW5wdXRgLlxuXHRcdH1cblx0XHQvLyBBIGNvbmN1cnJlbnQgYWJvcnQgKGUuZy4gdGhlIHRlcm1pbmFsIHdhcyBkaXNwb3NlZCkgYWxyZWFkeSB0b3JlIGRvd24uXG5cdFx0aWYgKCF0aGlzLl91c2luZ0J1aWx0aW4gfHwgdGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChmaW5hbFRleHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXQoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkLCB0ZXh0OiBmaW5hbFRleHQgfSk7XG5cdFx0fVxuXHRcdC8vIF9idWlsdGluRmluYWxpemluZyBpcyBzZXQsIHNvIHRoaXMgcmVhY2hlcyB0aGUgc3luY2hyb25vdXMgdGVhcmRvd24gYW5kXG5cdFx0Ly8gc2VuZHMgdGhlIHN0YWdlZCAoZmluYWwpIHRleHQuXG5cdFx0dGhpcy5zdG9wKHRydWUpO1xuXHR9XG5cblx0c3RvcChzZW5kPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIEJ1aWx0LWluIGFjY2VwdCBwYXRoOiBmZXRjaCB0aGUgZmluYWwgdHJhbnNjcmlwdCBiZWZvcmUgdGVhcmluZyBkb3duLlxuXHRcdGlmICh0aGlzLl91c2luZ0J1aWx0aW4gJiYgc2VuZCAmJiAhdGhpcy5fYnVpbHRpbkZpbmFsaXppbmcpIHtcblx0XHRcdHRoaXMuX2J1aWx0aW5GaW5hbGl6aW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2FjY2VwdFRyYW5zY3JpcHRpb25TY2hlZHVsZXI/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fZmluYWxpemVCdWlsdGluVGhlblN0b3AoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0SW5hY3RpdmUoKTtcblx0XHRpZiAoc2VuZCkge1xuXHRcdFx0dGhpcy5fYWNjZXB0VHJhbnNjcmlwdGlvblNjaGVkdWxlciEuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9zZW5kVGV4dCgpO1xuXHRcdH1cblx0XHR0aGlzLl9naG9zdFRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RlY29yYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbWFya2VyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbWFya2VyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2dob3N0VGV4dE1hcmtlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZT8uY2FuY2VsKCk7XG5cdFx0Ly8gQWJvcnQgdGhlIG9uLWRldmljZSBlbmdpbmUgb24gdGVhcmRvd24uIE9uIHRoZSBhY2NlcHQgcGF0aCB0aGUgZW5naW5lXG5cdFx0Ly8gaGFzIGFscmVhZHkgZmluaXNoZWQgdmlhIHN0b3BBbmRUcmFuc2NyaWJlKCksIHNvIHRoaXMgaXMgYSBuby1vcCB0aGVyZS5cblx0XHRpZiAodGhpcy5fdXNpbmdCdWlsdGluKSB7XG5cdFx0XHR0aGlzLl9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5jYW5jZWwoKTtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pbnB1dCA9ICcnO1xuXHRcdHRoaXMuX3Rlcm1pbmFsRGljdGF0aW9uSW5Qcm9ncmVzcy5yZXNldCgpO1xuXHRcdHRoaXMuX3VzaW5nQnVpbHRpbiA9IGZhbHNlO1xuXHRcdHRoaXMuX2J1aWx0aW5GaW5hbGl6aW5nID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kVGV4dCgpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U/LnNlbmRUZXh0KHRoaXMuX2lucHV0LCBmYWxzZSk7XG5cdFx0YWxlcnQobG9jYWxpemUoJ3Rlcm1pbmFsVm9pY2VUZXh0SW5zZXJ0ZWQnLCAnezB9IGluc2VydGVkJywgdGhpcy5faW5wdXQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUlucHV0KGU6IElTcGVlY2hUb1RleHRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLnRleHQpIHtcblx0XHRcdHRoaXMuX2lucHV0ID0gJyAnICsgcG9zdFByb2Nlc3NUZXJtaW5hbERpY3RhdGlvbihlLnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZURlY29yYXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0Y29uc3QgeHRlcm0gPSBhY3RpdmVJbnN0YW5jZT8ueHRlcm0/LnJhdztcblx0XHRpZiAoIXh0ZXJtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9uRmlyc3RMaW5lID0geHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JZID09PSAwO1xuXG5cdFx0Ly8gQ2FsY3VsYXRlIHggcG9zaXRpb24gYmFzZWQgb24gY3VycmVudCBjdXJzb3IgcG9zaXRpb24gYW5kIGlucHV0IGxlbmd0aFxuXHRcdGNvbnN0IGlucHV0TGVuZ3RoID0gdGhpcy5faW5wdXQubGVuZ3RoO1xuXHRcdGNvbnN0IHhQb3NpdGlvbiA9IHh0ZXJtLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWCArIGlucHV0TGVuZ3RoO1xuXG5cdFx0dGhpcy5fbWFya2VyID0gYWN0aXZlSW5zdGFuY2UucmVnaXN0ZXJNYXJrZXIob25GaXJzdExpbmUgPyAwIDogLTEpO1xuXHRcdGlmICghdGhpcy5fbWFya2VyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RlY29yYXRpb24gPSB4dGVybS5yZWdpc3RlckRlY29yYXRpb24oe1xuXHRcdFx0bWFya2VyOiB0aGlzLl9tYXJrZXIsXG5cdFx0XHRsYXllcjogJ3RvcCcsXG5cdFx0XHR4OiB4UG9zaXRpb24sXG5cdFx0fSk7XG5cdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9tYXJrZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbWFya2VyID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kZWNvcmF0aW9uLm9uUmVuZGVyKChlOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0ZS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubWljRmlsbGVkKSwgJ3Rlcm1pbmFsLXZvaWNlJywgJ3JlY29yZGluZycpO1xuXHRcdFx0ZS5zdHlsZS50cmFuc2Zvcm0gPSBvbkZpcnN0TGluZSA/ICd0cmFuc2xhdGUoMTBweCwgLTJweCknIDogJ3RyYW5zbGF0ZSgtNnB4LCAtNXB4KSc7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlck1pY0ludGVyYWN0aW9ucyhlKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYWtlIHRoZSByZWNvcmRpbmcgbWljIGljb24gYSBkaXNjb3ZlcmFibGUgU3RvcCBhZmZvcmRhbmNlOiBjbGlja2luZyBpdFxuXHQgKiBzdG9wcyAoYW5kIGFjY2VwdHMpIHRoZSBkaWN0YXRpb24sIG1pcnJvcmluZyB0aGUgYW5pbWF0ZWQgbWljIGJ1dHRvbiBpbiB0aGVcblx0ICogZWRpdG9yIGFuZCBjaGF0IGlucHV0LCBhbmQgYSBob3ZlciBzdXJmYWNlcyB0aGUgRXNjYXBlIGtleWJpbmRpbmcgc28gdGhlXG5cdCAqIHN0b3AgZ2VzdHVyZSBpcyBub3QgaGlkZGVuLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJNaWNJbnRlcmFjdGlvbnMoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBUaGUgZGVjb3JhdGlvbidzIG9uUmVuZGVyIGNhbiBmaXJlIG11bHRpcGxlIHRpbWVzIGZvciB0aGUgc2FtZSBlbGVtZW50XG5cdFx0Ly8gKGUuZy4gb24gc2Nyb2xsL3Jlc2l6ZSk7IG9ubHkgd2lyZSB1cCB0aGUgbGlzdGVuZXJzIG9uY2UuXG5cdFx0aWYgKGVsZW1lbnQuZGF0YXNldC50ZXJtaW5hbFZvaWNlSW50ZXJhY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZWxlbWVudC5kYXRhc2V0LnRlcm1pbmFsVm9pY2VJbnRlcmFjdGl2ZSA9ICd0cnVlJztcblx0XHRlbGVtZW50LnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHR0aGlzLl9kZWNvcmF0aW9uRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmICghdGhpcy5fYnVpbHRpbkZpbmFsaXppbmcpIHtcblx0XHRcdFx0dGhpcy5zdG9wKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWwgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFRlcm1pbmFsQ29tbWFuZElkLlN0b3BWb2ljZSk/LmdldExhYmVsKCk7XG5cdFx0Y29uc3QgdGl0bGUgPSBrZXliaW5kaW5nTGFiZWxcblx0XHRcdD8gbG9jYWxpemUoJ3Rlcm1pbmFsVm9pY2Uuc3RvcERpY3RhdGlvbkhvdmVyJywgXCJTdG9wIERpY3RhdGlvbiAoezB9KVwiLCBrZXliaW5kaW5nTGFiZWwpXG5cdFx0XHQ6IGxvY2FsaXplKCd0ZXJtaW5hbFZvaWNlLnN0b3BEaWN0YXRpb25Ib3Zlck5vS2V5YmluZGluZycsIFwiU3RvcCBEaWN0YXRpb25cIik7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGVsZW1lbnQsIHRpdGxlKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVEZWNvcmF0aW9uKCk6IHZvaWQge1xuXHRcdC8vIERpc3Bvc2UgdGhlIG9sZCBkZWNvcmF0aW9uIGFuZCBpdHMgaW50ZXJhY3Rpb24gbGlzdGVuZXJzIGJlZm9yZSByZWNyZWF0aW5nXG5cdFx0dGhpcy5fZGVjb3JhdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX21hcmtlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RlY29yYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbWFya2VyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NyZWF0ZURlY29yYXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEluYWN0aXZlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RlY29yYXRpb24/LmVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoJ3JlY29yZGluZycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyR2hvc3RUZXh0KGU6IElTcGVlY2hUb1RleHRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckdob3N0VGV4dENvbnRlbnQoZS50ZXh0LCAndGVybWluYWwtdm9pY2UtcHJvZ3Jlc3MtdGV4dCcpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciBhIG5vbi10cmFuc2NyaXB0IGhpbnQgKGUuZy4gXCJQcmVwYXJpbmdcdTIwMjYvRG93bmxvYWRpbmdcdTIwMjYgWCVcIikgaW4gdGhlXG5cdCAqIGdob3N0LXRleHQgc2xvdCB3aGlsZSB0aGUgb24tZGV2aWNlIG1vZGVsIGlzIHN0aWxsIHByZXBhcmluZyBvbiBmaXJzdCB1c2UuXG5cdCAqIFN0eWxlZCBkaXN0aW5jdGx5IGZyb20gdGhlIGxpdmUgdHJhbnNjcmlwdCBzbyBpdCBkb2VzIG5vdCByZWFkIGFzIHNwZWVjaC5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlclByZXBhcmluZ1RleHQobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckdob3N0VGV4dENvbnRlbnQobGFiZWwsICd0ZXJtaW5hbC12b2ljZS1wcmVwYXJpbmctdGV4dCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyR2hvc3RUZXh0Q29udGVudCh0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2hvc3RUZXh0Py5kaXNwb3NlKCk7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGNvbnN0IHh0ZXJtID0gYWN0aXZlSW5zdGFuY2U/Lnh0ZXJtPy5yYXc7XG5cdFx0aWYgKCF4dGVybSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9naG9zdFRleHRNYXJrZXIgPSBhY3RpdmVJbnN0YW5jZS5yZWdpc3Rlck1hcmtlcigpO1xuXHRcdGlmICghdGhpcy5fZ2hvc3RUZXh0TWFya2VyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9naG9zdFRleHRNYXJrZXIpO1xuXHRcdGNvbnN0IG9uRmlyc3RMaW5lID0geHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JZID09PSAwO1xuXHRcdHRoaXMuX2dob3N0VGV4dCA9IHh0ZXJtLnJlZ2lzdGVyRGVjb3JhdGlvbih7XG5cdFx0XHRtYXJrZXI6IHRoaXMuX2dob3N0VGV4dE1hcmtlcixcblx0XHRcdGxheWVyOiAndG9wJyxcblx0XHRcdHg6IG9uRmlyc3RMaW5lID8geHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JYICsgNCA6IHh0ZXJtLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWCArIDEsXG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuX2dob3N0VGV4dCkge1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2dob3N0VGV4dCk7XG5cdFx0fVxuXHRcdHRoaXMuX2dob3N0VGV4dD8ub25SZW5kZXIoKGU6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRlLmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcblx0XHRcdGUudGV4dENvbnRlbnQgPSB0ZXh0O1xuXHRcdFx0ZS5zdHlsZS53aWR0aCA9ICh4dGVybS5jb2xzIC0geHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JYKSAvIHh0ZXJtLmNvbHMgKiAxMDAgKyAnJSc7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUVoRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQiw2QkFBaUQsMEJBQTBCO0FBQ3BHLFNBQVMsdUJBQXVCLGdDQUFnQztBQUNoRSxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUIsV0FB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
