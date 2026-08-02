import { coalesce } from "../../../base/common/arrays.js";
import { DeferredPromise, raceCancellation, raceCancellationError, timeout } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { revive } from "../../../base/common/marshalling.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { assertType } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { packErrorForTelemetry } from "../../../platform/telemetry/common/errorTelemetry.js";
import { isChatViewTitleActionContext } from "../../contrib/chat/common/actions/chatActions.js";
import { ChatAgentVoteDirection } from "../../contrib/chat/common/chatService/chatService.js";
import { LocalChatSessionUri } from "../../contrib/chat/common/model/chatUri.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { MainContext } from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { PromptsType } from "../../contrib/chat/common/promptSyntax/promptTypes.js";
class ChatAgentResponseStream {
  constructor(_extension, _request, _proxy, _commandsConverter, _sessionDisposables, _pendingCarouselResolvers, _token) {
    this._extension = _extension;
    this._request = _request;
    this._proxy = _proxy;
    this._commandsConverter = _commandsConverter;
    this._sessionDisposables = _sessionDisposables;
    this._pendingCarouselResolvers = _pendingCarouselResolvers;
    this._token = _token;
    this._stopWatch = StopWatch.create(false);
    this._isClosed = false;
  }
  close() {
    this._isClosed = true;
  }
  get timings() {
    return {
      firstProgress: this._firstProgress,
      totalElapsed: this._stopWatch.elapsed()
    };
  }
  get apiObject() {
    if (!this._apiObject) {
      let throwIfDone2 = function(source) {
        if (that._isClosed) {
          const err = new Error("Response stream has been closed");
          Error.captureStackTrace(err, source);
          throw err;
        }
      }, send2 = function(chunk, handle) {
        const newLen = sendQueue.push(handle !== void 0 ? [chunk, handle] : chunk);
        if (newLen === 1) {
          queueMicrotask(() => {
            const toNotify = notify;
            notify = [];
            that._proxy.$handleProgressChunk(that._request.requestId, sendQueue).finally(() => {
              toNotify.forEach((f) => f());
            });
            sendQueue.length = 0;
          });
        }
        if (handle !== void 0) {
          return new Promise((resolve) => {
            notify.push(resolve);
          });
        }
        return;
      };
      var throwIfDone = throwIfDone2, send = send2;
      const that = this;
      this._stopWatch.reset();
      let taskHandlePool = 0;
      const sendQueue = [];
      let notify = [];
      const _report = (progress, task) => {
        if (typeof this._firstProgress === "undefined" && (progress.kind === "markdownContent" || progress.kind === "markdownVuln" || progress.kind === "beginToolInvocation")) {
          this._firstProgress = this._stopWatch.elapsed();
        }
        if (task) {
          const myHandle = taskHandlePool++;
          const progressReporterPromise = send2(progress, myHandle);
          const progressReporter = {
            report: (p) => {
              progressReporterPromise.then(() => {
                if (extHostTypes.MarkdownString.isMarkdownString(p.value)) {
                  send2(typeConvert.ChatResponseWarningPart.from(p), myHandle);
                } else {
                  send2(typeConvert.ChatResponseReferencePart.from(p), myHandle);
                }
              });
            }
          };
          Promise.all([progressReporterPromise, task(progressReporter)]).then(([_void, res]) => {
            send2(typeConvert.ChatTaskResult.from(res), myHandle);
          });
        } else {
          send2(progress);
        }
      };
      this._apiObject = Object.freeze({
        clearToPreviousToolInvocation(reason) {
          throwIfDone2(this.markdown);
          send2({ kind: "clearToPreviousToolInvocation", reason });
          return this;
        },
        markdown(value) {
          throwIfDone2(this.markdown);
          const part = new extHostTypes.ChatResponseMarkdownPart(value);
          const dto = typeConvert.ChatResponseMarkdownPart.from(part);
          _report(dto);
          return this;
        },
        markdownWithVulnerabilities(value, vulnerabilities) {
          throwIfDone2(this.markdown);
          if (vulnerabilities) {
            checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          }
          const part = new extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart(value, vulnerabilities);
          const dto = typeConvert.ChatResponseMarkdownWithVulnerabilitiesPart.from(part);
          _report(dto);
          return this;
        },
        codeblockUri(value, isEdit) {
          throwIfDone2(this.codeblockUri);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseCodeblockUriPart(value, isEdit);
          const dto = typeConvert.ChatResponseCodeblockUriPart.from(part);
          _report(dto);
          return this;
        },
        filetree(value, baseUri) {
          throwIfDone2(this.filetree);
          const part = new extHostTypes.ChatResponseFileTreePart(value, baseUri);
          const dto = typeConvert.ChatResponseFilesPart.from(part);
          _report(dto);
          return this;
        },
        anchor(value, title) {
          const part = new extHostTypes.ChatResponseAnchorPart(value, title);
          return this.push(part);
        },
        button(value) {
          throwIfDone2(this.anchor);
          const part = new extHostTypes.ChatResponseCommandButtonPart(value);
          const dto = typeConvert.ChatResponseCommandButtonPart.from(part, that._commandsConverter, that._sessionDisposables);
          _report(dto);
          return this;
        },
        progress(value, task) {
          throwIfDone2(this.progress);
          const part = new extHostTypes.ChatResponseProgressPart2(value, task);
          const dto = task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
          _report(dto, task);
          return this;
        },
        thinkingProgress(thinkingDelta) {
          throwIfDone2(this.thinkingProgress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseThinkingProgressPart(thinkingDelta.text ?? "", thinkingDelta.id, thinkingDelta.metadata);
          const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
          _report(dto);
          return this;
        },
        hookProgress(hookType, stopReason, systemMessage) {
          throwIfDone2(this.hookProgress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseHookPart(hookType, stopReason, systemMessage);
          const dto = typeConvert.ChatResponseHookPart.from(part);
          _report(dto);
          return this;
        },
        voiceProgress(id, value) {
          throwIfDone2(this.voiceProgress);
          checkProposedApiEnabled(that._extension, "chatParticipantPrivate");
          const part = new extHostTypes.ChatResponseVoiceProgressPart(id, value);
          _report(typeConvert.ChatResponseVoiceProgressPart.from(part));
          return this;
        },
        warning(value) {
          throwIfDone2(this.progress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseWarningPart(value);
          const dto = typeConvert.ChatResponseWarningPart.from(part);
          _report(dto);
          return this;
        },
        info(value) {
          throwIfDone2(this.progress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseInfoPart(value);
          const dto = typeConvert.ChatResponseInfoPart.from(part);
          _report(dto);
          return this;
        },
        reference(value, iconPath) {
          return this.reference2(value, iconPath);
        },
        reference2(value, iconPath, options) {
          throwIfDone2(this.reference);
          if (typeof value === "object" && "variableName" in value) {
            checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          }
          if (typeof value === "object" && "variableName" in value && !value.value) {
            const matchingVarData = that._request.variables.variables.find((v) => v.name === value.variableName);
            if (matchingVarData) {
              let references;
              if (matchingVarData.references?.length) {
                references = matchingVarData.references.map((r) => ({
                  kind: "reference",
                  reference: { variableName: value.variableName, value: r.reference }
                }));
              } else {
                const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
                const dto = typeConvert.ChatResponseReferencePart.from(part);
                references = [dto];
              }
              references.forEach((r) => _report(r));
              return this;
            } else {
            }
          } else {
            const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
            const dto = typeConvert.ChatResponseReferencePart.from(part);
            _report(dto);
          }
          return this;
        },
        codeCitation(value, license, snippet) {
          throwIfDone2(this.codeCitation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseCodeCitationPart(value, license, snippet);
          const dto = typeConvert.ChatResponseCodeCitationPart.from(part);
          _report(dto);
        },
        textEdit(target, edits) {
          throwIfDone2(this.textEdit);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseTextEditPart(target, edits);
          part.isDone = edits === true ? true : void 0;
          const dto = typeConvert.ChatResponseTextEditPart.from(part);
          _report(dto);
          return this;
        },
        notebookEdit(target, edits) {
          throwIfDone2(this.notebookEdit);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseNotebookEditPart(target, edits);
          const dto = typeConvert.ChatResponseNotebookEditPart.from(part);
          _report(dto);
          return this;
        },
        workspaceEdit(edits) {
          throwIfDone2(this.workspaceEdit);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseWorkspaceEditPart(edits);
          const dto = typeConvert.ChatResponseWorkspaceEditPart.from(part);
          _report(dto);
          return this;
        },
        async externalEdit(target, callback) {
          throwIfDone2(this.externalEdit);
          const resources = Array.isArray(target) ? target : [target];
          const operationId = taskHandlePool++;
          const undoStopId = generateUuid();
          await send2({ kind: "externalEdits", start: true, resources, undoStopId }, operationId);
          try {
            await callback();
            return undoStopId;
          } finally {
            await send2({ kind: "externalEdits", start: false, resources, undoStopId }, operationId);
          }
        },
        confirmation(title, message, data, buttons) {
          throwIfDone2(this.confirmation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseConfirmationPart(title, message, data, buttons);
          const dto = typeConvert.ChatResponseConfirmationPart.from(part);
          _report(dto);
          return this;
        },
        async questionCarousel(questions, allowSkip = true) {
          throwIfDone2(this.questionCarousel);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const resolveId = generateUuid();
          const part = new extHostTypes.ChatResponseQuestionCarouselPart(questions, allowSkip);
          const dto = typeConvert.ChatResponseQuestionCarouselPart.from(part);
          dto.resolveId = resolveId;
          const deferred = new DeferredPromise();
          if (!that._pendingCarouselResolvers.has(that._request.requestId)) {
            that._pendingCarouselResolvers.set(that._request.requestId, /* @__PURE__ */ new Map());
          }
          that._pendingCarouselResolvers.get(that._request.requestId).set(resolveId, deferred);
          _report(dto);
          return raceCancellation(deferred.p, that._token);
        },
        beginToolInvocation(toolCallId, toolName, streamData) {
          throwIfDone2(this.beginToolInvocation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const dto = {
            kind: "beginToolInvocation",
            toolCallId,
            toolName,
            streamData: streamData ? {
              partialInput: streamData.partialInput
            } : void 0,
            subagentInvocationId: streamData?.subagentInvocationId
          };
          _report(dto);
          return this;
        },
        updateToolInvocation(toolCallId, streamData) {
          throwIfDone2(this.updateToolInvocation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const dto = {
            kind: "updateToolInvocation",
            toolCallId,
            streamData: {
              partialInput: streamData.partialInput
            }
          };
          _report(dto);
          return this;
        },
        push(part) {
          throwIfDone2(this.push);
          if (part instanceof extHostTypes.ChatResponseTextEditPart || part instanceof extHostTypes.ChatResponseNotebookEditPart || part instanceof extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart || part instanceof extHostTypes.ChatResponseWarningPart || part instanceof extHostTypes.ChatResponseConfirmationPart || part instanceof extHostTypes.ChatResponseQuestionCarouselPart || part instanceof extHostTypes.ChatResponseCodeCitationPart || part instanceof extHostTypes.ChatResponseMovePart || part instanceof extHostTypes.ChatResponseExtensionsPart || part instanceof extHostTypes.ChatResponseExternalEditPart || part instanceof extHostTypes.ChatResponseThinkingProgressPart || part instanceof extHostTypes.ChatResponsePullRequestPart || part instanceof extHostTypes.ChatResponseAutoModeResolutionPart || part instanceof extHostTypes.ChatResponseProgressPart2) {
            checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          }
          if (part instanceof extHostTypes.ChatResponseReferencePart) {
            this.reference2(part.value, part.iconPath, part.options);
          } else if (part instanceof extHostTypes.ChatResponseProgressPart2) {
            const dto = part.task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
            _report(dto, part.task);
          } else if (part instanceof extHostTypes.ChatResponseThinkingProgressPart) {
            const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
            _report(dto);
          } else if (part instanceof extHostTypes.ChatResponseAutoModeResolutionPart) {
            const dto = typeConvert.ChatResponseAutoModeResolutionPart.from(part);
            _report(dto);
          } else if (part instanceof extHostTypes.ChatResponseAnchorPart) {
            const dto = typeConvert.ChatResponseAnchorPart.from(part);
            if (part.resolve) {
              checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
              dto.resolveId = generateUuid();
            }
            _report(dto);
            if (part.resolve) {
              const cts = new CancellationTokenSource();
              part.resolve(cts.token).then(() => {
                const resolvedDto = typeConvert.ChatResponseAnchorPart.from(part);
                that._proxy.$handleAnchorResolve(that._request.requestId, dto.resolveId, resolvedDto);
              }).then(() => cts.dispose(), () => cts.dispose());
              that._sessionDisposables.add(toDisposable(() => cts.dispose(true)));
            }
          } else if (part instanceof extHostTypes.ChatResponseExternalEditPart) {
            const p = this.externalEdit(part.uris, part.callback);
            p.then((value) => part.didGetApplied(value));
            return this;
          } else {
            const dto = typeConvert.ChatResponsePart.from(part, that._commandsConverter, that._sessionDisposables);
            _report(dto);
          }
          return this;
        },
        usage(usage) {
          throwIfDone2(this.usage);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const dto = {
            kind: "usage",
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            outputBuffer: usage.outputBuffer,
            copilotCredits: usage.copilotCredits,
            promptTokenDetails: usage.promptTokenDetails
          };
          _report(dto);
          return this;
        }
      });
    }
    return this._apiObject;
  }
}
const _ExtHostChatAgents2 = class _ExtHostChatAgents2 extends Disposable {
  constructor(mainContext, _logService, _commands, _documents, _editorsAndDocuments, _languageModels, _diagnostics, _tools, _chatSessions) {
    super();
    this._logService = _logService;
    this._commands = _commands;
    this._documents = _documents;
    this._editorsAndDocuments = _editorsAndDocuments;
    this._languageModels = _languageModels;
    this._diagnostics = _diagnostics;
    this._tools = _tools;
    this._chatSessions = _chatSessions;
    this._agents = /* @__PURE__ */ new Map();
    this._participantDetectionProviders = /* @__PURE__ */ new Map();
    this._promptFileProviders = /* @__PURE__ */ new Map();
    this._customizationProviders = /* @__PURE__ */ new Map();
    this._sessionDisposables = this._register(new DisposableResourceMap());
    this._completionDisposables = this._register(new DisposableMap());
    this._inFlightRequests = /* @__PURE__ */ new Set();
    // Map of requestId -> resolveId -> deferred promise for question carousel answers
    this._pendingCarouselResolvers = /* @__PURE__ */ new Map();
    this._onDidChangeChatRequestTools = this._register(new Emitter());
    this.onDidChangeChatRequestTools = this._onDidChangeChatRequestTools.event;
    this._onDidDisposeChatSession = this._register(new Emitter());
    this.onDidDisposeChatSession = this._onDidDisposeChatSession.event;
    this._onDidChangeCustomAgents = this._register(new Emitter());
    this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
    this._onDidChangeInstructions = this._register(new Emitter());
    this.onDidChangeInstructions = this._onDidChangeInstructions.event;
    this._onDidChangeSkills = this._register(new Emitter());
    this.onDidChangeSkills = this._onDidChangeSkills.event;
    this._onDidChangeSlashCommands = this._register(new Emitter());
    this.onDidChangeSlashCommands = this._onDidChangeSlashCommands.event;
    this._onDidChangeHooks = this._register(new Emitter());
    this.onDidChangeHooks = this._onDidChangeHooks.event;
    this._onDidChangePlugins = this._register(new Emitter());
    this.onDidChangePlugins = this._onDidChangePlugins.event;
    this._customAgents = new CachedPromise(() => this._proxy.$provideCustomAgents(CancellationToken.None).then((agents) => agents.map((agent) => this.toCustomAgent(agent))));
    this._instructions = new CachedPromise(() => this._proxy.$provideInstructions(CancellationToken.None).then((instructions) => instructions.map((instruction) => this.toInstruction(instruction))));
    this._skills = new CachedPromise(() => this._proxy.$provideSkills(CancellationToken.None).then((skills) => skills.map((skill) => this.toSkill(skill))));
    this._slashCommands = new CachedPromise(() => this._proxy.$provideSlashCommands(CancellationToken.None).then((slashCommands) => slashCommands.map((slashCommand) => this.toSlashCommand(slashCommand))));
    this._hooks = new CachedPromise(() => this._proxy.$provideHooks(CancellationToken.None).then((hooks) => hooks.map((hook) => this.toHook(hook))));
    this._plugins = new CachedPromise(() => this._proxy.$providePlugins(CancellationToken.None).then((plugins) => plugins.map((plugin) => this.toPlugin(plugin))));
    this._onDidChangeActiveChatPanelSessionResource = this._register(new Emitter());
    this.onDidChangeActiveChatPanelSessionResource = this._onDidChangeActiveChatPanelSessionResource.event;
    this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents2);
    _commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (isChatViewTitleActionContext(arg)) {
          return null;
        }
        return arg;
      }
    });
  }
  get activeChatPanelSessionResource() {
    return this._activeChatPanelSessionResource;
  }
  toCustomAgent(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      argumentHint: dto.argumentHint,
      tools: dto.tools,
      model: dto.model,
      userInvocable: dto.userInvocable,
      disableModelInvocation: dto.disableModelInvocation,
      enabled: dto.enabled
    });
  }
  toInstruction(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      pattern: dto.pattern
    });
  }
  toSkill(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      userInvocable: dto.userInvocable,
      disableModelInvocation: dto.disableModelInvocation
    });
  }
  toSlashCommand(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      argumentHint: dto.argumentHint,
      userInvocable: dto.userInvocable
    });
  }
  toHook(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      sessionTypes: dto.sessionTypes,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0
    });
  }
  toPlugin(dto) {
    return Object.freeze({ uri: URI.revive(dto.uri) });
  }
  provideCustomAgents(token) {
    return this._customAgents.get(token);
  }
  provideInstructions(token) {
    return this._instructions.get(token);
  }
  provideSkills(token) {
    return this._skills.get(token);
  }
  provideSlashCommands(token) {
    return this._slashCommands.get(token);
  }
  provideHooks(token) {
    return this._hooks.get(token);
  }
  providePlugins(token) {
    return this._plugins.get(token);
  }
  $onDidChangeCustomAgents() {
    this._customAgents.clear();
    this._onDidChangeCustomAgents.fire();
  }
  $onDidChangeInstructions() {
    this._instructions.clear();
    this._onDidChangeInstructions.fire();
  }
  $onDidChangeSkills() {
    this._skills.clear();
    this._onDidChangeSkills.fire();
  }
  $onDidChangeSlashCommands() {
    this._slashCommands.clear();
    this._onDidChangeSlashCommands.fire();
  }
  $onDidChangeHooks() {
    this._hooks.clear();
    this._onDidChangeHooks.fire();
  }
  $onDidChangePlugins() {
    this._plugins.clear();
    this._onDidChangePlugins.fire();
  }
  async transferActiveChat(newWorkspace) {
    await this._proxy.$transferActiveChatSession(newWorkspace);
  }
  createChatAgent(extension, id, handler) {
    const handle = _ExtHostChatAgents2._idPool++;
    const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
    this._agents.set(handle, agent);
    this._proxy.$registerAgent(handle, extension.identifier, id, {}, void 0);
    return agent.apiAgent;
  }
  createDynamicChatAgent(extension, id, dynamicProps, handler) {
    const handle = _ExtHostChatAgents2._idPool++;
    const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
    this._agents.set(handle, agent);
    this._proxy.$registerAgent(handle, extension.identifier, id, { isSticky: true }, dynamicProps);
    return agent.apiAgent;
  }
  registerChatParticipantDetectionProvider(extension, provider) {
    const handle = _ExtHostChatAgents2._participantDetectionProviderIdPool++;
    this._participantDetectionProviders.set(handle, new ExtHostParticipantDetector(extension, provider));
    this._proxy.$registerChatParticipantDetectionProvider(handle);
    return toDisposable(() => {
      this._participantDetectionProviders.delete(handle);
      this._proxy.$unregisterChatParticipantDetectionProvider(handle);
    });
  }
  /**
   * Internal method that handles all prompt file provider types.
   * Routes custom agents, instructions, prompt files, and skills to the unified internal implementation.
   */
  registerPromptFileProvider(extension, type, provider) {
    const handle = _ExtHostChatAgents2._contributionsProviderIdPool++;
    this._promptFileProviders.set(handle, { extension, provider });
    this._proxy.$registerPromptFileProvider(handle, type, extension.identifier);
    const disposables = new DisposableStore();
    let changeEvent;
    switch (type) {
      case PromptsType.agent:
        changeEvent = provider.onDidChangeCustomAgents;
        break;
      case PromptsType.instructions:
        changeEvent = provider.onDidChangeInstructions;
        break;
      case PromptsType.prompt:
        changeEvent = provider.onDidChangePromptFiles;
        break;
      case PromptsType.skill:
        changeEvent = provider.onDidChangeSkills;
        break;
      case PromptsType.hook:
        changeEvent = provider.onDidChangeHooks;
        break;
    }
    if (changeEvent) {
      disposables.add(changeEvent(() => {
        this._proxy.$onDidChangePromptFiles(handle);
      }));
    }
    disposables.add(toDisposable(() => {
      this._promptFileProviders.delete(handle);
      this._proxy.$unregisterPromptFileProvider(handle);
    }));
    return disposables;
  }
  async $providePromptFiles(handle, type, context, token) {
    const providerData = this._promptFileProviders.get(handle);
    if (!providerData) {
      return void 0;
    }
    const provider = providerData.provider;
    let resources;
    switch (type) {
      case PromptsType.agent:
        resources = await provider.provideCustomAgents(context, token) ?? void 0;
        break;
      case PromptsType.instructions:
        resources = await provider.provideInstructions(context, token) ?? void 0;
        break;
      case PromptsType.prompt:
        resources = await provider.providePromptFiles(context, token) ?? void 0;
        break;
      case PromptsType.skill:
        resources = await provider.provideSkills(context, token) ?? void 0;
        break;
      case PromptsType.hook:
        resources = await provider.provideHooks(context, token) ?? void 0;
        break;
    }
    return resources;
  }
  registerChatSessionCustomizationProvider(extension, chatSessionType, metadata, provider) {
    const handle = _ExtHostChatAgents2._customizationProviderIdPool++;
    this._customizationProviders.set(handle, { extension, provider });
    const metadataDto = {
      label: metadata.label,
      iconId: metadata.iconId,
      supportedTypes: metadata.supportedTypes?.map((t) => typeConvert.ChatSessionCustomizationType.from(t))
    };
    this._proxy.$registerChatSessionCustomizationProvider(handle, chatSessionType, metadataDto, extension.identifier);
    const disposables = new DisposableStore();
    if (provider.onDidChange) {
      disposables.add(provider.onDidChange(() => {
        this._proxy.$onDidChangeCustomizations(handle);
      }));
    }
    disposables.add(toDisposable(() => {
      this._customizationProviders.delete(handle);
      this._proxy.$unregisterChatSessionCustomizationProvider(handle);
    }));
    return disposables;
  }
  async $provideChatSessionCustomizations(handle, sessionResource, token) {
    const providerData = this._customizationProviders.get(handle);
    if (!providerData) {
      return void 0;
    }
    if (!sessionResource) {
      return void 0;
    }
    try {
      const items = await providerData.provider.provideChatSessionCustomizations(URI.revive(sessionResource), token);
      if (!items) {
        return void 0;
      }
      return items.map((item) => ({
        uri: item.uri,
        type: typeConvert.ChatSessionCustomizationType.from(item.type),
        name: item.name,
        description: item.description,
        source: item.source,
        groupKey: item.groupKey,
        badge: item.badge,
        badgeTooltip: item.badgeTooltip,
        extensionId: item.extensionId,
        pluginUri: item.pluginUri,
        pluginLabel: item.pluginLabel,
        userInvocable: item.userInvocable
      }));
    } catch (err) {
      return void 0;
    }
  }
  async $provideSourceFolders(handle, sessionResource, type, token) {
    const providerData = this._customizationProviders.get(handle);
    if (!providerData?.provider.provideSourceFolders) {
      return void 0;
    }
    try {
      const folders = await providerData.provider.provideSourceFolders(URI.revive(sessionResource), typeConvert.ChatSessionCustomizationType.to(type), token);
      if (!folders) {
        return void 0;
      }
      return folders.map((folder) => ({
        uri: folder.uri,
        label: folder.label,
        source: folder.source
      }));
    } catch (err) {
      return void 0;
    }
  }
  async $detectChatParticipant(handle, requestDto, context, options, token) {
    const detector = this._participantDetectionProviders.get(handle);
    if (!detector) {
      return void 0;
    }
    const { request, location, history } = await this._createRequest(requestDto, context, detector.extension);
    const model = await this.getModelForRequest(request, detector.extension);
    const tools = await this.getToolsForRequest(detector.extension, request.userSelectedTools, model.id, token);
    const extRequest = typeConvert.ChatAgentRequest.to(
      request,
      location,
      model,
      request.modelConfiguration,
      this.getDiagnosticsWhenEnabled(detector.extension),
      tools,
      detector.extension,
      this._logService
    );
    return detector.provider.provideParticipantDetection(
      extRequest,
      { history, yieldRequested: false },
      { participants: options.participants, location: typeConvert.ChatLocation.to(options.location) },
      token
    );
  }
  async _createRequest(requestDto, context, extension) {
    const request = revive(requestDto);
    const convertedHistory = await this.prepareHistoryTurns(extension, request.agentId, context);
    let location;
    if (request.locationData?.type === ChatAgentLocation.EditorInline) {
      const document = this._documents.getDocument(request.locationData.document);
      const editor = this._editorsAndDocuments.getEditor(request.locationData.id);
      location = new extHostTypes.ChatRequestEditorData(editor.value, document, typeConvert.Selection.to(request.locationData.selection), typeConvert.Range.to(request.locationData.wholeRange));
    } else if (request.locationData?.type === ChatAgentLocation.Notebook) {
      const cell = this._documents.getDocument(request.locationData.sessionInputUri);
      location = new extHostTypes.ChatRequestNotebookData(cell);
    } else if (request.locationData?.type === ChatAgentLocation.Terminal) {
    }
    return { request, location, history: convertedHistory };
  }
  async getModelForRequest(request, extension) {
    let model;
    if (request.userSelectedModelId) {
      model = await this._languageModels.getLanguageModelByIdentifier(extension, request.userSelectedModelId);
    }
    if (!model) {
      model = await this._languageModels.getDefaultLanguageModel(extension);
      if (!model) {
        throw new Error("Language model unavailable");
      }
    }
    return model;
  }
  async $setRequestTools(requestId, tools) {
    const request = [...this._inFlightRequests].find((r) => r.requestId === requestId);
    if (!request) {
      return;
    }
    request.extRequest.tools.clear();
    const toolsMap = await this.getToolsForRequest(request.extension, tools, request.extRequest.model.id, CancellationToken.None);
    for (const [k, v] of toolsMap) {
      request.extRequest.tools.set(k, v);
    }
    this._onDidChangeChatRequestTools.fire(request.extRequest);
  }
  $setYieldRequested(requestId, value) {
    const request = [...this._inFlightRequests].find((r) => r.requestId === requestId);
    if (request) {
      request.yieldRequested = value;
    }
  }
  async $invokeAgent(handle, requestDto, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      throw new Error(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
    }
    let stream;
    let inFlightRequest;
    try {
      const { request, location, history } = await this._createRequest(requestDto, context, agent.extension);
      let sessionDisposables = this._sessionDisposables.get(request.sessionResource);
      if (!sessionDisposables) {
        sessionDisposables = new DisposableStore();
        this._sessionDisposables.set(request.sessionResource, sessionDisposables);
      }
      stream = new ChatAgentResponseStream(agent.extension, request, this._proxy, this._commands.converter, sessionDisposables, this._pendingCarouselResolvers, token);
      const model = await this.getModelForRequest(request, agent.extension);
      const tools = await this.getToolsForRequest(agent.extension, request.userSelectedTools, model.id, token);
      const extRequest = typeConvert.ChatAgentRequest.to(
        request,
        location,
        model,
        request.modelConfiguration,
        this.getDiagnosticsWhenEnabled(agent.extension),
        tools,
        agent.extension,
        this._logService
      );
      inFlightRequest = { requestId: requestDto.requestId, extRequest, extension: agent.extension, hooks: request.hooks, yieldRequested: false };
      this._inFlightRequests.add(inFlightRequest);
      let chatSessionContext;
      if (context.chatSessionContext) {
        const sessionResource = URI.revive(context.chatSessionContext.chatSessionResource);
        const inputState = await this._chatSessions.getInputStateForSession(
          sessionResource,
          context.chatSessionContext.initialSessionOptions,
          token
        );
        chatSessionContext = {
          chatSessionItem: {
            resource: sessionResource,
            label: context.chatSessionContext.isUntitled ? "Untitled Session" : "Session"
          },
          isUntitled: context.chatSessionContext.isUntitled,
          initialSessionOptions: context.chatSessionContext.initialSessionOptions,
          inputState
        };
      }
      const chatContext = {
        history,
        chatSessionContext,
        get yieldRequested() {
          return inFlightRequest?.yieldRequested ?? false;
        }
      };
      const task = agent.invoke(
        extRequest,
        chatContext,
        stream.apiObject,
        token
      );
      return await raceCancellationWithTimeout(1e3, Promise.resolve(task).then((result) => {
        if (result?.metadata) {
          try {
            JSON.stringify(result.metadata);
          } catch (err) {
            const msg = `result.metadata MUST be JSON.stringify-able. Got error: ${err.message}`;
            this._logService.error(`[${agent.extension.identifier.value}] [@${agent.id}] ${msg}`, agent.extension);
            return { errorDetails: { message: msg }, timings: stream?.timings, nextQuestion: result.nextQuestion };
          }
        }
        let errorDetails;
        if (result?.errorDetails) {
          errorDetails = {
            ...result.errorDetails,
            responseIsIncomplete: true
          };
        }
        if (errorDetails?.responseIsRedacted || errorDetails?.isQuotaExceeded || errorDetails?.isRateLimited || errorDetails?.isExpectedError || errorDetails?.confirmationButtons || errorDetails?.code) {
          checkProposedApiEnabled(agent.extension, "chatParticipantPrivate");
        }
        return { errorDetails, timings: stream?.timings, metadata: result?.metadata, nextQuestion: result?.nextQuestion, details: result?.details };
      }), token);
    } catch (e) {
      this._logService.error(e, agent.extension);
      if (e instanceof extHostTypes.LanguageModelError && e.cause) {
        e = e.cause;
      }
      const isQuotaExceeded = e instanceof Error && e.name === "ChatQuotaExceeded";
      const isRateLimited = e instanceof Error && e.name === "ChatRateLimited";
      const isExpectedError = e instanceof Error && e.name === "ChatExpectedError";
      const { callstack: errorCallstack } = packErrorForTelemetry(e);
      const errorName = e instanceof Error ? e.name : void 0;
      return { errorDetails: { message: toErrorMessage(e), responseIsIncomplete: true, isQuotaExceeded, isRateLimited, isExpectedError }, errorCallstack, errorName };
    } finally {
      if (inFlightRequest) {
        this._inFlightRequests.delete(inFlightRequest);
      }
      const pendingResolvers = this._pendingCarouselResolvers.get(requestDto.requestId);
      if (pendingResolvers) {
        for (const deferred of pendingResolvers.values()) {
          deferred.complete(void 0);
        }
        this._pendingCarouselResolvers.delete(requestDto.requestId);
      }
      stream?.close();
    }
  }
  getDiagnosticsWhenEnabled(extension) {
    if (!isProposedApiEnabled(extension, "chatReferenceDiagnostic")) {
      return [];
    }
    return this._diagnostics.getDiagnostics();
  }
  async getToolsForRequest(extension, tools, modelId, token) {
    if (!tools) {
      return /* @__PURE__ */ new Map();
    }
    const result = /* @__PURE__ */ new Map();
    for (const tool of this._tools.getTools(extension)) {
      if (typeof tools[tool.name] === "boolean") {
        result.set(tool, tools[tool.name]);
      }
    }
    return result;
  }
  async prepareHistoryTurns(extension, agentId, context) {
    const res = [];
    for (const h of context.history) {
      const ehResult = typeConvert.ChatAgentResult.to(h.result);
      const result = agentId === h.request.agentId || isBuiltinParticipant(h.request.agentId) && isBuiltinParticipant(agentId) ? ehResult : { ...ehResult, metadata: void 0 };
      const varsWithoutTools = [];
      const toolReferences = [];
      for (const v of h.request.variables.variables) {
        if (v.kind === "tool") {
          toolReferences.push(typeConvert.ChatLanguageModelToolReference.to(v));
        } else if (v.kind === "toolset") {
          toolReferences.push(...v.value.map(typeConvert.ChatLanguageModelToolReference.to));
        } else {
          varsWithoutTools.push(...typeConvert.ChatPromptReference.toReferences(v, this.getDiagnosticsWhenEnabled(extension), this._logService));
        }
      }
      const editedFileEvents = isProposedApiEnabled(extension, "chatParticipantPrivate") ? h.request.editedFileEvents : void 0;
      const modeInstructions2 = isProposedApiEnabled(extension, "chatParticipantPrivate") && h.request.modeInstructions ? typeConvert.ChatRequestModeInstructions.to(h.request.modeInstructions) : void 0;
      const turn = new extHostTypes.ChatRequestTurn(h.request.message, h.request.command, varsWithoutTools, h.request.agentId, toolReferences, editedFileEvents, h.request.requestId, void 0, modeInstructions2);
      res.push(turn);
      const parts = coalesce(h.response.map((r) => typeConvert.ChatResponsePart.toContent(r, this._commands.converter)));
      res.push(new extHostTypes.ChatResponseTurn(parts, result, h.request.agentId, h.request.command));
    }
    return res;
  }
  $releaseSession(sessionResourceDto) {
    const sessionResource = URI.revive(sessionResourceDto);
    this._sessionDisposables.deleteAndDispose(sessionResource);
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (sessionId) {
      this._onDidDisposeChatSession.fire(sessionId);
    }
  }
  $acceptActiveChatSession(sessionResourceDto) {
    const sessionResource = sessionResourceDto ? URI.revive(sessionResourceDto) : void 0;
    if (this._activeChatPanelSessionResource?.toString() === sessionResource?.toString()) {
      return;
    }
    this._activeChatPanelSessionResource = sessionResource;
    this._onDidChangeActiveChatPanelSessionResource.fire(sessionResource);
  }
  async $provideFollowups(requestDto, handle, result, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return Promise.resolve([]);
    }
    const request = revive(requestDto);
    const convertedHistory = await this.prepareHistoryTurns(agent.extension, agent.id, context);
    const ehResult = typeConvert.ChatAgentResult.to(result);
    return (await agent.provideFollowups(ehResult, { history: convertedHistory, yieldRequested: false }, token)).filter((f) => {
      const isValid = !f.participant || Iterable.some(
        this._agents.values(),
        (a) => a.id === f.participant && ExtensionIdentifier.equals(a.extension.identifier, agent.extension.identifier)
      );
      if (!isValid) {
        this._logService.warn(`[@${agent.id}] ChatFollowup refers to an unknown participant: ${f.participant}`);
      }
      return isValid;
    }).map((f) => typeConvert.ChatFollowup.from(f, request));
  }
  $acceptFeedback(handle, result, voteAction) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    const ehResult = typeConvert.ChatAgentResult.to(result);
    let kind;
    switch (voteAction.direction) {
      case ChatAgentVoteDirection.Down:
        kind = extHostTypes.ChatResultFeedbackKind.Unhelpful;
        break;
      case ChatAgentVoteDirection.Up:
        kind = extHostTypes.ChatResultFeedbackKind.Helpful;
        break;
    }
    const feedback = {
      result: ehResult,
      kind
    };
    agent.acceptFeedback(Object.freeze(feedback));
  }
  $handleQuestionCarouselAnswer(requestId, resolveId, answers) {
    const requestResolvers = this._pendingCarouselResolvers.get(requestId);
    if (!requestResolvers) {
      return;
    }
    const deferred = requestResolvers.get(resolveId);
    if (deferred) {
      deferred.complete(answers);
      requestResolvers.delete(resolveId);
    }
    if (requestResolvers.size === 0) {
      this._pendingCarouselResolvers.delete(requestId);
    }
  }
  $acceptAction(handle, result, event) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    if (event.action.kind === "vote") {
      return;
    }
    const ehAction = typeConvert.ChatAgentUserActionEvent.to(result, event, this._commands.converter);
    if (ehAction) {
      agent.acceptAction(Object.freeze(ehAction));
    }
  }
  async $invokeCompletionProvider(handle, query, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return [];
    }
    let disposables = this._completionDisposables.get(handle);
    if (disposables) {
      disposables.clear();
    } else {
      disposables = new DisposableStore();
      this._completionDisposables.set(handle, disposables);
    }
    const items = await agent.invokeCompletionProvider(query, token);
    return items.map((i) => typeConvert.ChatAgentCompletionItem.from(i, this._commands.converter, disposables));
  }
  async $provideChatTitle(handle, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
    const sessionResource = context[0]?.request.sessionResource ? URI.revive(context[0].request.sessionResource) : void 0;
    return await agent.provideTitle({ history, sessionResource, yieldRequested: false }, token);
  }
  async $provideChatSummary(handle, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
    const sessionResource = context[0]?.request.sessionResource ? URI.revive(context[0].request.sessionResource) : void 0;
    return await agent.provideSummary({ history, sessionResource, yieldRequested: false }, token);
  }
};
_ExtHostChatAgents2._idPool = 0;
_ExtHostChatAgents2._participantDetectionProviderIdPool = 0;
_ExtHostChatAgents2._contributionsProviderIdPool = 0;
_ExtHostChatAgents2._customizationProviderIdPool = 0;
let ExtHostChatAgents2 = _ExtHostChatAgents2;
class ExtHostParticipantDetector {
  constructor(extension, provider) {
    this.extension = extension;
    this.provider = provider;
  }
}
class ExtHostChatAgent {
  constructor(extension, id, _proxy, _handle, _requestHandler) {
    this.extension = extension;
    this.id = id;
    this._proxy = _proxy;
    this._handle = _handle;
    this._requestHandler = _requestHandler;
    this._onDidReceiveFeedback = new Emitter();
    this._onDidPerformAction = new Emitter();
    this._pauseStateEmitter = new Emitter();
  }
  acceptFeedback(feedback) {
    this._onDidReceiveFeedback.fire(feedback);
  }
  acceptAction(event) {
    this._onDidPerformAction.fire(event);
  }
  setChatRequestPauseState(pauseState) {
    this._pauseStateEmitter.fire(pauseState);
  }
  async invokeCompletionProvider(query, token) {
    if (!this._agentVariableProvider) {
      return [];
    }
    return await this._agentVariableProvider.provider.provideCompletionItems(query, token) ?? [];
  }
  async provideFollowups(result, context, token) {
    if (!this._followupProvider) {
      return [];
    }
    const followups = await this._followupProvider.provideFollowups(result, context, token);
    if (!followups) {
      return [];
    }
    return followups.filter((f) => !(f && "commandId" in f)).filter((f) => !(f && "message" in f));
  }
  async provideTitle(context, token) {
    if (!this._titleProvider) {
      return;
    }
    return await this._titleProvider.provideChatTitle(context, token) ?? void 0;
  }
  async provideSummary(context, token) {
    if (!this._summarizer) {
      return;
    }
    return await this._summarizer.provideChatSummary(context, token) ?? void 0;
  }
  get apiAgent() {
    let disposed = false;
    let updateScheduled = false;
    const updateMetadataSoon = () => {
      if (disposed) {
        return;
      }
      if (updateScheduled) {
        return;
      }
      updateScheduled = true;
      queueMicrotask(() => {
        this._proxy.$updateAgent(this._handle, {
          icon: !this._iconPath ? void 0 : this._iconPath instanceof URI ? this._iconPath : "light" in this._iconPath ? this._iconPath.light : void 0,
          iconDark: !this._iconPath ? void 0 : "dark" in this._iconPath ? this._iconPath.dark : void 0,
          themeIcon: this._iconPath instanceof extHostTypes.ThemeIcon ? this._iconPath : void 0,
          hasFollowups: this._followupProvider !== void 0,
          helpTextPrefix: !this._helpTextPrefix || typeof this._helpTextPrefix === "string" ? this._helpTextPrefix : typeConvert.MarkdownString.from(this._helpTextPrefix),
          helpTextPostfix: !this._helpTextPostfix || typeof this._helpTextPostfix === "string" ? this._helpTextPostfix : typeConvert.MarkdownString.from(this._helpTextPostfix),
          supportIssueReporting: this._supportIssueReporting,
          additionalWelcomeMessage: !this._additionalWelcomeMessage || typeof this._additionalWelcomeMessage === "string" ? this._additionalWelcomeMessage : typeConvert.MarkdownString.from(this._additionalWelcomeMessage)
        });
        updateScheduled = false;
      });
    };
    const that = this;
    return {
      get id() {
        return that.id;
      },
      get iconPath() {
        return that._iconPath;
      },
      set iconPath(v) {
        that._iconPath = v;
        updateMetadataSoon();
      },
      get requestHandler() {
        return that._requestHandler;
      },
      set requestHandler(v) {
        assertType(typeof v === "function", "Invalid request handler");
        that._requestHandler = v;
      },
      get followupProvider() {
        return that._followupProvider;
      },
      set followupProvider(v) {
        that._followupProvider = v;
        updateMetadataSoon();
      },
      get helpTextPrefix() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._helpTextPrefix;
      },
      set helpTextPrefix(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._helpTextPrefix = v;
        updateMetadataSoon();
      },
      get helpTextPostfix() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._helpTextPostfix;
      },
      set helpTextPostfix(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._helpTextPostfix = v;
        updateMetadataSoon();
      },
      get supportIssueReporting() {
        checkProposedApiEnabled(that.extension, "chatParticipantPrivate");
        return that._supportIssueReporting;
      },
      set supportIssueReporting(v) {
        checkProposedApiEnabled(that.extension, "chatParticipantPrivate");
        that._supportIssueReporting = v;
        updateMetadataSoon();
      },
      get onDidReceiveFeedback() {
        return that._onDidReceiveFeedback.event;
      },
      set participantVariableProvider(v) {
        checkProposedApiEnabled(that.extension, "chatParticipantAdditions");
        that._agentVariableProvider = v;
        if (v) {
          if (!v.triggerCharacters.length) {
            throw new Error("triggerCharacters are required");
          }
          that._proxy.$registerAgentCompletionsProvider(that._handle, that.id, v.triggerCharacters);
        } else {
          that._proxy.$unregisterAgentCompletionsProvider(that._handle, that.id);
        }
      },
      get participantVariableProvider() {
        checkProposedApiEnabled(that.extension, "chatParticipantAdditions");
        return that._agentVariableProvider;
      },
      set additionalWelcomeMessage(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._additionalWelcomeMessage = v;
        updateMetadataSoon();
      },
      get additionalWelcomeMessage() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._additionalWelcomeMessage;
      },
      set titleProvider(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._titleProvider = v;
        updateMetadataSoon();
      },
      get titleProvider() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._titleProvider;
      },
      set summarizer(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._summarizer = v;
      },
      get summarizer() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._summarizer;
      },
      get onDidChangePauseState() {
        checkProposedApiEnabled(that.extension, "chatParticipantAdditions");
        return that._pauseStateEmitter.event;
      },
      onDidPerformAction: !isProposedApiEnabled(this.extension, "chatParticipantAdditions") ? void 0 : this._onDidPerformAction.event,
      dispose() {
        disposed = true;
        that._followupProvider = void 0;
        that._onDidReceiveFeedback.dispose();
        that._onDidPerformAction.dispose();
        that._pauseStateEmitter.dispose();
        that._proxy.$unregisterAgent(that._handle);
      }
    };
  }
  invoke(request, context, response, token) {
    return this._requestHandler(request, context, response, token);
  }
}
function raceCancellationWithTimeout(cancelWait, promise, token) {
  return new Promise((resolve, reject) => {
    const ref = token.onCancellationRequested(async () => {
      ref.dispose();
      await timeout(cancelWait);
      resolve(void 0);
    });
    promise.then(resolve, reject).finally(() => ref.dispose());
  });
}
class CachedPromise {
  constructor(computeFn) {
    this.computeFn = computeFn;
  }
  get(token) {
    if (!this.cachedPromise) {
      const promise = this.computeFn().catch((err) => {
        if (this.cachedPromise === promise) {
          this.cachedPromise = void 0;
        }
        throw err;
      });
      this.cachedPromise = promise;
    }
    return raceCancellationError(this.cachedPromise, token);
  }
  clear() {
    this.cachedPromise = void 0;
  }
}
function isBuiltinParticipant(agentId) {
  return agentId.startsWith("github.copilot");
}
export {
  ChatAgentResponseStream,
  ExtHostChatAgents2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDaGF0QWdlbnRzMi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VDYW5jZWxsYXRpb24sIHJhY2VDYW5jZWxsYXRpb25FcnJvciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlUmVzb3VyY2VNYXAsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgcGFja0Vycm9yRm9yVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi9lcnJvclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc0NoYXRWaWV3VGl0bGVBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRSZXF1ZXN0LCBJQ2hhdEFnZW50UmVzdWx0LCBJQ2hhdEFnZW50UmVzdWx0VGltaW5ncywgVXNlclNlbGVjdGVkVG9vbHMgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24sIElDaGF0Q29udGVudFJlZmVyZW5jZSwgSUNoYXRGb2xsb3d1cCwgSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscywgSUNoYXRVc2VyQWN0aW9uRXZlbnQsIElDaGF0Vm90ZUFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0QWdlbnRzU2hhcGUyLCBJQ2hhdEFnZW50Q29tcGxldGlvbkl0ZW0sIElDaGF0QWdlbnRIaXN0b3J5RW50cnlEdG8sIElDaGF0QWdlbnRJbnZva2VSZXN1bHQsIElDaGF0QWdlbnRQcm9ncmVzc1NoYXBlLCBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uSXRlbUR0bywgSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyTWV0YWRhdGFEdG8sIElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXJEdG8sIElDaGF0UHJvZ3Jlc3NEdG8sIElDaGF0U2Vzc2lvbkNvbnRleHREdG8sIElDdXN0b21BZ2VudER0bywgSUV4dGVuc2lvbkNoYXRBZ2VudE1ldGFkYXRhLCBJSG9va0R0bywgSUluc3RydWN0aW9uRHRvLCBJTWFpbkNvbnRleHQsIElQbHVnaW5EdG8sIElTa2lsbER0bywgSVNsYXNoQ29tbWFuZER0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDaGF0QWdlbnRzU2hhcGUyIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENvbW1hbmRzQ29udmVydGVyLCBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RGlhZ25vc3RpY3MgfSBmcm9tICcuL2V4dEhvc3REaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVscyB9IGZyb20gJy4vZXh0SG9zdExhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMgfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnQgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9tcHRGaWxlQ29udGV4dCwgSVByb21wdEZpbGVSZXNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdFNlc3Npb25zIH0gZnJvbSAnLi9leHRIb3N0Q2hhdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0QWdlbnRSZXNwb25zZVN0cmVhbSB7XG5cblx0cHJpdmF0ZSBfc3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdHByaXZhdGUgX2lzQ2xvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2ZpcnN0UHJvZ3Jlc3M6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXBpT2JqZWN0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlU3RyZWFtIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBJQ2hhdEFnZW50UHJvZ3Jlc3NTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzOiBNYXA8LyogcmVxdWVzdElkICovc3RyaW5nLCBNYXA8LyogcmVzb2x2ZUlkICovIHN0cmluZywgRGVmZXJyZWRQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkPj4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuXHQpIHsgfVxuXG5cdGNsb3NlKCkge1xuXHRcdHRoaXMuX2lzQ2xvc2VkID0gdHJ1ZTtcblx0fVxuXG5cdGdldCB0aW1pbmdzKCk6IElDaGF0QWdlbnRSZXN1bHRUaW1pbmdzIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Zmlyc3RQcm9ncmVzczogdGhpcy5fZmlyc3RQcm9ncmVzcyxcblx0XHRcdHRvdGFsRWxhcHNlZDogdGhpcy5fc3RvcFdhdGNoLmVsYXBzZWQoKVxuXHRcdH07XG5cdH1cblxuXHRnZXQgYXBpT2JqZWN0KCkge1xuXG5cdFx0aWYgKCF0aGlzLl9hcGlPYmplY3QpIHtcblxuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHR0aGlzLl9zdG9wV2F0Y2gucmVzZXQoKTtcblxuXG5cdFx0XHRsZXQgdGFza0hhbmRsZVBvb2wgPSAwO1xuXG5cblx0XHRcdGZ1bmN0aW9uIHRocm93SWZEb25lKHNvdXJjZTogRnVuY3Rpb24gfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKHRoYXQuX2lzQ2xvc2VkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdSZXNwb25zZSBzdHJlYW0gaGFzIGJlZW4gY2xvc2VkJyk7XG5cdFx0XHRcdFx0RXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UoZXJyLCBzb3VyY2UpO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cblx0XHRcdGNvbnN0IHNlbmRRdWV1ZTogKElDaGF0UHJvZ3Jlc3NEdG8gfCBbSUNoYXRQcm9ncmVzc0R0bywgbnVtYmVyXSlbXSA9IFtdO1xuXHRcdFx0bGV0IG5vdGlmeTogRnVuY3Rpb25bXSA9IFtdO1xuXG5cdFx0XHRmdW5jdGlvbiBzZW5kKGNodW5rOiBJQ2hhdFByb2dyZXNzRHRvKTogdm9pZDtcblx0XHRcdGZ1bmN0aW9uIHNlbmQoY2h1bms6IElDaGF0UHJvZ3Jlc3NEdG8sIGhhbmRsZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0XHRcdGZ1bmN0aW9uIHNlbmQoY2h1bms6IElDaGF0UHJvZ3Jlc3NEdG8sIGhhbmRsZT86IG51bWJlcikge1xuXHRcdFx0XHQvLyBwdXNoIGRhdGEgaW50byBzZW5kIHF1ZXVlLiB0aGUgZmlyc3QgZW50cnkgc2NoZWR1bGVzIHRoZSBtaWNybyB0YXNrIHdoaWNoXG5cdFx0XHRcdC8vIGRvZXMgdGhlIGFjdHVhbCBzZW5kIHRvIHRoZSBtYWluIHRocmVhZFxuXHRcdFx0XHRjb25zdCBuZXdMZW4gPSBzZW5kUXVldWUucHVzaChoYW5kbGUgIT09IHVuZGVmaW5lZCA/IFtjaHVuaywgaGFuZGxlXSA6IGNodW5rKTtcblx0XHRcdFx0aWYgKG5ld0xlbiA9PT0gMSkge1xuXHRcdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRvTm90aWZ5ID0gbm90aWZ5O1xuXHRcdFx0XHRcdFx0bm90aWZ5ID0gW107XG5cdFx0XHRcdFx0XHR0aGF0Ll9wcm94eS4kaGFuZGxlUHJvZ3Jlc3NDaHVuayh0aGF0Ll9yZXF1ZXN0LnJlcXVlc3RJZCwgc2VuZFF1ZXVlKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHRcdFx0dG9Ob3RpZnkuZm9yRWFjaChmID0+IGYoKSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHNlbmRRdWV1ZS5sZW5ndGggPSAwO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgbm90aWZ5LnB1c2gocmVzb2x2ZSk7IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgX3JlcG9ydCA9IChwcm9ncmVzczogSUNoYXRQcm9ncmVzc0R0bywgdGFzaz86IChwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydCB8IHZzY29kZS5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0PikgPT4gVGhlbmFibGU8c3RyaW5nIHwgdm9pZD4pID0+IHtcblx0XHRcdFx0Ly8gTWVhc3VyZSB0aGUgdGltZSB0byB0aGUgZmlyc3QgcHJvZ3Jlc3MgdXBkYXRlIHdpdGggcmVhbCBtYXJrZG93biBjb250ZW50XG5cdFx0XHRcdGlmICh0eXBlb2YgdGhpcy5fZmlyc3RQcm9ncmVzcyA9PT0gJ3VuZGVmaW5lZCcgJiYgKHByb2dyZXNzLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnIHx8IHByb2dyZXNzLmtpbmQgPT09ICdtYXJrZG93blZ1bG4nIHx8IHByb2dyZXNzLmtpbmQgPT09ICdiZWdpblRvb2xJbnZvY2F0aW9uJykpIHtcblx0XHRcdFx0XHR0aGlzLl9maXJzdFByb2dyZXNzID0gdGhpcy5fc3RvcFdhdGNoLmVsYXBzZWQoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbXlIYW5kbGUgPSB0YXNrSGFuZGxlUG9vbCsrO1xuXHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzUmVwb3J0ZXJQcm9taXNlID0gc2VuZChwcm9ncmVzcywgbXlIYW5kbGUpO1xuXHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzUmVwb3J0ZXIgPSB7XG5cdFx0XHRcdFx0XHRyZXBvcnQ6IChwOiB2c2NvZGUuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQgfCB2c2NvZGUuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRwcm9ncmVzc1JlcG9ydGVyUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoZXh0SG9zdFR5cGVzLk1hcmtkb3duU3RyaW5nLmlzTWFya2Rvd25TdHJpbmcocC52YWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHNlbmQodHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQuZnJvbSg8dnNjb2RlLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0PnApLCBteUhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHNlbmQodHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydC5mcm9tKDx2c2NvZGUuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydD5wKSwgbXlIYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFByb21pc2UuYWxsKFtwcm9ncmVzc1JlcG9ydGVyUHJvbWlzZSwgdGFzayhwcm9ncmVzc1JlcG9ydGVyKV0pLnRoZW4oKFtfdm9pZCwgcmVzXSkgPT4ge1xuXHRcdFx0XHRcdFx0c2VuZCh0eXBlQ29udmVydC5DaGF0VGFza1Jlc3VsdC5mcm9tKHJlcyksIG15SGFuZGxlKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZW5kKHByb2dyZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fYXBpT2JqZWN0ID0gT2JqZWN0LmZyZWV6ZTx2c2NvZGUuQ2hhdFJlc3BvbnNlU3RyZWFtPih7XG5cdFx0XHRcdGNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uKHJlYXNvbikge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMubWFya2Rvd24pO1xuXHRcdFx0XHRcdHNlbmQoeyBraW5kOiAnY2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb24nLCByZWFzb246IHJlYXNvbiB9KTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya2Rvd24odmFsdWUpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLm1hcmtkb3duKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNYXJrZG93blBhcnQodmFsdWUpO1xuXHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZU1hcmtkb3duUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzKHZhbHVlLCB2dWxuZXJhYmlsaXRpZXMpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLm1hcmtkb3duKTtcblx0XHRcdFx0XHRpZiAodnVsbmVyYWJpbGl0aWVzKSB7XG5cdFx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0KHZhbHVlLCB2dWxuZXJhYmlsaXRpZXMpO1xuXHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvZGVibG9ja1VyaSh2YWx1ZSwgaXNFZGl0KSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5jb2RlYmxvY2tVcmkpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQodmFsdWUsIGlzRWRpdCk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZXRyZWUodmFsdWUsIGJhc2VVcmkpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLmZpbGV0cmVlKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQodmFsdWUsIGJhc2VVcmkpO1xuXHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZUZpbGVzUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0YW5jaG9yKHZhbHVlLCB0aXRsZT86IHN0cmluZykge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUFuY2hvclBhcnQodmFsdWUsIHRpdGxlKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wdXNoKHBhcnQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRidXR0b24odmFsdWUpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLmFuY2hvcik7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQodmFsdWUpO1xuXHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0LmZyb20ocGFydCwgdGhhdC5fY29tbWFuZHNDb252ZXJ0ZXIsIHRoYXQuX3Nlc3Npb25EaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcm9ncmVzcyh2YWx1ZSwgdGFzaz86ICgocHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQ+KSA9PiBUaGVuYWJsZTxzdHJpbmcgfCB2b2lkPikpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnByb2dyZXNzKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQyKHZhbHVlLCB0YXNrKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0YXNrID8gdHlwZUNvbnZlcnQuQ2hhdFRhc2suZnJvbShwYXJ0KSA6IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVByb2dyZXNzUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvLCB0YXNrKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0dGhpbmtpbmdQcm9ncmVzcyh0aGlua2luZ0RlbHRhOiB2c2NvZGUuVGhpbmtpbmdEZWx0YSkge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMudGhpbmtpbmdQcm9ncmVzcyk7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQodGhpbmtpbmdEZWx0YS50ZXh0ID8/ICcnLCB0aGlua2luZ0RlbHRhLmlkLCB0aGlua2luZ0RlbHRhLm1ldGFkYXRhKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VUaGlua2luZ1Byb2dyZXNzUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0aG9va1Byb2dyZXNzKGhvb2tUeXBlOiB2c2NvZGUuQ2hhdEhvb2tUeXBlLCBzdG9wUmVhc29uPzogc3RyaW5nLCBzeXN0ZW1NZXNzYWdlPzogc3RyaW5nKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5ob29rUHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUhvb2tQYXJ0KGhvb2tUeXBlLCBzdG9wUmVhc29uLCBzeXN0ZW1NZXNzYWdlKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VIb29rUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0dm9pY2VQcm9ncmVzcyhpZDogdnNjb2RlLkNoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NTdGFnZSwgdmFsdWU6IHN0cmluZykge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMudm9pY2VQcm9ncmVzcyk7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0KGlkLCB2YWx1ZSk7XG5cdFx0XHRcdFx0X3JlcG9ydCh0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydC5mcm9tKHBhcnQpKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0d2FybmluZyh2YWx1ZSkge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMucHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0KHZhbHVlKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5mbyh2YWx1ZSkge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMucHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUluZm9QYXJ0KHZhbHVlKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VJbmZvUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVmZXJlbmNlKHZhbHVlLCBpY29uUGF0aCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJlZmVyZW5jZTIodmFsdWUsIGljb25QYXRoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVmZXJlbmNlMih2YWx1ZSwgaWNvblBhdGgsIG9wdGlvbnMpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnJlZmVyZW5jZSk7XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAndmFyaWFibGVOYW1lJyBpbiB2YWx1ZSkge1xuXHRcdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3ZhcmlhYmxlTmFtZScgaW4gdmFsdWUgJiYgIXZhbHVlLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgcGFydGljaXBhbnQgdXNlZCB0aGlzIHZhcmlhYmxlLiBEb2VzIHRoYXQgdmFyaWFibGUgaGF2ZSBhbnkgcmVmZXJlbmNlcyB0byBwdWxsIGluP1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdWYXJEYXRhID0gdGhhdC5fcmVxdWVzdC52YXJpYWJsZXMudmFyaWFibGVzLmZpbmQodiA9PiB2Lm5hbWUgPT09IHZhbHVlLnZhcmlhYmxlTmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAobWF0Y2hpbmdWYXJEYXRhKSB7XG5cdFx0XHRcdFx0XHRcdGxldCByZWZlcmVuY2VzOiBEdG88SUNoYXRDb250ZW50UmVmZXJlbmNlPltdIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRpZiAobWF0Y2hpbmdWYXJEYXRhLnJlZmVyZW5jZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRcdHJlZmVyZW5jZXMgPSBtYXRjaGluZ1ZhckRhdGEucmVmZXJlbmNlcy5tYXAociA9PiAoe1xuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogJ3JlZmVyZW5jZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRyZWZlcmVuY2U6IHsgdmFyaWFibGVOYW1lOiB2YWx1ZS52YXJpYWJsZU5hbWUsIHZhbHVlOiByLnJlZmVyZW5jZSBhcyBVUkkgfCBMb2NhdGlvbiB9XG5cdFx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRDb250ZW50UmVmZXJlbmNlKSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gUGFydGljaXBhbnQgc2VudCBhIHZhcmlhYmxlTmFtZSByZWZlcmVuY2UgYnV0IHRoZSB2YXJpYWJsZSBwcm9kdWNlZCBubyByZWZlcmVuY2VzLiBTaG93IHZhcmlhYmxlIHJlZmVyZW5jZSB3aXRoIG5vIHZhbHVlXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCh2YWx1ZSwgaWNvblBhdGgsIG9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRcdFx0XHRyZWZlcmVuY2VzID0gW2R0b107XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZWZlcmVuY2VzLmZvckVhY2gociA9PiBfcmVwb3J0KHIpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBTb21ldGhpbmcgd2VudCB3cm9uZy0gdGhhdCB2YXJpYWJsZSBkb2Vzbid0IGFjdHVhbGx5IGV4aXN0XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQodmFsdWUsIGljb25QYXRoLCBvcHRpb25zKTtcblx0XHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29kZUNpdGF0aW9uKHZhbHVlOiB2c2NvZGUuVXJpLCBsaWNlbnNlOiBzdHJpbmcsIHNuaXBwZXQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMuY29kZUNpdGF0aW9uKTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblxuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUNvZGVDaXRhdGlvblBhcnQodmFsdWUsIGxpY2Vuc2UsIHNuaXBwZXQpO1xuXHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZUNvZGVDaXRhdGlvblBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRleHRFZGl0KHRhcmdldCwgZWRpdHMpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnRleHRFZGl0KTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblxuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVRleHRFZGl0UGFydCh0YXJnZXQsIGVkaXRzKTtcblx0XHRcdFx0XHRwYXJ0LmlzRG9uZSA9IGVkaXRzID09PSB0cnVlID8gdHJ1ZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG5vdGVib29rRWRpdCh0YXJnZXQsIGVkaXRzKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5ub3RlYm9va0VkaXQpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydCh0YXJnZXQsIGVkaXRzKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3b3Jrc3BhY2VFZGl0KGVkaXRzKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy53b3Jrc3BhY2VFZGl0KTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblxuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0KGVkaXRzKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VXb3Jrc3BhY2VFZGl0UGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgZXh0ZXJuYWxFZGl0KHRhcmdldCwgY2FsbGJhY2spIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLmV4dGVybmFsRWRpdCk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gQXJyYXkuaXNBcnJheSh0YXJnZXQpID8gdGFyZ2V0IDogW3RhcmdldF07XG5cdFx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSB0YXNrSGFuZGxlUG9vbCsrO1xuXHRcdFx0XHRcdGNvbnN0IHVuZG9TdG9wSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0XHRhd2FpdCBzZW5kKHsga2luZDogJ2V4dGVybmFsRWRpdHMnLCBzdGFydDogdHJ1ZSwgcmVzb3VyY2VzLCB1bmRvU3RvcElkIH0sIG9wZXJhdGlvbklkKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgY2FsbGJhY2soKTtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRvU3RvcElkO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBzZW5kKHsga2luZDogJ2V4dGVybmFsRWRpdHMnLCBzdGFydDogZmFsc2UsIHJlc291cmNlcywgdW5kb1N0b3BJZCB9LCBvcGVyYXRpb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb25maXJtYXRpb24odGl0bGUsIG1lc3NhZ2UsIGRhdGEsIGJ1dHRvbnMpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLmNvbmZpcm1hdGlvbik7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0KHRpdGxlLCBtZXNzYWdlLCBkYXRhLCBidXR0b25zKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3luYyBxdWVzdGlvbkNhcm91c2VsKHF1ZXN0aW9uczogdnNjb2RlLkNoYXRRdWVzdGlvbltdLCBhbGxvd1NraXAgPSB0cnVlKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMucXVlc3Rpb25DYXJvdXNlbCk7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCByZXNvbHZlSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydChxdWVzdGlvbnMsIGFsbG93U2tpcCk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRkdG8ucmVzb2x2ZUlkID0gcmVzb2x2ZUlkO1xuXG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGEgZGVmZXJyZWQgcHJvbWlzZSB0byB3YWl0IGZvciB0aGUgYW5zd2VyXG5cdFx0XHRcdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkPigpO1xuXG5cdFx0XHRcdFx0Ly8gU3RvcmUgdGhlIGRlZmVycmVkIHByb21pc2UgZm9yIGxhdGVyIHJlc29sdXRpb25cblx0XHRcdFx0XHRpZiAoIXRoYXQuX3BlbmRpbmdDYXJvdXNlbFJlc29sdmVycy5oYXModGhhdC5fcmVxdWVzdC5yZXF1ZXN0SWQpKSB7XG5cdFx0XHRcdFx0XHR0aGF0Ll9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMuc2V0KHRoYXQuX3JlcXVlc3QucmVxdWVzdElkLCBuZXcgTWFwKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGF0Ll9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMuZ2V0KHRoYXQuX3JlcXVlc3QucmVxdWVzdElkKSEuc2V0KHJlc29sdmVJZCwgZGVmZXJyZWQpO1xuXG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXG5cdFx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHVzZXIgdG8gc3VibWl0IGFuc3dlcnMsIGJ1dCByZXNwZWN0IGNhbmNlbGxhdGlvblxuXHRcdFx0XHRcdHJldHVybiByYWNlQ2FuY2VsbGF0aW9uKGRlZmVycmVkLnAsIHRoYXQuX3Rva2VuKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0YmVnaW5Ub29sSW52b2NhdGlvbih0b29sQ2FsbElkLCB0b29sTmFtZSwgc3RyZWFtRGF0YSkge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMuYmVnaW5Ub29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCBkdG86IElDaGF0UHJvZ3Jlc3NEdG8gPSB7XG5cdFx0XHRcdFx0XHRraW5kOiAnYmVnaW5Ub29sSW52b2NhdGlvbicsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWUsXG5cdFx0XHRcdFx0XHRzdHJlYW1EYXRhOiBzdHJlYW1EYXRhID8ge1xuXHRcdFx0XHRcdFx0XHRwYXJ0aWFsSW5wdXQ6IHN0cmVhbURhdGEucGFydGlhbElucHV0XG5cdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmVhbURhdGE/LnN1YmFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cGRhdGVUb29sSW52b2NhdGlvbih0b29sQ2FsbElkLCBzdHJlYW1EYXRhKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy51cGRhdGVUb29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCBkdG86IElDaGF0UHJvZ3Jlc3NEdG8gPSB7XG5cdFx0XHRcdFx0XHRraW5kOiAndXBkYXRlVG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdHN0cmVhbURhdGE6IHtcblx0XHRcdFx0XHRcdFx0cGFydGlhbElucHV0OiBzdHJlYW1EYXRhLnBhcnRpYWxJbnB1dFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwdXNoKHBhcnQpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnB1c2gpO1xuXG5cdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUNvbmZpcm1hdGlvblBhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQ29kZUNpdGF0aW9uUGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VNb3ZlUGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VFeHRlcm5hbEVkaXRQYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVByb2dyZXNzUGFydDJcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQpIHtcblx0XHRcdFx0XHRcdC8vIEVuc3VyZSB2YXJpYWJsZSByZWZlcmVuY2UgdmFsdWVzIGdldCBmaXhlZCB1cFxuXHRcdFx0XHRcdFx0dGhpcy5yZWZlcmVuY2UyKHBhcnQudmFsdWUsIHBhcnQuaWNvblBhdGgsIHBhcnQub3B0aW9ucyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVByb2dyZXNzUGFydDIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGR0byA9IHBhcnQudGFzayA/IHR5cGVDb252ZXJ0LkNoYXRUYXNrLmZyb20ocGFydCkgOiB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRcdF9yZXBvcnQoZHRvLCBwYXJ0LnRhc2spO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUaGlua2luZ1Byb2dyZXNzUGFydCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VBbmNob3JQYXJ0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VBbmNob3JQYXJ0LmZyb20ocGFydCk7XG5cblx0XHRcdFx0XHRcdGlmIChwYXJ0LnJlc29sdmUpIHtcblx0XHRcdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRcdFx0ZHRvLnJlc29sdmVJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXG5cdFx0XHRcdFx0XHRpZiAocGFydC5yZXNvbHZlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRcdFx0XHRwYXJ0LnJlc29sdmUoY3RzLnRva2VuKVxuXHRcdFx0XHRcdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkRHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhhdC5fcHJveHkuJGhhbmRsZUFuY2hvclJlc29sdmUodGhhdC5fcmVxdWVzdC5yZXF1ZXN0SWQsIGR0by5yZXNvbHZlSWQhLCByZXNvbHZlZER0byk7XG5cdFx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdFx0XHQudGhlbigoKSA9PiBjdHMuZGlzcG9zZSgpLCAoKSA9PiBjdHMuZGlzcG9zZSgpKTtcblx0XHRcdFx0XHRcdFx0dGhhdC5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlRXh0ZXJuYWxFZGl0UGFydCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcCA9IHRoaXMuZXh0ZXJuYWxFZGl0KHBhcnQudXJpcywgcGFydC5jYWxsYmFjayk7XG5cdFx0XHRcdFx0XHRwLnRoZW4oKHZhbHVlKSA9PiBwYXJ0LmRpZEdldEFwcGxpZWQodmFsdWUpKTtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VQYXJ0LmZyb20ocGFydCwgdGhhdC5fY29tbWFuZHNDb252ZXJ0ZXIsIHRoYXQuX3Nlc3Npb25EaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVzYWdlKHVzYWdlKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy51c2FnZSk7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCBkdG86IElDaGF0UHJvZ3Jlc3NEdG8gPSB7XG5cdFx0XHRcdFx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdFx0XHRcdFx0cHJvbXB0VG9rZW5zOiB1c2FnZS5wcm9tcHRUb2tlbnMsXG5cdFx0XHRcdFx0XHRjb21wbGV0aW9uVG9rZW5zOiB1c2FnZS5jb21wbGV0aW9uVG9rZW5zLFxuXHRcdFx0XHRcdFx0b3V0cHV0QnVmZmVyOiB1c2FnZS5vdXRwdXRCdWZmZXIsXG5cdFx0XHRcdFx0XHRjb3BpbG90Q3JlZGl0czogdXNhZ2UuY29waWxvdENyZWRpdHMsXG5cdFx0XHRcdFx0XHRwcm9tcHRUb2tlbkRldGFpbHM6IHVzYWdlLnByb21wdFRva2VuRGV0YWlsc1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2FwaU9iamVjdDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSW5GbGlnaHRDaGF0UmVxdWVzdCB7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHRleHRSZXF1ZXN0OiB2c2NvZGUuQ2hhdFJlcXVlc3Q7XG5cdGV4dGVuc2lvbjogSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0aG9va3M/OiBDaGF0UmVxdWVzdEhvb2tzO1xuXHR5aWVsZFJlcXVlc3RlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RDaGF0QWdlbnRzMiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBFeHRIb3N0Q2hhdEFnZW50c1NoYXBlMiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lkUG9vbCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRzID0gbmV3IE1hcDxudW1iZXIsIEV4dEhvc3RDaGF0QWdlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkQ2hhdEFnZW50c1NoYXBlMjtcblxuXHRwcml2YXRlIHN0YXRpYyBfcGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcklkUG9vbCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIEV4dEhvc3RQYXJ0aWNpcGFudERldGVjdG9yPigpO1xuXG5cdHByaXZhdGUgc3RhdGljIF9jb250cmlidXRpb25zUHJvdmlkZXJJZFBvb2wgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRGaWxlUHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIHsgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247IHByb3ZpZGVyOiB2c2NvZGUuQ2hhdEN1c3RvbUFnZW50UHJvdmlkZXIgfCB2c2NvZGUuQ2hhdEluc3RydWN0aW9uc1Byb3ZpZGVyIHwgdnNjb2RlLkNoYXRQcm9tcHRGaWxlUHJvdmlkZXIgfCB2c2NvZGUuQ2hhdFNraWxsUHJvdmlkZXIgfCB2c2NvZGUuQ2hhdEhvb2tQcm92aWRlciB9PigpO1xuXG5cdHByaXZhdGUgc3RhdGljIF9jdXN0b21pemF0aW9uUHJvdmlkZXJJZFBvb2wgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uUHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIHsgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247IHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXIgfT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVSZXNvdXJjZU1hcDxEaXNwb3NhYmxlU3RvcmU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNvdXJjZU1hcCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGlvbkRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlTWFwPG51bWJlciwgRGlzcG9zYWJsZVN0b3JlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luRmxpZ2h0UmVxdWVzdHMgPSBuZXcgU2V0PEluRmxpZ2h0Q2hhdFJlcXVlc3Q+KCk7XG5cblx0Ly8gTWFwIG9mIHJlcXVlc3RJZCAtPiByZXNvbHZlSWQgLT4gZGVmZXJyZWQgcHJvbWlzZSBmb3IgcXVlc3Rpb24gY2Fyb3VzZWwgYW5zd2Vyc1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgRGVmZXJyZWRQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkPj4+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDaGF0UmVxdWVzdFRvb2xzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLkNoYXRSZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0UmVxdWVzdFRvb2xzID0gdGhpcy5fb25EaWRDaGFuZ2VDaGF0UmVxdWVzdFRvb2xzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZUNoYXRTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlQ2hhdFNlc3Npb24gPSB0aGlzLl9vbkRpZERpc3Bvc2VDaGF0U2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUluc3RydWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUluc3RydWN0aW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNraWxscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNraWxscyA9IHRoaXMuX29uRGlkQ2hhbmdlU2tpbGxzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gdGhpcy5fb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhvb2tzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSG9va3MgPSB0aGlzLl9vbkRpZENoYW5nZUhvb2tzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBsdWdpbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQbHVnaW5zID0gdGhpcy5fb25EaWRDaGFuZ2VQbHVnaW5zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbUFnZW50cyA9IG5ldyBDYWNoZWRQcm9taXNlKCgpID0+IHRoaXMuX3Byb3h5LiRwcm92aWRlQ3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oYWdlbnRzID0+IGFnZW50cy5tYXAoYWdlbnQgPT4gdGhpcy50b0N1c3RvbUFnZW50KGFnZW50KSkpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdHJ1Y3Rpb25zID0gbmV3IENhY2hlZFByb21pc2UoKCkgPT4gdGhpcy5fcHJveHkuJHByb3ZpZGVJbnN0cnVjdGlvbnMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihpbnN0cnVjdGlvbnMgPT4gaW5zdHJ1Y3Rpb25zLm1hcChpbnN0cnVjdGlvbiA9PiB0aGlzLnRvSW5zdHJ1Y3Rpb24oaW5zdHJ1Y3Rpb24pKSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9za2lsbHMgPSBuZXcgQ2FjaGVkUHJvbWlzZSgoKSA9PiB0aGlzLl9wcm94eS4kcHJvdmlkZVNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKHNraWxscyA9PiBza2lsbHMubWFwKHNraWxsID0+IHRoaXMudG9Ta2lsbChza2lsbCkpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsYXNoQ29tbWFuZHMgPSBuZXcgQ2FjaGVkUHJvbWlzZSgoKSA9PiB0aGlzLl9wcm94eS4kcHJvdmlkZVNsYXNoQ29tbWFuZHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihzbGFzaENvbW1hbmRzID0+IHNsYXNoQ29tbWFuZHMubWFwKHNsYXNoQ29tbWFuZCA9PiB0aGlzLnRvU2xhc2hDb21tYW5kKHNsYXNoQ29tbWFuZCkpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvb2tzID0gbmV3IENhY2hlZFByb21pc2UoKCkgPT4gdGhpcy5fcHJveHkuJHByb3ZpZGVIb29rcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKGhvb2tzID0+IGhvb2tzLm1hcChob29rID0+IHRoaXMudG9Ib29rKGhvb2spKSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5zID0gbmV3IENhY2hlZFByb21pc2UoKCkgPT4gdGhpcy5fcHJveHkuJHByb3ZpZGVQbHVnaW5zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4ocGx1Z2lucyA9PiBwbHVnaW5zLm1hcChwbHVnaW4gPT4gdGhpcy50b1BsdWdpbihwbHVnaW4pKSkpO1xuXG5cdHByaXZhdGUgX2FjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVDaGF0UGFuZWxTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZS5ldmVudDtcblxuXHRnZXQgYWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cblx0cHJpdmF0ZSB0b0N1c3RvbUFnZW50KGR0bzogSUN1c3RvbUFnZW50RHRvKTogdnNjb2RlLkNoYXRDdXN0b21BZ2VudCB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemU8dnNjb2RlLkNoYXRDdXN0b21BZ2VudD4oe1xuXHRcdFx0dXJpOiBVUkkucmV2aXZlKGR0by51cmkpLFxuXHRcdFx0bmFtZTogZHRvLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZHRvLmRlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiBkdG8uc291cmNlLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGR0by5leHRlbnNpb25JZCxcblx0XHRcdHBsdWdpblVyaTogZHRvLnBsdWdpblVyaSA/IFVSSS5yZXZpdmUoZHRvLnBsdWdpblVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IGR0by5zZXNzaW9uVHlwZXMsXG5cdFx0XHRhcmd1bWVudEhpbnQ6IGR0by5hcmd1bWVudEhpbnQsXG5cdFx0XHR0b29sczogZHRvLnRvb2xzLFxuXHRcdFx0bW9kZWw6IGR0by5tb2RlbCxcblx0XHRcdHVzZXJJbnZvY2FibGU6IGR0by51c2VySW52b2NhYmxlLFxuXHRcdFx0ZGlzYWJsZU1vZGVsSW52b2NhdGlvbjogZHRvLmRpc2FibGVNb2RlbEludm9jYXRpb24sXG5cdFx0XHRlbmFibGVkOiBkdG8uZW5hYmxlZCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9JbnN0cnVjdGlvbihkdG86IElJbnN0cnVjdGlvbkR0byk6IHZzY29kZS5DaGF0SW5zdHJ1Y3Rpb24ge1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplPHZzY29kZS5DaGF0SW5zdHJ1Y3Rpb24+KHtcblx0XHRcdHVyaTogVVJJLnJldml2ZShkdG8udXJpKSxcblx0XHRcdG5hbWU6IGR0by5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGR0by5kZXNjcmlwdGlvbixcblx0XHRcdHNvdXJjZTogZHRvLnNvdXJjZSxcblx0XHRcdGV4dGVuc2lvbklkOiBkdG8uZXh0ZW5zaW9uSWQsXG5cdFx0XHRwbHVnaW5Vcmk6IGR0by5wbHVnaW5VcmkgPyBVUkkucmV2aXZlKGR0by5wbHVnaW5VcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBkdG8uc2Vzc2lvblR5cGVzLFxuXHRcdFx0cGF0dGVybjogZHRvLnBhdHRlcm4sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRvU2tpbGwoZHRvOiBJU2tpbGxEdG8pOiB2c2NvZGUuQ2hhdFNraWxsIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZTx2c2NvZGUuQ2hhdFNraWxsPih7XG5cdFx0XHR1cmk6IFVSSS5yZXZpdmUoZHRvLnVyaSksXG5cdFx0XHRuYW1lOiBkdG8ubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBkdG8uZGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2U6IGR0by5zb3VyY2UsXG5cdFx0XHRleHRlbnNpb25JZDogZHRvLmV4dGVuc2lvbklkLFxuXHRcdFx0cGx1Z2luVXJpOiBkdG8ucGx1Z2luVXJpID8gVVJJLnJldml2ZShkdG8ucGx1Z2luVXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25UeXBlczogZHRvLnNlc3Npb25UeXBlcyxcblx0XHRcdHVzZXJJbnZvY2FibGU6IGR0by51c2VySW52b2NhYmxlLFxuXHRcdFx0ZGlzYWJsZU1vZGVsSW52b2NhdGlvbjogZHRvLmRpc2FibGVNb2RlbEludm9jYXRpb24sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRvU2xhc2hDb21tYW5kKGR0bzogSVNsYXNoQ29tbWFuZER0byk6IHZzY29kZS5DaGF0U2xhc2hDb21tYW5kIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZTx2c2NvZGUuQ2hhdFNsYXNoQ29tbWFuZD4oe1xuXHRcdFx0dXJpOiBVUkkucmV2aXZlKGR0by51cmkpLFxuXHRcdFx0bmFtZTogZHRvLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZHRvLmRlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiBkdG8uc291cmNlLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGR0by5leHRlbnNpb25JZCxcblx0XHRcdHBsdWdpblVyaTogZHRvLnBsdWdpblVyaSA/IFVSSS5yZXZpdmUoZHRvLnBsdWdpblVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IGR0by5zZXNzaW9uVHlwZXMsXG5cdFx0XHRhcmd1bWVudEhpbnQ6IGR0by5hcmd1bWVudEhpbnQsXG5cdFx0XHR1c2VySW52b2NhYmxlOiBkdG8udXNlckludm9jYWJsZSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9Ib29rKGR0bzogSUhvb2tEdG8pOiB2c2NvZGUuQ2hhdEhvb2sge1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRcdHVyaTogVVJJLnJldml2ZShkdG8udXJpKSxcblx0XHRcdHNlc3Npb25UeXBlczogZHRvLnNlc3Npb25UeXBlcyxcblx0XHRcdHNvdXJjZTogZHRvLnNvdXJjZSxcblx0XHRcdGV4dGVuc2lvbklkOiBkdG8uZXh0ZW5zaW9uSWQsXG5cdFx0XHRwbHVnaW5Vcmk6IGR0by5wbHVnaW5VcmkgPyBVUkkucmV2aXZlKGR0by5wbHVnaW5VcmkpIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1BsdWdpbihkdG86IElQbHVnaW5EdG8pOiB2c2NvZGUuQ2hhdFBsdWdpbiB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoeyB1cmk6IFVSSS5yZXZpdmUoZHRvLnVyaSkgfSk7XG5cdH1cblxuXHRwcm92aWRlQ3VzdG9tQWdlbnRzKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdEN1c3RvbUFnZW50W10+IHtcblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tQWdlbnRzLmdldCh0b2tlbik7XG5cdH1cblxuXHRwcm92aWRlSW5zdHJ1Y3Rpb25zKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdEluc3RydWN0aW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdHJ1Y3Rpb25zLmdldCh0b2tlbik7XG5cdH1cblxuXHRwcm92aWRlU2tpbGxzKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdFNraWxsW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2tpbGxzLmdldCh0b2tlbik7XG5cdH1cblxuXHRwcm92aWRlU2xhc2hDb21tYW5kcyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRTbGFzaENvbW1hbmRbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zbGFzaENvbW1hbmRzLmdldCh0b2tlbik7XG5cdH1cblxuXHRwcm92aWRlSG9va3ModG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFRoZW5hYmxlPHJlYWRvbmx5IHZzY29kZS5DaGF0SG9va1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvb2tzLmdldCh0b2tlbik7XG5cdH1cblxuXHRwcm92aWRlUGx1Z2lucyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRQbHVnaW5bXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wbHVnaW5zLmdldCh0b2tlbik7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VzdG9tQWdlbnRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2luc3RydWN0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zLmZpcmUoKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZVNraWxscygpOiB2b2lkIHtcblx0XHR0aGlzLl9za2lsbHMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNraWxscy5maXJlKCk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NsYXNoQ29tbWFuZHMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMuZmlyZSgpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlSG9va3MoKTogdm9pZCB7XG5cdFx0dGhpcy5faG9va3MuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhvb2tzLmZpcmUoKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZVBsdWdpbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGx1Z2lucy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGx1Z2lucy5maXJlKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtYWluQ29udGV4dDogSU1haW5Db250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcnNBbmREb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzOiBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlhZ25vc3RpY3M6IEV4dEhvc3REaWFnbm9zdGljcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90b29sczogRXh0SG9zdExhbmd1YWdlTW9kZWxUb29scyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvbnM6IEV4dEhvc3RDaGF0U2Vzc2lvbnMsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkQ2hhdEFnZW50czIpO1xuXG5cdFx0X2NvbW1hbmRzLnJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3Ioe1xuXHRcdFx0cHJvY2Vzc0FyZ3VtZW50OiAoYXJnKSA9PiB7XG5cdFx0XHRcdC8vIERvbid0IHNlbmQgdGhpcyBhcmd1bWVudCB0byBleHRlbnNpb24gY29tbWFuZHNcblx0XHRcdFx0aWYgKGlzQ2hhdFZpZXdUaXRsZUFjdGlvbkNvbnRleHQoYXJnKSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHRyYW5zZmVyQWN0aXZlQ2hhdChuZXdXb3Jrc3BhY2U6IHZzY29kZS5VcmkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9wcm94eS4kdHJhbnNmZXJBY3RpdmVDaGF0U2Vzc2lvbihuZXdXb3Jrc3BhY2UpO1xuXHR9XG5cblx0Y3JlYXRlQ2hhdEFnZW50KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBoYW5kbGVyOiB2c2NvZGUuQ2hhdEV4dGVuZGVkUmVxdWVzdEhhbmRsZXIpOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50IHtcblx0XHRjb25zdCBoYW5kbGUgPSBFeHRIb3N0Q2hhdEFnZW50czIuX2lkUG9vbCsrO1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IEV4dEhvc3RDaGF0QWdlbnQoZXh0ZW5zaW9uLCBpZCwgdGhpcy5fcHJveHksIGhhbmRsZSwgaGFuZGxlcik7XG5cdFx0dGhpcy5fYWdlbnRzLnNldChoYW5kbGUsIGFnZW50KTtcblxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckFnZW50KGhhbmRsZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGlkLCB7fSwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gYWdlbnQuYXBpQWdlbnQ7XG5cdH1cblxuXHRjcmVhdGVEeW5hbWljQ2hhdEFnZW50KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBkeW5hbWljUHJvcHM6IHZzY29kZS5EeW5hbWljQ2hhdFBhcnRpY2lwYW50UHJvcHMsIGhhbmRsZXI6IHZzY29kZS5DaGF0RXh0ZW5kZWRSZXF1ZXN0SGFuZGxlcik6IHZzY29kZS5DaGF0UGFydGljaXBhbnQge1xuXHRcdGNvbnN0IGhhbmRsZSA9IEV4dEhvc3RDaGF0QWdlbnRzMi5faWRQb29sKys7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgRXh0SG9zdENoYXRBZ2VudChleHRlbnNpb24sIGlkLCB0aGlzLl9wcm94eSwgaGFuZGxlLCBoYW5kbGVyKTtcblx0XHR0aGlzLl9hZ2VudHMuc2V0KGhhbmRsZSwgYWdlbnQpO1xuXG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQWdlbnQoaGFuZGxlLCBleHRlbnNpb24uaWRlbnRpZmllciwgaWQsIHsgaXNTdGlja3k6IHRydWUgfSBzYXRpc2ZpZXMgSUV4dGVuc2lvbkNoYXRBZ2VudE1ldGFkYXRhLCBkeW5hbWljUHJvcHMpO1xuXHRcdHJldHVybiBhZ2VudC5hcGlBZ2VudDtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gRXh0SG9zdENoYXRBZ2VudHMyLl9wYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVySWRQb29sKys7XG5cdFx0dGhpcy5fcGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcnMuc2V0KGhhbmRsZSwgbmV3IEV4dEhvc3RQYXJ0aWNpcGFudERldGVjdG9yKGV4dGVuc2lvbiwgcHJvdmlkZXIpKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcihoYW5kbGUpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogSW50ZXJuYWwgbWV0aG9kIHRoYXQgaGFuZGxlcyBhbGwgcHJvbXB0IGZpbGUgcHJvdmlkZXIgdHlwZXMuXG5cdCAqIFJvdXRlcyBjdXN0b20gYWdlbnRzLCBpbnN0cnVjdGlvbnMsIHByb21wdCBmaWxlcywgYW5kIHNraWxscyB0byB0aGUgdW5pZmllZCBpbnRlcm5hbCBpbXBsZW1lbnRhdGlvbi5cblx0ICovXG5cdHJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0eXBlOiBQcm9tcHRzVHlwZSwgcHJvdmlkZXI6IHZzY29kZS5DaGF0Q3VzdG9tQWdlbnRQcm92aWRlciB8IHZzY29kZS5DaGF0SW5zdHJ1Y3Rpb25zUHJvdmlkZXIgfCB2c2NvZGUuQ2hhdFByb21wdEZpbGVQcm92aWRlciB8IHZzY29kZS5DaGF0U2tpbGxQcm92aWRlciB8IHZzY29kZS5DaGF0SG9va1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IEV4dEhvc3RDaGF0QWdlbnRzMi5fY29udHJpYnV0aW9uc1Byb3ZpZGVySWRQb29sKys7XG5cdFx0dGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVycy5zZXQoaGFuZGxlLCB7IGV4dGVuc2lvbiwgcHJvdmlkZXIgfSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGhhbmRsZSwgdHlwZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gcHJvdmlkZXIgY2hhbmdlIGV2ZW50cyBhbmQgbm90aWZ5IG1haW4gdGhyZWFkXG5cdFx0Ly8gQ2hlY2sgZm9yIHRoZSBhcHByb3ByaWF0ZSBldmVudCBiYXNlZCBvbiB0aGUgcHJvdmlkZXIgdHlwZVxuXHRcdGxldCBjaGFuZ2VFdmVudDogdnNjb2RlLkV2ZW50PHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0Y2hhbmdlRXZlbnQgPSAocHJvdmlkZXIgYXMgdnNjb2RlLkNoYXRDdXN0b21BZ2VudFByb3ZpZGVyKS5vbkRpZENoYW5nZUN1c3RvbUFnZW50cztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0Y2hhbmdlRXZlbnQgPSAocHJvdmlkZXIgYXMgdnNjb2RlLkNoYXRJbnN0cnVjdGlvbnNQcm92aWRlcikub25EaWRDaGFuZ2VJbnN0cnVjdGlvbnM7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRcdGNoYW5nZUV2ZW50ID0gKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0UHJvbXB0RmlsZVByb3ZpZGVyKS5vbkRpZENoYW5nZVByb21wdEZpbGVzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRcdGNoYW5nZUV2ZW50ID0gKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0U2tpbGxQcm92aWRlcikub25EaWRDaGFuZ2VTa2lsbHM7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5ob29rOlxuXHRcdFx0XHRjaGFuZ2VFdmVudCA9IChwcm92aWRlciBhcyB2c2NvZGUuQ2hhdEhvb2tQcm92aWRlcikub25EaWRDaGFuZ2VIb29rcztcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZUV2ZW50KSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2hhbmdlRXZlbnQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VQcm9tcHRGaWxlcyhoYW5kbGUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGhhbmRsZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVQcm9tcHRGaWxlcyhoYW5kbGU6IG51bWJlciwgdHlwZTogUHJvbXB0c1R5cGUsIGNvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJvbXB0RmlsZVJlc291cmNlW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlckRhdGEgPSB0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghcHJvdmlkZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJEYXRhLnByb3ZpZGVyO1xuXHRcdGxldCByZXNvdXJjZXM6IHZzY29kZS5DaGF0UmVzb3VyY2VbXSB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdHJlc291cmNlcyA9IGF3YWl0IChwcm92aWRlciBhcyB2c2NvZGUuQ2hhdEN1c3RvbUFnZW50UHJvdmlkZXIpLnByb3ZpZGVDdXN0b21BZ2VudHMoY29udGV4dCwgdG9rZW4pID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0cmVzb3VyY2VzID0gYXdhaXQgKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0SW5zdHJ1Y3Rpb25zUHJvdmlkZXIpLnByb3ZpZGVJbnN0cnVjdGlvbnMoY29udGV4dCwgdG9rZW4pID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdFx0cmVzb3VyY2VzID0gYXdhaXQgKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0UHJvbXB0RmlsZVByb3ZpZGVyKS5wcm92aWRlUHJvbXB0RmlsZXMoY29udGV4dCwgdG9rZW4pID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRyZXNvdXJjZXMgPSBhd2FpdCAocHJvdmlkZXIgYXMgdnNjb2RlLkNoYXRTa2lsbFByb3ZpZGVyKS5wcm92aWRlU2tpbGxzKGNvbnRleHQsIHRva2VuKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5ob29rOlxuXHRcdFx0XHRyZXNvdXJjZXMgPSBhd2FpdCAocHJvdmlkZXIgYXMgdnNjb2RlLkNoYXRIb29rUHJvdmlkZXIpLnByb3ZpZGVIb29rcyhjb250ZXh0LCB0b2tlbikgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzb3VyY2VzO1xuXHR9XG5cblx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiB2c2NvZGUuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXJNZXRhZGF0YSwgcHJvdmlkZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSBFeHRIb3N0Q2hhdEFnZW50czIuX2N1c3RvbWl6YXRpb25Qcm92aWRlcklkUG9vbCsrO1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25Qcm92aWRlcnMuc2V0KGhhbmRsZSwgeyBleHRlbnNpb24sIHByb3ZpZGVyIH0pO1xuXG5cdFx0Y29uc3QgbWV0YWRhdGFEdG86IElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlck1ldGFkYXRhRHRvID0ge1xuXHRcdFx0bGFiZWw6IG1ldGFkYXRhLmxhYmVsLFxuXHRcdFx0aWNvbklkOiBtZXRhZGF0YS5pY29uSWQsXG5cdFx0XHRzdXBwb3J0ZWRUeXBlczogbWV0YWRhdGEuc3VwcG9ydGVkVHlwZXM/Lm1hcCh0ID0+IHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUuZnJvbSh0KSksXG5cdFx0fTtcblxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyKGhhbmRsZSwgY2hhdFNlc3Npb25UeXBlLCBtZXRhZGF0YUR0bywgZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2UpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKGhhbmRsZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXN0b21pemF0aW9uUHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyhoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25JdGVtRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlckRhdGEgPSB0aGlzLl9jdXN0b21pemF0aW9uUHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghcHJvdmlkZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBwcm9wb3NlZCBBUEkgcmVxdWlyZXMgYSByZWFsIHNlc3Npb24gVVJJOyBiYWlsIG91dCB3aGVuIHRoZVxuXHRcdC8vIGludGVybmFsIGNhbGxlciAoZS5nLiB0aGUgbWFuYWdlbWVudCBVSSBwb3B1bGF0aW5nIGEgZ2xvYmFsIGxpc3QpXG5cdFx0Ly8gaGFzIG5vdGhpbmcgc2NvcGVkIHRvIGZvcndhcmQuXG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcHJvdmlkZXJEYXRhLnByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKSwgdG9rZW4pO1xuXHRcdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaXRlbXMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0dXJpOiBpdGVtLnVyaSxcblx0XHRcdFx0dHlwZTogdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZS5mcm9tKGl0ZW0udHlwZSksXG5cdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRcdHNvdXJjZTogaXRlbS5zb3VyY2UsXG5cdFx0XHRcdGdyb3VwS2V5OiBpdGVtLmdyb3VwS2V5LFxuXHRcdFx0XHRiYWRnZTogaXRlbS5iYWRnZSxcblx0XHRcdFx0YmFkZ2VUb29sdGlwOiBpdGVtLmJhZGdlVG9vbHRpcCxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGl0ZW0uZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdHBsdWdpblVyaTogaXRlbS5wbHVnaW5VcmksXG5cdFx0XHRcdHBsdWdpbkxhYmVsOiBpdGVtLnBsdWdpbkxhYmVsLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiBpdGVtLnVzZXJJbnZvY2FibGUsXG5cdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uSXRlbUR0bykpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZVNvdXJjZUZvbGRlcnMoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZTogVXJpQ29tcG9uZW50cywgdHlwZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXJEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyRGF0YSA9IHRoaXMuX2N1c3RvbWl6YXRpb25Qcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFwcm92aWRlckRhdGE/LnByb3ZpZGVyLnByb3ZpZGVTb3VyY2VGb2xkZXJzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgcHJvdmlkZXJEYXRhLnByb3ZpZGVyLnByb3ZpZGVTb3VyY2VGb2xkZXJzKFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKSwgdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZS50byh0eXBlKSwgdG9rZW4pO1xuXHRcdFx0aWYgKCFmb2xkZXJzKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmb2xkZXJzLm1hcChmb2xkZXIgPT4gKHtcblx0XHRcdFx0dXJpOiBmb2xkZXIudXJpLFxuXHRcdFx0XHRsYWJlbDogZm9sZGVyLmxhYmVsLFxuXHRcdFx0XHRzb3VyY2U6IGZvbGRlci5zb3VyY2UsXG5cdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uU291cmNlRm9sZGVyRHRvKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRkZXRlY3RDaGF0UGFydGljaXBhbnQoaGFuZGxlOiBudW1iZXIsIHJlcXVlc3REdG86IER0bzxJQ2hhdEFnZW50UmVxdWVzdD4sIGNvbnRleHQ6IHsgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeUR0b1tdIH0sIG9wdGlvbnM6IHsgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uOyBwYXJ0aWNpcGFudHM/OiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50TWV0YWRhdGFbXSB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5DaGF0UGFydGljaXBhbnREZXRlY3Rpb25SZXN1bHQgfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGV0ZWN0b3IgPSB0aGlzLl9wYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWRldGVjdG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmVxdWVzdCwgbG9jYXRpb24sIGhpc3RvcnkgfSA9IGF3YWl0IHRoaXMuX2NyZWF0ZVJlcXVlc3QocmVxdWVzdER0bywgY29udGV4dCwgZGV0ZWN0b3IuZXh0ZW5zaW9uKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5nZXRNb2RlbEZvclJlcXVlc3QocmVxdWVzdCwgZGV0ZWN0b3IuZXh0ZW5zaW9uKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IHRoaXMuZ2V0VG9vbHNGb3JSZXF1ZXN0KGRldGVjdG9yLmV4dGVuc2lvbiwgcmVxdWVzdC51c2VyU2VsZWN0ZWRUb29scywgbW9kZWwuaWQsIHRva2VuKTtcblx0XHRjb25zdCBleHRSZXF1ZXN0ID0gdHlwZUNvbnZlcnQuQ2hhdEFnZW50UmVxdWVzdC50byhcblx0XHRcdHJlcXVlc3QsXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdG1vZGVsLFxuXHRcdFx0cmVxdWVzdC5tb2RlbENvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aGlzLmdldERpYWdub3N0aWNzV2hlbkVuYWJsZWQoZGV0ZWN0b3IuZXh0ZW5zaW9uKSxcblx0XHRcdHRvb2xzLFxuXHRcdFx0ZGV0ZWN0b3IuZXh0ZW5zaW9uLFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZSk7XG5cblx0XHRyZXR1cm4gZGV0ZWN0b3IucHJvdmlkZXIucHJvdmlkZVBhcnRpY2lwYW50RGV0ZWN0aW9uKFxuXHRcdFx0ZXh0UmVxdWVzdCxcblx0XHRcdHsgaGlzdG9yeSwgeWllbGRSZXF1ZXN0ZWQ6IGZhbHNlIH0sXG5cdFx0XHR7IHBhcnRpY2lwYW50czogb3B0aW9ucy5wYXJ0aWNpcGFudHMsIGxvY2F0aW9uOiB0eXBlQ29udmVydC5DaGF0TG9jYXRpb24udG8ob3B0aW9ucy5sb2NhdGlvbikgfSxcblx0XHRcdHRva2VuXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVJlcXVlc3QocmVxdWVzdER0bzogRHRvPElDaGF0QWdlbnRSZXF1ZXN0PiwgY29udGV4dDogeyBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5RHRvW10gfSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pIHtcblx0XHRjb25zdCByZXF1ZXN0ID0gcmV2aXZlPElDaGF0QWdlbnRSZXF1ZXN0PihyZXF1ZXN0RHRvKTtcblx0XHRjb25zdCBjb252ZXJ0ZWRIaXN0b3J5ID0gYXdhaXQgdGhpcy5wcmVwYXJlSGlzdG9yeVR1cm5zKGV4dGVuc2lvbiwgcmVxdWVzdC5hZ2VudElkLCBjb250ZXh0KTtcblxuXHRcdC8vIGluLXBsYWNlIGNvbnZlcnRpbmcgZm9yIGxvY2F0aW9uLWRhdGFcblx0XHRsZXQgbG9jYXRpb246IHZzY29kZS5DaGF0UmVxdWVzdEVkaXRvckRhdGEgfCB2c2NvZGUuQ2hhdFJlcXVlc3ROb3RlYm9va0RhdGEgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJlcXVlc3QubG9jYXRpb25EYXRhPy50eXBlID09PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpIHtcblx0XHRcdC8vIGVkaXRvciBkYXRhXG5cdFx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXF1ZXN0LmxvY2F0aW9uRGF0YS5kb2N1bWVudCk7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JzQW5kRG9jdW1lbnRzLmdldEVkaXRvcihyZXF1ZXN0LmxvY2F0aW9uRGF0YS5pZCkhO1xuXHRcdFx0bG9jYXRpb24gPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0RWRpdG9yRGF0YShlZGl0b3IudmFsdWUsIGRvY3VtZW50LCB0eXBlQ29udmVydC5TZWxlY3Rpb24udG8ocmVxdWVzdC5sb2NhdGlvbkRhdGEuc2VsZWN0aW9uKSwgdHlwZUNvbnZlcnQuUmFuZ2UudG8ocmVxdWVzdC5sb2NhdGlvbkRhdGEud2hvbGVSYW5nZSkpO1xuXG5cdFx0fSBlbHNlIGlmIChyZXF1ZXN0LmxvY2F0aW9uRGF0YT8udHlwZSA9PT0gQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2spIHtcblx0XHRcdC8vIG5vdGVib29rIGRhdGFcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVxdWVzdC5sb2NhdGlvbkRhdGEuc2Vzc2lvbklucHV0VXJpKTtcblx0XHRcdGxvY2F0aW9uID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdE5vdGVib29rRGF0YShjZWxsKTtcblxuXHRcdH0gZWxzZSBpZiAocmVxdWVzdC5sb2NhdGlvbkRhdGE/LnR5cGUgPT09IENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsKSB7XG5cdFx0XHQvLyBUQkRcblx0XHR9XG5cblx0XHRyZXR1cm4geyByZXF1ZXN0LCBsb2NhdGlvbiwgaGlzdG9yeTogY29udmVydGVkSGlzdG9yeSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRNb2RlbEZvclJlcXVlc3QocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogUHJvbWlzZTx2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQ+IHtcblx0XHRsZXQgbW9kZWw6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmVxdWVzdC51c2VyU2VsZWN0ZWRNb2RlbElkKSB7XG5cdFx0XHRtb2RlbCA9IGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzLmdldExhbmd1YWdlTW9kZWxCeUlkZW50aWZpZXIoZXh0ZW5zaW9uLCByZXF1ZXN0LnVzZXJTZWxlY3RlZE1vZGVsSWQpO1xuXHRcdH1cblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzLmdldERlZmF1bHRMYW5ndWFnZU1vZGVsKGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTGFuZ3VhZ2UgbW9kZWwgdW5hdmFpbGFibGUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXG5cdGFzeW5jICRzZXRSZXF1ZXN0VG9vbHMocmVxdWVzdElkOiBzdHJpbmcsIHRvb2xzOiBVc2VyU2VsZWN0ZWRUb29scykge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBbLi4udGhpcy5faW5GbGlnaHRSZXF1ZXN0c10uZmluZChyID0+IHIucmVxdWVzdElkID09PSByZXF1ZXN0SWQpO1xuXHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcXVlc3QuZXh0UmVxdWVzdC50b29scy5jbGVhcigpO1xuXHRcdGNvbnN0IHRvb2xzTWFwID0gYXdhaXQgdGhpcy5nZXRUb29sc0ZvclJlcXVlc3QocmVxdWVzdC5leHRlbnNpb24sIHRvb2xzLCByZXF1ZXN0LmV4dFJlcXVlc3QubW9kZWwuaWQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIHRvb2xzTWFwKSB7XG5cdFx0XHRyZXF1ZXN0LmV4dFJlcXVlc3QudG9vbHMuc2V0KGssIHYpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNoYXRSZXF1ZXN0VG9vbHMuZmlyZShyZXF1ZXN0LmV4dFJlcXVlc3QpO1xuXHR9XG5cblx0JHNldFlpZWxkUmVxdWVzdGVkKHJlcXVlc3RJZDogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBbLi4udGhpcy5faW5GbGlnaHRSZXF1ZXN0c10uZmluZChyID0+IHIucmVxdWVzdElkID09PSByZXF1ZXN0SWQpO1xuXHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRyZXF1ZXN0LnlpZWxkUmVxdWVzdGVkID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJGludm9rZUFnZW50KGhhbmRsZTogbnVtYmVyLCByZXF1ZXN0RHRvOiBEdG88SUNoYXRBZ2VudFJlcXVlc3Q+LCBjb250ZXh0OiB7IGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlEdG9bXTsgY2hhdFNlc3Npb25Db250ZXh0PzogSUNoYXRTZXNzaW9uQ29udGV4dER0byB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0QWdlbnRJbnZva2VSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX2FnZW50cy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtDSEFUXSgke2hhbmRsZX0pIENBTk5PVCBpbnZva2UgYWdlbnQgYmVjYXVzZSB0aGUgYWdlbnQgaXMgbm90IHJlZ2lzdGVyZWRgKTtcblx0XHR9XG5cblx0XHRsZXQgc3RyZWFtOiBDaGF0QWdlbnRSZXNwb25zZVN0cmVhbSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgaW5GbGlnaHRSZXF1ZXN0OiBJbkZsaWdodENoYXRSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgcmVxdWVzdCwgbG9jYXRpb24sIGhpc3RvcnkgfSA9IGF3YWl0IHRoaXMuX2NyZWF0ZVJlcXVlc3QocmVxdWVzdER0bywgY29udGV4dCwgYWdlbnQuZXh0ZW5zaW9uKTtcblxuXHRcdFx0Ly8gSW5pdCBzZXNzaW9uIGRpc3Bvc2FibGVzXG5cdFx0XHRsZXQgc2Vzc2lvbkRpc3Bvc2FibGVzID0gdGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmdldChyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXNlc3Npb25EaXNwb3NhYmxlcykge1xuXHRcdFx0XHRzZXNzaW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5zZXQocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25EaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cblx0XHRcdHN0cmVhbSA9IG5ldyBDaGF0QWdlbnRSZXNwb25zZVN0cmVhbShhZ2VudC5leHRlbnNpb24sIHJlcXVlc3QsIHRoaXMuX3Byb3h5LCB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIsIHNlc3Npb25EaXNwb3NhYmxlcywgdGhpcy5fcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzLCB0b2tlbik7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5nZXRNb2RlbEZvclJlcXVlc3QocmVxdWVzdCwgYWdlbnQuZXh0ZW5zaW9uKTtcblx0XHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgdGhpcy5nZXRUb29sc0ZvclJlcXVlc3QoYWdlbnQuZXh0ZW5zaW9uLCByZXF1ZXN0LnVzZXJTZWxlY3RlZFRvb2xzLCBtb2RlbC5pZCwgdG9rZW4pO1xuXHRcdFx0Y29uc3QgZXh0UmVxdWVzdCA9IHR5cGVDb252ZXJ0LkNoYXRBZ2VudFJlcXVlc3QudG8oXG5cdFx0XHRcdHJlcXVlc3QsXG5cdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0cmVxdWVzdC5tb2RlbENvbmZpZ3VyYXRpb24sXG5cdFx0XHRcdHRoaXMuZ2V0RGlhZ25vc3RpY3NXaGVuRW5hYmxlZChhZ2VudC5leHRlbnNpb24pLFxuXHRcdFx0XHR0b29scyxcblx0XHRcdFx0YWdlbnQuZXh0ZW5zaW9uLFxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdFx0aW5GbGlnaHRSZXF1ZXN0ID0geyByZXF1ZXN0SWQ6IHJlcXVlc3REdG8ucmVxdWVzdElkLCBleHRSZXF1ZXN0LCBleHRlbnNpb246IGFnZW50LmV4dGVuc2lvbiwgaG9va3M6IHJlcXVlc3QuaG9va3MsIHlpZWxkUmVxdWVzdGVkOiBmYWxzZSB9O1xuXHRcdFx0dGhpcy5faW5GbGlnaHRSZXF1ZXN0cy5hZGQoaW5GbGlnaHRSZXF1ZXN0KTtcblxuXG5cdFx0XHQvLyBJZiB0aGlzIHJlcXVlc3Qgb3JpZ2luYXRlcyBmcm9tIGEgY29udHJpYnV0ZWQgY2hhdCBzZXNzaW9uIGVkaXRvciwgYXR0ZW1wdCB0byByZXNvbHZlIHRoZSBDaGF0U2Vzc2lvbiBBUEkgb2JqZWN0XG5cdFx0XHRsZXQgY2hhdFNlc3Npb25Db250ZXh0OiB2c2NvZGUuQ2hhdFNlc3Npb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNvbnRleHQuY2hhdFNlc3Npb25Db250ZXh0KSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoY29udGV4dC5jaGF0U2Vzc2lvbkNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGlucHV0U3RhdGUgPSBhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnMuZ2V0SW5wdXRTdGF0ZUZvclNlc3Npb24oXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGNvbnRleHQuY2hhdFNlc3Npb25Db250ZXh0LmluaXRpYWxTZXNzaW9uT3B0aW9ucyxcblx0XHRcdFx0XHR0b2tlbixcblx0XHRcdFx0KTtcblx0XHRcdFx0Y2hhdFNlc3Npb25Db250ZXh0ID0ge1xuXHRcdFx0XHRcdGNoYXRTZXNzaW9uSXRlbToge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdGxhYmVsOiBjb250ZXh0LmNoYXRTZXNzaW9uQ29udGV4dC5pc1VudGl0bGVkID8gJ1VudGl0bGVkIFNlc3Npb24nIDogJ1Nlc3Npb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aXNVbnRpdGxlZDogY29udGV4dC5jaGF0U2Vzc2lvbkNvbnRleHQuaXNVbnRpdGxlZCxcblx0XHRcdFx0XHRpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IGNvbnRleHQuY2hhdFNlc3Npb25Db250ZXh0LmluaXRpYWxTZXNzaW9uT3B0aW9ucyxcblx0XHRcdFx0XHRpbnB1dFN0YXRlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGF0Q29udGV4dDogdnNjb2RlLkNoYXRDb250ZXh0ID0ge1xuXHRcdFx0XHRoaXN0b3J5LFxuXHRcdFx0XHRjaGF0U2Vzc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdldCB5aWVsZFJlcXVlc3RlZCgpIHsgcmV0dXJuIGluRmxpZ2h0UmVxdWVzdD8ueWllbGRSZXF1ZXN0ZWQgPz8gZmFsc2U7IH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCB0YXNrID0gYWdlbnQuaW52b2tlKFxuXHRcdFx0XHRleHRSZXF1ZXN0LFxuXHRcdFx0XHRjaGF0Q29udGV4dCxcblx0XHRcdFx0c3RyZWFtLmFwaU9iamVjdCxcblx0XHRcdFx0dG9rZW5cblx0XHRcdCk7XG5cblx0XHRcdHJldHVybiBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uV2l0aFRpbWVvdXQoMTAwMCwgUHJvbWlzZS5yZXNvbHZlKHRhc2spLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzdWx0Py5tZXRhZGF0YSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeShyZXN1bHQubWV0YWRhdGEpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbXNnID0gYHJlc3VsdC5tZXRhZGF0YSBNVVNUIGJlIEpTT04uc3RyaW5naWZ5LWFibGUuIEdvdCBlcnJvcjogJHtlcnIubWVzc2FnZX1gO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7YWdlbnQuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBbQCR7YWdlbnQuaWR9XSAke21zZ31gLCBhZ2VudC5leHRlbnNpb24pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6IG1zZyB9LCB0aW1pbmdzOiBzdHJlYW0/LnRpbWluZ3MsIG5leHRRdWVzdGlvbjogcmVzdWx0Lm5leHRRdWVzdGlvbiwgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IGVycm9yRGV0YWlsczogSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHJlc3VsdD8uZXJyb3JEZXRhaWxzKSB7XG5cdFx0XHRcdFx0ZXJyb3JEZXRhaWxzID0ge1xuXHRcdFx0XHRcdFx0Li4ucmVzdWx0LmVycm9yRGV0YWlscyxcblx0XHRcdFx0XHRcdHJlc3BvbnNlSXNJbmNvbXBsZXRlOiB0cnVlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzUmVkYWN0ZWQgfHwgZXJyb3JEZXRhaWxzPy5pc1F1b3RhRXhjZWVkZWQgfHwgZXJyb3JEZXRhaWxzPy5pc1JhdGVMaW1pdGVkIHx8IGVycm9yRGV0YWlscz8uaXNFeHBlY3RlZEVycm9yIHx8IGVycm9yRGV0YWlscz8uY29uZmlybWF0aW9uQnV0dG9ucyB8fCBlcnJvckRldGFpbHM/LmNvZGUpIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChhZ2VudC5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyBlcnJvckRldGFpbHMsIHRpbWluZ3M6IHN0cmVhbT8udGltaW5ncywgbWV0YWRhdGE6IHJlc3VsdD8ubWV0YWRhdGEsIG5leHRRdWVzdGlvbjogcmVzdWx0Py5uZXh0UXVlc3Rpb24sIGRldGFpbHM6IHJlc3VsdD8uZGV0YWlscyB9IHNhdGlzZmllcyBJQ2hhdEFnZW50UmVzdWx0O1xuXHRcdFx0fSksIHRva2VuKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGUsIGFnZW50LmV4dGVuc2lvbik7XG5cblx0XHRcdGlmIChlIGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxFcnJvciAmJiBlLmNhdXNlKSB7XG5cdFx0XHRcdGUgPSBlLmNhdXNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc1F1b3RhRXhjZWVkZWQgPSBlIGluc3RhbmNlb2YgRXJyb3IgJiYgZS5uYW1lID09PSAnQ2hhdFF1b3RhRXhjZWVkZWQnO1xuXHRcdFx0Y29uc3QgaXNSYXRlTGltaXRlZCA9IGUgaW5zdGFuY2VvZiBFcnJvciAmJiBlLm5hbWUgPT09ICdDaGF0UmF0ZUxpbWl0ZWQnO1xuXHRcdFx0Y29uc3QgaXNFeHBlY3RlZEVycm9yID0gZSBpbnN0YW5jZW9mIEVycm9yICYmIGUubmFtZSA9PT0gJ0NoYXRFeHBlY3RlZEVycm9yJztcblx0XHRcdGNvbnN0IHsgY2FsbHN0YWNrOiBlcnJvckNhbGxzdGFjayB9ID0gcGFja0Vycm9yRm9yVGVsZW1ldHJ5KGUpO1xuXHRcdFx0Y29uc3QgZXJyb3JOYW1lID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5uYW1lIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHsgZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6IHRvRXJyb3JNZXNzYWdlKGUpLCByZXNwb25zZUlzSW5jb21wbGV0ZTogdHJ1ZSwgaXNRdW90YUV4Y2VlZGVkLCBpc1JhdGVMaW1pdGVkLCBpc0V4cGVjdGVkRXJyb3IgfSwgZXJyb3JDYWxsc3RhY2ssIGVycm9yTmFtZSB9O1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChpbkZsaWdodFJlcXVlc3QpIHtcblx0XHRcdFx0dGhpcy5faW5GbGlnaHRSZXF1ZXN0cy5kZWxldGUoaW5GbGlnaHRSZXF1ZXN0KTtcblx0XHRcdH1cblx0XHRcdC8vIENsZWFuIHVwIGFueSBwZW5kaW5nIGNhcm91c2VsIHJlc29sdmVycyBmb3IgdGhpcyByZXF1ZXN0XG5cdFx0XHRjb25zdCBwZW5kaW5nUmVzb2x2ZXJzID0gdGhpcy5fcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzLmdldChyZXF1ZXN0RHRvLnJlcXVlc3RJZCk7XG5cdFx0XHRpZiAocGVuZGluZ1Jlc29sdmVycykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRlZmVycmVkIG9mIHBlbmRpbmdSZXNvbHZlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRkZWZlcnJlZC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDYXJvdXNlbFJlc29sdmVycy5kZWxldGUocmVxdWVzdER0by5yZXF1ZXN0SWQpO1xuXHRcdFx0fVxuXHRcdFx0c3RyZWFtPy5jbG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0RGlhZ25vc3RpY3NXaGVuRW5hYmxlZChleHRlbnNpb246IFJlYWRvbmx5PElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24+KSB7XG5cdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UmVmZXJlbmNlRGlhZ25vc3RpYycpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kaWFnbm9zdGljcy5nZXREaWFnbm9zdGljcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRUb29sc0ZvclJlcXVlc3QoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRvb2xzOiBVc2VyU2VsZWN0ZWRUb29scyB8IHVuZGVmaW5lZCwgbW9kZWxJZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1hcDx2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbiwgYm9vbGVhbj4+IHtcblx0XHRpZiAoIXRvb2xzKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcCgpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEluZm9ybWF0aW9uLCBib29sZWFuPigpO1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0aGlzLl90b29scy5nZXRUb29scyhleHRlbnNpb24pKSB7XG5cdFx0XHRpZiAodHlwZW9mIHRvb2xzW3Rvb2wubmFtZV0gPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRyZXN1bHQuc2V0KHRvb2wsIHRvb2xzW3Rvb2wubmFtZV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcmVwYXJlSGlzdG9yeVR1cm5zKGV4dGVuc2lvbjogUmVhZG9ubHk8SVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbj4sIGFnZW50SWQ6IHN0cmluZywgY29udGV4dDogeyBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5RHRvW10gfSk6IFByb21pc2U8KHZzY29kZS5DaGF0UmVxdWVzdFR1cm4gfCB2c2NvZGUuQ2hhdFJlc3BvbnNlVHVybilbXT4ge1xuXHRcdGNvbnN0IHJlczogKHZzY29kZS5DaGF0UmVxdWVzdFR1cm4gfCB2c2NvZGUuQ2hhdFJlc3BvbnNlVHVybilbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBoIG9mIGNvbnRleHQuaGlzdG9yeSkge1xuXHRcdFx0Y29uc3QgZWhSZXN1bHQgPSB0eXBlQ29udmVydC5DaGF0QWdlbnRSZXN1bHQudG8oaC5yZXN1bHQpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuQ2hhdFJlc3VsdCA9IGFnZW50SWQgPT09IGgucmVxdWVzdC5hZ2VudElkIHx8IChpc0J1aWx0aW5QYXJ0aWNpcGFudChoLnJlcXVlc3QuYWdlbnRJZCkgJiYgaXNCdWlsdGluUGFydGljaXBhbnQoYWdlbnRJZCkpID9cblx0XHRcdFx0ZWhSZXN1bHQgOlxuXHRcdFx0XHR7IC4uLmVoUmVzdWx0LCBtZXRhZGF0YTogdW5kZWZpbmVkIH07XG5cblx0XHRcdC8vIFJFUVVFU1QgdHVyblxuXHRcdFx0Y29uc3QgdmFyc1dpdGhvdXRUb29sczogdnNjb2RlLkNoYXRQcm9tcHRSZWZlcmVuY2VbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdG9vbFJlZmVyZW5jZXM6IHZzY29kZS5DaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2VbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB2IG9mIGgucmVxdWVzdC52YXJpYWJsZXMudmFyaWFibGVzKSB7XG5cdFx0XHRcdGlmICh2LmtpbmQgPT09ICd0b29sJykge1xuXHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzLnB1c2godHlwZUNvbnZlcnQuQ2hhdExhbmd1YWdlTW9kZWxUb29sUmVmZXJlbmNlLnRvKHYpKTtcblx0XHRcdFx0fSBlbHNlIGlmICh2LmtpbmQgPT09ICd0b29sc2V0Jykge1xuXHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzLnB1c2goLi4udi52YWx1ZS5tYXAodHlwZUNvbnZlcnQuQ2hhdExhbmd1YWdlTW9kZWxUb29sUmVmZXJlbmNlLnRvKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFyc1dpdGhvdXRUb29scy5wdXNoKC4uLnR5cGVDb252ZXJ0LkNoYXRQcm9tcHRSZWZlcmVuY2UudG9SZWZlcmVuY2VzKHYsIHRoaXMuZ2V0RGlhZ25vc3RpY3NXaGVuRW5hYmxlZChleHRlbnNpb24pLCB0aGlzLl9sb2dTZXJ2aWNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdGVkRmlsZUV2ZW50cyA9IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSA/IGgucmVxdWVzdC5lZGl0ZWRGaWxlRXZlbnRzIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbW9kZUluc3RydWN0aW9uczIgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykgJiYgaC5yZXF1ZXN0Lm1vZGVJbnN0cnVjdGlvbnMgPyB0eXBlQ29udmVydC5DaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMudG8oaC5yZXF1ZXN0Lm1vZGVJbnN0cnVjdGlvbnMpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgdHVybiA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlcXVlc3RUdXJuKGgucmVxdWVzdC5tZXNzYWdlLCBoLnJlcXVlc3QuY29tbWFuZCwgdmFyc1dpdGhvdXRUb29scywgaC5yZXF1ZXN0LmFnZW50SWQsIHRvb2xSZWZlcmVuY2VzLCBlZGl0ZWRGaWxlRXZlbnRzLCBoLnJlcXVlc3QucmVxdWVzdElkLCB1bmRlZmluZWQsIG1vZGVJbnN0cnVjdGlvbnMyKTtcblx0XHRcdHJlcy5wdXNoKHR1cm4pO1xuXG5cdFx0XHQvLyBSRVNQT05TRSB0dXJuXG5cdFx0XHRjb25zdCBwYXJ0cyA9IGNvYWxlc2NlKGgucmVzcG9uc2UubWFwKHIgPT4gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlUGFydC50b0NvbnRlbnQociwgdGhpcy5fY29tbWFuZHMuY29udmVydGVyKSkpO1xuXHRcdFx0cmVzLnB1c2gobmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUdXJuKHBhcnRzLCByZXN1bHQsIGgucmVxdWVzdC5hZ2VudElkLCBoLnJlcXVlc3QuY29tbWFuZCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHQkcmVsZWFzZVNlc3Npb24oc2Vzc2lvblJlc291cmNlRHRvOiBVcmlDb21wb25lbnRzKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2VEdG8pO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fb25EaWREaXNwb3NlQ2hhdFNlc3Npb24uZmlyZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdCRhY2NlcHRBY3RpdmVDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2VEdG86IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2VEdG8gPyBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZUR0bykgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKSA9PT0gc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlRm9sbG93dXBzKHJlcXVlc3REdG86IER0bzxJQ2hhdEFnZW50UmVxdWVzdD4sIGhhbmRsZTogbnVtYmVyLCByZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQsIGNvbnRleHQ6IHsgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeUR0b1tdIH0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRGb2xsb3d1cFtdPiB7XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHJldml2ZTxJQ2hhdEFnZW50UmVxdWVzdD4ocmVxdWVzdER0byk7XG5cdFx0Y29uc3QgY29udmVydGVkSGlzdG9yeSA9IGF3YWl0IHRoaXMucHJlcGFyZUhpc3RvcnlUdXJucyhhZ2VudC5leHRlbnNpb24sIGFnZW50LmlkLCBjb250ZXh0KTtcblxuXHRcdGNvbnN0IGVoUmVzdWx0ID0gdHlwZUNvbnZlcnQuQ2hhdEFnZW50UmVzdWx0LnRvKHJlc3VsdCk7XG5cdFx0cmV0dXJuIChhd2FpdCBhZ2VudC5wcm92aWRlRm9sbG93dXBzKGVoUmVzdWx0LCB7IGhpc3Rvcnk6IGNvbnZlcnRlZEhpc3RvcnksIHlpZWxkUmVxdWVzdGVkOiBmYWxzZSB9LCB0b2tlbikpXG5cdFx0XHQuZmlsdGVyKGYgPT4ge1xuXHRcdFx0XHQvLyBUaGUgZm9sbG93dXAgbXVzdCByZWZlciB0byBhIHBhcnRpY2lwYW50IHRoYXQgZXhpc3RzIGZyb20gdGhlIHNhbWUgZXh0ZW5zaW9uXG5cdFx0XHRcdGNvbnN0IGlzVmFsaWQgPSAhZi5wYXJ0aWNpcGFudCB8fCBJdGVyYWJsZS5zb21lKFxuXHRcdFx0XHRcdHRoaXMuX2FnZW50cy52YWx1ZXMoKSxcblx0XHRcdFx0XHRhID0+IGEuaWQgPT09IGYucGFydGljaXBhbnQgJiYgRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoYS5leHRlbnNpb24uaWRlbnRpZmllciwgYWdlbnQuZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0aWYgKCFpc1ZhbGlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQCR7YWdlbnQuaWR9XSBDaGF0Rm9sbG93dXAgcmVmZXJzIHRvIGFuIHVua25vd24gcGFydGljaXBhbnQ6ICR7Zi5wYXJ0aWNpcGFudH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaXNWYWxpZDtcblx0XHRcdH0pXG5cdFx0XHQubWFwKGYgPT4gdHlwZUNvbnZlcnQuQ2hhdEZvbGxvd3VwLmZyb20oZiwgcmVxdWVzdCkpO1xuXHR9XG5cblx0JGFjY2VwdEZlZWRiYWNrKGhhbmRsZTogbnVtYmVyLCByZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQsIHZvdGVBY3Rpb246IElDaGF0Vm90ZUFjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fYWdlbnRzLmdldChoYW5kbGUpO1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlaFJlc3VsdCA9IHR5cGVDb252ZXJ0LkNoYXRBZ2VudFJlc3VsdC50byhyZXN1bHQpO1xuXHRcdGxldCBraW5kOiBleHRIb3N0VHlwZXMuQ2hhdFJlc3VsdEZlZWRiYWNrS2luZDtcblx0XHRzd2l0Y2ggKHZvdGVBY3Rpb24uZGlyZWN0aW9uKSB7XG5cdFx0XHRjYXNlIENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uRG93bjpcblx0XHRcdFx0a2luZCA9IGV4dEhvc3RUeXBlcy5DaGF0UmVzdWx0RmVlZGJhY2tLaW5kLlVuaGVscGZ1bDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uVXA6XG5cdFx0XHRcdGtpbmQgPSBleHRIb3N0VHlwZXMuQ2hhdFJlc3VsdEZlZWRiYWNrS2luZC5IZWxwZnVsO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCBmZWVkYmFjazogdnNjb2RlLkNoYXRSZXN1bHRGZWVkYmFjayA9IHtcblx0XHRcdHJlc3VsdDogZWhSZXN1bHQsXG5cdFx0XHRraW5kLFxuXHRcdH07XG5cdFx0YWdlbnQuYWNjZXB0RmVlZGJhY2soT2JqZWN0LmZyZWV6ZShmZWVkYmFjaykpO1xuXHR9XG5cblx0JGhhbmRsZVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIocmVxdWVzdElkOiBzdHJpbmcsIHJlc29sdmVJZDogc3RyaW5nLCBhbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcXVlc3RSZXNvbHZlcnMgPSB0aGlzLl9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFyZXF1ZXN0UmVzb2x2ZXJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmZXJyZWQgPSByZXF1ZXN0UmVzb2x2ZXJzLmdldChyZXNvbHZlSWQpO1xuXHRcdGlmIChkZWZlcnJlZCkge1xuXHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoYW5zd2Vycyk7XG5cdFx0XHRyZXF1ZXN0UmVzb2x2ZXJzLmRlbGV0ZShyZXNvbHZlSWQpO1xuXHRcdH1cblxuXHRcdC8vIENsZWFuIHVwIGlmIG5vIG1vcmUgcmVzb2x2ZXJzIGZvciB0aGlzIHJlcXVlc3Rcblx0XHRpZiAocmVxdWVzdFJlc29sdmVycy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0fVxuXHR9XG5cblx0JGFjY2VwdEFjdGlvbihoYW5kbGU6IG51bWJlciwgcmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0LCBldmVudDogSUNoYXRVc2VyQWN0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX2FnZW50cy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChldmVudC5hY3Rpb24ua2luZCA9PT0gJ3ZvdGUnKSB7XG5cdFx0XHQvLyBoYW5kbGVkIGJ5ICRhY2NlcHRGZWVkYmFja1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVoQWN0aW9uID0gdHlwZUNvbnZlcnQuQ2hhdEFnZW50VXNlckFjdGlvbkV2ZW50LnRvKHJlc3VsdCwgZXZlbnQsIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlcik7XG5cdFx0aWYgKGVoQWN0aW9uKSB7XG5cdFx0XHRhZ2VudC5hY2NlcHRBY3Rpb24oT2JqZWN0LmZyZWV6ZShlaEFjdGlvbikpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRpbnZva2VDb21wbGV0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRBZ2VudENvbXBsZXRpb25JdGVtW10+IHtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX2FnZW50cy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0bGV0IGRpc3Bvc2FibGVzID0gdGhpcy5fY29tcGxldGlvbkRpc3Bvc2FibGVzLmdldChoYW5kbGUpO1xuXHRcdGlmIChkaXNwb3NhYmxlcykge1xuXHRcdFx0Ly8gQ2xlYXIgYW55IGRpc3Bvc2FibGVzIGZyb20gdGhlIGxhc3QgaW52b2NhdGlvbiBvZiB0aGlzIGNvbXBsZXRpb24gcHJvdmlkZXJcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dGhpcy5fY29tcGxldGlvbkRpc3Bvc2FibGVzLnNldChoYW5kbGUsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGFnZW50Lmludm9rZUNvbXBsZXRpb25Qcm92aWRlcihxdWVyeSwgdG9rZW4pO1xuXG5cdFx0cmV0dXJuIGl0ZW1zLm1hcCgoaSkgPT4gdHlwZUNvbnZlcnQuQ2hhdEFnZW50Q29tcGxldGlvbkl0ZW0uZnJvbShpLCB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIsIGRpc3Bvc2FibGVzKSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUNoYXRUaXRsZShoYW5kbGU6IG51bWJlciwgY29udGV4dDogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeUR0b1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fYWdlbnRzLmdldChoYW5kbGUpO1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoaXN0b3J5ID0gYXdhaXQgdGhpcy5wcmVwYXJlSGlzdG9yeVR1cm5zKGFnZW50LmV4dGVuc2lvbiwgYWdlbnQuaWQsIHsgaGlzdG9yeTogY29udGV4dCB9KTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBjb250ZXh0WzBdPy5yZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSA/IFVSSS5yZXZpdmUoY29udGV4dFswXS5yZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIGF3YWl0IGFnZW50LnByb3ZpZGVUaXRsZSh7IGhpc3RvcnksIHNlc3Npb25SZXNvdXJjZSwgeWllbGRSZXF1ZXN0ZWQ6IGZhbHNlIH0sIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlQ2hhdFN1bW1hcnkoaGFuZGxlOiBudW1iZXIsIGNvbnRleHQ6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlEdG9bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX2FnZW50cy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeSA9IGF3YWl0IHRoaXMucHJlcGFyZUhpc3RvcnlUdXJucyhhZ2VudC5leHRlbnNpb24sIGFnZW50LmlkLCB7IGhpc3Rvcnk6IGNvbnRleHQgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gY29udGV4dFswXT8ucmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UgPyBVUkkucmV2aXZlKGNvbnRleHRbMF0ucmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBhd2FpdCBhZ2VudC5wcm92aWRlU3VtbWFyeSh7IGhpc3RvcnksIHNlc3Npb25SZXNvdXJjZSwgeWllbGRSZXF1ZXN0ZWQ6IGZhbHNlIH0sIHRva2VuKTtcblx0fVxufVxuXG5jbGFzcyBFeHRIb3N0UGFydGljaXBhbnREZXRlY3RvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZXI6IHZzY29kZS5DaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcixcblx0KSB7IH1cbn1cblxuY2xhc3MgRXh0SG9zdENoYXRBZ2VudCB7XG5cblx0cHJpdmF0ZSBfZm9sbG93dXBQcm92aWRlcjogdnNjb2RlLkNoYXRGb2xsb3d1cFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pY29uUGF0aDogdnNjb2RlLlVyaSB8IHsgbGlnaHQ6IHZzY29kZS5Vcmk7IGRhcms6IHZzY29kZS5VcmkgfSB8IHZzY29kZS5UaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hlbHBUZXh0UHJlZml4OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hlbHBUZXh0UG9zdGZpeDogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vbkRpZFJlY2VpdmVGZWVkYmFjayA9IG5ldyBFbWl0dGVyPHZzY29kZS5DaGF0UmVzdWx0RmVlZGJhY2s+KCk7XG5cdHByaXZhdGUgX29uRGlkUGVyZm9ybUFjdGlvbiA9IG5ldyBFbWl0dGVyPHZzY29kZS5DaGF0VXNlckFjdGlvbkV2ZW50PigpO1xuXHRwcml2YXRlIF9zdXBwb3J0SXNzdWVSZXBvcnRpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FnZW50VmFyaWFibGVQcm92aWRlcj86IHsgcHJvdmlkZXI6IHZzY29kZS5DaGF0UGFydGljaXBhbnRDb21wbGV0aW9uSXRlbVByb3ZpZGVyOyB0cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10gfTtcblx0cHJpdmF0ZSBfYWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90aXRsZVByb3ZpZGVyPzogdnNjb2RlLkNoYXRUaXRsZVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdW1tYXJpemVyPzogdnNjb2RlLkNoYXRTdW1tYXJpemVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wYXVzZVN0YXRlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZzY29kZS5DaGF0UGFydGljaXBhbnRQYXVzZVN0YXRlRXZlbnQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkQ2hhdEFnZW50c1NoYXBlMixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIF9yZXF1ZXN0SGFuZGxlcjogdnNjb2RlLkNoYXRFeHRlbmRlZFJlcXVlc3RIYW5kbGVyLFxuXHQpIHsgfVxuXG5cdGFjY2VwdEZlZWRiYWNrKGZlZWRiYWNrOiB2c2NvZGUuQ2hhdFJlc3VsdEZlZWRiYWNrKSB7XG5cdFx0dGhpcy5fb25EaWRSZWNlaXZlRmVlZGJhY2suZmlyZShmZWVkYmFjayk7XG5cdH1cblxuXHRhY2NlcHRBY3Rpb24oZXZlbnQ6IHZzY29kZS5DaGF0VXNlckFjdGlvbkV2ZW50KSB7XG5cdFx0dGhpcy5fb25EaWRQZXJmb3JtQWN0aW9uLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0c2V0Q2hhdFJlcXVlc3RQYXVzZVN0YXRlKHBhdXNlU3RhdGU6IHZzY29kZS5DaGF0UGFydGljaXBhbnRQYXVzZVN0YXRlRXZlbnQpIHtcblx0XHR0aGlzLl9wYXVzZVN0YXRlRW1pdHRlci5maXJlKHBhdXNlU3RhdGUpO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlQ29tcGxldGlvblByb3ZpZGVyKHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLkNoYXRDb21wbGV0aW9uSXRlbVtdPiB7XG5cdFx0aWYgKCF0aGlzLl9hZ2VudFZhcmlhYmxlUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fYWdlbnRWYXJpYWJsZVByb3ZpZGVyLnByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMocXVlcnksIHRva2VuKSA/PyBbXTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVGb2xsb3d1cHMocmVzdWx0OiB2c2NvZGUuQ2hhdFJlc3VsdCwgY29udGV4dDogdnNjb2RlLkNoYXRDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5DaGF0Rm9sbG93dXBbXT4ge1xuXHRcdGlmICghdGhpcy5fZm9sbG93dXBQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGxvd3VwcyA9IGF3YWl0IHRoaXMuX2ZvbGxvd3VwUHJvdmlkZXIucHJvdmlkZUZvbGxvd3VwcyhyZXN1bHQsIGNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAoIWZvbGxvd3Vwcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9sbG93dXBzXG5cdFx0XHQvLyBGaWx0ZXIgb3V0IFwiY29tbWFuZCBmb2xsb3d1cHNcIiBmcm9tIG9sZGVyIHByb3ZpZGVyc1xuXHRcdFx0LmZpbHRlcihmID0+ICEoZiAmJiAnY29tbWFuZElkJyBpbiBmKSlcblx0XHRcdC8vIEZpbHRlciBvdXQgZm9sbG93dXBzIGZyb20gb2xkZXIgcHJvdmlkZXJzIGJlZm9yZSAnbWVzc2FnZScgY2hhbmdlZCB0byAncHJvbXB0J1xuXHRcdFx0LmZpbHRlcihmID0+ICEoZiAmJiAnbWVzc2FnZScgaW4gZikpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZVRpdGxlKGNvbnRleHQ6IHZzY29kZS5DaGF0Q29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3RpdGxlUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fdGl0bGVQcm92aWRlci5wcm92aWRlQ2hhdFRpdGxlKGNvbnRleHQsIHRva2VuKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlU3VtbWFyeShjb250ZXh0OiB2c2NvZGUuQ2hhdENvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9zdW1tYXJpemVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3N1bW1hcml6ZXIucHJvdmlkZUNoYXRTdW1tYXJ5KGNvbnRleHQsIHRva2VuKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgYXBpQWdlbnQoKTogdnNjb2RlLkNoYXRQYXJ0aWNpcGFudCB7XG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0bGV0IHVwZGF0ZVNjaGVkdWxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHVwZGF0ZU1ldGFkYXRhU29vbiA9ICgpID0+IHtcblx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodXBkYXRlU2NoZWR1bGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZVNjaGVkdWxlZCA9IHRydWU7XG5cdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiR1cGRhdGVBZ2VudCh0aGlzLl9oYW5kbGUsIHtcblx0XHRcdFx0XHRpY29uOiAhdGhpcy5faWNvblBhdGggPyB1bmRlZmluZWQgOlxuXHRcdFx0XHRcdFx0dGhpcy5faWNvblBhdGggaW5zdGFuY2VvZiBVUkkgPyB0aGlzLl9pY29uUGF0aCA6XG5cdFx0XHRcdFx0XHRcdCdsaWdodCcgaW4gdGhpcy5faWNvblBhdGggPyB0aGlzLl9pY29uUGF0aC5saWdodCA6XG5cdFx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdGljb25EYXJrOiAhdGhpcy5faWNvblBhdGggPyB1bmRlZmluZWQgOlxuXHRcdFx0XHRcdFx0J2RhcmsnIGluIHRoaXMuX2ljb25QYXRoID8gdGhpcy5faWNvblBhdGguZGFyayA6XG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0aGVtZUljb246IHRoaXMuX2ljb25QYXRoIGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLlRoZW1lSWNvbiA/IHRoaXMuX2ljb25QYXRoIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhhc0ZvbGxvd3VwczogdGhpcy5fZm9sbG93dXBQcm92aWRlciAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhlbHBUZXh0UHJlZml4OiAoIXRoaXMuX2hlbHBUZXh0UHJlZml4IHx8IHR5cGVvZiB0aGlzLl9oZWxwVGV4dFByZWZpeCA9PT0gJ3N0cmluZycpID8gdGhpcy5faGVscFRleHRQcmVmaXggOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tKHRoaXMuX2hlbHBUZXh0UHJlZml4KSxcblx0XHRcdFx0XHRoZWxwVGV4dFBvc3RmaXg6ICghdGhpcy5faGVscFRleHRQb3N0Zml4IHx8IHR5cGVvZiB0aGlzLl9oZWxwVGV4dFBvc3RmaXggPT09ICdzdHJpbmcnKSA/IHRoaXMuX2hlbHBUZXh0UG9zdGZpeCA6IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb20odGhpcy5faGVscFRleHRQb3N0Zml4KSxcblx0XHRcdFx0XHRzdXBwb3J0SXNzdWVSZXBvcnRpbmc6IHRoaXMuX3N1cHBvcnRJc3N1ZVJlcG9ydGluZyxcblx0XHRcdFx0XHRhZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2U6ICghdGhpcy5fYWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlIHx8IHR5cGVvZiB0aGlzLl9hZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2UgPT09ICdzdHJpbmcnKSA/IHRoaXMuX2FkZGl0aW9uYWxXZWxjb21lTWVzc2FnZSA6IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb20odGhpcy5fYWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHVwZGF0ZVNjaGVkdWxlZCA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgaWQoKSB7XG5cdFx0XHRcdHJldHVybiB0aGF0LmlkO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpY29uUGF0aCgpIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2ljb25QYXRoO1xuXHRcdFx0fSxcblx0XHRcdHNldCBpY29uUGF0aCh2KSB7XG5cdFx0XHRcdHRoYXQuX2ljb25QYXRoID0gdjtcblx0XHRcdFx0dXBkYXRlTWV0YWRhdGFTb29uKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHJlcXVlc3RIYW5kbGVyKCkge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fcmVxdWVzdEhhbmRsZXI7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHJlcXVlc3RIYW5kbGVyKHYpIHtcblx0XHRcdFx0YXNzZXJ0VHlwZSh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJywgJ0ludmFsaWQgcmVxdWVzdCBoYW5kbGVyJyk7XG5cdFx0XHRcdHRoYXQuX3JlcXVlc3RIYW5kbGVyID0gdjtcblx0XHRcdH0sXG5cdFx0XHRnZXQgZm9sbG93dXBQcm92aWRlcigpIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2ZvbGxvd3VwUHJvdmlkZXI7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGZvbGxvd3VwUHJvdmlkZXIodikge1xuXHRcdFx0XHR0aGF0Ll9mb2xsb3d1cFByb3ZpZGVyID0gdjtcblx0XHRcdFx0dXBkYXRlTWV0YWRhdGFTb29uKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGhlbHBUZXh0UHJlZml4KCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2hlbHBUZXh0UHJlZml4O1xuXHRcdFx0fSxcblx0XHRcdHNldCBoZWxwVGV4dFByZWZpeCh2KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuZXh0ZW5zaW9uLCAnZGVmYXVsdENoYXRQYXJ0aWNpcGFudCcpO1xuXHRcdFx0XHR0aGF0Ll9oZWxwVGV4dFByZWZpeCA9IHY7XG5cdFx0XHRcdHVwZGF0ZU1ldGFkYXRhU29vbigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBoZWxwVGV4dFBvc3RmaXgoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuZXh0ZW5zaW9uLCAnZGVmYXVsdENoYXRQYXJ0aWNpcGFudCcpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5faGVscFRleHRQb3N0Zml4O1xuXHRcdFx0fSxcblx0XHRcdHNldCBoZWxwVGV4dFBvc3RmaXgodikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0dGhhdC5faGVscFRleHRQb3N0Zml4ID0gdjtcblx0XHRcdFx0dXBkYXRlTWV0YWRhdGFTb29uKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHN1cHBvcnRJc3N1ZVJlcG9ydGluZygpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9zdXBwb3J0SXNzdWVSZXBvcnRpbmc7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHN1cHBvcnRJc3N1ZVJlcG9ydGluZyh2KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHR0aGF0Ll9zdXBwb3J0SXNzdWVSZXBvcnRpbmcgPSB2O1xuXHRcdFx0XHR1cGRhdGVNZXRhZGF0YVNvb24oKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRSZWNlaXZlRmVlZGJhY2soKSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9vbkRpZFJlY2VpdmVGZWVkYmFjay5ldmVudDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgcGFydGljaXBhbnRWYXJpYWJsZVByb3ZpZGVyKHYpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0dGhhdC5fYWdlbnRWYXJpYWJsZVByb3ZpZGVyID0gdjtcblx0XHRcdFx0aWYgKHYpIHtcblx0XHRcdFx0XHRpZiAoIXYudHJpZ2dlckNoYXJhY3RlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3RyaWdnZXJDaGFyYWN0ZXJzIGFyZSByZXF1aXJlZCcpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoYXQuX3Byb3h5LiRyZWdpc3RlckFnZW50Q29tcGxldGlvbnNQcm92aWRlcih0aGF0Ll9oYW5kbGUsIHRoYXQuaWQsIHYudHJpZ2dlckNoYXJhY3RlcnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoYXQuX3Byb3h5LiR1bnJlZ2lzdGVyQWdlbnRDb21wbGV0aW9uc1Byb3ZpZGVyKHRoYXQuX2hhbmRsZSwgdGhhdC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXQgcGFydGljaXBhbnRWYXJpYWJsZVByb3ZpZGVyKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fYWdlbnRWYXJpYWJsZVByb3ZpZGVyO1xuXHRcdFx0fSxcblx0XHRcdHNldCBhZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2Uodikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0dGhhdC5fYWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlID0gdjtcblx0XHRcdFx0dXBkYXRlTWV0YWRhdGFTb29uKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFkZGl0aW9uYWxXZWxjb21lTWVzc2FnZSgpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50Jyk7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9hZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2U7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHRpdGxlUHJvdmlkZXIodikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0dGhhdC5fdGl0bGVQcm92aWRlciA9IHY7XG5cdFx0XHRcdHVwZGF0ZU1ldGFkYXRhU29vbigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0aXRsZVByb3ZpZGVyKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3RpdGxlUHJvdmlkZXI7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHN1bW1hcml6ZXIodikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0dGhhdC5fc3VtbWFyaXplciA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHN1bW1hcml6ZXIoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuZXh0ZW5zaW9uLCAnZGVmYXVsdENoYXRQYXJ0aWNpcGFudCcpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fc3VtbWFyaXplcjtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VQYXVzZVN0YXRlKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fcGF1c2VTdGF0ZUVtaXR0ZXIuZXZlbnQ7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRQZXJmb3JtQWN0aW9uOiAhaXNQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKVxuXHRcdFx0XHQ/IHVuZGVmaW5lZCFcblx0XHRcdFx0OiB0aGlzLl9vbkRpZFBlcmZvcm1BY3Rpb24uZXZlbnRcblx0XHRcdCxcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhhdC5fZm9sbG93dXBQcm92aWRlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhhdC5fb25EaWRSZWNlaXZlRmVlZGJhY2suZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGF0Ll9vbkRpZFBlcmZvcm1BY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGF0Ll9wYXVzZVN0YXRlRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoYXQuX3Byb3h5LiR1bnJlZ2lzdGVyQWdlbnQodGhhdC5faGFuZGxlKTtcblx0XHRcdH0sXG5cdFx0fSBzYXRpc2ZpZXMgdnNjb2RlLkNoYXRQYXJ0aWNpcGFudDtcblx0fVxuXG5cdGludm9rZShyZXF1ZXN0OiB2c2NvZGUuQ2hhdFJlcXVlc3QsIGNvbnRleHQ6IHZzY29kZS5DaGF0Q29udGV4dCwgcmVzcG9uc2U6IHZzY29kZS5DaGF0UmVzcG9uc2VTdHJlYW0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuQ2hhdFJlc3VsdCB8IHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdEhhbmRsZXIocmVxdWVzdCwgY29udGV4dCwgcmVzcG9uc2UsIHRva2VuKTtcblx0fVxufVxuXG4vKipcbiAqIHJhY2VDYW5jZWxsYXRpb24sIGJ1dCBnaXZlIHRoZSBwcm9taXNlIGEgbGl0dGxlIHRpbWUgdG8gY29tcGxldGUgdG8gc2VlIGlmIHdlIGNhbiBnZXQgYSByZWFsIHJlc3VsdCBxdWlja2x5LlxuICovXG5mdW5jdGlvbiByYWNlQ2FuY2VsbGF0aW9uV2l0aFRpbWVvdXQ8VD4oY2FuY2VsV2FpdDogbnVtYmVyLCBwcm9taXNlOiBQcm9taXNlPFQ+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCByZWYgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChhc3luYyAoKSA9PiB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgdGltZW91dChjYW5jZWxXYWl0KTtcblx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHRwcm9taXNlLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KS5maW5hbGx5KCgpID0+IHJlZi5kaXNwb3NlKCkpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBMYXppbHkgY29tcHV0ZXMgYW5kIGNhY2hlcyBhIHByb21pc2UgcmVzdWx0IHVudGlsIGV4cGxpY2l0bHkgY2xlYXJlZC5cbiAqIEZhaWxlZCBjb21wdXRhdGlvbnMgYXJlIG5vdCByZXRhaW5lZCBzbyBsYXRlciBjYWxsZXJzIGNhbiByZXRyeS5cbiAqL1xuY2xhc3MgQ2FjaGVkUHJvbWlzZTxUPiB7XG5cblx0cHJpdmF0ZSBjYWNoZWRQcm9taXNlOiBQcm9taXNlPHJlYWRvbmx5IFRbXT4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBjb21wdXRlRm46ICgpID0+IFByb21pc2U8cmVhZG9ubHkgVFtdPikgeyB9XG5cblx0Z2V0KHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgVFtdPiB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlZFByb21pc2UpIHtcblx0XHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLmNvbXB1dGVGbigpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlZFByb21pc2UgPT09IHByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLmNhY2hlZFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNhY2hlZFByb21pc2UgPSBwcm9taXNlO1xuXHRcdH1cblxuXHRcdC8vIEVhY2ggY2FsbGVyIG9ic2VydmVzIHRoZSBzaGFyZWQgY29tcHV0YXRpb24gdGhyb3VnaCBpdHMgb3duIHRva2VuIHNvIHRoYXRcblx0XHQvLyBvbmUgY2FsbGVyIGNhbmNlbGxpbmcgZG9lcyBub3QgYWZmZWN0IGNvbmN1cnJlbnQgY2FsbGVycy5cblx0XHRyZXR1cm4gcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuY2FjaGVkUHJvbWlzZSwgdG9rZW4pO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzQnVpbHRpblBhcnRpY2lwYW50KGFnZW50SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYWdlbnRJZC5zdGFydHNXaXRoKCdnaXRodWIuY29waWxvdCcpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFB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
