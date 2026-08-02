import { ActionType } from "../common/actions.js";
import { SessionLifecycle, SessionStatus, CustomizationType, McpServerStatus } from "./state.js";
import { softAssertNever } from "../common/reducer-helpers.js";
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;
function withStatusFlag(status, flag, set) {
  return set ? status | flag : status & ~flag;
}
function withInputNeededStatus(status, inputNeeded) {
  if (inputNeeded.length > 0) {
    return status & ~STATUS_ACTIVITY_MASK | SessionStatus.InputNeeded;
  }
  return status & ~(SessionStatus.InputNeeded & ~SessionStatus.InProgress);
}
function updateMcpServerCustomization(state, id, update) {
  const list = state.customizations;
  if (!list) {
    return state;
  }
  const topIdx = list.findIndex((c) => c.id === id);
  if (topIdx >= 0) {
    const entry = list[topIdx];
    if (entry.type !== CustomizationType.McpServer) {
      return state;
    }
    const updated2 = list.slice();
    updated2[topIdx] = update(entry);
    return { ...state, customizations: updated2 };
  }
  let changed = false;
  const updated = list.map((container) => {
    if (container.type === CustomizationType.McpServer) {
      return container;
    }
    const children = container.children;
    if (!children) {
      return container;
    }
    const childIdx = children.findIndex((c) => c.id === id);
    if (childIdx < 0) {
      return container;
    }
    const child = children[childIdx];
    if (child.type !== CustomizationType.McpServer) {
      return container;
    }
    changed = true;
    const newChildren = children.slice();
    newChildren[childIdx] = update(child);
    return { ...container, children: newChildren };
  });
  if (!changed) {
    return state;
  }
  return { ...state, customizations: updated };
}
function sessionReducer(state, action, log) {
  switch (action.type) {
    // ── Lifecycle ──────────────────────────────────────────────────────────
    case ActionType.SessionReady:
      return { ...state, lifecycle: SessionLifecycle.Ready };
    case ActionType.SessionCreationFailed:
      return {
        ...state,
        lifecycle: SessionLifecycle.CreationFailed,
        creationError: action.error
      };
    case ActionType.SessionChatAdded: {
      const list = state.chats;
      const idx = list.findIndex((c) => c.resource === action.summary.resource);
      if (idx < 0) {
        return { ...state, chats: [...list, action.summary] };
      }
      const updated = list.slice();
      updated[idx] = action.summary;
      return { ...state, chats: updated };
    }
    case ActionType.SessionChatRemoved: {
      const list = state.chats;
      const idx = list.findIndex((c) => c.resource === action.chat);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      const next = { ...state, chats: updated };
      if (state.defaultChat === action.chat) {
        delete next.defaultChat;
      }
      return next;
    }
    case ActionType.SessionChatUpdated: {
      const list = state.chats;
      const idx = list.findIndex((c) => c.resource === action.chat);
      if (idx < 0) {
        return state;
      }
      const { resource: _ignored, ...changes } = action.changes;
      const updated = list.slice();
      updated[idx] = { ...list[idx], ...changes };
      return { ...state, chats: updated };
    }
    case ActionType.SessionDefaultChatChanged:
      return { ...state, defaultChat: action.defaultChat };
    // ── Metadata ──────────────────────────────────────────────────────────
    case ActionType.SessionTitleChanged:
      return { ...state, title: action.title };
    case ActionType.SessionIsReadChanged:
      return {
        ...state,
        status: withStatusFlag(state.status, SessionStatus.IsRead, action.isRead)
      };
    case ActionType.SessionIsArchivedChanged:
      return {
        ...state,
        status: withStatusFlag(state.status, SessionStatus.IsArchived, action.isArchived)
      };
    case ActionType.SessionActivityChanged:
      return { ...state, activity: action.activity };
    case ActionType.SessionChangesetsChanged: {
      const { changesets: _omit, ...stateWithoutChangesets } = state;
      return action.changesets ? { ...stateWithoutChangesets, changesets: action.changesets } : stateWithoutChangesets;
    }
    case ActionType.SessionConfigChanged:
      if (!state.config) {
        return state;
      }
      return {
        ...state,
        config: {
          ...state.config,
          values: action.replace ? { ...action.config } : { ...state.config.values, ...action.config }
        }
      };
    case ActionType.SessionMetaChanged:
      return { ...state, _meta: action._meta };
    case ActionType.SessionServerToolsChanged:
      return { ...state, serverTools: action.tools };
    case ActionType.SessionActiveClientSet: {
      const list = state.activeClients;
      const idx = list.findIndex((c) => c.clientId === action.activeClient.clientId);
      if (idx < 0) {
        return { ...state, activeClients: [...list, action.activeClient] };
      }
      const updated = list.slice();
      updated[idx] = action.activeClient;
      return { ...state, activeClients: updated };
    }
    case ActionType.SessionActiveClientRemoved: {
      const list = state.activeClients;
      const idx = list.findIndex((c) => c.clientId === action.clientId);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      return { ...state, activeClients: updated };
    }
    // ── Working Directories ─────────────────────────────────────────────
    case ActionType.SessionWorkingDirectorySet: {
      const list = state.workingDirectories ?? [];
      if (list.includes(action.directory)) {
        return state;
      }
      return { ...state, workingDirectories: [...list, action.directory] };
    }
    case ActionType.SessionWorkingDirectoryRemoved: {
      const list = state.workingDirectories;
      if (!list) {
        return state;
      }
      const idx = list.indexOf(action.directory);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      return { ...state, workingDirectories: updated };
    }
    // ── Input Needed ────────────────────────────────────────────────────
    case ActionType.SessionInputNeededSet: {
      const list = state.inputNeeded ?? [];
      const idx = list.findIndex((r) => r.id === action.request.id);
      const inputNeeded = idx < 0 ? [...list, action.request] : list.slice();
      if (idx >= 0) {
        inputNeeded[idx] = action.request;
      }
      return { ...state, inputNeeded, status: withInputNeededStatus(state.status, inputNeeded) };
    }
    case ActionType.SessionInputNeededRemoved: {
      const list = state.inputNeeded;
      if (!list) {
        return state;
      }
      const idx = list.findIndex((r) => r.id === action.id);
      if (idx < 0) {
        return state;
      }
      const remaining = list.slice();
      remaining.splice(idx, 1);
      const next = { ...state, status: withInputNeededStatus(state.status, remaining) };
      if (remaining.length > 0) {
        next.inputNeeded = remaining;
      } else {
        delete next.inputNeeded;
      }
      return next;
    }
    // ── Customizations ──────────────────────────────────────────────────
    case ActionType.SessionCustomizationsChanged:
      return { ...state, customizations: action.customizations };
    case ActionType.SessionCustomizationToggled: {
      const list = state.customizations;
      if (!list) {
        return state;
      }
      const topIdx = list.findIndex((c) => c.id === action.id);
      if (topIdx >= 0) {
        const updated = list.slice();
        updated[topIdx] = { ...list[topIdx], enabled: action.enabled };
        return { ...state, customizations: updated };
      }
      for (let i = 0; i < list.length; i++) {
        const container = list[i];
        if (container.type === CustomizationType.McpServer) {
          continue;
        }
        const children = container.children;
        if (!children) {
          continue;
        }
        const childIdx = children.findIndex((c) => c.id === action.id);
        if (childIdx < 0) {
          continue;
        }
        const newChildren = children.slice();
        newChildren[childIdx] = { ...children[childIdx], enabled: action.enabled };
        const updated = list.slice();
        updated[i] = { ...container, children: newChildren };
        return { ...state, customizations: updated };
      }
      return state;
    }
    case ActionType.SessionCustomizationUpdated: {
      const list = state.customizations ?? [];
      const idx = list.findIndex((c) => c.id === action.customization.id);
      if (idx < 0) {
        return { ...state, customizations: [...list, action.customization] };
      }
      const updated = [...list];
      updated[idx] = action.customization;
      return { ...state, customizations: updated };
    }
    case ActionType.SessionCustomizationRemoved: {
      const list = state.customizations;
      if (!list) {
        return state;
      }
      const topIdx = list.findIndex((c) => c.id === action.id);
      if (topIdx >= 0) {
        const updated2 = list.slice();
        updated2.splice(topIdx, 1);
        return { ...state, customizations: updated2 };
      }
      let changed = false;
      const updated = list.map((container) => {
        if (container.type === CustomizationType.McpServer) {
          return container;
        }
        const children = container.children;
        if (!children) {
          return container;
        }
        const childIdx = children.findIndex((c) => c.id === action.id);
        if (childIdx < 0) {
          return container;
        }
        changed = true;
        const newChildren = children.slice();
        newChildren.splice(childIdx, 1);
        return { ...container, children: newChildren };
      });
      if (!changed) {
        return state;
      }
      return { ...state, customizations: updated };
    }
    case ActionType.SessionMcpServerStateChanged: {
      return updateMcpServerCustomization(state, action.id, (entry) => ({
        ...entry,
        state: action.state,
        channel: action.channel
      }));
    }
    case ActionType.SessionMcpServerStartRequested: {
      return updateMcpServerCustomization(state, action.id, (entry) => ({
        ...entry,
        state: { kind: McpServerStatus.Starting },
        channel: void 0
      }));
    }
    case ActionType.SessionMcpServerStopRequested: {
      return updateMcpServerCustomization(state, action.id, (entry) => ({
        ...entry,
        state: { kind: McpServerStatus.Stopped },
        channel: void 0
      }));
    }
    default:
      softAssertNever(action, log);
      return state;
  }
}
export {
  sessionReducer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9yZWR1Y2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gYWxsb3ctYW55LXVuaWNvZGUtY29tbWVudC1maWxlXG4vLyBETyBOT1QgRURJVCAtLSBhdXRvLWdlbmVyYXRlZCBieSBzY3JpcHRzL3N5bmMtYWdlbnQtaG9zdC1wcm90b2NvbC50c1xuXG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkxpZmVjeWNsZSwgU2Vzc2lvblN0YXR1cywgQ3VzdG9taXphdGlvblR5cGUsIE1jcFNlcnZlclN0YXR1cywgdHlwZSBTZXNzaW9uU3RhdGUsIHR5cGUgU2Vzc2lvbklucHV0UmVxdWVzdCwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uIH0gZnJvbSAnLi9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi9hY3Rpb24tb3JpZ2luLmdlbmVyYXRlZC5qcyc7XG5pbXBvcnQgeyBzb2Z0QXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi9jb21tb24vcmVkdWNlci1oZWxwZXJzLmpzJztcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEhlbHBlcnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKiBCaXRtYXNrIGNvdmVyaW5nIHRoZSBtdXR1YWxseS1leGNsdXNpdmUgYWN0aXZpdHkgYml0cyAoYml0cyAwXHUyMDEzNCkuICovXG5jb25zdCBTVEFUVVNfQUNUSVZJVFlfTUFTSyA9ICgxIDw8IDUpIC0gMTtcblxuLyoqIFNldHMgb3IgY2xlYXJzIGEgbWV0YWRhdGEgZmxhZyBvbiBhIHN0YXR1cyB2YWx1ZS4gKi9cbmZ1bmN0aW9uIHdpdGhTdGF0dXNGbGFnKHN0YXR1czogU2Vzc2lvblN0YXR1cywgZmxhZzogU2Vzc2lvblN0YXR1cywgc2V0OiBib29sZWFuKTogU2Vzc2lvblN0YXR1cyB7XG5cdHJldHVybiBzZXQgPyBzdGF0dXMgfCBmbGFnIDogc3RhdHVzICYgfmZsYWc7XG59XG5cbi8qKlxuICogUmVmbGVjdHMgdGhlIHNlc3Npb24tbGV2ZWwge0BsaW5rIFNlc3Npb25TdGF0ZS5pbnB1dE5lZWRlZCB8IGlucHV0IHF1ZXVlfVxuICogaW50byB0aGUgYWN0aXZpdHkgYml0cyBvZiBgc3RhdHVzYC4gQSBub24tZW1wdHkgcXVldWUgcHJvbW90ZXMgdGhlIGFjdGl2aXR5XG4gKiB0byB7QGxpbmsgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZH07IGVtcHR5aW5nIGl0IGNsZWFycyB0aGVcbiAqIGlucHV0LW5lZWRlZC1zcGVjaWZpYyBiaXQuIFNpbmNlIGBJbnB1dE5lZWRlZGAgaW1wbGllc1xuICoge0BsaW5rIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzc30sIGFuIHVuYmxvY2tlZCB0dXJuIGZhbGxzIGJhY2sgdG9cbiAqIGBJblByb2dyZXNzYCB3aGlsZSBhbiBhbHJlYWR5LWlkbGUgc2Vzc2lvbiBzdGF5cyBpZGxlLiBPcnRob2dvbmFsIGZsYWdzXG4gKiAoYElzUmVhZGAgLyBgSXNBcmNoaXZlZGApIGFyZSBwcmVzZXJ2ZWQuXG4gKi9cbmZ1bmN0aW9uIHdpdGhJbnB1dE5lZWRlZFN0YXR1cyhzdGF0dXM6IFNlc3Npb25TdGF0dXMsIGlucHV0TmVlZGVkOiByZWFkb25seSBTZXNzaW9uSW5wdXRSZXF1ZXN0W10pOiBTZXNzaW9uU3RhdHVzIHtcblx0aWYgKGlucHV0TmVlZGVkLmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gKHN0YXR1cyAmIH5TVEFUVVNfQUNUSVZJVFlfTUFTSykgfCBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkO1xuXHR9XG5cdHJldHVybiBzdGF0dXMgJiB+KFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQgJiB+U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTWNwU2VydmVyQ3VzdG9taXphdGlvbihcblx0c3RhdGU6IFNlc3Npb25TdGF0ZSxcblx0aWQ6IHN0cmluZyxcblx0dXBkYXRlOiAoZW50cnk6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24pID0+IE1jcFNlcnZlckN1c3RvbWl6YXRpb24sXG4pOiBTZXNzaW9uU3RhdGUge1xuXHRjb25zdCBsaXN0ID0gc3RhdGUuY3VzdG9taXphdGlvbnM7XG5cdGlmICghbGlzdCkge1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXHRjb25zdCB0b3BJZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMuaWQgPT09IGlkKTtcblx0aWYgKHRvcElkeCA+PSAwKSB7XG5cdFx0Y29uc3QgZW50cnkgPSBsaXN0W3RvcElkeF07XG5cdFx0aWYgKGVudHJ5LnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdHVwZGF0ZWRbdG9wSWR4XSA9IHVwZGF0ZShlbnRyeSk7XG5cdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGN1c3RvbWl6YXRpb25zOiB1cGRhdGVkIH07XG5cdH1cblx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0Y29uc3QgdXBkYXRlZCA9IGxpc3QubWFwKGNvbnRhaW5lciA9PiB7XG5cdFx0aWYgKGNvbnRhaW5lci50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkcmVuID0gY29udGFpbmVyLmNoaWxkcmVuO1xuXHRcdGlmICghY2hpbGRyZW4pIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkSWR4ID0gY2hpbGRyZW4uZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gaWQpO1xuXHRcdGlmIChjaGlsZElkeCA8IDApIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkID0gY2hpbGRyZW5bY2hpbGRJZHhdO1xuXHRcdGlmIChjaGlsZC50eXBlICE9PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gY2hpbGRyZW4uc2xpY2UoKTtcblx0XHRuZXdDaGlsZHJlbltjaGlsZElkeF0gPSB1cGRhdGUoY2hpbGQpO1xuXHRcdHJldHVybiB7IC4uLmNvbnRhaW5lciwgY2hpbGRyZW46IG5ld0NoaWxkcmVuIH07XG5cdH0pO1xuXHRpZiAoIWNoYW5nZWQpIHtcblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblx0cmV0dXJuIHsgLi4uc3RhdGUsIGN1c3RvbWl6YXRpb25zOiB1cGRhdGVkIH07XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTZXNzaW9uIFJlZHVjZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKlxuICogUHVyZSByZWR1Y2VyIGZvciBzZXNzaW9uIHN0YXRlLiBIYW5kbGVzIGFsbCB7QGxpbmsgU2Vzc2lvbkFjdGlvbn0gdmFyaWFudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXNzaW9uUmVkdWNlcihzdGF0ZTogU2Vzc2lvblN0YXRlLCBhY3Rpb246IFNlc3Npb25BY3Rpb24sIGxvZz86IChtc2c6IHN0cmluZykgPT4gdm9pZCk6IFNlc3Npb25TdGF0ZSB7XG5cdHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcblx0XHQvLyBcdTI1MDBcdTI1MDAgTGlmZWN5Y2xlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeTpcblx0XHRcdC8vIGBTZXNzaW9uUmVhZHlgIGlzIHB1cmVseSBhIGxpZmVjeWNsZSB0cmFuc2l0aW9uIChDcmVhdGluZyAtPlxuXHRcdFx0Ly8gUmVhZHkpLiBJdCBtdXN0IG5vdCB0b3VjaCBgc3RhdHVzYDogZm9yIHByb3Zpc2lvbmFsIHNlc3Npb25zIHRoZVxuXHRcdFx0Ly8gZmlyc3QgdHVybiBjYW4gc3RhcnQgYmVmb3JlIG1hdGVyaWFsaXphdGlvbiBjb21wbGV0ZXMsIHNvIGFuXG5cdFx0XHQvLyBgYWN0aXZlVHVybmAgbWF5IGFscmVhZHkgYmUgc2V0IHdoZW4gdGhpcyBhY3Rpb24gaXMgZGlzcGF0Y2hlZFxuXHRcdFx0Ly8gKGUuZy4gZnJvbSBhIG1hdGVyaWFsaXplLXNlc3Npb24gaGFuZGxlcikuIE90aGVyIHJlZHVjZXJzIGtlZXBcblx0XHRcdC8vIGBzdGF0dXNgIGluIHN5bmMgd2l0aCB0aGUgYWN0aXZpdHkgc3RhdGUsIHNvIGxlYXZpbmcgaXQgYWxvbmUgaGVyZVxuXHRcdFx0Ly8gaXMgY29ycmVjdC5cblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHkgfTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3JlYXRpb25GYWlsZWQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5zdGF0ZSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW9uRmFpbGVkLFxuXHRcdFx0XHRjcmVhdGlvbkVycm9yOiBhY3Rpb24uZXJyb3IsXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQ6IHtcblx0XHRcdGNvbnN0IGxpc3QgPSBzdGF0ZS5jaGF0cztcblx0XHRcdGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KGMgPT4gYy5yZXNvdXJjZSA9PT0gYWN0aW9uLnN1bW1hcnkucmVzb3VyY2UpO1xuXHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGNoYXRzOiBbLi4ubGlzdCwgYWN0aW9uLnN1bW1hcnldIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0dXBkYXRlZFtpZHhdID0gYWN0aW9uLnN1bW1hcnk7XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY2hhdHM6IHVwZGF0ZWQgfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRSZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuY2hhdHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMucmVzb3VyY2UgPT09IGFjdGlvbi5jaGF0KTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHR1cGRhdGVkLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0Y29uc3QgbmV4dDogU2Vzc2lvblN0YXRlID0geyAuLi5zdGF0ZSwgY2hhdHM6IHVwZGF0ZWQgfTtcblx0XHRcdGlmIChzdGF0ZS5kZWZhdWx0Q2hhdCA9PT0gYWN0aW9uLmNoYXQpIHtcblx0XHRcdFx0ZGVsZXRlIG5leHQuZGVmYXVsdENoYXQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV4dDtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRVcGRhdGVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuY2hhdHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMucmVzb3VyY2UgPT09IGFjdGlvbi5jaGF0KTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgcmVzb3VyY2U6IF9pZ25vcmVkLCAuLi5jaGFuZ2VzIH0gPSBhY3Rpb24uY2hhbmdlcztcblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHR1cGRhdGVkW2lkeF0gPSB7IC4uLmxpc3RbaWR4XSwgLi4uY2hhbmdlcyB9O1xuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGNoYXRzOiB1cGRhdGVkIH07XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25EZWZhdWx0Q2hhdENoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgZGVmYXVsdENoYXQ6IGFjdGlvbi5kZWZhdWx0Q2hhdCB9O1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIE1ldGFkYXRhIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgdGl0bGU6IGFjdGlvbi50aXRsZSB9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdHN0YXR1czogd2l0aFN0YXR1c0ZsYWcoc3RhdGUuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLklzUmVhZCwgYWN0aW9uLmlzUmVhZCksXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRzdGF0dXM6IHdpdGhTdGF0dXNGbGFnKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLCBhY3Rpb24uaXNBcmNoaXZlZCksXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25BY3Rpdml0eUNoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgYWN0aXZpdHk6IGFjdGlvbi5hY3Rpdml0eSB9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DaGFuZ2VzZXRzQ2hhbmdlZDoge1xuXHRcdFx0Y29uc3QgeyBjaGFuZ2VzZXRzOiBfb21pdCwgLi4uc3RhdGVXaXRob3V0Q2hhbmdlc2V0cyB9ID0gc3RhdGU7XG5cdFx0XHRyZXR1cm4gYWN0aW9uLmNoYW5nZXNldHNcblx0XHRcdFx0PyB7IC4uLnN0YXRlV2l0aG91dENoYW5nZXNldHMsIGNoYW5nZXNldHM6IGFjdGlvbi5jaGFuZ2VzZXRzIH1cblx0XHRcdFx0OiBzdGF0ZVdpdGhvdXRDaGFuZ2VzZXRzO1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZDpcblx0XHRcdGlmICghc3RhdGUuY29uZmlnKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHQuLi5zdGF0ZS5jb25maWcsXG5cdFx0XHRcdFx0dmFsdWVzOiBhY3Rpb24ucmVwbGFjZSA/IHsgLi4uYWN0aW9uLmNvbmZpZyB9IDogeyAuLi5zdGF0ZS5jb25maWcudmFsdWVzLCAuLi5hY3Rpb24uY29uZmlnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZDpcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBfbWV0YTogYWN0aW9uLl9tZXRhIH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvblNlcnZlclRvb2xzQ2hhbmdlZDpcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBzZXJ2ZXJUb29sczogYWN0aW9uLnRvb2xzIH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLmFjdGl2ZUNsaWVudHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMuY2xpZW50SWQgPT09IGFjdGlvbi5hY3RpdmVDbGllbnQuY2xpZW50SWQpO1xuXHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGFjdGl2ZUNsaWVudHM6IFsuLi5saXN0LCBhY3Rpb24uYWN0aXZlQ2xpZW50XSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IGxpc3Quc2xpY2UoKTtcblx0XHRcdHVwZGF0ZWRbaWR4XSA9IGFjdGlvbi5hY3RpdmVDbGllbnQ7XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgYWN0aXZlQ2xpZW50czogdXBkYXRlZCB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50UmVtb3ZlZDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLmFjdGl2ZUNsaWVudHM7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChjID0+IGMuY2xpZW50SWQgPT09IGFjdGlvbi5jbGllbnRJZCk7XG5cdFx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0dXBkYXRlZC5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBhY3RpdmVDbGllbnRzOiB1cGRhdGVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFdvcmtpbmcgRGlyZWN0b3JpZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQ6IHtcblx0XHRcdGNvbnN0IGxpc3QgPSBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXMgPz8gW107XG5cdFx0XHRpZiAobGlzdC5pbmNsdWRlcyhhY3Rpb24uZGlyZWN0b3J5KSkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbLi4ubGlzdCwgYWN0aW9uLmRpcmVjdG9yeV0gfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkeCA9IGxpc3QuaW5kZXhPZihhY3Rpb24uZGlyZWN0b3J5KTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHR1cGRhdGVkLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHdvcmtpbmdEaXJlY3RvcmllczogdXBkYXRlZCB9O1xuXHRcdH1cblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBJbnB1dCBOZWVkZWQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkU2V0OiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuaW5wdXROZWVkZWQgPz8gW107XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleChyID0+IHIuaWQgPT09IGFjdGlvbi5yZXF1ZXN0LmlkKTtcblx0XHRcdGNvbnN0IGlucHV0TmVlZGVkID0gaWR4IDwgMCA/IFsuLi5saXN0LCBhY3Rpb24ucmVxdWVzdF0gOiBsaXN0LnNsaWNlKCk7XG5cdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0aW5wdXROZWVkZWRbaWR4XSA9IGFjdGlvbi5yZXF1ZXN0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGlucHV0TmVlZGVkLCBzdGF0dXM6IHdpdGhJbnB1dE5lZWRlZFN0YXR1cyhzdGF0ZS5zdGF0dXMsIGlucHV0TmVlZGVkKSB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRSZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuaW5wdXROZWVkZWQ7XG5cdFx0XHRpZiAoIWxpc3QpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaWR4ID0gbGlzdC5maW5kSW5kZXgociA9PiByLmlkID09PSBhY3Rpb24uaWQpO1xuXHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0cmVtYWluaW5nLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0Y29uc3QgbmV4dDogU2Vzc2lvblN0YXRlID0geyAuLi5zdGF0ZSwgc3RhdHVzOiB3aXRoSW5wdXROZWVkZWRTdGF0dXMoc3RhdGUuc3RhdHVzLCByZW1haW5pbmcpIH07XG5cdFx0XHRpZiAocmVtYWluaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bmV4dC5pbnB1dE5lZWRlZCA9IHJlbWFpbmluZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlbGV0ZSBuZXh0LmlucHV0TmVlZGVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5leHQ7XG5cdFx0fVxuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIEN1c3RvbWl6YXRpb25zIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY3VzdG9taXphdGlvbnM6IGFjdGlvbi5jdXN0b21pemF0aW9ucyB9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZDoge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHN0YXRlLmN1c3RvbWl6YXRpb25zO1xuXHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvcElkeCA9IGxpc3QuZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdGlmICh0b3BJZHggPj0gMCkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkID0gbGlzdC5zbGljZSgpO1xuXHRcdFx0XHR1cGRhdGVkW3RvcElkeF0gPSB7IC4uLmxpc3RbdG9wSWR4XSwgZW5hYmxlZDogYWN0aW9uLmVuYWJsZWQgfTtcblx0XHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGN1c3RvbWl6YXRpb25zOiB1cGRhdGVkIH07XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gbGlzdFtpXTtcblx0XHRcdFx0aWYgKGNvbnRhaW5lci50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjaGlsZHJlbiA9IGNvbnRhaW5lci5jaGlsZHJlbjtcblx0XHRcdFx0aWYgKCFjaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNoaWxkSWR4ID0gY2hpbGRyZW4uZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdFx0aWYgKGNoaWxkSWR4IDwgMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gY2hpbGRyZW4uc2xpY2UoKTtcblx0XHRcdFx0bmV3Q2hpbGRyZW5bY2hpbGRJZHhdID0geyAuLi5jaGlsZHJlbltjaGlsZElkeF0sIGVuYWJsZWQ6IGFjdGlvbi5lbmFibGVkIH07XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHRcdHVwZGF0ZWRbaV0gPSB7IC4uLmNvbnRhaW5lciwgY2hpbGRyZW46IG5ld0NoaWxkcmVuIH07XG5cdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBjdXN0b21pemF0aW9uczogdXBkYXRlZCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQ6IHtcblx0XHRcdGNvbnN0IGxpc3QgPSBzdGF0ZS5jdXN0b21pemF0aW9ucyA/PyBbXTtcblx0XHRcdGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gYWN0aW9uLmN1c3RvbWl6YXRpb24uaWQpO1xuXHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIGN1c3RvbWl6YXRpb25zOiBbLi4ubGlzdCwgYWN0aW9uLmN1c3RvbWl6YXRpb25dIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gWy4uLmxpc3RdO1xuXHRcdFx0dXBkYXRlZFtpZHhdID0gYWN0aW9uLmN1c3RvbWl6YXRpb247XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgY3VzdG9taXphdGlvbnM6IHVwZGF0ZWQgfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUuY3VzdG9taXphdGlvbnM7XG5cdFx0XHRpZiAoIWxpc3QpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9wSWR4ID0gbGlzdC5maW5kSW5kZXgoYyA9PiBjLmlkID09PSBhY3Rpb24uaWQpO1xuXHRcdFx0aWYgKHRvcElkeCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHRcdHVwZGF0ZWQuc3BsaWNlKHRvcElkeCwgMSk7XG5cdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBjdXN0b21pemF0aW9uczogdXBkYXRlZCB9O1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0Lm1hcChjb250YWluZXIgPT4ge1xuXHRcdFx0XHRpZiAoY29udGFpbmVyLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBjb250YWluZXIuY2hpbGRyZW47XG5cdFx0XHRcdGlmICghY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNoaWxkSWR4ID0gY2hpbGRyZW4uZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdFx0aWYgKGNoaWxkSWR4IDwgMCkge1xuXHRcdFx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gY2hpbGRyZW4uc2xpY2UoKTtcblx0XHRcdFx0bmV3Q2hpbGRyZW4uc3BsaWNlKGNoaWxkSWR4LCAxKTtcblx0XHRcdFx0cmV0dXJuIHsgLi4uY29udGFpbmVyLCBjaGlsZHJlbjogbmV3Q2hpbGRyZW4gfTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFjaGFuZ2VkKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBjdXN0b21pemF0aW9uczogdXBkYXRlZCB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkOiB7XG5cdFx0XHRyZXR1cm4gdXBkYXRlTWNwU2VydmVyQ3VzdG9taXphdGlvbihzdGF0ZSwgYWN0aW9uLmlkLCBlbnRyeSA9PiAoe1xuXHRcdFx0XHQuLi5lbnRyeSxcblx0XHRcdFx0c3RhdGU6IGFjdGlvbi5zdGF0ZSxcblx0XHRcdFx0Y2hhbm5lbDogYWN0aW9uLmNoYW5uZWwsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGFydFJlcXVlc3RlZDoge1xuXHRcdFx0cmV0dXJuIHVwZGF0ZU1jcFNlcnZlckN1c3RvbWl6YXRpb24oc3RhdGUsIGFjdGlvbi5pZCwgZW50cnkgPT4gKHtcblx0XHRcdFx0Li4uZW50cnksXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZyB9LFxuXHRcdFx0XHRjaGFubmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdG9wUmVxdWVzdGVkOiB7XG5cdFx0XHRyZXR1cm4gdXBkYXRlTWNwU2VydmVyQ3VzdG9taXphdGlvbihzdGF0ZSwgYWN0aW9uLmlkLCBlbnRyeSA9PiAoe1xuXHRcdFx0XHQuLi5lbnRyeSxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQgfSxcblx0XHRcdFx0Y2hhbm5lbDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRzb2Z0QXNzZXJ0TmV2ZXIoYWN0aW9uLCBsb2cpO1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFRQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQixlQUFlLG1CQUFtQix1QkFBaUc7QUFFOUosU0FBUyx1QkFBdUI7QUFLaEMsTUFBTSx3QkFBd0IsS0FBSyxLQUFLO0FBR3hDLFNBQVMsZUFBZSxRQUF1QixNQUFxQixLQUE2QjtBQUNoRyxTQUFPLE1BQU0sU0FBUyxPQUFPLFNBQVMsQ0FBQztBQUN4QztBQVdBLFNBQVMsc0JBQXNCLFFBQXVCLGFBQTREO0FBQ2pILE1BQUksWUFBWSxTQUFTLEdBQUc7QUFDM0IsV0FBUSxTQUFTLENBQUMsdUJBQXdCLGNBQWM7QUFBQSxFQUN6RDtBQUNBLFNBQU8sU0FBUyxFQUFFLGNBQWMsY0FBYyxDQUFDLGNBQWM7QUFDOUQ7QUFFQSxTQUFTLDZCQUNSLE9BQ0EsSUFDQSxRQUNlO0FBQ2YsUUFBTSxPQUFPLE1BQU07QUFDbkIsTUFBSSxDQUFDLE1BQU07QUFD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
