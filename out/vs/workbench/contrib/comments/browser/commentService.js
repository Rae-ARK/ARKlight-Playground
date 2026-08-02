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
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Range } from "../../../../editor/common/core/range.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CommentMenus } from "./commentMenus.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { COMMENTS_SECTION } from "../common/commentsConfiguration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CommentsModel } from "./commentsModel.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Schemas } from "../../../../base/common/network.js";
const ICommentService = createDecorator("commentService");
const CONTINUE_ON_COMMENTS = "comments.continueOnComments";
let CommentService = class extends Disposable {
  // schemes
  constructor(instantiationService, layoutService, configurationService, contextKeyService, storageService, logService, modelService) {
    super();
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this.logService = logService;
    this.modelService = modelService;
    this._onDidSetDataProvider = this._register(new Emitter());
    this.onDidSetDataProvider = this._onDidSetDataProvider.event;
    this._onDidDeleteDataProvider = this._register(new Emitter());
    this.onDidDeleteDataProvider = this._onDidDeleteDataProvider.event;
    this._onDidSetResourceCommentInfos = this._register(new Emitter());
    this.onDidSetResourceCommentInfos = this._onDidSetResourceCommentInfos.event;
    this._onDidSetAllCommentThreads = this._register(new Emitter());
    this.onDidSetAllCommentThreads = this._onDidSetAllCommentThreads.event;
    this._onDidUpdateCommentThreads = this._register(new Emitter());
    this.onDidUpdateCommentThreads = this._onDidUpdateCommentThreads.event;
    this._onDidUpdateNotebookCommentThreads = this._register(new Emitter());
    this.onDidUpdateNotebookCommentThreads = this._onDidUpdateNotebookCommentThreads.event;
    this._onDidUpdateCommentingRanges = this._register(new Emitter());
    this.onDidUpdateCommentingRanges = this._onDidUpdateCommentingRanges.event;
    this._onDidChangeActiveEditingCommentThread = this._register(new Emitter());
    this.onDidChangeActiveEditingCommentThread = this._onDidChangeActiveEditingCommentThread.event;
    this._onDidChangeCurrentCommentThread = this._register(new Emitter());
    this.onDidChangeCurrentCommentThread = this._onDidChangeCurrentCommentThread.event;
    this._onDidChangeCommentingEnabled = this._register(new Emitter());
    this.onDidChangeCommentingEnabled = this._onDidChangeCommentingEnabled.event;
    this._onResourceHasCommentingRanges = this._register(new Emitter());
    this.onResourceHasCommentingRanges = this._onResourceHasCommentingRanges.event;
    this._onDidChangeActiveCommentingRange = this._register(new Emitter());
    this.onDidChangeActiveCommentingRange = this._onDidChangeActiveCommentingRange.event;
    this._commentControls = /* @__PURE__ */ new Map();
    this._commentMenus = /* @__PURE__ */ new Map();
    this._isCommentingEnabled = true;
    this._continueOnComments = /* @__PURE__ */ new Map();
    // uniqueOwner -> PendingCommentThread[]
    this._continueOnCommentProviders = /* @__PURE__ */ new Set();
    this._commentsModel = this._register(new CommentsModel());
    this.commentsModel = this._commentsModel;
    this._commentingRangeResources = /* @__PURE__ */ new Set();
    // URIs
    this._commentingRangeResourceHintSchemes = /* @__PURE__ */ new Set();
    this._handleConfiguration();
    this._handleZenMode();
    this._workspaceHasCommenting = CommentContextKeys.WorkspaceHasCommenting.bindTo(contextKeyService);
    this._commentingEnabled = CommentContextKeys.commentingEnabled.bindTo(contextKeyService);
    const storageListener = this._register(new DisposableStore());
    const storageEvent = Event.debounce(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, CONTINUE_ON_COMMENTS, storageListener), (last, event) => last?.external ? last : event, 500);
    storageListener.add(storageEvent((v) => {
      if (!v.external) {
        return;
      }
      const commentsToRestore = this.storageService.getObject(CONTINUE_ON_COMMENTS, StorageScope.WORKSPACE);
      if (!commentsToRestore) {
        return;
      }
      this.logService.debug(`Comments: URIs of continue on comments from storage ${commentsToRestore.map((thread) => thread.uri.toString()).join(", ")}.`);
      const changedOwners = this._addContinueOnComments(commentsToRestore, this._continueOnComments);
      for (const uniqueOwner of changedOwners) {
        const control = this._commentControls.get(uniqueOwner);
        if (!control) {
          continue;
        }
        const evt = {
          uniqueOwner,
          owner: control.owner,
          ownerLabel: control.label,
          pending: this._continueOnComments.get(uniqueOwner) || [],
          added: [],
          removed: [],
          changed: []
        };
        this.updateModelThreads(evt);
      }
    }));
    this._register(storageService.onWillSaveState(() => {
      const map = /* @__PURE__ */ new Map();
      for (const provider of this._continueOnCommentProviders) {
        const pendingComments = provider.provideContinueOnComments();
        this._addContinueOnComments(pendingComments, map);
      }
      this._saveContinueOnComments(map);
    }));
    this._register(this.modelService.onModelAdded((model) => {
      if (model.uri.scheme === Schemas.vscodeSourceControl) {
        return;
      }
      if (!this._commentingRangeResources.has(model.uri.toString())) {
        this.getDocumentComments(model.uri);
      }
    }));
  }
  _updateResourcesWithCommentingRanges(resource, commentInfos) {
    let addedResources = false;
    for (const comments of commentInfos) {
      if (comments && (comments.commentingRanges.ranges.length > 0 || comments.threads.length > 0)) {
        this._commentingRangeResources.add(resource.toString());
        addedResources = true;
      }
    }
    if (addedResources) {
      this._onResourceHasCommentingRanges.fire();
    }
  }
  _handleConfiguration() {
    this._isCommentingEnabled = this._defaultCommentingEnablement;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("comments.visible")) {
        this.enableCommenting(this._defaultCommentingEnablement);
      }
    }));
  }
  _handleZenMode() {
    let preZenModeValue = this._isCommentingEnabled;
    this._register(this.layoutService.onDidChangeZenMode((e) => {
      if (e) {
        preZenModeValue = this._isCommentingEnabled;
        this.enableCommenting(false);
      } else {
        this.enableCommenting(preZenModeValue);
      }
    }));
  }
  get _defaultCommentingEnablement() {
    return !!this.configurationService.getValue(COMMENTS_SECTION)?.visible;
  }
  get isCommentingEnabled() {
    return this._isCommentingEnabled;
  }
  enableCommenting(enable) {
    if (enable !== this._isCommentingEnabled) {
      this._isCommentingEnabled = enable;
      this._commentingEnabled.set(enable);
      this._onDidChangeCommentingEnabled.fire(enable);
    }
  }
  /**
   * The current comment thread is the thread that has focus or is being hovered.
   * @param commentThread
   */
  setCurrentCommentThread(commentThread) {
    this._onDidChangeCurrentCommentThread.fire(commentThread);
  }
  /**
   * The active comment thread is the thread that is currently being edited.
   * @param commentThread
   */
  setActiveEditingCommentThread(commentThread) {
    this._onDidChangeActiveEditingCommentThread.fire(commentThread);
  }
  get lastActiveCommentcontroller() {
    return this._lastActiveCommentController;
  }
  async setActiveCommentAndThread(uniqueOwner, commentInfo) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (!commentController) {
      return;
    }
    if (commentController !== this._lastActiveCommentController) {
      await this._lastActiveCommentController?.setActiveCommentAndThread(void 0);
    }
    this._lastActiveCommentController = commentController;
    return commentController.setActiveCommentAndThread(commentInfo);
  }
  setDocumentComments(resource, commentInfos) {
    this._onDidSetResourceCommentInfos.fire({ resource, commentInfos });
  }
  setModelThreads(ownerId, owner, ownerLabel, commentThreads) {
    this._commentsModel.setCommentThreads(ownerId, owner, ownerLabel, commentThreads);
    this._onDidSetAllCommentThreads.fire({ ownerId, ownerLabel, commentThreads });
  }
  updateModelThreads(event) {
    this._commentsModel.updateCommentThreads(event);
    this._onDidUpdateCommentThreads.fire(event);
  }
  setWorkspaceComments(uniqueOwner, commentsByResource) {
    if (commentsByResource.length) {
      this._workspaceHasCommenting.set(true);
    }
    const control = this._commentControls.get(uniqueOwner);
    if (control) {
      this.setModelThreads(uniqueOwner, control.owner, control.label, commentsByResource);
    }
  }
  removeWorkspaceComments(uniqueOwner) {
    const control = this._commentControls.get(uniqueOwner);
    if (control) {
      this.setModelThreads(uniqueOwner, control.owner, control.label, []);
    }
  }
  registerCommentController(uniqueOwner, commentControl) {
    this._commentControls.set(uniqueOwner, commentControl);
    this._onDidSetDataProvider.fire();
  }
  unregisterCommentController(uniqueOwner) {
    if (uniqueOwner) {
      this._commentControls.delete(uniqueOwner);
    } else {
      this._commentControls.clear();
    }
    this._commentsModel.deleteCommentsByOwner(uniqueOwner);
    this._onDidDeleteDataProvider.fire(uniqueOwner);
  }
  getCommentController(uniqueOwner) {
    return this._commentControls.get(uniqueOwner);
  }
  async createCommentThreadTemplate(uniqueOwner, resource, range, editorId) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (!commentController) {
      return;
    }
    return commentController.createCommentThreadTemplate(resource, range, editorId);
  }
  async updateCommentThreadTemplate(uniqueOwner, threadHandle, range) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (!commentController) {
      return;
    }
    await commentController.updateCommentThreadTemplate(threadHandle, range);
  }
  disposeCommentThread(uniqueOwner, threadId) {
    const controller = this.getCommentController(uniqueOwner);
    controller?.deleteCommentThreadMain(threadId);
  }
  getCommentMenus(uniqueOwner) {
    if (this._commentMenus.get(uniqueOwner)) {
      return this._commentMenus.get(uniqueOwner);
    }
    const menu = this.instantiationService.createInstance(CommentMenus);
    this._commentMenus.set(uniqueOwner, menu);
    return menu;
  }
  updateComments(ownerId, event) {
    const control = this._commentControls.get(ownerId);
    if (control) {
      const evt = Object.assign({}, event, { uniqueOwner: ownerId, ownerLabel: control.label, owner: control.owner });
      this.updateModelThreads(evt);
    }
  }
  updateNotebookComments(ownerId, event) {
    const evt = Object.assign({}, event, { uniqueOwner: ownerId });
    this._onDidUpdateNotebookCommentThreads.fire(evt);
  }
  updateCommentingRanges(ownerId, resourceHints) {
    if (resourceHints?.schemes && resourceHints.schemes.length > 0) {
      for (const scheme of resourceHints.schemes) {
        this._commentingRangeResourceHintSchemes.add(scheme);
      }
    }
    this._workspaceHasCommenting.set(true);
    this._onDidUpdateCommentingRanges.fire({ uniqueOwner: ownerId });
  }
  async toggleReaction(uniqueOwner, resource, thread, comment, reaction) {
    const commentController = this._commentControls.get(uniqueOwner);
    if (commentController) {
      return commentController.toggleReaction(resource, thread, comment, reaction, CancellationToken.None);
    } else {
      throw new Error("Not supported");
    }
  }
  hasReactionHandler(uniqueOwner) {
    const commentProvider = this._commentControls.get(uniqueOwner);
    if (commentProvider) {
      return !!commentProvider.features.reactionHandler;
    }
    return false;
  }
  async getDocumentComments(resource) {
    const commentControlResult = [];
    for (const control of this._commentControls.values()) {
      commentControlResult.push(control.getDocumentComments(resource, CancellationToken.None).then((documentComments) => {
        for (const documentCommentThread of documentComments.threads) {
          if (documentCommentThread.comments?.length === 0 && documentCommentThread.range) {
            this.removeContinueOnComment({ range: documentCommentThread.range, uri: resource, uniqueOwner: documentComments.uniqueOwner });
          }
        }
        const pendingComments = this._continueOnComments.get(documentComments.uniqueOwner);
        documentComments.pendingCommentThreads = pendingComments?.filter((pendingComment) => pendingComment.uri.toString() === resource.toString());
        return documentComments;
      }).catch((_) => {
        return null;
      }));
    }
    const commentInfos = await Promise.all(commentControlResult);
    this._updateResourcesWithCommentingRanges(resource, commentInfos);
    return commentInfos;
  }
  async getNotebookComments(resource) {
    const commentControlResult = [];
    this._commentControls.forEach((control) => {
      commentControlResult.push(control.getNotebookComments(resource, CancellationToken.None).catch((_) => {
        return null;
      }));
    });
    return Promise.all(commentControlResult);
  }
  registerContinueOnCommentProvider(provider) {
    this._continueOnCommentProviders.add(provider);
    return {
      dispose: () => {
        this._continueOnCommentProviders.delete(provider);
      }
    };
  }
  _saveContinueOnComments(map) {
    const commentsToSave = [];
    for (const pendingComments of map.values()) {
      commentsToSave.push(...pendingComments);
    }
    this.logService.debug(`Comments: URIs of continue on comments to add to storage ${commentsToSave.map((thread) => thread.uri.toString()).join(", ")}.`);
    this.storageService.store(CONTINUE_ON_COMMENTS, commentsToSave, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  removeContinueOnComment(pendingComment) {
    const pendingComments = this._continueOnComments.get(pendingComment.uniqueOwner);
    if (pendingComments) {
      const commentIndex = pendingComments.findIndex((comment) => comment.uri.toString() === pendingComment.uri.toString() && Range.equalsRange(comment.range, pendingComment.range) && (pendingComment.isReply === void 0 || comment.isReply === pendingComment.isReply));
      if (commentIndex > -1) {
        return pendingComments.splice(commentIndex, 1)[0];
      }
    }
    return void 0;
  }
  _addContinueOnComments(pendingComments, map) {
    const changedOwners = /* @__PURE__ */ new Set();
    for (const pendingComment of pendingComments) {
      if (!map.has(pendingComment.uniqueOwner)) {
        map.set(pendingComment.uniqueOwner, [pendingComment]);
        changedOwners.add(pendingComment.uniqueOwner);
      } else {
        const commentsForOwner = map.get(pendingComment.uniqueOwner);
        if (commentsForOwner.every((comment) => comment.uri.toString() !== pendingComment.uri.toString() || !Range.equalsRange(comment.range, pendingComment.range))) {
          commentsForOwner.push(pendingComment);
          changedOwners.add(pendingComment.uniqueOwner);
        }
      }
    }
    return changedOwners;
  }
  resourceHasCommentingRanges(resource) {
    return this._commentingRangeResourceHintSchemes.has(resource.scheme) || this._commentingRangeResources.has(resource.toString());
  }
};
CommentService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkbenchLayoutService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IModelService)
], CommentService);
export {
  CommentService,
  ICommentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50LCBDb21tZW50SW5mbywgQ29tbWVudCwgQ29tbWVudFJlYWN0aW9uLCBDb21tZW50aW5nUmFuZ2VzLCBDb21tZW50VGhyZWFkLCBDb21tZW50T3B0aW9ucywgUGVuZGluZ0NvbW1lbnRUaHJlYWQsIENvbW1lbnRpbmdSYW5nZVJlc291cmNlSGludCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlLCBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi9jb21tb24vY29tbWVudE1vZGVsLmpzJztcbmltcG9ydCB7IENvbW1lbnRNZW51cyB9IGZyb20gJy4vY29tbWVudE1lbnVzLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDT01NRU5UU19TRUNUSU9OLCBJQ29tbWVudHNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ29tbWVudENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENvbW1lbnRzTW9kZWwsIElDb21tZW50c01vZGVsIH0gZnJvbSAnLi9jb21tZW50c01vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuZXhwb3J0IGNvbnN0IElDb21tZW50U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ29tbWVudFNlcnZpY2U+KCdjb21tZW50U2VydmljZScpO1xuXG5pbnRlcmZhY2UgSVJlc291cmNlQ29tbWVudFRocmVhZEV2ZW50IHtcblx0cmVzb3VyY2U6IFVSSTtcblx0Y29tbWVudEluZm9zOiBJQ29tbWVudEluZm9bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWVudEluZm88VCA9IElSYW5nZT4gZXh0ZW5kcyBDb21tZW50SW5mbzxUPiB7XG5cdHVuaXF1ZU93bmVyOiBzdHJpbmc7XG5cdGxhYmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0NvbW1lbnRJbmZvIHtcblx0ZXh0ZW5zaW9uSWQ/OiBzdHJpbmc7XG5cdHRocmVhZHM6IENvbW1lbnRUaHJlYWQ8SUNlbGxSYW5nZT5bXTtcblx0dW5pcXVlT3duZXI6IHN0cmluZztcblx0bGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtzcGFjZUNvbW1lbnRUaHJlYWRzRXZlbnQge1xuXHRvd25lcklkOiBzdHJpbmc7XG5cdG93bmVyTGFiZWw6IHN0cmluZztcblx0Y29tbWVudFRocmVhZHM6IENvbW1lbnRUaHJlYWRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50IGV4dGVuZHMgQ29tbWVudFRocmVhZENoYW5nZWRFdmVudDxJQ2VsbFJhbmdlPiB7XG5cdHVuaXF1ZU93bmVyOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1lbnRDb250cm9sbGVyIHtcblx0aWQ6IHN0cmluZztcblx0bGFiZWw6IHN0cmluZztcblx0ZmVhdHVyZXM6IHtcblx0XHRyZWFjdGlvbkdyb3VwPzogQ29tbWVudFJlYWN0aW9uW107XG5cdFx0cmVhY3Rpb25IYW5kbGVyPzogYm9vbGVhbjtcblx0XHRvcHRpb25zPzogQ29tbWVudE9wdGlvbnM7XG5cdH07XG5cdG9wdGlvbnM/OiBDb21tZW50T3B0aW9ucztcblx0Y29udGV4dFZhbHVlPzogc3RyaW5nO1xuXHRvd25lcjogc3RyaW5nO1xuXHRhY3RpdmVDb21tZW50OiB7IHRocmVhZDogQ29tbWVudFRocmVhZDsgY29tbWVudD86IENvbW1lbnQgfSB8IHVuZGVmaW5lZDtcblx0Y3JlYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLCBlZGl0b3JJZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh0aHJlYWRIYW5kbGU6IG51bWJlciwgcmFuZ2U6IElSYW5nZSk6IFByb21pc2U8dm9pZD47XG5cdGRlbGV0ZUNvbW1lbnRUaHJlYWRNYWluKGNvbW1lbnRUaHJlYWRJZDogc3RyaW5nKTogdm9pZDtcblx0dG9nZ2xlUmVhY3Rpb24odXJpOiBVUkksIHRocmVhZDogQ29tbWVudFRocmVhZCwgY29tbWVudDogQ29tbWVudCwgcmVhY3Rpb246IENvbW1lbnRSZWFjdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0RG9jdW1lbnRDb21tZW50cyhyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDb21tZW50SW5mbzxJUmFuZ2U+Pjtcblx0Z2V0Tm90ZWJvb2tDb21tZW50cyhyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElOb3RlYm9va0NvbW1lbnRJbmZvPjtcblx0c2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZChjb21tZW50SW5mbzogeyB0aHJlYWQ6IENvbW1lbnRUaHJlYWQ7IGNvbW1lbnQ/OiBDb21tZW50IH0gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250aW51ZU9uQ29tbWVudFByb3ZpZGVyIHtcblx0cHJvdmlkZUNvbnRpbnVlT25Db21tZW50cygpOiBQZW5kaW5nQ29tbWVudFRocmVhZFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tZW50U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRTZXRSZXNvdXJjZUNvbW1lbnRJbmZvczogRXZlbnQ8SVJlc291cmNlQ29tbWVudFRocmVhZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRTZXRBbGxDb21tZW50VGhyZWFkczogRXZlbnQ8SVdvcmtzcGFjZUNvbW1lbnRUaHJlYWRzRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWRzOiBFdmVudDxJQ29tbWVudFRocmVhZENoYW5nZWRFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlTm90ZWJvb2tDb21tZW50VGhyZWFkczogRXZlbnQ8SU5vdGVib29rQ29tbWVudFRocmVhZENoYW5nZWRFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQ6IEV2ZW50PENvbW1lbnRUaHJlYWQgfCBudWxsPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXJyZW50Q29tbWVudFRocmVhZDogRXZlbnQ8Q29tbWVudFRocmVhZCB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlQ29tbWVudGluZ1JhbmdlczogRXZlbnQ8eyB1bmlxdWVPd25lcjogc3RyaW5nIH0+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUNvbW1lbnRpbmdSYW5nZTogRXZlbnQ8eyByYW5nZTogUmFuZ2U7IGNvbW1lbnRpbmdSYW5nZXNJbmZvOiBDb21tZW50aW5nUmFuZ2VzIH0+O1xuXHRyZWFkb25seSBvbkRpZFNldERhdGFQcm92aWRlcjogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkRGVsZXRlRGF0YVByb3ZpZGVyOiBFdmVudDxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbW1lbnRpbmdFbmFibGVkOiBFdmVudDxib29sZWFuPjtcblx0cmVhZG9ubHkgb25SZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXM6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBpc0NvbW1lbnRpbmdFbmFibGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBjb21tZW50c01vZGVsOiBJQ29tbWVudHNNb2RlbDtcblx0cmVhZG9ubHkgbGFzdEFjdGl2ZUNvbW1lbnRjb250cm9sbGVyOiBJQ29tbWVudENvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdHNldERvY3VtZW50Q29tbWVudHMocmVzb3VyY2U6IFVSSSwgY29tbWVudEluZm9zOiBJQ29tbWVudEluZm9bXSk6IHZvaWQ7XG5cdHNldFdvcmtzcGFjZUNvbW1lbnRzKHVuaXF1ZU93bmVyOiBzdHJpbmcsIGNvbW1lbnRzQnlSZXNvdXJjZTogQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPltdKTogdm9pZDtcblx0cmVtb3ZlV29ya3NwYWNlQ29tbWVudHModW5pcXVlT3duZXI6IHN0cmluZyk6IHZvaWQ7XG5cdHJlZ2lzdGVyQ29tbWVudENvbnRyb2xsZXIodW5pcXVlT3duZXI6IHN0cmluZywgY29tbWVudENvbnRyb2w6IElDb21tZW50Q29udHJvbGxlcik6IHZvaWQ7XG5cdHVucmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcih1bmlxdWVPd25lcj86IHN0cmluZyk6IHZvaWQ7XG5cdGdldENvbW1lbnRDb250cm9sbGVyKHVuaXF1ZU93bmVyOiBzdHJpbmcpOiBJQ29tbWVudENvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdGNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh1bmlxdWVPd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJLCByYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQsIGVkaXRvcklkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHVuaXF1ZU93bmVyOiBzdHJpbmcsIHRocmVhZEhhbmRsZTogbnVtYmVyLCByYW5nZTogUmFuZ2UpOiBQcm9taXNlPHZvaWQ+O1xuXHRnZXRDb21tZW50TWVudXModW5pcXVlT3duZXI6IHN0cmluZyk6IENvbW1lbnRNZW51cztcblx0dXBkYXRlQ29tbWVudHMob3duZXJJZDogc3RyaW5nLCBldmVudDogQ29tbWVudFRocmVhZENoYW5nZWRFdmVudDxJUmFuZ2U+KTogdm9pZDtcblx0dXBkYXRlTm90ZWJvb2tDb21tZW50cyhvd25lcklkOiBzdHJpbmcsIGV2ZW50OiBDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PElDZWxsUmFuZ2U+KTogdm9pZDtcblx0ZGlzcG9zZUNvbW1lbnRUaHJlYWQob3duZXJJZDogc3RyaW5nLCB0aHJlYWRJZDogc3RyaW5nKTogdm9pZDtcblx0Z2V0RG9jdW1lbnRDb21tZW50cyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTwoSUNvbW1lbnRJbmZvIHwgbnVsbClbXT47XG5cdGdldE5vdGVib29rQ29tbWVudHMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8KElOb3RlYm9va0NvbW1lbnRJbmZvIHwgbnVsbClbXT47XG5cdHVwZGF0ZUNvbW1lbnRpbmdSYW5nZXMob3duZXJJZDogc3RyaW5nLCByZXNvdXJjZUhpbnRzPzogQ29tbWVudGluZ1JhbmdlUmVzb3VyY2VIaW50KTogdm9pZDtcblx0aGFzUmVhY3Rpb25IYW5kbGVyKHVuaXF1ZU93bmVyOiBzdHJpbmcpOiBib29sZWFuO1xuXHR0b2dnbGVSZWFjdGlvbih1bmlxdWVPd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJLCB0aHJlYWQ6IENvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT4sIGNvbW1lbnQ6IENvbW1lbnQsIHJlYWN0aW9uOiBDb21tZW50UmVhY3Rpb24pOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXRBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkOiBDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+IHwgbnVsbCk6IHZvaWQ7XG5cdHNldEN1cnJlbnRDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWQ6IENvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT4gfCB1bmRlZmluZWQpOiB2b2lkO1xuXHRzZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKHVuaXF1ZU93bmVyOiBzdHJpbmcsIGNvbW1lbnRJbmZvOiB7IHRocmVhZDogQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPjsgY29tbWVudD86IENvbW1lbnQgfSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG5cdGVuYWJsZUNvbW1lbnRpbmcoZW5hYmxlOiBib29sZWFuKTogdm9pZDtcblx0cmVnaXN0ZXJDb250aW51ZU9uQ29tbWVudFByb3ZpZGVyKHByb3ZpZGVyOiBJQ29udGludWVPbkNvbW1lbnRQcm92aWRlcik6IElEaXNwb3NhYmxlO1xuXHRyZW1vdmVDb250aW51ZU9uQ29tbWVudChwZW5kaW5nQ29tbWVudDogeyByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkOyB1cmk6IFVSSTsgdW5pcXVlT3duZXI6IHN0cmluZzsgaXNSZXBseT86IGJvb2xlYW4gfSk6IFBlbmRpbmdDb21tZW50VGhyZWFkIHwgdW5kZWZpbmVkO1xuXHRyZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXMocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW47XG59XG5cbmNvbnN0IENPTlRJTlVFX09OX0NPTU1FTlRTID0gJ2NvbW1lbnRzLmNvbnRpbnVlT25Db21tZW50cyc7XG5cbmV4cG9ydCBjbGFzcyBDb21tZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29tbWVudFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNldERhdGFQcm92aWRlcjogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNldERhdGFQcm92aWRlcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFNldERhdGFQcm92aWRlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERlbGV0ZURhdGFQcm92aWRlcjogRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWREZWxldGVEYXRhUHJvdmlkZXI6IEV2ZW50PHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZERlbGV0ZURhdGFQcm92aWRlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNldFJlc291cmNlQ29tbWVudEluZm9zOiBFbWl0dGVyPElSZXNvdXJjZUNvbW1lbnRUaHJlYWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVzb3VyY2VDb21tZW50VGhyZWFkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNldFJlc291cmNlQ29tbWVudEluZm9zOiBFdmVudDxJUmVzb3VyY2VDb21tZW50VGhyZWFkRXZlbnQ+ID0gdGhpcy5fb25EaWRTZXRSZXNvdXJjZUNvbW1lbnRJbmZvcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNldEFsbENvbW1lbnRUaHJlYWRzOiBFbWl0dGVyPElXb3Jrc3BhY2VDb21tZW50VGhyZWFkc0V2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VDb21tZW50VGhyZWFkc0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTZXRBbGxDb21tZW50VGhyZWFkczogRXZlbnQ8SVdvcmtzcGFjZUNvbW1lbnRUaHJlYWRzRXZlbnQ+ID0gdGhpcy5fb25EaWRTZXRBbGxDb21tZW50VGhyZWFkcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWRzOiBFbWl0dGVyPElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVDb21tZW50VGhyZWFkczogRXZlbnQ8SUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZU5vdGVib29rQ29tbWVudFRocmVhZHM6IEVtaXR0ZXI8SU5vdGVib29rQ29tbWVudFRocmVhZENoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVOb3RlYm9va0NvbW1lbnRUaHJlYWRzOiBFdmVudDxJTm90ZWJvb2tDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX29uRGlkVXBkYXRlTm90ZWJvb2tDb21tZW50VGhyZWFkcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZUNvbW1lbnRpbmdSYW5nZXM6IEVtaXR0ZXI8eyB1bmlxdWVPd25lcjogc3RyaW5nIH0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB1bmlxdWVPd25lcjogc3RyaW5nIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZUNvbW1lbnRpbmdSYW5nZXM6IEV2ZW50PHsgdW5pcXVlT3duZXI6IHN0cmluZyB9PiA9IHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudGluZ1Jhbmdlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29tbWVudFRocmVhZCB8IG51bGw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUN1cnJlbnRDb21tZW50VGhyZWFkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29tbWVudFRocmVhZCB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VycmVudENvbW1lbnRUaHJlYWQgPSB0aGlzLl9vbkRpZENoYW5nZUN1cnJlbnRDb21tZW50VGhyZWFkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29tbWVudGluZ0VuYWJsZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb21tZW50aW5nRW5hYmxlZCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29tbWVudGluZ0VuYWJsZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25SZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXMgPSB0aGlzLl9vblJlc291cmNlSGFzQ29tbWVudGluZ1Jhbmdlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUNvbW1lbnRpbmdSYW5nZTogRW1pdHRlcjx7XG5cdFx0cmFuZ2U6IFJhbmdlOyBjb21tZW50aW5nUmFuZ2VzSW5mbzpcblx0XHRDb21tZW50aW5nUmFuZ2VzO1xuXHR9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHtcblx0XHRyYW5nZTogUmFuZ2U7IGNvbW1lbnRpbmdSYW5nZXNJbmZvOlxuXHRcdENvbW1lbnRpbmdSYW5nZXM7XG5cdH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUNvbW1lbnRpbmdSYW5nZTogRXZlbnQ8eyByYW5nZTogUmFuZ2U7IGNvbW1lbnRpbmdSYW5nZXNJbmZvOiBDb21tZW50aW5nUmFuZ2VzIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb21tZW50aW5nUmFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY29tbWVudENvbnRyb2xzID0gbmV3IE1hcDxzdHJpbmcsIElDb21tZW50Q29udHJvbGxlcj4oKTtcblx0cHJpdmF0ZSBfY29tbWVudE1lbnVzID0gbmV3IE1hcDxzdHJpbmcsIENvbW1lbnRNZW51cz4oKTtcblx0cHJpdmF0ZSBfaXNDb21tZW50aW5nRW5hYmxlZDogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX3dvcmtzcGFjZUhhc0NvbW1lbnRpbmc6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9jb21tZW50aW5nRW5hYmxlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfY29udGludWVPbkNvbW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdDb21tZW50VGhyZWFkW10+KCk7IC8vIHVuaXF1ZU93bmVyIC0+IFBlbmRpbmdDb21tZW50VGhyZWFkW11cblx0cHJpdmF0ZSBfY29udGludWVPbkNvbW1lbnRQcm92aWRlcnMgPSBuZXcgU2V0PElDb250aW51ZU9uQ29tbWVudFByb3ZpZGVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRzTW9kZWw6IENvbW1lbnRzTW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29tbWVudHNNb2RlbCgpKTtcblx0cHVibGljIHJlYWRvbmx5IGNvbW1lbnRzTW9kZWw6IElDb21tZW50c01vZGVsID0gdGhpcy5fY29tbWVudHNNb2RlbDtcblxuXHRwcml2YXRlIF9jb21tZW50aW5nUmFuZ2VSZXNvdXJjZXMgPSBuZXcgU2V0PHN0cmluZz4oKTsgLy8gVVJJc1xuXHRwcml2YXRlIF9jb21tZW50aW5nUmFuZ2VSZXNvdXJjZUhpbnRTY2hlbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7IC8vIHNjaGVtZXNcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2hhbmRsZUNvbmZpZ3VyYXRpb24oKTtcblx0XHR0aGlzLl9oYW5kbGVaZW5Nb2RlKCk7XG5cdFx0dGhpcy5fd29ya3NwYWNlSGFzQ29tbWVudGluZyA9IENvbW1lbnRDb250ZXh0S2V5cy5Xb3Jrc3BhY2VIYXNDb21tZW50aW5nLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY29tbWVudGluZ0VuYWJsZWQgPSBDb21tZW50Q29udGV4dEtleXMuY29tbWVudGluZ0VuYWJsZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yYWdlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZUV2ZW50ID0gRXZlbnQuZGVib3VuY2UodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIENPTlRJTlVFX09OX0NPTU1FTlRTLCBzdG9yYWdlTGlzdGVuZXIpLCAobGFzdCwgZXZlbnQpID0+IGxhc3Q/LmV4dGVybmFsID8gbGFzdCA6IGV2ZW50LCA1MDApO1xuXHRcdHN0b3JhZ2VMaXN0ZW5lci5hZGQoc3RvcmFnZUV2ZW50KHYgPT4ge1xuXHRcdFx0aWYgKCF2LmV4dGVybmFsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbW1lbnRzVG9SZXN0b3JlOiBQZW5kaW5nQ29tbWVudFRocmVhZFtdIHwgdW5kZWZpbmVkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3QoQ09OVElOVUVfT05fQ09NTUVOVFMsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0aWYgKCFjb21tZW50c1RvUmVzdG9yZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYENvbW1lbnRzOiBVUklzIG9mIGNvbnRpbnVlIG9uIGNvbW1lbnRzIGZyb20gc3RvcmFnZSAke2NvbW1lbnRzVG9SZXN0b3JlLm1hcCh0aHJlYWQgPT4gdGhyZWFkLnVyaS50b1N0cmluZygpKS5qb2luKCcsICcpfS5gKTtcblx0XHRcdGNvbnN0IGNoYW5nZWRPd25lcnMgPSB0aGlzLl9hZGRDb250aW51ZU9uQ29tbWVudHMoY29tbWVudHNUb1Jlc3RvcmUsIHRoaXMuX2NvbnRpbnVlT25Db21tZW50cyk7XG5cdFx0XHRmb3IgKGNvbnN0IHVuaXF1ZU93bmVyIG9mIGNoYW5nZWRPd25lcnMpIHtcblx0XHRcdFx0Y29uc3QgY29udHJvbCA9IHRoaXMuX2NvbW1lbnRDb250cm9scy5nZXQodW5pcXVlT3duZXIpO1xuXHRcdFx0XHRpZiAoIWNvbnRyb2wpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBldnQ6IElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50ID0ge1xuXHRcdFx0XHRcdHVuaXF1ZU93bmVyOiB1bmlxdWVPd25lcixcblx0XHRcdFx0XHRvd25lcjogY29udHJvbC5vd25lcixcblx0XHRcdFx0XHRvd25lckxhYmVsOiBjb250cm9sLmxhYmVsLFxuXHRcdFx0XHRcdHBlbmRpbmc6IHRoaXMuX2NvbnRpbnVlT25Db21tZW50cy5nZXQodW5pcXVlT3duZXIpIHx8IFtdLFxuXHRcdFx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdFx0XHRyZW1vdmVkOiBbXSxcblx0XHRcdFx0XHRjaGFuZ2VkOiBbXVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU1vZGVsVGhyZWFkcyhldnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFwOiBNYXA8c3RyaW5nLCBQZW5kaW5nQ29tbWVudFRocmVhZFtdPiA9IG5ldyBNYXAoKTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fY29udGludWVPbkNvbW1lbnRQcm92aWRlcnMpIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZ0NvbW1lbnRzID0gcHJvdmlkZXIucHJvdmlkZUNvbnRpbnVlT25Db21tZW50cygpO1xuXHRcdFx0XHR0aGlzLl9hZGRDb250aW51ZU9uQ29tbWVudHMocGVuZGluZ0NvbW1lbnRzLCBtYXApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2F2ZUNvbnRpbnVlT25Db21tZW50cyhtYXApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWxTZXJ2aWNlLm9uTW9kZWxBZGRlZChtb2RlbCA9PiB7XG5cdFx0XHQvLyBFeGNsdWRlZCBzY2hlbWVzXG5cdFx0XHRpZiAoKG1vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlU291cmNlQ29udHJvbCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQWxsb3dzIGNvbW1lbnQgcHJvdmlkZXJzIHRvIGNhdXNlIHRoZWlyIGNvbW1lbnRpbmcgcmFuZ2VzIHRvIGJlIHByZWZldGNoZWQgYnkgb3BlbmluZyB0ZXh0IGRvY3VtZW50cyBpbiB0aGUgYmFja2dyb3VuZC5cblx0XHRcdGlmICghdGhpcy5fY29tbWVudGluZ1JhbmdlUmVzb3VyY2VzLmhhcyhtb2RlbC51cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0dGhpcy5nZXREb2N1bWVudENvbW1lbnRzKG1vZGVsLnVyaSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUmVzb3VyY2VzV2l0aENvbW1lbnRpbmdSYW5nZXMocmVzb3VyY2U6IFVSSSwgY29tbWVudEluZm9zOiAoSUNvbW1lbnRJbmZvIHwgbnVsbClbXSkge1xuXHRcdGxldCBhZGRlZFJlc291cmNlcyA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgY29tbWVudHMgb2YgY29tbWVudEluZm9zKSB7XG5cdFx0XHRpZiAoY29tbWVudHMgJiYgKGNvbW1lbnRzLmNvbW1lbnRpbmdSYW5nZXMucmFuZ2VzLmxlbmd0aCA+IDAgfHwgY29tbWVudHMudGhyZWFkcy5sZW5ndGggPiAwKSkge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VSZXNvdXJjZXMuYWRkKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhZGRlZFJlc291cmNlcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhZGRlZFJlc291cmNlcykge1xuXHRcdFx0dGhpcy5fb25SZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUNvbmZpZ3VyYXRpb24oKSB7XG5cdFx0dGhpcy5faXNDb21tZW50aW5nRW5hYmxlZCA9IHRoaXMuX2RlZmF1bHRDb21tZW50aW5nRW5hYmxlbWVudDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdjb21tZW50cy52aXNpYmxlJykpIHtcblx0XHRcdFx0dGhpcy5lbmFibGVDb21tZW50aW5nKHRoaXMuX2RlZmF1bHRDb21tZW50aW5nRW5hYmxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlWmVuTW9kZSgpIHtcblx0XHRsZXQgcHJlWmVuTW9kZVZhbHVlOiBib29sZWFuID0gdGhpcy5faXNDb21tZW50aW5nRW5hYmxlZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VaZW5Nb2RlKGUgPT4ge1xuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0cHJlWmVuTW9kZVZhbHVlID0gdGhpcy5faXNDb21tZW50aW5nRW5hYmxlZDtcblx0XHRcdFx0dGhpcy5lbmFibGVDb21tZW50aW5nKGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZW5hYmxlQ29tbWVudGluZyhwcmVaZW5Nb2RlVmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9kZWZhdWx0Q29tbWVudGluZ0VuYWJsZW1lbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJQ29tbWVudHNDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkPihDT01NRU5UU19TRUNUSU9OKT8udmlzaWJsZTtcblx0fVxuXG5cdGdldCBpc0NvbW1lbnRpbmdFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0NvbW1lbnRpbmdFbmFibGVkO1xuXHR9XG5cblx0ZW5hYmxlQ29tbWVudGluZyhlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZW5hYmxlICE9PSB0aGlzLl9pc0NvbW1lbnRpbmdFbmFibGVkKSB7XG5cdFx0XHR0aGlzLl9pc0NvbW1lbnRpbmdFbmFibGVkID0gZW5hYmxlO1xuXHRcdFx0dGhpcy5fY29tbWVudGluZ0VuYWJsZWQuc2V0KGVuYWJsZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbW1lbnRpbmdFbmFibGVkLmZpcmUoZW5hYmxlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGN1cnJlbnQgY29tbWVudCB0aHJlYWQgaXMgdGhlIHRocmVhZCB0aGF0IGhhcyBmb2N1cyBvciBpcyBiZWluZyBob3ZlcmVkLlxuXHQgKiBAcGFyYW0gY29tbWVudFRocmVhZFxuXHQgKi9cblx0c2V0Q3VycmVudENvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZDogQ29tbWVudFRocmVhZCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3VycmVudENvbW1lbnRUaHJlYWQuZmlyZShjb21tZW50VGhyZWFkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYWN0aXZlIGNvbW1lbnQgdGhyZWFkIGlzIHRoZSB0aHJlYWQgdGhhdCBpcyBjdXJyZW50bHkgYmVpbmcgZWRpdGVkLlxuXHQgKiBAcGFyYW0gY29tbWVudFRocmVhZFxuXHQgKi9cblx0c2V0QWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZDogQ29tbWVudFRocmVhZCB8IG51bGwpIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkLmZpcmUoY29tbWVudFRocmVhZCk7XG5cdH1cblxuXHRnZXQgbGFzdEFjdGl2ZUNvbW1lbnRjb250cm9sbGVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0QWN0aXZlQ29tbWVudENvbnRyb2xsZXI7XG5cdH1cblxuXHRwcml2YXRlIF9sYXN0QWN0aXZlQ29tbWVudENvbnRyb2xsZXI6IElDb21tZW50Q29udHJvbGxlciB8IHVuZGVmaW5lZDtcblx0YXN5bmMgc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh1bmlxdWVPd25lcjogc3RyaW5nLCBjb21tZW50SW5mbzogeyB0aHJlYWQ6IENvbW1lbnRUaHJlYWQ8SVJhbmdlPjsgY29tbWVudD86IENvbW1lbnQgfSB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cblx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNvbW1lbnRDb250cm9sbGVyICE9PSB0aGlzLl9sYXN0QWN0aXZlQ29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2xhc3RBY3RpdmVDb21tZW50Q29udHJvbGxlcj8uc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0QWN0aXZlQ29tbWVudENvbnRyb2xsZXIgPSBjb21tZW50Q29udHJvbGxlcjtcblx0XHRyZXR1cm4gY29tbWVudENvbnRyb2xsZXIuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZChjb21tZW50SW5mbyk7XG5cdH1cblxuXHRzZXREb2N1bWVudENvbW1lbnRzKHJlc291cmNlOiBVUkksIGNvbW1lbnRJbmZvczogSUNvbW1lbnRJbmZvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFNldFJlc291cmNlQ29tbWVudEluZm9zLmZpcmUoeyByZXNvdXJjZSwgY29tbWVudEluZm9zIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNb2RlbFRocmVhZHMob3duZXJJZDogc3RyaW5nLCBvd25lcjogc3RyaW5nLCBvd25lckxhYmVsOiBzdHJpbmcsIGNvbW1lbnRUaHJlYWRzOiBDb21tZW50VGhyZWFkPElSYW5nZT5bXSkge1xuXHRcdHRoaXMuX2NvbW1lbnRzTW9kZWwuc2V0Q29tbWVudFRocmVhZHMob3duZXJJZCwgb3duZXIsIG93bmVyTGFiZWwsIGNvbW1lbnRUaHJlYWRzKTtcblx0XHR0aGlzLl9vbkRpZFNldEFsbENvbW1lbnRUaHJlYWRzLmZpcmUoeyBvd25lcklkLCBvd25lckxhYmVsLCBjb21tZW50VGhyZWFkcyB9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTW9kZWxUaHJlYWRzKGV2ZW50OiBJQ29tbWVudFRocmVhZENoYW5nZWRFdmVudCkge1xuXHRcdHRoaXMuX2NvbW1lbnRzTW9kZWwudXBkYXRlQ29tbWVudFRocmVhZHMoZXZlbnQpO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZHMuZmlyZShldmVudCk7XG5cdH1cblxuXHRzZXRXb3Jrc3BhY2VDb21tZW50cyh1bmlxdWVPd25lcjogc3RyaW5nLCBjb21tZW50c0J5UmVzb3VyY2U6IENvbW1lbnRUaHJlYWRbXSk6IHZvaWQge1xuXG5cdFx0aWYgKGNvbW1lbnRzQnlSZXNvdXJjZS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUhhc0NvbW1lbnRpbmcuc2V0KHRydWUpO1xuXHRcdH1cblx0XHRjb25zdCBjb250cm9sID0gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cdFx0aWYgKGNvbnRyb2wpIHtcblx0XHRcdHRoaXMuc2V0TW9kZWxUaHJlYWRzKHVuaXF1ZU93bmVyLCBjb250cm9sLm93bmVyLCBjb250cm9sLmxhYmVsLCBjb21tZW50c0J5UmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZVdvcmtzcGFjZUNvbW1lbnRzKHVuaXF1ZU93bmVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sID0gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cdFx0aWYgKGNvbnRyb2wpIHtcblx0XHRcdHRoaXMuc2V0TW9kZWxUaHJlYWRzKHVuaXF1ZU93bmVyLCBjb250cm9sLm93bmVyLCBjb250cm9sLmxhYmVsLCBbXSk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcih1bmlxdWVPd25lcjogc3RyaW5nLCBjb21tZW50Q29udHJvbDogSUNvbW1lbnRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWVudENvbnRyb2xzLnNldCh1bmlxdWVPd25lciwgY29tbWVudENvbnRyb2wpO1xuXHRcdHRoaXMuX29uRGlkU2V0RGF0YVByb3ZpZGVyLmZpcmUoKTtcblx0fVxuXG5cdHVucmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcih1bmlxdWVPd25lcj86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh1bmlxdWVPd25lcikge1xuXHRcdFx0dGhpcy5fY29tbWVudENvbnRyb2xzLmRlbGV0ZSh1bmlxdWVPd25lcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRDb250cm9scy5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50c01vZGVsLmRlbGV0ZUNvbW1lbnRzQnlPd25lcih1bmlxdWVPd25lcik7XG5cdFx0dGhpcy5fb25EaWREZWxldGVEYXRhUHJvdmlkZXIuZmlyZSh1bmlxdWVPd25lcik7XG5cdH1cblxuXHRnZXRDb21tZW50Q29udHJvbGxlcih1bmlxdWVPd25lcjogc3RyaW5nKTogSUNvbW1lbnRDb250cm9sbGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodW5pcXVlT3duZXI6IHN0cmluZywgcmVzb3VyY2U6IFVSSSwgcmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkLCBlZGl0b3JJZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xzLmdldCh1bmlxdWVPd25lcik7XG5cblx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbW1lbnRDb250cm9sbGVyLmNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZShyZXNvdXJjZSwgcmFuZ2UsIGVkaXRvcklkKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh1bmlxdWVPd25lcjogc3RyaW5nLCB0aHJlYWRIYW5kbGU6IG51bWJlciwgcmFuZ2U6IFJhbmdlKSB7XG5cdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbHMuZ2V0KHVuaXF1ZU93bmVyKTtcblxuXHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBjb21tZW50Q29udHJvbGxlci51cGRhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodGhyZWFkSGFuZGxlLCByYW5nZSk7XG5cdH1cblxuXHRkaXNwb3NlQ29tbWVudFRocmVhZCh1bmlxdWVPd25lcjogc3RyaW5nLCB0aHJlYWRJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuZ2V0Q29tbWVudENvbnRyb2xsZXIodW5pcXVlT3duZXIpO1xuXHRcdGNvbnRyb2xsZXI/LmRlbGV0ZUNvbW1lbnRUaHJlYWRNYWluKHRocmVhZElkKTtcblx0fVxuXG5cdGdldENvbW1lbnRNZW51cyh1bmlxdWVPd25lcjogc3RyaW5nKTogQ29tbWVudE1lbnVzIHtcblx0XHRpZiAodGhpcy5fY29tbWVudE1lbnVzLmdldCh1bmlxdWVPd25lcikpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb21tZW50TWVudXMuZ2V0KHVuaXF1ZU93bmVyKSE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWVudE1lbnVzKTtcblx0XHR0aGlzLl9jb21tZW50TWVudXMuc2V0KHVuaXF1ZU93bmVyLCBtZW51KTtcblx0XHRyZXR1cm4gbWVudTtcblx0fVxuXG5cdHVwZGF0ZUNvbW1lbnRzKG93bmVySWQ6IHN0cmluZywgZXZlbnQ6IENvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ8SVJhbmdlPik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2wgPSB0aGlzLl9jb21tZW50Q29udHJvbHMuZ2V0KG93bmVySWQpO1xuXHRcdGlmIChjb250cm9sKSB7XG5cdFx0XHRjb25zdCBldnQ6IElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50ID0gT2JqZWN0LmFzc2lnbih7fSwgZXZlbnQsIHsgdW5pcXVlT3duZXI6IG93bmVySWQsIG93bmVyTGFiZWw6IGNvbnRyb2wubGFiZWwsIG93bmVyOiBjb250cm9sLm93bmVyIH0pO1xuXHRcdFx0dGhpcy51cGRhdGVNb2RlbFRocmVhZHMoZXZ0KTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVOb3RlYm9va0NvbW1lbnRzKG93bmVySWQ6IHN0cmluZywgZXZlbnQ6IENvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQ8SUNlbGxSYW5nZT4pOiB2b2lkIHtcblx0XHRjb25zdCBldnQ6IElOb3RlYm9va0NvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQgPSBPYmplY3QuYXNzaWduKHt9LCBldmVudCwgeyB1bmlxdWVPd25lcjogb3duZXJJZCB9KTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZU5vdGVib29rQ29tbWVudFRocmVhZHMuZmlyZShldnQpO1xuXHR9XG5cblx0dXBkYXRlQ29tbWVudGluZ1Jhbmdlcyhvd25lcklkOiBzdHJpbmcsIHJlc291cmNlSGludHM/OiBDb21tZW50aW5nUmFuZ2VSZXNvdXJjZUhpbnQpIHtcblx0XHRpZiAocmVzb3VyY2VIaW50cz8uc2NoZW1lcyAmJiByZXNvdXJjZUhpbnRzLnNjaGVtZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBzY2hlbWUgb2YgcmVzb3VyY2VIaW50cy5zY2hlbWVzKSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZVJlc291cmNlSGludFNjaGVtZXMuYWRkKHNjaGVtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3dvcmtzcGFjZUhhc0NvbW1lbnRpbmcuc2V0KHRydWUpO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudGluZ1Jhbmdlcy5maXJlKHsgdW5pcXVlT3duZXI6IG93bmVySWQgfSk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVSZWFjdGlvbih1bmlxdWVPd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJLCB0aHJlYWQ6IENvbW1lbnRUaHJlYWQsIGNvbW1lbnQ6IENvbW1lbnQsIHJlYWN0aW9uOiBDb21tZW50UmVhY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9scy5nZXQodW5pcXVlT3duZXIpO1xuXG5cdFx0aWYgKGNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gY29tbWVudENvbnRyb2xsZXIudG9nZ2xlUmVhY3Rpb24ocmVzb3VyY2UsIHRocmVhZCwgY29tbWVudCwgcmVhY3Rpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0XHR9XG5cdH1cblxuXHRoYXNSZWFjdGlvbkhhbmRsZXIodW5pcXVlT3duZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbW1lbnRQcm92aWRlciA9IHRoaXMuX2NvbW1lbnRDb250cm9scy5nZXQodW5pcXVlT3duZXIpO1xuXG5cdFx0aWYgKGNvbW1lbnRQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuICEhY29tbWVudFByb3ZpZGVyLmZlYXR1cmVzLnJlYWN0aW9uSGFuZGxlcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyBnZXREb2N1bWVudENvbW1lbnRzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPChJQ29tbWVudEluZm8gfCBudWxsKVtdPiB7XG5cdFx0Y29uc3QgY29tbWVudENvbnRyb2xSZXN1bHQ6IFByb21pc2U8SUNvbW1lbnRJbmZvIHwgbnVsbD5bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBjb250cm9sIG9mIHRoaXMuX2NvbW1lbnRDb250cm9scy52YWx1ZXMoKSkge1xuXHRcdFx0Y29tbWVudENvbnRyb2xSZXN1bHQucHVzaChjb250cm9sLmdldERvY3VtZW50Q29tbWVudHMocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpXG5cdFx0XHRcdC50aGVuKGRvY3VtZW50Q29tbWVudHMgPT4ge1xuXHRcdFx0XHRcdC8vIENoZWNrIHRoYXQgdGhlcmUgYXJlbid0IGFueSBjb250aW51ZSBvbiBjb21tZW50cyBpbiB0aGUgcHJvdmlkZWQgY29tbWVudHNcblx0XHRcdFx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gYmVjYXVzZSBjb250aW51ZSBvbiBjb21tZW50cyBhcmUgc3RvcmVkIHNlcGFyYXRlbHkgZnJvbSBsb2NhbCB1bi1zdWJtaXR0ZWQgY29tbWVudHMuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBkb2N1bWVudENvbW1lbnRUaHJlYWQgb2YgZG9jdW1lbnRDb21tZW50cy50aHJlYWRzKSB7XG5cdFx0XHRcdFx0XHRpZiAoZG9jdW1lbnRDb21tZW50VGhyZWFkLmNvbW1lbnRzPy5sZW5ndGggPT09IDAgJiYgZG9jdW1lbnRDb21tZW50VGhyZWFkLnJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucmVtb3ZlQ29udGludWVPbkNvbW1lbnQoeyByYW5nZTogZG9jdW1lbnRDb21tZW50VGhyZWFkLnJhbmdlLCB1cmk6IHJlc291cmNlLCB1bmlxdWVPd25lcjogZG9jdW1lbnRDb21tZW50cy51bmlxdWVPd25lciB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcGVuZGluZ0NvbW1lbnRzID0gdGhpcy5fY29udGludWVPbkNvbW1lbnRzLmdldChkb2N1bWVudENvbW1lbnRzLnVuaXF1ZU93bmVyKTtcblx0XHRcdFx0XHRkb2N1bWVudENvbW1lbnRzLnBlbmRpbmdDb21tZW50VGhyZWFkcyA9IHBlbmRpbmdDb21tZW50cz8uZmlsdGVyKHBlbmRpbmdDb21tZW50ID0+IHBlbmRpbmdDb21tZW50LnVyaS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRyZXR1cm4gZG9jdW1lbnRDb21tZW50cztcblx0XHRcdFx0fSlcblx0XHRcdFx0LmNhdGNoKF8gPT4ge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWVudEluZm9zID0gYXdhaXQgUHJvbWlzZS5hbGwoY29tbWVudENvbnRyb2xSZXN1bHQpO1xuXHRcdHRoaXMuX3VwZGF0ZVJlc291cmNlc1dpdGhDb21tZW50aW5nUmFuZ2VzKHJlc291cmNlLCBjb21tZW50SW5mb3MpO1xuXHRcdHJldHVybiBjb21tZW50SW5mb3M7XG5cdH1cblxuXHRhc3luYyBnZXROb3RlYm9va0NvbW1lbnRzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPChJTm90ZWJvb2tDb21tZW50SW5mbyB8IG51bGwpW10+IHtcblx0XHRjb25zdCBjb21tZW50Q29udHJvbFJlc3VsdDogUHJvbWlzZTxJTm90ZWJvb2tDb21tZW50SW5mbyB8IG51bGw+W10gPSBbXTtcblxuXHRcdHRoaXMuX2NvbW1lbnRDb250cm9scy5mb3JFYWNoKGNvbnRyb2wgPT4ge1xuXHRcdFx0Y29tbWVudENvbnRyb2xSZXN1bHQucHVzaChjb250cm9sLmdldE5vdGVib29rQ29tbWVudHMocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpXG5cdFx0XHRcdC5jYXRjaChfID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKGNvbW1lbnRDb250cm9sUmVzdWx0KTtcblx0fVxuXG5cdHJlZ2lzdGVyQ29udGludWVPbkNvbW1lbnRQcm92aWRlcihwcm92aWRlcjogSUNvbnRpbnVlT25Db21tZW50UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fY29udGludWVPbkNvbW1lbnRQcm92aWRlcnMuYWRkKHByb3ZpZGVyKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250aW51ZU9uQ29tbWVudFByb3ZpZGVycy5kZWxldGUocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlQ29udGludWVPbkNvbW1lbnRzKG1hcDogTWFwPHN0cmluZywgUGVuZGluZ0NvbW1lbnRUaHJlYWRbXT4pIHtcblx0XHRjb25zdCBjb21tZW50c1RvU2F2ZTogUGVuZGluZ0NvbW1lbnRUaHJlYWRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcGVuZGluZ0NvbW1lbnRzIG9mIG1hcC52YWx1ZXMoKSkge1xuXHRcdFx0Y29tbWVudHNUb1NhdmUucHVzaCguLi5wZW5kaW5nQ29tbWVudHMpO1xuXHRcdH1cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYENvbW1lbnRzOiBVUklzIG9mIGNvbnRpbnVlIG9uIGNvbW1lbnRzIHRvIGFkZCB0byBzdG9yYWdlICR7Y29tbWVudHNUb1NhdmUubWFwKHRocmVhZCA9PiB0aHJlYWQudXJpLnRvU3RyaW5nKCkpLmpvaW4oJywgJyl9LmApO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ09OVElOVUVfT05fQ09NTUVOVFMsIGNvbW1lbnRzVG9TYXZlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cmVtb3ZlQ29udGludWVPbkNvbW1lbnQocGVuZGluZ0NvbW1lbnQ6IHsgcmFuZ2U6IElSYW5nZTsgdXJpOiBVUkk7IHVuaXF1ZU93bmVyOiBzdHJpbmc7IGlzUmVwbHk/OiBib29sZWFuIH0pOiBQZW5kaW5nQ29tbWVudFRocmVhZCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGVuZGluZ0NvbW1lbnRzID0gdGhpcy5fY29udGludWVPbkNvbW1lbnRzLmdldChwZW5kaW5nQ29tbWVudC51bmlxdWVPd25lcik7XG5cdFx0aWYgKHBlbmRpbmdDb21tZW50cykge1xuXHRcdFx0Y29uc3QgY29tbWVudEluZGV4ID0gcGVuZGluZ0NvbW1lbnRzLmZpbmRJbmRleChjb21tZW50ID0+IGNvbW1lbnQudXJpLnRvU3RyaW5nKCkgPT09IHBlbmRpbmdDb21tZW50LnVyaS50b1N0cmluZygpICYmIFJhbmdlLmVxdWFsc1JhbmdlKGNvbW1lbnQucmFuZ2UsIHBlbmRpbmdDb21tZW50LnJhbmdlKSAmJiAocGVuZGluZ0NvbW1lbnQuaXNSZXBseSA9PT0gdW5kZWZpbmVkIHx8IGNvbW1lbnQuaXNSZXBseSA9PT0gcGVuZGluZ0NvbW1lbnQuaXNSZXBseSkpO1xuXHRcdFx0aWYgKGNvbW1lbnRJbmRleCA+IC0xKSB7XG5cdFx0XHRcdHJldHVybiBwZW5kaW5nQ29tbWVudHMuc3BsaWNlKGNvbW1lbnRJbmRleCwgMSlbMF07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRDb250aW51ZU9uQ29tbWVudHMocGVuZGluZ0NvbW1lbnRzOiBQZW5kaW5nQ29tbWVudFRocmVhZFtdLCBtYXA6IE1hcDxzdHJpbmcsIFBlbmRpbmdDb21tZW50VGhyZWFkW10+KTogU2V0PHN0cmluZz4ge1xuXHRcdGNvbnN0IGNoYW5nZWRPd25lcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmdDb21tZW50IG9mIHBlbmRpbmdDb21tZW50cykge1xuXHRcdFx0aWYgKCFtYXAuaGFzKHBlbmRpbmdDb21tZW50LnVuaXF1ZU93bmVyKSkge1xuXHRcdFx0XHRtYXAuc2V0KHBlbmRpbmdDb21tZW50LnVuaXF1ZU93bmVyLCBbcGVuZGluZ0NvbW1lbnRdKTtcblx0XHRcdFx0Y2hhbmdlZE93bmVycy5hZGQocGVuZGluZ0NvbW1lbnQudW5pcXVlT3duZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY29tbWVudHNGb3JPd25lciA9IG1hcC5nZXQocGVuZGluZ0NvbW1lbnQudW5pcXVlT3duZXIpITtcblx0XHRcdFx0aWYgKGNvbW1lbnRzRm9yT3duZXIuZXZlcnkoY29tbWVudCA9PiAoY29tbWVudC51cmkudG9TdHJpbmcoKSAhPT0gcGVuZGluZ0NvbW1lbnQudXJpLnRvU3RyaW5nKCkpIHx8ICFSYW5nZS5lcXVhbHNSYW5nZShjb21tZW50LnJhbmdlLCBwZW5kaW5nQ29tbWVudC5yYW5nZSkpKSB7XG5cdFx0XHRcdFx0Y29tbWVudHNGb3JPd25lci5wdXNoKHBlbmRpbmdDb21tZW50KTtcblx0XHRcdFx0XHRjaGFuZ2VkT3duZXJzLmFkZChwZW5kaW5nQ29tbWVudC51bmlxdWVPd25lcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNoYW5nZWRPd25lcnM7XG5cdH1cblxuXHRyZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXMocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50aW5nUmFuZ2VSZXNvdXJjZUhpbnRTY2hlbWVzLmhhcyhyZXNvdXJjZS5zY2hlbWUpIHx8IHRoaXMuX2NvbW1lbnRpbmdSYW5nZVJlc291cmNlcy5oYXMocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxpQkFBaUIsNkJBQTZCO0FBQ3ZELFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsWUFBWSx1QkFBb0M7QUFFekQsU0FBUyxhQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUFnRDtBQUN6RCxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxxQkFBcUM7QUFDOUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlO0FBRWpCLE1BQU0sa0JBQWtCLGdCQUFpQyxnQkFBZ0I7QUFpR2hGLE1BQU0sdUJBQXVCO0FBRXRCLElBQU0saUJBQU4sY0FBNkIsV0FBc0M7QUFBQTtBQUFBLEVBNER6RSxZQUMyQyxzQkFDQSxlQUNGLHNCQUNwQixtQkFDYyxnQkFDSixZQUNFLGNBQy9CO0FBQ0QsVUFBTTtBQVJvQztBQUNBO0FBQ0Y7QUFFTjtBQUNKO0FBQ0U7QUFoRWpDLFNBQWlCLHdCQUF1QyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDMUYsU0FBUyx1QkFBb0MsS0FBSyxzQkFBc0I7QUFFeEUsU0FBaUIsMkJBQXdELEtBQUssVUFBVSxJQUFJLFFBQTRCLENBQUM7QUFDekgsU0FBUywwQkFBcUQsS0FBSyx5QkFBeUI7QUFFNUYsU0FBaUIsZ0NBQXNFLEtBQUssVUFBVSxJQUFJLFFBQXFDLENBQUM7QUFDaEosU0FBUywrQkFBbUUsS0FBSyw4QkFBOEI7QUFFL0csU0FBaUIsNkJBQXFFLEtBQUssVUFBVSxJQUFJLFFBQXVDLENBQUM7QUFDakosU0FBUyw0QkFBa0UsS0FBSywyQkFBMkI7QUFFM0csU0FBaUIsNkJBQWtFLEtBQUssVUFBVSxJQUFJLFFBQW9DLENBQUM7QUFDM0ksU0FBUyw0QkFBK0QsS0FBSywyQkFBMkI7QUFFeEcsU0FBaUIscUNBQWtGLEtBQUssVUFBVSxJQUFJLFFBQTRDLENBQUM7QUFDbkssU0FBUyxvQ0FBK0UsS0FBSyxtQ0FBbUM7QUFFaEksU0FBaUIsK0JBQWlFLEtBQUssVUFBVSxJQUFJLFFBQWlDLENBQUM7QUFDdkksU0FBUyw4QkFBOEQsS0FBSyw2QkFBNkI7QUFFekcsU0FBaUIseUNBQXlDLEtBQUssVUFBVSxJQUFJLFFBQThCLENBQUM7QUFDNUcsU0FBUyx3Q0FBd0MsS0FBSyx1Q0FBdUM7QUFFN0YsU0FBaUIsbUNBQW1DLEtBQUssVUFBVSxJQUFJLFFBQW1DLENBQUM7QUFDM0csU0FBUyxrQ0FBa0MsS0FBSyxpQ0FBaUM7QUFFakYsU0FBaUIsZ0NBQWdDLEtBQUssVUFBVSxJQUFJLFFBQWlCLENBQUM7QUFDdEYsU0FBUywrQkFBK0IsS0FBSyw4QkFBOEI7QUFFM0UsU0FBaUIsaUNBQWlDLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNwRixTQUFTLGdDQUFnQyxLQUFLLCtCQUErQjtBQUU3RSxTQUFpQixvQ0FHWixLQUFLLFVBQVUsSUFBSSxRQUdyQixDQUFDO0FBQ0osU0FBUyxtQ0FBb0csS0FBSyxrQ0FBa0M7QUFFcEosU0FBUSxtQkFBbUIsb0JBQUksSUFBZ0M7QUFDL0QsU0FBUSxnQkFBZ0Isb0JBQUksSUFBMEI7QUFDdEQsU0FBUSx1QkFBZ0M7QUFJeEMsU0FBUSxzQkFBc0Isb0JBQUksSUFBb0M7QUFDdEU7QUFBQSxTQUFRLDhCQUE4QixvQkFBSSxJQUFnQztBQUUxRSxTQUFpQixpQkFBZ0MsS0FBSyxVQUFVLElBQUksY0FBYyxDQUFDO0FBQ25GLFNBQWdCLGdCQUFnQyxLQUFLO0FBRXJELFNBQVEsNEJBQTRCLG9CQUFJLElBQVk7QUFDcEQ7QUFBQSxTQUFRLHNDQUFzQyxvQkFBSSxJQUFZO0FBWTdELFNBQUsscUJBQXFCO0FBQzFCLFNBQUssZUFBZTtBQUNwQixTQUFLLDBCQUEwQixtQkFBbUIsdUJBQXVCLE9BQU8saUJBQWlCO0FBQ2pHLFNBQUsscUJBQXFCLG1CQUFtQixrQkFBa0IsT0FBTyxpQkFBaUI7QUFDdkYsVUFBTSxrQkFBa0IsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFFNUQsVUFBTSxlQUFlLE1BQU0sU0FBUyxLQUFLLGVBQWUsaUJBQWlCLGFBQWEsV0FBVyxzQkFBc0IsZUFBZSxHQUFHLENBQUMsTUFBTSxVQUFVLE1BQU0sV0FBVyxPQUFPLE9BQU8sR0FBRztBQUM1TCxvQkFBZ0IsSUFBSSxhQUFhLE9BQUs7QUFDckMsVUFBSSxDQUFDLEVBQUUsVUFBVTtBQUNoQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLG9CQUF3RCxLQUFLLGVBQWUsVUFBVSxzQkFBc0IsYUFBYSxTQUFTO0FBQ3hJLFVBQUksQ0FBQyxtQkFBbUI7QUFDdkI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxXQUFXLE1BQU0sdURBQXVELGtCQUFrQixJQUFJLFlBQVUsT0FBTyxJQUFJLFNBQVMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEdBQUc7QUFDakosWUFBTSxnQkFBZ0IsS0FBSyx1QkFBdUIsbUJBQW1CLEtBQUssbUJBQW1CO0FBQzdGLGlCQUFXLGVBQWUsZUFBZTtBQUN4QyxjQUFNLFVBQVUsS0FBSyxpQkFBaUIsSUFBSSxXQUFXO0FBQ3JELFlBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxRQUNEO0FBQ0EsY0FBTSxNQUFrQztBQUFBLFVBQ3ZDO0FBQUEsVUFDQSxPQUFPLFFBQVE7QUFBQSxVQUNmLFlBQVksUUFBUTtBQUFBLFVBQ3BCLFNBQVMsS0FBSyxvQkFBb0IsSUFBSSxXQUFXLEtBQUssQ0FBQztBQUFBLFVBQ3ZELE9BQU8sQ0FBQztBQUFBLFVBQ1IsU0FBUyxDQUFDO0FBQUEsVUFDVixTQUFTLENBQUM7QUFBQSxRQUNYO0FBQ0EsYUFBSyxtQkFBbUIsR0FBRztBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsZUFBZSxnQkFBZ0IsTUFBTTtBQUNuRCxZQUFNLE1BQTJDLG9CQUFJLElBQUk7QUFDekQsaUJBQVcsWUFBWSxLQUFLLDZCQUE2QjtBQUN4RCxjQUFNLGtCQUFrQixTQUFTLDBCQUEwQjtBQUMzRCxhQUFLLHVCQUF1QixpQkFBaUIsR0FBRztBQUFBLE1BQ2pEO0FBQ0EsV0FBSyx3QkFBd0IsR0FBRztBQUFBLElBQ2pDLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLGFBQWEsYUFBYSxXQUFTO0FBRXRELFVBQUssTUFBTSxJQUFJLFdBQVcsUUFBUSxxQkFBc0I7QUFDdkQ7QUFBQSxNQUNEO0FBRUEsVUFBSSxDQUFDLEtBQUssMEJBQTBCLElBQUksTUFBTSxJQUFJLFNBQVMsQ0FBQyxHQUFHO0FBQzlELGFBQUssb0JBQW9CLE1BQU0sR0FBRztBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxxQ0FBcUMsVUFBZSxjQUF1QztBQUNsRyxRQUFJLGlCQUFpQjtBQUNyQixlQUFXLFlBQVksY0FBYztBQUNwQyxVQUFJLGFBQWEsU0FBUyxpQkFBaUIsT0FBTyxTQUFTLEtBQUssU0FBUyxRQUFRLFNBQVMsSUFBSTtBQUM3RixhQUFLLDBCQUEwQixJQUFJLFNBQVMsU0FBUyxDQUFDO0FBQ3RELHlCQUFpQjtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUNBLFFBQUksZ0JBQWdCO0FBQ25CLFdBQUssK0JBQStCLEtBQUs7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUF1QjtBQUM5QixTQUFLLHVCQUF1QixLQUFLO0FBQ2pDLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsT0FBSztBQUN0RSxVQUFJLEVBQUUscUJBQXFCLGtCQUFrQixHQUFHO0FBQy9DLGFBQUssaUJBQWlCLEtBQUssNEJBQTRCO0FBQUEsTUFDeEQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLGlCQUFpQjtBQUN4QixRQUFJLGtCQUEyQixLQUFLO0FBQ3BDLFNBQUssVUFBVSxLQUFLLGNBQWMsbUJBQW1CLE9BQUs7QUFDekQsVUFBSSxHQUFHO0FBQ04sMEJBQWtCLEtBQUs7QUFDdkIsYUFBSyxpQkFBaUIsS0FBSztBQUFBLE1BQzVCLE9BQU87QUFDTixhQUFLLGlCQUFpQixlQUFlO0FBQUEsTUFDdEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLElBQVksK0JBQXdDO0FBQ25ELFdBQU8sQ0FBQyxDQUFDLEtBQUsscUJBQXFCLFNBQTZDLGdCQUFnQixHQUFHO0FBQUEsRUFDcEc7QUFBQSxFQUVBLElBQUksc0JBQStCO0FBQ2xDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGlCQUFpQixRQUF1QjtBQUN2QyxRQUFJLFdBQVcsS0FBSyxzQkFBc0I7QUFDekMsV0FBSyx1QkFBdUI7QUFDNUIsV0FBSyxtQkFBbUIsSUFBSSxNQUFNO0FBQ2xDLFdBQUssOEJBQThCLEtBQUssTUFBTTtBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSx3QkFBd0IsZUFBMEM7QUFDakUsU0FBSyxpQ0FBaUMsS0FBSyxhQUFhO0FBQUEsRUFDekQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsOEJBQThCLGVBQXFDO0FBQ2xFLFNBQUssdUNBQXVDLEtBQUssYUFBYTtBQUFBLEVBQy9EO0FBQUEsRUFFQSxJQUFJLDhCQUE4QjtBQUNqQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFHQSxNQUFNLDBCQUEwQixhQUFxQixhQUErRTtBQUNuSSxVQUFNLG9CQUFvQixLQUFLLGlCQUFpQixJQUFJLFdBQVc7QUFFL0QsUUFBSSxDQUFDLG1CQUFtQjtBQUN2QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLHNCQUFzQixLQUFLLDhCQUE4QjtBQUM1RCxZQUFNLEtBQUssOEJBQThCLDBCQUEwQixNQUFTO0FBQUEsSUFDN0U7QUFDQSxTQUFLLCtCQUErQjtBQUNwQyxXQUFPLGtCQUFrQiwwQkFBMEIsV0FBVztBQUFBLEVBQy9EO0FBQUEsRUFFQSxvQkFBb0IsVUFBZSxjQUFvQztBQUN0RSxTQUFLLDhCQUE4QixLQUFLLEVBQUUsVUFBVSxhQUFhLENBQUM7QUFBQSxFQUNuRTtBQUFBLEVBRVEsZ0JBQWdCLFNBQWlCLE9BQWUsWUFBb0IsZ0JBQXlDO0FBQ3BILFNBQUssZUFBZSxrQkFBa0IsU0FBUyxPQUFPLFlBQVksY0FBYztBQUNoRixTQUFLLDJCQUEyQixLQUFLLEVBQUUsU0FBUyxZQUFZLGVBQWUsQ0FBQztBQUFBLEVBQzdFO0FBQUEsRUFFUSxtQkFBbUIsT0FBbUM7QUFDN0QsU0FBSyxlQUFlLHFCQUFxQixLQUFLO0FBQzlDLFNBQUssMkJBQTJCLEtBQUssS0FBSztBQUFBLEVBQzNDO0FBQUEsRUFFQSxxQkFBcUIsYUFBcUIsb0JBQTJDO0FBRXBGLFFBQUksbUJBQW1CLFFBQVE7QUFDOUIsV0FBSyx3QkFBd0IsSUFBSSxJQUFJO0FBQUEsSUFDdEM7QUFDQSxVQUFNLFVBQVUsS0FBSyxpQkFBaUIsSUFBSSxXQUFXO0FBQ3JELFFBQUksU0FBUztBQUNaLFdBQUssZ0JBQWdCLGFBQWEsUUFBUSxPQUFPLFFBQVEsT0FBTyxrQkFBa0I7QUFBQSxJQUNuRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHdCQUF3QixhQUEyQjtBQUNsRCxVQUFNLFVBQVUsS0FBSyxpQkFBaUIsSUFBSSxXQUFXO0FBQ3JELFFBQUksU0FBUztBQUNaLFdBQUssZ0JBQWdCLGFBQWEsUUFBUSxPQUFPLFFBQVEsT0FBTyxDQUFDLENBQUM7QUFBQSxJQUNuRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLDBCQUEwQixhQUFxQixnQkFBMEM7QUFDeEYsU0FBSyxpQkFBaUIsSUFBSSxhQUFhLGNBQWM7QUFDckQsU0FBSyxzQkFBc0IsS0FBSztBQUFBLEVBQ2pDO0FBQUEsRUFFQSw0QkFBNEIsYUFBNEI7QUFDdkQsUUFBSSxhQUFhO0FBQ2hCLFdBQUssaUJBQWlCLE9BQU8sV0FBVztBQUFBLElBQ3pDLE9BQU87QUFDTixXQUFLLGlCQUFpQixNQUFNO0FBQUEsSUFDN0I7QUFDQSxTQUFLLGVBQWUsc0JBQXNCLFdBQVc7QUFDckQsU0FBSyx5QkFBeUIsS0FBSyxXQUFXO0FBQUEsRUFDL0M7QUFBQSxFQUVBLHFCQUFxQixhQUFxRDtBQUN6RSxXQUFPLEtBQUssaUJBQWlCLElBQUksV0FBVztBQUFBLEVBQzdDO0FBQUEsRUFFQSxNQUFNLDRCQUE0QixhQUFxQixVQUFlLE9BQTBCLFVBQWtDO0FBQ2pJLFVBQU0sb0JBQW9CLEtBQUssaUJBQWlCLElBQUksV0FBVztBQUUvRCxRQUFJLENBQUMsbUJBQW1CO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFdBQU8sa0JBQWtCLDRCQUE0QixVQUFVLE9BQU8sUUFBUTtBQUFBLEVBQy9FO0FBQUEsRUFFQSxNQUFNLDRCQUE0QixhQUFxQixjQUFzQixPQUFjO0FBQzFGLFVBQU0sb0JBQW9CLEtBQUssaUJBQWlCLElBQUksV0FBVztBQUUvRCxRQUFJLENBQUMsbUJBQW1CO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sa0JBQWtCLDRCQUE0QixjQUFjLEtBQUs7QUFBQSxFQUN4RTtBQUFBLEVBRUEscUJBQXFCLGFBQXFCLFVBQWtCO0FBQzNELFVBQU0sYUFBYSxLQUFLLHFCQUFxQixXQUFXO0FBQ3hELGdCQUFZLHdCQUF3QixRQUFRO0FBQUEsRUFDN0M7QUFBQSxFQUVBLGdCQUFnQixhQUFtQztBQUNsRCxRQUFJLEtBQUssY0FBYyxJQUFJLFdBQVcsR0FBRztBQUN4QyxhQUFPLEtBQUssY0FBYyxJQUFJLFdBQVc7QUFBQSxJQUMxQztBQUVBLFVBQU0sT0FBTyxLQUFLLHFCQUFxQixlQUFlLFlBQVk7QUFDbEUsU0FBSyxjQUFjLElBQUksYUFBYSxJQUFJO0FBQ3hDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxlQUFlLFNBQWlCLE9BQWdEO0FBQy9FLFVBQU0sVUFBVSxLQUFLLGlCQUFpQixJQUFJLE9BQU87QUFDakQsUUFBSSxTQUFTO0FBQ1osWUFBTSxNQUFrQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLE9BQU8sRUFBRSxhQUFhLFNBQVMsWUFBWSxRQUFRLE9BQU8sT0FBTyxRQUFRLE1BQU0sQ0FBQztBQUMxSSxXQUFLLG1CQUFtQixHQUFHO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFQSx1QkFBdUIsU0FBaUIsT0FBb0Q7QUFDM0YsVUFBTSxNQUEwQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLE9BQU8sRUFBRSxhQUFhLFFBQVEsQ0FBQztBQUNqRyxTQUFLLG1DQUFtQyxLQUFLLEdBQUc7QUFBQSxFQUNqRDtBQUFBLEVBRUEsdUJBQXVCLFNBQWlCLGVBQTZDO0FBQ3BGLFFBQUksZUFBZSxXQUFXLGNBQWMsUUFBUSxTQUFTLEdBQUc7QUFDL0QsaUJBQVcsVUFBVSxjQUFjLFNBQVM7QUFDM0MsYUFBSyxvQ0FBb0MsSUFBSSxNQUFNO0FBQUEsTUFDcEQ7QUFBQSxJQUNEO0FBQ0EsU0FBSyx3QkFBd0IsSUFBSSxJQUFJO0FBQ3JDLFNBQUssNkJBQTZCLEtBQUssRUFBRSxhQUFhLFFBQVEsQ0FBQztBQUFBLEVBQ2hFO0FBQUEsRUFFQSxNQUFNLGVBQWUsYUFBcUIsVUFBZSxRQUF1QixTQUFrQixVQUEwQztBQUMzSSxVQUFNLG9CQUFvQixLQUFLLGlCQUFpQixJQUFJLFdBQVc7QUFFL0QsUUFBSSxtQkFBbUI7QUFDdEIsYUFBTyxrQkFBa0IsZUFBZSxVQUFVLFFBQVEsU0FBUyxVQUFVLGtCQUFrQixJQUFJO0FBQUEsSUFDcEcsT0FBTztBQUNOLFlBQU0sSUFBSSxNQUFNLGVBQWU7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLG1CQUFtQixhQUE4QjtBQUNoRCxVQUFNLGtCQUFrQixLQUFLLGlCQUFpQixJQUFJLFdBQVc7QUFFN0QsUUFBSSxpQkFBaUI7QUFDcEIsYUFBTyxDQUFDLENBQUMsZ0JBQWdCLFNBQVM7QUFBQSxJQUNuQztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLG9CQUFvQixVQUFpRDtBQUMxRSxVQUFNLHVCQUF1RCxDQUFDO0FBRTlELGVBQVcsV0FBVyxLQUFLLGlCQUFpQixPQUFPLEdBQUc7QUFDckQsMkJBQXFCLEtBQUssUUFBUSxvQkFBb0IsVUFBVSxrQkFBa0IsSUFBSSxFQUNwRixLQUFLLHNCQUFvQjtBQUd6QixtQkFBVyx5QkFBeUIsaUJBQWlCLFNBQVM7QUFDN0QsY0FBSSxzQkFBc0IsVUFBVSxXQUFXLEtBQUssc0JBQXNCLE9BQU87QUFDaEYsaUJBQUssd0JBQXdCLEVBQUUsT0FBTyxzQkFBc0IsT0FBTyxLQUFLLFVBQVUsYUFBYSxpQkFBaUIsWUFBWSxDQUFDO0FBQUEsVUFDOUg7QUFBQSxRQUNEO0FBQ0EsY0FBTSxrQkFBa0IsS0FBSyxvQkFBb0IsSUFBSSxpQkFBaUIsV0FBVztBQUNqRix5QkFBaUIsd0JBQXdCLGlCQUFpQixPQUFPLG9CQUFrQixlQUFlLElBQUksU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQ3hJLGVBQU87QUFBQSxNQUNSLENBQUMsRUFDQSxNQUFNLE9BQUs7QUFDWCxlQUFPO0FBQUEsTUFDUixDQUFDLENBQUM7QUFBQSxJQUNKO0FBRUEsVUFBTSxlQUFlLE1BQU0sUUFBUSxJQUFJLG9CQUFvQjtBQUMzRCxTQUFLLHFDQUFxQyxVQUFVLFlBQVk7QUFDaEUsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLFVBQXlEO0FBQ2xGLFVBQU0sdUJBQStELENBQUM7QUFFdEUsU0FBSyxpQkFBaUIsUUFBUSxhQUFXO0FBQ3hDLDJCQUFxQixLQUFLLFFBQVEsb0JBQW9CLFVBQVUsa0JBQWtCLElBQUksRUFDcEYsTUFBTSxPQUFLO0FBQ1gsZUFBTztBQUFBLE1BQ1IsQ0FBQyxDQUFDO0FBQUEsSUFDSixDQUFDO0FBRUQsV0FBTyxRQUFRLElBQUksb0JBQW9CO0FBQUEsRUFDeEM7QUFBQSxFQUVBLGtDQUFrQyxVQUFtRDtBQUNwRixTQUFLLDRCQUE0QixJQUFJLFFBQVE7QUFDN0MsV0FBTztBQUFBLE1BQ04sU0FBUyxNQUFNO0FBQ2QsYUFBSyw0QkFBNEIsT0FBTyxRQUFRO0FBQUEsTUFDakQ7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsd0JBQXdCLEtBQTBDO0FBQ3pFLFVBQU0saUJBQXlDLENBQUM7QUFDaEQsZUFBVyxtQkFBbUIsSUFBSSxPQUFPLEdBQUc7QUFDM0MscUJBQWUsS0FBSyxHQUFHLGVBQWU7QUFBQSxJQUN2QztBQUNBLFNBQUssV0FBVyxNQUFNLDREQUE0RCxlQUFlLElBQUksWUFBVSxPQUFPLElBQUksU0FBUyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsR0FBRztBQUNuSixTQUFLLGVBQWUsTUFBTSxzQkFBc0IsZ0JBQWdCLGFBQWEsV0FBVyxjQUFjLElBQUk7QUFBQSxFQUMzRztBQUFBLEVBRUEsd0JBQXdCLGdCQUF1SDtBQUM5SSxVQUFNLGtCQUFrQixLQUFLLG9CQUFvQixJQUFJLGVBQWUsV0FBVztBQUMvRSxRQUFJLGlCQUFpQjtBQUNwQixZQUFNLGVBQWUsZ0JBQWdCLFVBQVUsYUFBVyxRQUFRLElBQUksU0FBUyxNQUFNLGVBQWUsSUFBSSxTQUFTLEtBQUssTUFBTSxZQUFZLFFBQVEsT0FBTyxlQUFlLEtBQUssTUFBTSxlQUFlLFlBQVksVUFBYSxRQUFRLFlBQVksZUFBZSxRQUFRO0FBQ3BRLFVBQUksZUFBZSxJQUFJO0FBQ3RCLGVBQU8sZ0JBQWdCLE9BQU8sY0FBYyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ2pEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx1QkFBdUIsaUJBQXlDLEtBQXVEO0FBQzlILFVBQU0sZ0JBQWdCLG9CQUFJLElBQVk7QUFDdEMsZUFBVyxrQkFBa0IsaUJBQWlCO0FBQzdDLFVBQUksQ0FBQyxJQUFJLElBQUksZUFBZSxXQUFXLEdBQUc7QUFDekMsWUFBSSxJQUFJLGVBQWUsYUFBYSxDQUFDLGNBQWMsQ0FBQztBQUNwRCxzQkFBYyxJQUFJLGVBQWUsV0FBVztBQUFBLE1BQzdDLE9BQU87QUFDTixjQUFNLG1CQUFtQixJQUFJLElBQUksZUFBZSxXQUFXO0FBQzNELFlBQUksaUJBQWlCLE1BQU0sYUFBWSxRQUFRLElBQUksU0FBUyxNQUFNLGVBQWUsSUFBSSxTQUFTLEtBQU0sQ0FBQyxNQUFNLFlBQVksUUFBUSxPQUFPLGVBQWUsS0FBSyxDQUFDLEdBQUc7QUFDN0osMkJBQWlCLEtBQUssY0FBYztBQUNwQyx3QkFBYyxJQUFJLGVBQWUsV0FBVztBQUFBLFFBQzdDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsNEJBQTRCLFVBQXdCO0FBQ25ELFdBQU8sS0FBSyxvQ0FBb0MsSUFBSSxTQUFTLE1BQU0sS0FBSyxLQUFLLDBCQUEwQixJQUFJLFNBQVMsU0FBUyxDQUFDO0FBQUEsRUFDL0g7QUFDRDtBQTVhYSxpQkFBTjtBQUFBLEVBNkRKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FuRVU7IiwKICAibmFtZXMiOiBbXQp9Cg==
