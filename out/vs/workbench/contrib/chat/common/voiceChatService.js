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
import { localize } from "../../../../nls.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { rtrim } from "../../../../base/common/strings.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IChatAgentService } from "./participants/chatAgents.js";
import { chatAgentLeader, chatSubcommandLeader } from "./requestParser/chatParserTypes.js";
import { ISpeechService, SpeechToTextStatus } from "../../speech/common/speechService.js";
const IVoiceChatService = createDecorator("voiceChatService");
var PhraseTextType = /* @__PURE__ */ ((PhraseTextType2) => {
  PhraseTextType2[PhraseTextType2["AGENT"] = 1] = "AGENT";
  PhraseTextType2[PhraseTextType2["COMMAND"] = 2] = "COMMAND";
  PhraseTextType2[PhraseTextType2["AGENT_AND_COMMAND"] = 3] = "AGENT_AND_COMMAND";
  return PhraseTextType2;
})(PhraseTextType || {});
const VoiceChatInProgress = new RawContextKey("voiceChatInProgress", false, { type: "boolean", description: localize("voiceChatInProgress", "A speech-to-text session is in progress for chat.") });
let VoiceChatService = class extends Disposable {
  constructor(speechService, chatAgentService, contextKeyService) {
    super();
    this.speechService = speechService;
    this.chatAgentService = chatAgentService;
    this.activeVoiceChatSessions = 0;
    this.voiceChatInProgress = VoiceChatInProgress.bindTo(contextKeyService);
  }
  createPhrases(model) {
    const phrases = /* @__PURE__ */ new Map();
    for (const agent of this.chatAgentService.getActivatedAgents()) {
      const agentPhrase = `${VoiceChatService.PHRASES_LOWER[VoiceChatService.AGENT_PREFIX]} ${VoiceChatService.CHAT_AGENT_ALIAS.get(agent.name) ?? agent.name}`.toLowerCase();
      phrases.set(agentPhrase, { agent: agent.name });
      for (const slashCommand of agent.slashCommands) {
        const slashCommandPhrase = `${VoiceChatService.PHRASES_LOWER[VoiceChatService.COMMAND_PREFIX]} ${slashCommand.name}`.toLowerCase();
        phrases.set(slashCommandPhrase, { agent: agent.name, command: slashCommand.name });
        const agentSlashCommandPhrase = `${agentPhrase} ${slashCommandPhrase}`.toLowerCase();
        phrases.set(agentSlashCommandPhrase, { agent: agent.name, command: slashCommand.name });
      }
    }
    return phrases;
  }
  toText(value, type) {
    switch (type) {
      case 1 /* AGENT */:
        return `${VoiceChatService.AGENT_PREFIX}${value.agent}`;
      case 2 /* COMMAND */:
        return `${VoiceChatService.COMMAND_PREFIX}${value.command}`;
      case 3 /* AGENT_AND_COMMAND */:
        return `${VoiceChatService.AGENT_PREFIX}${value.agent} ${VoiceChatService.COMMAND_PREFIX}${value.command}`;
    }
  }
  async createVoiceChatSession(token, options) {
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = (dispose) => {
      this.activeVoiceChatSessions = Math.max(0, this.activeVoiceChatSessions - 1);
      if (this.activeVoiceChatSessions === 0) {
        this.voiceChatInProgress.reset();
      }
      if (dispose) {
        disposables.dispose();
      }
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled(true)));
    let detectedAgent = false;
    let detectedSlashCommand = false;
    const emitter = disposables.add(new Emitter());
    const session = await this.speechService.createSpeechToTextSession(token, "chat");
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled(true);
    }
    const phrases = this.createPhrases(options.model);
    disposables.add(session.onDidChange((e) => {
      switch (e.status) {
        case SpeechToTextStatus.Recognizing:
        case SpeechToTextStatus.Recognized: {
          let massagedEvent = e;
          if (e.text) {
            const startsWithAgent = e.text.startsWith(VoiceChatService.PHRASES_UPPER[VoiceChatService.AGENT_PREFIX]) || e.text.startsWith(VoiceChatService.PHRASES_LOWER[VoiceChatService.AGENT_PREFIX]);
            const startsWithSlashCommand = e.text.startsWith(VoiceChatService.PHRASES_UPPER[VoiceChatService.COMMAND_PREFIX]) || e.text.startsWith(VoiceChatService.PHRASES_LOWER[VoiceChatService.COMMAND_PREFIX]);
            if (startsWithAgent || startsWithSlashCommand) {
              const originalWords = e.text.split(" ");
              let transformedWords;
              let waitingForInput = false;
              if (options.usesAgents && startsWithAgent && !detectedAgent && !detectedSlashCommand && originalWords.length >= 4) {
                const phrase = phrases.get(originalWords.slice(0, 4).map((word) => this.normalizeWord(word)).join(" "));
                if (phrase) {
                  transformedWords = [this.toText(phrase, 3 /* AGENT_AND_COMMAND */), ...originalWords.slice(4)];
                  waitingForInput = originalWords.length === 4;
                  if (e.status === SpeechToTextStatus.Recognized) {
                    detectedAgent = true;
                    detectedSlashCommand = true;
                  }
                }
              }
              if (options.usesAgents && startsWithAgent && !detectedAgent && !transformedWords && originalWords.length >= 2) {
                const phrase = phrases.get(originalWords.slice(0, 2).map((word) => this.normalizeWord(word)).join(" "));
                if (phrase) {
                  transformedWords = [this.toText(phrase, 1 /* AGENT */), ...originalWords.slice(2)];
                  waitingForInput = originalWords.length === 2;
                  if (e.status === SpeechToTextStatus.Recognized) {
                    detectedAgent = true;
                  }
                }
              }
              if (startsWithSlashCommand && !detectedSlashCommand && !transformedWords && originalWords.length >= 2) {
                const phrase = phrases.get(originalWords.slice(0, 2).map((word) => this.normalizeWord(word)).join(" "));
                if (phrase) {
                  transformedWords = [this.toText(
                    phrase,
                    options.usesAgents && !detectedAgent ? 3 /* AGENT_AND_COMMAND */ : (
                      // rewrite `/fix` to `@workspace /foo` in this case
                      2 /* COMMAND */
                    )
                    // when we have not yet detected an agent before
                  ), ...originalWords.slice(2)];
                  waitingForInput = originalWords.length === 2;
                  if (e.status === SpeechToTextStatus.Recognized) {
                    detectedSlashCommand = true;
                  }
                }
              }
              massagedEvent = {
                status: e.status,
                text: (transformedWords ?? originalWords).join(" "),
                waitingForInput
              };
            }
          }
          emitter.fire(massagedEvent);
          break;
        }
        case SpeechToTextStatus.Started:
          this.activeVoiceChatSessions++;
          this.voiceChatInProgress.set(true);
          emitter.fire(e);
          break;
        case SpeechToTextStatus.Stopped:
          onSessionStoppedOrCanceled(false);
          emitter.fire(e);
          break;
        case SpeechToTextStatus.Error:
          emitter.fire(e);
          break;
      }
    }));
    return {
      onDidChange: emitter.event
    };
  }
  normalizeWord(word) {
    word = rtrim(word, ".");
    word = rtrim(word, ",");
    word = rtrim(word, "?");
    return word.toLowerCase();
  }
};
VoiceChatService.AGENT_PREFIX = chatAgentLeader;
VoiceChatService.COMMAND_PREFIX = chatSubcommandLeader;
VoiceChatService.PHRASES_LOWER = {
  [VoiceChatService.AGENT_PREFIX]: "at",
  [VoiceChatService.COMMAND_PREFIX]: "slash"
};
VoiceChatService.PHRASES_UPPER = {
  [VoiceChatService.AGENT_PREFIX]: "At",
  [VoiceChatService.COMMAND_PREFIX]: "Slash"
};
VoiceChatService.CHAT_AGENT_ALIAS = /* @__PURE__ */ new Map([["vscode", "code"]]);
VoiceChatService = __decorateClass([
  __decorateParam(0, ISpeechService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IContextKeyService)
], VoiceChatService);
export {
  IVoiceChatService,
  VoiceChatInProgress,
  VoiceChatService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3ZvaWNlQ2hhdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBydHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IGNoYXRBZ2VudExlYWRlciwgY2hhdFN1YmNvbW1hbmRMZWFkZXIgfSBmcm9tICcuL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElTcGVlY2hTZXJ2aWNlLCBJU3BlZWNoVG9UZXh0RXZlbnQsIFNwZWVjaFRvVGV4dFN0YXR1cyB9IGZyb20gJy4uLy4uL3NwZWVjaC9jb21tb24vc3BlZWNoU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJVm9pY2VDaGF0U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJVm9pY2VDaGF0U2VydmljZT4oJ3ZvaWNlQ2hhdFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJVm9pY2VDaGF0U2Vzc2lvbk9wdGlvbnMge1xuXHRyZWFkb25seSB1c2VzQWdlbnRzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbW9kZWw/OiBJQ2hhdE1vZGVsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZUNoYXRTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNpbWlsYXIgdG8gYElTcGVlY2hTZXJ2aWNlLmNyZWF0ZVNwZWVjaFRvVGV4dFNlc3Npb25gLCBidXQgd2l0aFxuXHQgKiBzdXBwb3J0IGZvciBhZ2VudCBwcmVmaXhlcyBhbmQgY29tbWFuZCBwcmVmaXhlcy4gRm9yIGV4YW1wbGUsXG5cdCAqIGlmIHRoZSB1c2VyIHNheXMgXCJhdCB3b3Jrc3BhY2Ugc2xhc2ggZml4IHRoaXMgcHJvYmxlbVwiLCB0aGUgcmVzdWx0XG5cdCAqIHdpbGwgYmUgXCJAd29ya3NwYWNlIC9maXggdGhpcyBwcm9ibGVtXCIuXG5cdCAqL1xuXHRjcmVhdGVWb2ljZUNoYXRTZXNzaW9uKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgb3B0aW9uczogSVZvaWNlQ2hhdFNlc3Npb25PcHRpb25zKTogUHJvbWlzZTxJVm9pY2VDaGF0U2Vzc2lvbj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlQ2hhdFRleHRFdmVudCBleHRlbmRzIElTcGVlY2hUb1RleHRFdmVudCB7XG5cblx0LyoqXG5cdCAqIFRoaXMgcHJvcGVydHkgd2lsbCBiZSBgdHJ1ZWAgd2hlbiB0aGUgdGV4dCByZWNvZ25pemVkXG5cdCAqIHNvIGZhciBvbmx5IGNvbnNpc3RzIG9mIGFnZW50IHByZWZpeGVzIChgQHdvcmtzcGFjZWApXG5cdCAqIGFuZC9vciBjb21tYW5kIHByZWZpeGVzIChgQHdvcmtzcGFjZSAvZml4YCkuXG5cdCAqL1xuXHRyZWFkb25seSB3YWl0aW5nRm9ySW5wdXQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZUNoYXRTZXNzaW9uIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElWb2ljZUNoYXRUZXh0RXZlbnQ+O1xufVxuXG5pbnRlcmZhY2UgSVBocmFzZVZhbHVlIHtcblx0cmVhZG9ubHkgYWdlbnQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29tbWFuZD86IHN0cmluZztcbn1cblxuZW51bSBQaHJhc2VUZXh0VHlwZSB7XG5cdEFHRU5UID0gMSxcblx0Q09NTUFORCA9IDIsXG5cdEFHRU5UX0FORF9DT01NQU5EID0gM1xufVxuXG5leHBvcnQgY29uc3QgVm9pY2VDaGF0SW5Qcm9ncmVzcyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd2b2ljZUNoYXRJblByb2dyZXNzJywgZmFsc2UsIHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZvaWNlQ2hhdEluUHJvZ3Jlc3MnLCBcIkEgc3BlZWNoLXRvLXRleHQgc2Vzc2lvbiBpcyBpbiBwcm9ncmVzcyBmb3IgY2hhdC5cIikgfSk7XG5cbmV4cG9ydCBjbGFzcyBWb2ljZUNoYXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElWb2ljZUNoYXRTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQUdFTlRfUFJFRklYID0gY2hhdEFnZW50TGVhZGVyO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDT01NQU5EX1BSRUZJWCA9IGNoYXRTdWJjb21tYW5kTGVhZGVyO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBIUkFTRVNfTE9XRVIgPSB7XG5cdFx0W3RoaXMuQUdFTlRfUFJFRklYXTogJ2F0Jyxcblx0XHRbdGhpcy5DT01NQU5EX1BSRUZJWF06ICdzbGFzaCdcblx0fTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQSFJBU0VTX1VQUEVSID0ge1xuXHRcdFt0aGlzLkFHRU5UX1BSRUZJWF06ICdBdCcsXG5cdFx0W3RoaXMuQ09NTUFORF9QUkVGSVhdOiAnU2xhc2gnXG5cdH07XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0hBVF9BR0VOVF9BTElBUyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KFtbJ3ZzY29kZScsICdjb2RlJ11dKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZvaWNlQ2hhdEluUHJvZ3Jlc3M6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGFjdGl2ZVZvaWNlQ2hhdFNlc3Npb25zID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNwZWVjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzcGVlY2hTZXJ2aWNlOiBJU3BlZWNoU2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudm9pY2VDaGF0SW5Qcm9ncmVzcyA9IFZvaWNlQ2hhdEluUHJvZ3Jlc3MuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUGhyYXNlcyhtb2RlbD86IElDaGF0TW9kZWwpOiBNYXA8c3RyaW5nLCBJUGhyYXNlVmFsdWU+IHtcblx0XHRjb25zdCBwaHJhc2VzID0gbmV3IE1hcDxzdHJpbmcsIElQaHJhc2VWYWx1ZT4oKTtcblxuXHRcdGZvciAoY29uc3QgYWdlbnQgb2YgdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFjdGl2YXRlZEFnZW50cygpKSB7XG5cdFx0XHRjb25zdCBhZ2VudFBocmFzZSA9IGAke1ZvaWNlQ2hhdFNlcnZpY2UuUEhSQVNFU19MT1dFUltWb2ljZUNoYXRTZXJ2aWNlLkFHRU5UX1BSRUZJWF19ICR7Vm9pY2VDaGF0U2VydmljZS5DSEFUX0FHRU5UX0FMSUFTLmdldChhZ2VudC5uYW1lKSA/PyBhZ2VudC5uYW1lfWAudG9Mb3dlckNhc2UoKTtcblx0XHRcdHBocmFzZXMuc2V0KGFnZW50UGhyYXNlLCB7IGFnZW50OiBhZ2VudC5uYW1lIH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNsYXNoQ29tbWFuZCBvZiBhZ2VudC5zbGFzaENvbW1hbmRzKSB7XG5cdFx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZFBocmFzZSA9IGAke1ZvaWNlQ2hhdFNlcnZpY2UuUEhSQVNFU19MT1dFUltWb2ljZUNoYXRTZXJ2aWNlLkNPTU1BTkRfUFJFRklYXX0gJHtzbGFzaENvbW1hbmQubmFtZX1gLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdHBocmFzZXMuc2V0KHNsYXNoQ29tbWFuZFBocmFzZSwgeyBhZ2VudDogYWdlbnQubmFtZSwgY29tbWFuZDogc2xhc2hDb21tYW5kLm5hbWUgfSk7XG5cblx0XHRcdFx0Y29uc3QgYWdlbnRTbGFzaENvbW1hbmRQaHJhc2UgPSBgJHthZ2VudFBocmFzZX0gJHtzbGFzaENvbW1hbmRQaHJhc2V9YC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRwaHJhc2VzLnNldChhZ2VudFNsYXNoQ29tbWFuZFBocmFzZSwgeyBhZ2VudDogYWdlbnQubmFtZSwgY29tbWFuZDogc2xhc2hDb21tYW5kLm5hbWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBocmFzZXM7XG5cdH1cblxuXHRwcml2YXRlIHRvVGV4dCh2YWx1ZTogSVBocmFzZVZhbHVlLCB0eXBlOiBQaHJhc2VUZXh0VHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIFBocmFzZVRleHRUeXBlLkFHRU5UOlxuXHRcdFx0XHRyZXR1cm4gYCR7Vm9pY2VDaGF0U2VydmljZS5BR0VOVF9QUkVGSVh9JHt2YWx1ZS5hZ2VudH1gO1xuXHRcdFx0Y2FzZSBQaHJhc2VUZXh0VHlwZS5DT01NQU5EOlxuXHRcdFx0XHRyZXR1cm4gYCR7Vm9pY2VDaGF0U2VydmljZS5DT01NQU5EX1BSRUZJWH0ke3ZhbHVlLmNvbW1hbmR9YDtcblx0XHRcdGNhc2UgUGhyYXNlVGV4dFR5cGUuQUdFTlRfQU5EX0NPTU1BTkQ6XG5cdFx0XHRcdHJldHVybiBgJHtWb2ljZUNoYXRTZXJ2aWNlLkFHRU5UX1BSRUZJWH0ke3ZhbHVlLmFnZW50fSAke1ZvaWNlQ2hhdFNlcnZpY2UuQ09NTUFORF9QUkVGSVh9JHt2YWx1ZS5jb21tYW5kfWA7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY3JlYXRlVm9pY2VDaGF0U2Vzc2lvbih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG9wdGlvbnM6IElWb2ljZUNoYXRTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8SVZvaWNlQ2hhdFNlc3Npb24+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkID0gKGRpc3Bvc2U6IGJvb2xlYW4pID0+IHtcblx0XHRcdHRoaXMuYWN0aXZlVm9pY2VDaGF0U2Vzc2lvbnMgPSBNYXRoLm1heCgwLCB0aGlzLmFjdGl2ZVZvaWNlQ2hhdFNlc3Npb25zIC0gMSk7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVWb2ljZUNoYXRTZXNzaW9ucyA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnZvaWNlQ2hhdEluUHJvZ3Jlc3MucmVzZXQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRpc3Bvc2UpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQodHJ1ZSkpKTtcblxuXHRcdGxldCBkZXRlY3RlZEFnZW50ID0gZmFsc2U7XG5cdFx0bGV0IGRldGVjdGVkU2xhc2hDb21tYW5kID0gZmFsc2U7XG5cblx0XHRjb25zdCBlbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElWb2ljZUNoYXRUZXh0RXZlbnQ+KCkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLnNwZWVjaFNlcnZpY2UuY3JlYXRlU3BlZWNoVG9UZXh0U2Vzc2lvbih0b2tlbiwgJ2NoYXQnKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0b25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGhyYXNlcyA9IHRoaXMuY3JlYXRlUGhyYXNlcyhvcHRpb25zLm1vZGVsKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbi5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdHN3aXRjaCAoZS5zdGF0dXMpIHtcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmc6XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQ6IHtcblx0XHRcdFx0XHRsZXQgbWFzc2FnZWRFdmVudDogSVZvaWNlQ2hhdFRleHRFdmVudCA9IGU7XG5cdFx0XHRcdFx0aWYgKGUudGV4dCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhcnRzV2l0aEFnZW50ID0gZS50ZXh0LnN0YXJ0c1dpdGgoVm9pY2VDaGF0U2VydmljZS5QSFJBU0VTX1VQUEVSW1ZvaWNlQ2hhdFNlcnZpY2UuQUdFTlRfUFJFRklYXSkgfHwgZS50ZXh0LnN0YXJ0c1dpdGgoVm9pY2VDaGF0U2VydmljZS5QSFJBU0VTX0xPV0VSW1ZvaWNlQ2hhdFNlcnZpY2UuQUdFTlRfUFJFRklYXSk7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydHNXaXRoU2xhc2hDb21tYW5kID0gZS50ZXh0LnN0YXJ0c1dpdGgoVm9pY2VDaGF0U2VydmljZS5QSFJBU0VTX1VQUEVSW1ZvaWNlQ2hhdFNlcnZpY2UuQ09NTUFORF9QUkVGSVhdKSB8fCBlLnRleHQuc3RhcnRzV2l0aChWb2ljZUNoYXRTZXJ2aWNlLlBIUkFTRVNfTE9XRVJbVm9pY2VDaGF0U2VydmljZS5DT01NQU5EX1BSRUZJWF0pO1xuXHRcdFx0XHRcdFx0aWYgKHN0YXJ0c1dpdGhBZ2VudCB8fCBzdGFydHNXaXRoU2xhc2hDb21tYW5kKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsV29yZHMgPSBlLnRleHQuc3BsaXQoJyAnKTtcblx0XHRcdFx0XHRcdFx0bGV0IHRyYW5zZm9ybWVkV29yZHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0XHRcdGxldCB3YWl0aW5nRm9ySW5wdXQgPSBmYWxzZTtcblxuXHRcdFx0XHRcdFx0XHQvLyBDaGVjayBmb3IgYWdlbnQgKyBzbGFzaCBjb21tYW5kXG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zLnVzZXNBZ2VudHMgJiYgc3RhcnRzV2l0aEFnZW50ICYmICFkZXRlY3RlZEFnZW50ICYmICFkZXRlY3RlZFNsYXNoQ29tbWFuZCAmJiBvcmlnaW5hbFdvcmRzLmxlbmd0aCA+PSA0KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGhyYXNlID0gcGhyYXNlcy5nZXQob3JpZ2luYWxXb3Jkcy5zbGljZSgwLCA0KS5tYXAod29yZCA9PiB0aGlzLm5vcm1hbGl6ZVdvcmQod29yZCkpLmpvaW4oJyAnKSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHBocmFzZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHJhbnNmb3JtZWRXb3JkcyA9IFt0aGlzLnRvVGV4dChwaHJhc2UsIFBocmFzZVRleHRUeXBlLkFHRU5UX0FORF9DT01NQU5EKSwgLi4ub3JpZ2luYWxXb3Jkcy5zbGljZSg0KV07XG5cblx0XHRcdFx0XHRcdFx0XHRcdHdhaXRpbmdGb3JJbnB1dCA9IG9yaWdpbmFsV29yZHMubGVuZ3RoID09PSA0O1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoZS5zdGF0dXMgPT09IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRldGVjdGVkQWdlbnQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXRlY3RlZFNsYXNoQ29tbWFuZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Ly8gQ2hlY2sgZm9yIGFnZW50IChpZiBub3QgZG9uZSBhbHJlYWR5KVxuXHRcdFx0XHRcdFx0XHRpZiAob3B0aW9ucy51c2VzQWdlbnRzICYmIHN0YXJ0c1dpdGhBZ2VudCAmJiAhZGV0ZWN0ZWRBZ2VudCAmJiAhdHJhbnNmb3JtZWRXb3JkcyAmJiBvcmlnaW5hbFdvcmRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGhyYXNlID0gcGhyYXNlcy5nZXQob3JpZ2luYWxXb3Jkcy5zbGljZSgwLCAyKS5tYXAod29yZCA9PiB0aGlzLm5vcm1hbGl6ZVdvcmQod29yZCkpLmpvaW4oJyAnKSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHBocmFzZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHJhbnNmb3JtZWRXb3JkcyA9IFt0aGlzLnRvVGV4dChwaHJhc2UsIFBocmFzZVRleHRUeXBlLkFHRU5UKSwgLi4ub3JpZ2luYWxXb3Jkcy5zbGljZSgyKV07XG5cblx0XHRcdFx0XHRcdFx0XHRcdHdhaXRpbmdGb3JJbnB1dCA9IG9yaWdpbmFsV29yZHMubGVuZ3RoID09PSAyO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoZS5zdGF0dXMgPT09IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRldGVjdGVkQWdlbnQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdC8vIENoZWNrIGZvciBzbGFzaCBjb21tYW5kIChpZiBub3QgZG9uZSBhbHJlYWR5KVxuXHRcdFx0XHRcdFx0XHRpZiAoc3RhcnRzV2l0aFNsYXNoQ29tbWFuZCAmJiAhZGV0ZWN0ZWRTbGFzaENvbW1hbmQgJiYgIXRyYW5zZm9ybWVkV29yZHMgJiYgb3JpZ2luYWxXb3Jkcy5sZW5ndGggPj0gMikge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBocmFzZSA9IHBocmFzZXMuZ2V0KG9yaWdpbmFsV29yZHMuc2xpY2UoMCwgMikubWFwKHdvcmQgPT4gdGhpcy5ub3JtYWxpemVXb3JkKHdvcmQpKS5qb2luKCcgJykpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwaHJhc2UpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRyYW5zZm9ybWVkV29yZHMgPSBbdGhpcy50b1RleHQocGhyYXNlLCBvcHRpb25zLnVzZXNBZ2VudHMgJiYgIWRldGVjdGVkQWdlbnQgP1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRQaHJhc2VUZXh0VHlwZS5BR0VOVF9BTkRfQ09NTUFORCA6IFx0Ly8gcmV3cml0ZSBgL2ZpeGAgdG8gYEB3b3Jrc3BhY2UgL2Zvb2AgaW4gdGhpcyBjYXNlXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFBocmFzZVRleHRUeXBlLkNPTU1BTkRcdFx0XHRcdC8vIHdoZW4gd2UgaGF2ZSBub3QgeWV0IGRldGVjdGVkIGFuIGFnZW50IGJlZm9yZVxuXHRcdFx0XHRcdFx0XHRcdFx0KSwgLi4ub3JpZ2luYWxXb3Jkcy5zbGljZSgyKV07XG5cblx0XHRcdFx0XHRcdFx0XHRcdHdhaXRpbmdGb3JJbnB1dCA9IG9yaWdpbmFsV29yZHMubGVuZ3RoID09PSAyO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoZS5zdGF0dXMgPT09IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRldGVjdGVkU2xhc2hDb21tYW5kID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRtYXNzYWdlZEV2ZW50ID0ge1xuXHRcdFx0XHRcdFx0XHRcdHN0YXR1czogZS5zdGF0dXMsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogKHRyYW5zZm9ybWVkV29yZHMgPz8gb3JpZ2luYWxXb3Jkcykuam9pbignICcpLFxuXHRcdFx0XHRcdFx0XHRcdHdhaXRpbmdGb3JJbnB1dFxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbWl0dGVyLmZpcmUobWFzc2FnZWRFdmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RhcnRlZDpcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZVZvaWNlQ2hhdFNlc3Npb25zKys7XG5cdFx0XHRcdFx0dGhpcy52b2ljZUNoYXRJblByb2dyZXNzLnNldCh0cnVlKTtcblx0XHRcdFx0XHRlbWl0dGVyLmZpcmUoZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlN0b3BwZWQ6XG5cdFx0XHRcdFx0b25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQoZmFsc2UpO1xuXHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuRXJyb3I6XG5cdFx0XHRcdFx0ZW1pdHRlci5maXJlKGUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIG5vcm1hbGl6ZVdvcmQod29yZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR3b3JkID0gcnRyaW0od29yZCwgJy4nKTtcblx0XHR3b3JkID0gcnRyaW0od29yZCwgJywnKTtcblx0XHR3b3JkID0gcnRyaW0od29yZCwgJz8nKTtcblxuXHRcdHJldHVybiB3b3JkLnRvTG93ZXJDYXNlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsYUFBYTtBQUN0QixTQUFzQixvQkFBb0IscUJBQXFCO0FBQy9ELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsaUJBQWlCLDRCQUE0QjtBQUN0RCxTQUFTLGdCQUFvQywwQkFBMEI7QUFFaEUsTUFBTSxvQkFBb0IsZ0JBQW1D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
