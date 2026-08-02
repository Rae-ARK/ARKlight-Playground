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
import { asPromise } from "../../../base/common/async.js";
import { debounce } from "../../../base/common/decorators.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { URI } from "../../../base/common/uri.js";
import * as languages from "../../../editor/common/languages.js";
import { ExtensionIdentifierMap } from "../../../platform/extensions/common/extensions.js";
import * as extHostTypeConverter from "./extHostTypeConverters.js";
import * as types from "./extHostTypes.js";
import { MainContext } from "./extHost.protocol.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
function createExtHostComments(mainContext, commands, documents) {
  const proxy = mainContext.getProxy(MainContext.MainThreadComments);
  const _ExtHostCommentsImpl = class _ExtHostCommentsImpl {
    constructor() {
      this._commentControllers = /* @__PURE__ */ new Map();
      this._commentControllersByExtension = new ExtensionIdentifierMap();
      commands.registerArgumentProcessor({
        processArgument: (arg) => {
          if (arg && arg.$mid === MarshalledId.CommentController) {
            const commentController = this._commentControllers.get(arg.handle);
            if (!commentController) {
              return arg;
            }
            return commentController.value;
          } else if (arg && arg.$mid === MarshalledId.CommentThread) {
            const marshalledCommentThread = arg;
            const commentController = this._commentControllers.get(marshalledCommentThread.commentControlHandle);
            if (!commentController) {
              return marshalledCommentThread;
            }
            const commentThread = commentController.getCommentThread(marshalledCommentThread.commentThreadHandle);
            if (!commentThread) {
              return marshalledCommentThread;
            }
            return commentThread.value;
          } else if (arg && (arg.$mid === MarshalledId.CommentThreadReply || arg.$mid === MarshalledId.CommentThreadInstance)) {
            const commentController = this._commentControllers.get(arg.thread.commentControlHandle);
            if (!commentController) {
              return arg;
            }
            const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);
            if (!commentThread) {
              return arg;
            }
            if (arg.$mid === MarshalledId.CommentThreadInstance) {
              return commentThread.value;
            }
            return {
              thread: commentThread.value,
              text: arg.text
            };
          } else if (arg && arg.$mid === MarshalledId.CommentNode) {
            const commentController = this._commentControllers.get(arg.thread.commentControlHandle);
            if (!commentController) {
              return arg;
            }
            const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);
            if (!commentThread) {
              return arg;
            }
            const commentUniqueId = arg.commentUniqueId;
            const comment = commentThread.getCommentByUniqueId(commentUniqueId);
            if (!comment) {
              return arg;
            }
            return comment;
          } else if (arg && arg.$mid === MarshalledId.CommentThreadNode) {
            const commentController = this._commentControllers.get(arg.thread.commentControlHandle);
            if (!commentController) {
              return arg;
            }
            const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);
            if (!commentThread) {
              return arg;
            }
            const body = arg.text;
            const commentUniqueId = arg.commentUniqueId;
            const comment = commentThread.getCommentByUniqueId(commentUniqueId);
            if (!comment) {
              return arg;
            }
            if (typeof comment.body === "string") {
              comment.body = body;
            } else {
              comment.body = new types.MarkdownString(body);
            }
            return comment;
          }
          return arg;
        }
      });
    }
    createCommentController(extension, id, label) {
      const handle = _ExtHostCommentsImpl.handlePool++;
      const commentController = new ExtHostCommentController(extension, handle, id, label);
      this._commentControllers.set(commentController.handle, commentController);
      const commentControllers = this._commentControllersByExtension.get(extension.identifier) || [];
      commentControllers.push(commentController);
      this._commentControllersByExtension.set(extension.identifier, commentControllers);
      return commentController.value;
    }
    async $createCommentThreadTemplate(commentControllerHandle, uriComponents, range, editorId) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController) {
        return;
      }
      commentController.$createCommentThreadTemplate(uriComponents, range, editorId);
    }
    async $setActiveComment(controllerHandle, commentInfo) {
      const commentController = this._commentControllers.get(controllerHandle);
      if (!commentController) {
        return;
      }
      commentController.$setActiveComment(commentInfo ?? void 0);
    }
    async $updateCommentThreadTemplate(commentControllerHandle, threadHandle, range) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController) {
        return;
      }
      commentController.$updateCommentThreadTemplate(threadHandle, range);
    }
    $deleteCommentThread(commentControllerHandle, commentThreadHandle) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      commentController?.$deleteCommentThread(commentThreadHandle);
    }
    async $updateCommentThread(commentControllerHandle, commentThreadHandle, changes) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      commentController?.$updateCommentThread(commentThreadHandle, changes);
    }
    async $provideCommentingRanges(commentControllerHandle, uriComponents, token) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController || !commentController.commentingRangeProvider) {
        return Promise.resolve(void 0);
      }
      const document = await documents.ensureDocumentData(URI.revive(uriComponents));
      return asPromise(async () => {
        const rangesResult = await commentController.commentingRangeProvider?.provideCommentingRanges(document.document, token);
        let ranges;
        if (Array.isArray(rangesResult)) {
          ranges = {
            ranges: rangesResult,
            fileComments: false
          };
        } else if (rangesResult) {
          ranges = {
            ranges: rangesResult.ranges || [],
            fileComments: rangesResult.enableFileComments || false
          };
        } else {
          ranges = rangesResult ?? void 0;
        }
        return ranges;
      }).then((ranges) => {
        let convertedResult = void 0;
        if (ranges) {
          convertedResult = {
            ranges: ranges.ranges.map((x) => extHostTypeConverter.Range.from(x)),
            fileComments: ranges.fileComments
          };
        }
        return convertedResult;
      });
    }
    $toggleReaction(commentControllerHandle, threadHandle, uri, comment, reaction) {
      const commentController = this._commentControllers.get(commentControllerHandle);
      if (!commentController || !commentController.reactionHandler) {
        return Promise.resolve(void 0);
      }
      return asPromise(() => {
        const commentThread = commentController.getCommentThread(threadHandle);
        if (commentThread) {
          const vscodeComment = commentThread.getCommentByUniqueId(comment.uniqueIdInThread);
          if (commentController !== void 0 && vscodeComment) {
            if (commentController.reactionHandler) {
              return commentController.reactionHandler(vscodeComment, convertFromReaction(reaction));
            }
          }
        }
        return Promise.resolve(void 0);
      });
    }
  };
  _ExtHostCommentsImpl.handlePool = 0;
  let ExtHostCommentsImpl = _ExtHostCommentsImpl;
  const _ExtHostCommentThread = class _ExtHostCommentThread {
    constructor(commentControllerId, _commentControllerHandle, _id, _uri, _range, _comments, extensionDescription, _isTemplate, editorId) {
      this._commentControllerHandle = _commentControllerHandle;
      this._id = _id;
      this._uri = _uri;
      this._range = _range;
      this._comments = _comments;
      this.extensionDescription = extensionDescription;
      this._isTemplate = _isTemplate;
      this.handle = _ExtHostCommentThread._handlePool++;
      this.commentHandle = 0;
      this.modifications = /* @__PURE__ */ Object.create(null);
      this._onDidUpdateCommentThread = new Emitter();
      this.onDidUpdateCommentThread = this._onDidUpdateCommentThread.event;
      this._canReply = true;
      this._commentsMap = /* @__PURE__ */ new Map();
      this._acceptInputDisposables = new MutableDisposable();
      this._acceptInputDisposables.value = new DisposableStore();
      if (this._id === void 0) {
        this._id = `${commentControllerId}.${this.handle}`;
      }
      proxy.$createCommentThread(
        _commentControllerHandle,
        this.handle,
        this._id,
        this._uri,
        extHostTypeConverter.Range.from(this._range),
        this._comments.map((cmt) => convertToDTOComment(this, cmt, this._commentsMap, this.extensionDescription)),
        extensionDescription.identifier,
        this._isTemplate,
        editorId
      );
      this._localDisposables = [];
      this._isDiposed = false;
      this._localDisposables.push(this.onDidUpdateCommentThread(() => {
        this.eventuallyUpdateCommentThread();
      }));
      this._localDisposables.push({
        dispose: () => {
          proxy.$deleteCommentThread(
            _commentControllerHandle,
            this.handle
          );
        }
      });
      const that = this;
      this.value = {
        get uri() {
          return that.uri;
        },
        get range() {
          return that.range;
        },
        set range(value) {
          that.range = value;
        },
        get comments() {
          return that.comments;
        },
        set comments(value) {
          that.comments = value;
        },
        get collapsibleState() {
          return that.collapsibleState;
        },
        set collapsibleState(value) {
          that.collapsibleState = value;
        },
        get canReply() {
          return that.canReply;
        },
        set canReply(state) {
          that.canReply = state;
        },
        get contextValue() {
          return that.contextValue;
        },
        set contextValue(value) {
          that.contextValue = value;
        },
        get label() {
          return that.label;
        },
        set label(value) {
          that.label = value;
        },
        get state() {
          return that.state;
        },
        set state(value) {
          that.state = value;
        },
        reveal: (comment, options) => that.reveal(comment, options),
        hide: () => that.hide(),
        dispose: () => {
          that.dispose();
        }
      };
    }
    set threadId(id) {
      this._id = id;
    }
    get threadId() {
      return this._id;
    }
    get id() {
      return this._id;
    }
    get resource() {
      return this._uri;
    }
    get uri() {
      return this._uri;
    }
    set range(range) {
      if (range === void 0 !== (this._range === void 0) || (!range || !this._range || !range.isEqual(this._range))) {
        this._range = range;
        this.modifications.range = range;
        this._onDidUpdateCommentThread.fire();
      }
    }
    get range() {
      return this._range;
    }
    set canReply(state) {
      if (this._canReply !== state) {
        this._canReply = state;
        this.modifications.canReply = state;
        this._onDidUpdateCommentThread.fire();
      }
    }
    get canReply() {
      return this._canReply;
    }
    get label() {
      return this._label;
    }
    set label(label) {
      this._label = label;
      this.modifications.label = label;
      this._onDidUpdateCommentThread.fire();
    }
    get contextValue() {
      return this._contextValue;
    }
    set contextValue(context) {
      this._contextValue = context;
      this.modifications.contextValue = context;
      this._onDidUpdateCommentThread.fire();
    }
    get comments() {
      return this._comments;
    }
    set comments(newComments) {
      this._comments = newComments;
      this.modifications.comments = newComments;
      this._onDidUpdateCommentThread.fire();
    }
    get collapsibleState() {
      return this._collapseState;
    }
    set collapsibleState(newState) {
      if (this._collapseState === newState) {
        return;
      }
      this._collapseState = newState;
      this.modifications.collapsibleState = newState;
      this._onDidUpdateCommentThread.fire();
    }
    get state() {
      return this._state;
    }
    set state(newState) {
      this._state = newState;
      if (typeof newState === "object") {
        checkProposedApiEnabled(this.extensionDescription, "commentThreadApplicability");
        this.modifications.state = newState.resolved;
        this.modifications.applicability = newState.applicability;
      } else {
        this.modifications.state = newState;
      }
      this._onDidUpdateCommentThread.fire();
    }
    get isDisposed() {
      return this._isDiposed;
    }
    updateIsTemplate() {
      if (this._isTemplate) {
        this._isTemplate = false;
        this.modifications.isTemplate = false;
      }
    }
    eventuallyUpdateCommentThread() {
      if (this._isDiposed) {
        return;
      }
      this.updateIsTemplate();
      if (!this._acceptInputDisposables.value) {
        this._acceptInputDisposables.value = new DisposableStore();
      }
      const modified = (value) => Object.prototype.hasOwnProperty.call(this.modifications, value);
      const formattedModifications = {};
      if (modified("range")) {
        formattedModifications.range = extHostTypeConverter.Range.from(this._range);
      }
      if (modified("label")) {
        formattedModifications.label = this.label;
      }
      if (modified("contextValue")) {
        formattedModifications.contextValue = this.contextValue ?? null;
      }
      if (modified("comments")) {
        formattedModifications.comments = this._comments.map((cmt) => convertToDTOComment(this, cmt, this._commentsMap, this.extensionDescription));
      }
      if (modified("collapsibleState")) {
        formattedModifications.collapseState = convertToCollapsibleState(this._collapseState);
      }
      if (modified("canReply")) {
        formattedModifications.canReply = this.canReply;
      }
      if (modified("state")) {
        formattedModifications.state = convertToState(this._state);
      }
      if (modified("applicability")) {
        formattedModifications.applicability = convertToRelevance(this._state);
      }
      if (modified("isTemplate")) {
        formattedModifications.isTemplate = this._isTemplate;
      }
      this.modifications = {};
      proxy.$updateCommentThread(
        this._commentControllerHandle,
        this.handle,
        this._id,
        this._uri,
        formattedModifications
      );
    }
    getCommentByUniqueId(uniqueId) {
      for (const key of this._commentsMap) {
        const comment = key[0];
        const id = key[1];
        if (uniqueId === id) {
          return comment;
        }
      }
      return;
    }
    async reveal(commentOrOptions, options) {
      checkProposedApiEnabled(this.extensionDescription, "commentReveal");
      let comment;
      if (commentOrOptions && commentOrOptions.body !== void 0) {
        comment = commentOrOptions;
      } else {
        options = options ?? commentOrOptions;
      }
      let commentToReveal = comment ? this._commentsMap.get(comment) : void 0;
      commentToReveal ??= this._commentsMap.get(this._comments[0]);
      let preserveFocus = true;
      let focusReply = false;
      if (options?.focus === types.CommentThreadFocus.Reply) {
        focusReply = true;
        preserveFocus = false;
      } else if (options?.focus === types.CommentThreadFocus.Comment) {
        preserveFocus = false;
      }
      return proxy.$revealCommentThread(this._commentControllerHandle, this.handle, commentToReveal, { preserveFocus, focusReply });
    }
    async hide() {
      return proxy.$hideCommentThread(this._commentControllerHandle, this.handle);
    }
    dispose() {
      this._isDiposed = true;
      this._acceptInputDisposables.dispose();
      this._onDidUpdateCommentThread.dispose();
      this._localDisposables.forEach((disposable) => disposable.dispose());
    }
  };
  _ExtHostCommentThread._handlePool = 0;
  __decorateClass([
    debounce(100)
  ], _ExtHostCommentThread.prototype, "eventuallyUpdateCommentThread", 1);
  let ExtHostCommentThread = _ExtHostCommentThread;
  class ExtHostCommentController {
    constructor(_extension, _handle, _id, _label) {
      this._extension = _extension;
      this._handle = _handle;
      this._id = _id;
      this._label = _label;
      this._threads = /* @__PURE__ */ new Map();
      proxy.$registerCommentController(this.handle, _id, _label, this._extension.identifier.value);
      const that = this;
      this.value = Object.freeze({
        id: that.id,
        label: that.label,
        get options() {
          return that.options;
        },
        set options(options) {
          that.options = options;
        },
        get commentingRangeProvider() {
          return that.commentingRangeProvider;
        },
        set commentingRangeProvider(commentingRangeProvider) {
          that.commentingRangeProvider = commentingRangeProvider;
        },
        get reactionHandler() {
          return that.reactionHandler;
        },
        set reactionHandler(handler) {
          that.reactionHandler = handler;
        },
        // get activeComment(): vscode.Comment | undefined { return that.activeComment; },
        get activeCommentThread() {
          return that.activeCommentThread;
        },
        createCommentThread(uri, range, comments) {
          return that.createCommentThread(uri, range, comments).value;
        },
        dispose: () => {
          that.dispose();
        }
      });
      this._localDisposables = [];
      this._localDisposables.push({
        dispose: () => {
          proxy.$unregisterCommentController(this.handle);
        }
      });
    }
    get id() {
      return this._id;
    }
    get label() {
      return this._label;
    }
    get handle() {
      return this._handle;
    }
    get commentingRangeProvider() {
      return this._commentingRangeProvider;
    }
    set commentingRangeProvider(provider) {
      this._commentingRangeProvider = provider;
      if (provider?.resourceHints) {
        checkProposedApiEnabled(this._extension, "commentingRangeHint");
      }
      proxy.$updateCommentingRanges(this.handle, provider?.resourceHints);
    }
    get reactionHandler() {
      return this._reactionHandler;
    }
    set reactionHandler(handler) {
      this._reactionHandler = handler;
      proxy.$updateCommentControllerFeatures(this.handle, { reactionHandler: !!handler });
    }
    get options() {
      return this._options;
    }
    set options(options) {
      this._options = options;
      proxy.$updateCommentControllerFeatures(this.handle, { options: this._options });
    }
    get activeComment() {
      checkProposedApiEnabled(this._extension, "activeComment");
      return this._activeComment;
    }
    get activeCommentThread() {
      checkProposedApiEnabled(this._extension, "activeComment");
      return this._activeThread?.value;
    }
    createCommentThread(resource, range, comments) {
      const commentThread = new ExtHostCommentThread(this.id, this.handle, void 0, resource, range, comments, this._extension, false);
      this._threads.set(commentThread.handle, commentThread);
      return commentThread;
    }
    $setActiveComment(commentInfo) {
      if (!commentInfo) {
        this._activeComment = void 0;
        this._activeThread = void 0;
        return;
      }
      const thread = this._threads.get(commentInfo.commentThreadHandle);
      if (thread) {
        this._activeComment = commentInfo.uniqueIdInThread ? thread.getCommentByUniqueId(commentInfo.uniqueIdInThread) : void 0;
        this._activeThread = thread;
      }
    }
    $createCommentThreadTemplate(uriComponents, range, editorId) {
      const commentThread = new ExtHostCommentThread(this.id, this.handle, void 0, URI.revive(uriComponents), extHostTypeConverter.Range.to(range), [], this._extension, true, editorId);
      commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
      this._threads.set(commentThread.handle, commentThread);
      return commentThread;
    }
    $updateCommentThreadTemplate(threadHandle, range) {
      const thread = this._threads.get(threadHandle);
      if (thread) {
        thread.range = extHostTypeConverter.Range.to(range);
      }
    }
    $updateCommentThread(threadHandle, changes) {
      const thread = this._threads.get(threadHandle);
      if (!thread) {
        return;
      }
      const modified = (value) => Object.prototype.hasOwnProperty.call(changes, value);
      if (modified("collapseState")) {
        thread.collapsibleState = convertToCollapsibleState(changes.collapseState);
      }
    }
    $deleteCommentThread(threadHandle) {
      const thread = this._threads.get(threadHandle);
      thread?.dispose();
      this._threads.delete(threadHandle);
    }
    getCommentThread(handle) {
      return this._threads.get(handle);
    }
    dispose() {
      this._threads.forEach((value) => {
        value.dispose();
      });
      this._localDisposables.forEach((disposable) => disposable.dispose());
    }
  }
  function convertToDTOComment(thread, vscodeComment, commentsMap, extension) {
    let commentUniqueId = commentsMap.get(vscodeComment);
    if (!commentUniqueId) {
      commentUniqueId = ++thread.commentHandle;
      commentsMap.set(vscodeComment, commentUniqueId);
    }
    if (vscodeComment.state !== void 0) {
      checkProposedApiEnabled(extension, "commentsDraftState");
    }
    if (vscodeComment.reactions?.some((reaction) => reaction.reactors !== void 0)) {
      checkProposedApiEnabled(extension, "commentReactor");
    }
    return {
      mode: vscodeComment.mode,
      contextValue: vscodeComment.contextValue,
      uniqueIdInThread: commentUniqueId,
      body: typeof vscodeComment.body === "string" ? vscodeComment.body : extHostTypeConverter.MarkdownString.from(vscodeComment.body),
      userName: vscodeComment.author.name,
      userIconPath: vscodeComment.author.iconPath,
      label: vscodeComment.label,
      commentReactions: vscodeComment.reactions ? vscodeComment.reactions.map((reaction) => convertToReaction(reaction)) : void 0,
      state: vscodeComment.state,
      timestamp: vscodeComment.timestamp?.toJSON()
    };
  }
  function convertToReaction(reaction) {
    return {
      label: reaction.label,
      iconPath: reaction.iconPath ? extHostTypeConverter.pathOrURIToURI(reaction.iconPath) : void 0,
      count: reaction.count,
      hasReacted: reaction.authorHasReacted,
      reactors: reaction.reactors && reaction.reactors.length > 0 && typeof reaction.reactors[0] !== "string" ? reaction.reactors.map((reactor) => reactor.name) : reaction.reactors
    };
  }
  function convertFromReaction(reaction) {
    return {
      label: reaction.label || "",
      count: reaction.count || 0,
      iconPath: reaction.iconPath ? URI.revive(reaction.iconPath) : "",
      authorHasReacted: reaction.hasReacted || false,
      reactors: reaction.reactors?.map((reactor) => ({ name: reactor }))
    };
  }
  function convertToCollapsibleState(kind) {
    if (kind !== void 0) {
      switch (kind) {
        case types.CommentThreadCollapsibleState.Expanded:
          return languages.CommentThreadCollapsibleState.Expanded;
        case types.CommentThreadCollapsibleState.Collapsed:
          return languages.CommentThreadCollapsibleState.Collapsed;
      }
    }
    return languages.CommentThreadCollapsibleState.Collapsed;
  }
  function convertToState(kind) {
    let resolvedKind;
    if (typeof kind === "object") {
      resolvedKind = kind.resolved;
    } else {
      resolvedKind = kind;
    }
    if (resolvedKind !== void 0) {
      switch (resolvedKind) {
        case types.CommentThreadState.Unresolved:
          return languages.CommentThreadState.Unresolved;
        case types.CommentThreadState.Resolved:
          return languages.CommentThreadState.Resolved;
      }
    }
    return languages.CommentThreadState.Unresolved;
  }
  function convertToRelevance(kind) {
    let applicabilityKind = void 0;
    if (typeof kind === "object") {
      applicabilityKind = kind.applicability;
    }
    if (applicabilityKind !== void 0) {
      switch (applicabilityKind) {
        case types.CommentThreadApplicability.Current:
          return languages.CommentThreadApplicability.Current;
        case types.CommentThreadApplicability.Outdated:
          return languages.CommentThreadApplicability.Outdated;
      }
    }
    return languages.CommentThreadApplicability.Current;
  }
  return new ExtHostCommentsImpl();
}
export {
  createExtHostComments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDb21tZW50cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVDb252ZXJ0ZXIgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV4dEhvc3RDb21tZW50c1NoYXBlLCBJTWFpbkNvbnRleHQsIE1haW5Db250ZXh0LCBDb21tZW50VGhyZWFkQ2hhbmdlcywgQ29tbWVudENoYW5nZXMgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRDb21tZW50VGhyZWFkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbW1lbnRzLmpzJztcblxudHlwZSBQcm92aWRlckhhbmRsZSA9IG51bWJlcjtcblxuaW50ZXJmYWNlIEV4dEhvc3RDb21tZW50cyB7XG5cdGNyZWF0ZUNvbW1lbnRDb250cm9sbGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogdnNjb2RlLkNvbW1lbnRDb250cm9sbGVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXh0SG9zdENvbW1lbnRzKG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsIGNvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMsIGRvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyk6IEV4dEhvc3RDb21tZW50c1NoYXBlICYgRXh0SG9zdENvbW1lbnRzIHtcblx0Y29uc3QgcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkQ29tbWVudHMpO1xuXG5cdGNsYXNzIEV4dEhvc3RDb21tZW50c0ltcGwgaW1wbGVtZW50cyBFeHRIb3N0Q29tbWVudHNTaGFwZSwgRXh0SG9zdENvbW1lbnRzIHtcblxuXHRcdHByaXZhdGUgc3RhdGljIGhhbmRsZVBvb2wgPSAwO1xuXG5cblx0XHRwcml2YXRlIF9jb21tZW50Q29udHJvbGxlcnM6IE1hcDxQcm92aWRlckhhbmRsZSwgRXh0SG9zdENvbW1lbnRDb250cm9sbGVyPiA9IG5ldyBNYXA8UHJvdmlkZXJIYW5kbGUsIEV4dEhvc3RDb21tZW50Q29udHJvbGxlcj4oKTtcblxuXHRcdHByaXZhdGUgX2NvbW1lbnRDb250cm9sbGVyc0J5RXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dEhvc3RDb21tZW50Q29udHJvbGxlcltdPiA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dEhvc3RDb21tZW50Q29udHJvbGxlcltdPigpO1xuXG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHQpIHtcblx0XHRcdGNvbW1hbmRzLnJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3Ioe1xuXHRcdFx0XHRwcm9jZXNzQXJndW1lbnQ6IGFyZyA9PiB7XG5cdFx0XHRcdFx0aWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoYXJnLmhhbmRsZSk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1lbnRDb250cm9sbGVyLnZhbHVlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYXJnICYmIGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWFyc2hhbGxlZENvbW1lbnRUaHJlYWQ6IE1hcnNoYWxsZWRDb21tZW50VGhyZWFkID0gYXJnO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KG1hcnNoYWxsZWRDb21tZW50VGhyZWFkLmNvbW1lbnRDb250cm9sSGFuZGxlKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjb21tZW50Q29udHJvbGxlcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbWFyc2hhbGxlZENvbW1lbnRUaHJlYWQ7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSBjb21tZW50Q29udHJvbGxlci5nZXRDb21tZW50VGhyZWFkKG1hcnNoYWxsZWRDb21tZW50VGhyZWFkLmNvbW1lbnRUaHJlYWRIYW5kbGUpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1lbnRUaHJlYWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG1hcnNoYWxsZWRDb21tZW50VGhyZWFkO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gY29tbWVudFRocmVhZC52YWx1ZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGFyZyAmJiAoYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkUmVwbHkgfHwgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkSW5zdGFuY2UpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoYXJnLnRocmVhZC5jb21tZW50Q29udHJvbEhhbmRsZSk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudFRocmVhZCA9IGNvbW1lbnRDb250cm9sbGVyLmdldENvbW1lbnRUaHJlYWQoYXJnLnRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjb21tZW50VGhyZWFkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkNvbW1lbnRUaHJlYWRJbnN0YW5jZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY29tbWVudFRocmVhZC52YWx1ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dGhyZWFkOiBjb21tZW50VGhyZWFkLnZhbHVlLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBhcmcudGV4dFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkNvbW1lbnROb2RlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoYXJnLnRocmVhZC5jb21tZW50Q29udHJvbEhhbmRsZSk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWVudFRocmVhZCA9IGNvbW1lbnRDb250cm9sbGVyLmdldENvbW1lbnRUaHJlYWQoYXJnLnRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjb21tZW50VGhyZWFkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1lbnRVbmlxdWVJZCA9IGFyZy5jb21tZW50VW5pcXVlSWQ7XG5cblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1lbnQgPSBjb21tZW50VGhyZWFkLmdldENvbW1lbnRCeVVuaXF1ZUlkKGNvbW1lbnRVbmlxdWVJZCk7XG5cblx0XHRcdFx0XHRcdGlmICghY29tbWVudCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gY29tbWVudDtcblxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYXJnICYmIGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZE5vZGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChhcmcudGhyZWFkLmNvbW1lbnRDb250cm9sSGFuZGxlKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjb21tZW50Q29udHJvbGxlcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50VGhyZWFkID0gY29tbWVudENvbnRyb2xsZXIuZ2V0Q29tbWVudFRocmVhZChhcmcudGhyZWFkLmNvbW1lbnRUaHJlYWRIYW5kbGUpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1lbnRUaHJlYWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgYm9keTogc3RyaW5nID0gYXJnLnRleHQ7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50VW5pcXVlSWQgPSBhcmcuY29tbWVudFVuaXF1ZUlkO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBjb21tZW50ID0gY29tbWVudFRocmVhZC5nZXRDb21tZW50QnlVbmlxdWVJZChjb21tZW50VW5pcXVlSWQpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIG9sZCBjb21tZW50IGJvZHkgd2FzIGEgbWFya2Rvd24gc3RyaW5nLCB1c2UgYSBtYXJrZG93biBzdHJpbmcgaGVyZSB0b28uXG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGNvbW1lbnQuYm9keSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0Y29tbWVudC5ib2R5ID0gYm9keTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQuYm9keSA9IG5ldyB0eXBlcy5NYXJrZG93blN0cmluZyhib2R5KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBjb21tZW50O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNyZWF0ZUNvbW1lbnRDb250cm9sbGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogdnNjb2RlLkNvbW1lbnRDb250cm9sbGVyIHtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IEV4dEhvc3RDb21tZW50c0ltcGwuaGFuZGxlUG9vbCsrO1xuXHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSBuZXcgRXh0SG9zdENvbW1lbnRDb250cm9sbGVyKGV4dGVuc2lvbiwgaGFuZGxlLCBpZCwgbGFiZWwpO1xuXHRcdFx0dGhpcy5fY29tbWVudENvbnRyb2xsZXJzLnNldChjb21tZW50Q29udHJvbGxlci5oYW5kbGUsIGNvbW1lbnRDb250cm9sbGVyKTtcblxuXHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXJzID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzQnlFeHRlbnNpb24uZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKSB8fCBbXTtcblx0XHRcdGNvbW1lbnRDb250cm9sbGVycy5wdXNoKGNvbW1lbnRDb250cm9sbGVyKTtcblx0XHRcdHRoaXMuX2NvbW1lbnRDb250cm9sbGVyc0J5RXh0ZW5zaW9uLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgY29tbWVudENvbnRyb2xsZXJzKTtcblxuXHRcdFx0cmV0dXJuIGNvbW1lbnRDb250cm9sbGVyLnZhbHVlO1xuXHRcdH1cblxuXHRcdGFzeW5jICRjcmVhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUoY29tbWVudENvbnRyb2xsZXJIYW5kbGU6IG51bWJlciwgdXJpQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCwgZWRpdG9ySWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChjb21tZW50Q29udHJvbGxlckhhbmRsZSk7XG5cblx0XHRcdGlmICghY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb21tZW50Q29udHJvbGxlci4kY3JlYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHVyaUNvbXBvbmVudHMsIHJhbmdlLCBlZGl0b3JJZCk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgJHNldEFjdGl2ZUNvbW1lbnQoY29udHJvbGxlckhhbmRsZTogbnVtYmVyLCBjb21tZW50SW5mbzogeyBjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXI7IHVuaXF1ZUlkSW5UaHJlYWQ/OiBudW1iZXIgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGNvbnRyb2xsZXJIYW5kbGUpO1xuXG5cdFx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29tbWVudENvbnRyb2xsZXIuJHNldEFjdGl2ZUNvbW1lbnQoY29tbWVudEluZm8gPz8gdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRhc3luYyAkdXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKGNvbW1lbnRDb250cm9sbGVySGFuZGxlOiBudW1iZXIsIHRocmVhZEhhbmRsZTogbnVtYmVyLCByYW5nZTogSVJhbmdlKSB7XG5cdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoY29tbWVudENvbnRyb2xsZXJIYW5kbGUpO1xuXG5cdFx0XHRpZiAoIWNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29tbWVudENvbnRyb2xsZXIuJHVwZGF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZSh0aHJlYWRIYW5kbGUsIHJhbmdlKTtcblx0XHR9XG5cblx0XHQkZGVsZXRlQ29tbWVudFRocmVhZChjb21tZW50Q29udHJvbGxlckhhbmRsZTogbnVtYmVyLCBjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIpIHtcblx0XHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5fY29tbWVudENvbnRyb2xsZXJzLmdldChjb21tZW50Q29udHJvbGxlckhhbmRsZSk7XG5cblx0XHRcdGNvbW1lbnRDb250cm9sbGVyPy4kZGVsZXRlQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkSGFuZGxlKTtcblx0XHR9XG5cblx0XHRhc3luYyAkdXBkYXRlQ29tbWVudFRocmVhZChjb21tZW50Q29udHJvbGxlckhhbmRsZTogbnVtYmVyLCBjb21tZW50VGhyZWFkSGFuZGxlOiBudW1iZXIsIGNoYW5nZXM6IENvbW1lbnRUaHJlYWRDaGFuZ2VzKSB7XG5cdFx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuX2NvbW1lbnRDb250cm9sbGVycy5nZXQoY29tbWVudENvbnRyb2xsZXJIYW5kbGUpO1xuXG5cdFx0XHRjb21tZW50Q29udHJvbGxlcj8uJHVwZGF0ZUNvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZEhhbmRsZSwgY2hhbmdlcyk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgJHByb3ZpZGVDb21tZW50aW5nUmFuZ2VzKGNvbW1lbnRDb250cm9sbGVySGFuZGxlOiBudW1iZXIsIHVyaUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyByYW5nZXM6IElSYW5nZVtdOyBmaWxlQ29tbWVudHM6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGNvbW1lbnRDb250cm9sbGVySGFuZGxlKTtcblxuXHRcdFx0aWYgKCFjb21tZW50Q29udHJvbGxlciB8fCAhY29tbWVudENvbnRyb2xsZXIuY29tbWVudGluZ1JhbmdlUHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkb2N1bWVudCA9IGF3YWl0IGRvY3VtZW50cy5lbnN1cmVEb2N1bWVudERhdGEoVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKSk7XG5cdFx0XHRyZXR1cm4gYXNQcm9taXNlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmFuZ2VzUmVzdWx0ID0gYXdhaXQgY29tbWVudENvbnRyb2xsZXIuY29tbWVudGluZ1JhbmdlUHJvdmlkZXI/LnByb3ZpZGVDb21tZW50aW5nUmFuZ2VzKGRvY3VtZW50LmRvY3VtZW50LCB0b2tlbik7XG5cdFx0XHRcdGxldCByYW5nZXM6IHsgcmFuZ2VzOiB2c2NvZGUuUmFuZ2VbXTsgZmlsZUNvbW1lbnRzOiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHJhbmdlc1Jlc3VsdCkpIHtcblx0XHRcdFx0XHRyYW5nZXMgPSB7XG5cdFx0XHRcdFx0XHRyYW5nZXM6IHJhbmdlc1Jlc3VsdCxcblx0XHRcdFx0XHRcdGZpbGVDb21tZW50czogZmFsc2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJhbmdlc1Jlc3VsdCkge1xuXHRcdFx0XHRcdHJhbmdlcyA9IHtcblx0XHRcdFx0XHRcdHJhbmdlczogcmFuZ2VzUmVzdWx0LnJhbmdlcyB8fCBbXSxcblx0XHRcdFx0XHRcdGZpbGVDb21tZW50czogcmFuZ2VzUmVzdWx0LmVuYWJsZUZpbGVDb21tZW50cyB8fCBmYWxzZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmFuZ2VzID0gcmFuZ2VzUmVzdWx0ID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmFuZ2VzO1xuXHRcdFx0fSkudGhlbihyYW5nZXMgPT4ge1xuXHRcdFx0XHRsZXQgY29udmVydGVkUmVzdWx0OiB7IHJhbmdlczogSVJhbmdlW107IGZpbGVDb21tZW50czogYm9vbGVhbiB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocmFuZ2VzKSB7XG5cdFx0XHRcdFx0Y29udmVydGVkUmVzdWx0ID0ge1xuXHRcdFx0XHRcdFx0cmFuZ2VzOiByYW5nZXMucmFuZ2VzLm1hcCh4ID0+IGV4dEhvc3RUeXBlQ29udmVydGVyLlJhbmdlLmZyb20oeCkpLFxuXHRcdFx0XHRcdFx0ZmlsZUNvbW1lbnRzOiByYW5nZXMuZmlsZUNvbW1lbnRzXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29udmVydGVkUmVzdWx0O1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0JHRvZ2dsZVJlYWN0aW9uKGNvbW1lbnRDb250cm9sbGVySGFuZGxlOiBudW1iZXIsIHRocmVhZEhhbmRsZTogbnVtYmVyLCB1cmk6IFVyaUNvbXBvbmVudHMsIGNvbW1lbnQ6IGxhbmd1YWdlcy5Db21tZW50LCByZWFjdGlvbjogbGFuZ3VhZ2VzLkNvbW1lbnRSZWFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY29tbWVudENvbnRyb2xsZXIgPSB0aGlzLl9jb21tZW50Q29udHJvbGxlcnMuZ2V0KGNvbW1lbnRDb250cm9sbGVySGFuZGxlKTtcblxuXHRcdFx0aWYgKCFjb21tZW50Q29udHJvbGxlciB8fCAhY29tbWVudENvbnRyb2xsZXIucmVhY3Rpb25IYW5kbGVyKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGFzUHJvbWlzZSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSBjb21tZW50Q29udHJvbGxlci5nZXRDb21tZW50VGhyZWFkKHRocmVhZEhhbmRsZSk7XG5cdFx0XHRcdGlmIChjb21tZW50VGhyZWFkKSB7XG5cdFx0XHRcdFx0Y29uc3QgdnNjb2RlQ29tbWVudCA9IGNvbW1lbnRUaHJlYWQuZ2V0Q29tbWVudEJ5VW5pcXVlSWQoY29tbWVudC51bmlxdWVJZEluVGhyZWFkKTtcblxuXHRcdFx0XHRcdGlmIChjb21tZW50Q29udHJvbGxlciAhPT0gdW5kZWZpbmVkICYmIHZzY29kZUNvbW1lbnQpIHtcblx0XHRcdFx0XHRcdGlmIChjb21tZW50Q29udHJvbGxlci5yZWFjdGlvbkhhbmRsZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1lbnRDb250cm9sbGVyLnJlYWN0aW9uSGFuZGxlcih2c2NvZGVDb21tZW50LCBjb252ZXJ0RnJvbVJlYWN0aW9uKHJlYWN0aW9uKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cdHR5cGUgQ29tbWVudFRocmVhZE1vZGlmaWNhdGlvbiA9IFBhcnRpYWw8e1xuXHRcdHJhbmdlOiB2c2NvZGUuUmFuZ2U7XG5cdFx0bGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb250ZXh0VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb21tZW50czogdnNjb2RlLkNvbW1lbnRbXTtcblx0XHRjb2xsYXBzaWJsZVN0YXRlOiB2c2NvZGUuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGU7XG5cdFx0Y2FuUmVwbHk6IGJvb2xlYW4gfCB2c2NvZGUuQ29tbWVudEF1dGhvckluZm9ybWF0aW9uO1xuXHRcdHN0YXRlOiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlO1xuXHRcdGlzVGVtcGxhdGU6IGJvb2xlYW47XG5cdFx0YXBwbGljYWJpbGl0eTogdnNjb2RlLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5O1xuXHR9PjtcblxuXHRjbGFzcyBFeHRIb3N0Q29tbWVudFRocmVhZCBpbXBsZW1lbnRzIHZzY29kZS5Db21tZW50VGhyZWFkMiB7XG5cdFx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cdFx0cmVhZG9ubHkgaGFuZGxlID0gRXh0SG9zdENvbW1lbnRUaHJlYWQuX2hhbmRsZVBvb2wrKztcblx0XHRwdWJsaWMgY29tbWVudEhhbmRsZTogbnVtYmVyID0gMDtcblxuXHRcdHByaXZhdGUgbW9kaWZpY2F0aW9uczogQ29tbWVudFRocmVhZE1vZGlmaWNhdGlvbiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHRzZXQgdGhyZWFkSWQoaWQ6IHN0cmluZykge1xuXHRcdFx0dGhpcy5faWQgPSBpZDtcblx0XHR9XG5cblx0XHRnZXQgdGhyZWFkSWQoKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiB0aGlzLl9pZCE7XG5cdFx0fVxuXG5cdFx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faWQhO1xuXHRcdH1cblxuXHRcdGdldCByZXNvdXJjZSgpOiB2c2NvZGUuVXJpIHtcblx0XHRcdHJldHVybiB0aGlzLl91cmk7XG5cdFx0fVxuXG5cdFx0Z2V0IHVyaSgpOiB2c2NvZGUuVXJpIHtcblx0XHRcdHJldHVybiB0aGlzLl91cmk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVcGRhdGVDb21tZW50VGhyZWFkID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRyZWFkb25seSBvbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWQgPSB0aGlzLl9vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWQuZXZlbnQ7XG5cblx0XHRzZXQgcmFuZ2UocmFuZ2U6IHZzY29kZS5SYW5nZSB8IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCgocmFuZ2UgPT09IHVuZGVmaW5lZCkgIT09ICh0aGlzLl9yYW5nZSA9PT0gdW5kZWZpbmVkKSkgfHwgKCFyYW5nZSB8fCAhdGhpcy5fcmFuZ2UgfHwgIXJhbmdlLmlzRXF1YWwodGhpcy5fcmFuZ2UpKSkge1xuXHRcdFx0XHR0aGlzLl9yYW5nZSA9IHJhbmdlO1xuXHRcdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMucmFuZ2UgPSByYW5nZTtcblx0XHRcdFx0dGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRnZXQgcmFuZ2UoKTogdnNjb2RlLlJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLl9yYW5nZTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9jYW5SZXBseTogYm9vbGVhbiB8IHZzY29kZS5Db21tZW50QXV0aG9ySW5mb3JtYXRpb24gPSB0cnVlO1xuXG5cdFx0c2V0IGNhblJlcGx5KHN0YXRlOiBib29sZWFuIHwgdnNjb2RlLkNvbW1lbnRBdXRob3JJbmZvcm1hdGlvbikge1xuXHRcdFx0aWYgKHRoaXMuX2NhblJlcGx5ICE9PSBzdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9jYW5SZXBseSA9IHN0YXRlO1xuXHRcdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMuY2FuUmVwbHkgPSBzdGF0ZTtcblx0XHRcdFx0dGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Z2V0IGNhblJlcGx5KCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NhblJlcGx5O1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRnZXQgbGFiZWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLl9sYWJlbDtcblx0XHR9XG5cblx0XHRzZXQgbGFiZWwobGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbGFiZWwgPSBsYWJlbDtcblx0XHRcdHRoaXMubW9kaWZpY2F0aW9ucy5sYWJlbCA9IGxhYmVsO1xuXHRcdFx0dGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkLmZpcmUoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9jb250ZXh0VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGdldCBjb250ZXh0VmFsdWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb250ZXh0VmFsdWU7XG5cdFx0fVxuXG5cdFx0c2V0IGNvbnRleHRWYWx1ZShjb250ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2NvbnRleHRWYWx1ZSA9IGNvbnRleHQ7XG5cdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMuY29udGV4dFZhbHVlID0gY29udGV4dDtcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0Z2V0IGNvbW1lbnRzKCk6IHZzY29kZS5Db21tZW50W10ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRzO1xuXHRcdH1cblxuXHRcdHNldCBjb21tZW50cyhuZXdDb21tZW50czogdnNjb2RlLkNvbW1lbnRbXSkge1xuXHRcdFx0dGhpcy5fY29tbWVudHMgPSBuZXdDb21tZW50cztcblx0XHRcdHRoaXMubW9kaWZpY2F0aW9ucy5jb21tZW50cyA9IG5ld0NvbW1lbnRzO1xuXHRcdFx0dGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkLmZpcmUoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9jb2xsYXBzZVN0YXRlPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlO1xuXG5cdFx0Z2V0IGNvbGxhcHNpYmxlU3RhdGUoKTogdnNjb2RlLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb2xsYXBzZVN0YXRlITtcblx0XHR9XG5cblx0XHRzZXQgY29sbGFwc2libGVTdGF0ZShuZXdTdGF0ZTogdnNjb2RlLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlKSB7XG5cdFx0XHRpZiAodGhpcy5fY29sbGFwc2VTdGF0ZSA9PT0gbmV3U3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29sbGFwc2VTdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0dGhpcy5tb2RpZmljYXRpb25zLmNvbGxhcHNpYmxlU3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfc3RhdGU/OiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlIHwgeyByZXNvbHZlZD86IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGU7IGFwcGxpY2FiaWxpdHk/OiB2c2NvZGUuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfTtcblxuXHRcdGdldCBzdGF0ZSgpOiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlIHwgeyByZXNvbHZlZD86IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGU7IGFwcGxpY2FiaWxpdHk/OiB2c2NvZGUuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkgfSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc3RhdGUhO1xuXHRcdH1cblxuXHRcdHNldCBzdGF0ZShuZXdTdGF0ZTogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHsgcmVzb2x2ZWQ/OiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlOyBhcHBsaWNhYmlsaXR5PzogdnNjb2RlLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IH0pIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHRpZiAodHlwZW9mIG5ld1N0YXRlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLmV4dGVuc2lvbkRlc2NyaXB0aW9uLCAnY29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHknKTtcblx0XHRcdFx0dGhpcy5tb2RpZmljYXRpb25zLnN0YXRlID0gbmV3U3RhdGUucmVzb2x2ZWQ7XG5cdFx0XHRcdHRoaXMubW9kaWZpY2F0aW9ucy5hcHBsaWNhYmlsaXR5ID0gbmV3U3RhdGUuYXBwbGljYWJpbGl0eTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubW9kaWZpY2F0aW9ucy5zdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRVcGRhdGVDb21tZW50VGhyZWFkLmZpcmUoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9sb2NhbERpc3Bvc2FibGVzOiB0eXBlcy5EaXNwb3NhYmxlW107XG5cblx0XHRwcml2YXRlIF9pc0RpcG9zZWQ6IGJvb2xlYW47XG5cblx0XHRwdWJsaWMgZ2V0IGlzRGlzcG9zZWQoKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faXNEaXBvc2VkO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2NvbW1lbnRzTWFwOiBNYXA8dnNjb2RlLkNvbW1lbnQsIG51bWJlcj4gPSBuZXcgTWFwPHZzY29kZS5Db21tZW50LCBudW1iZXI+KCk7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY2NlcHRJbnB1dERpc3Bvc2FibGVzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRcdHJlYWRvbmx5IHZhbHVlOiB2c2NvZGUuQ29tbWVudFRocmVhZDI7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdGNvbW1lbnRDb250cm9sbGVySWQ6IHN0cmluZyxcblx0XHRcdHByaXZhdGUgX2NvbW1lbnRDb250cm9sbGVySGFuZGxlOiBudW1iZXIsXG5cdFx0XHRwcml2YXRlIF9pZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdFx0cHJpdmF0ZSBfdXJpOiB2c2NvZGUuVXJpLFxuXHRcdFx0cHJpdmF0ZSBfcmFuZ2U6IHZzY29kZS5SYW5nZSB8IHVuZGVmaW5lZCxcblx0XHRcdHByaXZhdGUgX2NvbW1lbnRzOiB2c2NvZGUuQ29tbWVudFtdLFxuXHRcdFx0cHVibGljIHJlYWRvbmx5IGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHRwcml2YXRlIF9pc1RlbXBsYXRlOiBib29sZWFuLFxuXHRcdFx0ZWRpdG9ySWQ/OiBzdHJpbmdcblx0XHQpIHtcblx0XHRcdHRoaXMuX2FjY2VwdElucHV0RGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGlmICh0aGlzLl9pZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2lkID0gYCR7Y29tbWVudENvbnRyb2xsZXJJZH0uJHt0aGlzLmhhbmRsZX1gO1xuXHRcdFx0fVxuXG5cdFx0XHRwcm94eS4kY3JlYXRlQ29tbWVudFRocmVhZChcblx0XHRcdFx0X2NvbW1lbnRDb250cm9sbGVySGFuZGxlLFxuXHRcdFx0XHR0aGlzLmhhbmRsZSxcblx0XHRcdFx0dGhpcy5faWQsXG5cdFx0XHRcdHRoaXMuX3VyaSxcblx0XHRcdFx0ZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUmFuZ2UuZnJvbSh0aGlzLl9yYW5nZSksXG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRzLm1hcChjbXQgPT4gY29udmVydFRvRFRPQ29tbWVudCh0aGlzLCBjbXQsIHRoaXMuX2NvbW1lbnRzTWFwLCB0aGlzLmV4dGVuc2lvbkRlc2NyaXB0aW9uKSksXG5cdFx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdHRoaXMuX2lzVGVtcGxhdGUsXG5cdFx0XHRcdGVkaXRvcklkXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzID0gW107XG5cdFx0XHR0aGlzLl9pc0RpcG9zZWQgPSBmYWxzZTtcblxuXHRcdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlcy5wdXNoKHRoaXMub25EaWRVcGRhdGVDb21tZW50VGhyZWFkKCgpID0+IHtcblx0XHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlQ29tbWVudFRocmVhZCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzLnB1c2goe1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0cHJveHkuJGRlbGV0ZUNvbW1lbnRUaHJlYWQoXG5cdFx0XHRcdFx0XHRfY29tbWVudENvbnRyb2xsZXJIYW5kbGUsXG5cdFx0XHRcdFx0XHR0aGlzLmhhbmRsZVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdHRoaXMudmFsdWUgPSB7XG5cdFx0XHRcdGdldCB1cmkoKSB7IHJldHVybiB0aGF0LnVyaTsgfSxcblx0XHRcdFx0Z2V0IHJhbmdlKCkgeyByZXR1cm4gdGhhdC5yYW5nZTsgfSxcblx0XHRcdFx0c2V0IHJhbmdlKHZhbHVlOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQpIHsgdGhhdC5yYW5nZSA9IHZhbHVlOyB9LFxuXHRcdFx0XHRnZXQgY29tbWVudHMoKSB7IHJldHVybiB0aGF0LmNvbW1lbnRzOyB9LFxuXHRcdFx0XHRzZXQgY29tbWVudHModmFsdWU6IHZzY29kZS5Db21tZW50W10pIHsgdGhhdC5jb21tZW50cyA9IHZhbHVlOyB9LFxuXHRcdFx0XHRnZXQgY29sbGFwc2libGVTdGF0ZSgpIHsgcmV0dXJuIHRoYXQuY29sbGFwc2libGVTdGF0ZTsgfSxcblx0XHRcdFx0c2V0IGNvbGxhcHNpYmxlU3RhdGUodmFsdWU6IHZzY29kZS5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSkgeyB0aGF0LmNvbGxhcHNpYmxlU3RhdGUgPSB2YWx1ZTsgfSxcblx0XHRcdFx0Z2V0IGNhblJlcGx5KCkgeyByZXR1cm4gdGhhdC5jYW5SZXBseTsgfSxcblx0XHRcdFx0c2V0IGNhblJlcGx5KHN0YXRlOiBib29sZWFuIHwgdnNjb2RlLkNvbW1lbnRBdXRob3JJbmZvcm1hdGlvbikgeyB0aGF0LmNhblJlcGx5ID0gc3RhdGU7IH0sXG5cdFx0XHRcdGdldCBjb250ZXh0VmFsdWUoKSB7IHJldHVybiB0aGF0LmNvbnRleHRWYWx1ZTsgfSxcblx0XHRcdFx0c2V0IGNvbnRleHRWYWx1ZSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7IHRoYXQuY29udGV4dFZhbHVlID0gdmFsdWU7IH0sXG5cdFx0XHRcdGdldCBsYWJlbCgpIHsgcmV0dXJuIHRoYXQubGFiZWw7IH0sXG5cdFx0XHRcdHNldCBsYWJlbCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7IHRoYXQubGFiZWwgPSB2YWx1ZTsgfSxcblx0XHRcdFx0Z2V0IHN0YXRlKCk6IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGUgfCB7IHJlc29sdmVkPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZTsgYXBwbGljYWJpbGl0eT86IHZzY29kZS5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB9IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoYXQuc3RhdGU7IH0sXG5cdFx0XHRcdHNldCBzdGF0ZSh2YWx1ZTogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHsgcmVzb2x2ZWQ/OiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlOyBhcHBsaWNhYmlsaXR5PzogdnNjb2RlLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IH0pIHsgdGhhdC5zdGF0ZSA9IHZhbHVlOyB9LFxuXHRcdFx0XHRyZXZlYWw6IChjb21tZW50PzogdnNjb2RlLkNvbW1lbnQgfCB2c2NvZGUuQ29tbWVudFRocmVhZFJldmVhbE9wdGlvbnMsIG9wdGlvbnM/OiB2c2NvZGUuQ29tbWVudFRocmVhZFJldmVhbE9wdGlvbnMpID0+IHRoYXQucmV2ZWFsKGNvbW1lbnQsIG9wdGlvbnMpLFxuXHRcdFx0XHRoaWRlOiAoKSA9PiB0aGF0LmhpZGUoKSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHRoYXQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHByaXZhdGUgdXBkYXRlSXNUZW1wbGF0ZSgpIHtcblx0XHRcdGlmICh0aGlzLl9pc1RlbXBsYXRlKSB7XG5cdFx0XHRcdHRoaXMuX2lzVGVtcGxhdGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5tb2RpZmljYXRpb25zLmlzVGVtcGxhdGUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRAZGVib3VuY2UoMTAwKVxuXHRcdGV2ZW50dWFsbHlVcGRhdGVDb21tZW50VGhyZWFkKCk6IHZvaWQge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUlzVGVtcGxhdGUoKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9hY2NlcHRJbnB1dERpc3Bvc2FibGVzLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdElucHV0RGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkID0gKHZhbHVlOiBrZXlvZiBDb21tZW50VGhyZWFkTW9kaWZpY2F0aW9uKTogYm9vbGVhbiA9PlxuXHRcdFx0XHRPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5tb2RpZmljYXRpb25zLCB2YWx1ZSk7XG5cblx0XHRcdGNvbnN0IGZvcm1hdHRlZE1vZGlmaWNhdGlvbnM6IENvbW1lbnRUaHJlYWRDaGFuZ2VzID0ge307XG5cdFx0XHRpZiAobW9kaWZpZWQoJ3JhbmdlJykpIHtcblx0XHRcdFx0Zm9ybWF0dGVkTW9kaWZpY2F0aW9ucy5yYW5nZSA9IGV4dEhvc3RUeXBlQ29udmVydGVyLlJhbmdlLmZyb20odGhpcy5fcmFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGlmaWVkKCdsYWJlbCcpKSB7XG5cdFx0XHRcdGZvcm1hdHRlZE1vZGlmaWNhdGlvbnMubGFiZWwgPSB0aGlzLmxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGlmaWVkKCdjb250ZXh0VmFsdWUnKSkge1xuXHRcdFx0XHQvKlxuXHRcdFx0XHQgKiBudWxsIC0+IGNsZWFyZWQgY29udGV4dFZhbHVlXG5cdFx0XHRcdCAqIHVuZGVmaW5lZCAtPiBubyBjaGFuZ2Vcblx0XHRcdFx0ICovXG5cdFx0XHRcdGZvcm1hdHRlZE1vZGlmaWNhdGlvbnMuY29udGV4dFZhbHVlID0gdGhpcy5jb250ZXh0VmFsdWUgPz8gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnY29tbWVudHMnKSkge1xuXHRcdFx0XHRmb3JtYXR0ZWRNb2RpZmljYXRpb25zLmNvbW1lbnRzID1cblx0XHRcdFx0XHR0aGlzLl9jb21tZW50cy5tYXAoY210ID0+IGNvbnZlcnRUb0RUT0NvbW1lbnQodGhpcywgY210LCB0aGlzLl9jb21tZW50c01hcCwgdGhpcy5leHRlbnNpb25EZXNjcmlwdGlvbikpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGlmaWVkKCdjb2xsYXBzaWJsZVN0YXRlJykpIHtcblx0XHRcdFx0Zm9ybWF0dGVkTW9kaWZpY2F0aW9ucy5jb2xsYXBzZVN0YXRlID0gY29udmVydFRvQ29sbGFwc2libGVTdGF0ZSh0aGlzLl9jb2xsYXBzZVN0YXRlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnY2FuUmVwbHknKSkge1xuXHRcdFx0XHRmb3JtYXR0ZWRNb2RpZmljYXRpb25zLmNhblJlcGx5ID0gdGhpcy5jYW5SZXBseTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnc3RhdGUnKSkge1xuXHRcdFx0XHRmb3JtYXR0ZWRNb2RpZmljYXRpb25zLnN0YXRlID0gY29udmVydFRvU3RhdGUodGhpcy5fc3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGlmaWVkKCdhcHBsaWNhYmlsaXR5JykpIHtcblx0XHRcdFx0Zm9ybWF0dGVkTW9kaWZpY2F0aW9ucy5hcHBsaWNhYmlsaXR5ID0gY29udmVydFRvUmVsZXZhbmNlKHRoaXMuX3N0YXRlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZCgnaXNUZW1wbGF0ZScpKSB7XG5cdFx0XHRcdGZvcm1hdHRlZE1vZGlmaWNhdGlvbnMuaXNUZW1wbGF0ZSA9IHRoaXMuX2lzVGVtcGxhdGU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm1vZGlmaWNhdGlvbnMgPSB7fTtcblxuXHRcdFx0cHJveHkuJHVwZGF0ZUNvbW1lbnRUaHJlYWQoXG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRDb250cm9sbGVySGFuZGxlLFxuXHRcdFx0XHR0aGlzLmhhbmRsZSxcblx0XHRcdFx0dGhpcy5faWQhLFxuXHRcdFx0XHR0aGlzLl91cmksXG5cdFx0XHRcdGZvcm1hdHRlZE1vZGlmaWNhdGlvbnNcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Z2V0Q29tbWVudEJ5VW5pcXVlSWQodW5pcXVlSWQ6IG51bWJlcik6IHZzY29kZS5Db21tZW50IHwgdW5kZWZpbmVkIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX2NvbW1lbnRzTWFwKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1lbnQgPSBrZXlbMF07XG5cdFx0XHRcdGNvbnN0IGlkID0ga2V5WzFdO1xuXHRcdFx0XHRpZiAodW5pcXVlSWQgPT09IGlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbW1lbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJldmVhbChjb21tZW50T3JPcHRpb25zPzogdnNjb2RlLkNvbW1lbnQgfCB2c2NvZGUuQ29tbWVudFRocmVhZFJldmVhbE9wdGlvbnMsIG9wdGlvbnM/OiB2c2NvZGUuQ29tbWVudFRocmVhZFJldmVhbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuZXh0ZW5zaW9uRGVzY3JpcHRpb24sICdjb21tZW50UmV2ZWFsJyk7XG5cdFx0XHRsZXQgY29tbWVudDogdnNjb2RlLkNvbW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY29tbWVudE9yT3B0aW9ucyAmJiAoY29tbWVudE9yT3B0aW9ucyBhcyB2c2NvZGUuQ29tbWVudCkuYm9keSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbW1lbnQgPSBjb21tZW50T3JPcHRpb25zIGFzIHZzY29kZS5Db21tZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3B0aW9ucyA9IG9wdGlvbnMgPz8gY29tbWVudE9yT3B0aW9ucyBhcyB2c2NvZGUuQ29tbWVudFRocmVhZFJldmVhbE9wdGlvbnM7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY29tbWVudFRvUmV2ZWFsID0gY29tbWVudCA/IHRoaXMuX2NvbW1lbnRzTWFwLmdldChjb21tZW50KSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbW1lbnRUb1JldmVhbCA/Pz0gdGhpcy5fY29tbWVudHNNYXAuZ2V0KHRoaXMuX2NvbW1lbnRzWzBdKSE7XG5cdFx0XHRsZXQgcHJlc2VydmVGb2N1czogYm9vbGVhbiA9IHRydWU7XG5cdFx0XHRsZXQgZm9jdXNSZXBseTogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0aWYgKG9wdGlvbnM/LmZvY3VzID09PSB0eXBlcy5Db21tZW50VGhyZWFkRm9jdXMuUmVwbHkpIHtcblx0XHRcdFx0Zm9jdXNSZXBseSA9IHRydWU7XG5cdFx0XHRcdHByZXNlcnZlRm9jdXMgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAob3B0aW9ucz8uZm9jdXMgPT09IHR5cGVzLkNvbW1lbnRUaHJlYWRGb2N1cy5Db21tZW50KSB7XG5cdFx0XHRcdHByZXNlcnZlRm9jdXMgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwcm94eS4kcmV2ZWFsQ29tbWVudFRocmVhZCh0aGlzLl9jb21tZW50Q29udHJvbGxlckhhbmRsZSwgdGhpcy5oYW5kbGUsIGNvbW1lbnRUb1JldmVhbCwgeyBwcmVzZXJ2ZUZvY3VzLCBmb2N1c1JlcGx5IH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIGhpZGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gcHJveHkuJGhpZGVDb21tZW50VGhyZWFkKHRoaXMuX2NvbW1lbnRDb250cm9sbGVySGFuZGxlLCB0aGlzLmhhbmRsZSk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zZSgpIHtcblx0XHRcdHRoaXMuX2lzRGlwb3NlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9hY2NlcHRJbnB1dERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlQ29tbWVudFRocmVhZC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVzLmZvckVhY2goZGlzcG9zYWJsZSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdFx0fVxuXHR9XG5cblx0dHlwZSBSZWFjdGlvbkhhbmRsZXIgPSAoY29tbWVudDogdnNjb2RlLkNvbW1lbnQsIHJlYWN0aW9uOiB2c2NvZGUuQ29tbWVudFJlYWN0aW9uKSA9PiBQcm9taXNlPHZvaWQ+O1xuXG5cdGNsYXNzIEV4dEhvc3RDb21tZW50Q29udHJvbGxlciB7XG5cdFx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdFx0fVxuXG5cdFx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdFx0fVxuXG5cdFx0cHVibGljIGdldCBoYW5kbGUoKTogbnVtYmVyIHtcblx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGU7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfdGhyZWFkczogTWFwPG51bWJlciwgRXh0SG9zdENvbW1lbnRUaHJlYWQ+ID0gbmV3IE1hcDxudW1iZXIsIEV4dEhvc3RDb21tZW50VGhyZWFkPigpO1xuXG5cdFx0cHJpdmF0ZSBfY29tbWVudGluZ1JhbmdlUHJvdmlkZXI/OiB2c2NvZGUuQ29tbWVudGluZ1JhbmdlUHJvdmlkZXI7XG5cdFx0Z2V0IGNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyKCk6IHZzY29kZS5Db21tZW50aW5nUmFuZ2VQcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29tbWVudGluZ1JhbmdlUHJvdmlkZXI7XG5cdFx0fVxuXG5cdFx0c2V0IGNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuQ29tbWVudGluZ1JhbmdlUHJvdmlkZXIgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZVByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0XHRpZiAocHJvdmlkZXI/LnJlc291cmNlSGludHMpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnY29tbWVudGluZ1JhbmdlSGludCcpO1xuXHRcdFx0fVxuXHRcdFx0cHJveHkuJHVwZGF0ZUNvbW1lbnRpbmdSYW5nZXModGhpcy5oYW5kbGUsIHByb3ZpZGVyPy5yZXNvdXJjZUhpbnRzKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9yZWFjdGlvbkhhbmRsZXI/OiBSZWFjdGlvbkhhbmRsZXI7XG5cblx0XHRnZXQgcmVhY3Rpb25IYW5kbGVyKCk6IFJlYWN0aW9uSGFuZGxlciB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVhY3Rpb25IYW5kbGVyO1xuXHRcdH1cblxuXHRcdHNldCByZWFjdGlvbkhhbmRsZXIoaGFuZGxlcjogUmVhY3Rpb25IYW5kbGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZWFjdGlvbkhhbmRsZXIgPSBoYW5kbGVyO1xuXG5cdFx0XHRwcm94eS4kdXBkYXRlQ29tbWVudENvbnRyb2xsZXJGZWF0dXJlcyh0aGlzLmhhbmRsZSwgeyByZWFjdGlvbkhhbmRsZXI6ICEhaGFuZGxlciB9KTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9vcHRpb25zOiBsYW5ndWFnZXMuQ29tbWVudE9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0XHRnZXQgb3B0aW9ucygpIHtcblx0XHRcdHJldHVybiB0aGlzLl9vcHRpb25zO1xuXHRcdH1cblxuXHRcdHNldCBvcHRpb25zKG9wdGlvbnM6IGxhbmd1YWdlcy5Db21tZW50T3B0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG5cblx0XHRcdHByb3h5LiR1cGRhdGVDb21tZW50Q29udHJvbGxlckZlYXR1cmVzKHRoaXMuaGFuZGxlLCB7IG9wdGlvbnM6IHRoaXMuX29wdGlvbnMgfSk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfYWN0aXZlQ29tbWVudDogdnNjb2RlLkNvbW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRnZXQgYWN0aXZlQ29tbWVudCgpOiB2c2NvZGUuQ29tbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdhY3RpdmVDb21tZW50Jyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlQ29tbWVudDtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9hY3RpdmVUaHJlYWQ6IEV4dEhvc3RDb21tZW50VGhyZWFkIHwgdW5kZWZpbmVkO1xuXG5cdFx0Z2V0IGFjdGl2ZUNvbW1lbnRUaHJlYWQoKTogdnNjb2RlLkNvbW1lbnRUaHJlYWQyIHwgdW5kZWZpbmVkIHtcblx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ2FjdGl2ZUNvbW1lbnQnKTtcblx0XHRcdHJldHVybiB0aGlzLl9hY3RpdmVUaHJlYWQ/LnZhbHVlO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2xvY2FsRGlzcG9zYWJsZXM6IHR5cGVzLkRpc3Bvc2FibGVbXTtcblx0XHRyZWFkb25seSB2YWx1ZTogdnNjb2RlLkNvbW1lbnRDb250cm9sbGVyO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRwcml2YXRlIF9leHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdHByaXZhdGUgX2hhbmRsZTogbnVtYmVyLFxuXHRcdFx0cHJpdmF0ZSBfaWQ6IHN0cmluZyxcblx0XHRcdHByaXZhdGUgX2xhYmVsOiBzdHJpbmdcblx0XHQpIHtcblx0XHRcdHByb3h5LiRyZWdpc3RlckNvbW1lbnRDb250cm9sbGVyKHRoaXMuaGFuZGxlLCBfaWQsIF9sYWJlbCwgdGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdHRoaXMudmFsdWUgPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdFx0aWQ6IHRoYXQuaWQsXG5cdFx0XHRcdGxhYmVsOiB0aGF0LmxhYmVsLFxuXHRcdFx0XHRnZXQgb3B0aW9ucygpIHsgcmV0dXJuIHRoYXQub3B0aW9uczsgfSxcblx0XHRcdFx0c2V0IG9wdGlvbnMob3B0aW9uczogdnNjb2RlLkNvbW1lbnRPcHRpb25zIHwgdW5kZWZpbmVkKSB7IHRoYXQub3B0aW9ucyA9IG9wdGlvbnM7IH0sXG5cdFx0XHRcdGdldCBjb21tZW50aW5nUmFuZ2VQcm92aWRlcigpOiB2c2NvZGUuQ29tbWVudGluZ1JhbmdlUHJvdmlkZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhhdC5jb21tZW50aW5nUmFuZ2VQcm92aWRlcjsgfSxcblx0XHRcdFx0c2V0IGNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyKGNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyOiB2c2NvZGUuQ29tbWVudGluZ1JhbmdlUHJvdmlkZXIgfCB1bmRlZmluZWQpIHsgdGhhdC5jb21tZW50aW5nUmFuZ2VQcm92aWRlciA9IGNvbW1lbnRpbmdSYW5nZVByb3ZpZGVyOyB9LFxuXHRcdFx0XHRnZXQgcmVhY3Rpb25IYW5kbGVyKCk6IFJlYWN0aW9uSGFuZGxlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGF0LnJlYWN0aW9uSGFuZGxlcjsgfSxcblx0XHRcdFx0c2V0IHJlYWN0aW9uSGFuZGxlcihoYW5kbGVyOiBSZWFjdGlvbkhhbmRsZXIgfCB1bmRlZmluZWQpIHsgdGhhdC5yZWFjdGlvbkhhbmRsZXIgPSBoYW5kbGVyOyB9LFxuXHRcdFx0XHQvLyBnZXQgYWN0aXZlQ29tbWVudCgpOiB2c2NvZGUuQ29tbWVudCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGF0LmFjdGl2ZUNvbW1lbnQ7IH0sXG5cdFx0XHRcdGdldCBhY3RpdmVDb21tZW50VGhyZWFkKCk6IHZzY29kZS5Db21tZW50VGhyZWFkIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoYXQuYWN0aXZlQ29tbWVudFRocmVhZCBhcyB2c2NvZGUuQ29tbWVudFRocmVhZCB8IHVuZGVmaW5lZDsgfSxcblx0XHRcdFx0Y3JlYXRlQ29tbWVudFRocmVhZCh1cmk6IHZzY29kZS5VcmksIHJhbmdlOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQsIGNvbW1lbnRzOiB2c2NvZGUuQ29tbWVudFtdKTogdnNjb2RlLkNvbW1lbnRUaHJlYWQge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0LmNyZWF0ZUNvbW1lbnRUaHJlYWQodXJpLCByYW5nZSwgY29tbWVudHMpLnZhbHVlIGFzIHZzY29kZS5Db21tZW50VGhyZWFkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IHRoYXQuZGlzcG9zZSgpOyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZXMgPSBbXTtcblx0XHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZXMucHVzaCh7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRwcm94eS4kdW5yZWdpc3RlckNvbW1lbnRDb250cm9sbGVyKHRoaXMuaGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y3JlYXRlQ29tbWVudFRocmVhZChyZXNvdXJjZTogdnNjb2RlLlVyaSwgcmFuZ2U6IHZzY29kZS5SYW5nZSB8IHVuZGVmaW5lZCwgY29tbWVudHM6IHZzY29kZS5Db21tZW50W10pOiBFeHRIb3N0Q29tbWVudFRocmVhZCB7XG5cdFx0XHRjb25zdCBjb21tZW50VGhyZWFkID0gbmV3IEV4dEhvc3RDb21tZW50VGhyZWFkKHRoaXMuaWQsIHRoaXMuaGFuZGxlLCB1bmRlZmluZWQsIHJlc291cmNlLCByYW5nZSwgY29tbWVudHMsIHRoaXMuX2V4dGVuc2lvbiwgZmFsc2UpO1xuXHRcdFx0dGhpcy5fdGhyZWFkcy5zZXQoY29tbWVudFRocmVhZC5oYW5kbGUsIGNvbW1lbnRUaHJlYWQpO1xuXHRcdFx0cmV0dXJuIGNvbW1lbnRUaHJlYWQ7XG5cdFx0fVxuXG5cdFx0JHNldEFjdGl2ZUNvbW1lbnQoY29tbWVudEluZm86IHsgY29tbWVudFRocmVhZEhhbmRsZTogbnVtYmVyOyB1bmlxdWVJZEluVGhyZWFkPzogbnVtYmVyIH0gfCB1bmRlZmluZWQpIHtcblx0XHRcdGlmICghY29tbWVudEluZm8pIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlQ29tbWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fYWN0aXZlVGhyZWFkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLl90aHJlYWRzLmdldChjb21tZW50SW5mby5jb21tZW50VGhyZWFkSGFuZGxlKTtcblx0XHRcdGlmICh0aHJlYWQpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlQ29tbWVudCA9IGNvbW1lbnRJbmZvLnVuaXF1ZUlkSW5UaHJlYWQgPyB0aHJlYWQuZ2V0Q29tbWVudEJ5VW5pcXVlSWQoY29tbWVudEluZm8udW5pcXVlSWRJblRocmVhZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVRocmVhZCA9IHRocmVhZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQkY3JlYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHVyaUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIGVkaXRvcklkPzogc3RyaW5nKTogRXh0SG9zdENvbW1lbnRUaHJlYWQge1xuXHRcdFx0Y29uc3QgY29tbWVudFRocmVhZCA9IG5ldyBFeHRIb3N0Q29tbWVudFRocmVhZCh0aGlzLmlkLCB0aGlzLmhhbmRsZSwgdW5kZWZpbmVkLCBVUkkucmV2aXZlKHVyaUNvbXBvbmVudHMpLCBleHRIb3N0VHlwZUNvbnZlcnRlci5SYW5nZS50byhyYW5nZSksIFtdLCB0aGlzLl9leHRlbnNpb24sIHRydWUsIGVkaXRvcklkKTtcblx0XHRcdGNvbW1lbnRUaHJlYWQuY29sbGFwc2libGVTdGF0ZSA9IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZDtcblx0XHRcdHRoaXMuX3RocmVhZHMuc2V0KGNvbW1lbnRUaHJlYWQuaGFuZGxlLCBjb21tZW50VGhyZWFkKTtcblx0XHRcdHJldHVybiBjb21tZW50VGhyZWFkO1xuXHRcdH1cblxuXHRcdCR1cGRhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodGhyZWFkSGFuZGxlOiBudW1iZXIsIHJhbmdlOiBJUmFuZ2UpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZEhhbmRsZSk7XG5cdFx0XHRpZiAodGhyZWFkKSB7XG5cdFx0XHRcdHRocmVhZC5yYW5nZSA9IGV4dEhvc3RUeXBlQ29udmVydGVyLlJhbmdlLnRvKHJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQkdXBkYXRlQ29tbWVudFRocmVhZCh0aHJlYWRIYW5kbGU6IG51bWJlciwgY2hhbmdlczogQ29tbWVudFRocmVhZENoYW5nZXMpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZEhhbmRsZSk7XG5cdFx0XHRpZiAoIXRocmVhZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkID0gKHZhbHVlOiBrZXlvZiBDb21tZW50VGhyZWFkQ2hhbmdlcyk6IGJvb2xlYW4gPT5cblx0XHRcdFx0T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGNoYW5nZXMsIHZhbHVlKTtcblxuXHRcdFx0aWYgKG1vZGlmaWVkKCdjb2xsYXBzZVN0YXRlJykpIHtcblx0XHRcdFx0dGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgPSBjb252ZXJ0VG9Db2xsYXBzaWJsZVN0YXRlKGNoYW5nZXMuY29sbGFwc2VTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0JGRlbGV0ZUNvbW1lbnRUaHJlYWQodGhyZWFkSGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZEhhbmRsZSk7XG5cblx0XHRcdHRocmVhZD8uZGlzcG9zZSgpO1xuXG5cdFx0XHR0aGlzLl90aHJlYWRzLmRlbGV0ZSh0aHJlYWRIYW5kbGUpO1xuXHRcdH1cblxuXHRcdGdldENvbW1lbnRUaHJlYWQoaGFuZGxlOiBudW1iZXIpOiBFeHRIb3N0Q29tbWVudFRocmVhZCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdGhyZWFkcy5nZXQoaGFuZGxlKTtcblx0XHR9XG5cblx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0dGhpcy5fdGhyZWFkcy5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZXMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjb252ZXJ0VG9EVE9Db21tZW50KHRocmVhZDogRXh0SG9zdENvbW1lbnRUaHJlYWQsIHZzY29kZUNvbW1lbnQ6IHZzY29kZS5Db21tZW50LCBjb21tZW50c01hcDogTWFwPHZzY29kZS5Db21tZW50LCBudW1iZXI+LCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IENvbW1lbnRDaGFuZ2VzIHtcblx0XHRsZXQgY29tbWVudFVuaXF1ZUlkID0gY29tbWVudHNNYXAuZ2V0KHZzY29kZUNvbW1lbnQpITtcblx0XHRpZiAoIWNvbW1lbnRVbmlxdWVJZCkge1xuXHRcdFx0Y29tbWVudFVuaXF1ZUlkID0gKyt0aHJlYWQuY29tbWVudEhhbmRsZTtcblx0XHRcdGNvbW1lbnRzTWFwLnNldCh2c2NvZGVDb21tZW50LCBjb21tZW50VW5pcXVlSWQpO1xuXHRcdH1cblxuXHRcdGlmICh2c2NvZGVDb21tZW50LnN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NvbW1lbnRzRHJhZnRTdGF0ZScpO1xuXHRcdH1cblxuXHRcdGlmICh2c2NvZGVDb21tZW50LnJlYWN0aW9ucz8uc29tZShyZWFjdGlvbiA9PiByZWFjdGlvbi5yZWFjdG9ycyAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY29tbWVudFJlYWN0b3InKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bW9kZTogdnNjb2RlQ29tbWVudC5tb2RlLFxuXHRcdFx0Y29udGV4dFZhbHVlOiB2c2NvZGVDb21tZW50LmNvbnRleHRWYWx1ZSxcblx0XHRcdHVuaXF1ZUlkSW5UaHJlYWQ6IGNvbW1lbnRVbmlxdWVJZCxcblx0XHRcdGJvZHk6ICh0eXBlb2YgdnNjb2RlQ29tbWVudC5ib2R5ID09PSAnc3RyaW5nJykgPyB2c2NvZGVDb21tZW50LmJvZHkgOiBleHRIb3N0VHlwZUNvbnZlcnRlci5NYXJrZG93blN0cmluZy5mcm9tKHZzY29kZUNvbW1lbnQuYm9keSksXG5cdFx0XHR1c2VyTmFtZTogdnNjb2RlQ29tbWVudC5hdXRob3IubmFtZSxcblx0XHRcdHVzZXJJY29uUGF0aDogdnNjb2RlQ29tbWVudC5hdXRob3IuaWNvblBhdGgsXG5cdFx0XHRsYWJlbDogdnNjb2RlQ29tbWVudC5sYWJlbCxcblx0XHRcdGNvbW1lbnRSZWFjdGlvbnM6IHZzY29kZUNvbW1lbnQucmVhY3Rpb25zID8gdnNjb2RlQ29tbWVudC5yZWFjdGlvbnMubWFwKHJlYWN0aW9uID0+IGNvbnZlcnRUb1JlYWN0aW9uKHJlYWN0aW9uKSkgOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZTogdnNjb2RlQ29tbWVudC5zdGF0ZSxcblx0XHRcdHRpbWVzdGFtcDogdnNjb2RlQ29tbWVudC50aW1lc3RhbXA/LnRvSlNPTigpXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnZlcnRUb1JlYWN0aW9uKHJlYWN0aW9uOiB2c2NvZGUuQ29tbWVudFJlYWN0aW9uKTogbGFuZ3VhZ2VzLkNvbW1lbnRSZWFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiByZWFjdGlvbi5sYWJlbCxcblx0XHRcdGljb25QYXRoOiByZWFjdGlvbi5pY29uUGF0aCA/IGV4dEhvc3RUeXBlQ29udmVydGVyLnBhdGhPclVSSVRvVVJJKHJlYWN0aW9uLmljb25QYXRoKSA6IHVuZGVmaW5lZCxcblx0XHRcdGNvdW50OiByZWFjdGlvbi5jb3VudCxcblx0XHRcdGhhc1JlYWN0ZWQ6IHJlYWN0aW9uLmF1dGhvckhhc1JlYWN0ZWQsXG5cdFx0XHRyZWFjdG9yczogKChyZWFjdGlvbi5yZWFjdG9ycyAmJiAocmVhY3Rpb24ucmVhY3RvcnMubGVuZ3RoID4gMCkgJiYgKHR5cGVvZiByZWFjdGlvbi5yZWFjdG9yc1swXSAhPT0gJ3N0cmluZycpKSA/IChyZWFjdGlvbi5yZWFjdG9ycyBhcyBsYW5ndWFnZXMuQ29tbWVudEF1dGhvckluZm9ybWF0aW9uW10pLm1hcChyZWFjdG9yID0+IHJlYWN0b3IubmFtZSkgOiByZWFjdGlvbi5yZWFjdG9ycykgYXMgc3RyaW5nW11cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY29udmVydEZyb21SZWFjdGlvbihyZWFjdGlvbjogbGFuZ3VhZ2VzLkNvbW1lbnRSZWFjdGlvbik6IHZzY29kZS5Db21tZW50UmVhY3Rpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogcmVhY3Rpb24ubGFiZWwgfHwgJycsXG5cdFx0XHRjb3VudDogcmVhY3Rpb24uY291bnQgfHwgMCxcblx0XHRcdGljb25QYXRoOiByZWFjdGlvbi5pY29uUGF0aCA/IFVSSS5yZXZpdmUocmVhY3Rpb24uaWNvblBhdGgpIDogJycsXG5cdFx0XHRhdXRob3JIYXNSZWFjdGVkOiByZWFjdGlvbi5oYXNSZWFjdGVkIHx8IGZhbHNlLFxuXHRcdFx0cmVhY3RvcnM6IHJlYWN0aW9uLnJlYWN0b3JzPy5tYXAocmVhY3RvciA9PiAoeyBuYW1lOiByZWFjdG9yIH0pKVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjb252ZXJ0VG9Db2xsYXBzaWJsZVN0YXRlKGtpbmQ6IHZzY29kZS5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB8IHVuZGVmaW5lZCk6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB7XG5cdFx0aWYgKGtpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRcdGNhc2UgdHlwZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZDtcblx0XHRcdFx0Y2FzZSB0eXBlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29udmVydFRvU3RhdGUoa2luZDogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHsgcmVzb2x2ZWQ/OiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlOyBhcHBsaWNhYmlsaXR5PzogdnNjb2RlLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IH0gfCB1bmRlZmluZWQpOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlIHtcblx0XHRsZXQgcmVzb2x2ZWRLaW5kOiB2c2NvZGUuQ29tbWVudFRocmVhZFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2Yga2luZCA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHJlc29sdmVkS2luZCA9IGtpbmQucmVzb2x2ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc29sdmVkS2luZCA9IGtpbmQ7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc29sdmVkS2luZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzd2l0Y2ggKHJlc29sdmVkS2luZCkge1xuXHRcdFx0XHRjYXNlIHR5cGVzLkNvbW1lbnRUaHJlYWRTdGF0ZS5VbnJlc29sdmVkOlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlLlVucmVzb2x2ZWQ7XG5cdFx0XHRcdGNhc2UgdHlwZXMuQ29tbWVudFRocmVhZFN0YXRlLlJlc29sdmVkOlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlLlJlc29sdmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZS5VbnJlc29sdmVkO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29udmVydFRvUmVsZXZhbmNlKGtpbmQ6IHZzY29kZS5Db21tZW50VGhyZWFkU3RhdGUgfCB7IHJlc29sdmVkPzogdnNjb2RlLkNvbW1lbnRUaHJlYWRTdGF0ZTsgYXBwbGljYWJpbGl0eT86IHZzY29kZS5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB9IHwgdW5kZWZpbmVkKTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IHtcblx0XHRsZXQgYXBwbGljYWJpbGl0eUtpbmQ6IHZzY29kZS5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGtpbmQgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRhcHBsaWNhYmlsaXR5S2luZCA9IGtpbmQuYXBwbGljYWJpbGl0eTtcblx0XHR9XG5cblx0XHRpZiAoYXBwbGljYWJpbGl0eUtpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3dpdGNoIChhcHBsaWNhYmlsaXR5S2luZCkge1xuXHRcdFx0XHRjYXNlIHR5cGVzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5LkN1cnJlbnQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQXBwbGljYWJpbGl0eS5DdXJyZW50O1xuXHRcdFx0XHRjYXNlIHR5cGVzLkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5Lk91dGRhdGVkOlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkuT3V0ZGF0ZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkuQ3VycmVudDtcblx0fVxuXG5cdHJldHVybiBuZXcgRXh0SG9zdENvbW1lbnRzSW1wbCgpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQix5QkFBeUI7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUEwQjtBQUVuQyxZQUFZLGVBQWU7QUFDM0IsU0FBUyw4QkFBcUQ7QUFFOUQsWUFBWSwwQkFBMEI7QUFDdEMsWUFBWSxXQUFXO0FBRXZCLFNBQTZDLG1CQUF5RDtBQUV0RyxTQUFTLCtCQUErQjtBQVNqQyxTQUFTLHNCQUFzQixhQUEyQixVQUEyQixXQUFxRTtBQUNoSyxRQUFNLFFBQVEsWUFBWSxTQUFTLFlBQVksa0JBQWtCO0FBRWpFLFFBQU0sdUJBQU4sTUFBTSxxQkFBcUU7QUFBQSxJQVUxRSxjQUNFO0FBTkYsV0FBUSxzQkFBcUUsb0JBQUksSUFBOEM7QUFFL0gsV0FBUSxpQ0FBcUYsSUFBSSx1QkFBbUQ7QUFLbkosZUFBUywwQkFBMEI7QUFBQSxRQUNsQyxpQkFBaUIsU0FBTztBQUN2QixjQUFJLE9BQU8sSUFBSSxTQUFTLGFBQWEsbUJBQW1CO0FBQ3ZELGtCQUFNLG9CQUFvQixLQUFLLG9CQUFvQixJQUFJLElBQUksTUFBTTtBQUVqRSxnQkFBSSxDQUFDLG1CQUFtQjtBQUN2QixxQkFBTztBQUFBLFlBQ1I7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
