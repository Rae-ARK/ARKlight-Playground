class ResponsesTranslationError extends Error {
}
function toBridgeRole(role) {
  switch (role) {
    case "system":
    case "developer":
    case "assistant":
    case "user":
      return role;
    default:
      throw new ResponsesTranslationError(`Unsupported message role '${role ?? ""}'`);
  }
}
function toTextParts(content, itemIndex) {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.map((part, contentIndex) => {
    if ((part.type === "input_text" || part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
      return { type: "text", text: part.text };
    }
    throw new ResponsesTranslationError(`Unsupported input[${itemIndex}].content[${contentIndex}] type '${part.type ?? ""}'`);
  });
}
function requiredString(value, path) {
  if (!value) {
    throw new ResponsesTranslationError(`${path} is required`);
  }
  return value;
}
function toBridgeInputItem(item, index) {
  switch (item.type) {
    case "message":
      return {
        type: "message",
        role: toBridgeRole(item.role),
        content: toTextParts(item.content, index)
      };
    case "reasoning":
      return {
        type: "reasoning",
        id: item.id,
        summary: (item.summary ?? []).map((part, summaryIndex) => {
          if (part.type !== "summary_text" || typeof part.text !== "string") {
            throw new ResponsesTranslationError(`Unsupported input[${index}].summary[${summaryIndex}]`);
          }
          return part.text;
        }),
        encryptedContent: item.encrypted_content ?? void 0
      };
    case "function_call":
      return {
        type: "function_call",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        name: requiredString(item.name, `input[${index}].name`),
        argumentsJson: item.arguments ?? "{}"
      };
    case "function_call_output":
      return {
        type: "function_call_output",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        output: item.output ?? ""
      };
    case "custom_tool_call":
      return {
        type: "custom_tool_call",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        name: requiredString(item.name, `input[${index}].name`),
        input: item.input ?? ""
      };
    case "custom_tool_call_output":
      return {
        type: "custom_tool_call_output",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        output: item.output ?? ""
      };
    default:
      throw new ResponsesTranslationError(`Unsupported input[${index}] type '${item.type ?? ""}'`);
  }
}
function toBridgeTools(tools) {
  if (!tools?.length) {
    return void 0;
  }
  return tools.map((tool, index) => {
    switch (tool.type) {
      case "function":
        return {
          type: "function",
          name: requiredString(tool.name, `tools[${index}].name`),
          description: tool.description,
          parametersSchema: tool.parameters
        };
      case "custom":
        return {
          type: "custom",
          name: requiredString(tool.name, `tools[${index}].name`),
          description: tool.description
        };
      default:
        throw new ResponsesTranslationError(`Unsupported tools[${index}] type '${tool.type ?? ""}'`);
    }
  });
}
function responsesRequestToBridge(vendor, body) {
  const modelId = requiredString(body.model, "model");
  let input;
  if (typeof body.input === "string") {
    input = [{ type: "message", role: "user", content: [{ type: "text", text: body.input }] }];
  } else if (Array.isArray(body.input)) {
    input = body.input.map(toBridgeInputItem);
  } else {
    input = [];
  }
  const modelOptions = {};
  if (typeof body.temperature === "number") {
    modelOptions.temperature = body.temperature;
  }
  if (typeof body.top_p === "number") {
    modelOptions.top_p = body.top_p;
  }
  if (typeof body.max_output_tokens === "number") {
    modelOptions.max_tokens = body.max_output_tokens;
  }
  return {
    vendor,
    modelId,
    instructions: body.instructions,
    input,
    tools: toBridgeTools(body.tools),
    previousResponseId: body.previous_response_id,
    reasoningEffort: body.reasoning?.effort,
    modelOptions: Object.keys(modelOptions).length ? modelOptions : void 0
  };
}
let responseCounter = 0;
function nextId(prefix) {
  responseCounter = (responseCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_byok_${Date.now().toString(36)}_${responseCounter.toString(36)}`;
}
function sseEvent(eventName, data) {
  return `event: ${eventName}
data: ${JSON.stringify(data)}

`;
}
function toInProgressOutputItem(item) {
  switch (item.type) {
    case "message":
      return { ...item, status: "in_progress", content: [] };
    case "reasoning":
      return { ...item, status: "in_progress", summary: [], encrypted_content: null };
    case "function_call":
      return { ...item, status: "in_progress", arguments: "" };
    case "custom_tool_call":
      return { ...item, status: "in_progress", input: "" };
  }
}
function toResponsesOutputItem(item) {
  switch (item.type) {
    case "message":
      return {
        id: nextId("msg"),
        type: "message",
        role: "assistant",
        status: "completed",
        content: item.content.map((part) => ({ type: "output_text", text: part.text, annotations: [], logprobs: [] }))
      };
    case "reasoning":
      return {
        id: item.id?.startsWith("rs") ? item.id : nextId("rs"),
        type: "reasoning",
        status: "completed",
        summary: item.summary.map((text) => ({ type: "summary_text", text })),
        encrypted_content: item.encryptedContent ?? null
      };
    case "function_call":
      return {
        id: nextId("fc"),
        type: "function_call",
        status: "completed",
        call_id: item.callId,
        name: item.name,
        arguments: item.argumentsJson
      };
    case "custom_tool_call":
      return {
        id: nextId("ctc"),
        type: "custom_tool_call",
        status: "completed",
        call_id: item.callId,
        name: item.name,
        input: item.input
      };
  }
}
function outputText(items) {
  return items.filter((item) => item.type === "message").flatMap((item) => item.content).map((part) => part.text).join("");
}
function responseEnvelope(responseId, model, status, output, usage) {
  return {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1e3),
    status,
    error: null,
    incomplete_details: null,
    instructions: null,
    model,
    output,
    output_text: outputText(output),
    parallel_tool_calls: true,
    temperature: 1,
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    usage
  };
}
function prepareResponse(result, model) {
  const responseId = result.responseId ?? nextId("resp");
  const output = result.output.map(toResponsesOutputItem);
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const usage = {
    input_tokens: inputTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: outputTokens,
    output_tokens_details: { reasoning_tokens: result.usage?.reasoningTokens ?? 0 },
    total_tokens: inputTokens + outputTokens
  };
  return {
    responseId,
    output,
    completed: responseEnvelope(responseId, model, "completed", output, usage)
  };
}
function bridgeResultToResponsesBody(result, model) {
  return JSON.stringify(prepareResponse(result, model).completed);
}
function reasoningFrames(item, outputIndex, sequence) {
  const frames = [];
  item.summary.forEach((part, summaryIndex) => {
    frames.push(sseEvent("response.reasoning_summary_part.added", {
      type: "response.reasoning_summary_part.added",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      part: { type: "summary_text", text: "" }
    }));
    frames.push(sseEvent("response.reasoning_summary_text.delta", {
      type: "response.reasoning_summary_text.delta",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      delta: part.text
    }));
    frames.push(sseEvent("response.reasoning_summary_text.done", {
      type: "response.reasoning_summary_text.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      text: part.text
    }));
    frames.push(sseEvent("response.reasoning_summary_part.done", {
      type: "response.reasoning_summary_part.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      part
    }));
  });
  return frames;
}
function messageFrames(item, outputIndex, sequence) {
  const frames = [];
  item.content.forEach((part, contentIndex) => {
    frames.push(sseEvent("response.content_part.added", {
      type: "response.content_part.added",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      part: { type: "output_text", text: "", annotations: [], logprobs: [] }
    }));
    frames.push(sseEvent("response.output_text.delta", {
      type: "response.output_text.delta",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      delta: part.text,
      logprobs: []
    }));
    frames.push(sseEvent("response.output_text.done", {
      type: "response.output_text.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      text: part.text,
      logprobs: []
    }));
    frames.push(sseEvent("response.content_part.done", {
      type: "response.content_part.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      part
    }));
  });
  return frames;
}
function callFrames(item, outputIndex, sequence) {
  if (item.type === "function_call") {
    return [
      sseEvent("response.function_call_arguments.delta", {
        type: "response.function_call_arguments.delta",
        sequence_number: sequence.value++,
        item_id: item.id,
        output_index: outputIndex,
        delta: item.arguments
      }),
      sseEvent("response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        sequence_number: sequence.value++,
        item_id: item.id,
        output_index: outputIndex,
        arguments: item.arguments
      })
    ];
  }
  return [
    sseEvent("response.custom_tool_call_input.delta", {
      type: "response.custom_tool_call_input.delta",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      delta: item.input
    }),
    sseEvent("response.custom_tool_call_input.done", {
      type: "response.custom_tool_call_input.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      input: item.input
    })
  ];
}
function bridgeResultToResponsesSseFrames(result, model) {
  const { responseId, output, completed } = prepareResponse(result, model);
  const sequence = { value: 0 };
  const frames = [];
  const skeleton = responseEnvelope(responseId, model, "in_progress", [], void 0);
  frames.push(sseEvent("response.created", { type: "response.created", sequence_number: sequence.value++, response: skeleton }));
  frames.push(sseEvent("response.in_progress", { type: "response.in_progress", sequence_number: sequence.value++, response: skeleton }));
  output.forEach((item, outputIndex) => {
    frames.push(sseEvent("response.output_item.added", {
      type: "response.output_item.added",
      sequence_number: sequence.value++,
      output_index: outputIndex,
      item: toInProgressOutputItem(item)
    }));
    switch (item.type) {
      case "message":
        frames.push(...messageFrames(item, outputIndex, sequence));
        break;
      case "reasoning":
        frames.push(...reasoningFrames(item, outputIndex, sequence));
        break;
      case "function_call":
      case "custom_tool_call":
        frames.push(...callFrames(item, outputIndex, sequence));
        break;
    }
    frames.push(sseEvent("response.output_item.done", {
      type: "response.output_item.done",
      sequence_number: sequence.value++,
      output_index: outputIndex,
      item
    }));
  });
  frames.push(sseEvent("response.completed", {
    type: "response.completed",
    sequence_number: sequence.value++,
    response: completed
  }));
  return frames;
}
function responsesErrorBody(message, type = "api_error") {
  return JSON.stringify({ error: { message, type } });
}
export {
  ResponsesTranslationError,
  bridgeResultToResponsesBody,
  bridgeResultToResponsesSseFrames,
  responsesErrorBody,
  responsesRequestToBridge
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvYnlva1Jlc3BvbnNlc1RyYW5zbGF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHtcblx0SUJ5b2tMbUNoYXRSZXF1ZXN0LFxuXHRJQnlva0xtQ2hhdFJlc3VsdCxcblx0SUJ5b2tMbUlucHV0SXRlbSxcblx0SUJ5b2tMbU91dHB1dEl0ZW0sXG5cdElCeW9rTG1Ub29sLFxufSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcblxuaW50ZXJmYWNlIElSZXNwb25zZXNDb250ZW50UGFydCB7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRleHQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmVzcG9uc2VzU3VtbWFyeVBhcnQge1xuXHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xuXHRyZWFkb25seSB0ZXh0Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJlc3BvbnNlc0lucHV0SXRlbSB7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJvbGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbnRlbnQ/OiBzdHJpbmcgfCBJUmVzcG9uc2VzQ29udGVudFBhcnRbXTtcblx0cmVhZG9ubHkgaWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1bW1hcnk/OiBJUmVzcG9uc2VzU3VtbWFyeVBhcnRbXTtcblx0cmVhZG9ubHkgZW5jcnlwdGVkX2NvbnRlbnQ/OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBjYWxsX2lkPzogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcmd1bWVudHM/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlucHV0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBvdXRwdXQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmVzcG9uc2VzVG9vbCB7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBwYXJhbWV0ZXJzPzogb2JqZWN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNwb25zZXNSZXF1ZXN0IHtcblx0cmVhZG9ubHkgbW9kZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluc3RydWN0aW9ucz86IHN0cmluZztcblx0cmVhZG9ubHkgaW5wdXQ/OiBzdHJpbmcgfCBJUmVzcG9uc2VzSW5wdXRJdGVtW107XG5cdHJlYWRvbmx5IHRvb2xzPzogSVJlc3BvbnNlc1Rvb2xbXTtcblx0cmVhZG9ubHkgcHJldmlvdXNfcmVzcG9uc2VfaWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlYXNvbmluZz86IHtcblx0XHRyZWFkb25seSBlZmZvcnQ/OiBzdHJpbmc7XG5cdH07XG5cdHJlYWRvbmx5IHRlbXBlcmF0dXJlPzogbnVtYmVyO1xuXHRyZWFkb25seSB0b3BfcD86IG51bWJlcjtcblx0cmVhZG9ubHkgbWF4X291dHB1dF90b2tlbnM/OiBudW1iZXI7XG5cdHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd247XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3IgeyB9XG5cbmZ1bmN0aW9uIHRvQnJpZGdlUm9sZShyb2xlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiAnc3lzdGVtJyB8ICdkZXZlbG9wZXInIHwgJ3VzZXInIHwgJ2Fzc2lzdGFudCcge1xuXHRzd2l0Y2ggKHJvbGUpIHtcblx0XHRjYXNlICdzeXN0ZW0nOlxuXHRcdGNhc2UgJ2RldmVsb3Blcic6XG5cdFx0Y2FzZSAnYXNzaXN0YW50Jzpcblx0XHRjYXNlICd1c2VyJzpcblx0XHRcdHJldHVybiByb2xlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHR0aHJvdyBuZXcgUmVzcG9uc2VzVHJhbnNsYXRpb25FcnJvcihgVW5zdXBwb3J0ZWQgbWVzc2FnZSByb2xlICcke3JvbGUgPz8gJyd9J2ApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvVGV4dFBhcnRzKGNvbnRlbnQ6IHN0cmluZyB8IElSZXNwb25zZXNDb250ZW50UGFydFtdIHwgdW5kZWZpbmVkLCBpdGVtSW5kZXg6IG51bWJlcik6IEFycmF5PHsgdHlwZTogJ3RleHQnOyB0ZXh0OiBzdHJpbmcgfT4ge1xuXHRpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQgPyBbeyB0eXBlOiAndGV4dCcsIHRleHQ6IGNvbnRlbnQgfV0gOiBbXTtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudCkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0cmV0dXJuIGNvbnRlbnQubWFwKChwYXJ0LCBjb250ZW50SW5kZXgpID0+IHtcblx0XHRpZiAoKHBhcnQudHlwZSA9PT0gJ2lucHV0X3RleHQnIHx8IHBhcnQudHlwZSA9PT0gJ291dHB1dF90ZXh0JyB8fCBwYXJ0LnR5cGUgPT09ICd0ZXh0JykgJiYgdHlwZW9mIHBhcnQudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogcGFydC50ZXh0IH07XG5cdFx0fVxuXHRcdHRocm93IG5ldyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yKGBVbnN1cHBvcnRlZCBpbnB1dFske2l0ZW1JbmRleH1dLmNvbnRlbnRbJHtjb250ZW50SW5kZXh9XSB0eXBlICcke3BhcnQudHlwZSA/PyAnJ30nYCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZXF1aXJlZFN0cmluZyh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIXZhbHVlKSB7XG5cdFx0dGhyb3cgbmV3IFJlc3BvbnNlc1RyYW5zbGF0aW9uRXJyb3IoYCR7cGF0aH0gaXMgcmVxdWlyZWRgKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHRvQnJpZGdlSW5wdXRJdGVtKGl0ZW06IElSZXNwb25zZXNJbnB1dEl0ZW0sIGluZGV4OiBudW1iZXIpOiBJQnlva0xtSW5wdXRJdGVtIHtcblx0c3dpdGNoIChpdGVtLnR5cGUpIHtcblx0XHRjYXNlICdtZXNzYWdlJzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRcdFx0cm9sZTogdG9CcmlkZ2VSb2xlKGl0ZW0ucm9sZSksXG5cdFx0XHRcdGNvbnRlbnQ6IHRvVGV4dFBhcnRzKGl0ZW0uY29udGVudCwgaW5kZXgpLFxuXHRcdFx0fTtcblx0XHRjYXNlICdyZWFzb25pbmcnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ3JlYXNvbmluZycsXG5cdFx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0XHRzdW1tYXJ5OiAoaXRlbS5zdW1tYXJ5ID8/IFtdKS5tYXAoKHBhcnQsIHN1bW1hcnlJbmRleCkgPT4ge1xuXHRcdFx0XHRcdGlmIChwYXJ0LnR5cGUgIT09ICdzdW1tYXJ5X3RleHQnIHx8IHR5cGVvZiBwYXJ0LnRleHQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgUmVzcG9uc2VzVHJhbnNsYXRpb25FcnJvcihgVW5zdXBwb3J0ZWQgaW5wdXRbJHtpbmRleH1dLnN1bW1hcnlbJHtzdW1tYXJ5SW5kZXh9XWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcGFydC50ZXh0O1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0ZW5jcnlwdGVkQ29udGVudDogaXRlbS5lbmNyeXB0ZWRfY29udGVudCA/PyB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGwnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2Z1bmN0aW9uX2NhbGwnLFxuXHRcdFx0XHRjYWxsSWQ6IHJlcXVpcmVkU3RyaW5nKGl0ZW0uY2FsbF9pZCwgYGlucHV0WyR7aW5kZXh9XS5jYWxsX2lkYCksXG5cdFx0XHRcdG5hbWU6IHJlcXVpcmVkU3RyaW5nKGl0ZW0ubmFtZSwgYGlucHV0WyR7aW5kZXh9XS5uYW1lYCksXG5cdFx0XHRcdGFyZ3VtZW50c0pzb246IGl0ZW0uYXJndW1lbnRzID8/ICd7fScsXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0Jzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdmdW5jdGlvbl9jYWxsX291dHB1dCcsXG5cdFx0XHRcdGNhbGxJZDogcmVxdWlyZWRTdHJpbmcoaXRlbS5jYWxsX2lkLCBgaW5wdXRbJHtpbmRleH1dLmNhbGxfaWRgKSxcblx0XHRcdFx0b3V0cHV0OiBpdGVtLm91dHB1dCA/PyAnJyxcblx0XHRcdH07XG5cdFx0Y2FzZSAnY3VzdG9tX3Rvb2xfY2FsbCc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsXG5cdFx0XHRcdGNhbGxJZDogcmVxdWlyZWRTdHJpbmcoaXRlbS5jYWxsX2lkLCBgaW5wdXRbJHtpbmRleH1dLmNhbGxfaWRgKSxcblx0XHRcdFx0bmFtZTogcmVxdWlyZWRTdHJpbmcoaXRlbS5uYW1lLCBgaW5wdXRbJHtpbmRleH1dLm5hbWVgKSxcblx0XHRcdFx0aW5wdXQ6IGl0ZW0uaW5wdXQgPz8gJycsXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ2N1c3RvbV90b29sX2NhbGxfb3V0cHV0Jzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCcsXG5cdFx0XHRcdGNhbGxJZDogcmVxdWlyZWRTdHJpbmcoaXRlbS5jYWxsX2lkLCBgaW5wdXRbJHtpbmRleH1dLmNhbGxfaWRgKSxcblx0XHRcdFx0b3V0cHV0OiBpdGVtLm91dHB1dCA/PyAnJyxcblx0XHRcdH07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93IG5ldyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yKGBVbnN1cHBvcnRlZCBpbnB1dFske2luZGV4fV0gdHlwZSAnJHtpdGVtLnR5cGUgPz8gJyd9J2ApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvQnJpZGdlVG9vbHModG9vbHM6IElSZXNwb25zZXNUb29sW10gfCB1bmRlZmluZWQpOiBJQnlva0xtVG9vbFtdIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF0b29scz8ubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gdG9vbHMubWFwKCh0b29sLCBpbmRleCkgPT4ge1xuXHRcdHN3aXRjaCAodG9vbC50eXBlKSB7XG5cdFx0XHRjYXNlICdmdW5jdGlvbic6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Z1bmN0aW9uJyxcblx0XHRcdFx0XHRuYW1lOiByZXF1aXJlZFN0cmluZyh0b29sLm5hbWUsIGB0b29sc1ske2luZGV4fV0ubmFtZWApLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0b29sLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnNTY2hlbWE6IHRvb2wucGFyYW1ldGVycyxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ2N1c3RvbSc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ2N1c3RvbScsXG5cdFx0XHRcdFx0bmFtZTogcmVxdWlyZWRTdHJpbmcodG9vbC5uYW1lLCBgdG9vbHNbJHtpbmRleH1dLm5hbWVgKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcblx0XHRcdFx0fTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yKGBVbnN1cHBvcnRlZCB0b29sc1ske2luZGV4fV0gdHlwZSAnJHt0b29sLnR5cGUgPz8gJyd9J2ApO1xuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNwb25zZXNSZXF1ZXN0VG9CcmlkZ2UodmVuZG9yOiBzdHJpbmcsIGJvZHk6IElSZXNwb25zZXNSZXF1ZXN0KTogSUJ5b2tMbUNoYXRSZXF1ZXN0IHtcblx0Y29uc3QgbW9kZWxJZCA9IHJlcXVpcmVkU3RyaW5nKGJvZHkubW9kZWwsICdtb2RlbCcpO1xuXHRsZXQgaW5wdXQ6IElCeW9rTG1JbnB1dEl0ZW1bXTtcblx0aWYgKHR5cGVvZiBib2R5LmlucHV0ID09PSAnc3RyaW5nJykge1xuXHRcdGlucHV0ID0gW3sgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogYm9keS5pbnB1dCB9XSB9XTtcblx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGJvZHkuaW5wdXQpKSB7XG5cdFx0aW5wdXQgPSBib2R5LmlucHV0Lm1hcCh0b0JyaWRnZUlucHV0SXRlbSk7XG5cdH0gZWxzZSB7XG5cdFx0aW5wdXQgPSBbXTtcblx0fVxuXG5cdGNvbnN0IG1vZGVsT3B0aW9uczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0aWYgKHR5cGVvZiBib2R5LnRlbXBlcmF0dXJlID09PSAnbnVtYmVyJykge1xuXHRcdG1vZGVsT3B0aW9ucy50ZW1wZXJhdHVyZSA9IGJvZHkudGVtcGVyYXR1cmU7XG5cdH1cblx0aWYgKHR5cGVvZiBib2R5LnRvcF9wID09PSAnbnVtYmVyJykge1xuXHRcdG1vZGVsT3B0aW9ucy50b3BfcCA9IGJvZHkudG9wX3A7XG5cdH1cblx0aWYgKHR5cGVvZiBib2R5Lm1heF9vdXRwdXRfdG9rZW5zID09PSAnbnVtYmVyJykge1xuXHRcdG1vZGVsT3B0aW9ucy5tYXhfdG9rZW5zID0gYm9keS5tYXhfb3V0cHV0X3Rva2Vucztcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0dmVuZG9yLFxuXHRcdG1vZGVsSWQsXG5cdFx0aW5zdHJ1Y3Rpb25zOiBib2R5Lmluc3RydWN0aW9ucyxcblx0XHRpbnB1dCxcblx0XHR0b29sczogdG9CcmlkZ2VUb29scyhib2R5LnRvb2xzKSxcblx0XHRwcmV2aW91c1Jlc3BvbnNlSWQ6IGJvZHkucHJldmlvdXNfcmVzcG9uc2VfaWQsXG5cdFx0cmVhc29uaW5nRWZmb3J0OiBib2R5LnJlYXNvbmluZz8uZWZmb3J0LFxuXHRcdG1vZGVsT3B0aW9uczogT2JqZWN0LmtleXMobW9kZWxPcHRpb25zKS5sZW5ndGggPyBtb2RlbE9wdGlvbnMgOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmxldCByZXNwb25zZUNvdW50ZXIgPSAwO1xuXG5mdW5jdGlvbiBuZXh0SWQocHJlZml4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXNwb25zZUNvdW50ZXIgPSAocmVzcG9uc2VDb3VudGVyICsgMSkgJSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0cmV0dXJuIGAke3ByZWZpeH1fYnlva18ke0RhdGUubm93KCkudG9TdHJpbmcoMzYpfV8ke3Jlc3BvbnNlQ291bnRlci50b1N0cmluZygzNil9YDtcbn1cblxuZnVuY3Rpb24gc3NlRXZlbnQoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE6IHVua25vd24pOiBzdHJpbmcge1xuXHRyZXR1cm4gYGV2ZW50OiAke2V2ZW50TmFtZX1cXG5kYXRhOiAke0pTT04uc3RyaW5naWZ5KGRhdGEpfVxcblxcbmA7XG59XG5cbnR5cGUgUmVzcG9uc2VzT3V0cHV0SXRlbSA9XG5cdHwgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSB0eXBlOiAnbWVzc2FnZSc7IHJlYWRvbmx5IHJvbGU6ICdhc3Npc3RhbnQnOyByZWFkb25seSBzdGF0dXM6ICdjb21wbGV0ZWQnOyByZWFkb25seSBjb250ZW50OiBBcnJheTx7IHJlYWRvbmx5IHR5cGU6ICdvdXRwdXRfdGV4dCc7IHJlYWRvbmx5IHRleHQ6IHN0cmluZzsgcmVhZG9ubHkgYW5ub3RhdGlvbnM6IHVua25vd25bXTsgcmVhZG9ubHkgbG9ncHJvYnM6IHVua25vd25bXSB9PiB9XG5cdHwgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSB0eXBlOiAncmVhc29uaW5nJzsgcmVhZG9ubHkgc3RhdHVzOiAnY29tcGxldGVkJzsgcmVhZG9ubHkgc3VtbWFyeTogQXJyYXk8eyByZWFkb25seSB0eXBlOiAnc3VtbWFyeV90ZXh0JzsgcmVhZG9ubHkgdGV4dDogc3RyaW5nIH0+OyByZWFkb25seSBlbmNyeXB0ZWRfY29udGVudDogc3RyaW5nIHwgbnVsbCB9XG5cdHwgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSB0eXBlOiAnZnVuY3Rpb25fY2FsbCc7IHJlYWRvbmx5IHN0YXR1czogJ2NvbXBsZXRlZCc7IHJlYWRvbmx5IGNhbGxfaWQ6IHN0cmluZzsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBhcmd1bWVudHM6IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCc7IHJlYWRvbmx5IHN0YXR1czogJ2NvbXBsZXRlZCc7IHJlYWRvbmx5IGNhbGxfaWQ6IHN0cmluZzsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBpbnB1dDogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIHRvSW5Qcm9ncmVzc091dHB1dEl0ZW0oaXRlbTogUmVzcG9uc2VzT3V0cHV0SXRlbSk6IG9iamVjdCB7XG5cdHN3aXRjaCAoaXRlbS50eXBlKSB7XG5cdFx0Y2FzZSAnbWVzc2FnZSc6XG5cdFx0XHRyZXR1cm4geyAuLi5pdGVtLCBzdGF0dXM6ICdpbl9wcm9ncmVzcycsIGNvbnRlbnQ6IFtdIH07XG5cdFx0Y2FzZSAncmVhc29uaW5nJzpcblx0XHRcdHJldHVybiB7IC4uLml0ZW0sIHN0YXR1czogJ2luX3Byb2dyZXNzJywgc3VtbWFyeTogW10sIGVuY3J5cHRlZF9jb250ZW50OiBudWxsIH07XG5cdFx0Y2FzZSAnZnVuY3Rpb25fY2FsbCc6XG5cdFx0XHRyZXR1cm4geyAuLi5pdGVtLCBzdGF0dXM6ICdpbl9wcm9ncmVzcycsIGFyZ3VtZW50czogJycgfTtcblx0XHRjYXNlICdjdXN0b21fdG9vbF9jYWxsJzpcblx0XHRcdHJldHVybiB7IC4uLml0ZW0sIHN0YXR1czogJ2luX3Byb2dyZXNzJywgaW5wdXQ6ICcnIH07XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9SZXNwb25zZXNPdXRwdXRJdGVtKGl0ZW06IElCeW9rTG1PdXRwdXRJdGVtKTogUmVzcG9uc2VzT3V0cHV0SXRlbSB7XG5cdHN3aXRjaCAoaXRlbS50eXBlKSB7XG5cdFx0Y2FzZSAnbWVzc2FnZSc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogbmV4dElkKCdtc2cnKSxcblx0XHRcdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdFx0XHRyb2xlOiAnYXNzaXN0YW50Jyxcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0Y29udGVudDogaXRlbS5jb250ZW50Lm1hcChwYXJ0ID0+ICh7IHR5cGU6ICdvdXRwdXRfdGV4dCcsIHRleHQ6IHBhcnQudGV4dCwgYW5ub3RhdGlvbnM6IFtdLCBsb2dwcm9iczogW10gfSkpLFxuXHRcdFx0fTtcblx0XHRjYXNlICdyZWFzb25pbmcnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IGl0ZW0uaWQ/LnN0YXJ0c1dpdGgoJ3JzJykgPyBpdGVtLmlkIDogbmV4dElkKCdycycpLFxuXHRcdFx0XHR0eXBlOiAncmVhc29uaW5nJyxcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0c3VtbWFyeTogaXRlbS5zdW1tYXJ5Lm1hcCh0ZXh0ID0+ICh7IHR5cGU6ICdzdW1tYXJ5X3RleHQnLCB0ZXh0IH0pKSxcblx0XHRcdFx0ZW5jcnlwdGVkX2NvbnRlbnQ6IGl0ZW0uZW5jcnlwdGVkQ29udGVudCA/PyBudWxsLFxuXHRcdFx0fTtcblx0XHRjYXNlICdmdW5jdGlvbl9jYWxsJzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBuZXh0SWQoJ2ZjJyksXG5cdFx0XHRcdHR5cGU6ICdmdW5jdGlvbl9jYWxsJyxcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0Y2FsbF9pZDogaXRlbS5jYWxsSWQsXG5cdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0YXJndW1lbnRzOiBpdGVtLmFyZ3VtZW50c0pzb24sXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ2N1c3RvbV90b29sX2NhbGwnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IG5leHRJZCgnY3RjJyksXG5cdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJyxcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0Y2FsbF9pZDogaXRlbS5jYWxsSWQsXG5cdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0aW5wdXQ6IGl0ZW0uaW5wdXQsXG5cdFx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIG91dHB1dFRleHQoaXRlbXM6IHJlYWRvbmx5IFJlc3BvbnNlc091dHB1dEl0ZW1bXSk6IHN0cmluZyB7XG5cdHJldHVybiBpdGVtc1xuXHRcdC5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIEV4dHJhY3Q8UmVzcG9uc2VzT3V0cHV0SXRlbSwgeyB0eXBlOiAnbWVzc2FnZScgfT4gPT4gaXRlbS50eXBlID09PSAnbWVzc2FnZScpXG5cdFx0LmZsYXRNYXAoaXRlbSA9PiBpdGVtLmNvbnRlbnQpXG5cdFx0Lm1hcChwYXJ0ID0+IHBhcnQudGV4dClcblx0XHQuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIHJlc3BvbnNlRW52ZWxvcGUocmVzcG9uc2VJZDogc3RyaW5nLCBtb2RlbDogc3RyaW5nLCBzdGF0dXM6ICdpbl9wcm9ncmVzcycgfCAnY29tcGxldGVkJywgb3V0cHV0OiByZWFkb25seSBSZXNwb25zZXNPdXRwdXRJdGVtW10sIHVzYWdlOiB1bmtub3duKSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHJlc3BvbnNlSWQsXG5cdFx0b2JqZWN0OiAncmVzcG9uc2UnLFxuXHRcdGNyZWF0ZWRfYXQ6IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApLFxuXHRcdHN0YXR1cyxcblx0XHRlcnJvcjogbnVsbCxcblx0XHRpbmNvbXBsZXRlX2RldGFpbHM6IG51bGwsXG5cdFx0aW5zdHJ1Y3Rpb25zOiBudWxsLFxuXHRcdG1vZGVsLFxuXHRcdG91dHB1dCxcblx0XHRvdXRwdXRfdGV4dDogb3V0cHV0VGV4dChvdXRwdXQpLFxuXHRcdHBhcmFsbGVsX3Rvb2xfY2FsbHM6IHRydWUsXG5cdFx0dGVtcGVyYXR1cmU6IDEsXG5cdFx0dG9vbF9jaG9pY2U6ICdhdXRvJyxcblx0XHR0b29sczogW10sXG5cdFx0dG9wX3A6IDEsXG5cdFx0dXNhZ2UsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHByZXBhcmVSZXNwb25zZShyZXN1bHQ6IElCeW9rTG1DaGF0UmVzdWx0LCBtb2RlbDogc3RyaW5nKSB7XG5cdGNvbnN0IHJlc3BvbnNlSWQgPSByZXN1bHQucmVzcG9uc2VJZCA/PyBuZXh0SWQoJ3Jlc3AnKTtcblx0Y29uc3Qgb3V0cHV0ID0gcmVzdWx0Lm91dHB1dC5tYXAodG9SZXNwb25zZXNPdXRwdXRJdGVtKTtcblx0Y29uc3QgaW5wdXRUb2tlbnMgPSByZXN1bHQudXNhZ2U/LmlucHV0VG9rZW5zID8/IDA7XG5cdGNvbnN0IG91dHB1dFRva2VucyA9IHJlc3VsdC51c2FnZT8ub3V0cHV0VG9rZW5zID8/IDA7XG5cdGNvbnN0IHVzYWdlID0ge1xuXHRcdGlucHV0X3Rva2VuczogaW5wdXRUb2tlbnMsXG5cdFx0aW5wdXRfdG9rZW5zX2RldGFpbHM6IHsgY2FjaGVkX3Rva2VuczogMCB9LFxuXHRcdG91dHB1dF90b2tlbnM6IG91dHB1dFRva2Vucyxcblx0XHRvdXRwdXRfdG9rZW5zX2RldGFpbHM6IHsgcmVhc29uaW5nX3Rva2VuczogcmVzdWx0LnVzYWdlPy5yZWFzb25pbmdUb2tlbnMgPz8gMCB9LFxuXHRcdHRvdGFsX3Rva2VuczogaW5wdXRUb2tlbnMgKyBvdXRwdXRUb2tlbnMsXG5cdH07XG5cdHJldHVybiB7XG5cdFx0cmVzcG9uc2VJZCxcblx0XHRvdXRwdXQsXG5cdFx0Y29tcGxldGVkOiByZXNwb25zZUVudmVsb3BlKHJlc3BvbnNlSWQsIG1vZGVsLCAnY29tcGxldGVkJywgb3V0cHV0LCB1c2FnZSksXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBicmlkZ2VSZXN1bHRUb1Jlc3BvbnNlc0JvZHkocmVzdWx0OiBJQnlva0xtQ2hhdFJlc3VsdCwgbW9kZWw6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeShwcmVwYXJlUmVzcG9uc2UocmVzdWx0LCBtb2RlbCkuY29tcGxldGVkKTtcbn1cblxuZnVuY3Rpb24gcmVhc29uaW5nRnJhbWVzKGl0ZW06IEV4dHJhY3Q8UmVzcG9uc2VzT3V0cHV0SXRlbSwgeyB0eXBlOiAncmVhc29uaW5nJyB9Piwgb3V0cHV0SW5kZXg6IG51bWJlciwgc2VxdWVuY2U6IHsgdmFsdWU6IG51bWJlciB9KTogc3RyaW5nW10ge1xuXHRjb25zdCBmcmFtZXM6IHN0cmluZ1tdID0gW107XG5cdGl0ZW0uc3VtbWFyeS5mb3JFYWNoKChwYXJ0LCBzdW1tYXJ5SW5kZXgpID0+IHtcblx0XHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfcGFydC5hZGRlZCcsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV9wYXJ0LmFkZGVkJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0c3VtbWFyeV9pbmRleDogc3VtbWFyeUluZGV4LFxuXHRcdFx0cGFydDogeyB0eXBlOiAnc3VtbWFyeV90ZXh0JywgdGV4dDogJycgfSxcblx0XHR9KSk7XG5cdFx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3RleHQuZGVsdGEnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfdGV4dC5kZWx0YScsXG5cdFx0XHRzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssXG5cdFx0XHRpdGVtX2lkOiBpdGVtLmlkLFxuXHRcdFx0b3V0cHV0X2luZGV4OiBvdXRwdXRJbmRleCxcblx0XHRcdHN1bW1hcnlfaW5kZXg6IHN1bW1hcnlJbmRleCxcblx0XHRcdGRlbHRhOiBwYXJ0LnRleHQsXG5cdFx0fSkpO1xuXHRcdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV90ZXh0LmRvbmUnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfdGV4dC5kb25lJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0c3VtbWFyeV9pbmRleDogc3VtbWFyeUluZGV4LFxuXHRcdFx0dGV4dDogcGFydC50ZXh0LFxuXHRcdH0pKTtcblx0XHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfcGFydC5kb25lJywge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3BhcnQuZG9uZScsXG5cdFx0XHRzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssXG5cdFx0XHRpdGVtX2lkOiBpdGVtLmlkLFxuXHRcdFx0b3V0cHV0X2luZGV4OiBvdXRwdXRJbmRleCxcblx0XHRcdHN1bW1hcnlfaW5kZXg6IHN1bW1hcnlJbmRleCxcblx0XHRcdHBhcnQsXG5cdFx0fSkpO1xuXHR9KTtcblx0cmV0dXJuIGZyYW1lcztcbn1cblxuZnVuY3Rpb24gbWVzc2FnZUZyYW1lcyhpdGVtOiBFeHRyYWN0PFJlc3BvbnNlc091dHB1dEl0ZW0sIHsgdHlwZTogJ21lc3NhZ2UnIH0+LCBvdXRwdXRJbmRleDogbnVtYmVyLCBzZXF1ZW5jZTogeyB2YWx1ZTogbnVtYmVyIH0pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGZyYW1lczogc3RyaW5nW10gPSBbXTtcblx0aXRlbS5jb250ZW50LmZvckVhY2goKHBhcnQsIGNvbnRlbnRJbmRleCkgPT4ge1xuXHRcdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5jb250ZW50X3BhcnQuYWRkZWQnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2UuY29udGVudF9wYXJ0LmFkZGVkJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0Y29udGVudF9pbmRleDogY29udGVudEluZGV4LFxuXHRcdFx0cGFydDogeyB0eXBlOiAnb3V0cHV0X3RleHQnLCB0ZXh0OiAnJywgYW5ub3RhdGlvbnM6IFtdLCBsb2dwcm9iczogW10gfSxcblx0XHR9KSk7XG5cdFx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRlbHRhJywge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRlbHRhJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0Y29udGVudF9pbmRleDogY29udGVudEluZGV4LFxuXHRcdFx0ZGVsdGE6IHBhcnQudGV4dCxcblx0XHRcdGxvZ3Byb2JzOiBbXSxcblx0XHR9KSk7XG5cdFx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRvbmUnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2Uub3V0cHV0X3RleHQuZG9uZScsXG5cdFx0XHRzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssXG5cdFx0XHRpdGVtX2lkOiBpdGVtLmlkLFxuXHRcdFx0b3V0cHV0X2luZGV4OiBvdXRwdXRJbmRleCxcblx0XHRcdGNvbnRlbnRfaW5kZXg6IGNvbnRlbnRJbmRleCxcblx0XHRcdHRleHQ6IHBhcnQudGV4dCxcblx0XHRcdGxvZ3Byb2JzOiBbXSxcblx0XHR9KSk7XG5cdFx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmNvbnRlbnRfcGFydC5kb25lJywge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlLmNvbnRlbnRfcGFydC5kb25lJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0Y29udGVudF9pbmRleDogY29udGVudEluZGV4LFxuXHRcdFx0cGFydCxcblx0XHR9KSk7XG5cdH0pO1xuXHRyZXR1cm4gZnJhbWVzO1xufVxuXG5mdW5jdGlvbiBjYWxsRnJhbWVzKGl0ZW06IEV4dHJhY3Q8UmVzcG9uc2VzT3V0cHV0SXRlbSwgeyB0eXBlOiAnZnVuY3Rpb25fY2FsbCcgfCAnY3VzdG9tX3Rvb2xfY2FsbCcgfT4sIG91dHB1dEluZGV4OiBudW1iZXIsIHNlcXVlbmNlOiB7IHZhbHVlOiBudW1iZXIgfSk6IHN0cmluZ1tdIHtcblx0aWYgKGl0ZW0udHlwZSA9PT0gJ2Z1bmN0aW9uX2NhbGwnKSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHNzZUV2ZW50KCdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kZWx0YScsIHtcblx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlLmZ1bmN0aW9uX2NhbGxfYXJndW1lbnRzLmRlbHRhJyxcblx0XHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0XHRpdGVtX2lkOiBpdGVtLmlkLFxuXHRcdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0XHRkZWx0YTogaXRlbS5hcmd1bWVudHMsXG5cdFx0XHR9KSxcblx0XHRcdHNzZUV2ZW50KCdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kb25lJywge1xuXHRcdFx0XHR0eXBlOiAncmVzcG9uc2UuZnVuY3Rpb25fY2FsbF9hcmd1bWVudHMuZG9uZScsXG5cdFx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdFx0b3V0cHV0X2luZGV4OiBvdXRwdXRJbmRleCxcblx0XHRcdFx0YXJndW1lbnRzOiBpdGVtLmFyZ3VtZW50cyxcblx0XHRcdH0pLFxuXHRcdF07XG5cdH1cblx0cmV0dXJuIFtcblx0XHRzc2VFdmVudCgncmVzcG9uc2UuY3VzdG9tX3Rvb2xfY2FsbF9pbnB1dC5kZWx0YScsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5jdXN0b21fdG9vbF9jYWxsX2lucHV0LmRlbHRhJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0ZGVsdGE6IGl0ZW0uaW5wdXQsXG5cdFx0fSksXG5cdFx0c3NlRXZlbnQoJ3Jlc3BvbnNlLmN1c3RvbV90b29sX2NhbGxfaW5wdXQuZG9uZScsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5jdXN0b21fdG9vbF9jYWxsX2lucHV0LmRvbmUnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRpbnB1dDogaXRlbS5pbnB1dCxcblx0XHR9KSxcblx0XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJyaWRnZVJlc3VsdFRvUmVzcG9uc2VzU3NlRnJhbWVzKHJlc3VsdDogSUJ5b2tMbUNoYXRSZXN1bHQsIG1vZGVsOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHsgcmVzcG9uc2VJZCwgb3V0cHV0LCBjb21wbGV0ZWQgfSA9IHByZXBhcmVSZXNwb25zZShyZXN1bHQsIG1vZGVsKTtcblx0Y29uc3Qgc2VxdWVuY2UgPSB7IHZhbHVlOiAwIH07XG5cdGNvbnN0IGZyYW1lczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgc2tlbGV0b24gPSByZXNwb25zZUVudmVsb3BlKHJlc3BvbnNlSWQsIG1vZGVsLCAnaW5fcHJvZ3Jlc3MnLCBbXSwgdW5kZWZpbmVkKTtcblx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmNyZWF0ZWQnLCB7IHR5cGU6ICdyZXNwb25zZS5jcmVhdGVkJywgc2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLCByZXNwb25zZTogc2tlbGV0b24gfSkpO1xuXHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2UuaW5fcHJvZ3Jlc3MnLCB7IHR5cGU6ICdyZXNwb25zZS5pbl9wcm9ncmVzcycsIHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKywgcmVzcG9uc2U6IHNrZWxldG9uIH0pKTtcblxuXHRvdXRwdXQuZm9yRWFjaCgoaXRlbSwgb3V0cHV0SW5kZXgpID0+IHtcblx0XHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2Uub3V0cHV0X2l0ZW0uYWRkZWQnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2Uub3V0cHV0X2l0ZW0uYWRkZWQnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0b3V0cHV0X2luZGV4OiBvdXRwdXRJbmRleCxcblx0XHRcdGl0ZW06IHRvSW5Qcm9ncmVzc091dHB1dEl0ZW0oaXRlbSksXG5cdFx0fSkpO1xuXHRcdHN3aXRjaCAoaXRlbS50eXBlKSB7XG5cdFx0XHRjYXNlICdtZXNzYWdlJzpcblx0XHRcdFx0ZnJhbWVzLnB1c2goLi4ubWVzc2FnZUZyYW1lcyhpdGVtLCBvdXRwdXRJbmRleCwgc2VxdWVuY2UpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdyZWFzb25pbmcnOlxuXHRcdFx0XHRmcmFtZXMucHVzaCguLi5yZWFzb25pbmdGcmFtZXMoaXRlbSwgb3V0cHV0SW5kZXgsIHNlcXVlbmNlKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZnVuY3Rpb25fY2FsbCc6XG5cdFx0XHRjYXNlICdjdXN0b21fdG9vbF9jYWxsJzpcblx0XHRcdFx0ZnJhbWVzLnB1c2goLi4uY2FsbEZyYW1lcyhpdGVtLCBvdXRwdXRJbmRleCwgc2VxdWVuY2UpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5vdXRwdXRfaXRlbS5kb25lJywge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmUnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0b3V0cHV0X2luZGV4OiBvdXRwdXRJbmRleCxcblx0XHRcdGl0ZW0sXG5cdFx0fSkpO1xuXHR9KTtcblxuXHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2UuY29tcGxldGVkJywge1xuXHRcdHR5cGU6ICdyZXNwb25zZS5jb21wbGV0ZWQnLFxuXHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRyZXNwb25zZTogY29tcGxldGVkLFxuXHR9KSk7XG5cdHJldHVybiBmcmFtZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNwb25zZXNFcnJvckJvZHkobWVzc2FnZTogc3RyaW5nLCB0eXBlID0gJ2FwaV9lcnJvcicpOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogeyBtZXNzYWdlLCB0eXBlIH0gfSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUEyRE8sTUFBTSxrQ0FBa0MsTUFBTTtBQUFFO0FBRXZELFNBQVMsYUFBYSxNQUF5RTtBQUM5RixVQUFRLE1BQU07QUFBQSxJQUNiLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUjtBQUNDLFlBQU0sSUFBSSwwQkFBMEIsNkJBQTZCLFFBQVEsRUFBRSxHQUFHO0FBQUEsRUFDaEY7QUFDRDtBQUVBLFNBQVMsWUFBWSxTQUF1RCxXQUEwRDtBQUNySSxNQUFJLE9BQU8sWUFBWSxVQUFVO0FBQ2hDLFdBQU8sVUFBVSxDQUFDLEVBQUUsTUFBTSxRQUFRLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQztBQUFBLEVBQ3ZEO0FBQ0EsTUFBSSxDQUFDLE1BQU0sUUFBUSxPQUFPLEdBQUc7QUFDNUIsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUNBLFNBQU8sUUFBUSxJQUFJLENBQUMsTUFBTSxpQkFBaUI7QUFDMUMsU0FBSyxLQUFLLFNBQVMsZ0JBQWdCLEtBQUssU0FBUyxpQkFBaUIsS0FBSyxTQUFTLFdBQVcsT0FBTyxLQUFLLFNBQVMsVUFBVTtBQUN6SCxhQUFPLEVBQUUsTUFB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eUI7QUFDcEcsUUFBTSxFQUFFLFlBQVksUUFBUSxVQUFVLElBQUksZ0JBQWdCLFFBQVEsS0FBSztBQUN2RSxRQUFNLFdBQVcsRUFBRSxPQUFPLEVBQUU7QUFDNUIsUUFBTSxTQUFtQixDQUFDO0FBQzFCLFFBQU0sV0FBVyxpQkFBaUIsWUFBWSxPQUFPLGVBQWUsQ0FBQyxHQUFHLE1BQVM7QUFDakYsU0FBTyxLQUFLLFNBQVMsb0JBQW9CLEVBQUUsTUFBTSxvQkFBb0IsaUJBQWlCLFNBQVMsU0FBUyxVQUFVLFNBQVMsQ0FBQyxDQUFDO0FBQzdILFNBQU8sS0FBSyxTQUFTLHdCQUF3QixFQUFFLE1BQU0sd0JBQXdCLGlCQUFpQixTQUFTLFNBQVMsVUFBVSxTQUFTLENBQUMsQ0FBQztBQUVySSxTQUFPLFFBQVEsQ0FBQyxNQUFNLGdCQUFnQjtBQUNyQyxXQUFPLEtBQUssU0FBUyw4QkFBOEI7QUFBQSxNQUNsRCxNQUFNO0FBQUEsTUFDTixpQkFBaUIsU0FBUztBQUFBLE1BQzFCLGNBQWM7QUFBQSxNQUNkLE1BQU0sdUJBQXVCLElBQUk7QUFBQSxJQUNsQyxDQUFDLENBQUM7QUFDRixZQUFRLEtBQUssTUFBTTtBQUFBLE1BQ2xCLEtBQUs7QUFDSixlQUFPLEtBQUssR0FBRyxjQUFjLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDekQ7QUFBQSxNQUNELEtBQUs7QUFDSixlQUFPLEtBQUssR0FBRyxnQkFBZ0IsTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUMzRDtBQUFBLE1BQ0QsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUNKLGVBQU8sS0FBSyxHQUFHLFdBQVcsTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUN0RDtBQUFBLElBQ0Y7QUFDQSxXQUFPLEtBQUssU0FBUyw2QkFBNkI7QUFBQSxNQUNqRCxNQUFNO0FBQUEsTUFDTixpQkFBaUIsU0FBUztBQUFBLE1BQzFCLGNBQWM7QUFBQSxNQUNkO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxTQUFPLEtBQUssU0FBUyxzQkFBc0I7QUFBQSxJQUMxQyxNQUFNO0FBQUEsSUFDTixpQkFBaUIsU0FBUztBQUFBLElBQzFCLFVBQVU7QUFBQSxFQUNYLENBQUMsQ0FBQztBQUNGLFNBQU87QUFDUjtBQUVPLFNBQVMsbUJBQW1CLFNBQWlCLE9BQU8sYUFBcUI7QUFDL0UsU0FBTyxLQUFLLFVBQVUsRUFBRSxPQUFPLEVBQUUsU0FBUyxLQUFLLEVBQUUsQ0FBQztBQUNuRDsiLAogICJuYW1lcyI6IFtdCn0K
