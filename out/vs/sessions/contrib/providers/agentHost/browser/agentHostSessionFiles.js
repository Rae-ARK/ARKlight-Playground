import { constObservable, derivedOpts, mapObservableArrayCached } from "../../../../../base/common/observable.js";
import { compare as strCompare } from "../../../../../base/common/strings.js";
import { getComparisonKey, isEqual, isEqualOrParent } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { normalizeFileEdit } from "../../../../../platform/agentHost/common/fileEditDiff.js";
import {
  buildDefaultChatUri,
  FileEditKind,
  ResponsePartKind,
  StateComponents,
  ToolCallStatus,
  ToolResultContentType
} from "../../../../../platform/agentHost/common/state/sessionState.js";
import { SessionFileOperation, sessionFileChangesEqual } from "../../../../services/sessions/common/session.js";
import { createActiveSessionSubscriptionObs } from "./agentHostSessionChangesets.js";
function createSessionOutputObs(sessionUri, options, isActiveSessionObs, isArchivedObs, workspaceObs) {
  const mapDiffUri = options.mapDiffUri;
  const enabledObs = derivedOpts({ equalsFn: (a, b) => a === b }, (reader) => isActiveSessionObs.read(reader) && !isArchivedObs.read(reader));
  const sessionStateObs = createActiveSessionSubscriptionObs(
    options,
    enabledObs,
    StateComponents.Session,
    constObservable(sessionUri)
  );
  const chatUrisObs = derivedOpts({ equalsFn: (a, b) => a.length === b.length && a.every((u, i) => isEqual(u, b[i])) }, (reader) => {
    if (!enabledObs.read(reader)) {
      return [];
    }
    const sessionState = sessionStateObs.read(reader).read(reader);
    const defaultChatUri = URI.parse(buildDefaultChatUri(sessionUri));
    if (!sessionState || sessionState instanceof Error) {
      return [defaultChatUri];
    }
    const uris = /* @__PURE__ */ new Map();
    uris.set(defaultChatUri.toString(), defaultChatUri);
    for (const chat of sessionState.chats) {
      const uri = URI.parse(chat.resource);
      uris.set(uri.toString(), uri);
    }
    return [...uris.values()];
  });
  const editsPerChatObs = mapObservableArrayCached(void 0, chatUrisObs, (chatUri) => {
    const chatStateObs = createActiveSessionSubscriptionObs(
      options,
      enabledObs,
      StateComponents.Chat,
      constObservable(chatUri)
    );
    const parse = createIncrementalChatFileEditsParser(mapDiffUri);
    return derivedOpts({ equalsFn: (a, b) => isEqual(a.chatUri, b.chatUri) && chatFileEditsEqual(a, b) }, (reader) => {
      const chatState = chatStateObs.read(reader).read(reader);
      if (!chatState || chatState instanceof Error) {
        return { chatUri, allEdits: [], lastTurnEdits: [] };
      }
      return { chatUri, ...parse(chatState) };
    });
  }, (chatUri) => chatUri.toString());
  const externalFiles = derivedOpts({ equalsFn: sessionFilesEqual }, (reader) => {
    const workspace = workspaceObs.read(reader);
    const folderRoots = (workspace?.folders ?? []).map((f) => f.workingDirectory);
    const allEdits = [];
    for (const chatEditsObs of editsPerChatObs.read(reader)) {
      allEdits.push(...chatEditsObs.read(reader).allEdits);
    }
    return reduceSessionFiles(allEdits, folderRoots);
  });
  const getLastTurnChanges = (chatUri) => derivedOpts({ equalsFn: sessionFileChangesEqual }, (reader) => {
    const folderRoots = getWorkspaceAndWorktreeRoots(workspaceObs.read(reader));
    for (const chatEditsObs of editsPerChatObs.read(reader)) {
      const chatEdits = chatEditsObs.read(reader);
      if (isEqual(chatEdits.chatUri, chatUri)) {
        return reduceTurnChanges(chatEdits.lastTurnEdits, folderRoots);
      }
    }
    return [];
  });
  return { externalFiles, getLastTurnChanges };
}
function pushUniqueRoot(roots, root) {
  if (root && !roots.some((existing) => isEqual(existing, root))) {
    roots.push(root);
  }
}
function getWorkspaceAndWorktreeRoots(workspace) {
  const roots = [];
  for (const folder of workspace?.folders ?? []) {
    pushUniqueRoot(roots, folder.root);
    pushUniqueRoot(roots, folder.workingDirectory);
    pushUniqueRoot(roots, folder.gitRepository?.workTreeUri);
  }
  return roots;
}
function createIncrementalChatFileEditsParser(mapDiffUri, parseTurn = (responseParts) => parseResponseParts(responseParts, mapDiffUri)) {
  const completedTurnCache = /* @__PURE__ */ new Map();
  return (chatState) => {
    const allEdits = [];
    const turns = chatState.turns ?? [];
    const completedIds = new Set(turns.map((t) => t.id));
    for (const id of completedTurnCache.keys()) {
      if (!completedIds.has(id)) {
        completedTurnCache.delete(id);
      }
    }
    for (const turn of turns) {
      let parsed = completedTurnCache.get(turn.id);
      if (!parsed) {
        parsed = parseTurn(turn.responseParts);
        completedTurnCache.set(turn.id, parsed);
      }
      if (parsed.length > 0) {
        allEdits.push(...parsed);
      }
    }
    let lastTurnEdits;
    if (chatState.activeTurn) {
      lastTurnEdits = parseTurn(chatState.activeTurn.responseParts);
      allEdits.push(...lastTurnEdits);
    } else if (turns.length > 0) {
      lastTurnEdits = completedTurnCache.get(turns[turns.length - 1].id) ?? [];
    } else {
      lastTurnEdits = [];
    }
    return { allEdits, lastTurnEdits };
  };
}
function parseResponseParts(responseParts, mapDiffUri) {
  const out = [];
  for (const part of responseParts) {
    if (part.kind !== ResponsePartKind.ToolCall) {
      continue;
    }
    for (const fileEdit of getToolCallFileEdits(part.toolCall)) {
      const parsed = parseFileEdit(fileEdit, mapDiffUri);
      if (parsed) {
        out.push(parsed);
      }
    }
  }
  return out;
}
function getToolCallFileEdits(toolCall) {
  const edits = [];
  if (toolCall.status === ToolCallStatus.Running || toolCall.status === ToolCallStatus.Completed || toolCall.status === ToolCallStatus.PendingResultConfirmation) {
    for (const c of toolCall.content ?? []) {
      if (c.type === ToolResultContentType.FileEdit) {
        edits.push(c);
      }
    }
  } else if (toolCall.status === ToolCallStatus.PendingConfirmation) {
    edits.push(...toolCall.edits?.items ?? []);
  }
  return edits;
}
function parseFileEdit(fileEdit, mapDiffUri) {
  const normalized = normalizeFileEdit(fileEdit);
  if (!normalized) {
    return void 0;
  }
  const map = (uri) => uri ? mapDiffUri ? mapDiffUri(uri) : uri : void 0;
  return {
    kind: normalized.kind,
    afterUri: map(normalized.afterUri),
    beforeUri: map(normalized.beforeUri),
    beforeContentUri: map(normalized.beforeContentUri),
    insertions: fileEdit.diff?.added ?? 0,
    deletions: fileEdit.diff?.removed ?? 0
  };
}
function reduceSessionFiles(edits, folderRoots) {
  const byUri = /* @__PURE__ */ new Map();
  const isOutsideWorkspace = (uri) => !folderRoots.some((root) => isEqualOrParent(uri, root));
  const setCreated = (uri) => {
    if (!isOutsideWorkspace(uri)) {
      return;
    }
    byUri.set(getComparisonKey(uri), { uri, file: { operation: SessionFileOperation.Created } });
  };
  const setModified = (uri, originalUri) => {
    if (!isOutsideWorkspace(uri)) {
      return;
    }
    const existing = byUri.get(getComparisonKey(uri));
    if (existing?.file.operation === SessionFileOperation.Created) {
      return;
    }
    if (existing?.file.operation === SessionFileOperation.Modified) {
      existing.file.originalUri = existing.file.originalUri ?? originalUri;
      return;
    }
    byUri.set(getComparisonKey(uri), { uri, file: { operation: SessionFileOperation.Modified, originalUri } });
  };
  const removeFile = (uri) => {
    byUri.delete(getComparisonKey(uri));
  };
  for (const edit of edits) {
    switch (edit.kind) {
      case FileEditKind.Create:
        if (edit.afterUri) {
          setCreated(edit.afterUri);
        }
        break;
      case FileEditKind.Edit:
        if (edit.afterUri) {
          setModified(edit.afterUri, edit.beforeContentUri);
        }
        break;
      case FileEditKind.Delete:
        if (edit.beforeUri) {
          removeFile(edit.beforeUri);
        }
        break;
      case FileEditKind.Rename:
        if (edit.beforeUri) {
          removeFile(edit.beforeUri);
        }
        if (edit.afterUri) {
          setCreated(edit.afterUri);
        }
        break;
    }
  }
  const files = [...byUri.values()].map(({ uri, file }) => ({
    uri,
    operation: file.operation,
    originalUri: file.originalUri
  }));
  files.sort((a, b) => strCompare(getComparisonKey(a.uri), getComparisonKey(b.uri)));
  return files;
}
function reduceTurnChanges(edits, folderRoots) {
  const byUri = /* @__PURE__ */ new Map();
  const isInScope = (uri) => folderRoots === void 0 || folderRoots.some((root) => isEqualOrParent(uri, root));
  const setCreated = (uri, insertions, deletions) => {
    if (!isInScope(uri)) {
      return;
    }
    const key = getComparisonKey(uri);
    const existing = byUri.get(key);
    if (existing) {
      existing.created = true;
      existing.modifiedUri = uri;
      existing.originalUri = void 0;
      existing.insertions += insertions;
      existing.deletions += deletions;
      return;
    }
    byUri.set(key, { uri, modifiedUri: uri, originalUri: void 0, created: true, insertions, deletions });
  };
  const setModified = (uri, originalUri, insertions, deletions) => {
    if (!isInScope(uri)) {
      return;
    }
    const key = getComparisonKey(uri);
    const existing = byUri.get(key);
    if (existing) {
      existing.insertions += insertions;
      existing.deletions += deletions;
      if (!existing.created) {
        existing.originalUri = existing.originalUri ?? originalUri;
      }
      return;
    }
    byUri.set(key, { uri, modifiedUri: uri, originalUri, created: false, insertions, deletions });
  };
  const setDeleted = (uri, originalUri, insertions, deletions) => {
    if (!isInScope(uri)) {
      return;
    }
    const key = getComparisonKey(uri);
    if (byUri.has(key)) {
      byUri.delete(key);
      return;
    }
    byUri.set(key, { uri, modifiedUri: void 0, originalUri, created: false, insertions, deletions });
  };
  for (const edit of edits) {
    switch (edit.kind) {
      case FileEditKind.Create:
        if (edit.afterUri) {
          setCreated(edit.afterUri, edit.insertions, edit.deletions);
        }
        break;
      case FileEditKind.Edit:
        if (edit.afterUri) {
          setModified(edit.afterUri, edit.beforeContentUri, edit.insertions, edit.deletions);
        }
        break;
      case FileEditKind.Delete:
        if (edit.beforeUri) {
          setDeleted(edit.beforeUri, edit.beforeContentUri, edit.insertions, edit.deletions);
        }
        break;
      case FileEditKind.Rename:
        if (edit.beforeUri) {
          byUri.delete(getComparisonKey(edit.beforeUri));
        }
        if (edit.afterUri) {
          setModified(edit.afterUri, edit.beforeContentUri, edit.insertions, edit.deletions);
        }
        break;
    }
  }
  return [...byUri.values()].map((c) => ({
    uri: c.uri,
    modifiedUri: c.modifiedUri,
    originalUri: c.originalUri,
    insertions: c.insertions,
    deletions: c.deletions
  }));
}
function sessionFilesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].operation !== b[i].operation || !isEqual(a[i].uri, b[i].uri) || !isEqual(a[i].originalUri, b[i].originalUri)) {
      return false;
    }
  }
  return true;
}
function parsedFileEditsEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].kind !== b[i].kind || a[i].insertions !== b[i].insertions || a[i].deletions !== b[i].deletions || !isEqual(a[i].afterUri, b[i].afterUri) || !isEqual(a[i].beforeUri, b[i].beforeUri) || !isEqual(a[i].beforeContentUri, b[i].beforeContentUri)) {
      return false;
    }
  }
  return true;
}
function chatFileEditsEqual(a, b) {
  return parsedFileEditsEqual(a.allEdits, b.allEdits) && parsedFileEditsEqual(a.lastTurnEdits, b.lastTurnEdits);
}
export {
  createIncrementalChatFileEditsParser,
  createSessionOutputObs,
  parseResponseParts,
  reduceSessionFiles,
  reduceTurnChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC9icm93c2VyL2FnZW50SG9zdFNlc3Npb25GaWxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgYXMgc3RyQ29tcGFyZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgZ2V0Q29tcGFyaXNvbktleSwgaXNFcXVhbCwgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVGaWxlRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vZmlsZUVkaXREaWZmLmpzJztcbmltcG9ydCB0eXBlIHsgRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkRGVmYXVsdENoYXRVcmksXG5cdHR5cGUgQ2hhdFN0YXRlLFxuXHRGaWxlRWRpdEtpbmQsXG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdHR5cGUgU2Vzc2lvblN0YXRlLFxuXHRTdGF0ZUNvbXBvbmVudHMsXG5cdHR5cGUgVHVybixcblx0dHlwZSBUb29sQ2FsbFN0YXRlLFxuXHRUb29sQ2FsbFN0YXR1cyxcblx0VG9vbFJlc3VsdENvbnRlbnRUeXBlLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25GaWxlLCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uRmlsZU9wZXJhdGlvbiwgc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3RpdmVTZXNzaW9uU3Vic2NyaXB0aW9uT2JzIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uQ2hhbmdlc2V0cy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMgfSBmcm9tICcuL2Jhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcblxuLyoqXG4gKiBBIHNpbmdsZSBmaWxlIGVkaXQgZW1pdHRlZCBieSBhIHRvb2wgY2FsbCwgZGVjb2RlZCBmcm9tIHRoZSBwcm90b2NvbCBzbyB0aGVcbiAqIHJlZHVjZXIgY2FuIGNsYXNzaWZ5IGl0LiBPcmRlcmVkIHNvIGNyZWF0aW9ucyBzZWVuIGJlZm9yZSBlZGl0cyBrZWVwIHRoZVxuICogXCJjcmVhdGVkXCIgY2xhc3NpZmljYXRpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlZEZpbGVFZGl0IHtcblx0cmVhZG9ubHkga2luZDogRmlsZUVkaXRLaW5kO1xuXHQvKiogQWZ0ZXItc3RhdGUgVVJJIChjcmVhdGUvZWRpdC9yZW5hbWUgdGFyZ2V0KS4gKi9cblx0cmVhZG9ubHkgYWZ0ZXJVcmk/OiBVUkk7XG5cdC8qKiBCZWZvcmUtc3RhdGUgVVJJIChkZWxldGUgc291cmNlIC8gcmVuYW1lIG9yaWdpbikuICovXG5cdHJlYWRvbmx5IGJlZm9yZVVyaT86IFVSSTtcblx0LyoqIEJlZm9yZS1jb250ZW50IFVSSSwgdXNlZCB0byByZW5kZXIgYSBkaWZmIGZvciBtb2RpZmllZCBmaWxlcy4gKi9cblx0cmVhZG9ubHkgYmVmb3JlQ29udGVudFVyaT86IFVSSTtcblx0LyoqIExpbmVzIGFkZGVkIGJ5IHRoaXMgZWRpdCwgZnJvbSB0aGUgcHJvdG9jb2wgZGlmZiBtZXRhZGF0YSAoMCB3aGVuIGFic2VudCkuICovXG5cdHJlYWRvbmx5IGluc2VydGlvbnM6IG51bWJlcjtcblx0LyoqIExpbmVzIHJlbW92ZWQgYnkgdGhpcyBlZGl0LCBmcm9tIHRoZSBwcm90b2NvbCBkaWZmIG1ldGFkYXRhICgwIHdoZW4gYWJzZW50KS4gKi9cblx0cmVhZG9ubHkgZGVsZXRpb25zOiBudW1iZXI7XG59XG5cbi8qKlxuICogVGhlIG9ic2VydmFibGUgb3V0cHV0cyBkZXJpdmVkIGZyb20gYW4gYWdlbnQtaG9zdCBzZXNzaW9uJ3MgbGl2ZSBvdXRwdXRcbiAqIHN0cmVhbSAoaXRzIGNoYXQtc3RhdGUgdHVybnMpLiBCb3RoIGFyZSBwYXJzZWQgZnJvbSB0aGUgc2FtZSB1bmRlcmx5aW5nXG4gKiBwZXItY2hhdCBzdWJzY3JpcHRpb25zIHNvIHRoZSBzdHJlYW0gaXMgb25seSB3YWxrZWQgb25jZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbk91dHB1dE9icyB7XG5cdC8qKlxuXHQgKiBGaWxlcyBjcmVhdGVkLCBlZGl0ZWQgb3IgZGVsZXRlZCAqKm91dHNpZGUqKiB0aGUgc2Vzc2lvbiB3b3Jrc3BhY2UgZm9sZGVyc1xuXHQgKiBkdXJpbmcgdGhlIHNlc3Npb24gKGUuZy4gY29uZmlnIGZpbGVzIGluIHRoZSB1c2VyJ3MgaG9tZSBkaXJlY3RvcnkpLFxuXHQgKiByZWR1Y2VkIGFjcm9zcyBldmVyeSBjaGF0IGFuZCB0dXJuLlxuXHQgKi9cblx0cmVhZG9ubHkgZXh0ZXJuYWxGaWxlczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlW10+O1xuXHQvKipcblx0ICogUmV0dXJucyB0aGUgZmlsZSBjaGFuZ2VzIHByb2R1Y2VkIGJ5IGEgc3BlY2lmaWMgY2hhdCdzICoqbGFzdCB0dXJuKiogb25seSxcblx0ICoga2V5ZWQgYnkgdGhhdCBjaGF0J3MgQUhQIGNoYXQgVVJJICh0aGUgZGVmYXVsdCBjaGF0J3Ncblx0ICoge0BsaW5rIGJ1aWxkRGVmYXVsdENoYXRVcml9LCBvciBhIHBlZXIgY2hhdCdzIHByb3RvY29sIHJlc291cmNlKS4gUmVkdWNlc1xuXHQgKiB0aGF0IGNoYXQncyBsYXN0LXR1cm4gZWRpdHMgaW50byBwZXItZmlsZSB7QGxpbmsgSVNlc3Npb25GaWxlQ2hhbmdlIHxcblx0ICogY2hhbmdlc30gKHdpdGggZGlmZiBzdGF0cyksIG1pcnJvcmluZyB0aGUgXCJMYXN0IFR1cm4gQ2hhbmdlc1wiIGNoYW5nZXNldFxuXHQgKiB3aXRob3V0IGRlcGVuZGluZyBvbiBpdCwgYW5kIGV4Y2x1ZGVzIGZpbGVzIG91dHNpZGUgdGhlIHdvcmtzcGFjZS93b3JrdHJlZS5cblx0ICogVXNlZCBieSB0aGUgY2hhdCBpbnB1dCBzdGF0dXMgcGlsbHMgdG8gcmVmbGVjdCBqdXN0IHdoYXQgdGhlIGNoYXQncyBtb3N0XG5cdCAqIHJlY2VudCByZXF1ZXN0IHByb2R1Y2VkLlxuXHQgKi9cblx0Z2V0TGFzdFR1cm5DaGFuZ2VzKGNoYXRVcmk6IFVSSSk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPjtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIG9ic2VydmFibGUgb3V0cHV0cyBkZXJpdmVkIGZyb20gYSBzZXNzaW9uJ3MgbGl2ZSBvdXRwdXQgc3RyZWFtLlxuICpcbiAqIFRoZSBkYXRhIGlzIHBhcnNlZCBmcm9tIHRoZSBhZ2VudC1ob3N0IGNoYXQtc3RhdGUgdHVybnM6IGVhY2ggdHVybidzIHJlc3BvbnNlXG4gKiBwYXJ0cyBhcmUgc2Nhbm5lZCBmb3IgdG9vbCBjYWxscywgYW5kIGVhY2ggdG9vbCBjYWxsJ3MgZmlsZS1lZGl0IHJlc3VsdHMgKGFuZFxuICogcGVuZGluZyBlZGl0cykgYXJlIGNvbGxlY3RlZC4gVHdvIHZpZXdzIGFyZSBwcm9kdWNlZCBmcm9tIHRoZSBzYW1lIHBhcnNlOlxuICpcbiAqIC0ge0BsaW5rIElTZXNzaW9uT3V0cHV0T2JzLmV4dGVybmFsRmlsZXN9OiBlZGl0cyByZWR1Y2VkIHBlciBmaWxlIGFjcm9zcyBhbGxcbiAqICAgY2hhdHMvdHVybnMgc28gdGhhdCBhIGZpbGUgZmlyc3QgY3JlYXRlZCBhbmQgdGhlbiBlZGl0ZWQgaXMgcmVwb3J0ZWQgYXNcbiAqICAge0BsaW5rIFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWR9IHdoaWxlIGEgZGVsZXRlZCBmaWxlIGlzIHJlbW92ZWQ7IG9ubHlcbiAqICAgZmlsZXMgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGZvbGRlcnMgYXJlIGtlcHQuXG4gKiAtIHtAbGluayBJU2Vzc2lvbk91dHB1dE9icy5nZXRMYXN0VHVybkNoYW5nZXN9OiBnaXZlbiBhIGNoYXQncyBBSFAgVVJJLCB0aGF0XG4gKiAgIGNoYXQncyBsYXN0IHR1cm4ncyBpbi13b3Jrc3BhY2Uvd29ya3RyZWUgZWRpdHMgcmVkdWNlZCBwZXIgZmlsZSBpbnRvXG4gKiAgIHtAbGluayBJU2Vzc2lvbkZpbGVDaGFuZ2UgfCBjaGFuZ2VzfSAod2l0aCBkaWZmIHN0YXRzKSwgbWlycm9yaW5nIHRoZVxuICogICBcIkxhc3QgVHVybiBDaGFuZ2VzXCIgY2hhbmdlc2V0IHdpdGhvdXQgZGVwZW5kaW5nIG9uIGl0LlxuICogQ29tcHV0YXRpb24gb25seSBoYXBwZW5zIGZvciB0aGUgYWN0aXZlLCBub24tYXJjaGl2ZWQgc2Vzc2lvbjogYXJjaGl2ZWRcbiAqIHNlc3Npb25zIG5ldmVyIG9wZW4gYSBsaXZlIGNoYXQtc3RhdGUgc3Vic2NyaXB0aW9uLCBzbyBubyBwYXJzaW5nIHdvcmsgaXNcbiAqIGRvbmUgZm9yIHRoZW0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uT3V0cHV0T2JzKFxuXHRzZXNzaW9uVXJpOiBVUkksXG5cdG9wdGlvbnM6IElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyxcblx0aXNBY3RpdmVTZXNzaW9uT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0aXNBcmNoaXZlZE9iczogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdHdvcmtzcGFjZU9iczogSU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+LFxuKTogSVNlc3Npb25PdXRwdXRPYnMge1xuXHRjb25zdCBtYXBEaWZmVXJpID0gb3B0aW9ucy5tYXBEaWZmVXJpO1xuXG5cdC8vIFNlc3Npb24gb3V0cHV0IGlzIG9ubHkgY29tcHV0ZWQgZm9yIHRoZSBhY3RpdmUsIG5vbi1hcmNoaXZlZCBzZXNzaW9uLiBUaGVcblx0Ly8gc3Vic2NyaXB0aW9ucyBhbmQgcGFyc2luZyBiZWxvdyBhcmUgYWxsIGdhdGVkIG9uIHRoaXMgc28gYW4gYXJjaGl2ZWRcblx0Ly8gc2Vzc2lvbiBkb2VzIG5vIHdvcmsuXG5cdGNvbnN0IGVuYWJsZWRPYnMgPSBkZXJpdmVkT3B0czxib29sZWFuPih7IGVxdWFsc0ZuOiAoYSwgYikgPT4gYSA9PT0gYiB9LCByZWFkZXIgPT5cblx0XHRpc0FjdGl2ZVNlc3Npb25PYnMucmVhZChyZWFkZXIpICYmICFpc0FyY2hpdmVkT2JzLnJlYWQocmVhZGVyKSk7XG5cblx0Ly8gU3Vic2NyaWJlIHRvIHRoZSBzZXNzaW9uIHRvIGRpc2NvdmVyIGl0cyBjaGF0cy5cblx0Y29uc3Qgc2Vzc2lvblN0YXRlT2JzID0gY3JlYXRlQWN0aXZlU2Vzc2lvblN1YnNjcmlwdGlvbk9iczxTZXNzaW9uU3RhdGU+KFxuXHRcdG9wdGlvbnMsXG5cdFx0ZW5hYmxlZE9icyxcblx0XHRTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbixcblx0XHRjb25zdE9ic2VydmFibGUoc2Vzc2lvblVyaSksXG5cdCk7XG5cblx0Ly8gQWxsIGNoYXQgVVJJcyBpbiB0aGUgc2Vzc2lvbiAoZGVmYXVsdCBjaGF0ICsgYW55IHBlZXIgY2hhdHMpLiBGaWxlIGVkaXRzXG5cdC8vIGNhbiBiZSBwcm9kdWNlZCBieSBhbnkgY2hhdCwgc28gd2UgdW5pb24gZWRpdHMgYWNyb3NzIGFsbCBvZiB0aGVtLlxuXHRjb25zdCBjaGF0VXJpc09icyA9IGRlcml2ZWRPcHRzPHJlYWRvbmx5IFVSSVtdPih7IGVxdWFsc0ZuOiAoYSwgYikgPT4gYS5sZW5ndGggPT09IGIubGVuZ3RoICYmIGEuZXZlcnkoKHUsIGkpID0+IGlzRXF1YWwodSwgYltpXSkpIH0sIHJlYWRlciA9PiB7XG5cdFx0aWYgKCFlbmFibGVkT2JzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSBzZXNzaW9uU3RhdGVPYnMucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRpZiAoIXNlc3Npb25TdGF0ZSB8fCBzZXNzaW9uU3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0cmV0dXJuIFtkZWZhdWx0Q2hhdFVyaV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpcyA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cdFx0dXJpcy5zZXQoZGVmYXVsdENoYXRVcmkudG9TdHJpbmcoKSwgZGVmYXVsdENoYXRVcmkpO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBzZXNzaW9uU3RhdGUuY2hhdHMpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShjaGF0LnJlc291cmNlKTtcblx0XHRcdHVyaXMuc2V0KHVyaS50b1N0cmluZygpLCB1cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLnVyaXMudmFsdWVzKCldO1xuXHR9KTtcblxuXHQvLyBPbmUgb2JzZXJ2YWJsZSBvZiBwYXJzZWQgZWRpdHMgcGVyIGNoYXQsIHN1YnNjcmliaW5nIHRvIHRoYXQgY2hhdCdzIHN0YXRlLlxuXHQvL1xuXHQvLyBDb21wbGV0ZWQgdHVybnMgKGBjaGF0U3RhdGUudHVybnNgKSBhcmUgaW1tdXRhYmxlIG9uY2UgZmluYWxpemVkLCBzbyBlYWNoXG5cdC8vIGlzIHBhcnNlZCBleGFjdGx5IG9uY2UgYW5kIG1lbW9pemVkIGJ5IHR1cm4gaWQgaW4gYSBjbG9zdXJlLXNjb3BlZCBjYWNoZVxuXHQvLyB0aGF0IGxpdmVzIGZvciB0aGUgY2hhdCdzIGxpZmV0aW1lLiBPbmx5IHRoZSBpbi1wcm9ncmVzcyBgYWN0aXZlVHVybmAgaXNcblx0Ly8gcmUtcGFyc2VkIG9uIGV2ZXJ5IHN0cmVhbWVkIGRlbHRhLCBtYWtpbmcgZGVsdGEgdXBkYXRlcyBPKGFjdGl2ZSB0dXJuKVxuXHQvLyByYXRoZXIgdGhhbiBPKGFsbCB0dXJucykuIFRoZSBgZXF1YWxzRm5gIGVuc3VyZXMgdGhlIGRvd25zdHJlYW0gcmVkdWNlcnNcblx0Ly8gb25seSByZS1ydW4gd2hlbiB0aGUgcGFyc2VkIGVkaXRzIGFjdHVhbGx5IGNoYW5nZSAoZS5nLiBub3QgZm9yIG1hcmtkb3duXG5cdC8vIG9yIHJlYXNvbmluZyBkZWx0YXMgdGhhdCBjYXJyeSBubyBmaWxlIGVkaXRzKS5cblx0Y29uc3QgZWRpdHNQZXJDaGF0T2JzID0gbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkKHVuZGVmaW5lZCwgY2hhdFVyaXNPYnMsIChjaGF0VXJpKSA9PiB7XG5cdFx0Y29uc3QgY2hhdFN0YXRlT2JzID0gY3JlYXRlQWN0aXZlU2Vzc2lvblN1YnNjcmlwdGlvbk9iczxDaGF0U3RhdGU+KFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGVuYWJsZWRPYnMsXG5cdFx0XHRTdGF0ZUNvbXBvbmVudHMuQ2hhdCxcblx0XHRcdGNvbnN0T2JzZXJ2YWJsZShjaGF0VXJpKSxcblx0XHQpO1xuXHRcdGNvbnN0IHBhcnNlID0gY3JlYXRlSW5jcmVtZW50YWxDaGF0RmlsZUVkaXRzUGFyc2VyKG1hcERpZmZVcmkpO1xuXHRcdHJldHVybiBkZXJpdmVkT3B0czxJQ2hhdEZpbGVFZGl0cyAmIHsgcmVhZG9ubHkgY2hhdFVyaTogVVJJIH0+KHsgZXF1YWxzRm46IChhLCBiKSA9PiBpc0VxdWFsKGEuY2hhdFVyaSwgYi5jaGF0VXJpKSAmJiBjaGF0RmlsZUVkaXRzRXF1YWwoYSwgYikgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGNoYXRTdGF0ZU9icy5yZWFkKHJlYWRlcikucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjaGF0U3RhdGUgfHwgY2hhdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHsgY2hhdFVyaSwgYWxsRWRpdHM6IFtdLCBsYXN0VHVybkVkaXRzOiBbXSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgY2hhdFVyaSwgLi4ucGFyc2UoY2hhdFN0YXRlKSB9O1xuXHRcdH0pO1xuXHR9LCBjaGF0VXJpID0+IGNoYXRVcmkudG9TdHJpbmcoKSk7XG5cblx0Y29uc3QgZXh0ZXJuYWxGaWxlcyA9IGRlcml2ZWRPcHRzPHJlYWRvbmx5IElTZXNzaW9uRmlsZVtdPih7IGVxdWFsc0ZuOiBzZXNzaW9uRmlsZXNFcXVhbCB9LCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHdvcmtzcGFjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZm9sZGVyUm9vdHMgPSAod29ya3NwYWNlPy5mb2xkZXJzID8/IFtdKS5tYXAoZiA9PiBmLndvcmtpbmdEaXJlY3RvcnkpO1xuXG5cdFx0Y29uc3QgYWxsRWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGF0RWRpdHNPYnMgb2YgZWRpdHNQZXJDaGF0T2JzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0YWxsRWRpdHMucHVzaCguLi5jaGF0RWRpdHNPYnMucmVhZChyZWFkZXIpLmFsbEVkaXRzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVkdWNlU2Vzc2lvbkZpbGVzKGFsbEVkaXRzLCBmb2xkZXJSb290cyk7XG5cdH0pO1xuXG5cdGNvbnN0IGdldExhc3RUdXJuQ2hhbmdlcyA9IChjaGF0VXJpOiBVUkkpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4gPT5cblx0XHRkZXJpdmVkT3B0czxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4oeyBlcXVhbHNGbjogc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclJvb3RzID0gZ2V0V29ya3NwYWNlQW5kV29ya3RyZWVSb290cyh3b3Jrc3BhY2VPYnMucmVhZChyZWFkZXIpKTtcblx0XHRcdGZvciAoY29uc3QgY2hhdEVkaXRzT2JzIG9mIGVkaXRzUGVyQ2hhdE9icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0Y29uc3QgY2hhdEVkaXRzID0gY2hhdEVkaXRzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKGlzRXF1YWwoY2hhdEVkaXRzLmNoYXRVcmksIGNoYXRVcmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlZHVjZVR1cm5DaGFuZ2VzKGNoYXRFZGl0cy5sYXN0VHVybkVkaXRzLCBmb2xkZXJSb290cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9KTtcblxuXHRyZXR1cm4geyBleHRlcm5hbEZpbGVzLCBnZXRMYXN0VHVybkNoYW5nZXMgfTtcbn1cblxuLyoqXG4gKiBNaW5pbWFsIHNoYXBlIG9mIGEgdHVybiBuZWVkZWQgdG8gcGFyc2UgaXRzIGZpbGUgZWRpdHMuIHtAbGluayBUdXJufSBpc1xuICogc3RydWN0dXJhbGx5IGFzc2lnbmFibGUgdG8gdGhpcywgc28gcHJvZHVjdGlvbiBwYXNzZXMgYSByZWFsIGBDaGF0U3RhdGVgXG4gKiB3aGlsZSB0ZXN0cyBjYW4gYnVpbGQgbGlnaHR3ZWlnaHQgZml4dHVyZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVFZGl0VHVybiB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3BvbnNlUGFydHM6IFR1cm5bJ3Jlc3BvbnNlUGFydHMnXTtcbn1cblxuLyoqIEEgY2hhdCBzdGF0ZSByZWR1Y2VkIHRvIGp1c3QgdGhlIGZpZWxkcyBuZWVkZWQgdG8gcGFyc2UgaXRzIGZpbGUgZWRpdHMuICovXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlRWRpdENoYXRTdGF0ZSB7XG5cdHJlYWRvbmx5IHR1cm5zPzogcmVhZG9ubHkgSUZpbGVFZGl0VHVybltdO1xuXHRyZWFkb25seSBhY3RpdmVUdXJuPzogeyByZWFkb25seSByZXNwb25zZVBhcnRzOiBUdXJuWydyZXNwb25zZVBhcnRzJ10gfTtcbn1cblxuLyoqIFBhcnNlcyB0aGUgZmlsZSBlZGl0cyBjb250YWluZWQgaW4gYSBzaW5nbGUgdHVybidzIHJlc3BvbnNlIHBhcnRzLiAqL1xuZXhwb3J0IHR5cGUgUGFyc2VUdXJuRmlsZUVkaXRzID0gKHJlc3BvbnNlUGFydHM6IFR1cm5bJ3Jlc3BvbnNlUGFydHMnXSkgPT4gcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W107XG5cbi8qKlxuICogVGhlIGZpbGUgZWRpdHMgcGFyc2VkIGZyb20gYSBjaGF0J3Mgb3V0cHV0IHN0cmVhbSwgc3BsaXQgaW50byB0aGUgZnVsbCBzZXRcbiAqIChhY3Jvc3MgYWxsIHR1cm5zKSBhbmQgdGhlIGxhc3QgdHVybidzIGVkaXRzIGFsb25lLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0RmlsZUVkaXRzIHtcblx0LyoqIEFsbCBmaWxlIGVkaXRzIGFjcm9zcyB0aGUgY2hhdCdzIHR1cm5zLCBpbiBzdHJlYW0gb3JkZXIuICovXG5cdHJlYWRvbmx5IGFsbEVkaXRzOiByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXTtcblx0LyoqXG5cdCAqIEZpbGUgZWRpdHMgb2YgdGhlIGNoYXQncyBsYXN0IHR1cm4gb25seSBcdTIwMTQgdGhlIGluLXByb2dyZXNzIGBhY3RpdmVUdXJuYCB3aGVuXG5cdCAqIHByZXNlbnQsIG90aGVyd2lzZSB0aGUgbW9zdCByZWNlbnRseSBjb21wbGV0ZWQgdHVybi5cblx0ICovXG5cdHJlYWRvbmx5IGxhc3RUdXJuRWRpdHM6IHJlYWRvbmx5IElQYXJzZWRGaWxlRWRpdFtdO1xufVxuXG5mdW5jdGlvbiBwdXNoVW5pcXVlUm9vdChyb290czogVVJJW10sIHJvb3Q6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAocm9vdCAmJiAhcm9vdHMuc29tZShleGlzdGluZyA9PiBpc0VxdWFsKGV4aXN0aW5nLCByb290KSkpIHtcblx0XHRyb290cy5wdXNoKHJvb3QpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFdvcmtzcGFjZUFuZFdvcmt0cmVlUm9vdHMod29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0Y29uc3Qgcm9vdHM6IFVSSVtdID0gW107XG5cdGZvciAoY29uc3QgZm9sZGVyIG9mIHdvcmtzcGFjZT8uZm9sZGVycyA/PyBbXSkge1xuXHRcdHB1c2hVbmlxdWVSb290KHJvb3RzLCBmb2xkZXIucm9vdCk7XG5cdFx0cHVzaFVuaXF1ZVJvb3Qocm9vdHMsIGZvbGRlci53b3JraW5nRGlyZWN0b3J5KTtcblx0XHRwdXNoVW5pcXVlUm9vdChyb290cywgZm9sZGVyLmdpdFJlcG9zaXRvcnk/LndvcmtUcmVlVXJpKTtcblx0fVxuXHRyZXR1cm4gcm9vdHM7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0YXRlZnVsIHBhcnNlciB0aGF0IHR1cm5zIGEgY2hhdCBzdGF0ZSBpbnRvIGl0cyBmaWxlIGVkaXRzLFxuICogKipwYXJzaW5nIGVhY2ggY29tcGxldGVkIHR1cm4gYXQgbW9zdCBvbmNlKiouXG4gKlxuICogQ29tcGxldGVkIHR1cm5zIChgY2hhdFN0YXRlLnR1cm5zYCkgYXJlIGltbXV0YWJsZSBvbmNlIGZpbmFsaXplZCwgc28gZWFjaCBpc1xuICogcGFyc2VkIG9uY2UgYW5kIG1lbW9pemVkIGJ5IHR1cm4gaWQgaW4gdGhlIHJldHVybmVkIGNsb3N1cmUuIE9ubHkgdGhlXG4gKiBpbi1wcm9ncmVzcyBgYWN0aXZlVHVybmAgaXMgcmUtcGFyc2VkIG9uIGV2ZXJ5IGNhbGwsIG1ha2luZyBzdHJlYW1lZC1kZWx0YVxuICogdXBkYXRlcyBPKGFjdGl2ZSB0dXJuKSByYXRoZXIgdGhhbiBPKGFsbCB0dXJucykuXG4gKlxuICogUmV0dXJucyBib3RoIHRoZSBmdWxsIGVkaXQgbGlzdCAoZm9yIHNlc3Npb24td2lkZSByZWR1Y3Rpb25zKSBhbmQgdGhlIGxhc3RcbiAqIHR1cm4ncyBlZGl0cyBhbG9uZSAoZm9yIHR1cm4tc2NvcGVkIHJlZHVjdGlvbnMpOyB0aGUgYWN0aXZlIHR1cm4gaXMgcGFyc2VkXG4gKiBvbmNlIGFuZCByZXVzZWQgZm9yIGJvdGguXG4gKlxuICogQHBhcmFtIG1hcERpZmZVcmkgT3B0aW9uYWwgVVJJIG1hcHBlciBhcHBsaWVkIHdoaWxlIHBhcnNpbmcuXG4gKiBAcGFyYW0gcGFyc2VUdXJuIFBlci10dXJuIHBhcnNlIGZ1bmN0aW9uLiBEZWZhdWx0cyB0byB7QGxpbmsgcGFyc2VSZXNwb25zZVBhcnRzfTtcbiAqICAgaW5qZWN0YWJsZSBzbyB0ZXN0cyBjYW4gb2JzZXJ2ZSBob3cgb2Z0ZW4gZWFjaCB0dXJuIGlzIChyZSlwYXJzZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbmNyZW1lbnRhbENoYXRGaWxlRWRpdHNQYXJzZXIoXG5cdG1hcERpZmZVcmk/OiAodXJpOiBVUkkpID0+IFVSSSxcblx0cGFyc2VUdXJuOiBQYXJzZVR1cm5GaWxlRWRpdHMgPSByZXNwb25zZVBhcnRzID0+IHBhcnNlUmVzcG9uc2VQYXJ0cyhyZXNwb25zZVBhcnRzLCBtYXBEaWZmVXJpKSxcbik6IChjaGF0U3RhdGU6IElGaWxlRWRpdENoYXRTdGF0ZSkgPT4gSUNoYXRGaWxlRWRpdHMge1xuXHRjb25zdCBjb21wbGV0ZWRUdXJuQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W10+KCk7XG5cblx0cmV0dXJuIChjaGF0U3RhdGU6IElGaWxlRWRpdENoYXRTdGF0ZSk6IElDaGF0RmlsZUVkaXRzID0+IHtcblx0XHRjb25zdCBhbGxFZGl0czogSVBhcnNlZEZpbGVFZGl0W10gPSBbXTtcblx0XHRjb25zdCB0dXJuczogcmVhZG9ubHkgSUZpbGVFZGl0VHVybltdID0gY2hhdFN0YXRlLnR1cm5zID8/IFtdO1xuXG5cdFx0Ly8gRXZpY3QgY2FjaGUgZW50cmllcyBmb3IgdHVybnMgdGhhdCBhcmUgbm8gbG9uZ2VyIGNvbXBsZXRlZCAoZS5nLiBhIHR1cm5cblx0XHQvLyB0aGF0IG1vdmVkIGJhY2sgdG8gYGFjdGl2ZVR1cm5gLCBvciBhIGRpc2NhcmRlZCB0dXJuKSBzbyB0aGUgY2FjaGUgY2FuJ3Rcblx0XHQvLyBncm93IHVuYm91bmRlZCBvciByZXR1cm4gc3RhbGUgZGF0YS5cblx0XHRjb25zdCBjb21wbGV0ZWRJZHMgPSBuZXcgU2V0KHR1cm5zLm1hcCh0ID0+IHQuaWQpKTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGNvbXBsZXRlZFR1cm5DYWNoZS5rZXlzKCkpIHtcblx0XHRcdGlmICghY29tcGxldGVkSWRzLmhhcyhpZCkpIHtcblx0XHRcdFx0Y29tcGxldGVkVHVybkNhY2hlLmRlbGV0ZShpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG5cdFx0XHRsZXQgcGFyc2VkID0gY29tcGxldGVkVHVybkNhY2hlLmdldCh0dXJuLmlkKTtcblx0XHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRcdHBhcnNlZCA9IHBhcnNlVHVybih0dXJuLnJlc3BvbnNlUGFydHMpO1xuXHRcdFx0XHRjb21wbGV0ZWRUdXJuQ2FjaGUuc2V0KHR1cm4uaWQsIHBhcnNlZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFyc2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0YWxsRWRpdHMucHVzaCguLi5wYXJzZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRoZSBsYXN0IHR1cm4gaXMgdGhlIGluLXByb2dyZXNzIG9uZSB3aGVuIHN0cmVhbWluZywgZWxzZSB0aGUgbW9zdFxuXHRcdC8vIHJlY2VudGx5IGNvbXBsZXRlZCB0dXJuLiBUaGUgYWN0aXZlIHR1cm4gaXMgcGFyc2VkIGEgc2luZ2xlIHRpbWUgYW5kXG5cdFx0Ly8gcmV1c2VkIGZvciBib3RoIGBhbGxFZGl0c2AgYW5kIGBsYXN0VHVybkVkaXRzYC5cblx0XHRsZXQgbGFzdFR1cm5FZGl0czogcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W107XG5cdFx0aWYgKGNoYXRTdGF0ZS5hY3RpdmVUdXJuKSB7XG5cdFx0XHRsYXN0VHVybkVkaXRzID0gcGFyc2VUdXJuKGNoYXRTdGF0ZS5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMpO1xuXHRcdFx0YWxsRWRpdHMucHVzaCguLi5sYXN0VHVybkVkaXRzKTtcblx0XHR9IGVsc2UgaWYgKHR1cm5zLmxlbmd0aCA+IDApIHtcblx0XHRcdGxhc3RUdXJuRWRpdHMgPSBjb21wbGV0ZWRUdXJuQ2FjaGUuZ2V0KHR1cm5zW3R1cm5zLmxlbmd0aCAtIDFdLmlkKSA/PyBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFzdFR1cm5FZGl0cyA9IFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGFsbEVkaXRzLCBsYXN0VHVybkVkaXRzIH07XG5cdH07XG59XG5cbi8qKiBQYXJzZXMgdGhlIGZpbGUgZWRpdHMgY29udGFpbmVkIGluIGEgdHVybidzIHJlc3BvbnNlIHBhcnRzIChzdGF0ZWxlc3MpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmVzcG9uc2VQYXJ0cyhyZXNwb25zZVBhcnRzOiBUdXJuWydyZXNwb25zZVBhcnRzJ10sIG1hcERpZmZVcmk/OiAodXJpOiBVUkkpID0+IFVSSSk6IElQYXJzZWRGaWxlRWRpdFtdIHtcblx0Y29uc3Qgb3V0OiBJUGFyc2VkRmlsZUVkaXRbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2VQYXJ0cykge1xuXHRcdGlmIChwYXJ0LmtpbmQgIT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGZpbGVFZGl0IG9mIGdldFRvb2xDYWxsRmlsZUVkaXRzKHBhcnQudG9vbENhbGwpKSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUZpbGVFZGl0KGZpbGVFZGl0LCBtYXBEaWZmVXJpKTtcblx0XHRcdGlmIChwYXJzZWQpIHtcblx0XHRcdFx0b3V0LnB1c2gocGFyc2VkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuLyoqXG4gKiBsaWZlY3ljbGUgc3RhdGU6IGNvbXBsZXRlZC9ydW5uaW5nIHJlc3VsdHMgY2FycnkgdGhlbSBpbiBgY29udGVudGAsIHdoaWxlIGFcbiAqIHRvb2wgY2FsbCBhd2FpdGluZyBjb25maXJtYXRpb24gY2FycmllcyB0aGUgcGxhbm5lZCBlZGl0cyBpbiBgZWRpdHMuaXRlbXNgLlxuICovXG5mdW5jdGlvbiBnZXRUb29sQ2FsbEZpbGVFZGl0cyh0b29sQ2FsbDogVG9vbENhbGxTdGF0ZSk6IEZpbGVFZGl0W10ge1xuXHRjb25zdCBlZGl0czogRmlsZUVkaXRbXSA9IFtdO1xuXG5cdC8vIENvbXBsZXRlZC9ydW5uaW5nIHJlc3VsdHMgY2FycnkgZmlsZSBlZGl0cyBpbiBgY29udGVudGAuLi5cblx0aWYgKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZ1xuXHRcdHx8IHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkXG5cdFx0fHwgdG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uKSB7XG5cdFx0Zm9yIChjb25zdCBjIG9mIHRvb2xDYWxsLmNvbnRlbnQgPz8gW10pIHtcblx0XHRcdGlmIChjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCkge1xuXHRcdFx0XHRlZGl0cy5wdXNoKGMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIGlmICh0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pIHtcblx0XHQvLyAuLi53aGlsZSBhIHRvb2wgY2FsbCBhd2FpdGluZyBjb25maXJtYXRpb24gY2FycmllcyB0aGUgcGxhbm5lZCBlZGl0cy5cblx0XHRlZGl0cy5wdXNoKC4uLih0b29sQ2FsbC5lZGl0cz8uaXRlbXMgPz8gW10pKTtcblx0fVxuXG5cdHJldHVybiBlZGl0cztcbn1cblxuZnVuY3Rpb24gcGFyc2VGaWxlRWRpdChmaWxlRWRpdDogRmlsZUVkaXQsIG1hcERpZmZVcmk/OiAodXJpOiBVUkkpID0+IFVSSSk6IElQYXJzZWRGaWxlRWRpdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVGaWxlRWRpdChmaWxlRWRpdCk7XG5cdGlmICghbm9ybWFsaXplZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbWFwID0gKHVyaTogVVJJIHwgdW5kZWZpbmVkKTogVVJJIHwgdW5kZWZpbmVkID0+IHVyaSA/IChtYXBEaWZmVXJpID8gbWFwRGlmZlVyaSh1cmkpIDogdXJpKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBub3JtYWxpemVkLmtpbmQsXG5cdFx0YWZ0ZXJVcmk6IG1hcChub3JtYWxpemVkLmFmdGVyVXJpKSxcblx0XHRiZWZvcmVVcmk6IG1hcChub3JtYWxpemVkLmJlZm9yZVVyaSksXG5cdFx0YmVmb3JlQ29udGVudFVyaTogbWFwKG5vcm1hbGl6ZWQuYmVmb3JlQ29udGVudFVyaSksXG5cdFx0aW5zZXJ0aW9uczogZmlsZUVkaXQuZGlmZj8uYWRkZWQgPz8gMCxcblx0XHRkZWxldGlvbnM6IGZpbGVFZGl0LmRpZmY/LnJlbW92ZWQgPz8gMCxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElNdXRhYmxlU2Vzc2lvbkZpbGUge1xuXHRvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uO1xuXHRvcmlnaW5hbFVyaT86IFVSSTtcbn1cblxuLyoqXG4gKiBSZWR1Y2VzIGFuIG9yZGVyZWQgbGlzdCBvZiBwYXJzZWQgZmlsZSBlZGl0cyBpbnRvIHRoZSBmaW5hbCBwZXItZmlsZSBzdGF0ZS5cbiAqXG4gKiBSdWxlczpcbiAqIC0gQSBmaWxlIGNyZWF0ZWQgZHVyaW5nIHRoZSBzZXNzaW9uIHN0YXlzIHtAbGluayBTZXNzaW9uRmlsZU9wZXJhdGlvbi5DcmVhdGVkfVxuICogICBldmVuIGlmIGVkaXRlZCBhZnRlcndhcmRzLlxuICogLSBBIGRlbGV0ZWQgZmlsZSBpcyByZW1vdmVkIGZyb20gdGhlIGxpc3QgZW50aXJlbHk6IGEgZmlsZSBjcmVhdGVkIG9yIGVkaXRlZFxuICogICBkdXJpbmcgdGhlIHNlc3Npb24gYW5kIHRoZW4gZGVsZXRlZCBuZXRzIG91dCwgYW5kIGEgcHJlLWV4aXN0aW5nIGZpbGUgdGhhdFxuICogICBpcyBkZWxldGVkIGlzIG5vdCBzdXJmYWNlZC5cbiAqIC0gUmVuYW1lcyBhcmUgbW9kZWxlZCBhcyBhIGRlbGV0ZSBvZiB0aGUgc291cmNlIHBsdXMgYSBjcmVhdGUgb2YgdGhlIHRhcmdldC5cbiAqIC0gT25seSBmaWxlcyBvdXRzaWRlIGV2ZXJ5IHdvcmtzcGFjZSBmb2xkZXIgcm9vdCBhcmUga2VwdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZHVjZVNlc3Npb25GaWxlcyhlZGl0czogcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W10sIGZvbGRlclJvb3RzOiByZWFkb25seSBVUklbXSk6IElTZXNzaW9uRmlsZVtdIHtcblx0Y29uc3QgYnlVcmkgPSBuZXcgTWFwPHN0cmluZywgeyB1cmk6IFVSSTsgZmlsZTogSU11dGFibGVTZXNzaW9uRmlsZSB9PigpO1xuXG5cdGNvbnN0IGlzT3V0c2lkZVdvcmtzcGFjZSA9ICh1cmk6IFVSSSk6IGJvb2xlYW4gPT5cblx0XHQhZm9sZGVyUm9vdHMuc29tZShyb290ID0+IGlzRXF1YWxPclBhcmVudCh1cmksIHJvb3QpKTtcblxuXHRjb25zdCBzZXRDcmVhdGVkID0gKHVyaTogVVJJKTogdm9pZCA9PiB7XG5cdFx0aWYgKCFpc091dHNpZGVXb3Jrc3BhY2UodXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRieVVyaS5zZXQoZ2V0Q29tcGFyaXNvbktleSh1cmkpLCB7IHVyaSwgZmlsZTogeyBvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQgfSB9KTtcblx0fTtcblxuXHRjb25zdCBzZXRNb2RpZmllZCA9ICh1cmk6IFVSSSwgb3JpZ2luYWxVcmk6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQgPT4ge1xuXHRcdGlmICghaXNPdXRzaWRlV29ya3NwYWNlKHVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBieVVyaS5nZXQoZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHRpZiAoZXhpc3Rpbmc/LmZpbGUub3BlcmF0aW9uID09PSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5DcmVhdGVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIGNyZWF0ZWQtdGhlbi1lZGl0ZWQgc3RheXMgY3JlYXRlZFxuXHRcdH1cblx0XHRpZiAoZXhpc3Rpbmc/LmZpbGUub3BlcmF0aW9uID09PSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCkge1xuXHRcdFx0Ly8gS2VlcCB0aGUgZWFybGllc3Qga25vd24gb3JpZ2luYWwgY29udGVudCBmb3IgdGhlIGRpZmYuXG5cdFx0XHRleGlzdGluZy5maWxlLm9yaWdpbmFsVXJpID0gZXhpc3RpbmcuZmlsZS5vcmlnaW5hbFVyaSA/PyBvcmlnaW5hbFVyaTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YnlVcmkuc2V0KGdldENvbXBhcmlzb25LZXkodXJpKSwgeyB1cmksIGZpbGU6IHsgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCwgb3JpZ2luYWxVcmkgfSB9KTtcblx0fTtcblxuXHQvLyBBIGRlbGV0ZSByZW1vdmVzIHRoZSBmaWxlIGZyb20gdGhlIGxpc3QgZW50aXJlbHkgcmF0aGVyIHRoYW4gc3VyZmFjaW5nIGl0XG5cdC8vIGFzIGEgZGVsZXRlZCBlbnRyeTogYSBjcmVhdGUvZWRpdCBmb2xsb3dlZCBieSBhIGRlbGV0ZSBuZXRzIG91dCwgYW5kIGFcblx0Ly8gcHJlLWV4aXN0aW5nIGRlbGV0ZWQgZmlsZSBzaW1wbHkgbmV2ZXIgYXBwZWFycy5cblx0Y29uc3QgcmVtb3ZlRmlsZSA9ICh1cmk6IFVSSSk6IHZvaWQgPT4ge1xuXHRcdGJ5VXJpLmRlbGV0ZShnZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXHR9O1xuXG5cdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdHN3aXRjaCAoZWRpdC5raW5kKSB7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5DcmVhdGU6XG5cdFx0XHRcdGlmIChlZGl0LmFmdGVyVXJpKSB7XG5cdFx0XHRcdFx0c2V0Q3JlYXRlZChlZGl0LmFmdGVyVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkVkaXQ6XG5cdFx0XHRcdGlmIChlZGl0LmFmdGVyVXJpKSB7XG5cdFx0XHRcdFx0c2V0TW9kaWZpZWQoZWRpdC5hZnRlclVyaSwgZWRpdC5iZWZvcmVDb250ZW50VXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkRlbGV0ZTpcblx0XHRcdFx0aWYgKGVkaXQuYmVmb3JlVXJpKSB7XG5cdFx0XHRcdFx0cmVtb3ZlRmlsZShlZGl0LmJlZm9yZVVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5SZW5hbWU6XG5cdFx0XHRcdGlmIChlZGl0LmJlZm9yZVVyaSkge1xuXHRcdFx0XHRcdHJlbW92ZUZpbGUoZWRpdC5iZWZvcmVVcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlZGl0LmFmdGVyVXJpKSB7XG5cdFx0XHRcdFx0c2V0Q3JlYXRlZChlZGl0LmFmdGVyVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRjb25zdCBmaWxlcyA9IFsuLi5ieVVyaS52YWx1ZXMoKV0ubWFwKCh7IHVyaSwgZmlsZSB9KTogSVNlc3Npb25GaWxlID0+ICh7XG5cdFx0dXJpLFxuXHRcdG9wZXJhdGlvbjogZmlsZS5vcGVyYXRpb24sXG5cdFx0b3JpZ2luYWxVcmk6IGZpbGUub3JpZ2luYWxVcmksXG5cdH0pKTtcblxuXHRmaWxlcy5zb3J0KChhLCBiKSA9PiBzdHJDb21wYXJlKGdldENvbXBhcmlzb25LZXkoYS51cmkpLCBnZXRDb21wYXJpc29uS2V5KGIudXJpKSkpO1xuXHRyZXR1cm4gZmlsZXM7XG59XG5cbmludGVyZmFjZSBJTXV0YWJsZVR1cm5DaGFuZ2Uge1xuXHR1cmk6IFVSSTtcblx0bW9kaWZpZWRVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0b3JpZ2luYWxVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgdGhlIGZpbGUgd2FzIGNyZWF0ZWQgZHVyaW5nIHRoZSB0dXJuIChrZXB0IGFjcm9zcyBsYXRlciBlZGl0cykuICovXG5cdGNyZWF0ZWQ6IGJvb2xlYW47XG5cdGluc2VydGlvbnM6IG51bWJlcjtcblx0ZGVsZXRpb25zOiBudW1iZXI7XG59XG5cbi8qKlxuICogUmVkdWNlcyBhIHNpbmdsZSB0dXJuJ3MgcGFyc2VkIGZpbGUgZWRpdHMgaW50byBvbmUge0BsaW5rIElTZXNzaW9uRmlsZUNoYW5nZX1cbiAqIHBlciBmaWxlLCBhZ2dyZWdhdGluZyBkaWZmIHN0YXRzLiBNaXJyb3JzIHRoZSBcIkxhc3QgVHVybiBDaGFuZ2VzXCIgY2hhbmdlc2V0XG4gKiBzbyBjb25zdW1lcnMgKGUuZy4gdGhlIGNoYXQgaW5wdXQgc3RhdHVzIHBpbGxzKSBjYW4gcmVmbGVjdCB0aGUgbGFzdCB0dXJuXG4gKiBzdHJhaWdodCBmcm9tIHRoZSBvdXRwdXQgc3RyZWFtLlxuICpcbiAqIFJ1bGVzOlxuICogLSBSZXBlYXRlZCBlZGl0cyB0byB0aGUgc2FtZSBmaWxlIGNvbGxhcHNlIGludG8gYSBzaW5nbGUgY2hhbmdlIHdob3NlXG4gKiAgIGluc2VydGlvbnMvZGVsZXRpb25zIGFyZSB0aGUgc3VtIG9mIHRoZSBpbmRpdmlkdWFsIGVkaXRzLlxuICogLSBBIGZpbGUgY3JlYXRlZCBkdXJpbmcgdGhlIHR1cm4gc3RheXMgYSBjcmVhdGlvbiAobm8gb3JpZ2luYWwgc2lkZSkgZXZlbiBpZlxuICogICBlZGl0ZWQgYWZ0ZXJ3YXJkcy5cbiAqIC0gQSBjcmVhdGUvZWRpdCBmb2xsb3dlZCBieSBhIGRlbGV0ZSBpbiB0aGUgc2FtZSB0dXJuIG5ldHMgb3V0OyBhIHByZS1leGlzdGluZ1xuICogICBmaWxlIGRlbGV0ZWQgZHVyaW5nIHRoZSB0dXJuIGlzIHN1cmZhY2VkIGFzIGEgZGVsZXRpb24gKG5vIG1vZGlmaWVkIHNpZGUgdG9cbiAqICAgcHJldmlldykgYnV0IHN0aWxsIGNvdW50ZWQgaW4gdGhlIHN0YXRzLlxuICogLSBSZW5hbWVzIGRyb3AgdGhlIHNvdXJjZSBhbmQgc3VyZmFjZSB0aGUgdGFyZ2V0IGFzIGFuIGVkaXQgb2YgaXRzXG4gKiAgIGJlZm9yZS1jb250ZW50LCBtYXRjaGluZyB0aGUgY2hhbmdlc2V0J3MgY2xhc3NpZmljYXRpb24uXG4gKiAtIFdoZW4gcm9vdHMgYXJlIHN1cHBsaWVkLCBmaWxlcyBvdXRzaWRlIGV2ZXJ5IHJvb3QgYXJlIGlnbm9yZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWR1Y2VUdXJuQ2hhbmdlcyhlZGl0czogcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W10sIGZvbGRlclJvb3RzPzogcmVhZG9ubHkgVVJJW10pOiBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMltdIHtcblx0Y29uc3QgYnlVcmkgPSBuZXcgTWFwPHN0cmluZywgSU11dGFibGVUdXJuQ2hhbmdlPigpO1xuXG5cdGNvbnN0IGlzSW5TY29wZSA9ICh1cmk6IFVSSSk6IGJvb2xlYW4gPT5cblx0XHRmb2xkZXJSb290cyA9PT0gdW5kZWZpbmVkIHx8IGZvbGRlclJvb3RzLnNvbWUocm9vdCA9PiBpc0VxdWFsT3JQYXJlbnQodXJpLCByb290KSk7XG5cblx0Y29uc3Qgc2V0Q3JlYXRlZCA9ICh1cmk6IFVSSSwgaW5zZXJ0aW9uczogbnVtYmVyLCBkZWxldGlvbnM6IG51bWJlcik6IHZvaWQgPT4ge1xuXHRcdGlmICghaXNJblNjb3BlKHVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gZ2V0Q29tcGFyaXNvbktleSh1cmkpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYnlVcmkuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5jcmVhdGVkID0gdHJ1ZTtcblx0XHRcdGV4aXN0aW5nLm1vZGlmaWVkVXJpID0gdXJpO1xuXHRcdFx0ZXhpc3Rpbmcub3JpZ2luYWxVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRleGlzdGluZy5pbnNlcnRpb25zICs9IGluc2VydGlvbnM7XG5cdFx0XHRleGlzdGluZy5kZWxldGlvbnMgKz0gZGVsZXRpb25zO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRieVVyaS5zZXQoa2V5LCB7IHVyaSwgbW9kaWZpZWRVcmk6IHVyaSwgb3JpZ2luYWxVcmk6IHVuZGVmaW5lZCwgY3JlYXRlZDogdHJ1ZSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH0pO1xuXHR9O1xuXG5cdGNvbnN0IHNldE1vZGlmaWVkID0gKHVyaTogVVJJLCBvcmlnaW5hbFVyaTogVVJJIHwgdW5kZWZpbmVkLCBpbnNlcnRpb25zOiBudW1iZXIsIGRlbGV0aW9uczogbnVtYmVyKTogdm9pZCA9PiB7XG5cdFx0aWYgKCFpc0luU2NvcGUodXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSBnZXRDb21wYXJpc29uS2V5KHVyaSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBieVVyaS5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLmluc2VydGlvbnMgKz0gaW5zZXJ0aW9ucztcblx0XHRcdGV4aXN0aW5nLmRlbGV0aW9ucyArPSBkZWxldGlvbnM7XG5cdFx0XHRpZiAoIWV4aXN0aW5nLmNyZWF0ZWQpIHtcblx0XHRcdFx0Ly8gS2VlcCB0aGUgZWFybGllc3Qga25vd24gb3JpZ2luYWwgY29udGVudCBmb3IgdGhlIGRpZmYuXG5cdFx0XHRcdGV4aXN0aW5nLm9yaWdpbmFsVXJpID0gZXhpc3Rpbmcub3JpZ2luYWxVcmkgPz8gb3JpZ2luYWxVcmk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGJ5VXJpLnNldChrZXksIHsgdXJpLCBtb2RpZmllZFVyaTogdXJpLCBvcmlnaW5hbFVyaSwgY3JlYXRlZDogZmFsc2UsIGluc2VydGlvbnMsIGRlbGV0aW9ucyB9KTtcblx0fTtcblxuXHRjb25zdCBzZXREZWxldGVkID0gKHVyaTogVVJJLCBvcmlnaW5hbFVyaTogVVJJIHwgdW5kZWZpbmVkLCBpbnNlcnRpb25zOiBudW1iZXIsIGRlbGV0aW9uczogbnVtYmVyKTogdm9pZCA9PiB7XG5cdFx0aWYgKCFpc0luU2NvcGUodXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSBnZXRDb21wYXJpc29uS2V5KHVyaSk7XG5cdFx0aWYgKGJ5VXJpLmhhcyhrZXkpKSB7XG5cdFx0XHQvLyBDcmVhdGVkL2VkaXRlZCBlYXJsaWVyIGluIHRoZSBzYW1lIHR1cm4gYW5kIG5vdyBkZWxldGVkOiBuZXRzIG91dC5cblx0XHRcdGJ5VXJpLmRlbGV0ZShrZXkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBQcmUtZXhpc3RpbmcgZmlsZSBkZWxldGVkIGR1cmluZyB0aGUgdHVybjogbm8gbW9kaWZpZWQgc2lkZSB0byBwcmV2aWV3LlxuXHRcdGJ5VXJpLnNldChrZXksIHsgdXJpLCBtb2RpZmllZFVyaTogdW5kZWZpbmVkLCBvcmlnaW5hbFVyaSwgY3JlYXRlZDogZmFsc2UsIGluc2VydGlvbnMsIGRlbGV0aW9ucyB9KTtcblx0fTtcblxuXHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRzd2l0Y2ggKGVkaXQua2luZCkge1xuXHRcdFx0Y2FzZSBGaWxlRWRpdEtpbmQuQ3JlYXRlOlxuXHRcdFx0XHRpZiAoZWRpdC5hZnRlclVyaSkge1xuXHRcdFx0XHRcdHNldENyZWF0ZWQoZWRpdC5hZnRlclVyaSwgZWRpdC5pbnNlcnRpb25zLCBlZGl0LmRlbGV0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5FZGl0OlxuXHRcdFx0XHRpZiAoZWRpdC5hZnRlclVyaSkge1xuXHRcdFx0XHRcdHNldE1vZGlmaWVkKGVkaXQuYWZ0ZXJVcmksIGVkaXQuYmVmb3JlQ29udGVudFVyaSwgZWRpdC5pbnNlcnRpb25zLCBlZGl0LmRlbGV0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5EZWxldGU6XG5cdFx0XHRcdGlmIChlZGl0LmJlZm9yZVVyaSkge1xuXHRcdFx0XHRcdHNldERlbGV0ZWQoZWRpdC5iZWZvcmVVcmksIGVkaXQuYmVmb3JlQ29udGVudFVyaSwgZWRpdC5pbnNlcnRpb25zLCBlZGl0LmRlbGV0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5SZW5hbWU6XG5cdFx0XHRcdGlmIChlZGl0LmJlZm9yZVVyaSkge1xuXHRcdFx0XHRcdGJ5VXJpLmRlbGV0ZShnZXRDb21wYXJpc29uS2V5KGVkaXQuYmVmb3JlVXJpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVkaXQuYWZ0ZXJVcmkpIHtcblx0XHRcdFx0XHRzZXRNb2RpZmllZChlZGl0LmFmdGVyVXJpLCBlZGl0LmJlZm9yZUNvbnRlbnRVcmksIGVkaXQuaW5zZXJ0aW9ucywgZWRpdC5kZWxldGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBbLi4uYnlVcmkudmFsdWVzKCldLm1hcChjID0+ICh7XG5cdFx0dXJpOiBjLnVyaSxcblx0XHRtb2RpZmllZFVyaTogYy5tb2RpZmllZFVyaSxcblx0XHRvcmlnaW5hbFVyaTogYy5vcmlnaW5hbFVyaSxcblx0XHRpbnNlcnRpb25zOiBjLmluc2VydGlvbnMsXG5cdFx0ZGVsZXRpb25zOiBjLmRlbGV0aW9ucyxcblx0fSBzYXRpc2ZpZXMgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIpKTtcbn1cblxuZnVuY3Rpb24gc2Vzc2lvbkZpbGVzRXF1YWwoYTogcmVhZG9ubHkgSVNlc3Npb25GaWxlW10sIGI6IHJlYWRvbmx5IElTZXNzaW9uRmlsZVtdKTogYm9vbGVhbiB7XG5cdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKGFbaV0ub3BlcmF0aW9uICE9PSBiW2ldLm9wZXJhdGlvblxuXHRcdFx0fHwgIWlzRXF1YWwoYVtpXS51cmksIGJbaV0udXJpKVxuXHRcdFx0fHwgIWlzRXF1YWwoYVtpXS5vcmlnaW5hbFVyaSwgYltpXS5vcmlnaW5hbFVyaSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbi8qKlxuICogU3RydWN0dXJhbCBlcXVhbGl0eSBvdmVyIHBhcnNlZCBlZGl0cywgdXNlZCAodmlhIHtAbGluayBjaGF0RmlsZUVkaXRzRXF1YWx9KVxuICogYXMgdGhlIHBlci1jaGF0IG9ic2VydmFibGUncyBgZXF1YWxzRm5gIHNvIHN0cmVhbWVkIGRlbHRhcyB0aGF0IGNhcnJ5IG5vXG4gKiBmaWxlLWVkaXQgY2hhbmdlIChlLmcuIG1hcmtkb3duIG9yIHJlYXNvbmluZyBjb250ZW50KSBkb24ndCByZS1ydW4gdGhlXG4gKiBkb3duc3RyZWFtIHJlZHVjZXJzLlxuICovXG5mdW5jdGlvbiBwYXJzZWRGaWxlRWRpdHNFcXVhbChhOiByZWFkb25seSBJUGFyc2VkRmlsZUVkaXRbXSwgYjogcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W10pOiBib29sZWFuIHtcblx0aWYgKGEgPT09IGIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuXHRcdGlmIChhW2ldLmtpbmQgIT09IGJbaV0ua2luZFxuXHRcdFx0fHwgYVtpXS5pbnNlcnRpb25zICE9PSBiW2ldLmluc2VydGlvbnNcblx0XHRcdHx8IGFbaV0uZGVsZXRpb25zICE9PSBiW2ldLmRlbGV0aW9uc1xuXHRcdFx0fHwgIWlzRXF1YWwoYVtpXS5hZnRlclVyaSwgYltpXS5hZnRlclVyaSlcblx0XHRcdHx8ICFpc0VxdWFsKGFbaV0uYmVmb3JlVXJpLCBiW2ldLmJlZm9yZVVyaSlcblx0XHRcdHx8ICFpc0VxdWFsKGFbaV0uYmVmb3JlQ29udGVudFVyaSwgYltpXS5iZWZvcmVDb250ZW50VXJpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuLyoqIFN0cnVjdHVyYWwgZXF1YWxpdHkgb3ZlciBhIGNoYXQncyBwYXJzZWQgZWRpdHMgKGZ1bGwgc2V0IGFuZCBsYXN0IHR1cm4pLiAqL1xuZnVuY3Rpb24gY2hhdEZpbGVFZGl0c0VxdWFsKGE6IElDaGF0RmlsZUVkaXRzLCBiOiBJQ2hhdEZpbGVFZGl0cyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGFyc2VkRmlsZUVkaXRzRXF1YWwoYS5hbGxFZGl0cywgYi5hbGxFZGl0cykgJiYgcGFyc2VkRmlsZUVkaXRzRXF1YWwoYS5sYXN0VHVybkVkaXRzLCBiLmxhc3RUdXJuRWRpdHMpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsYUFBMEIsZ0NBQWdDO0FBQ3BGLFNBQVMsV0FBVyxrQkFBa0I7QUFDdEMsU0FBUyxrQkFBa0IsU0FBUyx1QkFBdUI7QUFDM0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMseUJBQXlCO0FBRWxDO0FBQUEsRUFDQztBQUFBLEVBRUE7QUFBQSxFQUNBO0FBQUEsRUFFQTtBQUFBLEVBR0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLFNBQThELHNCQUFzQiwrQkFBK0I7QUFDbkgsU0FBUywwQ0FBMEM7QUFrRTVDLFNBQVMsdUJBQ2YsWUFDQSxTQUNBLG9CQUNBLGVBQ0EsY0FDb0I7QUFDcEIsUUFBTSxhQUFhLFFBQVE7QUFLM0IsUUFBTSxhQUFh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
