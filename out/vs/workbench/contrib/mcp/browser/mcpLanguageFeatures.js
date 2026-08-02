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
import { computeLevenshteinDistance } from "../../../../base/common/diff/diff.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../base/common/htmlContent.js";
import { findNodeAtLocation, parseTree } from "../../../../base/common/json.js";
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../nls.js";
import { IAgentHostConnectionsService, LOCAL_AGENT_HOST_SCHEME_PREFIX } from "../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { remoteAgentHostSessionTypeId } from "../../../../platform/agentHost/common/agentHostSessionType.js";
import { AgentSession } from "../../../../platform/agentHost/common/agentService.js";
import { ActionType } from "../../../../platform/agentHost/common/state/protocol/actions.js";
import { CustomizationType, McpServerStatus } from "../../../../platform/agentHost/common/state/protocol/state.js";
import { StateComponents } from "../../../../platform/agentHost/common/state/sessionState.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { StorageScope } from "../../../../platform/storage/common/storage.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { IAgentHostCustomizationService } from "../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { isContributionDisabled } from "../../chat/common/enablement.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { mcpConfigurationSection } from "../common/mcpConfiguration.js";
import { countRunningMcpServersInOtherSessions, getActiveAgentHostMcpSessionResource } from "../common/mcpEditorAffordanceState.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { IMcpService, IMcpWorkbenchService, McpConnectionState, mcpOAuthClientSecretStorageKey } from "../common/mcpTypes.js";
const diagnosticOwner = "vscode.mcp";
let McpLanguageFeatures = class extends Disposable {
  constructor(languageFeaturesService, _mcpRegistry, _mcpWorkbenchService, _mcpService, _chatWidgetService, _agentHostCustomizationService, _agentHostConnectionsService, _markerService, _configurationResolverService, _secretStorageService) {
    super();
    this._mcpRegistry = _mcpRegistry;
    this._mcpWorkbenchService = _mcpWorkbenchService;
    this._mcpService = _mcpService;
    this._chatWidgetService = _chatWidgetService;
    this._agentHostCustomizationService = _agentHostCustomizationService;
    this._agentHostConnectionsService = _agentHostConnectionsService;
    this._markerService = _markerService;
    this._configurationResolverService = _configurationResolverService;
    this._secretStorageService = _secretStorageService;
    this._cachedMcpSection = this._register(new MutableDisposable());
    const patterns = [
      { pattern: "**/mcp.json" },
      { pattern: "**/.mcp.json" },
      { pattern: "**/workspace.json" }
    ];
    const onDidChangeCodeLens = this._register(new Emitter());
    const codeLensProvider = {
      onDidChange: onDidChangeCodeLens.event,
      provideCodeLenses: (model, range) => this._provideCodeLenses(model, () => onDidChangeCodeLens.fire(codeLensProvider))
    };
    const refreshCodeLens = () => onDidChangeCodeLens.fire(codeLensProvider);
    this._register(languageFeaturesService.codeLensProvider.register(patterns, codeLensProvider));
    this._register(this._secretStorageService.onDidChangeSecret((key) => {
      if (key.startsWith("mcp.oauth.clientSecret:")) {
        refreshCodeLens();
      }
    }));
    const focusedWidgetViewModelListener = this._register(new MutableDisposable());
    const updateFocusedWidgetViewModelListener = () => {
      focusedWidgetViewModelListener.value = this._chatWidgetService.lastFocusedWidget?.onDidChangeViewModel(refreshCodeLens);
      refreshCodeLens();
    };
    const connectionStateListeners = this._register(new MutableDisposable());
    const updateConnectionStateListeners = () => {
      const store = new DisposableStore();
      for (const connectionInfo of this._agentHostConnectionsService.connections) {
        const connection = connectionInfo.connection;
        if (connection) {
          store.add(connection.onDidAction(({ action }) => {
            switch (action.type) {
              case ActionType.SessionCustomizationsChanged:
              case ActionType.SessionCustomizationUpdated:
              case ActionType.SessionCustomizationRemoved:
              case ActionType.SessionMcpServerStateChanged:
                refreshCodeLens();
                break;
            }
          }));
        }
      }
      connectionStateListeners.value = store;
      refreshCodeLens();
    };
    updateFocusedWidgetViewModelListener();
    updateConnectionStateListeners();
    this._register(this._chatWidgetService.onDidChangeFocusedWidget(updateFocusedWidgetViewModelListener));
    this._register(this._chatWidgetService.onDidChangeFocusedSession(refreshCodeLens));
    this._register(this._agentHostConnectionsService.onDidChangeConnections(updateConnectionStateListeners));
    this._register(this._agentHostCustomizationService.onDidChangeCustomizations(refreshCodeLens));
    this._register(languageFeaturesService.inlayHintsProvider.register(patterns, {
      onDidChangeInlayHints: _mcpRegistry.onDidChangeInputs,
      provideInlayHints: (model, range) => this._provideInlayHints(model, range)
    }));
  }
  /** Simple mechanism to avoid extra json parsing for hints+lenses */
  async _parseModel(model) {
    if (this._cachedMcpSection.value?.model === model) {
      return this._cachedMcpSection.value;
    }
    const uri = model.uri;
    const inConfig = uri.path.endsWith("/.mcp.json") ? { scope: StorageScope.WORKSPACE, target: ConfigurationTarget.WORKSPACE_FOLDER, serversKey: "mcpServers" } : await this._mcpWorkbenchService.getMcpConfigPath(model.uri);
    if (!inConfig) {
      return void 0;
    }
    const value = model.getValue();
    const tree = parseTree(value);
    const listeners = [
      model.onDidChangeContent(() => this._cachedMcpSection.clear()),
      model.onWillDispose(() => this._cachedMcpSection.clear())
    ];
    this._addDiagnostics(model, value, tree, inConfig);
    return this._cachedMcpSection.value = {
      model,
      tree,
      inConfig,
      dispose: () => {
        this._markerService.remove(diagnosticOwner, [uri]);
        dispose(listeners);
      }
    };
  }
  _addDiagnostics(tm, value, tree, inConfig) {
    const serversKey = inConfig.serversKey ?? "servers";
    const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, serversKey] : [serversKey]);
    if (!serversNode) {
      return;
    }
    const getClosestMatchingVariable = (name) => {
      let bestValue = "";
      let bestDistance = Infinity;
      for (const variable of this._configurationResolverService.resolvableVariables) {
        const distance = computeLevenshteinDistance(name, variable);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestValue = variable;
        }
      }
      return bestValue;
    };
    const diagnostics = [];
    forEachPropertyWithReplacement(serversNode, (node) => {
      const expr = ConfigurationResolverExpression.parse(node.value);
      for (const { id, name, arg } of expr.unresolved()) {
        if (!this._configurationResolverService.resolvableVariables.has(name)) {
          const position = value.indexOf(id, node.offset);
          if (position === -1) {
            continue;
          }
          const start = tm.getPositionAt(position);
          const end = tm.getPositionAt(position + id.length);
          diagnostics.push({
            severity: MarkerSeverity.Warning,
            message: localize("mcp.variableNotFound", "Variable `{0}` not found, did you mean ${{1}}?", name, getClosestMatchingVariable(name) + (arg ? `:${arg}` : "")),
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
            modelVersionId: tm.getVersionId()
          });
        }
      }
    });
    if (diagnostics.length) {
      this._markerService.changeOne(diagnosticOwner, tm.uri, diagnostics);
    } else {
      this._markerService.remove(diagnosticOwner, [tm.uri]);
    }
  }
  async _provideCodeLenses(model, onDidChangeCodeLens) {
    const parsed = await this._parseModel(model);
    if (!parsed) {
      return void 0;
    }
    const { tree, inConfig } = parsed;
    const serversKey = inConfig.serversKey ?? "servers";
    const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, serversKey] : [serversKey]);
    if (!serversNode) {
      return void 0;
    }
    const store = new DisposableStore();
    const lenses = [];
    const lensList = { lenses, dispose: () => store.dispose() };
    const read = (observable) => {
      store.add(Event.fromObservableLight(observable)(onDidChangeCodeLens));
      return observable.get();
    };
    const collection = read(this._mcpRegistry.collections).find((c) => isEqual(c.presentation?.origin, model.uri));
    if (!collection) {
      return lensList;
    }
    const agentHostSession = getActiveAgentHostMcpSessionResource(this._chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource);
    if (agentHostSession) {
      const mcpServers = this._agentHostCustomizationService.getMcpServers(agentHostSession);
      const otherRunningCounts = this._getOtherRunningAgentHostMcpServerCounts(agentHostSession);
      for (const node of serversNode.children || []) {
        if (node.type !== "property" || node.children?.[0]?.type !== "string") {
          continue;
        }
        const name = node.children[0].value;
        const server = mcpServers.find((s) => s.name === name);
        if (!server) {
          continue;
        }
        this._addAgentHostServerCodeLenses(lenses, Range.fromPositions(model.getPositionAt(node.children[0].offset)), agentHostSession, server, otherRunningCounts.get(name) ?? 0);
      }
    } else {
      const mcpServers = read(this._mcpService.servers).filter((s) => s.collection.id === collection.id);
      for (const node of serversNode.children || []) {
        if (node.type !== "property" || node.children?.[0]?.type !== "string") {
          continue;
        }
        const name = node.children[0].value;
        const server = mcpServers.find((s) => s.definition.label === name);
        if (!server) {
          continue;
        }
        const range = Range.fromPositions(model.getPositionAt(node.children[0].offset));
        if (isContributionDisabled(read(server.enablement))) {
          lenses.push({
            range,
            command: {
              id: McpCommandIds.ServerOptions,
              title: "$(circle-slash) " + localize("server.disabled", "Disabled"),
              arguments: [server.definition.id]
            }
          });
          continue;
        }
        const canDebug = !!server.readDefinitions().get().server?.devMode?.debug;
        const state = read(server.connectionState).state;
        switch (state) {
          case McpConnectionState.Kind.Error:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.ShowOutput,
                title: "$(error) " + localize("server.error", "Error"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.RestartServer,
                title: localize("mcp.restart", "Restart"),
                arguments: [server.definition.id, { autoTrustChanges: true }]
              }
            });
            if (canDebug) {
              lenses.push({
                range,
                command: {
                  id: McpCommandIds.RestartServer,
                  title: localize("mcp.debug", "Debug"),
                  arguments: [server.definition.id, { debug: true, autoTrustChanges: true }]
                }
              });
            }
            break;
          case McpConnectionState.Kind.Starting:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.ShowOutput,
                title: "$(loading~spin) " + localize("server.starting", "Starting"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.StopServer,
                title: localize("cancel", "Cancel"),
                arguments: [server.definition.id]
              }
            });
            break;
          case McpConnectionState.Kind.Running:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.ShowOutput,
                title: "$(check) " + localize("server.running", "Running"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.StopServer,
                title: localize("mcp.stop", "Stop"),
                arguments: [server.definition.id]
              }
            }, {
              range,
              command: {
                id: McpCommandIds.RestartServer,
                title: localize("mcp.restart", "Restart"),
                arguments: [server.definition.id, { autoTrustChanges: true }]
              }
            });
            if (canDebug) {
              lenses.push({
                range,
                command: {
                  id: McpCommandIds.RestartServer,
                  title: localize("mcp.debug", "Debug"),
                  arguments: [server.definition.id, { autoTrustChanges: true, debug: true }]
                }
              });
            }
            break;
          case McpConnectionState.Kind.Stopped:
            lenses.push({
              range,
              command: {
                id: McpCommandIds.StartServer,
                title: "$(debug-start) " + localize("mcp.start", "Start"),
                arguments: [server.definition.id, { autoTrustChanges: true }]
              }
            });
            if (canDebug) {
              lenses.push({
                range,
                command: {
                  id: McpCommandIds.StartServer,
                  title: localize("mcp.debug", "Debug"),
                  arguments: [server.definition.id, { autoTrustChanges: true, debug: true }]
                }
              });
            }
        }
        if (state !== McpConnectionState.Kind.Error) {
          const toolCount = read(server.tools).length;
          if (toolCount) {
            lenses.push({
              range,
              command: {
                id: "",
                title: localize("server.toolCount", "{0} tools", toolCount)
              }
            });
          }
          const promptCount = read(server.prompts).length;
          if (promptCount) {
            lenses.push({
              range,
              command: {
                id: McpCommandIds.StartPromptForServer,
                title: localize("server.promptcount", "{0} prompts", promptCount),
                arguments: [server]
              }
            });
          }
          lenses.push({
            range,
            command: {
              id: McpCommandIds.ServerOptions,
              title: localize("mcp.server.more", "More..."),
              arguments: [server.definition.id]
            }
          });
        }
      }
    }
    const candidates = [];
    for (const node of serversNode.children || []) {
      if (node.type !== "property" || node.children?.[0]?.type !== "string" || !node.children[1]) {
        continue;
      }
      const serverName = node.children[0].value;
      const serverValue = node.children[1];
      const clientIdNode = findNodeAtLocation(serverValue, ["oauth", "clientId"]);
      if (clientIdNode && clientIdNode.type === "string") {
        const clientId = clientIdNode.value;
        if (clientId) {
          const urlNode = findNodeAtLocation(serverValue, ["url"]);
          const rawUrl = urlNode && urlNode.type === "string" ? urlNode.value : void 0;
          if (!rawUrl) {
            continue;
          }
          let mcpServerUrl;
          try {
            mcpServerUrl = URI.parse(rawUrl).toString(true);
          } catch {
            continue;
          }
          candidates.push({ clientId, mcpServerUrl, serverName, clientIdOffset: clientIdNode.offset });
        }
      }
    }
    const existingSecrets = await Promise.all(
      candidates.map((c) => this._secretStorageService.get(mcpOAuthClientSecretStorageKey(c.mcpServerUrl, c.clientId)))
    );
    for (let i = 0; i < candidates.length; i++) {
      const { clientId, mcpServerUrl, serverName, clientIdOffset } = candidates[i];
      const existing = existingSecrets[i];
      const title = existing ? localize("mcp.replaceClientSecret", "Replace Client Secret") : localize("mcp.setClientSecret", "Set Client Secret");
      lenses.push({
        range: Range.fromPositions(model.getPositionAt(clientIdOffset)),
        command: {
          id: McpCommandIds.SetOAuthClientSecret,
          title,
          arguments: [clientId, mcpServerUrl, serverName]
        }
      });
    }
    return lensList;
  }
  _addAgentHostServerCodeLenses(lenses, range, agentHostSession, server, otherRunningSessionCount) {
    const commandArg = { agentHostSession, serverId: server.id };
    if (!server.enabled) {
      lenses.push({
        range,
        command: {
          id: McpCommandIds.AgentHostServerOptions,
          title: "$(circle-slash) " + localize("server.disabled", "Disabled"),
          arguments: [agentHostSession, server.id]
        }
      });
      return;
    }
    switch (server.status) {
      case McpServerStatus.Error:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(error) " + localize("server.error", "Error"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StartServer,
            title: localize("mcp.start", "Start"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.Starting:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(loading~spin) " + localize("server.starting", "Starting"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StopServer,
            title: localize("cancel", "Cancel"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.Ready:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(check) " + localize("server.running", "Running"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StopServer,
            title: localize("mcp.stop", "Stop"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.AuthRequired:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.AgentHostServerOptions,
            title: "$(account) " + localize("server.authRequired", "Authentication Required"),
            arguments: [agentHostSession, server.id]
          }
        });
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StopServer,
            title: localize("mcp.stop", "Stop"),
            arguments: [commandArg]
          }
        });
        break;
      case McpServerStatus.Stopped:
        lenses.push({
          range,
          command: {
            id: McpCommandIds.StartServer,
            title: "$(debug-start) " + localize("mcp.start", "Start"),
            arguments: [commandArg]
          }
        });
        break;
    }
    if (otherRunningSessionCount > 0) {
      lenses.push({
        range,
        command: {
          id: "",
          title: otherRunningSessionCount === 1 ? localize("server.runningInOneOtherSession", "(Running in 1 session)") : localize("server.runningInOtherSessions", "(Running in {0} sessions)", otherRunningSessionCount)
        }
      });
    }
    if (server.status !== McpServerStatus.Error) {
      lenses.push({
        range,
        command: {
          id: McpCommandIds.AgentHostServerOptions,
          title: localize("mcp.server.more", "More..."),
          arguments: [agentHostSession, server.id]
        }
      });
    }
  }
  _getOtherRunningAgentHostMcpServerCounts(agentHostSession) {
    const sessionServers = [];
    for (const connectionInfo of this._agentHostConnectionsService.connections) {
      const connection = connectionInfo.connection;
      if (!connection) {
        continue;
      }
      for (const subscription of connection.getActiveSubscriptions()) {
        if (subscription.kind !== StateComponents.Session) {
          continue;
        }
        const state = connection.getSubscriptionUnmanaged(StateComponents.Session, subscription.resource)?.value;
        const resource = this._toAgentHostSessionResource(connectionInfo, subscription.resource);
        if (!resource || !state || state instanceof Error) {
          continue;
        }
        sessionServers.push({ resource, servers: this._getMcpServersFromSessionState(state) });
      }
    }
    return countRunningMcpServersInOtherSessions(agentHostSession, sessionServers);
  }
  _toAgentHostSessionResource(connectionInfo, backendSession) {
    const provider = AgentSession.provider(backendSession);
    if (!provider) {
      return void 0;
    }
    const scheme = connectionInfo.isAmbient ? `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${provider}` : remoteAgentHostSessionTypeId(connectionInfo.authority, provider);
    return URI.from({ scheme, path: backendSession.path });
  }
  _getMcpServersFromSessionState(state) {
    const servers = [];
    const collect = (customizations) => {
      for (const customization of customizations ?? []) {
        if (customization.type === CustomizationType.McpServer) {
          servers.push({
            name: customization.name,
            enabled: customization.enabled,
            status: customization.state.kind
          });
        } else if (customization.type === CustomizationType.Directory || customization.type === CustomizationType.Plugin) {
          collect(customization.children);
        }
      }
    };
    collect(state.customizations);
    return servers;
  }
  async _provideInlayHints(model, range) {
    const parsed = await this._parseModel(model);
    if (!parsed) {
      return void 0;
    }
    const { tree, inConfig } = parsed;
    const mcpSection = inConfig.section ? findNodeAtLocation(tree, [...inConfig.section]) : tree;
    if (!mcpSection) {
      return void 0;
    }
    const inputsNode = findNodeAtLocation(mcpSection, ["inputs"]);
    if (!inputsNode) {
      return void 0;
    }
    const inputs = await this._mcpRegistry.getSavedInputs(inConfig.scope);
    const hints = [];
    const serversNode = findNodeAtLocation(mcpSection, [inConfig.serversKey ?? "servers"]);
    if (serversNode) {
      annotateServers(serversNode);
    }
    annotateInputs(inputsNode);
    return { hints, dispose: () => {
    } };
    function annotateServers(servers) {
      forEachPropertyWithReplacement(servers, (node) => {
        const expr = ConfigurationResolverExpression.parse(node.value);
        for (const { id } of expr.unresolved()) {
          const saved = inputs[id];
          if (saved) {
            pushAnnotation(id, node.offset + node.value.indexOf(id) + id.length, saved);
          }
        }
      });
    }
    function annotateInputs(node) {
      if (node.type !== "array" || !node.children) {
        return;
      }
      for (const input of node.children) {
        if (input.type !== "object" || !input.children) {
          continue;
        }
        const idProp = input.children.find((c) => c.type === "property" && c.children?.[0].value === "id");
        if (!idProp) {
          continue;
        }
        const id = idProp.children[1];
        if (!id || id.type !== "string" || !id.value) {
          continue;
        }
        const savedId = "${input:" + id.value + "}";
        const saved = inputs[savedId];
        if (saved) {
          pushAnnotation(savedId, id.offset + 1 + id.length, saved);
        }
      }
    }
    function pushAnnotation(savedId, offset, saved) {
      const tooltip = new MarkdownString([
        createMarkdownCommandLink({ id: McpCommandIds.EditStoredInput, text: localize("edit", "Edit"), arguments: [savedId, model.uri, mcpConfigurationSection, inConfig.target], tooltip: localize("edit.savedValue.tooltip", "Edit saved value") }),
        createMarkdownCommandLink({ id: McpCommandIds.RemoveStoredInput, text: localize("clear", "Clear"), arguments: [inConfig.scope, savedId], tooltip: localize("clear.savedValue.tooltip", "Clear saved value") }),
        createMarkdownCommandLink({ id: McpCommandIds.RemoveStoredInput, text: localize("clearAll", "Clear All"), arguments: [inConfig.scope], tooltip: localize("clearAll.savedValues.tooltip", "Clear all saved values") })
      ].join(" | "), { isTrusted: true });
      const hint = {
        label: "= " + (saved.input?.type === "promptString" && saved.input.password ? "*".repeat(10) : saved.value || ""),
        position: model.getPositionAt(offset),
        tooltip,
        paddingLeft: true
      };
      hints.push(hint);
      return hint;
    }
  }
};
McpLanguageFeatures = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IMcpRegistry),
  __decorateParam(2, IMcpWorkbenchService),
  __decorateParam(3, IMcpService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, IAgentHostCustomizationService),
  __decorateParam(6, IAgentHostConnectionsService),
  __decorateParam(7, IMarkerService),
  __decorateParam(8, IConfigurationResolverService),
  __decorateParam(9, ISecretStorageService)
], McpLanguageFeatures);
function forEachPropertyWithReplacement(node, callback) {
  if (node.type === "string" && typeof node.value === "string" && node.value.includes(ConfigurationResolverExpression.VARIABLE_LHS)) {
    callback(node);
  } else if (node.type === "property") {
    node.children?.slice(1).forEach((n) => forEachPropertyWithReplacement(n, callback));
  } else {
    node.children?.forEach((n) => forEachPropertyWithReplacement(n, callback));
  }
}
export {
  McpLanguageFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcExhbmd1YWdlRmVhdHVyZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb21wdXRlTGV2ZW5zaHRlaW5EaXN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RpZmYvZGlmZi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmssIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZmluZE5vZGVBdExvY2F0aW9uLCBOb2RlLCBwYXJzZVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDb2RlTGVucywgQ29kZUxlbnNMaXN0LCBDb2RlTGVuc1Byb3ZpZGVyLCBJbmxheUhpbnQsIElubGF5SGludExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENvbm5lY3Rpb25JbmZvLCBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLCBMT0NBTF9BR0VOVF9IT1NUX1NDSEVNRV9QUkVGSVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uVHlwZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgQ2hpbGRDdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgSU1hcmtlclNlcnZpY2UsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbiwgSVJlc29sdmVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IE1jcENvbW1hbmRJZHMgfSBmcm9tICcuLi9jb21tb24vbWNwQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBtY3BDb25maWd1cmF0aW9uU2VjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9tY3BDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGNvdW50UnVubmluZ01jcFNlcnZlcnNJbk90aGVyU2Vzc2lvbnMsIGdldEFjdGl2ZUFnZW50SG9zdE1jcFNlc3Npb25SZXNvdXJjZSwgSU1jcEVkaXRvckFnZW50SG9zdFNlcnZlciwgdHlwZSBJTWNwRWRpdG9yQWdlbnRIb3N0U2Vzc2lvblNlcnZlcnMgfSBmcm9tICcuLi9jb21tb24vbWNwRWRpdG9yQWZmb3JkYW5jZVN0YXRlLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BDb25maWdQYXRoLCBJTWNwU2VydmVyU3RhcnRPcHRzLCBJTWNwU2VydmljZSwgSU1jcFdvcmtiZW5jaFNlcnZpY2UsIE1jcENvbm5lY3Rpb25TdGF0ZSwgbWNwT0F1dGhDbGllbnRTZWNyZXRTdG9yYWdlS2V5IH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcblxuY29uc3QgZGlhZ25vc3RpY093bmVyID0gJ3ZzY29kZS5tY3AnO1xuXG50eXBlIENvbmZpZ0Rlc2NyaXB0b3IgPSBQaWNrPElNY3BDb25maWdQYXRoLCAnc2VjdGlvbicgfCAnc2NvcGUnIHwgJ3RhcmdldCc+ICYge1xuXHRzZXJ2ZXJzS2V5Pzogc3RyaW5nO1xufTtcblxudHlwZSBBZ2VudEhvc3RNY3BTZXJ2ZXIgPSBSZXR1cm5UeXBlPElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZVsnZ2V0TWNwU2VydmVycyddPltudW1iZXJdO1xuXG5leHBvcnQgY2xhc3MgTWNwTGFuZ3VhZ2VGZWF0dXJlcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGVkTWNwU2VjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTx7IG1vZGVsOiBJVGV4dE1vZGVsOyBpbkNvbmZpZzogQ29uZmlnRGVzY3JpcHRvcjsgdHJlZTogTm9kZSB9ICYgSURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASU1jcFJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgX21jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnksXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZTogSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHBhdHRlcm5zID0gW1xuXHRcdFx0eyBwYXR0ZXJuOiAnKiovbWNwLmpzb24nIH0sXG5cdFx0XHR7IHBhdHRlcm46ICcqKi8ubWNwLmpzb24nIH0sXG5cdFx0XHR7IHBhdHRlcm46ICcqKi93b3Jrc3BhY2UuanNvbicgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VDb2RlTGVucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvZGVMZW5zUHJvdmlkZXI+KCkpO1xuXHRcdGNvbnN0IGNvZGVMZW5zUHJvdmlkZXI6IENvZGVMZW5zUHJvdmlkZXIgPSB7XG5cdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2VDb2RlTGVucy5ldmVudCxcblx0XHRcdHByb3ZpZGVDb2RlTGVuc2VzOiAobW9kZWwsIHJhbmdlKSA9PiB0aGlzLl9wcm92aWRlQ29kZUxlbnNlcyhtb2RlbCwgKCkgPT4gb25EaWRDaGFuZ2VDb2RlTGVucy5maXJlKGNvZGVMZW5zUHJvdmlkZXIpKSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlZnJlc2hDb2RlTGVucyA9ICgpID0+IG9uRGlkQ2hhbmdlQ29kZUxlbnMuZmlyZShjb2RlTGVuc1Byb3ZpZGVyKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLnJlZ2lzdGVyKHBhdHRlcm5zLCBjb2RlTGVuc1Byb3ZpZGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VTZWNyZXQoa2V5ID0+IHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aCgnbWNwLm9hdXRoLmNsaWVudFNlY3JldDonKSkge1xuXHRcdFx0XHRyZWZyZXNoQ29kZUxlbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZm9jdXNlZFdpZGdldFZpZXdNb2RlbExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGNvbnN0IHVwZGF0ZUZvY3VzZWRXaWRnZXRWaWV3TW9kZWxMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdGZvY3VzZWRXaWRnZXRWaWV3TW9kZWxMaXN0ZW5lci52YWx1ZSA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py5vbkRpZENoYW5nZVZpZXdNb2RlbChyZWZyZXNoQ29kZUxlbnMpO1xuXHRcdFx0cmVmcmVzaENvZGVMZW5zKCk7XG5cdFx0fTtcblx0XHRjb25zdCBjb25uZWN0aW9uU3RhdGVMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0XHRjb25zdCB1cGRhdGVDb25uZWN0aW9uU3RhdGVMaXN0ZW5lcnMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGZvciAoY29uc3QgY29ubmVjdGlvbkluZm8gb2YgdGhpcy5fYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmNvbm5lY3Rpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBjb25uZWN0aW9uSW5mby5jb25uZWN0aW9uO1xuXHRcdFx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChjb25uZWN0aW9uLm9uRGlkQWN0aW9uKCh7IGFjdGlvbiB9KSA9PiB7XG5cdFx0XHRcdFx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkOlxuXHRcdFx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkOlxuXHRcdFx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkOlxuXHRcdFx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZDpcblx0XHRcdFx0XHRcdFx0XHRyZWZyZXNoQ29kZUxlbnMoKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbm5lY3Rpb25TdGF0ZUxpc3RlbmVycy52YWx1ZSA9IHN0b3JlO1xuXHRcdFx0cmVmcmVzaENvZGVMZW5zKCk7XG5cdFx0fTtcblx0XHR1cGRhdGVGb2N1c2VkV2lkZ2V0Vmlld01vZGVsTGlzdGVuZXIoKTtcblx0XHR1cGRhdGVDb25uZWN0aW9uU3RhdGVMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzZWRXaWRnZXQodXBkYXRlRm9jdXNlZFdpZGdldFZpZXdNb2RlbExpc3RlbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbihyZWZyZXNoQ29kZUxlbnMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucyh1cGRhdGVDb25uZWN0aW9uU3RhdGVMaXN0ZW5lcnMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKHJlZnJlc2hDb2RlTGVucykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5sYXlIaW50c1Byb3ZpZGVyLnJlZ2lzdGVyKHBhdHRlcm5zLCB7XG5cdFx0XHRvbkRpZENoYW5nZUlubGF5SGludHM6IF9tY3BSZWdpc3RyeS5vbkRpZENoYW5nZUlucHV0cyxcblx0XHRcdHByb3ZpZGVJbmxheUhpbnRzOiAobW9kZWwsIHJhbmdlKSA9PiB0aGlzLl9wcm92aWRlSW5sYXlIaW50cyhtb2RlbCwgcmFuZ2UpLFxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBTaW1wbGUgbWVjaGFuaXNtIHRvIGF2b2lkIGV4dHJhIGpzb24gcGFyc2luZyBmb3IgaGludHMrbGVuc2VzICovXG5cdHByaXZhdGUgYXN5bmMgX3BhcnNlTW9kZWwobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHRpZiAodGhpcy5fY2FjaGVkTWNwU2VjdGlvbi52YWx1ZT8ubW9kZWwgPT09IG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkTWNwU2VjdGlvbi52YWx1ZTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmkgPSBtb2RlbC51cmk7XG5cdFx0Y29uc3QgaW5Db25maWc6IENvbmZpZ0Rlc2NyaXB0b3IgfCB1bmRlZmluZWQgPSB1cmkucGF0aC5lbmRzV2l0aCgnLy5tY3AuanNvbicpXG5cdFx0XHQ/IHsgc2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSLCBzZXJ2ZXJzS2V5OiAnbWNwU2VydmVycycgfVxuXHRcdFx0OiBhd2FpdCB0aGlzLl9tY3BXb3JrYmVuY2hTZXJ2aWNlLmdldE1jcENvbmZpZ1BhdGgobW9kZWwudXJpKTtcblx0XHRpZiAoIWluQ29uZmlnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlID0gbW9kZWwuZ2V0VmFsdWUoKTtcblx0XHRjb25zdCB0cmVlID0gcGFyc2VUcmVlKHZhbHVlKTtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBbXG5cdFx0XHRtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gdGhpcy5fY2FjaGVkTWNwU2VjdGlvbi5jbGVhcigpKSxcblx0XHRcdG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4gdGhpcy5fY2FjaGVkTWNwU2VjdGlvbi5jbGVhcigpKSxcblx0XHRdO1xuXHRcdHRoaXMuX2FkZERpYWdub3N0aWNzKG1vZGVsLCB2YWx1ZSwgdHJlZSwgaW5Db25maWcpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZE1jcFNlY3Rpb24udmFsdWUgPSB7XG5cdFx0XHRtb2RlbCxcblx0XHRcdHRyZWUsXG5cdFx0XHRpbkNvbmZpZyxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbWFya2VyU2VydmljZS5yZW1vdmUoZGlhZ25vc3RpY093bmVyLCBbdXJpXSk7XG5cdFx0XHRcdGRpc3Bvc2UobGlzdGVuZXJzKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkRGlhZ25vc3RpY3ModG06IElUZXh0TW9kZWwsIHZhbHVlOiBzdHJpbmcsIHRyZWU6IE5vZGUsIGluQ29uZmlnOiBDb25maWdEZXNjcmlwdG9yKSB7XG5cdFx0Y29uc3Qgc2VydmVyc0tleSA9IGluQ29uZmlnLnNlcnZlcnNLZXkgPz8gJ3NlcnZlcnMnO1xuXHRcdGNvbnN0IHNlcnZlcnNOb2RlID0gZmluZE5vZGVBdExvY2F0aW9uKHRyZWUsIGluQ29uZmlnLnNlY3Rpb24gPyBbLi4uaW5Db25maWcuc2VjdGlvbiwgc2VydmVyc0tleV0gOiBbc2VydmVyc0tleV0pO1xuXHRcdGlmICghc2VydmVyc05vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBnZXRDbG9zZXN0TWF0Y2hpbmdWYXJpYWJsZSA9IChuYW1lOiBzdHJpbmcpID0+IHtcblx0XHRcdGxldCBiZXN0VmFsdWUgPSAnJztcblx0XHRcdGxldCBiZXN0RGlzdGFuY2UgPSBJbmZpbml0eTtcblx0XHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZhYmxlVmFyaWFibGVzKSB7XG5cdFx0XHRcdGNvbnN0IGRpc3RhbmNlID0gY29tcHV0ZUxldmVuc2h0ZWluRGlzdGFuY2UobmFtZSwgdmFyaWFibGUpO1xuXHRcdFx0XHRpZiAoZGlzdGFuY2UgPCBiZXN0RGlzdGFuY2UpIHtcblx0XHRcdFx0XHRiZXN0RGlzdGFuY2UgPSBkaXN0YW5jZTtcblx0XHRcdFx0XHRiZXN0VmFsdWUgPSB2YXJpYWJsZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJlc3RWYWx1ZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlhZ25vc3RpY3M6IElNYXJrZXJEYXRhW10gPSBbXTtcblx0XHRmb3JFYWNoUHJvcGVydHlXaXRoUmVwbGFjZW1lbnQoc2VydmVyc05vZGUsIG5vZGUgPT4ge1xuXHRcdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2Uobm9kZS52YWx1ZSk7XG5cblx0XHRcdGZvciAoY29uc3QgeyBpZCwgbmFtZSwgYXJnIH0gb2YgZXhwci51bnJlc29sdmVkKCkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmFibGVWYXJpYWJsZXMuaGFzKG5hbWUpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB2YWx1ZS5pbmRleE9mKGlkLCBub2RlLm9mZnNldCk7XG5cdFx0XHRcdFx0aWYgKHBvc2l0aW9uID09PSAtMSkgeyBjb250aW51ZTsgfSAvLyB1bnJlYWNoYWJsZT9cblxuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0ID0gdG0uZ2V0UG9zaXRpb25BdChwb3NpdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgZW5kID0gdG0uZ2V0UG9zaXRpb25BdChwb3NpdGlvbiArIGlkLmxlbmd0aCk7XG5cdFx0XHRcdFx0ZGlhZ25vc3RpY3MucHVzaCh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AudmFyaWFibGVOb3RGb3VuZCcsICdWYXJpYWJsZSBgezB9YCBub3QgZm91bmQsIGRpZCB5b3UgbWVhbiAke3sxfX0/JywgbmFtZSwgZ2V0Q2xvc2VzdE1hdGNoaW5nVmFyaWFibGUobmFtZSkgKyAoYXJnID8gYDoke2FyZ31gIDogJycpKSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnQubGluZU51bWJlcixcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBzdGFydC5jb2x1bW4sXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBlbmQubGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogZW5kLmNvbHVtbixcblx0XHRcdFx0XHRcdG1vZGVsVmVyc2lvbklkOiB0bS5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGRpYWdub3N0aWNzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fbWFya2VyU2VydmljZS5jaGFuZ2VPbmUoZGlhZ25vc3RpY093bmVyLCB0bS51cmksIGRpYWdub3N0aWNzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWFya2VyU2VydmljZS5yZW1vdmUoZGlhZ25vc3RpY093bmVyLCBbdG0udXJpXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHJvdmlkZUNvZGVMZW5zZXMobW9kZWw6IElUZXh0TW9kZWwsIG9uRGlkQ2hhbmdlQ29kZUxlbnM6ICgpID0+IHZvaWQpOiBQcm9taXNlPENvZGVMZW5zTGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IGF3YWl0IHRoaXMuX3BhcnNlTW9kZWwobW9kZWwpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdHJlZSwgaW5Db25maWcgfSA9IHBhcnNlZDtcblx0XHRjb25zdCBzZXJ2ZXJzS2V5ID0gaW5Db25maWcuc2VydmVyc0tleSA/PyAnc2VydmVycyc7XG5cdFx0Y29uc3Qgc2VydmVyc05vZGUgPSBmaW5kTm9kZUF0TG9jYXRpb24odHJlZSwgaW5Db25maWcuc2VjdGlvbiA/IFsuLi5pbkNvbmZpZy5zZWN0aW9uLCBzZXJ2ZXJzS2V5XSA6IFtzZXJ2ZXJzS2V5XSk7XG5cdFx0aWYgKCFzZXJ2ZXJzTm9kZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsZW5zZXM6IENvZGVMZW5zW10gPSBbXTtcblx0XHRjb25zdCBsZW5zTGlzdDogQ29kZUxlbnNMaXN0ID0geyBsZW5zZXMsIGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSB9O1xuXHRcdGNvbnN0IHJlYWQgPSA8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiBUID0+IHtcblx0XHRcdHN0b3JlLmFkZChFdmVudC5mcm9tT2JzZXJ2YWJsZUxpZ2h0KG9ic2VydmFibGUpKG9uRGlkQ2hhbmdlQ29kZUxlbnMpKTtcblx0XHRcdHJldHVybiBvYnNlcnZhYmxlLmdldCgpO1xuXHRcdH07XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gcmVhZCh0aGlzLl9tY3BSZWdpc3RyeS5jb2xsZWN0aW9ucykuZmluZChjID0+IGlzRXF1YWwoYy5wcmVzZW50YXRpb24/Lm9yaWdpbiwgbW9kZWwudXJpKSk7XG5cdFx0aWYgKCFjb2xsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbGVuc0xpc3Q7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWdlbnRIb3N0U2Vzc2lvbiA9IGdldEFjdGl2ZUFnZW50SG9zdE1jcFNlc3Npb25SZXNvdXJjZSh0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChhZ2VudEhvc3RTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBtY3BTZXJ2ZXJzID0gdGhpcy5fYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuZ2V0TWNwU2VydmVycyhhZ2VudEhvc3RTZXNzaW9uKTtcblx0XHRcdGNvbnN0IG90aGVyUnVubmluZ0NvdW50cyA9IHRoaXMuX2dldE90aGVyUnVubmluZ0FnZW50SG9zdE1jcFNlcnZlckNvdW50cyhhZ2VudEhvc3RTZXNzaW9uKTtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBzZXJ2ZXJzTm9kZS5jaGlsZHJlbiB8fCBbXSkge1xuXHRcdFx0XHRpZiAobm9kZS50eXBlICE9PSAncHJvcGVydHknIHx8IG5vZGUuY2hpbGRyZW4/LlswXT8udHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBub2RlLmNoaWxkcmVuWzBdLnZhbHVlIGFzIHN0cmluZztcblx0XHRcdFx0Y29uc3Qgc2VydmVyID0gbWNwU2VydmVycy5maW5kKHMgPT4gcy5uYW1lID09PSBuYW1lKTtcblx0XHRcdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2FkZEFnZW50SG9zdFNlcnZlckNvZGVMZW5zZXMobGVuc2VzLCBSYW5nZS5mcm9tUG9zaXRpb25zKG1vZGVsLmdldFBvc2l0aW9uQXQobm9kZS5jaGlsZHJlblswXS5vZmZzZXQpKSwgYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLCBvdGhlclJ1bm5pbmdDb3VudHMuZ2V0KG5hbWUpID8/IDApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBtY3BTZXJ2ZXJzID0gcmVhZCh0aGlzLl9tY3BTZXJ2aWNlLnNlcnZlcnMpLmZpbHRlcihzID0+IHMuY29sbGVjdGlvbi5pZCA9PT0gY29sbGVjdGlvbi5pZCk7XG5cdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2Ygc2VydmVyc05vZGUuY2hpbGRyZW4gfHwgW10pIHtcblx0XHRcdFx0aWYgKG5vZGUudHlwZSAhPT0gJ3Byb3BlcnR5JyB8fCBub2RlLmNoaWxkcmVuPy5bMF0/LnR5cGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuYW1lID0gbm9kZS5jaGlsZHJlblswXS52YWx1ZSBhcyBzdHJpbmc7XG5cblx0XHRcdFx0Y29uc3Qgc2VydmVyID0gbWNwU2VydmVycy5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmxhYmVsID09PSBuYW1lKTtcblx0XHRcdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhtb2RlbC5nZXRQb3NpdGlvbkF0KG5vZGUuY2hpbGRyZW5bMF0ub2Zmc2V0KSk7XG5cblx0XHRcdFx0aWYgKGlzQ29udHJpYnV0aW9uRGlzYWJsZWQocmVhZChzZXJ2ZXIuZW5hYmxlbWVudCkpKSB7XG5cdFx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiAnJChjaXJjbGUtc2xhc2gpICcgKyBsb2NhbGl6ZSgnc2VydmVyLmRpc2FibGVkJywgJ0Rpc2FibGVkJyksXG5cdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkXSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjYW5EZWJ1ZyA9ICEhc2VydmVyLnJlYWREZWZpbml0aW9ucygpLmdldCgpLnNlcnZlcj8uZGV2TW9kZT8uZGVidWc7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gcmVhZChzZXJ2ZXIuY29ubmVjdGlvblN0YXRlKS5zdGF0ZTtcblx0XHRcdFx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdFx0XHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3I6XG5cdFx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2hvd091dHB1dCxcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogJyQoZXJyb3IpICcgKyBsb2NhbGl6ZSgnc2VydmVyLmVycm9yJywgJ0Vycm9yJyksXG5cdFx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbc2VydmVyLmRlZmluaXRpb24uaWRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlJlc3RhcnRTZXJ2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AucmVzdGFydCcsIFwiUmVzdGFydFwiKSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgeyBhdXRvVHJ1c3RDaGFuZ2VzOiB0cnVlIH0gc2F0aXNmaWVzIElNY3BTZXJ2ZXJTdGFydE9wdHNdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAoY2FuRGVidWcpIHtcblx0XHRcdFx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlJlc3RhcnRTZXJ2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5kZWJ1ZycsIFwiRGVidWdcIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgeyBkZWJ1ZzogdHJ1ZSwgYXV0b1RydXN0Q2hhbmdlczogdHJ1ZSB9IHNhdGlzZmllcyBJTWNwU2VydmVyU3RhcnRPcHRzXSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RhcnRpbmc6XG5cdFx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2hvd091dHB1dCxcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogJyQobG9hZGluZ35zcGluKSAnICsgbG9jYWxpemUoJ3NlcnZlci5zdGFydGluZycsICdTdGFydGluZycpLFxuXHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdG9wU2VydmVyLFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbc2VydmVyLmRlZmluaXRpb24uaWRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmc6XG5cdFx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2hvd091dHB1dCxcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogJyQoY2hlY2spICcgKyBsb2NhbGl6ZSgnc2VydmVyLnJ1bm5pbmcnLCAnUnVubmluZycpLFxuXHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3NlcnZlci5kZWZpbml0aW9uLmlkXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdG9wU2VydmVyLFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnN0b3AnLCBcIlN0b3BcIiksXG5cdFx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbc2VydmVyLmRlZmluaXRpb24uaWRdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlJlc3RhcnRTZXJ2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AucmVzdGFydCcsIFwiUmVzdGFydFwiKSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgeyBhdXRvVHJ1c3RDaGFuZ2VzOiB0cnVlIH0gc2F0aXNmaWVzIElNY3BTZXJ2ZXJTdGFydE9wdHNdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAoY2FuRGVidWcpIHtcblx0XHRcdFx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlJlc3RhcnRTZXJ2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5kZWJ1ZycsIFwiRGVidWdcIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgeyBhdXRvVHJ1c3RDaGFuZ2VzOiB0cnVlLCBkZWJ1ZzogdHJ1ZSB9IHNhdGlzZmllcyBJTWNwU2VydmVyU3RhcnRPcHRzXSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZDpcblx0XHRcdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdGFydFNlcnZlcixcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogJyQoZGVidWctc3RhcnQpICcgKyBsb2NhbGl6ZSgnbWNwLnN0YXJ0JywgXCJTdGFydFwiKSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgeyBhdXRvVHJ1c3RDaGFuZ2VzOiB0cnVlIH0gc2F0aXNmaWVzIElNY3BTZXJ2ZXJTdGFydE9wdHNdLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAoY2FuRGVidWcpIHtcblx0XHRcdFx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0YXJ0U2VydmVyLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AuZGVidWcnLCBcIkRlYnVnXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbc2VydmVyLmRlZmluaXRpb24uaWQsIHsgYXV0b1RydXN0Q2hhbmdlczogdHJ1ZSwgZGVidWc6IHRydWUgfSBzYXRpc2ZpZXMgSU1jcFNlcnZlclN0YXJ0T3B0c10sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc3RhdGUgIT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yKSB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbENvdW50ID0gcmVhZChzZXJ2ZXIudG9vbHMpLmxlbmd0aDtcblx0XHRcdFx0XHRpZiAodG9vbENvdW50KSB7XG5cdFx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VydmVyLnRvb2xDb3VudCcsICd7MH0gdG9vbHMnLCB0b29sQ291bnQpLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwcm9tcHRDb3VudCA9IHJlYWQoc2VydmVyLnByb21wdHMpLmxlbmd0aDtcblx0XHRcdFx0XHRpZiAocHJvbXB0Q291bnQpIHtcblx0XHRcdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdGFydFByb21wdEZvclNlcnZlcixcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlcnZlci5wcm9tcHRjb3VudCcsICd7MH0gcHJvbXB0cycsIHByb21wdENvdW50KSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXJdLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2VydmVyT3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3Auc2VydmVyLm1vcmUnLCAnTW9yZS4uLicpLFxuXHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzZXJ2ZXIuZGVmaW5pdGlvbi5pZF0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgXCJTZXQvUmVwbGFjZSBDbGllbnQgU2VjcmV0XCIgbGVuc2VzIGZvciBzZXJ2ZXJzIHRoYXQgaGF2ZSBvYXV0aC5jbGllbnRJZCBjb25maWd1cmVkLlxuXHRcdC8vIENvbGxlY3QgY2FuZGlkYXRlcyBmaXJzdCwgdGhlbiBiYXRjaC1yZXNvbHZlIHNlY3JldHMgd2l0aCBQcm9taXNlLmFsbCB0byBhdm9pZFxuXHRcdC8vIHNlcXVlbnRpYWwgYXdhaXRzIGZvciBlYWNoIHNlcnZlciAod2hpY2ggd291bGQgc2xvdyBDb2RlTGVucyBvbiBsYXJnZXIgbWNwLmpzb24gZmlsZXMpLlxuXHRcdHR5cGUgU2VjcmV0Q2FuZGlkYXRlID0geyBjbGllbnRJZDogc3RyaW5nOyBtY3BTZXJ2ZXJVcmw6IHN0cmluZzsgc2VydmVyTmFtZTogc3RyaW5nOyBjbGllbnRJZE9mZnNldDogbnVtYmVyIH07XG5cdFx0Y29uc3QgY2FuZGlkYXRlczogU2VjcmV0Q2FuZGlkYXRlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG5vZGUgb2Ygc2VydmVyc05vZGUuY2hpbGRyZW4gfHwgW10pIHtcblx0XHRcdGlmIChub2RlLnR5cGUgIT09ICdwcm9wZXJ0eScgfHwgbm9kZS5jaGlsZHJlbj8uWzBdPy50eXBlICE9PSAnc3RyaW5nJyB8fCAhbm9kZS5jaGlsZHJlblsxXSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlcnZlck5hbWUgPSBub2RlLmNoaWxkcmVuWzBdLnZhbHVlIGFzIHN0cmluZztcblx0XHRcdGNvbnN0IHNlcnZlclZhbHVlID0gbm9kZS5jaGlsZHJlblsxXTtcblx0XHRcdGNvbnN0IGNsaWVudElkTm9kZSA9IGZpbmROb2RlQXRMb2NhdGlvbihzZXJ2ZXJWYWx1ZSwgWydvYXV0aCcsICdjbGllbnRJZCddKTtcblx0XHRcdGlmIChjbGllbnRJZE5vZGUgJiYgY2xpZW50SWROb2RlLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IGNsaWVudElkID0gY2xpZW50SWROb2RlLnZhbHVlIGFzIHN0cmluZztcblx0XHRcdFx0aWYgKGNsaWVudElkKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXJsTm9kZSA9IGZpbmROb2RlQXRMb2NhdGlvbihzZXJ2ZXJWYWx1ZSwgWyd1cmwnXSk7XG5cdFx0XHRcdFx0Y29uc3QgcmF3VXJsID0gdXJsTm9kZSAmJiB1cmxOb2RlLnR5cGUgPT09ICdzdHJpbmcnID8gdXJsTm9kZS52YWx1ZSBhcyBzdHJpbmcgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKCFyYXdVcmwpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBPQXV0aCBvbmx5IG1lYW5pbmdmdWwgZm9yIEhUVFAgc2VydmVycywgd2hpY2ggcmVxdWlyZSB1cmxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ2Fub25pY2FsaXplIHRvIG1hdGNoIHRoZSBydW50aW1lIGtleSAoVVJJLnBhcnNlIG5vcm1hbGl6ZXMgYXV0aG9yaXR5IGNhc2luZywgZXRjLilcblx0XHRcdFx0XHRsZXQgbWNwU2VydmVyVXJsOiBzdHJpbmc7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdG1jcFNlcnZlclVybCA9IFVSSS5wYXJzZShyYXdVcmwpLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIG1hbGZvcm1lZCBVUkwsIHNraXBcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FuZGlkYXRlcy5wdXNoKHsgY2xpZW50SWQsIG1jcFNlcnZlclVybCwgc2VydmVyTmFtZSwgY2xpZW50SWRPZmZzZXQ6IGNsaWVudElkTm9kZS5vZmZzZXQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZXhpc3RpbmdTZWNyZXRzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHRjYW5kaWRhdGVzLm1hcChjID0+IHRoaXMuX3NlY3JldFN0b3JhZ2VTZXJ2aWNlLmdldChtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXkoYy5tY3BTZXJ2ZXJVcmwsIGMuY2xpZW50SWQpKSlcblx0XHQpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2FuZGlkYXRlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgeyBjbGllbnRJZCwgbWNwU2VydmVyVXJsLCBzZXJ2ZXJOYW1lLCBjbGllbnRJZE9mZnNldCB9ID0gY2FuZGlkYXRlc1tpXTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gZXhpc3RpbmdTZWNyZXRzW2ldO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBleGlzdGluZ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdtY3AucmVwbGFjZUNsaWVudFNlY3JldCcsIFwiUmVwbGFjZSBDbGllbnQgU2VjcmV0XCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21jcC5zZXRDbGllbnRTZWNyZXQnLCBcIlNldCBDbGllbnQgU2VjcmV0XCIpO1xuXHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhtb2RlbC5nZXRQb3NpdGlvbkF0KGNsaWVudElkT2Zmc2V0KSksXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TZXRPQXV0aENsaWVudFNlY3JldCxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFtjbGllbnRJZCwgbWNwU2VydmVyVXJsLCBzZXJ2ZXJOYW1lXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBsZW5zTGlzdDtcblx0fVxuXG5cdHByaXZhdGUgX2FkZEFnZW50SG9zdFNlcnZlckNvZGVMZW5zZXMobGVuc2VzOiBDb2RlTGVuc1tdLCByYW5nZTogUmFuZ2UsIGFnZW50SG9zdFNlc3Npb246IFVSSSwgc2VydmVyOiBBZ2VudEhvc3RNY3BTZXJ2ZXIsIG90aGVyUnVubmluZ1Nlc3Npb25Db3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWFuZEFyZyA9IHsgYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVySWQ6IHNlcnZlci5pZCB9O1xuXHRcdGlmICghc2VydmVyLmVuYWJsZWQpIHtcblx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5BZ2VudEhvc3RTZXJ2ZXJPcHRpb25zLFxuXHRcdFx0XHRcdHRpdGxlOiAnJChjaXJjbGUtc2xhc2gpICcgKyBsb2NhbGl6ZSgnc2VydmVyLmRpc2FibGVkJywgJ0Rpc2FibGVkJyksXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBbYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLmlkXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoc2VydmVyLnN0YXR1cykge1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3I6XG5cdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5BZ2VudEhvc3RTZXJ2ZXJPcHRpb25zLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICckKGVycm9yKSAnICsgbG9jYWxpemUoJ3NlcnZlci5lcnJvcicsICdFcnJvcicpLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLmlkXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0YXJ0U2VydmVyLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3Auc3RhcnQnLCBcIlN0YXJ0XCIpLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbY29tbWFuZEFyZ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmc6XG5cdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5BZ2VudEhvc3RTZXJ2ZXJPcHRpb25zLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICckKGxvYWRpbmd+c3BpbikgJyArIGxvY2FsaXplKCdzZXJ2ZXIuc3RhcnRpbmcnLCAnU3RhcnRpbmcnKSxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2FnZW50SG9zdFNlc3Npb24sIHNlcnZlci5pZF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TdG9wU2VydmVyLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2NvbW1hbmRBcmddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLlJlYWR5OlxuXHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuQWdlbnRIb3N0U2VydmVyT3B0aW9ucyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJChjaGVjaykgJyArIGxvY2FsaXplKCdzZXJ2ZXIucnVubmluZycsICdSdW5uaW5nJyksXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFthZ2VudEhvc3RTZXNzaW9uLCBzZXJ2ZXIuaWRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RvcFNlcnZlcixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnN0b3AnLCBcIlN0b3BcIiksXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtjb21tYW5kQXJnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQ6XG5cdFx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogTWNwQ29tbWFuZElkcy5BZ2VudEhvc3RTZXJ2ZXJPcHRpb25zLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICckKGFjY291bnQpICcgKyBsb2NhbGl6ZSgnc2VydmVyLmF1dGhSZXF1aXJlZCcsICdBdXRoZW50aWNhdGlvbiBSZXF1aXJlZCcpLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLmlkXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0b3BTZXJ2ZXIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5zdG9wJywgXCJTdG9wXCIpLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbY29tbWFuZEFyZ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZDpcblx0XHRcdFx0bGVuc2VzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0YXJ0U2VydmVyLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICckKGRlYnVnLXN0YXJ0KSAnICsgbG9jYWxpemUoJ21jcC5zdGFydCcsIFwiU3RhcnRcIiksXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtjb21tYW5kQXJnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVyUnVubmluZ1Nlc3Npb25Db3VudCA+IDApIHtcblx0XHRcdGxlbnNlcy5wdXNoKHtcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogJycsXG5cdFx0XHRcdFx0dGl0bGU6IG90aGVyUnVubmluZ1Nlc3Npb25Db3VudCA9PT0gMVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnc2VydmVyLnJ1bm5pbmdJbk9uZU90aGVyU2Vzc2lvbicsICcoUnVubmluZyBpbiAxIHNlc3Npb24pJylcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3NlcnZlci5ydW5uaW5nSW5PdGhlclNlc3Npb25zJywgJyhSdW5uaW5nIGluIHswfSBzZXNzaW9ucyknLCBvdGhlclJ1bm5pbmdTZXNzaW9uQ291bnQpLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoc2VydmVyLnN0YXR1cyAhPT0gTWNwU2VydmVyU3RhdHVzLkVycm9yKSB7XG5cdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuQWdlbnRIb3N0U2VydmVyT3B0aW9ucyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5zZXJ2ZXIubW9yZScsICdNb3JlLi4uJyksXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBbYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLmlkXSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3RoZXJSdW5uaW5nQWdlbnRIb3N0TWNwU2VydmVyQ291bnRzKGFnZW50SG9zdFNlc3Npb246IFVSSSk6IE1hcDxzdHJpbmcsIG51bWJlcj4ge1xuXHRcdGNvbnN0IHNlc3Npb25TZXJ2ZXJzOiBJTWNwRWRpdG9yQWdlbnRIb3N0U2Vzc2lvblNlcnZlcnNbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29ubmVjdGlvbkluZm8gb2YgdGhpcy5fYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmNvbm5lY3Rpb25zKSB7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gY29ubmVjdGlvbkluZm8uY29ubmVjdGlvbjtcblx0XHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY29ubmVjdGlvbi5nZXRBY3RpdmVTdWJzY3JpcHRpb25zKCkpIHtcblx0XHRcdFx0aWYgKHN1YnNjcmlwdGlvbi5raW5kICE9PSBTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBjb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZChTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc3Vic2NyaXB0aW9uLnJlc291cmNlKT8udmFsdWU7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fdG9BZ2VudEhvc3RTZXNzaW9uUmVzb3VyY2UoY29ubmVjdGlvbkluZm8sIHN1YnNjcmlwdGlvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdGlmICghcmVzb3VyY2UgfHwgIXN0YXRlIHx8IHN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlc3Npb25TZXJ2ZXJzLnB1c2goeyByZXNvdXJjZSwgc2VydmVyczogdGhpcy5fZ2V0TWNwU2VydmVyc0Zyb21TZXNzaW9uU3RhdGUoc3RhdGUpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY291bnRSdW5uaW5nTWNwU2VydmVyc0luT3RoZXJTZXNzaW9ucyhhZ2VudEhvc3RTZXNzaW9uLCBzZXNzaW9uU2VydmVycyk7XG5cdH1cblxuXHRwcml2YXRlIF90b0FnZW50SG9zdFNlc3Npb25SZXNvdXJjZShjb25uZWN0aW9uSW5mbzogSUFnZW50SG9zdENvbm5lY3Rpb25JbmZvLCBiYWNrZW5kU2Vzc2lvbjogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihiYWNrZW5kU2Vzc2lvbik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2NoZW1lID0gY29ubmVjdGlvbkluZm8uaXNBbWJpZW50XG5cdFx0XHQ/IGAke0xPQ0FMX0FHRU5UX0hPU1RfU0NIRU1FX1BSRUZJWH0ke3Byb3ZpZGVyfWBcblx0XHRcdDogcmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVJZChjb25uZWN0aW9uSW5mby5hdXRob3JpdHksIHByb3ZpZGVyKTtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWUsIHBhdGg6IGJhY2tlbmRTZXNzaW9uLnBhdGggfSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRNY3BTZXJ2ZXJzRnJvbVNlc3Npb25TdGF0ZShzdGF0ZTogU2Vzc2lvblN0YXRlKTogSU1jcEVkaXRvckFnZW50SG9zdFNlcnZlcltdIHtcblx0XHRjb25zdCBzZXJ2ZXJzOiBJTWNwRWRpdG9yQWdlbnRIb3N0U2VydmVyW10gPSBbXTtcblx0XHRjb25zdCBjb2xsZWN0ID0gKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSAoQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbilbXSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGN1c3RvbWl6YXRpb25zID8/IFtdKSB7XG5cdFx0XHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdHNlcnZlcnMucHVzaCh7XG5cdFx0XHRcdFx0XHRuYW1lOiBjdXN0b21pemF0aW9uLm5hbWUsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiBjdXN0b21pemF0aW9uLmVuYWJsZWQsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IGN1c3RvbWl6YXRpb24uc3RhdGUua2luZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSB8fCBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbikge1xuXHRcdFx0XHRcdGNvbGxlY3QoY3VzdG9taXphdGlvbi5jaGlsZHJlbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbGxlY3Qoc3RhdGUuY3VzdG9taXphdGlvbnMpO1xuXHRcdHJldHVybiBzZXJ2ZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHJvdmlkZUlubGF5SGludHMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSk6IFByb21pc2U8SW5sYXlIaW50TGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IGF3YWl0IHRoaXMuX3BhcnNlTW9kZWwobW9kZWwpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdHJlZSwgaW5Db25maWcgfSA9IHBhcnNlZDtcblx0XHRjb25zdCBtY3BTZWN0aW9uID0gaW5Db25maWcuc2VjdGlvbiA/IGZpbmROb2RlQXRMb2NhdGlvbih0cmVlLCBbLi4uaW5Db25maWcuc2VjdGlvbl0pIDogdHJlZTtcblx0XHRpZiAoIW1jcFNlY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXRzTm9kZSA9IGZpbmROb2RlQXRMb2NhdGlvbihtY3BTZWN0aW9uLCBbJ2lucHV0cyddKTtcblx0XHRpZiAoIWlucHV0c05vZGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXRzID0gYXdhaXQgdGhpcy5fbWNwUmVnaXN0cnkuZ2V0U2F2ZWRJbnB1dHMoaW5Db25maWcuc2NvcGUpO1xuXHRcdGNvbnN0IGhpbnRzOiBJbmxheUhpbnRbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2VydmVyc05vZGUgPSBmaW5kTm9kZUF0TG9jYXRpb24obWNwU2VjdGlvbiwgW2luQ29uZmlnLnNlcnZlcnNLZXkgPz8gJ3NlcnZlcnMnXSk7XG5cdFx0aWYgKHNlcnZlcnNOb2RlKSB7XG5cdFx0XHRhbm5vdGF0ZVNlcnZlcnMoc2VydmVyc05vZGUpO1xuXHRcdH1cblx0XHRhbm5vdGF0ZUlucHV0cyhpbnB1dHNOb2RlKTtcblxuXHRcdHJldHVybiB7IGhpbnRzLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblxuXHRcdGZ1bmN0aW9uIGFubm90YXRlU2VydmVycyhzZXJ2ZXJzOiBOb2RlKSB7XG5cdFx0XHRmb3JFYWNoUHJvcGVydHlXaXRoUmVwbGFjZW1lbnQoc2VydmVycywgbm9kZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKG5vZGUudmFsdWUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgaWQgfSBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHNhdmVkID0gaW5wdXRzW2lkXTtcblx0XHRcdFx0XHRpZiAoc2F2ZWQpIHtcblx0XHRcdFx0XHRcdHB1c2hBbm5vdGF0aW9uKGlkLCBub2RlLm9mZnNldCArIG5vZGUudmFsdWUuaW5kZXhPZihpZCkgKyBpZC5sZW5ndGgsIHNhdmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGFubm90YXRlSW5wdXRzKG5vZGU6IE5vZGUpIHtcblx0XHRcdGlmIChub2RlLnR5cGUgIT09ICdhcnJheScgfHwgIW5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGlucHV0IG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKGlucHV0LnR5cGUgIT09ICdvYmplY3QnIHx8ICFpbnB1dC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaWRQcm9wID0gaW5wdXQuY2hpbGRyZW4uZmluZChjID0+IGMudHlwZSA9PT0gJ3Byb3BlcnR5JyAmJiBjLmNoaWxkcmVuPy5bMF0udmFsdWUgPT09ICdpZCcpO1xuXHRcdFx0XHRpZiAoIWlkUHJvcCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaWQgPSBpZFByb3AuY2hpbGRyZW4hWzFdO1xuXHRcdFx0XHRpZiAoIWlkIHx8IGlkLnR5cGUgIT09ICdzdHJpbmcnIHx8ICFpZC52YWx1ZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2F2ZWRJZCA9ICcke2lucHV0OicgKyBpZC52YWx1ZSArICd9Jztcblx0XHRcdFx0Y29uc3Qgc2F2ZWQgPSBpbnB1dHNbc2F2ZWRJZF07XG5cdFx0XHRcdGlmIChzYXZlZCkge1xuXHRcdFx0XHRcdHB1c2hBbm5vdGF0aW9uKHNhdmVkSWQsIGlkLm9mZnNldCArIDEgKyBpZC5sZW5ndGgsIHNhdmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHB1c2hBbm5vdGF0aW9uKHNhdmVkSWQ6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIHNhdmVkOiBJUmVzb2x2ZWRWYWx1ZSk6IElubGF5SGludCB7XG5cdFx0XHRjb25zdCB0b29sdGlwID0gbmV3IE1hcmtkb3duU3RyaW5nKFtcblx0XHRcdFx0Y3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7IGlkOiBNY3BDb21tYW5kSWRzLkVkaXRTdG9yZWRJbnB1dCwgdGV4dDogbG9jYWxpemUoJ2VkaXQnLCAnRWRpdCcpLCBhcmd1bWVudHM6IFtzYXZlZElkLCBtb2RlbC51cmksIG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uLCBpbkNvbmZpZyEudGFyZ2V0XSwgdG9vbHRpcDogbG9jYWxpemUoJ2VkaXQuc2F2ZWRWYWx1ZS50b29sdGlwJywgJ0VkaXQgc2F2ZWQgdmFsdWUnKSB9KSxcblx0XHRcdFx0Y3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7IGlkOiBNY3BDb21tYW5kSWRzLlJlbW92ZVN0b3JlZElucHV0LCB0ZXh0OiBsb2NhbGl6ZSgnY2xlYXInLCAnQ2xlYXInKSwgYXJndW1lbnRzOiBbaW5Db25maWchLnNjb3BlLCBzYXZlZElkXSwgdG9vbHRpcDogbG9jYWxpemUoJ2NsZWFyLnNhdmVkVmFsdWUudG9vbHRpcCcsICdDbGVhciBzYXZlZCB2YWx1ZScpIH0pLFxuXHRcdFx0XHRjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rKHsgaWQ6IE1jcENvbW1hbmRJZHMuUmVtb3ZlU3RvcmVkSW5wdXQsIHRleHQ6IGxvY2FsaXplKCdjbGVhckFsbCcsICdDbGVhciBBbGwnKSwgYXJndW1lbnRzOiBbaW5Db25maWchLnNjb3BlXSwgdG9vbHRpcDogbG9jYWxpemUoJ2NsZWFyQWxsLnNhdmVkVmFsdWVzLnRvb2x0aXAnLCAnQ2xlYXIgYWxsIHNhdmVkIHZhbHVlcycpIH0pLFxuXHRcdFx0XS5qb2luKCcgfCAnKSwgeyBpc1RydXN0ZWQ6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IGhpbnQ6IElubGF5SGludCA9IHtcblx0XHRcdFx0bGFiZWw6ICc9ICcgKyAoc2F2ZWQuaW5wdXQ/LnR5cGUgPT09ICdwcm9tcHRTdHJpbmcnICYmIHNhdmVkLmlucHV0LnBhc3N3b3JkID8gJyonLnJlcGVhdCgxMCkgOiAoc2F2ZWQudmFsdWUgfHwgJycpKSxcblx0XHRcdFx0cG9zaXRpb246IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KSxcblx0XHRcdFx0dG9vbHRpcCxcblx0XHRcdFx0cGFkZGluZ0xlZnQ6IHRydWUsXG5cdFx0XHR9O1xuXG5cdFx0XHRoaW50cy5wdXNoKGhpbnQpO1xuXHRcdFx0cmV0dXJuIGhpbnQ7XG5cdFx0fVxuXHR9XG59XG5cblxuXG5mdW5jdGlvbiBmb3JFYWNoUHJvcGVydHlXaXRoUmVwbGFjZW1lbnQobm9kZTogTm9kZSwgY2FsbGJhY2s6IChub2RlOiBOb2RlKSA9PiB2b2lkKSB7XG5cdGlmIChub2RlLnR5cGUgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBub2RlLnZhbHVlID09PSAnc3RyaW5nJyAmJiBub2RlLnZhbHVlLmluY2x1ZGVzKENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uVkFSSUFCTEVfTEhTKSkge1xuXHRcdGNhbGxiYWNrKG5vZGUpO1xuXHR9IGVsc2UgaWYgKG5vZGUudHlwZSA9PT0gJ3Byb3BlcnR5Jykge1xuXHRcdC8vIHNraXAgdGhlIHByb3BlcnR5IG5hbWVcblx0XHRub2RlLmNoaWxkcmVuPy5zbGljZSgxKS5mb3JFYWNoKG4gPT4gZm9yRWFjaFByb3BlcnR5V2l0aFJlcGxhY2VtZW50KG4sIGNhbGxiYWNrKSk7XG5cdH0gZWxzZSB7XG5cdFx0bm9kZS5jaGlsZHJlbj8uZm9yRWFjaChuID0+IGZvckVhY2hQcm9wZXJ0eVdpdGhSZXBsYWNlbWVudChuLCBjYWxsYmFjaykpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsMkJBQTJCLHNCQUFzQjtBQUMxRCxTQUFTLG9CQUEwQixpQkFBaUI7QUFDcEQsU0FBUyxZQUFZLGlCQUFpQixTQUFzQix5QkFBeUI7QUFFckYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFHdEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBbUMsOEJBQThCLHNDQUFzQztBQUN2RyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQix1QkFBdUY7QUFDbkgsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBc0IsZ0JBQWdCLHNCQUFzQjtBQUM1RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVDQUF1RDtBQUNoRSxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHVDQUF1Qyw0Q0FBK0c7QUFDL0osU0FBUyxvQkFBb0I7QUFDN0IsU0FBOEMsYUFBYSxzQkFBc0Isb0JBQW9CLHNDQUFzQztBQUUzSSxNQUFNLGtCQUFrQjtBQVFqQixJQUFNLHNCQUFOLGNBQWtDLFdBQTZDO0FBQUEsRUFHckYsWUFDMkIseUJBQ0ssY0FDUSxzQkFDVCxhQUNPLG9CQUNZLGdDQUNGLDhCQUNkLGdCQUNlLCtCQUNSLHVCQUN2QztBQUNELFVBQU07QUFWeUI7QUFDUTtBQUNUO0FBQ087QUFDWTtBQUNGO0FBQ2Q7QUFD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
