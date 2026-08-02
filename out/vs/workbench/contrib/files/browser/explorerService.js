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
import { Event } from "../../../../base/common/event.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { SortOrder, LexicographicOptions } from "../common/files.js";
import { ExplorerItem, ExplorerModel } from "../common/explorerModel.js";
import { FileOperation, IFileService, FileChangeType } from "../../../../platform/files/common/files.js";
import { dirname, basename } from "../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { UndoRedoSource } from "../../../../platform/undoRedo/common/undoRedo.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ResourceGlobMatcher } from "../../../common/resources.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { ExplorerDecorationsProvider } from "./views/explorerDecorationsProvider.js";
const UNDO_REDO_SOURCE = new UndoRedoSource();
let ExplorerService = class {
  constructor(fileService, configurationService, contextService, clipboardService, editorService, uriIdentityService, bulkEditService, progressService, hostService, filesConfigurationService, decorationsService) {
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.clipboardService = clipboardService;
    this.editorService = editorService;
    this.uriIdentityService = uriIdentityService;
    this.bulkEditService = bulkEditService;
    this.progressService = progressService;
    this.filesConfigurationService = filesConfigurationService;
    this.decorationsService = decorationsService;
    // delay in ms to react to file changes to give our internal events a chance to react first
    this.disposables = new DisposableStore();
    this.decorationsProviderRegistered = false;
    this.fileChangeEvents = [];
    this.config = this.configurationService.getValue("explorer");
    this.model = new ExplorerModel(this.contextService, this.uriIdentityService, this.fileService, this.configurationService, this.filesConfigurationService);
    this.disposables.add(this.model);
    this.disposables.add(this.fileService.onDidRunOperation((e) => this.onDidRunOperation(e)));
    this.onFileChangesScheduler = this.disposables.add(new RunOnceScheduler(async () => {
      const events = this.fileChangeEvents;
      this.fileChangeEvents = [];
      const types = [FileChangeType.DELETED];
      if (this.config.sortOrder === SortOrder.Modified) {
        types.push(FileChangeType.UPDATED);
      }
      let shouldRefresh = false;
      this.roots.forEach((r) => {
        if (this.view && !shouldRefresh) {
          shouldRefresh = doesFileEventAffect(r, this.view, events, types);
        }
      });
      events.forEach((e) => {
        if (!shouldRefresh) {
          for (const resource of e.rawAdded) {
            const parent = this.model.findClosest(dirname(resource));
            if (parent && !parent.getChild(basename(resource))) {
              shouldRefresh = true;
              break;
            }
          }
        }
      });
      if (shouldRefresh) {
        await this.refresh(false);
      }
    }, ExplorerService.EXPLORER_FILE_CHANGES_REACT_DELAY));
    this.disposables.add(this.fileService.onDidFilesChange((e) => {
      this.fileChangeEvents.push(e);
      if (this.editable) {
        return;
      }
      if (!this.onFileChangesScheduler.isScheduled()) {
        this.onFileChangesScheduler.schedule();
      }
    }));
    this.disposables.add(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this.disposables.add(Event.any(this.fileService.onDidChangeFileSystemProviderRegistrations, this.fileService.onDidChangeFileSystemProviderCapabilities)(async (e) => {
      let affected = false;
      this.model.roots.forEach((r) => {
        if (r.resource.scheme === e.scheme) {
          affected = true;
          r.forgetChildren();
        }
      });
      if (affected) {
        if (this.view) {
          await this.view.setTreeInput();
        }
      }
    }));
    this.disposables.add(this.model.onDidChangeRoots(() => {
      this.view?.setTreeInput();
    }));
    this.disposables.add(hostService.onDidChangeFocus((hasFocus) => {
      if (hasFocus) {
        this.refresh(false);
      }
    }));
    this.revealExcludeMatcher = new ResourceGlobMatcher(
      (uri) => getRevealExcludes(configurationService.getValue({ resource: uri })),
      (event) => event.affectsConfiguration("explorer.autoRevealExclude"),
      contextService,
      configurationService
    );
    this.disposables.add(this.revealExcludeMatcher);
  }
  get roots() {
    return this.model.roots;
  }
  get sortOrderConfiguration() {
    return {
      sortOrder: this.config.sortOrder,
      lexicographicOptions: this.config.sortOrderLexicographicOptions,
      reverse: this.config.sortOrderReverse
    };
  }
  registerView(contextProvider) {
    this.view = contextProvider;
    if (!this.decorationsProviderRegistered) {
      this.decorationsProviderRegistered = true;
      const provider = this.disposables.add(new ExplorerDecorationsProvider(this, this.contextService));
      this.disposables.add(this.decorationsService.registerDecorationsProvider(provider));
    }
  }
  getViewId() {
    return this.view?.id;
  }
  getContext(respectMultiSelection, ignoreNestedChildren = false) {
    if (!this.view) {
      return [];
    }
    const items = new Set(this.view.getContext(respectMultiSelection));
    items.forEach((item) => {
      try {
        if (respectMultiSelection && !ignoreNestedChildren && this.view?.isItemCollapsed(item) && item.nestedChildren) {
          for (const child of item.nestedChildren) {
            items.add(child);
          }
        }
      } catch {
        return;
      }
    });
    return [...items];
  }
  async applyBulkEdit(edit, options) {
    const cancellationTokenSource = new CancellationTokenSource();
    const location = options.progressLocation ?? ProgressLocation.Window;
    let progressOptions;
    if (location === ProgressLocation.Window) {
      progressOptions = {
        location,
        title: options.progressLabel,
        cancellable: edit.length > 1
      };
    } else {
      progressOptions = {
        location,
        title: options.progressLabel,
        cancellable: edit.length > 1,
        delay: 500
      };
    }
    const promise = this.progressService.withProgress(progressOptions, async (progress) => {
      await this.bulkEditService.apply(edit, {
        undoRedoSource: UNDO_REDO_SOURCE,
        label: options.undoLabel,
        code: "undoredo.explorerOperation",
        progress,
        token: cancellationTokenSource.token,
        confirmBeforeUndo: options.confirmBeforeUndo
      });
    }, () => cancellationTokenSource.cancel());
    await this.progressService.withProgress({ location: ProgressLocation.Explorer, delay: 500 }, () => promise);
    cancellationTokenSource.dispose();
  }
  hasViewFocus() {
    return !!this.view && this.view.hasFocus();
  }
  // IExplorerService methods
  findClosest(resource) {
    return this.model.findClosest(resource);
  }
  findClosestRoot(resource) {
    const parentRoots = this.model.roots.filter((r) => this.uriIdentityService.extUri.isEqualOrParent(resource, r.resource)).sort((first, second) => second.resource.path.length - first.resource.path.length);
    return parentRoots.length ? parentRoots[0] : null;
  }
  async setEditable(stat, data) {
    if (!this.view) {
      return;
    }
    if (!data) {
      this.editable = void 0;
    } else {
      this.editable = { stat, data };
    }
    const isEditing = this.isEditable(stat);
    try {
      await this.view.setEditable(stat, isEditing);
    } catch {
      return;
    }
    if (!this.editable && this.fileChangeEvents.length && !this.onFileChangesScheduler.isScheduled()) {
      this.onFileChangesScheduler.schedule();
    }
  }
  async setToCopy(items, cut) {
    const previouslyCutItems = this.cutItems;
    this.cutItems = cut ? items : void 0;
    await this.clipboardService.writeResources(items.map((s) => s.resource));
    this.view?.itemsCopied(items, cut, previouslyCutItems);
  }
  isCut(item) {
    return !!this.cutItems && this.cutItems.some((i) => this.uriIdentityService.extUri.isEqual(i.resource, item.resource));
  }
  getEditable() {
    return this.editable;
  }
  getEditableData(stat) {
    return this.editable && this.editable.stat === stat ? this.editable.data : void 0;
  }
  isEditable(stat) {
    return !!this.editable && (this.editable.stat === stat || !stat);
  }
  async select(resource, reveal) {
    if (!this.view) {
      return;
    }
    const ignoreRevealExcludes = reveal === "force";
    const fileStat = this.findClosest(resource);
    if (fileStat) {
      if (!this.shouldAutoRevealItem(fileStat, ignoreRevealExcludes)) {
        return;
      }
      await this.view.selectResource(fileStat.resource, reveal);
      return Promise.resolve(void 0);
    }
    const options = { resolveTo: [resource], resolveMetadata: this.config.sortOrder === SortOrder.Modified };
    const root = this.findClosestRoot(resource);
    if (!root) {
      return void 0;
    }
    try {
      const stat = await this.fileService.resolve(root.resource, options);
      const modelStat = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, stat, void 0, options.resolveTo);
      ExplorerItem.mergeLocalWithDisk(modelStat, root);
      const item = root.find(resource);
      await this.view.refresh(true, root);
      if (item && !this.shouldAutoRevealItem(item, ignoreRevealExcludes)) {
        return;
      }
      await this.view.selectResource(item ? item.resource : void 0, reveal);
    } catch (error) {
      root.error = error;
      await this.view.refresh(false, root);
    }
  }
  async refresh(reveal = true) {
    if (this.view?.hasPhantomElements()) {
      return;
    }
    this.model.roots.forEach((r) => r.forgetChildren());
    if (this.view) {
      await this.view.refresh(true);
      const resource = this.editorService.activeEditor?.resource;
      const autoReveal = this.configurationService.getValue().explorer.autoReveal;
      if (reveal && resource && autoReveal) {
        this.select(resource, autoReveal);
      }
    }
  }
  // File events
  async onDidRunOperation(e) {
    const shouldDeepRefresh = this.config.fileNesting.enabled;
    if (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.COPY)) {
      const addedElement = e.target;
      const parentResource = dirname(addedElement.resource);
      const parents = this.model.findAll(parentResource);
      if (parents.length) {
        await Promise.all(parents.map(async (p) => {
          const resolveMetadata = this.config.sortOrder === `modified`;
          if (!p.isDirectoryResolved) {
            const stat = await this.fileService.resolve(p.resource, { resolveMetadata });
            if (stat) {
              const modelStat = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, stat, p.parent);
              ExplorerItem.mergeLocalWithDisk(modelStat, p);
            }
          }
          const childElement = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, addedElement, p.parent);
          p.removeChild(childElement);
          p.addChild(childElement);
          await this.view?.refresh(shouldDeepRefresh, p);
        }));
      }
    } else if (e.isOperation(FileOperation.MOVE)) {
      const oldResource = e.resource;
      const newElement = e.target;
      const oldParentResource = dirname(oldResource);
      const newParentResource = dirname(newElement.resource);
      const modelElements = this.model.findAll(oldResource);
      const sameParentMove = modelElements.every((e2) => !e2.nestedParent) && this.uriIdentityService.extUri.isEqual(oldParentResource, newParentResource);
      if (sameParentMove) {
        await Promise.all(modelElements.map(async (modelElement) => {
          modelElement.rename(newElement);
          await this.view?.refresh(shouldDeepRefresh, modelElement.parent);
        }));
      } else {
        const newParents = this.model.findAll(newParentResource);
        if (newParents.length && modelElements.length) {
          await Promise.all(modelElements.map(async (modelElement, index) => {
            const oldParent = modelElement.parent;
            const oldNestedParent = modelElement.nestedParent;
            modelElement.move(newParents[index]);
            if (oldNestedParent) {
              await this.view?.refresh(false, oldNestedParent);
            }
            await this.view?.refresh(false, oldParent);
            await this.view?.refresh(shouldDeepRefresh, newParents[index]);
          }));
        }
      }
    } else if (e.isOperation(FileOperation.DELETE)) {
      const modelElements = this.model.findAll(e.resource);
      await Promise.all(modelElements.map(async (modelElement) => {
        if (modelElement.parent) {
          const parent = modelElement.parent;
          parent.removeChild(modelElement);
          this.view?.focusNext();
          const oldNestedParent = modelElement.nestedParent;
          if (oldNestedParent) {
            oldNestedParent.removeChild(modelElement);
            await this.view?.refresh(false, oldNestedParent);
          }
          await this.view?.refresh(shouldDeepRefresh, parent);
          if (this.view?.getFocus().length === 0) {
            this.view?.focusLast();
          }
        }
      }));
    }
  }
  // Check if an item matches a explorer.autoRevealExclude pattern
  shouldAutoRevealItem(item, ignore) {
    if (item === void 0 || ignore) {
      return true;
    }
    if (this.revealExcludeMatcher.matches(item.resource, (name) => !!item.parent?.getChild(name))) {
      return false;
    }
    const root = item.root;
    let currentItem = item.parent;
    while (currentItem !== root) {
      if (currentItem === void 0) {
        return true;
      }
      if (this.revealExcludeMatcher.matches(currentItem.resource)) {
        return false;
      }
      currentItem = currentItem.parent;
    }
    return true;
  }
  async onConfigurationUpdated(event) {
    if (!event.affectsConfiguration("explorer")) {
      return;
    }
    let shouldRefresh = false;
    if (event.affectsConfiguration("explorer.fileNesting")) {
      shouldRefresh = true;
    }
    const configuration = this.configurationService.getValue();
    const configSortOrder = configuration?.explorer?.sortOrder || SortOrder.Default;
    if (this.config.sortOrder !== configSortOrder) {
      shouldRefresh = this.config.sortOrder !== void 0;
    }
    const configLexicographicOptions = configuration?.explorer?.sortOrderLexicographicOptions || LexicographicOptions.Default;
    if (this.config.sortOrderLexicographicOptions !== configLexicographicOptions) {
      shouldRefresh = shouldRefresh || this.config.sortOrderLexicographicOptions !== void 0;
    }
    const sortOrderReverse = configuration?.explorer?.sortOrderReverse || false;
    if (this.config.sortOrderReverse !== sortOrderReverse) {
      shouldRefresh = shouldRefresh || this.config.sortOrderReverse !== void 0;
    }
    this.config = configuration.explorer;
    if (shouldRefresh) {
      await this.refresh();
    }
  }
  dispose() {
    this.disposables.dispose();
  }
};
ExplorerService.EXPLORER_FILE_CHANGES_REACT_DELAY = 500;
ExplorerService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IBulkEditService),
  __decorateParam(7, IProgressService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, IDecorationsService)
], ExplorerService);
function doesFileEventAffect(item, view, events, types) {
  for (const [_name, child] of item.children) {
    if (view.isItemVisible(child)) {
      if (events.some((e) => e.contains(child.resource, ...types))) {
        return true;
      }
      if (child.isDirectory && child.isDirectoryResolved) {
        if (doesFileEventAffect(child, view, events, types)) {
          return true;
        }
      }
    }
  }
  return false;
}
function getRevealExcludes(configuration) {
  const revealExcludes = configuration?.explorer?.autoRevealExclude;
  if (!revealExcludes) {
    return {};
  }
  return revealExcludes;
}
export {
  ExplorerService,
  UNDO_REDO_SOURCE
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZXhwbG9yZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvbiwgSVNvcnRPcmRlckNvbmZpZ3VyYXRpb24sIFNvcnRPcmRlciwgTGV4aWNvZ3JhcGhpY09wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJJdGVtLCBFeHBsb3Jlck1vZGVsIH0gZnJvbSAnLi4vY29tbW9uL2V4cGxvcmVyTW9kZWwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FdmVudCwgRmlsZU9wZXJhdGlvbiwgSUZpbGVTZXJ2aWNlLCBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSwgSVJlc29sdmVGaWxlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0YWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZUZpbGVFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVuZG9SZWRvU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElFeHBsb3JlclZpZXcsIElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuL2ZpbGVzLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24sIElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMsIElQcm9ncmVzc09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUdsb2JNYXRjaGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRGVjb3JhdGlvbnNQcm92aWRlciB9IGZyb20gJy4vdmlld3MvZXhwbG9yZXJEZWNvcmF0aW9uc1Byb3ZpZGVyLmpzJztcblxuZXhwb3J0IGNvbnN0IFVORE9fUkVET19TT1VSQ0UgPSBuZXcgVW5kb1JlZG9Tb3VyY2UoKTtcblxuZXhwb3J0IGNsYXNzIEV4cGxvcmVyU2VydmljZSBpbXBsZW1lbnRzIElFeHBsb3JlclNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFWFBMT1JFUl9GSUxFX0NIQU5HRVNfUkVBQ1RfREVMQVkgPSA1MDA7IC8vIGRlbGF5IGluIG1zIHRvIHJlYWN0IHRvIGZpbGUgY2hhbmdlcyB0byBnaXZlIG91ciBpbnRlcm5hbCBldmVudHMgYSBjaGFuY2UgdG8gcmVhY3QgZmlyc3RcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIGVkaXRhYmxlOiB7IHN0YXQ6IEV4cGxvcmVySXRlbTsgZGF0YTogSUVkaXRhYmxlRGF0YSB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbmZpZzogSUZpbGVzQ29uZmlndXJhdGlvblsnZXhwbG9yZXInXTtcblx0cHJpdmF0ZSBjdXRJdGVtczogRXhwbG9yZXJJdGVtW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdmlldzogSUV4cGxvcmVyVmlldyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkZWNvcmF0aW9uc1Byb3ZpZGVyUmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIG1vZGVsOiBFeHBsb3Jlck1vZGVsO1xuXHRwcml2YXRlIG9uRmlsZUNoYW5nZXNTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgZmlsZUNoYW5nZUV2ZW50czogRmlsZUNoYW5nZXNFdmVudFtdID0gW107XG5cdHByaXZhdGUgcmV2ZWFsRXhjbHVkZU1hdGNoZXI6IFJlc291cmNlR2xvYk1hdGNoZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBidWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZXhwbG9yZXInKTtcblxuXHRcdHRoaXMubW9kZWwgPSBuZXcgRXhwbG9yZXJNb2RlbCh0aGlzLmNvbnRleHRTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm1vZGVsKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gdGhpcy5vbkRpZFJ1bk9wZXJhdGlvbihlKSkpO1xuXG5cdFx0dGhpcy5vbkZpbGVDaGFuZ2VzU2NoZWR1bGVyID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFJ1bk9uY2VTY2hlZHVsZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRzID0gdGhpcy5maWxlQ2hhbmdlRXZlbnRzO1xuXHRcdFx0dGhpcy5maWxlQ2hhbmdlRXZlbnRzID0gW107XG5cblx0XHRcdC8vIEZpbHRlciB0byB0aGUgb25lcyB3ZSBjYXJlXG5cdFx0XHRjb25zdCB0eXBlcyA9IFtGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEXTtcblx0XHRcdGlmICh0aGlzLmNvbmZpZy5zb3J0T3JkZXIgPT09IFNvcnRPcmRlci5Nb2RpZmllZCkge1xuXHRcdFx0XHR0eXBlcy5wdXNoKEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2hvdWxkUmVmcmVzaCA9IGZhbHNlO1xuXHRcdFx0Ly8gRm9yIERFTEVURUQgYW5kIFVQREFURUQgZXZlbnRzIGdvIHRocm91Z2ggdGhlIGV4cGxvcmVyIG1vZGVsIGFuZCBjaGVjayBpZiBhbnkgb2YgdGhlIGl0ZW1zIGdvdCBhZmZlY3RlZFxuXHRcdFx0dGhpcy5yb290cy5mb3JFYWNoKHIgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy52aWV3ICYmICFzaG91bGRSZWZyZXNoKSB7XG5cdFx0XHRcdFx0c2hvdWxkUmVmcmVzaCA9IGRvZXNGaWxlRXZlbnRBZmZlY3QociwgdGhpcy52aWV3LCBldmVudHMsIHR5cGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHQvLyBGb3IgQURERUQgZXZlbnRzIHdlIG5lZWQgdG8gZ28gdGhyb3VnaCBhbGwgdGhlIGV2ZW50cyBhbmQgY2hlY2sgaWYgdGhlIGV4cGxvcmVyIGlzIGFscmVhZHkgYXdhcmUgb2Ygc29tZSBvZiB0aGVtXG5cdFx0XHQvLyBPciBpZiB0aGV5IGFmZmVjdCBub3QgeWV0IHJlc29sdmVkIHBhcnRzIG9mIHRoZSBleHBsb3Jlci4gSWYgdGhhdCBpcyB0aGUgY2FzZSB3ZSB3aWxsIG5vdCByZWZyZXNoLlxuXHRcdFx0ZXZlbnRzLmZvckVhY2goZSA9PiB7XG5cdFx0XHRcdGlmICghc2hvdWxkUmVmcmVzaCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZS5yYXdBZGRlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5tb2RlbC5maW5kQ2xvc2VzdChkaXJuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdFx0XHQvLyBQYXJlbnQgb2YgdGhlIGFkZGVkIHJlc291cmNlIGlzIHJlc29sdmVkIGFuZCB0aGUgZXhwbG9yZXIgbW9kZWwgaXMgbm90IGF3YXJlIG9mIHRoZSBhZGRlZCByZXNvdXJjZSAtIHdlIG5lZWQgdG8gcmVmcmVzaFxuXHRcdFx0XHRcdFx0aWYgKHBhcmVudCAmJiAhcGFyZW50LmdldENoaWxkKGJhc2VuYW1lKHJlc291cmNlKSkpIHtcblx0XHRcdFx0XHRcdFx0c2hvdWxkUmVmcmVzaCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChzaG91bGRSZWZyZXNoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaChmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHR9LCBFeHBsb3JlclNlcnZpY2UuRVhQTE9SRVJfRklMRV9DSEFOR0VTX1JFQUNUX0RFTEFZKSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLmZpbGVDaGFuZ2VFdmVudHMucHVzaChlKTtcblx0XHRcdC8vIERvbid0IG1lc3Mgd2l0aCB0aGUgZmlsZSB0cmVlIHdoaWxlIGluIHRoZSBwcm9jZXNzIG9mIGVkaXRpbmcuICMxMTIyOTNcblx0XHRcdGlmICh0aGlzLmVkaXRhYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5vbkZpbGVDaGFuZ2VzU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5vbkZpbGVDaGFuZ2VzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGUpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoRXZlbnQuYW55PHsgc2NoZW1lOiBzdHJpbmcgfT4odGhpcy5maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMsIHRoaXMuZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMpKGFzeW5jIGUgPT4ge1xuXHRcdFx0bGV0IGFmZmVjdGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLm1vZGVsLnJvb3RzLmZvckVhY2gociA9PiB7XG5cdFx0XHRcdGlmIChyLnJlc291cmNlLnNjaGVtZSA9PT0gZS5zY2hlbWUpIHtcblx0XHRcdFx0XHRhZmZlY3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0ci5mb3JnZXRDaGlsZHJlbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGlmIChhZmZlY3RlZCkge1xuXHRcdFx0XHRpZiAodGhpcy52aWV3KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy52aWV3LnNldFRyZWVJbnB1dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubW9kZWwub25EaWRDaGFuZ2VSb290cygoKSA9PiB7XG5cdFx0XHR0aGlzLnZpZXc/LnNldFRyZWVJbnB1dCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZnJlc2ggZXhwbG9yZXIgd2hlbiB3aW5kb3cgZ2V0cyBmb2N1cyB0byBjb21wZW5zYXRlIGZvciBtaXNzaW5nIGZpbGUgZXZlbnRzICMxMjY4MTdcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChob3N0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzKGhhc0ZvY3VzID0+IHtcblx0XHRcdGlmIChoYXNGb2N1cykge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnJldmVhbEV4Y2x1ZGVNYXRjaGVyID0gbmV3IFJlc291cmNlR2xvYk1hdGNoZXIoXG5cdFx0XHQodXJpKSA9PiBnZXRSZXZlYWxFeGNsdWRlcyhjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiB1cmkgfSkpLFxuXHRcdFx0KGV2ZW50KSA9PiBldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbignZXhwbG9yZXIuYXV0b1JldmVhbEV4Y2x1ZGUnKSxcblx0XHRcdGNvbnRleHRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5yZXZlYWxFeGNsdWRlTWF0Y2hlcik7XG5cdH1cblxuXHRnZXQgcm9vdHMoKTogRXhwbG9yZXJJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnJvb3RzO1xuXHR9XG5cblx0Z2V0IHNvcnRPcmRlckNvbmZpZ3VyYXRpb24oKTogSVNvcnRPcmRlckNvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzb3J0T3JkZXI6IHRoaXMuY29uZmlnLnNvcnRPcmRlcixcblx0XHRcdGxleGljb2dyYXBoaWNPcHRpb25zOiB0aGlzLmNvbmZpZy5zb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucyxcblx0XHRcdHJldmVyc2U6IHRoaXMuY29uZmlnLnNvcnRPcmRlclJldmVyc2UsXG5cdFx0fTtcblx0fVxuXG5cdHJlZ2lzdGVyVmlldyhjb250ZXh0UHJvdmlkZXI6IElFeHBsb3JlclZpZXcpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcgPSBjb250ZXh0UHJvdmlkZXI7XG5cblx0XHQvLyBUaGUgZXhwbG9yZXIgZGVjb3JhdGlvbnMgYXJlIGNvbXB1dGVkIGZyb20gdGhpcyAod2luZG93IHdpZGUpIG1vZGVsIGFuZFxuXHRcdC8vIGFyZSB0aGVyZWZvcmUgc2hhcmVkIGJ5IGFsbCBleHBsb3JlciB2aWV3cy4gUmVnaXN0ZXIgdGhlIHByb3ZpZGVyIG9ubHlcblx0XHQvLyBvbmNlLCBvdGhlcndpc2UgZWFjaCB2aWV3IGNvbnRyaWJ1dGVzIGl0cyBvd24gYmFkZ2UgYW5kIGRlY29yYXRpb25zXG5cdFx0Ly8gcmVuZGVyIG11bHRpcGxlIHRpbWVzIHBlciByZXNvdXJjZS5cblx0XHRpZiAoIXRoaXMuZGVjb3JhdGlvbnNQcm92aWRlclJlZ2lzdGVyZWQpIHtcblx0XHRcdHRoaXMuZGVjb3JhdGlvbnNQcm92aWRlclJlZ2lzdGVyZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRXhwbG9yZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHRoaXMsIHRoaXMuY29udGV4dFNlcnZpY2UpKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZGVjb3JhdGlvbnNTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdH1cblx0fVxuXG5cdGdldFZpZXdJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXc/LmlkO1xuXHR9XG5cblx0Z2V0Q29udGV4dChyZXNwZWN0TXVsdGlTZWxlY3Rpb246IGJvb2xlYW4sIGlnbm9yZU5lc3RlZENoaWxkcmVuOiBib29sZWFuID0gZmFsc2UpOiBFeHBsb3Jlckl0ZW1bXSB7XG5cdFx0aWYgKCF0aGlzLnZpZXcpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IG5ldyBTZXQ8RXhwbG9yZXJJdGVtPih0aGlzLnZpZXcuZ2V0Q29udGV4dChyZXNwZWN0TXVsdGlTZWxlY3Rpb24pKTtcblx0XHRpdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHJlc3BlY3RNdWx0aVNlbGVjdGlvbiAmJiAhaWdub3JlTmVzdGVkQ2hpbGRyZW4gJiYgdGhpcy52aWV3Py5pc0l0ZW1Db2xsYXBzZWQoaXRlbSkgJiYgaXRlbS5uZXN0ZWRDaGlsZHJlbikge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgaXRlbS5uZXN0ZWRDaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0aXRlbXMuYWRkKGNoaWxkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBXZSB3aWxsIGVycm9yIG91dCB0cnlpbmcgdG8gcmVzb2x2ZSBjb2xsYXBzZWQgbm9kZXMgdGhhdCBoYXZlIG5vdCB5ZXQgYmVlbiByZXNvbHZlZC5cblx0XHRcdFx0Ly8gU28gd2UgY2F0Y2ggYW5kIGlnbm9yZSB0aGVtIGluIHRoZSBtdWx0aVNlbGVjdCBjb250ZXh0XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBbLi4uaXRlbXNdO1xuXHR9XG5cblx0YXN5bmMgYXBwbHlCdWxrRWRpdChlZGl0OiBSZXNvdXJjZUZpbGVFZGl0W10sIG9wdGlvbnM6IHsgdW5kb0xhYmVsOiBzdHJpbmc7IHByb2dyZXNzTGFiZWw6IHN0cmluZzsgY29uZmlybUJlZm9yZVVuZG8/OiBib29sZWFuOyBwcm9ncmVzc0xvY2F0aW9uPzogUHJvZ3Jlc3NMb2NhdGlvbi5FeHBsb3JlciB8IFByb2dyZXNzTG9jYXRpb24uV2luZG93IH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gb3B0aW9ucy5wcm9ncmVzc0xvY2F0aW9uID8/IFByb2dyZXNzTG9jYXRpb24uV2luZG93O1xuXHRcdGxldCBwcm9ncmVzc09wdGlvbnM7XG5cdFx0aWYgKGxvY2F0aW9uID09PSBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdykge1xuXHRcdFx0cHJvZ3Jlc3NPcHRpb25zID0ge1xuXHRcdFx0XHRsb2NhdGlvbjogbG9jYXRpb24sXG5cdFx0XHRcdHRpdGxlOiBvcHRpb25zLnByb2dyZXNzTGFiZWwsXG5cdFx0XHRcdGNhbmNlbGxhYmxlOiBlZGl0Lmxlbmd0aCA+IDEsXG5cdFx0XHR9IHNhdGlzZmllcyBJUHJvZ3Jlc3NPcHRpb25zO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcm9ncmVzc09wdGlvbnMgPSB7XG5cdFx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvbixcblx0XHRcdFx0dGl0bGU6IG9wdGlvbnMucHJvZ3Jlc3NMYWJlbCxcblx0XHRcdFx0Y2FuY2VsbGFibGU6IGVkaXQubGVuZ3RoID4gMSxcblx0XHRcdFx0ZGVsYXk6IDUwMCxcblx0XHRcdH0gc2F0aXNmaWVzIElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnM7XG5cdFx0fVxuXHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MocHJvZ3Jlc3NPcHRpb25zLCBhc3luYyBwcm9ncmVzcyA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLmJ1bGtFZGl0U2VydmljZS5hcHBseShlZGl0LCB7XG5cdFx0XHRcdHVuZG9SZWRvU291cmNlOiBVTkRPX1JFRE9fU09VUkNFLFxuXHRcdFx0XHRsYWJlbDogb3B0aW9ucy51bmRvTGFiZWwsXG5cdFx0XHRcdGNvZGU6ICd1bmRvcmVkby5leHBsb3Jlck9wZXJhdGlvbicsXG5cdFx0XHRcdHByb2dyZXNzLFxuXHRcdFx0XHR0b2tlbjogY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4sXG5cdFx0XHRcdGNvbmZpcm1CZWZvcmVVbmRvOiBvcHRpb25zLmNvbmZpcm1CZWZvcmVVbmRvXG5cdFx0XHR9KTtcblx0XHR9LCAoKSA9PiBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKSk7XG5cdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uRXhwbG9yZXIsIGRlbGF5OiA1MDAgfSwgKCkgPT4gcHJvbWlzZSk7XG5cdFx0Y2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuZGlzcG9zZSgpO1xuXHR9XG5cblx0aGFzVmlld0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMudmlldyAmJiB0aGlzLnZpZXcuaGFzRm9jdXMoKTtcblx0fVxuXG5cdC8vIElFeHBsb3JlclNlcnZpY2UgbWV0aG9kc1xuXG5cdGZpbmRDbG9zZXN0KHJlc291cmNlOiBVUkkpOiBFeHBsb3Jlckl0ZW0gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5maW5kQ2xvc2VzdChyZXNvdXJjZSk7XG5cdH1cblxuXHRmaW5kQ2xvc2VzdFJvb3QocmVzb3VyY2U6IFVSSSk6IEV4cGxvcmVySXRlbSB8IG51bGwge1xuXHRcdGNvbnN0IHBhcmVudFJvb3RzID0gdGhpcy5tb2RlbC5yb290cy5maWx0ZXIociA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCByLnJlc291cmNlKSlcblx0XHRcdC5zb3J0KChmaXJzdCwgc2Vjb25kKSA9PiBzZWNvbmQucmVzb3VyY2UucGF0aC5sZW5ndGggLSBmaXJzdC5yZXNvdXJjZS5wYXRoLmxlbmd0aCk7XG5cdFx0cmV0dXJuIHBhcmVudFJvb3RzLmxlbmd0aCA/IHBhcmVudFJvb3RzWzBdIDogbnVsbDtcblx0fVxuXG5cdGFzeW5jIHNldEVkaXRhYmxlKHN0YXQ6IEV4cGxvcmVySXRlbSwgZGF0YTogSUVkaXRhYmxlRGF0YSB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhpcy5lZGl0YWJsZSA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lZGl0YWJsZSA9IHsgc3RhdCwgZGF0YSB9O1xuXHRcdH1cblx0XHRjb25zdCBpc0VkaXRpbmcgPSB0aGlzLmlzRWRpdGFibGUoc3RhdCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMudmlldy5zZXRFZGl0YWJsZShzdGF0LCBpc0VkaXRpbmcpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0aWYgKCF0aGlzLmVkaXRhYmxlICYmIHRoaXMuZmlsZUNoYW5nZUV2ZW50cy5sZW5ndGggJiYgIXRoaXMub25GaWxlQ2hhbmdlc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLm9uRmlsZUNoYW5nZXNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZXRUb0NvcHkoaXRlbXM6IEV4cGxvcmVySXRlbVtdLCBjdXQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aW91c2x5Q3V0SXRlbXMgPSB0aGlzLmN1dEl0ZW1zO1xuXHRcdHRoaXMuY3V0SXRlbXMgPSBjdXQgPyBpdGVtcyA6IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVSZXNvdXJjZXMoaXRlbXMubWFwKHMgPT4gcy5yZXNvdXJjZSkpO1xuXG5cdFx0dGhpcy52aWV3Py5pdGVtc0NvcGllZChpdGVtcywgY3V0LCBwcmV2aW91c2x5Q3V0SXRlbXMpO1xuXHR9XG5cblx0aXNDdXQoaXRlbTogRXhwbG9yZXJJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5jdXRJdGVtcyAmJiB0aGlzLmN1dEl0ZW1zLnNvbWUoaSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChpLnJlc291cmNlLCBpdGVtLnJlc291cmNlKSk7XG5cdH1cblxuXHRnZXRFZGl0YWJsZSgpOiB7IHN0YXQ6IEV4cGxvcmVySXRlbTsgZGF0YTogSUVkaXRhYmxlRGF0YSB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0YWJsZTtcblx0fVxuXG5cdGdldEVkaXRhYmxlRGF0YShzdGF0OiBFeHBsb3Jlckl0ZW0pOiBJRWRpdGFibGVEYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0YWJsZSAmJiB0aGlzLmVkaXRhYmxlLnN0YXQgPT09IHN0YXQgPyB0aGlzLmVkaXRhYmxlLmRhdGEgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpc0VkaXRhYmxlKHN0YXQ6IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZWRpdGFibGUgJiYgKHRoaXMuZWRpdGFibGUuc3RhdCA9PT0gc3RhdCB8fCAhc3RhdCk7XG5cdH1cblxuXHRhc3luYyBzZWxlY3QocmVzb3VyY2U6IFVSSSwgcmV2ZWFsPzogYm9vbGVhbiB8IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy52aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgZmlsZSBvciBwYXJlbnQgbWF0Y2hlcyBleGNsdWRlIHBhdHRlcm5zLCBkbyBub3QgcmV2ZWFsIHVubGVzcyByZXZlYWwgYXJndW1lbnQgaXMgJ2ZvcmNlJ1xuXHRcdGNvbnN0IGlnbm9yZVJldmVhbEV4Y2x1ZGVzID0gcmV2ZWFsID09PSAnZm9yY2UnO1xuXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSB0aGlzLmZpbmRDbG9zZXN0KHJlc291cmNlKTtcblx0XHRpZiAoZmlsZVN0YXQpIHtcblx0XHRcdGlmICghdGhpcy5zaG91bGRBdXRvUmV2ZWFsSXRlbShmaWxlU3RhdCwgaWdub3JlUmV2ZWFsRXhjbHVkZXMpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMudmlldy5zZWxlY3RSZXNvdXJjZShmaWxlU3RhdC5yZXNvdXJjZSwgcmV2ZWFsKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBTdGF0IG5lZWRzIHRvIGJlIHJlc29sdmVkIGZpcnN0IGFuZCB0aGVuIHJldmVhbGVkXG5cdFx0Y29uc3Qgb3B0aW9uczogSVJlc29sdmVGaWxlT3B0aW9ucyA9IHsgcmVzb2x2ZVRvOiBbcmVzb3VyY2VdLCByZXNvbHZlTWV0YWRhdGE6IHRoaXMuY29uZmlnLnNvcnRPcmRlciA9PT0gU29ydE9yZGVyLk1vZGlmaWVkIH07XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZmluZENsb3Nlc3RSb290KHJlc291cmNlKTtcblx0XHRpZiAoIXJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUocm9vdC5yZXNvdXJjZSwgb3B0aW9ucyk7XG5cblx0XHRcdC8vIENvbnZlcnQgdG8gbW9kZWxcblx0XHRcdGNvbnN0IG1vZGVsU3RhdCA9IEV4cGxvcmVySXRlbS5jcmVhdGUodGhpcy5maWxlU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGF0LCB1bmRlZmluZWQsIG9wdGlvbnMucmVzb2x2ZVRvKTtcblx0XHRcdC8vIFVwZGF0ZSBJbnB1dCB3aXRoIGRpc2sgU3RhdFxuXHRcdFx0RXhwbG9yZXJJdGVtLm1lcmdlTG9jYWxXaXRoRGlzayhtb2RlbFN0YXQsIHJvb3QpO1xuXHRcdFx0Y29uc3QgaXRlbSA9IHJvb3QuZmluZChyZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0aGlzLnZpZXcucmVmcmVzaCh0cnVlLCByb290KTtcblxuXHRcdFx0Ly8gT25jZSBpdGVtIGlzIHJlc29sdmVkLCBjaGVjayBhZ2FpbiBpZiBmb2xkZXIgc2hvdWxkIGJlIGV4cGFuZGVkXG5cdFx0XHRpZiAoaXRlbSAmJiAhdGhpcy5zaG91bGRBdXRvUmV2ZWFsSXRlbShpdGVtLCBpZ25vcmVSZXZlYWxFeGNsdWRlcykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy52aWV3LnNlbGVjdFJlc291cmNlKGl0ZW0gPyBpdGVtLnJlc291cmNlIDogdW5kZWZpbmVkLCByZXZlYWwpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyb290LmVycm9yID0gZXJyb3I7XG5cdFx0XHRhd2FpdCB0aGlzLnZpZXcucmVmcmVzaChmYWxzZSwgcm9vdCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVmcmVzaChyZXZlYWwgPSB0cnVlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRG8gbm90IHJlZnJlc2ggdGhlIHRyZWUgd2hlbiBpdCBpcyBzaG93aW5nIHRlbXBvcmFyeSBub2RlcyAocGhhbnRvbSBlbGVtZW50cylcblx0XHRpZiAodGhpcy52aWV3Py5oYXNQaGFudG9tRWxlbWVudHMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubW9kZWwucm9vdHMuZm9yRWFjaChyID0+IHIuZm9yZ2V0Q2hpbGRyZW4oKSk7XG5cdFx0aWYgKHRoaXMudmlldykge1xuXHRcdFx0YXdhaXQgdGhpcy52aWV3LnJlZnJlc2godHJ1ZSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I/LnJlc291cmNlO1xuXHRcdFx0Y29uc3QgYXV0b1JldmVhbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5leHBsb3Jlci5hdXRvUmV2ZWFsO1xuXG5cdFx0XHRpZiAocmV2ZWFsICYmIHJlc291cmNlICYmIGF1dG9SZXZlYWwpIHtcblx0XHRcdFx0Ly8gV2UgZGlkIGEgdG9wIGxldmVsIHJlZnJlc2gsIHJldmVhbCB0aGUgYWN0aXZlIGZpbGUgIzY3MTE4XG5cdFx0XHRcdHRoaXMuc2VsZWN0KHJlc291cmNlLCBhdXRvUmV2ZWFsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBGaWxlIGV2ZW50c1xuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRSdW5PcGVyYXRpb24oZTogRmlsZU9wZXJhdGlvbkV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gV2hlbiBuZXN0aW5nLCBjaGFuZ2VzIHRvIG9uZSBmaWxlIGluIGEgZm9sZGVyIG1heSBpbXBhY3QgdGhlIHJlbmRlcmVkIHN0cnVjdHVyZVxuXHRcdC8vIG9mIGFsbCB0aGUgZm9sZGVyJ3MgaW1tZWRpYXRlIGNoaWxkcmVuLCB0aHVzIGEgcmVjdXJzaXZlIHJlZnJlc2ggaXMgbmVlZGVkLlxuXHRcdC8vIElkZWFsbHkgdGhlIHRyZWUgd291bGQgYmUgYWJsZSB0byByZWN1c2l2ZWx5IHJlZnJlc2gganVzdCBvbmUgbGV2ZWwgYnV0IHRoYXQgZG9lcyBub3QgeWV0IGV4aXN0LlxuXHRcdGNvbnN0IHNob3VsZERlZXBSZWZyZXNoID0gdGhpcy5jb25maWcuZmlsZU5lc3RpbmcuZW5hYmxlZDtcblxuXHRcdC8vIEFkZFxuXHRcdGlmIChlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uQ1JFQVRFKSB8fCBlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uQ09QWSkpIHtcblx0XHRcdGNvbnN0IGFkZGVkRWxlbWVudCA9IGUudGFyZ2V0O1xuXHRcdFx0Y29uc3QgcGFyZW50UmVzb3VyY2UgPSBkaXJuYW1lKGFkZGVkRWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBwYXJlbnRzID0gdGhpcy5tb2RlbC5maW5kQWxsKHBhcmVudFJlc291cmNlKTtcblxuXHRcdFx0aWYgKHBhcmVudHMubGVuZ3RoKSB7XG5cblx0XHRcdFx0Ly8gQWRkIHRoZSBuZXcgZmlsZSB0byBpdHMgcGFyZW50IChNb2RlbClcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocGFyZW50cy5tYXAoYXN5bmMgcCA9PiB7XG5cdFx0XHRcdFx0Ly8gV2UgaGF2ZSB0byBjaGVjayBpZiB0aGUgcGFyZW50IGlzIHJlc29sdmVkICMyOTE3N1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVNZXRhZGF0YSA9IHRoaXMuY29uZmlnLnNvcnRPcmRlciA9PT0gYG1vZGlmaWVkYDtcblx0XHRcdFx0XHRpZiAoIXAuaXNEaXJlY3RvcnlSZXNvbHZlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShwLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YSB9KTtcblx0XHRcdFx0XHRcdGlmIChzdGF0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1vZGVsU3RhdCA9IEV4cGxvcmVySXRlbS5jcmVhdGUodGhpcy5maWxlU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGF0LCBwLnBhcmVudCk7XG5cdFx0XHRcdFx0XHRcdEV4cGxvcmVySXRlbS5tZXJnZUxvY2FsV2l0aERpc2sobW9kZWxTdGF0LCBwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBjaGlsZEVsZW1lbnQgPSBFeHBsb3Jlckl0ZW0uY3JlYXRlKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgYWRkZWRFbGVtZW50LCBwLnBhcmVudCk7XG5cdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHJlbW92ZSBhbnkgcHJldmlvdXMgdmVyc2lvbiBvZiB0aGUgZmlsZSBpZiBhbnlcblx0XHRcdFx0XHRwLnJlbW92ZUNoaWxkKGNoaWxkRWxlbWVudCk7XG5cdFx0XHRcdFx0cC5hZGRDaGlsZChjaGlsZEVsZW1lbnQpO1xuXHRcdFx0XHRcdC8vIFJlZnJlc2ggdGhlIFBhcmVudCAoVmlldylcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXc/LnJlZnJlc2goc2hvdWxkRGVlcFJlZnJlc2gsIHApO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSAoaW5jbHVkaW5nIFJlbmFtZSlcblx0XHRlbHNlIGlmIChlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uTU9WRSkpIHtcblx0XHRcdGNvbnN0IG9sZFJlc291cmNlID0gZS5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IG5ld0VsZW1lbnQgPSBlLnRhcmdldDtcblx0XHRcdGNvbnN0IG9sZFBhcmVudFJlc291cmNlID0gZGlybmFtZShvbGRSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBuZXdQYXJlbnRSZXNvdXJjZSA9IGRpcm5hbWUobmV3RWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBtb2RlbEVsZW1lbnRzID0gdGhpcy5tb2RlbC5maW5kQWxsKG9sZFJlc291cmNlKTtcblx0XHRcdGNvbnN0IHNhbWVQYXJlbnRNb3ZlID0gbW9kZWxFbGVtZW50cy5ldmVyeShlID0+ICFlLm5lc3RlZFBhcmVudCkgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwob2xkUGFyZW50UmVzb3VyY2UsIG5ld1BhcmVudFJlc291cmNlKTtcblxuXHRcdFx0Ly8gSGFuZGxlIFJlbmFtZVxuXHRcdFx0aWYgKHNhbWVQYXJlbnRNb3ZlKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKG1vZGVsRWxlbWVudHMubWFwKGFzeW5jIG1vZGVsRWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0Ly8gUmVuYW1lIEZpbGUgKE1vZGVsKVxuXHRcdFx0XHRcdG1vZGVsRWxlbWVudC5yZW5hbWUobmV3RWxlbWVudCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy52aWV3Py5yZWZyZXNoKHNob3VsZERlZXBSZWZyZXNoLCBtb2RlbEVsZW1lbnQucGFyZW50KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGUgTW92ZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG5ld1BhcmVudHMgPSB0aGlzLm1vZGVsLmZpbmRBbGwobmV3UGFyZW50UmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAobmV3UGFyZW50cy5sZW5ndGggJiYgbW9kZWxFbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBNb3ZlIGluIE1vZGVsXG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwobW9kZWxFbGVtZW50cy5tYXAoYXN5bmMgKG1vZGVsRWxlbWVudCwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IG9sZFBhcmVudCA9IG1vZGVsRWxlbWVudC5wYXJlbnQ7XG5cdFx0XHRcdFx0XHRjb25zdCBvbGROZXN0ZWRQYXJlbnQgPSBtb2RlbEVsZW1lbnQubmVzdGVkUGFyZW50O1xuXHRcdFx0XHRcdFx0bW9kZWxFbGVtZW50Lm1vdmUobmV3UGFyZW50c1tpbmRleF0pO1xuXHRcdFx0XHRcdFx0aWYgKG9sZE5lc3RlZFBhcmVudCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXc/LnJlZnJlc2goZmFsc2UsIG9sZE5lc3RlZFBhcmVudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXc/LnJlZnJlc2goZmFsc2UsIG9sZFBhcmVudCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXc/LnJlZnJlc2goc2hvdWxkRGVlcFJlZnJlc2gsIG5ld1BhcmVudHNbaW5kZXhdKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZWxldGVcblx0XHRlbHNlIGlmIChlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uREVMRVRFKSkge1xuXHRcdFx0Y29uc3QgbW9kZWxFbGVtZW50cyA9IHRoaXMubW9kZWwuZmluZEFsbChlLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKG1vZGVsRWxlbWVudHMubWFwKGFzeW5jIG1vZGVsRWxlbWVudCA9PiB7XG5cdFx0XHRcdGlmIChtb2RlbEVsZW1lbnQucGFyZW50KSB7XG5cdFx0XHRcdFx0Ly8gUmVtb3ZlIEVsZW1lbnQgZnJvbSBQYXJlbnQgKE1vZGVsKVxuXHRcdFx0XHRcdGNvbnN0IHBhcmVudCA9IG1vZGVsRWxlbWVudC5wYXJlbnQ7XG5cdFx0XHRcdFx0cGFyZW50LnJlbW92ZUNoaWxkKG1vZGVsRWxlbWVudCk7XG5cdFx0XHRcdFx0dGhpcy52aWV3Py5mb2N1c05leHQoKTtcblxuXHRcdFx0XHRcdGNvbnN0IG9sZE5lc3RlZFBhcmVudCA9IG1vZGVsRWxlbWVudC5uZXN0ZWRQYXJlbnQ7XG5cdFx0XHRcdFx0aWYgKG9sZE5lc3RlZFBhcmVudCkge1xuXHRcdFx0XHRcdFx0b2xkTmVzdGVkUGFyZW50LnJlbW92ZUNoaWxkKG1vZGVsRWxlbWVudCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXc/LnJlZnJlc2goZmFsc2UsIG9sZE5lc3RlZFBhcmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFJlZnJlc2ggUGFyZW50IChWaWV3KVxuXHRcdFx0XHRcdGF3YWl0IHRoaXMudmlldz8ucmVmcmVzaChzaG91bGREZWVwUmVmcmVzaCwgcGFyZW50KTtcblxuXHRcdFx0XHRcdGlmICh0aGlzLnZpZXc/LmdldEZvY3VzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnZpZXc/LmZvY3VzTGFzdCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIENoZWNrIGlmIGFuIGl0ZW0gbWF0Y2hlcyBhIGV4cGxvcmVyLmF1dG9SZXZlYWxFeGNsdWRlIHBhdHRlcm5cblx0cHJpdmF0ZSBzaG91bGRBdXRvUmV2ZWFsSXRlbShpdGVtOiBFeHBsb3Jlckl0ZW0gfCB1bmRlZmluZWQsIGlnbm9yZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmIChpdGVtID09PSB1bmRlZmluZWQgfHwgaWdub3JlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmV2ZWFsRXhjbHVkZU1hdGNoZXIubWF0Y2hlcyhpdGVtLnJlc291cmNlLCBuYW1lID0+ICEhKGl0ZW0ucGFyZW50Py5nZXRDaGlsZChuYW1lKSkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJvb3QgPSBpdGVtLnJvb3Q7XG5cdFx0bGV0IGN1cnJlbnRJdGVtID0gaXRlbS5wYXJlbnQ7XG5cdFx0d2hpbGUgKGN1cnJlbnRJdGVtICE9PSByb290KSB7XG5cdFx0XHRpZiAoY3VycmVudEl0ZW0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJldmVhbEV4Y2x1ZGVNYXRjaGVyLm1hdGNoZXMoY3VycmVudEl0ZW0ucmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRJdGVtID0gY3VycmVudEl0ZW0ucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Db25maWd1cmF0aW9uVXBkYXRlZChldmVudDogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2hvdWxkUmVmcmVzaCA9IGZhbHNlO1xuXG5cdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKCdleHBsb3Jlci5maWxlTmVzdGluZycpKSB7XG5cdFx0XHRzaG91bGRSZWZyZXNoID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpO1xuXG5cdFx0Y29uc3QgY29uZmlnU29ydE9yZGVyID0gY29uZmlndXJhdGlvbj8uZXhwbG9yZXI/LnNvcnRPcmRlciB8fCBTb3J0T3JkZXIuRGVmYXVsdDtcblx0XHRpZiAodGhpcy5jb25maWcuc29ydE9yZGVyICE9PSBjb25maWdTb3J0T3JkZXIpIHtcblx0XHRcdHNob3VsZFJlZnJlc2ggPSB0aGlzLmNvbmZpZy5zb3J0T3JkZXIgIT09IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWdMZXhpY29ncmFwaGljT3B0aW9ucyA9IGNvbmZpZ3VyYXRpb24/LmV4cGxvcmVyPy5zb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucyB8fCBMZXhpY29ncmFwaGljT3B0aW9ucy5EZWZhdWx0O1xuXHRcdGlmICh0aGlzLmNvbmZpZy5zb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucyAhPT0gY29uZmlnTGV4aWNvZ3JhcGhpY09wdGlvbnMpIHtcblx0XHRcdHNob3VsZFJlZnJlc2ggPSBzaG91bGRSZWZyZXNoIHx8IHRoaXMuY29uZmlnLnNvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zICE9PSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNvcnRPcmRlclJldmVyc2UgPSBjb25maWd1cmF0aW9uPy5leHBsb3Jlcj8uc29ydE9yZGVyUmV2ZXJzZSB8fCBmYWxzZTtcblxuXHRcdGlmICh0aGlzLmNvbmZpZy5zb3J0T3JkZXJSZXZlcnNlICE9PSBzb3J0T3JkZXJSZXZlcnNlKSB7XG5cdFx0XHRzaG91bGRSZWZyZXNoID0gc2hvdWxkUmVmcmVzaCB8fCB0aGlzLmNvbmZpZy5zb3J0T3JkZXJSZXZlcnNlICE9PSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb25maWcgPSBjb25maWd1cmF0aW9uLmV4cGxvcmVyO1xuXG5cdFx0aWYgKHNob3VsZFJlZnJlc2gpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZG9lc0ZpbGVFdmVudEFmZmVjdChpdGVtOiBFeHBsb3Jlckl0ZW0sIHZpZXc6IElFeHBsb3JlclZpZXcsIGV2ZW50czogRmlsZUNoYW5nZXNFdmVudFtdLCB0eXBlczogRmlsZUNoYW5nZVR5cGVbXSk6IGJvb2xlYW4ge1xuXHRmb3IgKGNvbnN0IFtfbmFtZSwgY2hpbGRdIG9mIGl0ZW0uY2hpbGRyZW4pIHtcblx0XHRpZiAodmlldy5pc0l0ZW1WaXNpYmxlKGNoaWxkKSkge1xuXHRcdFx0aWYgKGV2ZW50cy5zb21lKGUgPT4gZS5jb250YWlucyhjaGlsZC5yZXNvdXJjZSwgLi4udHlwZXMpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSAmJiBjaGlsZC5pc0RpcmVjdG9yeVJlc29sdmVkKSB7XG5cdFx0XHRcdGlmIChkb2VzRmlsZUV2ZW50QWZmZWN0KGNoaWxkLCB2aWV3LCBldmVudHMsIHR5cGVzKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBnZXRSZXZlYWxFeGNsdWRlcyhjb25maWd1cmF0aW9uOiBJRmlsZXNDb25maWd1cmF0aW9uKTogSUV4cHJlc3Npb24ge1xuXHRjb25zdCByZXZlYWxFeGNsdWRlcyA9IGNvbmZpZ3VyYXRpb24/LmV4cGxvcmVyPy5hdXRvUmV2ZWFsRXhjbHVkZTtcblxuXHRpZiAoIXJldmVhbEV4Y2x1ZGVzKSB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cmV0dXJuIHJldmVhbEV4Y2x1ZGVzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBdUQsV0FBVyw0QkFBNEI7QUFDOUYsU0FBUyxjQUFjLHFCQUFxQjtBQUU1QyxTQUE2QixlQUFlLGNBQWdDLHNCQUEyQztBQUN2SCxTQUFTLFNBQVMsZ0JBQWdCO0FBQ2xDLFNBQVMsNkJBQXdEO0FBQ2pFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQTBDO0FBQ25ELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsa0JBQWtCLHdCQUFxRTtBQUNoRyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1DQUFtQztBQUVyQyxNQUFNLG1CQUFtQixJQUFJLGVBQWU7QUFFNUMsSUFBTSxrQkFBTixNQUFrRDtBQUFBLEVBZ0J4RCxZQUN1QixhQUNTLHNCQUNHLGdCQUNQLGtCQUNILGVBQ2Msb0JBQ0gsaUJBQ0EsaUJBQ3JCLGFBQytCLDJCQUNQLG9CQUNyQztBQVhxQjtBQUNTO0FBQ0c7QUFDUDtBQUNIO0FBQ2M7QUFDSDtBQUNBO0FBRVU7QUFDUDtBQXRCdkM7QUFBQSxTQUFpQixjQUFjLElBQUksZ0JBQWdCO0FBS25E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
