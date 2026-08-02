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
import { Barrier } from "../../../base/common/async.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { Event, Emitter } from "../../../base/common/event.js";
import { observableValue, observableValueOpts, transaction } from "../../../base/common/observable.js";
import { DisposableStore, combinedDisposable, dispose, Disposable } from "../../../base/common/lifecycle.js";
import { ISCMService, ISCMViewService } from "../../contrib/scm/common/scm.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IQuickDiffService } from "../../contrib/scm/common/quickDiff.js";
import { ResourceTree } from "../../../base/common/resourceTree.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { basename } from "../../../base/common/resources.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ITextModelService } from "../../../editor/common/services/resolverService.js";
import { Schemas } from "../../../base/common/network.js";
import { structuralEquals } from "../../../base/common/equals.js";
import { historyItemBaseRefColor, historyItemRefColor, historyItemRemoteRefColor } from "../../contrib/scm/browser/scmHistory.js";
function getIconFromIconDto(iconDto) {
  if (iconDto === void 0) {
    return void 0;
  } else if (ThemeIcon.isThemeIcon(iconDto)) {
    return iconDto;
  } else if (isUriComponents(iconDto)) {
    return URI.revive(iconDto);
  } else {
    const icon = iconDto;
    return { light: URI.revive(icon.light), dark: URI.revive(icon.dark) };
  }
}
function toISCMHistoryItem(historyItemDto) {
  const authorIcon = getIconFromIconDto(historyItemDto.authorIcon);
  const references = historyItemDto.references?.map((r) => ({
    ...r,
    icon: getIconFromIconDto(r.icon)
  }));
  return { ...historyItemDto, authorIcon, references };
}
function toISCMHistoryItemRef(historyItemRefDto, color) {
  return historyItemRefDto ? { ...historyItemRefDto, icon: getIconFromIconDto(historyItemRefDto.icon), color } : void 0;
}
class SCMInputBoxContentProvider extends Disposable {
  constructor(textModelService, modelService, languageService) {
    super();
    this.modelService = modelService;
    this.languageService = languageService;
    this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeSourceControl, this));
  }
  async provideTextContent(resource) {
    const existing = this.modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    return this.modelService.createModel("", this.languageService.createById("scminput"), resource);
  }
}
class MainThreadSCMResourceGroup {
  constructor(sourceControlHandle, handle, provider, features, label, id, multiDiffEditorEnableViewChanges, _uriIdentService) {
    this.sourceControlHandle = sourceControlHandle;
    this.handle = handle;
    this.provider = provider;
    this.features = features;
    this.label = label;
    this.id = id;
    this.multiDiffEditorEnableViewChanges = multiDiffEditorEnableViewChanges;
    this._uriIdentService = _uriIdentService;
    this.resources = [];
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._onDidChangeResources = new Emitter();
    this.onDidChangeResources = this._onDidChangeResources.event;
  }
  get resourceTree() {
    if (!this._resourceTree) {
      const rootUri = this.provider.rootUri ?? URI.file("/");
      this._resourceTree = new ResourceTree(this, rootUri, this._uriIdentService.extUri);
      for (const resource of this.resources) {
        this._resourceTree.add(resource.sourceUri, resource);
      }
    }
    return this._resourceTree;
  }
  get hideWhenEmpty() {
    return !!this.features.hideWhenEmpty;
  }
  get contextValue() {
    return this.features.contextValue;
  }
  toJSON() {
    return {
      $mid: MarshalledId.ScmResourceGroup,
      sourceControlHandle: this.sourceControlHandle,
      groupHandle: this.handle
    };
  }
  splice(start, deleteCount, toInsert) {
    this.resources.splice(start, deleteCount, ...toInsert);
    this._resourceTree = void 0;
    this._onDidChangeResources.fire();
  }
  $updateGroup(features) {
    this.features = { ...this.features, ...features };
    this._onDidChange.fire();
  }
  $updateGroupLabel(label) {
    this.label = label;
    this._onDidChange.fire();
  }
}
class MainThreadSCMResource {
  constructor(proxy, sourceControlHandle, groupHandle, handle, sourceUri, resourceGroup, decorations, contextValue, command, multiDiffEditorOriginalUri, multiDiffEditorModifiedUri) {
    this.proxy = proxy;
    this.sourceControlHandle = sourceControlHandle;
    this.groupHandle = groupHandle;
    this.handle = handle;
    this.sourceUri = sourceUri;
    this.resourceGroup = resourceGroup;
    this.decorations = decorations;
    this.contextValue = contextValue;
    this.command = command;
    this.multiDiffEditorOriginalUri = multiDiffEditorOriginalUri;
    this.multiDiffEditorModifiedUri = multiDiffEditorModifiedUri;
  }
  open(preserveFocus) {
    return this.proxy.$executeResourceCommand(this.sourceControlHandle, this.groupHandle, this.handle, preserveFocus);
  }
  toJSON() {
    return {
      $mid: MarshalledId.ScmResource,
      sourceControlHandle: this.sourceControlHandle,
      groupHandle: this.groupHandle,
      handle: this.handle
    };
  }
}
class MainThreadSCMArtifactProvider {
  constructor(proxy, handle) {
    this.proxy = proxy;
    this.handle = handle;
    this._onDidChangeArtifacts = new Emitter();
    this.onDidChangeArtifacts = this._onDidChangeArtifacts.event;
    this._disposables = new DisposableStore();
    this._disposables.add(this._onDidChangeArtifacts);
  }
  async provideArtifactGroups(token) {
    const artifactGroups = await this.proxy.$provideArtifactGroups(this.handle, token ?? CancellationToken.None);
    return artifactGroups?.map((group) => ({ ...group, icon: getIconFromIconDto(group.icon) }));
  }
  async provideArtifacts(group, token) {
    const artifacts = await this.proxy.$provideArtifacts(this.handle, group, token ?? CancellationToken.None);
    return artifacts?.map((artifact) => ({ ...artifact, icon: getIconFromIconDto(artifact.icon) }));
  }
  $onDidChangeArtifacts(groups) {
    this._onDidChangeArtifacts.fire(groups);
  }
  dispose() {
    this._disposables.dispose();
  }
}
class MainThreadSCMHistoryProvider {
  constructor(proxy, handle) {
    this.proxy = proxy;
    this.handle = handle;
    this._historyItemRef = observableValueOpts({
      owner: this,
      equalsFn: structuralEquals
    }, void 0);
    this._historyItemRemoteRef = observableValueOpts({
      owner: this,
      equalsFn: structuralEquals
    }, void 0);
    this._historyItemBaseRef = observableValueOpts({
      owner: this,
      equalsFn: structuralEquals
    }, void 0);
    this._historyItemRefChanges = observableValue(this, { added: [], modified: [], removed: [], silent: false });
  }
  get historyItemRef() {
    return this._historyItemRef;
  }
  get historyItemRemoteRef() {
    return this._historyItemRemoteRef;
  }
  get historyItemBaseRef() {
    return this._historyItemBaseRef;
  }
  get historyItemRefChanges() {
    return this._historyItemRefChanges;
  }
  async resolveHistoryItem(historyItemId, token) {
    const historyItem = await this.proxy.$resolveHistoryItem(this.handle, historyItemId, token ?? CancellationToken.None);
    return historyItem ? toISCMHistoryItem(historyItem) : void 0;
  }
  async resolveHistoryItemChatContext(historyItemId, token) {
    return this.proxy.$resolveHistoryItemChatContext(this.handle, historyItemId, token ?? CancellationToken.None);
  }
  async resolveHistoryItemChangeRangeChatContext(historyItemId, historyItemParentId, path, token) {
    return this.proxy.$resolveHistoryItemChangeRangeChatContext(this.handle, historyItemId, historyItemParentId, path, token ?? CancellationToken.None);
  }
  async resolveHistoryItemRefsCommonAncestor(historyItemRefs, token) {
    return this.proxy.$resolveHistoryItemRefsCommonAncestor(this.handle, historyItemRefs, token ?? CancellationToken.None);
  }
  async provideHistoryItemRefs(historyItemsRefs, token) {
    const historyItemRefs = await this.proxy.$provideHistoryItemRefs(this.handle, historyItemsRefs, token ?? CancellationToken.None);
    return historyItemRefs?.map((ref) => ({ ...ref, icon: getIconFromIconDto(ref.icon) }));
  }
  async provideHistoryItems(options, token) {
    const historyItems = await this.proxy.$provideHistoryItems(this.handle, options, token ?? CancellationToken.None);
    return historyItems?.map((historyItem) => toISCMHistoryItem(historyItem));
  }
  async provideHistoryItemChanges(historyItemId, historyItemParentId, token) {
    const changes = await this.proxy.$provideHistoryItemChanges(this.handle, historyItemId, historyItemParentId, token ?? CancellationToken.None);
    return changes?.map((change) => ({
      uri: URI.revive(change.uri),
      originalUri: change.originalUri && URI.revive(change.originalUri),
      modifiedUri: change.modifiedUri && URI.revive(change.modifiedUri)
    }));
  }
  $onDidChangeCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef) {
    transaction((tx) => {
      this._historyItemRef.set(toISCMHistoryItemRef(historyItemRef, historyItemRefColor), tx);
      this._historyItemRemoteRef.set(toISCMHistoryItemRef(historyItemRemoteRef, historyItemRemoteRefColor), tx);
      this._historyItemBaseRef.set(toISCMHistoryItemRef(historyItemBaseRef, historyItemBaseRefColor), tx);
    });
  }
  $onDidChangeHistoryItemRefs(historyItemRefs) {
    const added = historyItemRefs.added.map((ref) => toISCMHistoryItemRef(ref));
    const modified = historyItemRefs.modified.map((ref) => toISCMHistoryItemRef(ref));
    const removed = historyItemRefs.removed.map((ref) => toISCMHistoryItemRef(ref));
    this._historyItemRefChanges.set({ added, modified, removed, silent: historyItemRefs.silent }, void 0);
  }
}
class MainThreadSCMProvider {
  constructor(proxy, _handle, _parentHandle, _providerId, _label, _rootUri, _iconPath, _isHidden, _inputBoxTextModel, _quickDiffService, _uriIdentService, _workspaceContextService) {
    this.proxy = proxy;
    this._handle = _handle;
    this._parentHandle = _parentHandle;
    this._providerId = _providerId;
    this._label = _label;
    this._rootUri = _rootUri;
    this._iconPath = _iconPath;
    this._isHidden = _isHidden;
    this._inputBoxTextModel = _inputBoxTextModel;
    this._quickDiffService = _quickDiffService;
    this._uriIdentService = _uriIdentService;
    this._workspaceContextService = _workspaceContextService;
    this.groups = [];
    this._onDidChangeResourceGroups = new Emitter();
    this.onDidChangeResourceGroups = this._onDidChangeResourceGroups.event;
    this._onDidChangeResources = new Emitter();
    this.onDidChangeResources = this._onDidChangeResources.event;
    this._groupsByHandle = /* @__PURE__ */ Object.create(null);
    // get groups(): ISequence<ISCMResourceGroup> {
    // 	return {
    // 		elements: this._groups,
    // 		onDidSplice: this._onDidSplice.event
    // 	};
    // 	// return this._groups
    // 	// 	.filter(g => g.resources.elements.length > 0 || !g.features.hideWhenEmpty);
    // }
    this.features = {};
    this._contextValue = observableValue(this, void 0);
    this._count = observableValue(this, void 0);
    this._statusBarCommands = observableValue(this, void 0);
    this._commitTemplate = observableValue(this, "");
    this._actionButton = observableValue(this, void 0);
    this._artifactProvider = observableValue(this, void 0);
    this._historyProvider = observableValue(this, void 0);
    if (_rootUri) {
      const folder = this._workspaceContextService.getWorkspaceFolder(_rootUri);
      if (folder?.uri.toString() === _rootUri.toString()) {
        this._name = folder.name;
      } else if (_rootUri.path !== "/") {
        this._name = basename(_rootUri);
      }
    }
  }
  get id() {
    return `scm${this._handle}`;
  }
  get parentId() {
    return this._parentHandle !== void 0 ? `scm${this._parentHandle}` : void 0;
  }
  get providerId() {
    return this._providerId;
  }
  get handle() {
    return this._handle;
  }
  get label() {
    return this._label;
  }
  get rootUri() {
    return this._rootUri;
  }
  get iconPath() {
    return this._iconPath;
  }
  get isHidden() {
    return this._isHidden;
  }
  get inputBoxTextModel() {
    return this._inputBoxTextModel;
  }
  get contextValue() {
    return this._contextValue;
  }
  get acceptInputCommand() {
    return this.features.acceptInputCommand;
  }
  get count() {
    return this._count;
  }
  get statusBarCommands() {
    return this._statusBarCommands;
  }
  get name() {
    return this._name ?? this._label;
  }
  get commitTemplate() {
    return this._commitTemplate;
  }
  get actionButton() {
    return this._actionButton;
  }
  get artifactProvider() {
    return this._artifactProvider;
  }
  get historyProvider() {
    return this._historyProvider;
  }
  $updateSourceControl(features) {
    this.features = { ...this.features, ...features };
    if (typeof features.commitTemplate !== "undefined") {
      this._commitTemplate.set(features.commitTemplate, void 0);
    }
    if (typeof features.actionButton !== "undefined") {
      this._actionButton.set(features.actionButton ?? void 0, void 0);
    }
    if (typeof features.contextValue !== "undefined") {
      this._contextValue.set(features.contextValue, void 0);
    }
    if (typeof features.count !== "undefined") {
      this._count.set(features.count, void 0);
    }
    if (typeof features.statusBarCommands !== "undefined") {
      this._statusBarCommands.set(features.statusBarCommands, void 0);
    }
    if (features.hasQuickDiffProvider && !this._quickDiff) {
      this._quickDiff = this._quickDiffService.addQuickDiffProvider({
        id: `${this._providerId}.quickDiffProvider`,
        label: features.quickDiffLabel ?? this.label,
        rootUri: this.rootUri,
        kind: "primary",
        getOriginalResource: async (uri) => {
          if (!this.features.hasQuickDiffProvider) {
            return null;
          }
          const result = await this.proxy.$provideOriginalResource(this.handle, uri, CancellationToken.None);
          return result && URI.revive(result);
        }
      });
    } else if (features.hasQuickDiffProvider === false && this._quickDiff) {
      this._quickDiff.dispose();
      this._quickDiff = void 0;
    }
    if (features.hasSecondaryQuickDiffProvider && !this._stagedQuickDiff) {
      this._stagedQuickDiff = this._quickDiffService.addQuickDiffProvider({
        id: `${this._providerId}.secondaryQuickDiffProvider`,
        label: features.secondaryQuickDiffLabel ?? this.label,
        rootUri: this.rootUri,
        kind: "secondary",
        getOriginalResource: async (uri) => {
          if (!this.features.hasSecondaryQuickDiffProvider) {
            return null;
          }
          const result = await this.proxy.$provideSecondaryOriginalResource(this.handle, uri, CancellationToken.None);
          return result && URI.revive(result);
        }
      });
    } else if (features.hasSecondaryQuickDiffProvider === false && this._stagedQuickDiff) {
      this._stagedQuickDiff.dispose();
      this._stagedQuickDiff = void 0;
    }
    if (features.hasArtifactProvider && !this.artifactProvider.get()) {
      const artifactProvider = new MainThreadSCMArtifactProvider(this.proxy, this.handle);
      this._artifactProvider.set(artifactProvider, void 0);
    } else if (features.hasArtifactProvider === false && this.artifactProvider.get()) {
      this._artifactProvider.get()?.dispose();
      this._artifactProvider.set(void 0, void 0);
    }
    if (features.hasHistoryProvider && !this.historyProvider.get()) {
      const historyProvider = new MainThreadSCMHistoryProvider(this.proxy, this.handle);
      this._historyProvider.set(historyProvider, void 0);
    } else if (features.hasHistoryProvider === false && this.historyProvider.get()) {
      this._historyProvider.set(void 0, void 0);
    }
  }
  $registerGroups(_groups) {
    const groups = _groups.map(([handle, id, label, features, multiDiffEditorEnableViewChanges]) => {
      const group = new MainThreadSCMResourceGroup(
        this.handle,
        handle,
        this,
        features,
        label,
        id,
        multiDiffEditorEnableViewChanges,
        this._uriIdentService
      );
      this._groupsByHandle[handle] = group;
      return group;
    });
    this.groups.splice(this.groups.length, 0, ...groups);
    this._onDidChangeResourceGroups.fire();
  }
  $updateGroup(handle, features) {
    const group = this._groupsByHandle[handle];
    if (!group) {
      return;
    }
    group.$updateGroup(features);
  }
  $updateGroupLabel(handle, label) {
    const group = this._groupsByHandle[handle];
    if (!group) {
      return;
    }
    group.$updateGroupLabel(label);
  }
  $spliceGroupResourceStates(splices) {
    for (const [groupHandle, groupSlices] of splices) {
      const group = this._groupsByHandle[groupHandle];
      if (!group) {
        console.warn(`SCM group ${groupHandle} not found in provider ${this.label}`);
        continue;
      }
      groupSlices.reverse();
      for (const [start, deleteCount, rawResources] of groupSlices) {
        const resources = rawResources.map((rawResource) => {
          const [handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command, multiDiffEditorOriginalUri, multiDiffEditorModifiedUri] = rawResource;
          const [light, dark] = icons;
          const icon = ThemeIcon.isThemeIcon(light) ? light : URI.revive(light);
          const iconDark = (ThemeIcon.isThemeIcon(dark) ? dark : URI.revive(dark)) || icon;
          const decorations = {
            icon,
            iconDark,
            tooltip,
            strikeThrough,
            faded
          };
          return new MainThreadSCMResource(
            this.proxy,
            this.handle,
            groupHandle,
            handle,
            URI.revive(sourceUri),
            group,
            decorations,
            contextValue || void 0,
            command,
            URI.revive(multiDiffEditorOriginalUri),
            URI.revive(multiDiffEditorModifiedUri)
          );
        });
        group.splice(start, deleteCount, resources);
      }
    }
    this._onDidChangeResources.fire();
  }
  $unregisterGroup(handle) {
    const group = this._groupsByHandle[handle];
    if (!group) {
      return;
    }
    delete this._groupsByHandle[handle];
    this.groups.splice(this.groups.indexOf(group), 1);
    this._onDidChangeResourceGroups.fire();
  }
  async getOriginalResource(uri) {
    if (!this.features.hasQuickDiffProvider) {
      return null;
    }
    const result = await this.proxy.$provideOriginalResource(this.handle, uri, CancellationToken.None);
    return result && URI.revive(result);
  }
  $onDidChangeHistoryProviderCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef) {
    const provider = this.historyProvider.get();
    if (!provider) {
      return;
    }
    provider.$onDidChangeCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef);
  }
  $onDidChangeHistoryProviderHistoryItemRefs(historyItemRefs) {
    const provider = this.historyProvider.get();
    if (!provider) {
      return;
    }
    provider.$onDidChangeHistoryItemRefs(historyItemRefs);
  }
  $onDidChangeArtifacts(groups) {
    const provider = this.artifactProvider.get();
    if (!provider) {
      return;
    }
    provider.$onDidChangeArtifacts(groups);
  }
  toJSON() {
    return {
      $mid: MarshalledId.ScmProvider,
      handle: this.handle
    };
  }
  dispose() {
    this._onDidChangeResourceGroups.dispose();
    this._onDidChangeResources.dispose();
    this._artifactProvider.get()?.dispose();
    this._stagedQuickDiff?.dispose();
    this._quickDiff?.dispose();
  }
}
let MainThreadSCM = class {
  constructor(extHostContext, scmService, scmViewService, languageService, modelService, textModelService, quickDiffService, _uriIdentService, workspaceContextService) {
    this.scmService = scmService;
    this.scmViewService = scmViewService;
    this.languageService = languageService;
    this.modelService = modelService;
    this.textModelService = textModelService;
    this.quickDiffService = quickDiffService;
    this._uriIdentService = _uriIdentService;
    this.workspaceContextService = workspaceContextService;
    this._repositories = /* @__PURE__ */ new Map();
    this._repositoryBarriers = /* @__PURE__ */ new Map();
    this._repositoryDisposables = /* @__PURE__ */ new Map();
    this._disposables = new DisposableStore();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSCM);
    this._disposables.add(new SCMInputBoxContentProvider(this.textModelService, this.modelService, this.languageService));
  }
  dispose() {
    dispose(this._repositories.values());
    this._repositories.clear();
    dispose(this._repositoryDisposables.values());
    this._repositoryDisposables.clear();
    this._disposables.dispose();
  }
  async $registerSourceControl(handle, parentHandle, id, label, rootUri, iconPath, isHidden, inputBoxDocumentUri) {
    this._repositoryBarriers.set(handle, new Barrier());
    const inputBoxTextModelRef = await this.textModelService.createModelReference(URI.revive(inputBoxDocumentUri));
    const provider = new MainThreadSCMProvider(this._proxy, handle, parentHandle, id, label, rootUri ? URI.revive(rootUri) : void 0, getIconFromIconDto(iconPath), isHidden, inputBoxTextModelRef.object.textEditorModel, this.quickDiffService, this._uriIdentService, this.workspaceContextService);
    const repository = this.scmService.registerSCMProvider(provider);
    this._repositories.set(handle, repository);
    const disposable = combinedDisposable(
      inputBoxTextModelRef,
      Event.filter(this.scmViewService.onDidFocusRepository, (r) => r === repository)((_) => this._proxy.$setSelectedSourceControl(handle)),
      repository.input.onDidChange(({ value }) => this._proxy.$onInputBoxValueChange(handle, value))
    );
    this._repositoryDisposables.set(handle, disposable);
    if (this.scmViewService.focusedRepository === repository) {
      setTimeout(() => this._proxy.$setSelectedSourceControl(handle), 0);
    }
    if (repository.input.value) {
      setTimeout(() => this._proxy.$onInputBoxValueChange(handle, repository.input.value), 0);
    }
    this._repositoryBarriers.get(handle)?.open();
  }
  async $updateSourceControl(handle, features) {
    await this._repositoryBarriers.get(handle)?.wait();
    const repository = this._repositories.get(handle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$updateSourceControl(features);
  }
  async $unregisterSourceControl(handle) {
    await this._repositoryBarriers.get(handle)?.wait();
    const repository = this._repositories.get(handle);
    if (!repository) {
      return;
    }
    this._repositoryDisposables.get(handle).dispose();
    this._repositoryDisposables.delete(handle);
    repository.dispose();
    this._repositories.delete(handle);
  }
  async $registerGroups(sourceControlHandle, groups, splices) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$registerGroups(groups);
    provider.$spliceGroupResourceStates(splices);
  }
  async $updateGroup(sourceControlHandle, groupHandle, features) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$updateGroup(groupHandle, features);
  }
  async $updateGroupLabel(sourceControlHandle, groupHandle, label) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$updateGroupLabel(groupHandle, label);
  }
  async $spliceResourceStates(sourceControlHandle, splices) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$spliceGroupResourceStates(splices);
  }
  async $unregisterGroup(sourceControlHandle, handle) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$unregisterGroup(handle);
  }
  async $setInputBoxValue(sourceControlHandle, value) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.setValue(value, false);
  }
  async $setInputBoxPlaceholder(sourceControlHandle, placeholder) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.placeholder = placeholder;
  }
  async $setInputBoxEnablement(sourceControlHandle, enabled) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.enabled = enabled;
  }
  async $setInputBoxVisibility(sourceControlHandle, visible) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.visible = visible;
  }
  async $showValidationMessage(sourceControlHandle, message, type) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.showValidationMessage(message, type);
  }
  async $setValidationProviderIsEnabled(sourceControlHandle, enabled) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    if (enabled) {
      repository.input.validateInput = async (value, pos) => {
        const result = await this._proxy.$validateInput(sourceControlHandle, value, pos);
        return result && { message: result[0], type: result[1] };
      };
    } else {
      repository.input.validateInput = async () => void 0;
    }
  }
  async $onDidChangeHistoryProviderCurrentHistoryItemRefs(sourceControlHandle, historyItemRef, historyItemRemoteRef, historyItemBaseRef) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$onDidChangeHistoryProviderCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef);
  }
  async $onDidChangeHistoryProviderHistoryItemRefs(sourceControlHandle, historyItemRefs) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$onDidChangeHistoryProviderHistoryItemRefs(historyItemRefs);
  }
  async $onDidChangeArtifacts(sourceControlHandle, groups) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$onDidChangeArtifacts(groups);
  }
};
MainThreadSCM = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadSCM),
  __decorateParam(1, ISCMService),
  __decorateParam(2, ISCMViewService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IModelService),
  __decorateParam(5, ITextModelService),
  __decorateParam(6, IQuickDiffService),
  __decorateParam(7, IUriIdentityService),
  __decorateParam(8, IWorkspaceContextService)
], MainThreadSCM);
export {
  MainThreadSCM
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkU0NNLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQmFycmllciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzVXJpQ29tcG9uZW50cywgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cywgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGNvbWJpbmVkRGlzcG9zYWJsZSwgZGlzcG9zZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU0NNU2VydmljZSwgSVNDTVJlcG9zaXRvcnksIElTQ01Qcm92aWRlciwgSVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cCwgSVNDTVJlc291cmNlRGVjb3JhdGlvbnMsIElJbnB1dFZhbGlkYXRpb24sIElTQ01WaWV3U2VydmljZSwgSW5wdXRWYWxpZGF0aW9uVHlwZSwgSVNDTUFjdGlvbkJ1dHRvbkRlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi9jb250cmliL3NjbS9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBNYWluVGhyZWFkU0NNU2hhcGUsIEV4dEhvc3RTQ01TaGFwZSwgU0NNUHJvdmlkZXJGZWF0dXJlcywgU0NNUmF3UmVzb3VyY2VTcGxpY2VzLCBTQ01Hcm91cEZlYXR1cmVzLCBNYWluQ29udGV4dCwgU0NNSGlzdG9yeUl0ZW1EdG8sIFNDTUhpc3RvcnlJdGVtUmVmc0NoYW5nZUV2ZW50RHRvLCBTQ01IaXN0b3J5SXRlbVJlZkR0byB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVF1aWNrRGlmZlNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3NjbS9jb21tb24vcXVpY2tEaWZmLmpzJztcbmltcG9ydCB7IElTQ01IaXN0b3J5SXRlbSwgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlLCBJU0NNSGlzdG9yeUl0ZW1SZWYsIElTQ01IaXN0b3J5SXRlbVJlZnNDaGFuZ2VFdmVudCwgSVNDTUhpc3RvcnlPcHRpb25zLCBJU0NNSGlzdG9yeVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29udHJpYi9zY20vY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VUcmVlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgc3RydWN0dXJhbEVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VxdWFscy5qcyc7XG5pbXBvcnQgeyBoaXN0b3J5SXRlbUJhc2VSZWZDb2xvciwgaGlzdG9yeUl0ZW1SZWZDb2xvciwgaGlzdG9yeUl0ZW1SZW1vdGVSZWZDb2xvciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2NtL2Jyb3dzZXIvc2NtSGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBDb2xvcklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJU0NNQXJ0aWZhY3QsIElTQ01BcnRpZmFjdEdyb3VwLCBJU0NNQXJ0aWZhY3RQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2NtL2NvbW1vbi9hcnRpZmFjdC5qcyc7XG5cbmZ1bmN0aW9uIGdldEljb25Gcm9tSWNvbkR0byhpY29uRHRvPzogVXJpQ29tcG9uZW50cyB8IHsgbGlnaHQ6IFVyaUNvbXBvbmVudHM7IGRhcms6IFVyaUNvbXBvbmVudHMgfSB8IFRoZW1lSWNvbik6IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRpZiAoaWNvbkR0byA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSBlbHNlIGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvbkR0bykpIHtcblx0XHRyZXR1cm4gaWNvbkR0bztcblx0fSBlbHNlIGlmIChpc1VyaUNvbXBvbmVudHMoaWNvbkR0bykpIHtcblx0XHRyZXR1cm4gVVJJLnJldml2ZShpY29uRHRvKTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBpY29uID0gaWNvbkR0byBhcyB7IGxpZ2h0OiBVcmlDb21wb25lbnRzOyBkYXJrOiBVcmlDb21wb25lbnRzIH07XG5cdFx0cmV0dXJuIHsgbGlnaHQ6IFVSSS5yZXZpdmUoaWNvbi5saWdodCksIGRhcms6IFVSSS5yZXZpdmUoaWNvbi5kYXJrKSB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvSVNDTUhpc3RvcnlJdGVtKGhpc3RvcnlJdGVtRHRvOiBTQ01IaXN0b3J5SXRlbUR0byk6IElTQ01IaXN0b3J5SXRlbSB7XG5cdGNvbnN0IGF1dGhvckljb24gPSBnZXRJY29uRnJvbUljb25EdG8oaGlzdG9yeUl0ZW1EdG8uYXV0aG9ySWNvbik7XG5cblx0Y29uc3QgcmVmZXJlbmNlcyA9IGhpc3RvcnlJdGVtRHRvLnJlZmVyZW5jZXM/Lm1hcChyID0+ICh7XG5cdFx0Li4uciwgaWNvbjogZ2V0SWNvbkZyb21JY29uRHRvKHIuaWNvbilcblx0fSkpO1xuXG5cdHJldHVybiB7IC4uLmhpc3RvcnlJdGVtRHRvLCBhdXRob3JJY29uLCByZWZlcmVuY2VzIH07XG59XG5cbmZ1bmN0aW9uIHRvSVNDTUhpc3RvcnlJdGVtUmVmKGhpc3RvcnlJdGVtUmVmRHRvPzogU0NNSGlzdG9yeUl0ZW1SZWZEdG8sIGNvbG9yPzogQ29sb3JJZGVudGlmaWVyKTogSVNDTUhpc3RvcnlJdGVtUmVmIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGhpc3RvcnlJdGVtUmVmRHRvID8geyAuLi5oaXN0b3J5SXRlbVJlZkR0bywgaWNvbjogZ2V0SWNvbkZyb21JY29uRHRvKGhpc3RvcnlJdGVtUmVmRHRvLmljb24pLCBjb2xvcjogY29sb3IgfSA6IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgU0NNSW5wdXRCb3hDb250ZW50UHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoU2NoZW1hcy52c2NvZGVTb3VyY2VDb250cm9sLCB0aGlzKSk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlVGV4dENvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCB0aGlzLmxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdzY21pbnB1dCcpLCByZXNvdXJjZSk7XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZFNDTVJlc291cmNlR3JvdXAgaW1wbGVtZW50cyBJU0NNUmVzb3VyY2VHcm91cCB7XG5cblx0cmVhZG9ubHkgcmVzb3VyY2VzOiBJU0NNUmVzb3VyY2VbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3Jlc291cmNlVHJlZTogUmVzb3VyY2VUcmVlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+IHwgdW5kZWZpbmVkO1xuXHRnZXQgcmVzb3VyY2VUcmVlKCk6IFJlc291cmNlVHJlZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPiB7XG5cdFx0aWYgKCF0aGlzLl9yZXNvdXJjZVRyZWUpIHtcblx0XHRcdGNvbnN0IHJvb3RVcmkgPSB0aGlzLnByb3ZpZGVyLnJvb3RVcmkgPz8gVVJJLmZpbGUoJy8nKTtcblx0XHRcdHRoaXMuX3Jlc291cmNlVHJlZSA9IG5ldyBSZXNvdXJjZVRyZWU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4odGhpcywgcm9vdFVyaSwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlLmV4dFVyaSk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHRoaXMucmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlVHJlZS5hZGQocmVzb3VyY2Uuc291cmNlVXJpLCByZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlVHJlZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZXNvdXJjZXMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlc291cmNlcyA9IHRoaXMuX29uRGlkQ2hhbmdlUmVzb3VyY2VzLmV2ZW50O1xuXG5cdGdldCBoaWRlV2hlbkVtcHR5KCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLmZlYXR1cmVzLmhpZGVXaGVuRW1wdHk7IH1cblxuXHRnZXQgY29udGV4dFZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLmZlYXR1cmVzLmNvbnRleHRWYWx1ZTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaGFuZGxlOiBudW1iZXIsXG5cdFx0cHVibGljIHByb3ZpZGVyOiBJU0NNUHJvdmlkZXIsXG5cdFx0cHVibGljIGZlYXR1cmVzOiBTQ01Hcm91cEZlYXR1cmVzLFxuXHRcdHB1YmxpYyBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBtdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlczogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudFNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7IH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5TY21SZXNvdXJjZUdyb3VwLFxuXHRcdFx0c291cmNlQ29udHJvbEhhbmRsZTogdGhpcy5zb3VyY2VDb250cm9sSGFuZGxlLFxuXHRcdFx0Z3JvdXBIYW5kbGU6IHRoaXMuaGFuZGxlXG5cdFx0fTtcblx0fVxuXG5cdHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCB0b0luc2VydDogSVNDTVJlc291cmNlW10pIHtcblx0XHR0aGlzLnJlc291cmNlcy5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCAuLi50b0luc2VydCk7XG5cdFx0dGhpcy5fcmVzb3VyY2VUcmVlID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZXMuZmlyZSgpO1xuXHR9XG5cblx0JHVwZGF0ZUdyb3VwKGZlYXR1cmVzOiBTQ01Hcm91cEZlYXR1cmVzKTogdm9pZCB7XG5cdFx0dGhpcy5mZWF0dXJlcyA9IHsgLi4udGhpcy5mZWF0dXJlcywgLi4uZmVhdHVyZXMgfTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHQkdXBkYXRlR3JvdXBMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxufVxuXG5jbGFzcyBNYWluVGhyZWFkU0NNUmVzb3VyY2UgaW1wbGVtZW50cyBJU0NNUmVzb3VyY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJveHk6IEV4dEhvc3RTQ01TaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdyb3VwSGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBoYW5kbGU6IG51bWJlcixcblx0XHRyZWFkb25seSBzb3VyY2VVcmk6IFVSSSxcblx0XHRyZWFkb25seSByZXNvdXJjZUdyb3VwOiBJU0NNUmVzb3VyY2VHcm91cCxcblx0XHRyZWFkb25seSBkZWNvcmF0aW9uczogSVNDTVJlc291cmNlRGVjb3JhdGlvbnMsXG5cdFx0cmVhZG9ubHkgY29udGV4dFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgY29tbWFuZDogQ29tbWFuZCB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBtdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IG11bHRpRGlmZkVkaXRvck1vZGlmaWVkVXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0b3BlbihwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMucHJveHkuJGV4ZWN1dGVSZXNvdXJjZUNvbW1hbmQodGhpcy5zb3VyY2VDb250cm9sSGFuZGxlLCB0aGlzLmdyb3VwSGFuZGxlLCB0aGlzLmhhbmRsZSwgcHJlc2VydmVGb2N1cyk7XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5TY21SZXNvdXJjZSxcblx0XHRcdHNvdXJjZUNvbnRyb2xIYW5kbGU6IHRoaXMuc291cmNlQ29udHJvbEhhbmRsZSxcblx0XHRcdGdyb3VwSGFuZGxlOiB0aGlzLmdyb3VwSGFuZGxlLFxuXHRcdFx0aGFuZGxlOiB0aGlzLmhhbmRsZVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZFNDTUFydGlmYWN0UHJvdmlkZXIgaW1wbGVtZW50cyBJU0NNQXJ0aWZhY3RQcm92aWRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXJ0aWZhY3RzID0gbmV3IEVtaXR0ZXI8c3RyaW5nW10+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXJ0aWZhY3RzID0gdGhpcy5fb25EaWRDaGFuZ2VBcnRpZmFjdHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBwcm94eTogRXh0SG9zdFNDTVNoYXBlLCBwcml2YXRlIHJlYWRvbmx5IGhhbmRsZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX29uRGlkQ2hhbmdlQXJ0aWZhY3RzKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVBcnRpZmFjdEdyb3Vwcyh0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU0NNQXJ0aWZhY3RHcm91cFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXJ0aWZhY3RHcm91cHMgPSBhd2FpdCB0aGlzLnByb3h5LiRwcm92aWRlQXJ0aWZhY3RHcm91cHModGhpcy5oYW5kbGUsIHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiBhcnRpZmFjdEdyb3Vwcz8ubWFwKGdyb3VwID0+ICh7IC4uLmdyb3VwLCBpY29uOiBnZXRJY29uRnJvbUljb25EdG8oZ3JvdXAuaWNvbikgfSkpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUFydGlmYWN0cyhncm91cDogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU0NNQXJ0aWZhY3RbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFydGlmYWN0cyA9IGF3YWl0IHRoaXMucHJveHkuJHByb3ZpZGVBcnRpZmFjdHModGhpcy5oYW5kbGUsIGdyb3VwLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gYXJ0aWZhY3RzPy5tYXAoYXJ0aWZhY3QgPT4gKHsgLi4uYXJ0aWZhY3QsIGljb246IGdldEljb25Gcm9tSWNvbkR0byhhcnRpZmFjdC5pY29uKSB9KSk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VBcnRpZmFjdHMoZ3JvdXBzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXJ0aWZhY3RzLmZpcmUoZ3JvdXBzKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1haW5UaHJlYWRTQ01IaXN0b3J5UHJvdmlkZXIgaW1wbGVtZW50cyBJU0NNSGlzdG9yeVByb3ZpZGVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeUl0ZW1SZWYgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPElTQ01IaXN0b3J5SXRlbVJlZiB8IHVuZGVmaW5lZD4oe1xuXHRcdG93bmVyOiB0aGlzLFxuXHRcdGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzXG5cdH0sIHVuZGVmaW5lZCk7XG5cdGdldCBoaXN0b3J5SXRlbVJlZigpOiBJT2JzZXJ2YWJsZTxJU0NNSGlzdG9yeUl0ZW1SZWYgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX2hpc3RvcnlJdGVtUmVmOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeUl0ZW1SZW1vdGVSZWYgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPElTQ01IaXN0b3J5SXRlbVJlZiB8IHVuZGVmaW5lZD4oe1xuXHRcdG93bmVyOiB0aGlzLFxuXHRcdGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzXG5cdH0sIHVuZGVmaW5lZCk7XG5cdGdldCBoaXN0b3J5SXRlbVJlbW90ZVJlZigpOiBJT2JzZXJ2YWJsZTxJU0NNSGlzdG9yeUl0ZW1SZWYgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX2hpc3RvcnlJdGVtUmVtb3RlUmVmOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeUl0ZW1CYXNlUmVmID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxJU0NNSGlzdG9yeUl0ZW1SZWYgfCB1bmRlZmluZWQ+KHtcblx0XHRvd25lcjogdGhpcyxcblx0XHRlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFsc1xuXHR9LCB1bmRlZmluZWQpO1xuXHRnZXQgaGlzdG9yeUl0ZW1CYXNlUmVmKCk6IElPYnNlcnZhYmxlPElTQ01IaXN0b3J5SXRlbVJlZiB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5faGlzdG9yeUl0ZW1CYXNlUmVmOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeUl0ZW1SZWZDaGFuZ2VzID0gb2JzZXJ2YWJsZVZhbHVlPElTQ01IaXN0b3J5SXRlbVJlZnNDaGFuZ2VFdmVudD4odGhpcywgeyBhZGRlZDogW10sIG1vZGlmaWVkOiBbXSwgcmVtb3ZlZDogW10sIHNpbGVudDogZmFsc2UgfSk7XG5cdGdldCBoaXN0b3J5SXRlbVJlZkNoYW5nZXMoKTogSU9ic2VydmFibGU8SVNDTUhpc3RvcnlJdGVtUmVmc0NoYW5nZUV2ZW50PiB7IHJldHVybiB0aGlzLl9oaXN0b3J5SXRlbVJlZkNoYW5nZXM7IH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHByb3h5OiBFeHRIb3N0U0NNU2hhcGUsIHByaXZhdGUgcmVhZG9ubHkgaGFuZGxlOiBudW1iZXIpIHsgfVxuXG5cdGFzeW5jIHJlc29sdmVIaXN0b3J5SXRlbShoaXN0b3J5SXRlbUlkOiBzdHJpbmcsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTQ01IaXN0b3J5SXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gYXdhaXQgdGhpcy5wcm94eS4kcmVzb2x2ZUhpc3RvcnlJdGVtKHRoaXMuaGFuZGxlLCBoaXN0b3J5SXRlbUlkLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gaGlzdG9yeUl0ZW0gPyB0b0lTQ01IaXN0b3J5SXRlbShoaXN0b3J5SXRlbSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlSGlzdG9yeUl0ZW1DaGF0Q29udGV4dChoaXN0b3J5SXRlbUlkOiBzdHJpbmcsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnByb3h5LiRyZXNvbHZlSGlzdG9yeUl0ZW1DaGF0Q29udGV4dCh0aGlzLmhhbmRsZSwgaGlzdG9yeUl0ZW1JZCwgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUNoYXRDb250ZXh0KGhpc3RvcnlJdGVtSWQ6IHN0cmluZywgaGlzdG9yeUl0ZW1QYXJlbnRJZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnByb3h5LiRyZXNvbHZlSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUNoYXRDb250ZXh0KHRoaXMuaGFuZGxlLCBoaXN0b3J5SXRlbUlkLCBoaXN0b3J5SXRlbVBhcmVudElkLCBwYXRoLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVIaXN0b3J5SXRlbVJlZnNDb21tb25BbmNlc3RvcihoaXN0b3J5SXRlbVJlZnM6IHN0cmluZ1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnByb3h5LiRyZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3IodGhpcy5oYW5kbGUsIGhpc3RvcnlJdGVtUmVmcywgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlSGlzdG9yeUl0ZW1SZWZzKGhpc3RvcnlJdGVtc1JlZnM/OiBzdHJpbmdbXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNDTUhpc3RvcnlJdGVtUmVmW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZnMgPSBhd2FpdCB0aGlzLnByb3h5LiRwcm92aWRlSGlzdG9yeUl0ZW1SZWZzKHRoaXMuaGFuZGxlLCBoaXN0b3J5SXRlbXNSZWZzLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gaGlzdG9yeUl0ZW1SZWZzPy5tYXAocmVmID0+ICh7IC4uLnJlZiwgaWNvbjogZ2V0SWNvbkZyb21JY29uRHRvKHJlZi5pY29uKSB9KSk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlSGlzdG9yeUl0ZW1zKG9wdGlvbnM6IElTQ01IaXN0b3J5T3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNDTUhpc3RvcnlJdGVtW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5SXRlbXMgPSBhd2FpdCB0aGlzLnByb3h5LiRwcm92aWRlSGlzdG9yeUl0ZW1zKHRoaXMuaGFuZGxlLCBvcHRpb25zLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gaGlzdG9yeUl0ZW1zPy5tYXAoaGlzdG9yeUl0ZW0gPT4gdG9JU0NNSGlzdG9yeUl0ZW0oaGlzdG9yeUl0ZW0pKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVIaXN0b3J5SXRlbUNoYW5nZXMoaGlzdG9yeUl0ZW1JZDogc3RyaW5nLCBoaXN0b3J5SXRlbVBhcmVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTQ01IaXN0b3J5SXRlbUNoYW5nZVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHRoaXMucHJveHkuJHByb3ZpZGVIaXN0b3J5SXRlbUNoYW5nZXModGhpcy5oYW5kbGUsIGhpc3RvcnlJdGVtSWQsIGhpc3RvcnlJdGVtUGFyZW50SWQsIHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiBjaGFuZ2VzPy5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHR1cmk6IFVSSS5yZXZpdmUoY2hhbmdlLnVyaSksXG5cdFx0XHRvcmlnaW5hbFVyaTogY2hhbmdlLm9yaWdpbmFsVXJpICYmIFVSSS5yZXZpdmUoY2hhbmdlLm9yaWdpbmFsVXJpKSxcblx0XHRcdG1vZGlmaWVkVXJpOiBjaGFuZ2UubW9kaWZpZWRVcmkgJiYgVVJJLnJldml2ZShjaGFuZ2UubW9kaWZpZWRVcmkpXG5cdFx0fSkpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlQ3VycmVudEhpc3RvcnlJdGVtUmVmcyhoaXN0b3J5SXRlbVJlZj86IFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBoaXN0b3J5SXRlbVJlbW90ZVJlZj86IFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBoaXN0b3J5SXRlbUJhc2VSZWY/OiBTQ01IaXN0b3J5SXRlbVJlZkR0byk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX2hpc3RvcnlJdGVtUmVmLnNldCh0b0lTQ01IaXN0b3J5SXRlbVJlZihoaXN0b3J5SXRlbVJlZiwgaGlzdG9yeUl0ZW1SZWZDb2xvciksIHR4KTtcblx0XHRcdHRoaXMuX2hpc3RvcnlJdGVtUmVtb3RlUmVmLnNldCh0b0lTQ01IaXN0b3J5SXRlbVJlZihoaXN0b3J5SXRlbVJlbW90ZVJlZiwgaGlzdG9yeUl0ZW1SZW1vdGVSZWZDb2xvciksIHR4KTtcblx0XHRcdHRoaXMuX2hpc3RvcnlJdGVtQmFzZVJlZi5zZXQodG9JU0NNSGlzdG9yeUl0ZW1SZWYoaGlzdG9yeUl0ZW1CYXNlUmVmLCBoaXN0b3J5SXRlbUJhc2VSZWZDb2xvciksIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUhpc3RvcnlJdGVtUmVmcyhoaXN0b3J5SXRlbVJlZnM6IFNDTUhpc3RvcnlJdGVtUmVmc0NoYW5nZUV2ZW50RHRvKTogdm9pZCB7XG5cdFx0Y29uc3QgYWRkZWQgPSBoaXN0b3J5SXRlbVJlZnMuYWRkZWQubWFwKHJlZiA9PiB0b0lTQ01IaXN0b3J5SXRlbVJlZihyZWYpISk7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBoaXN0b3J5SXRlbVJlZnMubW9kaWZpZWQubWFwKHJlZiA9PiB0b0lTQ01IaXN0b3J5SXRlbVJlZihyZWYpISk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IGhpc3RvcnlJdGVtUmVmcy5yZW1vdmVkLm1hcChyZWYgPT4gdG9JU0NNSGlzdG9yeUl0ZW1SZWYocmVmKSEpO1xuXG5cdFx0dGhpcy5faGlzdG9yeUl0ZW1SZWZDaGFuZ2VzLnNldCh7IGFkZGVkLCBtb2RpZmllZCwgcmVtb3ZlZCwgc2lsZW50OiBoaXN0b3J5SXRlbVJlZnMuc2lsZW50IH0sIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZFNDTVByb3ZpZGVyIGltcGxlbWVudHMgSVNDTVByb3ZpZGVyIHtcblxuXHRnZXQgaWQoKTogc3RyaW5nIHsgcmV0dXJuIGBzY20ke3RoaXMuX2hhbmRsZX1gOyB9XG5cdGdldCBwYXJlbnRJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wYXJlbnRIYW5kbGUgIT09IHVuZGVmaW5lZFxuXHRcdFx0PyBgc2NtJHt0aGlzLl9wYXJlbnRIYW5kbGV9YFxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblx0Z2V0IHByb3ZpZGVySWQoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3Byb3ZpZGVySWQ7IH1cblxuXHRyZWFkb25seSBncm91cHM6IE1haW5UaHJlYWRTQ01SZXNvdXJjZUdyb3VwW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZXNvdXJjZUdyb3VwcyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMgPSB0aGlzLl9vbkRpZENoYW5nZVJlc291cmNlR3JvdXBzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVzb3VyY2VzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZXNvdXJjZXMgPSB0aGlzLl9vbkRpZENoYW5nZVJlc291cmNlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ncm91cHNCeUhhbmRsZTogeyBbaGFuZGxlOiBudW1iZXJdOiBNYWluVGhyZWFkU0NNUmVzb3VyY2VHcm91cCB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHQvLyBnZXQgZ3JvdXBzKCk6IElTZXF1ZW5jZTxJU0NNUmVzb3VyY2VHcm91cD4ge1xuXHQvLyBcdHJldHVybiB7XG5cdC8vIFx0XHRlbGVtZW50czogdGhpcy5fZ3JvdXBzLFxuXHQvLyBcdFx0b25EaWRTcGxpY2U6IHRoaXMuX29uRGlkU3BsaWNlLmV2ZW50XG5cdC8vIFx0fTtcblxuXHQvLyBcdC8vIHJldHVybiB0aGlzLl9ncm91cHNcblx0Ly8gXHQvLyBcdC5maWx0ZXIoZyA9PiBnLnJlc291cmNlcy5lbGVtZW50cy5sZW5ndGggPiAwIHx8ICFnLmZlYXR1cmVzLmhpZGVXaGVuRW1wdHkpO1xuXHQvLyB9XG5cblxuXHRwcml2YXRlIGZlYXR1cmVzOiBTQ01Qcm92aWRlckZlYXR1cmVzID0ge307XG5cblx0Z2V0IGhhbmRsZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5faGFuZGxlOyB9XG5cdGdldCBsYWJlbCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fbGFiZWw7IH1cblx0Z2V0IHJvb3RVcmkoKTogVVJJIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Jvb3RVcmk7IH1cblx0Z2V0IGljb25QYXRoKCk6IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCBUaGVtZUljb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faWNvblBhdGg7IH1cblx0Z2V0IGlzSGlkZGVuKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faXNIaWRkZW47IH1cblx0Z2V0IGlucHV0Qm94VGV4dE1vZGVsKCk6IElUZXh0TW9kZWwgeyByZXR1cm4gdGhpcy5faW5wdXRCb3hUZXh0TW9kZWw7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0VmFsdWUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRnZXQgY29udGV4dFZhbHVlKCk6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fY29udGV4dFZhbHVlOyB9XG5cblx0Z2V0IGFjY2VwdElucHV0Q29tbWFuZCgpOiBDb21tYW5kIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuZmVhdHVyZXMuYWNjZXB0SW5wdXRDb21tYW5kOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY291bnQgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRnZXQgY291bnQoKSB7IHJldHVybiB0aGlzLl9jb3VudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c0JhckNvbW1hbmRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IENvbW1hbmRbXSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0Z2V0IHN0YXR1c0JhckNvbW1hbmRzKCkgeyByZXR1cm4gdGhpcy5fc3RhdHVzQmFyQ29tbWFuZHM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9uYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBuYW1lKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9uYW1lID8/IHRoaXMuX2xhYmVsOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWl0VGVtcGxhdGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPih0aGlzLCAnJyk7XG5cdGdldCBjb21taXRUZW1wbGF0ZSgpIHsgcmV0dXJuIHRoaXMuX2NvbW1pdFRlbXBsYXRlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9uQnV0dG9uID0gb2JzZXJ2YWJsZVZhbHVlPElTQ01BY3Rpb25CdXR0b25EZXNjcmlwdG9yIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRnZXQgYWN0aW9uQnV0dG9uKCk6IElPYnNlcnZhYmxlPElTQ01BY3Rpb25CdXR0b25EZXNjcmlwdG9yIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9hY3Rpb25CdXR0b247IH1cblxuXHRwcml2YXRlIF9xdWlja0RpZmY6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGFnZWRRdWlja0RpZmY6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FydGlmYWN0UHJvdmlkZXIgPSBvYnNlcnZhYmxlVmFsdWU8TWFpblRocmVhZFNDTUFydGlmYWN0UHJvdmlkZXIgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdGdldCBhcnRpZmFjdFByb3ZpZGVyKCkgeyByZXR1cm4gdGhpcy5fYXJ0aWZhY3RQcm92aWRlcjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlQcm92aWRlciA9IG9ic2VydmFibGVWYWx1ZTxNYWluVGhyZWFkU0NNSGlzdG9yeVByb3ZpZGVyIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRnZXQgaGlzdG9yeVByb3ZpZGVyKCkgeyByZXR1cm4gdGhpcy5faGlzdG9yeVByb3ZpZGVyOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogRXh0SG9zdFNDTVNoYXBlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pY29uUGF0aDogVVJJIHwgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfSB8IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pc0hpZGRlbjogYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dEJveFRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0RpZmZTZXJ2aWNlOiBJUXVpY2tEaWZmU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudFNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRpZiAoX3Jvb3RVcmkpIHtcblx0XHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihfcm9vdFVyaSk7XG5cdFx0XHRpZiAoZm9sZGVyPy51cmkudG9TdHJpbmcoKSA9PT0gX3Jvb3RVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLl9uYW1lID0gZm9sZGVyLm5hbWU7XG5cdFx0XHR9IGVsc2UgaWYgKF9yb290VXJpLnBhdGggIT09ICcvJykge1xuXHRcdFx0XHR0aGlzLl9uYW1lID0gYmFzZW5hbWUoX3Jvb3RVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdCR1cGRhdGVTb3VyY2VDb250cm9sKGZlYXR1cmVzOiBTQ01Qcm92aWRlckZlYXR1cmVzKTogdm9pZCB7XG5cdFx0dGhpcy5mZWF0dXJlcyA9IHsgLi4udGhpcy5mZWF0dXJlcywgLi4uZmVhdHVyZXMgfTtcblxuXHRcdGlmICh0eXBlb2YgZmVhdHVyZXMuY29tbWl0VGVtcGxhdGUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9jb21taXRUZW1wbGF0ZS5zZXQoZmVhdHVyZXMuY29tbWl0VGVtcGxhdGUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBmZWF0dXJlcy5hY3Rpb25CdXR0b24gIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb25CdXR0b24uc2V0KGZlYXR1cmVzLmFjdGlvbkJ1dHRvbiA/PyB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBmZWF0dXJlcy5jb250ZXh0VmFsdWUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9jb250ZXh0VmFsdWUuc2V0KGZlYXR1cmVzLmNvbnRleHRWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGZlYXR1cmVzLmNvdW50ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fY291bnQuc2V0KGZlYXR1cmVzLmNvdW50LCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgZmVhdHVyZXMuc3RhdHVzQmFyQ29tbWFuZHMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXNCYXJDb21tYW5kcy5zZXQoZmVhdHVyZXMuc3RhdHVzQmFyQ29tbWFuZHMsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZlYXR1cmVzLmhhc1F1aWNrRGlmZlByb3ZpZGVyICYmICF0aGlzLl9xdWlja0RpZmYpIHtcblx0XHRcdHRoaXMuX3F1aWNrRGlmZiA9IHRoaXMuX3F1aWNrRGlmZlNlcnZpY2UuYWRkUXVpY2tEaWZmUHJvdmlkZXIoe1xuXHRcdFx0XHRpZDogYCR7dGhpcy5fcHJvdmlkZXJJZH0ucXVpY2tEaWZmUHJvdmlkZXJgLFxuXHRcdFx0XHRsYWJlbDogZmVhdHVyZXMucXVpY2tEaWZmTGFiZWwgPz8gdGhpcy5sYWJlbCxcblx0XHRcdFx0cm9vdFVyaTogdGhpcy5yb290VXJpLFxuXHRcdFx0XHRraW5kOiAncHJpbWFyeScsXG5cdFx0XHRcdGdldE9yaWdpbmFsUmVzb3VyY2U6IGFzeW5jICh1cmk6IFVSSSkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5mZWF0dXJlcy5oYXNRdWlja0RpZmZQcm92aWRlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcm94eS4kcHJvdmlkZU9yaWdpbmFsUmVzb3VyY2UodGhpcy5oYW5kbGUsIHVyaSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdCAmJiBVUkkucmV2aXZlKHJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoZmVhdHVyZXMuaGFzUXVpY2tEaWZmUHJvdmlkZXIgPT09IGZhbHNlICYmIHRoaXMuX3F1aWNrRGlmZikge1xuXHRcdFx0dGhpcy5fcXVpY2tEaWZmLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3F1aWNrRGlmZiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoZmVhdHVyZXMuaGFzU2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXIgJiYgIXRoaXMuX3N0YWdlZFF1aWNrRGlmZikge1xuXHRcdFx0dGhpcy5fc3RhZ2VkUXVpY2tEaWZmID0gdGhpcy5fcXVpY2tEaWZmU2VydmljZS5hZGRRdWlja0RpZmZQcm92aWRlcih7XG5cdFx0XHRcdGlkOiBgJHt0aGlzLl9wcm92aWRlcklkfS5zZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcmAsXG5cdFx0XHRcdGxhYmVsOiBmZWF0dXJlcy5zZWNvbmRhcnlRdWlja0RpZmZMYWJlbCA/PyB0aGlzLmxhYmVsLFxuXHRcdFx0XHRyb290VXJpOiB0aGlzLnJvb3RVcmksXG5cdFx0XHRcdGtpbmQ6ICdzZWNvbmRhcnknLFxuXHRcdFx0XHRnZXRPcmlnaW5hbFJlc291cmNlOiBhc3luYyAodXJpOiBVUkkpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuZmVhdHVyZXMuaGFzU2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucHJveHkuJHByb3ZpZGVTZWNvbmRhcnlPcmlnaW5hbFJlc291cmNlKHRoaXMuaGFuZGxlLCB1cmksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQgJiYgVVJJLnJldml2ZShyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGZlYXR1cmVzLmhhc1NlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyID09PSBmYWxzZSAmJiB0aGlzLl9zdGFnZWRRdWlja0RpZmYpIHtcblx0XHRcdHRoaXMuX3N0YWdlZFF1aWNrRGlmZi5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9zdGFnZWRRdWlja0RpZmYgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGZlYXR1cmVzLmhhc0FydGlmYWN0UHJvdmlkZXIgJiYgIXRoaXMuYXJ0aWZhY3RQcm92aWRlci5nZXQoKSkge1xuXHRcdFx0Y29uc3QgYXJ0aWZhY3RQcm92aWRlciA9IG5ldyBNYWluVGhyZWFkU0NNQXJ0aWZhY3RQcm92aWRlcih0aGlzLnByb3h5LCB0aGlzLmhhbmRsZSk7XG5cdFx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyLnNldChhcnRpZmFjdFByb3ZpZGVyLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSBpZiAoZmVhdHVyZXMuaGFzQXJ0aWZhY3RQcm92aWRlciA9PT0gZmFsc2UgJiYgdGhpcy5hcnRpZmFjdFByb3ZpZGVyLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyLmdldCgpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZlYXR1cmVzLmhhc0hpc3RvcnlQcm92aWRlciAmJiAhdGhpcy5oaXN0b3J5UHJvdmlkZXIuZ2V0KCkpIHtcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IG5ldyBNYWluVGhyZWFkU0NNSGlzdG9yeVByb3ZpZGVyKHRoaXMucHJveHksIHRoaXMuaGFuZGxlKTtcblx0XHRcdHRoaXMuX2hpc3RvcnlQcm92aWRlci5zZXQoaGlzdG9yeVByb3ZpZGVyLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSBpZiAoZmVhdHVyZXMuaGFzSGlzdG9yeVByb3ZpZGVyID09PSBmYWxzZSAmJiB0aGlzLmhpc3RvcnlQcm92aWRlci5nZXQoKSkge1xuXHRcdFx0dGhpcy5faGlzdG9yeVByb3ZpZGVyLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0JHJlZ2lzdGVyR3JvdXBzKF9ncm91cHM6IFtudW1iZXIgLypoYW5kbGUqLywgc3RyaW5nIC8qaWQqLywgc3RyaW5nIC8qbGFiZWwqLywgU0NNR3JvdXBGZWF0dXJlcywgLyogbXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXMgKi8gYm9vbGVhbl1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwcyA9IF9ncm91cHMubWFwKChbaGFuZGxlLCBpZCwgbGFiZWwsIGZlYXR1cmVzLCBtdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlc10pID0+IHtcblx0XHRcdGNvbnN0IGdyb3VwID0gbmV3IE1haW5UaHJlYWRTQ01SZXNvdXJjZUdyb3VwKFxuXHRcdFx0XHR0aGlzLmhhbmRsZSxcblx0XHRcdFx0aGFuZGxlLFxuXHRcdFx0XHR0aGlzLFxuXHRcdFx0XHRmZWF0dXJlcyxcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRtdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlcyxcblx0XHRcdFx0dGhpcy5fdXJpSWRlbnRTZXJ2aWNlXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLl9ncm91cHNCeUhhbmRsZVtoYW5kbGVdID0gZ3JvdXA7XG5cdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmdyb3Vwcy5zcGxpY2UodGhpcy5ncm91cHMubGVuZ3RoLCAwLCAuLi5ncm91cHMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMuZmlyZSgpO1xuXHR9XG5cblx0JHVwZGF0ZUdyb3VwKGhhbmRsZTogbnVtYmVyLCBmZWF0dXJlczogU0NNR3JvdXBGZWF0dXJlcyk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZ3JvdXBzQnlIYW5kbGVbaGFuZGxlXTtcblxuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRncm91cC4kdXBkYXRlR3JvdXAoZmVhdHVyZXMpO1xuXHR9XG5cblx0JHVwZGF0ZUdyb3VwTGFiZWwoaGFuZGxlOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2dyb3Vwc0J5SGFuZGxlW2hhbmRsZV07XG5cblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Z3JvdXAuJHVwZGF0ZUdyb3VwTGFiZWwobGFiZWwpO1xuXHR9XG5cblx0JHNwbGljZUdyb3VwUmVzb3VyY2VTdGF0ZXMoc3BsaWNlczogU0NNUmF3UmVzb3VyY2VTcGxpY2VzW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtncm91cEhhbmRsZSwgZ3JvdXBTbGljZXNdIG9mIHNwbGljZXMpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZ3JvdXBzQnlIYW5kbGVbZ3JvdXBIYW5kbGVdO1xuXG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgU0NNIGdyb3VwICR7Z3JvdXBIYW5kbGV9IG5vdCBmb3VuZCBpbiBwcm92aWRlciAke3RoaXMubGFiZWx9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZXZlcnNlIHRoZSBzcGxpY2VzIHNlcXVlbmNlIGluIG9yZGVyIHRvIGFwcGx5IHRoZW0gY29ycmVjdGx5XG5cdFx0XHRncm91cFNsaWNlcy5yZXZlcnNlKCk7XG5cblx0XHRcdGZvciAoY29uc3QgW3N0YXJ0LCBkZWxldGVDb3VudCwgcmF3UmVzb3VyY2VzXSBvZiBncm91cFNsaWNlcykge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZXMgPSByYXdSZXNvdXJjZXMubWFwKHJhd1Jlc291cmNlID0+IHtcblx0XHRcdFx0XHRjb25zdCBbaGFuZGxlLCBzb3VyY2VVcmksIGljb25zLCB0b29sdGlwLCBzdHJpa2VUaHJvdWdoLCBmYWRlZCwgY29udGV4dFZhbHVlLCBjb21tYW5kLCBtdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaSwgbXVsdGlEaWZmRWRpdG9yTW9kaWZpZWRVcmldID0gcmF3UmVzb3VyY2U7XG5cblx0XHRcdFx0XHRjb25zdCBbbGlnaHQsIGRhcmtdID0gaWNvbnM7XG5cdFx0XHRcdFx0Y29uc3QgaWNvbiA9IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihsaWdodCkgPyBsaWdodCA6IFVSSS5yZXZpdmUobGlnaHQpO1xuXHRcdFx0XHRcdGNvbnN0IGljb25EYXJrID0gKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihkYXJrKSA/IGRhcmsgOiBVUkkucmV2aXZlKGRhcmspKSB8fCBpY29uO1xuXG5cdFx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHRpY29uOiBpY29uLFxuXHRcdFx0XHRcdFx0aWNvbkRhcms6IGljb25EYXJrLFxuXHRcdFx0XHRcdFx0dG9vbHRpcCxcblx0XHRcdFx0XHRcdHN0cmlrZVRocm91Z2gsXG5cdFx0XHRcdFx0XHRmYWRlZFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRyZXR1cm4gbmV3IE1haW5UaHJlYWRTQ01SZXNvdXJjZShcblx0XHRcdFx0XHRcdHRoaXMucHJveHksXG5cdFx0XHRcdFx0XHR0aGlzLmhhbmRsZSxcblx0XHRcdFx0XHRcdGdyb3VwSGFuZGxlLFxuXHRcdFx0XHRcdFx0aGFuZGxlLFxuXHRcdFx0XHRcdFx0VVJJLnJldml2ZShzb3VyY2VVcmkpLFxuXHRcdFx0XHRcdFx0Z3JvdXAsXG5cdFx0XHRcdFx0XHRkZWNvcmF0aW9ucyxcblx0XHRcdFx0XHRcdGNvbnRleHRWYWx1ZSB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb21tYW5kLFxuXHRcdFx0XHRcdFx0VVJJLnJldml2ZShtdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaSksXG5cdFx0XHRcdFx0XHRVUkkucmV2aXZlKG11bHRpRGlmZkVkaXRvck1vZGlmaWVkVXJpKSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRncm91cC5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCByZXNvdXJjZXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzb3VyY2VzLmZpcmUoKTtcblx0fVxuXG5cdCR1bnJlZ2lzdGVyR3JvdXAoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2dyb3Vwc0J5SGFuZGxlW2hhbmRsZV07XG5cblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZGVsZXRlIHRoaXMuX2dyb3Vwc0J5SGFuZGxlW2hhbmRsZV07XG5cdFx0dGhpcy5ncm91cHMuc3BsaWNlKHRoaXMuZ3JvdXBzLmluZGV4T2YoZ3JvdXApLCAxKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlc291cmNlR3JvdXBzLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGdldE9yaWdpbmFsUmVzb3VyY2UodXJpOiBVUkkpOiBQcm9taXNlPFVSSSB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMuZmVhdHVyZXMuaGFzUXVpY2tEaWZmUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucHJveHkuJHByb3ZpZGVPcmlnaW5hbFJlc291cmNlKHRoaXMuaGFuZGxlLCB1cmksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiByZXN1bHQgJiYgVVJJLnJldml2ZShyZXN1bHQpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlSGlzdG9yeVByb3ZpZGVyQ3VycmVudEhpc3RvcnlJdGVtUmVmcyhoaXN0b3J5SXRlbVJlZj86IFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBoaXN0b3J5SXRlbVJlbW90ZVJlZj86IFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBoaXN0b3J5SXRlbUJhc2VSZWY/OiBTQ01IaXN0b3J5SXRlbVJlZkR0byk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHByb3ZpZGVyLiRvbkRpZENoYW5nZUN1cnJlbnRIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1SZWYsIGhpc3RvcnlJdGVtUmVtb3RlUmVmLCBoaXN0b3J5SXRlbUJhc2VSZWYpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlSGlzdG9yeVByb3ZpZGVySGlzdG9yeUl0ZW1SZWZzKGhpc3RvcnlJdGVtUmVmczogU0NNSGlzdG9yeUl0ZW1SZWZzQ2hhbmdlRXZlbnREdG8pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRwcm92aWRlci4kb25EaWRDaGFuZ2VIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1SZWZzKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUFydGlmYWN0cyhncm91cHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmFydGlmYWN0UHJvdmlkZXIuZ2V0KCk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHByb3ZpZGVyLiRvbkRpZENoYW5nZUFydGlmYWN0cyhncm91cHMpO1xuXHR9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuU2NtUHJvdmlkZXIsXG5cdFx0XHRoYW5kbGU6IHRoaXMuaGFuZGxlXG5cdFx0fTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZUdyb3Vwcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2FydGlmYWN0UHJvdmlkZXIuZ2V0KCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdGFnZWRRdWlja0RpZmY/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9xdWlja0RpZmY/LmRpc3Bvc2UoKTtcblx0fVxufVxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZFNDTSlcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkU0NNIGltcGxlbWVudHMgTWFpblRocmVhZFNDTVNoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdFNDTVNoYXBlO1xuXHRwcml2YXRlIF9yZXBvc2l0b3JpZXMgPSBuZXcgTWFwPG51bWJlciwgSVNDTVJlcG9zaXRvcnk+KCk7XG5cdHByaXZhdGUgX3JlcG9zaXRvcnlCYXJyaWVycyA9IG5ldyBNYXA8bnVtYmVyLCBCYXJyaWVyPigpO1xuXHRwcml2YXRlIF9yZXBvc2l0b3J5RGlzcG9zYWJsZXMgPSBuZXcgTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElTQ01TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2NtU2VydmljZTogSVNDTVNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElRdWlja0RpZmZTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmU2VydmljZTogSVF1aWNrRGlmZlNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdFNDTSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IFNDTUlucHV0Qm94Q29udGVudFByb3ZpZGVyKHRoaXMudGV4dE1vZGVsU2VydmljZSwgdGhpcy5tb2RlbFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fcmVwb3NpdG9yaWVzLnZhbHVlcygpKTtcblx0XHR0aGlzLl9yZXBvc2l0b3JpZXMuY2xlYXIoKTtcblxuXHRcdGRpc3Bvc2UodGhpcy5fcmVwb3NpdG9yeURpc3Bvc2FibGVzLnZhbHVlcygpKTtcblx0XHR0aGlzLl9yZXBvc2l0b3J5RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlclNvdXJjZUNvbnRyb2woaGFuZGxlOiBudW1iZXIsIHBhcmVudEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCByb290VXJpOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCBpY29uUGF0aDogVXJpQ29tcG9uZW50cyB8IHsgbGlnaHQ6IFVyaUNvbXBvbmVudHM7IGRhcms6IFVyaUNvbXBvbmVudHMgfSB8IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCwgaXNIaWRkZW46IGJvb2xlYW4gfCB1bmRlZmluZWQsIGlucHV0Qm94RG9jdW1lbnRVcmk6IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuc2V0KGhhbmRsZSwgbmV3IEJhcnJpZXIoKSk7XG5cblx0XHRjb25zdCBpbnB1dEJveFRleHRNb2RlbFJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShVUkkucmV2aXZlKGlucHV0Qm94RG9jdW1lbnRVcmkpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNYWluVGhyZWFkU0NNUHJvdmlkZXIodGhpcy5fcHJveHksIGhhbmRsZSwgcGFyZW50SGFuZGxlLCBpZCwgbGFiZWwsIHJvb3RVcmkgPyBVUkkucmV2aXZlKHJvb3RVcmkpIDogdW5kZWZpbmVkLCBnZXRJY29uRnJvbUljb25EdG8oaWNvblBhdGgpLCBpc0hpZGRlbiwgaW5wdXRCb3hUZXh0TW9kZWxSZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgdGhpcy5xdWlja0RpZmZTZXJ2aWNlLCB0aGlzLl91cmlJZGVudFNlcnZpY2UsIHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLnNjbVNlcnZpY2UucmVnaXN0ZXJTQ01Qcm92aWRlcihwcm92aWRlcik7XG5cdFx0dGhpcy5fcmVwb3NpdG9yaWVzLnNldChoYW5kbGUsIHJlcG9zaXRvcnkpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdGlucHV0Qm94VGV4dE1vZGVsUmVmLFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuc2NtVmlld1NlcnZpY2Uub25EaWRGb2N1c1JlcG9zaXRvcnksIHIgPT4gciA9PT0gcmVwb3NpdG9yeSkoXyA9PiB0aGlzLl9wcm94eS4kc2V0U2VsZWN0ZWRTb3VyY2VDb250cm9sKGhhbmRsZSkpLFxuXHRcdFx0cmVwb3NpdG9yeS5pbnB1dC5vbkRpZENoYW5nZSgoeyB2YWx1ZSB9KSA9PiB0aGlzLl9wcm94eS4kb25JbnB1dEJveFZhbHVlQ2hhbmdlKGhhbmRsZSwgdmFsdWUpKVxuXHRcdCk7XG5cdFx0dGhpcy5fcmVwb3NpdG9yeURpc3Bvc2FibGVzLnNldChoYW5kbGUsIGRpc3Bvc2FibGUpO1xuXG5cdFx0aWYgKHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXNlZFJlcG9zaXRvcnkgPT09IHJlcG9zaXRvcnkpIHtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fcHJveHkuJHNldFNlbGVjdGVkU291cmNlQ29udHJvbChoYW5kbGUpLCAwKTtcblx0XHR9XG5cblx0XHRpZiAocmVwb3NpdG9yeS5pbnB1dC52YWx1ZSkge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLl9wcm94eS4kb25JbnB1dEJveFZhbHVlQ2hhbmdlKGhhbmRsZSwgcmVwb3NpdG9yeS5pbnB1dC52YWx1ZSksIDApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoaGFuZGxlKT8ub3BlbigpO1xuXHR9XG5cblx0YXN5bmMgJHVwZGF0ZVNvdXJjZUNvbnRyb2woaGFuZGxlOiBudW1iZXIsIGZlYXR1cmVzOiBTQ01Qcm92aWRlckZlYXR1cmVzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChoYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoaGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlciBhcyBNYWluVGhyZWFkU0NNUHJvdmlkZXI7XG5cdFx0cHJvdmlkZXIuJHVwZGF0ZVNvdXJjZUNvbnRyb2woZmVhdHVyZXMpO1xuXHR9XG5cblx0YXN5bmMgJHVucmVnaXN0ZXJTb3VyY2VDb250cm9sKGhhbmRsZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChoYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoaGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcG9zaXRvcnlEaXNwb3NhYmxlcy5nZXQoaGFuZGxlKSEuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcnlEaXNwb3NhYmxlcy5kZWxldGUoaGFuZGxlKTtcblxuXHRcdHJlcG9zaXRvcnkuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcmllcy5kZWxldGUoaGFuZGxlKTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3Rlckdyb3Vwcyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGdyb3VwczogW251bWJlciAvKmhhbmRsZSovLCBzdHJpbmcgLyppZCovLCBzdHJpbmcgLypsYWJlbCovLCBTQ01Hcm91cEZlYXR1cmVzLCAvKiBtdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlcyAqLyBib29sZWFuXVtdLCBzcGxpY2VzOiBTQ01SYXdSZXNvdXJjZVNwbGljZXNbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlciBhcyBNYWluVGhyZWFkU0NNUHJvdmlkZXI7XG5cdFx0cHJvdmlkZXIuJHJlZ2lzdGVyR3JvdXBzKGdyb3Vwcyk7XG5cdFx0cHJvdmlkZXIuJHNwbGljZUdyb3VwUmVzb3VyY2VTdGF0ZXMoc3BsaWNlcyk7XG5cdH1cblxuXHRhc3luYyAkdXBkYXRlR3JvdXAoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBncm91cEhhbmRsZTogbnVtYmVyLCBmZWF0dXJlczogU0NNR3JvdXBGZWF0dXJlcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlciBhcyBNYWluVGhyZWFkU0NNUHJvdmlkZXI7XG5cdFx0cHJvdmlkZXIuJHVwZGF0ZUdyb3VwKGdyb3VwSGFuZGxlLCBmZWF0dXJlcyk7XG5cdH1cblxuXHRhc3luYyAkdXBkYXRlR3JvdXBMYWJlbChzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGdyb3VwSGFuZGxlOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRcdHByb3ZpZGVyLiR1cGRhdGVHcm91cExhYmVsKGdyb3VwSGFuZGxlLCBsYWJlbCk7XG5cdH1cblxuXHRhc3luYyAkc3BsaWNlUmVzb3VyY2VTdGF0ZXMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBzcGxpY2VzOiBTQ01SYXdSZXNvdXJjZVNwbGljZXNbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlciBhcyBNYWluVGhyZWFkU0NNUHJvdmlkZXI7XG5cdFx0cHJvdmlkZXIuJHNwbGljZUdyb3VwUmVzb3VyY2VTdGF0ZXMoc3BsaWNlcyk7XG5cdH1cblxuXHRhc3luYyAkdW5yZWdpc3Rlckdyb3VwKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgaGFuZGxlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRcdHByb3ZpZGVyLiR1bnJlZ2lzdGVyR3JvdXAoaGFuZGxlKTtcblx0fVxuXG5cdGFzeW5jICRzZXRJbnB1dEJveFZhbHVlKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcG9zaXRvcnkuaW5wdXQuc2V0VmFsdWUodmFsdWUsIGZhbHNlKTtcblx0fVxuXG5cdGFzeW5jICRzZXRJbnB1dEJveFBsYWNlaG9sZGVyKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgcGxhY2Vob2xkZXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcG9zaXRvcnkuaW5wdXQucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0fVxuXG5cdGFzeW5jICRzZXRJbnB1dEJveEVuYWJsZW1lbnQoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBlbmFibGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmVwb3NpdG9yeS5pbnB1dC5lbmFibGVkID0gZW5hYmxlZDtcblx0fVxuXG5cdGFzeW5jICRzZXRJbnB1dEJveFZpc2liaWxpdHkoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCB2aXNpYmxlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmVwb3NpdG9yeS5pbnB1dC52aXNpYmxlID0gdmlzaWJsZTtcblx0fVxuXG5cdGFzeW5jICRzaG93VmFsaWRhdGlvbk1lc3NhZ2Uoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIHR5cGU6IElucHV0VmFsaWRhdGlvblR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmVwb3NpdG9yeS5pbnB1dC5zaG93VmFsaWRhdGlvbk1lc3NhZ2UobWVzc2FnZSwgdHlwZSk7XG5cdH1cblxuXHRhc3luYyAkc2V0VmFsaWRhdGlvblByb3ZpZGVySXNFbmFibGVkKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgZW5hYmxlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlbmFibGVkKSB7XG5cdFx0XHRyZXBvc2l0b3J5LmlucHV0LnZhbGlkYXRlSW5wdXQgPSBhc3luYyAodmFsdWUsIHBvcyk6IFByb21pc2U8SUlucHV0VmFsaWRhdGlvbiB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kdmFsaWRhdGVJbnB1dChzb3VyY2VDb250cm9sSGFuZGxlLCB2YWx1ZSwgcG9zKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdCAmJiB7IG1lc3NhZ2U6IHJlc3VsdFswXSwgdHlwZTogcmVzdWx0WzFdIH07XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXBvc2l0b3J5LmlucHV0LnZhbGlkYXRlSW5wdXQgPSBhc3luYyAoKSA9PiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJG9uRGlkQ2hhbmdlSGlzdG9yeVByb3ZpZGVyQ3VycmVudEhpc3RvcnlJdGVtUmVmcyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGhpc3RvcnlJdGVtUmVmPzogU0NNSGlzdG9yeUl0ZW1SZWZEdG8sIGhpc3RvcnlJdGVtUmVtb3RlUmVmPzogU0NNSGlzdG9yeUl0ZW1SZWZEdG8sIGhpc3RvcnlJdGVtQmFzZVJlZj86IFNDTUhpc3RvcnlJdGVtUmVmRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSByZXBvc2l0b3J5LnByb3ZpZGVyIGFzIE1haW5UaHJlYWRTQ01Qcm92aWRlcjtcblx0XHRwcm92aWRlci4kb25EaWRDaGFuZ2VIaXN0b3J5UHJvdmlkZXJDdXJyZW50SGlzdG9yeUl0ZW1SZWZzKGhpc3RvcnlJdGVtUmVmLCBoaXN0b3J5SXRlbVJlbW90ZVJlZiwgaGlzdG9yeUl0ZW1CYXNlUmVmKTtcblx0fVxuXG5cdGFzeW5jICRvbkRpZENoYW5nZUhpc3RvcnlQcm92aWRlckhpc3RvcnlJdGVtUmVmcyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGhpc3RvcnlJdGVtUmVmczogU0NNSGlzdG9yeUl0ZW1SZWZzQ2hhbmdlRXZlbnREdG8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRcdHByb3ZpZGVyLiRvbkRpZENoYW5nZUhpc3RvcnlQcm92aWRlckhpc3RvcnlJdGVtUmVmcyhoaXN0b3J5SXRlbVJlZnMpO1xuXHR9XG5cblx0YXN5bmMgJG9uRGlkQ2hhbmdlQXJ0aWZhY3RzKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgZ3JvdXBzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlciBhcyBNYWluVGhyZWFkU0NNUHJvdmlkZXI7XG5cdFx0cHJvdmlkZXIuJG9uRGlkQ2hhbmdlQXJ0aWZhY3RzKGdyb3Vwcyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLFdBQTBCO0FBQ3BELFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQXNCLGlCQUFpQixxQkFBcUIsbUJBQW1CO0FBQy9FLFNBQXNCLGlCQUFpQixvQkFBb0IsU0FBUyxrQkFBa0I7QUFDdEYsU0FBUyxhQUF1SCx1QkFBd0U7QUFDeE0sU0FBUyxnQkFBbUgsbUJBQThGO0FBRTFOLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW9DLHlCQUF5QjtBQUM3RCxTQUFTLGVBQWU7QUFFeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUIscUJBQXFCLGlDQUFpQztBQUl4RixTQUFTLG1CQUFtQixTQUE4STtBQUN6SyxNQUFJLFlBQVksUUFBVztBQUMxQixXQUFPO0FBQUEsRUFDUixXQUFXLFVBQVUsWUFBWSxPQUFPLEdBQUc7QUFDMUMsV0FBTztBQUFBLEVBQ1IsV0FBVyxnQkFBZ0IsT0FBTyxHQUFHO0FBQ3BDLFdBQU8sSUFBSSxPQUFPLE9BQU87QUFBQSxFQUMxQixPQUFPO0FBQ04sVUFBTSxPQUFPO0FBQ2IsV0FBTyxFQUFFLE9BQU8sSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLE1BQU0sSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFO0FBQUEsRUFDckU7QUFDRDtBQUVBLFNBQVMsa0JBQWtCLGdCQUFvRDtBQUM5RSxRQUFN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
