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
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { Range } from "../../../editor/common/core/range.js";
import * as languages from "../../../editor/common/languages.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ICommentService } from "../../contrib/comments/browser/commentService.js";
import { CommentsPanel } from "../../contrib/comments/browser/commentsView.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { COMMENTS_VIEW_ID, COMMENTS_VIEW_STORAGE_ID, COMMENTS_VIEW_TITLE } from "../../contrib/comments/browser/commentsTreeViewer.js";
import { Extensions as ViewExtensions, ViewContainerLocation, IViewDescriptorService } from "../../common/views.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { ViewPaneContainer } from "../../browser/parts/views/viewPaneContainer.js";
import { Codicon } from "../../../base/common/codicons.js";
import { registerIcon } from "../../../platform/theme/common/iconRegistry.js";
import { localize } from "../../../nls.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { Schemas } from "../../../base/common/network.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
import { revealCommentThread } from "../../contrib/comments/browser/commentsController.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
class MainThreadCommentThread {
  constructor(commentThreadHandle, controllerHandle, extensionId, threadId, resource, _range, comments, _canReply, _isTemplate, editorId) {
    this.commentThreadHandle = commentThreadHandle;
    this.controllerHandle = controllerHandle;
    this.extensionId = extensionId;
    this.threadId = threadId;
    this.resource = resource;
    this._range = _range;
    this._canReply = _canReply;
    this._isTemplate = _isTemplate;
    this.editorId = editorId;
    this._onDidChangeInput = new Emitter();
    this._onDidChangeLabel = new Emitter();
    this.onDidChangeLabel = this._onDidChangeLabel.event;
    this._onDidChangeComments = new Emitter();
    this._onDidChangeCanReply = new Emitter();
    this._collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
    this._onDidChangeCollapsibleState = new Emitter();
    this.onDidChangeCollapsibleState = this._onDidChangeCollapsibleState.event;
    this._onDidChangeInitialCollapsibleState = new Emitter();
    this.onDidChangeInitialCollapsibleState = this._onDidChangeInitialCollapsibleState.event;
    this._onDidChangeApplicability = new Emitter();
    this.onDidChangeApplicability = this._onDidChangeApplicability.event;
    this._onDidChangeState = new Emitter();
    this.onDidChangeState = this._onDidChangeState.event;
    this._isDisposed = false;
    if (_isTemplate) {
      this.comments = [];
    } else if (comments) {
      this._comments = comments;
    }
  }
  get input() {
    return this._input;
  }
  set input(value) {
    this._input = value;
    this._onDidChangeInput.fire(value);
  }
  get onDidChangeInput() {
    return this._onDidChangeInput.event;
  }
  get label() {
    return this._label;
  }
  set label(label) {
    this._label = label;
    this._onDidChangeLabel.fire(this._label);
  }
  get contextValue() {
    return this._contextValue;
  }
  set contextValue(context) {
    this._contextValue = context;
  }
  get comments() {
    return this._comments;
  }
  set comments(newComments) {
    this._comments = newComments;
    this._onDidChangeComments.fire(this._comments);
  }
  get onDidChangeComments() {
    return this._onDidChangeComments.event;
  }
  set range(range) {
    this._range = range;
  }
  get range() {
    return this._range;
  }
  get onDidChangeCanReply() {
    return this._onDidChangeCanReply.event;
  }
  set canReply(state) {
    this._canReply = state;
    this._onDidChangeCanReply.fire(!!this._canReply);
  }
  get canReply() {
    return this._canReply;
  }
  get collapsibleState() {
    return this._collapsibleState;
  }
  set collapsibleState(newState) {
    if (this.initialCollapsibleState === void 0) {
      this.initialCollapsibleState = newState;
    }
    if (newState !== this._collapsibleState) {
      this._collapsibleState = newState;
      this._onDidChangeCollapsibleState.fire(this._collapsibleState);
    }
  }
  get initialCollapsibleState() {
    return this._initialCollapsibleState;
  }
  set initialCollapsibleState(initialCollapsibleState) {
    this._initialCollapsibleState = initialCollapsibleState;
    this._onDidChangeInitialCollapsibleState.fire(initialCollapsibleState);
  }
  get isDisposed() {
    return this._isDisposed;
  }
  isDocumentCommentThread() {
    return this._range === void 0 || Range.isIRange(this._range);
  }
  get state() {
    return this._state;
  }
  set state(newState) {
    this._state = newState;
    this._onDidChangeState.fire(this._state);
  }
  get applicability() {
    return this._applicability;
  }
  set applicability(value) {
    this._applicability = value;
    this._onDidChangeApplicability.fire(value);
  }
  get isTemplate() {
    return this._isTemplate;
  }
  batchUpdate(changes) {
    const modified = (value) => Object.prototype.hasOwnProperty.call(changes, value);
    if (modified("range")) {
      this._range = changes.range;
    }
    if (modified("label")) {
      this._label = changes.label;
    }
    if (modified("contextValue")) {
      this._contextValue = changes.contextValue === null ? void 0 : changes.contextValue;
    }
    if (modified("comments")) {
      this.comments = changes.comments;
    }
    if (modified("collapseState")) {
      this.collapsibleState = changes.collapseState;
    }
    if (modified("canReply")) {
      this.canReply = changes.canReply;
    }
    if (modified("state")) {
      this.state = changes.state;
    }
    if (modified("applicability")) {
      this.applicability = changes.applicability;
    }
    if (modified("isTemplate")) {
      this._isTemplate = changes.isTemplate;
    }
  }
  hasComments() {
    return !!this.comments && this.comments.length > 0;
  }
  dispose() {
    this._isDisposed = true;
    this._onDidChangeCollapsibleState.dispose();
    this._onDidChangeInitialCollapsibleState.dispose();
    this._onDidChangeComments.dispose();
    this._onDidChangeInput.dispose();
    this._onDidChangeLabel.dispose();
    this._onDidChangeCanReply.dispose();
    this._onDidChangeState.dispose();
    this._onDidChangeApplicability.dispose();
  }
  toJSON() {
    return {
      $mid: MarshalledId.CommentThread,
      commentControlHandle: this.controllerHandle,
      commentThreadHandle: this.commentThreadHandle
    };
  }
}
class CommentThreadWithDisposable {
  constructor(thread) {
    this.thread = thread;
    this.disposableStore = new DisposableStore();
  }
  dispose() {
    this.disposableStore.dispose();
  }
}
let MainThreadCommentController = class extends Disposable {
  constructor(_proxy, _handle, _uniqueId, _id, _label, _features, _commentService, _uriIdentityService) {
    super();
    this._proxy = _proxy;
    this._handle = _handle;
    this._uniqueId = _uniqueId;
    this._id = _id;
    this._label = _label;
    this._features = _features;
    this._commentService = _commentService;
    this._uriIdentityService = _uriIdentityService;
    this._threads = this._register(new DisposableMap());
  }
  get handle() {
    return this._handle;
  }
  get id() {
    return this._id;
  }
  get contextValue() {
    return this._id;
  }
  get proxy() {
    return this._proxy;
  }
  get label() {
    return this._label;
  }
  get reactions() {
    return this._reactions;
  }
  set reactions(reactions) {
    this._reactions = reactions;
  }
  get options() {
    return this._features.options;
  }
  get features() {
    return this._features;
  }
  get owner() {
    return this._id;
  }
  get activeComment() {
    return this._activeComment;
  }
  async setActiveCommentAndThread(commentInfo) {
    this._activeComment = commentInfo;
    return this._proxy.$setActiveComment(this._handle, commentInfo ? { commentThreadHandle: commentInfo.thread.commentThreadHandle, uniqueIdInThread: commentInfo.comment?.uniqueIdInThread } : void 0);
  }
  updateFeatures(features) {
    this._features = features;
  }
  createCommentThread(extensionId, commentThreadHandle, threadId, resource, range, comments, isTemplate, editorId) {
    const thread = new MainThreadCommentThread(
      commentThreadHandle,
      this.handle,
      extensionId,
      threadId,
      URI.revive(resource).toString(),
      range,
      comments,
      true,
      isTemplate,
      editorId
    );
    const threadWithDisposable = new CommentThreadWithDisposable(thread);
    this._threads.set(commentThreadHandle, threadWithDisposable);
    threadWithDisposable.disposableStore.add(thread.onDidChangeCollapsibleState(() => {
      this.proxy.$updateCommentThread(this.handle, thread.commentThreadHandle, { collapseState: thread.collapsibleState });
    }));
    if (thread.isDocumentCommentThread()) {
      this._commentService.updateComments(this._uniqueId, {
        added: [thread],
        removed: [],
        changed: [],
        pending: []
      });
    } else {
      this._commentService.updateNotebookComments(this._uniqueId, {
        added: [thread],
        removed: [],
        changed: [],
        pending: []
      });
    }
    return thread;
  }
  updateCommentThread(commentThreadHandle, threadId, resource, changes) {
    const thread = this.getKnownThread(commentThreadHandle);
    thread.batchUpdate(changes);
    if (thread.isDocumentCommentThread()) {
      this._commentService.updateComments(this._uniqueId, {
        added: [],
        removed: [],
        changed: [thread],
        pending: []
      });
    } else {
      this._commentService.updateNotebookComments(this._uniqueId, {
        added: [],
        removed: [],
        changed: [thread],
        pending: []
      });
    }
  }
  deleteCommentThread(commentThreadHandle) {
    const thread = this.getKnownThread(commentThreadHandle);
    this._threads.deleteAndDispose(commentThreadHandle);
    thread.dispose();
    if (thread.isDocumentCommentThread()) {
      this._commentService.updateComments(this._uniqueId, {
        added: [],
        removed: [thread],
        changed: [],
        pending: []
      });
    } else {
      this._commentService.updateNotebookComments(this._uniqueId, {
        added: [],
        removed: [thread],
        changed: [],
        pending: []
      });
    }
  }
  deleteCommentThreadMain(commentThreadId) {
    for (const { thread } of this._threads.values()) {
      if (thread.threadId === commentThreadId) {
        this._proxy.$deleteCommentThread(this._handle, thread.commentThreadHandle);
      }
    }
  }
  updateInput(input) {
    const thread = this.activeEditingCommentThread;
    if (thread && thread.input) {
      const commentInput = thread.input;
      commentInput.value = input;
      thread.input = commentInput;
    }
  }
  updateCommentingRanges(resourceHints) {
    this._commentService.updateCommentingRanges(this._uniqueId, resourceHints);
  }
  getKnownThread(commentThreadHandle) {
    const thread = this._threads.get(commentThreadHandle);
    if (!thread) {
      throw new Error("unknown thread");
    }
    return thread.thread;
  }
  async getDocumentComments(resource, token) {
    if (resource.scheme === Schemas.vscodeNotebookCell) {
      return {
        uniqueOwner: this._uniqueId,
        label: this.label,
        threads: [],
        commentingRanges: {
          resource,
          ranges: [],
          fileComments: false
        }
      };
    }
    const ret = [];
    for (const thread of [...this._threads.keys()]) {
      const commentThread = this._threads.get(thread);
      if (commentThread.thread.resource && this._uriIdentityService.extUri.isEqual(URI.parse(commentThread.thread.resource), resource)) {
        if (commentThread.thread.isDocumentCommentThread()) {
          ret.push(commentThread.thread);
        }
      }
    }
    const commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);
    return {
      uniqueOwner: this._uniqueId,
      label: this.label,
      threads: ret,
      commentingRanges: {
        resource,
        ranges: commentingRanges?.ranges || [],
        fileComments: !!commentingRanges?.fileComments
      }
    };
  }
  async getNotebookComments(resource, token) {
    if (resource.scheme !== Schemas.vscodeNotebookCell) {
      return {
        uniqueOwner: this._uniqueId,
        label: this.label,
        threads: []
      };
    }
    const ret = [];
    for (const thread of [...this._threads.keys()]) {
      const commentThread = this._threads.get(thread);
      if (commentThread.thread.resource === resource.toString()) {
        if (!commentThread.thread.isDocumentCommentThread()) {
          ret.push(commentThread.thread);
        }
      }
    }
    return {
      uniqueOwner: this._uniqueId,
      label: this.label,
      threads: ret
    };
  }
  async toggleReaction(uri, thread, comment, reaction, token) {
    return this._proxy.$toggleReaction(this._handle, thread.commentThreadHandle, uri, comment, reaction);
  }
  getAllComments() {
    const ret = [];
    for (const thread of [...this._threads.keys()]) {
      ret.push(this._threads.get(thread).thread);
    }
    return ret;
  }
  createCommentThreadTemplate(resource, range, editorId) {
    return this._proxy.$createCommentThreadTemplate(this.handle, resource, range, editorId);
  }
  async updateCommentThreadTemplate(threadHandle, range) {
    await this._proxy.$updateCommentThreadTemplate(this.handle, threadHandle, range);
  }
  toJSON() {
    return {
      $mid: MarshalledId.CommentController,
      handle: this.handle
    };
  }
};
MainThreadCommentController = __decorateClass([
  __decorateParam(6, ICommentService),
  __decorateParam(7, IUriIdentityService)
], MainThreadCommentController);
const commentsViewIcon = registerIcon("comments-view-icon", Codicon.commentDiscussion, localize("commentsViewIcon", "View icon of the comments view."));
let MainThreadComments = class extends Disposable {
  constructor(extHostContext, _commentService, _viewsService, _viewDescriptorService, _uriIdentityService, _editorService, _instantiationService) {
    super();
    this._commentService = _commentService;
    this._viewsService = _viewsService;
    this._viewDescriptorService = _viewDescriptorService;
    this._uriIdentityService = _uriIdentityService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._handlers = /* @__PURE__ */ new Map();
    this._commentControllers = /* @__PURE__ */ new Map();
    this._activeEditingCommentThreadDisposables = this._register(new DisposableStore());
    this._openViewListener = this._register(new MutableDisposable());
    this._onChangeContainerListener = this._register(new MutableDisposable());
    this._onChangeContainerLocationListener = this._register(new MutableDisposable());
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostComments);
    this._commentService.unregisterCommentController();
    this._register(this._commentService.onDidChangeActiveEditingCommentThread(async (thread) => {
      const handle = thread.controllerHandle;
      const controller = this._commentControllers.get(handle);
      if (!controller) {
        return;
      }
      this._activeEditingCommentThreadDisposables.clear();
      this._activeEditingCommentThread = thread;
      controller.activeEditingCommentThread = this._activeEditingCommentThread;
    }));
    this._register(this._commentService.onResourceHasCommentingRanges(() => {
      this.registerView();
    }));
    this._register(this._commentService.onDidUpdateCommentThreads(() => {
      this.registerView();
    }));
  }
  $registerCommentController(handle, id, label, extensionId) {
    const providerId = `${id}-${extensionId}`;
    this._handlers.set(handle, providerId);
    const provider = this._instantiationService.createInstance(MainThreadCommentController, this._proxy, handle, providerId, id, label, {});
    this._commentService.registerCommentController(providerId, provider);
    this._commentControllers.set(handle, provider);
    this._commentService.setWorkspaceComments(String(handle), []);
  }
  $unregisterCommentController(handle) {
    const providerId = this._handlers.get(handle);
    this._handlers.delete(handle);
    this._commentControllers.get(handle)?.dispose();
    this._commentControllers.delete(handle);
    if (typeof providerId !== "string") {
      return;
    } else {
      this._commentService.unregisterCommentController(providerId);
    }
  }
  $updateCommentControllerFeatures(handle, features) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return void 0;
    }
    provider.updateFeatures(features);
  }
  $createCommentThread(handle, commentThreadHandle, threadId, resource, range, comments, extensionId, isTemplate, editorId) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return void 0;
    }
    return provider.createCommentThread(extensionId.value, commentThreadHandle, threadId, resource, range, comments, isTemplate, editorId);
  }
  $updateCommentThread(handle, commentThreadHandle, threadId, resource, changes) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return void 0;
    }
    return provider.updateCommentThread(commentThreadHandle, threadId, resource, changes);
  }
  $deleteCommentThread(handle, commentThreadHandle) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return;
    }
    return provider.deleteCommentThread(commentThreadHandle);
  }
  $updateCommentingRanges(handle, resourceHints) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return;
    }
    provider.updateCommentingRanges(resourceHints);
  }
  async $revealCommentThread(handle, commentThreadHandle, commentUniqueIdInThread, options) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return Promise.resolve();
    }
    const thread = provider.getAllComments().find((thread2) => thread2.commentThreadHandle === commentThreadHandle);
    if (!thread || !thread.isDocumentCommentThread()) {
      return Promise.resolve();
    }
    const comment = thread.comments?.find((comment2) => comment2.uniqueIdInThread === commentUniqueIdInThread);
    revealCommentThread(this._commentService, this._editorService, this._uriIdentityService, thread, comment, options.focusReply, void 0, options.preserveFocus);
  }
  async $hideCommentThread(handle, commentThreadHandle) {
    const provider = this._commentControllers.get(handle);
    if (!provider) {
      return Promise.resolve();
    }
    const thread = provider.getAllComments().find((thread2) => thread2.commentThreadHandle === commentThreadHandle);
    if (!thread || !thread.isDocumentCommentThread()) {
      return Promise.resolve();
    }
    thread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
  }
  registerView() {
    const commentsPanelAlreadyConstructed = !!this._viewDescriptorService.getViewDescriptorById(COMMENTS_VIEW_ID);
    if (!commentsPanelAlreadyConstructed) {
      const VIEW_CONTAINER = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
        id: COMMENTS_VIEW_ID,
        title: COMMENTS_VIEW_TITLE,
        ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [COMMENTS_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
        storageId: COMMENTS_VIEW_STORAGE_ID,
        hideIfEmpty: true,
        icon: commentsViewIcon,
        order: 10
      }, ViewContainerLocation.Panel);
      Registry.as(ViewExtensions.ViewsRegistry).registerViews([{
        id: COMMENTS_VIEW_ID,
        name: COMMENTS_VIEW_TITLE,
        canToggleVisibility: false,
        ctorDescriptor: new SyncDescriptor(CommentsPanel),
        canMoveView: true,
        containerIcon: commentsViewIcon,
        focusCommand: {
          id: "workbench.action.focusCommentsPanel"
        }
      }], VIEW_CONTAINER);
    }
    this.registerViewListeners(commentsPanelAlreadyConstructed);
  }
  setComments() {
    [...this._commentControllers.keys()].forEach((handle) => {
      const threads = this._commentControllers.get(handle).getAllComments();
      if (threads.length) {
        const providerId = this.getHandler(handle);
        this._commentService.setWorkspaceComments(providerId, threads);
      }
    });
  }
  registerViewOpenedListener() {
    if (!this._openViewListener.value) {
      this._openViewListener.value = this._viewsService.onDidChangeViewVisibility((e) => {
        if (e.id === COMMENTS_VIEW_ID && e.visible) {
          this.setComments();
          if (this._openViewListener) {
            this._openViewListener.dispose();
          }
        }
      });
    }
  }
  /**
   * If the comments view has never been opened, the constructor for it has not yet run so it has
   * no listeners for comment threads being set or updated. Listen for the view opening for the
   * first time and send it comments then.
   */
  registerViewListeners(commentsPanelAlreadyConstructed) {
    if (!commentsPanelAlreadyConstructed) {
      this.registerViewOpenedListener();
    }
    if (!this._onChangeContainerListener.value) {
      this._onChangeContainerListener.value = this._viewDescriptorService.onDidChangeContainer((e) => {
        if (e.views.find((view) => view.id === COMMENTS_VIEW_ID)) {
          this.setComments();
          this.registerViewOpenedListener();
        }
      });
    }
    if (!this._onChangeContainerLocationListener.value) {
      this._onChangeContainerLocationListener.value = this._viewDescriptorService.onDidChangeContainerLocation((e) => {
        const commentsContainer = this._viewDescriptorService.getViewContainerByViewId(COMMENTS_VIEW_ID);
        if (e.viewContainer.id === commentsContainer?.id) {
          this.setComments();
          this.registerViewOpenedListener();
        }
      });
    }
  }
  getHandler(handle) {
    if (!this._handlers.has(handle)) {
      throw new Error("Unknown handler");
    }
    return this._handlers.get(handle);
  }
};
MainThreadComments = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadComments),
  __decorateParam(1, ICommentService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IInstantiationService)
], MainThreadComments);
export {
  MainThreadCommentController,
  MainThreadCommentThread,
  MainThreadComments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ29tbWVudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudENvbnRyb2xsZXIsIElDb21tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tZW50c1BhbmVsIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jb21tZW50cy9icm93c2VyL2NvbW1lbnRzVmlldy5qcyc7XG5pbXBvcnQgeyBDb21tZW50UHJvdmlkZXJGZWF0dXJlcywgRXh0SG9zdENvbW1lbnRzU2hhcGUsIEV4dEhvc3RDb250ZXh0LCBNYWluQ29udGV4dCwgTWFpblRocmVhZENvbW1lbnRzU2hhcGUsIENvbW1lbnRUaHJlYWRDaGFuZ2VzIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ09NTUVOVFNfVklFV19JRCwgQ09NTUVOVFNfVklFV19TVE9SQUdFX0lELCBDT01NRU5UU19WSUVXX1RJVExFIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jb21tZW50cy9icm93c2VyL2NvbW1lbnRzVHJlZVZpZXdlci5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBWaWV3RXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld3NSZWdpc3RyeSwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkQ29tbWVudFRocmVhZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb21tZW50cy5qcyc7XG5pbXBvcnQgeyByZXZlYWxDb21tZW50VGhyZWFkIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jb21tZW50cy9icm93c2VyL2NvbW1lbnRzQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8VD4gaW1wbGVtZW50cyBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxUPiB7XG5cdHByaXZhdGUgX2lucHV0PzogbGFuZ3VhZ2VzLkNvbW1lbnRJbnB1dDtcblx0Z2V0IGlucHV0KCk6IGxhbmd1YWdlcy5Db21tZW50SW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dDtcblx0fVxuXG5cdHNldCBpbnB1dCh2YWx1ZTogbGFuZ3VhZ2VzLkNvbW1lbnRJbnB1dCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2lucHV0ID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnB1dC5maXJlKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5wdXQgPSBuZXcgRW1pdHRlcjxsYW5ndWFnZXMuQ29tbWVudElucHV0IHwgdW5kZWZpbmVkPigpO1xuXHRnZXQgb25EaWRDaGFuZ2VJbnB1dCgpOiBFdmVudDxsYW5ndWFnZXMuQ29tbWVudElucHV0IHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUlucHV0LmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdH1cblxuXHRzZXQgbGFiZWwobGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2xhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKHRoaXMuX2xhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRleHRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBjb250ZXh0VmFsdWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dFZhbHVlO1xuXHR9XG5cblx0c2V0IGNvbnRleHRWYWx1ZShjb250ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jb250ZXh0VmFsdWUgPSBjb250ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYWJlbCA9IG5ldyBFbWl0dGVyPHN0cmluZyB8IHVuZGVmaW5lZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYWJlbDogRXZlbnQ8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY29tbWVudHM6IFJlYWRvbmx5QXJyYXk8bGFuZ3VhZ2VzLkNvbW1lbnQ+IHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBnZXQgY29tbWVudHMoKTogUmVhZG9ubHlBcnJheTxsYW5ndWFnZXMuQ29tbWVudD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50cztcblx0fVxuXG5cdHB1YmxpYyBzZXQgY29tbWVudHMobmV3Q29tbWVudHM6IFJlYWRvbmx5QXJyYXk8bGFuZ3VhZ2VzLkNvbW1lbnQ+IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY29tbWVudHMgPSBuZXdDb21tZW50cztcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbW1lbnRzLmZpcmUodGhpcy5fY29tbWVudHMpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb21tZW50cyA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IGxhbmd1YWdlcy5Db21tZW50W10gfCB1bmRlZmluZWQ+KCk7XG5cdGdldCBvbkRpZENoYW5nZUNvbW1lbnRzKCk6IEV2ZW50PHJlYWRvbmx5IGxhbmd1YWdlcy5Db21tZW50W10gfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29tbWVudHMuZXZlbnQ7IH1cblxuXHRzZXQgcmFuZ2UocmFuZ2U6IFQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9yYW5nZSA9IHJhbmdlO1xuXHR9XG5cblx0Z2V0IHJhbmdlKCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2FuUmVwbHkgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRnZXQgb25EaWRDaGFuZ2VDYW5SZXBseSgpOiBFdmVudDxib29sZWFuPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUNhblJlcGx5LmV2ZW50OyB9XG5cdHNldCBjYW5SZXBseShzdGF0ZTogYm9vbGVhbiB8IGxhbmd1YWdlcy5Db21tZW50QXV0aG9ySW5mb3JtYXRpb24pIHtcblx0XHR0aGlzLl9jYW5SZXBseSA9IHN0YXRlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FuUmVwbHkuZmlyZSghIXRoaXMuX2NhblJlcGx5KTtcblx0fVxuXG5cdGdldCBjYW5SZXBseSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuUmVwbHk7XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsYXBzaWJsZVN0YXRlOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUgfCB1bmRlZmluZWQgPSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkO1xuXHRnZXQgY29sbGFwc2libGVTdGF0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29sbGFwc2libGVTdGF0ZTtcblx0fVxuXG5cdHNldCBjb2xsYXBzaWJsZVN0YXRlKG5ld1N0YXRlOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5pbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxDb2xsYXBzaWJsZVN0YXRlID0gbmV3U3RhdGU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld1N0YXRlICE9PSB0aGlzLl9jb2xsYXBzaWJsZVN0YXRlKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzaWJsZVN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbGxhcHNpYmxlU3RhdGUuZmlyZSh0aGlzLl9jb2xsYXBzaWJsZVN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pbml0aWFsQ29sbGFwc2libGVTdGF0ZTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlIHwgdW5kZWZpbmVkO1xuXHRnZXQgaW5pdGlhbENvbGxhcHNpYmxlU3RhdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxDb2xsYXBzaWJsZVN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgaW5pdGlhbENvbGxhcHNpYmxlU3RhdGUoaW5pdGlhbENvbGxhcHNpYmxlU3RhdGU6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2luaXRpYWxDb2xsYXBzaWJsZVN0YXRlID0gaW5pdGlhbENvbGxhcHNpYmxlU3RhdGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbml0aWFsQ29sbGFwc2libGVTdGF0ZS5maXJlKGluaXRpYWxDb2xsYXBzaWJsZVN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29sbGFwc2libGVTdGF0ZSA9IG5ldyBFbWl0dGVyPGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB8IHVuZGVmaW5lZD4oKTtcblx0cHVibGljIG9uRGlkQ2hhbmdlQ29sbGFwc2libGVTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlQ29sbGFwc2libGVTdGF0ZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9IG5ldyBFbWl0dGVyPGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB8IHVuZGVmaW5lZD4oKTtcblx0cHVibGljIG9uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZUluaXRpYWxDb2xsYXBzaWJsZVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cblx0Z2V0IGlzRGlzcG9zZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRGlzcG9zZWQ7XG5cdH1cblxuXHRpc0RvY3VtZW50Q29tbWVudFRocmVhZCgpOiB0aGlzIGlzIGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElSYW5nZT4ge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZSA9PT0gdW5kZWZpbmVkIHx8IFJhbmdlLmlzSVJhbmdlKHRoaXMuX3JhbmdlKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXRlOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRnZXQgc3RhdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHR9XG5cblx0c2V0IHN0YXRlKG5ld1N0YXRlOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fc3RhdGUgPSBuZXdTdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUodGhpcy5fc3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbGljYWJpbGl0eTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IHwgdW5kZWZpbmVkO1xuXG5cdGdldCBhcHBsaWNhYmlsaXR5KCk6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FwcGxpY2FiaWxpdHk7XG5cdH1cblxuXHRzZXQgYXBwbGljYWJpbGl0eSh2YWx1ZTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fYXBwbGljYWJpbGl0eSA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXBwbGljYWJpbGl0eS5maXJlKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXBwbGljYWJpbGl0eSA9IG5ldyBFbWl0dGVyPGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB8IHVuZGVmaW5lZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBcHBsaWNhYmlsaXR5OiBFdmVudDxsYW5ndWFnZXMuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfCB1bmRlZmluZWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VBcHBsaWNhYmlsaXR5LmV2ZW50O1xuXG5cdHB1YmxpYyBnZXQgaXNUZW1wbGF0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUZW1wbGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU3RhdGUgPSBuZXcgRW1pdHRlcjxsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlIHwgdW5kZWZpbmVkPigpO1xuXHRwdWJsaWMgb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcixcblx0XHRwdWJsaWMgY29udHJvbGxlckhhbmRsZTogbnVtYmVyLFxuXHRcdHB1YmxpYyBleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdHB1YmxpYyB0aHJlYWRJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZXNvdXJjZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3JhbmdlOiBUIHwgdW5kZWZpbmVkLFxuXHRcdGNvbW1lbnRzOiBsYW5ndWFnZXMuQ29tbWVudFtdIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX2NhblJlcGx5OiBib29sZWFuIHwgbGFuZ3VhZ2VzLkNvbW1lbnRBdXRob3JJbmZvcm1hdGlvbixcblx0XHRwcml2YXRlIF9pc1RlbXBsYXRlOiBib29sZWFuLFxuXHRcdHB1YmxpYyBlZGl0b3JJZD86IHN0cmluZ1xuXHQpIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0aWYgKF9pc1RlbXBsYXRlKSB7XG5cdFx0XHR0aGlzLmNvbW1lbnRzID0gW107XG5cdFx0fSBlbHNlIGlmIChjb21tZW50cykge1xuXHRcdFx0dGhpcy5fY29tbWVudHMgPSBjb21tZW50cztcblx0XHR9XG5cdH1cblxuXHRiYXRjaFVwZGF0ZShjaGFuZ2VzOiBDb21tZW50VGhyZWFkQ2hhbmdlczxUPikge1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gKHZhbHVlOiBrZXlvZiBDb21tZW50VGhyZWFkQ2hhbmdlcyk6IGJvb2xlYW4gPT5cblx0XHRcdE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjaGFuZ2VzLCB2YWx1ZSk7XG5cblx0XHRpZiAobW9kaWZpZWQoJ3JhbmdlJykpIHsgdGhpcy5fcmFuZ2UgPSBjaGFuZ2VzLnJhbmdlITsgfVxuXHRcdGlmIChtb2RpZmllZCgnbGFiZWwnKSkgeyB0aGlzLl9sYWJlbCA9IGNoYW5nZXMubGFiZWw7IH1cblx0XHRpZiAobW9kaWZpZWQoJ2NvbnRleHRWYWx1ZScpKSB7IHRoaXMuX2NvbnRleHRWYWx1ZSA9IGNoYW5nZXMuY29udGV4dFZhbHVlID09PSBudWxsID8gdW5kZWZpbmVkIDogY2hhbmdlcy5jb250ZXh0VmFsdWU7IH1cblx0XHRpZiAobW9kaWZpZWQoJ2NvbW1lbnRzJykpIHsgdGhpcy5jb21tZW50cyA9IGNoYW5nZXMuY29tbWVudHM7IH1cblx0XHRpZiAobW9kaWZpZWQoJ2NvbGxhcHNlU3RhdGUnKSkgeyB0aGlzLmNvbGxhcHNpYmxlU3RhdGUgPSBjaGFuZ2VzLmNvbGxhcHNlU3RhdGU7IH1cblx0XHRpZiAobW9kaWZpZWQoJ2NhblJlcGx5JykpIHsgdGhpcy5jYW5SZXBseSA9IGNoYW5nZXMuY2FuUmVwbHkhOyB9XG5cdFx0aWYgKG1vZGlmaWVkKCdzdGF0ZScpKSB7IHRoaXMuc3RhdGUgPSBjaGFuZ2VzLnN0YXRlITsgfVxuXHRcdGlmIChtb2RpZmllZCgnYXBwbGljYWJpbGl0eScpKSB7IHRoaXMuYXBwbGljYWJpbGl0eSA9IGNoYW5nZXMuYXBwbGljYWJpbGl0eSE7IH1cblx0XHRpZiAobW9kaWZpZWQoJ2lzVGVtcGxhdGUnKSkgeyB0aGlzLl9pc1RlbXBsYXRlID0gY2hhbmdlcy5pc1RlbXBsYXRlITsgfVxuXHR9XG5cblx0aGFzQ29tbWVudHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5jb21tZW50cyAmJiB0aGlzLmNvbW1lbnRzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29sbGFwc2libGVTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbml0aWFsQ29sbGFwc2libGVTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb21tZW50cy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnB1dC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDYW5SZXBseS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBcHBsaWNhYmlsaXR5LmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRvSlNPTigpOiBNYXJzaGFsbGVkQ29tbWVudFRocmVhZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkLFxuXHRcdFx0Y29tbWVudENvbnRyb2xIYW5kbGU6IHRoaXMuY29udHJvbGxlckhhbmRsZSxcblx0XHRcdGNvbW1lbnRUaHJlYWRIYW5kbGU6IHRoaXMuY29tbWVudFRocmVhZEhhbmRsZSxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIENvbW1lbnRUaHJlYWRXaXRoRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHRocmVhZDogTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT4pIHsgfVxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZENvbW1lbnRDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb21tZW50Q29udHJvbGxlciB7XG5cdGdldCBoYW5kbGUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5faGFuZGxlO1xuXHR9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG5cblx0Z2V0IGNvbnRleHRWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGdldCBwcm94eSgpOiBFeHRIb3N0Q29tbWVudHNTaGFwZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5O1xuXHR9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhY3Rpb25zOiBsYW5ndWFnZXMuQ29tbWVudFJlYWN0aW9uW10gfCB1bmRlZmluZWQ7XG5cblx0Z2V0IHJlYWN0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhY3Rpb25zO1xuXHR9XG5cblx0c2V0IHJlYWN0aW9ucyhyZWFjdGlvbnM6IGxhbmd1YWdlcy5Db21tZW50UmVhY3Rpb25bXSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3JlYWN0aW9ucyA9IHJlYWN0aW9ucztcblx0fVxuXG5cdGdldCBvcHRpb25zKCkge1xuXHRcdHJldHVybiB0aGlzLl9mZWF0dXJlcy5vcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGhyZWFkczogRGlzcG9zYWJsZU1hcDxudW1iZXIsIENvbW1lbnRUaHJlYWRXaXRoRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIENvbW1lbnRUaHJlYWRXaXRoRGlzcG9zYWJsZT4oKSk7XG5cdHB1YmxpYyBhY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZD86IE1haW5UaHJlYWRDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+O1xuXG5cdGdldCBmZWF0dXJlcygpOiBDb21tZW50UHJvdmlkZXJGZWF0dXJlcyB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZlYXR1cmVzO1xuXHR9XG5cblx0Z2V0IG93bmVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0Q29tbWVudHNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmlxdWVJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IHN0cmluZyxcblx0XHRwcml2YXRlIF9mZWF0dXJlczogQ29tbWVudFByb3ZpZGVyRmVhdHVyZXMsXG5cdFx0QElDb21tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50U2VydmljZTogSUNvbW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldCBhY3RpdmVDb21tZW50KCkge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVDb21tZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZlQ29tbWVudDogeyB0aHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkOyBjb21tZW50PzogbGFuZ3VhZ2VzLkNvbW1lbnQgfSB8IHVuZGVmaW5lZDtcblx0YXN5bmMgc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZChjb21tZW50SW5mbzogeyB0aHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkOyBjb21tZW50PzogbGFuZ3VhZ2VzLkNvbW1lbnQgfSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2FjdGl2ZUNvbW1lbnQgPSBjb21tZW50SW5mbztcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHNldEFjdGl2ZUNvbW1lbnQodGhpcy5faGFuZGxlLCBjb21tZW50SW5mbyA/IHsgY29tbWVudFRocmVhZEhhbmRsZTogY29tbWVudEluZm8udGhyZWFkLmNvbW1lbnRUaHJlYWRIYW5kbGUsIHVuaXF1ZUlkSW5UaHJlYWQ6IGNvbW1lbnRJbmZvLmNvbW1lbnQ/LnVuaXF1ZUlkSW5UaHJlYWQgfSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHR1cGRhdGVGZWF0dXJlcyhmZWF0dXJlczogQ29tbWVudFByb3ZpZGVyRmVhdHVyZXMpIHtcblx0XHR0aGlzLl9mZWF0dXJlcyA9IGZlYXR1cmVzO1xuXHR9XG5cblx0Y3JlYXRlQ29tbWVudFRocmVhZChleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcixcblx0XHR0aHJlYWRJZDogc3RyaW5nLFxuXHRcdHJlc291cmNlOiBVcmlDb21wb25lbnRzLFxuXHRcdHJhbmdlOiBJUmFuZ2UgfCBJQ2VsbFJhbmdlIHwgdW5kZWZpbmVkLFxuXHRcdGNvbW1lbnRzOiBsYW5ndWFnZXMuQ29tbWVudFtdLFxuXHRcdGlzVGVtcGxhdGU6IGJvb2xlYW4sXG5cdFx0ZWRpdG9ySWQ/OiBzdHJpbmdcblx0KTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT4ge1xuXHRcdGNvbnN0IHRocmVhZCA9IG5ldyBNYWluVGhyZWFkQ29tbWVudFRocmVhZChcblx0XHRcdGNvbW1lbnRUaHJlYWRIYW5kbGUsXG5cdFx0XHR0aGlzLmhhbmRsZSxcblx0XHRcdGV4dGVuc2lvbklkLFxuXHRcdFx0dGhyZWFkSWQsXG5cdFx0XHRVUkkucmV2aXZlKHJlc291cmNlKS50b1N0cmluZygpLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRjb21tZW50cyxcblx0XHRcdHRydWUsXG5cdFx0XHRpc1RlbXBsYXRlLFxuXHRcdFx0ZWRpdG9ySWRcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGhyZWFkV2l0aERpc3Bvc2FibGUgPSBuZXcgQ29tbWVudFRocmVhZFdpdGhEaXNwb3NhYmxlKHRocmVhZCk7XG5cdFx0dGhpcy5fdGhyZWFkcy5zZXQoY29tbWVudFRocmVhZEhhbmRsZSwgdGhyZWFkV2l0aERpc3Bvc2FibGUpO1xuXHRcdHRocmVhZFdpdGhEaXNwb3NhYmxlLmRpc3Bvc2FibGVTdG9yZS5hZGQodGhyZWFkLm9uRGlkQ2hhbmdlQ29sbGFwc2libGVTdGF0ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnByb3h5LiR1cGRhdGVDb21tZW50VGhyZWFkKHRoaXMuaGFuZGxlLCB0aHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSwgeyBjb2xsYXBzZVN0YXRlOiB0aHJlYWQuY29sbGFwc2libGVTdGF0ZSB9KTtcblx0XHR9KSk7XG5cblxuXHRcdGlmICh0aHJlYWQuaXNEb2N1bWVudENvbW1lbnRUaHJlYWQoKSkge1xuXHRcdFx0dGhpcy5fY29tbWVudFNlcnZpY2UudXBkYXRlQ29tbWVudHModGhpcy5fdW5pcXVlSWQsIHtcblx0XHRcdFx0YWRkZWQ6IFt0aHJlYWRdLFxuXHRcdFx0XHRyZW1vdmVkOiBbXSxcblx0XHRcdFx0Y2hhbmdlZDogW10sXG5cdFx0XHRcdHBlbmRpbmc6IFtdXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29tbWVudFNlcnZpY2UudXBkYXRlTm90ZWJvb2tDb21tZW50cyh0aGlzLl91bmlxdWVJZCwge1xuXHRcdFx0XHRhZGRlZDogW3RocmVhZCBhcyBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJQ2VsbFJhbmdlPl0sXG5cdFx0XHRcdHJlbW92ZWQ6IFtdLFxuXHRcdFx0XHRjaGFuZ2VkOiBbXSxcblx0XHRcdFx0cGVuZGluZzogW11cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aHJlYWQ7XG5cdH1cblxuXHR1cGRhdGVDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcixcblx0XHR0aHJlYWRJZDogc3RyaW5nLFxuXHRcdHJlc291cmNlOiBVcmlDb21wb25lbnRzLFxuXHRcdGNoYW5nZXM6IENvbW1lbnRUaHJlYWRDaGFuZ2VzKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5nZXRLbm93blRocmVhZChjb21tZW50VGhyZWFkSGFuZGxlKTtcblx0XHR0aHJlYWQuYmF0Y2hVcGRhdGUoY2hhbmdlcyk7XG5cblx0XHRpZiAodGhyZWFkLmlzRG9jdW1lbnRDb21tZW50VGhyZWFkKCkpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVwZGF0ZUNvbW1lbnRzKHRoaXMuX3VuaXF1ZUlkLCB7XG5cdFx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdFx0cmVtb3ZlZDogW10sXG5cdFx0XHRcdGNoYW5nZWQ6IFt0aHJlYWRdLFxuXHRcdFx0XHRwZW5kaW5nOiBbXVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVwZGF0ZU5vdGVib29rQ29tbWVudHModGhpcy5fdW5pcXVlSWQsIHtcblx0XHRcdFx0YWRkZWQ6IFtdLFxuXHRcdFx0XHRyZW1vdmVkOiBbXSxcblx0XHRcdFx0Y2hhbmdlZDogW3RocmVhZCBhcyBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJQ2VsbFJhbmdlPl0sXG5cdFx0XHRcdHBlbmRpbmc6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0fVxuXG5cdGRlbGV0ZUNvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZEhhbmRsZTogbnVtYmVyKSB7XG5cdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5nZXRLbm93blRocmVhZChjb21tZW50VGhyZWFkSGFuZGxlKTtcblx0XHR0aGlzLl90aHJlYWRzLmRlbGV0ZUFuZERpc3Bvc2UoY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0dGhyZWFkLmRpc3Bvc2UoKTtcblxuXHRcdGlmICh0aHJlYWQuaXNEb2N1bWVudENvbW1lbnRUaHJlYWQoKSkge1xuXHRcdFx0dGhpcy5fY29tbWVudFNlcnZpY2UudXBkYXRlQ29tbWVudHModGhpcy5fdW5pcXVlSWQsIHtcblx0XHRcdFx0YWRkZWQ6IFtdLFxuXHRcdFx0XHRyZW1vdmVkOiBbdGhyZWFkXSxcblx0XHRcdFx0Y2hhbmdlZDogW10sXG5cdFx0XHRcdHBlbmRpbmc6IFtdXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29tbWVudFNlcnZpY2UudXBkYXRlTm90ZWJvb2tDb21tZW50cyh0aGlzLl91bmlxdWVJZCwge1xuXHRcdFx0XHRhZGRlZDogW10sXG5cdFx0XHRcdHJlbW92ZWQ6IFt0aHJlYWQgYXMgTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8SUNlbGxSYW5nZT5dLFxuXHRcdFx0XHRjaGFuZ2VkOiBbXSxcblx0XHRcdFx0cGVuZGluZzogW11cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGRlbGV0ZUNvbW1lbnRUaHJlYWRNYWluKGNvbW1lbnRUaHJlYWRJZDogc3RyaW5nKSB7XG5cdFx0Zm9yIChjb25zdCB7IHRocmVhZCB9IG9mIHRoaXMuX3RocmVhZHMudmFsdWVzKCkpIHtcblx0XHRcdGlmICh0aHJlYWQudGhyZWFkSWQgPT09IGNvbW1lbnRUaHJlYWRJZCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kZGVsZXRlQ29tbWVudFRocmVhZCh0aGlzLl9oYW5kbGUsIHRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR1cGRhdGVJbnB1dChpbnB1dDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5hY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZDtcblxuXHRcdGlmICh0aHJlYWQgJiYgdGhyZWFkLmlucHV0KSB7XG5cdFx0XHRjb25zdCBjb21tZW50SW5wdXQgPSB0aHJlYWQuaW5wdXQ7XG5cdFx0XHRjb21tZW50SW5wdXQudmFsdWUgPSBpbnB1dDtcblx0XHRcdHRocmVhZC5pbnB1dCA9IGNvbW1lbnRJbnB1dDtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVDb21tZW50aW5nUmFuZ2VzKHJlc291cmNlSGludHM/OiBsYW5ndWFnZXMuQ29tbWVudGluZ1JhbmdlUmVzb3VyY2VIaW50KSB7XG5cdFx0dGhpcy5fY29tbWVudFNlcnZpY2UudXBkYXRlQ29tbWVudGluZ1Jhbmdlcyh0aGlzLl91bmlxdWVJZCwgcmVzb3VyY2VIaW50cyk7XG5cdH1cblxuXHRwcml2YXRlIGdldEtub3duVGhyZWFkKGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcik6IE1haW5UaHJlYWRDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+IHtcblx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLl90aHJlYWRzLmdldChjb21tZW50VGhyZWFkSGFuZGxlKTtcblx0XHRpZiAoIXRocmVhZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd1bmtub3duIHRocmVhZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhyZWFkLnRocmVhZDtcblx0fVxuXG5cdGFzeW5jIGdldERvY3VtZW50Q29tbWVudHMocmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVuaXF1ZU93bmVyOiB0aGlzLl91bmlxdWVJZCxcblx0XHRcdFx0bGFiZWw6IHRoaXMubGFiZWwsXG5cdFx0XHRcdHRocmVhZHM6IFtdLFxuXHRcdFx0XHRjb21tZW50aW5nUmFuZ2VzOiB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRcdHJhbmdlczogW10sXG5cdFx0XHRcdFx0ZmlsZUNvbW1lbnRzOiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8SVJhbmdlPltdID0gW107XG5cdFx0Zm9yIChjb25zdCB0aHJlYWQgb2YgWy4uLnRoaXMuX3RocmVhZHMua2V5cygpXSkge1xuXHRcdFx0Y29uc3QgY29tbWVudFRocmVhZCA9IHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZCkhO1xuXHRcdFx0aWYgKGNvbW1lbnRUaHJlYWQudGhyZWFkLnJlc291cmNlICYmIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChVUkkucGFyc2UoY29tbWVudFRocmVhZC50aHJlYWQucmVzb3VyY2UpLCByZXNvdXJjZSkpIHtcblx0XHRcdFx0aWYgKGNvbW1lbnRUaHJlYWQudGhyZWFkLmlzRG9jdW1lbnRDb21tZW50VGhyZWFkKCkpIHtcblx0XHRcdFx0XHRyZXQucHVzaChjb21tZW50VGhyZWFkLnRocmVhZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb21tZW50aW5nUmFuZ2VzID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVDb21tZW50aW5nUmFuZ2VzKHRoaXMuaGFuZGxlLCByZXNvdXJjZSwgdG9rZW4pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHVuaXF1ZU93bmVyOiB0aGlzLl91bmlxdWVJZCxcblx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0dGhyZWFkczogcmV0LFxuXHRcdFx0Y29tbWVudGluZ1Jhbmdlczoge1xuXHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdHJhbmdlczogY29tbWVudGluZ1Jhbmdlcz8ucmFuZ2VzIHx8IFtdLFxuXHRcdFx0XHRmaWxlQ29tbWVudHM6ICEhY29tbWVudGluZ1Jhbmdlcz8uZmlsZUNvbW1lbnRzXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldE5vdGVib29rQ29tbWVudHMocmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVuaXF1ZU93bmVyOiB0aGlzLl91bmlxdWVJZCxcblx0XHRcdFx0bGFiZWw6IHRoaXMubGFiZWwsXG5cdFx0XHRcdHRocmVhZHM6IFtdXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8SUNlbGxSYW5nZT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIFsuLi50aGlzLl90aHJlYWRzLmtleXMoKV0pIHtcblx0XHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSB0aGlzLl90aHJlYWRzLmdldCh0aHJlYWQpITtcblx0XHRcdGlmIChjb21tZW50VGhyZWFkLnRocmVhZC5yZXNvdXJjZSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRpZiAoIWNvbW1lbnRUaHJlYWQudGhyZWFkLmlzRG9jdW1lbnRDb21tZW50VGhyZWFkKCkpIHtcblx0XHRcdFx0XHRyZXQucHVzaChjb21tZW50VGhyZWFkLnRocmVhZCBhcyBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxJQ2VsbFJhbmdlPik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dW5pcXVlT3duZXI6IHRoaXMuX3VuaXF1ZUlkLFxuXHRcdFx0bGFiZWw6IHRoaXMubGFiZWwsXG5cdFx0XHR0aHJlYWRzOiByZXRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlUmVhY3Rpb24odXJpOiBVUkksIHRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQsIGNvbW1lbnQ6IGxhbmd1YWdlcy5Db21tZW50LCByZWFjdGlvbjogbGFuZ3VhZ2VzLkNvbW1lbnRSZWFjdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiR0b2dnbGVSZWFjdGlvbih0aGlzLl9oYW5kbGUsIHRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlLCB1cmksIGNvbW1lbnQsIHJlYWN0aW9uKTtcblx0fVxuXG5cdGdldEFsbENvbW1lbnRzKCk6IE1haW5UaHJlYWRDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+W10ge1xuXHRcdGNvbnN0IHJldDogTWFpblRocmVhZENvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIFsuLi50aGlzLl90aHJlYWRzLmtleXMoKV0pIHtcblx0XHRcdHJldC5wdXNoKHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZCkhLnRocmVhZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdGNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZShyZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCwgZWRpdG9ySWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh0aGlzLmhhbmRsZSwgcmVzb3VyY2UsIHJhbmdlLCBlZGl0b3JJZCk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodGhyZWFkSGFuZGxlOiBudW1iZXIsIHJhbmdlOiBJUmFuZ2UpIHtcblx0XHRhd2FpdCB0aGlzLl9wcm94eS4kdXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHRoaXMuaGFuZGxlLCB0aHJlYWRIYW5kbGUsIHJhbmdlKTtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNvbW1lbnRDb250cm9sbGVyLFxuXHRcdFx0aGFuZGxlOiB0aGlzLmhhbmRsZVxuXHRcdH07XG5cdH1cbn1cblxuXG5jb25zdCBjb21tZW50c1ZpZXdJY29uID0gcmVnaXN0ZXJJY29uKCdjb21tZW50cy12aWV3LWljb24nLCBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLCBsb2NhbGl6ZSgnY29tbWVudHNWaWV3SWNvbicsICdWaWV3IGljb24gb2YgdGhlIGNvbW1lbnRzIHZpZXcuJykpO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZENvbW1lbnRzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDb21tZW50cyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkQ29tbWVudHNTaGFwZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0Q29tbWVudHNTaGFwZTtcblxuXHRwcml2YXRlIF9oYW5kbGVycyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2NvbW1lbnRDb250cm9sbGVycyA9IG5ldyBNYXA8bnVtYmVyLCBNYWluVGhyZWFkQ29tbWVudENvbnRyb2xsZXI+KCk7XG5cblx0cHJpdmF0ZSBfYWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQ/OiBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3BlblZpZXdMaXN0ZW5lcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZUNvbnRhaW5lckxpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2hhbmdlQ29udGFpbmVyTG9jYXRpb25MaXN0ZW5lcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElDb21tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50U2VydmljZTogSUNvbW1lbnRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q29tbWVudHMpO1xuXHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVucmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZChhc3luYyB0aHJlYWQgPT4ge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gKHRocmVhZCBhcyBNYWluVGhyZWFkQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPikuY29udHJvbGxlckhhbmRsZTtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cblx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkID0gdGhyZWFkIGFzIE1haW5UaHJlYWRDb21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+O1xuXHRcdFx0Y29udHJvbGxlci5hY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZCA9IHRoaXMuX2FjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1lbnRTZXJ2aWNlLm9uUmVzb3VyY2VIYXNDb21tZW50aW5nUmFuZ2VzKCgpID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJWaWV3KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tbWVudFNlcnZpY2Uub25EaWRVcGRhdGVDb21tZW50VGhyZWFkcygoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVmlldygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdCRyZWdpc3RlckNvbW1lbnRDb250cm9sbGVyKGhhbmRsZTogbnVtYmVyLCBpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IGAke2lkfS0ke2V4dGVuc2lvbklkfWA7XG5cdFx0dGhpcy5faGFuZGxlcnMuc2V0KGhhbmRsZSwgcHJvdmlkZXJJZCk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRDb21tZW50Q29udHJvbGxlciwgdGhpcy5fcHJveHksIGhhbmRsZSwgcHJvdmlkZXJJZCwgaWQsIGxhYmVsLCB7fSk7XG5cdFx0dGhpcy5fY29tbWVudFNlcnZpY2UucmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcihwcm92aWRlcklkLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fY29tbWVudENvbnRyb2xsZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnNldFdvcmtzcGFjZUNvbW1lbnRzKFN0cmluZyhoYW5kbGUpLCBbXSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlckNvbW1lbnRDb250cm9sbGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IHRoaXMuX2hhbmRsZXJzLmdldChoYW5kbGUpO1xuXHRcdHRoaXMuX2hhbmRsZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoaGFuZGxlKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5kZWxldGUoaGFuZGxlKTtcblxuXHRcdGlmICh0eXBlb2YgcHJvdmlkZXJJZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybjtcblx0XHRcdC8vIHRocm93IG5ldyBFcnJvcigndW5rbm93biBoYW5kbGVyJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRTZXJ2aWNlLnVucmVnaXN0ZXJDb21tZW50Q29udHJvbGxlcihwcm92aWRlcklkKTtcblx0XHR9XG5cdH1cblxuXHQkdXBkYXRlQ29tbWVudENvbnRyb2xsZXJGZWF0dXJlcyhoYW5kbGU6IG51bWJlciwgZmVhdHVyZXM6IENvbW1lbnRQcm92aWRlckZlYXR1cmVzKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHByb3ZpZGVyLnVwZGF0ZUZlYXR1cmVzKGZlYXR1cmVzKTtcblx0fVxuXG5cdCRjcmVhdGVDb21tZW50VGhyZWFkKGhhbmRsZTogbnVtYmVyLFxuXHRcdGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcixcblx0XHR0aHJlYWRJZDogc3RyaW5nLFxuXHRcdHJlc291cmNlOiBVcmlDb21wb25lbnRzLFxuXHRcdHJhbmdlOiBJUmFuZ2UgfCBJQ2VsbFJhbmdlIHwgdW5kZWZpbmVkLFxuXHRcdGNvbW1lbnRzOiBsYW5ndWFnZXMuQ29tbWVudFtdLFxuXHRcdGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdGlzVGVtcGxhdGU6IGJvb2xlYW4sXG5cdFx0ZWRpdG9ySWQ/OiBzdHJpbmdcblx0KTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8SVJhbmdlIHwgSUNlbGxSYW5nZT4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvdmlkZXIuY3JlYXRlQ29tbWVudFRocmVhZChleHRlbnNpb25JZC52YWx1ZSwgY29tbWVudFRocmVhZEhhbmRsZSwgdGhyZWFkSWQsIHJlc291cmNlLCByYW5nZSwgY29tbWVudHMsIGlzVGVtcGxhdGUsIGVkaXRvcklkKTtcblx0fVxuXG5cdCR1cGRhdGVDb21tZW50VGhyZWFkKGhhbmRsZTogbnVtYmVyLFxuXHRcdGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlcixcblx0XHR0aHJlYWRJZDogc3RyaW5nLFxuXHRcdHJlc291cmNlOiBVcmlDb21wb25lbnRzLFxuXHRcdGNoYW5nZXM6IENvbW1lbnRUaHJlYWRDaGFuZ2VzKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlci51cGRhdGVDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWRIYW5kbGUsIHRocmVhZElkLCByZXNvdXJjZSwgY2hhbmdlcyk7XG5cdH1cblxuXHQkZGVsZXRlQ29tbWVudFRocmVhZChoYW5kbGU6IG51bWJlciwgY29tbWVudFRocmVhZEhhbmRsZTogbnVtYmVyKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3ZpZGVyLmRlbGV0ZUNvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdH1cblxuXHQkdXBkYXRlQ29tbWVudGluZ1JhbmdlcyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2VIaW50cz86IGxhbmd1YWdlcy5Db21tZW50aW5nUmFuZ2VSZXNvdXJjZUhpbnQpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoaGFuZGxlKTtcblxuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRwcm92aWRlci51cGRhdGVDb21tZW50aW5nUmFuZ2VzKHJlc291cmNlSGludHMpO1xuXHR9XG5cblx0YXN5bmMgJHJldmVhbENvbW1lbnRUaHJlYWQoaGFuZGxlOiBudW1iZXIsIGNvbW1lbnRUaHJlYWRIYW5kbGU6IG51bWJlciwgY29tbWVudFVuaXF1ZUlkSW5UaHJlYWQ6IG51bWJlciwgb3B0aW9uczogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRSZXZlYWxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhyZWFkID0gcHJvdmlkZXIuZ2V0QWxsQ29tbWVudHMoKS5maW5kKHRocmVhZCA9PiB0aHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSA9PT0gY29tbWVudFRocmVhZEhhbmRsZSk7XG5cdFx0aWYgKCF0aHJlYWQgfHwgIXRocmVhZC5pc0RvY3VtZW50Q29tbWVudFRocmVhZCgpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWVudCA9IHRocmVhZC5jb21tZW50cz8uZmluZChjb21tZW50ID0+IGNvbW1lbnQudW5pcXVlSWRJblRocmVhZCA9PT0gY29tbWVudFVuaXF1ZUlkSW5UaHJlYWQpO1xuXG5cdFx0cmV2ZWFsQ29tbWVudFRocmVhZCh0aGlzLl9jb21tZW50U2VydmljZSwgdGhpcy5fZWRpdG9yU2VydmljZSwgdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLCB0aHJlYWQsIGNvbW1lbnQsIG9wdGlvbnMuZm9jdXNSZXBseSwgdW5kZWZpbmVkLCBvcHRpb25zLnByZXNlcnZlRm9jdXMpO1xuXHR9XG5cblx0YXN5bmMgJGhpZGVDb21tZW50VGhyZWFkKGhhbmRsZTogbnVtYmVyLCBjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoaGFuZGxlKTtcblxuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCB0aHJlYWQgPSBwcm92aWRlci5nZXRBbGxDb21tZW50cygpLmZpbmQodGhyZWFkID0+IHRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlID09PSBjb21tZW50VGhyZWFkSGFuZGxlKTtcblx0XHRpZiAoIXRocmVhZCB8fCAhdGhyZWFkLmlzRG9jdW1lbnRDb21tZW50VGhyZWFkKCkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHR0aHJlYWQuY29sbGFwc2libGVTdGF0ZSA9IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlldygpIHtcblx0XHRjb25zdCBjb21tZW50c1BhbmVsQWxyZWFkeUNvbnN0cnVjdGVkID0gISF0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKENPTU1FTlRTX1ZJRVdfSUQpO1xuXHRcdGlmICghY29tbWVudHNQYW5lbEFscmVhZHlDb25zdHJ1Y3RlZCkge1xuXHRcdFx0Y29uc3QgVklFV19DT05UQUlORVI6IFZpZXdDb250YWluZXIgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0XHRcdFx0aWQ6IENPTU1FTlRTX1ZJRVdfSUQsXG5cdFx0XHRcdHRpdGxlOiBDT01NRU5UU19WSUVXX1RJVExFLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFZpZXdQYW5lQ29udGFpbmVyLCBbQ09NTUVOVFNfVklFV19JRCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfV0pLFxuXHRcdFx0XHRzdG9yYWdlSWQ6IENPTU1FTlRTX1ZJRVdfU1RPUkFHRV9JRCxcblx0XHRcdFx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdFx0XHRcdGljb246IGNvbW1lbnRzVmlld0ljb24sXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cblx0XHRcdFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3RXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdzKFt7XG5cdFx0XHRcdGlkOiBDT01NRU5UU19WSUVXX0lELFxuXHRcdFx0XHRuYW1lOiBDT01NRU5UU19WSUVXX1RJVExFLFxuXHRcdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiBmYWxzZSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihDb21tZW50c1BhbmVsKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdFx0XHRcdGNvbnRhaW5lckljb246IGNvbW1lbnRzVmlld0ljb24sXG5cdFx0XHRcdGZvY3VzQ29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0NvbW1lbnRzUGFuZWwnXG5cdFx0XHRcdH1cblx0XHRcdH1dLCBWSUVXX0NPTlRBSU5FUik7XG5cdFx0fVxuXHRcdHRoaXMucmVnaXN0ZXJWaWV3TGlzdGVuZXJzKGNvbW1lbnRzUGFuZWxBbHJlYWR5Q29uc3RydWN0ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRDb21tZW50cygpIHtcblx0XHRbLi4udGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmtleXMoKV0uZm9yRWFjaChoYW5kbGUgPT4ge1xuXHRcdFx0Y29uc3QgdGhyZWFkcyA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoaGFuZGxlKSEuZ2V0QWxsQ29tbWVudHMoKTtcblxuXHRcdFx0aWYgKHRocmVhZHMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVySWQgPSB0aGlzLmdldEhhbmRsZXIoaGFuZGxlKTtcblx0XHRcdFx0dGhpcy5fY29tbWVudFNlcnZpY2Uuc2V0V29ya3NwYWNlQ29tbWVudHMocHJvdmlkZXJJZCwgdGhyZWFkcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld09wZW5lZExpc3RlbmVyKCkge1xuXHRcdGlmICghdGhpcy5fb3BlblZpZXdMaXN0ZW5lci52YWx1ZSkge1xuXHRcdFx0dGhpcy5fb3BlblZpZXdMaXN0ZW5lci52YWx1ZSA9IHRoaXMuX3ZpZXdzU2VydmljZS5vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5pZCA9PT0gQ09NTUVOVFNfVklFV19JRCAmJiBlLnZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLnNldENvbW1lbnRzKCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX29wZW5WaWV3TGlzdGVuZXIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29wZW5WaWV3TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIElmIHRoZSBjb21tZW50cyB2aWV3IGhhcyBuZXZlciBiZWVuIG9wZW5lZCwgdGhlIGNvbnN0cnVjdG9yIGZvciBpdCBoYXMgbm90IHlldCBydW4gc28gaXQgaGFzXG5cdCAqIG5vIGxpc3RlbmVycyBmb3IgY29tbWVudCB0aHJlYWRzIGJlaW5nIHNldCBvciB1cGRhdGVkLiBMaXN0ZW4gZm9yIHRoZSB2aWV3IG9wZW5pbmcgZm9yIHRoZVxuXHQgKiBmaXJzdCB0aW1lIGFuZCBzZW5kIGl0IGNvbW1lbnRzIHRoZW4uXG5cdCAqL1xuXHRwcml2YXRlIHJlZ2lzdGVyVmlld0xpc3RlbmVycyhjb21tZW50c1BhbmVsQWxyZWFkeUNvbnN0cnVjdGVkOiBib29sZWFuKSB7XG5cdFx0aWYgKCFjb21tZW50c1BhbmVsQWxyZWFkeUNvbnN0cnVjdGVkKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVmlld09wZW5lZExpc3RlbmVyKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9vbkNoYW5nZUNvbnRhaW5lckxpc3RlbmVyLnZhbHVlKSB7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZUNvbnRhaW5lckxpc3RlbmVyLnZhbHVlID0gdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGFpbmVyKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS52aWV3cy5maW5kKHZpZXcgPT4gdmlldy5pZCA9PT0gQ09NTUVOVFNfVklFV19JRCkpIHtcblx0XHRcdFx0XHR0aGlzLnNldENvbW1lbnRzKCk7XG5cdFx0XHRcdFx0dGhpcy5yZWdpc3RlclZpZXdPcGVuZWRMaXN0ZW5lcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX29uQ2hhbmdlQ29udGFpbmVyTG9jYXRpb25MaXN0ZW5lci52YWx1ZSkge1xuXHRcdFx0dGhpcy5fb25DaGFuZ2VDb250YWluZXJMb2NhdGlvbkxpc3RlbmVyLnZhbHVlID0gdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb24oZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1lbnRzQ29udGFpbmVyID0gdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChDT01NRU5UU19WSUVXX0lEKTtcblx0XHRcdFx0aWYgKGUudmlld0NvbnRhaW5lci5pZCA9PT0gY29tbWVudHNDb250YWluZXI/LmlkKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb21tZW50cygpO1xuXHRcdFx0XHRcdHRoaXMucmVnaXN0ZXJWaWV3T3BlbmVkTGlzdGVuZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRIYW5kbGVyKGhhbmRsZTogbnVtYmVyKSB7XG5cdFx0aWYgKCF0aGlzLl9oYW5kbGVycy5oYXMoaGFuZGxlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGhhbmRsZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2hhbmRsZXJzLmdldChoYW5kbGUpITtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxlQUFlLGlCQUE4Qix5QkFBeUI7QUFDM0YsU0FBUyxXQUEwQjtBQUNuQyxTQUFpQixhQUFhO0FBQzlCLFlBQVksZUFBZTtBQUUzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE2QztBQUN0RCxTQUE2Qix1QkFBdUI7QUFDcEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBd0QsZ0JBQWdCLG1C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Q3pDLGFBQUssZ0JBQWdCLHFCQUFxQixZQUFZLE9BQU87QUFBQSxNQUM5RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLDZCQUE2QjtBQUNwQyxRQUFJLENBQUMsS0FBSyxrQkFBa0IsT0FBTztBQUNsQyxXQUFLLGtCQUFrQixRQUFRLEtBQUssY0FBYywwQkFBMEIsT0FBSztBQUNoRixZQUFJLEVBQUUsT0FBTyxvQkFBb0IsRUFBRSxTQUFTO0FBQzNDLGVBQUssWUFBWTtBQUNqQixjQUFJLEtBQUssbUJBQW1CO0FBQzNCLGlCQUFLLGtCQUFrQixRQUFRO0FBQUEsVUFDaEM7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxzQkFBc0IsaUNBQTBDO0FBQ3ZFLFFBQUksQ0FBQyxpQ0FBaUM7QUFDckMsV0FBSywyQkFBMkI7QUFBQSxJQUNqQztBQUVBLFFBQUksQ0FBQyxLQUFLLDJCQUEyQixPQUFPO0FBQzNDLFdBQUssMkJBQTJCLFFBQVEsS0FBSyx1QkFBdUIscUJBQXFCLE9BQUs7QUFDN0YsWUFBSSxFQUFFLE1BQU0sS0FBSyxVQUFRLEtBQUssT0FBTyxnQkFBZ0IsR0FBRztBQUN2RCxlQUFLLFlBQVk7QUFDakIsZUFBSywyQkFBMkI7QUFBQSxRQUNqQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFFQSxRQUFJLENBQUMsS0FBSyxtQ0FBbUMsT0FBTztBQUNuRCxXQUFLLG1DQUFtQyxRQUFRLEtBQUssdUJBQXVCLDZCQUE2QixPQUFLO0FBQzdHLGNBQU0sb0JBQW9CLEtBQUssdUJBQXVCLHlCQUF5QixnQkFBZ0I7QUFDL0YsWUFBSSxFQUFFLGNBQWMsT0FBTyxtQkFBbUIsSUFBSTtBQUNqRCxlQUFLLFlBQVk7QUFDakIsZUFBSywyQkFBMkI7QUFBQSxRQUNqQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFUSxXQUFXLFFBQWdCO0FBQ2xDLFFBQUksQ0FBQyxLQUFLLFVBQVUsSUFBSSxNQUFNLEdBQUc7QUFDaEMsWUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsSUFDbEM7QUFDQSxXQUFPLEtBQUssVUFBVSxJQUFJLE1BQU07QUFBQSxFQUNqQztBQUNEO0FBaFFhLHFCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxrQkFBa0I7QUFBQSxFQWdCakQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcEJVOyIsCiAgIm5hbWVzIjogWyJ0aHJlYWQiLCAiY29tbWVudCJdCn0K
