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
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { ActionType } from "../common/state/sessionActions.js";
import { isAhpChatChannel, isDefaultChatUri } from "../common/state/sessionState.js";
import { buildConversationContext, renderResponseMarkdown, truncateMiddle } from "../common/agentHostConversationContext.js";
const MAX_TITLE_LENGTH = 200;
const MAX_TITLE_TOKENS = 32;
const MAX_TRAILING_HAN_SUFFIX_CODE_UNITS = 6;
const MIN_LATIN_LETTERS_BEFORE_HAN_SUFFIX = 4;
const MIN_LATIN_LETTER_RATIO = 0.8;
const HAN_CHARACTER = /\p{sc=Han}/u;
const TRAILING_HAN_SUFFIX = /(?<!\p{sc=Han})\p{sc=Han}{2,3}$/u;
const MAX_TITLE_CONTEXT_CHARS = 2e4;
let AgentHostSessionTitleController = class extends Disposable {
  constructor(_stateManager, _options, _logService) {
    super();
    this._stateManager = _stateManager;
    this._options = _options;
    this._logService = _logService;
    this._titleGenerationCancellationSources = /* @__PURE__ */ new Map();
    /**
     * The most recent title this controller applied for a given session/chat
     * key. Used to detect whether the title was changed (e.g. a manual
     * `/rename` or user edit) since we last set it, so we never clobber a
     * deliberate title with an auto-generated one.
     */
    this._lastAppliedTitle = /* @__PURE__ */ new Map();
    /**
     * Session/chat keys whose current title is a provisional placeholder set by
     * {@link seedProvisionalTitle} (e.g. from a `!command`). Such a title does
     * not describe the session's topic, so the first subsequent request that
     * carries real intent replaces it with a generated title via
     * {@link seedTitleFromFirstMessage}.
     */
    this._provisionalTitles = /* @__PURE__ */ new Set();
  }
  seedTitleFromFirstMessage(channel, userPrompt, chatChannel) {
    const fallbackTitle = this._normalizeTitle(userPrompt);
    if (!fallbackTitle) {
      return;
    }
    const additionalChat = this._additionalChatChannel(chatChannel);
    const key = additionalChat ?? channel;
    const state = additionalChat ? this._stateManager.getChatState(additionalChat) : this._stateManager.getSessionState(channel);
    if (!state || !this._canSeedFirstMessageTitle(key, state.turns.length, state.title)) {
      return;
    }
    const replacesProvisionalTitle = this._provisionalTitles.has(key);
    this._provisionalTitles.delete(key);
    this._applySeedTitle(channel, additionalChat, fallbackTitle);
    if (replacesProvisionalTitle) {
      this._persistSeedTitle(channel, additionalChat, fallbackTitle);
    }
    this._generateTitleSoon(
      key,
      userPrompt,
      false,
      fallbackTitle,
      (title) => this._applySeedTitle(channel, additionalChat, title),
      () => this._currentSeedTitle(channel, additionalChat) === this._lastAppliedTitle.get(key),
      (title) => this._persistSeedTitle(channel, additionalChat, title)
    );
  }
  /** Seeds and persists a provisional title suggested by a locally handled command. */
  seedProvisionalTitle(channel, suggestedTitle, chatChannel) {
    const title = this._normalizeTitle(suggestedTitle);
    if (!title) {
      return;
    }
    const additionalChat = this._additionalChatChannel(chatChannel);
    const key = additionalChat ?? channel;
    const state = additionalChat ? this._stateManager.getChatState(additionalChat) : this._stateManager.getSessionState(channel);
    if (!state || !this._canSeedProvisionalTitle(key, state.title)) {
      return;
    }
    this._provisionalTitles.add(key);
    this._applySeedTitle(channel, additionalChat, title);
    this._persistSeedTitle(channel, additionalChat, title);
  }
  /** Trims, collapses whitespace, and length-caps a candidate title. */
  _normalizeTitle(text) {
    return text.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH);
  }
  /**
   * The peer (additional) chat a seed should title, or `undefined` to title
   * the session itself. The default chat maps to the session.
   */
  _additionalChatChannel(chatChannel) {
    return !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel) ? chatChannel : void 0;
  }
  /**
   * Applies `title` to the addressed peer chat (`additionalChat`) or, when
   * that is `undefined`, to the session itself, recording it as last-applied.
   */
  _applySeedTitle(channel, additionalChat, title) {
    if (additionalChat) {
      this._applyTitle(additionalChat, title, (t) => this._stateManager.updateChatTitle(channel, additionalChat, t));
    } else {
      this._applyTitle(channel, title, (t) => this._stateManager.dispatchServerAction(channel, {
        type: ActionType.SessionTitleChanged,
        title: t
      }));
    }
  }
  /** Persists `title` as the custom title of the addressed peer chat or session. */
  _persistSeedTitle(channel, additionalChat, title) {
    this._persistSessionFlag(channel, additionalChat ? `customChatTitle:${additionalChat}` : "customTitle", title);
  }
  /** The live title of the addressed peer chat or session. */
  _currentSeedTitle(channel, additionalChat) {
    return additionalChat ? this._stateManager.getChatState(additionalChat)?.title : this._stateManager.getSessionState(channel)?.title;
  }
  /**
   * Whether {@link seedTitleFromFirstMessage} may (re)title `key`: true for a
   * fresh, untitled target (its first message) or when its title is a
   * provisional placeholder we applied and no one has changed it since — the
   * first real request supersedes the placeholder.
   */
  _canSeedFirstMessageTitle(key, turnsLength, currentTitle) {
    if (turnsLength === 0 && !currentTitle) {
      return true;
    }
    return this._provisionalTitles.has(key) && !!currentTitle && currentTitle === this._lastAppliedTitle.get(key);
  }
  /**
   * Whether {@link seedProvisionalTitle} may (re)title `key`: true when it is
   * untitled (the first message carried a suggestion) or when its title is a
   * provisional placeholder we applied and no one has changed it since —
   * successive suggestions keep the newest one visible without clobbering a
   * manual rename.
   */
  _canSeedProvisionalTitle(key, currentTitle) {
    if (!currentTitle) {
      return true;
    }
    return this._provisionalTitles.has(key) && currentTitle === this._lastAppliedTitle.get(key);
  }
  /**
   * Re-generates the title once the first turn has completed, this time
   * using the full first-turn context (the user request plus the agent's
   * textual response) rather than just the opening message. This only runs
   * for the very first turn and only when the current title is still the one
   * this controller last applied — a manual `/rename`, a user edit, or a
   * forked session's inherited title all suppress it.
   *
   * Only normal text response parts are considered (tool calls, reasoning,
   * and other parts are ignored). If the context still exceeds the budget
   * the middle is removed (marked with `...`). The user's first request is
   * always preserved.
   */
  refineTitleFromFirstTurn(channel, chatChannel) {
    const isAdditionalChat = !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel);
    if (isAdditionalChat) {
      const chatState = this._stateManager.getChatState(chatChannel);
      if (!chatState || chatState.turns.length !== 1) {
        return;
      }
      const lastApplied2 = this._lastAppliedTitle.get(chatChannel);
      if (lastApplied2 === void 0 || chatState.title !== lastApplied2) {
        return;
      }
      const context2 = this._buildFirstTurnContext(chatState.turns[0]);
      if (!context2) {
        return;
      }
      const apply2 = (title) => this._applyTitle(chatChannel, title, (t) => this._stateManager.updateChatTitle(channel, chatChannel, t));
      this._generateTitleSoon(
        chatChannel,
        context2,
        true,
        lastApplied2,
        apply2,
        () => this._stateManager.getChatState(chatChannel)?.title === this._lastAppliedTitle.get(chatChannel),
        (title) => this._persistSessionFlag(channel, `customChatTitle:${chatChannel}`, title)
      );
      return;
    }
    const state = this._stateManager.getSessionState(channel);
    if (!state || state.turns.length !== 1) {
      return;
    }
    const lastApplied = this._lastAppliedTitle.get(channel);
    if (lastApplied === void 0 || state.title !== lastApplied) {
      return;
    }
    const context = this._buildFirstTurnContext(state.turns[0]);
    if (!context) {
      return;
    }
    const apply = (title) => this._applyTitle(channel, title, (t) => this._stateManager.dispatchServerAction(channel, {
      type: ActionType.SessionTitleChanged,
      title: t
    }));
    this._generateTitleSoon(
      channel,
      context,
      true,
      lastApplied,
      apply,
      () => this._stateManager.getSessionState(channel)?.title === this._lastAppliedTitle.get(channel),
      (title) => this._persistSessionFlag(channel, "customTitle", title)
    );
  }
  /**
   * Generates a title for a freshly forked session or chat from its
   * inherited conversation context. Forks copy the source history up to the
   * fork point, so neither {@link seedTitleFromFirstMessage} nor
   * {@link refineTitleFromFirstTurn} (which require an empty / single-turn
   * state) ever fire for them. This is the fork equivalent, run once at fork
   * time over the kept turns, so the new chat gets a content-derived title
   * instead of permanently inheriting the source's `Forked: …` title.
   *
   * `fallbackTitle` is the title the caller already applied to the new
   * session/chat (e.g. `Forked: <source>`); it is recorded as the
   * last-applied title so a concurrent manual rename suppresses the
   * generated title, and stays visible until generation completes. The
   * context is bounded to {@link MAX_TITLE_CONTEXT_CHARS} (middle-truncated),
   * so generation costs at most a single small-model call.
   */
  generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle) {
    const context = this._buildConversationContext(turns, sourceTitle);
    if (!context) {
      return;
    }
    const isAdditionalChat = !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel);
    if (isAdditionalChat) {
      const key = chatChannel;
      this._lastAppliedTitle.set(key, fallbackTitle);
      const apply2 = (title) => this._applyTitle(key, title, (t) => this._stateManager.updateChatTitle(channel, key, t));
      this._generateTitleSoon(
        key,
        context,
        true,
        fallbackTitle,
        apply2,
        () => this._stateManager.getChatState(key)?.title === this._lastAppliedTitle.get(key),
        (title) => this._persistSessionFlag(channel, `customChatTitle:${key}`, title)
      );
      return;
    }
    this._lastAppliedTitle.set(channel, fallbackTitle);
    const apply = (title) => this._applyTitle(channel, title, (t) => this._stateManager.dispatchServerAction(channel, {
      type: ActionType.SessionTitleChanged,
      title: t
    }));
    this._generateTitleSoon(
      channel,
      context,
      true,
      fallbackTitle,
      apply,
      () => this._stateManager.getSessionState(channel)?.title === this._lastAppliedTitle.get(channel),
      (title) => this._persistSessionFlag(channel, "customTitle", title)
    );
  }
  _applyTitle(key, title, dispatch) {
    this._lastAppliedTitle.set(key, title);
    dispatch(title);
  }
  cancelTitleGeneration(session) {
    this._cancelTitleGeneration(session);
  }
  _generateTitleSoon(key, promptContent, isConversation, fallbackTitle, apply, currentTitleMatchesFallback, persist) {
    this._cancelTitleGeneration(key);
    const source = new CancellationTokenSource();
    this._titleGenerationCancellationSources.set(key, source);
    void this._generateTitle(key, promptContent, isConversation, fallbackTitle, apply, currentTitleMatchesFallback, persist, source.token).catch((err) => {
      if (!source.token.isCancellationRequested) {
        this._logService.warn(`[AgentHostSessionTitleController] Failed to apply generated title for ${key}`, err);
      }
    }).finally(() => {
      if (this._titleGenerationCancellationSources.get(key) === source) {
        this._titleGenerationCancellationSources.delete(key);
        source.dispose();
      }
    });
  }
  async _generateTitle(key, promptContent, isConversation, fallbackTitle, apply, currentTitleMatchesFallback, persist, token) {
    const generatedTitle = await this._generateTitleFromPrompt(promptContent, isConversation, token);
    if (token.isCancellationRequested || !generatedTitle) {
      return;
    }
    if (!currentTitleMatchesFallback()) {
      return;
    }
    if (generatedTitle !== fallbackTitle) {
      apply(generatedTitle);
    }
    persist(generatedTitle);
  }
  async _generateTitleFromPrompt(promptContent, isConversation, token) {
    if (token.isCancellationRequested) {
      return void 0;
    }
    const githubToken = this._options.getGitHubCopilotToken?.();
    const copilotApiService = this._options.copilotApiService;
    if (!githubToken || !copilotApiService) {
      return void 0;
    }
    const abortController = new AbortController();
    const cancellationListener = token.onCancellationRequested(() => abortController.abort());
    try {
      const rawTitle = await copilotApiService.utilityChatCompletion(githubToken, {
        messages: this._buildTitlePrompt(promptContent, isConversation),
        maxTokens: MAX_TITLE_TOKENS
      }, {
        signal: abortController.signal
      });
      return this._cleanTitle(rawTitle, promptContent);
    } catch (err) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      this._logService.warn("[AgentHostSessionTitleController] Failed to generate session title", err);
      return void 0;
    } finally {
      cancellationListener.dispose();
    }
  }
  _buildTitlePrompt(promptContent, isConversation) {
    const userInstruction = isConversation ? `Please write a brief title for the following conversation:

${promptContent}` : `Please write a brief title for the following request:

${promptContent}`;
    return [
      {
        role: "system",
        content: [
          "You are an expert in crafting ultra-compact titles for chatbot conversations.",
          "You are presented with a chat request or conversation, and you reply with only a brief title that captures the main topic.",
          "Write the title in sentence case, not title case.",
          "Preserve product names, abbreviations, code symbols, and proper nouns.",
          "Aim for 3-6 words. Prefer the shortest accurate title.",
          'Drop articles like "a", "an", and "the" unless needed for clarity.',
          'Drop filler and generic framing like "help with", "question about", "request for", or "issue with".',
          "Never describe the chat itself as forked, branched, or continued \u2014 title only the underlying topic.",
          "Prefer short, concrete synonyms and omit unnecessary words.",
          "Do not wrap the title in quotes or add trailing punctuation."
        ].join(" ")
      },
      {
        role: "user",
        content: userInstruction
      }
    ];
  }
  _cleanTitle(rawTitle, promptContent) {
    let title = rawTitle.trim();
    const firstLine = title.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
    title = firstLine ?? "";
    if (title.startsWith('"') && title.endsWith('"') && title.length > 1) {
      title = title.slice(1, -1).trim();
    }
    title = title.replace(/[.!?]+$/, "").trim();
    if (!title || title.includes("can't assist with that")) {
      return void 0;
    }
    title = title.slice(0, MAX_TITLE_LENGTH + MAX_TRAILING_HAN_SUFFIX_CODE_UNITS);
    return this._stripUnexpectedTrailingHanSuffix(title, promptContent).slice(0, MAX_TITLE_LENGTH);
  }
  _stripUnexpectedTrailingHanSuffix(title, promptContent) {
    if (HAN_CHARACTER.test(promptContent)) {
      return title;
    }
    const suffix = TRAILING_HAN_SUFFIX.exec(title);
    if (!suffix) {
      return title;
    }
    const prefix = title.slice(0, suffix.index).trimEnd();
    const letterCount = prefix.match(/\p{L}/gu)?.length ?? 0;
    const latinLetterCount = prefix.match(/\p{sc=Latin}/gu)?.length ?? 0;
    if (latinLetterCount < MIN_LATIN_LETTERS_BEFORE_HAN_SUFFIX || latinLetterCount / letterCount < MIN_LATIN_LETTER_RATIO) {
      return title;
    }
    return prefix;
  }
  /**
   * Builds the first-turn context string for title refinement. The user's
   * request is always kept (truncated in the middle only if it alone exceeds
   * half the budget). Only normal text (markdown) response parts are
   * considered — tool calls, reasoning, and other parts are ignored. If the
   * combined text is over budget, the middle of the response is removed.
   *
   * @returns the context string, or `undefined` when the turn has no text
   * response worth refining from (the opening message already produced a
   * title in that case).
   */
  _buildFirstTurnContext(turn) {
    const response = renderResponseMarkdown(turn.responseParts);
    if (!response) {
      return void 0;
    }
    const userBudget = Math.floor(MAX_TITLE_CONTEXT_CHARS / 2);
    let userRequest = turn.message.text.trim();
    if (userRequest.length > userBudget) {
      userRequest = truncateMiddle(userRequest, userBudget);
    }
    const userBlock = `User request:
${userRequest}`;
    const responseLabel = "\n\nAgent response:\n";
    const responseBudget = Math.max(0, MAX_TITLE_CONTEXT_CHARS - userBlock.length - responseLabel.length);
    const trimmedResponse = response.length > responseBudget ? truncateMiddle(response, responseBudget) : response;
    return trimmedResponse ? `${userBlock}${responseLabel}${trimmedResponse}` : userBlock;
  }
  /**
   * Builds a conversation context string for forked-title generation by
   * concatenating each kept turn's user request and textual response. Only
   * normal text (markdown) response parts are considered — tool calls,
   * reasoning, and other parts are ignored, mirroring
   * {@link _buildFirstTurnContext}. When the fork's `sourceTitle` is known, a
   * short framing note is prepended so the model understands the conversation
   * is a branch continued from an earlier chat. The conversation is
   * middle-truncated to {@link MAX_TITLE_CONTEXT_CHARS} to bound model cost;
   * the framing note is always preserved in full.
   *
   * @returns the context string, or `undefined` when no turn carries any
   * text worth titling from.
   */
  _buildConversationContext(turns, sourceTitle) {
    const framedTitle = sourceTitle?.trim();
    const framing = framedTitle ? `This conversation was branched from an earlier chat titled "${framedTitle}". The turns below, oldest first, are the inherited history up to the branch point.

` : void 0;
    return buildConversationContext(turns, { maxChars: MAX_TITLE_CONTEXT_CHARS, framing });
  }
  _persistSessionFlag(session, key, value) {
    const ref = this._options.sessionDataService.openDatabase(URI.parse(session));
    ref.object.setMetadata(key, value).catch((err) => {
      this._logService.warn(`[AgentHostSessionTitleController] Failed to persist ${key}`, err);
    }).finally(() => {
      ref.dispose();
    });
  }
  _cancelTitleGeneration(session) {
    const source = this._titleGenerationCancellationSources.get(session);
    if (!source) {
      return;
    }
    source.dispose(true);
    this._titleGenerationCancellationSources.delete(session);
  }
  dispose() {
    for (const source of this._titleGenerationCancellationSources.values()) {
      source.dispose(true);
    }
    this._titleGenerationCancellationSources.clear();
    this._lastAppliedTitle.clear();
    this._provisionalTitles.clear();
    super.dispose();
  }
};
AgentHostSessionTitleController = __decorateClass([
  __decorateParam(2, ILogService)
], AgentHostSessionTitleController);
export {
  AgentHostSessionTitleController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGlzQWhwQ2hhdENoYW5uZWwsIGlzRGVmYXVsdENoYXRVcmksIHR5cGUgVHVybiwgdHlwZSBVUkkgYXMgUHJvdG9jb2xVUkkgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ29udmVyc2F0aW9uQ29udGV4dCwgcmVuZGVyUmVzcG9uc2VNYXJrZG93biwgdHJ1bmNhdGVNaWRkbGUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q29udmVyc2F0aW9uQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UsIHR5cGUgSUNvcGlsb3RVdGlsaXR5Q2hhdE1lc3NhZ2UgfSBmcm9tICcuL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5cbmNvbnN0IE1BWF9USVRMRV9MRU5HVEggPSAyMDA7XG5jb25zdCBNQVhfVElUTEVfVE9LRU5TID0gMzI7XG5jb25zdCBNQVhfVFJBSUxJTkdfSEFOX1NVRkZJWF9DT0RFX1VOSVRTID0gNjtcbmNvbnN0IE1JTl9MQVRJTl9MRVRURVJTX0JFRk9SRV9IQU5fU1VGRklYID0gNDtcbmNvbnN0IE1JTl9MQVRJTl9MRVRURVJfUkFUSU8gPSAwLjg7XG5jb25zdCBIQU5fQ0hBUkFDVEVSID0gL1xccHtzYz1IYW59L3U7XG5jb25zdCBUUkFJTElOR19IQU5fU1VGRklYID0gLyg/PCFcXHB7c2M9SGFufSlcXHB7c2M9SGFufXsyLDN9JC91O1xuXG4vKipcbiAqIFNvZnQgdXBwZXIgYm91bmQsIGluIGNoYXJhY3RlcnMsIGZvciB0aGUgZmlyc3QtdHVybiBjb250ZXh0IGZlZCB0byB0aGVcbiAqIHV0aWxpdHkgbW9kZWwgd2hlbiByZWZpbmluZyBhIHNlc3Npb24gdGl0bGUuIFNpemVkIHRvIHN0YXkgd2VsbCB3aXRoaW4gdGhlXG4gKiBzbWFsbCBtb2RlbCdzIGNvbnRleHQgd2luZG93IHdoaWxlIGxlYXZpbmcgcm9vbSBmb3IgdGhlIHByb21wdCBzY2FmZm9sZGluZy5cbiAqL1xuY29uc3QgTUFYX1RJVExFX0NPTlRFWFRfQ0hBUlMgPSAyMDAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlck9wdGlvbnMge1xuXHRyZWFkb25seSBzZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2U7XG5cdHJlYWRvbmx5IGdldEdpdEh1YkNvcGlsb3RUb2tlbj86ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29waWxvdEFwaVNlcnZpY2U/OiBJQ29waWxvdEFwaVNlcnZpY2U7XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVHZW5lcmF0aW9uQ2FuY2VsbGF0aW9uU291cmNlcyA9IG5ldyBNYXA8UHJvdG9jb2xVUkksIENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXG5cdC8qKlxuXHQgKiBUaGUgbW9zdCByZWNlbnQgdGl0bGUgdGhpcyBjb250cm9sbGVyIGFwcGxpZWQgZm9yIGEgZ2l2ZW4gc2Vzc2lvbi9jaGF0XG5cdCAqIGtleS4gVXNlZCB0byBkZXRlY3Qgd2hldGhlciB0aGUgdGl0bGUgd2FzIGNoYW5nZWQgKGUuZy4gYSBtYW51YWxcblx0ICogYC9yZW5hbWVgIG9yIHVzZXIgZWRpdCkgc2luY2Ugd2UgbGFzdCBzZXQgaXQsIHNvIHdlIG5ldmVyIGNsb2JiZXIgYVxuXHQgKiBkZWxpYmVyYXRlIHRpdGxlIHdpdGggYW4gYXV0by1nZW5lcmF0ZWQgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdEFwcGxpZWRUaXRsZSA9IG5ldyBNYXA8UHJvdG9jb2xVUkksIHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogU2Vzc2lvbi9jaGF0IGtleXMgd2hvc2UgY3VycmVudCB0aXRsZSBpcyBhIHByb3Zpc2lvbmFsIHBsYWNlaG9sZGVyIHNldCBieVxuXHQgKiB7QGxpbmsgc2VlZFByb3Zpc2lvbmFsVGl0bGV9IChlLmcuIGZyb20gYSBgIWNvbW1hbmRgKS4gU3VjaCBhIHRpdGxlIGRvZXNcblx0ICogbm90IGRlc2NyaWJlIHRoZSBzZXNzaW9uJ3MgdG9waWMsIHNvIHRoZSBmaXJzdCBzdWJzZXF1ZW50IHJlcXVlc3QgdGhhdFxuXHQgKiBjYXJyaWVzIHJlYWwgaW50ZW50IHJlcGxhY2VzIGl0IHdpdGggYSBnZW5lcmF0ZWQgdGl0bGUgdmlhXG5cdCAqIHtAbGluayBzZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlfS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3Zpc2lvbmFsVGl0bGVzID0gbmV3IFNldDxQcm90b2NvbFVSST4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlck9wdGlvbnMsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0c2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShjaGFubmVsOiBQcm90b2NvbFVSSSwgdXNlclByb21wdDogc3RyaW5nLCBjaGF0Q2hhbm5lbD86IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgZmFsbGJhY2tUaXRsZSA9IHRoaXMuX25vcm1hbGl6ZVRpdGxlKHVzZXJQcm9tcHQpO1xuXHRcdGlmICghZmFsbGJhY2tUaXRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGl0aW9uYWxDaGF0ID0gdGhpcy5fYWRkaXRpb25hbENoYXRDaGFubmVsKGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBrZXkgPSBhZGRpdGlvbmFsQ2hhdCA/PyBjaGFubmVsO1xuXHRcdGNvbnN0IHN0YXRlID0gYWRkaXRpb25hbENoYXQgPyB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGFkZGl0aW9uYWxDaGF0KSA6IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhbm5lbCk7XG5cdFx0aWYgKCFzdGF0ZSB8fCAhdGhpcy5fY2FuU2VlZEZpcnN0TWVzc2FnZVRpdGxlKGtleSwgc3RhdGUudHVybnMubGVuZ3RoLCBzdGF0ZS50aXRsZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVwbGFjZXNQcm92aXNpb25hbFRpdGxlID0gdGhpcy5fcHJvdmlzaW9uYWxUaXRsZXMuaGFzKGtleSk7XG5cdFx0dGhpcy5fcHJvdmlzaW9uYWxUaXRsZXMuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fYXBwbHlTZWVkVGl0bGUoY2hhbm5lbCwgYWRkaXRpb25hbENoYXQsIGZhbGxiYWNrVGl0bGUpO1xuXHRcdGlmIChyZXBsYWNlc1Byb3Zpc2lvbmFsVGl0bGUpIHtcblx0XHRcdHRoaXMuX3BlcnNpc3RTZWVkVGl0bGUoY2hhbm5lbCwgYWRkaXRpb25hbENoYXQsIGZhbGxiYWNrVGl0bGUpO1xuXHRcdH1cblx0XHR0aGlzLl9nZW5lcmF0ZVRpdGxlU29vbihcblx0XHRcdGtleSxcblx0XHRcdHVzZXJQcm9tcHQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbGxiYWNrVGl0bGUsXG5cdFx0XHR0aXRsZSA9PiB0aGlzLl9hcHBseVNlZWRUaXRsZShjaGFubmVsLCBhZGRpdGlvbmFsQ2hhdCwgdGl0bGUpLFxuXHRcdFx0KCkgPT4gdGhpcy5fY3VycmVudFNlZWRUaXRsZShjaGFubmVsLCBhZGRpdGlvbmFsQ2hhdCkgPT09IHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuZ2V0KGtleSksXG5cdFx0XHR0aXRsZSA9PiB0aGlzLl9wZXJzaXN0U2VlZFRpdGxlKGNoYW5uZWwsIGFkZGl0aW9uYWxDaGF0LCB0aXRsZSksXG5cdFx0KTtcblx0fVxuXG5cdC8qKiBTZWVkcyBhbmQgcGVyc2lzdHMgYSBwcm92aXNpb25hbCB0aXRsZSBzdWdnZXN0ZWQgYnkgYSBsb2NhbGx5IGhhbmRsZWQgY29tbWFuZC4gKi9cblx0c2VlZFByb3Zpc2lvbmFsVGl0bGUoY2hhbm5lbDogUHJvdG9jb2xVUkksIHN1Z2dlc3RlZFRpdGxlOiBzdHJpbmcsIGNoYXRDaGFubmVsPzogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuX25vcm1hbGl6ZVRpdGxlKHN1Z2dlc3RlZFRpdGxlKTtcblx0XHRpZiAoIXRpdGxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkaXRpb25hbENoYXQgPSB0aGlzLl9hZGRpdGlvbmFsQ2hhdENoYW5uZWwoY2hhdENoYW5uZWwpO1xuXHRcdGNvbnN0IGtleSA9IGFkZGl0aW9uYWxDaGF0ID8/IGNoYW5uZWw7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhZGRpdGlvbmFsQ2hhdCA/IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoYWRkaXRpb25hbENoYXQpIDogdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGFubmVsKTtcblx0XHRpZiAoIXN0YXRlIHx8ICF0aGlzLl9jYW5TZWVkUHJvdmlzaW9uYWxUaXRsZShrZXksIHN0YXRlLnRpdGxlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm92aXNpb25hbFRpdGxlcy5hZGQoa2V5KTtcblx0XHR0aGlzLl9hcHBseVNlZWRUaXRsZShjaGFubmVsLCBhZGRpdGlvbmFsQ2hhdCwgdGl0bGUpO1xuXHRcdHRoaXMuX3BlcnNpc3RTZWVkVGl0bGUoY2hhbm5lbCwgYWRkaXRpb25hbENoYXQsIHRpdGxlKTtcblx0fVxuXG5cdC8qKiBUcmltcywgY29sbGFwc2VzIHdoaXRlc3BhY2UsIGFuZCBsZW5ndGgtY2FwcyBhIGNhbmRpZGF0ZSB0aXRsZS4gKi9cblx0cHJpdmF0ZSBfbm9ybWFsaXplVGl0bGUodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGV4dC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnNsaWNlKDAsIE1BWF9USVRMRV9MRU5HVEgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBwZWVyIChhZGRpdGlvbmFsKSBjaGF0IGEgc2VlZCBzaG91bGQgdGl0bGUsIG9yIGB1bmRlZmluZWRgIHRvIHRpdGxlXG5cdCAqIHRoZSBzZXNzaW9uIGl0c2VsZi4gVGhlIGRlZmF1bHQgY2hhdCBtYXBzIHRvIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWRkaXRpb25hbENoYXRDaGFubmVsKGNoYXRDaGFubmVsPzogUHJvdG9jb2xVUkkpOiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuICEhY2hhdENoYW5uZWwgJiYgaXNBaHBDaGF0Q2hhbm5lbChjaGF0Q2hhbm5lbCkgJiYgIWlzRGVmYXVsdENoYXRVcmkoY2hhdENoYW5uZWwpID8gY2hhdENoYW5uZWwgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyBgdGl0bGVgIHRvIHRoZSBhZGRyZXNzZWQgcGVlciBjaGF0IChgYWRkaXRpb25hbENoYXRgKSBvciwgd2hlblxuXHQgKiB0aGF0IGlzIGB1bmRlZmluZWRgLCB0byB0aGUgc2Vzc2lvbiBpdHNlbGYsIHJlY29yZGluZyBpdCBhcyBsYXN0LWFwcGxpZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseVNlZWRUaXRsZShjaGFubmVsOiBQcm90b2NvbFVSSSwgYWRkaXRpb25hbENoYXQ6IFByb3RvY29sVVJJIHwgdW5kZWZpbmVkLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGFkZGl0aW9uYWxDaGF0KSB7XG5cdFx0XHR0aGlzLl9hcHBseVRpdGxlKGFkZGl0aW9uYWxDaGF0LCB0aXRsZSwgdCA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIudXBkYXRlQ2hhdFRpdGxlKGNoYW5uZWwsIGFkZGl0aW9uYWxDaGF0LCB0KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FwcGx5VGl0bGUoY2hhbm5lbCwgdGl0bGUsIHQgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5uZWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0XHR0aXRsZTogdCxcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUGVyc2lzdHMgYHRpdGxlYCBhcyB0aGUgY3VzdG9tIHRpdGxlIG9mIHRoZSBhZGRyZXNzZWQgcGVlciBjaGF0IG9yIHNlc3Npb24uICovXG5cdHByaXZhdGUgX3BlcnNpc3RTZWVkVGl0bGUoY2hhbm5lbDogUHJvdG9jb2xVUkksIGFkZGl0aW9uYWxDaGF0OiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhjaGFubmVsLCBhZGRpdGlvbmFsQ2hhdCA/IGBjdXN0b21DaGF0VGl0bGU6JHthZGRpdGlvbmFsQ2hhdH1gIDogJ2N1c3RvbVRpdGxlJywgdGl0bGUpO1xuXHR9XG5cblx0LyoqIFRoZSBsaXZlIHRpdGxlIG9mIHRoZSBhZGRyZXNzZWQgcGVlciBjaGF0IG9yIHNlc3Npb24uICovXG5cdHByaXZhdGUgX2N1cnJlbnRTZWVkVGl0bGUoY2hhbm5lbDogUHJvdG9jb2xVUkksIGFkZGl0aW9uYWxDaGF0OiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGFkZGl0aW9uYWxDaGF0ID8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShhZGRpdGlvbmFsQ2hhdCk/LnRpdGxlIDogdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGFubmVsKT8udGl0bGU7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB7QGxpbmsgc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZX0gbWF5IChyZSl0aXRsZSBga2V5YDogdHJ1ZSBmb3IgYVxuXHQgKiBmcmVzaCwgdW50aXRsZWQgdGFyZ2V0IChpdHMgZmlyc3QgbWVzc2FnZSkgb3Igd2hlbiBpdHMgdGl0bGUgaXMgYVxuXHQgKiBwcm92aXNpb25hbCBwbGFjZWhvbGRlciB3ZSBhcHBsaWVkIGFuZCBubyBvbmUgaGFzIGNoYW5nZWQgaXQgc2luY2UgXHUyMDE0IHRoZVxuXHQgKiBmaXJzdCByZWFsIHJlcXVlc3Qgc3VwZXJzZWRlcyB0aGUgcGxhY2Vob2xkZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9jYW5TZWVkRmlyc3RNZXNzYWdlVGl0bGUoa2V5OiBQcm90b2NvbFVSSSwgdHVybnNMZW5ndGg6IG51bWJlciwgY3VycmVudFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAodHVybnNMZW5ndGggPT09IDAgJiYgIWN1cnJlbnRUaXRsZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm92aXNpb25hbFRpdGxlcy5oYXMoa2V5KSAmJiAhIWN1cnJlbnRUaXRsZSAmJiBjdXJyZW50VGl0bGUgPT09IHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuZ2V0KGtleSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB7QGxpbmsgc2VlZFByb3Zpc2lvbmFsVGl0bGV9IG1heSAocmUpdGl0bGUgYGtleWA6IHRydWUgd2hlbiBpdCBpc1xuXHQgKiB1bnRpdGxlZCAodGhlIGZpcnN0IG1lc3NhZ2UgY2FycmllZCBhIHN1Z2dlc3Rpb24pIG9yIHdoZW4gaXRzIHRpdGxlIGlzIGFcblx0ICogcHJvdmlzaW9uYWwgcGxhY2Vob2xkZXIgd2UgYXBwbGllZCBhbmQgbm8gb25lIGhhcyBjaGFuZ2VkIGl0IHNpbmNlIFx1MjAxNFxuXHQgKiBzdWNjZXNzaXZlIHN1Z2dlc3Rpb25zIGtlZXAgdGhlIG5ld2VzdCBvbmUgdmlzaWJsZSB3aXRob3V0IGNsb2JiZXJpbmcgYVxuXHQgKiBtYW51YWwgcmVuYW1lLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FuU2VlZFByb3Zpc2lvbmFsVGl0bGUoa2V5OiBQcm90b2NvbFVSSSwgY3VycmVudFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWN1cnJlbnRUaXRsZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm92aXNpb25hbFRpdGxlcy5oYXMoa2V5KSAmJiBjdXJyZW50VGl0bGUgPT09IHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuZ2V0KGtleSk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtZ2VuZXJhdGVzIHRoZSB0aXRsZSBvbmNlIHRoZSBmaXJzdCB0dXJuIGhhcyBjb21wbGV0ZWQsIHRoaXMgdGltZVxuXHQgKiB1c2luZyB0aGUgZnVsbCBmaXJzdC10dXJuIGNvbnRleHQgKHRoZSB1c2VyIHJlcXVlc3QgcGx1cyB0aGUgYWdlbnQnc1xuXHQgKiB0ZXh0dWFsIHJlc3BvbnNlKSByYXRoZXIgdGhhbiBqdXN0IHRoZSBvcGVuaW5nIG1lc3NhZ2UuIFRoaXMgb25seSBydW5zXG5cdCAqIGZvciB0aGUgdmVyeSBmaXJzdCB0dXJuIGFuZCBvbmx5IHdoZW4gdGhlIGN1cnJlbnQgdGl0bGUgaXMgc3RpbGwgdGhlIG9uZVxuXHQgKiB0aGlzIGNvbnRyb2xsZXIgbGFzdCBhcHBsaWVkIFx1MjAxNCBhIG1hbnVhbCBgL3JlbmFtZWAsIGEgdXNlciBlZGl0LCBvciBhXG5cdCAqIGZvcmtlZCBzZXNzaW9uJ3MgaW5oZXJpdGVkIHRpdGxlIGFsbCBzdXBwcmVzcyBpdC5cblx0ICpcblx0ICogT25seSBub3JtYWwgdGV4dCByZXNwb25zZSBwYXJ0cyBhcmUgY29uc2lkZXJlZCAodG9vbCBjYWxscywgcmVhc29uaW5nLFxuXHQgKiBhbmQgb3RoZXIgcGFydHMgYXJlIGlnbm9yZWQpLiBJZiB0aGUgY29udGV4dCBzdGlsbCBleGNlZWRzIHRoZSBidWRnZXRcblx0ICogdGhlIG1pZGRsZSBpcyByZW1vdmVkIChtYXJrZWQgd2l0aCBgLi4uYCkuIFRoZSB1c2VyJ3MgZmlyc3QgcmVxdWVzdCBpc1xuXHQgKiBhbHdheXMgcHJlc2VydmVkLlxuXHQgKi9cblx0cmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuKGNoYW5uZWw6IFByb3RvY29sVVJJLCBjaGF0Q2hhbm5lbD86IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNBZGRpdGlvbmFsQ2hhdCA9ICEhY2hhdENoYW5uZWwgJiYgaXNBaHBDaGF0Q2hhbm5lbChjaGF0Q2hhbm5lbCkgJiYgIWlzRGVmYXVsdENoYXRVcmkoY2hhdENoYW5uZWwpO1xuXHRcdGlmIChpc0FkZGl0aW9uYWxDaGF0KSB7XG5cdFx0XHRjb25zdCBjaGF0U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRDaGFubmVsKTtcblx0XHRcdGlmICghY2hhdFN0YXRlIHx8IGNoYXRTdGF0ZS50dXJucy5sZW5ndGggIT09IDEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGFzdEFwcGxpZWQgPSB0aGlzLl9sYXN0QXBwbGllZFRpdGxlLmdldChjaGF0Q2hhbm5lbCk7XG5cdFx0XHRpZiAobGFzdEFwcGxpZWQgPT09IHVuZGVmaW5lZCB8fCBjaGF0U3RhdGUudGl0bGUgIT09IGxhc3RBcHBsaWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9idWlsZEZpcnN0VHVybkNvbnRleHQoY2hhdFN0YXRlLnR1cm5zWzBdKTtcblx0XHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhcHBseSA9ICh0aXRsZTogc3RyaW5nKSA9PiB0aGlzLl9hcHBseVRpdGxlKGNoYXRDaGFubmVsLCB0aXRsZSwgdCA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIudXBkYXRlQ2hhdFRpdGxlKGNoYW5uZWwsIGNoYXRDaGFubmVsLCB0KSk7XG5cdFx0XHR0aGlzLl9nZW5lcmF0ZVRpdGxlU29vbihcblx0XHRcdFx0Y2hhdENoYW5uZWwsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdGxhc3RBcHBsaWVkLFxuXHRcdFx0XHRhcHBseSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0Q2hhbm5lbCk/LnRpdGxlID09PSB0aGlzLl9sYXN0QXBwbGllZFRpdGxlLmdldChjaGF0Q2hhbm5lbCksXG5cdFx0XHRcdHRpdGxlID0+IHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhjaGFubmVsLCBgY3VzdG9tQ2hhdFRpdGxlOiR7Y2hhdENoYW5uZWx9YCwgdGl0bGUpLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhbm5lbCk7XG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS50dXJucy5sZW5ndGggIT09IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdEFwcGxpZWQgPSB0aGlzLl9sYXN0QXBwbGllZFRpdGxlLmdldChjaGFubmVsKTtcblx0XHRpZiAobGFzdEFwcGxpZWQgPT09IHVuZGVmaW5lZCB8fCBzdGF0ZS50aXRsZSAhPT0gbGFzdEFwcGxpZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2J1aWxkRmlyc3RUdXJuQ29udGV4dChzdGF0ZS50dXJuc1swXSk7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFwcGx5ID0gKHRpdGxlOiBzdHJpbmcpID0+IHRoaXMuX2FwcGx5VGl0bGUoY2hhbm5lbCwgdGl0bGUsIHQgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5uZWwsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiB0LFxuXHRcdH0pKTtcblx0XHR0aGlzLl9nZW5lcmF0ZVRpdGxlU29vbihcblx0XHRcdGNoYW5uZWwsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGxhc3RBcHBsaWVkLFxuXHRcdFx0YXBwbHksXG5cdFx0XHQoKSA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYW5uZWwpPy50aXRsZSA9PT0gdGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5nZXQoY2hhbm5lbCksXG5cdFx0XHR0aXRsZSA9PiB0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoY2hhbm5lbCwgJ2N1c3RvbVRpdGxlJywgdGl0bGUpLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogR2VuZXJhdGVzIGEgdGl0bGUgZm9yIGEgZnJlc2hseSBmb3JrZWQgc2Vzc2lvbiBvciBjaGF0IGZyb20gaXRzXG5cdCAqIGluaGVyaXRlZCBjb252ZXJzYXRpb24gY29udGV4dC4gRm9ya3MgY29weSB0aGUgc291cmNlIGhpc3RvcnkgdXAgdG8gdGhlXG5cdCAqIGZvcmsgcG9pbnQsIHNvIG5laXRoZXIge0BsaW5rIHNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2V9IG5vclxuXHQgKiB7QGxpbmsgcmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJufSAod2hpY2ggcmVxdWlyZSBhbiBlbXB0eSAvIHNpbmdsZS10dXJuXG5cdCAqIHN0YXRlKSBldmVyIGZpcmUgZm9yIHRoZW0uIFRoaXMgaXMgdGhlIGZvcmsgZXF1aXZhbGVudCwgcnVuIG9uY2UgYXQgZm9ya1xuXHQgKiB0aW1lIG92ZXIgdGhlIGtlcHQgdHVybnMsIHNvIHRoZSBuZXcgY2hhdCBnZXRzIGEgY29udGVudC1kZXJpdmVkIHRpdGxlXG5cdCAqIGluc3RlYWQgb2YgcGVybWFuZW50bHkgaW5oZXJpdGluZyB0aGUgc291cmNlJ3MgYEZvcmtlZDogXHUyMDI2YCB0aXRsZS5cblx0ICpcblx0ICogYGZhbGxiYWNrVGl0bGVgIGlzIHRoZSB0aXRsZSB0aGUgY2FsbGVyIGFscmVhZHkgYXBwbGllZCB0byB0aGUgbmV3XG5cdCAqIHNlc3Npb24vY2hhdCAoZS5nLiBgRm9ya2VkOiA8c291cmNlPmApOyBpdCBpcyByZWNvcmRlZCBhcyB0aGVcblx0ICogbGFzdC1hcHBsaWVkIHRpdGxlIHNvIGEgY29uY3VycmVudCBtYW51YWwgcmVuYW1lIHN1cHByZXNzZXMgdGhlXG5cdCAqIGdlbmVyYXRlZCB0aXRsZSwgYW5kIHN0YXlzIHZpc2libGUgdW50aWwgZ2VuZXJhdGlvbiBjb21wbGV0ZXMuIFRoZVxuXHQgKiBjb250ZXh0IGlzIGJvdW5kZWQgdG8ge0BsaW5rIE1BWF9USVRMRV9DT05URVhUX0NIQVJTfSAobWlkZGxlLXRydW5jYXRlZCksXG5cdCAqIHNvIGdlbmVyYXRpb24gY29zdHMgYXQgbW9zdCBhIHNpbmdsZSBzbWFsbC1tb2RlbCBjYWxsLlxuXHQgKi9cblx0Z2VuZXJhdGVGb3JrZWRUaXRsZShjaGFubmVsOiBQcm90b2NvbFVSSSwgY2hhdENoYW5uZWw6IFByb3RvY29sVVJJIHwgdW5kZWZpbmVkLCB0dXJuczogcmVhZG9ubHkgVHVybltdLCBmYWxsYmFja1RpdGxlOiBzdHJpbmcsIHNvdXJjZVRpdGxlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2J1aWxkQ29udmVyc2F0aW9uQ29udGV4dCh0dXJucywgc291cmNlVGl0bGUpO1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQWRkaXRpb25hbENoYXQgPSAhIWNoYXRDaGFubmVsICYmIGlzQWhwQ2hhdENoYW5uZWwoY2hhdENoYW5uZWwpICYmICFpc0RlZmF1bHRDaGF0VXJpKGNoYXRDaGFubmVsKTtcblx0XHRpZiAoaXNBZGRpdGlvbmFsQ2hhdCkge1xuXHRcdFx0Y29uc3Qga2V5ID0gY2hhdENoYW5uZWw7XG5cdFx0XHR0aGlzLl9sYXN0QXBwbGllZFRpdGxlLnNldChrZXksIGZhbGxiYWNrVGl0bGUpO1xuXHRcdFx0Y29uc3QgYXBwbHkgPSAodGl0bGU6IHN0cmluZykgPT4gdGhpcy5fYXBwbHlUaXRsZShrZXksIHRpdGxlLCB0ID0+IHRoaXMuX3N0YXRlTWFuYWdlci51cGRhdGVDaGF0VGl0bGUoY2hhbm5lbCwga2V5LCB0KSk7XG5cdFx0XHR0aGlzLl9nZW5lcmF0ZVRpdGxlU29vbihcblx0XHRcdFx0a2V5LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRmYWxsYmFja1RpdGxlLFxuXHRcdFx0XHRhcHBseSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShrZXkpPy50aXRsZSA9PT0gdGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5nZXQoa2V5KSxcblx0XHRcdFx0dGl0bGUgPT4gdGhpcy5fcGVyc2lzdFNlc3Npb25GbGFnKGNoYW5uZWwsIGBjdXN0b21DaGF0VGl0bGU6JHtrZXl9YCwgdGl0bGUpLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXN0QXBwbGllZFRpdGxlLnNldChjaGFubmVsLCBmYWxsYmFja1RpdGxlKTtcblx0XHRjb25zdCBhcHBseSA9ICh0aXRsZTogc3RyaW5nKSA9PiB0aGlzLl9hcHBseVRpdGxlKGNoYW5uZWwsIHRpdGxlLCB0ID0+IHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFubmVsLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHR0aXRsZTogdCxcblx0XHR9KSk7XG5cdFx0dGhpcy5fZ2VuZXJhdGVUaXRsZVNvb24oXG5cdFx0XHRjaGFubmVsLFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdHRydWUsXG5cdFx0XHRmYWxsYmFja1RpdGxlLFxuXHRcdFx0YXBwbHksXG5cdFx0XHQoKSA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYW5uZWwpPy50aXRsZSA9PT0gdGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5nZXQoY2hhbm5lbCksXG5cdFx0XHR0aXRsZSA9PiB0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoY2hhbm5lbCwgJ2N1c3RvbVRpdGxlJywgdGl0bGUpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVRpdGxlKGtleTogUHJvdG9jb2xVUkksIHRpdGxlOiBzdHJpbmcsIGRpc3BhdGNoOiAodGl0bGU6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RBcHBsaWVkVGl0bGUuc2V0KGtleSwgdGl0bGUpO1xuXHRcdGRpc3BhdGNoKHRpdGxlKTtcblx0fVxuXG5cdGNhbmNlbFRpdGxlR2VuZXJhdGlvbihzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFRpdGxlR2VuZXJhdGlvbihzZXNzaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2dlbmVyYXRlVGl0bGVTb29uKFxuXHRcdGtleTogUHJvdG9jb2xVUkksXG5cdFx0cHJvbXB0Q29udGVudDogc3RyaW5nLFxuXHRcdGlzQ29udmVyc2F0aW9uOiBib29sZWFuLFxuXHRcdGZhbGxiYWNrVGl0bGU6IHN0cmluZyxcblx0XHRhcHBseTogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0Y3VycmVudFRpdGxlTWF0Y2hlc0ZhbGxiYWNrOiAoKSA9PiBib29sZWFuLFxuXHRcdHBlcnNpc3Q6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkLFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxUaXRsZUdlbmVyYXRpb24oa2V5KTtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl90aXRsZUdlbmVyYXRpb25DYW5jZWxsYXRpb25Tb3VyY2VzLnNldChrZXksIHNvdXJjZSk7XG5cdFx0dm9pZCB0aGlzLl9nZW5lcmF0ZVRpdGxlKGtleSwgcHJvbXB0Q29udGVudCwgaXNDb252ZXJzYXRpb24sIGZhbGxiYWNrVGl0bGUsIGFwcGx5LCBjdXJyZW50VGl0bGVNYXRjaGVzRmFsbGJhY2ssIHBlcnNpc3QsIHNvdXJjZS50b2tlbikuY2F0Y2goZXJyID0+IHtcblx0XHRcdGlmICghc291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXJdIEZhaWxlZCB0byBhcHBseSBnZW5lcmF0ZWQgdGl0bGUgZm9yICR7a2V5fWAsIGVycik7XG5cdFx0XHR9XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdGl0bGVHZW5lcmF0aW9uQ2FuY2VsbGF0aW9uU291cmNlcy5nZXQoa2V5KSA9PT0gc291cmNlKSB7XG5cdFx0XHRcdHRoaXMuX3RpdGxlR2VuZXJhdGlvbkNhbmNlbGxhdGlvblNvdXJjZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdHNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZW5lcmF0ZVRpdGxlKFxuXHRcdGtleTogUHJvdG9jb2xVUkksXG5cdFx0cHJvbXB0Q29udGVudDogc3RyaW5nLFxuXHRcdGlzQ29udmVyc2F0aW9uOiBib29sZWFuLFxuXHRcdGZhbGxiYWNrVGl0bGU6IHN0cmluZyxcblx0XHRhcHBseTogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0Y3VycmVudFRpdGxlTWF0Y2hlc0ZhbGxiYWNrOiAoKSA9PiBib29sZWFuLFxuXHRcdHBlcnNpc3Q6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2VuZXJhdGVkVGl0bGUgPSBhd2FpdCB0aGlzLl9nZW5lcmF0ZVRpdGxlRnJvbVByb21wdChwcm9tcHRDb250ZW50LCBpc0NvbnZlcnNhdGlvbiwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCAhZ2VuZXJhdGVkVGl0bGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWN1cnJlbnRUaXRsZU1hdGNoZXNGYWxsYmFjaygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGdlbmVyYXRlZFRpdGxlICE9PSBmYWxsYmFja1RpdGxlKSB7XG5cdFx0XHRhcHBseShnZW5lcmF0ZWRUaXRsZSk7XG5cdFx0fVxuXHRcdHBlcnNpc3QoZ2VuZXJhdGVkVGl0bGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2VuZXJhdGVUaXRsZUZyb21Qcm9tcHQocHJvbXB0Q29udGVudDogc3RyaW5nLCBpc0NvbnZlcnNhdGlvbjogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2l0aHViVG9rZW4gPSB0aGlzLl9vcHRpb25zLmdldEdpdEh1YkNvcGlsb3RUb2tlbj8uKCk7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSB0aGlzLl9vcHRpb25zLmNvcGlsb3RBcGlTZXJ2aWNlO1xuXHRcdGlmICghZ2l0aHViVG9rZW4gfHwgIWNvcGlsb3RBcGlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25MaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGFib3J0Q29udHJvbGxlci5hYm9ydCgpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmF3VGl0bGUgPSBhd2FpdCBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2hhdENvbXBsZXRpb24oZ2l0aHViVG9rZW4sIHtcblx0XHRcdFx0bWVzc2FnZXM6IHRoaXMuX2J1aWxkVGl0bGVQcm9tcHQocHJvbXB0Q29udGVudCwgaXNDb252ZXJzYXRpb24pLFxuXHRcdFx0XHRtYXhUb2tlbnM6IE1BWF9USVRMRV9UT0tFTlMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNpZ25hbDogYWJvcnRDb250cm9sbGVyLnNpZ25hbCxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NsZWFuVGl0bGUocmF3VGl0bGUsIHByb21wdENvbnRlbnQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyXSBGYWlsZWQgdG8gZ2VuZXJhdGUgc2Vzc2lvbiB0aXRsZScsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxsYXRpb25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRUaXRsZVByb21wdChwcm9tcHRDb250ZW50OiBzdHJpbmcsIGlzQ29udmVyc2F0aW9uOiBib29sZWFuKTogSUNvcGlsb3RVdGlsaXR5Q2hhdE1lc3NhZ2VbXSB7XG5cdFx0Y29uc3QgdXNlckluc3RydWN0aW9uID0gaXNDb252ZXJzYXRpb25cblx0XHRcdD8gYFBsZWFzZSB3cml0ZSBhIGJyaWVmIHRpdGxlIGZvciB0aGUgZm9sbG93aW5nIGNvbnZlcnNhdGlvbjpcXG5cXG4ke3Byb21wdENvbnRlbnR9YFxuXHRcdFx0OiBgUGxlYXNlIHdyaXRlIGEgYnJpZWYgdGl0bGUgZm9yIHRoZSBmb2xsb3dpbmcgcmVxdWVzdDpcXG5cXG4ke3Byb21wdENvbnRlbnR9YDtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRyb2xlOiAnc3lzdGVtJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdCdZb3UgYXJlIGFuIGV4cGVydCBpbiBjcmFmdGluZyB1bHRyYS1jb21wYWN0IHRpdGxlcyBmb3IgY2hhdGJvdCBjb252ZXJzYXRpb25zLicsXG5cdFx0XHRcdFx0J1lvdSBhcmUgcHJlc2VudGVkIHdpdGggYSBjaGF0IHJlcXVlc3Qgb3IgY29udmVyc2F0aW9uLCBhbmQgeW91IHJlcGx5IHdpdGggb25seSBhIGJyaWVmIHRpdGxlIHRoYXQgY2FwdHVyZXMgdGhlIG1haW4gdG9waWMuJyxcblx0XHRcdFx0XHQnV3JpdGUgdGhlIHRpdGxlIGluIHNlbnRlbmNlIGNhc2UsIG5vdCB0aXRsZSBjYXNlLicsXG5cdFx0XHRcdFx0J1ByZXNlcnZlIHByb2R1Y3QgbmFtZXMsIGFiYnJldmlhdGlvbnMsIGNvZGUgc3ltYm9scywgYW5kIHByb3BlciBub3Vucy4nLFxuXHRcdFx0XHRcdCdBaW0gZm9yIDMtNiB3b3Jkcy4gUHJlZmVyIHRoZSBzaG9ydGVzdCBhY2N1cmF0ZSB0aXRsZS4nLFxuXHRcdFx0XHRcdCdEcm9wIGFydGljbGVzIGxpa2UgXCJhXCIsIFwiYW5cIiwgYW5kIFwidGhlXCIgdW5sZXNzIG5lZWRlZCBmb3IgY2xhcml0eS4nLFxuXHRcdFx0XHRcdCdEcm9wIGZpbGxlciBhbmQgZ2VuZXJpYyBmcmFtaW5nIGxpa2UgXCJoZWxwIHdpdGhcIiwgXCJxdWVzdGlvbiBhYm91dFwiLCBcInJlcXVlc3QgZm9yXCIsIG9yIFwiaXNzdWUgd2l0aFwiLicsXG5cdFx0XHRcdFx0J05ldmVyIGRlc2NyaWJlIHRoZSBjaGF0IGl0c2VsZiBhcyBmb3JrZWQsIGJyYW5jaGVkLCBvciBjb250aW51ZWQgXHUyMDE0IHRpdGxlIG9ubHkgdGhlIHVuZGVybHlpbmcgdG9waWMuJyxcblx0XHRcdFx0XHQnUHJlZmVyIHNob3J0LCBjb25jcmV0ZSBzeW5vbnltcyBhbmQgb21pdCB1bm5lY2Vzc2FyeSB3b3Jkcy4nLFxuXHRcdFx0XHRcdCdEbyBub3Qgd3JhcCB0aGUgdGl0bGUgaW4gcXVvdGVzIG9yIGFkZCB0cmFpbGluZyBwdW5jdHVhdGlvbi4nLFxuXHRcdFx0XHRdLmpvaW4oJyAnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICd1c2VyJyxcblx0XHRcdFx0Y29udGVudDogdXNlckluc3RydWN0aW9uLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW5UaXRsZShyYXdUaXRsZTogc3RyaW5nLCBwcm9tcHRDb250ZW50OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCB0aXRsZSA9IHJhd1RpdGxlLnRyaW0oKTtcblx0XHRjb25zdCBmaXJzdExpbmUgPSB0aXRsZS5zcGxpdCgvXFxyP1xcbi8pLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKS5maW5kKGxpbmUgPT4gbGluZS5sZW5ndGggPiAwKTtcblx0XHR0aXRsZSA9IGZpcnN0TGluZSA/PyAnJztcblx0XHRpZiAodGl0bGUuc3RhcnRzV2l0aCgnXCInKSAmJiB0aXRsZS5lbmRzV2l0aCgnXCInKSAmJiB0aXRsZS5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aXRsZSA9IHRpdGxlLnNsaWNlKDEsIC0xKS50cmltKCk7XG5cdFx0fVxuXHRcdHRpdGxlID0gdGl0bGUucmVwbGFjZSgvWy4hP10rJC8sICcnKS50cmltKCk7XG5cblx0XHRpZiAoIXRpdGxlIHx8IHRpdGxlLmluY2x1ZGVzKCdjYW5cXCd0IGFzc2lzdCB3aXRoIHRoYXQnKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGl0bGUgPSB0aXRsZS5zbGljZSgwLCBNQVhfVElUTEVfTEVOR1RIICsgTUFYX1RSQUlMSU5HX0hBTl9TVUZGSVhfQ09ERV9VTklUUyk7XG5cdFx0cmV0dXJuIHRoaXMuX3N0cmlwVW5leHBlY3RlZFRyYWlsaW5nSGFuU3VmZml4KHRpdGxlLCBwcm9tcHRDb250ZW50KS5zbGljZSgwLCBNQVhfVElUTEVfTEVOR1RIKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0cmlwVW5leHBlY3RlZFRyYWlsaW5nSGFuU3VmZml4KHRpdGxlOiBzdHJpbmcsIHByb21wdENvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKEhBTl9DSEFSQUNURVIudGVzdChwcm9tcHRDb250ZW50KSkge1xuXHRcdFx0cmV0dXJuIHRpdGxlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1ZmZpeCA9IFRSQUlMSU5HX0hBTl9TVUZGSVguZXhlYyh0aXRsZSk7XG5cdFx0aWYgKCFzdWZmaXgpIHtcblx0XHRcdHJldHVybiB0aXRsZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVmaXggPSB0aXRsZS5zbGljZSgwLCBzdWZmaXguaW5kZXgpLnRyaW1FbmQoKTtcblx0XHRjb25zdCBsZXR0ZXJDb3VudCA9IHByZWZpeC5tYXRjaCgvXFxwe0x9L2d1KT8ubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgbGF0aW5MZXR0ZXJDb3VudCA9IHByZWZpeC5tYXRjaCgvXFxwe3NjPUxhdGlufS9ndSk/Lmxlbmd0aCA/PyAwO1xuXHRcdGlmIChsYXRpbkxldHRlckNvdW50IDwgTUlOX0xBVElOX0xFVFRFUlNfQkVGT1JFX0hBTl9TVUZGSVggfHwgbGF0aW5MZXR0ZXJDb3VudCAvIGxldHRlckNvdW50IDwgTUlOX0xBVElOX0xFVFRFUl9SQVRJTykge1xuXHRcdFx0cmV0dXJuIHRpdGxlO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcmVmaXg7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBmaXJzdC10dXJuIGNvbnRleHQgc3RyaW5nIGZvciB0aXRsZSByZWZpbmVtZW50LiBUaGUgdXNlcidzXG5cdCAqIHJlcXVlc3QgaXMgYWx3YXlzIGtlcHQgKHRydW5jYXRlZCBpbiB0aGUgbWlkZGxlIG9ubHkgaWYgaXQgYWxvbmUgZXhjZWVkc1xuXHQgKiBoYWxmIHRoZSBidWRnZXQpLiBPbmx5IG5vcm1hbCB0ZXh0IChtYXJrZG93bikgcmVzcG9uc2UgcGFydHMgYXJlXG5cdCAqIGNvbnNpZGVyZWQgXHUyMDE0IHRvb2wgY2FsbHMsIHJlYXNvbmluZywgYW5kIG90aGVyIHBhcnRzIGFyZSBpZ25vcmVkLiBJZiB0aGVcblx0ICogY29tYmluZWQgdGV4dCBpcyBvdmVyIGJ1ZGdldCwgdGhlIG1pZGRsZSBvZiB0aGUgcmVzcG9uc2UgaXMgcmVtb3ZlZC5cblx0ICpcblx0ICogQHJldHVybnMgdGhlIGNvbnRleHQgc3RyaW5nLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSB0dXJuIGhhcyBubyB0ZXh0XG5cdCAqIHJlc3BvbnNlIHdvcnRoIHJlZmluaW5nIGZyb20gKHRoZSBvcGVuaW5nIG1lc3NhZ2UgYWxyZWFkeSBwcm9kdWNlZCBhXG5cdCAqIHRpdGxlIGluIHRoYXQgY2FzZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZEZpcnN0VHVybkNvbnRleHQodHVybjogVHVybik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZW5kZXJSZXNwb25zZU1hcmtkb3duKHR1cm4ucmVzcG9uc2VQYXJ0cyk7XG5cdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyQnVkZ2V0ID0gTWF0aC5mbG9vcihNQVhfVElUTEVfQ09OVEVYVF9DSEFSUyAvIDIpO1xuXHRcdGxldCB1c2VyUmVxdWVzdCA9IHR1cm4ubWVzc2FnZS50ZXh0LnRyaW0oKTtcblx0XHRpZiAodXNlclJlcXVlc3QubGVuZ3RoID4gdXNlckJ1ZGdldCkge1xuXHRcdFx0dXNlclJlcXVlc3QgPSB0cnVuY2F0ZU1pZGRsZSh1c2VyUmVxdWVzdCwgdXNlckJ1ZGdldCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVzZXJCbG9jayA9IGBVc2VyIHJlcXVlc3Q6XFxuJHt1c2VyUmVxdWVzdH1gO1xuXHRcdGNvbnN0IHJlc3BvbnNlTGFiZWwgPSAnXFxuXFxuQWdlbnQgcmVzcG9uc2U6XFxuJztcblxuXHRcdGNvbnN0IHJlc3BvbnNlQnVkZ2V0ID0gTWF0aC5tYXgoMCwgTUFYX1RJVExFX0NPTlRFWFRfQ0hBUlMgLSB1c2VyQmxvY2subGVuZ3RoIC0gcmVzcG9uc2VMYWJlbC5sZW5ndGgpO1xuXHRcdGNvbnN0IHRyaW1tZWRSZXNwb25zZSA9IHJlc3BvbnNlLmxlbmd0aCA+IHJlc3BvbnNlQnVkZ2V0ID8gdHJ1bmNhdGVNaWRkbGUocmVzcG9uc2UsIHJlc3BvbnNlQnVkZ2V0KSA6IHJlc3BvbnNlO1xuXG5cdFx0cmV0dXJuIHRyaW1tZWRSZXNwb25zZSA/IGAke3VzZXJCbG9ja30ke3Jlc3BvbnNlTGFiZWx9JHt0cmltbWVkUmVzcG9uc2V9YCA6IHVzZXJCbG9jaztcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgYSBjb252ZXJzYXRpb24gY29udGV4dCBzdHJpbmcgZm9yIGZvcmtlZC10aXRsZSBnZW5lcmF0aW9uIGJ5XG5cdCAqIGNvbmNhdGVuYXRpbmcgZWFjaCBrZXB0IHR1cm4ncyB1c2VyIHJlcXVlc3QgYW5kIHRleHR1YWwgcmVzcG9uc2UuIE9ubHlcblx0ICogbm9ybWFsIHRleHQgKG1hcmtkb3duKSByZXNwb25zZSBwYXJ0cyBhcmUgY29uc2lkZXJlZCBcdTIwMTQgdG9vbCBjYWxscyxcblx0ICogcmVhc29uaW5nLCBhbmQgb3RoZXIgcGFydHMgYXJlIGlnbm9yZWQsIG1pcnJvcmluZ1xuXHQgKiB7QGxpbmsgX2J1aWxkRmlyc3RUdXJuQ29udGV4dH0uIFdoZW4gdGhlIGZvcmsncyBgc291cmNlVGl0bGVgIGlzIGtub3duLCBhXG5cdCAqIHNob3J0IGZyYW1pbmcgbm90ZSBpcyBwcmVwZW5kZWQgc28gdGhlIG1vZGVsIHVuZGVyc3RhbmRzIHRoZSBjb252ZXJzYXRpb25cblx0ICogaXMgYSBicmFuY2ggY29udGludWVkIGZyb20gYW4gZWFybGllciBjaGF0LiBUaGUgY29udmVyc2F0aW9uIGlzXG5cdCAqIG1pZGRsZS10cnVuY2F0ZWQgdG8ge0BsaW5rIE1BWF9USVRMRV9DT05URVhUX0NIQVJTfSB0byBib3VuZCBtb2RlbCBjb3N0O1xuXHQgKiB0aGUgZnJhbWluZyBub3RlIGlzIGFsd2F5cyBwcmVzZXJ2ZWQgaW4gZnVsbC5cblx0ICpcblx0ICogQHJldHVybnMgdGhlIGNvbnRleHQgc3RyaW5nLCBvciBgdW5kZWZpbmVkYCB3aGVuIG5vIHR1cm4gY2FycmllcyBhbnlcblx0ICogdGV4dCB3b3J0aCB0aXRsaW5nIGZyb20uXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZENvbnZlcnNhdGlvbkNvbnRleHQodHVybnM6IHJlYWRvbmx5IFR1cm5bXSwgc291cmNlVGl0bGU/OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZyYW1lZFRpdGxlID0gc291cmNlVGl0bGU/LnRyaW0oKTtcblx0XHRjb25zdCBmcmFtaW5nID0gZnJhbWVkVGl0bGVcblx0XHRcdD8gYFRoaXMgY29udmVyc2F0aW9uIHdhcyBicmFuY2hlZCBmcm9tIGFuIGVhcmxpZXIgY2hhdCB0aXRsZWQgXCIke2ZyYW1lZFRpdGxlfVwiLiBUaGUgdHVybnMgYmVsb3csIG9sZGVzdCBmaXJzdCwgYXJlIHRoZSBpbmhlcml0ZWQgaGlzdG9yeSB1cCB0byB0aGUgYnJhbmNoIHBvaW50LlxcblxcbmBcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBidWlsZENvbnZlcnNhdGlvbkNvbnRleHQodHVybnMsIHsgbWF4Q2hhcnM6IE1BWF9USVRMRV9DT05URVhUX0NIQVJTLCBmcmFtaW5nIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdFNlc3Npb25GbGFnKHNlc3Npb246IFByb3RvY29sVVJJLCBrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX29wdGlvbnMuc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdHJlZi5vYmplY3Quc2V0TWV0YWRhdGEoa2V5LCB2YWx1ZSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXJdIEZhaWxlZCB0byBwZXJzaXN0ICR7a2V5fWAsIGVycik7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsVGl0bGVHZW5lcmF0aW9uKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5fdGl0bGVHZW5lcmF0aW9uQ2FuY2VsbGF0aW9uU291cmNlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhpcy5fdGl0bGVHZW5lcmF0aW9uQ2FuY2VsbGF0aW9uU291cmNlcy5kZWxldGUoc2Vzc2lvbik7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc291cmNlIG9mIHRoaXMuX3RpdGxlR2VuZXJhdGlvbkNhbmNlbGxhdGlvblNvdXJjZXMudmFsdWVzKCkpIHtcblx0XHRcdHNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblx0XHR0aGlzLl90aXRsZUdlbmVyYXRpb25DYW5jZWxsYXRpb25Tb3VyY2VzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbGFzdEFwcGxpZWRUaXRsZS5jbGVhcigpO1xuXHRcdHRoaXMuX3Byb3Zpc2lvbmFsVGl0bGVzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0Isd0JBQTREO0FBQ3ZGLFNBQVMsMEJBQTBCLHdCQUF3QixzQkFBc0I7QUFJakYsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxxQ0FBcUM7QUFDM0MsTUFBTSxzQ0FBc0M7QUFDNUMsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSxnQkFBZ0I7QUFDdEIsTUFBTSxzQkFBc0I7QUFPNUIsTUFBTSwwQkFBMEI7QUFRekIsSUFBTSxrQ0FBTixjQUE4QyxXQUFXO0FBQUEsRUFxQi9ELFlBQ2tCLGVBQ0EsVUFDYSxhQUM3QjtBQUNELFVBQU07QUFKVztBQUNBO0FBQ2E7QUF0Qi9CLFNBQWlCLHNDQUFzQyxvQkFBSSxJQUEwQztBQVFyRztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixvQkFBb0Isb0JBQUksSUFBeUI7QUFTbEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixxQkFBcUIsb0JBQUksSUFBaUI7QUFBQSxFQVEzRDtBQUFBLEVBRUEsMEJBQTBCLFNBQXNCLFlBQW9CLGFBQWlDO0FBQ3BHLFVBQU0sZ0JBQWdCLEtBQUssZ0JBQWdCLFVBQVU7QUFDckQsUUFBSSxDQUFDLGVBQWU7QUFDbkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxpQkFBaUIsS0FBSyx1QkFBdUIsV0FBVztBQUM5RCxVQUFNLE1BQU0sa0JBQWtCO0FBQzlCLFVBQU0sUUFBUSxpQkFBaUIsS0FBSyxjQUFjLGFBQWEsY0FBYyxJQUFJLEtBQUssY0FBYyxnQkFBZ0IsT0FBTztBQUMzSCxRQUFJLENBQUMsU0FBUyxDQUFD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O0FBQzFELFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGFBQWEsS0FBSyxNQUFNLDBCQUEwQixDQUFDO0FBQ3pELFFBQUksY0FBYyxLQUFLLFFBQVEsS0FBSyxLQUFLO0FBQ3pDLFFBQUksWUFBWSxTQUFTLFlBQVk7QUFDcEMsb0JBQWMsZUFBZSxhQUFhLFVBQVU7QUFBQSxJQUNyRDtBQUNBLFVBQU0sWUFBWTtBQUFBLEVBQWtCLFdBQVc7QUFDL0MsVUFBTSxnQkFBZ0I7QUFFdEIsVUFBTSxpQkFBaUIsS0FBSyxJQUFJLEdBQUcsMEJBQTBCLFVBQVUsU0FBUyxjQUFjLE1BQU07QUFDcEcsVUFBTSxrQkFBa0IsU0FBUyxTQUFTLGlCQUFpQixlQUFlLFVBQVUsY0FBYyxJQUFJO0FBRXRHLFdBQU8sa0JBQWtCLEdBQUcsU0FBUyxHQUFHLGFBQWEsR0FBRyxlQUFlLEtBQUs7QUFBQSxFQUM3RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWdCUSwwQkFBMEIsT0FBd0IsYUFBMEM7QUFDbkcsVUFBTSxjQUFjLGFBQWEsS0FBSztBQUN0QyxVQUFNLFVBQVUsY0FDYiwrREFBK0QsV0FBVztBQUFBO0FBQUEsSUFDMUU7QUFDSCxXQUFPLHlCQUF5QixPQUFPLEVBQUUsVUFBVSx5QkFBeUIsUUFBUSxDQUFDO0FBQUEsRUFDdEY7QUFBQSxFQUVRLG9CQUFvQixTQUFzQixLQUFhLE9BQXFCO0FBQ25GLFVBQU0sTUFBTSxLQUFLLFNBQVMsbUJBQW1CLGFBQWEsSUFBSSxNQUFNLE9BQU8sQ0FBQztBQUM1RSxRQUFJLE9BQU8sWUFBWSxLQUFLLEtBQUssRUFBRSxNQUFNLFNBQU87QUFDL0MsV0FBSyxZQUFZLEtBQUssdURBQXVELEdBQUcsSUFBSSxHQUFHO0FBQUEsSUFDeEYsQ0FBQyxFQUFFLFFBQVEsTUFBTTtBQUNoQixVQUFJLFFBQVE7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx1QkFBdUIsU0FBNEI7QUFDMUQsVUFBTSxTQUFTLEtBQUssb0NBQW9DLElBQUksT0FBTztBQUNuRSxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUNBLFdBQU8sUUFBUSxJQUFJO0FBQ25CLFNBQUssb0NBQW9DLE9BQU8sT0FBTztBQUFBLEVBQ3hEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixlQUFXLFVBQVUsS0FBSyxvQ0FBb0MsT0FBTyxHQUFHO0FBQ3ZFLGFBQU8sUUFBUSxJQUFJO0FBQUEsSUFDcEI7QUFDQSxTQUFLLG9DQUFvQyxNQUFNO0FBQy9DLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxtQkFBbUIsTUFBTTtBQUM5QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFqZmEsa0NBQU47QUFBQSxFQXdCSjtBQUFBLEdBeEJVOyIsCiAgIm5hbWVzIjogWyJsYXN0QXBwbGllZCIsICJjb250ZXh0IiwgImFwcGx5Il0KfQo=
