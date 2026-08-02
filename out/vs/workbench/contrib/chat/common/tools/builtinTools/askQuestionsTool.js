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
import { CancellationError } from "../../../../../../base/common/errors.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { IChatService, IChatToolInvocation } from "../../chatService/chatService.js";
import { ChatQuestionCarouselData } from "../../model/chatProgressTypes/chatQuestionCarouselData.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../constants.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ToolDataSource } from "../languageModelToolsService.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { raceCancellation } from "../../../../../../base/common/async.js";
import { TerminalToolId } from "../terminalToolIds.js";
const AUTOPILOT_ASK_USER_RESPONSE = "The user is not available to respond and will review your work later. Work autonomously and make good decisions.";
const AskQuestionsToolId = "vscode_askQuestions";
const SoftLimits = {
  header: 50,
  question: 200
};
const HardLimits = {
  header: 75
};
function truncateToLimit(value, limit) {
  if (value === void 0) {
    return void 0;
  }
  if (value.length > limit) {
    return value.slice(0, limit - 3) + "...";
  }
  return value;
}
function createAskQuestionsToolData() {
  const questionSchema = {
    type: "object",
    properties: {
      header: {
        type: "string",
        description: `Short identifier for the question. Must be unique so answers can be mapped back to the question. Maximum ${SoftLimits.header} characters.`,
        maxLength: SoftLimits.header
      },
      question: {
        type: "string",
        description: `The question text to display to the user. Keep it concise, ideally one sentence. Maximum ${SoftLimits.question} characters.`,
        maxLength: SoftLimits.question
      },
      multiSelect: {
        type: "boolean",
        description: "Allow selecting multiple options when options are provided."
      },
      allowFreeformInput: {
        type: "boolean",
        description: "Allow freeform text answers in addition to option selection. Defaults to true; set to false to restrict to predefined options only."
      },
      message: {
        type: "string",
        description: "Optional markdown message to display below the question text, providing additional context or details."
      },
      options: {
        type: "array",
        description: "Optional list of selectable answers. If omitted, the question is free text.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Display label and value for the option."
            },
            description: {
              type: "string",
              description: "Optional secondary text shown with the option."
            },
            recommended: {
              type: "boolean",
              description: "Mark this option as the recommended default."
            }
          },
          required: ["label"]
        }
      }
    },
    required: ["header", "question"]
  };
  const inputSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "List of questions to ask the user. Order is preserved.",
        items: questionSchema,
        minItems: 1
      }
    },
    required: ["questions"]
  };
  return {
    id: AskQuestionsToolId,
    toolReferenceName: "askQuestions",
    legacyToolReferenceFullNames: [AskQuestionsToolId, "vscode/askQuestions"],
    canBeReferencedInPrompt: false,
    icon: ThemeIcon.fromId(Codicon.question.id),
    displayName: localize("tool.askQuestions.displayName", "Ask Clarifying Questions"),
    userDescription: localize("tool.askQuestions.userDescription", "Ask structured clarifying questions using single select, multi-select, or freeform inputs to collect task requirements before proceeding."),
    modelDescription: "Use this tool to ask the user a small number of clarifying questions before proceeding. Provide the questions array with concise headers and prompts. Use options for fixed choices, set multiSelect when multiple selections are allowed. Users can always provide a freeform text answer alongside options unless you set allowFreeformInput to false.",
    source: ToolDataSource.Internal,
    inputSchema
  };
}
const AskQuestionsToolData = createAskQuestionsToolData();
let AskQuestionsTool = class extends Disposable {
  constructor(chatService, telemetryService, logService, configService) {
    super();
    this.chatService = chatService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.configService = configService;
  }
  async invoke(invocation, _countTokens, progress, token) {
    const stopWatch = StopWatch.create(true);
    const parameters = invocation.parameters;
    const { questions } = parameters;
    this.logService.trace(`[AskQuestionsTool] Invoking with ${questions?.length ?? 0} question(s)`);
    if (!questions || questions.length === 0) {
      throw new Error(localize("askQuestionsTool.noQuestions", "No questions provided. The questions array must contain at least one question."));
    }
    const chatSessionResource = invocation.context?.sessionResource;
    const chatRequestId = invocation.chatRequestId;
    const { request, sessionResource } = this.getRequest(chatSessionResource, chatRequestId);
    if (!sessionResource || !request) {
      this.logService.warn("[AskQuestionsTool] Missing chat context; marking all questions as skipped.");
      return this.createSkippedResult(questions);
    }
    const resolveId = invocation.chatStreamToolCallId ?? invocation.callId;
    if (request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot || this.configService.getValue(ChatConfiguration.AutoReply)) {
      const reason = request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot ? "Autopilot mode" : "Auto-reply enabled";
      this.logService.info(`[AskQuestionsTool] ${reason}: auto-responding to questions`);
      const { carousel: carousel2, idToHeaderMap: idToHeaderMap2 } = this.toQuestionCarousel(questions, resolveId);
      carousel2.terminalId = this.extractTerminalId(request);
      carousel2.data = this.buildAutopilotCarouselAnswers(questions, carousel2, idToHeaderMap2);
      carousel2.isUsed = true;
      this.chatService.appendProgress(request, carousel2);
      return this.createAutopilotResult(questions);
    }
    const { carousel, idToHeaderMap } = this.toQuestionCarousel(questions, resolveId);
    carousel.terminalId = this.extractTerminalId(request);
    this.logService.trace(`[AskQuestionsTool] request=${request.id} terminalExecutionId=${request.terminalExecutionId ?? "undefined"} carousel.terminalId=${carousel.terminalId ?? "undefined"}`);
    this.chatService.appendProgress(request, carousel);
    const externalAnswerListener = this.chatService.onDidReceiveQuestionCarouselAnswer((event) => {
      if (event.resolveId !== carousel.resolveId || carousel.isUsed) {
        return;
      }
      carousel.dismiss(event.answers);
    });
    let answerResult;
    try {
      answerResult = await raceCancellation(carousel.completion.p, token);
    } catch (error) {
      if (error instanceof CancellationError) {
        carousel.dismiss(void 0);
      }
      throw error;
    } finally {
      externalAnswerListener.dispose();
    }
    if (!answerResult) {
      carousel.dismiss(void 0);
      throw new CancellationError();
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (carousel.dismissedByTerminalInput && carousel.terminalId) {
      this.logService.info(`[AskQuestionsTool] Carousel dismissed because user typed directly in terminal ${carousel.terminalId}`);
      return {
        content: [{
          kind: "text",
          value: `The user is replying to the terminal prompts directly. Do not ask more questions or send input to the terminal. You will be automatically notified when the command in terminal ${carousel.terminalId} completes.`
        }]
      };
    }
    progress.report({ message: localize("askQuestionsTool.progress", "Analyzing your answers...") });
    const converted = this.convertCarouselAnswers(questions, answerResult?.answers, idToHeaderMap);
    const { answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount } = this.collectMetrics(questions, converted);
    this.sendTelemetry(invocation.chatRequestId, questions.length, answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount, stopWatch.elapsed());
    const toolResultJson = JSON.stringify(converted);
    this.logService.trace(`[AskQuestionsTool] Returning tool result with metrics: questions=${questions.length}, answered=${answeredCount}, skipped=${skippedCount}, freeText=${freeTextCount}, recommendedAvailable=${recommendedAvailableCount}, recommendedSelected=${recommendedSelectedCount}`);
    return {
      content: [{ kind: "text", value: toolResultJson }]
    };
  }
  async prepareToolInvocation(context, _token) {
    const parameters = context.parameters;
    const { questions } = parameters;
    if (!questions || questions.length === 0) {
      throw new Error(localize("askQuestionsTool.noQuestions", "No questions provided. The questions array must contain at least one question."));
    }
    for (const question of questions) {
      if (question.options && question.options.length === 1 && !question.allowFreeformInput) {
        throw new Error(localize("askQuestionsTool.invalidOptions", 'Question "{0}" must have at least two options, or set allowFreeformInput when providing a single option, or omit options for free text input.', question.header));
      }
    }
    const questionCount = questions.length;
    const headers = questions.map((q) => q.header).join(", ");
    const message = questionCount === 1 ? localize("askQuestionsTool.invocation.single", "Asking a question ({0})", headers) : localize("askQuestionsTool.invocation.multiple", "Asking {0} questions ({1})", questionCount, headers);
    const pastMessage = questionCount === 1 ? localize("askQuestionsTool.invocation.single.past", "Asked a question ({0})", headers) : localize("askQuestionsTool.invocation.multiple.past", "Asked {0} questions ({1})", questionCount, headers);
    return {
      invocationMessage: new MarkdownString(message),
      pastTenseMessage: new MarkdownString(pastMessage)
    };
  }
  getRequest(chatSessionResource, chatRequestId) {
    if (!chatSessionResource) {
      return { request: void 0, sessionResource: void 0 };
    }
    const model = this.chatService.getSession(chatSessionResource);
    let request;
    if (model) {
      if (chatRequestId) {
        request = model.getRequests().find((r) => r.id === chatRequestId);
      }
      if (!request) {
        request = model.getRequests().at(-1);
      }
    }
    if (!request) {
      return { request: void 0, sessionResource: chatSessionResource };
    }
    return { request, sessionResource: chatSessionResource };
  }
  /**
   * Resolves the terminal execution ID for the request.
   * Prefer structured metadata and fall back to legacy message parsing for
   * old sessions that may not carry the metadata yet.
   * As a final fallback, search completed runInTerminal tool invocations in
   * the response for the terminal ID, but only when the tool output indicates
   * the terminal is still running and waiting for input (foreground/timeout
   * path where the model calls ask_questions from the same turn as
   * runInTerminal).
   */
  extractTerminalId(request) {
    if (request.terminalExecutionId) {
      return request.terminalExecutionId;
    }
    const match = request.message.text.match(/\[Terminal (?<termId>\S+) notification:/);
    if (match?.groups?.termId) {
      return match.groups.termId;
    }
    const response = request.response;
    if (response) {
      const parts = response.response.value;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part.kind === "toolInvocation" && part.toolId === TerminalToolId.RunInTerminal) {
          const state = part.state.get();
          if (state.type === IChatToolInvocation.StateKind.Completed && state.contentForModel) {
            for (const item of state.contentForModel) {
              if (item.kind === "text") {
                const idMatch = item.value.match(/(?:running in terminal ID|may still be running in terminal ID) ([0-9a-fA-F-]+)/);
                if (idMatch) {
                  return idMatch[1];
                }
              }
            }
          }
        }
      }
    }
    return void 0;
  }
  toQuestionCarousel(questions, resolveId) {
    const idToHeaderMap = /* @__PURE__ */ new Map();
    const carouselResolveId = resolveId ?? generateUuid();
    const mappedQuestions = questions.map((question, index) => this.toChatQuestion(question, idToHeaderMap, carouselResolveId, index));
    return {
      carousel: new ChatQuestionCarouselData(mappedQuestions, true, carouselResolveId),
      idToHeaderMap
    };
  }
  toChatQuestion(question, idToHeaderMap, resolveId, index) {
    let type;
    if (!question.options || question.options.length === 0) {
      type = "text";
    } else if (question.multiSelect) {
      type = "multiSelect";
    } else {
      type = "singleSelect";
    }
    let defaultValue;
    if (question.options) {
      const recommendedOptions = question.options.filter((opt) => opt.recommended);
      if (recommendedOptions.length > 0) {
        defaultValue = question.multiSelect ? recommendedOptions.map((opt) => opt.label) : recommendedOptions[0].label;
      }
    }
    const internalId = `${resolveId}:${index}`;
    idToHeaderMap.set(internalId, question.header);
    const displayTitle = truncateToLimit(question.header, HardLimits.header) ?? question.header;
    return {
      id: internalId,
      type,
      title: displayTitle,
      message: question.question,
      detailedMessage: question.message,
      options: question.options?.map((opt) => ({
        id: opt.label,
        label: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
        value: opt.label
      })),
      defaultValue,
      allowFreeformInput: question.allowFreeformInput ?? true
    };
  }
  convertCarouselAnswers(questions, carouselAnswers, idToHeaderMap) {
    const result = { answers: {} };
    if (carouselAnswers) {
      this.logService.trace(`[AskQuestionsTool] Carousel answer keys: ${Object.keys(carouselAnswers).join(", ")}`);
      this.logService.trace(`[AskQuestionsTool] Question headers: ${questions.map((q) => q.header).join(", ")}`);
    }
    const headerToIdMap = /* @__PURE__ */ new Map();
    for (const [internalId, originalHeader] of idToHeaderMap) {
      headerToIdMap.set(originalHeader, internalId);
    }
    for (const question of questions) {
      if (!carouselAnswers) {
        result.answers[question.header] = {
          selected: [],
          freeText: null,
          skipped: true
        };
        continue;
      }
      const internalId = headerToIdMap.get(question.header);
      const answer = internalId ? carouselAnswers[internalId] : void 0;
      this.logService.trace(`[AskQuestionsTool] Processing question "${question.header}" (internal ID: ${internalId}), raw answer: ${JSON.stringify(answer)}, type: ${typeof answer}`);
      if (answer === void 0) {
        result.answers[question.header] = {
          selected: [],
          freeText: null,
          skipped: true
        };
      } else if (typeof answer === "string") {
        if (question.options?.some((opt) => opt.label === answer)) {
          result.answers[question.header] = {
            selected: [answer],
            freeText: null,
            skipped: false
          };
        } else {
          result.answers[question.header] = {
            selected: [],
            freeText: answer,
            skipped: false
          };
        }
      } else if (Array.isArray(answer)) {
        result.answers[question.header] = {
          selected: answer.map((a) => String(a)),
          freeText: null,
          skipped: false
        };
      } else if (typeof answer === "object" && hasKey(answer, { selectedValues: true })) {
        const { selectedValues, freeformValue } = answer;
        result.answers[question.header] = {
          selected: selectedValues,
          freeText: freeformValue ?? null,
          skipped: false
        };
      } else if (typeof answer === "object" && (hasKey(answer, { selectedValue: true }) || hasKey(answer, { freeformValue: true }))) {
        const { selectedValue, freeformValue } = answer;
        if (freeformValue) {
          result.answers[question.header] = {
            selected: [],
            freeText: freeformValue,
            skipped: false
          };
        } else if (selectedValue !== void 0) {
          if (question.options?.some((opt) => opt.label === selectedValue)) {
            result.answers[question.header] = {
              selected: [selectedValue],
              freeText: null,
              skipped: false
            };
          } else {
            result.answers[question.header] = {
              selected: [],
              freeText: selectedValue,
              skipped: false
            };
          }
        } else {
          result.answers[question.header] = {
            selected: [],
            freeText: null,
            skipped: true
          };
        }
      } else {
        this.logService.warn(`[AskQuestionsTool] Unknown answer format for "${question.header}": ${JSON.stringify(answer)}`);
        result.answers[question.header] = {
          selected: [],
          freeText: null,
          skipped: true
        };
      }
    }
    return result;
  }
  collectMetrics(questions, result) {
    const answers = Object.values(result.answers);
    const answeredCount = answers.filter((a) => !a.skipped).length;
    const skippedCount = answers.filter((a) => a.skipped).length;
    const freeTextCount = answers.filter((a) => a.freeText !== null).length;
    const recommendedAvailableCount = questions.filter((q) => q.options?.some((opt) => opt.recommended)).length;
    const recommendedSelectedCount = questions.filter((q) => {
      const answer = result.answers[q.header];
      const recommendedOption = q.options?.find((opt) => opt.recommended);
      return answer && !answer.skipped && recommendedOption && answer.selected.includes(recommendedOption.label);
    }).length;
    return { answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount };
  }
  createSkippedResult(questions) {
    const skippedAnswers = {};
    for (const question of questions) {
      skippedAnswers[question.header] = { selected: [], freeText: null, skipped: true };
    }
    return {
      content: [{ kind: "text", value: JSON.stringify({ answers: skippedAnswers }) }]
    };
  }
  createAutopilotResult(questions) {
    const answers = {};
    for (const question of questions) {
      answers[question.header] = {
        selected: [],
        freeText: AUTOPILOT_ASK_USER_RESPONSE,
        skipped: false
      };
    }
    return {
      content: [{ kind: "text", value: JSON.stringify({ answers }) }]
    };
  }
  /**
   * Build carousel answer data keyed by carousel question IDs for rendering
   * the completed summary in the UI during autopilot mode.
   */
  buildAutopilotCarouselAnswers(questions, carousel, idToHeaderMap) {
    const data = {};
    const headerToIdMap = /* @__PURE__ */ new Map();
    for (const [internalId, originalHeader] of idToHeaderMap) {
      headerToIdMap.set(originalHeader, internalId);
    }
    for (const question of questions) {
      const internalId = headerToIdMap.get(question.header);
      if (!internalId) {
        continue;
      }
      const chatQuestion = carousel.questions.find((q) => q.id === internalId);
      if (!chatQuestion) {
        continue;
      }
      if (chatQuestion.type === "multiSelect") {
        data[internalId] = { selectedValues: [], freeformValue: AUTOPILOT_ASK_USER_RESPONSE };
      } else if (chatQuestion.type === "singleSelect") {
        data[internalId] = { freeformValue: AUTOPILOT_ASK_USER_RESPONSE };
      } else {
        data[internalId] = AUTOPILOT_ASK_USER_RESPONSE;
      }
    }
    return data;
  }
  sendTelemetry(requestId, questionCount, answeredCount, skippedCount, freeTextCount, recommendedAvailableCount, recommendedSelectedCount, duration) {
    this.telemetryService.publicLog2("askQuestionsToolInvoked", {
      requestId,
      questionCount,
      answeredCount,
      skippedCount,
      freeTextCount,
      recommendedAvailableCount,
      recommendedSelectedCount,
      duration
    });
  }
};
AskQuestionsTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IConfigurationService)
], AskQuestionsTool);
export {
  AUTOPILOT_ASK_USER_RESPONSE,
  AskQuestionsTool,
  AskQuestionsToolData,
  AskQuestionsToolId,
  createAskQuestionsToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9hc2tRdWVzdGlvbnNUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFF1ZXN0aW9uLCBJQ2hhdFF1ZXN0aW9uQW5zd2VycywgSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlLCBJQ2hhdE11bHRpU2VsZWN0QW5zd2VyLCBJQ2hhdFNlcnZpY2UsIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyLCBJQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIH0gZnJvbSAnLi4vLi4vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbElkIH0gZnJvbSAnLi4vdGVybWluYWxUb29sSWRzLmpzJztcblxuLyoqXG4gKiBSZXNwb25zZSByZXR1cm5lZCB0byB0aGUgbW9kZWwgd2hlbiB0aGUgdXNlciBpcyBub3QgYXZhaWxhYmxlIChhdXRvcGlsb3QgbW9kZSkuXG4gKi9cbmV4cG9ydCBjb25zdCBBVVRPUElMT1RfQVNLX1VTRVJfUkVTUE9OU0UgPVxuXHQnVGhlIHVzZXIgaXMgbm90IGF2YWlsYWJsZSB0byByZXNwb25kIGFuZCB3aWxsIHJldmlldyB5b3VyIHdvcmsgbGF0ZXIuIFdvcmsgYXV0b25vbW91c2x5IGFuZCBtYWtlIGdvb2QgZGVjaXNpb25zLic7XG5cbi8vIFVzZSBhIGRpc3RpbmN0IGlkIHRvIGF2b2lkIGNsYXNoaW5nIHdpdGggZXh0ZW5zaW9uLXByb3ZpZGVkIHRvb2xzXG5leHBvcnQgY29uc3QgQXNrUXVlc3Rpb25zVG9vbElkID0gJ3ZzY29kZV9hc2tRdWVzdGlvbnMnO1xuXG4vLyBTb2Z0IGxpbWl0cyBhcmUgdXNlZCBpbiB0aGUgc2NoZW1hIHRvIGd1aWRlIHRoZSBtb2RlbFxuLy8gSGFyZCBsaW1pdHMgYXJlIG1vcmUgbGVuaWVudCBhbmQgdXNlZCB0byB0cnVuY2F0ZSBpZiB0aGUgbW9kZWwgb3ZlcnNob290c1xuLy9cbi8vIEV4YW1wbGUgdGV4dCBhdCBlYWNoIGxpbWl0OlxuLy8gLSBoZWFkZXIgc29mdCAoNTAgY2hhcnMpOiAgICAgICAgXCJXaGljaCBkYXRhYmFzZSBlbmdpbmUgZG8geW91IHdhbnQgdG8gdXNlIGZvciB0aGlzP1wiXG4vLyAtIGhlYWRlciBoYXJkICg3NSBjaGFycyk6ICAgICAgICBcIldoaWNoIGRhdGFiYXNlIGVuZ2luZSBhbmQgY29ubmVjdGlvbiBwb29saW5nIHN0cmF0ZWd5IGRvIHlvdSB3YW50IHRvIHVzZSBoZXJlP1wiXG4vLyAtIHF1ZXN0aW9uIHNvZnQgKDIwMCBjaGFycyk6ICAgICBcIldoYXQgdGVzdGluZyBmcmFtZXdvcmsgd291bGQgeW91IGxpa2UgdG8gdXNlIGZvciB0aGlzIHByb2plY3Q/IENvbnNpZGVyIGZhY3RvcnMgbGlrZSB5b3VyIHRlYW0ncyBmYW1pbGlhcml0eSwgY29tbXVuaXR5IHN1cHBvcnQsIGFuZCBpbnRlZ3JhdGlvbiB3aXRoIHlvdXIgZXhpc3RpbmcgQ0kvQ0QgcGlwZWxpbmUgd2hlbiBtYWtpbmcgYSBjaG9pY2UuXCJcbmNvbnN0IFNvZnRMaW1pdHMgPSB7XG5cdGhlYWRlcjogNTAsXG5cdHF1ZXN0aW9uOiAyMDBcbn0gYXMgY29uc3Q7XG5cbmNvbnN0IEhhcmRMaW1pdHMgPSB7XG5cdGhlYWRlcjogNzUsXG59IGFzIGNvbnN0O1xuXG5mdW5jdGlvbiB0cnVuY2F0ZVRvTGltaXQodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbGltaXQ6IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodmFsdWUubGVuZ3RoID4gbGltaXQpIHtcblx0XHRyZXR1cm4gdmFsdWUuc2xpY2UoMCwgbGltaXQgLSAzKSArICcuLi4nO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVlc3Rpb25PcHRpb24ge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVjb21tZW5kZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElRdWVzdGlvbiB7XG5cdHJlYWRvbmx5IGhlYWRlcjogc3RyaW5nO1xuXHRyZWFkb25seSBxdWVzdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBtZXNzYWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSBtdWx0aVNlbGVjdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9wdGlvbnM/OiBJUXVlc3Rpb25PcHRpb25bXTtcblx0cmVhZG9ubHkgYWxsb3dGcmVlZm9ybUlucHV0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQXNrUXVlc3Rpb25zUGFyYW1zIHtcblx0cmVhZG9ubHkgcXVlc3Rpb25zOiBJUXVlc3Rpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVlc3Rpb25BbnN3ZXIge1xuXHRyZWFkb25seSBzZWxlY3RlZDogc3RyaW5nW107XG5cdHJlYWRvbmx5IGZyZWVUZXh0OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBza2lwcGVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBbnN3ZXJSZXN1bHQge1xuXHRyZWFkb25seSBhbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCBJUXVlc3Rpb25BbnN3ZXI+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXNrUXVlc3Rpb25zVG9vbERhdGEoKTogSVRvb2xEYXRhIHtcblx0Y29uc3QgcXVlc3Rpb25TY2hlbWE6IElKU09OU2NoZW1hICYgeyBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCB9ID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGhlYWRlcjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGBTaG9ydCBpZGVudGlmaWVyIGZvciB0aGUgcXVlc3Rpb24uIE11c3QgYmUgdW5pcXVlIHNvIGFuc3dlcnMgY2FuIGJlIG1hcHBlZCBiYWNrIHRvIHRoZSBxdWVzdGlvbi4gTWF4aW11bSAke1NvZnRMaW1pdHMuaGVhZGVyfSBjaGFyYWN0ZXJzLmAsXG5cdFx0XHRcdG1heExlbmd0aDogU29mdExpbWl0cy5oZWFkZXJcblx0XHRcdH0sXG5cdFx0XHRxdWVzdGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGBUaGUgcXVlc3Rpb24gdGV4dCB0byBkaXNwbGF5IHRvIHRoZSB1c2VyLiBLZWVwIGl0IGNvbmNpc2UsIGlkZWFsbHkgb25lIHNlbnRlbmNlLiBNYXhpbXVtICR7U29mdExpbWl0cy5xdWVzdGlvbn0gY2hhcmFjdGVycy5gLFxuXHRcdFx0XHRtYXhMZW5ndGg6IFNvZnRMaW1pdHMucXVlc3Rpb25cblx0XHRcdH0sXG5cdFx0XHRtdWx0aVNlbGVjdDoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQWxsb3cgc2VsZWN0aW5nIG11bHRpcGxlIG9wdGlvbnMgd2hlbiBvcHRpb25zIGFyZSBwcm92aWRlZC4nXG5cdFx0XHR9LFxuXHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdBbGxvdyBmcmVlZm9ybSB0ZXh0IGFuc3dlcnMgaW4gYWRkaXRpb24gdG8gb3B0aW9uIHNlbGVjdGlvbi4gRGVmYXVsdHMgdG8gdHJ1ZTsgc2V0IHRvIGZhbHNlIHRvIHJlc3RyaWN0IHRvIHByZWRlZmluZWQgb3B0aW9ucyBvbmx5Lidcblx0XHRcdH0sXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIG1hcmtkb3duIG1lc3NhZ2UgdG8gZGlzcGxheSBiZWxvdyB0aGUgcXVlc3Rpb24gdGV4dCwgcHJvdmlkaW5nIGFkZGl0aW9uYWwgY29udGV4dCBvciBkZXRhaWxzLidcblx0XHRcdH0sXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgbGlzdCBvZiBzZWxlY3RhYmxlIGFuc3dlcnMuIElmIG9taXR0ZWQsIHRoZSBxdWVzdGlvbiBpcyBmcmVlIHRleHQuJyxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEaXNwbGF5IGxhYmVsIGFuZCB2YWx1ZSBmb3IgdGhlIG9wdGlvbi4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgc2Vjb25kYXJ5IHRleHQgc2hvd24gd2l0aCB0aGUgb3B0aW9uLidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRyZWNvbW1lbmRlZDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWFyayB0aGlzIG9wdGlvbiBhcyB0aGUgcmVjb21tZW5kZWQgZGVmYXVsdC4nXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydsYWJlbCddXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ2hlYWRlcicsICdxdWVzdGlvbiddXG5cdH07XG5cblx0Y29uc3QgaW5wdXRTY2hlbWE6IElKU09OU2NoZW1hICYgeyBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCB9ID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHF1ZXN0aW9uczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0xpc3Qgb2YgcXVlc3Rpb25zIHRvIGFzayB0aGUgdXNlci4gT3JkZXIgaXMgcHJlc2VydmVkLicsXG5cdFx0XHRcdGl0ZW1zOiBxdWVzdGlvblNjaGVtYSxcblx0XHRcdFx0bWluSXRlbXM6IDFcblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3F1ZXN0aW9ucyddXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHRpZDogQXNrUXVlc3Rpb25zVG9vbElkLFxuXHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnYXNrUXVlc3Rpb25zJyxcblx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbQXNrUXVlc3Rpb25zVG9vbElkLCAndnNjb2RlL2Fza1F1ZXN0aW9ucyddLFxuXHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ucXVlc3Rpb24uaWQpLFxuXHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbC5hc2tRdWVzdGlvbnMuZGlzcGxheU5hbWUnLCAnQXNrIENsYXJpZnlpbmcgUXVlc3Rpb25zJyksXG5cdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9vbC5hc2tRdWVzdGlvbnMudXNlckRlc2NyaXB0aW9uJywgJ0FzayBzdHJ1Y3R1cmVkIGNsYXJpZnlpbmcgcXVlc3Rpb25zIHVzaW5nIHNpbmdsZSBzZWxlY3QsIG11bHRpLXNlbGVjdCwgb3IgZnJlZWZvcm0gaW5wdXRzIHRvIGNvbGxlY3QgdGFzayByZXF1aXJlbWVudHMgYmVmb3JlIHByb2NlZWRpbmcuJyksXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1VzZSB0aGlzIHRvb2wgdG8gYXNrIHRoZSB1c2VyIGEgc21hbGwgbnVtYmVyIG9mIGNsYXJpZnlpbmcgcXVlc3Rpb25zIGJlZm9yZSBwcm9jZWVkaW5nLiBQcm92aWRlIHRoZSBxdWVzdGlvbnMgYXJyYXkgd2l0aCBjb25jaXNlIGhlYWRlcnMgYW5kIHByb21wdHMuIFVzZSBvcHRpb25zIGZvciBmaXhlZCBjaG9pY2VzLCBzZXQgbXVsdGlTZWxlY3Qgd2hlbiBtdWx0aXBsZSBzZWxlY3Rpb25zIGFyZSBhbGxvd2VkLiBVc2VycyBjYW4gYWx3YXlzIHByb3ZpZGUgYSBmcmVlZm9ybSB0ZXh0IGFuc3dlciBhbG9uZ3NpZGUgb3B0aW9ucyB1bmxlc3MgeW91IHNldCBhbGxvd0ZyZWVmb3JtSW5wdXQgdG8gZmFsc2UuJyxcblx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdGlucHV0U2NoZW1hXG5cdH07XG59XG5cbmV4cG9ydCBjb25zdCBBc2tRdWVzdGlvbnNUb29sRGF0YTogSVRvb2xEYXRhID0gY3JlYXRlQXNrUXVlc3Rpb25zVG9vbERhdGEoKTtcblxuZXhwb3J0IGNsYXNzIEFza1F1ZXN0aW9uc1Rvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSh0cnVlKTtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElBc2tRdWVzdGlvbnNQYXJhbXM7XG5cdFx0Y29uc3QgeyBxdWVzdGlvbnMgfSA9IHBhcmFtZXRlcnM7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQXNrUXVlc3Rpb25zVG9vbF0gSW52b2tpbmcgd2l0aCAke3F1ZXN0aW9ucz8ubGVuZ3RoID8/IDB9IHF1ZXN0aW9uKHMpYCk7XG5cblx0XHRpZiAoIXF1ZXN0aW9ucyB8fCBxdWVzdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Fza1F1ZXN0aW9uc1Rvb2wubm9RdWVzdGlvbnMnLCAnTm8gcXVlc3Rpb25zIHByb3ZpZGVkLiBUaGUgcXVlc3Rpb25zIGFycmF5IG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgcXVlc3Rpb24uJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uUmVzb3VyY2UgPSBpbnZvY2F0aW9uLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBjaGF0UmVxdWVzdElkID0gaW52b2NhdGlvbi5jaGF0UmVxdWVzdElkO1xuXHRcdGNvbnN0IHsgcmVxdWVzdCwgc2Vzc2lvblJlc291cmNlIH0gPSB0aGlzLmdldFJlcXVlc3QoY2hhdFNlc3Npb25SZXNvdXJjZSwgY2hhdFJlcXVlc3RJZCk7XG5cblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSB8fCAhcmVxdWVzdCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tBc2tRdWVzdGlvbnNUb29sXSBNaXNzaW5nIGNoYXQgY29udGV4dDsgbWFya2luZyBhbGwgcXVlc3Rpb25zIGFzIHNraXBwZWQuJyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVTa2lwcGVkUmVzdWx0KHF1ZXN0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gSW4gYXV0b3BpbG90IG1vZGUgb3Igd2hlbiBhdXRvLXJlcGx5IGlzIGVuYWJsZWQsIHRoZSB1c2VyIGlzIG5vdCBhdmFpbGFibGUgXHUyMDE0XG5cdFx0Ly8gYXV0by1yZXNwb25kIGluc3RlYWQgb2YgYmxvY2tpbmcuIFN0aWxsIGFwcGVuZCBhIGNvbXBsZXRlZCBjYXJvdXNlbCBzbyB0aGVcblx0XHQvLyB1c2VyIGNhbiBzZWUgd2hhdCB3YXMgc2tpcHBlZC5cblx0XHRjb25zdCByZXNvbHZlSWQgPSBpbnZvY2F0aW9uLmNoYXRTdHJlYW1Ub29sQ2FsbElkID8/IGludm9jYXRpb24uY2FsbElkO1xuXHRcdGlmIChyZXF1ZXN0Lm1vZGVJbmZvPy5wZXJtaXNzaW9uTGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90IHx8IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BdXRvUmVwbHkpKSB7XG5cdFx0XHRjb25zdCByZWFzb24gPSByZXF1ZXN0Lm1vZGVJbmZvPy5wZXJtaXNzaW9uTGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90ID8gJ0F1dG9waWxvdCBtb2RlJyA6ICdBdXRvLXJlcGx5IGVuYWJsZWQnO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtBc2tRdWVzdGlvbnNUb29sXSAke3JlYXNvbn06IGF1dG8tcmVzcG9uZGluZyB0byBxdWVzdGlvbnNgKTtcblx0XHRcdGNvbnN0IHsgY2Fyb3VzZWwsIGlkVG9IZWFkZXJNYXAgfSA9IHRoaXMudG9RdWVzdGlvbkNhcm91c2VsKHF1ZXN0aW9ucywgcmVzb2x2ZUlkKTtcblx0XHRcdGNhcm91c2VsLnRlcm1pbmFsSWQgPSB0aGlzLmV4dHJhY3RUZXJtaW5hbElkKHJlcXVlc3QpO1xuXHRcdFx0Y2Fyb3VzZWwuZGF0YSA9IHRoaXMuYnVpbGRBdXRvcGlsb3RDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCBjYXJvdXNlbCwgaWRUb0hlYWRlck1hcCk7XG5cdFx0XHRjYXJvdXNlbC5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5jaGF0U2VydmljZS5hcHBlbmRQcm9ncmVzcyhyZXF1ZXN0LCBjYXJvdXNlbCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVBdXRvcGlsb3RSZXN1bHQocXVlc3Rpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNhcm91c2VsLCBpZFRvSGVhZGVyTWFwIH0gPSB0aGlzLnRvUXVlc3Rpb25DYXJvdXNlbChxdWVzdGlvbnMsIHJlc29sdmVJZCk7XG5cdFx0Y2Fyb3VzZWwudGVybWluYWxJZCA9IHRoaXMuZXh0cmFjdFRlcm1pbmFsSWQocmVxdWVzdCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQXNrUXVlc3Rpb25zVG9vbF0gcmVxdWVzdD0ke3JlcXVlc3QuaWR9IHRlcm1pbmFsRXhlY3V0aW9uSWQ9JHtyZXF1ZXN0LnRlcm1pbmFsRXhlY3V0aW9uSWQgPz8gJ3VuZGVmaW5lZCd9IGNhcm91c2VsLnRlcm1pbmFsSWQ9JHtjYXJvdXNlbC50ZXJtaW5hbElkID8/ICd1bmRlZmluZWQnfWApO1xuXHRcdHRoaXMuY2hhdFNlcnZpY2UuYXBwZW5kUHJvZ3Jlc3MocmVxdWVzdCwgY2Fyb3VzZWwpO1xuXHRcdGNvbnN0IGV4dGVybmFsQW5zd2VyTGlzdGVuZXIgPSB0aGlzLmNoYXRTZXJ2aWNlLm9uRGlkUmVjZWl2ZVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LnJlc29sdmVJZCAhPT0gY2Fyb3VzZWwucmVzb2x2ZUlkIHx8IGNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjYXJvdXNlbC5kaXNtaXNzKGV2ZW50LmFuc3dlcnMpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGFuc3dlclJlc3VsdDogeyBhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhbnN3ZXJSZXN1bHQgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKGNhcm91c2VsLmNvbXBsZXRpb24ucCwgdG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRjYXJvdXNlbC5kaXNtaXNzKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZXh0ZXJuYWxBbnN3ZXJMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGlmICghYW5zd2VyUmVzdWx0KSB7XG5cdFx0XHRjYXJvdXNlbC5kaXNtaXNzKHVuZGVmaW5lZCk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHRoZSB1c2VyIHR5cGVkIGRpcmVjdGx5IGluIHRoZSB0ZXJtaW5hbCAoYnlwYXNzaW5nIHRoZSBjYXJvdXNlbCksXG5cdFx0Ly8gdGVsbCB0aGUgYWdlbnQgdG8gc3RvcCBhc2tpbmcgcXVlc3Rpb25zIGFuZCB3YWl0IGZvciB0aGUgY29tbWFuZCB0byBmaW5pc2guXG5cdFx0aWYgKGNhcm91c2VsLmRpc21pc3NlZEJ5VGVybWluYWxJbnB1dCAmJiBjYXJvdXNlbC50ZXJtaW5hbElkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0Fza1F1ZXN0aW9uc1Rvb2xdIENhcm91c2VsIGRpc21pc3NlZCBiZWNhdXNlIHVzZXIgdHlwZWQgZGlyZWN0bHkgaW4gdGVybWluYWwgJHtjYXJvdXNlbC50ZXJtaW5hbElkfWApO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGBUaGUgdXNlciBpcyByZXBseWluZyB0byB0aGUgdGVybWluYWwgcHJvbXB0cyBkaXJlY3RseS4gRG8gbm90IGFzayBtb3JlIHF1ZXN0aW9ucyBvciBzZW5kIGlucHV0IHRvIHRoZSB0ZXJtaW5hbC4gWW91IHdpbGwgYmUgYXV0b21hdGljYWxseSBub3RpZmllZCB3aGVuIHRoZSBjb21tYW5kIGluIHRlcm1pbmFsICR7Y2Fyb3VzZWwudGVybWluYWxJZH0gY29tcGxldGVzLmBcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ2Fza1F1ZXN0aW9uc1Rvb2wucHJvZ3Jlc3MnLCAnQW5hbHl6aW5nIHlvdXIgYW5zd2Vycy4uLicpIH0pO1xuXG5cdFx0Y29uc3QgY29udmVydGVkID0gdGhpcy5jb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgYW5zd2VyUmVzdWx0Py5hbnN3ZXJzLCBpZFRvSGVhZGVyTWFwKTtcblx0XHRjb25zdCB7IGFuc3dlcmVkQ291bnQsIHNraXBwZWRDb3VudCwgZnJlZVRleHRDb3VudCwgcmVjb21tZW5kZWRBdmFpbGFibGVDb3VudCwgcmVjb21tZW5kZWRTZWxlY3RlZENvdW50IH0gPSB0aGlzLmNvbGxlY3RNZXRyaWNzKHF1ZXN0aW9ucywgY29udmVydGVkKTtcblxuXHRcdHRoaXMuc2VuZFRlbGVtZXRyeShpbnZvY2F0aW9uLmNoYXRSZXF1ZXN0SWQsIHF1ZXN0aW9ucy5sZW5ndGgsIGFuc3dlcmVkQ291bnQsIHNraXBwZWRDb3VudCwgZnJlZVRleHRDb3VudCwgcmVjb21tZW5kZWRBdmFpbGFibGVDb3VudCwgcmVjb21tZW5kZWRTZWxlY3RlZENvdW50LCBzdG9wV2F0Y2guZWxhcHNlZCgpKTtcblxuXHRcdGNvbnN0IHRvb2xSZXN1bHRKc29uID0gSlNPTi5zdHJpbmdpZnkoY29udmVydGVkKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBc2tRdWVzdGlvbnNUb29sXSBSZXR1cm5pbmcgdG9vbCByZXN1bHQgd2l0aCBtZXRyaWNzOiBxdWVzdGlvbnM9JHtxdWVzdGlvbnMubGVuZ3RofSwgYW5zd2VyZWQ9JHthbnN3ZXJlZENvdW50fSwgc2tpcHBlZD0ke3NraXBwZWRDb3VudH0sIGZyZWVUZXh0PSR7ZnJlZVRleHRDb3VudH0sIHJlY29tbWVuZGVkQXZhaWxhYmxlPSR7cmVjb21tZW5kZWRBdmFpbGFibGVDb3VudH0sIHJlY29tbWVuZGVkU2VsZWN0ZWQ9JHtyZWNvbW1lbmRlZFNlbGVjdGVkQ291bnR9YCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IHRvb2xSZXN1bHRKc29uIH1dXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJQXNrUXVlc3Rpb25zUGFyYW1zO1xuXHRcdGNvbnN0IHsgcXVlc3Rpb25zIH0gPSBwYXJhbWV0ZXJzO1xuXG5cdFx0aWYgKCFxdWVzdGlvbnMgfHwgcXVlc3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdhc2tRdWVzdGlvbnNUb29sLm5vUXVlc3Rpb25zJywgJ05vIHF1ZXN0aW9ucyBwcm92aWRlZC4gVGhlIHF1ZXN0aW9ucyBhcnJheSBtdXN0IGNvbnRhaW4gYXQgbGVhc3Qgb25lIHF1ZXN0aW9uLicpKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHF1ZXN0aW9uIG9mIHF1ZXN0aW9ucykge1xuXHRcdFx0aWYgKHF1ZXN0aW9uLm9wdGlvbnMgJiYgcXVlc3Rpb24ub3B0aW9ucy5sZW5ndGggPT09IDEgJiYgIXF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Fza1F1ZXN0aW9uc1Rvb2wuaW52YWxpZE9wdGlvbnMnLCAnUXVlc3Rpb24gXCJ7MH1cIiBtdXN0IGhhdmUgYXQgbGVhc3QgdHdvIG9wdGlvbnMsIG9yIHNldCBhbGxvd0ZyZWVmb3JtSW5wdXQgd2hlbiBwcm92aWRpbmcgYSBzaW5nbGUgb3B0aW9uLCBvciBvbWl0IG9wdGlvbnMgZm9yIGZyZWUgdGV4dCBpbnB1dC4nLCBxdWVzdGlvbi5oZWFkZXIpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBxdWVzdGlvbkNvdW50ID0gcXVlc3Rpb25zLmxlbmd0aDtcblx0XHRjb25zdCBoZWFkZXJzID0gcXVlc3Rpb25zLm1hcChxID0+IHEuaGVhZGVyKS5qb2luKCcsICcpO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBxdWVzdGlvbkNvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdhc2tRdWVzdGlvbnNUb29sLmludm9jYXRpb24uc2luZ2xlJywgJ0Fza2luZyBhIHF1ZXN0aW9uICh7MH0pJywgaGVhZGVycylcblx0XHRcdDogbG9jYWxpemUoJ2Fza1F1ZXN0aW9uc1Rvb2wuaW52b2NhdGlvbi5tdWx0aXBsZScsICdBc2tpbmcgezB9IHF1ZXN0aW9ucyAoezF9KScsIHF1ZXN0aW9uQ291bnQsIGhlYWRlcnMpO1xuXHRcdGNvbnN0IHBhc3RNZXNzYWdlID0gcXVlc3Rpb25Db3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnYXNrUXVlc3Rpb25zVG9vbC5pbnZvY2F0aW9uLnNpbmdsZS5wYXN0JywgJ0Fza2VkIGEgcXVlc3Rpb24gKHswfSknLCBoZWFkZXJzKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYXNrUXVlc3Rpb25zVG9vbC5pbnZvY2F0aW9uLm11bHRpcGxlLnBhc3QnLCAnQXNrZWQgezB9IHF1ZXN0aW9ucyAoezF9KScsIHF1ZXN0aW9uQ291bnQsIGhlYWRlcnMpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobWVzc2FnZSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcocGFzdE1lc3NhZ2UpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVxdWVzdChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNoYXRSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgcmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ7IHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGlmICghY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHsgcmVxdWVzdDogdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGxldCByZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdC8vIFByZWZlciBhbiBleGFjdCBtYXRjaCBvbiBjaGF0UmVxdWVzdElkIHdoZW4gcG9zc2libGVcblx0XHRcdGlmIChjaGF0UmVxdWVzdElkKSB7XG5cdFx0XHRcdHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmZpbmQociA9PiByLmlkID09PSBjaGF0UmVxdWVzdElkKTtcblx0XHRcdH1cblx0XHRcdC8vIEZhbGwgYmFjayB0byB0aGUgbW9zdCByZWNlbnQgcmVxdWVzdCBpbiB0aGUgc2Vzc2lvbiBpZiB3ZSBjYW4ndCBmaW5kIGEgbWF0Y2hcblx0XHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHRyZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4geyByZXF1ZXN0OiB1bmRlZmluZWQsIHNlc3Npb25SZXNvdXJjZTogY2hhdFNlc3Npb25SZXNvdXJjZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHJlcXVlc3QsIHNlc3Npb25SZXNvdXJjZTogY2hhdFNlc3Npb25SZXNvdXJjZSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSB0ZXJtaW5hbCBleGVjdXRpb24gSUQgZm9yIHRoZSByZXF1ZXN0LlxuXHQgKiBQcmVmZXIgc3RydWN0dXJlZCBtZXRhZGF0YSBhbmQgZmFsbCBiYWNrIHRvIGxlZ2FjeSBtZXNzYWdlIHBhcnNpbmcgZm9yXG5cdCAqIG9sZCBzZXNzaW9ucyB0aGF0IG1heSBub3QgY2FycnkgdGhlIG1ldGFkYXRhIHlldC5cblx0ICogQXMgYSBmaW5hbCBmYWxsYmFjaywgc2VhcmNoIGNvbXBsZXRlZCBydW5JblRlcm1pbmFsIHRvb2wgaW52b2NhdGlvbnMgaW5cblx0ICogdGhlIHJlc3BvbnNlIGZvciB0aGUgdGVybWluYWwgSUQsIGJ1dCBvbmx5IHdoZW4gdGhlIHRvb2wgb3V0cHV0IGluZGljYXRlc1xuXHQgKiB0aGUgdGVybWluYWwgaXMgc3RpbGwgcnVubmluZyBhbmQgd2FpdGluZyBmb3IgaW5wdXQgKGZvcmVncm91bmQvdGltZW91dFxuXHQgKiBwYXRoIHdoZXJlIHRoZSBtb2RlbCBjYWxscyBhc2tfcXVlc3Rpb25zIGZyb20gdGhlIHNhbWUgdHVybiBhc1xuXHQgKiBydW5JblRlcm1pbmFsKS5cblx0ICovXG5cdHByaXZhdGUgZXh0cmFjdFRlcm1pbmFsSWQocmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZXF1ZXN0LnRlcm1pbmFsRXhlY3V0aW9uSWQpIHtcblx0XHRcdHJldHVybiByZXF1ZXN0LnRlcm1pbmFsRXhlY3V0aW9uSWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2ggPSByZXF1ZXN0Lm1lc3NhZ2UudGV4dC5tYXRjaCgvXFxbVGVybWluYWwgKD88dGVybUlkPlxcUyspIG5vdGlmaWNhdGlvbjovKTtcblx0XHRpZiAobWF0Y2g/Lmdyb3Vwcz8udGVybUlkKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2guZ3JvdXBzLnRlcm1JZDtcblx0XHR9XG5cblx0XHQvLyBTZWFyY2ggY29tcGxldGVkIHJ1bkluVGVybWluYWwgdG9vbCBpbnZvY2F0aW9ucyBpbiB0aGUgcmVzcG9uc2Vcblx0XHQvLyBmb3IgdGhlIHRlcm1pbmFsIGV4ZWN1dGlvbiBJRCAoY292ZXJzIGZvcmVncm91bmQvdGltZW91dCBwYXRoKS5cblx0XHQvLyBPbmx5IG1hdGNoIG91dHB1dCB0aGF0IGV4cGxpY2l0bHkgaW5kaWNhdGVzIHRoZSB0ZXJtaW5hbCBpcyBzdGlsbFxuXHRcdC8vIHJ1bm5pbmcgYW5kIHdhaXRpbmcgZm9yIGlucHV0OyBvdGhlcndpc2UgdGhlIHF1ZXN0aW9uIGlzIHVucmVsYXRlZFxuXHRcdC8vIHRvIHRoZSBwcmlvciB0ZXJtaW5hbCBjb21tYW5kLlxuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZTtcblx0XHRpZiAocmVzcG9uc2UpIHtcblx0XHRcdGNvbnN0IHBhcnRzID0gcmVzcG9uc2UucmVzcG9uc2UudmFsdWU7XG5cdFx0XHRmb3IgKGxldCBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0Y29uc3QgcGFydCA9IHBhcnRzW2ldO1xuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmIHBhcnQudG9vbElkID09PSBUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBwYXJ0LnN0YXRlLmdldCgpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQgJiYgc3RhdGUuY29udGVudEZvck1vZGVsKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygc3RhdGUuY29udGVudEZvck1vZGVsKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGlkTWF0Y2ggPSBpdGVtLnZhbHVlLm1hdGNoKC8oPzpydW5uaW5nIGluIHRlcm1pbmFsIElEfG1heSBzdGlsbCBiZSBydW5uaW5nIGluIHRlcm1pbmFsIElEKSAoWzAtOWEtZkEtRi1dKykvKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoaWRNYXRjaCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGlkTWF0Y2hbMV07XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgdG9RdWVzdGlvbkNhcm91c2VsKHF1ZXN0aW9uczogSVF1ZXN0aW9uW10sIHJlc29sdmVJZD86IHN0cmluZyk6IHsgY2Fyb3VzZWw6IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YTsgaWRUb0hlYWRlck1hcDogTWFwPHN0cmluZywgc3RyaW5nPiB9IHtcblx0XHRjb25zdCBpZFRvSGVhZGVyTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBjYXJvdXNlbFJlc29sdmVJZCA9IHJlc29sdmVJZCA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBtYXBwZWRRdWVzdGlvbnMgPSBxdWVzdGlvbnMubWFwKChxdWVzdGlvbiwgaW5kZXgpID0+IHRoaXMudG9DaGF0UXVlc3Rpb24ocXVlc3Rpb24sIGlkVG9IZWFkZXJNYXAsIGNhcm91c2VsUmVzb2x2ZUlkLCBpbmRleCkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjYXJvdXNlbDogbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShtYXBwZWRRdWVzdGlvbnMsIHRydWUsIGNhcm91c2VsUmVzb2x2ZUlkKSxcblx0XHRcdGlkVG9IZWFkZXJNYXBcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB0b0NoYXRRdWVzdGlvbihxdWVzdGlvbjogSVF1ZXN0aW9uLCBpZFRvSGVhZGVyTWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCByZXNvbHZlSWQ6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IElDaGF0UXVlc3Rpb24ge1xuXHRcdGxldCB0eXBlOiBJQ2hhdFF1ZXN0aW9uWyd0eXBlJ107XG5cdFx0aWYgKCFxdWVzdGlvbi5vcHRpb25zIHx8IHF1ZXN0aW9uLm9wdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0eXBlID0gJ3RleHQnO1xuXHRcdH0gZWxzZSBpZiAocXVlc3Rpb24ubXVsdGlTZWxlY3QpIHtcblx0XHRcdHR5cGUgPSAnbXVsdGlTZWxlY3QnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0eXBlID0gJ3NpbmdsZVNlbGVjdCc7XG5cdFx0fVxuXG5cdFx0bGV0IGRlZmF1bHRWYWx1ZTogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHF1ZXN0aW9uLm9wdGlvbnMpIHtcblx0XHRcdGNvbnN0IHJlY29tbWVuZGVkT3B0aW9ucyA9IHF1ZXN0aW9uLm9wdGlvbnMuZmlsdGVyKG9wdCA9PiBvcHQucmVjb21tZW5kZWQpO1xuXHRcdFx0aWYgKHJlY29tbWVuZGVkT3B0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGRlZmF1bHRWYWx1ZSA9IHF1ZXN0aW9uLm11bHRpU2VsZWN0ID8gcmVjb21tZW5kZWRPcHRpb25zLm1hcChvcHQgPT4gb3B0LmxhYmVsKSA6IHJlY29tbWVuZGVkT3B0aW9uc1swXS5sYWJlbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVc2UgYSBzdGFibGUgVVVJRCBhcyB0aGUgaW50ZXJuYWwgSUQgdG8gYXZvaWQgY29sbGlzaW9ucyB3aGVuIHRydW5jYXRpbmcgaGVhZGVyc1xuXHRcdC8vIFRoZSBvcmlnaW5hbCBoZWFkZXIgaXMgcHJlc2VydmVkIGluIGlkVG9IZWFkZXJNYXAgZm9yIGFuc3dlciBjb3JyZWxhdGlvblxuXHRcdGNvbnN0IGludGVybmFsSWQgPSBgJHtyZXNvbHZlSWR9OiR7aW5kZXh9YDtcblx0XHRpZFRvSGVhZGVyTWFwLnNldChpbnRlcm5hbElkLCBxdWVzdGlvbi5oZWFkZXIpO1xuXG5cdFx0Ly8gVHJ1bmNhdGUgaGVhZGVyIGZvciBkaXNwbGF5IG9ubHlcblx0XHRjb25zdCBkaXNwbGF5VGl0bGUgPSB0cnVuY2F0ZVRvTGltaXQocXVlc3Rpb24uaGVhZGVyLCBIYXJkTGltaXRzLmhlYWRlcikgPz8gcXVlc3Rpb24uaGVhZGVyO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBpbnRlcm5hbElkLFxuXHRcdFx0dHlwZSxcblx0XHRcdHRpdGxlOiBkaXNwbGF5VGl0bGUsXG5cdFx0XHRtZXNzYWdlOiBxdWVzdGlvbi5xdWVzdGlvbixcblx0XHRcdGRldGFpbGVkTWVzc2FnZTogcXVlc3Rpb24ubWVzc2FnZSxcblx0XHRcdG9wdGlvbnM6IHF1ZXN0aW9uLm9wdGlvbnM/Lm1hcChvcHQgPT4gKHtcblx0XHRcdFx0aWQ6IG9wdC5sYWJlbCxcblx0XHRcdFx0bGFiZWw6IG9wdC5kZXNjcmlwdGlvbiA/IGAke29wdC5sYWJlbH0gLSAke29wdC5kZXNjcmlwdGlvbn1gIDogb3B0LmxhYmVsLFxuXHRcdFx0XHR2YWx1ZTogb3B0LmxhYmVsXG5cdFx0XHR9KSksXG5cdFx0XHRkZWZhdWx0VmFsdWUsXG5cdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCA/PyB0cnVlXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9uczogSVF1ZXN0aW9uW10sIGNhcm91c2VsQW5zd2VyczogSUNoYXRRdWVzdGlvbkFuc3dlcnMgfCB1bmRlZmluZWQsIGlkVG9IZWFkZXJNYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBJQW5zd2VyUmVzdWx0IHtcblx0XHRjb25zdCByZXN1bHQ6IElBbnN3ZXJSZXN1bHQgPSB7IGFuc3dlcnM6IHt9IH07XG5cblx0XHRpZiAoY2Fyb3VzZWxBbnN3ZXJzKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBc2tRdWVzdGlvbnNUb29sXSBDYXJvdXNlbCBhbnN3ZXIga2V5czogJHtPYmplY3Qua2V5cyhjYXJvdXNlbEFuc3dlcnMpLmpvaW4oJywgJyl9YCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBc2tRdWVzdGlvbnNUb29sXSBRdWVzdGlvbiBoZWFkZXJzOiAke3F1ZXN0aW9ucy5tYXAocSA9PiBxLmhlYWRlcikuam9pbignLCAnKX1gKTtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCBhIHJldmVyc2UgbWFwOiBvcmlnaW5hbCBoZWFkZXIgLT4gaW50ZXJuYWwgSURcblx0XHRjb25zdCBoZWFkZXJUb0lkTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IFtpbnRlcm5hbElkLCBvcmlnaW5hbEhlYWRlcl0gb2YgaWRUb0hlYWRlck1hcCkge1xuXHRcdFx0aGVhZGVyVG9JZE1hcC5zZXQob3JpZ2luYWxIZWFkZXIsIGludGVybmFsSWQpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcXVlc3Rpb24gb2YgcXVlc3Rpb25zKSB7XG5cdFx0XHRpZiAoIWNhcm91c2VsQW5zd2Vycykge1xuXHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdHNlbGVjdGVkOiBbXSxcblx0XHRcdFx0XHRmcmVlVGV4dDogbnVsbCxcblx0XHRcdFx0XHRza2lwcGVkOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIHVwIHRoZSBhbnN3ZXIgdXNpbmcgdGhlIGludGVybmFsIElEIHRoYXQgd2FzIHVzZWQgaW4gdGhlIGNhcm91c2VsXG5cdFx0XHRjb25zdCBpbnRlcm5hbElkID0gaGVhZGVyVG9JZE1hcC5nZXQocXVlc3Rpb24uaGVhZGVyKTtcblx0XHRcdGNvbnN0IGFuc3dlcjogSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlIHwgdW5kZWZpbmVkID0gaW50ZXJuYWxJZCA/IGNhcm91c2VsQW5zd2Vyc1tpbnRlcm5hbElkXSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0Fza1F1ZXN0aW9uc1Rvb2xdIFByb2Nlc3NpbmcgcXVlc3Rpb24gXCIke3F1ZXN0aW9uLmhlYWRlcn1cIiAoaW50ZXJuYWwgSUQ6ICR7aW50ZXJuYWxJZH0pLCByYXcgYW5zd2VyOiAke0pTT04uc3RyaW5naWZ5KGFuc3dlcil9LCB0eXBlOiAke3R5cGVvZiBhbnN3ZXJ9YCk7XG5cblx0XHRcdGlmIChhbnN3ZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdHNlbGVjdGVkOiBbXSxcblx0XHRcdFx0XHRmcmVlVGV4dDogbnVsbCxcblx0XHRcdFx0XHRza2lwcGVkOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBhbnN3ZXIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGlmIChxdWVzdGlvbi5vcHRpb25zPy5zb21lKG9wdCA9PiBvcHQubGFiZWwgPT09IGFuc3dlcikpIHtcblx0XHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdFx0c2VsZWN0ZWQ6IFthbnN3ZXJdLFxuXHRcdFx0XHRcdFx0ZnJlZVRleHQ6IG51bGwsXG5cdFx0XHRcdFx0XHRza2lwcGVkOiBmYWxzZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LmFuc3dlcnNbcXVlc3Rpb24uaGVhZGVyXSA9IHtcblx0XHRcdFx0XHRcdHNlbGVjdGVkOiBbXSxcblx0XHRcdFx0XHRcdGZyZWVUZXh0OiBhbnN3ZXIsXG5cdFx0XHRcdFx0XHRza2lwcGVkOiBmYWxzZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhbnN3ZXIpKSB7XG5cdFx0XHRcdHJlc3VsdC5hbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWQ6IGFuc3dlci5tYXAoYSA9PiBTdHJpbmcoYSkpLFxuXHRcdFx0XHRcdGZyZWVUZXh0OiBudWxsLFxuXHRcdFx0XHRcdHNraXBwZWQ6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBhbnN3ZXIgPT09ICdvYmplY3QnICYmIGhhc0tleShhbnN3ZXIsIHsgc2VsZWN0ZWRWYWx1ZXM6IHRydWUgfSkpIHtcblx0XHRcdFx0Y29uc3QgeyBzZWxlY3RlZFZhbHVlcywgZnJlZWZvcm1WYWx1ZSB9ID0gYW5zd2VyIGFzIElDaGF0TXVsdGlTZWxlY3RBbnN3ZXI7XG5cdFx0XHRcdHJlc3VsdC5hbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWQ6IHNlbGVjdGVkVmFsdWVzLFxuXHRcdFx0XHRcdGZyZWVUZXh0OiBmcmVlZm9ybVZhbHVlID8/IG51bGwsXG5cdFx0XHRcdFx0c2tpcHBlZDogZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGFuc3dlciA9PT0gJ29iamVjdCcgJiYgKGhhc0tleShhbnN3ZXIsIHsgc2VsZWN0ZWRWYWx1ZTogdHJ1ZSB9KSB8fCBoYXNLZXkoYW5zd2VyLCB7IGZyZWVmb3JtVmFsdWU6IHRydWUgfSkpKSB7XG5cdFx0XHRcdGNvbnN0IHsgc2VsZWN0ZWRWYWx1ZSwgZnJlZWZvcm1WYWx1ZSB9ID0gYW5zd2VyIGFzIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyO1xuXHRcdFx0XHRpZiAoZnJlZWZvcm1WYWx1ZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5hbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RlZDogW10sXG5cdFx0XHRcdFx0XHRmcmVlVGV4dDogZnJlZWZvcm1WYWx1ZSxcblx0XHRcdFx0XHRcdHNraXBwZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIGlmIChzZWxlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRpZiAocXVlc3Rpb24ub3B0aW9ucz8uc29tZShvcHQgPT4gb3B0LmxhYmVsID09PSBzZWxlY3RlZFZhbHVlKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LmFuc3dlcnNbcXVlc3Rpb24uaGVhZGVyXSA9IHtcblx0XHRcdFx0XHRcdFx0c2VsZWN0ZWQ6IFtzZWxlY3RlZFZhbHVlXSxcblx0XHRcdFx0XHRcdFx0ZnJlZVRleHQ6IG51bGwsXG5cdFx0XHRcdFx0XHRcdHNraXBwZWQ6IGZhbHNlXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuYW5zd2Vyc1txdWVzdGlvbi5oZWFkZXJdID0ge1xuXHRcdFx0XHRcdFx0XHRzZWxlY3RlZDogW10sXG5cdFx0XHRcdFx0XHRcdGZyZWVUZXh0OiBzZWxlY3RlZFZhbHVlLFxuXHRcdFx0XHRcdFx0XHRza2lwcGVkOiBmYWxzZVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LmFuc3dlcnNbcXVlc3Rpb24uaGVhZGVyXSA9IHtcblx0XHRcdFx0XHRcdHNlbGVjdGVkOiBbXSxcblx0XHRcdFx0XHRcdGZyZWVUZXh0OiBudWxsLFxuXHRcdFx0XHRcdFx0c2tpcHBlZDogdHJ1ZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQXNrUXVlc3Rpb25zVG9vbF0gVW5rbm93biBhbnN3ZXIgZm9ybWF0IGZvciBcIiR7cXVlc3Rpb24uaGVhZGVyfVwiOiAke0pTT04uc3RyaW5naWZ5KGFuc3dlcil9YCk7XG5cdFx0XHRcdHJlc3VsdC5hbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWQ6IFtdLFxuXHRcdFx0XHRcdGZyZWVUZXh0OiBudWxsLFxuXHRcdFx0XHRcdHNraXBwZWQ6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBjb2xsZWN0TWV0cmljcyhxdWVzdGlvbnM6IElRdWVzdGlvbltdLCByZXN1bHQ6IElBbnN3ZXJSZXN1bHQpOiB7IGFuc3dlcmVkQ291bnQ6IG51bWJlcjsgc2tpcHBlZENvdW50OiBudW1iZXI7IGZyZWVUZXh0Q291bnQ6IG51bWJlcjsgcmVjb21tZW5kZWRBdmFpbGFibGVDb3VudDogbnVtYmVyOyByZWNvbW1lbmRlZFNlbGVjdGVkQ291bnQ6IG51bWJlciB9IHtcblx0XHRjb25zdCBhbnN3ZXJzID0gT2JqZWN0LnZhbHVlcyhyZXN1bHQuYW5zd2Vycyk7XG5cdFx0Y29uc3QgYW5zd2VyZWRDb3VudCA9IGFuc3dlcnMuZmlsdGVyKGEgPT4gIWEuc2tpcHBlZCkubGVuZ3RoO1xuXHRcdGNvbnN0IHNraXBwZWRDb3VudCA9IGFuc3dlcnMuZmlsdGVyKGEgPT4gYS5za2lwcGVkKS5sZW5ndGg7XG5cdFx0Y29uc3QgZnJlZVRleHRDb3VudCA9IGFuc3dlcnMuZmlsdGVyKGEgPT4gYS5mcmVlVGV4dCAhPT0gbnVsbCkubGVuZ3RoO1xuXHRcdGNvbnN0IHJlY29tbWVuZGVkQXZhaWxhYmxlQ291bnQgPSBxdWVzdGlvbnMuZmlsdGVyKHEgPT4gcS5vcHRpb25zPy5zb21lKG9wdCA9PiBvcHQucmVjb21tZW5kZWQpKS5sZW5ndGg7XG5cdFx0Y29uc3QgcmVjb21tZW5kZWRTZWxlY3RlZENvdW50ID0gcXVlc3Rpb25zLmZpbHRlcihxID0+IHtcblx0XHRcdGNvbnN0IGFuc3dlciA9IHJlc3VsdC5hbnN3ZXJzW3EuaGVhZGVyXTtcblx0XHRcdGNvbnN0IHJlY29tbWVuZGVkT3B0aW9uID0gcS5vcHRpb25zPy5maW5kKG9wdCA9PiBvcHQucmVjb21tZW5kZWQpO1xuXHRcdFx0cmV0dXJuIGFuc3dlciAmJiAhYW5zd2VyLnNraXBwZWQgJiYgcmVjb21tZW5kZWRPcHRpb24gJiYgYW5zd2VyLnNlbGVjdGVkLmluY2x1ZGVzKHJlY29tbWVuZGVkT3B0aW9uLmxhYmVsKTtcblx0XHR9KS5sZW5ndGg7XG5cdFx0cmV0dXJuIHsgYW5zd2VyZWRDb3VudCwgc2tpcHBlZENvdW50LCBmcmVlVGV4dENvdW50LCByZWNvbW1lbmRlZEF2YWlsYWJsZUNvdW50LCByZWNvbW1lbmRlZFNlbGVjdGVkQ291bnQgfTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2tpcHBlZFJlc3VsdChxdWVzdGlvbnM6IElRdWVzdGlvbltdKTogSVRvb2xSZXN1bHQge1xuXHRcdGNvbnN0IHNraXBwZWRBbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCBJUXVlc3Rpb25BbnN3ZXI+ID0ge307XG5cdFx0Zm9yIChjb25zdCBxdWVzdGlvbiBvZiBxdWVzdGlvbnMpIHtcblx0XHRcdHNraXBwZWRBbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7IHNlbGVjdGVkOiBbXSwgZnJlZVRleHQ6IG51bGwsIHNraXBwZWQ6IHRydWUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IEpTT04uc3RyaW5naWZ5KHsgYW5zd2Vyczogc2tpcHBlZEFuc3dlcnMgfSkgfV1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBdXRvcGlsb3RSZXN1bHQocXVlc3Rpb25zOiBJUXVlc3Rpb25bXSk6IElUb29sUmVzdWx0IHtcblx0XHRjb25zdCBhbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCBJUXVlc3Rpb25BbnN3ZXI+ID0ge307XG5cdFx0Zm9yIChjb25zdCBxdWVzdGlvbiBvZiBxdWVzdGlvbnMpIHtcblx0XHRcdC8vIEluIGF1dG9waWxvdCBtb2RlIHRoZSB1c2VyIGlzIG5vdCBhdmFpbGFibGUgdG8gcmVzcG9uZC4gRG8gbm90XG5cdFx0XHQvLyBhdXRvLXNlbGVjdCBhbnkgb3B0aW9uIFx1MjAxNCBpbnN0ZWFkIGluc3RydWN0IHRoZSBtb2RlbCB0byBtYWtlIGl0cyBvd25cblx0XHRcdC8vIGRlY2lzaW9uIHJlZ2FyZGxlc3Mgb2YgdGhlIHF1ZXN0aW9uIHR5cGUuXG5cdFx0XHRhbnN3ZXJzW3F1ZXN0aW9uLmhlYWRlcl0gPSB7XG5cdFx0XHRcdHNlbGVjdGVkOiBbXSxcblx0XHRcdFx0ZnJlZVRleHQ6IEFVVE9QSUxPVF9BU0tfVVNFUl9SRVNQT05TRSxcblx0XHRcdFx0c2tpcHBlZDogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogSlNPTi5zdHJpbmdpZnkoeyBhbnN3ZXJzIH0gc2F0aXNmaWVzIElBbnN3ZXJSZXN1bHQpIH1dXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCBjYXJvdXNlbCBhbnN3ZXIgZGF0YSBrZXllZCBieSBjYXJvdXNlbCBxdWVzdGlvbiBJRHMgZm9yIHJlbmRlcmluZ1xuXHQgKiB0aGUgY29tcGxldGVkIHN1bW1hcnkgaW4gdGhlIFVJIGR1cmluZyBhdXRvcGlsb3QgbW9kZS5cblx0ICovXG5cdHByaXZhdGUgYnVpbGRBdXRvcGlsb3RDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zOiBJUXVlc3Rpb25bXSwgY2Fyb3VzZWw6IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSwgaWRUb0hlYWRlck1hcDogTWFwPHN0cmluZywgc3RyaW5nPik6IElDaGF0UXVlc3Rpb25BbnN3ZXJzIHtcblx0XHRjb25zdCBkYXRhOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyA9IHt9O1xuXHRcdC8vIEJ1aWxkIHJldmVyc2UgbWFwOiBvcmlnaW5hbCBoZWFkZXIgLT4gaW50ZXJuYWwgY2Fyb3VzZWwgcXVlc3Rpb24gSURcblx0XHRjb25zdCBoZWFkZXJUb0lkTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IFtpbnRlcm5hbElkLCBvcmlnaW5hbEhlYWRlcl0gb2YgaWRUb0hlYWRlck1hcCkge1xuXHRcdFx0aGVhZGVyVG9JZE1hcC5zZXQob3JpZ2luYWxIZWFkZXIsIGludGVybmFsSWQpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcXVlc3Rpb24gb2YgcXVlc3Rpb25zKSB7XG5cdFx0XHRjb25zdCBpbnRlcm5hbElkID0gaGVhZGVyVG9JZE1hcC5nZXQocXVlc3Rpb24uaGVhZGVyKTtcblx0XHRcdGlmICghaW50ZXJuYWxJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hhdFF1ZXN0aW9uID0gY2Fyb3VzZWwucXVlc3Rpb25zLmZpbmQocSA9PiBxLmlkID09PSBpbnRlcm5hbElkKTtcblx0XHRcdGlmICghY2hhdFF1ZXN0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEbyBub3QgYXV0by1zZWxlY3QgYW55IG9wdGlvbiBpbiBhdXRvcGlsb3QgbW9kZSBcdTIwMTQgc2hvdyB0aGVcblx0XHRcdC8vIFwidXNlciBpcyBub3QgYXZhaWxhYmxlXCIgcmVzcG9uc2UgYXMgdGhlIGFuc3dlciBmb3IgYWxsIHF1ZXN0aW9uIHR5cGVzLlxuXHRcdFx0aWYgKGNoYXRRdWVzdGlvbi50eXBlID09PSAnbXVsdGlTZWxlY3QnKSB7XG5cdFx0XHRcdGRhdGFbaW50ZXJuYWxJZF0gPSB7IHNlbGVjdGVkVmFsdWVzOiBbXSwgZnJlZWZvcm1WYWx1ZTogQVVUT1BJTE9UX0FTS19VU0VSX1JFU1BPTlNFIH07XG5cdFx0XHR9IGVsc2UgaWYgKGNoYXRRdWVzdGlvbi50eXBlID09PSAnc2luZ2xlU2VsZWN0Jykge1xuXHRcdFx0XHRkYXRhW2ludGVybmFsSWRdID0geyBmcmVlZm9ybVZhbHVlOiBBVVRPUElMT1RfQVNLX1VTRVJfUkVTUE9OU0UgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRhdGFbaW50ZXJuYWxJZF0gPSBBVVRPUElMT1RfQVNLX1VTRVJfUkVTUE9OU0U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRwcml2YXRlIHNlbmRUZWxlbWV0cnkocmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHF1ZXN0aW9uQ291bnQ6IG51bWJlciwgYW5zd2VyZWRDb3VudDogbnVtYmVyLCBza2lwcGVkQ291bnQ6IG51bWJlciwgZnJlZVRleHRDb3VudDogbnVtYmVyLCByZWNvbW1lbmRlZEF2YWlsYWJsZUNvdW50OiBudW1iZXIsIHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudDogbnVtYmVyLCBkdXJhdGlvbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QXNrUXVlc3Rpb25zVG9vbEludm9rZWRFdmVudCwgQXNrUXVlc3Rpb25zVG9vbEludm9rZWRDbGFzc2lmaWNhdGlvbj4oJ2Fza1F1ZXN0aW9uc1Rvb2xJbnZva2VkJywge1xuXHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0cXVlc3Rpb25Db3VudCxcblx0XHRcdGFuc3dlcmVkQ291bnQsXG5cdFx0XHRza2lwcGVkQ291bnQsXG5cdFx0XHRmcmVlVGV4dENvdW50LFxuXHRcdFx0cmVjb21tZW5kZWRBdmFpbGFibGVDb3VudCxcblx0XHRcdHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudCxcblx0XHRcdGR1cmF0aW9uLFxuXHRcdH0pO1xuXHR9XG59XG5cbnR5cGUgQXNrUXVlc3Rpb25zVG9vbEludm9rZWRFdmVudCA9IHtcblx0cmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHF1ZXN0aW9uQ291bnQ6IG51bWJlcjtcblx0YW5zd2VyZWRDb3VudDogbnVtYmVyO1xuXHRza2lwcGVkQ291bnQ6IG51bWJlcjtcblx0ZnJlZVRleHRDb3VudDogbnVtYmVyO1xuXHRyZWNvbW1lbmRlZEF2YWlsYWJsZUNvdW50OiBudW1iZXI7XG5cdHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudDogbnVtYmVyO1xuXHRkdXJhdGlvbjogbnVtYmVyO1xufTtcblxudHlwZSBBc2tRdWVzdGlvbnNUb29sSW52b2tlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRyZXF1ZXN0SWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWQgb2YgdGhlIGN1cnJlbnQgcmVxdWVzdCB0dXJuLicgfTtcblx0cXVlc3Rpb25Db3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSB0b3RhbCBudW1iZXIgb2YgcXVlc3Rpb25zIGFza2VkJyB9O1xuXHRhbnN3ZXJlZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiBxdWVzdGlvbnMgdGhhdCB3ZXJlIGFuc3dlcmVkJyB9O1xuXHRza2lwcGVkQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHF1ZXN0aW9ucyB0aGF0IHdlcmUgc2tpcHBlZCcgfTtcblx0ZnJlZVRleHRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgcXVlc3Rpb25zIGFuc3dlcmVkIHdpdGggZnJlZSB0ZXh0IGlucHV0JyB9O1xuXHRyZWNvbW1lbmRlZEF2YWlsYWJsZUNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiBxdWVzdGlvbnMgdGhhdCBoYWQgYSByZWNvbW1lbmRlZCBvcHRpb24nIH07XG5cdHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgcXVlc3Rpb25zIHdoZXJlIHRoZSB1c2VyIHNlbGVjdGVkIHRoZSByZWNvbW1lbmRlZCBvcHRpb24nIH07XG5cdGR1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIHRvdGFsIHRpbWUgaW4gbWlsbGlzZWNvbmRzIHRvIGNvbXBsZXRlIGFsbCBxdWVzdGlvbnMnIH07XG5cdG93bmVyOiAnZGlnaXRhcmFsZCc7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdXNhZ2Ugb2YgdGhlIEFza1F1ZXN0aW9ucyB0b29sIGZvciBhZ2VudCBjbGFyaWZpY2F0aW9ucyc7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBZ0csY0FBdUMsMkJBQTJCO0FBQ2xLLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUE4SSxzQkFBb0M7QUFDbEwsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsc0JBQXNCO0FBS3hCLE1BQU0sOEJBQ1o7QUFHTSxNQUFNLHFCQUFxQjtBQVNsQyxNQUFNLGFBQWE7QUFBQSxFQUNsQixRQUFRO0FBQUEsRUFDUixVQUFVO0FBQ1g7QUFFQSxNQUFNLGFBQWE7QUFBQSxFQUNsQixRQUFRO0FBQ1Q7QUFFQSxTQUFTLGdCQUFnQixPQUEyQixPQUFtQztBQUN0RixNQUFJLFVBQVUsUUFBVztBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksTUFBTSxTQUFTLE9BQU87QUFDekIsV0FBTyxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsSUFBSTtBQUFBLEVBQ3BD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
