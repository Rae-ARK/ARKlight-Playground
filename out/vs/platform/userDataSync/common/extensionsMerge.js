import { deepClone, equals } from "../../../base/common/objects.js";
import * as semver from "../../../base/common/semver/semver.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
function merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, ignoredExtensions, lastSyncBuiltinExtensions) {
  const added = [];
  const removed = [];
  const updated = [];
  if (!remoteExtensions) {
    const remote2 = localExtensions.filter(({ identifier }) => ignoredExtensions.every((id) => id.toLowerCase() !== identifier.id.toLowerCase()));
    return {
      local: {
        added,
        removed,
        updated
      },
      remote: remote2.length > 0 ? {
        added: remote2,
        updated: [],
        removed: [],
        all: remote2
      } : null
    };
  }
  localExtensions = localExtensions.map(massageIncomingExtension);
  remoteExtensions = remoteExtensions.map(massageIncomingExtension);
  lastSyncExtensions = lastSyncExtensions ? lastSyncExtensions.map(massageIncomingExtension) : null;
  const uuids = /* @__PURE__ */ new Map();
  const addUUID = (identifier) => {
    if (identifier.uuid) {
      uuids.set(identifier.id.toLowerCase(), identifier.uuid);
    }
  };
  localExtensions.forEach(({ identifier }) => addUUID(identifier));
  remoteExtensions.forEach(({ identifier }) => addUUID(identifier));
  lastSyncExtensions?.forEach(({ identifier }) => addUUID(identifier));
  skippedExtensions?.forEach(({ identifier }) => addUUID(identifier));
  lastSyncBuiltinExtensions?.forEach((identifier) => addUUID(identifier));
  const getKey = (extension) => {
    const uuid = extension.identifier.uuid || uuids.get(extension.identifier.id.toLowerCase());
    return uuid ? `uuid:${uuid}` : `id:${extension.identifier.id.toLowerCase()}`;
  };
  const addExtensionToMap = (map, extension) => {
    map.set(getKey(extension), extension);
    return map;
  };
  const localExtensionsMap = localExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map());
  const remoteExtensionsMap = remoteExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map());
  const newRemoteExtensionsMap = remoteExtensions.reduce((map, extension) => addExtensionToMap(map, deepClone(extension)), /* @__PURE__ */ new Map());
  const lastSyncExtensionsMap = lastSyncExtensions ? lastSyncExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map()) : null;
  const skippedExtensionsMap = skippedExtensions.reduce(addExtensionToMap, /* @__PURE__ */ new Map());
  const ignoredExtensionsSet = ignoredExtensions.reduce((set, id) => {
    const uuid = uuids.get(id.toLowerCase());
    return set.add(uuid ? `uuid:${uuid}` : `id:${id.toLowerCase()}`);
  }, /* @__PURE__ */ new Set());
  const lastSyncBuiltinExtensionsSet = lastSyncBuiltinExtensions ? lastSyncBuiltinExtensions.reduce((set, { id, uuid }) => {
    uuid = uuid ?? uuids.get(id.toLowerCase());
    return set.add(uuid ? `uuid:${uuid}` : `id:${id.toLowerCase()}`);
  }, /* @__PURE__ */ new Set()) : null;
  const localToRemote = compare(localExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet, false);
  if (localToRemote.added.size > 0 || localToRemote.removed.size > 0 || localToRemote.updated.size > 0) {
    const baseToLocal = compare(lastSyncExtensionsMap, localExtensionsMap, ignoredExtensionsSet, false);
    const baseToRemote = compare(lastSyncExtensionsMap, remoteExtensionsMap, ignoredExtensionsSet, true);
    const merge2 = (key, localExtension, remoteExtension, preferred) => {
      let pinned, version, preRelease;
      if (localExtension.installed) {
        pinned = preferred.pinned;
        preRelease = preferred.preRelease;
        if (pinned) {
          version = preferred.version;
        }
      } else {
        pinned = remoteExtension.pinned;
        preRelease = remoteExtension.preRelease;
        if (pinned) {
          version = remoteExtension.version;
        }
      }
      if (pinned === void 0) {
        pinned = localExtension.pinned;
        if (pinned) {
          version = localExtension.version;
        }
      }
      if (preRelease === void 0) {
        preRelease = localExtension.preRelease;
      }
      return {
        ...preferred,
        installed: localExtension.installed || remoteExtension.installed,
        pinned,
        preRelease,
        version: version ?? (remoteExtension.version && (!localExtension.installed || semver.gt(remoteExtension.version, localExtension.version)) ? remoteExtension.version : localExtension.version),
        state: mergeExtensionState(localExtension, remoteExtension, lastSyncExtensionsMap?.get(key))
      };
    };
    for (const key of baseToRemote.removed.values()) {
      const localExtension = localExtensionsMap.get(key);
      if (!localExtension) {
        continue;
      }
      const baseExtension = assertReturnsDefined(lastSyncExtensionsMap?.get(key));
      const wasAnInstalledExtensionDuringLastSync = lastSyncBuiltinExtensionsSet && !lastSyncBuiltinExtensionsSet.has(key) && baseExtension.installed;
      if (localExtension.installed && wasAnInstalledExtensionDuringLastSync) {
        removed.push(localExtension.identifier);
      } else {
        newRemoteExtensionsMap.set(key, localExtension);
      }
    }
    for (const key of baseToRemote.added.values()) {
      const remoteExtension = assertReturnsDefined(remoteExtensionsMap.get(key));
      const localExtension = localExtensionsMap.get(key);
      if (localExtension) {
        if (localToRemote.updated.has(key)) {
          const mergedExtension = merge2(key, localExtension, remoteExtension, remoteExtension);
          if (!areSame(localExtension, remoteExtension, false, false)) {
            updated.push(massageOutgoingExtension(mergedExtension, key));
          }
          newRemoteExtensionsMap.set(key, mergedExtension);
        }
      } else {
        if (remoteExtension.installed) {
          added.push(massageOutgoingExtension(remoteExtension, key));
        }
      }
    }
    for (const key of baseToRemote.updated.values()) {
      const remoteExtension = assertReturnsDefined(remoteExtensionsMap.get(key));
      const baseExtension = assertReturnsDefined(lastSyncExtensionsMap?.get(key));
      const localExtension = localExtensionsMap.get(key);
      if (localExtension) {
        const wasAnInstalledExtensionDuringLastSync = lastSyncBuiltinExtensionsSet && !lastSyncBuiltinExtensionsSet.has(key) && baseExtension.installed;
        if (wasAnInstalledExtensionDuringLastSync && localExtension.installed && !remoteExtension.installed) {
          removed.push(localExtension.identifier);
        } else {
          const mergedExtension = merge2(key, localExtension, remoteExtension, remoteExtension);
          updated.push(massageOutgoingExtension(mergedExtension, key));
          newRemoteExtensionsMap.set(key, mergedExtension);
        }
      } else if (remoteExtension.installed) {
        added.push(massageOutgoingExtension(remoteExtension, key));
      }
    }
    for (const key of baseToLocal.added.values()) {
      if (baseToRemote.added.has(key)) {
        continue;
      }
      newRemoteExtensionsMap.set(key, assertReturnsDefined(localExtensionsMap.get(key)));
    }
    for (const key of baseToLocal.updated.values()) {
      if (baseToRemote.removed.has(key)) {
        continue;
      }
      if (baseToRemote.updated.has(key)) {
        continue;
      }
      const localExtension = assertReturnsDefined(localExtensionsMap.get(key));
      const remoteExtension = assertReturnsDefined(remoteExtensionsMap.get(key));
      newRemoteExtensionsMap.set(key, merge2(key, localExtension, remoteExtension, localExtension));
    }
    for (const key of baseToLocal.removed.values()) {
      if (baseToRemote.updated.has(key)) {
        continue;
      }
      if (baseToRemote.removed.has(key)) {
        continue;
      }
      if (skippedExtensionsMap.has(key)) {
        continue;
      }
      if (!assertReturnsDefined(remoteExtensionsMap.get(key)).installed) {
        continue;
      }
      if (!lastSyncBuiltinExtensionsSet) {
        continue;
      }
      if (lastSyncBuiltinExtensionsSet.has(key) || !assertReturnsDefined(lastSyncExtensionsMap?.get(key)).installed) {
        continue;
      }
      newRemoteExtensionsMap.delete(key);
    }
  }
  const remote = [];
  const remoteChanges = compare(remoteExtensionsMap, newRemoteExtensionsMap, /* @__PURE__ */ new Set(), true);
  const hasRemoteChanges = remoteChanges.added.size > 0 || remoteChanges.updated.size > 0 || remoteChanges.removed.size > 0;
  if (hasRemoteChanges) {
    newRemoteExtensionsMap.forEach((value, key) => remote.push(massageOutgoingExtension(value, key)));
  }
  return {
    local: { added, removed, updated },
    remote: hasRemoteChanges ? {
      added: [...remoteChanges.added].map((id) => newRemoteExtensionsMap.get(id)),
      updated: [...remoteChanges.updated].map((id) => newRemoteExtensionsMap.get(id)),
      removed: [...remoteChanges.removed].map((id) => remoteExtensionsMap.get(id)),
      all: remote
    } : null
  };
}
function compare(from, to, ignoredExtensions, checkVersionProperty) {
  const fromKeys = from ? [...from.keys()].filter((key) => !ignoredExtensions.has(key)) : [];
  const toKeys = [...to.keys()].filter((key) => !ignoredExtensions.has(key));
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
    const fromExtension = from.get(key);
    const toExtension = to.get(key);
    if (!toExtension || !areSame(fromExtension, toExtension, checkVersionProperty, true)) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function areSame(fromExtension, toExtension, checkVersionProperty, checkInstalledProperty) {
  if (fromExtension.disabled !== toExtension.disabled) {
    return false;
  }
  if (!!fromExtension.isApplicationScoped !== !!toExtension.isApplicationScoped) {
    return false;
  }
  if (checkInstalledProperty && fromExtension.installed !== toExtension.installed) {
    return false;
  }
  if (fromExtension.installed && toExtension.installed) {
    if (fromExtension.preRelease !== toExtension.preRelease) {
      return false;
    }
    if (fromExtension.pinned !== toExtension.pinned) {
      return false;
    }
    if (toExtension.pinned && fromExtension.version !== toExtension.version) {
      return false;
    }
  }
  if (!isSameExtensionState(fromExtension.state, toExtension.state)) {
    return false;
  }
  if (checkVersionProperty && fromExtension.version !== toExtension.version) {
    return false;
  }
  return true;
}
function mergeExtensionState(localExtension, remoteExtension, lastSyncExtension) {
  const localState = localExtension.state;
  const remoteState = remoteExtension.state;
  const baseState = lastSyncExtension?.state;
  if (!remoteExtension.version) {
    return localState;
  }
  if (localState && semver.gt(localExtension.version, remoteExtension.version)) {
    return localState;
  }
  if (remoteState && semver.gt(remoteExtension.version, localExtension.version)) {
    return remoteState;
  }
  if (!localState) {
    return remoteState;
  }
  if (!remoteState) {
    return localState;
  }
  const mergedState = deepClone(localState);
  const baseToRemote = baseState ? compareExtensionState(baseState, remoteState) : { added: Object.keys(remoteState).reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  const baseToLocal = baseState ? compareExtensionState(baseState, localState) : { added: Object.keys(localState).reduce((r, k) => {
    r.add(k);
    return r;
  }, /* @__PURE__ */ new Set()), removed: /* @__PURE__ */ new Set(), updated: /* @__PURE__ */ new Set() };
  for (const key of [...baseToRemote.added.values(), ...baseToRemote.updated.values()]) {
    mergedState[key] = remoteState[key];
  }
  for (const key of baseToRemote.removed.values()) {
    if (!baseToLocal.updated.has(key)) {
      delete mergedState[key];
    }
  }
  return mergedState;
}
function compareExtensionState(from, to) {
  const fromKeys = Object.keys(from);
  const toKeys = Object.keys(to);
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
    const value1 = from[key];
    const value2 = to[key];
    if (!equals(value1, value2)) {
      updated.add(key);
    }
  }
  return { added, removed, updated };
}
function isSameExtensionState(a = {}, b = {}) {
  const { added, removed, updated } = compareExtensionState(a, b);
  return added.size === 0 && removed.size === 0 && updated.size === 0;
}
function massageIncomingExtension(extension) {
  return { ...extension, ...{ disabled: !!extension.disabled, installed: !!extension.installed } };
}
function massageOutgoingExtension(extension, key) {
  const massagedExtension = {
    ...extension,
    identifier: {
      id: extension.identifier.id,
      uuid: key.startsWith("uuid:") ? key.substring("uuid:".length) : void 0
    },
    /* set following always so that to differentiate with older clients */
    preRelease: !!extension.preRelease,
    pinned: !!extension.pinned
  };
  if (!extension.disabled) {
    delete massagedExtension.disabled;
  }
  if (!extension.installed) {
    delete massagedExtension.installed;
  }
  if (!extension.state) {
    delete massagedExtension.state;
  }
  if (!extension.isApplicationScoped) {
    delete massagedExtension.isApplicationScoped;
  }
  return massagedExtension;
}
export {
  merge
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vZXh0ZW5zaW9uc01lcmdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgc2VtdmVyIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlbXZlci9zZW12ZXIuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvY2FsU3luY0V4dGVuc2lvbiwgSVJlbW90ZVN5bmNFeHRlbnNpb24sIElTeW5jRXh0ZW5zaW9uIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNZXJnZVJlc3VsdCB7XG5cdHJlYWRvbmx5IGxvY2FsOiB7IGFkZGVkOiBJU3luY0V4dGVuc2lvbltdOyByZW1vdmVkOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdOyB1cGRhdGVkOiBJU3luY0V4dGVuc2lvbltdIH07XG5cdHJlYWRvbmx5IHJlbW90ZTogeyBhZGRlZDogSVN5bmNFeHRlbnNpb25bXTsgcmVtb3ZlZDogSVN5bmNFeHRlbnNpb25bXTsgdXBkYXRlZDogSVN5bmNFeHRlbnNpb25bXTsgYWxsOiBJU3luY0V4dGVuc2lvbltdIH0gfCBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2UobG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW10sIHJlbW90ZUV4dGVuc2lvbnM6IElSZW1vdGVTeW5jRXh0ZW5zaW9uW10gfCBudWxsLCBsYXN0U3luY0V4dGVuc2lvbnM6IElSZW1vdGVTeW5jRXh0ZW5zaW9uW10gfCBudWxsLCBza2lwcGVkRXh0ZW5zaW9uczogSVN5bmNFeHRlbnNpb25bXSwgaWdub3JlZEV4dGVuc2lvbnM6IHN0cmluZ1tdLCBsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdIHwgbnVsbCk6IElNZXJnZVJlc3VsdCB7XG5cdGNvbnN0IGFkZGVkOiBJU3luY0V4dGVuc2lvbltdID0gW107XG5cdGNvbnN0IHJlbW92ZWQ6IElFeHRlbnNpb25JZGVudGlmaWVyW10gPSBbXTtcblx0Y29uc3QgdXBkYXRlZDogSVN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXG5cdGlmICghcmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdGNvbnN0IHJlbW90ZSA9IGxvY2FsRXh0ZW5zaW9ucy5maWx0ZXIoKHsgaWRlbnRpZmllciB9KSA9PiBpZ25vcmVkRXh0ZW5zaW9ucy5ldmVyeShpZCA9PiBpZC50b0xvd2VyQ2FzZSgpICE9PSBpZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bG9jYWw6IHtcblx0XHRcdFx0YWRkZWQsXG5cdFx0XHRcdHJlbW92ZWQsXG5cdFx0XHRcdHVwZGF0ZWQsXG5cdFx0XHR9LFxuXHRcdFx0cmVtb3RlOiByZW1vdGUubGVuZ3RoID4gMCA/IHtcblx0XHRcdFx0YWRkZWQ6IHJlbW90ZSxcblx0XHRcdFx0dXBkYXRlZDogW10sXG5cdFx0XHRcdHJlbW92ZWQ6IFtdLFxuXHRcdFx0XHRhbGw6IHJlbW90ZVxuXHRcdFx0fSA6IG51bGxcblx0XHR9O1xuXHR9XG5cblx0bG9jYWxFeHRlbnNpb25zID0gbG9jYWxFeHRlbnNpb25zLm1hcChtYXNzYWdlSW5jb21pbmdFeHRlbnNpb24pIGFzIElMb2NhbFN5bmNFeHRlbnNpb25bXTtcblx0cmVtb3RlRXh0ZW5zaW9ucyA9IHJlbW90ZUV4dGVuc2lvbnMubWFwKG1hc3NhZ2VJbmNvbWluZ0V4dGVuc2lvbik7XG5cdGxhc3RTeW5jRXh0ZW5zaW9ucyA9IGxhc3RTeW5jRXh0ZW5zaW9ucyA/IGxhc3RTeW5jRXh0ZW5zaW9ucy5tYXAobWFzc2FnZUluY29taW5nRXh0ZW5zaW9uKSA6IG51bGw7XG5cblx0Y29uc3QgdXVpZHM6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRjb25zdCBhZGRVVUlEID0gKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKSA9PiB7IGlmIChpZGVudGlmaWVyLnV1aWQpIHsgdXVpZHMuc2V0KGlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgaWRlbnRpZmllci51dWlkKTsgfSB9O1xuXHRsb2NhbEV4dGVuc2lvbnMuZm9yRWFjaCgoeyBpZGVudGlmaWVyIH0pID0+IGFkZFVVSUQoaWRlbnRpZmllcikpO1xuXHRyZW1vdGVFeHRlbnNpb25zLmZvckVhY2goKHsgaWRlbnRpZmllciB9KSA9PiBhZGRVVUlEKGlkZW50aWZpZXIpKTtcblx0bGFzdFN5bmNFeHRlbnNpb25zPy5mb3JFYWNoKCh7IGlkZW50aWZpZXIgfSkgPT4gYWRkVVVJRChpZGVudGlmaWVyKSk7XG5cdHNraXBwZWRFeHRlbnNpb25zPy5mb3JFYWNoKCh7IGlkZW50aWZpZXIgfSkgPT4gYWRkVVVJRChpZGVudGlmaWVyKSk7XG5cdGxhc3RTeW5jQnVpbHRpbkV4dGVuc2lvbnM/LmZvckVhY2goaWRlbnRpZmllciA9PiBhZGRVVUlEKGlkZW50aWZpZXIpKTtcblxuXHRjb25zdCBnZXRLZXkgPSAoZXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbik6IHN0cmluZyA9PiB7XG5cdFx0Y29uc3QgdXVpZCA9IGV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQgfHwgdXVpZHMuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdHJldHVybiB1dWlkID8gYHV1aWQ6JHt1dWlkfWAgOiBgaWQ6JHtleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpfWA7XG5cdH07XG5cdGNvbnN0IGFkZEV4dGVuc2lvblRvTWFwID0gKG1hcDogTWFwPHN0cmluZywgSVN5bmNFeHRlbnNpb24+LCBleHRlbnNpb246IElTeW5jRXh0ZW5zaW9uKSA9PiB7XG5cdFx0bWFwLnNldChnZXRLZXkoZXh0ZW5zaW9uKSwgZXh0ZW5zaW9uKTtcblx0XHRyZXR1cm4gbWFwO1xuXHR9O1xuXHRjb25zdCBsb2NhbEV4dGVuc2lvbnNNYXA6IE1hcDxzdHJpbmcsIElTeW5jRXh0ZW5zaW9uPiA9IGxvY2FsRXh0ZW5zaW9ucy5yZWR1Y2UoYWRkRXh0ZW5zaW9uVG9NYXAsIG5ldyBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4oKSk7XG5cdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnNNYXAgPSByZW1vdGVFeHRlbnNpb25zLnJlZHVjZShhZGRFeHRlbnNpb25Ub01hcCwgbmV3IE1hcDxzdHJpbmcsIElTeW5jRXh0ZW5zaW9uPigpKTtcblx0Y29uc3QgbmV3UmVtb3RlRXh0ZW5zaW9uc01hcCA9IHJlbW90ZUV4dGVuc2lvbnMucmVkdWNlKChtYXA6IE1hcDxzdHJpbmcsIElTeW5jRXh0ZW5zaW9uPiwgZXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbikgPT4gYWRkRXh0ZW5zaW9uVG9NYXAobWFwLCBkZWVwQ2xvbmUoZXh0ZW5zaW9uKSksIG5ldyBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4oKSk7XG5cdGNvbnN0IGxhc3RTeW5jRXh0ZW5zaW9uc01hcCA9IGxhc3RTeW5jRXh0ZW5zaW9ucyA/IGxhc3RTeW5jRXh0ZW5zaW9ucy5yZWR1Y2UoYWRkRXh0ZW5zaW9uVG9NYXAsIG5ldyBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4oKSkgOiBudWxsO1xuXHRjb25zdCBza2lwcGVkRXh0ZW5zaW9uc01hcCA9IHNraXBwZWRFeHRlbnNpb25zLnJlZHVjZShhZGRFeHRlbnNpb25Ub01hcCwgbmV3IE1hcDxzdHJpbmcsIElTeW5jRXh0ZW5zaW9uPigpKTtcblx0Y29uc3QgaWdub3JlZEV4dGVuc2lvbnNTZXQgPSBpZ25vcmVkRXh0ZW5zaW9ucy5yZWR1Y2UoKHNldCwgaWQpID0+IHtcblx0XHRjb25zdCB1dWlkID0gdXVpZHMuZ2V0KGlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdHJldHVybiBzZXQuYWRkKHV1aWQgPyBgdXVpZDoke3V1aWR9YCA6IGBpZDoke2lkLnRvTG93ZXJDYXNlKCl9YCk7XG5cdH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgbGFzdFN5bmNCdWlsdGluRXh0ZW5zaW9uc1NldCA9IGxhc3RTeW5jQnVpbHRpbkV4dGVuc2lvbnMgPyBsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zLnJlZHVjZSgoc2V0LCB7IGlkLCB1dWlkIH0pID0+IHtcblx0XHR1dWlkID0gdXVpZCA/PyB1dWlkcy5nZXQoaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0cmV0dXJuIHNldC5hZGQodXVpZCA/IGB1dWlkOiR7dXVpZH1gIDogYGlkOiR7aWQudG9Mb3dlckNhc2UoKX1gKTtcblx0fSwgbmV3IFNldDxzdHJpbmc+KCkpIDogbnVsbDtcblxuXHRjb25zdCBsb2NhbFRvUmVtb3RlID0gY29tcGFyZShsb2NhbEV4dGVuc2lvbnNNYXAsIHJlbW90ZUV4dGVuc2lvbnNNYXAsIGlnbm9yZWRFeHRlbnNpb25zU2V0LCBmYWxzZSk7XG5cdGlmIChsb2NhbFRvUmVtb3RlLmFkZGVkLnNpemUgPiAwIHx8IGxvY2FsVG9SZW1vdGUucmVtb3ZlZC5zaXplID4gMCB8fCBsb2NhbFRvUmVtb3RlLnVwZGF0ZWQuc2l6ZSA+IDApIHtcblxuXHRcdGNvbnN0IGJhc2VUb0xvY2FsID0gY29tcGFyZShsYXN0U3luY0V4dGVuc2lvbnNNYXAsIGxvY2FsRXh0ZW5zaW9uc01hcCwgaWdub3JlZEV4dGVuc2lvbnNTZXQsIGZhbHNlKTtcblx0XHRjb25zdCBiYXNlVG9SZW1vdGUgPSBjb21wYXJlKGxhc3RTeW5jRXh0ZW5zaW9uc01hcCwgcmVtb3RlRXh0ZW5zaW9uc01hcCwgaWdub3JlZEV4dGVuc2lvbnNTZXQsIHRydWUpO1xuXG5cdFx0Y29uc3QgbWVyZ2UgPSAoa2V5OiBzdHJpbmcsIGxvY2FsRXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbiwgcmVtb3RlRXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbiwgcHJlZmVycmVkOiBJU3luY0V4dGVuc2lvbik6IElTeW5jRXh0ZW5zaW9uID0+IHtcblx0XHRcdGxldCBwaW5uZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQsIHZlcnNpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgcHJlUmVsZWFzZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChsb2NhbEV4dGVuc2lvbi5pbnN0YWxsZWQpIHtcblx0XHRcdFx0cGlubmVkID0gcHJlZmVycmVkLnBpbm5lZDtcblx0XHRcdFx0cHJlUmVsZWFzZSA9IHByZWZlcnJlZC5wcmVSZWxlYXNlO1xuXHRcdFx0XHRpZiAocGlubmVkKSB7XG5cdFx0XHRcdFx0dmVyc2lvbiA9IHByZWZlcnJlZC52ZXJzaW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwaW5uZWQgPSByZW1vdGVFeHRlbnNpb24ucGlubmVkO1xuXHRcdFx0XHRwcmVSZWxlYXNlID0gcmVtb3RlRXh0ZW5zaW9uLnByZVJlbGVhc2U7XG5cdFx0XHRcdGlmIChwaW5uZWQpIHtcblx0XHRcdFx0XHR2ZXJzaW9uID0gcmVtb3RlRXh0ZW5zaW9uLnZlcnNpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChwaW5uZWQgPT09IHVuZGVmaW5lZCAvKiBmcm9tIG9sZGVyIGNsaWVudCovKSB7XG5cdFx0XHRcdHBpbm5lZCA9IGxvY2FsRXh0ZW5zaW9uLnBpbm5lZDtcblx0XHRcdFx0aWYgKHBpbm5lZCkge1xuXHRcdFx0XHRcdHZlcnNpb24gPSBsb2NhbEV4dGVuc2lvbi52ZXJzaW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJlUmVsZWFzZSA9PT0gdW5kZWZpbmVkIC8qIGZyb20gb2xkZXIgY2xpZW50Ki8pIHtcblx0XHRcdFx0cHJlUmVsZWFzZSA9IGxvY2FsRXh0ZW5zaW9uLnByZVJlbGVhc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5wcmVmZXJyZWQsXG5cdFx0XHRcdGluc3RhbGxlZDogbG9jYWxFeHRlbnNpb24uaW5zdGFsbGVkIHx8IHJlbW90ZUV4dGVuc2lvbi5pbnN0YWxsZWQsXG5cdFx0XHRcdHBpbm5lZCxcblx0XHRcdFx0cHJlUmVsZWFzZSxcblx0XHRcdFx0dmVyc2lvbjogdmVyc2lvbiA/PyAocmVtb3RlRXh0ZW5zaW9uLnZlcnNpb24gJiYgKCFsb2NhbEV4dGVuc2lvbi5pbnN0YWxsZWQgfHwgc2VtdmVyLmd0KHJlbW90ZUV4dGVuc2lvbi52ZXJzaW9uLCBsb2NhbEV4dGVuc2lvbi52ZXJzaW9uKSkgPyByZW1vdGVFeHRlbnNpb24udmVyc2lvbiA6IGxvY2FsRXh0ZW5zaW9uLnZlcnNpb24pLFxuXHRcdFx0XHRzdGF0ZTogbWVyZ2VFeHRlbnNpb25TdGF0ZShsb2NhbEV4dGVuc2lvbiwgcmVtb3RlRXh0ZW5zaW9uLCBsYXN0U3luY0V4dGVuc2lvbnNNYXA/LmdldChrZXkpKSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdC8vIFJlbW90ZWx5IHJlbW92ZWQgZXh0ZW5zaW9uID0+IGV4aXN0IGluIGJhc2UgYW5kIGRvZXMgbm90IGluIHJlbW90ZVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb1JlbW90ZS5yZW1vdmVkLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbiA9IGxvY2FsRXh0ZW5zaW9uc01hcC5nZXQoa2V5KTtcblx0XHRcdGlmICghbG9jYWxFeHRlbnNpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJhc2VFeHRlbnNpb24gPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChsYXN0U3luY0V4dGVuc2lvbnNNYXA/LmdldChrZXkpKTtcblx0XHRcdGNvbnN0IHdhc0FuSW5zdGFsbGVkRXh0ZW5zaW9uRHVyaW5nTGFzdFN5bmMgPSBsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zU2V0ICYmICFsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zU2V0LmhhcyhrZXkpICYmIGJhc2VFeHRlbnNpb24uaW5zdGFsbGVkO1xuXHRcdFx0aWYgKGxvY2FsRXh0ZW5zaW9uLmluc3RhbGxlZCAmJiB3YXNBbkluc3RhbGxlZEV4dGVuc2lvbkR1cmluZ0xhc3RTeW5jIC8qIEl0IGlzIGFuIGluc3RhbGxlZCBleHRlbnNpb24gbm93IGFuZCBkdXJpbmcgbGFzdCBzeW5jICovKSB7XG5cdFx0XHRcdC8vIEluc3RhbGxlZCBleHRlbnNpb24gaXMgcmVtb3ZlZCBmcm9tIHJlbW90ZS4gUmVtb3ZlIGl0IGZyb20gbG9jYWwuXG5cdFx0XHRcdHJlbW92ZWQucHVzaChsb2NhbEV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEFkZCB0byByZW1vdGU6IEl0IGlzIGEgYnVpbHRpbiBleHRlbmlzaW9uIG9yIGdvdCBpbnN0YWxsZWQgYWZ0ZXIgbGFzdCBzeW5jXG5cdFx0XHRcdG5ld1JlbW90ZUV4dGVuc2lvbnNNYXAuc2V0KGtleSwgbG9jYWxFeHRlbnNpb24pO1xuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3RlbHkgYWRkZWQgZXh0ZW5zaW9uID0+IGRvZXMgbm90IGV4aXN0IGluIGJhc2UgYW5kIGV4aXN0IGluIHJlbW90ZVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb1JlbW90ZS5hZGRlZC52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQocmVtb3RlRXh0ZW5zaW9uc01hcC5nZXQoa2V5KSk7XG5cdFx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbiA9IGxvY2FsRXh0ZW5zaW9uc01hcC5nZXQoa2V5KTtcblxuXHRcdFx0Ly8gQWxzbyBleGlzdCBpbiBsb2NhbFxuXHRcdFx0aWYgKGxvY2FsRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdC8vIElzIGRpZmZlcmVudCBmcm9tIGxvY2FsIHRvIHJlbW90ZVxuXHRcdFx0XHRpZiAobG9jYWxUb1JlbW90ZS51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVyZ2VkRXh0ZW5zaW9uID0gbWVyZ2Uoa2V5LCBsb2NhbEV4dGVuc2lvbiwgcmVtb3RlRXh0ZW5zaW9uLCByZW1vdGVFeHRlbnNpb24pO1xuXHRcdFx0XHRcdC8vIFVwZGF0ZSBsb2NhbGx5IG9ubHkgd2hlbiB0aGUgZXh0ZW5zaW9uIGhhcyBjaGFuZ2VzIGluIHByb3BlcnRpZXMgb3RoZXIgdGhhbiBpbnN0YWxsZWQgcG9wZXJ0eVxuXHRcdFx0XHRcdGlmICghYXJlU2FtZShsb2NhbEV4dGVuc2lvbiwgcmVtb3RlRXh0ZW5zaW9uLCBmYWxzZSwgZmFsc2UpKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkLnB1c2gobWFzc2FnZU91dGdvaW5nRXh0ZW5zaW9uKG1lcmdlZEV4dGVuc2lvbiwga2V5KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG5ld1JlbW90ZUV4dGVuc2lvbnNNYXAuc2V0KGtleSwgbWVyZ2VkRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQWRkIG9ubHkgaWYgdGhlIGV4dGVuc2lvbiBpcyBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uXG5cdFx0XHRcdGlmIChyZW1vdGVFeHRlbnNpb24uaW5zdGFsbGVkKSB7XG5cdFx0XHRcdFx0YWRkZWQucHVzaChtYXNzYWdlT3V0Z29pbmdFeHRlbnNpb24ocmVtb3RlRXh0ZW5zaW9uLCBrZXkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW90ZWx5IHVwZGF0ZWQgZXh0ZW5zaW9uID0+IGV4aXN0IGluIGJhc2UgYW5kIHJlbW90ZVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb1JlbW90ZS51cGRhdGVkLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCByZW1vdGVFeHRlbnNpb24gPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChyZW1vdGVFeHRlbnNpb25zTWFwLmdldChrZXkpKTtcblx0XHRcdGNvbnN0IGJhc2VFeHRlbnNpb24gPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChsYXN0U3luY0V4dGVuc2lvbnNNYXA/LmdldChrZXkpKTtcblx0XHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9uID0gbG9jYWxFeHRlbnNpb25zTWFwLmdldChrZXkpO1xuXG5cdFx0XHQvLyBBbHNvIGV4aXN0IGluIGxvY2FsXG5cdFx0XHRpZiAobG9jYWxFeHRlbnNpb24pIHtcblx0XHRcdFx0Y29uc3Qgd2FzQW5JbnN0YWxsZWRFeHRlbnNpb25EdXJpbmdMYXN0U3luYyA9IGxhc3RTeW5jQnVpbHRpbkV4dGVuc2lvbnNTZXQgJiYgIWxhc3RTeW5jQnVpbHRpbkV4dGVuc2lvbnNTZXQuaGFzKGtleSkgJiYgYmFzZUV4dGVuc2lvbi5pbnN0YWxsZWQ7XG5cdFx0XHRcdGlmICh3YXNBbkluc3RhbGxlZEV4dGVuc2lvbkR1cmluZ0xhc3RTeW5jICYmIGxvY2FsRXh0ZW5zaW9uLmluc3RhbGxlZCAmJiAhcmVtb3RlRXh0ZW5zaW9uLmluc3RhbGxlZCkge1xuXHRcdFx0XHRcdC8vIFJlbW92ZSBpdCBsb2NhbGx5IGlmIGl0IGlzIGluc3RhbGxlZCBsb2NhbGx5IGFuZCBub3QgcmVtb3RlbHlcblx0XHRcdFx0XHRyZW1vdmVkLnB1c2gobG9jYWxFeHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGluIGxvY2FsIGFsd2F5c1xuXHRcdFx0XHRcdGNvbnN0IG1lcmdlZEV4dGVuc2lvbiA9IG1lcmdlKGtleSwgbG9jYWxFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbiwgcmVtb3RlRXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR1cGRhdGVkLnB1c2gobWFzc2FnZU91dGdvaW5nRXh0ZW5zaW9uKG1lcmdlZEV4dGVuc2lvbiwga2V5KSk7XG5cdFx0XHRcdFx0bmV3UmVtb3RlRXh0ZW5zaW9uc01hcC5zZXQoa2V5LCBtZXJnZWRFeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBBZGQgaXQgbG9jYWxseSBpZiBkb2VzIG5vdCBleGlzdCBsb2NhbGx5IGFuZCBpbnN0YWxsZWQgcmVtb3RlbHlcblx0XHRcdGVsc2UgaWYgKHJlbW90ZUV4dGVuc2lvbi5pbnN0YWxsZWQpIHtcblx0XHRcdFx0YWRkZWQucHVzaChtYXNzYWdlT3V0Z29pbmdFeHRlbnNpb24ocmVtb3RlRXh0ZW5zaW9uLCBrZXkpKTtcblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdC8vIExvY2FsbHkgYWRkZWQgZXh0ZW5zaW9uID0+IGRvZXMgbm90IGV4aXN0IGluIGJhc2UgYW5kIGV4aXN0IGluIGxvY2FsXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvTG9jYWwuYWRkZWQudmFsdWVzKCkpIHtcblx0XHRcdC8vIElmIGFkZGVkIGluIHJlbW90ZSAoYWxyZWFkeSBoYW5kbGVkKVxuXHRcdFx0aWYgKGJhc2VUb1JlbW90ZS5hZGRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdG5ld1JlbW90ZUV4dGVuc2lvbnNNYXAuc2V0KGtleSwgYXNzZXJ0UmV0dXJuc0RlZmluZWQobG9jYWxFeHRlbnNpb25zTWFwLmdldChrZXkpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTG9jYWxseSB1cGRhdGVkIGV4dGVuc2lvbiA9PiBleGlzdCBpbiBiYXNlIGFuZCBsb2NhbFxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGJhc2VUb0xvY2FsLnVwZGF0ZWQudmFsdWVzKCkpIHtcblx0XHRcdC8vIElmIHJlbW92ZWQgaW4gcmVtb3RlIChhbHJlYWR5IGhhbmRsZWQpXG5cdFx0XHRpZiAoYmFzZVRvUmVtb3RlLnJlbW92ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiB1cGRhdGVkIGluIHJlbW90ZSAoYWxyZWFkeSBoYW5kbGVkKVxuXHRcdFx0aWYgKGJhc2VUb1JlbW90ZS51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbG9jYWxFeHRlbnNpb24gPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChsb2NhbEV4dGVuc2lvbnNNYXAuZ2V0KGtleSkpO1xuXHRcdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQocmVtb3RlRXh0ZW5zaW9uc01hcC5nZXQoa2V5KSk7XG5cdFx0XHQvLyBVcGRhdGUgcmVtb3RlbHlcblx0XHRcdG5ld1JlbW90ZUV4dGVuc2lvbnNNYXAuc2V0KGtleSwgbWVyZ2Uoa2V5LCBsb2NhbEV4dGVuc2lvbiwgcmVtb3RlRXh0ZW5zaW9uLCBsb2NhbEV4dGVuc2lvbikpO1xuXHRcdH1cblxuXHRcdC8vIExvY2FsbHkgcmVtb3ZlZCBleHRlbnNpb25zID0+IGV4aXN0IGluIGJhc2UgYW5kIGRvZXMgbm90IGV4aXN0IGluIGxvY2FsXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgYmFzZVRvTG9jYWwucmVtb3ZlZC52YWx1ZXMoKSkge1xuXHRcdFx0Ly8gSWYgdXBkYXRlZCBpbiByZW1vdGUgKGFscmVhZHkgaGFuZGxlZClcblx0XHRcdGlmIChiYXNlVG9SZW1vdGUudXBkYXRlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIElmIHJlbW92ZWQgaW4gcmVtb3RlIChhbHJlYWR5IGhhbmRsZWQpXG5cdFx0XHRpZiAoYmFzZVRvUmVtb3RlLnJlbW92ZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBTa2lwcGVkXG5cdFx0XHRpZiAoc2tpcHBlZEV4dGVuc2lvbnNNYXAuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBTa2lwIGlmIGl0IGlzIGEgYnVpbHRpbiBleHRlbnNpb25cblx0XHRcdGlmICghYXNzZXJ0UmV0dXJuc0RlZmluZWQocmVtb3RlRXh0ZW5zaW9uc01hcC5nZXQoa2V5KSkuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2tpcCBpZiBsYXN0IHN5bmMgYnVpbHRpbiBleHRlbnNpb25zIHNldCBpcyBub3QgYXZhaWxhYmxlXG5cdFx0XHRpZiAoIWxhc3RTeW5jQnVpbHRpbkV4dGVuc2lvbnNTZXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBTa2lwIGlmIGl0IHdhcyBhIGJ1aWx0aW4gZXh0ZW5zaW9uIGR1cmluZyBsYXN0IHN5bmNcblx0XHRcdGlmIChsYXN0U3luY0J1aWx0aW5FeHRlbnNpb25zU2V0LmhhcyhrZXkpIHx8ICFhc3NlcnRSZXR1cm5zRGVmaW5lZChsYXN0U3luY0V4dGVuc2lvbnNNYXA/LmdldChrZXkpKS5pbnN0YWxsZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRuZXdSZW1vdGVFeHRlbnNpb25zTWFwLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHJlbW90ZTogSVN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRjb25zdCByZW1vdGVDaGFuZ2VzID0gY29tcGFyZShyZW1vdGVFeHRlbnNpb25zTWFwLCBuZXdSZW1vdGVFeHRlbnNpb25zTWFwLCBuZXcgU2V0PHN0cmluZz4oKSwgdHJ1ZSk7XG5cdGNvbnN0IGhhc1JlbW90ZUNoYW5nZXMgPSByZW1vdGVDaGFuZ2VzLmFkZGVkLnNpemUgPiAwIHx8IHJlbW90ZUNoYW5nZXMudXBkYXRlZC5zaXplID4gMCB8fCByZW1vdGVDaGFuZ2VzLnJlbW92ZWQuc2l6ZSA+IDA7XG5cdGlmIChoYXNSZW1vdGVDaGFuZ2VzKSB7XG5cdFx0bmV3UmVtb3RlRXh0ZW5zaW9uc01hcC5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiByZW1vdGUucHVzaChtYXNzYWdlT3V0Z29pbmdFeHRlbnNpb24odmFsdWUsIGtleSkpKTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0bG9jYWw6IHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfSxcblx0XHRyZW1vdGU6IGhhc1JlbW90ZUNoYW5nZXMgPyB7XG5cdFx0XHRhZGRlZDogWy4uLnJlbW90ZUNoYW5nZXMuYWRkZWRdLm1hcChpZCA9PiBuZXdSZW1vdGVFeHRlbnNpb25zTWFwLmdldChpZCkhKSxcblx0XHRcdHVwZGF0ZWQ6IFsuLi5yZW1vdGVDaGFuZ2VzLnVwZGF0ZWRdLm1hcChpZCA9PiBuZXdSZW1vdGVFeHRlbnNpb25zTWFwLmdldChpZCkhKSxcblx0XHRcdHJlbW92ZWQ6IFsuLi5yZW1vdGVDaGFuZ2VzLnJlbW92ZWRdLm1hcChpZCA9PiByZW1vdGVFeHRlbnNpb25zTWFwLmdldChpZCkhKSxcblx0XHRcdGFsbDogcmVtb3RlXG5cdFx0fSA6IG51bGxcblx0fTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZShmcm9tOiBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4gfCBudWxsLCB0bzogTWFwPHN0cmluZywgSVN5bmNFeHRlbnNpb24+LCBpZ25vcmVkRXh0ZW5zaW9uczogU2V0PHN0cmluZz4sIGNoZWNrVmVyc2lvblByb3BlcnR5OiBib29sZWFuKTogeyBhZGRlZDogU2V0PHN0cmluZz47IHJlbW92ZWQ6IFNldDxzdHJpbmc+OyB1cGRhdGVkOiBTZXQ8c3RyaW5nPiB9IHtcblx0Y29uc3QgZnJvbUtleXMgPSBmcm9tID8gWy4uLmZyb20ua2V5cygpXS5maWx0ZXIoa2V5ID0+ICFpZ25vcmVkRXh0ZW5zaW9ucy5oYXMoa2V5KSkgOiBbXTtcblx0Y29uc3QgdG9LZXlzID0gWy4uLnRvLmtleXMoKV0uZmlsdGVyKGtleSA9PiAhaWdub3JlZEV4dGVuc2lvbnMuaGFzKGtleSkpO1xuXHRjb25zdCBhZGRlZCA9IHRvS2V5cy5maWx0ZXIoa2V5ID0+ICFmcm9tS2V5cy5pbmNsdWRlcyhrZXkpKS5yZWR1Y2UoKHIsIGtleSkgPT4geyByLmFkZChrZXkpOyByZXR1cm4gcjsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRjb25zdCByZW1vdmVkID0gZnJvbUtleXMuZmlsdGVyKGtleSA9PiAhdG9LZXlzLmluY2x1ZGVzKGtleSkpLnJlZHVjZSgociwga2V5KSA9PiB7IHIuYWRkKGtleSk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IHVwZGF0ZWQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Zm9yIChjb25zdCBrZXkgb2YgZnJvbUtleXMpIHtcblx0XHRpZiAocmVtb3ZlZC5oYXMoa2V5KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGZyb21FeHRlbnNpb24gPSBmcm9tIS5nZXQoa2V5KSE7XG5cdFx0Y29uc3QgdG9FeHRlbnNpb24gPSB0by5nZXQoa2V5KTtcblx0XHRpZiAoIXRvRXh0ZW5zaW9uIHx8ICFhcmVTYW1lKGZyb21FeHRlbnNpb24sIHRvRXh0ZW5zaW9uLCBjaGVja1ZlcnNpb25Qcm9wZXJ0eSwgdHJ1ZSkpIHtcblx0XHRcdHVwZGF0ZWQuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfTtcbn1cblxuZnVuY3Rpb24gYXJlU2FtZShmcm9tRXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbiwgdG9FeHRlbnNpb246IElTeW5jRXh0ZW5zaW9uLCBjaGVja1ZlcnNpb25Qcm9wZXJ0eTogYm9vbGVhbiwgY2hlY2tJbnN0YWxsZWRQcm9wZXJ0eTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRpZiAoZnJvbUV4dGVuc2lvbi5kaXNhYmxlZCAhPT0gdG9FeHRlbnNpb24uZGlzYWJsZWQpIHtcblx0XHQvKiBleHRlbnNpb24gZW5hYmxlbWVudCBjaGFuZ2VkICovXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKCEhZnJvbUV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkICE9PSAhIXRvRXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQpIHtcblx0XHQvKiBleHRlbnNpb24gYXBwbGljYXRpb24gc2NvcGUgaGFzIGNoYW5nZWQgKi9cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoY2hlY2tJbnN0YWxsZWRQcm9wZXJ0eSAmJiBmcm9tRXh0ZW5zaW9uLmluc3RhbGxlZCAhPT0gdG9FeHRlbnNpb24uaW5zdGFsbGVkKSB7XG5cdFx0LyogZXh0ZW5zaW9uIGluc3RhbGxlZCBwcm9wZXJ0eSBjaGFuZ2VkICovXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGZyb21FeHRlbnNpb24uaW5zdGFsbGVkICYmIHRvRXh0ZW5zaW9uLmluc3RhbGxlZCkge1xuXG5cdFx0aWYgKGZyb21FeHRlbnNpb24ucHJlUmVsZWFzZSAhPT0gdG9FeHRlbnNpb24ucHJlUmVsZWFzZSkge1xuXHRcdFx0LyogaW5zdGFsbGVkIGV4dGVuc2lvbidzIHByZS1yZWxlYXNlIHZlcnNpb24gY2hhbmdlZCAqL1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChmcm9tRXh0ZW5zaW9uLnBpbm5lZCAhPT0gdG9FeHRlbnNpb24ucGlubmVkKSB7XG5cdFx0XHQvKiBpbnN0YWxsZWQgZXh0ZW5zaW9uJ3MgcGlubmluZyBjaGFuZ2VkICovXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRvRXh0ZW5zaW9uLnBpbm5lZCAmJiBmcm9tRXh0ZW5zaW9uLnZlcnNpb24gIT09IHRvRXh0ZW5zaW9uLnZlcnNpb24pIHtcblx0XHRcdC8qIGluc3RhbGxlZCBleHRlbnNpb24ncyBwaW5uZWQgdmVyc2lvbiBjaGFuZ2VkICovXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0aWYgKCFpc1NhbWVFeHRlbnNpb25TdGF0ZShmcm9tRXh0ZW5zaW9uLnN0YXRlLCB0b0V4dGVuc2lvbi5zdGF0ZSkpIHtcblx0XHQvKiBleHRlbnNpb24gc3RhdGUgY2hhbmdlZCAqL1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmICgoY2hlY2tWZXJzaW9uUHJvcGVydHkgJiYgZnJvbUV4dGVuc2lvbi52ZXJzaW9uICE9PSB0b0V4dGVuc2lvbi52ZXJzaW9uKSkge1xuXHRcdC8qIGV4dGVuc2lvbiB2ZXJzaW9uIGNoYW5nZWQgKi9cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gbWVyZ2VFeHRlbnNpb25TdGF0ZShsb2NhbEV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24sIHJlbW90ZUV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24sIGxhc3RTeW5jRXh0ZW5zaW9uOiBJU3luY0V4dGVuc2lvbiB8IHVuZGVmaW5lZCk6IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4gfCB1bmRlZmluZWQge1xuXHRjb25zdCBsb2NhbFN0YXRlID0gbG9jYWxFeHRlbnNpb24uc3RhdGU7XG5cdGNvbnN0IHJlbW90ZVN0YXRlID0gcmVtb3RlRXh0ZW5zaW9uLnN0YXRlO1xuXHRjb25zdCBiYXNlU3RhdGUgPSBsYXN0U3luY0V4dGVuc2lvbj8uc3RhdGU7XG5cblx0Ly8gSWYgcmVtb3RlIGV4dGVuc2lvbiBoYXMgbm8gdmVyc2lvbiwgdXNlIGxvY2FsIHN0YXRlXG5cdGlmICghcmVtb3RlRXh0ZW5zaW9uLnZlcnNpb24pIHtcblx0XHRyZXR1cm4gbG9jYWxTdGF0ZTtcblx0fVxuXG5cdC8vIElmIGxvY2FsIHN0YXRlIGV4aXN0cyBhbmQgbG9jYWwgZXh0ZW5zaW9uIGlzIGxhdGVzdCB0aGVuIHVzZSBsb2NhbCBzdGF0ZVxuXHRpZiAobG9jYWxTdGF0ZSAmJiBzZW12ZXIuZ3QobG9jYWxFeHRlbnNpb24udmVyc2lvbiwgcmVtb3RlRXh0ZW5zaW9uLnZlcnNpb24pKSB7XG5cdFx0cmV0dXJuIGxvY2FsU3RhdGU7XG5cdH1cblx0Ly8gSWYgcmVtb3RlIHN0YXRlIGV4aXN0cyBhbmQgcmVtb3RlIGV4dGVuc2lvbiBpcyBsYXRlc3QsIHVzZSByZW1vdGUgc3RhdGVcblx0aWYgKHJlbW90ZVN0YXRlICYmIHNlbXZlci5ndChyZW1vdGVFeHRlbnNpb24udmVyc2lvbiwgbG9jYWxFeHRlbnNpb24udmVyc2lvbikpIHtcblx0XHRyZXR1cm4gcmVtb3RlU3RhdGU7XG5cdH1cblxuXG5cdC8qIFJlbW90ZSBhbmQgbG9jYWwgYXJlIG9uIHNhbWUgdmVyc2lvbiAqL1xuXG5cdC8vIElmIGxvY2FsIHN0YXRlIGlzIG5vdCB5ZXQgc2V0LCB1c2UgcmVtb3RlIHN0YXRlXG5cdGlmICghbG9jYWxTdGF0ZSkge1xuXHRcdHJldHVybiByZW1vdGVTdGF0ZTtcblx0fVxuXHQvLyBJZiByZW1vdGUgc3RhdGUgaXMgbm90IHlldCBzZXQsIHVzZSBsb2NhbCBzdGF0ZVxuXHRpZiAoIXJlbW90ZVN0YXRlKSB7XG5cdFx0cmV0dXJuIGxvY2FsU3RhdGU7XG5cdH1cblxuXHRjb25zdCBtZXJnZWRTdGF0ZTogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiA9IGRlZXBDbG9uZShsb2NhbFN0YXRlKTtcblx0Y29uc3QgYmFzZVRvUmVtb3RlID0gYmFzZVN0YXRlID8gY29tcGFyZUV4dGVuc2lvblN0YXRlKGJhc2VTdGF0ZSwgcmVtb3RlU3RhdGUpIDogeyBhZGRlZDogT2JqZWN0LmtleXMocmVtb3RlU3RhdGUpLnJlZHVjZSgociwgaykgPT4geyByLmFkZChrKTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKSwgcmVtb3ZlZDogbmV3IFNldDxzdHJpbmc+KCksIHVwZGF0ZWQ6IG5ldyBTZXQ8c3RyaW5nPigpIH07XG5cdGNvbnN0IGJhc2VUb0xvY2FsID0gYmFzZVN0YXRlID8gY29tcGFyZUV4dGVuc2lvblN0YXRlKGJhc2VTdGF0ZSwgbG9jYWxTdGF0ZSkgOiB7IGFkZGVkOiBPYmplY3Qua2V5cyhsb2NhbFN0YXRlKS5yZWR1Y2UoKHIsIGspID0+IHsgci5hZGQoayk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSksIHJlbW92ZWQ6IG5ldyBTZXQ8c3RyaW5nPigpLCB1cGRhdGVkOiBuZXcgU2V0PHN0cmluZz4oKSB9O1xuXHQvLyBBZGRlZC9VcGRhdGVkIGluIHJlbW90ZVxuXHRmb3IgKGNvbnN0IGtleSBvZiBbLi4uYmFzZVRvUmVtb3RlLmFkZGVkLnZhbHVlcygpLCAuLi5iYXNlVG9SZW1vdGUudXBkYXRlZC52YWx1ZXMoKV0pIHtcblx0XHRtZXJnZWRTdGF0ZVtrZXldID0gcmVtb3RlU3RhdGVba2V5XTtcblx0fVxuXHQvLyBSZW1vdmVkIGluIHJlbW90ZVxuXHRmb3IgKGNvbnN0IGtleSBvZiBiYXNlVG9SZW1vdGUucmVtb3ZlZC52YWx1ZXMoKSkge1xuXHRcdC8vIE5vdCB1cGRhdGVkIGluIGxvY2FsXG5cdFx0aWYgKCFiYXNlVG9Mb2NhbC51cGRhdGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRkZWxldGUgbWVyZ2VkU3RhdGVba2V5XTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG1lcmdlZFN0YXRlO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlRXh0ZW5zaW9uU3RhdGUoZnJvbTogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiwgdG86IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4pOiB7IGFkZGVkOiBTZXQ8c3RyaW5nPjsgcmVtb3ZlZDogU2V0PHN0cmluZz47IHVwZGF0ZWQ6IFNldDxzdHJpbmc+IH0ge1xuXHRjb25zdCBmcm9tS2V5cyA9IE9iamVjdC5rZXlzKGZyb20pO1xuXHRjb25zdCB0b0tleXMgPSBPYmplY3Qua2V5cyh0byk7XG5cdGNvbnN0IGFkZGVkID0gdG9LZXlzLmZpbHRlcihrZXkgPT4gIWZyb21LZXlzLmluY2x1ZGVzKGtleSkpLnJlZHVjZSgociwga2V5KSA9PiB7IHIuYWRkKGtleSk7IHJldHVybiByOyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IHJlbW92ZWQgPSBmcm9tS2V5cy5maWx0ZXIoa2V5ID0+ICF0b0tleXMuaW5jbHVkZXMoa2V5KSkucmVkdWNlKChyLCBrZXkpID0+IHsgci5hZGQoa2V5KTsgcmV0dXJuIHI7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0Y29uc3QgdXBkYXRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRmb3IgKGNvbnN0IGtleSBvZiBmcm9tS2V5cykge1xuXHRcdGlmIChyZW1vdmVkLmhhcyhrZXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUxID0gZnJvbVtrZXldO1xuXHRcdGNvbnN0IHZhbHVlMiA9IHRvW2tleV07XG5cdFx0aWYgKCFlcXVhbHModmFsdWUxLCB2YWx1ZTIpKSB7XG5cdFx0XHR1cGRhdGVkLmFkZChrZXkpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH07XG59XG5cbmZ1bmN0aW9uIGlzU2FtZUV4dGVuc2lvblN0YXRlKGE6IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4gPSB7fSwgYjogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiA9IHt9KTogYm9vbGVhbiB7XG5cdGNvbnN0IHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfSA9IGNvbXBhcmVFeHRlbnNpb25TdGF0ZShhLCBiKTtcblx0cmV0dXJuIGFkZGVkLnNpemUgPT09IDAgJiYgcmVtb3ZlZC5zaXplID09PSAwICYmIHVwZGF0ZWQuc2l6ZSA9PT0gMDtcbn1cblxuLy8gbWFzc2FnZSBpbmNvbWluZyBleHRlbnNpb24gLSBhZGQgb3B0aW9uYWwgcHJvcGVydGllc1xuZnVuY3Rpb24gbWFzc2FnZUluY29taW5nRXh0ZW5zaW9uKGV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24pOiBJU3luY0V4dGVuc2lvbiB7XG5cdHJldHVybiB7IC4uLmV4dGVuc2lvbiwgLi4ueyBkaXNhYmxlZDogISFleHRlbnNpb24uZGlzYWJsZWQsIGluc3RhbGxlZDogISFleHRlbnNpb24uaW5zdGFsbGVkIH0gfTtcbn1cblxuLy8gbWFzc2FnZSBvdXRnb2luZyBleHRlbnNpb24gLSByZW1vdmUgb3B0aW9uYWwgcHJvcGVydGllc1xuZnVuY3Rpb24gbWFzc2FnZU91dGdvaW5nRXh0ZW5zaW9uKGV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24sIGtleTogc3RyaW5nKTogSVN5bmNFeHRlbnNpb24ge1xuXHRjb25zdCBtYXNzYWdlZEV4dGVuc2lvbjogSVN5bmNFeHRlbnNpb24gPSB7XG5cdFx0Li4uZXh0ZW5zaW9uLFxuXHRcdGlkZW50aWZpZXI6IHtcblx0XHRcdGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCxcblx0XHRcdHV1aWQ6IGtleS5zdGFydHNXaXRoKCd1dWlkOicpID8ga2V5LnN1YnN0cmluZygndXVpZDonLmxlbmd0aCkgOiB1bmRlZmluZWRcblx0XHR9LFxuXHRcdC8qIHNldCBmb2xsb3dpbmcgYWx3YXlzIHNvIHRoYXQgdG8gZGlmZmVyZW50aWF0ZSB3aXRoIG9sZGVyIGNsaWVudHMgKi9cblx0XHRwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbi5wcmVSZWxlYXNlLFxuXHRcdHBpbm5lZDogISFleHRlbnNpb24ucGlubmVkLFxuXHR9O1xuXHRpZiAoIWV4dGVuc2lvbi5kaXNhYmxlZCkge1xuXHRcdGRlbGV0ZSBtYXNzYWdlZEV4dGVuc2lvbi5kaXNhYmxlZDtcblx0fVxuXHRpZiAoIWV4dGVuc2lvbi5pbnN0YWxsZWQpIHtcblx0XHRkZWxldGUgbWFzc2FnZWRFeHRlbnNpb24uaW5zdGFsbGVkO1xuXHR9XG5cdGlmICghZXh0ZW5zaW9uLnN0YXRlKSB7XG5cdFx0ZGVsZXRlIG1hc3NhZ2VkRXh0ZW5zaW9uLnN0YXRlO1xuXHR9XG5cdGlmICghZXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQpIHtcblx0XHRkZWxldGUgbWFzc2FnZWRFeHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZDtcblx0fVxuXHRyZXR1cm4gbWFzc2FnZWRFeHRlbnNpb247XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFdBQVcsY0FBYztBQUNsQyxZQUFZLFlBQVk7QUFDeEIsU0FBUyw0QkFBNEI7QUFTOUIsU0FBUyxNQUFNLGlCQUF3QyxrQkFBaUQsb0JBQW1ELG1CQUFxQyxtQkFBNkIsMkJBQXdFO0FBQzNTLFFBQU0sUUFBMEIsQ0FBQztBQUNqQyxRQUFNLFVBQWtDLENBQUM7QUFDekMsUUFBTSxVQUE0QixDQUFDO0FBRW5DLE1BQUksQ0FBQyxrQkFBa0I7QUFDdEIsVUFBTUEsVUFBUyxnQkFBZ0IsT0FBTyxDQUFDLEVBQUUsV0FBVyxNQUFNLGtCQUFrQixNQUFNLFFBQU0sR0FBRyxZQUFZLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxDQUFDO0FBQ3pJLFdBQU87QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxRQUFRQSxRQUFPLFNBQVMsSUFBSTtBQUFBLFFBQzNCLE9BQU9BO0FBQUEsUUFDUCxTQUFTLENBQUM7QUFBQSxRQUNWLFNBQVMsQ0FBQztBQUFBLFFBQ1YsS0FBS0E7QUFBQSxNQUNOLElBQUk7QUFBQSxJQUNMO0FB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
