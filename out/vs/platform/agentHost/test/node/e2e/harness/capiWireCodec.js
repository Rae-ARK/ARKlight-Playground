function parseSseEvents(body) {
  const events = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    if (!block.trim()) {
      continue;
    }
    let dataPayload;
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith("data:")) {
        continue;
      }
      const value = line.slice(5).replace(/^ /, "");
      dataPayload = dataPayload === void 0 ? value : `${dataPayload}
${value}`;
    }
    if (dataPayload === void 0 || dataPayload === "[DONE]") {
      continue;
    }
    try {
      const parsed = JSON.parse(dataPayload);
      if (typeof parsed.type === "string") {
        events.push(parsed);
      }
    } catch {
    }
  }
  return events;
}
const ANTHROPIC_MESSAGES_PATH = "/v1/messages";
function aggregateAnthropicSse(sseBody) {
  const events = parseSseEvents(sseBody);
  let started = false;
  let stopReason = null;
  let inputTokens;
  let outputTokens;
  const blocks = [];
  const toolInputBuffers = [];
  for (const evt of events) {
    switch (evt.type) {
      case "message_start": {
        started = true;
        const message = evt["message"];
        inputTokens = message?.usage?.input_tokens;
        break;
      }
      case "content_block_start": {
        const index = evt["index"];
        const block = evt["content_block"];
        if (block.type === "text") {
          blocks[index] = { type: "text", text: block.text ?? "" };
        } else if (block.type === "tool_use") {
          blocks[index] = { type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: {} };
          toolInputBuffers[index] = "";
        }
        break;
      }
      case "content_block_delta": {
        const index = evt["index"];
        const delta = evt["delta"];
        const block = blocks[index];
        if (!block) {
          break;
        }
        if (delta.type === "text_delta" && block.type === "text") {
          block.text += delta.text ?? "";
        } else if (delta.type === "input_json_delta" && block.type === "tool_use") {
          toolInputBuffers[index] = (toolInputBuffers[index] ?? "") + (delta.partial_json ?? "");
        }
        break;
      }
      case "content_block_stop": {
        const index = evt["index"];
        const block = blocks[index];
        if (block?.type === "tool_use") {
          block.input = safeParseJson(toolInputBuffers[index] ?? "{}");
        }
        break;
      }
      case "message_delta": {
        const delta = evt["delta"];
        const usage = evt["usage"];
        if (delta?.stop_reason !== void 0) {
          stopReason = delta.stop_reason;
        }
        if (usage?.output_tokens !== void 0) {
          outputTokens = usage.output_tokens;
        }
        break;
      }
    }
  }
  if (!started) {
    return void 0;
  }
  return {
    content: blocks.filter((b) => !!b),
    stopReason,
    usage: inputTokens !== void 0 || outputTokens !== void 0 ? { inputTokens, outputTokens } : void 0
  };
}
function anthropicMessageToSse(message) {
  const id = `msg_replay_${randomHex()}`;
  const chunks = [];
  chunks.push(sseEvent("message_start", {
    type: "message_start",
    message: {
      id,
      type: "message",
      role: "assistant",
      content: [],
      model: "replay",
      stop_reason: null,
      stop_sequence: null,
      // Real Anthropic emits output_tokens=1 here; corrected by message_delta.
      usage: { input_tokens: message.usage?.inputTokens ?? 1, output_tokens: 1 }
    }
  }));
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      chunks.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }));
      chunks.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }));
      chunks.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    } else {
      chunks.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }));
      chunks.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input ?? {}) } }));
      chunks.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    }
  });
  chunks.push(sseEvent("message_delta", {
    type: "message_delta",
    delta: { stop_reason: message.stopReason, stop_sequence: null },
    usage: { output_tokens: message.usage?.outputTokens ?? 1 }
  }));
  chunks.push(sseEvent("message_stop", { type: "message_stop" }));
  return chunks.join("");
}
const SYSTEM_PLACEHOLDER = "${system}";
function summarizeAnthropicRequest(requestBody) {
  let parsed;
  try {
    parsed = JSON.parse(requestBody);
  } catch {
    return void 0;
  }
  if (typeof parsed.model !== "string" || !Array.isArray(parsed.messages)) {
    return void 0;
  }
  const messages = parsed.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role ?? "user", content: summarizeContent(m.content) })).filter((m) => !isEmptyContent(m.content));
  return {
    model: parsed.model,
    system: parsed.system !== void 0 ? SYSTEM_PLACEHOLDER : "",
    messages
  };
}
function isEmptyContent(content) {
  return content === "" || Array.isArray(content) && content.length === 0;
}
function summarizeContent(content) {
  if (typeof content === "string") {
    return normalizeVolatileText(content);
  }
  if (!Array.isArray(content)) {
    return content;
  }
  const blocks = content.map((block) => {
    const b = block;
    switch (b.type) {
      case "text":
        return { type: "text", text: normalizeVolatileText(b.text ?? "") };
      case "tool_use":
        return { type: "tool_use", name: b.name, input: b.input };
      case "tool_result":
        return { type: "tool_result", tool_use_id: b.tool_use_id, content: summarizeContent(b.content) };
      default:
        return { type: b.type };
    }
  }).filter((b) => !(b.type === "text" && b.text === ""));
  return collapseSingleText(blocks);
}
function collapseSingleText(blocks) {
  if (blocks.length === 1) {
    const only = blocks[0];
    if (only.type === "text" && typeof only.text === "string") {
      return only.text;
    }
  }
  return blocks;
}
function serializeAnthropicContent(content) {
  if (content.length === 1 && content[0].type === "text") {
    return content[0].text;
  }
  return content;
}
function deserializeAnthropicContent(content) {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}
const CURRENT_DATETIME_RE = /<current_datetime>.*?<\/current_datetime>/gs;
const SYSTEM_REMINDER_RE = /<system[-_]reminder>.*?<\/system[-_]reminder>/gs;
const ENVIRONMENT_CONTEXT_RE = /<environment_context>.*?<\/environment_context>/gs;
function normalizeVolatileText(text) {
  return text.replace(CURRENT_DATETIME_RE, "").replace(SYSTEM_REMINDER_RE, "").replace(ENVIRONMENT_CONTEXT_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}
const RESPONSES_PATH = "/responses";
function aggregateResponsesSse(sseBody) {
  const events = parseSseEvents(sseBody);
  const blocks = [];
  let usage;
  let seen = false;
  for (const evt of events) {
    if (evt.type === "response.output_item.done") {
      seen = true;
      const item = evt["item"];
      if (item.type === "message") {
        const text = (item.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
        if (text) {
          blocks.push({ type: "text", text });
        }
      } else if (item.type === "function_call") {
        blocks.push({ type: "tool_use", id: item.call_id ?? item.id ?? "", name: item.name ?? "", input: safeParseJson(item.arguments ?? "{}") });
      }
    } else if (evt.type === "response.completed") {
      usage = usageFromResponsesEvent(evt);
    }
  }
  if (!seen) {
    return void 0;
  }
  const stopReason = blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  return { content: blocks, stopReason, usage: usage && (usage.inputTokens !== void 0 || usage.outputTokens !== void 0) ? usage : void 0 };
}
function usageFromResponsesEvent(evt) {
  const response = evt["response"];
  if (response?.usage && (response.usage.input_tokens !== void 0 || response.usage.output_tokens !== void 0)) {
    return { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  }
  const details = evt["copilot_usage"]?.token_details;
  if (Array.isArray(details)) {
    let inputTokens;
    let outputTokens;
    for (const d of details) {
      if (d.token_type === "input") {
        inputTokens = d.token_count;
      } else if (d.token_type === "output") {
        outputTokens = d.token_count;
      }
    }
    return { inputTokens, outputTokens };
  }
  return {};
}
function summarizeResponsesRequest(requestBody) {
  let parsed;
  try {
    parsed = JSON.parse(requestBody);
  } catch {
    return void 0;
  }
  if (typeof parsed.model !== "string") {
    return void 0;
  }
  return {
    model: parsed.model,
    system: parsed.instructions !== void 0 ? SYSTEM_PLACEHOLDER : "",
    messages: responsesInputToMessages(parsed.input)
  };
}
function responsesInputToMessages(input) {
  if (typeof input === "string") {
    const text = normalizeVolatileText(input);
    return text ? [{ role: "user", content: text }] : [];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  const messages = [];
  for (const raw of input) {
    const item = raw;
    switch (item.type) {
      case "message": {
        if (item.role === "system" || item.role === "developer") {
          break;
        }
        const content = summarizeContent(responsesTextParts(item.content));
        if (!isEmptyContent(content)) {
          messages.push({ role: item.role ?? "user", content });
        }
        break;
      }
      case "function_call":
        messages.push({ role: "assistant", content: [{ type: "tool_use", name: item.name, input: safeParseJson(item.arguments ?? "{}") }] });
        break;
      case "function_call_output":
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: item.call_id, content: summarizeResponsesOutput(item.output) }] });
        break;
    }
  }
  return messages;
}
function responsesTextParts(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return content;
  }
  return content.map((part) => {
    const p = part;
    return { type: "text", text: p.text ?? "" };
  });
}
function summarizeResponsesOutput(output) {
  if (typeof output === "string") {
    return normalizeVolatileText(output);
  }
  return summarizeContent(output);
}
function responsesMessageToSse(message) {
  const responseId = `resp_replay_${randomHex()}`;
  let seq = 0;
  const outputItems = message.content.map((block, index) => {
    const id = `item_${index}`;
    return block.type === "text" ? { id, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: block.text, annotations: [], logprobs: [] }] } : { id, type: "function_call", name: block.name, call_id: block.id, arguments: JSON.stringify(block.input ?? {}), status: "completed" };
  });
  const outputText = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const usage = {
    input_tokens: message.usage?.inputTokens ?? 1,
    output_tokens: message.usage?.outputTokens ?? 1,
    total_tokens: (message.usage?.inputTokens ?? 1) + (message.usage?.outputTokens ?? 1)
  };
  const envelope = (status, output, text, use) => ({
    id: responseId,
    object: "response",
    created_at: 0,
    status,
    error: null,
    incomplete_details: null,
    instructions: null,
    model: "replay",
    output,
    output_text: text,
    parallel_tool_calls: true,
    temperature: 1,
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    usage: use
  });
  const chunks = [];
  const skeleton = envelope("in_progress", [], "", void 0);
  chunks.push(sseEvent("response.created", { type: "response.created", sequence_number: seq++, response: skeleton }));
  chunks.push(sseEvent("response.in_progress", { type: "response.in_progress", sequence_number: seq++, response: skeleton }));
  outputItems.forEach((item, index) => {
    const addedItem = item.type === "message" ? { ...item, status: "in_progress", content: [] } : { ...item, status: "in_progress", arguments: "" };
    chunks.push(sseEvent("response.output_item.added", { type: "response.output_item.added", sequence_number: seq++, output_index: index, item: addedItem }));
    if (item.type === "message") {
      const text = item.content[0].text;
      const part = { type: "output_text", text, annotations: [], logprobs: [] };
      chunks.push(sseEvent("response.content_part.added", { type: "response.content_part.added", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, part: { type: "output_text", text: "", annotations: [], logprobs: [] } }));
      chunks.push(sseEvent("response.output_text.delta", { type: "response.output_text.delta", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, delta: text, logprobs: [] }));
      chunks.push(sseEvent("response.output_text.done", { type: "response.output_text.done", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, text, logprobs: [] }));
      chunks.push(sseEvent("response.content_part.done", { type: "response.content_part.done", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, part }));
    } else {
      chunks.push(sseEvent("response.function_call_arguments.delta", { type: "response.function_call_arguments.delta", sequence_number: seq++, item_id: item.id, output_index: index, delta: item.arguments }));
      chunks.push(sseEvent("response.function_call_arguments.done", { type: "response.function_call_arguments.done", sequence_number: seq++, item_id: item.id, output_index: index, arguments: item.arguments }));
    }
    chunks.push(sseEvent("response.output_item.done", { type: "response.output_item.done", sequence_number: seq++, output_index: index, item }));
  });
  chunks.push(sseEvent("response.completed", { type: "response.completed", sequence_number: seq++, response: envelope("completed", outputItems, outputText, usage) }));
  return chunks.join("");
}
function sseEvent(eventName, data) {
  return `event: ${eventName}
data: ${JSON.stringify(data)}

`;
}
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
function randomHex() {
  return Math.floor(Math.random() * 4294967295).toString(16).padStart(8, "0");
}
export {
  ANTHROPIC_MESSAGES_PATH,
  RESPONSES_PATH,
  aggregateAnthropicSse,
  aggregateResponsesSse,
  anthropicMessageToSse,
  deserializeAnthropicContent,
  parseSseEvents,
  responsesMessageToSse,
  serializeAnthropicContent,
  summarizeAnthropicRequest,
  summarizeResponsesRequest
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL2hhcm5lc3MvY2FwaVdpcmVDb2RlYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogV2lyZSBjb2RlY3MgZm9yIHRoZSBDQVBJIHJlY29yZC9yZXBsYXkgcHJveHkuIEVhY2ggZGlhbGVjdCB0aGUgYWdlbnQgaG9zdCdzXG4gKiBidW5kbGVkIFNESy9DTEkgc3BlYWtzIGNhbiBiZSBwYXJzZWQgZnJvbSBpdHMgc3RyZWFtZWQgU1NFIGZvcm0gaW50byBhIHNtYWxsLFxuICogaHVtYW4tcmVhZGFibGUgbWVzc2FnZSBvYmplY3QgKGZvciBhIGNsZWFuIFlBTUwgY2FwdHVyZSkgYW5kIHJlZ2VuZXJhdGVkIGJhY2tcbiAqIGludG8gYW4gU1NFIHN0cmVhbSBvbiByZXBsYXkuXG4gKlxuICogUG9ydGVkIChsZWFuKSBmcm9tIHRoZSBDb3BpbG90IENMSSBlMmUgaGFybmVzcydzIGRpYWxlY3QgYWRhcHRlcnMgXHUyMDE0IHdlIGtlZXBcbiAqIHRoZSBtZXNzYWdlcyBpbiB0aGVpciBuYXRpdmUgZGlhbGVjdCBzaGFwZSByYXRoZXIgdGhhbiBub3JtYWxpemluZyB0byBPcGVuQUlcbiAqIGNoYXQtY29tcGxldGlvbnMsIHdoaWNoIGlzIGVub3VnaCBmb3IgcmVhZGFibGUgY2FwdHVyZXMgKyBmYWl0aGZ1bCByZXBsYXkuXG4gKlxuICogQ3VycmVudGx5IHN1cHBvcnRzIHRoZSBBbnRocm9waWMgTWVzc2FnZXMgZGlhbGVjdCAoYFBPU1QgL3YxL21lc3NhZ2VzYCksXG4gKiB3aGljaCBpcyB3aGF0IHRoZSBDb3BpbG90IGFuZCBDbGF1ZGUgcHJvdmlkZXJzIHVzZS5cbiAqL1xuXG4vLyAjcmVnaW9uIFNTRSBwYXJzaW5nXG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNzZUV2ZW50IHtcblx0cmVhZG9ubHkgdHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBba2V5OiBzdHJpbmddOiB1bmtub3duO1xufVxuXG4vKipcbiAqIFBhcnNlIGFuIFNTRSBib2R5IGludG8gdHlwZWQgSlNPTiBldmVudHMuIFRvbGVyYW50IG9mIGBcXHI/XFxuYCBsaW5lIGVuZGluZ3MgYW5kXG4gKiBtdWx0aXBsZSBgZGF0YTpgIGxpbmVzIHBlciBldmVudCAoam9pbmVkIHdpdGggYFxcbmAgcGVyIHRoZSBTU0Ugc3BlYykuIFNraXBzXG4gKiBgW0RPTkVdYCBzZW50aW5lbHMgYW5kIGV2ZW50cyB3aXRob3V0IGEgc3RyaW5nIGB0eXBlYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU3NlRXZlbnRzKGJvZHk6IHN0cmluZyk6IElTc2VFdmVudFtdIHtcblx0Y29uc3QgZXZlbnRzOiBJU3NlRXZlbnRbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIGJvZHkuc3BsaXQoL1xccj9cXG5cXHI/XFxuLykpIHtcblx0XHRpZiAoIWJsb2NrLnRyaW0oKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGxldCBkYXRhUGF5bG9hZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBibG9jay5zcGxpdCgvXFxyP1xcbi8pKSB7XG5cdFx0XHRpZiAoIWxpbmUuc3RhcnRzV2l0aCgnZGF0YTonKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhbHVlID0gbGluZS5zbGljZSg1KS5yZXBsYWNlKC9eIC8sICcnKTtcblx0XHRcdGRhdGFQYXlsb2FkID0gZGF0YVBheWxvYWQgPT09IHVuZGVmaW5lZCA/IHZhbHVlIDogYCR7ZGF0YVBheWxvYWR9XFxuJHt2YWx1ZX1gO1xuXHRcdH1cblx0XHRpZiAoZGF0YVBheWxvYWQgPT09IHVuZGVmaW5lZCB8fCBkYXRhUGF5bG9hZCA9PT0gJ1tET05FXScpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhUGF5bG9hZCkgYXMgeyB0eXBlPzogdW5rbm93biB9O1xuXHRcdFx0aWYgKHR5cGVvZiBwYXJzZWQudHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2gocGFyc2VkIGFzIElTc2VFdmVudCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBza2lwIG1hbGZvcm1lZCBldmVudHNcblx0XHR9XG5cdH1cblx0cmV0dXJuIGV2ZW50cztcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEFudGhyb3BpYyBNZXNzYWdlcyBkaWFsZWN0XG5cbi8qKiBBIGNvbnRlbnQgYmxvY2sgaW4gYW4gQW50aHJvcGljIGFzc2lzdGFudCBtZXNzYWdlICh0aGUgc3Vic2V0IHdlIGNhcHR1cmUpLiAqL1xuZXhwb3J0IHR5cGUgQW50aHJvcGljQ29udGVudEJsb2NrID1cblx0fCB7IHJlYWRvbmx5IHR5cGU6ICd0ZXh0JzsgdGV4dDogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IHR5cGU6ICd0b29sX3VzZSc7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgaW5wdXQ6IHVua25vd24gfTtcblxuLyoqIFRoZSBjYXB0dXJlZC9yZXBsYXllZCBzaGFwZSBvZiBhbiBBbnRocm9waWMgYC92MS9tZXNzYWdlc2AgYXNzaXN0YW50IHJlcGx5LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQW50aHJvcGljTWVzc2FnZSB7XG5cdHJlYWRvbmx5IGNvbnRlbnQ6IEFudGhyb3BpY0NvbnRlbnRCbG9ja1tdO1xuXHRyZWFkb25seSBzdG9wUmVhc29uOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSB1c2FnZT86IHsgcmVhZG9ubHkgaW5wdXRUb2tlbnM/OiBudW1iZXI7IHJlYWRvbmx5IG91dHB1dFRva2Vucz86IG51bWJlciB9O1xufVxuXG5leHBvcnQgY29uc3QgQU5USFJPUElDX01FU1NBR0VTX1BBVEggPSAnL3YxL21lc3NhZ2VzJztcblxuaW50ZXJmYWNlIElNdXRhYmxlVGV4dEJsb2NrIHsgdHlwZTogJ3RleHQnOyB0ZXh0OiBzdHJpbmcgfVxuaW50ZXJmYWNlIElNdXRhYmxlVG9vbFVzZUJsb2NrIHsgdHlwZTogJ3Rvb2xfdXNlJzsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBpbnB1dDogdW5rbm93biB9XG50eXBlIE11dGFibGVCbG9jayA9IElNdXRhYmxlVGV4dEJsb2NrIHwgSU11dGFibGVUb29sVXNlQmxvY2s7XG5cbi8qKlxuICogQWdncmVnYXRlIGEgc3RyZWFtZWQgQW50aHJvcGljIGAvdjEvbWVzc2FnZXNgIFNTRSBib2R5IGludG8gYSBzaW5nbGUgbWVzc2FnZVxuICogKGNvbnRlbnQgYmxvY2tzICsgc3RvcCByZWFzb24gKyB1c2FnZSkuIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZSBzdHJlYW0gaGFkXG4gKiBubyBgbWVzc2FnZV9zdGFydGAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZ2dyZWdhdGVBbnRocm9waWNTc2Uoc3NlQm9keTogc3RyaW5nKTogSUFudGhyb3BpY01lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRjb25zdCBldmVudHMgPSBwYXJzZVNzZUV2ZW50cyhzc2VCb2R5KTtcblx0bGV0IHN0YXJ0ZWQgPSBmYWxzZTtcblx0bGV0IHN0b3BSZWFzb246IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRsZXQgaW5wdXRUb2tlbnM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGV0IG91dHB1dFRva2VuczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBibG9ja3M6IE11dGFibGVCbG9ja1tdID0gW107XG5cdGNvbnN0IHRvb2xJbnB1dEJ1ZmZlcnM6IHN0cmluZ1tdID0gW107XG5cblx0Zm9yIChjb25zdCBldnQgb2YgZXZlbnRzKSB7XG5cdFx0c3dpdGNoIChldnQudHlwZSkge1xuXHRcdFx0Y2FzZSAnbWVzc2FnZV9zdGFydCc6IHtcblx0XHRcdFx0c3RhcnRlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBldnRbJ21lc3NhZ2UnXSBhcyB7IHVzYWdlPzogeyBpbnB1dF90b2tlbnM/OiBudW1iZXIgfSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpbnB1dFRva2VucyA9IG1lc3NhZ2U/LnVzYWdlPy5pbnB1dF90b2tlbnM7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY29udGVudF9ibG9ja19zdGFydCc6IHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBldnRbJ2luZGV4J10gYXMgbnVtYmVyO1xuXHRcdFx0XHRjb25zdCBibG9jayA9IGV2dFsnY29udGVudF9ibG9jayddIGFzIHsgdHlwZTogc3RyaW5nOyBpZD86IHN0cmluZzsgbmFtZT86IHN0cmluZzsgdGV4dD86IHN0cmluZyB9O1xuXHRcdFx0XHRpZiAoYmxvY2sudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0YmxvY2tzW2luZGV4XSA9IHsgdHlwZTogJ3RleHQnLCB0ZXh0OiBibG9jay50ZXh0ID8/ICcnIH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoYmxvY2sudHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuXHRcdFx0XHRcdGJsb2Nrc1tpbmRleF0gPSB7IHR5cGU6ICd0b29sX3VzZScsIGlkOiBibG9jay5pZCA/PyAnJywgbmFtZTogYmxvY2submFtZSA/PyAnJywgaW5wdXQ6IHt9IH07XG5cdFx0XHRcdFx0dG9vbElucHV0QnVmZmVyc1tpbmRleF0gPSAnJztcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NvbnRlbnRfYmxvY2tfZGVsdGEnOiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gZXZ0WydpbmRleCddIGFzIG51bWJlcjtcblx0XHRcdFx0Y29uc3QgZGVsdGEgPSBldnRbJ2RlbHRhJ10gYXMgeyB0eXBlOiBzdHJpbmc7IHRleHQ/OiBzdHJpbmc7IHBhcnRpYWxfanNvbj86IHN0cmluZyB9O1xuXHRcdFx0XHRjb25zdCBibG9jayA9IGJsb2Nrc1tpbmRleF07XG5cdFx0XHRcdGlmICghYmxvY2spIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGVsdGEudHlwZSA9PT0gJ3RleHRfZGVsdGEnICYmIGJsb2NrLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdGJsb2NrLnRleHQgKz0gZGVsdGEudGV4dCA/PyAnJztcblx0XHRcdFx0fSBlbHNlIGlmIChkZWx0YS50eXBlID09PSAnaW5wdXRfanNvbl9kZWx0YScgJiYgYmxvY2sudHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuXHRcdFx0XHRcdHRvb2xJbnB1dEJ1ZmZlcnNbaW5kZXhdID0gKHRvb2xJbnB1dEJ1ZmZlcnNbaW5kZXhdID8/ICcnKSArIChkZWx0YS5wYXJ0aWFsX2pzb24gPz8gJycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY29udGVudF9ibG9ja19zdG9wJzoge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IGV2dFsnaW5kZXgnXSBhcyBudW1iZXI7XG5cdFx0XHRcdGNvbnN0IGJsb2NrID0gYmxvY2tzW2luZGV4XTtcblx0XHRcdFx0aWYgKGJsb2NrPy50eXBlID09PSAndG9vbF91c2UnKSB7XG5cdFx0XHRcdFx0YmxvY2suaW5wdXQgPSBzYWZlUGFyc2VKc29uKHRvb2xJbnB1dEJ1ZmZlcnNbaW5kZXhdID8/ICd7fScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnbWVzc2FnZV9kZWx0YSc6IHtcblx0XHRcdFx0Y29uc3QgZGVsdGEgPSBldnRbJ2RlbHRhJ10gYXMgeyBzdG9wX3JlYXNvbj86IHN0cmluZyB8IG51bGwgfSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgdXNhZ2UgPSBldnRbJ3VzYWdlJ10gYXMgeyBvdXRwdXRfdG9rZW5zPzogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChkZWx0YT8uc3RvcF9yZWFzb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHN0b3BSZWFzb24gPSBkZWx0YS5zdG9wX3JlYXNvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodXNhZ2U/Lm91dHB1dF90b2tlbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG91dHB1dFRva2VucyA9IHVzYWdlLm91dHB1dF90b2tlbnM7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKCFzdGFydGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdGNvbnRlbnQ6IGJsb2Nrcy5maWx0ZXIoKGIpOiBiIGlzIE11dGFibGVCbG9jayA9PiAhIWIpLFxuXHRcdHN0b3BSZWFzb24sXG5cdFx0dXNhZ2U6IChpbnB1dFRva2VucyAhPT0gdW5kZWZpbmVkIHx8IG91dHB1dFRva2VucyAhPT0gdW5kZWZpbmVkKSA/IHsgaW5wdXRUb2tlbnMsIG91dHB1dFRva2VucyB9IDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG4vKipcbiAqIFJlZ2VuZXJhdGUgYW4gQW50aHJvcGljIGAvdjEvbWVzc2FnZXNgIFNTRSBzdHJlYW0gZnJvbSBhIGNhcHR1cmVkIG1lc3NhZ2UuXG4gKiBFbWl0cyB0aGUgZnVsbCBldmVudCBzZXF1ZW5jZSAoYG1lc3NhZ2Vfc3RhcnRgIC0+IHBlci1ibG9ja1xuICogc3RhcnQvZGVsdGEvc3RvcCAtPiBgbWVzc2FnZV9kZWx0YWAgLT4gYG1lc3NhZ2Vfc3RvcGApIHRoZSBTREsgZXhwZWN0cy4gVGV4dFxuICogYW5kIHRvb2wgaW5wdXRzIGFyZSBlYWNoIGVtaXR0ZWQgYXMgYSBzaW5nbGUgZGVsdGEsIHdoaWNoIHRoZSBydW50aW1lIGNsaWVudFxuICogdG9sZXJhdGVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYW50aHJvcGljTWVzc2FnZVRvU3NlKG1lc3NhZ2U6IElBbnRocm9waWNNZXNzYWdlKTogc3RyaW5nIHtcblx0Y29uc3QgaWQgPSBgbXNnX3JlcGxheV8ke3JhbmRvbUhleCgpfWA7XG5cdGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcblxuXHRjaHVua3MucHVzaChzc2VFdmVudCgnbWVzc2FnZV9zdGFydCcsIHtcblx0XHR0eXBlOiAnbWVzc2FnZV9zdGFydCcsXG5cdFx0bWVzc2FnZToge1xuXHRcdFx0aWQsXG5cdFx0XHR0eXBlOiAnbWVzc2FnZScsXG5cdFx0XHRyb2xlOiAnYXNzaXN0YW50Jyxcblx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0bW9kZWw6ICdyZXBsYXknLFxuXHRcdFx0c3RvcF9yZWFzb246IG51bGwsXG5cdFx0XHRzdG9wX3NlcXVlbmNlOiBudWxsLFxuXHRcdFx0Ly8gUmVhbCBBbnRocm9waWMgZW1pdHMgb3V0cHV0X3Rva2Vucz0xIGhlcmU7IGNvcnJlY3RlZCBieSBtZXNzYWdlX2RlbHRhLlxuXHRcdFx0dXNhZ2U6IHsgaW5wdXRfdG9rZW5zOiBtZXNzYWdlLnVzYWdlPy5pbnB1dFRva2VucyA/PyAxLCBvdXRwdXRfdG9rZW5zOiAxIH0sXG5cdFx0fSxcblx0fSkpO1xuXG5cdG1lc3NhZ2UuY29udGVudC5mb3JFYWNoKChibG9jaywgaW5kZXgpID0+IHtcblx0XHRpZiAoYmxvY2sudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRjaHVua3MucHVzaChzc2VFdmVudCgnY29udGVudF9ibG9ja19zdGFydCcsIHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RhcnQnLCBpbmRleCwgY29udGVudF9ibG9jazogeyB0eXBlOiAndGV4dCcsIHRleHQ6ICcnIH0gfSkpO1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ2NvbnRlbnRfYmxvY2tfZGVsdGEnLCB7IHR5cGU6ICdjb250ZW50X2Jsb2NrX2RlbHRhJywgaW5kZXgsIGRlbHRhOiB7IHR5cGU6ICd0ZXh0X2RlbHRhJywgdGV4dDogYmxvY2sudGV4dCB9IH0pKTtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdjb250ZW50X2Jsb2NrX3N0b3AnLCB7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0b3AnLCBpbmRleCB9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdjb250ZW50X2Jsb2NrX3N0YXJ0JywgeyB0eXBlOiAnY29udGVudF9ibG9ja19zdGFydCcsIGluZGV4LCBjb250ZW50X2Jsb2NrOiB7IHR5cGU6ICd0b29sX3VzZScsIGlkOiBibG9jay5pZCwgbmFtZTogYmxvY2submFtZSwgaW5wdXQ6IHt9IH0gfSkpO1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ2NvbnRlbnRfYmxvY2tfZGVsdGEnLCB7IHR5cGU6ICdjb250ZW50X2Jsb2NrX2RlbHRhJywgaW5kZXgsIGRlbHRhOiB7IHR5cGU6ICdpbnB1dF9qc29uX2RlbHRhJywgcGFydGlhbF9qc29uOiBKU09OLnN0cmluZ2lmeShibG9jay5pbnB1dCA/PyB7fSkgfSB9KSk7XG5cdFx0XHRjaHVua3MucHVzaChzc2VFdmVudCgnY29udGVudF9ibG9ja19zdG9wJywgeyB0eXBlOiAnY29udGVudF9ibG9ja19zdG9wJywgaW5kZXggfSkpO1xuXHRcdH1cblx0fSk7XG5cblx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ21lc3NhZ2VfZGVsdGEnLCB7XG5cdFx0dHlwZTogJ21lc3NhZ2VfZGVsdGEnLFxuXHRcdGRlbHRhOiB7IHN0b3BfcmVhc29uOiBtZXNzYWdlLnN0b3BSZWFzb24sIHN0b3Bfc2VxdWVuY2U6IG51bGwgfSxcblx0XHR1c2FnZTogeyBvdXRwdXRfdG9rZW5zOiBtZXNzYWdlLnVzYWdlPy5vdXRwdXRUb2tlbnMgPz8gMSB9LFxuXHR9KSk7XG5cdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdtZXNzYWdlX3N0b3AnLCB7IHR5cGU6ICdtZXNzYWdlX3N0b3AnIH0pKTtcblxuXHRyZXR1cm4gY2h1bmtzLmpvaW4oJycpO1xufVxuXG4vKipcbiAqIEEgY29tcGFjdCwgaHVtYW4tcmVhZGFibGUgdmlldyBvZiBhbiBBbnRocm9waWMgYC92MS9tZXNzYWdlc2AgcmVxdWVzdCwgZm9yXG4gKiB0aGUgWUFNTCBjYXB0dXJlLiBUaGUgKGxhcmdlLCBtb2RlbC1jYXRhbG9nLWJlYXJpbmcpIHN5c3RlbSBwcm9tcHQgaXNcbiAqIHJlcGxhY2VkIHdpdGggYSBwbGFjZWhvbGRlci4gTWVzc2FnZSBjb250ZW50IGlzIGNvbGxhcHNlZCB0byBhIGJhcmUgc3RyaW5nXG4gKiB3aGVuIGl0IGlzIGEgc2luZ2xlIHRleHQgYmxvY2sgKHNlZSB7QGxpbmsgY29sbGFwc2VTaW5nbGVUZXh0fSkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCB7XG5cdHJlYWRvbmx5IG1vZGVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN5c3RlbTogc3RyaW5nO1xuXHRyZWFkb25seSBtZXNzYWdlczogUmVhZG9ubHlBcnJheTx7IHJlYWRvbmx5IHJvbGU6IHN0cmluZzsgcmVhZG9ubHkgY29udGVudDogdW5rbm93biB9Pjtcbn1cblxuY29uc3QgU1lTVEVNX1BMQUNFSE9MREVSID0gJyR7c3lzdGVtfSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBzdW1tYXJpemVBbnRocm9waWNSZXF1ZXN0KHJlcXVlc3RCb2R5OiBzdHJpbmcpOiBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0bGV0IHBhcnNlZDogeyBtb2RlbD86IHN0cmluZzsgc3lzdGVtPzogdW5rbm93bjsgbWVzc2FnZXM/OiBBcnJheTx7IHJvbGU/OiBzdHJpbmc7IGNvbnRlbnQ/OiB1bmtub3duIH0+IH07XG5cdHRyeSB7XG5cdFx0cGFyc2VkID0gSlNPTi5wYXJzZShyZXF1ZXN0Qm9keSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiBwYXJzZWQubW9kZWwgIT09ICdzdHJpbmcnIHx8ICFBcnJheS5pc0FycmF5KHBhcnNlZC5tZXNzYWdlcykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIERyb3AgaGFybmVzcy1pbmplY3RlZCBgc3lzdGVtYC1yb2xlIG1lc3NhZ2VzIChlLmcuIENsYXVkZSBDb2RlJ3MgYXZhaWxhYmxlXG5cdC8vIC1za2lsbHMgbGlzdGluZykgXHUyMDE0IHRoZXkgYXJlIGVudmlyb25tZW50LXNwZWNpZmljIGJvaWxlcnBsYXRlLCBub3QgcGFydCBvZlxuXHQvLyB0aGUgY29udmVyc2F0aW9uLCBhbmQgdGhlIHJlYWwgc3lzdGVtIHByb21wdCBpcyBhbHJlYWR5IGEgcGxhY2Vob2xkZXIuXG5cdGNvbnN0IG1lc3NhZ2VzID0gcGFyc2VkLm1lc3NhZ2VzXG5cdFx0LmZpbHRlcihtID0+IG0ucm9sZSAhPT0gJ3N5c3RlbScpXG5cdFx0Lm1hcChtID0+ICh7IHJvbGU6IG0ucm9sZSA/PyAndXNlcicsIGNvbnRlbnQ6IHN1bW1hcml6ZUNvbnRlbnQobS5jb250ZW50KSB9KSlcblx0XHQuZmlsdGVyKG0gPT4gIWlzRW1wdHlDb250ZW50KG0uY29udGVudCkpO1xuXHRyZXR1cm4ge1xuXHRcdG1vZGVsOiBwYXJzZWQubW9kZWwsXG5cdFx0c3lzdGVtOiBwYXJzZWQuc3lzdGVtICE9PSB1bmRlZmluZWQgPyBTWVNURU1fUExBQ0VIT0xERVIgOiAnJyxcblx0XHRtZXNzYWdlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gaXNFbXB0eUNvbnRlbnQoY29udGVudDogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY29udGVudCA9PT0gJycgfHwgKEFycmF5LmlzQXJyYXkoY29udGVudCkgJiYgY29udGVudC5sZW5ndGggPT09IDApO1xufVxuXG4vKiogUmVkdWNlIG1lc3NhZ2UgY29udGVudCB0byBzb21ldGhpbmcgcmVhZGFibGU6IHBsYWluIHN0cmluZ3Mgc3RheSwgYmxvY2tcbiAqIGFycmF5cyBrZWVwIHR5cGUgKyB0aGUgc2FsaWVudCBmaWVsZCAodGV4dCAvIHRvb2wgbmFtZSAvIHRvb2xfdXNlX2lkKS4gQVxuICogbG9uZSB0ZXh0IGJsb2NrIGNvbGxhcHNlcyB0byBhIGJhcmUgc3RyaW5nLiBWb2xhdGlsZSBwZXItcnVuIHZhbHVlcyAoZS5nLiB0aGVcbiAqIGluamVjdGVkIHdhbGwgY2xvY2spIGFyZSBub3JtYWxpemVkIHNvIGNhcHR1cmVzIHN0YXkgZGV0ZXJtaW5pc3RpYy4gKi9cbmZ1bmN0aW9uIHN1bW1hcml6ZUNvbnRlbnQoY29udGVudDogdW5rbm93bik6IHVua25vd24ge1xuXHRpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIG5vcm1hbGl6ZVZvbGF0aWxlVGV4dChjb250ZW50KTtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudCkpIHtcblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXHRjb25zdCBibG9ja3MgPSBjb250ZW50Lm1hcChibG9jayA9PiB7XG5cdFx0Y29uc3QgYiA9IGJsb2NrIGFzIHsgdHlwZT86IHN0cmluZzsgdGV4dD86IHN0cmluZzsgbmFtZT86IHN0cmluZzsgaW5wdXQ/OiB1bmtub3duOyB0b29sX3VzZV9pZD86IHN0cmluZzsgY29udGVudD86IHVua25vd24gfTtcblx0XHRzd2l0Y2ggKGIudHlwZSkge1xuXHRcdFx0Y2FzZSAndGV4dCc6IHJldHVybiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogbm9ybWFsaXplVm9sYXRpbGVUZXh0KGIudGV4dCA/PyAnJykgfTtcblx0XHRcdGNhc2UgJ3Rvb2xfdXNlJzogcmV0dXJuIHsgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogYi5uYW1lLCBpbnB1dDogYi5pbnB1dCB9O1xuXHRcdFx0Y2FzZSAndG9vbF9yZXN1bHQnOiByZXR1cm4geyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogYi50b29sX3VzZV9pZCwgY29udGVudDogc3VtbWFyaXplQ29udGVudChiLmNvbnRlbnQpIH07XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4geyB0eXBlOiBiLnR5cGUgfTtcblx0XHR9XG5cdH0pLmZpbHRlcihiID0+ICEoYi50eXBlID09PSAndGV4dCcgJiYgKGIgYXMgeyB0ZXh0Pzogc3RyaW5nIH0pLnRleHQgPT09ICcnKSk7XG5cdHJldHVybiBjb2xsYXBzZVNpbmdsZVRleHQoYmxvY2tzKTtcbn1cblxuLyoqIENvbGxhcHNlIGEgY29udGVudCBhcnJheSBob2xkaW5nIGV4YWN0bHkgb25lIHRleHQgYmxvY2sgdG8gaXRzIGJhcmUgc3RyaW5nLFxuICogc28gYSBwbGFpbiBtZXNzYWdlIHJlYWRzIGBjb250ZW50OiBoZWxsb2AgaW5zdGVhZCBvZiBhIHNpbmdsZS1lbnRyeSBsaXN0LiAqL1xuZnVuY3Rpb24gY29sbGFwc2VTaW5nbGVUZXh0KGJsb2NrczogcmVhZG9ubHkgdW5rbm93bltdKTogdW5rbm93biB7XG5cdGlmIChibG9ja3MubGVuZ3RoID09PSAxKSB7XG5cdFx0Y29uc3Qgb25seSA9IGJsb2Nrc1swXSBhcyB7IHR5cGU/OiBzdHJpbmc7IHRleHQ/OiBzdHJpbmcgfTtcblx0XHRpZiAob25seS50eXBlID09PSAndGV4dCcgJiYgdHlwZW9mIG9ubHkudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBvbmx5LnRleHQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBibG9ja3M7XG59XG5cbi8qKlxuICogU2VyaWFsaXplIGFuIGFzc2lzdGFudCByZXBseSdzIGNvbnRlbnQgZm9yIHN0b3JhZ2U6IGEgbG9uZSB0ZXh0IGJsb2NrIGJlY29tZXNcbiAqIGEgYmFyZSBzdHJpbmcgKGBjb250ZW50OiBoZWxsb2ApOyBhbnl0aGluZyByaWNoZXIgc3RheXMgYW4gZXhwbGljaXQgYmxvY2tcbiAqIGxpc3QuIEludmVyc2Ugb2Yge0BsaW5rIGRlc2VyaWFsaXplQW50aHJvcGljQ29udGVudH0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVBbnRocm9waWNDb250ZW50KGNvbnRlbnQ6IEFudGhyb3BpY0NvbnRlbnRCbG9ja1tdKTogc3RyaW5nIHwgQW50aHJvcGljQ29udGVudEJsb2NrW10ge1xuXHRpZiAoY29udGVudC5sZW5ndGggPT09IDEgJiYgY29udGVudFswXS50eXBlID09PSAndGV4dCcpIHtcblx0XHRyZXR1cm4gY29udGVudFswXS50ZXh0O1xuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuXG4vKiogRXhwYW5kIGEgc3RvcmVkIGFzc2lzdGFudCByZXBseSdzIGNvbnRlbnQgYmFjayBpbnRvIGFuIGV4cGxpY2l0IGJsb2NrIGxpc3QuICovXG5leHBvcnQgZnVuY3Rpb24gZGVzZXJpYWxpemVBbnRocm9waWNDb250ZW50KGNvbnRlbnQ6IHN0cmluZyB8IEFudGhyb3BpY0NvbnRlbnRCbG9ja1tdKTogQW50aHJvcGljQ29udGVudEJsb2NrW10ge1xuXHRyZXR1cm4gdHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnID8gW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiBjb250ZW50IH1dIDogY29udGVudDtcbn1cblxuY29uc3QgQ1VSUkVOVF9EQVRFVElNRV9SRSA9IC88Y3VycmVudF9kYXRldGltZT4uKj88XFwvY3VycmVudF9kYXRldGltZT4vZ3M7XG5jb25zdCBTWVNURU1fUkVNSU5ERVJfUkUgPSAvPHN5c3RlbVstX11yZW1pbmRlcj4uKj88XFwvc3lzdGVtWy1fXXJlbWluZGVyPi9ncztcbmNvbnN0IEVOVklST05NRU5UX0NPTlRFWFRfUkUgPSAvPGVudmlyb25tZW50X2NvbnRleHQ+Lio/PFxcL2Vudmlyb25tZW50X2NvbnRleHQ+L2dzO1xuXG4vKiogU3RyaXAgdm9sYXRpbGUgLyBib2lsZXJwbGF0ZSB3cmFwcGVycyB0aGUgcnVudGltZSBpbmplY3RzIGFyb3VuZCB0aGUgcmVhbFxuICogdXNlciB0ZXh0ICh0aGUgYDxjdXJyZW50X2RhdGV0aW1lPmAgd2FsbCBjbG9jaywgYDxzeXN0ZW0tcmVtaW5kZXI+YCBibG9ja3MsXG4gKiBhbmQgQ29kZXgncyBgPGVudmlyb25tZW50X2NvbnRleHQ+YCBjd2QvZGF0ZSBwcmVhbWJsZSkgc28gY2FwdHVyZXMgc2hvdyBqdXN0XG4gKiB0aGUgbWVhbmluZ2Z1bCBtZXNzYWdlIGFuZCBzdGF5IGRldGVybWluaXN0aWMgYWNyb3NzIHJlLXJlY29yZHMuIE1pcnJvcnMgdGhlXG4gKiBDb3BpbG90IENMSSBoYXJuZXNzLCB3aGljaCBub3JtYWxpemVzIHRoZSBzYW1lIGluamVjdGVkIGJsb2Nrcy4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZVZvbGF0aWxlVGV4dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdGV4dFxuXHRcdC5yZXBsYWNlKENVUlJFTlRfREFURVRJTUVfUkUsICcnKVxuXHRcdC5yZXBsYWNlKFNZU1RFTV9SRU1JTkRFUl9SRSwgJycpXG5cdFx0LnJlcGxhY2UoRU5WSVJPTk1FTlRfQ09OVEVYVF9SRSwgJycpXG5cdFx0LnJlcGxhY2UoL1xcbnszLH0vZywgJ1xcblxcbicpXG5cdFx0LnRyaW0oKTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIE9wZW5BSSBSZXNwb25zZXMgZGlhbGVjdFxuXG4vKipcbiAqIFRoZSBPcGVuQUkgUmVzcG9uc2VzIEFQSSAoYFBPU1QgL3Jlc3BvbnNlc2ApIHVzZWQgYnkgdGhlIENvZGV4IHByb3ZpZGVyLiBXZVxuICogcmV1c2UgdGhlIEFudGhyb3BpYyByZWFkYWJsZSBzaGFwZXMgKHtAbGluayBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0fSAvXG4gKiB7QGxpbmsgSUFudGhyb3BpY01lc3NhZ2V9KSBzaW5jZSBib3RoIGRpYWxlY3RzIG1hcCBjbGVhbmx5IHRvIHRleHQgLyB0b29sX3VzZVxuICogLyB0b29sX3Jlc3VsdCBibG9ja3MgXHUyMDE0IG9ubHkgdGhlIHdpcmUgKFNTRSkgcGFyc2UgYW5kIHJlZ2VuZXJhdGlvbiBkaWZmZXIuXG4gKi9cbmV4cG9ydCBjb25zdCBSRVNQT05TRVNfUEFUSCA9ICcvcmVzcG9uc2VzJztcblxuLyoqXG4gKiBBZ2dyZWdhdGUgYSBzdHJlYW1lZCBgL3Jlc3BvbnNlc2AgU1NFIGJvZHkgaW50byBhIG1lc3NhZ2UuIFJlYWRzIHRoZVxuICogYXV0aG9yaXRhdGl2ZSBgcmVzcG9uc2Uub3V0cHV0X2l0ZW0uZG9uZWAgaXRlbXMgKG1lc3NhZ2UgKyBmdW5jdGlvbl9jYWxsKSBhbmRcbiAqIHRoZSBmaW5hbCB1c2FnZTsgcmVhc29uaW5nIGl0ZW1zIChvcGFxdWUgZW5jcnlwdGVkIGNvbnRlbnQpIGFyZSBkcm9wcGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWdncmVnYXRlUmVzcG9uc2VzU3NlKHNzZUJvZHk6IHN0cmluZyk6IElBbnRocm9waWNNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZXZlbnRzID0gcGFyc2VTc2VFdmVudHMoc3NlQm9keSk7XG5cdGNvbnN0IGJsb2NrczogTXV0YWJsZUJsb2NrW10gPSBbXTtcblx0bGV0IHVzYWdlOiB7IGlucHV0VG9rZW5zPzogbnVtYmVyOyBvdXRwdXRUb2tlbnM/OiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0bGV0IHNlZW4gPSBmYWxzZTtcblxuXHRmb3IgKGNvbnN0IGV2dCBvZiBldmVudHMpIHtcblx0XHRpZiAoZXZ0LnR5cGUgPT09ICdyZXNwb25zZS5vdXRwdXRfaXRlbS5kb25lJykge1xuXHRcdFx0c2VlbiA9IHRydWU7XG5cdFx0XHRjb25zdCBpdGVtID0gZXZ0WydpdGVtJ10gYXMgeyB0eXBlPzogc3RyaW5nOyBjb250ZW50PzogQXJyYXk8eyB0eXBlPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH0+OyBuYW1lPzogc3RyaW5nOyBhcmd1bWVudHM/OiBzdHJpbmc7IGNhbGxfaWQ/OiBzdHJpbmc7IGlkPzogc3RyaW5nIH07XG5cdFx0XHRpZiAoaXRlbS50eXBlID09PSAnbWVzc2FnZScpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IChpdGVtLmNvbnRlbnQgPz8gW10pLmZpbHRlcihjID0+IGMudHlwZSA9PT0gJ291dHB1dF90ZXh0JykubWFwKGMgPT4gYy50ZXh0ID8/ICcnKS5qb2luKCcnKTtcblx0XHRcdFx0aWYgKHRleHQpIHtcblx0XHRcdFx0XHRibG9ja3MucHVzaCh7IHR5cGU6ICd0ZXh0JywgdGV4dCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICdmdW5jdGlvbl9jYWxsJykge1xuXHRcdFx0XHRibG9ja3MucHVzaCh7IHR5cGU6ICd0b29sX3VzZScsIGlkOiBpdGVtLmNhbGxfaWQgPz8gaXRlbS5pZCA/PyAnJywgbmFtZTogaXRlbS5uYW1lID8/ICcnLCBpbnB1dDogc2FmZVBhcnNlSnNvbihpdGVtLmFyZ3VtZW50cyA/PyAne30nKSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGV2dC50eXBlID09PSAncmVzcG9uc2UuY29tcGxldGVkJykge1xuXHRcdFx0dXNhZ2UgPSB1c2FnZUZyb21SZXNwb25zZXNFdmVudChldnQpO1xuXHRcdH1cblx0fVxuXG5cdGlmICghc2Vlbikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc3RvcFJlYXNvbiA9IGJsb2Nrcy5zb21lKGIgPT4gYi50eXBlID09PSAndG9vbF91c2UnKSA/ICd0b29sX3VzZScgOiAnZW5kX3R1cm4nO1xuXHRyZXR1cm4geyBjb250ZW50OiBibG9ja3MsIHN0b3BSZWFzb24sIHVzYWdlOiAodXNhZ2UgJiYgKHVzYWdlLmlucHV0VG9rZW5zICE9PSB1bmRlZmluZWQgfHwgdXNhZ2Uub3V0cHV0VG9rZW5zICE9PSB1bmRlZmluZWQpKSA/IHVzYWdlIDogdW5kZWZpbmVkIH07XG59XG5cbi8qKiBFeHRyYWN0IHRva2VuIHVzYWdlIGZyb20gYSBgcmVzcG9uc2UuY29tcGxldGVkYCBldmVudCAobmF0aXZlIGB1c2FnZWAgZmllbGRcbiAqIG9yIENvcGlsb3QncyBgY29waWxvdF91c2FnZS50b2tlbl9kZXRhaWxzYCkuICovXG5mdW5jdGlvbiB1c2FnZUZyb21SZXNwb25zZXNFdmVudChldnQ6IElTc2VFdmVudCk6IHsgaW5wdXRUb2tlbnM/OiBudW1iZXI7IG91dHB1dFRva2Vucz86IG51bWJlciB9IHtcblx0Y29uc3QgcmVzcG9uc2UgPSBldnRbJ3Jlc3BvbnNlJ10gYXMgeyB1c2FnZT86IHsgaW5wdXRfdG9rZW5zPzogbnVtYmVyOyBvdXRwdXRfdG9rZW5zPzogbnVtYmVyIH0gfSB8IHVuZGVmaW5lZDtcblx0aWYgKHJlc3BvbnNlPy51c2FnZSAmJiAocmVzcG9uc2UudXNhZ2UuaW5wdXRfdG9rZW5zICE9PSB1bmRlZmluZWQgfHwgcmVzcG9uc2UudXNhZ2Uub3V0cHV0X3Rva2VucyAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdHJldHVybiB7IGlucHV0VG9rZW5zOiByZXNwb25zZS51c2FnZS5pbnB1dF90b2tlbnMsIG91dHB1dFRva2VuczogcmVzcG9uc2UudXNhZ2Uub3V0cHV0X3Rva2VucyB9O1xuXHR9XG5cdGNvbnN0IGRldGFpbHMgPSAoZXZ0Wydjb3BpbG90X3VzYWdlJ10gYXMgeyB0b2tlbl9kZXRhaWxzPzogQXJyYXk8eyB0b2tlbl90eXBlPzogc3RyaW5nOyB0b2tlbl9jb3VudD86IG51bWJlciB9PiB9IHwgdW5kZWZpbmVkKT8udG9rZW5fZGV0YWlscztcblx0aWYgKEFycmF5LmlzQXJyYXkoZGV0YWlscykpIHtcblx0XHRsZXQgaW5wdXRUb2tlbnM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgb3V0cHV0VG9rZW5zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBkIG9mIGRldGFpbHMpIHtcblx0XHRcdGlmIChkLnRva2VuX3R5cGUgPT09ICdpbnB1dCcpIHsgaW5wdXRUb2tlbnMgPSBkLnRva2VuX2NvdW50OyB9XG5cdFx0XHRlbHNlIGlmIChkLnRva2VuX3R5cGUgPT09ICdvdXRwdXQnKSB7IG91dHB1dFRva2VucyA9IGQudG9rZW5fY291bnQ7IH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgaW5wdXRUb2tlbnMsIG91dHB1dFRva2VucyB9O1xuXHR9XG5cdHJldHVybiB7fTtcbn1cblxuLyoqIFN1bW1hcml6ZSBhIGAvcmVzcG9uc2VzYCByZXF1ZXN0IGludG8gdGhlIHNoYXJlZCByZWFkYWJsZSByZXF1ZXN0IHNoYXBlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1bW1hcml6ZVJlc3BvbnNlc1JlcXVlc3QocmVxdWVzdEJvZHk6IHN0cmluZyk6IElSZWFkYWJsZUFudGhyb3BpY1JlcXVlc3QgfCB1bmRlZmluZWQge1xuXHRsZXQgcGFyc2VkOiB7IG1vZGVsPzogc3RyaW5nOyBpbnN0cnVjdGlvbnM/OiB1bmtub3duOyBpbnB1dD86IHVua25vd24gfTtcblx0dHJ5IHtcblx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKHJlcXVlc3RCb2R5KTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodHlwZW9mIHBhcnNlZC5tb2RlbCAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0bW9kZWw6IHBhcnNlZC5tb2RlbCxcblx0XHRzeXN0ZW06IHBhcnNlZC5pbnN0cnVjdGlvbnMgIT09IHVuZGVmaW5lZCA/IFNZU1RFTV9QTEFDRUhPTERFUiA6ICcnLFxuXHRcdG1lc3NhZ2VzOiByZXNwb25zZXNJbnB1dFRvTWVzc2FnZXMocGFyc2VkLmlucHV0KSxcblx0fTtcbn1cblxuLyoqIE1hcCBhIGAvcmVzcG9uc2VzYCByZXF1ZXN0IGBpbnB1dGAgKHN0cmluZyBvciBpdGVtIGxpc3QpIHRvIHJlYWRhYmxlIG1lc3NhZ2VzLiAqL1xuZnVuY3Rpb24gcmVzcG9uc2VzSW5wdXRUb01lc3NhZ2VzKGlucHV0OiB1bmtub3duKTogQXJyYXk8eyByb2xlOiBzdHJpbmc7IGNvbnRlbnQ6IHVua25vd24gfT4ge1xuXHRpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuXHRcdGNvbnN0IHRleHQgPSBub3JtYWxpemVWb2xhdGlsZVRleHQoaW5wdXQpO1xuXHRcdHJldHVybiB0ZXh0ID8gW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiB0ZXh0IH1dIDogW107XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGlucHV0KSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCBtZXNzYWdlczogQXJyYXk8eyByb2xlOiBzdHJpbmc7IGNvbnRlbnQ6IHVua25vd24gfT4gPSBbXTtcblx0Zm9yIChjb25zdCByYXcgb2YgaW5wdXQpIHtcblx0XHRjb25zdCBpdGVtID0gcmF3IGFzIHsgdHlwZT86IHN0cmluZzsgcm9sZT86IHN0cmluZzsgY29udGVudD86IHVua25vd247IG5hbWU/OiBzdHJpbmc7IGFyZ3VtZW50cz86IHN0cmluZzsgY2FsbF9pZD86IHN0cmluZzsgb3V0cHV0PzogdW5rbm93biB9O1xuXHRcdHN3aXRjaCAoaXRlbS50eXBlKSB7XG5cdFx0XHRjYXNlICdtZXNzYWdlJzoge1xuXHRcdFx0XHQvLyBTa2lwIGhhcm5lc3MtaW5qZWN0ZWQgaW5zdHJ1Y3Rpb24gbWVzc2FnZXMgKENvZGV4IHVzZXMgdGhlXG5cdFx0XHRcdC8vIGBkZXZlbG9wZXJgIC8gYHN5c3RlbWAgcm9sZXMgZm9yIGl0cyBwZXJtaXNzaW9ucyArIGVudmlyb25tZW50XG5cdFx0XHRcdC8vIHByZWFtYmxlKTsgdGhlIHJlYWwgc3lzdGVtIHByb21wdCBpcyBhbHJlYWR5IGEgcGxhY2Vob2xkZXIuXG5cdFx0XHRcdGlmIChpdGVtLnJvbGUgPT09ICdzeXN0ZW0nIHx8IGl0ZW0ucm9sZSA9PT0gJ2RldmVsb3BlcicpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gc3VtbWFyaXplQ29udGVudChyZXNwb25zZXNUZXh0UGFydHMoaXRlbS5jb250ZW50KSk7XG5cdFx0XHRcdGlmICghaXNFbXB0eUNvbnRlbnQoY29udGVudCkpIHtcblx0XHRcdFx0XHRtZXNzYWdlcy5wdXNoKHsgcm9sZTogaXRlbS5yb2xlID8/ICd1c2VyJywgY29udGVudCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGwnOlxuXHRcdFx0XHRtZXNzYWdlcy5wdXNoKHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6IGl0ZW0ubmFtZSwgaW5wdXQ6IHNhZmVQYXJzZUpzb24oaXRlbS5hcmd1bWVudHMgPz8gJ3t9JykgfV0gfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZnVuY3Rpb25fY2FsbF9vdXRwdXQnOlxuXHRcdFx0XHRtZXNzYWdlcy5wdXNoKHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogaXRlbS5jYWxsX2lkLCBjb250ZW50OiBzdW1tYXJpemVSZXNwb25zZXNPdXRwdXQoaXRlbS5vdXRwdXQpIH1dIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdC8vIHJlYXNvbmluZyAvIG90aGVyIGl0ZW1zIGFyZSBkcm9wcGVkIGZyb20gdGhlIHJlYWRhYmxlIGNhcHR1cmVcblx0XHR9XG5cdH1cblx0cmV0dXJuIG1lc3NhZ2VzO1xufVxuXG4vKiogRmxhdHRlbiBSZXNwb25zZXMgYGNvbnRlbnRgIHBhcnRzIChgaW5wdXRfdGV4dGAgLyBgb3V0cHV0X3RleHRgKSB0byB0ZXh0IGJsb2Nrcy4gKi9cbmZ1bmN0aW9uIHJlc3BvbnNlc1RleHRQYXJ0cyhjb250ZW50OiB1bmtub3duKTogdW5rbm93biB7XG5cdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudCkpIHtcblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXHRyZXR1cm4gY29udGVudC5tYXAocGFydCA9PiB7XG5cdFx0Y29uc3QgcCA9IHBhcnQgYXMgeyB0eXBlPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH07XG5cdFx0cmV0dXJuIHsgdHlwZTogJ3RleHQnLCB0ZXh0OiBwLnRleHQgPz8gJycgfTtcblx0fSk7XG59XG5cbi8qKiBOb3JtYWxpemUgYSBgZnVuY3Rpb25fY2FsbF9vdXRwdXRgIGBvdXRwdXRgIHRvIHJlYWRhYmxlIHRleHQuICovXG5mdW5jdGlvbiBzdW1tYXJpemVSZXNwb25zZXNPdXRwdXQob3V0cHV0OiB1bmtub3duKTogdW5rbm93biB7XG5cdGlmICh0eXBlb2Ygb3V0cHV0ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBub3JtYWxpemVWb2xhdGlsZVRleHQob3V0cHV0KTtcblx0fVxuXHRyZXR1cm4gc3VtbWFyaXplQ29udGVudChvdXRwdXQpO1xufVxuXG4vKipcbiAqIFJlZ2VuZXJhdGUgYSBgL3Jlc3BvbnNlc2AgU1NFIHN0cmVhbSBmcm9tIGEgY2FwdHVyZWQgbWVzc2FnZS4gRW1pdHMgdGhlIGV2ZW50XG4gKiBzZXF1ZW5jZSB0aGUgQ29kZXggYXBwLXNlcnZlciBleHBlY3RzIChgcmVzcG9uc2UuY3JlYXRlZGAgLT4gcGVyLWl0ZW1cbiAqIGFkZGVkL2RlbHRhL2RvbmUgLT4gYHJlc3BvbnNlLmNvbXBsZXRlZGApIHdpdGggc3ludGhldGljLCBzdGFibGUgaXRlbSBpZHMuXG4gKiBUaGUgYHJlc3BvbnNlYCBlbnZlbG9wZSBjYXJyaWVzIHRoZSBmdWxsIHNldCBvZiByZXF1aXJlZCBPcGVuQUkgUmVzcG9uc2VzXG4gKiBmaWVsZHMgc28gdGhlIGNsaWVudCBhY2NlcHRzIHRoZSB0dXJuIGFzIGNvbXBsZXRlIChhIHBhcnRpYWwgZW52ZWxvcGUgbWFrZXNcbiAqIGl0IHJldHJ5KS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3BvbnNlc01lc3NhZ2VUb1NzZShtZXNzYWdlOiBJQW50aHJvcGljTWVzc2FnZSk6IHN0cmluZyB7XG5cdGNvbnN0IHJlc3BvbnNlSWQgPSBgcmVzcF9yZXBsYXlfJHtyYW5kb21IZXgoKX1gO1xuXHRsZXQgc2VxID0gMDtcblxuXHRjb25zdCBvdXRwdXRJdGVtczogUmVzcG9uc2VzT3V0cHV0SXRlbVtdID0gbWVzc2FnZS5jb250ZW50Lm1hcCgoYmxvY2ssIGluZGV4KTogUmVzcG9uc2VzT3V0cHV0SXRlbSA9PiB7XG5cdFx0Y29uc3QgaWQgPSBgaXRlbV8ke2luZGV4fWA7XG5cdFx0cmV0dXJuIGJsb2NrLnR5cGUgPT09ICd0ZXh0J1xuXHRcdFx0PyB7IGlkLCB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICdhc3Npc3RhbnQnLCBzdGF0dXM6ICdjb21wbGV0ZWQnLCBjb250ZW50OiBbeyB0eXBlOiAnb3V0cHV0X3RleHQnLCB0ZXh0OiBibG9jay50ZXh0LCBhbm5vdGF0aW9uczogW10sIGxvZ3Byb2JzOiBbXSB9XSB9XG5cdFx0XHQ6IHsgaWQsIHR5cGU6ICdmdW5jdGlvbl9jYWxsJywgbmFtZTogYmxvY2submFtZSwgY2FsbF9pZDogYmxvY2suaWQsIGFyZ3VtZW50czogSlNPTi5zdHJpbmdpZnkoYmxvY2suaW5wdXQgPz8ge30pLCBzdGF0dXM6ICdjb21wbGV0ZWQnIH07XG5cdH0pO1xuXHRjb25zdCBvdXRwdXRUZXh0ID0gbWVzc2FnZS5jb250ZW50LmZpbHRlcigoYik6IGIgaXMgRXh0cmFjdDxBbnRocm9waWNDb250ZW50QmxvY2ssIHsgdHlwZTogJ3RleHQnIH0+ID0+IGIudHlwZSA9PT0gJ3RleHQnKS5tYXAoYiA9PiBiLnRleHQpLmpvaW4oJycpO1xuXHRjb25zdCB1c2FnZSA9IHtcblx0XHRpbnB1dF90b2tlbnM6IG1lc3NhZ2UudXNhZ2U/LmlucHV0VG9rZW5zID8/IDEsXG5cdFx0b3V0cHV0X3Rva2VuczogbWVzc2FnZS51c2FnZT8ub3V0cHV0VG9rZW5zID8/IDEsXG5cdFx0dG90YWxfdG9rZW5zOiAobWVzc2FnZS51c2FnZT8uaW5wdXRUb2tlbnMgPz8gMSkgKyAobWVzc2FnZS51c2FnZT8ub3V0cHV0VG9rZW5zID8/IDEpLFxuXHR9O1xuXHRjb25zdCBlbnZlbG9wZSA9IChzdGF0dXM6IHN0cmluZywgb3V0cHV0OiByZWFkb25seSBSZXNwb25zZXNPdXRwdXRJdGVtW10sIHRleHQ6IHN0cmluZywgdXNlOiB1bmtub3duKSA9PiAoe1xuXHRcdGlkOiByZXNwb25zZUlkLCBvYmplY3Q6ICdyZXNwb25zZScsIGNyZWF0ZWRfYXQ6IDAsIHN0YXR1cywgZXJyb3I6IG51bGwsIGluY29tcGxldGVfZGV0YWlsczogbnVsbCxcblx0XHRpbnN0cnVjdGlvbnM6IG51bGwsIG1vZGVsOiAncmVwbGF5Jywgb3V0cHV0LCBvdXRwdXRfdGV4dDogdGV4dCwgcGFyYWxsZWxfdG9vbF9jYWxsczogdHJ1ZSxcblx0XHR0ZW1wZXJhdHVyZTogMSwgdG9vbF9jaG9pY2U6ICdhdXRvJywgdG9vbHM6IFtdLCB0b3BfcDogMSwgdXNhZ2U6IHVzZSxcblx0fSk7XG5cblx0Y29uc3QgY2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBza2VsZXRvbiA9IGVudmVsb3BlKCdpbl9wcm9ncmVzcycsIFtdLCAnJywgdW5kZWZpbmVkKTtcblx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmNyZWF0ZWQnLCB7IHR5cGU6ICdyZXNwb25zZS5jcmVhdGVkJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgcmVzcG9uc2U6IHNrZWxldG9uIH0pKTtcblx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmluX3Byb2dyZXNzJywgeyB0eXBlOiAncmVzcG9uc2UuaW5fcHJvZ3Jlc3MnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcSsrLCByZXNwb25zZTogc2tlbGV0b24gfSkpO1xuXG5cdG91dHB1dEl0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG5cdFx0Ly8gQW4gaXRlbSBpcyAqYW5ub3VuY2VkKiBoZXJlIGFuZCBzdHJlYW1lZCBiZWxvdywgc28gaXQgbXVzdCBhcnJpdmVcblx0XHQvLyBlbXB0eTogYSBjb25zdW1lciB0aGF0IGFjY3VtdWxhdGVzIHRoaXMgY29udGVudCBhbmQgdGhlbiB0aGUgZGVsdGFzXG5cdFx0Ly8gd291bGQgb3RoZXJ3aXNlIGNvdW50IHRoZSBzYW1lIHRleHQgdHdpY2UgKGBTSEVMTF9WQUxVRV83M2AgcmVwbGF5ZWRcblx0XHQvLyBhcyBgU0hFTExfVkFMVUVfNzNTSEVMTF9WQUxVRV83M2ApLlxuXHRcdGNvbnN0IGFkZGVkSXRlbSA9IGl0ZW0udHlwZSA9PT0gJ21lc3NhZ2UnXG5cdFx0XHQ/IHsgLi4uaXRlbSwgc3RhdHVzOiAnaW5fcHJvZ3Jlc3MnIGFzIGNvbnN0LCBjb250ZW50OiBbXSB9XG5cdFx0XHQ6IHsgLi4uaXRlbSwgc3RhdHVzOiAnaW5fcHJvZ3Jlc3MnIGFzIGNvbnN0LCBhcmd1bWVudHM6ICcnIH07XG5cdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLm91dHB1dF9pdGVtLmFkZGVkJywgeyB0eXBlOiAncmVzcG9uc2Uub3V0cHV0X2l0ZW0uYWRkZWQnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcSsrLCBvdXRwdXRfaW5kZXg6IGluZGV4LCBpdGVtOiBhZGRlZEl0ZW0gfSkpO1xuXHRcdGlmIChpdGVtLnR5cGUgPT09ICdtZXNzYWdlJykge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGl0ZW0uY29udGVudFswXS50ZXh0O1xuXHRcdFx0Y29uc3QgcGFydCA9IHsgdHlwZTogJ291dHB1dF90ZXh0JywgdGV4dCwgYW5ub3RhdGlvbnM6IFtdLCBsb2dwcm9iczogW10gfTtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5jb250ZW50X3BhcnQuYWRkZWQnLCB7IHR5cGU6ICdyZXNwb25zZS5jb250ZW50X3BhcnQuYWRkZWQnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcSsrLCBpdGVtX2lkOiBpdGVtLmlkLCBvdXRwdXRfaW5kZXg6IGluZGV4LCBjb250ZW50X2luZGV4OiAwLCBwYXJ0OiB7IHR5cGU6ICdvdXRwdXRfdGV4dCcsIHRleHQ6ICcnLCBhbm5vdGF0aW9uczogW10sIGxvZ3Byb2JzOiBbXSB9IH0pKTtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5vdXRwdXRfdGV4dC5kZWx0YScsIHsgdHlwZTogJ3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRlbHRhJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgaXRlbV9pZDogaXRlbS5pZCwgb3V0cHV0X2luZGV4OiBpbmRleCwgY29udGVudF9pbmRleDogMCwgZGVsdGE6IHRleHQsIGxvZ3Byb2JzOiBbXSB9KSk7XG5cdFx0XHRjaHVua3MucHVzaChzc2VFdmVudCgncmVzcG9uc2Uub3V0cHV0X3RleHQuZG9uZScsIHsgdHlwZTogJ3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRvbmUnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcSsrLCBpdGVtX2lkOiBpdGVtLmlkLCBvdXRwdXRfaW5kZXg6IGluZGV4LCBjb250ZW50X2luZGV4OiAwLCB0ZXh0LCBsb2dwcm9iczogW10gfSkpO1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmNvbnRlbnRfcGFydC5kb25lJywgeyB0eXBlOiAncmVzcG9uc2UuY29udGVudF9wYXJ0LmRvbmUnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcSsrLCBpdGVtX2lkOiBpdGVtLmlkLCBvdXRwdXRfaW5kZXg6IGluZGV4LCBjb250ZW50X2luZGV4OiAwLCBwYXJ0IH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmZ1bmN0aW9uX2NhbGxfYXJndW1lbnRzLmRlbHRhJywgeyB0eXBlOiAncmVzcG9uc2UuZnVuY3Rpb25fY2FsbF9hcmd1bWVudHMuZGVsdGEnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcSsrLCBpdGVtX2lkOiBpdGVtLmlkLCBvdXRwdXRfaW5kZXg6IGluZGV4LCBkZWx0YTogaXRlbS5hcmd1bWVudHMgfSkpO1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmZ1bmN0aW9uX2NhbGxfYXJndW1lbnRzLmRvbmUnLCB7IHR5cGU6ICdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kb25lJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgaXRlbV9pZDogaXRlbS5pZCwgb3V0cHV0X2luZGV4OiBpbmRleCwgYXJndW1lbnRzOiBpdGVtLmFyZ3VtZW50cyB9KSk7XG5cdFx0fVxuXHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5vdXRwdXRfaXRlbS5kb25lJywgeyB0eXBlOiAncmVzcG9uc2Uub3V0cHV0X2l0ZW0uZG9uZScsIHNlcXVlbmNlX251bWJlcjogc2VxKyssIG91dHB1dF9pbmRleDogaW5kZXgsIGl0ZW0gfSkpO1xuXHR9KTtcblxuXHRjaHVua3MucHVzaChzc2VFdmVudCgncmVzcG9uc2UuY29tcGxldGVkJywgeyB0eXBlOiAncmVzcG9uc2UuY29tcGxldGVkJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgcmVzcG9uc2U6IGVudmVsb3BlKCdjb21wbGV0ZWQnLCBvdXRwdXRJdGVtcywgb3V0cHV0VGV4dCwgdXNhZ2UpIH0pKTtcblx0cmV0dXJuIGNodW5rcy5qb2luKCcnKTtcbn1cblxudHlwZSBSZXNwb25zZXNPdXRwdXRJdGVtID1cblx0fCB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IHR5cGU6ICdtZXNzYWdlJzsgcmVhZG9ubHkgcm9sZTogJ2Fzc2lzdGFudCc7IHJlYWRvbmx5IHN0YXR1czogJ2NvbXBsZXRlZCc7IHJlYWRvbmx5IGNvbnRlbnQ6IEFycmF5PHsgdHlwZTogJ291dHB1dF90ZXh0JzsgdGV4dDogc3RyaW5nOyBhbm5vdGF0aW9uczogdW5rbm93bltdOyBsb2dwcm9iczogdW5rbm93bltdIH0+IH1cblx0fCB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IHR5cGU6ICdmdW5jdGlvbl9jYWxsJzsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBjYWxsX2lkOiBzdHJpbmc7IHJlYWRvbmx5IGFyZ3VtZW50czogc3RyaW5nOyByZWFkb25seSBzdGF0dXM6ICdjb21wbGV0ZWQnIH07XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBoZWxwZXJzXG5cbmZ1bmN0aW9uIHNzZUV2ZW50KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhOiB1bmtub3duKTogc3RyaW5nIHtcblx0cmV0dXJuIGBldmVudDogJHtldmVudE5hbWV9XFxuZGF0YTogJHtKU09OLnN0cmluZ2lmeShkYXRhKX1cXG5cXG5gO1xufVxuXG5mdW5jdGlvbiBzYWZlUGFyc2VKc29uKHZhbHVlOiBzdHJpbmcpOiB1bmtub3duIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7fTtcblx0fVxufVxuXG5mdW5jdGlvbiByYW5kb21IZXgoKTogc3RyaW5nIHtcblx0cmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDB4ZmZmZmZmZmYpLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUErQk8sU0FBUyxlQUFlLE1BQTJCO0FBQ3pELFFBQU0sU0FBc0IsQ0FBQztBQUM3QixhQUFXLFNBQVMsS0FBSyxNQUFNLFlBQVksR0FBRztBQUM3QyxRQUFJLENBQUMsTUFBTSxLQUFLLEdBQUc7QUFDbEI7QUFBQSxJQUNEO0FBQ0EsUUFBSTtBQUNKLGVBQVcsUUFB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
