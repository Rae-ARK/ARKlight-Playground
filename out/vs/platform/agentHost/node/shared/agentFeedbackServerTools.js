import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta, VIEW_UNREVIEWED_COMMENTS_TOOL_NAME, ADD_COMMENT_TOOL_NAME } from "../../common/meta/agentFeedbackAnnotations.js";
import { buildAnnotationsUri } from "../../common/annotationsUri.js";
import { ActionType } from "../../common/state/protocol/common/actions.js";
import { parseChatUri } from "../../common/state/sessionState.js";
const addCommentToolName = ADD_COMMENT_TOOL_NAME;
const listCommentsToolName = "listComments";
const deleteCommentsToolName = "deleteComments";
const resolveCommentsToolName = "resolveComments";
const viewUnreviewedCommentsToolName = VIEW_UNREVIEWED_COMMENTS_TOOL_NAME;
const REVIEWABLE_FEEDBACK_KINDS = /* @__PURE__ */ new Set(["prReview", "codeReview"]);
const feedbackConfirmationToolNames = /* @__PURE__ */ new Set([viewUnreviewedCommentsToolName]);
function feedbackToolRequiresConfirmation(toolName) {
  return feedbackConfirmationToolNames.has(toolName);
}
const addCommentInputSchema = {
  type: "object",
  properties: {
    resourceUri: { type: "string", description: "URI of the file to add a comment to." },
    range: {
      type: "object",
      description: "One-based text range to comment on.",
      properties: {
        startLineNumber: { type: "number", description: "One-based start line number." },
        startColumn: { type: "number", description: "One-based start column." },
        endLineNumber: { type: "number", description: "One-based end line number." },
        endColumn: { type: "number", description: "One-based end column." }
      },
      required: ["startLineNumber", "startColumn", "endLineNumber", "endColumn"]
    },
    text: { type: "string", description: "Comment text to add." }
  },
  required: ["resourceUri", "range", "text"]
};
const listCommentsInputSchema = {
  type: "object",
  properties: {}
};
const viewUnreviewedCommentsInputSchema = {
  type: "object",
  properties: {}
};
const deleteCommentsInputSchema = {
  type: "object",
  properties: {
    commentIds: { type: "array", items: { type: "string" }, description: "Comment IDs to delete." }
  },
  required: ["commentIds"]
};
const resolveCommentsInputSchema = {
  type: "object",
  properties: {
    commentIds: { type: "array", items: { type: "string" }, description: "Comment IDs to update." },
    resolved: { type: "boolean", description: "Whether the comments should be marked as resolved. Defaults to true." }
  },
  required: ["commentIds"]
};
const feedbackServerToolDefinitions = [
  {
    name: addCommentToolName,
    title: "Add Comment (Agent Feedback)",
    description: "Add a comment to a file range.",
    inputSchema: addCommentInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: listCommentsToolName,
    title: "List Comments (Agent Feedback)",
    description: "List comments for this session.",
    inputSchema: listCommentsInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: deleteCommentsToolName,
    title: "Delete Comments (Agent Feedback)",
    description: "Delete comments for this session.",
    inputSchema: deleteCommentsInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true }
  },
  {
    name: resolveCommentsToolName,
    title: "Resolve Comments (Agent Feedback)",
    description: "Mark comments for this session as resolved or unresolved.",
    inputSchema: resolveCommentsInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: viewUnreviewedCommentsToolName,
    title: "View Unreviewed Comments (Agent Feedback)",
    description: "View pull request or code review comments that the user has not reviewed yet. Calling this asks the user to choose which of those comments to reveal; only the comments the user reveals are returned.",
    inputSchema: viewUnreviewedCommentsInputSchema,
    annotations: { readOnlyHint: true }
  }
];
function getRequiredString(value, field, toolName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
  }
  return value;
}
function getRequiredPositiveInteger(value, field, toolName) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a positive integer.`);
  }
  return value;
}
function getAddCommentArgs(rawArgs) {
  const args = rawArgs ?? {};
  const resourceUri = getRequiredString(args.resourceUri, "resourceUri", addCommentToolName);
  const text = getRequiredString(args.text, "text", addCommentToolName);
  if (!args.range || typeof args.range !== "object" || Array.isArray(args.range)) {
    throw new Error(`Invalid ${addCommentToolName} input: range must be an object.`);
  }
  const range = args.range;
  return {
    resourceUri,
    text,
    range: {
      startLineNumber: getRequiredPositiveInteger(range.startLineNumber, "range.startLineNumber", addCommentToolName),
      startColumn: getRequiredPositiveInteger(range.startColumn, "range.startColumn", addCommentToolName),
      endLineNumber: getRequiredPositiveInteger(range.endLineNumber, "range.endLineNumber", addCommentToolName),
      endColumn: getRequiredPositiveInteger(range.endColumn, "range.endColumn", addCommentToolName)
    }
  };
}
function getUniqueCommentIds(value, toolName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: commentIds must be a non-empty string array.`);
  }
  const ids = [];
  for (const item of value) {
    ids.push(getRequiredString(item, "commentIds[]", toolName));
  }
  return [...new Set(ids)];
}
function getResolvedFlag(value) {
  if (value === void 0) {
    return true;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${resolveCommentsToolName} input: resolved must be a boolean.`);
  }
  return value;
}
function toTextRange(range) {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
  };
}
function fromTextRange(range) {
  if (!range) {
    return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
  }
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}
function entryText(text) {
  return typeof text === "string" ? text : text.markdown;
}
function readMeta(annotation) {
  return readFeedbackAnnotationMeta(annotation);
}
function serializeComment(annotation) {
  const entries = annotation.entries ?? [];
  const meta = readMeta(annotation);
  const replies = entries.slice(1).map((e) => entryText(e.text));
  return {
    id: annotation.id,
    resourceUri: annotation.resource,
    range: fromTextRange(annotation.range),
    text: entries.length ? entryText(entries[0].text) : "",
    kind: meta?.kind ?? "user",
    resolved: annotation.resolved,
    ...replies.length ? { replies } : {}
  };
}
function listableAnnotations(state) {
  return state.annotations.filter((annotation) => {
    const meta = readMeta(annotation);
    if (!meta || !annotation.entries?.length) {
      return false;
    }
    const effectiveState = annotation.resolved ? "resolved" : meta.state ?? "accepted";
    return effectiveState !== "created";
  });
}
function pendingRevealAnnotations(state) {
  return state.annotations.filter((annotation) => {
    const meta = readMeta(annotation);
    if (!meta || !annotation.entries?.length) {
      return false;
    }
    return REVIEWABLE_FEEDBACK_KINDS.has(meta.kind) && meta.pendingAgentReveal === true;
  });
}
function clearPendingReveal(annotation) {
  const meta = readMeta(annotation);
  if (!meta) {
    return annotation;
  }
  const nextMeta = { ...meta, pendingAgentReveal: void 0 };
  return { ...annotation, _meta: { ...annotation._meta, [FEEDBACK_ANNOTATION_META_KEY]: nextMeta } };
}
function createdReviewableAnnotations(state) {
  return state.annotations.filter((annotation) => {
    const meta = readMeta(annotation);
    if (!meta || !annotation.entries?.length) {
      return false;
    }
    return REVIEWABLE_FEEDBACK_KINDS.has(meta.kind) && !annotation.resolved && (meta.state ?? "accepted") === "created";
  });
}
function buildUnreviewedCommentsNote(state) {
  const created = createdReviewableAnnotations(state);
  if (!created.length) {
    return void 0;
  }
  let prCount = 0;
  let codeReviewCount = 0;
  for (const annotation of created) {
    const kind = readMeta(annotation)?.kind;
    if (kind === "prReview") {
      prCount++;
    } else if (kind === "codeReview") {
      codeReviewCount++;
    }
  }
  const clauses = [];
  if (prCount > 0) {
    clauses.push(`${prCount} pull request comment${prCount === 1 ? "" : "s"}`);
  }
  if (codeReviewCount > 0) {
    clauses.push(`${codeReviewCount} code review comment${codeReviewCount === 1 ? "" : "s"}`);
  }
  const subject = clauses.join(" and ");
  const verb = created.length === 1 ? "is" : "are";
  return `There ${verb} ${subject} which the user has not reviewed yet. If the user wants you to tackle them, call the \`${viewUnreviewedCommentsToolName}\` tool to view them.`;
}
function applyFeedbackTool(state, sessionResource, toolName, rawArgs) {
  switch (toolName) {
    case addCommentToolName: {
      const { resourceUri, range, text } = getAddCommentArgs(rawArgs);
      const id = generateUuid();
      const meta = { kind: "codeReview", state: "created", sessionResource };
      const annotation = {
        id,
        turnId: "",
        resource: resourceUri,
        range: toTextRange(range),
        resolved: false,
        entries: [{ id: `${id}:0`, text }],
        _meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta }
      };
      return {
        actions: [{ type: ActionType.AnnotationsSet, annotation }],
        result: "Comment added."
      };
    }
    case listCommentsToolName: {
      const payload = {
        comments: listableAnnotations(state).map(serializeComment)
      };
      const note = buildUnreviewedCommentsNote(state);
      if (note) {
        payload.note = note;
      }
      return { actions: [], result: JSON.stringify(payload, void 0, 2) };
    }
    case viewUnreviewedCommentsToolName: {
      const pending = pendingRevealAnnotations(state);
      const comments = pending.map(serializeComment);
      const actions = pending.map((annotation) => ({
        type: ActionType.AnnotationsSet,
        annotation: clearPendingReveal(annotation)
      }));
      return { actions, result: JSON.stringify({ comments }, void 0, 2) };
    }
    case deleteCommentsToolName: {
      const ids = getUniqueCommentIds(rawArgs?.commentIds, deleteCommentsToolName);
      const listable = listableAnnotations(state);
      const existing = new Map(listable.map((a) => [a.id, a]));
      const actions = [];
      const deleted = [];
      const notFound = [];
      for (const id of ids) {
        if (existing.has(id)) {
          actions.push({ type: ActionType.AnnotationsRemoved, annotationId: id });
          deleted.push(id);
        } else {
          notFound.push(id);
        }
      }
      const remaining = listable.filter((a) => !deleted.includes(a.id)).map(serializeComment);
      return {
        actions,
        result: JSON.stringify({ deletedCommentIds: deleted, notFoundCommentIds: notFound, remainingComments: remaining }, void 0, 2)
      };
    }
    case resolveCommentsToolName: {
      const args = rawArgs ?? {};
      const ids = getUniqueCommentIds(args.commentIds, resolveCommentsToolName);
      const resolved = getResolvedFlag(args.resolved);
      const listable = listableAnnotations(state);
      const existing = new Map(listable.map((a) => [a.id, a]));
      const actions = [];
      const updated = [];
      const notFound = [];
      for (const id of ids) {
        const annotation = existing.get(id);
        if (!annotation) {
          notFound.push(id);
          continue;
        }
        const meta = readMeta(annotation);
        const nextMeta = {
          ...meta,
          kind: meta?.kind ?? "user",
          state: resolved ? "resolved" : "submitted",
          sessionResource: meta?.sessionResource ?? sessionResource
        };
        const nextAnnotation = {
          ...annotation,
          resolved,
          _meta: { ...annotation._meta, [FEEDBACK_ANNOTATION_META_KEY]: nextMeta }
        };
        actions.push({ type: ActionType.AnnotationsSet, annotation: nextAnnotation });
        updated.push(id);
      }
      const comments = listable.map((a) => updated.includes(a.id) ? serializeComment({ ...a, resolved }) : serializeComment(a));
      return {
        actions,
        result: JSON.stringify({ resolved, updatedCommentIds: updated, notFoundCommentIds: notFound, comments }, void 0, 2)
      };
    }
    default:
      throw new Error(`Unknown feedback server tool: ${toolName}`);
  }
}
function parseListedCommentCount(resultText) {
  if (!resultText) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(resultText);
    return Array.isArray(parsed.comments) ? parsed.comments.length : void 0;
  } catch {
    return void 0;
  }
}
function getFeedbackToolDisplay(toolName, _args, result) {
  switch (toolName) {
    case addCommentToolName:
      return {
        displayName: localize("toolName.addComment", "Add Comment"),
        invocationMessage: localize("toolInvoke.addComment", "Adding comment"),
        pastTenseMessage: localize("toolComplete.addComment", "Added comment")
      };
    case listCommentsToolName: {
      let pastTenseMessage;
      const count = result ? parseListedCommentCount(result.text) : void 0;
      if (count === void 0) {
        pastTenseMessage = localize("toolComplete.listComments", "Checked comments");
      } else if (count === 1) {
        pastTenseMessage = localize("toolComplete.listComments.one", "Checked 1 comment");
      } else {
        pastTenseMessage = localize("toolComplete.listComments.many", "Checked {0} comments", count);
      }
      return {
        displayName: localize("toolName.listComments", "List Comments"),
        invocationMessage: localize("toolInvoke.listComments", "Checking comments"),
        pastTenseMessage
      };
    }
    case deleteCommentsToolName:
      return {
        displayName: localize("toolName.deleteComments", "Delete Comments"),
        invocationMessage: localize("toolInvoke.deleteComments", "Deleting comments"),
        pastTenseMessage: localize("toolComplete.deleteComments", "Deleted comments")
      };
    case resolveCommentsToolName:
      return {
        displayName: localize("toolName.resolveComments", "Resolve Comments"),
        invocationMessage: localize("toolInvoke.resolveComments", "Resolving comments"),
        pastTenseMessage: localize("toolComplete.resolveComments", "Resolved comments")
      };
    case viewUnreviewedCommentsToolName:
      return {
        displayName: localize("toolName.viewUnreviewedComments", "View Comments"),
        invocationMessage: localize("toolInvoke.viewUnreviewedComments", "Viewing comments"),
        pastTenseMessage: localize("toolComplete.viewUnreviewedComments", "Viewed comments")
      };
    default:
      return void 0;
  }
}
const feedbackServerToolGroup = {
  definitions: feedbackServerToolDefinitions,
  requiresConfirmation(toolName) {
    return feedbackToolRequiresConfirmation(toolName);
  },
  getDisplay(toolName, args, result) {
    return getFeedbackToolDisplay(toolName, args, result);
  },
  execute(stateManager, chatUri, toolName, rawArgs) {
    const mainSessionUri = parseChatUri(chatUri)?.session ?? chatUri;
    const annotationsUri = buildAnnotationsUri(mainSessionUri);
    const snapshot = stateManager.getSnapshot(annotationsUri);
    const state = snapshot?.state ?? { annotations: [] };
    const outcome = applyFeedbackTool(state, mainSessionUri, toolName, rawArgs);
    for (const action of outcome.actions) {
      stateManager.dispatchServerAction(annotationsUri, action);
    }
    return outcome.result;
  }
};
export {
  addCommentToolName,
  applyFeedbackTool,
  deleteCommentsToolName,
  feedbackServerToolDefinitions,
  feedbackServerToolGroup,
  feedbackToolRequiresConfirmation,
  listCommentsToolName,
  resolveCommentsToolName,
  viewUnreviewedCommentsToolName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9hZ2VudEZlZWRiYWNrU2VydmVyVG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVksIHJlYWRGZWVkYmFja0Fubm90YXRpb25NZXRhLCBWSUVXX1VOUkVWSUVXRURfQ09NTUVOVFNfVE9PTF9OQU1FLCBBRERfQ09NTUVOVF9UT09MX05BTUUsIHR5cGUgSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGRBbm5vdGF0aW9uc1VyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hbm5vdGF0aW9uc1VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFubm90YXRpb25zQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgcGFyc2VDaGF0VXJpLCB0eXBlIEFubm90YXRpb24sIHR5cGUgQW5ub3RhdGlvbnNTdGF0ZSwgdHlwZSBTdHJpbmdPck1hcmtkb3duLCB0eXBlIFRleHRSYW5nZSwgdHlwZSBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2VydmVyVG9vbERpc3BsYXksIElTZXJ2ZXJUb29sRGlzcGxheVJlc3VsdCwgSVNlcnZlclRvb2xHcm91cCB9IGZyb20gJy4vYWdlbnRTZXJ2ZXJUb29sSG9zdC5qcyc7XG5cbi8qKlxuICogU2VydmVyLXNpZGUgaW1wbGVtZW50YXRpb24gb2YgdGhlIGFnZW50IGZlZWRiYWNrIChcImNvbW1lbnRzXCIpIHRvb2xzLlxuICpcbiAqIFRoZXNlIHRvb2xzIHVzZWQgdG8gYmUgcmVnaXN0ZXJlZCBvbiB0aGUgY2xpZW50IChhZ2VudHMgd2luZG93KSBhbmQga2V5ZWRcbiAqIG9mZiBhbiBpbi1tZW1vcnkgc3RvcmUuIEZvciBhZ2VudC1ob3N0IHNlc3Npb25zIHRoZXkgbm93IGV4ZWN1dGUgb24gdGhlXG4gKiBzZXJ2ZXIgYWdhaW5zdCB0aGUgc2Vzc2lvbidzIGFubm90YXRpb25zIGNoYW5uZWw6IGVhY2ggY29tbWVudCBpcyBhblxuICoge0BsaW5rIEFubm90YXRpb259IG9uIGA8c2Vzc2lvbj4vYW5ub3RhdGlvbnNgLCB3aXRoIGZlZWRiYWNrIHNlbWFudGljc1xuICogY2FycmllZCBpbiB7QGxpbmsgQW5ub3RhdGlvbi5fbWV0YX0gdW5kZXIge0BsaW5rIEZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVl9XG4gKiAoc2VlIGBhZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnMudHNgKS4gVGhlIGZ1bmN0aW9ucyBoZXJlIGFyZSBwdXJlIFx1MjAxNCB0aGV5IHJlYWRcbiAqIHRoZSBjdXJyZW50IHtAbGluayBBbm5vdGF0aW9uc1N0YXRlfSBhbmQgcmV0dXJuIHRoZSBhbm5vdGF0aW9uIGFjdGlvbnMgdG9cbiAqIGRpc3BhdGNoIHBsdXMgYSB0ZXh0dWFsIHRvb2wgcmVzdWx0IFx1MjAxNCBzbyB0aGV5IGNhbiBiZSB1bml0IHRlc3RlZCB3aXRob3V0IGFcbiAqIHJ1bm5pbmcgc3RhdGUgbWFuYWdlci4gVGhlIGhvc3Qgd2lyaW5nIChyZWFkaW5nIHRoZSBzbmFwc2hvdCwgZGlzcGF0Y2hpbmdcbiAqIHRoZSBhY3Rpb25zKSBsaXZlcyBpbiB0aGUgY2FsbGVyLlxuICovXG5cbmV4cG9ydCBjb25zdCBhZGRDb21tZW50VG9vbE5hbWUgPSBBRERfQ09NTUVOVF9UT09MX05BTUU7XG5leHBvcnQgY29uc3QgbGlzdENvbW1lbnRzVG9vbE5hbWUgPSAnbGlzdENvbW1lbnRzJztcbmV4cG9ydCBjb25zdCBkZWxldGVDb21tZW50c1Rvb2xOYW1lID0gJ2RlbGV0ZUNvbW1lbnRzJztcbmV4cG9ydCBjb25zdCByZXNvbHZlQ29tbWVudHNUb29sTmFtZSA9ICdyZXNvbHZlQ29tbWVudHMnO1xuZXhwb3J0IGNvbnN0IHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZSA9IFZJRVdfVU5SRVZJRVdFRF9DT01NRU5UU19UT09MX05BTUU7XG5cbi8qKlxuICogRmVlZGJhY2sga2luZHMgdGhhdCBvcmlnaW5hdGUgZnJvbSBhIHJldmlldyB0aGUgdXNlciBpcyBleHBlY3RlZCB0byB0cmlhZ2VcbiAqIChhIHB1bGwgcmVxdWVzdCByZXZpZXcgb3IgYW4gaW4tcHJvZHVjdCBjb2RlIHJldmlldykgcmF0aGVyIHRoYW4gYmVpbmdcbiAqIGF1dGhvcmVkIGJ5IHRoZSB1c2VyIGRpcmVjdGx5LiBDb21tZW50cyBvZiB0aGVzZSBraW5kcyB0aGF0IGFyZSBzdGlsbCBpbiB0aGVcbiAqIGBjcmVhdGVkYCBzdGF0ZSBhcmUgc3VyZmFjZWQgdG8gdGhlIGFnZW50IHZpYSB0aGUge0BsaW5rIGxpc3RDb21tZW50c1Rvb2xOYW1lfVxuICogbm90ZSBhbmQgcmV2ZWFsZWQgdGhyb3VnaCB7QGxpbmsgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lfS5cbiAqL1xuY29uc3QgUkVWSUVXQUJMRV9GRUVEQkFDS19LSU5EUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoWydwclJldmlldycsICdjb2RlUmV2aWV3J10pO1xuXG4vKipcbiAqIFNlcnZlciB0b29scyB0aGF0IG11c3Qgbm90IGJlIGF1dG8tYXBwcm92ZWQ6IGludm9raW5nIHRoZW0gc3VyZmFjZXMgYVxuICogY29uZmlybWF0aW9uIHRvIHRoZSB1c2VyIChyZW5kZXJlZCBieSBhIGN1c3RvbSBjbGllbnQgY29udGVudCBwYXJ0KSBiZWZvcmVcbiAqIHRoZSB0b29sIGJvZHkgcnVucy4gUHJvdmlkZXJzIGNvbnN1bHQge0BsaW5rIGZlZWRiYWNrVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9ufVxuICogKHZpYSB0aGUgaG9zdCkgdG8gZXhjbHVkZSB0aGVzZSBmcm9tIHRoZWlyIHNlcnZlci10b29sIGF1dG8tYXBwcm92ZSBsaXN0cy5cbiAqL1xuY29uc3QgZmVlZGJhY2tDb25maXJtYXRpb25Ub29sTmFtZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFt2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWVdKTtcblxuLyoqIFdoZXRoZXIgdGhlIGdpdmVuIGZlZWRiYWNrIHNlcnZlciB0b29sIHJlcXVpcmVzIHVzZXIgY29uZmlybWF0aW9uIGJlZm9yZSBpdCBydW5zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZlZWRiYWNrVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uKHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGZlZWRiYWNrQ29uZmlybWF0aW9uVG9vbE5hbWVzLmhhcyh0b29sTmFtZSk7XG59XG5cbmNvbnN0IGFkZENvbW1lbnRJbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0cmVzb3VyY2VVcmk6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnVVJJIG9mIHRoZSBmaWxlIHRvIGFkZCBhIGNvbW1lbnQgdG8uJyB9LFxuXHRcdHJhbmdlOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnT25lLWJhc2VkIHRleHQgcmFuZ2UgdG8gY29tbWVudCBvbi4nLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnT25lLWJhc2VkIHN0YXJ0IGxpbmUgbnVtYmVyLicgfSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnT25lLWJhc2VkIHN0YXJ0IGNvbHVtbi4nIH0sXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnT25lLWJhc2VkIGVuZCBsaW5lIG51bWJlci4nIH0sXG5cdFx0XHRcdGVuZENvbHVtbjogeyB0eXBlOiAnbnVtYmVyJywgZGVzY3JpcHRpb246ICdPbmUtYmFzZWQgZW5kIGNvbHVtbi4nIH0sXG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnc3RhcnRMaW5lTnVtYmVyJywgJ3N0YXJ0Q29sdW1uJywgJ2VuZExpbmVOdW1iZXInLCAnZW5kQ29sdW1uJ10sXG5cdFx0fSxcblx0XHR0ZXh0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ0NvbW1lbnQgdGV4dCB0byBhZGQuJyB9LFxuXHR9LFxuXHRyZXF1aXJlZDogWydyZXNvdXJjZVVyaScsICdyYW5nZScsICd0ZXh0J10sXG59O1xuXG5jb25zdCBsaXN0Q29tbWVudHNJbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7fSxcbn07XG5cbmNvbnN0IHZpZXdVbnJldmlld2VkQ29tbWVudHNJbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7fSxcbn07XG5cbmNvbnN0IGRlbGV0ZUNvbW1lbnRzSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdGNvbW1lbnRJZHM6IHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246ICdDb21tZW50IElEcyB0byBkZWxldGUuJyB9LFxuXHR9LFxuXHRyZXF1aXJlZDogWydjb21tZW50SWRzJ10sXG59O1xuXG5jb25zdCByZXNvbHZlQ29tbWVudHNJbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0Y29tbWVudElkczogeyB0eXBlOiAnYXJyYXknLCBpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LCBkZXNjcmlwdGlvbjogJ0NvbW1lbnQgSURzIHRvIHVwZGF0ZS4nIH0sXG5cdFx0cmVzb2x2ZWQ6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogJ1doZXRoZXIgdGhlIGNvbW1lbnRzIHNob3VsZCBiZSBtYXJrZWQgYXMgcmVzb2x2ZWQuIERlZmF1bHRzIHRvIHRydWUuJyB9LFxuXHR9LFxuXHRyZXF1aXJlZDogWydjb21tZW50SWRzJ10sXG59O1xuXG4vKipcbiAqIFByb3RvY29sIHtAbGluayBUb29sRGVmaW5pdGlvbn1zIGZvciB0aGUgZmVlZGJhY2sgc2VydmVyIHRvb2xzLCBhZHZlcnRpc2VkIG9uXG4gKiB7QGxpbmsgU2Vzc2lvblN0YXRlLnNlcnZlclRvb2xzfSBzbyBjbGllbnRzIGtub3cgdGhlc2UgdG9vbHMgYXJlIG93bmVkIGFuZFxuICogZXhlY3V0ZWQgYnkgdGhlIGFnZW50IGhvc3QuXG4gKi9cbmV4cG9ydCBjb25zdCBmZWVkYmFja1NlcnZlclRvb2xEZWZpbml0aW9uczogVG9vbERlZmluaXRpb25bXSA9IFtcblx0e1xuXHRcdG5hbWU6IGFkZENvbW1lbnRUb29sTmFtZSxcblx0XHR0aXRsZTogJ0FkZCBDb21tZW50IChBZ2VudCBGZWVkYmFjayknLFxuXHRcdGRlc2NyaXB0aW9uOiAnQWRkIGEgY29tbWVudCB0byBhIGZpbGUgcmFuZ2UuJyxcblx0XHRpbnB1dFNjaGVtYTogYWRkQ29tbWVudElucHV0U2NoZW1hLFxuXHRcdGFubm90YXRpb25zOiB7IHJlYWRPbmx5SGludDogZmFsc2UgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6IGxpc3RDb21tZW50c1Rvb2xOYW1lLFxuXHRcdHRpdGxlOiAnTGlzdCBDb21tZW50cyAoQWdlbnQgRmVlZGJhY2spJyxcblx0XHRkZXNjcmlwdGlvbjogJ0xpc3QgY29tbWVudHMgZm9yIHRoaXMgc2Vzc2lvbi4nLFxuXHRcdGlucHV0U2NoZW1hOiBsaXN0Q29tbWVudHNJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IHRydWUgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6IGRlbGV0ZUNvbW1lbnRzVG9vbE5hbWUsXG5cdFx0dGl0bGU6ICdEZWxldGUgQ29tbWVudHMgKEFnZW50IEZlZWRiYWNrKScsXG5cdFx0ZGVzY3JpcHRpb246ICdEZWxldGUgY29tbWVudHMgZm9yIHRoaXMgc2Vzc2lvbi4nLFxuXHRcdGlucHV0U2NoZW1hOiBkZWxldGVDb21tZW50c0lucHV0U2NoZW1hLFxuXHRcdGFubm90YXRpb25zOiB7IHJlYWRPbmx5SGludDogZmFsc2UsIGRlc3RydWN0aXZlSGludDogdHJ1ZSB9LFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogcmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWUsXG5cdFx0dGl0bGU6ICdSZXNvbHZlIENvbW1lbnRzIChBZ2VudCBGZWVkYmFjayknLFxuXHRcdGRlc2NyaXB0aW9uOiAnTWFyayBjb21tZW50cyBmb3IgdGhpcyBzZXNzaW9uIGFzIHJlc29sdmVkIG9yIHVucmVzb2x2ZWQuJyxcblx0XHRpbnB1dFNjaGVtYTogcmVzb2x2ZUNvbW1lbnRzSW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiBmYWxzZSB9LFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lLFxuXHRcdHRpdGxlOiAnVmlldyBVbnJldmlld2VkIENvbW1lbnRzIChBZ2VudCBGZWVkYmFjayknLFxuXHRcdGRlc2NyaXB0aW9uOiAnVmlldyBwdWxsIHJlcXVlc3Qgb3IgY29kZSByZXZpZXcgY29tbWVudHMgdGhhdCB0aGUgdXNlciBoYXMgbm90IHJldmlld2VkIHlldC4gQ2FsbGluZyB0aGlzIGFza3MgdGhlIHVzZXIgdG8gY2hvb3NlIHdoaWNoIG9mIHRob3NlIGNvbW1lbnRzIHRvIHJldmVhbDsgb25seSB0aGUgY29tbWVudHMgdGhlIHVzZXIgcmV2ZWFscyBhcmUgcmV0dXJuZWQuJyxcblx0XHRpbnB1dFNjaGVtYTogdmlld1VucmV2aWV3ZWRDb21tZW50c0lucHV0U2NoZW1hLFxuXHRcdGFubm90YXRpb25zOiB7IHJlYWRPbmx5SGludDogdHJ1ZSB9LFxuXHR9LFxuXTtcblxuLy8gLS0tIEFyZ3VtZW50IHZhbGlkYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBJT25lQmFzZWRSYW5nZSB7XG5cdHJlYWRvbmx5IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSBzdGFydENvbHVtbjogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZENvbHVtbjogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUFkZENvbW1lbnRBcmdzIHtcblx0cmVhZG9ubHkgcmVzb3VyY2VVcmk/OiB1bmtub3duO1xuXHRyZWFkb25seSByYW5nZT86IHVua25vd247XG5cdHJlYWRvbmx5IHRleHQ/OiB1bmtub3duO1xufVxuXG5pbnRlcmZhY2UgSURlbGV0ZUNvbW1lbnRzQXJncyB7XG5cdHJlYWRvbmx5IGNvbW1lbnRJZHM/OiB1bmtub3duO1xufVxuXG5pbnRlcmZhY2UgSVJlc29sdmVDb21tZW50c0FyZ3Mge1xuXHRyZWFkb25seSBjb21tZW50SWRzPzogdW5rbm93bjtcblx0cmVhZG9ubHkgcmVzb2x2ZWQ/OiB1bmtub3duO1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZFN0cmluZyh2YWx1ZTogdW5rbm93biwgZmllbGQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8IHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke3Rvb2xOYW1lfSBpbnB1dDogJHtmaWVsZH0gbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYCk7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZFBvc2l0aXZlSW50ZWdlcih2YWx1ZTogdW5rbm93biwgZmllbGQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZyk6IG51bWJlciB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSB8fCB2YWx1ZSA8IDEpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHt0b29sTmFtZX0gaW5wdXQ6ICR7ZmllbGR9IG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyLmApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0QWRkQ29tbWVudEFyZ3MocmF3QXJnczogdW5rbm93bik6IHsgcmVzb3VyY2VVcmk6IHN0cmluZzsgcmFuZ2U6IElPbmVCYXNlZFJhbmdlOyB0ZXh0OiBzdHJpbmcgfSB7XG5cdGNvbnN0IGFyZ3MgPSAocmF3QXJncyA/PyB7fSkgYXMgSUFkZENvbW1lbnRBcmdzO1xuXHRjb25zdCByZXNvdXJjZVVyaSA9IGdldFJlcXVpcmVkU3RyaW5nKGFyZ3MucmVzb3VyY2VVcmksICdyZXNvdXJjZVVyaScsIGFkZENvbW1lbnRUb29sTmFtZSk7XG5cdGNvbnN0IHRleHQgPSBnZXRSZXF1aXJlZFN0cmluZyhhcmdzLnRleHQsICd0ZXh0JywgYWRkQ29tbWVudFRvb2xOYW1lKTtcblx0aWYgKCFhcmdzLnJhbmdlIHx8IHR5cGVvZiBhcmdzLnJhbmdlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGFyZ3MucmFuZ2UpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7YWRkQ29tbWVudFRvb2xOYW1lfSBpbnB1dDogcmFuZ2UgbXVzdCBiZSBhbiBvYmplY3QuYCk7XG5cdH1cblx0Y29uc3QgcmFuZ2UgPSBhcmdzLnJhbmdlIGFzIFBhcnRpYWw8SU9uZUJhc2VkUmFuZ2U+O1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlVXJpLFxuXHRcdHRleHQsXG5cdFx0cmFuZ2U6IHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogZ2V0UmVxdWlyZWRQb3NpdGl2ZUludGVnZXIocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAncmFuZ2Uuc3RhcnRMaW5lTnVtYmVyJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHRcdHN0YXJ0Q29sdW1uOiBnZXRSZXF1aXJlZFBvc2l0aXZlSW50ZWdlcihyYW5nZS5zdGFydENvbHVtbiwgJ3JhbmdlLnN0YXJ0Q29sdW1uJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IGdldFJlcXVpcmVkUG9zaXRpdmVJbnRlZ2VyKHJhbmdlLmVuZExpbmVOdW1iZXIsICdyYW5nZS5lbmRMaW5lTnVtYmVyJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHRcdGVuZENvbHVtbjogZ2V0UmVxdWlyZWRQb3NpdGl2ZUludGVnZXIocmFuZ2UuZW5kQ29sdW1uLCAncmFuZ2UuZW5kQ29sdW1uJywgYWRkQ29tbWVudFRvb2xOYW1lKSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRVbmlxdWVDb21tZW50SWRzKHZhbHVlOiB1bmtub3duLCB0b29sTmFtZTogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpIHx8IHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke3Rvb2xOYW1lfSBpbnB1dDogY29tbWVudElkcyBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZyBhcnJheS5gKTtcblx0fVxuXHRjb25zdCBpZHM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZSkge1xuXHRcdGlkcy5wdXNoKGdldFJlcXVpcmVkU3RyaW5nKGl0ZW0sICdjb21tZW50SWRzW10nLCB0b29sTmFtZSkpO1xuXHR9XG5cdHJldHVybiBbLi4ubmV3IFNldChpZHMpXTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVzb2x2ZWRGbGFnKHZhbHVlOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7cmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWV9IGlucHV0OiByZXNvbHZlZCBtdXN0IGJlIGEgYm9vbGVhbi5gKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbi8vIC0tLSBBbm5vdGF0aW9uIDwtPiBmZWVkYmFjayBjb252ZXJzaW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiB0b1RleHRSYW5nZShyYW5nZTogSU9uZUJhc2VkUmFuZ2UpOiBUZXh0UmFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0OiB7IGxpbmU6IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGNoYXJhY3RlcjogcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIH0sXG5cdFx0ZW5kOiB7IGxpbmU6IHJhbmdlLmVuZExpbmVOdW1iZXIgLSAxLCBjaGFyYWN0ZXI6IHJhbmdlLmVuZENvbHVtbiAtIDEgfSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZnJvbVRleHRSYW5nZShyYW5nZTogVGV4dFJhbmdlIHwgdW5kZWZpbmVkKTogSU9uZUJhc2VkUmFuZ2Uge1xuXHRpZiAoIXJhbmdlKSB7XG5cdFx0cmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH07XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzdGFydExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0LmxpbmUgKyAxLFxuXHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydC5jaGFyYWN0ZXIgKyAxLFxuXHRcdGVuZExpbmVOdW1iZXI6IHJhbmdlLmVuZC5saW5lICsgMSxcblx0XHRlbmRDb2x1bW46IHJhbmdlLmVuZC5jaGFyYWN0ZXIgKyAxLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBlbnRyeVRleHQodGV4dDogU3RyaW5nT3JNYXJrZG93bik6IHN0cmluZyB7XG5cdHJldHVybiB0eXBlb2YgdGV4dCA9PT0gJ3N0cmluZycgPyB0ZXh0IDogdGV4dC5tYXJrZG93bjtcbn1cblxuZnVuY3Rpb24gcmVhZE1ldGEoYW5ub3RhdGlvbjogQW5ub3RhdGlvbik6IElGZWVkYmFja0Fubm90YXRpb25NZXRhIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlYWRGZWVkYmFja0Fubm90YXRpb25NZXRhKGFubm90YXRpb24pO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRDb21tZW50IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2VVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IElPbmVCYXNlZFJhbmdlO1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGtpbmQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb2x2ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlcGxpZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplQ29tbWVudChhbm5vdGF0aW9uOiBBbm5vdGF0aW9uKTogSVNlcmlhbGl6ZWRDb21tZW50IHtcblx0Y29uc3QgZW50cmllcyA9IGFubm90YXRpb24uZW50cmllcyA/PyBbXTtcblx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRjb25zdCByZXBsaWVzID0gZW50cmllcy5zbGljZSgxKS5tYXAoZSA9PiBlbnRyeVRleHQoZS50ZXh0KSk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IGFubm90YXRpb24uaWQsXG5cdFx0cmVzb3VyY2VVcmk6IGFubm90YXRpb24ucmVzb3VyY2UsXG5cdFx0cmFuZ2U6IGZyb21UZXh0UmFuZ2UoYW5ub3RhdGlvbi5yYW5nZSksXG5cdFx0dGV4dDogZW50cmllcy5sZW5ndGggPyBlbnRyeVRleHQoZW50cmllc1swXS50ZXh0KSA6ICcnLFxuXHRcdGtpbmQ6IG1ldGE/LmtpbmQgPz8gJ3VzZXInLFxuXHRcdHJlc29sdmVkOiBhbm5vdGF0aW9uLnJlc29sdmVkLFxuXHRcdC4uLihyZXBsaWVzLmxlbmd0aCA/IHsgcmVwbGllcyB9IDoge30pLFxuXHR9O1xufVxuXG4vKipcbiAqIENvbW1lbnRzIHZpc2libGUgdG8gdGhlIGFnZW50OiBldmVyeXRoaW5nIGV4Y2VwdCBpdGVtcyBzdGlsbCBpbiB0aGVcbiAqIGBjcmVhdGVkYCBzdGF0ZSAodGhlIGFnZW50IGFkZGVkIHRoZW0gYnV0IHRoZSB1c2VyIGhhcyBub3QgYWNjZXB0ZWQgdGhlbVxuICogeWV0KS4gTWlycm9ycyB0aGUgY2xpZW50IGBnZXRMaXN0YWJsZUZlZWRiYWNrYCBiZWhhdmlvci5cbiAqL1xuZnVuY3Rpb24gbGlzdGFibGVBbm5vdGF0aW9ucyhzdGF0ZTogQW5ub3RhdGlvbnNTdGF0ZSk6IEFubm90YXRpb25bXSB7XG5cdHJldHVybiBzdGF0ZS5hbm5vdGF0aW9ucy5maWx0ZXIoYW5ub3RhdGlvbiA9PiB7XG5cdFx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRcdC8vIFRoZSBhbm5vdGF0aW9ucyBjaGFubmVsIGlzIGdlbmVyaWMgYW5kIG1heSBjYXJyeSBhbm5vdGF0aW9ucyBwcm9kdWNlZFxuXHRcdC8vIGJ5IG90aGVyIGZlYXR1cmVzLiBPbmx5IGFubm90YXRpb25zIHRoYXQgY2FycnkgZmVlZGJhY2sgbWV0YWRhdGEgYXJlXG5cdFx0Ly8gZmVlZGJhY2sgY29tbWVudHM7IHRoZSBmZWVkYmFjayB0b29scyBtdXN0IG5ldmVyIGxpc3QsIGRlbGV0ZSwgb3Jcblx0XHQvLyByZXNvbHZlIHVucmVsYXRlZCBhbm5vdGF0aW9ucy5cblx0XHRpZiAoIW1ldGEgfHwgIWFubm90YXRpb24uZW50cmllcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGVmZmVjdGl2ZVN0YXRlID0gYW5ub3RhdGlvbi5yZXNvbHZlZCA/ICdyZXNvbHZlZCcgOiAobWV0YS5zdGF0ZSA/PyAnYWNjZXB0ZWQnKTtcblx0XHRyZXR1cm4gZWZmZWN0aXZlU3RhdGUgIT09ICdjcmVhdGVkJztcblx0fSk7XG59XG5cbi8qKlxuICogRmVlZGJhY2sgYW5ub3RhdGlvbnMgb2YgYSB7QGxpbmsgUkVWSUVXQUJMRV9GRUVEQkFDS19LSU5EUyByZXZpZXdhYmxlIGtpbmR9XG4gKiB0aGUgdXNlciBoYXMgZmxhZ2dlZCBmb3IgcmV2ZWFsIHRvIHRoZSBhZ2VudCAodmlhIHRoZSBjb25maXJtYXRpb24gb2YgdGhlXG4gKiB7QGxpbmsgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lfSB0b29sKS4gVGhlc2UgYXJlIGV4YWN0bHkgdGhlIGNvbW1lbnRzXG4gKiB0aGUgdXNlciBjaG9zZSB0byByZXZlYWwgZm9yIHRoZSBjdXJyZW50IGludm9jYXRpb247IGV2ZXJ5dGhpbmcgZWxzZVxuICogKGluY2x1ZGluZyByZXZpZXcgY29tbWVudHMgdGhhdCBoYXBwZW4gdG8gYmUgYWNjZXB0ZWQgZnJvbSBhIHByZXZpb3VzIHJldmVhbFxuICogb3IgYSBtYW51YWwgYWNjZXB0KSBpcyBleGNsdWRlZC5cbiAqL1xuZnVuY3Rpb24gcGVuZGluZ1JldmVhbEFubm90YXRpb25zKHN0YXRlOiBBbm5vdGF0aW9uc1N0YXRlKTogQW5ub3RhdGlvbltdIHtcblx0cmV0dXJuIHN0YXRlLmFubm90YXRpb25zLmZpbHRlcihhbm5vdGF0aW9uID0+IHtcblx0XHRjb25zdCBtZXRhID0gcmVhZE1ldGEoYW5ub3RhdGlvbik7XG5cdFx0aWYgKCFtZXRhIHx8ICFhbm5vdGF0aW9uLmVudHJpZXM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUkVWSUVXQUJMRV9GRUVEQkFDS19LSU5EUy5oYXMobWV0YS5raW5kKSAmJiBtZXRhLnBlbmRpbmdBZ2VudFJldmVhbCA9PT0gdHJ1ZTtcblx0fSk7XG59XG5cbi8qKiBSZXR1cm5zIGEgY29weSBvZiB7QGxpbmsgYW5ub3RhdGlvbn0gd2l0aCB0aGUge0BsaW5rIElGZWVkYmFja0Fubm90YXRpb25NZXRhLnBlbmRpbmdBZ2VudFJldmVhbH0gZmxhZyBjbGVhcmVkLiAqL1xuZnVuY3Rpb24gY2xlYXJQZW5kaW5nUmV2ZWFsKGFubm90YXRpb246IEFubm90YXRpb24pOiBBbm5vdGF0aW9uIHtcblx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRpZiAoIW1ldGEpIHtcblx0XHRyZXR1cm4gYW5ub3RhdGlvbjtcblx0fVxuXHRjb25zdCBuZXh0TWV0YTogSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgPSB7IC4uLm1ldGEsIHBlbmRpbmdBZ2VudFJldmVhbDogdW5kZWZpbmVkIH07XG5cdHJldHVybiB7IC4uLmFubm90YXRpb24sIF9tZXRhOiB7IC4uLmFubm90YXRpb24uX21ldGEsIFtGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXTogbmV4dE1ldGEgfSB9O1xufVxuXG4vKipcbiAqIFJldmlld2FibGUgKFBSIC8gY29kZSByZXZpZXcpIGZlZWRiYWNrIGFubm90YXRpb25zIHRoZSB1c2VyIGhhcyBub3QgcmV2aWV3ZWRcbiAqIHlldCwgaS5lLiBzdGlsbCBpbiB0aGUgYGNyZWF0ZWRgIHN0YXRlLiBVc2VkIHRvIGJ1aWxkIHRoZVxuICoge0BsaW5rIGxpc3RDb21tZW50c1Rvb2xOYW1lfSBub3RlLlxuICovXG5mdW5jdGlvbiBjcmVhdGVkUmV2aWV3YWJsZUFubm90YXRpb25zKHN0YXRlOiBBbm5vdGF0aW9uc1N0YXRlKTogQW5ub3RhdGlvbltdIHtcblx0cmV0dXJuIHN0YXRlLmFubm90YXRpb25zLmZpbHRlcihhbm5vdGF0aW9uID0+IHtcblx0XHRjb25zdCBtZXRhID0gcmVhZE1ldGEoYW5ub3RhdGlvbik7XG5cdFx0aWYgKCFtZXRhIHx8ICFhbm5vdGF0aW9uLmVudHJpZXM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUkVWSUVXQUJMRV9GRUVEQkFDS19LSU5EUy5oYXMobWV0YS5raW5kKSAmJiAhYW5ub3RhdGlvbi5yZXNvbHZlZCAmJiAobWV0YS5zdGF0ZSA/PyAnYWNjZXB0ZWQnKSA9PT0gJ2NyZWF0ZWQnO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBBIHNob3J0IG5vdGUgYXBwZW5kZWQgdG8gdGhlIHtAbGluayBsaXN0Q29tbWVudHNUb29sTmFtZX0gcmVzdWx0IHdoZW4gdGhlcmVcbiAqIGFyZSByZXZpZXdhYmxlIGNvbW1lbnRzIHRoZSB1c2VyIGhhcyBub3QgYWNjZXB0ZWQgeWV0LCBwb2ludGluZyB0aGUgYWdlbnQgYXRcbiAqIHtAbGluayB2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWV9LiBSZXR1cm5zIGB1bmRlZmluZWRgIChubyBub3RlKSB3aGVuXG4gKiB0aGVyZSBhcmUgbm8gc3VjaCBjb21tZW50cy5cbiAqL1xuZnVuY3Rpb24gYnVpbGRVbnJldmlld2VkQ29tbWVudHNOb3RlKHN0YXRlOiBBbm5vdGF0aW9uc1N0YXRlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY3JlYXRlZCA9IGNyZWF0ZWRSZXZpZXdhYmxlQW5ub3RhdGlvbnMoc3RhdGUpO1xuXHRpZiAoIWNyZWF0ZWQubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgcHJDb3VudCA9IDA7XG5cdGxldCBjb2RlUmV2aWV3Q291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IGFubm90YXRpb24gb2YgY3JlYXRlZCkge1xuXHRcdGNvbnN0IGtpbmQgPSByZWFkTWV0YShhbm5vdGF0aW9uKT8ua2luZDtcblx0XHRpZiAoa2luZCA9PT0gJ3ByUmV2aWV3Jykge1xuXHRcdFx0cHJDb3VudCsrO1xuXHRcdH0gZWxzZSBpZiAoa2luZCA9PT0gJ2NvZGVSZXZpZXcnKSB7XG5cdFx0XHRjb2RlUmV2aWV3Q291bnQrKztcblx0XHR9XG5cdH1cblx0Y29uc3QgY2xhdXNlczogc3RyaW5nW10gPSBbXTtcblx0aWYgKHByQ291bnQgPiAwKSB7XG5cdFx0Y2xhdXNlcy5wdXNoKGAke3ByQ291bnR9IHB1bGwgcmVxdWVzdCBjb21tZW50JHtwckNvdW50ID09PSAxID8gJycgOiAncyd9YCk7XG5cdH1cblx0aWYgKGNvZGVSZXZpZXdDb3VudCA+IDApIHtcblx0XHRjbGF1c2VzLnB1c2goYCR7Y29kZVJldmlld0NvdW50fSBjb2RlIHJldmlldyBjb21tZW50JHtjb2RlUmV2aWV3Q291bnQgPT09IDEgPyAnJyA6ICdzJ31gKTtcblx0fVxuXHRjb25zdCBzdWJqZWN0ID0gY2xhdXNlcy5qb2luKCcgYW5kICcpO1xuXHRjb25zdCB2ZXJiID0gY3JlYXRlZC5sZW5ndGggPT09IDEgPyAnaXMnIDogJ2FyZSc7XG5cdHJldHVybiBgVGhlcmUgJHt2ZXJifSAke3N1YmplY3R9IHdoaWNoIHRoZSB1c2VyIGhhcyBub3QgcmV2aWV3ZWQgeWV0LiBJZiB0aGUgdXNlciB3YW50cyB5b3UgdG8gdGFja2xlIHRoZW0sIGNhbGwgdGhlIFxcYCR7dmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lfVxcYCB0b29sIHRvIHZpZXcgdGhlbS5gO1xufVxuXG4vLyAtLS0gVG9vbCBleGVjdXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGludGVyZmFjZSBJRmVlZGJhY2tUb29sT3V0Y29tZSB7XG5cdC8qKiBBbm5vdGF0aW9uIGFjdGlvbnMgdG8gZGlzcGF0Y2ggb24gdGhlIHNlc3Npb24ncyBhbm5vdGF0aW9ucyBjaGFubmVsLiAqL1xuXHRyZWFkb25seSBhY3Rpb25zOiByZWFkb25seSBBbm5vdGF0aW9uc0FjdGlvbltdO1xuXHQvKiogVGV4dHVhbCB0b29sIHJlc3VsdCByZXR1cm5lZCB0byB0aGUgYWdlbnQuICovXG5cdHJlYWRvbmx5IHJlc3VsdDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEV4ZWN1dGVzIGEgZmVlZGJhY2sgc2VydmVyIHRvb2wgYWdhaW5zdCB0aGUgY3VycmVudCBhbm5vdGF0aW9uIHN0YXRlLlxuICpcbiAqIFB1cmU6IGl0IGRvZXMgbm90IG11dGF0ZSB7QGxpbmsgc3RhdGV9LCBpbnN0ZWFkIHJldHVybmluZyB0aGUgYW5ub3RhdGlvblxuICogYWN0aW9ucyB0aGUgY2FsbGVyIHNob3VsZCBkaXNwYXRjaCAoc28gdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgbWFuYWdlclxuICogcmVtYWlucyB0aGUgc2luZ2xlIHdyaXRlcikgYWxvbmcgd2l0aCB0aGUgdGV4dHVhbCB0b29sIHJlc3VsdC5cbiAqXG4gKiBAdGhyb3dzIGlmIHtAbGluayB0b29sTmFtZX0gaXMgdW5rbm93biBvciB0aGUgYXJndW1lbnRzIGFyZSBpbnZhbGlkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGU6IEFubm90YXRpb25zU3RhdGUsIHNlc3Npb25SZXNvdXJjZTogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCByYXdBcmdzOiB1bmtub3duKTogSUZlZWRiYWNrVG9vbE91dGNvbWUge1xuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSBhZGRDb21tZW50VG9vbE5hbWU6IHtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2VVcmksIHJhbmdlLCB0ZXh0IH0gPSBnZXRBZGRDb21tZW50QXJncyhyYXdBcmdzKTtcblx0XHRcdGNvbnN0IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHQvLyBUaGUgYWdlbnQgYWRkcyBjb21tZW50cyBpbiB0aGUgYGNyZWF0ZWRgIHN0YXRlOyB0aGUgdXNlciBhY2NlcHRzXG5cdFx0XHQvLyB0aGVtIGJlZm9yZSB0aGV5IGFyZSBhY3RlZCB1cG9uLlxuXHRcdFx0Y29uc3QgbWV0YTogSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgPSB7IGtpbmQ6ICdjb2RlUmV2aWV3Jywgc3RhdGU6ICdjcmVhdGVkJywgc2Vzc2lvblJlc291cmNlIH07XG5cdFx0XHRjb25zdCBhbm5vdGF0aW9uOiBBbm5vdGF0aW9uID0ge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dHVybklkOiAnJyxcblx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlVXJpLFxuXHRcdFx0XHRyYW5nZTogdG9UZXh0UmFuZ2UocmFuZ2UpLFxuXHRcdFx0XHRyZXNvbHZlZDogZmFsc2UsXG5cdFx0XHRcdGVudHJpZXM6IFt7IGlkOiBgJHtpZH06MGAsIHRleHQgfV0sXG5cdFx0XHRcdF9tZXRhOiB7IFtGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXTogbWV0YSB9LFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFjdGlvbnM6IFt7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQsIGFubm90YXRpb24gfV0sXG5cdFx0XHRcdHJlc3VsdDogJ0NvbW1lbnQgYWRkZWQuJyxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgbGlzdENvbW1lbnRzVG9vbE5hbWU6IHtcblx0XHRcdGNvbnN0IHBheWxvYWQ6IHsgY29tbWVudHM6IElTZXJpYWxpemVkQ29tbWVudFtdOyBub3RlPzogc3RyaW5nIH0gPSB7XG5cdFx0XHRcdGNvbW1lbnRzOiBsaXN0YWJsZUFubm90YXRpb25zKHN0YXRlKS5tYXAoc2VyaWFsaXplQ29tbWVudCksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgbm90ZSA9IGJ1aWxkVW5yZXZpZXdlZENvbW1lbnRzTm90ZShzdGF0ZSk7XG5cdFx0XHRpZiAobm90ZSkge1xuXHRcdFx0XHRwYXlsb2FkLm5vdGUgPSBub3RlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgYWN0aW9uczogW10sIHJlc3VsdDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCwgdW5kZWZpbmVkLCAyKSB9O1xuXHRcdH1cblx0XHRjYXNlIHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZToge1xuXHRcdFx0Ly8gVGhlIGNvbmZpcm1hdGlvbiBnYXRlIHJ1bnMgYmVmb3JlIHRoaXMgYm9keS4gV2hlbiB0aGUgdXNlciBhY2NlcHRzXG5cdFx0XHQvLyB0aGUgY29uZmlybWF0aW9uLCB0aGUgY2xpZW50IGZsYWdzIGV4YWN0bHkgdGhlIGNvbW1lbnRzIHRoZXkgY2hvc2Vcblx0XHRcdC8vIHRvIHJldmVhbCB3aXRoIGBwZW5kaW5nQWdlbnRSZXZlYWxgIG9uIHRoZSBzaGFyZWQgYW5ub3RhdGlvbnNcblx0XHRcdC8vIGNoYW5uZWwuIFJldHVybiB0aG9zZSBjb21tZW50cyBhbmQgY2xlYXIgdGhlIGZsYWcgc28gYSBsYXRlclxuXHRcdFx0Ly8gaW52b2NhdGlvbiBkb2VzIG5vdCByZS1yZXR1cm4gdGhlbTsgY29tbWVudHMgdGhlIHVzZXIgbGVmdFxuXHRcdFx0Ly8gdW5jaGVja2VkIChhbmQgcmV2aWV3IGNvbW1lbnRzIGFjY2VwdGVkIGJ5IG90aGVyIG1lYW5zKSBhcmUgbm90XG5cdFx0XHQvLyBmbGFnZ2VkIGFuZCBzbyBhcmUgZXhjbHVkZWQuXG5cdFx0XHRjb25zdCBwZW5kaW5nID0gcGVuZGluZ1JldmVhbEFubm90YXRpb25zKHN0YXRlKTtcblx0XHRcdGNvbnN0IGNvbW1lbnRzID0gcGVuZGluZy5tYXAoc2VyaWFsaXplQ29tbWVudCk7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBBbm5vdGF0aW9uc0FjdGlvbltdID0gcGVuZGluZy5tYXAoYW5ub3RhdGlvbiA9PiAoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkFubm90YXRpb25zU2V0LFxuXHRcdFx0XHRhbm5vdGF0aW9uOiBjbGVhclBlbmRpbmdSZXZlYWwoYW5ub3RhdGlvbiksXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm4geyBhY3Rpb25zLCByZXN1bHQ6IEpTT04uc3RyaW5naWZ5KHsgY29tbWVudHMgfSwgdW5kZWZpbmVkLCAyKSB9O1xuXHRcdH1cblx0XHRjYXNlIGRlbGV0ZUNvbW1lbnRzVG9vbE5hbWU6IHtcblx0XHRcdGNvbnN0IGlkcyA9IGdldFVuaXF1ZUNvbW1lbnRJZHMoKHJhd0FyZ3MgYXMgSURlbGV0ZUNvbW1lbnRzQXJncyk/LmNvbW1lbnRJZHMsIGRlbGV0ZUNvbW1lbnRzVG9vbE5hbWUpO1xuXHRcdFx0Y29uc3QgbGlzdGFibGUgPSBsaXN0YWJsZUFubm90YXRpb25zKHN0YXRlKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gbmV3IE1hcChsaXN0YWJsZS5tYXAoYSA9PiBbYS5pZCwgYV0pKTtcblx0XHRcdGNvbnN0IGFjdGlvbnM6IEFubm90YXRpb25zQWN0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBub3RGb3VuZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG5cdFx0XHRcdGlmIChleGlzdGluZy5oYXMoaWQpKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHsgdHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1JlbW92ZWQsIGFubm90YXRpb25JZDogaWQgfSk7XG5cdFx0XHRcdFx0ZGVsZXRlZC5wdXNoKGlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRub3RGb3VuZC5wdXNoKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gbGlzdGFibGUuZmlsdGVyKGEgPT4gIWRlbGV0ZWQuaW5jbHVkZXMoYS5pZCkpLm1hcChzZXJpYWxpemVDb21tZW50KTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFjdGlvbnMsXG5cdFx0XHRcdHJlc3VsdDogSlNPTi5zdHJpbmdpZnkoeyBkZWxldGVkQ29tbWVudElkczogZGVsZXRlZCwgbm90Rm91bmRDb21tZW50SWRzOiBub3RGb3VuZCwgcmVtYWluaW5nQ29tbWVudHM6IHJlbWFpbmluZyB9LCB1bmRlZmluZWQsIDIpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSByZXNvbHZlQ29tbWVudHNUb29sTmFtZToge1xuXHRcdFx0Y29uc3QgYXJncyA9IChyYXdBcmdzID8/IHt9KSBhcyBJUmVzb2x2ZUNvbW1lbnRzQXJncztcblx0XHRcdGNvbnN0IGlkcyA9IGdldFVuaXF1ZUNvbW1lbnRJZHMoYXJncy5jb21tZW50SWRzLCByZXNvbHZlQ29tbWVudHNUb29sTmFtZSk7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGdldFJlc29sdmVkRmxhZyhhcmdzLnJlc29sdmVkKTtcblx0XHRcdGNvbnN0IGxpc3RhYmxlID0gbGlzdGFibGVBbm5vdGF0aW9ucyhzdGF0ZSk7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IG5ldyBNYXAobGlzdGFibGUubWFwKGEgPT4gW2EuaWQsIGFdKSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBBbm5vdGF0aW9uc0FjdGlvbltdID0gW107XG5cdFx0XHRjb25zdCB1cGRhdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgbm90Rm91bmQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuXHRcdFx0XHRjb25zdCBhbm5vdGF0aW9uID0gZXhpc3RpbmcuZ2V0KGlkKTtcblx0XHRcdFx0aWYgKCFhbm5vdGF0aW9uKSB7XG5cdFx0XHRcdFx0bm90Rm91bmQucHVzaChpZCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWV0YSA9IHJlYWRNZXRhKGFubm90YXRpb24pO1xuXHRcdFx0XHRjb25zdCBuZXh0TWV0YTogSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgPSB7XG5cdFx0XHRcdFx0Li4ubWV0YSxcblx0XHRcdFx0XHRraW5kOiBtZXRhPy5raW5kID8/ICd1c2VyJyxcblx0XHRcdFx0XHRzdGF0ZTogcmVzb2x2ZWQgPyAncmVzb2x2ZWQnIDogJ3N1Ym1pdHRlZCcsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBtZXRhPy5zZXNzaW9uUmVzb3VyY2UgPz8gc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBuZXh0QW5ub3RhdGlvbjogQW5ub3RhdGlvbiA9IHtcblx0XHRcdFx0XHQuLi5hbm5vdGF0aW9uLFxuXHRcdFx0XHRcdHJlc29sdmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IC4uLmFubm90YXRpb24uX21ldGEsIFtGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXTogbmV4dE1ldGEgfSxcblx0XHRcdFx0fTtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHsgdHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCwgYW5ub3RhdGlvbjogbmV4dEFubm90YXRpb24gfSk7XG5cdFx0XHRcdHVwZGF0ZWQucHVzaChpZCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb21tZW50cyA9IGxpc3RhYmxlLm1hcChhID0+IHVwZGF0ZWQuaW5jbHVkZXMoYS5pZCkgPyBzZXJpYWxpemVDb21tZW50KHsgLi4uYSwgcmVzb2x2ZWQgfSkgOiBzZXJpYWxpemVDb21tZW50KGEpKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFjdGlvbnMsXG5cdFx0XHRcdHJlc3VsdDogSlNPTi5zdHJpbmdpZnkoeyByZXNvbHZlZCwgdXBkYXRlZENvbW1lbnRJZHM6IHVwZGF0ZWQsIG5vdEZvdW5kQ29tbWVudElkczogbm90Rm91bmQsIGNvbW1lbnRzIH0sIHVuZGVmaW5lZCwgMiksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGZlZWRiYWNrIHNlcnZlciB0b29sOiAke3Rvb2xOYW1lfWApO1xuXHR9XG59XG5cbi8qKlxuICogUGFyc2VzIHRoZSBudW1iZXIgb2YgY29tbWVudHMgcmV0dXJuZWQgYnkgdGhlIHtAbGluayBsaXN0Q29tbWVudHNUb29sTmFtZX1cbiAqIHRvb2wgZnJvbSBpdHMgSlNPTiByZXN1bHQgKGB7IGNvbW1lbnRzOiBbLi4uXSB9YCkuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlblxuICogdGhlIHJlc3VsdCBpcyBtaXNzaW5nIG9yIG5vdCBpbiB0aGUgZXhwZWN0ZWQgc2hhcGUsIHNvIHRoZSBjYWxsZXIgY2FuIGZhbGxcbiAqIGJhY2sgdG8gYSBjb3VudC1sZXNzIG1lc3NhZ2UuXG4gKi9cbmZ1bmN0aW9uIHBhcnNlTGlzdGVkQ29tbWVudENvdW50KHJlc3VsdFRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmVzdWx0VGV4dCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJlc3VsdFRleHQpIGFzIHsgY29tbWVudHM/OiB1bmtub3duIH07XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkLmNvbW1lbnRzKSA/IHBhcnNlZC5jb21tZW50cy5sZW5ndGggOiB1bmRlZmluZWQ7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBEaXNwbGF5IHN0cmluZ3MgZm9yIHRoZSBmZWVkYmFjayAoXCJjb21tZW50c1wiKSB0b29scywgYXV0aG9yZWQgaGVyZSBzbyBldmVyeVxuICogcHJvdmlkZXIgKENvcGlsb3QsIENsYXVkZSwgQ29kZXgsIFx1MjAyNikgcmVuZGVycyB0aGVtIGlkZW50aWNhbGx5IGluc3RlYWQgb2ZcbiAqIGVhY2ggcHJvdmlkZXIncyBkaXNwbGF5IGxheWVyIHJlLWRlcml2aW5nIHRoZSBzdHJpbmdzIGZyb20gdGhlIHRvb2wgbmFtZS5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIHRvb2xzIHRoaXMgZ3JvdXAgZG9lcyBub3Qgb3duLCBzbyB0aGUgY2FsbGVyIGZhbGxzXG4gKiBiYWNrIHRvIGl0cyBnZW5lcmljIGRpc3BsYXkuXG4gKlxuICoge0BsaW5rIHRvb2xOYW1lfSBpcyB0aGUgYmFyZSB0b29sIG5hbWUgKGFueSB0cmFuc3BvcnQgcHJlZml4IHN1Y2ggYXMgQ2xhdWRlJ3NcbiAqIGBtY3BfXzxzZXJ2ZXI+X19gIGhhcyBhbHJlYWR5IGJlZW4gc3RyaXBwZWQgYnkgdGhlIGRpc3BhdGNoZXIpLlxuICovXG5mdW5jdGlvbiBnZXRGZWVkYmFja1Rvb2xEaXNwbGF5KHRvb2xOYW1lOiBzdHJpbmcsIF9hcmdzOiB1bmtub3duLCByZXN1bHQ/OiBJU2VydmVyVG9vbERpc3BsYXlSZXN1bHQpOiBJU2VydmVyVG9vbERpc3BsYXkgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSBhZGRDb21tZW50VG9vbE5hbWU6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2xOYW1lLmFkZENvbW1lbnQnLCBcIkFkZCBDb21tZW50XCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UuYWRkQ29tbWVudCcsIFwiQWRkaW5nIGNvbW1lbnRcIiksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCd0b29sQ29tcGxldGUuYWRkQ29tbWVudCcsIFwiQWRkZWQgY29tbWVudFwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSBsaXN0Q29tbWVudHNUb29sTmFtZToge1xuXHRcdFx0bGV0IHBhc3RUZW5zZU1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd247XG5cdFx0XHRjb25zdCBjb3VudCA9IHJlc3VsdCA/IHBhcnNlTGlzdGVkQ29tbWVudENvdW50KHJlc3VsdC50ZXh0KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjb3VudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2UgPSBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmxpc3RDb21tZW50cycsIFwiQ2hlY2tlZCBjb21tZW50c1wiKTtcblx0XHRcdH0gZWxzZSBpZiAoY291bnQgPT09IDEpIHtcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZSA9IGxvY2FsaXplKCd0b29sQ29tcGxldGUubGlzdENvbW1lbnRzLm9uZScsIFwiQ2hlY2tlZCAxIGNvbW1lbnRcIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlID0gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5saXN0Q29tbWVudHMubWFueScsIFwiQ2hlY2tlZCB7MH0gY29tbWVudHNcIiwgY291bnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5saXN0Q29tbWVudHMnLCBcIkxpc3QgQ29tbWVudHNcIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbEludm9rZS5saXN0Q29tbWVudHMnLCBcIkNoZWNraW5nIGNvbW1lbnRzXCIpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSBkZWxldGVDb21tZW50c1Rvb2xOYW1lOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5kZWxldGVDb21tZW50cycsIFwiRGVsZXRlIENvbW1lbnRzXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UuZGVsZXRlQ29tbWVudHMnLCBcIkRlbGV0aW5nIGNvbW1lbnRzXCIpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmRlbGV0ZUNvbW1lbnRzJywgXCJEZWxldGVkIGNvbW1lbnRzXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIHJlc29sdmVDb21tZW50c1Rvb2xOYW1lOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5yZXNvbHZlQ29tbWVudHMnLCBcIlJlc29sdmUgQ29tbWVudHNcIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbEludm9rZS5yZXNvbHZlQ29tbWVudHMnLCBcIlJlc29sdmluZyBjb21tZW50c1wiKSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5yZXNvbHZlQ29tbWVudHMnLCBcIlJlc29sdmVkIGNvbW1lbnRzXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZTpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUudmlld1VucmV2aWV3ZWRDb21tZW50cycsIFwiVmlldyBDb21tZW50c1wiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0b29sSW52b2tlLnZpZXdVbnJldmlld2VkQ29tbWVudHMnLCBcIlZpZXdpbmcgY29tbWVudHNcIiksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCd0b29sQ29tcGxldGUudmlld1VucmV2aWV3ZWRDb21tZW50cycsIFwiVmlld2VkIGNvbW1lbnRzXCIpLFxuXHRcdFx0fTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBmZWVkYmFjayAoXCJjb21tZW50c1wiKSBzZXJ2ZXItdG9vbCBncm91cCwgY29udHJpYnV0ZWQgdG8gdGhlXG4gKiB7QGxpbmsgQWdlbnRTZXJ2ZXJUb29sSG9zdH0gYXQgc3RhcnR1cCAoc2VlIGBub2RlL2FnZW50U2VydmljZS50c2ApLiBXcmFwc1xuICogdGhlIHB1cmUge0BsaW5rIGFwcGx5RmVlZGJhY2tUb29sfSBleGVjdXRvciB3aXRoIHRoZSBhbm5vdGF0aW9ucy1jaGFubmVsIEkvTzpcbiAqIGl0IHJlYWRzIHRoZSBzZXNzaW9uJ3MgY3VycmVudCB7QGxpbmsgQW5ub3RhdGlvbnNTdGF0ZX0sIGFwcGxpZXMgdGhlIHRvb2wsXG4gKiBhbmQgZGlzcGF0Y2hlcyB0aGUgcmVzdWx0aW5nIGFubm90YXRpb24gYWN0aW9ucyB0aHJvdWdoIHRoZSBzdGF0ZSBtYW5hZ2VyXG4gKiAodGhlIHNpbmdsZSB3cml0ZXIpLlxuICovXG5leHBvcnQgY29uc3QgZmVlZGJhY2tTZXJ2ZXJUb29sR3JvdXA6IElTZXJ2ZXJUb29sR3JvdXAgPSB7XG5cdGRlZmluaXRpb25zOiBmZWVkYmFja1NlcnZlclRvb2xEZWZpbml0aW9ucyxcblx0cmVxdWlyZXNDb25maXJtYXRpb24odG9vbE5hbWUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmVlZGJhY2tUb29sUmVxdWlyZXNDb25maXJtYXRpb24odG9vbE5hbWUpO1xuXHR9LFxuXHRnZXREaXNwbGF5KHRvb2xOYW1lLCBhcmdzLCByZXN1bHQpOiBJU2VydmVyVG9vbERpc3BsYXkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRGZWVkYmFja1Rvb2xEaXNwbGF5KHRvb2xOYW1lLCBhcmdzLCByZXN1bHQpO1xuXHR9LFxuXHRleGVjdXRlKHN0YXRlTWFuYWdlciwgY2hhdFVyaSwgdG9vbE5hbWUsIHJhd0FyZ3MpOiBzdHJpbmcge1xuXHRcdC8vIEEgc2Vzc2lvbiBjYW4gY29udGFpbiBtdWx0aXBsZSBjaGF0cywgZWFjaCBhZGRyZXNzZWQgYnkgaXRzIG93blxuXHRcdC8vIGBhaHAtY2hhdGAgVVJJIGJ1dCBzaGFyaW5nIHRoZSBzYW1lIGNvbnRleHQvd29ya3NwYWNlLiBDb21tZW50cyBiZWxvbmdcblx0XHQvLyB0byB0aGUgc2Vzc2lvbiBhcyBhIHdob2xlLCBzbyBhbHdheXMgcmVzb2x2ZSBhIGNoYXQgVVJJIGJhY2sgdG8gaXRzXG5cdFx0Ly8gb3duaW5nIHNlc3Npb24gYW5kIG9wZXJhdGUgb24gdGhlIG1haW4gc2Vzc2lvbidzIGFubm90YXRpb25zIGNoYW5uZWwuXG5cdFx0Y29uc3QgbWFpblNlc3Npb25VcmkgPSBwYXJzZUNoYXRVcmkoY2hhdFVyaSk/LnNlc3Npb24gPz8gY2hhdFVyaTtcblx0XHRjb25zdCBhbm5vdGF0aW9uc1VyaSA9IGJ1aWxkQW5ub3RhdGlvbnNVcmkobWFpblNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGFubm90YXRpb25zVXJpKTtcblx0XHRjb25zdCBzdGF0ZTogQW5ub3RhdGlvbnNTdGF0ZSA9IChzbmFwc2hvdD8uc3RhdGUgYXMgQW5ub3RhdGlvbnNTdGF0ZSB8IHVuZGVmaW5lZCkgPz8geyBhbm5vdGF0aW9uczogW10gfTtcblx0XHRjb25zdCBvdXRjb21lID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIG1haW5TZXNzaW9uVXJpLCB0b29sTmFtZSwgcmF3QXJncyk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2Ygb3V0Y29tZS5hY3Rpb25zKSB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oYW5ub3RhdGlvbnNVcmksIGFjdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBvdXRjb21lLnJlc3VsdDtcblx0fSxcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4Qiw0QkFBNEIsb0NBQW9DLDZCQUEyRDtBQUNsSyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUF3SDtBQWtCMUgsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSx1QkFBdUI7QUFDN0IsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSwwQkFBMEI7QUFDaEMsTUFBTSxpQ0FBaUM7QUFTOUMsTUFBTSw0QkFBaUQsb0JBQUksSUFBSSxDQUFDLFlBQVksWUFBWSxDQUFDO0FBUXpGLE1BQU0sZ0NBQXFELG9CQUFJLElBQUksQ0FBQyw4QkFBOEIsQ0FBQztBQUc1RixTQUFTLGlDQUFpQyxVQUEyQjtBQUMzRSxTQUFPLDhCQUE4QixJQUFJLFFBQVE7QUFDbEQ7QUFFQSxNQUFNLHdCQUF1RDtBQUFBLEVBQzVELE1BQU07QUFBQSxFQUNOLFlBQVk7QUFBQSxJQUNYLGFBQWEsRUFBRSxNQUFNLFVBQVUsYUFBYSx1Q0FBdUM7QUFBQSxJQUNuRixPQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixZQUFZO0FBQUEsUUFDWCxpQkFBaUIsRUFBRSxNQUFNLFVBQVUsYUFBYSwrQkFBK0I7QUFBQSxRQUMvRSxhQUFhLEVBQUUsTUFBTSxVQUFVLGFBQWEsMEJBQTBCO0FBQUEsUUFDdEUsZUFBZSxFQUFFLE1BQU0sVUFBVSxhQUFhLDZCQUE2QjtBQUFBLFFBQzNFLFdBQVcsRUFBRSxNQUFN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
