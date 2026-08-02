import { distinct } from "../../../base/common/arrays.js";
import { parse, visit } from "../../../base/common/json.js";
import { applyEdits, setProperty, withFormatting } from "../../../base/common/jsonEdit.js";
import { getEOL } from "../../../base/common/jsonFormatter.js";
import * as objects from "../../../base/common/objects.js";
import * as contentUtil from "./content.js";
import { getDisallowedIgnoredSettings } from "./userDataSync.js";
function getIgnoredSettings(defaultIgnoredSettings, configurationService, settingsContent) {
  let value = [];
  if (settingsContent) {
    value = getIgnoredSettingsFromContent(settingsContent);
  } else {
    value = getIgnoredSettingsFromConfig(configurationService);
  }
  const added = [], removed = [...getDisallowedIgnoredSettings()];
  if (Array.isArray(value)) {
    for (const key of value) {
      if (key.startsWith("-")) {
        removed.push(key.substring(1));
      } else {
        added.push(key);
      }
    }
  }
  return distinct([...defaultIgnoredSettings, ...added].filter((setting) => !removed.includes(setting)));
}
function getIgnoredSettingsFromConfig(configurationService) {
  let userValue = configurationService.inspect("settingsSync.ignoredSettings").userValue;
  if (userValue !== void 0) {
    return userValue;
  }
  userValue = configurationService.inspect("sync.ignoredSettings").userValue;
  if (userValue !== void 0) {
    return userValue;
  }
  return configurationService.getValue("settingsSync.ignoredSettings") || [];
}
function getIgnoredSettingsFromContent(settingsContent) {
  const parsed = parse(settingsContent);
  return parsed ? parsed["settingsSync.ignoredSettings"] || parsed["sync.ignoredSettings"] || [] : [];
}
function removeComments(content, formattingOptions) {
  const source = parse(content) || {};
  let result = "{}";
  for (const key of Object.keys(source)) {
    const edits = setProperty(result, [key], source[key], formattingOptions);
    result = applyEdits(result, edits);
  }
  return result;
}
function updateIgnoredSettings(targetContent, sourceContent, ignoredSettings, formattingOptions) {
  if (ignoredSettings.length) {
    const sourceTree = parseSettings(sourceContent);
    const source = parse(sourceContent) || {};
    const target = parse(targetContent);
    if (!target) {
      return targetContent;
    }
    const settingsToAdd = [];
    for (const key of ignoredSettings) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (sourceValue === void 0) {
        targetContent = contentUtil.edit(targetContent, [key], void 0, formattingOptions);
      } else if (targetValue !== void 0) {
        targetContent = contentUtil.edit(targetContent, [key], sourceValue, formattingOptions);
      } else {
        settingsToAdd.push(findSettingNode(key, sourceTree));
      }
    }
    settingsToAdd.sort((a, b) => a.startOffset - b.startOffset);
    settingsToAdd.forEach((s) => targetContent = addSetting(s.setting.key, sourceContent, targetContent, formattingOptions));
  }
  return targetContent;
}
function merge(originalLocalContent, originalRemoteContent, baseContent, ignoredSettings, resolvedConflicts, formattingOptions) {
  const localContentWithoutIgnoredSettings = updateIgnoredSettings(originalLocalContent, originalRemoteContent, ignoredSettings, formattingOptions);
  const localForwarded = baseContent !== localContentWithoutIgnoredSettings;
  const remoteForwarded = baseContent !== originalRemoteContent;
  if (!localForwarded && !remoteForwarded) {
    return { conflictsSettings: [], localContent: null, remoteContent: null, hasConflicts: false };
  }
  if (localForwarded && !remoteForwarded) {
    return { conflictsSettings: [], localContent: null, remoteContent: localContentWithoutIgnoredSettings, hasConflicts: false };
  }
  if (remoteForwarded && !localForwarded) {
    return { conflictsSettings: [], localContent: updateIgnoredSettings(originalRemoteContent, originalLocalContent, ignoredSettings, formattingOptions), remoteContent: null, hasConflicts: false };
  }
  if (baseContent === null && isEmpty(originalLocalContent)) {
    const localContent2 = areSame(originalLocalContent, originalRemoteContent, ignoredSettings) ? null : updateIgnoredSettings(originalRemoteContent, originalLocalContent, ignoredSettings, formattingOptions);
    return { conflictsSettings: [], localContent: localContent2, remoteContent: null, hasConflicts: false };
  }
  let localContent = originalLocalContent;
  let remoteContent = originalRemoteContent;
  const local = parse(originalLocalContent);
  const remote = parse(originalRemoteContent);
  const base = baseContent ? parse(baseContent) : null;
  const ignored = ignoredSettings.reduce((set, key) => {
    set.add(key);
    return set;
  }, /* @__PURE__ */ new Set());
  const localToRemote = compare(local, remote, ignored);
  const baseToLocal = compare(base, local, ignored);
  const baseToRemote = compare(base, remote, ignored);
  const conflicts = /* @__PURE__ */ new Map();
  const handledConflicts = /* @__PURE__ */ new Set();
  const handleConflict = (conflictKey) => {
    handledConflicts.add(conflictKey);
    const resolvedConflict = resolvedConflicts.filter(({ key }) => key === conflictKey)[0];
    if (resolvedConflict) {
      localContent = contentUtil.edit(localContent, [conflictKey], resolvedConflict.value, formattingOptions);
      remoteContent = contentUtil.edit(remoteContent, [conflictKey], resolvedConflict.value, formattingOptions);
    } else {
      conflicts.set(conflictKey, { key: conflictKey, localValue: local[conflictKey], remoteValue: remote[conflictKey] });
    }
  };
  for (const key of baseToLocal.removed.values()) {
    if (baseToRemote.updated.has(key)) {
      handleConflict(key);
    } else {
      remoteContent = contentUtil.edit(remoteContent, [key], void 0, formattingOptions);
    }
  }
  for (const key of baseToRemote.removed.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      handleConflict(key);
    } else {
      localContent = contentUtil.edit(localContent, [key], void 0, formattingOptions);
    }
  }
  for (const key of baseToLocal.updated.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToRemote.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      remoteContent = contentUtil.edit(remoteContent, [key], local[key], formattingOptions);
    }
  }
  for (const key of baseToRemote.updated.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToLocal.updated.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      localContent = contentUtil.edit(localContent, [key], remote[key], formattingOptions);
    }
  }
  for (const key of baseToLocal.added.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToRemote.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      remoteContent = addSetting(key, localContent, remoteContent, formattingOptions);
    }
  }
  for (const key of baseToRemote.added.values()) {
    if (handledConflicts.has(key)) {
      continue;
    }
    if (baseToLocal.added.has(key)) {
      if (localToRemote.updated.has(key)) {
        handleConflict(key);
      }
    } else {
      localContent = addSetting(key, remoteContent, localContent, formattingOptions);
    }
  }
  const hasConflicts = conflicts.size > 0 || !areSame(localContent, remoteContent, ignoredSettings);
  const hasLocalChanged = hasConflicts || !areSame(localContent, originalLocalContent, []);
  const hasRemoteChanged = hasConflicts || !areSame(remoteContent, originalRemoteContent, []);
  return { localContent: hasLocalChanged ? localContent : null, remoteContent: hasRemoteChanged ? remoteContent : null, conflictsSettings: [...conflicts.values()], hasConflicts };
}
function areSame(localContent, remoteContent, ignoredSettings) {
  if (localContent === remoteContent) {
    return true;
  }
  const local = parse(localContent);
  const remote = parse(remoteContent);
  const ignored = ignoredSettings.reduce((set, key) => {
    set.add(key);
    return set;
  }, /* @__PURE__ */ new Set());
  const localTree = parseSettings(localContent).filter((node) => !(node.setting && ignored.has(node.setting.key)));
  const remoteTree = parseSettings(remoteContent).filter((node) => !(node.setting && ignored.has(node.setting.key)));
  if (localTree.length !== remoteTree.length) {
    return false;
  }
  for (let index = 0; index < localTree.length; index++) {
    const localNode = localTree[index];
    const remoteNode = remoteTree[index];
    if (localNode.setting && remoteNode.setting) {
      if (localNode.setting.key !== remoteNode.setting.key) {
        return false;
      }
      if (!objects.equals(local[localNode.setting.key], remote[localNode.setting.key])) {
        return false;
      }
    } else if (!localNode.setting && !remoteNode.setting) {
      if (localNode.value !== remoteNode.value) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}
function isEmpty(content) {
  if (content) {
    const nodes = parseSettings(content);
    return nodes.length === 0;
  }
  return true;
}
function compare(from, to, ignored) {
  const fromKeys = from ? Object.keys(from).filter((key) => !ignored.has(key)) : [];
  const toKeys = Object.keys(to).filter((key) => !ignored.has(key));
  const added = toKeys.filter((key) => !fromKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const removed = fromKeys.filter((key) => !toKeys.includes(key)).reduce((r, key) => {
    r.add(key);
    return r;
  }, /* @__PURE__ */ new Set());
  const updated = /* @__PURE__ */ new Set();
  if (from) {
    for (const key of fromKeys) {
      if (removed.has(key)) {
        continue;
      }
      const value1 = from[key];
      const value2 = to[key];
      if (!objects.equals(value1, value2)) {
        updated.add(key);
      }
    }
  }
  return { added, removed, updated };
}
function addSetting(key, sourceContent, targetContent, formattingOptions) {
  const source = parse(sourceContent);
  const sourceTree = parseSettings(sourceContent);
  const targetTree = parseSettings(targetContent);
  const insertLocation = getInsertLocation(key, sourceTree, targetTree);
  return insertAtLocation(targetContent, key, source[key], insertLocation, targetTree, formattingOptions);
}
function getInsertLocation(key, sourceTree, targetTree) {
  const sourceNodeIndex = sourceTree.findIndex((node) => node.setting?.key === key);
  const sourcePreviousNode = sourceTree[sourceNodeIndex - 1];
  if (sourcePreviousNode) {
    if (sourcePreviousNode.setting) {
      const targetPreviousSetting = findSettingNode(sourcePreviousNode.setting.key, targetTree);
      if (targetPreviousSetting) {
        return { index: targetTree.indexOf(targetPreviousSetting), insertAfter: true };
      }
    } else {
      const sourcePreviousSettingNode = findPreviousSettingNode(sourceNodeIndex, sourceTree);
      if (sourcePreviousSettingNode) {
        const targetPreviousSetting = findSettingNode(sourcePreviousSettingNode.setting.key, targetTree);
        if (targetPreviousSetting) {
          const targetNextSetting = findNextSettingNode(targetTree.indexOf(targetPreviousSetting), targetTree);
          const sourceCommentNodes = findNodesBetween(sourceTree, sourcePreviousSettingNode, sourceTree[sourceNodeIndex]);
          if (targetNextSetting) {
            const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetNextSetting);
            const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes, targetCommentNodes);
            if (targetCommentNode) {
              return { index: targetTree.indexOf(targetCommentNode), insertAfter: true };
            } else {
              return { index: targetTree.indexOf(targetNextSetting), insertAfter: false };
            }
          } else {
            const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetTree[targetTree.length - 1]);
            const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes, targetCommentNodes);
            if (targetCommentNode) {
              return { index: targetTree.indexOf(targetCommentNode), insertAfter: true };
            } else {
              return { index: targetTree.length - 1, insertAfter: true };
            }
          }
        }
      }
    }
    const sourceNextNode = sourceTree[sourceNodeIndex + 1];
    if (sourceNextNode) {
      if (sourceNextNode.setting) {
        const targetNextSetting = findSettingNode(sourceNextNode.setting.key, targetTree);
        if (targetNextSetting) {
          return { index: targetTree.indexOf(targetNextSetting), insertAfter: false };
        }
      } else {
        const sourceNextSettingNode = findNextSettingNode(sourceNodeIndex, sourceTree);
        if (sourceNextSettingNode) {
          const targetNextSetting = findSettingNode(sourceNextSettingNode.setting.key, targetTree);
          if (targetNextSetting) {
            const targetPreviousSetting = findPreviousSettingNode(targetTree.indexOf(targetNextSetting), targetTree);
            const sourceCommentNodes = findNodesBetween(sourceTree, sourceTree[sourceNodeIndex], sourceNextSettingNode);
            if (targetPreviousSetting) {
              const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetNextSetting);
              const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes.reverse(), targetCommentNodes.reverse());
              if (targetCommentNode) {
                return { index: targetTree.indexOf(targetCommentNode), insertAfter: false };
              } else {
                return { index: targetTree.indexOf(targetPreviousSetting), insertAfter: true };
              }
            } else {
              const targetCommentNodes = findNodesBetween(targetTree, targetTree[0], targetNextSetting);
              const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes.reverse(), targetCommentNodes.reverse());
              if (targetCommentNode) {
                return { index: targetTree.indexOf(targetCommentNode), insertAfter: false };
              } else {
                return { index: 0, insertAfter: false };
              }
            }
          }
        }
      }
    }
  }
  return { index: targetTree.length - 1, insertAfter: true };
}
function insertAtLocation(content, key, value, location, tree, formattingOptions) {
  let edits;
  if (location.index === -1) {
    edits = setProperty(content, [key], value, formattingOptions);
  } else {
    edits = getEditToInsertAtLocation(content, key, value, location, tree, formattingOptions).map((edit) => withFormatting(content, edit, formattingOptions)[0]);
  }
  return applyEdits(content, edits);
}
function getEditToInsertAtLocation(content, key, value, location, tree, formattingOptions) {
  const newProperty = `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  const eol = getEOL(formattingOptions, content);
  const node = tree[location.index];
  if (location.insertAfter) {
    const edits = [];
    if (node.setting) {
      edits.push({ offset: node.endOffset, length: 0, content: "," + newProperty });
    } else {
      const nextSettingNode = findNextSettingNode(location.index, tree);
      const previousSettingNode = findPreviousSettingNode(location.index, tree);
      const previousSettingCommaOffset = previousSettingNode?.setting?.commaOffset;
      if (previousSettingNode && previousSettingCommaOffset === void 0) {
        edits.push({ offset: previousSettingNode.endOffset, length: 0, content: "," });
      }
      const isPreviouisSettingIncludesComment = previousSettingCommaOffset !== void 0 && previousSettingCommaOffset > node.endOffset;
      edits.push({
        offset: isPreviouisSettingIncludesComment ? previousSettingCommaOffset + 1 : node.endOffset,
        length: 0,
        content: nextSettingNode ? eol + newProperty + "," : eol + newProperty
      });
    }
    return edits;
  } else {
    if (node.setting) {
      return [{ offset: node.startOffset, length: 0, content: newProperty + "," }];
    }
    const content2 = (tree[location.index - 1] && !tree[location.index - 1].setting ? eol : "") + newProperty + (findNextSettingNode(location.index, tree) ? "," : "") + eol;
    return [{ offset: node.startOffset, length: 0, content: content2 }];
  }
}
function findSettingNode(key, tree) {
  return tree.filter((node) => node.setting?.key === key)[0];
}
function findPreviousSettingNode(index, tree) {
  for (let i = index - 1; i >= 0; i--) {
    if (tree[i].setting) {
      return tree[i];
    }
  }
  return void 0;
}
function findNextSettingNode(index, tree) {
  for (let i = index + 1; i < tree.length; i++) {
    if (tree[i].setting) {
      return tree[i];
    }
  }
  return void 0;
}
function findNodesBetween(nodes, from, till) {
  const fromIndex = nodes.indexOf(from);
  const tillIndex = nodes.indexOf(till);
  return nodes.filter((node, index) => fromIndex < index && index < tillIndex);
}
function findLastMatchingTargetCommentNode(sourceComments, targetComments) {
  if (sourceComments.length && targetComments.length) {
    let index = 0;
    for (; index < targetComments.length && index < sourceComments.length; index++) {
      if (sourceComments[index].value !== targetComments[index].value) {
        return targetComments[index - 1];
      }
    }
    return targetComments[index - 1];
  }
  return void 0;
}
function parseSettings(content) {
  const nodes = [];
  let hierarchyLevel = -1;
  let startOffset;
  let key;
  const visitor = {
    onObjectBegin: (offset) => {
      hierarchyLevel++;
    },
    onObjectProperty: (name, offset, length) => {
      if (hierarchyLevel === 0) {
        startOffset = offset;
        key = name;
      }
    },
    onObjectEnd: (offset, length) => {
      hierarchyLevel--;
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset,
          endOffset: offset + length,
          value: content.substring(startOffset, offset + length),
          setting: {
            key,
            commaOffset: void 0
          }
        });
      }
    },
    onArrayBegin: (offset, length) => {
      hierarchyLevel++;
    },
    onArrayEnd: (offset, length) => {
      hierarchyLevel--;
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset,
          endOffset: offset + length,
          value: content.substring(startOffset, offset + length),
          setting: {
            key,
            commaOffset: void 0
          }
        });
      }
    },
    onLiteralValue: (value, offset, length) => {
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset,
          endOffset: offset + length,
          value: content.substring(startOffset, offset + length),
          setting: {
            key,
            commaOffset: void 0
          }
        });
      }
    },
    onSeparator: (sep, offset, length) => {
      if (hierarchyLevel === 0) {
        if (sep === ",") {
          let index = nodes.length - 1;
          for (; index >= 0; index--) {
            if (nodes[index].setting) {
              break;
            }
          }
          const node = nodes[index];
          if (node) {
            nodes.splice(index, 1, {
              startOffset: node.startOffset,
              endOffset: node.endOffset,
              value: node.value,
              setting: {
                key: node.setting.key,
                commaOffset: offset
              }
            });
          }
        }
      }
    },
    onComment: (offset, length) => {
      if (hierarchyLevel === 0) {
        nodes.push({
          startOffset: offset,
          endOffset: offset + length,
          value: content.substring(offset, offset + length)
        });
      }
    }
  };
  visit(content, visitor);
  return nodes;
}
export {
  addSetting,
  getIgnoredSettings,
  isEmpty,
  merge,
  removeComments,
  updateIgnoredSettings
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vc2V0dGluZ3NNZXJnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSlNPTlZpc2l0b3IsIHBhcnNlLCB2aXNpdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgYXBwbHlFZGl0cywgc2V0UHJvcGVydHksIHdpdGhGb3JtYXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVkaXQuanMnO1xuaW1wb3J0IHsgRWRpdCwgRm9ybWF0dGluZ09wdGlvbnMsIGdldEVPTCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0ICogYXMgY29udGVudFV0aWwgZnJvbSAnLi9jb250ZW50LmpzJztcbmltcG9ydCB7IGdldERpc2FsbG93ZWRJZ25vcmVkU2V0dGluZ3MsIElDb25mbGljdFNldHRpbmcgfSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lcmdlUmVzdWx0IHtcblx0bG9jYWxDb250ZW50OiBzdHJpbmcgfCBudWxsO1xuXHRyZW1vdGVDb250ZW50OiBzdHJpbmcgfCBudWxsO1xuXHRoYXNDb25mbGljdHM6IGJvb2xlYW47XG5cdGNvbmZsaWN0c1NldHRpbmdzOiBJQ29uZmxpY3RTZXR0aW5nW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRJZ25vcmVkU2V0dGluZ3MoZGVmYXVsdElnbm9yZWRTZXR0aW5nczogc3RyaW5nW10sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHNldHRpbmdzQ29udGVudD86IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0bGV0IHZhbHVlOiBSZWFkb25seUFycmF5PHN0cmluZz4gPSBbXTtcblx0aWYgKHNldHRpbmdzQ29udGVudCkge1xuXHRcdHZhbHVlID0gZ2V0SWdub3JlZFNldHRpbmdzRnJvbUNvbnRlbnQoc2V0dGluZ3NDb250ZW50KTtcblx0fSBlbHNlIHtcblx0XHR2YWx1ZSA9IGdldElnbm9yZWRTZXR0aW5nc0Zyb21Db25maWcoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cdGNvbnN0IGFkZGVkOiBzdHJpbmdbXSA9IFtdLCByZW1vdmVkOiBzdHJpbmdbXSA9IFsuLi5nZXREaXNhbGxvd2VkSWdub3JlZFNldHRpbmdzKCldO1xuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB2YWx1ZSkge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKCctJykpIHtcblx0XHRcdFx0cmVtb3ZlZC5wdXNoKGtleS5zdWJzdHJpbmcoMSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWRkZWQucHVzaChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gZGlzdGluY3QoWy4uLmRlZmF1bHRJZ25vcmVkU2V0dGluZ3MsIC4uLmFkZGVkLF0uZmlsdGVyKHNldHRpbmcgPT4gIXJlbW92ZWQuaW5jbHVkZXMoc2V0dGluZykpKTtcbn1cblxuZnVuY3Rpb24gZ2V0SWdub3JlZFNldHRpbmdzRnJvbUNvbmZpZyhjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogUmVhZG9ubHlBcnJheTxzdHJpbmc+IHtcblx0bGV0IHVzZXJWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nW10+KCdzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzJykudXNlclZhbHVlO1xuXHRpZiAodXNlclZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdXNlclZhbHVlO1xuXHR9XG5cdHVzZXJWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nW10+KCdzeW5jLmlnbm9yZWRTZXR0aW5ncycpLnVzZXJWYWx1ZTtcblx0aWYgKHVzZXJWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVzZXJWYWx1ZTtcblx0fVxuXHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KCdzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzJykgfHwgW107XG59XG5cbmZ1bmN0aW9uIGdldElnbm9yZWRTZXR0aW5nc0Zyb21Db250ZW50KHNldHRpbmdzQ29udGVudDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCBwYXJzZWQgPSBwYXJzZShzZXR0aW5nc0NvbnRlbnQpO1xuXHRyZXR1cm4gcGFyc2VkID8gcGFyc2VkWydzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzJ10gfHwgcGFyc2VkWydzeW5jLmlnbm9yZWRTZXR0aW5ncyddIHx8IFtdIDogW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVDb21tZW50cyhjb250ZW50OiBzdHJpbmcsIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyk6IHN0cmluZyB7XG5cdGNvbnN0IHNvdXJjZSA9IHBhcnNlKGNvbnRlbnQpIHx8IHt9O1xuXHRsZXQgcmVzdWx0ID0gJ3t9Jztcblx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc291cmNlKSkge1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkocmVzdWx0LCBba2V5XSwgc291cmNlW2tleV0sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRyZXN1bHQgPSBhcHBseUVkaXRzKHJlc3VsdCwgZWRpdHMpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVJZ25vcmVkU2V0dGluZ3ModGFyZ2V0Q29udGVudDogc3RyaW5nLCBzb3VyY2VDb250ZW50OiBzdHJpbmcsIGlnbm9yZWRTZXR0aW5nczogc3RyaW5nW10sIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyk6IHN0cmluZyB7XG5cdGlmIChpZ25vcmVkU2V0dGluZ3MubGVuZ3RoKSB7XG5cdFx0Y29uc3Qgc291cmNlVHJlZSA9IHBhcnNlU2V0dGluZ3Moc291cmNlQ29udGVudCk7XG5cdFx0Y29uc3Qgc291cmNlID0gcGFyc2Uoc291cmNlQ29udGVudCkgfHwge307XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcGFyc2UodGFyZ2V0Q29udGVudCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB0YXJnZXRDb250ZW50O1xuXHRcdH1cblx0XHRjb25zdCBzZXR0aW5nc1RvQWRkOiBJTm9kZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgaWdub3JlZFNldHRpbmdzKSB7XG5cdFx0XHRjb25zdCBzb3VyY2VWYWx1ZSA9IHNvdXJjZVtrZXldO1xuXHRcdFx0Y29uc3QgdGFyZ2V0VmFsdWUgPSB0YXJnZXRba2V5XTtcblxuXHRcdFx0Ly8gUmVtb3ZlIGluIHRhcmdldFxuXHRcdFx0aWYgKHNvdXJjZVZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGFyZ2V0Q29udGVudCA9IGNvbnRlbnRVdGlsLmVkaXQodGFyZ2V0Q29udGVudCwgW2tleV0sIHVuZGVmaW5lZCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgaW4gdGFyZ2V0XG5cdFx0XHRlbHNlIGlmICh0YXJnZXRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRhcmdldENvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KHRhcmdldENvbnRlbnQsIFtrZXldLCBzb3VyY2VWYWx1ZSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0c2V0dGluZ3NUb0FkZC5wdXNoKGZpbmRTZXR0aW5nTm9kZShrZXksIHNvdXJjZVRyZWUpISk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2V0dGluZ3NUb0FkZC5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0T2Zmc2V0IC0gYi5zdGFydE9mZnNldCk7XG5cdFx0c2V0dGluZ3NUb0FkZC5mb3JFYWNoKHMgPT4gdGFyZ2V0Q29udGVudCA9IGFkZFNldHRpbmcocy5zZXR0aW5nIS5rZXksIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKSk7XG5cdH1cblx0cmV0dXJuIHRhcmdldENvbnRlbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZShvcmlnaW5hbExvY2FsQ29udGVudDogc3RyaW5nLCBvcmlnaW5hbFJlbW90ZUNvbnRlbnQ6IHN0cmluZywgYmFzZUNvbnRlbnQ6IHN0cmluZyB8IG51bGwsIGlnbm9yZWRTZXR0aW5nczogc3RyaW5nW10sIHJlc29sdmVkQ29uZmxpY3RzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogYW55IHwgdW5kZWZpbmVkIH1bXSwgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogSU1lcmdlUmVzdWx0IHtcblxuXHRjb25zdCBsb2NhbENvbnRlbnRXaXRob3V0SWdub3JlZFNldHRpbmdzID0gdXBkYXRlSWdub3JlZFNldHRpbmdzKG9yaWdpbmFsTG9jYWxDb250ZW50LCBvcmlnaW5hbFJlbW90ZUNvbnRlbnQsIGlnbm9yZWRTZXR0aW5ncywgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRjb25zdCBsb2NhbEZvcndhcmRlZCA9IGJhc2VDb250ZW50ICE9PSBsb2NhbENvbnRlbnRXaXRob3V0SWdub3JlZFNldHRpbmdzO1xuXHRjb25zdCByZW1vdGVGb3J3YXJkZWQgPSBiYXNlQ29udGVudCAhPT0gb3JpZ2luYWxSZW1vdGVDb250ZW50O1xuXG5cdC8qIG5vIGNoYW5nZXMgKi9cblx0aWYgKCFsb2NhbEZvcndhcmRlZCAmJiAhcmVtb3RlRm9yd2FyZGVkKSB7XG5cdFx0cmV0dXJuIHsgY29uZmxpY3RzU2V0dGluZ3M6IFtdLCBsb2NhbENvbnRlbnQ6IG51bGwsIHJlbW90ZUNvbnRlbnQ6IG51bGwsIGhhc0NvbmZsaWN0czogZmFsc2UgfTtcblx0fVxuXG5cdC8qIGxvY2FsIGhhcyBjaGFuZ2VkIGFuZCByZW1vdGUgaGFzIG5vdCAqL1xuXHRpZiAobG9jYWxGb3J3YXJkZWQgJiYgIXJlbW90ZUZvcndhcmRlZCkge1xuXHRcdHJldHVybiB7IGNvbmZsaWN0c1NldHRpbmdzOiBbXSwgbG9jYWxDb250ZW50OiBudWxsLCByZW1vdGVDb250ZW50OiBsb2NhbENvbnRlbnRXaXRob3V0SWdub3JlZFNldHRpbmdzLCBoYXNDb25mbGljdHM6IGZhbHNlIH07XG5cdH1cblxuXHQvKiByZW1vdGUgaGFzIGNoYW5nZWQgYW5kIGxvY2FsIGhhcyBub3QgKi9cblx0aWYgKHJlbW90ZUZvcndhcmRlZCAmJiAhbG9jYWxGb3J3YXJkZWQpIHtcblx0XHRyZXR1cm4geyBjb25mbGljdHNTZXR0aW5nczogW10sIGxvY2FsQ29udGVudDogdXBkYXRlSWdub3JlZFNldHRpbmdzKG9yaWdpbmFsUmVtb3RlQ29udGVudCwgb3JpZ2luYWxMb2NhbENvbnRlbnQsIGlnbm9yZWRTZXR0aW5ncywgZm9ybWF0dGluZ09wdGlvbnMpLCByZW1vdGVDb250ZW50OiBudWxsLCBoYXNDb25mbGljdHM6IGZhbHNlIH07XG5cdH1cblxuXHQvKiBsb2NhbCBpcyBlbXB0eSBhbmQgbm90IHN5bmNlZCBiZWZvcmUgKi9cblx0aWYgKGJhc2VDb250ZW50ID09PSBudWxsICYmIGlzRW1wdHkob3JpZ2luYWxMb2NhbENvbnRlbnQpKSB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gYXJlU2FtZShvcmlnaW5hbExvY2FsQ29udGVudCwgb3JpZ2luYWxSZW1vdGVDb250ZW50LCBpZ25vcmVkU2V0dGluZ3MpID8gbnVsbCA6IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhvcmlnaW5hbFJlbW90ZUNvbnRlbnQsIG9yaWdpbmFsTG9jYWxDb250ZW50LCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRyZXR1cm4geyBjb25mbGljdHNTZXR0aW5nczogW10sIGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudDogbnVsbCwgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHR9XG5cblx0LyogcmVtb3RlIGFuZCBsb2NhbCBoYXMgY2hhbmdlZCAqL1xuXHRsZXQgbG9jYWxDb250ZW50ID0gb3JpZ2luYWxMb2NhbENvbnRlbnQ7XG5cdGxldCByZW1vdGVDb250ZW50ID0gb3JpZ2luYWxSZW1vdGVDb250ZW50O1xuXHRjb25zdCBsb2NhbCA9IHBhcnNlKG9yaWdpbmFsTG9jYWxDb250ZW50KTtcblx0Y29uc3QgcmVtb3RlID0gcGFyc2Uob3JpZ2luYWxSZW1vdGVDb250ZW50KTtcblx0Y29uc3QgYmFzZSA9IGJhc2VDb250ZW50ID8gcGFyc2UoYmFzZUNvbnRlbnQpIDogbnVsbDtcblxuXHRjb25zdCBpZ25vcmVkID0gaWdub3JlZFNldHRpbmdzLnJlZHVjZSgoc2V0LCBrZXkpID0+IHsgc2V0LmFkZChrZXkpOyByZXR1cm4gc2V0OyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IGxvY2FsVG9SZW1vdGUgPSBjb21wYXJlKGxvY2FsLCByZW1vdGUsIGlnbm9yZWQpO1xuXHRjb25zdCBiYXNlVG9Mb2NhbCA9IGNvbXBhcmUoYmFzZSwgbG9jYWwsIGlnbm9yZWQpO1xuXHRjb25zdCBiYXNlVG9SZW1vdGUgPSBjb21wYXJlKGJhc2UsIHJlbW90ZSwgaWdub3JlZCk7XG5cblx0Y29uc3QgY29uZmxpY3RzOiBNYXA8c3RyaW5nLCBJQ29uZmxpY3RTZXR0aW5nPiA9IG5ldyBNYXA8c3RyaW5nLCBJQ29uZmxpY3RTZXR0aW5nPigpO1xuXHRjb25zdCBoYW5kbGVkQ29uZmxpY3RzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBoYW5kbGVDb25mbGljdCA9IChjb25mbGljdEtleTogc3RyaW5nKTogdm9pZCA9PiB7XG5cdFx0aGFuZGxlZENvbmZsaWN0cy5hZGQoY29uZmxpY3RLZXkpO1xuXHRcdGNvbnN0IHJlc29sdmVkQ29uZmxpY3QgPSByZXNvbHZlZENvbmZsaWN0cy5maWx0ZXIoKHsga2V5IH0pID0+IGtleSA9PT0gY29uZmxpY3RLZXkpWzBdO1xuXHRcdGlmIChyZXNvbHZlZENvbmZsaWN0KSB7XG5cdFx0XHRsb2NhbENvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KGxvY2FsQ29udGVudCwgW2NvbmZsaWN0S2V5XSwgcmVzb2x2ZWRDb25mbGljdC52YWx1ZSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdFx0cmVtb3RlQ29udGVudCA9IGNvbnRlbnRVdGlsLmVkaXQocmVtb3RlQ29udGVudCwgW2NvbmZsaWN0S2V5XSwgcmVzb2x2ZWRDb25mbGljdC52YWx1ZSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25mbGljdHMuc2V0KGNvbmZsaWN0S2V5LCB7IGtleTogY29uZmxpY3RLZXksIGxvY2FsVmFsdWU6IGxvY2FsW2NvbmZsaWN0S2V5XSwgcmVtb3RlVmFsdWU6IHJlbW90ZVtjb25mbGljdEtleV0gfSk7XG5cdFx0fVxuXHR9O1xuXG5cdC8vIFJlbW92ZWQgc2V0dGluZ3MgaW4gTG9jYWxcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvTG9jYWwucmVtb3ZlZC52YWx1ZXMoKSkge1xuXHRcdC8vIENvbmZsaWN0IC0gR290IHVwZGF0ZWQgaW4gcmVtb3RlLlxuXHRcdGlmIChiYXNlVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0aGFuZGxlQ29uZmxpY3Qoa2V5KTtcblx0XHR9XG5cdFx0Ly8gQWxzbyByZW1vdmUgaW4gcmVtb3RlXG5cdFx0ZWxzZSB7XG5cdFx0XHRyZW1vdGVDb250ZW50ID0gY29udGVudFV0aWwuZWRpdChyZW1vdGVDb250ZW50LCBba2V5XSwgdW5kZWZpbmVkLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gUmVtb3ZlZCBzZXR0aW5ncyBpbiBSZW1vdGVcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvUmVtb3RlLnJlbW92ZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoaGFuZGxlZENvbmZsaWN0cy5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIENvbmZsaWN0IC0gR290IHVwZGF0ZWQgaW4gbG9jYWxcblx0XHRpZiAoYmFzZVRvTG9jYWwudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0aGFuZGxlQ29uZmxpY3Qoa2V5KTtcblx0XHR9XG5cdFx0Ly8gQWxzbyByZW1vdmUgaW4gbG9jYWxzXG5cdFx0ZWxzZSB7XG5cdFx0XHRsb2NhbENvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KGxvY2FsQ29udGVudCwgW2tleV0sIHVuZGVmaW5lZCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFVwZGF0ZWQgc2V0dGluZ3MgaW4gTG9jYWxcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvTG9jYWwudXBkYXRlZC52YWx1ZXMoKSkge1xuXHRcdGlmIChoYW5kbGVkQ29uZmxpY3RzLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8gR290IHVwZGF0ZWQgaW4gcmVtb3RlXG5cdFx0aWYgKGJhc2VUb1JlbW90ZS51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHQvLyBIYXMgZGlmZmVyZW50IHZhbHVlXG5cdFx0XHRpZiAobG9jYWxUb1JlbW90ZS51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGhhbmRsZUNvbmZsaWN0KGtleSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbW90ZUNvbnRlbnQgPSBjb250ZW50VXRpbC5lZGl0KHJlbW90ZUNvbnRlbnQsIFtrZXldLCBsb2NhbFtrZXldLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gVXBkYXRlZCBzZXR0aW5ncyBpbiBSZW1vdGVcblx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvUmVtb3RlLnVwZGF0ZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoaGFuZGxlZENvbmZsaWN0cy5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIEdvdCB1cGRhdGVkIGluIGxvY2FsXG5cdFx0aWYgKGJhc2VUb0xvY2FsLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdC8vIEhhcyBkaWZmZXJlbnQgdmFsdWVcblx0XHRcdGlmIChsb2NhbFRvUmVtb3RlLnVwZGF0ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0aGFuZGxlQ29uZmxpY3Qoa2V5KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9jYWxDb250ZW50ID0gY29udGVudFV0aWwuZWRpdChsb2NhbENvbnRlbnQsIFtrZXldLCByZW1vdGVba2V5XSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEFkZGVkIHNldHRpbmdzIGluIExvY2FsXG5cdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb0xvY2FsLmFkZGVkLnZhbHVlcygpKSB7XG5cdFx0aWYgKGhhbmRsZWRDb25mbGljdHMuaGFzKGtleSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBHb3QgYWRkZWQgaW4gcmVtb3RlXG5cdFx0aWYgKGJhc2VUb1JlbW90ZS5hZGRlZC5oYXMoa2V5KSkge1xuXHRcdFx0Ly8gSGFzIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRoYW5kbGVDb25mbGljdChrZXkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZW1vdGVDb250ZW50ID0gYWRkU2V0dGluZyhrZXksIGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEFkZGVkIHNldHRpbmdzIGluIHJlbW90ZVxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9SZW1vdGUuYWRkZWQudmFsdWVzKCkpIHtcblx0XHRpZiAoaGFuZGxlZENvbmZsaWN0cy5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIEdvdCBhZGRlZCBpbiBsb2NhbFxuXHRcdGlmIChiYXNlVG9Mb2NhbC5hZGRlZC5oYXMoa2V5KSkge1xuXHRcdFx0Ly8gSGFzIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0aWYgKGxvY2FsVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRoYW5kbGVDb25mbGljdChrZXkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2NhbENvbnRlbnQgPSBhZGRTZXR0aW5nKGtleSwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgaGFzQ29uZmxpY3RzID0gY29uZmxpY3RzLnNpemUgPiAwIHx8ICFhcmVTYW1lKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgaWdub3JlZFNldHRpbmdzKTtcblx0Y29uc3QgaGFzTG9jYWxDaGFuZ2VkID0gaGFzQ29uZmxpY3RzIHx8ICFhcmVTYW1lKGxvY2FsQ29udGVudCwgb3JpZ2luYWxMb2NhbENvbnRlbnQsIFtdKTtcblx0Y29uc3QgaGFzUmVtb3RlQ2hhbmdlZCA9IGhhc0NvbmZsaWN0cyB8fCAhYXJlU2FtZShyZW1vdGVDb250ZW50LCBvcmlnaW5hbFJlbW90ZUNvbnRlbnQsIFtdKTtcblx0cmV0dXJuIHsgbG9jYWxDb250ZW50OiBoYXNMb2NhbENoYW5nZWQgPyBsb2NhbENvbnRlbnQgOiBudWxsLCByZW1vdGVDb250ZW50OiBoYXNSZW1vdGVDaGFuZ2VkID8gcmVtb3RlQ29udGVudCA6IG51bGwsIGNvbmZsaWN0c1NldHRpbmdzOiBbLi4uY29uZmxpY3RzLnZhbHVlcygpXSwgaGFzQ29uZmxpY3RzIH07XG59XG5cbmZ1bmN0aW9uIGFyZVNhbWUobG9jYWxDb250ZW50OiBzdHJpbmcsIHJlbW90ZUNvbnRlbnQ6IHN0cmluZywgaWdub3JlZFNldHRpbmdzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRpZiAobG9jYWxDb250ZW50ID09PSByZW1vdGVDb250ZW50KSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBsb2NhbCA9IHBhcnNlKGxvY2FsQ29udGVudCk7XG5cdGNvbnN0IHJlbW90ZSA9IHBhcnNlKHJlbW90ZUNvbnRlbnQpO1xuXHRjb25zdCBpZ25vcmVkID0gaWdub3JlZFNldHRpbmdzLnJlZHVjZSgoc2V0LCBrZXkpID0+IHsgc2V0LmFkZChrZXkpOyByZXR1cm4gc2V0OyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IGxvY2FsVHJlZSA9IHBhcnNlU2V0dGluZ3MobG9jYWxDb250ZW50KS5maWx0ZXIobm9kZSA9PiAhKG5vZGUuc2V0dGluZyAmJiBpZ25vcmVkLmhhcyhub2RlLnNldHRpbmcua2V5KSkpO1xuXHRjb25zdCByZW1vdGVUcmVlID0gcGFyc2VTZXR0aW5ncyhyZW1vdGVDb250ZW50KS5maWx0ZXIobm9kZSA9PiAhKG5vZGUuc2V0dGluZyAmJiBpZ25vcmVkLmhhcyhub2RlLnNldHRpbmcua2V5KSkpO1xuXG5cdGlmIChsb2NhbFRyZWUubGVuZ3RoICE9PSByZW1vdGVUcmVlLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBsb2NhbFRyZWUubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3QgbG9jYWxOb2RlID0gbG9jYWxUcmVlW2luZGV4XTtcblx0XHRjb25zdCByZW1vdGVOb2RlID0gcmVtb3RlVHJlZVtpbmRleF07XG5cdFx0aWYgKGxvY2FsTm9kZS5zZXR0aW5nICYmIHJlbW90ZU5vZGUuc2V0dGluZykge1xuXHRcdFx0aWYgKGxvY2FsTm9kZS5zZXR0aW5nLmtleSAhPT0gcmVtb3RlTm9kZS5zZXR0aW5nLmtleSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW9iamVjdHMuZXF1YWxzKGxvY2FsW2xvY2FsTm9kZS5zZXR0aW5nLmtleV0sIHJlbW90ZVtsb2NhbE5vZGUuc2V0dGluZy5rZXldKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghbG9jYWxOb2RlLnNldHRpbmcgJiYgIXJlbW90ZU5vZGUuc2V0dGluZykge1xuXHRcdFx0aWYgKGxvY2FsTm9kZS52YWx1ZSAhPT0gcmVtb3RlTm9kZS52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHkoY29udGVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChjb250ZW50KSB7XG5cdFx0Y29uc3Qgbm9kZXMgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdHJldHVybiBub2Rlcy5sZW5ndGggPT09IDA7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmUoZnJvbTogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiB8IG51bGwsIHRvOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+LCBpZ25vcmVkOiBTZXQ8c3RyaW5nPik6IHsgYWRkZWQ6IFNldDxzdHJpbmc+OyByZW1vdmVkOiBTZXQ8c3RyaW5nPjsgdXBkYXRlZDogU2V0PHN0cmluZz4gfSB7XG5cdGNvbnN0IGZyb21LZXlzID0gZnJvbSA/IE9iamVjdC5rZXlzKGZyb20pLmZpbHRlcihrZXkgPT4gIWlnbm9yZWQuaGFzKGtleSkpIDogW107XG5cdGNvbnN0IHRvS2V5cyA9IE9iamVjdC5rZXlzKHRvKS5maWx0ZXIoa2V5ID0+ICFpZ25vcmVkLmhhcyhrZXkpKTtcblx0Y29uc3QgYWRkZWQgPSB0b0tleXMuZmlsdGVyKGtleSA9PiAhZnJvbUtleXMuaW5jbHVkZXMoa2V5KSkucmVkdWNlKChyLCBrZXkpID0+IHsgci5hZGQoa2V5KTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgcmVtb3ZlZCA9IGZyb21LZXlzLmZpbHRlcihrZXkgPT4gIXRvS2V5cy5pbmNsdWRlcyhrZXkpKS5yZWR1Y2UoKHIsIGtleSkgPT4geyByLmFkZChrZXkpOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCB1cGRhdGVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGlmIChmcm9tKSB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgZnJvbUtleXMpIHtcblx0XHRcdGlmIChyZW1vdmVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFsdWUxID0gZnJvbVtrZXldO1xuXHRcdFx0Y29uc3QgdmFsdWUyID0gdG9ba2V5XTtcblx0XHRcdGlmICghb2JqZWN0cy5lcXVhbHModmFsdWUxLCB2YWx1ZTIpKSB7XG5cdFx0XHRcdHVwZGF0ZWQuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFNldHRpbmcoa2V5OiBzdHJpbmcsIHNvdXJjZUNvbnRlbnQ6IHN0cmluZywgdGFyZ2V0Q29udGVudDogc3RyaW5nLCBmb3JtYXR0aW5nT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBzdHJpbmcge1xuXHRjb25zdCBzb3VyY2UgPSBwYXJzZShzb3VyY2VDb250ZW50KTtcblx0Y29uc3Qgc291cmNlVHJlZSA9IHBhcnNlU2V0dGluZ3Moc291cmNlQ29udGVudCk7XG5cdGNvbnN0IHRhcmdldFRyZWUgPSBwYXJzZVNldHRpbmdzKHRhcmdldENvbnRlbnQpO1xuXHRjb25zdCBpbnNlcnRMb2NhdGlvbiA9IGdldEluc2VydExvY2F0aW9uKGtleSwgc291cmNlVHJlZSwgdGFyZ2V0VHJlZSk7XG5cdHJldHVybiBpbnNlcnRBdExvY2F0aW9uKHRhcmdldENvbnRlbnQsIGtleSwgc291cmNlW2tleV0sIGluc2VydExvY2F0aW9uLCB0YXJnZXRUcmVlLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG59XG5cbmludGVyZmFjZSBJbnNlcnRMb2NhdGlvbiB7XG5cdGluZGV4OiBudW1iZXI7XG5cdGluc2VydEFmdGVyOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBnZXRJbnNlcnRMb2NhdGlvbihrZXk6IHN0cmluZywgc291cmNlVHJlZTogSU5vZGVbXSwgdGFyZ2V0VHJlZTogSU5vZGVbXSk6IEluc2VydExvY2F0aW9uIHtcblxuXHRjb25zdCBzb3VyY2VOb2RlSW5kZXggPSBzb3VyY2VUcmVlLmZpbmRJbmRleChub2RlID0+IG5vZGUuc2V0dGluZz8ua2V5ID09PSBrZXkpO1xuXG5cdGNvbnN0IHNvdXJjZVByZXZpb3VzTm9kZTogSU5vZGUgPSBzb3VyY2VUcmVlW3NvdXJjZU5vZGVJbmRleCAtIDFdO1xuXHRpZiAoc291cmNlUHJldmlvdXNOb2RlKSB7XG5cdFx0Lypcblx0XHRcdFByZXZpb3VzIG5vZGUgaW4gc291cmNlIGlzIGEgc2V0dGluZy5cblx0XHRcdEZpbmQgdGhlIHNhbWUgc2V0dGluZyBpbiB0aGUgdGFyZ2V0LlxuXHRcdFx0SW5zZXJ0IGl0IGFmdGVyIHRoYXQgc2V0dGluZ1xuXHRcdCovXG5cdFx0aWYgKHNvdXJjZVByZXZpb3VzTm9kZS5zZXR0aW5nKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRQcmV2aW91c1NldHRpbmcgPSBmaW5kU2V0dGluZ05vZGUoc291cmNlUHJldmlvdXNOb2RlLnNldHRpbmcua2V5LCB0YXJnZXRUcmVlKTtcblx0XHRcdGlmICh0YXJnZXRQcmV2aW91c1NldHRpbmcpIHtcblx0XHRcdFx0LyogSW5zZXJ0IGFmdGVyIHRhcmdldCdzIHByZXZpb3VzIHNldHRpbmcgKi9cblx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXRQcmV2aW91c1NldHRpbmcpLCBpbnNlcnRBZnRlcjogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvKiBQcmV2aW91cyBub2RlIGluIHNvdXJjZSBpcyBhIGNvbW1lbnQgKi9cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IHNvdXJjZVByZXZpb3VzU2V0dGluZ05vZGUgPSBmaW5kUHJldmlvdXNTZXR0aW5nTm9kZShzb3VyY2VOb2RlSW5kZXgsIHNvdXJjZVRyZWUpO1xuXHRcdFx0Lypcblx0XHRcdFx0U291cmNlIGhhcyBhIHNldHRpbmcgZGVmaW5lZCBiZWZvcmUgdGhlIHNldHRpbmcgdG8gYmUgYWRkZWQuXG5cdFx0XHRcdEZpbmQgdGhlIHNhbWUgcHJldmlvdXMgc2V0dGluZyBpbiB0aGUgdGFyZ2V0LlxuXHRcdFx0XHRJZiBmb3VuZCwgaW5zZXJ0IGJlZm9yZSBpdHMgbmV4dCBzZXR0aW5nIHNvIHRoYXQgY29tbWVudHMgYXJlIHJldHJpZXZlZC5cblx0XHRcdFx0T3RoZXJ3aXNlLCBpbnNlcnQgYXQgdGhlIGVuZC5cblx0XHRcdCovXG5cdFx0XHRpZiAoc291cmNlUHJldmlvdXNTZXR0aW5nTm9kZSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRQcmV2aW91c1NldHRpbmcgPSBmaW5kU2V0dGluZ05vZGUoc291cmNlUHJldmlvdXNTZXR0aW5nTm9kZS5zZXR0aW5nIS5rZXksIHRhcmdldFRyZWUpO1xuXHRcdFx0XHRpZiAodGFyZ2V0UHJldmlvdXNTZXR0aW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0TmV4dFNldHRpbmcgPSBmaW5kTmV4dFNldHRpbmdOb2RlKHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXRQcmV2aW91c1NldHRpbmcpLCB0YXJnZXRUcmVlKTtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2VDb21tZW50Tm9kZXMgPSBmaW5kTm9kZXNCZXR3ZWVuKHNvdXJjZVRyZWUsIHNvdXJjZVByZXZpb3VzU2V0dGluZ05vZGUsIHNvdXJjZVRyZWVbc291cmNlTm9kZUluZGV4XSk7XG5cdFx0XHRcdFx0aWYgKHRhcmdldE5leHRTZXR0aW5nKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0YXJnZXRDb21tZW50Tm9kZXMgPSBmaW5kTm9kZXNCZXR3ZWVuKHRhcmdldFRyZWUsIHRhcmdldFByZXZpb3VzU2V0dGluZywgdGFyZ2V0TmV4dFNldHRpbmcpO1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q29tbWVudE5vZGUgPSBmaW5kTGFzdE1hdGNoaW5nVGFyZ2V0Q29tbWVudE5vZGUoc291cmNlQ29tbWVudE5vZGVzLCB0YXJnZXRDb21tZW50Tm9kZXMpO1xuXHRcdFx0XHRcdFx0aWYgKHRhcmdldENvbW1lbnROb2RlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGluZGV4OiB0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0Q29tbWVudE5vZGUpLCBpbnNlcnRBZnRlcjogdHJ1ZSB9OyAvKiBJbnNlcnQgYWZ0ZXIgY29tbWVudCAqL1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXROZXh0U2V0dGluZyksIGluc2VydEFmdGVyOiBmYWxzZSB9OyAvKiBJbnNlcnQgYmVmb3JlIHRhcmdldCBuZXh0IHNldHRpbmcgKi9cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q29tbWVudE5vZGVzID0gZmluZE5vZGVzQmV0d2Vlbih0YXJnZXRUcmVlLCB0YXJnZXRQcmV2aW91c1NldHRpbmcsIHRhcmdldFRyZWVbdGFyZ2V0VHJlZS5sZW5ndGggLSAxXSk7XG5cdFx0XHRcdFx0XHRjb25zdCB0YXJnZXRDb21tZW50Tm9kZSA9IGZpbmRMYXN0TWF0Y2hpbmdUYXJnZXRDb21tZW50Tm9kZShzb3VyY2VDb21tZW50Tm9kZXMsIHRhcmdldENvbW1lbnROb2Rlcyk7XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0Q29tbWVudE5vZGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXRDb21tZW50Tm9kZSksIGluc2VydEFmdGVyOiB0cnVlIH07IC8qIEluc2VydCBhZnRlciBjb21tZW50ICovXG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBpbmRleDogdGFyZ2V0VHJlZS5sZW5ndGggLSAxLCBpbnNlcnRBZnRlcjogdHJ1ZSB9OyAvKiBJbnNlcnQgYXQgdGhlIGVuZCAqL1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZU5leHROb2RlID0gc291cmNlVHJlZVtzb3VyY2VOb2RlSW5kZXggKyAxXTtcblx0XHRpZiAoc291cmNlTmV4dE5vZGUpIHtcblx0XHRcdC8qXG5cdFx0XHRcdE5leHQgbm9kZSBpbiBzb3VyY2UgaXMgYSBzZXR0aW5nLlxuXHRcdFx0XHRGaW5kIHRoZSBzYW1lIHNldHRpbmcgaW4gdGhlIHRhcmdldC5cblx0XHRcdFx0SW5zZXJ0IGl0IGJlZm9yZSB0aGF0IHNldHRpbmdcblx0XHRcdCovXG5cdFx0XHRpZiAoc291cmNlTmV4dE5vZGUuc2V0dGluZykge1xuXHRcdFx0XHRjb25zdCB0YXJnZXROZXh0U2V0dGluZyA9IGZpbmRTZXR0aW5nTm9kZShzb3VyY2VOZXh0Tm9kZS5zZXR0aW5nLmtleSwgdGFyZ2V0VHJlZSk7XG5cdFx0XHRcdGlmICh0YXJnZXROZXh0U2V0dGluZykge1xuXHRcdFx0XHRcdC8qIEluc2VydCBiZWZvcmUgdGFyZ2V0J3MgbmV4dCBzZXR0aW5nICovXG5cdFx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXROZXh0U2V0dGluZyksIGluc2VydEFmdGVyOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvKiBOZXh0IG5vZGUgaW4gc291cmNlIGlzIGEgY29tbWVudCAqL1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZU5leHRTZXR0aW5nTm9kZSA9IGZpbmROZXh0U2V0dGluZ05vZGUoc291cmNlTm9kZUluZGV4LCBzb3VyY2VUcmVlKTtcblx0XHRcdFx0Lypcblx0XHRcdFx0XHRTb3VyY2UgaGFzIGEgc2V0dGluZyBkZWZpbmVkIGFmdGVyIHRoZSBzZXR0aW5nIHRvIGJlIGFkZGVkLlxuXHRcdFx0XHRcdEZpbmQgdGhlIHNhbWUgbmV4dCBzZXR0aW5nIGluIHRoZSB0YXJnZXQuXG5cdFx0XHRcdFx0SWYgZm91bmQsIGluc2VydCBhZnRlciBpdHMgcHJldmlvdXMgc2V0dGluZyBzbyB0aGF0IGNvbW1lbnRzIGFyZSByZXRyaWV2ZWQuXG5cdFx0XHRcdFx0T3RoZXJ3aXNlLCBpbnNlcnQgYXQgdGhlIGJlZ2lubmluZy5cblx0XHRcdFx0Ki9cblx0XHRcdFx0aWYgKHNvdXJjZU5leHRTZXR0aW5nTm9kZSkge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldE5leHRTZXR0aW5nID0gZmluZFNldHRpbmdOb2RlKHNvdXJjZU5leHRTZXR0aW5nTm9kZS5zZXR0aW5nIS5rZXksIHRhcmdldFRyZWUpO1xuXHRcdFx0XHRcdGlmICh0YXJnZXROZXh0U2V0dGluZykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0UHJldmlvdXNTZXR0aW5nID0gZmluZFByZXZpb3VzU2V0dGluZ05vZGUodGFyZ2V0VHJlZS5pbmRleE9mKHRhcmdldE5leHRTZXR0aW5nKSwgdGFyZ2V0VHJlZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBzb3VyY2VDb21tZW50Tm9kZXMgPSBmaW5kTm9kZXNCZXR3ZWVuKHNvdXJjZVRyZWUsIHNvdXJjZVRyZWVbc291cmNlTm9kZUluZGV4XSwgc291cmNlTmV4dFNldHRpbmdOb2RlKTtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXRQcmV2aW91c1NldHRpbmcpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q29tbWVudE5vZGVzID0gZmluZE5vZGVzQmV0d2Vlbih0YXJnZXRUcmVlLCB0YXJnZXRQcmV2aW91c1NldHRpbmcsIHRhcmdldE5leHRTZXR0aW5nKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q29tbWVudE5vZGUgPSBmaW5kTGFzdE1hdGNoaW5nVGFyZ2V0Q29tbWVudE5vZGUoc291cmNlQ29tbWVudE5vZGVzLnJldmVyc2UoKSwgdGFyZ2V0Q29tbWVudE5vZGVzLnJldmVyc2UoKSk7XG5cdFx0XHRcdFx0XHRcdGlmICh0YXJnZXRDb21tZW50Tm9kZSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGluZGV4OiB0YXJnZXRUcmVlLmluZGV4T2YodGFyZ2V0Q29tbWVudE5vZGUpLCBpbnNlcnRBZnRlcjogZmFsc2UgfTsgLyogSW5zZXJ0IGJlZm9yZSBjb21tZW50ICovXG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IHRhcmdldFRyZWUuaW5kZXhPZih0YXJnZXRQcmV2aW91c1NldHRpbmcpLCBpbnNlcnRBZnRlcjogdHJ1ZSB9OyAvKiBJbnNlcnQgYWZ0ZXIgdGFyZ2V0IHByZXZpb3VzIHNldHRpbmcgKi9cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Q29tbWVudE5vZGVzID0gZmluZE5vZGVzQmV0d2Vlbih0YXJnZXRUcmVlLCB0YXJnZXRUcmVlWzBdLCB0YXJnZXROZXh0U2V0dGluZyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldENvbW1lbnROb2RlID0gZmluZExhc3RNYXRjaGluZ1RhcmdldENvbW1lbnROb2RlKHNvdXJjZUNvbW1lbnROb2Rlcy5yZXZlcnNlKCksIHRhcmdldENvbW1lbnROb2Rlcy5yZXZlcnNlKCkpO1xuXHRcdFx0XHRcdFx0XHRpZiAodGFyZ2V0Q29tbWVudE5vZGUpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBpbmRleDogdGFyZ2V0VHJlZS5pbmRleE9mKHRhcmdldENvbW1lbnROb2RlKSwgaW5zZXJ0QWZ0ZXI6IGZhbHNlIH07IC8qIEluc2VydCBiZWZvcmUgY29tbWVudCAqL1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGluZGV4OiAwLCBpbnNlcnRBZnRlcjogZmFsc2UgfTsgLyogSW5zZXJ0IGF0IHRoZSBiZWdpbm5pbmcgKi9cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHQvKiBJbnNlcnQgYXQgdGhlIGVuZCAqL1xuXHRyZXR1cm4geyBpbmRleDogdGFyZ2V0VHJlZS5sZW5ndGggLSAxLCBpbnNlcnRBZnRlcjogdHJ1ZSB9O1xufVxuXG5mdW5jdGlvbiBpbnNlcnRBdExvY2F0aW9uKGNvbnRlbnQ6IHN0cmluZywga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnksIGxvY2F0aW9uOiBJbnNlcnRMb2NhdGlvbiwgdHJlZTogSU5vZGVbXSwgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogc3RyaW5nIHtcblx0bGV0IGVkaXRzOiBFZGl0W107XG5cdC8qIEluc2VydCBhdCB0aGUgZW5kICovXG5cdGlmIChsb2NhdGlvbi5pbmRleCA9PT0gLTEpIHtcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFtrZXldLCB2YWx1ZSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHR9IGVsc2Uge1xuXHRcdGVkaXRzID0gZ2V0RWRpdFRvSW5zZXJ0QXRMb2NhdGlvbihjb250ZW50LCBrZXksIHZhbHVlLCBsb2NhdGlvbiwgdHJlZSwgZm9ybWF0dGluZ09wdGlvbnMpLm1hcChlZGl0ID0+IHdpdGhGb3JtYXR0aW5nKGNvbnRlbnQsIGVkaXQsIGZvcm1hdHRpbmdPcHRpb25zKVswXSk7XG5cdH1cblx0cmV0dXJuIGFwcGx5RWRpdHMoY29udGVudCwgZWRpdHMpO1xufVxuXG5mdW5jdGlvbiBnZXRFZGl0VG9JbnNlcnRBdExvY2F0aW9uKGNvbnRlbnQ6IHN0cmluZywga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnksIGxvY2F0aW9uOiBJbnNlcnRMb2NhdGlvbiwgdHJlZTogSU5vZGVbXSwgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogRWRpdFtdIHtcblx0Y29uc3QgbmV3UHJvcGVydHkgPSBgJHtKU09OLnN0cmluZ2lmeShrZXkpfTogJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSl9YDtcblx0Y29uc3QgZW9sID0gZ2V0RU9MKGZvcm1hdHRpbmdPcHRpb25zLCBjb250ZW50KTtcblx0Y29uc3Qgbm9kZSA9IHRyZWVbbG9jYXRpb24uaW5kZXhdO1xuXG5cdGlmIChsb2NhdGlvbi5pbnNlcnRBZnRlcikge1xuXG5cdFx0Y29uc3QgZWRpdHM6IEVkaXRbXSA9IFtdO1xuXG5cdFx0LyogSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyAqL1xuXHRcdGlmIChub2RlLnNldHRpbmcpIHtcblx0XHRcdGVkaXRzLnB1c2goeyBvZmZzZXQ6IG5vZGUuZW5kT2Zmc2V0LCBsZW5ndGg6IDAsIGNvbnRlbnQ6ICcsJyArIG5ld1Byb3BlcnR5IH0pO1xuXHRcdH1cblxuXHRcdC8qIEluc2VydCBhZnRlciBhIGNvbW1lbnQgKi9cblx0XHRlbHNlIHtcblxuXHRcdFx0Y29uc3QgbmV4dFNldHRpbmdOb2RlID0gZmluZE5leHRTZXR0aW5nTm9kZShsb2NhdGlvbi5pbmRleCwgdHJlZSk7XG5cdFx0XHRjb25zdCBwcmV2aW91c1NldHRpbmdOb2RlID0gZmluZFByZXZpb3VzU2V0dGluZ05vZGUobG9jYXRpb24uaW5kZXgsIHRyZWUpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNTZXR0aW5nQ29tbWFPZmZzZXQgPSBwcmV2aW91c1NldHRpbmdOb2RlPy5zZXR0aW5nPy5jb21tYU9mZnNldDtcblxuXHRcdFx0LyogSWYgdGhlcmUgaXMgYSBwcmV2aW91cyBzZXR0aW5nIGFuZCBpdCBkb2VzIG5vdCBoYXMgY29tbWEgdGhlbiBhZGQgaXQgKi9cblx0XHRcdGlmIChwcmV2aW91c1NldHRpbmdOb2RlICYmIHByZXZpb3VzU2V0dGluZ0NvbW1hT2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZWRpdHMucHVzaCh7IG9mZnNldDogcHJldmlvdXNTZXR0aW5nTm9kZS5lbmRPZmZzZXQsIGxlbmd0aDogMCwgY29udGVudDogJywnIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc1ByZXZpb3Vpc1NldHRpbmdJbmNsdWRlc0NvbW1lbnQgPSBwcmV2aW91c1NldHRpbmdDb21tYU9mZnNldCAhPT0gdW5kZWZpbmVkICYmIHByZXZpb3VzU2V0dGluZ0NvbW1hT2Zmc2V0ID4gbm9kZS5lbmRPZmZzZXQ7XG5cdFx0XHRlZGl0cy5wdXNoKHtcblx0XHRcdFx0b2Zmc2V0OiBpc1ByZXZpb3Vpc1NldHRpbmdJbmNsdWRlc0NvbW1lbnQgPyBwcmV2aW91c1NldHRpbmdDb21tYU9mZnNldCArIDEgOiBub2RlLmVuZE9mZnNldCxcblx0XHRcdFx0bGVuZ3RoOiAwLFxuXHRcdFx0XHRjb250ZW50OiBuZXh0U2V0dGluZ05vZGUgPyBlb2wgKyBuZXdQcm9wZXJ0eSArICcsJyA6IGVvbCArIG5ld1Byb3BlcnR5XG5cdFx0XHR9KTtcblx0XHR9XG5cblxuXHRcdHJldHVybiBlZGl0cztcblx0fVxuXG5cdGVsc2Uge1xuXG5cdFx0LyogSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgKi9cblx0XHRpZiAobm9kZS5zZXR0aW5nKSB7XG5cdFx0XHRyZXR1cm4gW3sgb2Zmc2V0OiBub2RlLnN0YXJ0T2Zmc2V0LCBsZW5ndGg6IDAsIGNvbnRlbnQ6IG5ld1Byb3BlcnR5ICsgJywnIH1dO1xuXHRcdH1cblxuXHRcdC8qIEluc2VydCBiZWZvcmUgYSBjb21tZW50ICovXG5cdFx0Y29uc3QgY29udGVudCA9ICh0cmVlW2xvY2F0aW9uLmluZGV4IC0gMV0gJiYgIXRyZWVbbG9jYXRpb24uaW5kZXggLSAxXS5zZXR0aW5nIC8qIHByZXZpb3VzIG5vZGUgaXMgY29tbWVudCAqLyA/IGVvbCA6ICcnKVxuXHRcdFx0KyBuZXdQcm9wZXJ0eVxuXHRcdFx0KyAoZmluZE5leHRTZXR0aW5nTm9kZShsb2NhdGlvbi5pbmRleCwgdHJlZSkgPyAnLCcgOiAnJylcblx0XHRcdCsgZW9sO1xuXHRcdHJldHVybiBbeyBvZmZzZXQ6IG5vZGUuc3RhcnRPZmZzZXQsIGxlbmd0aDogMCwgY29udGVudCB9XTtcblx0fVxuXG59XG5cbmZ1bmN0aW9uIGZpbmRTZXR0aW5nTm9kZShrZXk6IHN0cmluZywgdHJlZTogSU5vZGVbXSk6IElOb2RlIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHRyZWUuZmlsdGVyKG5vZGUgPT4gbm9kZS5zZXR0aW5nPy5rZXkgPT09IGtleSlbMF07XG59XG5cbmZ1bmN0aW9uIGZpbmRQcmV2aW91c1NldHRpbmdOb2RlKGluZGV4OiBudW1iZXIsIHRyZWU6IElOb2RlW10pOiBJTm9kZSB8IHVuZGVmaW5lZCB7XG5cdGZvciAobGV0IGkgPSBpbmRleCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0aWYgKHRyZWVbaV0uc2V0dGluZykge1xuXHRcdFx0cmV0dXJuIHRyZWVbaV07XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGZpbmROZXh0U2V0dGluZ05vZGUoaW5kZXg6IG51bWJlciwgdHJlZTogSU5vZGVbXSk6IElOb2RlIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChsZXQgaSA9IGluZGV4ICsgMTsgaSA8IHRyZWUubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAodHJlZVtpXS5zZXR0aW5nKSB7XG5cdFx0XHRyZXR1cm4gdHJlZVtpXTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZmluZE5vZGVzQmV0d2Vlbihub2RlczogSU5vZGVbXSwgZnJvbTogSU5vZGUsIHRpbGw6IElOb2RlKTogSU5vZGVbXSB7XG5cdGNvbnN0IGZyb21JbmRleCA9IG5vZGVzLmluZGV4T2YoZnJvbSk7XG5cdGNvbnN0IHRpbGxJbmRleCA9IG5vZGVzLmluZGV4T2YodGlsbCk7XG5cdHJldHVybiBub2Rlcy5maWx0ZXIoKG5vZGUsIGluZGV4KSA9PiBmcm9tSW5kZXggPCBpbmRleCAmJiBpbmRleCA8IHRpbGxJbmRleCk7XG59XG5cbmZ1bmN0aW9uIGZpbmRMYXN0TWF0Y2hpbmdUYXJnZXRDb21tZW50Tm9kZShzb3VyY2VDb21tZW50czogSU5vZGVbXSwgdGFyZ2V0Q29tbWVudHM6IElOb2RlW10pOiBJTm9kZSB8IHVuZGVmaW5lZCB7XG5cdGlmIChzb3VyY2VDb21tZW50cy5sZW5ndGggJiYgdGFyZ2V0Q29tbWVudHMubGVuZ3RoKSB7XG5cdFx0bGV0IGluZGV4ID0gMDtcblx0XHRmb3IgKDsgaW5kZXggPCB0YXJnZXRDb21tZW50cy5sZW5ndGggJiYgaW5kZXggPCBzb3VyY2VDb21tZW50cy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGlmIChzb3VyY2VDb21tZW50c1tpbmRleF0udmFsdWUgIT09IHRhcmdldENvbW1lbnRzW2luZGV4XS52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdGFyZ2V0Q29tbWVudHNbaW5kZXggLSAxXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRhcmdldENvbW1lbnRzW2luZGV4IC0gMV07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElOb2RlIHtcblx0cmVhZG9ubHkgc3RhcnRPZmZzZXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZW5kT2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNldHRpbmc/OiB7XG5cdFx0cmVhZG9ubHkga2V5OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgY29tbWFPZmZzZXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0fTtcblx0cmVhZG9ubHkgY29tbWVudD86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcGFyc2VTZXR0aW5ncyhjb250ZW50OiBzdHJpbmcpOiBJTm9kZVtdIHtcblx0Y29uc3Qgbm9kZXM6IElOb2RlW10gPSBbXTtcblx0bGV0IGhpZXJhcmNoeUxldmVsID0gLTE7XG5cdGxldCBzdGFydE9mZnNldDogbnVtYmVyO1xuXHRsZXQga2V5OiBzdHJpbmc7XG5cblx0Y29uc3QgdmlzaXRvcjogSlNPTlZpc2l0b3IgPSB7XG5cdFx0b25PYmplY3RCZWdpbjogKG9mZnNldDogbnVtYmVyKSA9PiB7XG5cdFx0XHRoaWVyYXJjaHlMZXZlbCsrO1xuXHRcdH0sXG5cdFx0b25PYmplY3RQcm9wZXJ0eTogKG5hbWU6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoaGllcmFyY2h5TGV2ZWwgPT09IDApIHtcblx0XHRcdFx0Ly8gdGhpcyBpcyBzZXR0aW5nIGtleVxuXHRcdFx0XHRzdGFydE9mZnNldCA9IG9mZnNldDtcblx0XHRcdFx0a2V5ID0gbmFtZTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdG9uT2JqZWN0RW5kOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRoaWVyYXJjaHlMZXZlbC0tO1xuXHRcdFx0aWYgKGhpZXJhcmNoeUxldmVsID09PSAwKSB7XG5cdFx0XHRcdG5vZGVzLnB1c2goe1xuXHRcdFx0XHRcdHN0YXJ0T2Zmc2V0LFxuXHRcdFx0XHRcdGVuZE9mZnNldDogb2Zmc2V0ICsgbGVuZ3RoLFxuXHRcdFx0XHRcdHZhbHVlOiBjb250ZW50LnN1YnN0cmluZyhzdGFydE9mZnNldCwgb2Zmc2V0ICsgbGVuZ3RoKSxcblx0XHRcdFx0XHRzZXR0aW5nOiB7XG5cdFx0XHRcdFx0XHRrZXksXG5cdFx0XHRcdFx0XHRjb21tYU9mZnNldDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdG9uQXJyYXlCZWdpbjogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0aGllcmFyY2h5TGV2ZWwrKztcblx0XHR9LFxuXHRcdG9uQXJyYXlFbmQ6IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGhpZXJhcmNoeUxldmVsLS07XG5cdFx0XHRpZiAoaGllcmFyY2h5TGV2ZWwgPT09IDApIHtcblx0XHRcdFx0bm9kZXMucHVzaCh7XG5cdFx0XHRcdFx0c3RhcnRPZmZzZXQsXG5cdFx0XHRcdFx0ZW5kT2Zmc2V0OiBvZmZzZXQgKyBsZW5ndGgsXG5cdFx0XHRcdFx0dmFsdWU6IGNvbnRlbnQuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBvZmZzZXQgKyBsZW5ndGgpLFxuXHRcdFx0XHRcdHNldHRpbmc6IHtcblx0XHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRcdGNvbW1hT2Zmc2V0OiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25MaXRlcmFsVmFsdWU6ICh2YWx1ZTogYW55LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChoaWVyYXJjaHlMZXZlbCA9PT0gMCkge1xuXHRcdFx0XHRub2Rlcy5wdXNoKHtcblx0XHRcdFx0XHRzdGFydE9mZnNldCxcblx0XHRcdFx0XHRlbmRPZmZzZXQ6IG9mZnNldCArIGxlbmd0aCxcblx0XHRcdFx0XHR2YWx1ZTogY29udGVudC5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIG9mZnNldCArIGxlbmd0aCksXG5cdFx0XHRcdFx0c2V0dGluZzoge1xuXHRcdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdFx0Y29tbWFPZmZzZXQ6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvblNlcGFyYXRvcjogKHNlcDogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChoaWVyYXJjaHlMZXZlbCA9PT0gMCkge1xuXHRcdFx0XHRpZiAoc2VwID09PSAnLCcpIHtcblx0XHRcdFx0XHRsZXQgaW5kZXggPSBub2Rlcy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdGZvciAoOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XG5cdFx0XHRcdFx0XHRpZiAobm9kZXNbaW5kZXhdLnNldHRpbmcpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG5vZGUgPSBub2Rlc1tpbmRleF07XG5cdFx0XHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0XHRcdG5vZGVzLnNwbGljZShpbmRleCwgMSwge1xuXHRcdFx0XHRcdFx0XHRzdGFydE9mZnNldDogbm9kZS5zdGFydE9mZnNldCxcblx0XHRcdFx0XHRcdFx0ZW5kT2Zmc2V0OiBub2RlLmVuZE9mZnNldCxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IG5vZGUudmFsdWUsXG5cdFx0XHRcdFx0XHRcdHNldHRpbmc6IHtcblx0XHRcdFx0XHRcdFx0XHRrZXk6IG5vZGUuc2V0dGluZyEua2V5LFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1hT2Zmc2V0OiBvZmZzZXRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvbkNvbW1lbnQ6IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChoaWVyYXJjaHlMZXZlbCA9PT0gMCkge1xuXHRcdFx0XHRub2Rlcy5wdXNoKHtcblx0XHRcdFx0XHRzdGFydE9mZnNldDogb2Zmc2V0LFxuXHRcdFx0XHRcdGVuZE9mZnNldDogb2Zmc2V0ICsgbGVuZ3RoLFxuXHRcdFx0XHRcdHZhbHVlOiBjb250ZW50LnN1YnN0cmluZyhvZmZzZXQsIG9mZnNldCArIGxlbmd0aCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblx0dmlzaXQoY29udGVudCwgdmlzaXRvcik7XG5cdHJldHVybiBub2Rlcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQXNCLE9BQU8sYUFBYTtBQUMxQyxTQUFTLFlBQVksYUFBYSxzQkFBc0I7QUFDeEQsU0FBa0MsY0FBYztBQUNoRCxZQUFZLGFBQWE7QUFFekIsWUFBWSxpQkFBaUI7QUFDN0IsU0FBUyxvQ0FBc0Q7QUFTeEQsU0FBUyxtQkFBbUIsd0JBQWtDLHNCQUE2QyxpQkFBb0M7QUFDckosTUFBSSxRQUErQixDQUFDO0FBQ3BDLE1BQUksaUJBQWlCO0FBQ3BCLFlBQVEsOEJB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QWE7QUFBQSxVQUNkO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxJQUNBLGNBQWMsQ0FBQyxRQUFnQixXQUFtQjtBQUNqRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFlBQVksQ0FBQyxRQUFnQixXQUFtQjtBQUMvQztBQUNBLFVBQUksbUJBQW1CLEdBQUc7QUFDekIsY0FBTSxLQUFLO0FBQUEsVUFDVjtBQUFBLFVBQ0EsV0FBVyxTQUFTO0FBQUEsVUFDcEIsT0FBTyxRQUFRLFVBQVUsYUFBYSxTQUFTLE1BQU07QUFBQSxVQUNyRCxTQUFTO0FBQUEsWUFDUjtBQUFBLFlBQ0EsYUFBYTtBQUFBLFVBQ2Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLElBQ0EsZ0JBQWdCLENBQUMsT0FBWSxRQUFnQixXQUFtQjtBQUMvRCxVQUFJLG1CQUFtQixHQUFHO0FBQ3pCLGNBQU0sS0FBSztBQUFBLFVBQ1Y7QUFBQSxVQUNBLFdBQVcsU0FBUztBQUFBLFVBQ3BCLE9BQU8sUUFBUSxVQUFVLGFBQWEsU0FBUyxNQUFNO0FBQUEsVUFDckQsU0FBUztBQUFBLFlBQ1I7QUFBQSxZQUNBLGFBQWE7QUFBQSxVQUNkO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxJQUNBLGFBQWEsQ0FBQyxLQUFhLFFBQWdCLFdBQW1CO0FBQzdELFVBQUksbUJBQW1CLEdBQUc7QUFDekIsWUFBSSxRQUFRLEtBQUs7QUFDaEIsY0FBSSxRQUFRLE1BQU0sU0FBUztBQUMzQixpQkFBTyxTQUFTLEdBQUcsU0FBUztBQUMzQixnQkFBSSxNQUFNLEtBQUssRUFBRSxTQUFTO0FBQ3pCO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxPQUFPLE1BQU0sS0FBSztBQUN4QixjQUFJLE1BQU07QUFDVCxrQkFBTSxPQUFPLE9BQU8sR0FBRztBQUFBLGNBQ3RCLGFBQWEsS0FBSztBQUFBLGNBQ2xCLFdBQVcsS0FBSztBQUFBLGNBQ2hCLE9BQU8sS0FBSztBQUFBLGNBQ1osU0FBUztBQUFBLGdCQUNSLEtBQUssS0FBSyxRQUFTO0FBQUEsZ0JBQ25CLGFBQWE7QUFBQSxjQUNkO0FBQUEsWUFDRCxDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsV0FBVyxDQUFDLFFBQWdCLFdBQW1CO0FBQzlDLFVBQUksbUJBQW1CLEdBQUc7QUFDekIsY0FBTSxLQUFLO0FBQUEsVUFDVixhQUFhO0FBQUEsVUFDYixXQUFXLFNBQVM7QUFBQSxVQUNwQixPQUFPLFFBQVEsVUFBVSxRQUFRLFNBQVMsTUFBTTtBQUFBLFFBQ2pELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxRQUFNLFNBQVMsT0FBTztBQUN0QixTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImxvY2FsQ29udGVudCIsICJjb250ZW50Il0KfQo=
