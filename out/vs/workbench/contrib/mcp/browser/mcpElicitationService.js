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
import { Action } from "../../../../base/common/actions.js";
import { assertNever, softAssertNever } from "../../../../base/common/assert.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ChatElicitationRequestPart } from "../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ChatQuestionCarouselData } from "../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { ChatModel } from "../../chat/common/model/chatModel.js";
import { ElicitationState, IChatService } from "../../chat/common/chatService/chatService.js";
import { ElicitationKind, McpConnectionState, MpcResponseError } from "../common/mcpTypes.js";
import { mcpServerToSourceData } from "../common/mcpTypesUtils.js";
import { MCP } from "../common/modelContextProtocol.js";
const noneItem = { id: void 0, label: localize("mcp.elicit.enum.none", "None"), description: localize("mcp.elicit.enum.none.description", "No selection"), alwaysShow: true };
function isFormElicitation(params) {
  return params.mode === "form" || params.mode === void 0 && !!params.requestedSchema;
}
function isUrlElicitation(params) {
  return params.mode === "url";
}
function isLegacyTitledEnumSchema(schema) {
  const cast = schema;
  return cast.type === "string" && Array.isArray(cast.enum) && Array.isArray(cast.enumNames);
}
function isUntitledEnumSchema(schema) {
  const cast = schema;
  return cast.type === "string" && Array.isArray(cast.enum);
}
function isTitledSingleEnumSchema(schema) {
  const cast = schema;
  return cast.type === "string" && Array.isArray(cast.oneOf);
}
function isUntitledMultiEnumSchema(schema) {
  const cast = schema;
  return cast.type === "array" && !!cast.items?.enum;
}
function isTitledMultiEnumSchema(schema) {
  const cast = schema;
  return cast.type === "array" && !!cast.items?.anyOf;
}
let McpElicitationService = class {
  constructor(_notificationService, _quickInputService, _chatService, _openerService) {
    this._notificationService = _notificationService;
    this._quickInputService = _quickInputService;
    this._chatService = _chatService;
    this._openerService = _openerService;
  }
  elicit(server, context, elicitation, token) {
    if (isFormElicitation(elicitation)) {
      return this._elicitForm(server, context, elicitation, token);
    } else if (isUrlElicitation(elicitation)) {
      return this._elicitUrl(server, context, elicitation, token);
    } else {
      softAssertNever(elicitation);
      return Promise.reject(new MpcResponseError("Unsupported elicitation type", MCP.INVALID_PARAMS, void 0));
    }
  }
  async _elicitForm(server, context, elicitation, token) {
    const store = new DisposableStore();
    const value = await new Promise((resolve) => {
      const chatModel = context?.chatSessionResource && this._chatService.getSession(context.chatSessionResource);
      if (chatModel instanceof ChatModel) {
        const request = chatModel.getRequests().at(-1);
        if (request) {
          const { questions, idToPropertyMap } = this._convertSchemaToQuestions(elicitation);
          const carousel = new ChatQuestionCarouselData(
            questions,
            /* allowSkip */
            true,
            /* resolveId */
            void 0,
            /* data */
            void 0,
            /* isUsed */
            void 0,
            /* message */
            new MarkdownString(elicitation.message),
            /* source */
            mcpServerToSourceData(server)
          );
          chatModel.acceptResponseProgress(request, carousel);
          store.add(token.onCancellationRequested(() => {
            carousel.completion.complete({ answers: void 0 });
          }));
          carousel.completion.p.then((result) => {
            if (!result.answers) {
              resolve({ action: "cancel" });
            } else {
              const content = this._convertCarouselAnswersToElicitResult(
                result.answers,
                idToPropertyMap,
                elicitation.requestedSchema.properties
              );
              resolve({ action: "accept", content });
            }
          });
          return;
        }
      }
      const handle = this._notificationService.notify({
        message: elicitation.message,
        source: localize("mcp.elicit.source", "MCP Server ({0})", server.definition.label),
        severity: Severity.Info,
        actions: {
          primary: [store.add(new Action("mcp.elicit.give", localize("mcp.elicit.give", "Respond"), void 0, true, () => resolve(this._doElicitForm(elicitation, token))))],
          secondary: [store.add(new Action("mcp.elicit.cancel", localize("mcp.elicit.cancel", "Cancel"), void 0, true, () => resolve({ action: "decline" })))]
        }
      });
      store.add(handle.onDidClose(() => resolve({ action: "cancel" })));
      store.add(token.onCancellationRequested(() => resolve({ action: "cancel" })));
    }).finally(() => store.dispose());
    return { kind: ElicitationKind.Form, value, dispose: () => {
    } };
  }
  async _elicitUrl(server, context, elicitation, token) {
    const promiseStore = new DisposableStore();
    const completePromise = new Promise((resolve, reject) => {
      promiseStore.add(token.onCancellationRequested(() => reject(new CancellationError())));
      promiseStore.add(autorun((reader) => {
        const cnx = server.connection.read(reader);
        const handler = cnx?.handler.read(reader);
        if (handler) {
          reader.store.add(handler.onDidReceiveElicitationCompleteNotification((e) => {
            if (e.params.elicitationId === elicitation.elicitationId) {
              resolve();
            }
          }));
        } else if (!McpConnectionState.isRunning(server.connectionState.read(reader))) {
          reject(new CancellationError());
        }
      }));
    }).finally(() => promiseStore.dispose());
    const store = new DisposableStore();
    const value = await new Promise((resolve) => {
      const chatModel = context?.chatSessionResource && this._chatService.getSession(context.chatSessionResource);
      if (chatModel instanceof ChatModel) {
        const request = chatModel.getRequests().at(-1);
        if (request) {
          const part = new ChatElicitationRequestPart(
            localize("mcp.elicit.url.title", "Authorization Required"),
            new MarkdownString().appendText(elicitation.message).appendMarkdown("\n\n" + localize("mcp.elicit.url.instruction", "Open this URL?")).appendCodeblock("", elicitation.url),
            localize("msg.subtitle", "{0} (MCP Server)", server.definition.label),
            localize("mcp.elicit.url.open", "Open {0}", URI.parse(elicitation.url).authority),
            localize("mcp.elicit.reject", "Cancel"),
            async () => {
              const result = await this._doElicitUrl(elicitation, token);
              resolve(result);
              completePromise.then(() => part.hide());
              return result.action === "accept" ? ElicitationState.Accepted : ElicitationState.Rejected;
            },
            () => {
              resolve({ action: "decline" });
              return Promise.resolve(ElicitationState.Rejected);
            },
            mcpServerToSourceData(server)
          );
          chatModel.acceptResponseProgress(request, part);
        }
      } else {
        const handle = this._notificationService.notify({
          message: elicitation.message + " " + localize("mcp.elicit.url.instruction2", "This will open {0}", elicitation.url),
          source: localize("mcp.elicit.source", "MCP Server ({0})", server.definition.label),
          severity: Severity.Info,
          actions: {
            primary: [store.add(new Action("mcp.elicit.url.open2", localize("mcp.elicit.url.open2", "Open URL"), void 0, true, () => resolve(this._doElicitUrl(elicitation, token))))],
            secondary: [store.add(new Action("mcp.elicit.cancel", localize("mcp.elicit.cancel", "Cancel"), void 0, true, () => resolve({ action: "decline" })))]
          }
        });
        store.add(handle.onDidClose(() => resolve({ action: "cancel" })));
        store.add(token.onCancellationRequested(() => resolve({ action: "cancel" })));
      }
    }).finally(() => store.dispose());
    return {
      kind: ElicitationKind.URL,
      value,
      wait: completePromise,
      dispose: () => promiseStore.dispose()
    };
  }
  async _doElicitUrl(elicitation, token) {
    if (token.isCancellationRequested) {
      return { action: "cancel" };
    }
    try {
      if (await this._openerService.open(elicitation.url, { allowCommands: false })) {
        return { action: "accept" };
      }
    } catch {
    }
    return { action: "decline" };
  }
  async _doElicitForm(elicitation, token) {
    const quickPick = this._quickInputService.createQuickPick();
    const store = new DisposableStore();
    try {
      const properties = Object.entries(elicitation.requestedSchema.properties);
      const requiredFields = new Set(elicitation.requestedSchema.required || []);
      const results = {};
      const backSnapshots = [];
      quickPick.title = elicitation.message;
      quickPick.totalSteps = properties.length;
      quickPick.ignoreFocusOut = true;
      for (let i = 0; i < properties.length; i++) {
        const [propertyName, schema] = properties[i];
        const isRequired = requiredFields.has(propertyName);
        const restore = backSnapshots.at(i);
        store.clear();
        quickPick.step = i + 1;
        quickPick.title = schema.title || propertyName;
        quickPick.placeholder = this._getFieldPlaceholder(schema, isRequired);
        quickPick.value = restore?.value ?? "";
        quickPick.validationMessage = "";
        quickPick.buttons = i > 0 ? [this._quickInputService.backButton] : [];
        let result;
        if (schema.type === "boolean") {
          result = await this._handleEnumField(quickPick, { enum: [{ const: "true" }, { const: "false" }], default: schema.default ? String(schema.default) : void 0 }, isRequired, store, token);
          if (result.type === "value") {
            result.value = result.value === "true" ? true : false;
          }
        } else if (isLegacyTitledEnumSchema(schema)) {
          result = await this._handleEnumField(quickPick, { enum: schema.enum.map((v, i2) => ({ const: v, title: schema.enumNames[i2] })), default: schema.default }, isRequired, store, token);
        } else if (isUntitledEnumSchema(schema)) {
          result = await this._handleEnumField(quickPick, { enum: schema.enum.map((v) => ({ const: v })), default: schema.default }, isRequired, store, token);
        } else if (isTitledSingleEnumSchema(schema)) {
          result = await this._handleEnumField(quickPick, { enum: schema.oneOf, default: schema.default }, isRequired, store, token);
        } else if (isTitledMultiEnumSchema(schema)) {
          result = await this._handleMultiEnumField(quickPick, { enum: schema.items.anyOf, default: schema.default }, isRequired, store, token);
        } else if (isUntitledMultiEnumSchema(schema)) {
          result = await this._handleMultiEnumField(quickPick, { enum: schema.items.enum.map((v) => ({ const: v })), default: schema.default }, isRequired, store, token);
        } else {
          result = await this._handleInputField(quickPick, schema, isRequired, store, token);
          if (result.type === "value" && (schema.type === "number" || schema.type === "integer")) {
            result.value = Number(result.value);
          }
        }
        if (result.type === "back") {
          i -= 2;
          continue;
        }
        if (result.type === "cancel") {
          return { action: "cancel" };
        }
        backSnapshots[i] = { value: quickPick.value };
        if (result.value === void 0) {
          delete results[propertyName];
        } else {
          results[propertyName] = result.value;
        }
      }
      return {
        action: "accept",
        content: results
      };
    } finally {
      store.dispose();
      quickPick.dispose();
    }
  }
  _getFieldPlaceholder(schema, required) {
    let placeholder = schema.description || "";
    if (!required) {
      placeholder = placeholder ? `${placeholder} (${localize("optional", "Optional")})` : localize("optional", "Optional");
    }
    return placeholder;
  }
  async _handleEnumField(quickPick, schema, required, store, token) {
    const items = schema.enum.map(({ const: value, title }) => ({
      id: value,
      label: value,
      description: title
    }));
    if (!required) {
      items.push(noneItem);
    }
    quickPick.canSelectMany = false;
    quickPick.items = items;
    if (schema.default !== void 0) {
      quickPick.activeItems = items.filter((item) => item.id === schema.default);
    }
    return new Promise((resolve) => {
      store.add(token.onCancellationRequested(() => resolve({ type: "cancel" })));
      store.add(quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
          resolve({ type: "value", value: selected.id });
        }
      }));
      store.add(quickPick.onDidTriggerButton(() => resolve({ type: "back" })));
      store.add(quickPick.onDidHide(() => resolve({ type: "cancel" })));
      quickPick.show();
    });
  }
  async _handleMultiEnumField(quickPick, schema, required, store, token) {
    const items = schema.enum.map(({ const: value, title }) => ({
      id: value,
      label: value,
      description: title,
      picked: !!schema.default?.includes(value),
      pickable: true
    }));
    if (!required) {
      items.push(noneItem);
    }
    quickPick.canSelectMany = true;
    quickPick.items = items;
    return new Promise((resolve) => {
      store.add(token.onCancellationRequested(() => resolve({ type: "cancel" })));
      store.add(quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected.id === void 0) {
          resolve({ type: "value", value: void 0 });
        } else {
          resolve({ type: "value", value: quickPick.selectedItems.map((i) => i.id).filter(isDefined) });
        }
      }));
      store.add(quickPick.onDidTriggerButton(() => resolve({ type: "back" })));
      store.add(quickPick.onDidHide(() => resolve({ type: "cancel" })));
      quickPick.show();
    });
  }
  async _handleInputField(quickPick, schema, required, store, token) {
    quickPick.canSelectMany = false;
    const updateItems = () => {
      const items = [];
      if (quickPick.value) {
        const validation = this._validateInput(quickPick.value, schema);
        quickPick.validationMessage = validation.message;
        if (validation.isValid) {
          items.push({ id: "$current", label: `\u27A4 ${quickPick.value}` });
        }
      } else {
        quickPick.validationMessage = "";
        if (schema.default) {
          items.push({ id: "$default", label: `${schema.default}`, description: localize("mcp.elicit.useDefault", "Default value") });
        }
      }
      if (quickPick.validationMessage) {
        quickPick.severity = Severity.Warning;
      } else {
        quickPick.severity = Severity.Ignore;
        if (!required) {
          items.push(noneItem);
        }
      }
      quickPick.items = items;
    };
    updateItems();
    return new Promise((resolve) => {
      if (token.isCancellationRequested) {
        resolve({ type: "cancel" });
        return;
      }
      store.add(token.onCancellationRequested(() => resolve({ type: "cancel" })));
      store.add(quickPick.onDidChangeValue(updateItems));
      store.add(quickPick.onDidAccept(() => {
        const id = quickPick.selectedItems[0].id;
        if (!id) {
          resolve({ type: "value", value: void 0 });
        } else if (id === "$default") {
          resolve({ type: "value", value: String(schema.default) });
        } else if (!quickPick.validationMessage) {
          resolve({ type: "value", value: quickPick.value });
        }
      }));
      store.add(quickPick.onDidTriggerButton(() => resolve({ type: "back" })));
      store.add(quickPick.onDidHide(() => resolve({ type: "cancel" })));
      quickPick.show();
    });
  }
  _validateInput(value, schema) {
    switch (schema.type) {
      case "string":
        return this._validateString(value, schema);
      case "number":
      case "integer":
        return this._validateNumber(value, schema);
      default:
        assertNever(schema);
    }
  }
  _validateString(value, schema) {
    if (schema.minLength && value.length < schema.minLength) {
      return { isValid: false, message: localize("mcp.elicit.validation.minLength", "Minimum length is {0}", schema.minLength) };
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      return { isValid: false, message: localize("mcp.elicit.validation.maxLength", "Maximum length is {0}", schema.maxLength) };
    }
    if (schema.format) {
      const formatValid = this._validateStringFormat(value, schema.format);
      if (!formatValid.isValid) {
        return formatValid;
      }
    }
    return { isValid: true, parsedValue: value };
  }
  _validateStringFormat(value, format) {
    switch (format) {
      case "email":
        return value.includes("@") ? { isValid: true } : { isValid: false, message: localize("mcp.elicit.validation.email", "Please enter a valid email address") };
      case "uri":
        if (URL.canParse(value)) {
          return { isValid: true };
        } else {
          return { isValid: false, message: localize("mcp.elicit.validation.uri", "Please enter a valid URI") };
        }
      case "date": {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          return { isValid: false, message: localize("mcp.elicit.validation.date", "Please enter a valid date (YYYY-MM-DD)") };
        }
        const date = new Date(value);
        return !isNaN(date.getTime()) ? { isValid: true } : { isValid: false, message: localize("mcp.elicit.validation.date", "Please enter a valid date (YYYY-MM-DD)") };
      }
      case "date-time": {
        const dateTime = new Date(value);
        return !isNaN(dateTime.getTime()) ? { isValid: true } : { isValid: false, message: localize("mcp.elicit.validation.dateTime", "Please enter a valid date-time") };
      }
      default:
        return { isValid: true };
    }
  }
  _validateNumber(value, schema) {
    const parsed = Number(value);
    if (isNaN(parsed)) {
      return { isValid: false, message: localize("mcp.elicit.validation.number", "Please enter a valid number") };
    }
    if (schema.type === "integer" && !Number.isInteger(parsed)) {
      return { isValid: false, message: localize("mcp.elicit.validation.integer", "Please enter a valid integer") };
    }
    if (schema.minimum !== void 0 && parsed < schema.minimum) {
      return { isValid: false, message: localize("mcp.elicit.validation.minimum", "Minimum value is {0}", schema.minimum) };
    }
    if (schema.maximum !== void 0 && parsed > schema.maximum) {
      return { isValid: false, message: localize("mcp.elicit.validation.maximum", "Maximum value is {0}", schema.maximum) };
    }
    return { isValid: true, parsedValue: parsed };
  }
  /**
   * Converts an MCP elicitation schema into IChatQuestion[] for the carousel UI.
   * Returns the questions and a map from question ID to schema property name.
   */
  _convertSchemaToQuestions(elicitation) {
    const properties = Object.entries(elicitation.requestedSchema.properties);
    const requiredFields = new Set(elicitation.requestedSchema.required || []);
    const questions = [];
    const idToPropertyMap = /* @__PURE__ */ new Map();
    for (const [propertyName, schema] of properties) {
      const id = generateUuid();
      idToPropertyMap.set(id, propertyName);
      const title = schema.title || propertyName;
      const description = schema.description;
      const isRequired = requiredFields.has(propertyName);
      if (schema.type === "boolean") {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: [
            { id: "true", label: localize("mcp.elicit.true", "True"), value: "true" },
            { id: "false", label: localize("mcp.elicit.false", "False"), value: "false" }
          ],
          defaultValue: schema.default !== void 0 ? String(schema.default) : void 0
        });
      } else if (isLegacyTitledEnumSchema(schema)) {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.enum.map((v, i) => ({
            id: v,
            label: schema.enumNames[i] ? `${v} - ${schema.enumNames[i]}` : v,
            value: v
          })),
          defaultValue: schema.default
        });
      } else if (isTitledSingleEnumSchema(schema)) {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.oneOf.map(({ const: value, title: optTitle }) => ({
            id: value,
            label: optTitle ? `${value} - ${optTitle}` : value,
            value
          })),
          defaultValue: schema.default
        });
      } else if (isUntitledEnumSchema(schema)) {
        questions.push({
          id,
          type: "singleSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.enum.map((v) => ({ id: v, label: v, value: v })),
          defaultValue: schema.default
        });
      } else if (isTitledMultiEnumSchema(schema)) {
        questions.push({
          id,
          type: "multiSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.items.anyOf.map(({ const: value, title: optTitle }) => ({
            id: value,
            label: optTitle ? `${value} - ${optTitle}` : value,
            value
          })),
          defaultValue: schema.default
        });
      } else if (isUntitledMultiEnumSchema(schema)) {
        questions.push({
          id,
          type: "multiSelect",
          title,
          description,
          required: isRequired,
          allowFreeformInput: false,
          options: schema.items.enum.map((v) => ({ id: v, label: v, value: v })),
          defaultValue: schema.default
        });
      } else {
        const validation = {};
        if (schema.type === "string") {
          if (schema.minLength !== void 0) {
            validation.minLength = schema.minLength;
          }
          if (schema.maxLength !== void 0) {
            validation.maxLength = schema.maxLength;
          }
          if (schema.format) {
            validation.format = schema.format;
          }
        } else if (schema.type === "number" || schema.type === "integer") {
          if (schema.minimum !== void 0) {
            validation.minimum = schema.minimum;
          }
          if (schema.maximum !== void 0) {
            validation.maximum = schema.maximum;
          }
          if (schema.type === "integer") {
            validation.isInteger = true;
          }
        }
        questions.push({
          id,
          type: "text",
          title,
          description,
          required: isRequired,
          defaultValue: schema.default !== void 0 ? String(schema.default) : void 0,
          validation: Object.keys(validation).length > 0 ? validation : void 0
        });
      }
    }
    return { questions, idToPropertyMap };
  }
  /**
   * Converts carousel answers (keyed by question ID) back into the
   * MCP ElicitResult content format (keyed by schema property names),
   * coercing types as needed.
   */
  _convertCarouselAnswersToElicitResult(answers, idToPropertyMap, schemaProperties) {
    const content = {};
    for (const [questionId, answer] of Object.entries(answers)) {
      const propertyName = idToPropertyMap.get(questionId);
      if (!propertyName) {
        continue;
      }
      const schema = schemaProperties[propertyName];
      if (!schema) {
        continue;
      }
      let rawValue = answer;
      if (typeof answer === "object" && answer !== null) {
        const obj = answer;
        if ("selectedValue" in obj) {
          rawValue = obj.selectedValue;
        } else if ("selectedValues" in obj) {
          rawValue = obj.selectedValues;
        } else if ("freeformValue" in obj && obj.freeformValue) {
          rawValue = obj.freeformValue;
        }
      }
      if (rawValue === void 0 || rawValue === null) {
        continue;
      }
      if (schema.type === "boolean") {
        content[propertyName] = rawValue === "true" || rawValue === true;
      } else if (schema.type === "number" || schema.type === "integer") {
        const num = Number(rawValue);
        if (!isNaN(num)) {
          content[propertyName] = num;
        }
      } else if (schema.type === "array") {
        if (Array.isArray(rawValue)) {
          content[propertyName] = rawValue.map((v) => String(v));
        }
      } else {
        content[propertyName] = String(rawValue);
      }
    }
    return content;
  }
};
McpElicitationService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IOpenerService)
], McpElicitationService);
export {
  McpElicitationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcEVsaWNpdGF0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIsIHNvZnRBc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0IH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBFbGljaXRhdGlvblN0YXRlLCBJQ2hhdFF1ZXN0aW9uLCBJQ2hhdFF1ZXN0aW9uQW5zd2VycywgSUNoYXRRdWVzdGlvblZhbGlkYXRpb24sIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVsaWNpdGF0aW9uS2luZCwgRWxpY2l0UmVzdWx0LCBJRm9ybU1vZGVFbGljaXRSZXN1bHQsIElNY3BFbGljaXRhdGlvblNlcnZpY2UsIElNY3BTZXJ2ZXIsIElNY3BUb29sQ2FsbENvbnRleHQsIElVcmxNb2RlRWxpY2l0UmVzdWx0LCBNY3BDb25uZWN0aW9uU3RhdGUsIE1wY1Jlc3BvbnNlRXJyb3IgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgbWNwU2VydmVyVG9Tb3VyY2VEYXRhIH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzVXRpbHMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcblxuY29uc3Qgbm9uZUl0ZW06IElRdWlja1BpY2tJdGVtID0geyBpZDogdW5kZWZpbmVkLCBsYWJlbDogbG9jYWxpemUoJ21jcC5lbGljaXQuZW51bS5ub25lJywgJ05vbmUnKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AuZWxpY2l0LmVudW0ubm9uZS5kZXNjcmlwdGlvbicsICdObyBzZWxlY3Rpb24nKSwgYWx3YXlzU2hvdzogdHJ1ZSB9O1xuXG50eXBlIFByZTIwMjUxMTI1RWxpY2l0YXRpb25QYXJhbXMgPSBPbWl0PE1DUC5FbGljaXRSZXF1ZXN0Rm9ybVBhcmFtcywgJ21vZGUnPiAmIHsgbW9kZT86IHVuZGVmaW5lZCB9O1xuXG5mdW5jdGlvbiBpc0Zvcm1FbGljaXRhdGlvbihwYXJhbXM6IE1DUC5FbGljaXRSZXF1ZXN0WydwYXJhbXMnXSB8IFByZTIwMjUxMTI1RWxpY2l0YXRpb25QYXJhbXMpOiBwYXJhbXMgaXMgKE1DUC5FbGljaXRSZXF1ZXN0Rm9ybVBhcmFtcyB8IFByZTIwMjUxMTI1RWxpY2l0YXRpb25QYXJhbXMpIHtcblx0cmV0dXJuIHBhcmFtcy5tb2RlID09PSAnZm9ybScgfHwgKHBhcmFtcy5tb2RlID09PSB1bmRlZmluZWQgJiYgISEocGFyYW1zIGFzIFByZTIwMjUxMTI1RWxpY2l0YXRpb25QYXJhbXMpLnJlcXVlc3RlZFNjaGVtYSk7XG59XG5cbmZ1bmN0aW9uIGlzVXJsRWxpY2l0YXRpb24ocGFyYW1zOiBNQ1AuRWxpY2l0UmVxdWVzdFsncGFyYW1zJ10pOiBwYXJhbXMgaXMgTUNQLkVsaWNpdFJlcXVlc3RVUkxQYXJhbXMge1xuXHRyZXR1cm4gcGFyYW1zLm1vZGUgPT09ICd1cmwnO1xufVxuXG5mdW5jdGlvbiBpc0xlZ2FjeVRpdGxlZEVudW1TY2hlbWEoc2NoZW1hOiBNQ1AuUHJpbWl0aXZlU2NoZW1hRGVmaW5pdGlvbik6IHNjaGVtYSBpcyBNQ1AuTGVnYWN5VGl0bGVkRW51bVNjaGVtYSAmIHsgZW51bU5hbWVzOiBzdHJpbmdbXSB9IHtcblx0Y29uc3QgY2FzdCA9IHNjaGVtYSBhcyBNQ1AuTGVnYWN5VGl0bGVkRW51bVNjaGVtYTtcblx0cmV0dXJuIGNhc3QudHlwZSA9PT0gJ3N0cmluZycgJiYgQXJyYXkuaXNBcnJheShjYXN0LmVudW0pICYmIEFycmF5LmlzQXJyYXkoY2FzdC5lbnVtTmFtZXMpO1xufVxuXG5mdW5jdGlvbiBpc1VudGl0bGVkRW51bVNjaGVtYShzY2hlbWE6IE1DUC5QcmltaXRpdmVTY2hlbWFEZWZpbml0aW9uKTogc2NoZW1hIGlzIE1DUC5MZWdhY3lUaXRsZWRFbnVtU2NoZW1hIHwgTUNQLlVudGl0bGVkU2luZ2xlU2VsZWN0RW51bVNjaGVtYSB7XG5cdGNvbnN0IGNhc3QgPSBzY2hlbWEgYXMgTUNQLkxlZ2FjeVRpdGxlZEVudW1TY2hlbWEgfCBNQ1AuVW50aXRsZWRTaW5nbGVTZWxlY3RFbnVtU2NoZW1hO1xuXHRyZXR1cm4gY2FzdC50eXBlID09PSAnc3RyaW5nJyAmJiBBcnJheS5pc0FycmF5KGNhc3QuZW51bSk7XG59XG5cbmZ1bmN0aW9uIGlzVGl0bGVkU2luZ2xlRW51bVNjaGVtYShzY2hlbWE6IE1DUC5QcmltaXRpdmVTY2hlbWFEZWZpbml0aW9uKTogc2NoZW1hIGlzIE1DUC5UaXRsZWRTaW5nbGVTZWxlY3RFbnVtU2NoZW1hIHtcblx0Y29uc3QgY2FzdCA9IHNjaGVtYSBhcyBNQ1AuVGl0bGVkU2luZ2xlU2VsZWN0RW51bVNjaGVtYTtcblx0cmV0dXJuIGNhc3QudHlwZSA9PT0gJ3N0cmluZycgJiYgQXJyYXkuaXNBcnJheShjYXN0Lm9uZU9mKTtcbn1cblxuZnVuY3Rpb24gaXNVbnRpdGxlZE11bHRpRW51bVNjaGVtYShzY2hlbWE6IE1DUC5QcmltaXRpdmVTY2hlbWFEZWZpbml0aW9uKTogc2NoZW1hIGlzIE1DUC5VbnRpdGxlZE11bHRpU2VsZWN0RW51bVNjaGVtYSB7XG5cdGNvbnN0IGNhc3QgPSBzY2hlbWEgYXMgTUNQLlVudGl0bGVkTXVsdGlTZWxlY3RFbnVtU2NoZW1hO1xuXHRyZXR1cm4gY2FzdC50eXBlID09PSAnYXJyYXknICYmICEhY2FzdC5pdGVtcz8uZW51bTtcbn1cblxuZnVuY3Rpb24gaXNUaXRsZWRNdWx0aUVudW1TY2hlbWEoc2NoZW1hOiBNQ1AuUHJpbWl0aXZlU2NoZW1hRGVmaW5pdGlvbik6IHNjaGVtYSBpcyBNQ1AuVGl0bGVkTXVsdGlTZWxlY3RFbnVtU2NoZW1hIHtcblx0Y29uc3QgY2FzdCA9IHNjaGVtYSBhcyBNQ1AuVGl0bGVkTXVsdGlTZWxlY3RFbnVtU2NoZW1hO1xuXHRyZXR1cm4gY2FzdC50eXBlID09PSAnYXJyYXknICYmICEhY2FzdC5pdGVtcz8uYW55T2Y7XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BFbGljaXRhdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJTWNwRWxpY2l0YXRpb25TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBlbGljaXQoc2VydmVyOiBJTWNwU2VydmVyLCBjb250ZXh0OiBJTWNwVG9vbENhbGxDb250ZXh0IHwgdW5kZWZpbmVkLCBlbGljaXRhdGlvbjogTUNQLkVsaWNpdFJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEVsaWNpdFJlc3VsdD4ge1xuXHRcdGlmIChpc0Zvcm1FbGljaXRhdGlvbihlbGljaXRhdGlvbikpIHtcblx0XHRcdHJldHVybiB0aGlzLl9lbGljaXRGb3JtKHNlcnZlciwgY29udGV4dCwgZWxpY2l0YXRpb24sIHRva2VuKTtcblx0XHR9IGVsc2UgaWYgKGlzVXJsRWxpY2l0YXRpb24oZWxpY2l0YXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZWxpY2l0VXJsKHNlcnZlciwgY29udGV4dCwgZWxpY2l0YXRpb24sIHRva2VuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c29mdEFzc2VydE5ldmVyKGVsaWNpdGF0aW9uKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgTXBjUmVzcG9uc2VFcnJvcignVW5zdXBwb3J0ZWQgZWxpY2l0YXRpb24gdHlwZScsIE1DUC5JTlZBTElEX1BBUkFNUywgdW5kZWZpbmVkKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZWxpY2l0Rm9ybShzZXJ2ZXI6IElNY3BTZXJ2ZXIsIGNvbnRleHQ6IElNY3BUb29sQ2FsbENvbnRleHQgfCB1bmRlZmluZWQsIGVsaWNpdGF0aW9uOiBNQ1AuRWxpY2l0UmVxdWVzdEZvcm1QYXJhbXMgfCBQcmUyMDI1MTEyNUVsaWNpdGF0aW9uUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGb3JtTW9kZUVsaWNpdFJlc3VsdD4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgbmV3IFByb21pc2U8TUNQLkVsaWNpdFJlc3VsdD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBjaGF0TW9kZWwgPSBjb250ZXh0Py5jaGF0U2Vzc2lvblJlc291cmNlICYmIHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChjaGF0TW9kZWwgaW5zdGFuY2VvZiBDaGF0TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdFx0aWYgKHJlcXVlc3QpIHtcblx0XHRcdFx0XHRjb25zdCB7IHF1ZXN0aW9ucywgaWRUb1Byb3BlcnR5TWFwIH0gPSB0aGlzLl9jb252ZXJ0U2NoZW1hVG9RdWVzdGlvbnMoZWxpY2l0YXRpb24pO1xuXHRcdFx0XHRcdGNvbnN0IGNhcm91c2VsID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShcblx0XHRcdFx0XHRcdHF1ZXN0aW9ucyxcblx0XHRcdFx0XHRcdC8qIGFsbG93U2tpcCAqLyB0cnVlLFxuXHRcdFx0XHRcdFx0LyogcmVzb2x2ZUlkICovIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdC8qIGRhdGEgKi8gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0LyogaXNVc2VkICovIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdC8qIG1lc3NhZ2UgKi8gbmV3IE1hcmtkb3duU3RyaW5nKGVsaWNpdGF0aW9uLm1lc3NhZ2UpLFxuXHRcdFx0XHRcdFx0Lyogc291cmNlICovIG1jcFNlcnZlclRvU291cmNlRGF0YShzZXJ2ZXIpLFxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRjaGF0TW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBjYXJvdXNlbCk7XG5cblx0XHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5jb21wbGV0ZSh7IGFuc3dlcnM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0XHRjYXJvdXNlbC5jb21wbGV0aW9uLnAudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFyZXN1bHQuYW5zd2Vycykge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHsgYWN0aW9uOiAnY2FuY2VsJyB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLl9jb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzVG9FbGljaXRSZXN1bHQoXG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LmFuc3dlcnMsXG5cdFx0XHRcdFx0XHRcdFx0aWRUb1Byb3BlcnR5TWFwLFxuXHRcdFx0XHRcdFx0XHRcdGVsaWNpdGF0aW9uLnJlcXVlc3RlZFNjaGVtYS5wcm9wZXJ0aWVzLFxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHsgYWN0aW9uOiAnYWNjZXB0JywgY29udGVudCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRmFsbGJhY2s6IG5vIGNoYXQgc2Vzc2lvbiBcdTIxOTIgbm90aWZpY2F0aW9uICsgcXVpY2twaWNrXG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdG1lc3NhZ2U6IGVsaWNpdGF0aW9uLm1lc3NhZ2UsXG5cdFx0XHRcdHNvdXJjZTogbG9jYWxpemUoJ21jcC5lbGljaXQuc291cmNlJywgJ01DUCBTZXJ2ZXIgKHswfSknLCBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogW3N0b3JlLmFkZChuZXcgQWN0aW9uKCdtY3AuZWxpY2l0LmdpdmUnLCBsb2NhbGl6ZSgnbWNwLmVsaWNpdC5naXZlJywgJ1Jlc3BvbmQnKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiByZXNvbHZlKHRoaXMuX2RvRWxpY2l0Rm9ybShlbGljaXRhdGlvbiwgdG9rZW4pKSkpXSxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtzdG9yZS5hZGQobmV3IEFjdGlvbignbWNwLmVsaWNpdC5jYW5jZWwnLCBsb2NhbGl6ZSgnbWNwLmVsaWNpdC5jYW5jZWwnLCAnQ2FuY2VsJyksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gcmVzb2x2ZSh7IGFjdGlvbjogJ2RlY2xpbmUnIH0pKSldLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHN0b3JlLmFkZChoYW5kbGUub25EaWRDbG9zZSgoKSA9PiByZXNvbHZlKHsgYWN0aW9uOiAnY2FuY2VsJyB9KSkpO1xuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmUoeyBhY3Rpb246ICdjYW5jZWwnIH0pKSk7XG5cblx0XHR9KS5maW5hbGx5KCgpID0+IHN0b3JlLmRpc3Bvc2UoKSk7XG5cblx0XHRyZXR1cm4geyBraW5kOiBFbGljaXRhdGlvbktpbmQuRm9ybSwgdmFsdWUsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZWxpY2l0VXJsKHNlcnZlcjogSU1jcFNlcnZlciwgY29udGV4dDogSU1jcFRvb2xDYWxsQ29udGV4dCB8IHVuZGVmaW5lZCwgZWxpY2l0YXRpb246IE1DUC5FbGljaXRSZXF1ZXN0VVJMUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElVcmxNb2RlRWxpY2l0UmVzdWx0PiB7XG5cdFx0Y29uc3QgcHJvbWlzZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gV2UgY3JlYXRlIHRoaXMgYWhlYWQgb2YgdGltZSBpbiBjYXNlIGUuZy4gYSB1c2VyIG1hbnVhbGx5IG9wZW5zIHRoZSBVUkwgYmVmb3JlaGFuZFxuXHRcdGNvbnN0IGNvbXBsZXRlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHByb21pc2VTdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKSkpO1xuXHRcdFx0cHJvbWlzZVN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGNueCA9IHNlcnZlci5jb25uZWN0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaGFuZGxlciA9IGNueD8uaGFuZGxlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChoYW5kbGVyKSB7XG5cdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChoYW5kbGVyLm9uRGlkUmVjZWl2ZUVsaWNpdGF0aW9uQ29tcGxldGVOb3RpZmljYXRpb24oZSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZS5wYXJhbXMuZWxpY2l0YXRpb25JZCA9PT0gZWxpY2l0YXRpb24uZWxpY2l0YXRpb25JZCkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFNY3BDb25uZWN0aW9uU3RhdGUuaXNSdW5uaW5nKHNlcnZlci5jb25uZWN0aW9uU3RhdGUucmVhZChyZWFkZXIpKSkge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHByb21pc2VTdG9yZS5kaXNwb3NlKCkpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBuZXcgUHJvbWlzZTxNQ1AuRWxpY2l0UmVzdWx0PihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNvbnRleHQ/LmNoYXRTZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGNoYXRNb2RlbCBpbnN0YW5jZW9mIENoYXRNb2RlbCkge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0ID0gY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQoXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnbWNwLmVsaWNpdC51cmwudGl0bGUnLCAnQXV0aG9yaXphdGlvbiBSZXF1aXJlZCcpLFxuXHRcdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChlbGljaXRhdGlvbi5tZXNzYWdlKVxuXHRcdFx0XHRcdFx0XHQuYXBwZW5kTWFya2Rvd24oJ1xcblxcbicgKyBsb2NhbGl6ZSgnbWNwLmVsaWNpdC51cmwuaW5zdHJ1Y3Rpb24nLCAnT3BlbiB0aGlzIFVSTD8nKSlcblx0XHRcdFx0XHRcdFx0LmFwcGVuZENvZGVibG9jaygnJywgZWxpY2l0YXRpb24udXJsKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdtc2cuc3VidGl0bGUnLCBcInswfSAoTUNQIFNlcnZlcilcIiwgc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ21jcC5lbGljaXQudXJsLm9wZW4nLCAnT3BlbiB7MH0nLCBVUkkucGFyc2UoZWxpY2l0YXRpb24udXJsKS5hdXRob3JpdHkpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ21jcC5lbGljaXQucmVqZWN0JywgJ0NhbmNlbCcpLFxuXHRcdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kb0VsaWNpdFVybChlbGljaXRhdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdGNvbXBsZXRlUHJvbWlzZS50aGVuKCgpID0+IHBhcnQuaGlkZSgpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdC5hY3Rpb24gPT09ICdhY2NlcHQnID8gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZCA6IEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHsgYWN0aW9uOiAnZGVjbGluZScgfSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bWNwU2VydmVyVG9Tb3VyY2VEYXRhKHNlcnZlciksXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRjaGF0TW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBwYXJ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGVsaWNpdGF0aW9uLm1lc3NhZ2UgKyAnICcgKyBsb2NhbGl6ZSgnbWNwLmVsaWNpdC51cmwuaW5zdHJ1Y3Rpb24yJywgJ1RoaXMgd2lsbCBvcGVuIHswfScsIGVsaWNpdGF0aW9uLnVybCksXG5cdFx0XHRcdFx0c291cmNlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC5zb3VyY2UnLCAnTUNQIFNlcnZlciAoezB9KScsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBbc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ21jcC5lbGljaXQudXJsLm9wZW4yJywgbG9jYWxpemUoJ21jcC5lbGljaXQudXJsLm9wZW4yJywgJ09wZW4gVVJMJyksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gcmVzb2x2ZSh0aGlzLl9kb0VsaWNpdFVybChlbGljaXRhdGlvbiwgdG9rZW4pKSkpXSxcblx0XHRcdFx0XHRcdHNlY29uZGFyeTogW3N0b3JlLmFkZChuZXcgQWN0aW9uKCdtY3AuZWxpY2l0LmNhbmNlbCcsIGxvY2FsaXplKCdtY3AuZWxpY2l0LmNhbmNlbCcsICdDYW5jZWwnKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiByZXNvbHZlKHsgYWN0aW9uOiAnZGVjbGluZScgfSkpKV0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c3RvcmUuYWRkKGhhbmRsZS5vbkRpZENsb3NlKCgpID0+IHJlc29sdmUoeyBhY3Rpb246ICdjYW5jZWwnIH0pKSk7XG5cdFx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiByZXNvbHZlKHsgYWN0aW9uOiAnY2FuY2VsJyB9KSkpO1xuXHRcdFx0fVxuXHRcdH0pLmZpbmFsbHkoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBFbGljaXRhdGlvbktpbmQuVVJMLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHR3YWl0OiBjb21wbGV0ZVByb21pc2UsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBwcm9taXNlU3RvcmUuZGlzcG9zZSgpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb0VsaWNpdFVybChlbGljaXRhdGlvbjogTUNQLkVsaWNpdFJlcXVlc3RVUkxQYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkVsaWNpdFJlc3VsdD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnY2FuY2VsJyB9O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKGVsaWNpdGF0aW9uLnVybCwgeyBhbGxvd0NvbW1hbmRzOiBmYWxzZSB9KSkge1xuXHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdhY2NlcHQnIH07XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmVkXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWN0aW9uOiAnZGVjbGluZScgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvRWxpY2l0Rm9ybShlbGljaXRhdGlvbjogTUNQLkVsaWNpdFJlcXVlc3RGb3JtUGFyYW1zIHwgUHJlMjAyNTExMjVFbGljaXRhdGlvblBhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuRWxpY2l0UmVzdWx0PiB7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPigpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSBPYmplY3QuZW50cmllcyhlbGljaXRhdGlvbi5yZXF1ZXN0ZWRTY2hlbWEucHJvcGVydGllcyk7XG5cdFx0XHRjb25zdCByZXF1aXJlZEZpZWxkcyA9IG5ldyBTZXQoZWxpY2l0YXRpb24ucmVxdWVzdGVkU2NoZW1hLnJlcXVpcmVkIHx8IFtdKTtcblx0XHRcdGNvbnN0IHJlc3VsdHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4gfCBzdHJpbmdbXT4gPSB7fTtcblx0XHRcdGNvbnN0IGJhY2tTbmFwc2hvdHM6IHsgdmFsdWU6IHN0cmluZzsgdmFsaWRhdGlvbk1lc3NhZ2U/OiBzdHJpbmcgfVtdID0gW107XG5cblx0XHRcdHF1aWNrUGljay50aXRsZSA9IGVsaWNpdGF0aW9uLm1lc3NhZ2U7XG5cdFx0XHRxdWlja1BpY2sudG90YWxTdGVwcyA9IHByb3BlcnRpZXMubGVuZ3RoO1xuXHRcdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwcm9wZXJ0aWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IFtwcm9wZXJ0eU5hbWUsIHNjaGVtYV0gPSBwcm9wZXJ0aWVzW2ldO1xuXHRcdFx0XHRjb25zdCBpc1JlcXVpcmVkID0gcmVxdWlyZWRGaWVsZHMuaGFzKHByb3BlcnR5TmFtZSk7XG5cdFx0XHRcdGNvbnN0IHJlc3RvcmUgPSBiYWNrU25hcHNob3RzLmF0KGkpO1xuXG5cdFx0XHRcdHN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdHF1aWNrUGljay5zdGVwID0gaSArIDE7XG5cdFx0XHRcdHF1aWNrUGljay50aXRsZSA9IHNjaGVtYS50aXRsZSB8fCBwcm9wZXJ0eU5hbWU7XG5cdFx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IHRoaXMuX2dldEZpZWxkUGxhY2Vob2xkZXIoc2NoZW1hLCBpc1JlcXVpcmVkKTtcblx0XHRcdFx0cXVpY2tQaWNrLnZhbHVlID0gcmVzdG9yZT8udmFsdWUgPz8gJyc7XG5cdFx0XHRcdHF1aWNrUGljay52YWxpZGF0aW9uTWVzc2FnZSA9ICcnO1xuXHRcdFx0XHRxdWlja1BpY2suYnV0dG9ucyA9IGkgPiAwID8gW3RoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b25dIDogW107XG5cblx0XHRcdFx0bGV0IHJlc3VsdDogeyB0eXBlOiAndmFsdWUnOyB2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHVuZGVmaW5lZCB8IHN0cmluZ1tdIH0gfCB7IHR5cGU6ICdiYWNrJyB9IHwgeyB0eXBlOiAnY2FuY2VsJyB9O1xuXHRcdFx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZUVudW1GaWVsZChxdWlja1BpY2ssIHsgZW51bTogW3sgY29uc3Q6ICd0cnVlJyB9LCB7IGNvbnN0OiAnZmFsc2UnIH1dLCBkZWZhdWx0OiBzY2hlbWEuZGVmYXVsdCA/IFN0cmluZyhzY2hlbWEuZGVmYXVsdCkgOiB1bmRlZmluZWQgfSwgaXNSZXF1aXJlZCwgc3RvcmUsIHRva2VuKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0LnR5cGUgPT09ICd2YWx1ZScpIHsgcmVzdWx0LnZhbHVlID0gcmVzdWx0LnZhbHVlID09PSAndHJ1ZScgPyB0cnVlIDogZmFsc2U7IH1cblx0XHRcdFx0fSBlbHNlIGlmIChpc0xlZ2FjeVRpdGxlZEVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZUVudW1GaWVsZChxdWlja1BpY2ssIHsgZW51bTogc2NoZW1hLmVudW0ubWFwKCh2LCBpKSA9PiAoeyBjb25zdDogdiwgdGl0bGU6IHNjaGVtYS5lbnVtTmFtZXNbaV0gfSkpLCBkZWZhdWx0OiBzY2hlbWEuZGVmYXVsdCB9LCBpc1JlcXVpcmVkLCBzdG9yZSwgdG9rZW4pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzVW50aXRsZWRFbnVtU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVFbnVtRmllbGQocXVpY2tQaWNrLCB7IGVudW06IHNjaGVtYS5lbnVtLm1hcCh2ID0+ICh7IGNvbnN0OiB2IH0pKSwgZGVmYXVsdDogc2NoZW1hLmRlZmF1bHQgfSwgaXNSZXF1aXJlZCwgc3RvcmUsIHRva2VuKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1RpdGxlZFNpbmdsZUVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZUVudW1GaWVsZChxdWlja1BpY2ssIHsgZW51bTogc2NoZW1hLm9uZU9mLCBkZWZhdWx0OiBzY2hlbWEuZGVmYXVsdCB9LCBpc1JlcXVpcmVkLCBzdG9yZSwgdG9rZW4pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzVGl0bGVkTXVsdGlFbnVtU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVNdWx0aUVudW1GaWVsZChxdWlja1BpY2ssIHsgZW51bTogc2NoZW1hLml0ZW1zLmFueU9mLCBkZWZhdWx0OiBzY2hlbWEuZGVmYXVsdCB9LCBpc1JlcXVpcmVkLCBzdG9yZSwgdG9rZW4pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzVW50aXRsZWRNdWx0aUVudW1TY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZU11bHRpRW51bUZpZWxkKHF1aWNrUGljaywgeyBlbnVtOiBzY2hlbWEuaXRlbXMuZW51bS5tYXAodiA9PiAoeyBjb25zdDogdiB9KSksIGRlZmF1bHQ6IHNjaGVtYS5kZWZhdWx0IH0sIGlzUmVxdWlyZWQsIHN0b3JlLCB0b2tlbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlSW5wdXRGaWVsZChxdWlja1BpY2ssIHNjaGVtYSwgaXNSZXF1aXJlZCwgc3RvcmUsIHRva2VuKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0LnR5cGUgPT09ICd2YWx1ZScgJiYgKHNjaGVtYS50eXBlID09PSAnbnVtYmVyJyB8fCBzY2hlbWEudHlwZSA9PT0gJ2ludGVnZXInKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnZhbHVlID0gTnVtYmVyKHJlc3VsdC52YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlc3VsdC50eXBlID09PSAnYmFjaycpIHtcblx0XHRcdFx0XHRpIC09IDI7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlc3VsdC50eXBlID09PSAnY2FuY2VsJykge1xuXHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogJ2NhbmNlbCcgfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJhY2tTbmFwc2hvdHNbaV0gPSB7IHZhbHVlOiBxdWlja1BpY2sudmFsdWUgfTtcblxuXHRcdFx0XHRpZiAocmVzdWx0LnZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRkZWxldGUgcmVzdWx0c1twcm9wZXJ0eU5hbWVdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdHNbcHJvcGVydHlOYW1lXSA9IHJlc3VsdC52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhY3Rpb246ICdhY2NlcHQnLFxuXHRcdFx0XHRjb250ZW50OiByZXN1bHRzLFxuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRGaWVsZFBsYWNlaG9sZGVyKHNjaGVtYTogTUNQLlByaW1pdGl2ZVNjaGVtYURlZmluaXRpb24sIHJlcXVpcmVkOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRsZXQgcGxhY2Vob2xkZXIgPSBzY2hlbWEuZGVzY3JpcHRpb24gfHwgJyc7XG5cdFx0aWYgKCFyZXF1aXJlZCkge1xuXHRcdFx0cGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlciA/IGAke3BsYWNlaG9sZGVyfSAoJHtsb2NhbGl6ZSgnb3B0aW9uYWwnLCAnT3B0aW9uYWwnKX0pYCA6IGxvY2FsaXplKCdvcHRpb25hbCcsICdPcHRpb25hbCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGxhY2Vob2xkZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVFbnVtRmllbGQoXG5cdFx0cXVpY2tQaWNrOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPixcblx0XHRzY2hlbWE6IHsgZGVmYXVsdD86IHN0cmluZzsgZW51bTogeyBjb25zdDogc3RyaW5nOyB0aXRsZT86IHN0cmluZyB9W10gfSxcblx0XHRyZXF1aXJlZDogYm9vbGVhbixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuXHQpIHtcblx0XHRjb25zdCBpdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IHNjaGVtYS5lbnVtLm1hcCgoeyBjb25zdDogdmFsdWUsIHRpdGxlIH0pID0+ICh7XG5cdFx0XHRpZDogdmFsdWUsXG5cdFx0XHRsYWJlbDogdmFsdWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGl0bGUsXG5cdFx0fSkpO1xuXG5cdFx0aWYgKCFyZXF1aXJlZCkge1xuXHRcdFx0aXRlbXMucHVzaChub25lSXRlbSk7XG5cdFx0fVxuXG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSBmYWxzZTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRpZiAoc2NoZW1hLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5pZCA9PT0gc2NoZW1hLmRlZmF1bHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx7IHR5cGU6ICd2YWx1ZSc7IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHsgdHlwZTogJ2JhY2snIH0gfCB7IHR5cGU6ICdjYW5jZWwnIH0+KHJlc29sdmUgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnY2FuY2VsJyB9KSkpO1xuXHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmIChzZWxlY3RlZCkge1xuXHRcdFx0XHRcdHJlc29sdmUoeyB0eXBlOiAndmFsdWUnLCB2YWx1ZTogc2VsZWN0ZWQuaWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnYmFjaycgfSkpKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnY2FuY2VsJyB9KSkpO1xuXG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlTXVsdGlFbnVtRmllbGQoXG5cdFx0cXVpY2tQaWNrOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPixcblx0XHRzY2hlbWE6IHsgZGVmYXVsdD86IHN0cmluZ1tdOyBlbnVtOiB7IGNvbnN0OiBzdHJpbmc7IHRpdGxlPzogc3RyaW5nIH1bXSB9LFxuXHRcdHJlcXVpcmVkOiBib29sZWFuLFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG5cdCkge1xuXHRcdGNvbnN0IGl0ZW1zOiBJUXVpY2tQaWNrSXRlbVtdID0gc2NoZW1hLmVudW0ubWFwKCh7IGNvbnN0OiB2YWx1ZSwgdGl0bGUgfSkgPT4gKHtcblx0XHRcdGlkOiB2YWx1ZSxcblx0XHRcdGxhYmVsOiB2YWx1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aXRsZSxcblx0XHRcdHBpY2tlZDogISFzY2hlbWEuZGVmYXVsdD8uaW5jbHVkZXModmFsdWUpLFxuXHRcdFx0cGlja2FibGU6IHRydWUsXG5cdFx0fSkpO1xuXG5cdFx0aWYgKCFyZXF1aXJlZCkge1xuXHRcdFx0aXRlbXMucHVzaChub25lSXRlbSk7XG5cdFx0fVxuXG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHsgdHlwZTogJ3ZhbHVlJzsgdmFsdWU6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIH0gfCB7IHR5cGU6ICdiYWNrJyB9IHwgeyB0eXBlOiAnY2FuY2VsJyB9PihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiByZXNvbHZlKHsgdHlwZTogJ2NhbmNlbCcgfSkpKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWQuaWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJlc29sdmUoeyB0eXBlOiAndmFsdWUnLCB2YWx1ZTogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoeyB0eXBlOiAndmFsdWUnLCB2YWx1ZTogcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMubWFwKGkgPT4gaS5pZCkuZmlsdGVyKGlzRGVmaW5lZCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnYmFjaycgfSkpKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnY2FuY2VsJyB9KSkpO1xuXG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlSW5wdXRGaWVsZChcblx0XHRxdWlja1BpY2s6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+LFxuXHRcdHNjaGVtYTogTUNQLk51bWJlclNjaGVtYSB8IE1DUC5TdHJpbmdTY2hlbWEsXG5cdFx0cmVxdWlyZWQ6IGJvb2xlYW4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW5cblx0KSB7XG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHVwZGF0ZUl0ZW1zID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRcdGlmIChxdWlja1BpY2sudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgdmFsaWRhdGlvbiA9IHRoaXMuX3ZhbGlkYXRlSW5wdXQocXVpY2tQaWNrLnZhbHVlLCBzY2hlbWEpO1xuXHRcdFx0XHRxdWlja1BpY2sudmFsaWRhdGlvbk1lc3NhZ2UgPSB2YWxpZGF0aW9uLm1lc3NhZ2U7XG5cdFx0XHRcdGlmICh2YWxpZGF0aW9uLmlzVmFsaWQpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgaWQ6ICckY3VycmVudCcsIGxhYmVsOiBgXFx1MjdBNCAke3F1aWNrUGljay52YWx1ZX1gIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdWlja1BpY2sudmFsaWRhdGlvbk1lc3NhZ2UgPSAnJztcblxuXHRcdFx0XHRpZiAoc2NoZW1hLmRlZmF1bHQpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgaWQ6ICckZGVmYXVsdCcsIGxhYmVsOiBgJHtzY2hlbWEuZGVmYXVsdH1gLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC5lbGljaXQudXNlRGVmYXVsdCcsICdEZWZhdWx0IHZhbHVlJykgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXG5cdFx0XHRpZiAocXVpY2tQaWNrLnZhbGlkYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdHF1aWNrUGljay5zZXZlcml0eSA9IFNldmVyaXR5Lldhcm5pbmc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdWlja1BpY2suc2V2ZXJpdHkgPSBTZXZlcml0eS5JZ25vcmU7XG5cdFx0XHRcdGlmICghcmVxdWlyZWQpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKG5vbmVJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHR9O1xuXG5cdFx0dXBkYXRlSXRlbXMoKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx7IHR5cGU6ICd2YWx1ZSc7IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHsgdHlwZTogJ2JhY2snIH0gfCB7IHR5cGU6ICdjYW5jZWwnIH0+KHJlc29sdmUgPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJlc29sdmUoeyB0eXBlOiAnY2FuY2VsJyB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVzb2x2ZSh7IHR5cGU6ICdjYW5jZWwnIH0pKSk7XG5cdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkQ2hhbmdlVmFsdWUodXBkYXRlSXRlbXMpKTtcblx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpZCA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdLmlkO1xuXHRcdFx0XHRpZiAoIWlkKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IHR5cGU6ICd2YWx1ZScsIHZhbHVlOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaWQgPT09ICckZGVmYXVsdCcpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgdHlwZTogJ3ZhbHVlJywgdmFsdWU6IFN0cmluZyhzY2hlbWEuZGVmYXVsdCkgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXF1aWNrUGljay52YWxpZGF0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRcdHJlc29sdmUoeyB0eXBlOiAndmFsdWUnLCB2YWx1ZTogcXVpY2tQaWNrLnZhbHVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkVHJpZ2dlckJ1dHRvbigoKSA9PiByZXNvbHZlKHsgdHlwZTogJ2JhY2snIH0pKSk7XG5cdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiByZXNvbHZlKHsgdHlwZTogJ2NhbmNlbCcgfSkpKTtcblxuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlSW5wdXQodmFsdWU6IHN0cmluZywgc2NoZW1hOiBNQ1AuTnVtYmVyU2NoZW1hIHwgTUNQLlN0cmluZ1NjaGVtYSk6IHsgaXNWYWxpZDogYm9vbGVhbjsgbWVzc2FnZT86IHN0cmluZyB9IHtcblx0XHRzd2l0Y2ggKHNjaGVtYS50eXBlKSB7XG5cdFx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGVTdHJpbmcodmFsdWUsIHNjaGVtYSk7XG5cdFx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0Y2FzZSAnaW50ZWdlcic6XG5cdFx0XHRcdHJldHVybiB0aGlzLl92YWxpZGF0ZU51bWJlcih2YWx1ZSwgc2NoZW1hKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGFzc2VydE5ldmVyKHNjaGVtYSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVTdHJpbmcodmFsdWU6IHN0cmluZywgc2NoZW1hOiBNQ1AuU3RyaW5nU2NoZW1hKTogeyBpc1ZhbGlkOiBib29sZWFuOyBwYXJzZWRWYWx1ZT86IHN0cmluZzsgbWVzc2FnZT86IHN0cmluZyB9IHtcblx0XHRpZiAoc2NoZW1hLm1pbkxlbmd0aCAmJiB2YWx1ZS5sZW5ndGggPCBzY2hlbWEubWluTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWVzc2FnZTogbG9jYWxpemUoJ21jcC5lbGljaXQudmFsaWRhdGlvbi5taW5MZW5ndGgnLCAnTWluaW11bSBsZW5ndGggaXMgezB9Jywgc2NoZW1hLm1pbkxlbmd0aCkgfTtcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS5tYXhMZW5ndGggJiYgdmFsdWUubGVuZ3RoID4gc2NoZW1hLm1heExlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24ubWF4TGVuZ3RoJywgJ01heGltdW0gbGVuZ3RoIGlzIHswfScsIHNjaGVtYS5tYXhMZW5ndGgpIH07XG5cdFx0fVxuXHRcdGlmIChzY2hlbWEuZm9ybWF0KSB7XG5cdFx0XHRjb25zdCBmb3JtYXRWYWxpZCA9IHRoaXMuX3ZhbGlkYXRlU3RyaW5nRm9ybWF0KHZhbHVlLCBzY2hlbWEuZm9ybWF0KTtcblx0XHRcdGlmICghZm9ybWF0VmFsaWQuaXNWYWxpZCkge1xuXHRcdFx0XHRyZXR1cm4gZm9ybWF0VmFsaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGlzVmFsaWQ6IHRydWUsIHBhcnNlZFZhbHVlOiB2YWx1ZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVTdHJpbmdGb3JtYXQodmFsdWU6IHN0cmluZywgZm9ybWF0OiBzdHJpbmcpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IG1lc3NhZ2U/OiBzdHJpbmcgfSB7XG5cdFx0c3dpdGNoIChmb3JtYXQpIHtcblx0XHRcdGNhc2UgJ2VtYWlsJzpcblx0XHRcdFx0cmV0dXJuIHZhbHVlLmluY2x1ZGVzKCdAJylcblx0XHRcdFx0XHQ/IHsgaXNWYWxpZDogdHJ1ZSB9XG5cdFx0XHRcdFx0OiB7IGlzVmFsaWQ6IGZhbHNlLCBtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC52YWxpZGF0aW9uLmVtYWlsJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGVtYWlsIGFkZHJlc3MnKSB9O1xuXHRcdFx0Y2FzZSAndXJpJzpcblx0XHRcdFx0aWYgKFVSTC5jYW5QYXJzZSh2YWx1ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiB0cnVlIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24udXJpJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIFVSSScpIH07XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgJ2RhdGUnOiB7XG5cdFx0XHRcdGNvbnN0IGRhdGVSZWdleCA9IC9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLztcblx0XHRcdFx0aWYgKCFkYXRlUmVnZXgudGVzdCh2YWx1ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWVzc2FnZTogbG9jYWxpemUoJ21jcC5lbGljaXQudmFsaWRhdGlvbi5kYXRlJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGRhdGUgKFlZWVktTU0tREQpJykgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkYXRlID0gbmV3IERhdGUodmFsdWUpO1xuXHRcdFx0XHRyZXR1cm4gIWlzTmFOKGRhdGUuZ2V0VGltZSgpKVxuXHRcdFx0XHRcdD8geyBpc1ZhbGlkOiB0cnVlIH1cblx0XHRcdFx0XHQ6IHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24uZGF0ZScsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBkYXRlIChZWVlZLU1NLUREKScpIH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdkYXRlLXRpbWUnOiB7XG5cdFx0XHRcdGNvbnN0IGRhdGVUaW1lID0gbmV3IERhdGUodmFsdWUpO1xuXHRcdFx0XHRyZXR1cm4gIWlzTmFOKGRhdGVUaW1lLmdldFRpbWUoKSlcblx0XHRcdFx0XHQ/IHsgaXNWYWxpZDogdHJ1ZSB9XG5cdFx0XHRcdFx0OiB7IGlzVmFsaWQ6IGZhbHNlLCBtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC52YWxpZGF0aW9uLmRhdGVUaW1lJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGRhdGUtdGltZScpIH07XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiB0cnVlIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVOdW1iZXIodmFsdWU6IHN0cmluZywgc2NoZW1hOiBNQ1AuTnVtYmVyU2NoZW1hKTogeyBpc1ZhbGlkOiBib29sZWFuOyBwYXJzZWRWYWx1ZT86IG51bWJlcjsgbWVzc2FnZT86IHN0cmluZyB9IHtcblx0XHRjb25zdCBwYXJzZWQgPSBOdW1iZXIodmFsdWUpO1xuXHRcdGlmIChpc05hTihwYXJzZWQpKSB7XG5cdFx0XHRyZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgbWVzc2FnZTogbG9jYWxpemUoJ21jcC5lbGljaXQudmFsaWRhdGlvbi5udW1iZXInLCAnUGxlYXNlIGVudGVyIGEgdmFsaWQgbnVtYmVyJykgfTtcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS50eXBlID09PSAnaW50ZWdlcicgJiYgIU51bWJlci5pc0ludGVnZXIocGFyc2VkKSkge1xuXHRcdFx0cmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZWxpY2l0LnZhbGlkYXRpb24uaW50ZWdlcicsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBpbnRlZ2VyJykgfTtcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS5taW5pbXVtICE9PSB1bmRlZmluZWQgJiYgcGFyc2VkIDwgc2NoZW1hLm1pbmltdW0pIHtcblx0XHRcdHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC52YWxpZGF0aW9uLm1pbmltdW0nLCAnTWluaW11bSB2YWx1ZSBpcyB7MH0nLCBzY2hlbWEubWluaW11bSkgfTtcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS5tYXhpbXVtICE9PSB1bmRlZmluZWQgJiYgcGFyc2VkID4gc2NoZW1hLm1heGltdW0pIHtcblx0XHRcdHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC52YWxpZGF0aW9uLm1heGltdW0nLCAnTWF4aW11bSB2YWx1ZSBpcyB7MH0nLCBzY2hlbWEubWF4aW11bSkgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgaXNWYWxpZDogdHJ1ZSwgcGFyc2VkVmFsdWU6IHBhcnNlZCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGFuIE1DUCBlbGljaXRhdGlvbiBzY2hlbWEgaW50byBJQ2hhdFF1ZXN0aW9uW10gZm9yIHRoZSBjYXJvdXNlbCBVSS5cblx0ICogUmV0dXJucyB0aGUgcXVlc3Rpb25zIGFuZCBhIG1hcCBmcm9tIHF1ZXN0aW9uIElEIHRvIHNjaGVtYSBwcm9wZXJ0eSBuYW1lLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29udmVydFNjaGVtYVRvUXVlc3Rpb25zKGVsaWNpdGF0aW9uOiBNQ1AuRWxpY2l0UmVxdWVzdEZvcm1QYXJhbXMgfCBQcmUyMDI1MTEyNUVsaWNpdGF0aW9uUGFyYW1zKTogeyBxdWVzdGlvbnM6IElDaGF0UXVlc3Rpb25bXTsgaWRUb1Byb3BlcnR5TWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+IH0ge1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBPYmplY3QuZW50cmllcyhlbGljaXRhdGlvbi5yZXF1ZXN0ZWRTY2hlbWEucHJvcGVydGllcyk7XG5cdFx0Y29uc3QgcmVxdWlyZWRGaWVsZHMgPSBuZXcgU2V0KGVsaWNpdGF0aW9uLnJlcXVlc3RlZFNjaGVtYS5yZXF1aXJlZCB8fCBbXSk7XG5cdFx0Y29uc3QgcXVlc3Rpb25zOiBJQ2hhdFF1ZXN0aW9uW10gPSBbXTtcblx0XHRjb25zdCBpZFRvUHJvcGVydHlNYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdFx0Zm9yIChjb25zdCBbcHJvcGVydHlOYW1lLCBzY2hlbWFdIG9mIHByb3BlcnRpZXMpIHtcblx0XHRcdGNvbnN0IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRpZFRvUHJvcGVydHlNYXAuc2V0KGlkLCBwcm9wZXJ0eU5hbWUpO1xuXG5cdFx0XHRjb25zdCB0aXRsZSA9IHNjaGVtYS50aXRsZSB8fCBwcm9wZXJ0eU5hbWU7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHNjaGVtYS5kZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IGlzUmVxdWlyZWQgPSByZXF1aXJlZEZpZWxkcy5oYXMocHJvcGVydHlOYW1lKTtcblxuXHRcdFx0aWYgKHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0cXVlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBpc1JlcXVpcmVkLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ3RydWUnLCBsYWJlbDogbG9jYWxpemUoJ21jcC5lbGljaXQudHJ1ZScsICdUcnVlJyksIHZhbHVlOiAndHJ1ZScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdmYWxzZScsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmVsaWNpdC5mYWxzZScsICdGYWxzZScpLCB2YWx1ZTogJ2ZhbHNlJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBzY2hlbWEuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKHNjaGVtYS5kZWZhdWx0KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzTGVnYWN5VGl0bGVkRW51bVNjaGVtYShzY2hlbWEpKSB7XG5cdFx0XHRcdHF1ZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0XHRyZXF1aXJlZDogaXNSZXF1aXJlZCxcblx0XHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHNjaGVtYS5lbnVtLm1hcCgodiwgaSkgPT4gKHtcblx0XHRcdFx0XHRcdGlkOiB2LFxuXHRcdFx0XHRcdFx0bGFiZWw6IHNjaGVtYS5lbnVtTmFtZXNbaV0gPyBgJHt2fSAtICR7c2NoZW1hLmVudW1OYW1lc1tpXX1gIDogdixcblx0XHRcdFx0XHRcdHZhbHVlOiB2LFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHNjaGVtYS5kZWZhdWx0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNUaXRsZWRTaW5nbGVFbnVtU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0cXVlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBpc1JlcXVpcmVkLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogc2NoZW1hLm9uZU9mLm1hcCgoeyBjb25zdDogdmFsdWUsIHRpdGxlOiBvcHRUaXRsZSB9KSA9PiAoe1xuXHRcdFx0XHRcdFx0aWQ6IHZhbHVlLFxuXHRcdFx0XHRcdFx0bGFiZWw6IG9wdFRpdGxlID8gYCR7dmFsdWV9IC0gJHtvcHRUaXRsZX1gIDogdmFsdWUsXG5cdFx0XHRcdFx0XHR2YWx1ZSxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBzY2hlbWEuZGVmYXVsdCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzVW50aXRsZWRFbnVtU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0cXVlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBpc1JlcXVpcmVkLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogc2NoZW1hLmVudW0ubWFwKHYgPT4gKHsgaWQ6IHYsIGxhYmVsOiB2LCB2YWx1ZTogdiB9KSksXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBzY2hlbWEuZGVmYXVsdCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzVGl0bGVkTXVsdGlFbnVtU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0cXVlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHR5cGU6ICdtdWx0aVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IGlzUmVxdWlyZWQsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiBzY2hlbWEuaXRlbXMuYW55T2YubWFwKCh7IGNvbnN0OiB2YWx1ZSwgdGl0bGU6IG9wdFRpdGxlIH0pID0+ICh7XG5cdFx0XHRcdFx0XHRpZDogdmFsdWUsXG5cdFx0XHRcdFx0XHRsYWJlbDogb3B0VGl0bGUgPyBgJHt2YWx1ZX0gLSAke29wdFRpdGxlfWAgOiB2YWx1ZSxcblx0XHRcdFx0XHRcdHZhbHVlLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHNjaGVtYS5kZWZhdWx0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNVbnRpdGxlZE11bHRpRW51bVNjaGVtYShzY2hlbWEpKSB7XG5cdFx0XHRcdHF1ZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBpc1JlcXVpcmVkLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogc2NoZW1hLml0ZW1zLmVudW0ubWFwKHYgPT4gKHsgaWQ6IHYsIGxhYmVsOiB2LCB2YWx1ZTogdiB9KSksXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBzY2hlbWEuZGVmYXVsdCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTdHJpbmcsIG51bWJlciwgaW50ZWdlciBcdTIxOTIgdGV4dCBpbnB1dCB3aXRoIHZhbGlkYXRpb25cblx0XHRcdFx0Y29uc3QgdmFsaWRhdGlvbjogSUNoYXRRdWVzdGlvblZhbGlkYXRpb24gPSB7fTtcblx0XHRcdFx0aWYgKHNjaGVtYS50eXBlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGlmIChzY2hlbWEubWluTGVuZ3RoICE9PSB1bmRlZmluZWQpIHsgdmFsaWRhdGlvbi5taW5MZW5ndGggPSBzY2hlbWEubWluTGVuZ3RoOyB9XG5cdFx0XHRcdFx0aWYgKHNjaGVtYS5tYXhMZW5ndGggIT09IHVuZGVmaW5lZCkgeyB2YWxpZGF0aW9uLm1heExlbmd0aCA9IHNjaGVtYS5tYXhMZW5ndGg7IH1cblx0XHRcdFx0XHRpZiAoc2NoZW1hLmZvcm1hdCkgeyB2YWxpZGF0aW9uLmZvcm1hdCA9IHNjaGVtYS5mb3JtYXQ7IH1cblx0XHRcdFx0fSBlbHNlIGlmIChzY2hlbWEudHlwZSA9PT0gJ251bWJlcicgfHwgc2NoZW1hLnR5cGUgPT09ICdpbnRlZ2VyJykge1xuXHRcdFx0XHRcdGlmIChzY2hlbWEubWluaW11bSAhPT0gdW5kZWZpbmVkKSB7IHZhbGlkYXRpb24ubWluaW11bSA9IHNjaGVtYS5taW5pbXVtOyB9XG5cdFx0XHRcdFx0aWYgKHNjaGVtYS5tYXhpbXVtICE9PSB1bmRlZmluZWQpIHsgdmFsaWRhdGlvbi5tYXhpbXVtID0gc2NoZW1hLm1heGltdW07IH1cblx0XHRcdFx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdpbnRlZ2VyJykgeyB2YWxpZGF0aW9uLmlzSW50ZWdlciA9IHRydWU7IH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHF1ZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IGlzUmVxdWlyZWQsXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBzY2hlbWEuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKHNjaGVtYS5kZWZhdWx0KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2YWxpZGF0aW9uOiBPYmplY3Qua2V5cyh2YWxpZGF0aW9uKS5sZW5ndGggPiAwID8gdmFsaWRhdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgcXVlc3Rpb25zLCBpZFRvUHJvcGVydHlNYXAgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBjYXJvdXNlbCBhbnN3ZXJzIChrZXllZCBieSBxdWVzdGlvbiBJRCkgYmFjayBpbnRvIHRoZVxuXHQgKiBNQ1AgRWxpY2l0UmVzdWx0IGNvbnRlbnQgZm9ybWF0IChrZXllZCBieSBzY2hlbWEgcHJvcGVydHkgbmFtZXMpLFxuXHQgKiBjb2VyY2luZyB0eXBlcyBhcyBuZWVkZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9jb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzVG9FbGljaXRSZXN1bHQoXG5cdFx0YW5zd2VyczogSUNoYXRRdWVzdGlvbkFuc3dlcnMsXG5cdFx0aWRUb1Byb3BlcnR5TWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHRcdHNjaGVtYVByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIE1DUC5QcmltaXRpdmVTY2hlbWFEZWZpbml0aW9uPixcblx0KTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgY29udGVudDogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHN0cmluZ1tdPiA9IHt9O1xuXG5cdFx0Zm9yIChjb25zdCBbcXVlc3Rpb25JZCwgYW5zd2VyXSBvZiBPYmplY3QuZW50cmllcyhhbnN3ZXJzKSkge1xuXHRcdFx0Y29uc3QgcHJvcGVydHlOYW1lID0gaWRUb1Byb3BlcnR5TWFwLmdldChxdWVzdGlvbklkKTtcblx0XHRcdGlmICghcHJvcGVydHlOYW1lKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzY2hlbWEgPSBzY2hlbWFQcm9wZXJ0aWVzW3Byb3BlcnR5TmFtZV07XG5cdFx0XHRpZiAoIXNjaGVtYSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRXh0cmFjdCB0aGUgcmF3IHZhbHVlIGZyb20gc3RydWN0dXJlZCBhbnN3ZXJzXG5cdFx0XHRsZXQgcmF3VmFsdWU6IHVua25vd24gPSBhbnN3ZXI7XG5cdFx0XHRpZiAodHlwZW9mIGFuc3dlciA9PT0gJ29iamVjdCcgJiYgYW5zd2VyICE9PSBudWxsKSB7XG5cdFx0XHRcdGNvbnN0IG9iaiA9IGFuc3dlciBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdFx0aWYgKCdzZWxlY3RlZFZhbHVlJyBpbiBvYmopIHtcblx0XHRcdFx0XHRyYXdWYWx1ZSA9IG9iai5zZWxlY3RlZFZhbHVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCdzZWxlY3RlZFZhbHVlcycgaW4gb2JqKSB7XG5cdFx0XHRcdFx0cmF3VmFsdWUgPSBvYmouc2VsZWN0ZWRWYWx1ZXM7XG5cdFx0XHRcdH0gZWxzZSBpZiAoJ2ZyZWVmb3JtVmFsdWUnIGluIG9iaiAmJiBvYmouZnJlZWZvcm1WYWx1ZSkge1xuXHRcdFx0XHRcdHJhd1ZhbHVlID0gb2JqLmZyZWVmb3JtVmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHJhd1ZhbHVlID09PSB1bmRlZmluZWQgfHwgcmF3VmFsdWUgPT09IG51bGwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFR5cGUgY29lcmNpb24gYmFzZWQgb24gc2NoZW1hXG5cdFx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRjb250ZW50W3Byb3BlcnR5TmFtZV0gPSByYXdWYWx1ZSA9PT0gJ3RydWUnIHx8IHJhd1ZhbHVlID09PSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChzY2hlbWEudHlwZSA9PT0gJ251bWJlcicgfHwgc2NoZW1hLnR5cGUgPT09ICdpbnRlZ2VyJykge1xuXHRcdFx0XHRjb25zdCBudW0gPSBOdW1iZXIocmF3VmFsdWUpO1xuXHRcdFx0XHRpZiAoIWlzTmFOKG51bSkpIHtcblx0XHRcdFx0XHRjb250ZW50W3Byb3BlcnR5TmFtZV0gPSBudW07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoc2NoZW1hLnR5cGUgPT09ICdhcnJheScpIHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocmF3VmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29udGVudFtwcm9wZXJ0eU5hbWVdID0gcmF3VmFsdWUubWFwKHYgPT4gU3RyaW5nKHYpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGVudFtwcm9wZXJ0eU5hbWVdID0gU3RyaW5nKHJhd1ZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhLHVCQUF1QjtBQUU3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUFzRDtBQUMvRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUFnRixvQkFBb0I7QUFDN0csU0FBUyxpQkFBcUksb0JBQW9CLHdCQUF3QjtBQUMxTCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQVc7QUFFcEIsTUFBTSxXQUEyQixFQUFFLElBQUksUUFBVyxPQUFPLFNBQVMsd0JBQXdCLE1BQU0sR0FBRyxhQUFhLFNBQVMsb0NBQW9DLGNBQWMsR0FBRyxZQUFZLEtBQUs7QUFJL0wsU0FBUyxrQkFBa0IsUUFBNEk7QUFDdEssU0FBTyxPQUFPLFNBQVMsVUFBVyxPQUFPLFNBQVMsVUFBYSxDQUFDLENBQUUsT0FBd0M7QUFDM0c7QUFFQSxTQUFTLGlCQUFpQixRQUEyRTtBQUNwRyxTQUFP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
