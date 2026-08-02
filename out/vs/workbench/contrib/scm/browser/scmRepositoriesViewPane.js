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
import "./media/scm.css";
import { localize } from "../../../../nls.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { append, $ } from "../../../../base/browser/dom.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ISCMService, ISCMViewService } from "../common/scm.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { RepositoryActionRunner, RepositoryRenderer } from "./scmRepositoryRenderer.js";
import { collectContextMenuActions, connectPrimaryMenu, getActionViewItemProvider, isSCMArtifactGroupTreeElement, isSCMArtifactNode, isSCMArtifactTreeElement, isSCMRepository } from "./util.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { autorun, observableSignalFromEvent, runOnChange } from "../../../../base/common/observable.js";
import { Sequencer, Throttler } from "../../../../base/common/async.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { SCMViewService } from "./scmViewService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { URI } from "../../../../base/common/uri.js";
import { basename } from "../../../../base/common/resources.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { fromNow } from "../../../../base/common/date.js";
class ListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId(element) {
    if (isSCMRepository(element)) {
      return RepositoryRenderer.TEMPLATE_ID;
    } else if (isSCMArtifactGroupTreeElement(element)) {
      return ArtifactGroupRenderer.TEMPLATE_ID;
    } else if (isSCMArtifactTreeElement(element) || isSCMArtifactNode(element)) {
      return ArtifactRenderer.TEMPLATE_ID;
    } else {
      throw new Error("Invalid tree element");
    }
  }
}
let ArtifactGroupRenderer = class {
  constructor(actionViewItemProvider, _contextMenuService, _contextKeyService, _keybindingService, _menuService, _commandService, _scmViewService, _telemetryService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._commandService = _commandService;
    this._scmViewService = _scmViewService;
    this._telemetryService = _telemetryService;
  }
  get templateId() {
    return ArtifactGroupRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".scm-artifact-group"));
    const icon = append(element, $(".icon"));
    const label = new IconLabel(element, { supportIcons: false });
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider }, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    return { icon, label, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
  }
  renderElement(node, index, templateData) {
    const provider = node.element.repository.provider;
    const artifactGroup = node.element.artifactGroup;
    templateData.icon.className = ThemeIcon.isThemeIcon(artifactGroup.icon) ? `icon ${ThemeIcon.asClassName(artifactGroup.icon)}` : "";
    templateData.label.setLabel(artifactGroup.name);
    const repositoryMenus = this._scmViewService.menus.getRepositoryMenus(provider);
    templateData.elementDisposables.add(connectPrimaryMenu(repositoryMenus.getArtifactGroupMenu(artifactGroup), (primary) => {
      templateData.actionBar.setActions(primary);
    }, "inline", provider));
    templateData.actionBar.context = artifactGroup;
  }
  renderCompressedElements(node, index, templateData, details) {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(element, index, templateData, details) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposable.dispose();
  }
};
ArtifactGroupRenderer.TEMPLATE_ID = "artifactGroup";
ArtifactGroupRenderer = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, ISCMViewService),
  __decorateParam(7, ITelemetryService)
], ArtifactGroupRenderer);
let ArtifactRenderer = class {
  constructor(actionViewItemProvider, _contextMenuService, _contextKeyService, _keybindingService, _menuService, _commandService, _scmViewService, _telemetryService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._commandService = _commandService;
    this._scmViewService = _scmViewService;
    this._telemetryService = _telemetryService;
  }
  get templateId() {
    return ArtifactRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".scm-artifact"));
    const icon = append(element, $(".icon"));
    const label = new IconLabel(element, { supportIcons: false });
    const timestampContainer = append(element, $(".timestamp-container"));
    const timestamp = append(timestampContainer, $(".timestamp"));
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider }, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    return { icon, label, timestampContainer, timestamp, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
  }
  renderElement(nodeOrElement, index, templateData) {
    const artifactOrFolder = nodeOrElement.element;
    if (isSCMArtifactTreeElement(artifactOrFolder)) {
      const artifactGroup = artifactOrFolder.group;
      const artifact = artifactOrFolder.artifact;
      const artifactIcon = artifact.icon ?? artifactOrFolder.group.icon;
      templateData.icon.className = ThemeIcon.isThemeIcon(artifactIcon) ? `icon ${ThemeIcon.asClassName(artifactIcon)}` : "";
      const artifactLabel = artifactGroup.supportsFolders ? artifact.name.split("/").pop() ?? artifact.name : artifact.name;
      templateData.label.setLabel(artifactLabel, artifact.description);
      templateData.timestamp.textContent = artifact.timestamp ? fromNow(artifact.timestamp) : "";
      templateData.timestampContainer.classList.toggle("duplicate", artifactOrFolder.hideTimestamp);
      templateData.timestampContainer.style.display = "";
    } else if (isSCMArtifactNode(artifactOrFolder)) {
      templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
      templateData.label.setLabel(basename(artifactOrFolder.uri));
      templateData.timestamp.textContent = "";
      templateData.timestampContainer.classList.remove("duplicate");
      templateData.timestampContainer.style.display = "none";
    }
    this._renderActionBar(artifactOrFolder, templateData);
  }
  renderCompressedElements(node, index, templateData, details) {
    const compressed = node.element;
    const artifactOrFolder = compressed.elements[compressed.elements.length - 1];
    if (isSCMArtifactTreeElement(artifactOrFolder)) {
      const artifact = artifactOrFolder.artifact;
      const artifactIcon = artifact.icon ?? artifactOrFolder.group.icon;
      templateData.icon.className = ThemeIcon.isThemeIcon(artifactIcon) ? `icon ${ThemeIcon.asClassName(artifactIcon)}` : "";
      templateData.label.setLabel(artifact.name, artifact.description);
      templateData.timestamp.textContent = artifact.timestamp ? fromNow(artifact.timestamp) : "";
      templateData.timestampContainer.classList.toggle("duplicate", artifactOrFolder.hideTimestamp);
      templateData.timestampContainer.style.display = "";
    } else if (isSCMArtifactNode(artifactOrFolder)) {
      templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
      templateData.label.setLabel(artifactOrFolder.uri.fsPath.substring(1));
      templateData.timestamp.textContent = "";
      templateData.timestampContainer.classList.remove("duplicate");
      templateData.timestampContainer.style.display = "none";
    }
    this._renderActionBar(artifactOrFolder, templateData);
  }
  _renderActionBar(artifactOrFolder, templateData) {
    if (isSCMArtifactTreeElement(artifactOrFolder)) {
      const artifact = artifactOrFolder.artifact;
      const provider = artifactOrFolder.repository.provider;
      const repositoryMenus = this._scmViewService.menus.getRepositoryMenus(provider);
      templateData.elementDisposables.add(connectPrimaryMenu(repositoryMenus.getArtifactMenu(artifactOrFolder.group, artifact), (primary) => {
        templateData.actionBar.setActions(primary);
      }, "inline", provider));
      templateData.actionBar.context = artifact;
    } else if (ResourceTree.isResourceNode(artifactOrFolder)) {
      templateData.actionBar.setActions([]);
      templateData.actionBar.context = void 0;
    }
  }
  disposeElement(element, index, templateData, details) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposable.dispose();
  }
};
ArtifactRenderer.TEMPLATE_ID = "artifact";
ArtifactRenderer = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, ISCMViewService),
  __decorateParam(7, ITelemetryService)
], ArtifactRenderer);
let RepositoryTreeDataSource = class extends Disposable {
  constructor(scmViewService) {
    super();
    this.scmViewService = scmViewService;
  }
  async getChildren(inputOrElement) {
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      const parentId = isSCMRepository(inputOrElement) ? inputOrElement.provider.id : void 0;
      const repositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === parentId);
      return repositories;
    }
    if (inputOrElement instanceof SCMViewService) {
      const repositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === void 0);
      if (repositories.length !== this.scmViewService.repositories.length) {
        for (const repository of repositories) {
          const childRepositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === repository.provider.id);
          if (childRepositories.length === 0) {
            continue;
          }
          const repositoryIndex = repositories.indexOf(repository);
          repositories.splice(repositoryIndex + 1, 0, ...childRepositories);
        }
      }
      return repositories;
    } else if (isSCMRepository(inputOrElement)) {
      const artifactGroups = await inputOrElement.provider.artifactProvider.get()?.provideArtifactGroups() ?? [];
      return artifactGroups.map((group) => ({
        repository: inputOrElement,
        artifactGroup: group,
        type: "artifactGroup"
      }));
    } else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
      const repository = inputOrElement.repository;
      const artifacts = await repository.provider.artifactProvider.get()?.provideArtifacts(inputOrElement.artifactGroup.id) ?? [];
      if (inputOrElement.artifactGroup.supportsFolders) {
        const artifactsTree = new ResourceTree(inputOrElement);
        for (let index = 0; index < artifacts.length; index++) {
          const artifact = artifacts[index];
          const artifactUri = URI.from({ scheme: "scm-artifact", path: artifact.name });
          const artifactDirectory = artifact.id.lastIndexOf("/") > 0 ? artifact.id.substring(0, artifact.id.lastIndexOf("/")) : artifact.id;
          const prevArtifact = index > 0 ? artifacts[index - 1] : void 0;
          const prevArtifactDirectory = prevArtifact && prevArtifact.id.lastIndexOf("/") > 0 ? prevArtifact.id.substring(0, prevArtifact.id.lastIndexOf("/")) : prevArtifact?.id;
          const hideTimestamp = index > 0 && artifact.timestamp !== void 0 && prevArtifact?.timestamp !== void 0 && artifactDirectory === prevArtifactDirectory && fromNow(prevArtifact.timestamp) === fromNow(artifact.timestamp);
          artifactsTree.add(artifactUri, {
            repository,
            group: inputOrElement.artifactGroup,
            artifact,
            hideTimestamp,
            type: "artifact"
          });
        }
        return Iterable.map(artifactsTree.root.children, (node) => node.element ?? node);
      }
      return artifacts.map((artifact, index, artifacts2) => ({
        repository,
        group: inputOrElement.artifactGroup,
        artifact,
        hideTimestamp: index > 0 && artifact.timestamp !== void 0 && artifacts2[index - 1].timestamp !== void 0 && fromNow(artifacts2[index - 1].timestamp) === fromNow(artifact.timestamp),
        type: "artifact"
      }));
    } else if (isSCMArtifactNode(inputOrElement)) {
      return Iterable.map(
        inputOrElement.children,
        (node) => node.element && node.childrenCount === 0 ? node.element : node
      );
    }
    return [];
  }
  hasChildren(inputOrElement) {
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      const parentId = isSCMRepository(inputOrElement) ? inputOrElement.provider.id : void 0;
      const repositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === parentId);
      return repositories.length > 0;
    }
    if (inputOrElement instanceof SCMViewService) {
      return this.scmViewService.repositories.length > 0;
    } else if (isSCMRepository(inputOrElement)) {
      return true;
    } else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
      return true;
    } else if (isSCMArtifactTreeElement(inputOrElement)) {
      return false;
    } else if (isSCMArtifactNode(inputOrElement)) {
      return inputOrElement.childrenCount > 0;
    } else {
      return false;
    }
  }
};
RepositoryTreeDataSource = __decorateClass([
  __decorateParam(0, ISCMViewService)
], RepositoryTreeDataSource);
class RepositoryTreeIdentityProvider {
  getId(element) {
    if (isSCMRepository(element)) {
      return `repo:${element.provider.id}`;
    } else if (isSCMArtifactGroupTreeElement(element)) {
      return `artifactGroup:${element.repository.provider.id}/${element.artifactGroup.id}`;
    } else if (isSCMArtifactTreeElement(element)) {
      return `artifact:${element.repository.provider.id}/${element.group.id}/${element.artifact.id}`;
    } else if (isSCMArtifactNode(element)) {
      return `artifactFolder:${element.context.repository.provider.id}/${element.context.artifactGroup.id}/${element.uri.fsPath}`;
    } else {
      throw new Error("Invalid tree element");
    }
  }
}
class RepositoriesTreeCompressionDelegate {
  isIncompressible(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.childrenCount > 1;
    } else {
      return true;
    }
  }
}
let SCMRepositoriesViewPane = class extends ViewPane {
  constructor(options, scmService, scmViewService, keybindingService, contextMenuService, commandService, instantiationService, viewDescriptorService, contextKeyService, configurationService, openerService, themeService, hoverService, storageService) {
    super({ ...options, titleMenuId: MenuId.SCMSourceControlTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.scmService = scmService;
    this.scmViewService = scmViewService;
    this.commandService = commandService;
    this.storageService = storageService;
    this.treeOperationSequencer = new Sequencer();
    this.updateChildrenThrottler = new Throttler();
    this.visibilityDisposables = new DisposableStore();
    this.repositoryDisposables = new DisposableMap();
    this.visibleCountObs = observableConfigValue("scm.repositories.visible", 10, this.configurationService);
    this.providerCountBadgeObs = observableConfigValue("scm.providerCountBadge", "hidden", this.configurationService);
    this.storageService.onWillSaveState(() => {
      this.storeTreeViewState();
    }, this, this._store);
    this._register(this.updateChildrenThrottler);
  }
  renderBody(container) {
    super.renderBody(container);
    const treeContainer = append(container, $(".scm-view.scm-repositories-view"));
    this._register(autorun((reader) => {
      const providerCountBadge = this.providerCountBadgeObs.read(reader);
      treeContainer.classList.toggle("hide-provider-counts", providerCountBadge === "hidden");
      treeContainer.classList.toggle("auto-provider-counts", providerCountBadge === "auto");
    }));
    const viewState = this.loadTreeViewState();
    this.createTree(treeContainer, viewState);
    this.onDidChangeBodyVisibility(async (visible) => {
      if (!visible) {
        this.visibilityDisposables.clear();
        return;
      }
      this.treeOperationSequencer.queue(async () => {
        await this.tree.setInput(this.scmViewService, viewState);
        this.visibilityDisposables.add(autorun((reader) => {
          const visibleCount = this.visibleCountObs.read(reader);
          this.updateBodySize(this.tree.contentHeight, visibleCount);
        }));
        this.visibilityDisposables.add(runOnChange(this.scmViewService.explorerEnabledConfig, async () => {
          await this.updateChildren();
          this.updateBodySize(this.tree.contentHeight);
          if (this.scmViewService.repositories.length === 1) {
            await this.treeOperationSequencer.queue(() => this.tree.expand(this.scmViewService.repositories[0]));
          }
        }));
        const onDidChangeVisibleRepositoriesSignal = observableSignalFromEvent(
          this,
          this.scmViewService.onDidChangeVisibleRepositories
        );
        this.visibilityDisposables.add(autorun(async (reader) => {
          onDidChangeVisibleRepositoriesSignal.read(reader);
          await this.treeOperationSequencer.queue(() => this.updateTreeSelection());
        }));
        this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.visibilityDisposables);
        this.scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.visibilityDisposables);
        for (const repository of this.scmService.repositories) {
          this.onDidAddRepository(repository);
        }
        this.visibilityDisposables.add(autorun(async (reader) => {
          const explorerEnabledConfig = this.scmViewService.explorerEnabledConfig.read(reader);
          const didFinishLoadingRepositories = this.scmViewService.didFinishLoadingRepositories.read(reader);
          if (viewState === void 0 && explorerEnabledConfig && didFinishLoadingRepositories && this.scmViewService.repositories.length === 1) {
            await this.treeOperationSequencer.queue(() => this.tree.expand(this.scmViewService.repositories[0]));
          }
        }));
      });
    }, this, this._store);
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  createTree(container, viewState) {
    this.treeIdentityProvider = new RepositoryTreeIdentityProvider();
    this.treeDataSource = this.instantiationService.createInstance(RepositoryTreeDataSource);
    this._register(this.treeDataSource);
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SCM Repositories",
      container,
      new ListDelegate(),
      new RepositoriesTreeCompressionDelegate(),
      [
        this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMSourceControlInline, getActionViewItemProvider(this.instantiationService)),
        this.instantiationService.createInstance(ArtifactGroupRenderer, getActionViewItemProvider(this.instantiationService)),
        this.instantiationService.createInstance(ArtifactRenderer, getActionViewItemProvider(this.instantiationService))
      ],
      this.treeDataSource,
      {
        identityProvider: this.treeIdentityProvider,
        horizontalScrolling: false,
        collapseByDefault: (e) => {
          if (this.scmViewService.explorerEnabledConfig.get() === false) {
            if (isSCMRepository(e) && e.provider.parentId === void 0) {
              return false;
            }
            return true;
          }
          if (viewState?.expanded && (isSCMRepository(e) || isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e))) {
            return viewState.expanded.indexOf(this.treeIdentityProvider.getId(e)) === -1;
          } else if (isSCMArtifactNode(e)) {
            return !(e.childrenCount === 1 && Iterable.first(e.children)?.element === void 0);
          } else {
            return true;
          }
        },
        compressionEnabled: true,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        multipleSelectionSupport: this.scmViewService.selectionModeConfig.get() === "multiple",
        expandOnDoubleClick: true,
        expandOnlyOnTwistieClick: true,
        accessibilityProvider: {
          getAriaLabel(element) {
            if (isSCMRepository(element)) {
              return element.provider.label;
            } else if (isSCMArtifactGroupTreeElement(element)) {
              return element.artifactGroup.name;
            } else if (isSCMArtifactTreeElement(element)) {
              return element.artifact.name;
            } else {
              return "";
            }
          },
          getWidgetAriaLabel() {
            return localize("scm", "Source Control Repositories");
          }
        }
      }
    );
    this._register(this.tree);
    this._register(autorun((reader) => {
      const selectionMode = this.scmViewService.selectionModeConfig.read(reader);
      this.tree.updateOptions({ multipleSelectionSupport: selectionMode === "multiple" });
    }));
    this._register(this.tree.onDidOpen(this.onTreeDidOpen, this));
    this._register(this.tree.onDidChangeSelection(this.onTreeSelectionChange, this));
    this._register(this.tree.onDidChangeFocus(this.onTreeDidChangeFocus, this));
    this._register(this.tree.onDidFocus(this.onDidTreeFocus, this));
    this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
    this._register(this.tree.onDidChangeContentHeight(this.onTreeContentHeightChange, this));
  }
  async onDidAddRepository(repository) {
    const disposables = new DisposableStore();
    disposables.add(autorun(async (reader) => {
      const explorerEnabled = this.scmViewService.explorerEnabledConfig.read(reader);
      const artifactsProvider = repository.provider.artifactProvider.read(reader);
      if (!explorerEnabled || !artifactsProvider) {
        return;
      }
      reader.store.add(artifactsProvider.onDidChangeArtifacts(async (groups) => {
        await this.updateRepository(repository);
      }));
    }));
    disposables.add(autorun(async (reader) => {
      const historyProvider = repository.provider.historyProvider.read(reader);
      if (!historyProvider) {
        return;
      }
      reader.store.add(runOnChange(historyProvider.historyItemRef, async () => {
        await this.updateRepository(repository);
      }));
    }));
    await this.updateRepository(repository);
    this.repositoryDisposables.set(repository, disposables);
  }
  async onDidRemoveRepository(repository) {
    await this.updateRepository(repository);
    this.repositoryDisposables.deleteAndDispose(repository);
  }
  onTreeDidOpen(e) {
    if (!e.element || !isSCMArtifactTreeElement(e.element) || !e.element.artifact.command) {
      return;
    }
    this.commandService.executeCommand(e.element.artifact.command.id, e.element.repository.provider, e.element.artifact);
  }
  onTreeContextMenu(e) {
    if (!e.element) {
      return;
    }
    if (isSCMRepository(e.element)) {
      const provider = e.element.provider;
      const menus = this.scmViewService.menus.getRepositoryMenus(provider);
      const menu = menus.getRepositoryContextMenu(e.element);
      const actions = collectContextMenuActions(menu);
      const disposables = new DisposableStore();
      const actionRunner = new RepositoryActionRunner(() => {
        return this.getTreeSelection();
      });
      disposables.add(actionRunner);
      disposables.add(actionRunner.onWillRun(() => this.tree.domFocus()));
      this.contextMenuService.showContextMenu({
        actionRunner,
        getAnchor: () => e.anchor,
        getActions: () => actions,
        getActionsContext: () => provider,
        onHide: () => disposables.dispose()
      });
    } else if (isSCMArtifactTreeElement(e.element)) {
      const provider = e.element.repository.provider;
      const artifact = e.element.artifact;
      const menus = this.scmViewService.menus.getRepositoryMenus(provider);
      const menu = menus.getArtifactMenu(e.element.group, artifact);
      const actions = collectContextMenuActions(menu, provider);
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions,
        getActionsContext: () => artifact
      });
    }
  }
  onTreeSelectionChange(e) {
    if (e.browserEvent && e.elements.length > 0) {
      const scrollTop = this.tree.scrollTop;
      if (e.elements.every((e2) => isSCMRepository(e2))) {
        this.scmViewService.visibleRepositories = e.elements;
      } else if (e.elements.every((e2) => isSCMArtifactGroupTreeElement(e2) || isSCMArtifactTreeElement(e2))) {
        this.scmViewService.visibleRepositories = e.elements.map((e2) => e2.repository);
      }
      this.tree.scrollTop = scrollTop;
    }
  }
  onTreeDidChangeFocus(e) {
    if (e.browserEvent && e.elements.length > 0) {
      if (isSCMRepository(e.elements[0])) {
        this.scmViewService.focus(e.elements[0]);
      }
    }
  }
  onDidTreeFocus() {
    const focused = this.tree.getFocus();
    if (focused.length > 0) {
      if (isSCMRepository(focused[0])) {
        this.scmViewService.focus(focused[0]);
      } else if (isSCMArtifactGroupTreeElement(focused[0]) || isSCMArtifactTreeElement(focused[0])) {
        this.scmViewService.focus(focused[0].repository);
      }
    }
  }
  onTreeContentHeightChange(height) {
    this.updateBodySize(height);
    this.treeOperationSequencer.queue(() => this.updateTreeSelection());
  }
  async updateChildren(element) {
    return this.updateChildrenThrottler.queue(
      () => this.treeOperationSequencer.queue(async () => {
        if (element && this.tree.hasNode(element)) {
          await this.tree.updateChildren(element, true);
        } else {
          await this.tree.updateChildren(void 0, true);
        }
      })
    );
  }
  async expand(element) {
    await this.treeOperationSequencer.queue(() => this.tree.expand(element, true));
  }
  async updateRepository(repository) {
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      if (repository.provider.parentId === void 0) {
        await this.updateChildren();
        return;
      }
      await this.updateParentRepository(repository);
    }
    await this.updateChildren();
  }
  async updateParentRepository(repository) {
    const parentRepository = this.scmViewService.repositories.find((r) => r.provider.id === repository.provider.parentId);
    if (!parentRepository) {
      return;
    }
    await this.updateChildren(parentRepository);
    await this.expand(parentRepository);
  }
  updateBodySize(contentHeight, visibleCount) {
    if (this.orientation === Orientation.HORIZONTAL) {
      return;
    }
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      visibleCount = visibleCount ?? this.visibleCountObs.get();
      const empty = this.scmViewService.repositories.length === 0;
      const size = Math.min(contentHeight / 22, visibleCount) * 22;
      this.minimumBodySize = visibleCount === 0 ? 22 : size;
      this.maximumBodySize = visibleCount === 0 ? Number.POSITIVE_INFINITY : empty ? Number.POSITIVE_INFINITY : size;
    } else {
      this.minimumBodySize = 120;
      this.maximumBodySize = Number.POSITIVE_INFINITY;
    }
  }
  async updateTreeSelection() {
    const oldSelection = this.getTreeSelection();
    const oldSet = new Set(oldSelection);
    const set = new Set(this.scmViewService.visibleRepositories);
    const added = new Set(Iterable.filter(set, (r) => !oldSet.has(r)));
    const removed = new Set(Iterable.filter(oldSet, (r) => !set.has(r)));
    if (added.size === 0 && removed.size === 0) {
      return;
    }
    const selection = oldSelection.filter((repo) => !removed.has(repo));
    for (const repo of this.scmViewService.repositories) {
      if (added.has(repo)) {
        selection.push(repo);
      }
    }
    const visibleSelection = selection.filter((s) => this.tree.hasNode(s));
    this.tree.setSelection(visibleSelection);
    if (visibleSelection.length > 0 && !this.tree.getFocus().includes(visibleSelection[0])) {
      this.tree.setAnchor(visibleSelection[0]);
      this.tree.setFocus([visibleSelection[0]]);
    }
  }
  getTreeSelection() {
    return this.tree.getSelection().map((e) => {
      if (isSCMRepository(e)) {
        return e;
      } else if (isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e)) {
        return e.repository;
      } else if (isSCMArtifactNode(e)) {
        return e.context.repository;
      } else {
        throw new Error("Invalid tree element");
      }
    });
  }
  loadTreeViewState() {
    const storageViewState = this.storageService.get("scm.repositoriesViewState", StorageScope.WORKSPACE);
    if (!storageViewState) {
      return void 0;
    }
    try {
      const treeViewState = JSON.parse(storageViewState);
      return treeViewState;
    } catch {
      return void 0;
    }
  }
  storeTreeViewState() {
    if (this.tree) {
      this.storageService.store("scm.repositoriesViewState", JSON.stringify(this.tree.getViewState()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  dispose() {
    this.visibilityDisposables.dispose();
    this.repositoryDisposables.dispose();
    super.dispose();
  }
};
SCMRepositoriesViewPane = __decorateClass([
  __decorateParam(1, ISCMService),
  __decorateParam(2, ISCMViewService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, IStorageService)
], SCMRepositoriesViewPane);
export {
  SCMRepositoriesViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbVJlcG9zaXRvcmllc1ZpZXdQYW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3NjbS5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IGFwcGVuZCwgJCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUsIElJZGVudGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZUV2ZW50LCBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlTm9kZSwgSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgSU9wZW5FdmVudCwgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU0NNUmVwb3NpdG9yeSwgSVNDTVNlcnZpY2UsIElTQ01WaWV3U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFJlcG9zaXRvcnlBY3Rpb25SdW5uZXIsIFJlcG9zaXRvcnlSZW5kZXJlciB9IGZyb20gJy4vc2NtUmVwb3NpdG9yeVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGNvbGxlY3RDb250ZXh0TWVudUFjdGlvbnMsIGNvbm5lY3RQcmltYXJ5TWVudSwgZ2V0QWN0aW9uVmlld0l0ZW1Qcm92aWRlciwgaXNTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQsIGlzU0NNQXJ0aWZhY3ROb2RlLCBpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQsIGlzU0NNUmVwb3NpdG9yeSB9IGZyb20gJy4vdXRpbC5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudCwgU0NNQXJ0aWZhY3RUcmVlRWxlbWVudCB9IGZyb20gJy4uL2NvbW1vbi9hcnRpZmFjdC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnV6enlTY29yZXIuanMnO1xuaW1wb3J0IHsgSWNvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWwuanMnO1xuaW1wb3J0IHsgU0NNVmlld1NlcnZpY2UgfSBmcm9tICcuL3NjbVZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTm9kZSwgUmVzb3VyY2VUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VUcmVlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSwgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuXG50eXBlIFRyZWVFbGVtZW50ID0gSVNDTVJlcG9zaXRvcnkgfCBTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQgfCBTQ01BcnRpZmFjdFRyZWVFbGVtZW50IHwgSVJlc291cmNlTm9kZTxTQ01BcnRpZmFjdFRyZWVFbGVtZW50LCBTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQ+O1xuXG5jbGFzcyBMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJU0NNUmVwb3NpdG9yeT4ge1xuXG5cdGdldEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBSZXBvc2l0b3J5UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEFydGlmYWN0R3JvdXBSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChlbGVtZW50KSB8fCBpc1NDTUFydGlmYWN0Tm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEFydGlmYWN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0cmVlIGVsZW1lbnQnKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIEFydGlmYWN0R3JvdXBUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSWNvbkxhYmVsO1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IFdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSB0ZW1wbGF0ZURpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xufVxuXG5jbGFzcyBBcnRpZmFjdEdyb3VwUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudCwgRnV6enlTY29yZSwgQXJ0aWZhY3RHcm91cFRlbXBsYXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2FydGlmYWN0R3JvdXAnO1xuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gQXJ0aWZhY3RHcm91cFJlbmRlcmVyLlRFTVBMQVRFX0lEOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogQXJ0aWZhY3RHcm91cFRlbXBsYXRlIHtcblx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNjbS1hcnRpZmFjdC1ncm91cCcpKTtcblx0XHRjb25zdCBpY29uID0gYXBwZW5kKGVsZW1lbnQsICQoJy5pY29uJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gbmV3IEljb25MYWJlbChlbGVtZW50LCB7IHN1cHBvcnRJY29uczogZmFsc2UgfSk7XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBXb3JrYmVuY2hUb29sQmFyKGFjdGlvbnNDb250YWluZXIsIHsgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0sIHRoaXMuX21lbnVTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29tbWFuZFNlcnZpY2UsIHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHsgaWNvbiwgbGFiZWwsIGFjdGlvbkJhciwgZWxlbWVudERpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksIHRlbXBsYXRlRGlzcG9zYWJsZTogY29tYmluZWREaXNwb3NhYmxlKGxhYmVsLCBhY3Rpb25CYXIpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEFydGlmYWN0R3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbm9kZS5lbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0Y29uc3QgYXJ0aWZhY3RHcm91cCA9IG5vZGUuZWxlbWVudC5hcnRpZmFjdEdyb3VwO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKGFydGlmYWN0R3JvdXAuaWNvbilcblx0XHRcdD8gYGljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoYXJ0aWZhY3RHcm91cC5pY29uKX1gXG5cdFx0XHQ6ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChhcnRpZmFjdEdyb3VwLm5hbWUpO1xuXG5cdFx0Y29uc3QgcmVwb3NpdG9yeU1lbnVzID0gdGhpcy5fc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKHByb3ZpZGVyKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChjb25uZWN0UHJpbWFyeU1lbnUocmVwb3NpdG9yeU1lbnVzLmdldEFydGlmYWN0R3JvdXBNZW51KGFydGlmYWN0R3JvdXApLCBwcmltYXJ5ID0+IHtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuc2V0QWN0aW9ucyhwcmltYXJ5KTtcblx0XHR9LCAnaW5saW5lJywgcHJvdmlkZXIpKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBhcnRpZmFjdEdyb3VwO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudD4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEFydGlmYWN0R3JvdXBUZW1wbGF0ZSwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBuZXZlciBoYXBwZW4gc2luY2Ugbm9kZSBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQXJ0aWZhY3RHcm91cFRlbXBsYXRlLCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IEFydGlmYWN0R3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBBcnRpZmFjdFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBJY29uTGFiZWw7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogV29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG59XG5cbmNsYXNzIEFydGlmYWN0UmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQgfCBJUmVzb3VyY2VOb2RlPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQsIFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudD4sIEZ1enp5U2NvcmUsIEFydGlmYWN0VGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYXJ0aWZhY3QnO1xuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gQXJ0aWZhY3RSZW5kZXJlci5URU1QTEFURV9JRDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVNDTVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEFydGlmYWN0VGVtcGxhdGUge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2NtLWFydGlmYWN0JykpO1xuXHRcdGNvbnN0IGljb24gPSBhcHBlbmQoZWxlbWVudCwgJCgnLmljb24nKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBuZXcgSWNvbkxhYmVsKGVsZW1lbnQsIHsgc3VwcG9ydEljb25zOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IHRpbWVzdGFtcENvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcudGltZXN0YW1wLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCB0aW1lc3RhbXAgPSBhcHBlbmQodGltZXN0YW1wQ29udGFpbmVyLCAkKCcudGltZXN0YW1wJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgV29ya2JlbmNoVG9vbEJhcihhY3Rpb25zQ29udGFpbmVyLCB7IGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9LCB0aGlzLl9tZW51U2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLCB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdHJldHVybiB7IGljb24sIGxhYmVsLCB0aW1lc3RhbXBDb250YWluZXIsIHRpbWVzdGFtcCwgYWN0aW9uQmFyLCBlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSwgdGVtcGxhdGVEaXNwb3NhYmxlOiBjb21iaW5lZERpc3Bvc2FibGUobGFiZWwsIGFjdGlvbkJhcikgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZU9yRWxlbWVudDogSVRyZWVOb2RlPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQgfCBJUmVzb3VyY2VOb2RlPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQsIFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudD4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEFydGlmYWN0VGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBhcnRpZmFjdE9yRm9sZGVyID0gbm9kZU9yRWxlbWVudC5lbGVtZW50O1xuXG5cdFx0Ly8gTGFiZWxcblx0XHRpZiAoaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGFydGlmYWN0T3JGb2xkZXIpKSB7XG5cdFx0XHQvLyBBcnRpZmFjdFxuXHRcdFx0Y29uc3QgYXJ0aWZhY3RHcm91cCA9IGFydGlmYWN0T3JGb2xkZXIuZ3JvdXA7XG5cdFx0XHRjb25zdCBhcnRpZmFjdCA9IGFydGlmYWN0T3JGb2xkZXIuYXJ0aWZhY3Q7XG5cblx0XHRcdGNvbnN0IGFydGlmYWN0SWNvbiA9IGFydGlmYWN0Lmljb24gPz8gYXJ0aWZhY3RPckZvbGRlci5ncm91cC5pY29uO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKGFydGlmYWN0SWNvbilcblx0XHRcdFx0PyBgaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShhcnRpZmFjdEljb24pfWBcblx0XHRcdFx0OiAnJztcblxuXHRcdFx0Y29uc3QgYXJ0aWZhY3RMYWJlbCA9IGFydGlmYWN0R3JvdXAuc3VwcG9ydHNGb2xkZXJzXG5cdFx0XHRcdD8gYXJ0aWZhY3QubmFtZS5zcGxpdCgnLycpLnBvcCgpID8/IGFydGlmYWN0Lm5hbWVcblx0XHRcdFx0OiBhcnRpZmFjdC5uYW1lO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGFydGlmYWN0TGFiZWwsIGFydGlmYWN0LmRlc2NyaXB0aW9uKTtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcC50ZXh0Q29udGVudCA9IGFydGlmYWN0LnRpbWVzdGFtcCA/IGZyb21Ob3coYXJ0aWZhY3QudGltZXN0YW1wKSA6ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkdXBsaWNhdGUnLCBhcnRpZmFjdE9yRm9sZGVyLmhpZGVUaW1lc3RhbXApO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0Tm9kZShhcnRpZmFjdE9yRm9sZGVyKSkge1xuXHRcdFx0Ly8gRm9sZGVyXG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBgaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmZvbGRlcil9YDtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChiYXNlbmFtZShhcnRpZmFjdE9yRm9sZGVyLnVyaSkpO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2R1cGxpY2F0ZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIEFjdGlvbnNcblx0XHR0aGlzLl9yZW5kZXJBY3Rpb25CYXIoYXJ0aWZhY3RPckZvbGRlciwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxTQ01BcnRpZmFjdFRyZWVFbGVtZW50IHwgSVJlc291cmNlTm9kZTxTQ01BcnRpZmFjdFRyZWVFbGVtZW50LCBTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQ+PiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQXJ0aWZhY3RUZW1wbGF0ZSwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wcmVzc2VkID0gbm9kZS5lbGVtZW50O1xuXHRcdGNvbnN0IGFydGlmYWN0T3JGb2xkZXIgPSBjb21wcmVzc2VkLmVsZW1lbnRzW2NvbXByZXNzZWQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cblx0XHQvLyBMYWJlbFxuXHRcdGlmIChpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoYXJ0aWZhY3RPckZvbGRlcikpIHtcblx0XHRcdC8vIEFydGlmYWN0XG5cdFx0XHRjb25zdCBhcnRpZmFjdCA9IGFydGlmYWN0T3JGb2xkZXIuYXJ0aWZhY3Q7XG5cblx0XHRcdGNvbnN0IGFydGlmYWN0SWNvbiA9IGFydGlmYWN0Lmljb24gPz8gYXJ0aWZhY3RPckZvbGRlci5ncm91cC5pY29uO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKGFydGlmYWN0SWNvbilcblx0XHRcdFx0PyBgaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShhcnRpZmFjdEljb24pfWBcblx0XHRcdFx0OiAnJztcblxuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGFydGlmYWN0Lm5hbWUsIGFydGlmYWN0LmRlc2NyaXB0aW9uKTtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcC50ZXh0Q29udGVudCA9IGFydGlmYWN0LnRpbWVzdGFtcCA/IGZyb21Ob3coYXJ0aWZhY3QudGltZXN0YW1wKSA6ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkdXBsaWNhdGUnLCBhcnRpZmFjdE9yRm9sZGVyLmhpZGVUaW1lc3RhbXApO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0Tm9kZShhcnRpZmFjdE9yRm9sZGVyKSkge1xuXHRcdFx0Ly8gRm9sZGVyXG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBgaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmZvbGRlcil9YDtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChhcnRpZmFjdE9yRm9sZGVyLnVyaS5mc1BhdGguc3Vic3RyaW5nKDEpKTtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdkdXBsaWNhdGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS50aW1lc3RhbXBDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBBY3Rpb25zXG5cdFx0dGhpcy5fcmVuZGVyQWN0aW9uQmFyKGFydGlmYWN0T3JGb2xkZXIsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJBY3Rpb25CYXIoYXJ0aWZhY3RPckZvbGRlcjogU0NNQXJ0aWZhY3RUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCwgU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50PiwgdGVtcGxhdGVEYXRhOiBBcnRpZmFjdFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0aWYgKGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChhcnRpZmFjdE9yRm9sZGVyKSkge1xuXHRcdFx0Y29uc3QgYXJ0aWZhY3QgPSBhcnRpZmFjdE9yRm9sZGVyLmFydGlmYWN0O1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBhcnRpZmFjdE9yRm9sZGVyLnJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5TWVudXMgPSB0aGlzLl9zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMocHJvdmlkZXIpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoY29ubmVjdFByaW1hcnlNZW51KHJlcG9zaXRvcnlNZW51cy5nZXRBcnRpZmFjdE1lbnUoYXJ0aWZhY3RPckZvbGRlci5ncm91cCwgYXJ0aWZhY3QpLCBwcmltYXJ5ID0+IHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKHByaW1hcnkpO1xuXHRcdFx0fSwgJ2lubGluZScsIHByb3ZpZGVyKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBhcnRpZmFjdDtcblx0XHR9IGVsc2UgaWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShhcnRpZmFjdE9yRm9sZGVyKSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKFtdKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCwgU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50PiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQXJ0aWZhY3RUZW1wbGF0ZSwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBBcnRpZmFjdFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgUmVwb3NpdG9yeVRyZWVEYXRhU291cmNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8SVNDTVZpZXdTZXJ2aWNlLCBUcmVlRWxlbWVudD4ge1xuXHRjb25zdHJ1Y3RvcihASVNDTVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihpbnB1dE9yRWxlbWVudDogSVNDTVZpZXdTZXJ2aWNlIHwgVHJlZUVsZW1lbnQpOiBQcm9taXNlPEl0ZXJhYmxlPFRyZWVFbGVtZW50Pj4ge1xuXHRcdGlmICh0aGlzLnNjbVZpZXdTZXJ2aWNlLmV4cGxvcmVyRW5hYmxlZENvbmZpZy5nZXQoKSA9PT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IHBhcmVudElkID0gaXNTQ01SZXBvc2l0b3J5KGlucHV0T3JFbGVtZW50KVxuXHRcdFx0XHQ/IGlucHV0T3JFbGVtZW50LnByb3ZpZGVyLmlkXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCByZXBvc2l0b3JpZXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllc1xuXHRcdFx0XHQuZmlsdGVyKHIgPT4gci5wcm92aWRlci5wYXJlbnRJZCA9PT0gcGFyZW50SWQpO1xuXG5cdFx0XHRyZXR1cm4gcmVwb3NpdG9yaWVzO1xuXHRcdH1cblxuXHRcdC8vIEV4cGxvcmVyIG1vZGVcblx0XHRpZiAoaW5wdXRPckVsZW1lbnQgaW5zdGFuY2VvZiBTQ01WaWV3U2VydmljZSkge1xuXHRcdFx0Ly8gR2V0IGFsbCB0b3AgbGV2ZWwgcmVwb3NpdG9yaWVzXG5cdFx0XHRjb25zdCByZXBvc2l0b3JpZXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllc1xuXHRcdFx0XHQuZmlsdGVyKHIgPT4gci5wcm92aWRlci5wYXJlbnRJZCA9PT0gdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gQ2hlY2sgd2hldGhlciB0aGVyZSBhcmUgYW55IGNoaWxkIHJlcG9zaXRvcmllc1xuXHRcdFx0aWYgKHJlcG9zaXRvcmllcy5sZW5ndGggIT09IHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzLmxlbmd0aCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgcmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRSZXBvc2l0b3JpZXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllc1xuXHRcdFx0XHRcdFx0LmZpbHRlcihyID0+IHIucHJvdmlkZXIucGFyZW50SWQgPT09IHJlcG9zaXRvcnkucHJvdmlkZXIuaWQpO1xuXG5cdFx0XHRcdFx0aWYgKGNoaWxkUmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gSW5zZXJ0IGNoaWxkIHJlcG9zaXRvcmllcyByaWdodCBhZnRlciB0aGUgcGFyZW50XG5cdFx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeUluZGV4ID0gcmVwb3NpdG9yaWVzLmluZGV4T2YocmVwb3NpdG9yeSk7XG5cdFx0XHRcdFx0cmVwb3NpdG9yaWVzLnNwbGljZShyZXBvc2l0b3J5SW5kZXggKyAxLCAwLCAuLi5jaGlsZFJlcG9zaXRvcmllcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlcG9zaXRvcmllcztcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGFydGlmYWN0R3JvdXBzID0gYXdhaXQgaW5wdXRPckVsZW1lbnQucHJvdmlkZXIuYXJ0aWZhY3RQcm92aWRlci5nZXQoKT8ucHJvdmlkZUFydGlmYWN0R3JvdXBzKCkgPz8gW107XG5cdFx0XHRyZXR1cm4gYXJ0aWZhY3RHcm91cHMubWFwKGdyb3VwID0+ICh7XG5cdFx0XHRcdHJlcG9zaXRvcnk6IGlucHV0T3JFbGVtZW50LFxuXHRcdFx0XHRhcnRpZmFjdEdyb3VwOiBncm91cCxcblx0XHRcdFx0dHlwZTogJ2FydGlmYWN0R3JvdXAnXG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudChpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBpbnB1dE9yRWxlbWVudC5yZXBvc2l0b3J5O1xuXHRcdFx0Y29uc3QgYXJ0aWZhY3RzID0gYXdhaXQgcmVwb3NpdG9yeS5wcm92aWRlci5hcnRpZmFjdFByb3ZpZGVyLmdldCgpPy5wcm92aWRlQXJ0aWZhY3RzKGlucHV0T3JFbGVtZW50LmFydGlmYWN0R3JvdXAuaWQpID8/IFtdO1xuXG5cdFx0XHRpZiAoaW5wdXRPckVsZW1lbnQuYXJ0aWZhY3RHcm91cC5zdXBwb3J0c0ZvbGRlcnMpIHtcblx0XHRcdFx0Ly8gUmVzb3VyY2UgdHJlZSBmb3IgYXJ0aWZhY3RzXG5cdFx0XHRcdGNvbnN0IGFydGlmYWN0c1RyZWUgPSBuZXcgUmVzb3VyY2VUcmVlPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQsIFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudD4oaW5wdXRPckVsZW1lbnQpO1xuXHRcdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYXJ0aWZhY3RzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0XHRcdGNvbnN0IGFydGlmYWN0ID0gYXJ0aWZhY3RzW2luZGV4XTtcblx0XHRcdFx0XHRjb25zdCBhcnRpZmFjdFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnc2NtLWFydGlmYWN0JywgcGF0aDogYXJ0aWZhY3QubmFtZSB9KTtcblx0XHRcdFx0XHRjb25zdCBhcnRpZmFjdERpcmVjdG9yeSA9IGFydGlmYWN0LmlkLmxhc3RJbmRleE9mKCcvJykgPiAwXG5cdFx0XHRcdFx0XHQ/IGFydGlmYWN0LmlkLnN1YnN0cmluZygwLCBhcnRpZmFjdC5pZC5sYXN0SW5kZXhPZignLycpKVxuXHRcdFx0XHRcdFx0OiBhcnRpZmFjdC5pZDtcblxuXHRcdFx0XHRcdGNvbnN0IHByZXZBcnRpZmFjdCA9IGluZGV4ID4gMCA/IGFydGlmYWN0c1tpbmRleCAtIDFdIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IHByZXZBcnRpZmFjdERpcmVjdG9yeSA9IHByZXZBcnRpZmFjdCAmJiBwcmV2QXJ0aWZhY3QuaWQubGFzdEluZGV4T2YoJy8nKSA+IDBcblx0XHRcdFx0XHRcdD8gcHJldkFydGlmYWN0LmlkLnN1YnN0cmluZygwLCBwcmV2QXJ0aWZhY3QuaWQubGFzdEluZGV4T2YoJy8nKSlcblx0XHRcdFx0XHRcdDogcHJldkFydGlmYWN0Py5pZDtcblxuXHRcdFx0XHRcdGNvbnN0IGhpZGVUaW1lc3RhbXAgPSBpbmRleCA+IDAgJiZcblx0XHRcdFx0XHRcdGFydGlmYWN0LnRpbWVzdGFtcCAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHRcdFx0XHRwcmV2QXJ0aWZhY3Q/LnRpbWVzdGFtcCAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHRcdFx0XHRhcnRpZmFjdERpcmVjdG9yeSA9PT0gcHJldkFydGlmYWN0RGlyZWN0b3J5ICYmXG5cdFx0XHRcdFx0XHRmcm9tTm93KHByZXZBcnRpZmFjdC50aW1lc3RhbXApID09PSBmcm9tTm93KGFydGlmYWN0LnRpbWVzdGFtcCk7XG5cblx0XHRcdFx0XHRhcnRpZmFjdHNUcmVlLmFkZChhcnRpZmFjdFVyaSwge1xuXHRcdFx0XHRcdFx0cmVwb3NpdG9yeSxcblx0XHRcdFx0XHRcdGdyb3VwOiBpbnB1dE9yRWxlbWVudC5hcnRpZmFjdEdyb3VwLFxuXHRcdFx0XHRcdFx0YXJ0aWZhY3QsXG5cdFx0XHRcdFx0XHRoaWRlVGltZXN0YW1wLFxuXHRcdFx0XHRcdFx0dHlwZTogJ2FydGlmYWN0J1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIEl0ZXJhYmxlLm1hcChhcnRpZmFjdHNUcmVlLnJvb3QuY2hpbGRyZW4sIG5vZGUgPT4gbm9kZS5lbGVtZW50ID8/IG5vZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGbGF0IGxpc3Qgb2YgYXJ0aWZhY3RzXG5cdFx0XHRyZXR1cm4gYXJ0aWZhY3RzLm1hcCgoYXJ0aWZhY3QsIGluZGV4LCBhcnRpZmFjdHMpID0+ICh7XG5cdFx0XHRcdHJlcG9zaXRvcnksXG5cdFx0XHRcdGdyb3VwOiBpbnB1dE9yRWxlbWVudC5hcnRpZmFjdEdyb3VwLFxuXHRcdFx0XHRhcnRpZmFjdCxcblx0XHRcdFx0aGlkZVRpbWVzdGFtcDogaW5kZXggPiAwICYmXG5cdFx0XHRcdFx0YXJ0aWZhY3QudGltZXN0YW1wICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0XHRhcnRpZmFjdHNbaW5kZXggLSAxXS50aW1lc3RhbXAgIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0XHRcdGZyb21Ob3coYXJ0aWZhY3RzW2luZGV4IC0gMV0udGltZXN0YW1wISkgPT09IGZyb21Ob3coYXJ0aWZhY3QudGltZXN0YW1wKSxcblx0XHRcdFx0dHlwZTogJ2FydGlmYWN0J1xuXHRcdFx0fSBzYXRpc2ZpZXMgU0NNQXJ0aWZhY3RUcmVlRWxlbWVudCkpO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdE5vZGUoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gSXRlcmFibGUubWFwKGlucHV0T3JFbGVtZW50LmNoaWxkcmVuLFxuXHRcdFx0XHRub2RlID0+IG5vZGUuZWxlbWVudCAmJiBub2RlLmNoaWxkcmVuQ291bnQgPT09IDAgPyBub2RlLmVsZW1lbnQgOiBub2RlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRoYXNDaGlsZHJlbihpbnB1dE9yRWxlbWVudDogSVNDTVZpZXdTZXJ2aWNlIHwgVHJlZUVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5zY21WaWV3U2VydmljZS5leHBsb3JlckVuYWJsZWRDb25maWcuZ2V0KCkgPT09IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRJZCA9IGlzU0NNUmVwb3NpdG9yeShpbnB1dE9yRWxlbWVudClcblx0XHRcdFx0PyBpbnB1dE9yRWxlbWVudC5wcm92aWRlci5pZFxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcmVwb3NpdG9yaWVzID0gdGhpcy5zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXNcblx0XHRcdFx0LmZpbHRlcihyID0+IHIucHJvdmlkZXIucGFyZW50SWQgPT09IHBhcmVudElkKTtcblxuXHRcdFx0cmV0dXJuIHJlcG9zaXRvcmllcy5sZW5ndGggPiAwO1xuXHRcdH1cblxuXHRcdC8vIEV4cGxvcmVyIG1vZGVcblx0XHRpZiAoaW5wdXRPckVsZW1lbnQgaW5zdGFuY2VvZiBTQ01WaWV3U2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzLmxlbmd0aCA+IDA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlcG9zaXRvcnkoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50KGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0Tm9kZShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBpbnB1dE9yRWxlbWVudC5jaGlsZHJlbkNvdW50ID4gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZXBvc2l0b3J5VHJlZUlkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxUcmVlRWxlbWVudD4ge1xuXHRnZXRJZChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGByZXBvOiR7ZWxlbWVudC5wcm92aWRlci5pZH1gO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBgYXJ0aWZhY3RHcm91cDoke2VsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlci5pZH0vJHtlbGVtZW50LmFydGlmYWN0R3JvdXAuaWR9YDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGBhcnRpZmFjdDoke2VsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlci5pZH0vJHtlbGVtZW50Lmdyb3VwLmlkfS8ke2VsZW1lbnQuYXJ0aWZhY3QuaWR9YDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3ROb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYGFydGlmYWN0Rm9sZGVyOiR7ZWxlbWVudC5jb250ZXh0LnJlcG9zaXRvcnkucHJvdmlkZXIuaWR9LyR7ZWxlbWVudC5jb250ZXh0LmFydGlmYWN0R3JvdXAuaWR9LyR7ZWxlbWVudC51cmkuZnNQYXRofWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0cmVlIGVsZW1lbnQnKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUmVwb3NpdG9yaWVzVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgaW1wbGVtZW50cyBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGU8VHJlZUVsZW1lbnQ+IHtcblx0aXNJbmNvbXByZXNzaWJsZShlbGVtZW50OiBUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmNoaWxkcmVuQ291bnQgPiAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNDTVJlcG9zaXRvcmllc1ZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNDTVZpZXdTZXJ2aWNlLCBUcmVlRWxlbWVudD47XG5cdHByaXZhdGUgdHJlZURhdGFTb3VyY2UhOiBSZXBvc2l0b3J5VHJlZURhdGFTb3VyY2U7XG5cdHByaXZhdGUgdHJlZUlkZW50aXR5UHJvdmlkZXIhOiBSZXBvc2l0b3J5VHJlZUlkZW50aXR5UHJvdmlkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJlZU9wZXJhdGlvblNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVDaGlsZHJlblRocm90dGxlciA9IG5ldyBUaHJvdHRsZXIoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2libGVDb3VudE9iczogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlckNvdW50QmFkZ2VPYnM6IElPYnNlcnZhYmxlPCdoaWRkZW4nIHwgJ2F1dG8nIHwgJ3Zpc2libGUnPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2liaWxpdHlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSByZXBvc2l0b3J5RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZU1hcDxJU0NNUmVwb3NpdG9yeT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHsgLi4ub3B0aW9ucywgdGl0bGVNZW51SWQ6IE1lbnVJZC5TQ01Tb3VyY2VDb250cm9sVGl0bGUgfSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHR0aGlzLnZpc2libGVDb3VudE9icyA9IG9ic2VydmFibGVDb25maWdWYWx1ZSgnc2NtLnJlcG9zaXRvcmllcy52aXNpYmxlJywgMTAsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMucHJvdmlkZXJDb3VudEJhZGdlT2JzID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPCdoaWRkZW4nIHwgJ2F1dG8nIHwgJ3Zpc2libGUnPignc2NtLnByb3ZpZGVyQ291bnRCYWRnZScsICdoaWRkZW4nLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdHRoaXMuc3RvcmVUcmVlVmlld1N0YXRlKCk7XG5cdFx0fSwgdGhpcywgdGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51cGRhdGVDaGlsZHJlblRocm90dGxlcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdHJlZUNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY20tdmlldy5zY20tcmVwb3NpdG9yaWVzLXZpZXcnKSk7XG5cblx0XHQvLyBzY20ucHJvdmlkZXJDb3VudEJhZGdlIHNldHRpbmdcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlckNvdW50QmFkZ2UgPSB0aGlzLnByb3ZpZGVyQ291bnRCYWRnZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUtcHJvdmlkZXItY291bnRzJywgcHJvdmlkZXJDb3VudEJhZGdlID09PSAnaGlkZGVuJyk7XG5cdFx0XHR0cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2F1dG8tcHJvdmlkZXItY291bnRzJywgcHJvdmlkZXJDb3VudEJhZGdlID09PSAnYXV0bycpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMubG9hZFRyZWVWaWV3U3RhdGUoKTtcblx0XHR0aGlzLmNyZWF0ZVRyZWUodHJlZUNvbnRhaW5lciwgdmlld1N0YXRlKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eShhc3luYyB2aXNpYmxlID0+IHtcblx0XHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIEluaXRpYWwgcmVuZGVyaW5nXG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5zZXRJbnB1dCh0aGlzLnNjbVZpZXdTZXJ2aWNlLCB2aWV3U3RhdGUpO1xuXG5cdFx0XHRcdC8vIHNjbS5yZXBvc2l0b3JpZXMudmlzaWJsZSBzZXR0aW5nXG5cdFx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdmlzaWJsZUNvdW50ID0gdGhpcy52aXNpYmxlQ291bnRPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQm9keVNpemUodGhpcy50cmVlLmNvbnRlbnRIZWlnaHQsIHZpc2libGVDb3VudCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBzY20ucmVwb3NpdG9yaWVzLmV4cGxvcmVyIHNldHRpbmdcblx0XHRcdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMuYWRkKHJ1bk9uQ2hhbmdlKHRoaXMuc2NtVmlld1NlcnZpY2UuZXhwbG9yZXJFbmFibGVkQ29uZmlnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQm9keVNpemUodGhpcy50cmVlLmNvbnRlbnRIZWlnaHQpO1xuXG5cdFx0XHRcdFx0Ly8gSWYgd2Ugb25seSBoYXZlIG9uZSByZXBvc2l0b3J5LCBleHBhbmQgaXRcblx0XHRcdFx0XHRpZiAodGhpcy5zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoKCkgPT5cblx0XHRcdFx0XHRcdFx0dGhpcy50cmVlLmV4cGFuZCh0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllc1swXSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFVwZGF0ZSB0cmVlIHNlbGVjdGlvblxuXHRcdFx0XHRjb25zdCBvbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXNTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KFxuXHRcdFx0XHRcdHRoaXMsIHRoaXMuc2NtVmlld1NlcnZpY2Uub25EaWRDaGFuZ2VWaXNpYmxlUmVwb3NpdG9yaWVzKTtcblxuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihhc3luYyByZWFkZXIgPT4ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJsZVJlcG9zaXRvcmllc1NpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMudXBkYXRlVHJlZVNlbGVjdGlvbigpKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEFkZC9SZW1vdmUgZXZlbnQgaGFuZGxlcnNcblx0XHRcdFx0dGhpcy5zY21TZXJ2aWNlLm9uRGlkQWRkUmVwb3NpdG9yeSh0aGlzLm9uRGlkQWRkUmVwb3NpdG9yeSwgdGhpcywgdGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR0aGlzLnNjbVNlcnZpY2Uub25EaWRSZW1vdmVSZXBvc2l0b3J5KHRoaXMub25EaWRSZW1vdmVSZXBvc2l0b3J5LCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiB0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZEFkZFJlcG9zaXRvcnkocmVwb3NpdG9yeSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFeHBhbmQgcmVwb3NpdG9yeSBpZiB0aGVyZSBpcyBvbmx5IG9uZVxuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihhc3luYyByZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4cGxvcmVyRW5hYmxlZENvbmZpZyA9IHRoaXMuc2NtVmlld1NlcnZpY2UuZXhwbG9yZXJFbmFibGVkQ29uZmlnLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCBkaWRGaW5pc2hMb2FkaW5nUmVwb3NpdG9yaWVzID0gdGhpcy5zY21WaWV3U2VydmljZS5kaWRGaW5pc2hMb2FkaW5nUmVwb3NpdG9yaWVzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRcdGlmICh2aWV3U3RhdGUgPT09IHVuZGVmaW5lZCAmJiBleHBsb3JlckVuYWJsZWRDb25maWcgJiYgZGlkRmluaXNoTG9hZGluZ1JlcG9zaXRvcmllcyAmJiB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZSgoKSA9PlxuXHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUuZXhwYW5kKHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzWzBdKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblx0XHR9LCB0aGlzLCB0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRyZWUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdmlld1N0YXRlPzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVJZGVudGl0eVByb3ZpZGVyID0gbmV3IFJlcG9zaXRvcnlUcmVlSWRlbnRpdHlQcm92aWRlcigpO1xuXHRcdHRoaXMudHJlZURhdGFTb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcG9zaXRvcnlUcmVlRGF0YVNvdXJjZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlRGF0YVNvdXJjZSk7XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSxcblx0XHRcdCdTQ00gUmVwb3NpdG9yaWVzJyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdG5ldyBMaXN0RGVsZWdhdGUoKSxcblx0XHRcdG5ldyBSZXBvc2l0b3JpZXNUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcG9zaXRvcnlSZW5kZXJlciwgTWVudUlkLlNDTVNvdXJjZUNvbnRyb2xJbmxpbmUsIGdldEFjdGlvblZpZXdJdGVtUHJvdmlkZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFydGlmYWN0R3JvdXBSZW5kZXJlciwgZ2V0QWN0aW9uVmlld0l0ZW1Qcm92aWRlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXJ0aWZhY3RSZW5kZXJlciwgZ2V0QWN0aW9uVmlld0l0ZW1Qcm92aWRlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSlcblx0XHRcdF0sXG5cdFx0XHR0aGlzLnRyZWVEYXRhU291cmNlLFxuXHRcdFx0e1xuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB0aGlzLnRyZWVJZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IChlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc2NtVmlld1NlcnZpY2UuZXhwbG9yZXJFbmFibGVkQ29uZmlnLmdldCgpID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlKSAmJiBlLnByb3ZpZGVyLnBhcmVudElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRXhwbG9yZXIgbW9kZVxuXHRcdFx0XHRcdGlmICh2aWV3U3RhdGU/LmV4cGFuZGVkICYmIChpc1NDTVJlcG9zaXRvcnkoZSkgfHwgaXNTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQoZSkgfHwgaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGUpKSkge1xuXHRcdFx0XHRcdFx0Ly8gT25seSBleHBhbmQgcmVwb3NpdG9yaWVzL2FydGlmYWN0IGdyb3Vwcy9hcnRpZmFjdHMgdGhhdCB3ZXJlIGV4cGFuZGVkIGJlZm9yZVxuXHRcdFx0XHRcdFx0cmV0dXJuIHZpZXdTdGF0ZS5leHBhbmRlZC5pbmRleE9mKHRoaXMudHJlZUlkZW50aXR5UHJvdmlkZXIuZ2V0SWQoZSkpID09PSAtMTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3ROb2RlKGUpKSB7XG5cdFx0XHRcdFx0XHQvLyBPbmx5IGV4cGFuZCBhcnRpZmFjdCBmb2xkZXJzIGFzIHRoZXkgYXJlIGNvbXByZXNzZWQgYnkgZGVmYXVsdFxuXHRcdFx0XHRcdFx0cmV0dXJuICEoZS5jaGlsZHJlbkNvdW50ID09PSAxICYmIEl0ZXJhYmxlLmZpcnN0KGUuY2hpbGRyZW4pPy5lbGVtZW50ID09PSB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbXByZXNzaW9uRW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0aGlzLnNjbVZpZXdTZXJ2aWNlLnNlbGVjdGlvbk1vZGVDb25maWcuZ2V0KCkgPT09ICdtdWx0aXBsZScsXG5cdFx0XHRcdGV4cGFuZE9uRG91YmxlQ2xpY2s6IHRydWUsXG5cdFx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQucHJvdmlkZXIubGFiZWw7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmFydGlmYWN0R3JvdXAubmFtZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmFydGlmYWN0Lm5hbWU7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NjbScsIFwiU291cmNlIENvbnRyb2wgUmVwb3NpdG9yaWVzXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkgYXMgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU0NNVmlld1NlcnZpY2UsIFRyZWVFbGVtZW50Pjtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uTW9kZSA9IHRoaXMuc2NtVmlld1NlcnZpY2Uuc2VsZWN0aW9uTW9kZUNvbmZpZy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogc2VsZWN0aW9uTW9kZSA9PT0gJ211bHRpcGxlJyB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRPcGVuKHRoaXMub25UcmVlRGlkT3BlbiwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbih0aGlzLm9uVHJlZVNlbGVjdGlvbkNoYW5nZSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUZvY3VzKHRoaXMub25UcmVlRGlkQ2hhbmdlRm9jdXMsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRGb2N1cyh0aGlzLm9uRGlkVHJlZUZvY3VzLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uQ29udGV4dE1lbnUodGhpcy5vblRyZWVDb250ZXh0TWVudSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQodGhpcy5vblRyZWVDb250ZW50SGVpZ2h0Q2hhbmdlLCB0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkQWRkUmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gQXJ0aWZhY3QgZ3JvdXAgY2hhbmdlZFxuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKGFzeW5jIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBleHBsb3JlckVuYWJsZWQgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLmV4cGxvcmVyRW5hYmxlZENvbmZpZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhcnRpZmFjdHNQcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIuYXJ0aWZhY3RQcm92aWRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWV4cGxvcmVyRW5hYmxlZCB8fCAhYXJ0aWZhY3RzUHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGFydGlmYWN0c1Byb3ZpZGVyLm9uRGlkQ2hhbmdlQXJ0aWZhY3RzKGFzeW5jIGdyb3VwcyA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlUmVwb3NpdG9yeShyZXBvc2l0b3J5KTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIaXN0b3J5SXRlbVJlZiBjaGFuZ2VkXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4oYXN5bmMgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaGlzdG9yeVByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChydW5PbkNoYW5nZShoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZWYsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVSZXBvc2l0b3J5KHJlcG9zaXRvcnkpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlUmVwb3NpdG9yeShyZXBvc2l0b3J5KTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5zZXQocmVwb3NpdG9yeSwgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZFJlbW92ZVJlcG9zaXRvcnkocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZVJlcG9zaXRvcnkocmVwb3NpdG9yeSk7XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShyZXBvc2l0b3J5KTtcblx0fVxuXG5cdHByaXZhdGUgb25UcmVlRGlkT3BlbihlOiBJT3BlbkV2ZW50PFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkPik6IHZvaWQge1xuXHRcdGlmICghZS5lbGVtZW50IHx8ICFpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoZS5lbGVtZW50KSB8fCAhZS5lbGVtZW50LmFydGlmYWN0LmNvbW1hbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGUuZWxlbWVudC5hcnRpZmFjdC5jb21tYW5kLmlkLCBlLmVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlciwgZS5lbGVtZW50LmFydGlmYWN0KTtcblx0fVxuXG5cdHByaXZhdGUgb25UcmVlQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PFRyZWVFbGVtZW50Pik6IHZvaWQge1xuXHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlLmVsZW1lbnQpKSB7XG5cdFx0XHQvLyBSZXBvc2l0b3J5XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGUuZWxlbWVudC5wcm92aWRlcjtcblx0XHRcdGNvbnN0IG1lbnVzID0gdGhpcy5zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMocHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldFJlcG9zaXRvcnlDb250ZXh0TWVudShlLmVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGNvbGxlY3RDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gbmV3IFJlcG9zaXRvcnlBY3Rpb25SdW5uZXIoKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRUcmVlU2VsZWN0aW9uKCk7XG5cdFx0XHR9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhY3Rpb25SdW5uZXIpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFjdGlvblJ1bm5lci5vbldpbGxSdW4oKCkgPT4gdGhpcy50cmVlLmRvbUZvY3VzKCkpKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gcHJvdmlkZXIsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChlLmVsZW1lbnQpKSB7XG5cdFx0XHQvLyBBcnRpZmFjdFxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlLmVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdGNvbnN0IGFydGlmYWN0ID0gZS5lbGVtZW50LmFydGlmYWN0O1xuXG5cdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IG1lbnUgPSBtZW51cy5nZXRBcnRpZmFjdE1lbnUoZS5lbGVtZW50Lmdyb3VwLCBhcnRpZmFjdCk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gY29sbGVjdENvbnRleHRNZW51QWN0aW9ucyhtZW51LCBwcm92aWRlcik7XG5cblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBhcnRpZmFjdFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRyZWVTZWxlY3Rpb25DaGFuZ2UoZTogSVRyZWVFdmVudDxUcmVlRWxlbWVudD4pOiB2b2lkIHtcblx0XHRpZiAoZS5icm93c2VyRXZlbnQgJiYgZS5lbGVtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLnRyZWUuc2Nyb2xsVG9wO1xuXG5cdFx0XHRpZiAoZS5lbGVtZW50cy5ldmVyeShlID0+IGlzU0NNUmVwb3NpdG9yeShlKSkpIHtcblx0XHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzID0gZS5lbGVtZW50cztcblx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50cy5ldmVyeShlID0+IGlzU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50KGUpIHx8IGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChlKSkpIHtcblx0XHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzID0gZS5lbGVtZW50cy5tYXAoZSA9PiBlLnJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyZWUuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25UcmVlRGlkQ2hhbmdlRm9jdXMoZTogSVRyZWVFdmVudDxUcmVlRWxlbWVudD4pOiB2b2lkIHtcblx0XHRpZiAoZS5icm93c2VyRXZlbnQgJiYgZS5lbGVtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGUuZWxlbWVudHNbMF0pKSB7XG5cdFx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXMoZS5lbGVtZW50c1swXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFRyZWVGb2N1cygpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShmb2N1c2VkWzBdKSkge1xuXHRcdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKGZvY3VzZWRbMF0pO1xuXHRcdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudChmb2N1c2VkWzBdKSB8fCBpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoZm9jdXNlZFswXSkpIHtcblx0XHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS5mb2N1cyhmb2N1c2VkWzBdLnJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25UcmVlQ29udGVudEhlaWdodENoYW5nZShoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlQm9keVNpemUoaGVpZ2h0KTtcblxuXHRcdC8vIFJlZnJlc2ggdGhlIHNlbGVjdGlvblxuXHRcdHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZSgoKSA9PiB0aGlzLnVwZGF0ZVRyZWVTZWxlY3Rpb24oKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUNoaWxkcmVuKGVsZW1lbnQ/OiBUcmVlRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyLnF1ZXVlKFxuXHRcdFx0KCkgPT4gdGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKGVsZW1lbnQgJiYgdGhpcy50cmVlLmhhc05vZGUoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4oZWxlbWVudCwgdHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXhwYW5kKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMudHJlZS5leHBhbmQoZWxlbWVudCwgdHJ1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVSZXBvc2l0b3J5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2NtVmlld1NlcnZpY2UuZXhwbG9yZXJFbmFibGVkQ29uZmlnLmdldCgpID09PSBmYWxzZSkge1xuXHRcdFx0aWYgKHJlcG9zaXRvcnkucHJvdmlkZXIucGFyZW50SWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVQYXJlbnRSZXBvc2l0b3J5KHJlcG9zaXRvcnkpO1xuXHRcdH1cblxuXHRcdC8vIEV4cGxvcmVyIG1vZGVcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVBhcmVudFJlcG9zaXRvcnkocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYXJlbnRSZXBvc2l0b3J5ID0gdGhpcy5zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXNcblx0XHRcdC5maW5kKHIgPT4gci5wcm92aWRlci5pZCA9PT0gcmVwb3NpdG9yeS5wcm92aWRlci5wYXJlbnRJZCk7XG5cdFx0aWYgKCFwYXJlbnRSZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVDaGlsZHJlbihwYXJlbnRSZXBvc2l0b3J5KTtcblx0XHRhd2FpdCB0aGlzLmV4cGFuZChwYXJlbnRSZXBvc2l0b3J5KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQm9keVNpemUoY29udGVudEhlaWdodDogbnVtYmVyLCB2aXNpYmxlQ291bnQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNjbVZpZXdTZXJ2aWNlLmV4cGxvcmVyRW5hYmxlZENvbmZpZy5nZXQoKSA9PT0gZmFsc2UpIHtcblx0XHRcdHZpc2libGVDb3VudCA9IHZpc2libGVDb3VudCA/PyB0aGlzLnZpc2libGVDb3VudE9icy5nZXQoKTtcblx0XHRcdGNvbnN0IGVtcHR5ID0gdGhpcy5zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXMubGVuZ3RoID09PSAwO1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IE1hdGgubWluKGNvbnRlbnRIZWlnaHQgLyAyMiwgdmlzaWJsZUNvdW50KSAqIDIyO1xuXG5cdFx0XHR0aGlzLm1pbmltdW1Cb2R5U2l6ZSA9IHZpc2libGVDb3VudCA9PT0gMCA/IDIyIDogc2l6ZTtcblx0XHRcdHRoaXMubWF4aW11bUJvZHlTaXplID0gdmlzaWJsZUNvdW50ID09PSAwID8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIDogZW1wdHkgPyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkgOiBzaXplO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1pbmltdW1Cb2R5U2l6ZSA9IDEyMDtcblx0XHRcdHRoaXMubWF4aW11bUJvZHlTaXplID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlVHJlZVNlbGVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvbGRTZWxlY3Rpb24gPSB0aGlzLmdldFRyZWVTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBvbGRTZXQgPSBuZXcgU2V0KG9sZFNlbGVjdGlvbik7XG5cblx0XHRjb25zdCBzZXQgPSBuZXcgU2V0KHRoaXMuc2NtVmlld1NlcnZpY2UudmlzaWJsZVJlcG9zaXRvcmllcyk7XG5cdFx0Y29uc3QgYWRkZWQgPSBuZXcgU2V0KEl0ZXJhYmxlLmZpbHRlcihzZXQsIHIgPT4gIW9sZFNldC5oYXMocikpKTtcblx0XHRjb25zdCByZW1vdmVkID0gbmV3IFNldChJdGVyYWJsZS5maWx0ZXIob2xkU2V0LCByID0+ICFzZXQuaGFzKHIpKSk7XG5cblx0XHRpZiAoYWRkZWQuc2l6ZSA9PT0gMCAmJiByZW1vdmVkLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBvbGRTZWxlY3Rpb24uZmlsdGVyKHJlcG8gPT4gIXJlbW92ZWQuaGFzKHJlcG8pKTtcblxuXHRcdGZvciAoY29uc3QgcmVwbyBvZiB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllcykge1xuXHRcdFx0aWYgKGFkZGVkLmhhcyhyZXBvKSkge1xuXHRcdFx0XHRzZWxlY3Rpb24ucHVzaChyZXBvKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlU2VsZWN0aW9uID0gc2VsZWN0aW9uXG5cdFx0XHQuZmlsdGVyKHMgPT4gdGhpcy50cmVlLmhhc05vZGUocykpO1xuXG5cdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbih2aXNpYmxlU2VsZWN0aW9uKTtcblxuXHRcdGlmICh2aXNpYmxlU2VsZWN0aW9uLmxlbmd0aCA+IDAgJiYgIXRoaXMudHJlZS5nZXRGb2N1cygpLmluY2x1ZGVzKHZpc2libGVTZWxlY3Rpb25bMF0pKSB7XG5cdFx0XHR0aGlzLnRyZWUuc2V0QW5jaG9yKHZpc2libGVTZWxlY3Rpb25bMF0pO1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFt2aXNpYmxlU2VsZWN0aW9uWzBdXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmVlU2VsZWN0aW9uKCk6IElTQ01SZXBvc2l0b3J5W10ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKClcblx0XHRcdC5tYXAoZSA9PiB7XG5cdFx0XHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudChlKSB8fCBpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZS5yZXBvc2l0b3J5O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3ROb2RlKGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGUuY29udGV4dC5yZXBvc2l0b3J5O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0cmVlIGVsZW1lbnQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRUcmVlVmlld1N0YXRlKCk6IElBc3luY0RhdGFUcmVlVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdG9yYWdlVmlld1N0YXRlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoJ3NjbS5yZXBvc2l0b3JpZXNWaWV3U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAoIXN0b3JhZ2VWaWV3U3RhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRyZWVWaWV3U3RhdGUgPSBKU09OLnBhcnNlKHN0b3JhZ2VWaWV3U3RhdGUpO1xuXHRcdFx0cmV0dXJuIHRyZWVWaWV3U3RhdGU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RvcmVUcmVlVmlld1N0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3NjbS5yZXBvc2l0b3JpZXNWaWV3U3RhdGUnLCBKU09OLnN0cmluZ2lmeSh0aGlzLnRyZWUuZ2V0Vmlld1N0YXRlKCkpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWtDO0FBQzNDLFNBQVMsUUFBUSxTQUFTO0FBRzFCLFNBQXFCLDBDQUEwQztBQUMvRCxTQUF5QixhQUFhLHVCQUF1QjtBQUM3RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9CQUFvQixZQUFZLGVBQWUsdUJBQW9DO0FBQzVGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCLDBCQUEwQjtBQUMzRCxTQUFTLDJCQUEyQixvQkFBb0IsMkJBQTJCLCtCQUErQixtQkFBbUIsMEJBQTBCLHVCQUF1QjtBQUN0TCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWMsY0FBYztBQUNyQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFNBQXNCLDJCQUEyQixtQkFBbUI7QUFDN0UsU0FBUyxXQUFXLGlCQUFpQjtBQUdyQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFT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
