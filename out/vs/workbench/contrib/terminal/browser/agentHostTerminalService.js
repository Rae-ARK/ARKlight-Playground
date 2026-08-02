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
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue, transaction } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { AgentHostPty } from "./agentHostPty.js";
import { AgentHostOutputChannel } from "./agentHostOutputChannel.js";
import { AhpTerminalCommandSource } from "./ahpTerminalCommandSource.js";
import { ITerminalChatService, ITerminalService } from "./terminal.js";
import { ITerminalProfileService } from "../common/terminal.js";
const AGENT_HOST_PROFILE_EXT_ID = "vscode.agent-host-terminal";
const IAgentHostTerminalService = createDecorator("agentHostTerminalService");
let AgentHostTerminalService = class extends Disposable {
  constructor(_terminalService, _terminalChatService, _terminalProfileService, _quickInputService) {
    super();
    this._terminalService = _terminalService;
    this._terminalChatService = _terminalChatService;
    this._terminalProfileService = _terminalProfileService;
    this._quickInputService = _quickInputService;
    this._entries = [];
    this._usedHosts = /* @__PURE__ */ new Set();
    this._profileRegistrations = this._register(new DisposableMap());
    this._profiles = observableValue("agentHostTerminalProfiles", []);
    this.profiles = this._profiles;
    /** Revived terminal instances, keyed by terminal URI string. */
    this._revivedInstances = /* @__PURE__ */ new Map();
    /**
     * Active AgentHostPty instances with their owning connection clientId,
     * keyed by terminal URI string. Used for reconnection scoping.
     */
    this._activePtys = /* @__PURE__ */ new Map();
    this._pendingRevives = /* @__PURE__ */ new Map();
  }
  // #region Profile management
  registerEntry(entry) {
    this._entries.push(entry);
    this._reconcile();
    return toDisposable(() => {
      const idx = this._entries.indexOf(entry);
      if (idx >= 0) {
        this._entries.splice(idx, 1);
        this._reconcile();
      }
    });
  }
  getProfileForConnection(address) {
    const entry = this._entries.find((e) => e.address === address);
    if (!entry) {
      return void 0;
    }
    if (!this._profileRegistrations.has(address)) {
      this._usedHosts.add(address);
      this._reconcile();
    }
    return this._profiles.get().find((p) => p.address === address);
  }
  setDefaultCwd(cwd) {
    this._defaultCwd = cwd;
  }
  _reconcile() {
    const entries = this._entries;
    const desiredProfiles = /* @__PURE__ */ new Map();
    if (entries.length === 0) {
    } else if (entries.length === 1) {
      desiredProfiles.set(entries[0].address, entries[0]);
    } else {
      let displaying = 0;
      for (const address of this._usedHosts) {
        const entry = entries.find((e) => e.address === address);
        if (entry) {
          displaying++;
          desiredProfiles.set(entry.address, entry);
        }
      }
      if (displaying === entries.length - 1) {
        const missing = entries.find((e) => !this._usedHosts.has(e.address));
        if (missing) {
          desiredProfiles.set(missing.address, missing);
        }
      } else if (displaying < entries.length) {
        desiredProfiles.set("__quickpick__", {
          name: localize("agentHostTerminal.pick", "Agent Host\u2026"),
          address: "__quickpick__",
          getConnection: () => void 0
        });
      }
    }
    for (const [key, entry] of desiredProfiles) {
      if (!this._profileRegistrations.has(key)) {
        this._registerProfile(key, entry, entries);
      }
    }
    for (const key of this._profileRegistrations.keys()) {
      if (!desiredProfiles.has(key)) {
        this._profileRegistrations.deleteAndDispose(key);
      }
    }
    const infos = [];
    for (const [key] of desiredProfiles) {
      infos.push({
        extensionIdentifier: AGENT_HOST_PROFILE_EXT_ID,
        profileId: key,
        title: key === "__quickpick__" ? localize("agentHostTerminal.pick", "Agent Host\u2026") : localize("agentHostTerminal.profileName", "Agent Host ({0})", desiredProfiles.get(key).name),
        address: key
      });
    }
    transaction((tx) => {
      this._profiles.set(infos, tx);
    });
  }
  _registerProfile(key, entry, allEntries) {
    const provider = {
      createContributedTerminalProfile: async (options) => {
        let connection;
        let displayName = entry.name;
        if (key === "__quickpick__") {
          const picks = allEntries.map((e) => ({
            label: localize("agentHostTerminal.profileName", "Agent Host ({0})", e.name),
            address: e.address,
            hostName: e.name
          }));
          const pick = await this._quickInputService.pick(picks, {
            placeHolder: localize("agentHostTerminal.pickHost", "Select an agent host to open a terminal on")
          });
          if (!pick) {
            return;
          }
          this._usedHosts.add(pick.address);
          this._reconcile();
          displayName = pick.hostName;
          connection = allEntries.find((e) => e.address === pick.address)?.getConnection();
        } else {
          connection = entry.getConnection();
        }
        if (!connection) {
          return;
        }
        await this.createTerminal(connection, {
          name: localize("agentHostTerminal.profileName", "Agent Host ({0})", displayName),
          cwd: options.cwd ? typeof options.cwd === "string" ? URI.file(options.cwd) : options.cwd : this._defaultCwd,
          location: options.location
        });
      }
    };
    const title = key === "__quickpick__" ? localize("agentHostTerminal.pick", "Agent Host\u2026") : localize("agentHostTerminal.profileName", "Agent Host ({0})", entry.name);
    const store = new DisposableStore();
    store.add(this._terminalProfileService.registerTerminalProfileProvider(
      AGENT_HOST_PROFILE_EXT_ID,
      key,
      provider
    ));
    store.add(this._terminalProfileService.registerInternalContributedProfile({
      extensionIdentifier: AGENT_HOST_PROFILE_EXT_ID,
      id: key,
      title,
      icon: "remote"
    }));
    this._profileRegistrations.set(key, store);
  }
  // #endregion
  async createTerminalForEntry(address, options) {
    const entry = this._entries.find((e) => e.address === address);
    if (!entry) {
      return void 0;
    }
    const connection = entry.getConnection();
    if (!connection) {
      return void 0;
    }
    return this.createTerminal(connection, options);
  }
  async createTerminal(connection, options) {
    const terminalUri = URI.from({ scheme: "agenthost-terminal", path: `/${generateUuid()}` });
    const name = options?.name ?? localize("agentHostTerminal.default", "Agent Host Terminal");
    const key = terminalUri.toString();
    const instance = await this._terminalService.createTerminal({
      config: {
        customPtyImplementation: (id, cols, rows) => {
          const pty = new AgentHostPty(id, connection, terminalUri, {
            name,
            cwd: options?.cwd
          });
          if (cols > 0 && rows > 0) {
            pty.resize(cols, rows);
          }
          this._activePtys.set(key, { pty, clientId: connection.clientId });
          return pty;
        },
        name,
        icon: { id: "remote" },
        isFeatureTerminal: false
      },
      location: options?.location
    });
    this._register(instance.onDisposed(() => {
      this._activePtys.delete(key);
    }));
    return instance;
  }
  async reviveTerminal(connection, terminalUri, terminalToolSessionId) {
    const key = terminalUri.toString();
    const pending = this._pendingRevives.get(key);
    if (pending) {
      return pending;
    }
    const revive = this._doReviveTerminal(connection, terminalUri, terminalToolSessionId, key).finally(() => {
      if (this._pendingRevives.get(key) === revive) {
        this._pendingRevives.delete(key);
      }
    });
    this._pendingRevives.set(key, revive);
    return revive;
  }
  attachOutputTerminal(connection, terminalUri, terminalToolSessionId) {
    const store = new DisposableStore();
    const source = store.add(new AgentHostOutputChannel(connection, terminalUri));
    store.add(this._terminalChatService.registerOutputSource(terminalToolSessionId, source));
    return store;
  }
  async _doReviveTerminal(connection, terminalUri, terminalToolSessionId, key) {
    const existing = this._revivedInstances.get(key);
    if (existing) {
      return existing;
    }
    const store = new DisposableStore();
    const commandSource = store.add(new AhpTerminalCommandSource());
    const instancePromise = Promise.resolve().then(() => this._terminalService.createTerminal({
      config: {
        customPtyImplementation: (id, cols, rows) => {
          const pty = new AgentHostPty(id, connection, terminalUri, {
            attachOnly: true
          });
          if (cols > 0 && rows > 0) {
            pty.resize(cols, rows);
          }
          if (!store.isDisposed) {
            commandSource.connect(instance, pty);
          }
          this._activePtys.set(key, { pty, clientId: connection.clientId });
          return pty;
        },
        name: localize("agentHostTerminal.tool", "Agent Host Terminal"),
        isFeatureTerminal: true,
        hideFromUser: true
      }
    }));
    store.add(this._terminalChatService.registerAhpCommandSource(terminalToolSessionId, commandSource, instancePromise));
    let instance;
    try {
      instance = await instancePromise;
    } catch (error) {
      store.dispose();
      throw error;
    }
    this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, instance);
    this._revivedInstances.set(key, instance);
    instance.store.add(store);
    this._register(instance.onDisposed(() => {
      this._revivedInstances.delete(key);
      this._activePtys.delete(key);
    }));
    return instance;
  }
  async reconnectTerminals(newConnection, oldClientId) {
    const entries = [...this._activePtys.entries()].filter(
      ([, entry]) => entry.clientId === oldClientId
    );
    const total = entries.length;
    let recovered = 0;
    const promises = [];
    for (const [key, entry] of entries) {
      promises.push(
        entry.pty.reconnect(newConnection).then((success) => {
          if (success) {
            recovered++;
            entry.clientId = newConnection.clientId;
          } else {
            console.warn(`[AgentHostTerminalService] Failed to reconnect terminal: ${key}`);
          }
        })
      );
    }
    await Promise.all(promises);
    return { recovered, total };
  }
};
AgentHostTerminalService = __decorateClass([
  __decorateParam(0, ITerminalService),
  __decorateParam(1, ITerminalChatService),
  __decorateParam(2, ITerminalProfileService),
  __decorateParam(3, IQuickInputService)
], AgentHostTerminalService);
export {
  AgentHostTerminalService,
  IAgentHostTerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RQdHkgfSBmcm9tICcuL2FnZW50SG9zdFB0eS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPdXRwdXRDaGFubmVsIH0gZnJvbSAnLi9hZ2VudEhvc3RPdXRwdXRDaGFubmVsLmpzJztcbmltcG9ydCB7IEFocFRlcm1pbmFsQ29tbWFuZFNvdXJjZSB9IGZyb20gJy4vYWhwVGVybWluYWxDb21tYW5kU291cmNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENoYXRTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlUHJvdmlkZXIsIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zIHtcblx0LyoqIEh1bWFuLXJlYWRhYmxlIHRlcm1pbmFsIG5hbWUuICovXG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdC8qKiBJbml0aWFsIHdvcmtpbmcgZGlyZWN0b3J5LiAqL1xuXHRyZWFkb25seSBjd2Q/OiBVUkk7XG5cdC8qKiBUZXJtaW5hbCBsb2NhdGlvbiAocGFuZWwsIGVkaXRvciwgc3BsaXQsIGV0Yy4pLiAqL1xuXHRyZWFkb25seSBsb2NhdGlvbj86IElUZXJtaW5hbExvY2F0aW9uT3B0aW9ucztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0RW50cnkge1xuXHQvKiogRGlzcGxheSBuYW1lIGZvciB0aGUgcHJvZmlsZS4gKi9cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHQvKiogQWRkcmVzcyBvciBpZGVudGlmaWVyIGZvciB0aGUgaG9zdC4gKi9cblx0cmVhZG9ubHkgYWRkcmVzczogc3RyaW5nO1xuXHQvKiogR2V0dGVyIGZvciB0aGUgY29ubmVjdGlvbiAobWF5IGJlIGxhemlseSByZXNvbHZlZCkuICovXG5cdHJlYWRvbmx5IGdldENvbm5lY3Rpb246ICgpID0+IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFRlcm1pbmFsUHJvZmlsZUluZm8ge1xuXHRyZWFkb25seSBleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb2ZpbGVJZDogc3RyaW5nO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmc7XG59XG5cbmNvbnN0IEFHRU5UX0hPU1RfUFJPRklMRV9FWFRfSUQgPSAndnNjb2RlLmFnZW50LWhvc3QtdGVybWluYWwnO1xuXG5leHBvcnQgY29uc3QgSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlPignYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKiogT2JzZXJ2YWJsZSBsaXN0IG9mIHJlZ2lzdGVyZWQgYWdlbnQgaG9zdCB0ZXJtaW5hbCBwcm9maWxlcy4gKi9cblx0cmVhZG9ubHkgcHJvZmlsZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudEhvc3RUZXJtaW5hbFByb2ZpbGVJbmZvW10+O1xuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIGEgbmFtZWQgcHJvZmlsZSBleGlzdHMgZm9yIHRoZSBnaXZlbiBhZGRyZXNzLCBleHBhbmRpbmcgYW55XG5cdCAqIGNvbGxhcHNlZCBxdWlja3BpY2sgcHJvZmlsZSBpZiBuZWVkZWQuIFJldHVybnMgdGhlIHByb2ZpbGUgaW5mbywgb3Jcblx0ICogYHVuZGVmaW5lZGAgaWYgbm8gZW50cnkgaXMgcmVnaXN0ZXJlZCBmb3IgdGhlIGFkZHJlc3MuXG5cdCAqL1xuXHRnZXRQcm9maWxlRm9yQ29ubmVjdGlvbihhZGRyZXNzOiBzdHJpbmcpOiBJQWdlbnRIb3N0VGVybWluYWxQcm9maWxlSW5mbyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGFuIGFnZW50IGhvc3QgZW50cnkuIFRoZSBzZXJ2aWNlIHJlY29uY2lsZXMgZW50cmllcyBpbnRvXG5cdCAqIHRlcm1pbmFsIHByb2ZpbGVzIGF1dG9tYXRpY2FsbHkuIERpc3Bvc2UgdGhlIHJldHVybmVkIGRpc3Bvc2FibGUgdG9cblx0ICogcmVtb3ZlIHRoZSBlbnRyeS5cblx0ICovXG5cdHJlZ2lzdGVyRW50cnkoZW50cnk6IElBZ2VudEhvc3RFbnRyeSk6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IGludGVyYWN0aXZlIHRlcm1pbmFsIG9uIHRoZSBnaXZlbiBhZ2VudCBob3N0IGNvbm5lY3Rpb24uXG5cdCAqL1xuXHRjcmVhdGVUZXJtaW5hbChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCBvcHRpb25zPzogSUFnZW50SG9zdFRlcm1pbmFsQ3JlYXRlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+O1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgdGVybWluYWwgZm9yIHRoZSBhZ2VudCBob3N0IHJlZ2lzdGVyZWQgYXQgdGhlIGdpdmVuIGFkZHJlc3MsXG5cdCAqIHJlc29sdmluZyB0aGUgY29ubmVjdGlvbiBmcm9tIHRoZSByZWdpc3RlcmVkIGVudHJ5LiBSZXR1cm5zIGB1bmRlZmluZWRgXG5cdCAqIGlmIG5vIGVudHJ5IGlzIHJlZ2lzdGVyZWQgZm9yIHRoZSBhZGRyZXNzLlxuXHQgKi9cblx0Y3JlYXRlVGVybWluYWxGb3JFbnRyeShhZGRyZXNzOiBzdHJpbmcsIG9wdGlvbnM/OiBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFJlY29ubmVjdHMgYWxsIGFjdGl2ZSB0ZXJtaW5hbHMgdGhhdCBiZWxvbmdlZCB0byB7QGxpbmsgb2xkQ2xpZW50SWR9XG5cdCAqIHRvIGEgbmV3IGFnZW50IGhvc3QgY29ubmVjdGlvbi4gT25seSB0ZXJtaW5hbHMgbWF0Y2hpbmcgdGhlIG9sZFxuXHQgKiBjbGllbnQgYXJlIHRvdWNoZWQgXHUyMDE0IHRlcm1pbmFscyBmcm9tIG90aGVyIGhvc3RzIGFyZSBsZWZ0IGFsb25lLlxuXHQgKi9cblx0cmVjb25uZWN0VGVybWluYWxzKG5ld0Nvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIG9sZENsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPHsgcmVjb3ZlcmVkOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfT47XG5cblx0LyoqXG5cdCAqIEF0dGFjaGVzIHRvIGFuIGV4aXN0aW5nIHNlcnZlci1zaWRlIHRlcm1pbmFsIGJ5IHN1YnNjcmliaW5nIHRvIGl0c1xuXHQgKiBzdGF0ZSB3aXRob3V0IGNyZWF0aW5nIGEgbmV3IHByb2Nlc3MuXG5cdCAqL1xuXHRyZXZpdmVUZXJtaW5hbChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCB0ZXJtaW5hbFVyaTogVVJJLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+O1xuXG5cdC8qKiBBdHRhY2ggYSBub24tcHR5IG91dHB1dCBjaGFubmVsIGRpcmVjdGx5IHRvIGNoYXQgd2l0aG91dCBjcmVhdGluZyBhIHRlcm1pbmFsIGluc3RhbmNlLiAqL1xuXHRhdHRhY2hPdXRwdXRUZXJtaW5hbChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCB0ZXJtaW5hbFVyaTogVVJJLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyk6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBkZWZhdWx0IGN3ZCB1c2VkIGJ5IHByb2ZpbGUgcHJvdmlkZXJzIHdoZW4gbm8gZXhwbGljaXQgY3dkXG5cdCAqIGlzIHByb3ZpZGVkLiBDYWxsIHdpdGggYHVuZGVmaW5lZGAgdG8gY2xlYXIuXG5cdCAqL1xuXHRzZXREZWZhdWx0Q3dkKGN3ZDogVVJJIHwgdW5kZWZpbmVkKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFRlcm1pbmFsU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllczogSUFnZW50SG9zdEVudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNlZEhvc3RzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb2ZpbGVSZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZmlsZXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50SG9zdFRlcm1pbmFsUHJvZmlsZUluZm9bXT4oJ2FnZW50SG9zdFRlcm1pbmFsUHJvZmlsZXMnLCBbXSk7XG5cdHJlYWRvbmx5IHByb2ZpbGVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRIb3N0VGVybWluYWxQcm9maWxlSW5mb1tdPiA9IHRoaXMuX3Byb2ZpbGVzO1xuXG5cdHByaXZhdGUgX2RlZmF1bHRDd2Q6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHQvKiogUmV2aXZlZCB0ZXJtaW5hbCBpbnN0YW5jZXMsIGtleWVkIGJ5IHRlcm1pbmFsIFVSSSBzdHJpbmcuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jldml2ZWRJbnN0YW5jZXMgPSBuZXcgTWFwPHN0cmluZywgSVRlcm1pbmFsSW5zdGFuY2U+KCk7XG5cdC8qKlxuXHQgKiBBY3RpdmUgQWdlbnRIb3N0UHR5IGluc3RhbmNlcyB3aXRoIHRoZWlyIG93bmluZyBjb25uZWN0aW9uIGNsaWVudElkLFxuXHQgKiBrZXllZCBieSB0ZXJtaW5hbCBVUkkgc3RyaW5nLiBVc2VkIGZvciByZWNvbm5lY3Rpb24gc2NvcGluZy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVB0eXMgPSBuZXcgTWFwPHN0cmluZywgeyBwdHk6IEFnZW50SG9zdFB0eTsgY2xpZW50SWQ6IHN0cmluZyB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmV2aXZlcyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvLyAjcmVnaW9uIFByb2ZpbGUgbWFuYWdlbWVudFxuXG5cdHJlZ2lzdGVyRW50cnkoZW50cnk6IElBZ2VudEhvc3RFbnRyeSk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9lbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdHRoaXMuX3JlY29uY2lsZSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fZW50cmllcy5pbmRleE9mKGVudHJ5KTtcblx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHR0aGlzLl9lbnRyaWVzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHR0aGlzLl9yZWNvbmNpbGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGdldFByb2ZpbGVGb3JDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IElBZ2VudEhvc3RUZXJtaW5hbFByb2ZpbGVJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZmluZChlID0+IGUuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gRXhwYW5kIHRoZSBjb2xsYXBzZWQgcXVpY2twaWNrIHByb2ZpbGUgaW50byBhIG5hbWVkIG9uZSBpZiBuZWVkZWRcblx0XHRpZiAoIXRoaXMuX3Byb2ZpbGVSZWdpc3RyYXRpb25zLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0dGhpcy5fdXNlZEhvc3RzLmFkZChhZGRyZXNzKTtcblx0XHRcdHRoaXMuX3JlY29uY2lsZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJvZmlsZXMuZ2V0KCkuZmluZChwID0+IHAuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdH1cblxuXHRzZXREZWZhdWx0Q3dkKGN3ZDogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmYXVsdEN3ZCA9IGN3ZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZSgpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5fZW50cmllcztcblx0XHRjb25zdCBkZXNpcmVkUHJvZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgSUFnZW50SG9zdEVudHJ5PigpO1xuXG5cdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBObyBob3N0cyBcdTIwMTQgbm8gcHJvZmlsZXNcblx0XHR9IGVsc2UgaWYgKGVudHJpZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRkZXNpcmVkUHJvZmlsZXMuc2V0KGVudHJpZXNbMF0uYWRkcmVzcywgZW50cmllc1swXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE11bHRpcGxlIGhvc3RzIFx1MjAxNCBzaG93IG5hbWVkIHByb2ZpbGVzIGZvciB1c2VkIG9uZXNcblx0XHRcdGxldCBkaXNwbGF5aW5nID0gMDtcblx0XHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiB0aGlzLl91c2VkSG9zdHMpIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzLmZpbmQoZSA9PiBlLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRkaXNwbGF5aW5nKys7XG5cdFx0XHRcdFx0ZGVzaXJlZFByb2ZpbGVzLnNldChlbnRyeS5hZGRyZXNzLCBlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChkaXNwbGF5aW5nID09PSBlbnRyaWVzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0Y29uc3QgbWlzc2luZyA9IGVudHJpZXMuZmluZChlID0+ICF0aGlzLl91c2VkSG9zdHMuaGFzKGUuYWRkcmVzcykpO1xuXHRcdFx0XHRpZiAobWlzc2luZykge1xuXHRcdFx0XHRcdGRlc2lyZWRQcm9maWxlcy5zZXQobWlzc2luZy5hZGRyZXNzLCBtaXNzaW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChkaXNwbGF5aW5nIDwgZW50cmllcy5sZW5ndGgpIHtcblx0XHRcdFx0ZGVzaXJlZFByb2ZpbGVzLnNldCgnX19xdWlja3BpY2tfXycsIHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwucGljaycsIFwiQWdlbnQgSG9zdFxcdTIwMjZcIiksXG5cdFx0XHRcdFx0YWRkcmVzczogJ19fcXVpY2twaWNrX18nLFxuXHRcdFx0XHRcdGdldENvbm5lY3Rpb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGlmZiByZWdpc3RyYXRpb25zXG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgZGVzaXJlZFByb2ZpbGVzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3Byb2ZpbGVSZWdpc3RyYXRpb25zLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyUHJvZmlsZShrZXksIGVudHJ5LCBlbnRyaWVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fcHJvZmlsZVJlZ2lzdHJhdGlvbnMua2V5cygpKSB7XG5cdFx0XHRpZiAoIWRlc2lyZWRQcm9maWxlcy5oYXMoa2V5KSkge1xuXHRcdFx0XHR0aGlzLl9wcm9maWxlUmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG9ic2VydmFibGVcblx0XHRjb25zdCBpbmZvczogSUFnZW50SG9zdFRlcm1pbmFsUHJvZmlsZUluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2tleV0gb2YgZGVzaXJlZFByb2ZpbGVzKSB7XG5cdFx0XHRpbmZvcy5wdXNoKHtcblx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogQUdFTlRfSE9TVF9QUk9GSUxFX0VYVF9JRCxcblx0XHRcdFx0cHJvZmlsZUlkOiBrZXksXG5cdFx0XHRcdHRpdGxlOiBrZXkgPT09ICdfX3F1aWNrcGlja19fJ1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdFRlcm1pbmFsLnBpY2snLCBcIkFnZW50IEhvc3RcXHUyMDI2XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwucHJvZmlsZU5hbWUnLCBcIkFnZW50IEhvc3QgKHswfSlcIiwgZGVzaXJlZFByb2ZpbGVzLmdldChrZXkpIS5uYW1lKSxcblx0XHRcdFx0YWRkcmVzczoga2V5LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHsgdGhpcy5fcHJvZmlsZXMuc2V0KGluZm9zLCB0eCk7IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJQcm9maWxlKGtleTogc3RyaW5nLCBlbnRyeTogSUFnZW50SG9zdEVudHJ5LCBhbGxFbnRyaWVzOiBJQWdlbnRIb3N0RW50cnlbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBJVGVybWluYWxQcm9maWxlUHJvdmlkZXIgPSB7XG5cdFx0XHRjcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZTogYXN5bmMgKG9wdGlvbnMpID0+IHtcblx0XHRcdFx0bGV0IGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBkaXNwbGF5TmFtZSA9IGVudHJ5Lm5hbWU7XG5cblx0XHRcdFx0aWYgKGtleSA9PT0gJ19fcXVpY2twaWNrX18nKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGlja3M6IChJUXVpY2tQaWNrSXRlbSAmIHsgYWRkcmVzczogc3RyaW5nOyBob3N0TmFtZTogc3RyaW5nIH0pW10gPSBhbGxFbnRyaWVzLm1hcChlID0+ICh7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdFRlcm1pbmFsLnByb2ZpbGVOYW1lJywgXCJBZ2VudCBIb3N0ICh7MH0pXCIsIGUubmFtZSksXG5cdFx0XHRcdFx0XHRhZGRyZXNzOiBlLmFkZHJlc3MsXG5cdFx0XHRcdFx0XHRob3N0TmFtZTogZS5uYW1lLFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRjb25zdCBwaWNrID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdhZ2VudEhvc3RUZXJtaW5hbC5waWNrSG9zdCcsIFwiU2VsZWN0IGFuIGFnZW50IGhvc3QgdG8gb3BlbiBhIHRlcm1pbmFsIG9uXCIpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICghcGljaykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl91c2VkSG9zdHMuYWRkKHBpY2suYWRkcmVzcyk7XG5cdFx0XHRcdFx0dGhpcy5fcmVjb25jaWxlKCk7XG5cdFx0XHRcdFx0ZGlzcGxheU5hbWUgPSBwaWNrLmhvc3ROYW1lO1xuXHRcdFx0XHRcdGNvbm5lY3Rpb24gPSBhbGxFbnRyaWVzLmZpbmQoZSA9PiBlLmFkZHJlc3MgPT09IHBpY2suYWRkcmVzcyk/LmdldENvbm5lY3Rpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25uZWN0aW9uID0gZW50cnkuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVUZXJtaW5hbChjb25uZWN0aW9uLCB7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2FnZW50SG9zdFRlcm1pbmFsLnByb2ZpbGVOYW1lJywgXCJBZ2VudCBIb3N0ICh7MH0pXCIsIGRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRjd2Q6IG9wdGlvbnMuY3dkID8gKHR5cGVvZiBvcHRpb25zLmN3ZCA9PT0gJ3N0cmluZycgPyBVUkkuZmlsZShvcHRpb25zLmN3ZCkgOiBvcHRpb25zLmN3ZCkgOiB0aGlzLl9kZWZhdWx0Q3dkLFxuXHRcdFx0XHRcdGxvY2F0aW9uOiBvcHRpb25zLmxvY2F0aW9uLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRpdGxlID0ga2V5ID09PSAnX19xdWlja3BpY2tfXydcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdFRlcm1pbmFsLnBpY2snLCBcIkFnZW50IEhvc3RcXHUyMDI2XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RUZXJtaW5hbC5wcm9maWxlTmFtZScsIFwiQWdlbnQgSG9zdCAoezB9KVwiLCBlbnRyeS5uYW1lKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxQcm9maWxlUHJvdmlkZXIoXG5cdFx0XHRBR0VOVF9IT1NUX1BST0ZJTEVfRVhUX0lELFxuXHRcdFx0a2V5LFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0KSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UucmVnaXN0ZXJJbnRlcm5hbENvbnRyaWJ1dGVkUHJvZmlsZSh7XG5cdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiBBR0VOVF9IT1NUX1BST0ZJTEVfRVhUX0lELFxuXHRcdFx0aWQ6IGtleSxcblx0XHRcdHRpdGxlLFxuXHRcdFx0aWNvbjogJ3JlbW90ZScsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3Byb2ZpbGVSZWdpc3RyYXRpb25zLnNldChrZXksIHN0b3JlKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHRhc3luYyBjcmVhdGVUZXJtaW5hbEZvckVudHJ5KGFkZHJlc3M6IHN0cmluZywgb3B0aW9ucz86IElBZ2VudEhvc3RUZXJtaW5hbENyZWF0ZU9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyaWVzLmZpbmQoZSA9PiBlLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBlbnRyeS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVUZXJtaW5hbChjb25uZWN0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVRlcm1pbmFsKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIG9wdGlvbnM/OiBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudGhvc3QtdGVybWluYWwnLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KTtcblx0XHRjb25zdCBuYW1lID0gb3B0aW9ucz8ubmFtZSA/PyBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwuZGVmYXVsdCcsIFwiQWdlbnQgSG9zdCBUZXJtaW5hbFwiKTtcblx0XHRjb25zdCBrZXkgPSB0ZXJtaW5hbFVyaS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdGN1c3RvbVB0eUltcGxlbWVudGF0aW9uOiAoaWQsIGNvbHMsIHJvd3MpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwdHkgPSBuZXcgQWdlbnRIb3N0UHR5KGlkLCBjb25uZWN0aW9uLCB0ZXJtaW5hbFVyaSwge1xuXHRcdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHRcdGN3ZDogb3B0aW9ucz8uY3dkLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChjb2xzID4gMCAmJiByb3dzID4gMCkge1xuXHRcdFx0XHRcdFx0cHR5LnJlc2l6ZShjb2xzLCByb3dzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlUHR5cy5zZXQoa2V5LCB7IHB0eSwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHB0eTtcblx0XHRcdFx0fSxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0aWNvbjogeyBpZDogJ3JlbW90ZScgfSxcblx0XHRcdFx0aXNGZWF0dXJlVGVybWluYWw6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdGxvY2F0aW9uOiBvcHRpb25zPy5sb2NhdGlvbixcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWN0aXZlUHR5cy5kZWxldGUoa2V5KTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdH1cblxuXHRhc3luYyByZXZpdmVUZXJtaW5hbChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCB0ZXJtaW5hbFVyaTogVVJJLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRjb25zdCBrZXkgPSB0ZXJtaW5hbFVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nUmV2aXZlcy5nZXQoa2V5KTtcblx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0cmV0dXJuIHBlbmRpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IHJldml2ZSA9IHRoaXMuX2RvUmV2aXZlVGVybWluYWwoY29ubmVjdGlvbiwgdGVybWluYWxVcmksIHRlcm1pbmFsVG9vbFNlc3Npb25JZCwga2V5KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nUmV2aXZlcy5nZXQoa2V5KSA9PT0gcmV2aXZlKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXZpdmVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXZpdmVzLnNldChrZXksIHJldml2ZSk7XG5cdFx0cmV0dXJuIHJldml2ZTtcblx0fVxuXG5cdGF0dGFjaE91dHB1dFRlcm1pbmFsKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHRlcm1pbmFsVXJpOiBVUkksIHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0T3V0cHV0Q2hhbm5lbChjb25uZWN0aW9uLCB0ZXJtaW5hbFVyaSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyT3V0cHV0U291cmNlKHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgc291cmNlKSk7XG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9SZXZpdmVUZXJtaW5hbChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCB0ZXJtaW5hbFVyaTogVVJJLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9yZXZpdmVkSW5zdGFuY2VzLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb21tYW5kU291cmNlID0gc3RvcmUuYWRkKG5ldyBBaHBUZXJtaW5hbENvbW1hbmRTb3VyY2UoKSk7XG5cblx0XHRjb25zdCBpbnN0YW5jZVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0Y3VzdG9tUHR5SW1wbGVtZW50YXRpb246IChpZCwgY29scywgcm93cykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHB0eSA9IG5ldyBBZ2VudEhvc3RQdHkoaWQsIGNvbm5lY3Rpb24sIHRlcm1pbmFsVXJpLCB7XG5cdFx0XHRcdFx0XHRhdHRhY2hPbmx5OiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChjb2xzID4gMCAmJiByb3dzID4gMCkge1xuXHRcdFx0XHRcdFx0cHR5LnJlc2l6ZShjb2xzLCByb3dzKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIXN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdGNvbW1hbmRTb3VyY2UuY29ubmVjdChpbnN0YW5jZSwgcHR5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVQdHlzLnNldChrZXksIHsgcHR5LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9KTtcblx0XHRcdFx0XHRyZXR1cm4gcHR5O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0VGVybWluYWwudG9vbCcsIFwiQWdlbnQgSG9zdCBUZXJtaW5hbFwiKSxcblx0XHRcdFx0aXNGZWF0dXJlVGVybWluYWw6IHRydWUsXG5cdFx0XHRcdGhpZGVGcm9tVXNlcjogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyQWhwQ29tbWFuZFNvdXJjZSh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsIGNvbW1hbmRTb3VyY2UsIGluc3RhbmNlUHJvbWlzZSkpO1xuXHRcdGxldCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0dHJ5IHtcblx0XHRcdGluc3RhbmNlID0gYXdhaXQgaW5zdGFuY2VQcm9taXNlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0dGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5yZWdpc3RlclRlcm1pbmFsSW5zdGFuY2VXaXRoVG9vbFNlc3Npb24odGVybWluYWxUb29sU2Vzc2lvbklkLCBpbnN0YW5jZSk7XG5cblx0XHR0aGlzLl9yZXZpdmVkSW5zdGFuY2VzLnNldChrZXksIGluc3RhbmNlKTtcblx0XHRpbnN0YW5jZS5zdG9yZS5hZGQoc3RvcmUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmV2aXZlZEluc3RhbmNlcy5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX2FjdGl2ZVB0eXMuZGVsZXRlKGtleSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGluc3RhbmNlO1xuXHR9XG5cblx0YXN5bmMgcmVjb25uZWN0VGVybWluYWxzKG5ld0Nvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIG9sZENsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPHsgcmVjb3ZlcmVkOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfT4ge1xuXHRcdC8vIE9ubHkgcmVjb25uZWN0IHRlcm1pbmFscyB0aGF0IGJlbG9uZ2VkIHRvIHRoZSBvbGQgY29ubmVjdGlvblxuXHRcdC8vIGlkZW50aWZpZWQgYnkgb2xkQ2xpZW50SWQuIEluIG11bHRpLWhvc3Qgc2V0dXBzLCBvdGhlciBob3N0cydcblx0XHQvLyB0ZXJtaW5hbHMgYXJlIGxlZnQgdW50b3VjaGVkLlxuXHRcdGNvbnN0IGVudHJpZXMgPSBbLi4udGhpcy5fYWN0aXZlUHR5cy5lbnRyaWVzKCldLmZpbHRlcihcblx0XHRcdChbLCBlbnRyeV0pID0+IGVudHJ5LmNsaWVudElkID09PSBvbGRDbGllbnRJZFxuXHRcdCk7XG5cdFx0Y29uc3QgdG90YWwgPSBlbnRyaWVzLmxlbmd0aDtcblx0XHRsZXQgcmVjb3ZlcmVkID0gMDtcblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgZW50cmllcykge1xuXHRcdFx0cHJvbWlzZXMucHVzaChcblx0XHRcdFx0ZW50cnkucHR5LnJlY29ubmVjdChuZXdDb25uZWN0aW9uKS50aGVuKHN1Y2Nlc3MgPT4ge1xuXHRcdFx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdFx0XHRyZWNvdmVyZWQrKztcblx0XHRcdFx0XHRcdC8vIFVwZGF0ZSB0aGUgY2xpZW50SWQgdG8gdGhlIG5ldyBjb25uZWN0aW9uXG5cdFx0XHRcdFx0XHRlbnRyeS5jbGllbnRJZCA9IG5ld0Nvbm5lY3Rpb24uY2xpZW50SWQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUud2FybihgW0FnZW50SG9zdFRlcm1pbmFsU2VydmljZV0gRmFpbGVkIHRvIHJlY29ubmVjdCB0ZXJtaW5hbDogJHtrZXl9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdHJldHVybiB7IHJlY292ZXJlZCwgdG90YWwgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksZUFBZSxpQkFBOEIsb0JBQW9CO0FBQ3RGLFNBQXNCLGlCQUFpQixtQkFBbUI7QUFDMUQsU0FBUyxXQUFX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
