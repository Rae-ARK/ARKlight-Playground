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
import { assertNever } from "../../../../base/common/assert.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { derived, observableValue, autorunSelfDisposable } from "../../../../base/common/observable.js";
import { isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../platform/mcp/common/mcpManagement.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { AUX_WINDOW_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { IMcpDevModeDebugging } from "./mcpDevMode.js";
import { McpRegistryInputStorage } from "./mcpRegistryInputStorage.js";
import { IMcpSandboxService } from "./mcpSandboxService.js";
import { McpServerConnection } from "./mcpServerConnection.js";
import { LazyCollectionState, McpCollectionProvenance, McpServerTrust, McpStartServerInteraction, UserInteractionRequiredError } from "./mcpTypes.js";
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from "../../../../platform/policy/common/copilotManagedSettings.js";
import { isStrictPluginOnlyCustomizationEnabled } from "../../chat/common/customizationLockdown.js";
const notTrustedNonce = "__vscode_not_trusted";
let McpRegistry = class extends Disposable {
  constructor(_instantiationService, _configurationResolverService, _dialogService, _notificationService, _editorService, configurationService, _quickInputService, _labelService, _logService, _mcpSandboxService, _workspaceTrustManagementService, _workspaceTrustRequestService) {
    super();
    this._instantiationService = _instantiationService;
    this._configurationResolverService = _configurationResolverService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._editorService = _editorService;
    this._quickInputService = _quickInputService;
    this._labelService = _labelService;
    this._logService = _logService;
    this._mcpSandboxService = _mcpSandboxService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._collections = observableValue("collections", []);
    this._delegates = observableValue("delegates", []);
    this.collections = derived((reader) => {
      if (this._mcpAccessValue.read(reader) === McpAccessValue.None) {
        return [];
      }
      const strictPluginOnly = this._strictPluginOnlyCustomization.read(reader);
      return this._collections.read(reader).filter((collection) => this.isCollectionAllowed(collection, strictPluginOnly));
    });
    this._workspaceStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.WORKSPACE, StorageTarget.USER)));
    this._profileStorage = new Lazy(() => this._register(this._instantiationService.createInstance(McpRegistryInputStorage, StorageScope.PROFILE, StorageTarget.USER)));
    this._ongoingLazyActivations = observableValue(this, 0);
    this.lazyCollectionState = derived((reader) => {
      if (this._mcpAccessValue.read(reader) === McpAccessValue.None) {
        return { state: LazyCollectionState.AllKnown, collections: [] };
      }
      if (this._ongoingLazyActivations.read(reader) > 0) {
        return { state: LazyCollectionState.LoadingUnknown, collections: [] };
      }
      const strictPluginOnly = this._strictPluginOnlyCustomization.read(reader);
      const collections = this._collections.read(reader).filter((collection) => this.isCollectionAllowed(collection, strictPluginOnly));
      const hasUnknown = collections.some((c) => c.lazy && c.lazy.isCached === false);
      return hasUnknown ? { state: LazyCollectionState.HasUnknown, collections: collections.filter((c) => c.lazy && c.lazy.isCached === false) } : { state: LazyCollectionState.AllKnown, collections: [] };
    });
    this._onDidChangeInputs = this._register(new Emitter());
    this.onDidChangeInputs = this._onDidChangeInputs.event;
    this._mcpAccessValue = observableConfigValue(mcpAccessConfig, McpAccessValue.All, configurationService);
    this._strictPluginOnlyCustomization = observableConfigValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, void 0, configurationService);
  }
  get delegates() {
    return this._delegates;
  }
  registerDelegate(delegate) {
    const delegates = this._delegates.get().slice();
    delegates.push(delegate);
    delegates.sort((a, b) => b.priority - a.priority);
    this._delegates.set(delegates, void 0);
    return {
      dispose: () => {
        const delegates2 = this._delegates.get().filter((d) => d !== delegate);
        this._delegates.set(delegates2, void 0);
      }
    };
  }
  registerCollection(collection) {
    const currentCollections = this._collections.get();
    const toReplace = currentCollections.find((c) => c.id === collection.id);
    if (toReplace && !toReplace.lazy) {
      return Disposable.None;
    } else if (toReplace) {
      this._collections.set(currentCollections.map((c) => c === toReplace ? collection : c), void 0);
    } else {
      this._collections.set([...currentCollections, collection].sort((a, b) => a.order - b.order), void 0);
    }
    return {
      dispose: () => {
        const currentCollections2 = this._collections.get();
        this._collections.set(currentCollections2.filter((c) => c !== collection), void 0);
      }
    };
  }
  getServerDefinition(collectionRef, definitionRef) {
    const collectionObs = this._collections.map((cols) => cols.find((c) => c.id === collectionRef.id));
    return collectionObs.map((collection, reader) => {
      if (collection && !this.isCollectionAllowed(collection, this._strictPluginOnlyCustomization.read(reader))) {
        return { collection: void 0, server: void 0 };
      }
      const server = collection?.serverDefinitions.read(reader).find((s) => s.id === definitionRef.id);
      return { collection, server };
    });
  }
  async discoverCollections() {
    const strictPluginOnly = this._strictPluginOnlyCustomization.get();
    const toDiscover = this._collections.get().filter((c) => this.isCollectionAllowed(c, strictPluginOnly) && c.lazy && !c.lazy.isCached);
    this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() + 1, void 0);
    await Promise.all(toDiscover.map((c) => c.lazy?.load())).finally(() => {
      this._ongoingLazyActivations.set(this._ongoingLazyActivations.get() - 1, void 0);
    });
    const found = [];
    const current = this._collections.get();
    for (const collection of toDiscover) {
      const rec = current.find((c) => c.id === collection.id);
      if (!rec) {
      } else if (rec.lazy) {
        rec.lazy.removed?.();
      } else {
        found.push(rec);
      }
    }
    return found;
  }
  _getInputStorage(scope) {
    return scope === StorageScope.WORKSPACE ? this._workspaceStorage.value : this._profileStorage.value;
  }
  _getInputStorageInConfigTarget(configTarget) {
    return this._getInputStorage(
      configTarget === ConfigurationTarget.WORKSPACE || configTarget === ConfigurationTarget.WORKSPACE_FOLDER ? StorageScope.WORKSPACE : StorageScope.PROFILE
    );
  }
  async clearSavedInputs(scope, inputId) {
    const storage = this._getInputStorage(scope);
    if (inputId) {
      await storage.clear(inputId);
    } else {
      storage.clearAll();
    }
    this._onDidChangeInputs.fire();
  }
  async editSavedInput(inputId, folderData, configSection, target) {
    const storage = this._getInputStorageInConfigTarget(target);
    const expr = ConfigurationResolverExpression.parse(inputId);
    const stored = await storage.getMap();
    const previous = stored[inputId].value;
    await this._configurationResolverService.resolveWithInteraction(folderData, expr, configSection, previous ? { [inputId.slice(2, -1)]: previous } : {}, target);
    await this._updateStorageWithExpressionInputs(storage, expr);
  }
  async setSavedInput(inputId, target, value) {
    const storage = this._getInputStorageInConfigTarget(target);
    const expr = ConfigurationResolverExpression.parse(inputId);
    for (const unresolved of expr.unresolved()) {
      expr.resolve(unresolved, value);
      break;
    }
    await this._updateStorageWithExpressionInputs(storage, expr);
  }
  getSavedInputs(scope) {
    return this._getInputStorage(scope).getMap();
  }
  async _checkTrust(collection, definition, {
    trustNonceBearer,
    interaction,
    promptType = "only-new",
    autoTrustChanges = false,
    errorOnUserInteraction = false
  }) {
    if (collection.scope === StorageScope.WORKSPACE && !this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      if (errorOnUserInteraction) {
        throw new UserInteractionRequiredError("workspaceTrust");
      } else if (!await this._workspaceTrustRequestService.requestWorkspaceTrust({ message: localize("runTrust", "This MCP server definition is defined in your workspace files.") })) {
        return false;
      }
    }
    if (collection.trustBehavior === McpServerTrust.Kind.Trusted) {
      this._logService.trace(`MCP server ${definition.id} is trusted, no trust prompt needed`);
      return true;
    } else if (collection.trustBehavior === McpServerTrust.Kind.TrustedOnNonce) {
      if (definition.cacheNonce === trustNonceBearer.trustedAtNonce) {
        this._logService.trace(`MCP server ${definition.id} is unchanged, no trust prompt needed`);
        return true;
      }
      if (autoTrustChanges) {
        this._logService.trace(`MCP server ${definition.id} is was changed but user explicitly executed`);
        trustNonceBearer.trustedAtNonce = definition.cacheNonce;
        return true;
      }
      if (trustNonceBearer.trustedAtNonce === notTrustedNonce) {
        if (promptType === "all-untrusted") {
          if (errorOnUserInteraction) {
            throw new UserInteractionRequiredError("serverTrust");
          }
          return this._promptForTrust(definition, collection, interaction, trustNonceBearer);
        } else {
          this._logService.trace(`MCP server ${definition.id} is untrusted, denying trust prompt`);
          return false;
        }
      }
      if (promptType === "never") {
        this._logService.trace(`MCP server ${definition.id} trust state is unknown, skipping prompt`);
        return false;
      }
      if (errorOnUserInteraction) {
        throw new UserInteractionRequiredError("serverTrust");
      }
      const didTrust = await this._promptForTrust(definition, collection, interaction, trustNonceBearer);
      if (didTrust) {
        return true;
      }
      if (didTrust === void 0) {
        return void 0;
      }
      trustNonceBearer.trustedAtNonce = notTrustedNonce;
      return false;
    } else {
      assertNever(collection.trustBehavior);
    }
  }
  async _promptForTrust(definition, collection, interaction, trustNonceBearer) {
    interaction ??= new McpStartServerInteraction();
    interaction.participants.set(definition.id, { s: "waiting", definition, collection });
    const trustedDefinitionIds = await new Promise((resolve) => {
      autorunSelfDisposable((reader) => {
        const map = interaction.participants.observable.read(reader);
        if (Iterable.some(map.values(), (p) => p.s === "unknown")) {
          return;
        }
        reader.dispose();
        interaction.choice ??= this._promptForTrustOpenDialog(
          [...map.values()].map((v) => v.s === "waiting" ? v : void 0).filter(isDefined)
        );
        resolve(interaction.choice);
      });
    });
    this._logService.trace(`MCP trusted servers:`, trustedDefinitionIds);
    if (trustedDefinitionIds) {
      trustNonceBearer.trustedAtNonce = trustedDefinitionIds.includes(definition.id) ? definition.cacheNonce : notTrustedNonce;
    }
    return !!trustedDefinitionIds?.includes(definition.id);
  }
  /**
   * Confirms with the user which of the provided definitions should be trusted.
   * Returns undefined if the user cancelled the flow, or the list of trusted
   * definition IDs otherwise.
   */
  async _promptForTrustOpenDialog(definitions) {
    function labelFor(r) {
      const originURI = r.definition.presentation?.origin?.uri || r.collection.presentation?.origin;
      let labelWithOrigin = originURI ? `[\`${r.definition.label}\`](${originURI})` : "`" + r.definition.label + "`";
      if (r.collection.source instanceof ExtensionIdentifier) {
        labelWithOrigin += ` (${localize("trustFromExt", "from {0}", r.collection.source.value)})`;
      }
      return labelWithOrigin;
    }
    if (definitions.length === 1) {
      const def = definitions[0];
      const originURI = def.definition.presentation?.origin?.uri;
      const { result: result2 } = await this._dialogService.prompt(
        {
          message: localize("trustTitleWithOrigin", "Trust and run MCP server {0}?", def.definition.label),
          custom: {
            icon: Codicon.shield,
            markdownDetails: [{
              markdown: new MarkdownString(localize("mcp.trust.details", "The MCP server {0} was updated. MCP servers may add context to your chat session and lead to unexpected behavior. Do you want to trust and run this server?", labelFor(def))),
              actionHandler: () => {
                const editor = this._editorService.openEditor({ resource: originURI }, AUX_WINDOW_GROUP);
                return editor.then(Boolean);
              }
            }]
          },
          buttons: [
            { label: localize("mcp.trust.yes", "Trust"), run: () => true },
            { label: localize("mcp.trust.no", "Do not trust"), run: () => false }
          ]
        }
      );
      return result2 === void 0 ? void 0 : result2 ? [def.definition.id] : [];
    }
    const list = definitions.map((d) => `- ${labelFor(d)}`).join("\n");
    const { result } = await this._dialogService.prompt(
      {
        message: localize("trustTitleWithOriginMulti", "Trust and run {0} MCP servers?", definitions.length),
        custom: {
          icon: Codicon.shield,
          markdownDetails: [{
            markdown: new MarkdownString(localize("mcp.trust.detailsMulti", "Several updated MCP servers were discovered:\n\n{0}\n\n MCP servers may add context to your chat session and lead to unexpected behavior. Do you want to trust and run these server?", list)),
            actionHandler: (uri) => {
              const editor = this._editorService.openEditor({ resource: URI.parse(uri) }, AUX_WINDOW_GROUP);
              return editor.then(Boolean);
            }
          }]
        },
        buttons: [
          { label: localize("mcp.trust.yes", "Trust"), run: () => "all" },
          { label: localize("mcp.trust.pick", "Pick Trusted"), run: () => "pick" },
          { label: localize("mcp.trust.no", "Do not trust"), run: () => "none" }
        ]
      }
    );
    if (result === void 0) {
      return void 0;
    } else if (result === "all") {
      return definitions.map((d) => d.definition.id);
    } else if (result === "none") {
      return [];
    }
    function isActionableButton(obj) {
      return typeof obj.action === "function";
    }
    const store = new DisposableStore();
    const picker = store.add(this._quickInputService.createQuickPick({ useSeparators: false }));
    picker.canSelectMany = true;
    picker.items = definitions.map(({ definition, collection }) => {
      const buttons = [];
      if (definition.presentation?.origin) {
        const origin = definition.presentation.origin;
        buttons.push({
          iconClass: "codicon-go-to-file",
          tooltip: "Go to Definition",
          action: () => this._editorService.openEditor({ resource: origin.uri, options: { selection: origin.range } })
        });
      }
      return {
        type: "item",
        label: definition.label,
        definitonId: definition.id,
        description: collection.source instanceof ExtensionIdentifier ? collection.source.value : definition.presentation?.origin ? this._labelService.getUriLabel(definition.presentation.origin.uri) : void 0,
        picked: false,
        buttons
      };
    });
    picker.placeholder = "Select MCP servers to trust";
    picker.ignoreFocusOut = true;
    store.add(picker.onDidTriggerItemButton((e) => {
      if (isActionableButton(e.button)) {
        e.button.action();
      }
    }));
    return new Promise((resolve) => {
      store.add(picker.onDidAccept(() => {
        resolve(picker.selectedItems.map((item) => item.definitonId));
        picker.hide();
      }));
      store.add(picker.onDidHide(() => {
        resolve(void 0);
      }));
      picker.show();
    }).finally(() => store.dispose());
  }
  async _updateStorageWithExpressionInputs(inputStorage, expr) {
    const secrets = {};
    const inputs = {};
    for (const [replacement, resolved] of expr.resolved()) {
      if (resolved.input?.type === "promptString" && resolved.input.password) {
        secrets[replacement.id] = resolved;
      } else {
        inputs[replacement.id] = resolved;
      }
    }
    inputStorage.setPlainText(inputs);
    await inputStorage.setSecrets(secrets);
    this._onDidChangeInputs.fire();
  }
  async _replaceVariablesInLaunch(delegate, definition, launch, errorOnUserInteraction) {
    if (!definition.variableReplacement) {
      return launch;
    }
    const { section, target, folder } = definition.variableReplacement;
    const inputStorage = this._getInputStorageInConfigTarget(target);
    const [previouslyStored, withRemoteFilled] = await Promise.all([
      inputStorage.getMap(),
      delegate.substituteVariables(definition, launch)
    ]);
    const expr = ConfigurationResolverExpression.parse(withRemoteFilled);
    for (const replacement of expr.unresolved()) {
      if (previouslyStored.hasOwnProperty(replacement.id)) {
        expr.resolve(replacement, previouslyStored[replacement.id]);
      }
    }
    if (errorOnUserInteraction) {
      const unresolved = Array.from(expr.unresolved());
      if (unresolved.length > 0) {
        throw new UserInteractionRequiredError("variables");
      }
    }
    await this._configurationResolverService.resolveWithInteraction(folder, expr, section, void 0, target);
    await this._updateStorageWithExpressionInputs(inputStorage, expr);
    return await this._configurationResolverService.resolveAsync(folder, expr);
  }
  isCollectionAllowed(collection, strictPluginOnly) {
    return !isStrictPluginOnlyCustomizationEnabled(strictPluginOnly) || collection.provenance === McpCollectionProvenance.Plugin;
  }
  async resolveConnection(opts) {
    const { collectionRef, definitionRef, interaction, logger, debug } = opts;
    let collection = this._collections.get().find((c) => c.id === collectionRef.id);
    if (collection && !this.isCollectionAllowed(collection, this._strictPluginOnlyCustomization.get())) {
      throw new Error(`MCP collection ${collectionRef.id} is blocked by enterprise customization policy`);
    }
    if (collection?.lazy) {
      await collection.lazy.load();
      collection = this._collections.get().find((c) => c.id === collectionRef.id);
    }
    if (collection && !this.isCollectionAllowed(collection, this._strictPluginOnlyCustomization.get())) {
      throw new Error(`MCP collection ${collectionRef.id} is blocked by enterprise customization policy`);
    }
    const definition = collection?.serverDefinitions.get().find((s) => s.id === definitionRef.id);
    if (!collection || !definition) {
      throw new Error(`Collection or definition not found for ${collectionRef.id} and ${definitionRef.id}`);
    }
    const delegate = this._delegates.get().find((d) => d.canStart(collection, definition));
    if (!delegate) {
      throw new Error("No delegate found that can handle the connection");
    }
    const trusted = await this._checkTrust(collection, definition, opts);
    interaction?.participants.set(definition.id, { s: "resolved" });
    if (!trusted) {
      return void 0;
    }
    let launch = definition.launch;
    if (collection.resolveServerLanch) {
      launch = await collection.resolveServerLanch(definition);
      if (!launch) {
        return void 0;
      }
    }
    try {
      launch = await this._replaceVariablesInLaunch(delegate, definition, launch, opts.errorOnUserInteraction);
      if (definition.devMode && debug) {
        launch = await this._instantiationService.invokeFunction((accessor) => accessor.get(IMcpDevModeDebugging).transform(definition, launch));
      }
      launch = await this._mcpSandboxService.launchInSandboxIfEnabled(definition, launch, collection.remoteAuthority ?? void 0, collection.configTarget);
    } catch (e) {
      if (e instanceof UserInteractionRequiredError) {
        throw e;
      }
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("mcp.launchError", "Error starting {0}: {1}", definition.label, String(e)),
        actions: {
          primary: collection.presentation?.origin && [
            {
              id: "mcp.launchError.openConfig",
              class: void 0,
              enabled: true,
              tooltip: "",
              label: localize("mcp.launchError.openConfig", "Open Configuration"),
              run: () => this._editorService.openEditor({
                resource: collection.presentation.origin,
                options: { selection: definition.presentation?.origin?.range }
              })
            }
          ]
        }
      });
      return;
    }
    return this._instantiationService.createInstance(
      McpServerConnection,
      collection,
      definition,
      delegate,
      launch,
      logger,
      opts.errorOnUserInteraction,
      opts.taskManager
    );
  }
};
McpRegistry = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationResolverService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IQuickInputService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IMcpSandboxService),
  __decorateParam(10, IWorkspaceTrustManagementService),
  __decorateParam(11, IWorkspaceTrustRequestService)
], McpRegistry);
export {
  McpRegistry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwUmVnaXN0cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIGF1dG9ydW5TZWxmRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlckRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbiwgSVJlc29sdmVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuaW1wb3J0IHsgQVVYX1dJTkRPV19HUk9VUCwgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1jcERldk1vZGVEZWJ1Z2dpbmcgfSBmcm9tICcuL21jcERldk1vZGUuanMnO1xuaW1wb3J0IHsgTWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2UgfSBmcm9tICcuL21jcFJlZ2lzdHJ5SW5wdXRTdG9yYWdlLmpzJztcbmltcG9ydCB7IElNY3BIb3N0RGVsZWdhdGUsIElNY3BSZWdpc3RyeSwgSU1jcFJlc29sdmVDb25uZWN0aW9uT3B0aW9ucyB9IGZyb20gJy4vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwU2FuZGJveFNlcnZpY2UgfSBmcm9tICcuL21jcFNhbmRib3hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlckNvbm5lY3Rpb24gfSBmcm9tICcuL21jcFNlcnZlckNvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlckNvbm5lY3Rpb24sIExhenlDb2xsZWN0aW9uU3RhdGUsIE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb2xsZWN0aW9uUHJvdmVuYW5jZSwgTWNwRGVmaW5pdGlvblJlZmVyZW5jZSwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcnVzdCwgTWNwU3RhcnRTZXJ2ZXJJbnRlcmFjdGlvbiwgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvciB9IGZyb20gJy4vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgaXNTdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbkVuYWJsZWQsIFN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkxvY2tkb3duLmpzJztcblxuY29uc3Qgbm90VHJ1c3RlZE5vbmNlID0gJ19fdnNjb2RlX25vdF90cnVzdGVkJztcblxuZXhwb3J0IGNsYXNzIE1jcFJlZ2lzdHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BSZWdpc3RyeSB7XG5cdGRlY2xhcmUgcHVibGljIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2xsZWN0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbltdPignY29sbGVjdGlvbnMnLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGVnYXRlcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJTWNwSG9zdERlbGVnYXRlW10+KCdkZWxlZ2F0ZXMnLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21jcEFjY2Vzc1ZhbHVlOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbjogSU9ic2VydmFibGU8U3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24+O1xuXHRwdWJsaWMgcmVhZG9ubHkgY29sbGVjdGlvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uW10+ID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdGlmICh0aGlzLl9tY3BBY2Nlc3NWYWx1ZS5yZWFkKHJlYWRlcikgPT09IE1jcEFjY2Vzc1ZhbHVlLk5vbmUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RyaWN0UGx1Z2luT25seSA9IHRoaXMuX3N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gdGhpcy5fY29sbGVjdGlvbnMucmVhZChyZWFkZXIpLmZpbHRlcihjb2xsZWN0aW9uID0+IHRoaXMuaXNDb2xsZWN0aW9uQWxsb3dlZChjb2xsZWN0aW9uLCBzdHJpY3RQbHVnaW5Pbmx5KSk7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVN0b3JhZ2UgPSBuZXcgTGF6eSgoKSA9PiB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BSZWdpc3RyeUlucHV0U3RvcmFnZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9maWxlU3RvcmFnZSA9IG5ldyBMYXp5KCgpID0+IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFJlZ2lzdHJ5SW5wdXRTdG9yYWdlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKSkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uZ29pbmdMYXp5QWN0aXZhdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cblx0cHVibGljIHJlYWRvbmx5IGxhenlDb2xsZWN0aW9uU3RhdGUgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0aWYgKHRoaXMuX21jcEFjY2Vzc1ZhbHVlLnJlYWQocmVhZGVyKSA9PT0gTWNwQWNjZXNzVmFsdWUuTm9uZSkge1xuXHRcdFx0cmV0dXJuIHsgc3RhdGU6IExhenlDb2xsZWN0aW9uU3RhdGUuQWxsS25vd24sIGNvbGxlY3Rpb25zOiBbXSB9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9vbmdvaW5nTGF6eUFjdGl2YXRpb25zLnJlYWQocmVhZGVyKSA+IDApIHtcblx0XHRcdHJldHVybiB7IHN0YXRlOiBMYXp5Q29sbGVjdGlvblN0YXRlLkxvYWRpbmdVbmtub3duLCBjb2xsZWN0aW9uczogW10gfTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RyaWN0UGx1Z2luT25seSA9IHRoaXMuX3N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBjb2xsZWN0aW9ucyA9IHRoaXMuX2NvbGxlY3Rpb25zLnJlYWQocmVhZGVyKS5maWx0ZXIoY29sbGVjdGlvbiA9PiB0aGlzLmlzQ29sbGVjdGlvbkFsbG93ZWQoY29sbGVjdGlvbiwgc3RyaWN0UGx1Z2luT25seSkpO1xuXHRcdGNvbnN0IGhhc1Vua25vd24gPSBjb2xsZWN0aW9ucy5zb21lKGMgPT4gYy5sYXp5ICYmIGMubGF6eS5pc0NhY2hlZCA9PT0gZmFsc2UpO1xuXHRcdHJldHVybiBoYXNVbmtub3duID8geyBzdGF0ZTogTGF6eUNvbGxlY3Rpb25TdGF0ZS5IYXNVbmtub3duLCBjb2xsZWN0aW9uczogY29sbGVjdGlvbnMuZmlsdGVyKGMgPT4gYy5sYXp5ICYmIGMubGF6eS5pc0NhY2hlZCA9PT0gZmFsc2UpIH0gOiB7IHN0YXRlOiBMYXp5Q29sbGVjdGlvblN0YXRlLkFsbEtub3duLCBjb2xsZWN0aW9uczogW10gfTtcblx0fSk7XG5cblx0cHVibGljIGdldCBkZWxlZ2F0ZXMoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSU1jcEhvc3REZWxlZ2F0ZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlbGVnYXRlcztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5wdXRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUlucHV0cyA9IHRoaXMuX29uRGlkQ2hhbmdlSW5wdXRzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTWNwU2FuZGJveFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwU2FuZGJveFNlcnZpY2U6IElNY3BTYW5kYm94U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21jcEFjY2Vzc1ZhbHVlID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUuQWxsLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fc3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24gPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsIHVuZGVmaW5lZCwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRGVsZWdhdGUoZGVsZWdhdGU6IElNY3BIb3N0RGVsZWdhdGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGVsZWdhdGVzID0gdGhpcy5fZGVsZWdhdGVzLmdldCgpLnNsaWNlKCk7XG5cdFx0ZGVsZWdhdGVzLnB1c2goZGVsZWdhdGUpO1xuXHRcdGRlbGVnYXRlcy5zb3J0KChhLCBiKSA9PiBiLnByaW9yaXR5IC0gYS5wcmlvcml0eSk7XG5cdFx0dGhpcy5fZGVsZWdhdGVzLnNldChkZWxlZ2F0ZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWxlZ2F0ZXMgPSB0aGlzLl9kZWxlZ2F0ZXMuZ2V0KCkuZmlsdGVyKGQgPT4gZCAhPT0gZGVsZWdhdGUpO1xuXHRcdFx0XHR0aGlzLl9kZWxlZ2F0ZXMuc2V0KGRlbGVnYXRlcywgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyQ29sbGVjdGlvbihjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBjdXJyZW50Q29sbGVjdGlvbnMgPSB0aGlzLl9jb2xsZWN0aW9ucy5nZXQoKTtcblx0XHRjb25zdCB0b1JlcGxhY2UgPSBjdXJyZW50Q29sbGVjdGlvbnMuZmluZChjID0+IGMuaWQgPT09IGNvbGxlY3Rpb24uaWQpO1xuXG5cdFx0Ly8gSW5jb21pbmcgY29sbGVjdGlvbnMgcmVwbGFjZSB0aGUgXCJsYXp5XCIgdmVyc2lvbnMuIFNlZSBgRXh0ZW5zaW9uTWNwRGlzY292ZXJ5YCBmb3IgYW4gZXhhbXBsZS5cblx0XHRpZiAodG9SZXBsYWNlICYmICF0b1JlcGxhY2UubGF6eSkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9IGVsc2UgaWYgKHRvUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5fY29sbGVjdGlvbnMuc2V0KGN1cnJlbnRDb2xsZWN0aW9ucy5tYXAoYyA9PiBjID09PSB0b1JlcGxhY2UgPyBjb2xsZWN0aW9uIDogYyksIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbGxlY3Rpb25zLnNldChbLi4uY3VycmVudENvbGxlY3Rpb25zLCBjb2xsZWN0aW9uXVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gYS5vcmRlciAtIGIub3JkZXIpLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRDb2xsZWN0aW9ucyA9IHRoaXMuX2NvbGxlY3Rpb25zLmdldCgpO1xuXHRcdFx0XHR0aGlzLl9jb2xsZWN0aW9ucy5zZXQoY3VycmVudENvbGxlY3Rpb25zLmZpbHRlcihjID0+IGMgIT09IGNvbGxlY3Rpb24pLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VydmVyRGVmaW5pdGlvbihjb2xsZWN0aW9uUmVmOiBNY3BEZWZpbml0aW9uUmVmZXJlbmNlLCBkZWZpbml0aW9uUmVmOiBNY3BEZWZpbml0aW9uUmVmZXJlbmNlKTogSU9ic2VydmFibGU8eyBzZXJ2ZXI6IE1jcFNlcnZlckRlZmluaXRpb24gfCB1bmRlZmluZWQ7IGNvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBjb2xsZWN0aW9uT2JzID0gdGhpcy5fY29sbGVjdGlvbnMubWFwKGNvbHMgPT4gY29scy5maW5kKGMgPT4gYy5pZCA9PT0gY29sbGVjdGlvblJlZi5pZCkpO1xuXHRcdHJldHVybiBjb2xsZWN0aW9uT2JzLm1hcCgoY29sbGVjdGlvbiwgcmVhZGVyKSA9PiB7XG5cdFx0XHRpZiAoY29sbGVjdGlvbiAmJiAhdGhpcy5pc0NvbGxlY3Rpb25BbGxvd2VkKGNvbGxlY3Rpb24sIHRoaXMuX3N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uLnJlYWQocmVhZGVyKSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgY29sbGVjdGlvbjogdW5kZWZpbmVkLCBzZXJ2ZXI6IHVuZGVmaW5lZCB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VydmVyID0gY29sbGVjdGlvbj8uc2VydmVyRGVmaW5pdGlvbnMucmVhZChyZWFkZXIpLmZpbmQocyA9PiBzLmlkID09PSBkZWZpbml0aW9uUmVmLmlkKTtcblx0XHRcdHJldHVybiB7IGNvbGxlY3Rpb24sIHNlcnZlciB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGRpc2NvdmVyQ29sbGVjdGlvbnMoKTogUHJvbWlzZTxNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbltdPiB7XG5cdFx0Y29uc3Qgc3RyaWN0UGx1Z2luT25seSA9IHRoaXMuX3N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uLmdldCgpO1xuXHRcdGNvbnN0IHRvRGlzY292ZXIgPSB0aGlzLl9jb2xsZWN0aW9ucy5nZXQoKS5maWx0ZXIoYyA9PiB0aGlzLmlzQ29sbGVjdGlvbkFsbG93ZWQoYywgc3RyaWN0UGx1Z2luT25seSkgJiYgYy5sYXp5ICYmICFjLmxhenkuaXNDYWNoZWQpO1xuXG5cdFx0dGhpcy5fb25nb2luZ0xhenlBY3RpdmF0aW9ucy5zZXQodGhpcy5fb25nb2luZ0xhenlBY3RpdmF0aW9ucy5nZXQoKSArIDEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodG9EaXNjb3Zlci5tYXAoYyA9PiBjLmxhenk/LmxvYWQoKSkpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25nb2luZ0xhenlBY3RpdmF0aW9ucy5zZXQodGhpcy5fb25nb2luZ0xhenlBY3RpdmF0aW9ucy5nZXQoKSAtIDEsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBmb3VuZDogTWNwQ29sbGVjdGlvbkRlZmluaXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9jb2xsZWN0aW9ucy5nZXQoKTtcblx0XHRmb3IgKGNvbnN0IGNvbGxlY3Rpb24gb2YgdG9EaXNjb3Zlcikge1xuXHRcdFx0Y29uc3QgcmVjID0gY3VycmVudC5maW5kKGMgPT4gYy5pZCA9PT0gY29sbGVjdGlvbi5pZCk7XG5cdFx0XHRpZiAoIXJlYykge1xuXHRcdFx0XHQvLyBpZ25vcmVkXG5cdFx0XHR9IGVsc2UgaWYgKHJlYy5sYXp5KSB7XG5cdFx0XHRcdHJlYy5sYXp5LnJlbW92ZWQ/LigpOyAvLyBkaWQgbm90IGdldCByZXBsYWNlZCBieSB0aGUgbm9uLWxhenkgdmVyc2lvblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm91bmQucHVzaChyZWMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0cmV0dXJuIGZvdW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW5wdXRTdG9yYWdlKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBNY3BSZWdpc3RyeUlucHV0U3RvcmFnZSB7XG5cdFx0cmV0dXJuIHNjb3BlID09PSBTdG9yYWdlU2NvcGUuV09SS1NQQUNFID8gdGhpcy5fd29ya3NwYWNlU3RvcmFnZS52YWx1ZSA6IHRoaXMuX3Byb2ZpbGVTdG9yYWdlLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW5wdXRTdG9yYWdlSW5Db25maWdUYXJnZXQoY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogTWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9nZXRJbnB1dFN0b3JhZ2UoXG5cdFx0XHRjb25maWdUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIHx8IGNvbmZpZ1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSXG5cdFx0XHRcdD8gU3RvcmFnZVNjb3BlLldPUktTUEFDRVxuXHRcdFx0XHQ6IFN0b3JhZ2VTY29wZS5QUk9GSUxFXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjbGVhclNhdmVkSW5wdXRzKHNjb3BlOiBTdG9yYWdlU2NvcGUsIGlucHV0SWQ/OiBzdHJpbmcpIHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5fZ2V0SW5wdXRTdG9yYWdlKHNjb3BlKTtcblx0XHRpZiAoaW5wdXRJZCkge1xuXHRcdFx0YXdhaXQgc3RvcmFnZS5jbGVhcihpbnB1dElkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RvcmFnZS5jbGVhckFsbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5wdXRzLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBlZGl0U2F2ZWRJbnB1dChpbnB1dElkOiBzdHJpbmcsIGZvbGRlckRhdGE6IElXb3Jrc3BhY2VGb2xkZXJEYXRhIHwgdW5kZWZpbmVkLCBjb25maWdTZWN0aW9uOiBzdHJpbmcsIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9nZXRJbnB1dFN0b3JhZ2VJbkNvbmZpZ1RhcmdldCh0YXJnZXQpO1xuXHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKGlucHV0SWQpO1xuXG5cdFx0Y29uc3Qgc3RvcmVkID0gYXdhaXQgc3RvcmFnZS5nZXRNYXAoKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHN0b3JlZFtpbnB1dElkXS52YWx1ZTtcblx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVXaXRoSW50ZXJhY3Rpb24oZm9sZGVyRGF0YSwgZXhwciwgY29uZmlnU2VjdGlvbiwgcHJldmlvdXMgPyB7IFtpbnB1dElkLnNsaWNlKDIsIC0xKV06IHByZXZpb3VzIH0gOiB7fSwgdGFyZ2V0KTtcblx0XHRhd2FpdCB0aGlzLl91cGRhdGVTdG9yYWdlV2l0aEV4cHJlc3Npb25JbnB1dHMoc3RvcmFnZSwgZXhwcik7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2V0U2F2ZWRJbnB1dChpbnB1dElkOiBzdHJpbmcsIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9nZXRJbnB1dFN0b3JhZ2VJbkNvbmZpZ1RhcmdldCh0YXJnZXQpO1xuXHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKGlucHV0SWQpO1xuXHRcdGZvciAoY29uc3QgdW5yZXNvbHZlZCBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0ZXhwci5yZXNvbHZlKHVucmVzb2x2ZWQsIHZhbHVlKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl91cGRhdGVTdG9yYWdlV2l0aEV4cHJlc3Npb25JbnB1dHMoc3RvcmFnZSwgZXhwcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2F2ZWRJbnB1dHMoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IFByb21pc2U8eyBbaWQ6IHN0cmluZ106IElSZXNvbHZlZFZhbHVlIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0SW5wdXRTdG9yYWdlKHNjb3BlKS5nZXRNYXAoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoZWNrVHJ1c3QoY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sIGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24sIHtcblx0XHR0cnVzdE5vbmNlQmVhcmVyLFxuXHRcdGludGVyYWN0aW9uLFxuXHRcdHByb21wdFR5cGUgPSAnb25seS1uZXcnLFxuXHRcdGF1dG9UcnVzdENoYW5nZXMgPSBmYWxzZSxcblx0XHRlcnJvck9uVXNlckludGVyYWN0aW9uID0gZmFsc2UsXG5cdH06IElNY3BSZXNvbHZlQ29ubmVjdGlvbk9wdGlvbnMpIHtcblx0XHRpZiAoY29sbGVjdGlvbi5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLldPUktTUEFDRSAmJiAhdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0aWYgKGVycm9yT25Vc2VySW50ZXJhY3Rpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ3dvcmtzcGFjZVRydXN0Jyk7XG5cdFx0XHR9IGVsc2UgaWYgKCFhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdydW5UcnVzdCcsIFwiVGhpcyBNQ1Agc2VydmVyIGRlZmluaXRpb24gaXMgZGVmaW5lZCBpbiB5b3VyIHdvcmtzcGFjZSBmaWxlcy5cIikgfSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjb2xsZWN0aW9uLnRydXN0QmVoYXZpb3IgPT09IE1jcFNlcnZlclRydXN0LktpbmQuVHJ1c3RlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTUNQIHNlcnZlciAke2RlZmluaXRpb24uaWR9IGlzIHRydXN0ZWQsIG5vIHRydXN0IHByb21wdCBuZWVkZWRgKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoY29sbGVjdGlvbi50cnVzdEJlaGF2aW9yID09PSBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlKSB7XG5cdFx0XHRpZiAoZGVmaW5pdGlvbi5jYWNoZU5vbmNlID09PSB0cnVzdE5vbmNlQmVhcmVyLnRydXN0ZWRBdE5vbmNlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE1DUCBzZXJ2ZXIgJHtkZWZpbml0aW9uLmlkfSBpcyB1bmNoYW5nZWQsIG5vIHRydXN0IHByb21wdCBuZWVkZWRgKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhdXRvVHJ1c3RDaGFuZ2VzKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE1DUCBzZXJ2ZXIgJHtkZWZpbml0aW9uLmlkfSBpcyB3YXMgY2hhbmdlZCBidXQgdXNlciBleHBsaWNpdGx5IGV4ZWN1dGVkYCk7XG5cdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSBkZWZpbml0aW9uLmNhY2hlTm9uY2U7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSA9PT0gbm90VHJ1c3RlZE5vbmNlKSB7XG5cdFx0XHRcdGlmIChwcm9tcHRUeXBlID09PSAnYWxsLXVudHJ1c3RlZCcpIHtcblx0XHRcdFx0XHRpZiAoZXJyb3JPblVzZXJJbnRlcmFjdGlvbikge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ3NlcnZlclRydXN0Jyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9wcm9tcHRGb3JUcnVzdChkZWZpbml0aW9uLCBjb2xsZWN0aW9uLCBpbnRlcmFjdGlvbiwgdHJ1c3ROb25jZUJlYXJlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTUNQIHNlcnZlciAke2RlZmluaXRpb24uaWR9IGlzIHVudHJ1c3RlZCwgZGVueWluZyB0cnVzdCBwcm9tcHRgKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb21wdFR5cGUgPT09ICduZXZlcicpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTUNQIHNlcnZlciAke2RlZmluaXRpb24uaWR9IHRydXN0IHN0YXRlIGlzIHVua25vd24sIHNraXBwaW5nIHByb21wdGApO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlcnJvck9uVXNlckludGVyYWN0aW9uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yKCdzZXJ2ZXJUcnVzdCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaWRUcnVzdCA9IGF3YWl0IHRoaXMuX3Byb21wdEZvclRydXN0KGRlZmluaXRpb24sIGNvbGxlY3Rpb24sIGludGVyYWN0aW9uLCB0cnVzdE5vbmNlQmVhcmVyKTtcblx0XHRcdGlmIChkaWRUcnVzdCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChkaWRUcnVzdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSBub3RUcnVzdGVkTm9uY2U7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydE5ldmVyKGNvbGxlY3Rpb24udHJ1c3RCZWhhdmlvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHJvbXB0Rm9yVHJ1c3QoZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiwgY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sIGludGVyYWN0aW9uOiBNY3BTdGFydFNlcnZlckludGVyYWN0aW9uIHwgdW5kZWZpbmVkLCB0cnVzdE5vbmNlQmVhcmVyOiB7IHRydXN0ZWRBdE5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGludGVyYWN0aW9uID8/PSBuZXcgTWNwU3RhcnRTZXJ2ZXJJbnRlcmFjdGlvbigpO1xuXHRcdGludGVyYWN0aW9uLnBhcnRpY2lwYW50cy5zZXQoZGVmaW5pdGlvbi5pZCwgeyBzOiAnd2FpdGluZycsIGRlZmluaXRpb24sIGNvbGxlY3Rpb24gfSk7XG5cblx0XHRjb25zdCB0cnVzdGVkRGVmaW5pdGlvbklkcyA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGF1dG9ydW5TZWxmRGlzcG9zYWJsZShyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBtYXAgPSBpbnRlcmFjdGlvbi5wYXJ0aWNpcGFudHMub2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChJdGVyYWJsZS5zb21lKG1hcC52YWx1ZXMoKSwgcCA9PiBwLnMgPT09ICd1bmtub3duJykpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIHdhaXQgdG8gZ2F0aGVyIGFsbCBjYWxsc1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVhZGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0aW50ZXJhY3Rpb24uY2hvaWNlID8/PSB0aGlzLl9wcm9tcHRGb3JUcnVzdE9wZW5EaWFsb2coXG5cdFx0XHRcdFx0Wy4uLm1hcC52YWx1ZXMoKV0ubWFwKCh2KSA9PiB2LnMgPT09ICd3YWl0aW5nJyA/IHYgOiB1bmRlZmluZWQpLmZpbHRlcihpc0RlZmluZWQpLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXNvbHZlKGludGVyYWN0aW9uLmNob2ljZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE1DUCB0cnVzdGVkIHNlcnZlcnM6YCwgdHJ1c3RlZERlZmluaXRpb25JZHMpO1xuXG5cdFx0aWYgKHRydXN0ZWREZWZpbml0aW9uSWRzKSB7XG5cdFx0XHR0cnVzdE5vbmNlQmVhcmVyLnRydXN0ZWRBdE5vbmNlID0gdHJ1c3RlZERlZmluaXRpb25JZHMuaW5jbHVkZXMoZGVmaW5pdGlvbi5pZClcblx0XHRcdFx0PyBkZWZpbml0aW9uLmNhY2hlTm9uY2Vcblx0XHRcdFx0OiBub3RUcnVzdGVkTm9uY2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhdHJ1c3RlZERlZmluaXRpb25JZHM/LmluY2x1ZGVzKGRlZmluaXRpb24uaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbmZpcm1zIHdpdGggdGhlIHVzZXIgd2hpY2ggb2YgdGhlIHByb3ZpZGVkIGRlZmluaXRpb25zIHNob3VsZCBiZSB0cnVzdGVkLlxuXHQgKiBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGUgdXNlciBjYW5jZWxsZWQgdGhlIGZsb3csIG9yIHRoZSBsaXN0IG9mIHRydXN0ZWRcblx0ICogZGVmaW5pdGlvbiBJRHMgb3RoZXJ3aXNlLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFzeW5jIF9wcm9tcHRGb3JUcnVzdE9wZW5EaWFsb2coZGVmaW5pdGlvbnM6IHsgZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbjsgY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24gfVtdKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGZ1bmN0aW9uIGxhYmVsRm9yKHI6IHsgZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbjsgY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24gfSkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luVVJJID0gci5kZWZpbml0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luPy51cmkgfHwgci5jb2xsZWN0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luO1xuXHRcdFx0bGV0IGxhYmVsV2l0aE9yaWdpbiA9IG9yaWdpblVSSSA/IGBbXFxgJHtyLmRlZmluaXRpb24ubGFiZWx9XFxgXSgke29yaWdpblVSSX0pYCA6ICdgJyArIHIuZGVmaW5pdGlvbi5sYWJlbCArICdgJztcblxuXHRcdFx0aWYgKHIuY29sbGVjdGlvbi5zb3VyY2UgaW5zdGFuY2VvZiBFeHRlbnNpb25JZGVudGlmaWVyKSB7XG5cdFx0XHRcdGxhYmVsV2l0aE9yaWdpbiArPSBgICgke2xvY2FsaXplKCd0cnVzdEZyb21FeHQnLCAnZnJvbSB7MH0nLCByLmNvbGxlY3Rpb24uc291cmNlLnZhbHVlKX0pYDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGxhYmVsV2l0aE9yaWdpbjtcblx0XHR9XG5cblx0XHRpZiAoZGVmaW5pdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBkZWYgPSBkZWZpbml0aW9uc1swXTtcblx0XHRcdGNvbnN0IG9yaWdpblVSSSA9IGRlZi5kZWZpbml0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luPy51cmk7XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0cnVzdFRpdGxlV2l0aE9yaWdpbicsICdUcnVzdCBhbmQgcnVuIE1DUCBzZXJ2ZXIgezB9PycsIGRlZi5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0XHRjdXN0b206IHtcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uc2hpZWxkLFxuXHRcdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdFx0XHRtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdtY3AudHJ1c3QuZGV0YWlscycsICdUaGUgTUNQIHNlcnZlciB7MH0gd2FzIHVwZGF0ZWQuIE1DUCBzZXJ2ZXJzIG1heSBhZGQgY29udGV4dCB0byB5b3VyIGNoYXQgc2Vzc2lvbiBhbmQgbGVhZCB0byB1bmV4cGVjdGVkIGJlaGF2aW9yLiBEbyB5b3Ugd2FudCB0byB0cnVzdCBhbmQgcnVuIHRoaXMgc2VydmVyPycsIGxhYmVsRm9yKGRlZikpKSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uSGFuZGxlcjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBvcmlnaW5VUkkhIH0sIEFVWF9XSU5ET1dfR1JPVVApO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBlZGl0b3IudGhlbihCb29sZWFuKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRydXN0LnllcycsICdUcnVzdCcpLCBydW46ICgpID0+IHRydWUgfSxcblx0XHRcdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtY3AudHJ1c3Qubm8nLCAnRG8gbm90IHRydXN0JyksIHJ1bjogKCkgPT4gZmFsc2UgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiAocmVzdWx0ID8gW2RlZi5kZWZpbml0aW9uLmlkXSA6IFtdKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaXN0ID0gZGVmaW5pdGlvbnMubWFwKGQgPT4gYC0gJHtsYWJlbEZvcihkKX1gKS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5wcm9tcHQoXG5cdFx0XHR7XG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0cnVzdFRpdGxlV2l0aE9yaWdpbk11bHRpJywgJ1RydXN0IGFuZCBydW4gezB9IE1DUCBzZXJ2ZXJzPycsIGRlZmluaXRpb25zLmxlbmd0aCksXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdGljb246IENvZGljb24uc2hpZWxkLFxuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3tcblx0XHRcdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ21jcC50cnVzdC5kZXRhaWxzTXVsdGknLCAnU2V2ZXJhbCB1cGRhdGVkIE1DUCBzZXJ2ZXJzIHdlcmUgZGlzY292ZXJlZDpcXG5cXG57MH1cXG5cXG4gTUNQIHNlcnZlcnMgbWF5IGFkZCBjb250ZXh0IHRvIHlvdXIgY2hhdCBzZXNzaW9uIGFuZCBsZWFkIHRvIHVuZXhwZWN0ZWQgYmVoYXZpb3IuIERvIHlvdSB3YW50IHRvIHRydXN0IGFuZCBydW4gdGhlc2Ugc2VydmVyPycsIGxpc3QpKSxcblx0XHRcdFx0XHRcdGFjdGlvbkhhbmRsZXI6ICh1cmkpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5wYXJzZSh1cmkpIH0sIEFVWF9XSU5ET1dfR1JPVVApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yLnRoZW4oQm9vbGVhbik7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRydXN0LnllcycsICdUcnVzdCcpLCBydW46ICgpID0+ICdhbGwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ21jcC50cnVzdC5waWNrJywgJ1BpY2sgVHJ1c3RlZCcpLCBydW46ICgpID0+ICdwaWNrJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtY3AudHJ1c3Qubm8nLCAnRG8gbm90IHRydXN0JyksIHJ1bjogKCkgPT4gJ25vbmUnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChyZXN1bHQgPT09ICdhbGwnKSB7XG5cdFx0XHRyZXR1cm4gZGVmaW5pdGlvbnMubWFwKGQgPT4gZC5kZWZpbml0aW9uLmlkKTtcblx0XHR9IGVsc2UgaWYgKHJlc3VsdCA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dHlwZSBBY3Rpb25hYmxlQnV0dG9uID0gSVF1aWNrSW5wdXRCdXR0b24gJiB7IGFjdGlvbjogKCkgPT4gdm9pZCB9O1xuXHRcdGZ1bmN0aW9uIGlzQWN0aW9uYWJsZUJ1dHRvbihvYmo6IElRdWlja0lucHV0QnV0dG9uKTogb2JqIGlzIEFjdGlvbmFibGVCdXR0b24ge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiAob2JqIGFzIEFjdGlvbmFibGVCdXR0b24pLmFjdGlvbiA9PT0gJ2Z1bmN0aW9uJztcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrZXIgPSBzdG9yZS5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtICYgeyBkZWZpbml0b25JZDogc3RyaW5nIH0+KHsgdXNlU2VwYXJhdG9yczogZmFsc2UgfSkpO1xuXHRcdHBpY2tlci5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRwaWNrZXIuaXRlbXMgPSBkZWZpbml0aW9ucy5tYXAoKHsgZGVmaW5pdGlvbiwgY29sbGVjdGlvbiB9KSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b25zOiBBY3Rpb25hYmxlQnV0dG9uW10gPSBbXTtcblx0XHRcdGlmIChkZWZpbml0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbiA9IGRlZmluaXRpb24ucHJlc2VudGF0aW9uLm9yaWdpbjtcblx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRpY29uQ2xhc3M6ICdjb2RpY29uLWdvLXRvLWZpbGUnLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICdHbyB0byBEZWZpbml0aW9uJyxcblx0XHRcdFx0XHRhY3Rpb246ICgpID0+IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBvcmlnaW4udXJpLCBvcHRpb25zOiB7IHNlbGVjdGlvbjogb3JpZ2luLnJhbmdlIH0gfSlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdpdGVtJyxcblx0XHRcdFx0bGFiZWw6IGRlZmluaXRpb24ubGFiZWwsXG5cdFx0XHRcdGRlZmluaXRvbklkOiBkZWZpbml0aW9uLmlkLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogY29sbGVjdGlvbi5zb3VyY2UgaW5zdGFuY2VvZiBFeHRlbnNpb25JZGVudGlmaWVyXG5cdFx0XHRcdFx0PyBjb2xsZWN0aW9uLnNvdXJjZS52YWx1ZVxuXHRcdFx0XHRcdDogKGRlZmluaXRpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4gPyB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGVmaW5pdGlvbi5wcmVzZW50YXRpb24ub3JpZ2luLnVyaSkgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRwaWNrZWQ6IGZhbHNlLFxuXHRcdFx0XHRidXR0b25zXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9ICdTZWxlY3QgTUNQIHNlcnZlcnMgdG8gdHJ1c3QnO1xuXHRcdHBpY2tlci5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oZSA9PiB7XG5cdFx0XHRpZiAoaXNBY3Rpb25hYmxlQnV0dG9uKGUuYnV0dG9uKSkge1xuXHRcdFx0XHRlLmJ1dHRvbi5hY3Rpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGlja2VyLnNlbGVjdGVkSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5kZWZpbml0b25JZCkpO1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRwaWNrZXIuc2hvdygpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVN0b3JhZ2VXaXRoRXhwcmVzc2lvbklucHV0cyhpbnB1dFN0b3JhZ2U6IE1jcFJlZ2lzdHJ5SW5wdXRTdG9yYWdlLCBleHByOiBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uPHVua25vd24+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VjcmV0czogUmVjb3JkPHN0cmluZywgSVJlc29sdmVkVmFsdWU+ID0ge307XG5cdFx0Y29uc3QgaW5wdXRzOiBSZWNvcmQ8c3RyaW5nLCBJUmVzb2x2ZWRWYWx1ZT4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtyZXBsYWNlbWVudCwgcmVzb2x2ZWRdIG9mIGV4cHIucmVzb2x2ZWQoKSkge1xuXHRcdFx0aWYgKHJlc29sdmVkLmlucHV0Py50eXBlID09PSAncHJvbXB0U3RyaW5nJyAmJiByZXNvbHZlZC5pbnB1dC5wYXNzd29yZCkge1xuXHRcdFx0XHRzZWNyZXRzW3JlcGxhY2VtZW50LmlkXSA9IHJlc29sdmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5wdXRzW3JlcGxhY2VtZW50LmlkXSA9IHJlc29sdmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlucHV0U3RvcmFnZS5zZXRQbGFpblRleHQoaW5wdXRzKTtcblx0XHRhd2FpdCBpbnB1dFN0b3JhZ2Uuc2V0U2VjcmV0cyhzZWNyZXRzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUlucHV0cy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXBsYWNlVmFyaWFibGVzSW5MYXVuY2goZGVsZWdhdGU6IElNY3BIb3N0RGVsZWdhdGUsIGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24sIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoLCBlcnJvck9uVXNlckludGVyYWN0aW9uPzogYm9vbGVhbikge1xuXHRcdGlmICghZGVmaW5pdGlvbi52YXJpYWJsZVJlcGxhY2VtZW50KSB7XG5cdFx0XHRyZXR1cm4gbGF1bmNoO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc2VjdGlvbiwgdGFyZ2V0LCBmb2xkZXIgfSA9IGRlZmluaXRpb24udmFyaWFibGVSZXBsYWNlbWVudDtcblx0XHRjb25zdCBpbnB1dFN0b3JhZ2UgPSB0aGlzLl9nZXRJbnB1dFN0b3JhZ2VJbkNvbmZpZ1RhcmdldCh0YXJnZXQpO1xuXHRcdGNvbnN0IFtwcmV2aW91c2x5U3RvcmVkLCB3aXRoUmVtb3RlRmlsbGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGlucHV0U3RvcmFnZS5nZXRNYXAoKSxcblx0XHRcdGRlbGVnYXRlLnN1YnN0aXR1dGVWYXJpYWJsZXMoZGVmaW5pdGlvbiwgbGF1bmNoKSxcblx0XHRdKTtcblxuXHRcdC8vIHByZS1maWxsIHRoZSB2YXJpYWJsZXMgd2UgYWxyZWFkeSByZXNvbHZlZCB0byBhdm9pZCBleHRyYSBwcm9tcHRpbmdcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSh3aXRoUmVtb3RlRmlsbGVkKTtcblx0XHRmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIGV4cHIudW5yZXNvbHZlZCgpKSB7XG5cdFx0XHRpZiAocHJldmlvdXNseVN0b3JlZC5oYXNPd25Qcm9wZXJ0eShyZXBsYWNlbWVudC5pZCkpIHtcblx0XHRcdFx0ZXhwci5yZXNvbHZlKHJlcGxhY2VtZW50LCBwcmV2aW91c2x5U3RvcmVkW3JlcGxhY2VtZW50LmlkXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlcmUgYXJlIHN0aWxsIHVucmVzb2x2ZWQgdmFyaWFibGVzIHRoYXQgd291bGQgcmVxdWlyZSBpbnRlcmFjdGlvblxuXHRcdGlmIChlcnJvck9uVXNlckludGVyYWN0aW9uKSB7XG5cdFx0XHRjb25zdCB1bnJlc29sdmVkID0gQXJyYXkuZnJvbShleHByLnVucmVzb2x2ZWQoKSk7XG5cdFx0XHRpZiAodW5yZXNvbHZlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yKCd2YXJpYWJsZXMnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gcmVzb2x2ZSB2YXJpYWJsZXMgcmVxdWlyaW5nIHVzZXIgaW5wdXRcblx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVXaXRoSW50ZXJhY3Rpb24oZm9sZGVyLCBleHByLCBzZWN0aW9uLCB1bmRlZmluZWQsIHRhcmdldCk7XG5cblx0XHRhd2FpdCB0aGlzLl91cGRhdGVTdG9yYWdlV2l0aEV4cHJlc3Npb25JbnB1dHMoaW5wdXRTdG9yYWdlLCBleHByKTtcblxuXHRcdC8vIHJlc29sdmUgb3RoZXIgbm9uLWludGVyYWN0aXZlIHZhcmlhYmxlcywgcmV0dXJuaW5nIHRoZSBmaW5hbCBvYmplY3Rcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZlQXN5bmMoZm9sZGVyLCBleHByKTtcblx0fVxuXG5cdHByaXZhdGUgaXNDb2xsZWN0aW9uQWxsb3dlZChjb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgc3RyaWN0UGx1Z2luT25seTogU3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIWlzU3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb25FbmFibGVkKHN0cmljdFBsdWdpbk9ubHkpXG5cdFx0XHR8fCBjb2xsZWN0aW9uLnByb3ZlbmFuY2UgPT09IE1jcENvbGxlY3Rpb25Qcm92ZW5hbmNlLlBsdWdpbjtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlQ29ubmVjdGlvbihvcHRzOiBJTWNwUmVzb2x2ZUNvbm5lY3Rpb25PcHRpb25zKTogUHJvbWlzZTxJTWNwU2VydmVyQ29ubmVjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgY29sbGVjdGlvblJlZiwgZGVmaW5pdGlvblJlZiwgaW50ZXJhY3Rpb24sIGxvZ2dlciwgZGVidWcgfSA9IG9wdHM7XG5cdFx0bGV0IGNvbGxlY3Rpb24gPSB0aGlzLl9jb2xsZWN0aW9ucy5nZXQoKS5maW5kKGMgPT4gYy5pZCA9PT0gY29sbGVjdGlvblJlZi5pZCk7XG5cdFx0aWYgKGNvbGxlY3Rpb24gJiYgIXRoaXMuaXNDb2xsZWN0aW9uQWxsb3dlZChjb2xsZWN0aW9uLCB0aGlzLl9zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbi5nZXQoKSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTUNQIGNvbGxlY3Rpb24gJHtjb2xsZWN0aW9uUmVmLmlkfSBpcyBibG9ja2VkIGJ5IGVudGVycHJpc2UgY3VzdG9taXphdGlvbiBwb2xpY3lgKTtcblx0XHR9XG5cdFx0aWYgKGNvbGxlY3Rpb24/LmxhenkpIHtcblx0XHRcdGF3YWl0IGNvbGxlY3Rpb24ubGF6eS5sb2FkKCk7XG5cdFx0XHRjb2xsZWN0aW9uID0gdGhpcy5fY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IGNvbGxlY3Rpb25SZWYuaWQpO1xuXHRcdH1cblx0XHRpZiAoY29sbGVjdGlvbiAmJiAhdGhpcy5pc0NvbGxlY3Rpb25BbGxvd2VkKGNvbGxlY3Rpb24sIHRoaXMuX3N0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uLmdldCgpKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNQ1AgY29sbGVjdGlvbiAke2NvbGxlY3Rpb25SZWYuaWR9IGlzIGJsb2NrZWQgYnkgZW50ZXJwcmlzZSBjdXN0b21pemF0aW9uIHBvbGljeWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmluaXRpb24gPSBjb2xsZWN0aW9uPy5zZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKS5maW5kKHMgPT4gcy5pZCA9PT0gZGVmaW5pdGlvblJlZi5pZCk7XG5cdFx0aWYgKCFjb2xsZWN0aW9uIHx8ICFkZWZpbml0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvbGxlY3Rpb24gb3IgZGVmaW5pdGlvbiBub3QgZm91bmQgZm9yICR7Y29sbGVjdGlvblJlZi5pZH0gYW5kICR7ZGVmaW5pdGlvblJlZi5pZH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2RlbGVnYXRlcy5nZXQoKS5maW5kKGQgPT4gZC5jYW5TdGFydChjb2xsZWN0aW9uLCBkZWZpbml0aW9uKSk7XG5cdFx0aWYgKCFkZWxlZ2F0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBkZWxlZ2F0ZSBmb3VuZCB0aGF0IGNhbiBoYW5kbGUgdGhlIGNvbm5lY3Rpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCB0cnVzdGVkID0gYXdhaXQgdGhpcy5fY2hlY2tUcnVzdChjb2xsZWN0aW9uLCBkZWZpbml0aW9uLCBvcHRzKTtcblx0XHRpbnRlcmFjdGlvbj8ucGFydGljaXBhbnRzLnNldChkZWZpbml0aW9uLmlkLCB7IHM6ICdyZXNvbHZlZCcgfSk7XG5cdFx0aWYgKCF0cnVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBsYXVuY2g6IE1jcFNlcnZlckxhdW5jaCB8IHVuZGVmaW5lZCA9IGRlZmluaXRpb24ubGF1bmNoO1xuXHRcdGlmIChjb2xsZWN0aW9uLnJlc29sdmVTZXJ2ZXJMYW5jaCkge1xuXHRcdFx0bGF1bmNoID0gYXdhaXQgY29sbGVjdGlvbi5yZXNvbHZlU2VydmVyTGFuY2goZGVmaW5pdGlvbik7XG5cdFx0XHRpZiAoIWxhdW5jaCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBpbnRlcmFjdGlvbiBjYW5jZWxsZWQgYnkgdXNlclxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRsYXVuY2ggPSBhd2FpdCB0aGlzLl9yZXBsYWNlVmFyaWFibGVzSW5MYXVuY2goZGVsZWdhdGUsIGRlZmluaXRpb24sIGxhdW5jaCwgb3B0cy5lcnJvck9uVXNlckludGVyYWN0aW9uKTtcblxuXHRcdFx0aWYgKGRlZmluaXRpb24uZGV2TW9kZSAmJiBkZWJ1Zykge1xuXHRcdFx0XHRsYXVuY2ggPSBhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSU1jcERldk1vZGVEZWJ1Z2dpbmcpLnRyYW5zZm9ybShkZWZpbml0aW9uLCBsYXVuY2ghKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiBzYW5kYm94IGlzIGVuYWJsZWQgZm9yIHRoaXMgc2VydmVyLCBhdHRlbXB0IHRvIGxhdW5jaCBpbiBzYW5kYm94XG5cdFx0XHRsYXVuY2ggPSBhd2FpdCB0aGlzLl9tY3BTYW5kYm94U2VydmljZS5sYXVuY2hJblNhbmRib3hJZkVuYWJsZWQoZGVmaW5pdGlvbiwgbGF1bmNoLCBjb2xsZWN0aW9uLnJlbW90ZUF1dGhvcml0eSA/PyB1bmRlZmluZWQsIGNvbGxlY3Rpb24uY29uZmlnVGFyZ2V0KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AubGF1bmNoRXJyb3InLCAnRXJyb3Igc3RhcnRpbmcgezB9OiB7MX0nLCBkZWZpbml0aW9uLmxhYmVsLCBTdHJpbmcoZSkpLFxuXHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogY29sbGVjdGlvbi5wcmVzZW50YXRpb24/Lm9yaWdpbiAmJiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiAnbWNwLmxhdW5jaEVycm9yLm9wZW5Db25maWcnLFxuXHRcdFx0XHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AubGF1bmNoRXJyb3Iub3BlbkNvbmZpZycsICdPcGVuIENvbmZpZ3VyYXRpb24nKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBjb2xsZWN0aW9uLnByZXNlbnRhdGlvbiEub3JpZ2luLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHsgc2VsZWN0aW9uOiBkZWZpbml0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luPy5yYW5nZSB9XG5cdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRkZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRsYXVuY2gsXG5cdFx0XHRsb2dnZXIsXG5cdFx0XHRvcHRzLmVycm9yT25Vc2VySW50ZXJhY3Rpb24sXG5cdFx0XHRvcHRzLnRhc2tNYW5hZ2VyLFxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLFNBQXNCLGlCQUFpQiw2QkFBNkI7QUFDN0UsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTRCLDBCQUEwQztBQUN0RSxTQUFTLGNBQWMscUJBQXFCO0FBRTVDLFNBQVMsa0NBQWtDLHFDQUFxQztBQUNoRixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVDQUF1RDtBQUNoRSxTQUFTLGtCQUFrQixzQkFBc0I7QUFDakQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBK0IscUJBQThDLHlCQUF1RixnQkFBZ0Is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
