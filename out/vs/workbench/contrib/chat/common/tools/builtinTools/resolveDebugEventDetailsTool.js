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
import { localize } from "../../../../../../nls.js";
import { ChatDebugHookResult, IChatDebugService } from "../../chatDebugService.js";
import { ToolDataSource } from "../languageModelToolsService.js";
const ResolveDebugEventDetailsToolId = "vscode_resolveDebugEventDetails_internal";
const ResolveDebugEventDetailsToolData = {
  id: ResolveDebugEventDetailsToolId,
  toolReferenceName: "resolveDebugEventDetails",
  displayName: localize("resolveDebugEventDetails.displayName", "Resolve Debug Event Details"),
  canBeReferencedInPrompt: false,
  modelDescription: "Resolves the full details for a specific chat debug event by its event ID. Use this tool to get detailed information about a debug event such as tool call input/output, model turn details, user message sections, or file lists. The event ID can be found in the debug event log summary provided in the conversation context.",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      eventId: {
        type: "string",
        description: "The ID of the debug event to resolve details for."
      }
    },
    required: ["eventId"]
  }
};
function formatResolvedContent(content) {
  switch (content.kind) {
    case "text":
      return content.value;
    case "fileList": {
      const lines = [localize("formatResolvedContent.fileList", "File list ({0}):", content.discoveryType)];
      if (content.sourceFolders) {
        for (const folder of content.sourceFolders) {
          lines.push(localize("formatResolvedContent.sourceFolder", "  Source folder: {0} ({1})", folder.uri.toString(), folder.storage));
        }
      }
      for (const file of content.files) {
        const status = file.status === "loaded" ? localize("formatResolvedContent.loaded", "loaded") : file.skipReason ? localize("formatResolvedContent.skippedWithReason", "skipped: {0}", file.skipReason) : localize("formatResolvedContent.skipped", "skipped");
        lines.push(`  ${file.uri.toString()} [${status}]`);
      }
      return lines.join("\n");
    }
    case "message": {
      const messageType = content.type === "user" ? localize("formatResolvedContent.userMessage", "User message: {0}", content.message) : localize("formatResolvedContent.agentMessage", "Agent message: {0}", content.message);
      const lines = [messageType];
      for (const section of content.sections) {
        lines.push(`--- ${section.name} ---`);
        lines.push(section.content);
      }
      return lines.join("\n");
    }
    case "toolCall": {
      const lines = [localize("formatResolvedContent.toolCall", "Tool call: {0}", content.toolName)];
      if (content.result) {
        lines.push(localize("formatResolvedContent.result", "Result: {0}", content.result));
      }
      if (content.durationInMillis !== void 0) {
        lines.push(localize("formatResolvedContent.duration", "Duration: {0}ms", content.durationInMillis));
      }
      if (content.input) {
        lines.push(localize("formatResolvedContent.input", "Input:") + "\n" + content.input);
      }
      if (content.output) {
        lines.push(localize("formatResolvedContent.output", "Output:") + "\n" + content.output);
      }
      return lines.join("\n");
    }
    case "modelTurn": {
      const lines = [localize("formatResolvedContent.modelTurn", "Model turn: {0}", content.requestName)];
      if (content.model) {
        lines.push(localize("formatResolvedContent.model", "Model: {0}", content.model));
      }
      if (content.status) {
        lines.push(localize("formatResolvedContent.status", "Status: {0}", content.status));
      }
      if (content.durationInMillis !== void 0) {
        lines.push(localize("formatResolvedContent.duration", "Duration: {0}ms", content.durationInMillis));
      }
      if (content.inputTokens !== void 0 || content.outputTokens !== void 0) {
        lines.push(localize("formatResolvedContent.tokens", "Tokens: input={0}, output={1}, cached={2}, total={3}", content.inputTokens ?? "?", content.outputTokens ?? "?", content.cachedTokens ?? "?", content.totalTokens ?? "?"));
      }
      if (content.errorMessage) {
        lines.push(localize("formatResolvedContent.error", "Error: {0}", content.errorMessage));
      }
      if (content.sections) {
        for (const section of content.sections) {
          lines.push(`--- ${section.name} ---`);
          lines.push(section.content);
        }
      }
      return lines.join("\n");
    }
    case "hook": {
      const lines = [localize("formatResolvedContent.hook", "Hook: {0}", content.hookType)];
      if (content.command) {
        lines.push(localize("formatResolvedContent.command", "Command: {0}", content.command));
      }
      if (content.result !== void 0) {
        const resultText = content.result === ChatDebugHookResult.Success ? localize("formatResolvedContent.hookResult.success", "Success") : content.result === ChatDebugHookResult.Error ? localize("formatResolvedContent.hookResult.error", "Error") : localize("formatResolvedContent.hookResult.nonBlockingError", "Non-blocking Error");
        lines.push(localize("formatResolvedContent.result", "Result: {0}", resultText));
      }
      if (content.exitCode !== void 0) {
        lines.push(localize("formatResolvedContent.exitCode", "Exit Code: {0}", content.exitCode));
      }
      if (content.durationInMillis !== void 0) {
        lines.push(localize("formatResolvedContent.duration", "Duration: {0}ms", content.durationInMillis));
      }
      if (content.input) {
        lines.push(localize("formatResolvedContent.input", "Input:") + "\n" + content.input);
      }
      if (content.output) {
        lines.push(localize("formatResolvedContent.output", "Output:") + "\n" + content.output);
      }
      if (content.errorMessage) {
        lines.push(localize("formatResolvedContent.error", "Error: {0}", content.errorMessage));
      }
      return lines.join("\n");
    }
    case "customizationSummary": {
      const lines = [];
      lines.push(localize("formatResolvedContent.customizationCounts", "Customization: {0} instructions, {1} skills, {2} agents, {3} hooks, {4} skipped", content.counts.instructions, content.counts.skills, content.counts.agents, content.counts.hooks, content.counts.skipped));
      lines.push(localize("formatResolvedContent.customizationDuration", "Duration: {0}ms", content.durationInMillis.toFixed(1)));
      if (content.resolutionLogs.length > 0) {
        lines.push("");
        lines.push(localize("formatResolvedContent.resolutionLogs", "Resolution logs:"));
        for (const entry of content.resolutionLogs) {
          const detail = entry.reason ? `${entry.name} \u2014 ${entry.reason}` : entry.name;
          lines.push(`  [${entry.category}] ${detail}`);
        }
      }
      return lines.join("\n");
    }
    default: {
      const _ = content;
      return JSON.stringify(_);
    }
  }
}
function truncate(text, maxLength = 30) {
  if (text.length <= maxLength) {
    return text;
  }
  const lastSpace = text.lastIndexOf(" ", maxLength);
  const cutoff = lastSpace > maxLength / 2 ? lastSpace : maxLength;
  return text.substring(0, cutoff) + "\u2026";
}
function getEventLabel(event) {
  switch (event.kind) {
    case "generic":
      return event.name;
    case "toolCall":
      return event.toolName;
    case "modelTurn":
      return event.requestName ?? localize("debugEvent.modelTurn", "Model Turn");
    case "userMessage":
      return localize("debugEvent.userMessage", "User Message: {0}", truncate(event.message));
    case "agentResponse":
      return localize("debugEvent.agentResponse", "Agent Response: {0}", truncate(event.message));
    case "subagentInvocation":
      return event.agentName;
  }
}
let ResolveDebugEventDetailsTool = class {
  constructor(chatDebugService) {
    this.chatDebugService = chatDebugService;
  }
  async prepareToolInvocation(context, _token) {
    const eventId = context.parameters?.eventId;
    let eventLabel;
    if (typeof eventId === "string" && context.chatSessionResource) {
      const events = this.chatDebugService.getEvents(context.chatSessionResource);
      const event = events.find((e) => e.id === eventId);
      if (event) {
        eventLabel = getEventLabel(event);
      }
    }
    if (eventLabel) {
      return {
        invocationMessage: localize("resolveDebugEventDetails.invocationMessageNamed", 'Resolving details for "{0}"', eventLabel),
        pastTenseMessage: localize("resolveDebugEventDetails.pastTenseMessageNamed", 'Resolved details for "{0}"', eventLabel)
      };
    }
    return {
      invocationMessage: localize("resolveDebugEventDetails.invocationMessage", "Resolving debug event details"),
      pastTenseMessage: localize("resolveDebugEventDetails.pastTenseMessage", "Resolved debug event details")
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const eventId = invocation.parameters["eventId"];
    if (typeof eventId !== "string" || !eventId) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorEventIdRequired", "Error: eventId parameter is required.") }]
      };
    }
    const sessionResource = invocation.context?.sessionResource;
    if (!sessionResource) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorNoSession", "Error: no chat session context available.") }]
      };
    }
    const sessionEvents = this.chatDebugService.getEvents(sessionResource);
    if (!sessionEvents.some((e) => e.id === eventId)) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorEventNotFound", 'No event with ID "{0}" found in the current session.', eventId) }]
      };
    }
    const resolved = await this.chatDebugService.resolveEvent(eventId);
    if (!resolved) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorNoDetails", "No details found for event ID: {0}", eventId) }]
      };
    }
    return {
      content: [{ kind: "text", value: formatResolvedContent(resolved) }]
    };
  }
};
ResolveDebugEventDetailsTool = __decorateClass([
  __decorateParam(0, IChatDebugService)
], ResolveDebugEventDetailsTool);
export {
  ResolveDebugEventDetailsTool,
  ResolveDebugEventDetailsToolData,
  ResolveDebugEventDetailsToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9yZXNvbHZlRGVidWdFdmVudERldGFpbHNUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnSG9va1Jlc3VsdCwgSUNoYXREZWJ1Z0V2ZW50LCBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQsIElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgUmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzVG9vbElkID0gJ3ZzY29kZV9yZXNvbHZlRGVidWdFdmVudERldGFpbHNfaW50ZXJuYWwnO1xuXG5leHBvcnQgY29uc3QgUmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IFJlc29sdmVEZWJ1Z0V2ZW50RGV0YWlsc1Rvb2xJZCxcblx0dG9vbFJlZmVyZW5jZU5hbWU6ICdyZXNvbHZlRGVidWdFdmVudERldGFpbHMnLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Jlc29sdmVEZWJ1Z0V2ZW50RGV0YWlscy5kaXNwbGF5TmFtZScsIFwiUmVzb2x2ZSBEZWJ1ZyBFdmVudCBEZXRhaWxzXCIpLFxuXHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsXG5cdG1vZGVsRGVzY3JpcHRpb246ICdSZXNvbHZlcyB0aGUgZnVsbCBkZXRhaWxzIGZvciBhIHNwZWNpZmljIGNoYXQgZGVidWcgZXZlbnQgYnkgaXRzIGV2ZW50IElELiBVc2UgdGhpcyB0b29sIHRvIGdldCBkZXRhaWxlZCBpbmZvcm1hdGlvbiBhYm91dCBhIGRlYnVnIGV2ZW50IHN1Y2ggYXMgdG9vbCBjYWxsIGlucHV0L291dHB1dCwgbW9kZWwgdHVybiBkZXRhaWxzLCB1c2VyIG1lc3NhZ2Ugc2VjdGlvbnMsIG9yIGZpbGUgbGlzdHMuIFRoZSBldmVudCBJRCBjYW4gYmUgZm91bmQgaW4gdGhlIGRlYnVnIGV2ZW50IGxvZyBzdW1tYXJ5IHByb3ZpZGVkIGluIHRoZSBjb252ZXJzYXRpb24gY29udGV4dC4nLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGV2ZW50SWQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIElEIG9mIHRoZSBkZWJ1ZyBldmVudCB0byByZXNvbHZlIGRldGFpbHMgZm9yLicsXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFsnZXZlbnRJZCddLFxuXHR9LFxufTtcblxuZnVuY3Rpb24gZm9ybWF0UmVzb2x2ZWRDb250ZW50KGNvbnRlbnQ6IElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCk6IHN0cmluZyB7XG5cdHN3aXRjaCAoY29udGVudC5raW5kKSB7XG5cdFx0Y2FzZSAndGV4dCc6XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZTtcblx0XHRjYXNlICdmaWxlTGlzdCc6IHtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LmZpbGVMaXN0JywgXCJGaWxlIGxpc3QgKHswfSk6XCIsIGNvbnRlbnQuZGlzY292ZXJ5VHlwZSldO1xuXHRcdFx0aWYgKGNvbnRlbnQuc291cmNlRm9sZGVycykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBjb250ZW50LnNvdXJjZUZvbGRlcnMpIHtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuc291cmNlRm9sZGVyJywgXCIgIFNvdXJjZSBmb2xkZXI6IHswfSAoezF9KVwiLCBmb2xkZXIudXJpLnRvU3RyaW5nKCksIGZvbGRlci5zdG9yYWdlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBjb250ZW50LmZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IGZpbGUuc3RhdHVzID09PSAnbG9hZGVkJ1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5sb2FkZWQnLCBcImxvYWRlZFwiKVxuXHRcdFx0XHRcdDogZmlsZS5za2lwUmVhc29uXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuc2tpcHBlZFdpdGhSZWFzb24nLCBcInNraXBwZWQ6IHswfVwiLCBmaWxlLnNraXBSZWFzb24pXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuc2tpcHBlZCcsIFwic2tpcHBlZFwiKTtcblx0XHRcdFx0bGluZXMucHVzaChgICAke2ZpbGUudXJpLnRvU3RyaW5nKCl9IFske3N0YXR1c31dYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGNhc2UgJ21lc3NhZ2UnOiB7XG5cdFx0XHRjb25zdCBtZXNzYWdlVHlwZSA9IGNvbnRlbnQudHlwZSA9PT0gJ3VzZXInXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC51c2VyTWVzc2FnZScsIFwiVXNlciBtZXNzYWdlOiB7MH1cIiwgY29udGVudC5tZXNzYWdlKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuYWdlbnRNZXNzYWdlJywgXCJBZ2VudCBtZXNzYWdlOiB7MH1cIiwgY29udGVudC5tZXNzYWdlKTtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFttZXNzYWdlVHlwZV07XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgY29udGVudC5zZWN0aW9ucykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAtLS0gJHtzZWN0aW9uLm5hbWV9IC0tLWApO1xuXHRcdFx0XHRsaW5lcy5wdXNoKHNlY3Rpb24uY29udGVudCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGNhc2UgJ3Rvb2xDYWxsJzoge1xuXHRcdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2xvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQudG9vbENhbGwnLCBcIlRvb2wgY2FsbDogezB9XCIsIGNvbnRlbnQudG9vbE5hbWUpXTtcblx0XHRcdGlmIChjb250ZW50LnJlc3VsdCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQucmVzdWx0JywgXCJSZXN1bHQ6IHswfVwiLCBjb250ZW50LnJlc3VsdCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuZHVyYXRpb25Jbk1pbGxpcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5kdXJhdGlvbicsIFwiRHVyYXRpb246IHswfW1zXCIsIGNvbnRlbnQuZHVyYXRpb25Jbk1pbGxpcykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuaW5wdXQpIHtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LmlucHV0JywgXCJJbnB1dDpcIikgKyAnXFxuJyArIGNvbnRlbnQuaW5wdXQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQub3V0cHV0KSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5vdXRwdXQnLCBcIk91dHB1dDpcIikgKyAnXFxuJyArIGNvbnRlbnQub3V0cHV0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHR9XG5cdFx0Y2FzZSAnbW9kZWxUdXJuJzoge1xuXHRcdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2xvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQubW9kZWxUdXJuJywgXCJNb2RlbCB0dXJuOiB7MH1cIiwgY29udGVudC5yZXF1ZXN0TmFtZSldO1xuXHRcdFx0aWYgKGNvbnRlbnQubW9kZWwpIHtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50Lm1vZGVsJywgXCJNb2RlbDogezB9XCIsIGNvbnRlbnQubW9kZWwpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LnN0YXR1cykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuc3RhdHVzJywgXCJTdGF0dXM6IHswfVwiLCBjb250ZW50LnN0YXR1cykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuZHVyYXRpb25Jbk1pbGxpcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5kdXJhdGlvbicsIFwiRHVyYXRpb246IHswfW1zXCIsIGNvbnRlbnQuZHVyYXRpb25Jbk1pbGxpcykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuaW5wdXRUb2tlbnMgIT09IHVuZGVmaW5lZCB8fCBjb250ZW50Lm91dHB1dFRva2VucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC50b2tlbnMnLCBcIlRva2VuczogaW5wdXQ9ezB9LCBvdXRwdXQ9ezF9LCBjYWNoZWQ9ezJ9LCB0b3RhbD17M31cIiwgY29udGVudC5pbnB1dFRva2VucyA/PyAnPycsIGNvbnRlbnQub3V0cHV0VG9rZW5zID8/ICc/JywgY29udGVudC5jYWNoZWRUb2tlbnMgPz8gJz8nLCBjb250ZW50LnRvdGFsVG9rZW5zID8/ICc/JykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuZXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5lcnJvcicsIFwiRXJyb3I6IHswfVwiLCBjb250ZW50LmVycm9yTWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGNvbnRlbnQuc2VjdGlvbnMpIHtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKGAtLS0gJHtzZWN0aW9uLm5hbWV9IC0tLWApO1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goc2VjdGlvbi5jb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICdob29rJzoge1xuXHRcdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW2xvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuaG9vaycsIFwiSG9vazogezB9XCIsIGNvbnRlbnQuaG9va1R5cGUpXTtcblx0XHRcdGlmIChjb250ZW50LmNvbW1hbmQpIHtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LmNvbW1hbmQnLCBcIkNvbW1hbmQ6IHswfVwiLCBjb250ZW50LmNvbW1hbmQpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LnJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdFRleHQgPSBjb250ZW50LnJlc3VsdCA9PT0gQ2hhdERlYnVnSG9va1Jlc3VsdC5TdWNjZXNzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50Lmhvb2tSZXN1bHQuc3VjY2VzcycsIFwiU3VjY2Vzc1wiKVxuXHRcdFx0XHRcdDogY29udGVudC5yZXN1bHQgPT09IENoYXREZWJ1Z0hvb2tSZXN1bHQuRXJyb3Jcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5ob29rUmVzdWx0LmVycm9yJywgXCJFcnJvclwiKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50Lmhvb2tSZXN1bHQubm9uQmxvY2tpbmdFcnJvcicsIFwiTm9uLWJsb2NraW5nIEVycm9yXCIpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQucmVzdWx0JywgXCJSZXN1bHQ6IHswfVwiLCByZXN1bHRUZXh0KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udGVudC5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5leGl0Q29kZScsIFwiRXhpdCBDb2RlOiB7MH1cIiwgY29udGVudC5leGl0Q29kZSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuZHVyYXRpb25Jbk1pbGxpcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5kdXJhdGlvbicsIFwiRHVyYXRpb246IHswfW1zXCIsIGNvbnRlbnQuZHVyYXRpb25Jbk1pbGxpcykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuaW5wdXQpIHtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LmlucHV0JywgXCJJbnB1dDpcIikgKyAnXFxuJyArIGNvbnRlbnQuaW5wdXQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQub3V0cHV0KSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5vdXRwdXQnLCBcIk91dHB1dDpcIikgKyAnXFxuJyArIGNvbnRlbnQub3V0cHV0KTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuZXJyb3InLCBcIkVycm9yOiB7MH1cIiwgY29udGVudC5lcnJvck1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHR9XG5cdFx0Y2FzZSAnY3VzdG9taXphdGlvblN1bW1hcnknOiB7XG5cdFx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5jdXN0b21pemF0aW9uQ291bnRzJywgXCJDdXN0b21pemF0aW9uOiB7MH0gaW5zdHJ1Y3Rpb25zLCB7MX0gc2tpbGxzLCB7Mn0gYWdlbnRzLCB7M30gaG9va3MsIHs0fSBza2lwcGVkXCIsIGNvbnRlbnQuY291bnRzLmluc3RydWN0aW9ucywgY29udGVudC5jb3VudHMuc2tpbGxzLCBjb250ZW50LmNvdW50cy5hZ2VudHMsIGNvbnRlbnQuY291bnRzLmhvb2tzLCBjb250ZW50LmNvdW50cy5za2lwcGVkKSk7XG5cdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuY3VzdG9taXphdGlvbkR1cmF0aW9uJywgXCJEdXJhdGlvbjogezB9bXNcIiwgY29udGVudC5kdXJhdGlvbkluTWlsbGlzLnRvRml4ZWQoMSkpKTtcblx0XHRcdGlmIChjb250ZW50LnJlc29sdXRpb25Mb2dzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bGluZXMucHVzaCgnJyk7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5yZXNvbHV0aW9uTG9ncycsIFwiUmVzb2x1dGlvbiBsb2dzOlwiKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgY29udGVudC5yZXNvbHV0aW9uTG9ncykge1xuXHRcdFx0XHRcdGNvbnN0IGRldGFpbCA9IGVudHJ5LnJlYXNvbiA/IGAke2VudHJ5Lm5hbWV9IFx1MjAxNCAke2VudHJ5LnJlYXNvbn1gIDogZW50cnkubmFtZTtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKGAgIFske2VudHJ5LmNhdGVnb3J5fV0gJHtkZXRhaWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHR9XG5cdFx0ZGVmYXVsdDoge1xuXHRcdFx0Y29uc3QgXzogbmV2ZXIgPSBjb250ZW50O1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KF8pO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiB0cnVuY2F0ZSh0ZXh0OiBzdHJpbmcsIG1heExlbmd0aCA9IDMwKTogc3RyaW5nIHtcblx0aWYgKHRleHQubGVuZ3RoIDw9IG1heExlbmd0aCkge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cdGNvbnN0IGxhc3RTcGFjZSA9IHRleHQubGFzdEluZGV4T2YoJyAnLCBtYXhMZW5ndGgpO1xuXHRjb25zdCBjdXRvZmYgPSBsYXN0U3BhY2UgPiBtYXhMZW5ndGggLyAyID8gbGFzdFNwYWNlIDogbWF4TGVuZ3RoO1xuXHRyZXR1cm4gdGV4dC5zdWJzdHJpbmcoMCwgY3V0b2ZmKSArICdcXHUyMDI2Jztcbn1cblxuZnVuY3Rpb24gZ2V0RXZlbnRMYWJlbChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogc3RyaW5nIHtcblx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0Y2FzZSAnZ2VuZXJpYyc6IHJldHVybiBldmVudC5uYW1lO1xuXHRcdGNhc2UgJ3Rvb2xDYWxsJzogcmV0dXJuIGV2ZW50LnRvb2xOYW1lO1xuXHRcdGNhc2UgJ21vZGVsVHVybic6IHJldHVybiBldmVudC5yZXF1ZXN0TmFtZSA/PyBsb2NhbGl6ZSgnZGVidWdFdmVudC5tb2RlbFR1cm4nLCBcIk1vZGVsIFR1cm5cIik7XG5cdFx0Y2FzZSAndXNlck1lc3NhZ2UnOiByZXR1cm4gbG9jYWxpemUoJ2RlYnVnRXZlbnQudXNlck1lc3NhZ2UnLCBcIlVzZXIgTWVzc2FnZTogezB9XCIsIHRydW5jYXRlKGV2ZW50Lm1lc3NhZ2UpKTtcblx0XHRjYXNlICdhZ2VudFJlc3BvbnNlJzogcmV0dXJuIGxvY2FsaXplKCdkZWJ1Z0V2ZW50LmFnZW50UmVzcG9uc2UnLCBcIkFnZW50IFJlc3BvbnNlOiB7MH1cIiwgdHJ1bmNhdGUoZXZlbnQubWVzc2FnZSkpO1xuXHRcdGNhc2UgJ3N1YmFnZW50SW52b2NhdGlvbic6IHJldHVybiBldmVudC5hZ2VudE5hbWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc29sdmVEZWJ1Z0V2ZW50RGV0YWlsc1Rvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV2ZW50SWQgPSBjb250ZXh0LnBhcmFtZXRlcnM/LmV2ZW50SWQ7XG5cdFx0bGV0IGV2ZW50TGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGV2ZW50SWQgPT09ICdzdHJpbmcnICYmIGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgZXZlbnRzID0gdGhpcy5jaGF0RGVidWdTZXJ2aWNlLmdldEV2ZW50cyhjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBldmVudHMuZmluZChlID0+IGUuaWQgPT09IGV2ZW50SWQpO1xuXHRcdFx0aWYgKGV2ZW50KSB7XG5cdFx0XHRcdGV2ZW50TGFiZWwgPSBnZXRFdmVudExhYmVsKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXZlbnRMYWJlbCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdyZXNvbHZlRGVidWdFdmVudERldGFpbHMuaW52b2NhdGlvbk1lc3NhZ2VOYW1lZCcsICdSZXNvbHZpbmcgZGV0YWlscyBmb3IgXCJ7MH1cIicsIGV2ZW50TGFiZWwpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLnBhc3RUZW5zZU1lc3NhZ2VOYW1lZCcsICdSZXNvbHZlZCBkZXRhaWxzIGZvciBcInswfVwiJywgZXZlbnRMYWJlbCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdyZXNvbHZlRGVidWdFdmVudERldGFpbHMuaW52b2NhdGlvbk1lc3NhZ2UnLCAnUmVzb2x2aW5nIGRlYnVnIGV2ZW50IGRldGFpbHMnKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdyZXNvbHZlRGVidWdFdmVudERldGFpbHMucGFzdFRlbnNlTWVzc2FnZScsICdSZXNvbHZlZCBkZWJ1ZyBldmVudCBkZXRhaWxzJyksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgZXZlbnRJZCA9IGludm9jYXRpb24ucGFyYW1ldGVyc1snZXZlbnRJZCddO1xuXHRcdGlmICh0eXBlb2YgZXZlbnRJZCAhPT0gJ3N0cmluZycgfHwgIWV2ZW50SWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGxvY2FsaXplKCdyZXNvbHZlRGVidWdFdmVudERldGFpbHMuZXJyb3JFdmVudElkUmVxdWlyZWQnLCBcIkVycm9yOiBldmVudElkIHBhcmFtZXRlciBpcyByZXF1aXJlZC5cIikgfV0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGludm9jYXRpb24uY29udGV4dD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLmVycm9yTm9TZXNzaW9uJywgXCJFcnJvcjogbm8gY2hhdCBzZXNzaW9uIGNvbnRleHQgYXZhaWxhYmxlLlwiKSB9XSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbkV2ZW50cyA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5nZXRFdmVudHMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXNlc3Npb25FdmVudHMuc29tZShlID0+IGUuaWQgPT09IGV2ZW50SWQpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLmVycm9yRXZlbnROb3RGb3VuZCcsIFwiTm8gZXZlbnQgd2l0aCBJRCBcXFwiezB9XFxcIiBmb3VuZCBpbiB0aGUgY3VycmVudCBzZXNzaW9uLlwiLCBldmVudElkKSB9XSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLmNoYXREZWJ1Z1NlcnZpY2UucmVzb2x2ZUV2ZW50KGV2ZW50SWQpO1xuXHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGxvY2FsaXplKCdyZXNvbHZlRGVidWdFdmVudERldGFpbHMuZXJyb3JOb0RldGFpbHMnLCBcIk5vIGRldGFpbHMgZm91bmQgZm9yIGV2ZW50IElEOiB7MH1cIiwgZXZlbnRJZCkgfV0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBmb3JtYXRSZXNvbHZlZENvbnRlbnQocmVzb2x2ZWQpIH1dLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBc0UseUJBQXlCO0FBQ3hHLFNBQThJLHNCQUFvQztBQUUzSyxNQUFNLGlDQUFpQztBQUV2QyxNQUFNLG1DQUE4QztBQUFBLEVBQzFELElBQUk7QUFBQSxFQUNKLG1CQUFtQjtBQUFBLEVBQ25CLGFBQWEsU0FBUyx3Q0FBd0MsNkJBQTZCO0FBQUEsRUFDM0YseUJBQXlCO0FBQUEsRUFDekIsa0JBQWtCO0FBQUEsRUFDbEIsUUFBUSxlQUFlO0FBQUEsRUFDdkIsYUFBYTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsU0FBUztBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxVQUFVLENBQUMsU0FBUztBQUFBLEVBQ3JCO0FBQ0Q7QUFFQSxTQUFTLHNCQUFzQixTQUFpRDtBQUMvRSxVQUFRLFFBQVEsTUFBTTtBQUFBLElBQ3JCLEtBQUs7QUFDSixhQUFPLFFBQVE7QUFBQSxJQUNoQixLQUFLLFlBQVk7QUFDaEIsWUFBTSxRQUFrQixDQUFDLFNBQVMsa0NBQWtDLG9CQUFvQixRQUFRLGFBQWEsQ0FBQztBQUM5RyxVQUFJLFFBQVEsZUFBZTtBQUMxQixtQkFBVyxVQUFVLFFBQVEsZUFBZTtBQUMzQyxnQkFBTSxLQUFLLFNBQVMsc0NBQXNDLDhCQUE4QixPQUFPLElBQUksU0FBUyxHQUFHLE9BQU8sT0FBTyxDQUFDO0FBQUEsUUFDL0g7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsUUFBUSxRQUFRLE9BQU87QUFDakMsY0FBTSxTQUFTLEtBQUssV0FBVyxXQUM1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
