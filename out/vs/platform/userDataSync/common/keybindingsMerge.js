import { equals } from "../../../base/common/arrays.js";
import { parse } from "../../../base/common/json.js";
import * as objects from "../../../base/common/objects.js";
import { ContextKeyExpr } from "../../contextkey/common/contextkey.js";
import * as contentUtil from "./content.js";
function parseKeybindings(content) {
  return parse(content) || [];
}
async function merge(localContent, remoteContent, baseContent, formattingOptions, userDataSyncUtilService) {
  const local = parseKeybindings(localContent);
  const remote = parseKeybindings(remoteContent);
  const base = baseContent ? parseKeybindings(baseContent) : null;
  const userbindings = [...local, ...remote, ...base || []].map((keybinding) => keybinding.key);
  const normalizedKeys = await userDataSyncUtilService.resolveUserBindings(userbindings);
  const keybindingsMergeResult = computeMergeResultByKeybinding(local, remote, base, normalizedKeys);
  if (!keybindingsMergeResult.hasLocalForwarded && !keybindingsMergeResult.hasRemoteForwarded) {
    return { mergeContent: localContent, hasChanges: false, hasConflicts: false };
  }
  if (!keybindingsMergeResult.hasLocalForwarded && keybindingsMergeResult.hasRemoteForwarded) {
    return { mergeContent: remoteContent, hasChanges: true, hasConflicts: false };
  }
  if (keybindingsMergeResult.hasLocalForwarded && !keybindingsMergeResult.hasRemoteForwarded) {
    return { mergeContent: localContent, hasChanges: true, hasConflicts: false };
  }
  const localByCommand = byCommand(local);
  const remoteByCommand = byCommand(remote);
  const baseByCommand = base ? byCommand(base) : null;
  const localToRemoteByCommand = compareByCommand(localByCommand, remoteByCommand, normalizedKeys);
  const baseToLocalByCommand = baseByCommand ? compareByCommand(baseByCommand, localByCommand, normalizedKeys) : { added: [...localByCommand.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  const baseToRemoteByCommand = baseByCommand ? compareByCommand(baseByCommand, remoteByCommand, normalizedKeys) : { added: [...remoteByCommand.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  const commandsMergeResult = computeMergeResult(localToRemoteByCommand, baseToLocalByCommand, baseToRemoteByCommand);
  let mergeContent = localContent;
  for (const command of commandsMergeResult.removed.values()) {
    if (commandsMergeResult.conflicts.has(command)) {
      continue;
    }
    mergeContent = removeKeybindings(mergeContent, command, formattingOptions);
  }
  for (const command of commandsMergeResult.added.values()) {
    if (commandsMergeResult.conflicts.has(command)) {
      continue;
    }
    const keybindings = remoteByCommand.get(command);
    if (keybindings.some((keybinding) => keybinding.command !== `-${command}` && keybindingsMergeResult.conflicts.has(normalizedKeys[keybinding.key]))) {
      commandsMergeResult.conflicts.add(command);
      continue;
    }
    mergeContent = addKeybindings(mergeContent, keybindings, formattingOptions);
  }
  for (const command of commandsMergeResult.updated.values()) {
    if (commandsMergeResult.conflicts.has(command)) {
      continue;
    }
    const keybindings = remoteByCommand.get(command);
    if (keybindings.some((keybinding) => keybinding.command !== `-${command}` && keybindingsMergeResult.conflicts.has(normalizedKeys[keybinding.key]))) {
      commandsMergeResult.conflicts.add(command);
      continue;
    }
    mergeContent = updateKeybindings(mergeContent, command, keybindings, formattingOptions);
  }
  return { mergeContent, hasChanges: true, hasConflicts: commandsMergeResult.conflicts.size > 0 };
}
function computeMergeResult(localToRemote, baseToLocal, baseToRemote) {
  const added = /* @__PURE__ */ new Set();
  const removed = /* @__PURE__ */ new Set();
  const updated = /* @__PURE__ */ new Set();
  const conflicts = /* @__PURE__ */ new Set();
  for (const key of baseToLocal.removed.values()) {
    if (baseToRemote.updated.has(key)) {
      conflicts.add(key);
    }
  }
  for (const key of baseToRemote.removed.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      conflicts.add(key);
    } else {
      removed.add(key);
    }
  }
  for (const key of baseToLocal.added.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToRemote.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    }
  }
  for (const key of baseToRemote.added.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToLocal.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    } else {
      added.add(key);
    }
  }
  for (const key of baseToLocal.updated.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToRemote.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    }
  }
  for (const key of baseToRemote.updated.values()) {
    if (conflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        conflicts.add(key);
      }
    } else {
      updated.add(key);
    }
  }
  return { added, removed, updated, conflicts };
}
function computeMergeResultByKeybinding(local, remote, base, normalizedKeys) {
  const empty = /* @__PURE__ */ new Set();
  const localByKeybinding = byKeybinding(local, normalizedKeys);
  const remoteByKeybinding = byKeybinding(remote, normalizedKeys);
  const baseByKeybinding = base ? byKeybinding(base, normalizedKeys) : null;
  const localToRemoteByKeybinding = compareByKeybinding(localByKeybinding, remoteByKeybinding);
  if (localToRemoteByKeybinding.added.size === 0 && localToRemoteByKeybinding.removed.size === 0 && localToRemoteByKeybinding.updated.size === 0) {
    return { hasLocalForwarded: false, hasRemoteForwarded: false, added: empty, removed: empty, updated: empty, conflicts: empty };
  }
  const baseToLocalByKeybinding = baseByKeybinding ? compareByKeybinding(baseByKeybinding, localByKeybinding) : { added: [...localByKeybinding.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  if (baseToLocalByKeybinding.added.size === 0 && baseToLocalByKeybinding.removed.size === 0 && baseToLocalByKeybinding.updated.size === 0) {
    return { hasLocalForwarded: false, hasRemoteForwarded: true, added: empty, removed: empty, updated: empty, conflicts: empty };
  }
  const baseToRemoteByKeybinding = baseByKeybinding ? compareByKeybinding(baseByKeybinding, remoteByKeybinding) : { added: [...remoteByKeybinding.keys()].reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  if (baseToRemoteByKeybinding.added.size === 0 && baseToRemoteByKeybinding.removed.size === 0 && baseToRemoteByKeybinding.updated.size === 0) {
    return { hasLocalForwarded: true, hasRemoteForwarded: false, added: empty, removed: empty, updated: empty, conflicts: empty };
  }
  const { added, removed, updated, conflicts } = computeMergeResult(localToRemoteByKeybinding, baseToLocalByKeybinding, baseToRemoteByKeybinding);
  return { hasLocalForwarded: true, hasRemoteForwarded: true, added, removed, updated, conflicts };
}
function byKeybinding(keybindings, keys) {
  const map = /* @__PURE__ */ new Map();
  for (const keybinding of keybindings) {
    const key = keys[keybinding.key];
    let value = map.get(key);
    if (!value) {
      value = [];
      map.set(key, value);
    }
    value.push(keybinding);
  }
  return map;
}
function byCommand(keybindings) {
  const map = /* @__PURE__ */ new Map();
  for (const keybinding of keybindings) {
    const command = keybinding.command[0] === "-" ? keybinding.command.substring(1) : keybinding.command;
    let value = map.get(command);
    if (!value) {
      value = [];
      map.set(command, value);
    }
    value.push(keybinding);
  }
  return map;
}
function compareByKeybinding(from, to) {
  const fromKeys = [...from.keys()];
  const toKeys = [...to.keys()];
  const added = toKeys.filter((key) => !fromKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const removed = fromKeys.filter((key) => !toKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const updated = /* @__PURE__ */ new Set();
  for (const key of fromKeys) {
    if (removed.has(key)) {
      continue;
    }
    const value1 = from.get(key).map((keybinding) => ({ ...keybinding, ...{ key } }));
    const value2 = to.get(key).map((keybinding) => ({ ...keybinding, ...{ key } }));
    if (!equals(value1, value2, (a, b) => isSameKeybinding(a, b))) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function compareByCommand(from, to, normalizedKeys) {
  const fromKeys = [...from.keys()];
  const toKeys = [...to.keys()];
  const added = toKeys.filter((key) => !fromKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const removed = fromKeys.filter((key) => !toKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const updated = /* @__PURE__ */ new Set();
  for (const key of fromKeys) {
    if (removed.has(key)) {
      continue;
    }
    const value1 = from.get(key).map((keybinding) => ({ ...keybinding, ...{ key: normalizedKeys[keybinding.key] } }));
    const value2 = to.get(key).map((keybinding) => ({ ...keybinding, ...{ key: normalizedKeys[keybinding.key] } }));
    if (!areSameKeybindingsWithSameCommand(value1, value2)) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function areSameKeybindingsWithSameCommand(value1, value2) {
  if (!equals(value1.filter(({ command }) => command[0] !== "-"), value2.filter(({ command }) => command[0] !== "-"), (a, b) => isSameKeybinding(a, b))) {
    return false;
  }
  if (!equals(value1.filter(({ command }) => command[0] === "-"), value2.filter(({ command }) => command[0] === "-"), (a, b) => isSameKeybinding(a, b))) {
    return false;
  }
  return true;
}
function isSameKeybinding(a, b) {
  if (a.command !== b.command) {
    return false;
  }
  if (a.key !== b.key) {
    return false;
  }
  const whenA = ContextKeyExpr.deserialize(a.when);
  const whenB = ContextKeyExpr.deserialize(b.when);
  if (whenA && !whenB || !whenA && whenB) {
    return false;
  }
  if (whenA && whenB && !whenA.equals(whenB)) {
    return false;
  }
  if (!objects.equals(a.args, b.args)) {
    return false;
  }
  return true;
}
function addKeybindings(content, keybindings, formattingOptions) {
  for (const keybinding of keybindings) {
    content = contentUtil.edit(content, [-1], keybinding, formattingOptions);
  }
  return content;
}
function removeKeybindings(content, command, formattingOptions) {
  const keybindings = parseKeybindings(content);
  for (let index = keybindings.length - 1; index >= 0; index--) {
    if (keybindings[index].command === command || keybindings[index].command === `-${command}`) {
      content = contentUtil.edit(content, [index], void 0, formattingOptions);
    }
  }
  return content;
}
function updateKeybindings(content, command, keybindings, formattingOptions) {
  const allKeybindings = parseKeybindings(content);
  const location = allKeybindings.findIndex((keybinding) => keybinding.command === command || keybinding.command === `-${command}`);
  for (let index = allKeybindings.length - 1; index >= 0; index--) {
    if (allKeybindings[index].command === command || allKeybindings[index].command === `-${command}`) {
      content = contentUtil.edit(content, [index], void 0, formattingOptions);
    }
  }
  for (let index = keybindings.length - 1; index >= 0; index--) {
    content = contentUtil.edit(content, [location], keybindings[index], formattingOptions);
  }
  return content;
}
export {
  merge
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24va2V5YmluZGluZ3NNZXJnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVXNlckZyaWVuZGx5S2V5YmluZGluZyB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0ICogYXMgY29udGVudFV0aWwgZnJvbSAnLi9jb250ZW50LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNVdGlsU2VydmljZSB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcblxuaW50ZXJmYWNlIElDb21wYXJlUmVzdWx0IHtcblx0YWRkZWQ6IFNldDxzdHJpbmc+O1xuXHRyZW1vdmVkOiBTZXQ8c3RyaW5nPjtcblx0dXBkYXRlZDogU2V0PHN0cmluZz47XG59XG5cbmludGVyZmFjZSBJTWVyZ2VSZXN1bHQge1xuXHRoYXNMb2NhbEZvcndhcmRlZDogYm9vbGVhbjtcblx0aGFzUmVtb3RlRm9yd2FyZGVkOiBib29sZWFuO1xuXHRhZGRlZDogU2V0PHN0cmluZz47XG5cdHJlbW92ZWQ6IFNldDxzdHJpbmc+O1xuXHR1cGRhdGVkOiBTZXQ8c3RyaW5nPjtcblx0Y29uZmxpY3RzOiBTZXQ8c3RyaW5nPjtcbn1cblxuZnVuY3Rpb24gcGFyc2VLZXliaW5kaW5ncyhjb250ZW50OiBzdHJpbmcpOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdIHtcblx0cmV0dXJuIHBhcnNlKGNvbnRlbnQpIHx8IFtdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWVyZ2UobG9jYWxDb250ZW50OiBzdHJpbmcsIHJlbW90ZUNvbnRlbnQ6IHN0cmluZywgYmFzZUNvbnRlbnQ6IHN0cmluZyB8IG51bGwsIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucywgdXNlckRhdGFTeW5jVXRpbFNlcnZpY2U6IElVc2VyRGF0YVN5bmNVdGlsU2VydmljZSk6IFByb21pc2U8eyBtZXJnZUNvbnRlbnQ6IHN0cmluZzsgaGFzQ2hhbmdlczogYm9vbGVhbjsgaGFzQ29uZmxpY3RzOiBib29sZWFuIH0+IHtcblx0Y29uc3QgbG9jYWwgPSBwYXJzZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCk7XG5cdGNvbnN0IHJlbW90ZSA9IHBhcnNlS2V5YmluZGluZ3MocmVtb3RlQ29udGVudCk7XG5cdGNvbnN0IGJhc2UgPSBiYXNlQ29udGVudCA/IHBhcnNlS2V5YmluZGluZ3MoYmFzZUNvbnRlbnQpIDogbnVsbDtcblxuXHRjb25zdCB1c2VyYmluZGluZ3M6IHN0cmluZ1tdID0gWy4uLmxvY2FsLCAuLi5yZW1vdGUsIC4uLihiYXNlIHx8IFtdKV0ubWFwKGtleWJpbmRpbmcgPT4ga2V5YmluZGluZy5rZXkpO1xuXHRjb25zdCBub3JtYWxpemVkS2V5cyA9IGF3YWl0IHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLnJlc29sdmVVc2VyQmluZGluZ3ModXNlcmJpbmRpbmdzKTtcblx0Y29uc3Qga2V5YmluZGluZ3NNZXJnZVJlc3VsdCA9IGNvbXB1dGVNZXJnZVJlc3VsdEJ5S2V5YmluZGluZyhsb2NhbCwgcmVtb3RlLCBiYXNlLCBub3JtYWxpemVkS2V5cyk7XG5cblx0aWYgKCFrZXliaW5kaW5nc01lcmdlUmVzdWx0Lmhhc0xvY2FsRm9yd2FyZGVkICYmICFrZXliaW5kaW5nc01lcmdlUmVzdWx0Lmhhc1JlbW90ZUZvcndhcmRlZCkge1xuXHRcdC8vIE5vIGNoYW5nZXMgZm91bmQgYmV0d2VlbiBsb2NhbCBhbmQgcmVtb3RlLlxuXHRcdHJldHVybiB7IG1lcmdlQ29udGVudDogbG9jYWxDb250ZW50LCBoYXNDaGFuZ2VzOiBmYWxzZSwgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHR9XG5cblx0aWYgKCFrZXliaW5kaW5nc01lcmdlUmVzdWx0Lmhhc0xvY2FsRm9yd2FyZGVkICYmIGtleWJpbmRpbmdzTWVyZ2VSZXN1bHQuaGFzUmVtb3RlRm9yd2FyZGVkKSB7XG5cdFx0cmV0dXJuIHsgbWVyZ2VDb250ZW50OiByZW1vdGVDb250ZW50LCBoYXNDaGFuZ2VzOiB0cnVlLCBoYXNDb25mbGljdHM6IGZhbHNlIH07XG5cdH1cblxuXHRpZiAoa2V5YmluZGluZ3NNZXJnZVJlc3VsdC5oYXNMb2NhbEZvcndhcmRlZCAmJiAha2V5YmluZGluZ3NNZXJnZVJlc3VsdC5oYXNSZW1vdGVGb3J3YXJkZWQpIHtcblx0XHQvLyBMb2NhbCBoYXMgbW92ZWQgZm9yd2FyZCBhbmQgcmVtb3RlIGhhcyBub3QuIFJldHVybiBsb2NhbC5cblx0XHRyZXR1cm4geyBtZXJnZUNvbnRlbnQ6IGxvY2FsQ29udGVudCwgaGFzQ2hhbmdlczogdHJ1ZSwgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHR9XG5cblx0Ly8gQm90aCBsb2NhbCBhbmQgcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJkLlxuXHRjb25zdCBsb2NhbEJ5Q29tbWFuZCA9IGJ5Q29tbWFuZChsb2NhbCk7XG5cdGNvbnN0IHJlbW90ZUJ5Q29tbWFuZCA9IGJ5Q29tbWFuZChyZW1vdGUpO1xuXHRjb25zdCBiYXNlQnlDb21tYW5kID0gYmFzZSA/IGJ5Q29tbWFuZChiYXNlKSA6IG51bGw7XG5cdGNvbnN0IGxvY2FsVG9SZW1vdGVCeUNvbW1hbmQgPSBjb21wYXJlQnlDb21tYW5kKGxvY2FsQnlDb21tYW5kLCByZW1vdGVCeUNvbW1hbmQsIG5vcm1hbGl6ZWRLZXlzKTtcblx0Y29uc3QgYmFzZVRvTG9jYWxCeUNvbW1hbmQgPSBiYXNlQnlDb21tYW5kID8gY29tcGFyZUJ5Q29tbWFuZChiYXNlQnlDb21tYW5kLCBsb2NhbEJ5Q29tbWFuZCwgbm9ybWFsaXplZEtleXMpIDogeyBhZGRlZDogWy4uLmxvY2FsQnlDb21tYW5kLmtleXMoKV0ucmVkdWNlKChyLCBrKSA9PiB7IHIuYWRkKGspOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpLCByZW1vdmVkOiBuZXcgU2V0PHN0cmluZz4oKSwgdXBkYXRlZDogbmV3IFNldDxzdHJpbmc+KCkgfTtcblx0Y29uc3QgYmFzZVRvUmVtb3RlQnlDb21tYW5kID0gYmFzZUJ5Q29tbWFuZCA/IGNvbXBhcmVCeUNvbW1hbmQoYmFzZUJ5Q29tbWFuZCwgcmVtb3RlQnlDb21tYW5kLCBub3JtYWxpemVkS2V5cykgOiB7IGFkZGVkOiBbLi4ucmVtb3RlQnlDb21tYW5kLmtleXMoKV0ucmVkdWNlKChyLCBrKSA9PiB7IHIuYWRkKGspOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpLCByZW1vdmVkOiBuZXcgU2V0PHN0cmluZz4oKSwgdXBkYXRlZDogbmV3IFNldDxzdHJpbmc+KCkgfTtcblxuXHRjb25zdCBjb21tYW5kc01lcmdlUmVzdWx0ID0gY29tcHV0ZU1lcmdlUmVzdWx0KGxvY2FsVG9SZW1vdGVCeUNvbW1hbmQsIGJhc2VUb0xvY2FsQnlDb21tYW5kLCBiYXNlVG9SZW1vdGVCeUNvbW1hbmQpO1xuXHRsZXQgbWVyZ2VDb250ZW50ID0gbG9jYWxDb250ZW50O1xuXG5cdC8vIFJlbW92ZWQgY29tbWFuZHMgaW4gUmVtb3RlXG5cdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kc01lcmdlUmVzdWx0LnJlbW92ZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoY29tbWFuZHNNZXJnZVJlc3VsdC5jb25mbGljdHMuaGFzKGNvbW1hbmQpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0bWVyZ2VDb250ZW50ID0gcmVtb3ZlS2V5YmluZGluZ3MobWVyZ2VDb250ZW50LCBjb21tYW5kLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdH1cblxuXHQvLyBBZGRlZCBjb21tYW5kcyBpbiByZW1vdGVcblx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzTWVyZ2VSZXN1bHQuYWRkZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoY29tbWFuZHNNZXJnZVJlc3VsdC5jb25mbGljdHMuaGFzKGNvbW1hbmQpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5YmluZGluZ3MgPSByZW1vdGVCeUNvbW1hbmQuZ2V0KGNvbW1hbmQpITtcblx0XHQvLyBJZ25vcmUgbmVnYXRlZCBjb21tYW5kc1xuXHRcdGlmIChrZXliaW5kaW5ncy5zb21lKGtleWJpbmRpbmcgPT4ga2V5YmluZGluZy5jb21tYW5kICE9PSBgLSR7Y29tbWFuZH1gICYmIGtleWJpbmRpbmdzTWVyZ2VSZXN1bHQuY29uZmxpY3RzLmhhcyhub3JtYWxpemVkS2V5c1trZXliaW5kaW5nLmtleV0pKSkge1xuXHRcdFx0Y29tbWFuZHNNZXJnZVJlc3VsdC5jb25mbGljdHMuYWRkKGNvbW1hbmQpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG1lcmdlQ29udGVudCA9IGFkZEtleWJpbmRpbmdzKG1lcmdlQ29udGVudCwga2V5YmluZGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0fVxuXG5cdC8vIFVwZGF0ZWQgY29tbWFuZHMgaW4gUmVtb3RlXG5cdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kc01lcmdlUmVzdWx0LnVwZGF0ZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoY29tbWFuZHNNZXJnZVJlc3VsdC5jb25mbGljdHMuaGFzKGNvbW1hbmQpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5YmluZGluZ3MgPSByZW1vdGVCeUNvbW1hbmQuZ2V0KGNvbW1hbmQpITtcblx0XHQvLyBJZ25vcmUgbmVnYXRlZCBjb21tYW5kc1xuXHRcdGlmIChrZXliaW5kaW5ncy5zb21lKGtleWJpbmRpbmcgPT4ga2V5YmluZGluZy5jb21tYW5kICE9PSBgLSR7Y29tbWFuZH1gICYmIGtleWJpbmRpbmdzTWVyZ2VSZXN1bHQuY29uZmxpY3RzLmhhcyhub3JtYWxpemVkS2V5c1trZXliaW5kaW5nLmtleV0pKSkge1xuXHRcdFx0Y29tbWFuZHNNZXJnZVJlc3VsdC5jb25mbGljdHMuYWRkKGNvbW1hbmQpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG1lcmdlQ29udGVudCA9IHVwZGF0ZUtleWJpbmRpbmdzKG1lcmdlQ29udGVudCwgY29tbWFuZCwga2V5YmluZGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0fVxuXG5cdHJldHVybiB7IG1lcmdlQ29udGVudCwgaGFzQ2hhbmdlczogdHJ1ZSwgaGFzQ29uZmxpY3RzOiBjb21tYW5kc01lcmdlUmVzdWx0LmNvbmZsaWN0cy5zaXplID4gMCB9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlTWVyZ2VSZXN1bHQobG9jYWxUb1JlbW90ZTogSUNvbXBhcmVSZXN1bHQsIGJhc2VUb0xvY2FsOiBJQ29tcGFyZVJlc3VsdCwgYmFzZVRvUmVtb3RlOiBJQ29tcGFyZVJlc3VsdCk6IHsgYWRkZWQ6IFNldDxzdHJpbmc+OyByZW1vdmVkOiBTZXQ8c3RyaW5nPjsgdXBkYXRlZDogU2V0PHN0cmluZz47IGNvbmZsaWN0czogU2V0PHN0cmluZz4gfSB7XG5cdGNvbnN0IGFkZGVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCByZW1vdmVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCB1cGRhdGVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBjb25mbGljdHM6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Ly8gUmVtb3ZlZCBrZXlzIGluIExvY2FsXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb0xvY2FsLnJlbW92ZWQudmFsdWVzKCkpIHtcblx0XHQvLyBHb3QgdXBkYXRlZCBpbiByZW1vdGVcblx0XHRpZiAoYmFzZVRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdGNvbmZsaWN0cy5hZGQoa2V5KTtcblx0XHR9XG5cdH1cblxuXHQvLyBSZW1vdmVkIGtleXMgaW4gUmVtb3RlXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb1JlbW90ZS5yZW1vdmVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGNvbmZsaWN0cy5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIEdvdCB1cGRhdGVkIGluIGxvY2FsXG5cdFx0aWYgKGJhc2VUb0xvY2FsLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdGNvbmZsaWN0cy5hZGQoa2V5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gcmVtb3ZlIHRoZSBrZXlcblx0XHRcdHJlbW92ZWQuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWRkZWQga2V5cyBpbiBMb2NhbFxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9Mb2NhbC5hZGRlZC52YWx1ZXMoKSkge1xuXHRcdGlmIChjb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgYWRkZWQgaW4gcmVtb3RlXG5cdFx0aWYgKGJhc2VUb1JlbW90ZS5hZGRlZC5oYXMoa2V5KSkge1xuXHRcdFx0Ly8gSGFzIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb25mbGljdHMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWRkZWQga2V5cyBpbiByZW1vdGVcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvUmVtb3RlLmFkZGVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGNvbmZsaWN0cy5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIEdvdCBhZGRlZCBpbiBsb2NhbFxuXHRcdGlmIChiYXNlVG9Mb2NhbC5hZGRlZC5oYXMoa2V5KSkge1xuXHRcdFx0Ly8gSGFzIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb25mbGljdHMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFkZGVkLmFkZChrZXkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFVwZGF0ZWQga2V5cyBpbiBMb2NhbFxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9Mb2NhbC51cGRhdGVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGNvbmZsaWN0cy5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIEdvdCB1cGRhdGVkIGluIHJlbW90ZVxuXHRcdGlmIChiYXNlVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0Ly8gSGFzIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb25mbGljdHMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gVXBkYXRlZCBrZXlzIGluIFJlbW90ZVxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9SZW1vdGUudXBkYXRlZC52YWx1ZXMoKSkge1xuXHRcdGlmIChjb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgdXBkYXRlZCBpbiBsb2NhbFxuXHRcdGlmIChiYXNlVG9Mb2NhbC51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHQvLyBIYXMgZGlmZmVyZW50IHZhbHVlXG5cdFx0XHRpZiAobG9jYWxUb1JlbW90ZS51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbmZsaWN0cy5hZGQoa2V5KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gdXBkYXRlZCBrZXlcblx0XHRcdHVwZGF0ZWQuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkLCBjb25mbGljdHMgfTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1lcmdlUmVzdWx0QnlLZXliaW5kaW5nKGxvY2FsOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdLCByZW1vdGU6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10sIGJhc2U6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10gfCBudWxsLCBub3JtYWxpemVkS2V5czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPik6IElNZXJnZVJlc3VsdCB7XG5cdGNvbnN0IGVtcHR5ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGxvY2FsQnlLZXliaW5kaW5nID0gYnlLZXliaW5kaW5nKGxvY2FsLCBub3JtYWxpemVkS2V5cyk7XG5cdGNvbnN0IHJlbW90ZUJ5S2V5YmluZGluZyA9IGJ5S2V5YmluZGluZyhyZW1vdGUsIG5vcm1hbGl6ZWRLZXlzKTtcblx0Y29uc3QgYmFzZUJ5S2V5YmluZGluZyA9IGJhc2UgPyBieUtleWJpbmRpbmcoYmFzZSwgbm9ybWFsaXplZEtleXMpIDogbnVsbDtcblxuXHRjb25zdCBsb2NhbFRvUmVtb3RlQnlLZXliaW5kaW5nID0gY29tcGFyZUJ5S2V5YmluZGluZyhsb2NhbEJ5S2V5YmluZGluZywgcmVtb3RlQnlLZXliaW5kaW5nKTtcblx0aWYgKGxvY2FsVG9SZW1vdGVCeUtleWJpbmRpbmcuYWRkZWQuc2l6ZSA9PT0gMCAmJiBsb2NhbFRvUmVtb3RlQnlLZXliaW5kaW5nLnJlbW92ZWQuc2l6ZSA9PT0gMCAmJiBsb2NhbFRvUmVtb3RlQnlLZXliaW5kaW5nLnVwZGF0ZWQuc2l6ZSA9PT0gMCkge1xuXHRcdHJldHVybiB7IGhhc0xvY2FsRm9yd2FyZGVkOiBmYWxzZSwgaGFzUmVtb3RlRm9yd2FyZGVkOiBmYWxzZSwgYWRkZWQ6IGVtcHR5LCByZW1vdmVkOiBlbXB0eSwgdXBkYXRlZDogZW1wdHksIGNvbmZsaWN0czogZW1wdHkgfTtcblx0fVxuXG5cdGNvbnN0IGJhc2VUb0xvY2FsQnlLZXliaW5kaW5nID0gYmFzZUJ5S2V5YmluZGluZyA/IGNvbXBhcmVCeUtleWJpbmRpbmcoYmFzZUJ5S2V5YmluZGluZywgbG9jYWxCeUtleWJpbmRpbmcpIDogeyBhZGRlZDogWy4uLmxvY2FsQnlLZXliaW5kaW5nLmtleXMoKV0ucmVkdWNlKChyLCBrKSA9PiB7IHIuYWRkKGspOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpLCByZW1vdmVkOiBuZXcgU2V0PHN0cmluZz4oKSwgdXBkYXRlZDogbmV3IFNldDxzdHJpbmc+KCkgfTtcblx0aWYgKGJhc2VUb0xvY2FsQnlLZXliaW5kaW5nLmFkZGVkLnNpemUgPT09IDAgJiYgYmFzZVRvTG9jYWxCeUtleWJpbmRpbmcucmVtb3ZlZC5zaXplID09PSAwICYmIGJhc2VUb0xvY2FsQnlLZXliaW5kaW5nLnVwZGF0ZWQuc2l6ZSA9PT0gMCkge1xuXHRcdC8vIFJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZCBhbmQgbG9jYWwgaGFzIG5vdC5cblx0XHRyZXR1cm4geyBoYXNMb2NhbEZvcndhcmRlZDogZmFsc2UsIGhhc1JlbW90ZUZvcndhcmRlZDogdHJ1ZSwgYWRkZWQ6IGVtcHR5LCByZW1vdmVkOiBlbXB0eSwgdXBkYXRlZDogZW1wdHksIGNvbmZsaWN0czogZW1wdHkgfTtcblx0fVxuXG5cdGNvbnN0IGJhc2VUb1JlbW90ZUJ5S2V5YmluZGluZyA9IGJhc2VCeUtleWJpbmRpbmcgPyBjb21wYXJlQnlLZXliaW5kaW5nKGJhc2VCeUtleWJpbmRpbmcsIHJlbW90ZUJ5S2V5YmluZGluZykgOiB7IGFkZGVkOiBbLi4ucmVtb3RlQnlLZXliaW5kaW5nLmtleXMoKV0ucmVkdWNlKChyLCBrKSA9PiB7IHIuYWRkKGspOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpLCByZW1vdmVkOiBuZXcgU2V0PHN0cmluZz4oKSwgdXBkYXRlZDogbmV3IFNldDxzdHJpbmc+KCkgfTtcblx0aWYgKGJhc2VUb1JlbW90ZUJ5S2V5YmluZGluZy5hZGRlZC5zaXplID09PSAwICYmIGJhc2VUb1JlbW90ZUJ5S2V5YmluZGluZy5yZW1vdmVkLnNpemUgPT09IDAgJiYgYmFzZVRvUmVtb3RlQnlLZXliaW5kaW5nLnVwZGF0ZWQuc2l6ZSA9PT0gMCkge1xuXHRcdHJldHVybiB7IGhhc0xvY2FsRm9yd2FyZGVkOiB0cnVlLCBoYXNSZW1vdGVGb3J3YXJkZWQ6IGZhbHNlLCBhZGRlZDogZW1wdHksIHJlbW92ZWQ6IGVtcHR5LCB1cGRhdGVkOiBlbXB0eSwgY29uZmxpY3RzOiBlbXB0eSB9O1xuXHR9XG5cblx0Y29uc3QgeyBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCwgY29uZmxpY3RzIH0gPSBjb21wdXRlTWVyZ2VSZXN1bHQobG9jYWxUb1JlbW90ZUJ5S2V5YmluZGluZywgYmFzZVRvTG9jYWxCeUtleWJpbmRpbmcsIGJhc2VUb1JlbW90ZUJ5S2V5YmluZGluZyk7XG5cdHJldHVybiB7IGhhc0xvY2FsRm9yd2FyZGVkOiB0cnVlLCBoYXNSZW1vdGVGb3J3YXJkZWQ6IHRydWUsIGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkLCBjb25mbGljdHMgfTtcbn1cblxuZnVuY3Rpb24gYnlLZXliaW5kaW5nKGtleWJpbmRpbmdzOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdLCBrZXlzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+KSB7XG5cdGNvbnN0IG1hcDogTWFwPHN0cmluZywgSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXT4gPSBuZXcgTWFwPHN0cmluZywgSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXT4oKTtcblx0Zm9yIChjb25zdCBrZXliaW5kaW5nIG9mIGtleWJpbmRpbmdzKSB7XG5cdFx0Y29uc3Qga2V5ID0ga2V5c1trZXliaW5kaW5nLmtleV07XG5cdFx0bGV0IHZhbHVlID0gbWFwLmdldChrZXkpO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHZhbHVlID0gW107XG5cdFx0XHRtYXAuc2V0KGtleSwgdmFsdWUpO1xuXHRcdH1cblx0XHR2YWx1ZS5wdXNoKGtleWJpbmRpbmcpO1xuXG5cdH1cblx0cmV0dXJuIG1hcDtcbn1cblxuZnVuY3Rpb24gYnlDb21tYW5kKGtleWJpbmRpbmdzOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdKTogTWFwPHN0cmluZywgSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXT4ge1xuXHRjb25zdCBtYXA6IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+ID0gbmV3IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+KCk7XG5cdGZvciAoY29uc3Qga2V5YmluZGluZyBvZiBrZXliaW5kaW5ncykge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBrZXliaW5kaW5nLmNvbW1hbmRbMF0gPT09ICctJyA/IGtleWJpbmRpbmcuY29tbWFuZC5zdWJzdHJpbmcoMSkgOiBrZXliaW5kaW5nLmNvbW1hbmQ7XG5cdFx0bGV0IHZhbHVlID0gbWFwLmdldChjb21tYW5kKTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHR2YWx1ZSA9IFtdO1xuXHRcdFx0bWFwLnNldChjb21tYW5kLCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHZhbHVlLnB1c2goa2V5YmluZGluZyk7XG5cdH1cblx0cmV0dXJuIG1hcDtcbn1cblxuXG5mdW5jdGlvbiBjb21wYXJlQnlLZXliaW5kaW5nKGZyb206IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+LCB0bzogTWFwPHN0cmluZywgSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXT4pOiBJQ29tcGFyZVJlc3VsdCB7XG5cdGNvbnN0IGZyb21LZXlzID0gWy4uLmZyb20ua2V5cygpXTtcblx0Y29uc3QgdG9LZXlzID0gWy4uLnRvLmtleXMoKV07XG5cdGNvbnN0IGFkZGVkID0gdG9LZXlzLmZpbHRlcihrZXkgPT4gIWZyb21LZXlzLmluY2x1ZGVzKGtleSkpLnJlZHVjZSgociwga2V5KSA9PiB7IHIuYWRkKGtleSk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IHJlbW92ZWQgPSBmcm9tS2V5cy5maWx0ZXIoa2V5ID0+ICF0b0tleXMuaW5jbHVkZXMoa2V5KSkucmVkdWNlKChyLCBrZXkpID0+IHsgci5hZGQoa2V5KTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgdXBkYXRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRmb3IgKGNvbnN0IGtleSBvZiBmcm9tS2V5cykge1xuXHRcdGlmIChyZW1vdmVkLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUxOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdID0gZnJvbS5nZXQoa2V5KSEubWFwKGtleWJpbmRpbmcgPT4gKHsgLi4ua2V5YmluZGluZywgLi4ueyBrZXkgfSB9KSk7XG5cdFx0Y29uc3QgdmFsdWUyOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdID0gdG8uZ2V0KGtleSkhLm1hcChrZXliaW5kaW5nID0+ICh7IC4uLmtleWJpbmRpbmcsIC4uLnsga2V5IH0gfSkpO1xuXHRcdGlmICghZXF1YWxzKHZhbHVlMSwgdmFsdWUyLCAoYSwgYikgPT4gaXNTYW1lS2V5YmluZGluZyhhLCBiKSkpIHtcblx0XHRcdHVwZGF0ZWQuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUJ5Q29tbWFuZChmcm9tOiBNYXA8c3RyaW5nLCBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdPiwgdG86IE1hcDxzdHJpbmcsIElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10+LCBub3JtYWxpemVkS2V5czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPik6IElDb21wYXJlUmVzdWx0IHtcblx0Y29uc3QgZnJvbUtleXMgPSBbLi4uZnJvbS5rZXlzKCldO1xuXHRjb25zdCB0b0tleXMgPSBbLi4udG8ua2V5cygpXTtcblx0Y29uc3QgYWRkZWQgPSB0b0tleXMuZmlsdGVyKGtleSA9PiAhZnJvbUtleXMuaW5jbHVkZXMoa2V5KSkucmVkdWNlKChyLCBrZXkpID0+IHsgci5hZGQoa2V5KTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgcmVtb3ZlZCA9IGZyb21LZXlzLmZpbHRlcihrZXkgPT4gIXRvS2V5cy5pbmNsdWRlcyhrZXkpKS5yZWR1Y2UoKHIsIGtleSkgPT4geyByLmFkZChrZXkpOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCB1cGRhdGVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGZvciAoY29uc3Qga2V5IG9mIGZyb21LZXlzKSB7XG5cdFx0aWYgKHJlbW92ZWQuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZTE6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10gPSBmcm9tLmdldChrZXkpIS5tYXAoa2V5YmluZGluZyA9PiAoeyAuLi5rZXliaW5kaW5nLCAuLi57IGtleTogbm9ybWFsaXplZEtleXNba2V5YmluZGluZy5rZXldIH0gfSkpO1xuXHRcdGNvbnN0IHZhbHVlMjogSVVzZXJGcmllbmRseUtleWJpbmRpbmdbXSA9IHRvLmdldChrZXkpIS5tYXAoa2V5YmluZGluZyA9PiAoeyAuLi5rZXliaW5kaW5nLCAuLi57IGtleTogbm9ybWFsaXplZEtleXNba2V5YmluZGluZy5rZXldIH0gfSkpO1xuXHRcdGlmICghYXJlU2FtZUtleWJpbmRpbmdzV2l0aFNhbWVDb21tYW5kKHZhbHVlMSwgdmFsdWUyKSkge1xuXHRcdFx0dXBkYXRlZC5hZGQoa2V5KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCB9O1xufVxuXG5mdW5jdGlvbiBhcmVTYW1lS2V5YmluZGluZ3NXaXRoU2FtZUNvbW1hbmQodmFsdWUxOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdLCB2YWx1ZTI6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10pOiBib29sZWFuIHtcblx0Ly8gQ29tcGFyZSBlbnRyaWVzIGFkZGluZyBrZXliaW5kaW5nc1xuXHRpZiAoIWVxdWFscyh2YWx1ZTEuZmlsdGVyKCh7IGNvbW1hbmQgfSkgPT4gY29tbWFuZFswXSAhPT0gJy0nKSwgdmFsdWUyLmZpbHRlcigoeyBjb21tYW5kIH0pID0+IGNvbW1hbmRbMF0gIT09ICctJyksIChhLCBiKSA9PiBpc1NhbWVLZXliaW5kaW5nKGEsIGIpKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHQvLyBDb21wYXJlIGVudHJpZXMgcmVtb3Zpbmcga2V5YmluZGluZ3Ncblx0aWYgKCFlcXVhbHModmFsdWUxLmZpbHRlcigoeyBjb21tYW5kIH0pID0+IGNvbW1hbmRbMF0gPT09ICctJyksIHZhbHVlMi5maWx0ZXIoKHsgY29tbWFuZCB9KSA9PiBjb21tYW5kWzBdID09PSAnLScpLCAoYSwgYikgPT4gaXNTYW1lS2V5YmluZGluZyhhLCBiKSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzU2FtZUtleWJpbmRpbmcoYTogSVVzZXJGcmllbmRseUtleWJpbmRpbmcsIGI6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nKTogYm9vbGVhbiB7XG5cdGlmIChhLmNvbW1hbmQgIT09IGIuY29tbWFuZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoYS5rZXkgIT09IGIua2V5KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHdoZW5BID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoYS53aGVuKTtcblx0Y29uc3Qgd2hlbkIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShiLndoZW4pO1xuXHRpZiAoKHdoZW5BICYmICF3aGVuQikgfHwgKCF3aGVuQSAmJiB3aGVuQikpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHdoZW5BICYmIHdoZW5CICYmICF3aGVuQS5lcXVhbHMod2hlbkIpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghb2JqZWN0cy5lcXVhbHMoYS5hcmdzLCBiLmFyZ3MpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBhZGRLZXliaW5kaW5ncyhjb250ZW50OiBzdHJpbmcsIGtleWJpbmRpbmdzOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZ1tdLCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBzdHJpbmcge1xuXHRmb3IgKGNvbnN0IGtleWJpbmRpbmcgb2Yga2V5YmluZGluZ3MpIHtcblx0XHRjb250ZW50ID0gY29udGVudFV0aWwuZWRpdChjb250ZW50LCBbLTFdLCBrZXliaW5kaW5nLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdH1cblx0cmV0dXJuIGNvbnRlbnQ7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUtleWJpbmRpbmdzKGNvbnRlbnQ6IHN0cmluZywgY29tbWFuZDogc3RyaW5nLCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBzdHJpbmcge1xuXHRjb25zdCBrZXliaW5kaW5ncyA9IHBhcnNlS2V5YmluZGluZ3MoY29udGVudCk7XG5cdGZvciAobGV0IGluZGV4ID0ga2V5YmluZGluZ3MubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdGlmIChrZXliaW5kaW5nc1tpbmRleF0uY29tbWFuZCA9PT0gY29tbWFuZCB8fCBrZXliaW5kaW5nc1tpbmRleF0uY29tbWFuZCA9PT0gYC0ke2NvbW1hbmR9YCkge1xuXHRcdFx0Y29udGVudCA9IGNvbnRlbnRVdGlsLmVkaXQoY29udGVudCwgW2luZGV4XSwgdW5kZWZpbmVkLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVLZXliaW5kaW5ncyhjb250ZW50OiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZywga2V5YmluZGluZ3M6IElVc2VyRnJpZW5kbHlLZXliaW5kaW5nW10sIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyk6IHN0cmluZyB7XG5cdGNvbnN0IGFsbEtleWJpbmRpbmdzID0gcGFyc2VLZXliaW5kaW5ncyhjb250ZW50KTtcblx0Y29uc3QgbG9jYXRpb24gPSBhbGxLZXliaW5kaW5ncy5maW5kSW5kZXgoa2V5YmluZGluZyA9PiBrZXliaW5kaW5nLmNvbW1hbmQgPT09IGNvbW1hbmQgfHwga2V5YmluZGluZy5jb21tYW5kID09PSBgLSR7Y29tbWFuZH1gKTtcblx0Ly8gUmVtb3ZlIGFsbCBlbnRyaWVzIHdpdGggdGhpcyBjb21tYW5kXG5cdGZvciAobGV0IGluZGV4ID0gYWxsS2V5YmluZGluZ3MubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdGlmIChhbGxLZXliaW5kaW5nc1tpbmRleF0uY29tbWFuZCA9PT0gY29tbWFuZCB8fCBhbGxLZXliaW5kaW5nc1tpbmRleF0uY29tbWFuZCA9PT0gYC0ke2NvbW1hbmR9YCkge1xuXHRcdFx0Y29udGVudCA9IGNvbnRlbnRVdGlsLmVkaXQoY29udGVudCwgW2luZGV4XSwgdW5kZWZpbmVkLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cdC8vIGFkZCBhbGwgZW50cmllcyBhdCB0aGUgc2FtZSBsb2NhdGlvbiB3aGVyZSB0aGUgZW50cnkgd2l0aCB0aGlzIGNvbW1hbmQgd2FzIGxvY2F0ZWQuXG5cdGZvciAobGV0IGluZGV4ID0ga2V5YmluZGluZ3MubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdGNvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KGNvbnRlbnQsIFtsb2NhdGlvbl0sIGtleWJpbmRpbmdzW2luZGV4XSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxjQUFjO0FBRXZCLFNBQVMsYUFBYTtBQUV0QixZQUFZLGFBQWE7QUFDekIsU0FBUyxzQkFBc0I7QUFFL0IsWUFBWSxpQkFBaUI7QUFrQjdCLFNBQVMsaUJBQWlCLFNBQTRDO0FBQ3JFLFNBQU8sTUFBTSxPQUFPLEtBQUssQ0FBQztBQUMzQjtBQUVBLGVBQXNCLE1BQU0sY0FBc0IsZUFBdUIsYUFB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
