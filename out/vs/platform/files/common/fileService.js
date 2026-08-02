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
import { coalesce } from "../../../base/common/arrays.js";
import { Promises, ResourceQueue } from "../../../base/common/async.js";
import { bufferedStreamToBuffer, bufferToReadable, newWriteableBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { hash } from "../../../base/common/hash.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../base/common/lifecycle.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { Schemas } from "../../../base/common/network.js";
import { mark } from "../../../base/common/performance.js";
import { extUri, extUriIgnorePathCase, isAbsolutePath } from "../../../base/common/resources.js";
import { consumeStream, isReadableBufferedStream, isReadableStream, listenStream, newWriteableStream, peekReadable, peekStream, transform } from "../../../base/common/stream.js";
import { localize } from "../../../nls.js";
import { ensureFileSystemProviderError, etag, ETAG_DISABLED, FileChangesEvent, FileOperation, FileOperationError, FileOperationEvent, FileOperationResult, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, hasFileAppendCapability, hasFileAtomicReadCapability, hasFileFolderCopyCapability, hasFileReadStreamCapability, hasOpenReadWriteCloseCapability, hasReadWriteCapability, NotModifiedSinceFileOperationError, toFileOperationResult, toFileSystemProviderErrorCode, hasFileCloneCapability, TooLargeFileOperationError, hasFileAtomicDeleteCapability, hasFileAtomicWriteCapability, hasFileRealpathCapability } from "./files.js";
import { readFileIntoStream } from "./io.js";
import { ILogService } from "../../log/common/log.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
let FileService = class extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
    // Choose a buffer size that is a balance between memory needs and
    // manageable IPC overhead. The larger the buffer size, the less
    // roundtrips we have to do for reading/writing data.
    this.BUFFER_SIZE = 256 * 1024;
    //#region File System Provider
    this._onDidChangeFileSystemProviderRegistrations = this._register(new Emitter());
    this.onDidChangeFileSystemProviderRegistrations = this._onDidChangeFileSystemProviderRegistrations.event;
    this._onWillActivateFileSystemProvider = this._register(new Emitter());
    this.onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
    this._onDidChangeFileSystemProviderCapabilities = this._register(new Emitter());
    this.onDidChangeFileSystemProviderCapabilities = this._onDidChangeFileSystemProviderCapabilities.event;
    this.provider = /* @__PURE__ */ new Map();
    //#endregion
    //#region Operation events
    this._onDidRunOperation = this._register(new Emitter());
    this.onDidRunOperation = this._onDidRunOperation.event;
    //#endregion
    //#region File Watching
    this.internalOnDidFilesChange = this._register(new Emitter());
    this._onDidUncorrelatedFilesChange = this._register(new Emitter());
    this.onDidFilesChange = this._onDidUncorrelatedFilesChange.event;
    // global `onDidFilesChange` skips correlated events
    this._onDidWatchError = this._register(new Emitter());
    this.onDidWatchError = this._onDidWatchError.event;
    this.activeWatchers = /* @__PURE__ */ new Map();
    //#endregion
    //#region Helpers
    this.writeQueue = this._register(new ResourceQueue());
  }
  registerProvider(scheme, provider) {
    if (this.provider.has(scheme)) {
      throw new Error(`A filesystem provider for the scheme '${scheme}' is already registered.`);
    }
    mark(`code/registerFilesystem/${scheme}`);
    const providerDisposables = new DisposableStore();
    this.provider.set(scheme, provider);
    this._onDidChangeFileSystemProviderRegistrations.fire({ added: true, scheme, provider });
    providerDisposables.add(provider.onDidChangeFile((changes) => {
      const event = new FileChangesEvent(changes, !this.isPathCaseSensitive(provider));
      this.internalOnDidFilesChange.fire(event);
      if (!event.hasCorrelation()) {
        this._onDidUncorrelatedFilesChange.fire(event);
      }
    }));
    if (typeof provider.onDidWatchError === "function") {
      providerDisposables.add(provider.onDidWatchError((error) => this._onDidWatchError.fire(new Error(error))));
    }
    providerDisposables.add(provider.onDidChangeCapabilities(() => this._onDidChangeFileSystemProviderCapabilities.fire({ provider, scheme })));
    return toDisposable(() => {
      this._onDidChangeFileSystemProviderRegistrations.fire({ added: false, scheme, provider });
      this.provider.delete(scheme);
      dispose(providerDisposables);
    });
  }
  getProvider(scheme) {
    return this.provider.get(scheme);
  }
  async activateProvider(scheme) {
    const joiners = [];
    this._onWillActivateFileSystemProvider.fire({
      scheme,
      join(promise) {
        joiners.push(promise);
      }
    });
    if (this.provider.has(scheme)) {
      return;
    }
    await Promises.settled(joiners);
  }
  async canHandleResource(resource) {
    await this.activateProvider(resource.scheme);
    return this.hasProvider(resource);
  }
  hasProvider(resource) {
    return this.provider.has(resource.scheme);
  }
  hasCapability(resource, capability) {
    const provider = this.provider.get(resource.scheme);
    return !!(provider && provider.capabilities & capability);
  }
  listCapabilities() {
    return Iterable.map(this.provider, ([scheme, provider]) => ({ scheme, capabilities: provider.capabilities }));
  }
  async withProvider(resource) {
    if (!isAbsolutePath(resource)) {
      throw new FileOperationError(localize("invalidPath", "Unable to resolve filesystem provider with relative file path '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_INVALID_PATH);
    }
    await this.activateProvider(resource.scheme);
    const provider = this.provider.get(resource.scheme);
    if (!provider) {
      const error = new ErrorNoTelemetry();
      error.message = localize("noProviderFound", "ENOPRO: No file system provider found for resource '{0}'", resource.toString());
      throw error;
    }
    return provider;
  }
  async withReadProvider(resource) {
    const provider = await this.withProvider(resource);
    if (hasOpenReadWriteCloseCapability(provider) || hasReadWriteCapability(provider) || hasFileReadStreamCapability(provider)) {
      return provider;
    }
    throw new Error(`Filesystem provider for scheme '${resource.scheme}' neither has FileReadWrite, FileReadStream nor FileOpenReadWriteClose capability which is needed for the read operation.`);
  }
  async withWriteProvider(resource) {
    const provider = await this.withProvider(resource);
    if (hasOpenReadWriteCloseCapability(provider) || hasReadWriteCapability(provider)) {
      return provider;
    }
    throw new Error(`Filesystem provider for scheme '${resource.scheme}' neither has FileReadWrite nor FileOpenReadWriteClose capability which is needed for the write operation.`);
  }
  async resolve(resource, options) {
    try {
      return await this.doResolveFile(resource, options);
    } catch (error) {
      if (toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.FileNotFound) {
        throw new FileOperationError(localize("fileNotFoundError", "Unable to resolve nonexistent file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_NOT_FOUND);
      }
      throw ensureFileSystemProviderError(error);
    }
  }
  async doResolveFile(resource, options) {
    const provider = await this.withProvider(resource);
    const isPathCaseSensitive = this.isPathCaseSensitive(provider);
    const resolveTo = options?.resolveTo;
    const resolveSingleChildDescendants = options?.resolveSingleChildDescendants;
    const resolveMetadata = options?.resolveMetadata;
    const stat = await provider.stat(resource);
    let trie;
    return this.toFileStat(provider, resource, stat, void 0, !!resolveMetadata, (stat2, siblings) => {
      if (!trie) {
        trie = TernarySearchTree.forUris(() => !isPathCaseSensitive);
        trie.set(resource, true);
        if (resolveTo) {
          trie.fill(true, resolveTo);
        }
      }
      if (trie.get(stat2.resource) || trie.findSuperstr(stat2.resource.with(
        { query: null, fragment: null }
        /* required for https://github.com/microsoft/vscode/issues/128151 */
      ))) {
        return true;
      }
      if (stat2.isDirectory && resolveSingleChildDescendants) {
        return siblings === 1;
      }
      return false;
    });
  }
  async toFileStat(provider, resource, stat, siblings, resolveMetadata, recurse) {
    const { providerExtUri } = this.getExtUri(provider);
    const fileStat = {
      resource,
      name: providerExtUri.basename(resource),
      isFile: (stat.type & FileType.File) !== 0,
      isDirectory: (stat.type & FileType.Directory) !== 0,
      isSymbolicLink: (stat.type & FileType.SymbolicLink) !== 0,
      mtime: stat.mtime,
      ctime: stat.ctime,
      size: stat.size,
      readonly: Boolean((stat.permissions ?? 0) & FilePermission.Readonly) || Boolean(provider.capabilities & FileSystemProviderCapabilities.Readonly),
      locked: Boolean((stat.permissions ?? 0) & FilePermission.Locked),
      executable: Boolean((stat.permissions ?? 0) & FilePermission.Executable),
      etag: etag({ mtime: stat.mtime, size: stat.size }),
      children: void 0
    };
    if (fileStat.isDirectory && recurse(fileStat, siblings)) {
      try {
        const entries = await provider.readdir(resource);
        const resolvedEntries = await Promises.settled(entries.map(async ([name, type]) => {
          try {
            const childResource = providerExtUri.joinPath(resource, name);
            const childStat = resolveMetadata ? await provider.stat(childResource) : { type };
            return await this.toFileStat(provider, childResource, childStat, entries.length, resolveMetadata, recurse);
          } catch (error) {
            this.logService.trace(error);
            return null;
          }
        }));
        fileStat.children = coalesce(resolvedEntries);
      } catch (error) {
        this.logService.trace(error);
        fileStat.children = [];
      }
      return fileStat;
    }
    return fileStat;
  }
  async resolveAll(toResolve) {
    return Promises.settled(toResolve.map(async (entry) => {
      try {
        return { stat: await this.doResolveFile(entry.resource, entry.options), success: true };
      } catch (error) {
        this.logService.trace(error);
        return { stat: void 0, success: false };
      }
    }));
  }
  async stat(resource) {
    const provider = await this.withProvider(resource);
    const stat = await provider.stat(resource);
    return this.toFileStat(
      provider,
      resource,
      stat,
      void 0,
      true,
      () => false
      /* Do not resolve any children */
    );
  }
  async realpath(resource) {
    const provider = await this.withProvider(resource);
    if (hasFileRealpathCapability(provider)) {
      const realpath = await provider.realpath(resource);
      return resource.with({ path: realpath });
    }
    return void 0;
  }
  async exists(resource) {
    const provider = await this.withProvider(resource);
    try {
      const stat = await provider.stat(resource);
      return !!stat;
    } catch (error) {
      return false;
    }
  }
  //#endregion
  //#region File Reading/Writing
  async canCreateFile(resource, options) {
    try {
      await this.doValidateCreateFile(resource, options);
    } catch (error) {
      return error;
    }
    return true;
  }
  async doValidateCreateFile(resource, options) {
    if (!options?.overwrite && await this.exists(resource)) {
      throw new FileOperationError(localize("fileExists", "Unable to create file '{0}' that already exists when overwrite flag is not set", this.resourceForError(resource)), FileOperationResult.FILE_MODIFIED_SINCE, options);
    }
  }
  async createFile(resource, bufferOrReadableOrStream = VSBuffer.fromString(""), options) {
    await this.doValidateCreateFile(resource, options);
    const fileStat = await this.writeFile(resource, bufferOrReadableOrStream);
    this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, fileStat));
    return fileStat;
  }
  async writeFile(resource, bufferOrReadableOrStream, options) {
    const provider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(resource), resource);
    const { providerExtUri } = this.getExtUri(provider);
    let writeFileOptions = options;
    if (hasFileAtomicWriteCapability(provider) && !writeFileOptions?.atomic) {
      const enforcedAtomicWrite = provider.enforceAtomicWriteFile?.(resource);
      if (enforcedAtomicWrite) {
        writeFileOptions = { ...options, atomic: enforcedAtomicWrite };
      }
    }
    try {
      let { stat, buffer: bufferOrReadableOrStreamOrBufferedStream } = await this.validateWriteFile(provider, resource, bufferOrReadableOrStream, writeFileOptions);
      if (!stat) {
        await this.mkdirp(provider, providerExtUri.dirname(resource));
      }
      if (!bufferOrReadableOrStreamOrBufferedStream) {
        bufferOrReadableOrStreamOrBufferedStream = await this.peekBufferForWriting(provider, bufferOrReadableOrStream);
      }
      if (!hasOpenReadWriteCloseCapability(provider) || // buffered writing is unsupported
      hasReadWriteCapability(provider) && bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer || // data is a full buffer already
      hasReadWriteCapability(provider) && hasFileAtomicWriteCapability(provider) && writeFileOptions?.atomic) {
        await this.doWriteUnbuffered(provider, resource, writeFileOptions, bufferOrReadableOrStreamOrBufferedStream);
      } else {
        await this.doWriteBuffered(provider, resource, writeFileOptions, bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer ? bufferToReadable(bufferOrReadableOrStreamOrBufferedStream) : bufferOrReadableOrStreamOrBufferedStream);
      }
      this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.WRITE));
    } catch (error) {
      throw new FileOperationError(localize("err.write", "Unable to write file '{0}' ({1})", this.resourceForError(resource), ensureFileSystemProviderError(error).toString()), toFileOperationResult(error), writeFileOptions);
    }
    return this.resolve(resource, { resolveMetadata: true });
  }
  async peekBufferForWriting(provider, bufferOrReadableOrStream) {
    let peekResult;
    if (hasReadWriteCapability(provider) && !(bufferOrReadableOrStream instanceof VSBuffer)) {
      if (isReadableStream(bufferOrReadableOrStream)) {
        const bufferedStream = await peekStream(bufferOrReadableOrStream, 3);
        if (bufferedStream.ended) {
          peekResult = VSBuffer.concat(bufferedStream.buffer);
        } else {
          peekResult = bufferedStream;
        }
      } else {
        peekResult = peekReadable(bufferOrReadableOrStream, (data) => VSBuffer.concat(data), 3);
      }
    } else {
      peekResult = bufferOrReadableOrStream;
    }
    return peekResult;
  }
  async validateWriteFile(provider, resource, bufferOrReadableOrStream, options) {
    const unlock = !!options?.unlock;
    if (unlock && !(provider.capabilities & FileSystemProviderCapabilities.FileWriteUnlock)) {
      throw new Error(localize("writeFailedUnlockUnsupported", "Unable to unlock file '{0}' because provider does not support it.", this.resourceForError(resource)));
    }
    if (options?.append && !hasFileAppendCapability(provider)) {
      throw new FileOperationError(localize("err.noAppend", "Filesystem provider for scheme '{0}' does not does not support append", this.resourceForError(resource)), FileOperationResult.FILE_PERMISSION_DENIED);
    }
    const atomic = !!options?.atomic;
    if (atomic) {
      if (!(provider.capabilities & FileSystemProviderCapabilities.FileAtomicWrite)) {
        throw new Error(localize("writeFailedAtomicUnsupported1", "Unable to atomically write file '{0}' because provider does not support it.", this.resourceForError(resource)));
      }
      if (!(provider.capabilities & FileSystemProviderCapabilities.FileReadWrite)) {
        throw new Error(localize("writeFailedAtomicUnsupported2", "Unable to atomically write file '{0}' because provider does not support unbuffered writes.", this.resourceForError(resource)));
      }
      if (unlock) {
        throw new Error(localize("writeFailedAtomicUnlock", "Unable to unlock file '{0}' because atomic write is enabled.", this.resourceForError(resource)));
      }
    }
    let stat = void 0;
    try {
      stat = await provider.stat(resource);
    } catch (error) {
      return /* @__PURE__ */ Object.create(null);
    }
    if ((stat.type & FileType.Directory) !== 0) {
      throw new FileOperationError(localize("fileIsDirectoryWriteError", "Unable to write file '{0}' that is actually a directory", this.resourceForError(resource)), FileOperationResult.FILE_IS_DIRECTORY, options);
    }
    this.throwIfFileIsReadonly(resource, stat);
    let buffer;
    if (typeof options?.mtime === "number" && typeof options.etag === "string" && options.etag !== ETAG_DISABLED && typeof stat.mtime === "number" && typeof stat.size === "number" && options.mtime < stat.mtime && options.etag !== etag({ mtime: options.mtime, size: stat.size })) {
      buffer = await this.peekBufferForWriting(provider, bufferOrReadableOrStream);
      if (buffer instanceof VSBuffer && buffer.byteLength === stat.size) {
        try {
          const { value } = await this.readFile(resource, { limits: { size: stat.size } });
          if (buffer.equals(value)) {
            return { stat, buffer };
          }
        } catch (error) {
        }
      }
      throw new FileOperationError(localize("fileModifiedError", "File Modified Since"), FileOperationResult.FILE_MODIFIED_SINCE, options);
    }
    return { stat, buffer };
  }
  async readFile(resource, options, token) {
    const provider = await this.withReadProvider(resource);
    if (options?.atomic) {
      return this.doReadFileAtomic(provider, resource, options, token);
    }
    return this.doReadFile(provider, resource, options, token);
  }
  async doReadFileAtomic(provider, resource, options, token) {
    return new Promise((resolve, reject) => {
      this.writeQueue.queueFor(resource, async () => {
        try {
          const content = await this.doReadFile(provider, resource, options, token);
          resolve(content);
        } catch (error) {
          reject(error);
        }
      }, this.getExtUri(provider).providerExtUri);
    });
  }
  async doReadFile(provider, resource, options, token) {
    const stream = await this.doReadFileStream(provider, resource, {
      ...options,
      // optimization: since we know that the caller does not
      // care about buffering, we indicate this to the reader.
      // this reduces all the overhead the buffered reading
      // has (open, read, close) if the provider supports
      // unbuffered reading.
      preferUnbuffered: true
    }, token);
    return {
      ...stream,
      value: await streamToBuffer(stream.value)
    };
  }
  async readFileStream(resource, options, token) {
    const provider = await this.withReadProvider(resource);
    return this.doReadFileStream(provider, resource, options, token);
  }
  async doReadFileStream(provider, resource, options, token) {
    const cancellableSource = new CancellationTokenSource(token);
    let readFileOptions = options;
    if (hasFileAtomicReadCapability(provider) && provider.enforceAtomicReadFile?.(resource)) {
      readFileOptions = { ...options, atomic: true };
    }
    const statPromise = this.validateReadFile(resource, readFileOptions).then((stat) => stat, (error) => {
      cancellableSource.dispose(true);
      throw error;
    });
    let fileStream = void 0;
    try {
      if (typeof readFileOptions?.etag === "string" && readFileOptions.etag !== ETAG_DISABLED) {
        await statPromise;
      }
      if (readFileOptions?.atomic && hasFileAtomicReadCapability(provider) || // atomic reads are always unbuffered
      !(hasOpenReadWriteCloseCapability(provider) || hasFileReadStreamCapability(provider)) || // provider has no buffered capability
      hasReadWriteCapability(provider) && readFileOptions?.preferUnbuffered) {
        fileStream = this.readFileUnbuffered(provider, resource, readFileOptions);
      } else if (hasFileReadStreamCapability(provider)) {
        fileStream = this.readFileStreamed(provider, resource, cancellableSource.token, readFileOptions);
      } else {
        fileStream = this.readFileBuffered(provider, resource, cancellableSource.token, readFileOptions);
      }
      fileStream.on("end", () => cancellableSource.dispose());
      fileStream.on("error", () => cancellableSource.dispose());
      const fileStat = await statPromise;
      return {
        ...fileStat,
        value: fileStream
      };
    } catch (error) {
      if (fileStream) {
        await consumeStream(fileStream);
      }
      throw this.restoreReadError(error, resource, readFileOptions);
    }
  }
  restoreReadError(error, resource, options) {
    const message = localize("err.read", "Unable to read file '{0}' ({1})", this.resourceForError(resource), ensureFileSystemProviderError(error).toString());
    if (error instanceof NotModifiedSinceFileOperationError) {
      return new NotModifiedSinceFileOperationError(message, error.stat, options);
    }
    if (error instanceof TooLargeFileOperationError) {
      return new TooLargeFileOperationError(message, error.fileOperationResult, error.size, error.options);
    }
    return new FileOperationError(message, toFileOperationResult(error), options);
  }
  readFileStreamed(provider, resource, token, options = /* @__PURE__ */ Object.create(null)) {
    const fileStream = provider.readFileStream(resource, options, token);
    return transform(fileStream, {
      data: (data) => data instanceof VSBuffer ? data : VSBuffer.wrap(data),
      error: (error) => this.restoreReadError(error, resource, options)
    }, (data) => VSBuffer.concat(data));
  }
  readFileBuffered(provider, resource, token, options = /* @__PURE__ */ Object.create(null)) {
    const stream = newWriteableBufferStream();
    readFileIntoStream(provider, resource, stream, (data) => data, {
      ...options,
      bufferSize: this.BUFFER_SIZE,
      errorTransformer: (error) => this.restoreReadError(error, resource, options)
    }, token);
    return stream;
  }
  readFileUnbuffered(provider, resource, options) {
    const stream = newWriteableStream((data) => VSBuffer.concat(data));
    (async () => {
      try {
        let buffer;
        if (options?.atomic && hasFileAtomicReadCapability(provider)) {
          buffer = await provider.readFile(resource, { atomic: true });
        } else {
          buffer = await provider.readFile(resource);
        }
        if (typeof options?.position === "number") {
          buffer = buffer.slice(options.position);
        }
        if (typeof options?.length === "number") {
          buffer = buffer.slice(0, options.length);
        }
        this.validateReadFileLimits(resource, buffer.byteLength, options);
        stream.end(VSBuffer.wrap(buffer));
      } catch (err) {
        stream.error(err);
        stream.end();
      }
    })();
    return stream;
  }
  async validateReadFile(resource, options) {
    const stat = await this.resolve(resource, { resolveMetadata: true });
    if (stat.isDirectory) {
      throw new FileOperationError(localize("fileIsDirectoryReadError", "Unable to read file '{0}' that is actually a directory", this.resourceForError(resource)), FileOperationResult.FILE_IS_DIRECTORY, options);
    }
    if (typeof options?.etag === "string" && options.etag !== ETAG_DISABLED && options.etag === stat.etag) {
      throw new NotModifiedSinceFileOperationError(localize("fileNotModifiedError", "File not modified since"), stat, options);
    }
    this.validateReadFileLimits(resource, stat.size, options);
    return stat;
  }
  validateReadFileLimits(resource, size, options) {
    if (typeof options?.limits?.size === "number" && size > options.limits.size) {
      throw new TooLargeFileOperationError(localize("fileTooLargeError", "Unable to read file '{0}' that is too large to open", this.resourceForError(resource)), FileOperationResult.FILE_TOO_LARGE, size, options);
    }
  }
  //#endregion
  //#region Move/Copy/Delete/Create Folder
  async canMove(source, target, overwrite) {
    return this.doCanMoveCopy(source, target, "move", overwrite);
  }
  async canCopy(source, target, overwrite) {
    return this.doCanMoveCopy(source, target, "copy", overwrite);
  }
  async doCanMoveCopy(source, target, mode, overwrite) {
    if (source.toString() !== target.toString()) {
      try {
        const sourceProvider = mode === "move" ? this.throwIfFileSystemIsReadonly(await this.withWriteProvider(source), source) : await this.withReadProvider(source);
        const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
        await this.doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite);
      } catch (error) {
        return error;
      }
    }
    return true;
  }
  async move(source, target, overwrite) {
    const sourceProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(source), source);
    const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
    const mode = await this.doMoveCopy(sourceProvider, source, targetProvider, target, "move", !!overwrite);
    const fileStat = await this.resolve(target, { resolveMetadata: true });
    this._onDidRunOperation.fire(new FileOperationEvent(source, mode === "move" ? FileOperation.MOVE : FileOperation.COPY, fileStat));
    return fileStat;
  }
  async copy(source, target, overwrite) {
    const sourceProvider = await this.withReadProvider(source);
    const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
    const mode = await this.doMoveCopy(sourceProvider, source, targetProvider, target, "copy", !!overwrite);
    const fileStat = await this.resolve(target, { resolveMetadata: true });
    this._onDidRunOperation.fire(new FileOperationEvent(source, mode === "copy" ? FileOperation.COPY : FileOperation.MOVE, fileStat));
    return fileStat;
  }
  async doMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite) {
    if (source.toString() === target.toString()) {
      return mode;
    }
    const { exists, isSameResourceWithDifferentPathCase } = await this.doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite);
    if (exists && !isSameResourceWithDifferentPathCase && overwrite) {
      await this.del(target, { recursive: true });
    }
    await this.mkdirp(targetProvider, this.getExtUri(targetProvider).providerExtUri.dirname(target));
    if (mode === "copy") {
      if (sourceProvider === targetProvider && hasFileFolderCopyCapability(sourceProvider)) {
        await sourceProvider.copy(source, target, { overwrite });
      } else {
        const sourceFile = await this.resolve(source);
        if (sourceFile.isDirectory) {
          await this.doCopyFolder(sourceProvider, sourceFile, targetProvider, target);
        } else {
          await this.doCopyFile(sourceProvider, source, targetProvider, target);
        }
      }
      return mode;
    } else {
      if (sourceProvider === targetProvider) {
        await sourceProvider.rename(source, target, { overwrite });
        return mode;
      } else {
        await this.doMoveCopy(sourceProvider, source, targetProvider, target, "copy", overwrite);
        await this.del(source, { recursive: true });
        return "copy";
      }
    }
  }
  async doCopyFile(sourceProvider, source, targetProvider, target) {
    if (hasOpenReadWriteCloseCapability(sourceProvider) && hasOpenReadWriteCloseCapability(targetProvider)) {
      return this.doPipeBuffered(sourceProvider, source, targetProvider, target);
    }
    if (hasOpenReadWriteCloseCapability(sourceProvider) && hasReadWriteCapability(targetProvider)) {
      return this.doPipeBufferedToUnbuffered(sourceProvider, source, targetProvider, target);
    }
    if (hasReadWriteCapability(sourceProvider) && hasOpenReadWriteCloseCapability(targetProvider)) {
      return this.doPipeUnbufferedToBuffered(sourceProvider, source, targetProvider, target);
    }
    if (hasReadWriteCapability(sourceProvider) && hasReadWriteCapability(targetProvider)) {
      return this.doPipeUnbuffered(sourceProvider, source, targetProvider, target);
    }
  }
  async doCopyFolder(sourceProvider, sourceFolder, targetProvider, targetFolder) {
    await targetProvider.mkdir(targetFolder);
    if (Array.isArray(sourceFolder.children)) {
      await Promises.settled(sourceFolder.children.map(async (sourceChild) => {
        const targetChild = this.getExtUri(targetProvider).providerExtUri.joinPath(targetFolder, sourceChild.name);
        if (sourceChild.isDirectory) {
          return this.doCopyFolder(sourceProvider, await this.resolve(sourceChild.resource), targetProvider, targetChild);
        } else {
          return this.doCopyFile(sourceProvider, sourceChild.resource, targetProvider, targetChild);
        }
      }));
    }
  }
  async doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite) {
    let isSameResourceWithDifferentPathCase = false;
    if (sourceProvider === targetProvider) {
      const { providerExtUri, isPathCaseSensitive } = this.getExtUri(sourceProvider);
      if (!isPathCaseSensitive) {
        isSameResourceWithDifferentPathCase = providerExtUri.isEqual(source, target);
      }
      if (isSameResourceWithDifferentPathCase && mode === "copy") {
        throw new Error(localize("unableToMoveCopyError1", "Unable to copy when source '{0}' is same as target '{1}' with different path case on a case insensitive file system", this.resourceForError(source), this.resourceForError(target)));
      }
      if (!isSameResourceWithDifferentPathCase && providerExtUri.isEqualOrParent(target, source)) {
        throw new Error(localize("unableToMoveCopyError2", "Unable to move/copy when source '{0}' is parent of target '{1}'.", this.resourceForError(source), this.resourceForError(target)));
      }
    }
    const exists = await this.exists(target);
    if (exists && !isSameResourceWithDifferentPathCase) {
      if (!overwrite) {
        throw new FileOperationError(localize("unableToMoveCopyError3", "Unable to move/copy '{0}' because target '{1}' already exists at destination.", this.resourceForError(source), this.resourceForError(target)), FileOperationResult.FILE_MOVE_CONFLICT);
      }
      if (sourceProvider === targetProvider) {
        const { providerExtUri } = this.getExtUri(sourceProvider);
        if (providerExtUri.isEqualOrParent(source, target)) {
          throw new Error(localize("unableToMoveCopyError4", "Unable to move/copy '{0}' into '{1}' since a file would replace the folder it is contained in.", this.resourceForError(source), this.resourceForError(target)));
        }
      }
    }
    return { exists, isSameResourceWithDifferentPathCase };
  }
  getExtUri(provider) {
    const isPathCaseSensitive = this.isPathCaseSensitive(provider);
    return {
      providerExtUri: isPathCaseSensitive ? extUri : extUriIgnorePathCase,
      isPathCaseSensitive
    };
  }
  isPathCaseSensitive(provider) {
    return !!(provider.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
  }
  async createFolder(resource) {
    const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource), resource);
    await this.mkdirp(provider, resource);
    const fileStat = await this.resolve(resource, { resolveMetadata: true });
    this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, fileStat));
    return fileStat;
  }
  async mkdirp(provider, directory) {
    const directoriesToCreate = [];
    const { providerExtUri } = this.getExtUri(provider);
    while (!providerExtUri.isEqual(directory, providerExtUri.dirname(directory))) {
      try {
        const stat = await provider.stat(directory);
        if ((stat.type & FileType.Directory) === 0) {
          throw new Error(localize("mkdirExistsError", "Unable to create folder '{0}' that already exists but is not a directory", this.resourceForError(directory)));
        }
        break;
      } catch (error) {
        if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileNotFound) {
          throw error;
        }
        directoriesToCreate.push(providerExtUri.basename(directory));
        directory = providerExtUri.dirname(directory);
      }
    }
    for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
      directory = providerExtUri.joinPath(directory, directoriesToCreate[i]);
      try {
        await provider.mkdir(directory);
      } catch (error) {
        if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileExists) {
          throw error;
        }
      }
    }
  }
  async canDelete(resource, options) {
    try {
      await this.doValidateDelete(resource, options);
    } catch (error) {
      return error;
    }
    return true;
  }
  async doValidateDelete(resource, options) {
    const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource), resource);
    const useTrash = !!options?.useTrash;
    if (useTrash && !(provider.capabilities & FileSystemProviderCapabilities.Trash)) {
      throw new Error(localize("deleteFailedTrashUnsupported", "Unable to delete file '{0}' via trash because provider does not support it.", this.resourceForError(resource)));
    }
    const atomic = options?.atomic;
    if (atomic && !(provider.capabilities & FileSystemProviderCapabilities.FileAtomicDelete)) {
      throw new Error(localize("deleteFailedAtomicUnsupported", "Unable to delete file '{0}' atomically because provider does not support it.", this.resourceForError(resource)));
    }
    if (useTrash && atomic) {
      throw new Error(localize("deleteFailedTrashAndAtomicUnsupported", "Unable to atomically delete file '{0}' because using trash is enabled.", this.resourceForError(resource)));
    }
    let stat = void 0;
    try {
      stat = await provider.stat(resource);
    } catch (error) {
    }
    if (stat) {
      this.throwIfFileIsReadonly(resource, stat);
    } else {
      throw new FileOperationError(localize("deleteFailedNotFound", "Unable to delete nonexistent file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_NOT_FOUND);
    }
    const recursive = !!options?.recursive;
    if (!recursive) {
      const stat2 = await this.resolve(resource);
      if (stat2.isDirectory && Array.isArray(stat2.children) && stat2.children.length > 0) {
        throw new Error(localize("deleteFailedNonEmptyFolder", "Unable to delete non-empty folder '{0}'.", this.resourceForError(resource)));
      }
    }
    return provider;
  }
  async del(resource, options) {
    const provider = await this.doValidateDelete(resource, options);
    let deleteFileOptions = options;
    if (hasFileAtomicDeleteCapability(provider) && !deleteFileOptions?.atomic) {
      const enforcedAtomicDelete = provider.enforceAtomicDelete?.(resource);
      if (enforcedAtomicDelete) {
        deleteFileOptions = { ...options, atomic: enforcedAtomicDelete };
      }
    }
    const useTrash = !!deleteFileOptions?.useTrash;
    const recursive = !!deleteFileOptions?.recursive;
    const atomic = deleteFileOptions?.atomic ?? false;
    await provider.delete(resource, { recursive, useTrash, atomic });
    this._onDidRunOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));
  }
  //#endregion
  //#region Clone File
  async cloneFile(source, target) {
    const sourceProvider = await this.withProvider(source);
    const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
    if (sourceProvider === targetProvider && this.getExtUri(sourceProvider).providerExtUri.isEqual(source, target)) {
      return;
    }
    if (sourceProvider === targetProvider && hasFileCloneCapability(sourceProvider)) {
      return sourceProvider.cloneFile(source, target);
    }
    await this.mkdirp(targetProvider, this.getExtUri(targetProvider).providerExtUri.dirname(target));
    if (sourceProvider === targetProvider && hasFileFolderCopyCapability(sourceProvider)) {
      return this.writeQueue.queueFor(source, () => sourceProvider.copy(source, target, { overwrite: true }), this.getExtUri(sourceProvider).providerExtUri);
    }
    return this.writeQueue.queueFor(source, () => this.doCopyFile(sourceProvider, source, targetProvider, target), this.getExtUri(sourceProvider).providerExtUri);
  }
  createWatcher(resource, options) {
    return this.watch(resource, {
      ...options,
      // Explicitly set a correlation id so that file events that originate
      // from requests from extensions are exclusively routed back to the
      // extension host and not into the workbench.
      correlationId: FileService.WATCHER_CORRELATION_IDS++
    });
  }
  watch(resource, options = { recursive: false, excludes: [] }) {
    const disposables = new DisposableStore();
    let watchDisposed = false;
    let disposeWatch = () => {
      watchDisposed = true;
    };
    disposables.add(toDisposable(() => disposeWatch()));
    (async () => {
      try {
        const disposable = await this.doWatch(resource, options);
        if (watchDisposed) {
          dispose(disposable);
        } else {
          disposeWatch = () => dispose(disposable);
        }
      } catch (error) {
        this.logService.error(error);
      }
    })();
    const correlationId = options.correlationId;
    if (typeof correlationId === "number") {
      const fileChangeEmitter = disposables.add(new Emitter());
      disposables.add(this.internalOnDidFilesChange.event((e) => {
        if (e.correlates(correlationId)) {
          fileChangeEmitter.fire(e);
        }
      }));
      const watcher = {
        onDidChange: fileChangeEmitter.event,
        dispose: () => disposables.dispose()
      };
      return watcher;
    }
    return disposables;
  }
  async doWatch(resource, options) {
    const provider = await this.withProvider(resource);
    const watchHash = hash([this.getExtUri(provider).providerExtUri.getComparisonKey(resource), options]);
    let watcher = this.activeWatchers.get(watchHash);
    if (!watcher) {
      watcher = {
        count: 0,
        disposable: provider.watch(resource, options)
      };
      this.activeWatchers.set(watchHash, watcher);
    }
    watcher.count += 1;
    return toDisposable(() => {
      if (watcher) {
        watcher.count--;
        if (watcher.count === 0) {
          dispose(watcher.disposable);
          this.activeWatchers.delete(watchHash);
        }
      }
    });
  }
  dispose() {
    super.dispose();
    for (const [, watcher] of this.activeWatchers) {
      dispose(watcher.disposable);
    }
    this.activeWatchers.clear();
  }
  async doWriteBuffered(provider, resource, options, readableOrStreamOrBufferedStream) {
    return this.writeQueue.queueFor(resource, async () => {
      const handle = await provider.open(resource, { create: true, unlock: options?.unlock ?? false, append: options?.append ?? false });
      try {
        if (isReadableStream(readableOrStreamOrBufferedStream) || isReadableBufferedStream(readableOrStreamOrBufferedStream)) {
          await this.doWriteStreamBufferedQueued(provider, handle, readableOrStreamOrBufferedStream);
        } else {
          await this.doWriteReadableBufferedQueued(provider, handle, readableOrStreamOrBufferedStream);
        }
      } catch (error) {
        throw ensureFileSystemProviderError(error);
      } finally {
        await provider.close(handle);
      }
    }, this.getExtUri(provider).providerExtUri);
  }
  async doWriteStreamBufferedQueued(provider, handle, streamOrBufferedStream) {
    let posInFile = 0;
    let stream;
    if (isReadableBufferedStream(streamOrBufferedStream)) {
      if (streamOrBufferedStream.buffer.length > 0) {
        const chunk = VSBuffer.concat(streamOrBufferedStream.buffer);
        await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
        posInFile += chunk.byteLength;
      }
      if (streamOrBufferedStream.ended) {
        return;
      }
      stream = streamOrBufferedStream.stream;
    } else {
      stream = streamOrBufferedStream;
    }
    return new Promise((resolve, reject) => {
      listenStream(stream, {
        onData: async (chunk) => {
          stream.pause();
          try {
            await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
          } catch (error) {
            return reject(error);
          }
          posInFile += chunk.byteLength;
          setTimeout(() => stream.resume());
        },
        onError: (error) => reject(error),
        onEnd: () => resolve()
      });
    });
  }
  async doWriteReadableBufferedQueued(provider, handle, readable) {
    let posInFile = 0;
    let chunk;
    while ((chunk = readable.read()) !== null) {
      await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
      posInFile += chunk.byteLength;
    }
  }
  async doWriteBuffer(provider, handle, buffer, length, posInFile, posInBuffer) {
    let totalBytesWritten = 0;
    while (totalBytesWritten < length) {
      const bytesWritten = await provider.write(handle, posInFile + totalBytesWritten, buffer.buffer, posInBuffer + totalBytesWritten, length - totalBytesWritten);
      totalBytesWritten += bytesWritten;
    }
  }
  async doWriteUnbuffered(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream) {
    return this.writeQueue.queueFor(resource, () => this.doWriteUnbufferedQueued(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream), this.getExtUri(provider).providerExtUri);
  }
  async doWriteUnbufferedQueued(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream) {
    let buffer;
    if (bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer) {
      buffer = bufferOrReadableOrStreamOrBufferedStream;
    } else if (isReadableStream(bufferOrReadableOrStreamOrBufferedStream)) {
      buffer = await streamToBuffer(bufferOrReadableOrStreamOrBufferedStream);
    } else if (isReadableBufferedStream(bufferOrReadableOrStreamOrBufferedStream)) {
      buffer = await bufferedStreamToBuffer(bufferOrReadableOrStreamOrBufferedStream);
    } else {
      buffer = readableToBuffer(bufferOrReadableOrStreamOrBufferedStream);
    }
    await provider.writeFile(resource, buffer.buffer, { create: true, overwrite: true, unlock: options?.unlock ?? false, atomic: options?.atomic ?? false, append: options?.append ?? false });
  }
  async doPipeBuffered(sourceProvider, source, targetProvider, target) {
    return this.writeQueue.queueFor(target, () => this.doPipeBufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
  }
  async doPipeBufferedQueued(sourceProvider, source, targetProvider, target) {
    let sourceHandle = void 0;
    let targetHandle = void 0;
    try {
      sourceHandle = await sourceProvider.open(source, { create: false });
      targetHandle = await targetProvider.open(target, { create: true, unlock: false });
      const buffer = VSBuffer.alloc(this.BUFFER_SIZE);
      let posInFile = 0;
      let posInBuffer = 0;
      let bytesRead = 0;
      do {
        bytesRead = await sourceProvider.read(sourceHandle, posInFile, buffer.buffer, posInBuffer, buffer.byteLength - posInBuffer);
        await this.doWriteBuffer(targetProvider, targetHandle, buffer, bytesRead, posInFile, posInBuffer);
        posInFile += bytesRead;
        posInBuffer += bytesRead;
        if (posInBuffer === buffer.byteLength) {
          posInBuffer = 0;
        }
      } while (bytesRead > 0);
    } catch (error) {
      throw ensureFileSystemProviderError(error);
    } finally {
      await Promises.settled([
        typeof sourceHandle === "number" ? sourceProvider.close(sourceHandle) : Promise.resolve(),
        typeof targetHandle === "number" ? targetProvider.close(targetHandle) : Promise.resolve()
      ]);
    }
  }
  async doPipeUnbuffered(sourceProvider, source, targetProvider, target) {
    return this.writeQueue.queueFor(target, () => this.doPipeUnbufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
  }
  async doPipeUnbufferedQueued(sourceProvider, source, targetProvider, target) {
    return targetProvider.writeFile(target, await sourceProvider.readFile(source), { create: true, overwrite: true, unlock: false, atomic: false });
  }
  async doPipeUnbufferedToBuffered(sourceProvider, source, targetProvider, target) {
    return this.writeQueue.queueFor(target, () => this.doPipeUnbufferedToBufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
  }
  async doPipeUnbufferedToBufferedQueued(sourceProvider, source, targetProvider, target) {
    const targetHandle = await targetProvider.open(target, { create: true, unlock: false });
    try {
      const buffer = await sourceProvider.readFile(source);
      await this.doWriteBuffer(targetProvider, targetHandle, VSBuffer.wrap(buffer), buffer.byteLength, 0, 0);
    } catch (error) {
      throw ensureFileSystemProviderError(error);
    } finally {
      await targetProvider.close(targetHandle);
    }
  }
  async doPipeBufferedToUnbuffered(sourceProvider, source, targetProvider, target) {
    const buffer = await streamToBuffer(this.readFileBuffered(sourceProvider, source, CancellationToken.None));
    await this.doWriteUnbuffered(targetProvider, target, void 0, buffer);
  }
  throwIfFileSystemIsReadonly(provider, resource) {
    if (provider.capabilities & FileSystemProviderCapabilities.Readonly) {
      throw new FileOperationError(localize("err.readonly", "Unable to modify read-only file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_PERMISSION_DENIED);
    }
    return provider;
  }
  throwIfFileIsReadonly(resource, stat) {
    if ((stat.permissions ?? 0) & FilePermission.Readonly) {
      throw new FileOperationError(localize("err.readonly", "Unable to modify read-only file '{0}'", this.resourceForError(resource)), FileOperationResult.FILE_PERMISSION_DENIED);
    }
  }
  resourceForError(resource) {
    if (resource.scheme === Schemas.file) {
      return resource.fsPath;
    }
    return resource.toString(true);
  }
  //#endregion
};
FileService.WATCHER_CORRELATION_IDS = 0;
FileService = __decorateClass([
  __decorateParam(0, ILogService)
], FileService);
export {
  FileService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSZXNvdXJjZVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYnVmZmVyZWRTdHJlYW1Ub0J1ZmZlciwgYnVmZmVyVG9SZWFkYWJsZSwgbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtLCByZWFkYWJsZVRvQnVmZmVyLCBzdHJlYW1Ub0J1ZmZlciwgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGUsIFZTQnVmZmVyUmVhZGFibGVCdWZmZXJlZFN0cmVhbSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IGV4dFVyaSwgZXh0VXJpSWdub3JlUGF0aENhc2UsIElFeHRVcmksIGlzQWJzb2x1dGVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGNvbnN1bWVTdHJlYW0sIGlzUmVhZGFibGVCdWZmZXJlZFN0cmVhbSwgaXNSZWFkYWJsZVN0cmVhbSwgbGlzdGVuU3RyZWFtLCBuZXdXcml0ZWFibGVTdHJlYW0sIHBlZWtSZWFkYWJsZSwgcGVla1N0cmVhbSwgdHJhbnNmb3JtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciwgZXRhZywgRVRBR19ESVNBQkxFRCwgRmlsZUNoYW5nZXNFdmVudCwgSUZpbGVEZWxldGVPcHRpb25zLCBGaWxlT3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25FdmVudCwgRmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZVBlcm1pc3Npb24sIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLCBGaWxlVHlwZSwgaGFzRmlsZUFwcGVuZENhcGFiaWxpdHksIGhhc0ZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eSwgaGFzRmlsZUZvbGRlckNvcHlDYXBhYmlsaXR5LCBoYXNGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIGhhc1JlYWRXcml0ZUNhcGFiaWxpdHksIElDcmVhdGVGaWxlT3B0aW9ucywgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdCwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBJRmlsZVN0cmVhbUNvbnRlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXIsIElGaWxlU3lzdGVtUHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudCwgSUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgSVJlYWRGaWxlT3B0aW9ucywgSVJlYWRGaWxlU3RyZWFtT3B0aW9ucywgSVJlc29sdmVGaWxlT3B0aW9ucywgSUZpbGVTdGF0UmVzdWx0LCBJRmlsZVN0YXRSZXN1bHRXaXRoTWV0YWRhdGEsIElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucywgSVN0YXQsIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEsIElXYXRjaE9wdGlvbnMsIElXcml0ZUZpbGVPcHRpb25zLCBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQsIHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLCBoYXNGaWxlQ2xvbmVDYXBhYmlsaXR5LCBUb29MYXJnZUZpbGVPcGVyYXRpb25FcnJvciwgaGFzRmlsZUF0b21pY0RlbGV0ZUNhcGFiaWxpdHksIGhhc0ZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHksIElXYXRjaE9wdGlvbnNXaXRoQ29ycmVsYXRpb24sIElGaWxlU3lzdGVtV2F0Y2hlciwgSVdhdGNoT3B0aW9uc1dpdGhvdXRDb3JyZWxhdGlvbiwgaGFzRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eSB9IGZyb20gJy4vZmlsZXMuanMnO1xuaW1wb3J0IHsgcmVhZEZpbGVJbnRvU3RyZWFtIH0gZnJvbSAnLi9pby5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEVycm9yTm9UZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgRmlsZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUZpbGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvLyBDaG9vc2UgYSBidWZmZXIgc2l6ZSB0aGF0IGlzIGEgYmFsYW5jZSBiZXR3ZWVuIG1lbW9yeSBuZWVkcyBhbmRcblx0Ly8gbWFuYWdlYWJsZSBJUEMgb3ZlcmhlYWQuIFRoZSBsYXJnZXIgdGhlIGJ1ZmZlciBzaXplLCB0aGUgbGVzc1xuXHQvLyByb3VuZHRyaXBzIHdlIGhhdmUgdG8gZG8gZm9yIHJlYWRpbmcvd3JpdGluZyBkYXRhLlxuXHRwcml2YXRlIHJlYWRvbmx5IEJVRkZFUl9TSVpFID0gMjU2ICogMTAyNDtcblxuXHRjb25zdHJ1Y3RvcihASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gRmlsZSBTeXN0ZW0gUHJvdmlkZXJcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRmlsZVN5c3RlbVByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXIgPSB0aGlzLl9vbldpbGxBY3RpdmF0ZUZpbGVTeXN0ZW1Qcm92aWRlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzID0gdGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlciA9IG5ldyBNYXA8c3RyaW5nLCBJRmlsZVN5c3RlbVByb3ZpZGVyPigpO1xuXG5cdHJlZ2lzdGVyUHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLnByb3ZpZGVyLmhhcyhzY2hlbWUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEEgZmlsZXN5c3RlbSBwcm92aWRlciBmb3IgdGhlIHNjaGVtZSAnJHtzY2hlbWV9JyBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXG5cdFx0bWFyayhgY29kZS9yZWdpc3RlckZpbGVzeXN0ZW0vJHtzY2hlbWV9YCk7XG5cblx0XHRjb25zdCBwcm92aWRlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gQWRkIHByb3ZpZGVyIHdpdGggZXZlbnRcblx0XHR0aGlzLnByb3ZpZGVyLnNldChzY2hlbWUsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMuZmlyZSh7IGFkZGVkOiB0cnVlLCBzY2hlbWUsIHByb3ZpZGVyIH0pO1xuXG5cdFx0Ly8gRm9yd2FyZCBldmVudHMgZnJvbSBwcm92aWRlclxuXHRcdHByb3ZpZGVyRGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlRmlsZShjaGFuZ2VzID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IEZpbGVDaGFuZ2VzRXZlbnQoY2hhbmdlcywgIXRoaXMuaXNQYXRoQ2FzZVNlbnNpdGl2ZShwcm92aWRlcikpO1xuXG5cdFx0XHQvLyBBbHdheXMgZW1pdCBhbnkgZXZlbnQgaW50ZXJuYWxseVxuXHRcdFx0dGhpcy5pbnRlcm5hbE9uRGlkRmlsZXNDaGFuZ2UuZmlyZShldmVudCk7XG5cblx0XHRcdC8vIE9ubHkgZW1pdCB1bmNvcnJlbGF0ZWQgZXZlbnRzIGluIHRoZSBnbG9iYWwgYG9uRGlkRmlsZXNDaGFuZ2VgIGV2ZW50XG5cdFx0XHRpZiAoIWV2ZW50Lmhhc0NvcnJlbGF0aW9uKCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRVbmNvcnJlbGF0ZWRGaWxlc0NoYW5nZS5maXJlKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKHR5cGVvZiBwcm92aWRlci5vbkRpZFdhdGNoRXJyb3IgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHByb3ZpZGVyRGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkV2F0Y2hFcnJvcihlcnJvciA9PiB0aGlzLl9vbkRpZFdhdGNoRXJyb3IuZmlyZShuZXcgRXJyb3IoZXJyb3IpKSkpO1xuXHRcdH1cblx0XHRwcm92aWRlckRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUNhcGFiaWxpdGllcygoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5maXJlKHsgcHJvdmlkZXIsIHNjaGVtZSB9KSkpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMuZmlyZSh7IGFkZGVkOiBmYWxzZSwgc2NoZW1lLCBwcm92aWRlciB9KTtcblx0XHRcdHRoaXMucHJvdmlkZXIuZGVsZXRlKHNjaGVtZSk7XG5cblx0XHRcdGRpc3Bvc2UocHJvdmlkZXJEaXNwb3NhYmxlcyk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRQcm92aWRlcihzY2hlbWU6IHN0cmluZyk6IElGaWxlU3lzdGVtUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByb3ZpZGVyLmdldChzY2hlbWUpO1xuXHR9XG5cblx0YXN5bmMgYWN0aXZhdGVQcm92aWRlcihzY2hlbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gRW1pdCBhbiBldmVudCB0aGF0IHdlIGFyZSBhYm91dCB0byBhY3RpdmF0ZSBhIHByb3ZpZGVyIHdpdGggdGhlIGdpdmVuIHNjaGVtZS5cblx0XHQvLyBMaXN0ZW5lcnMgY2FuIHBhcnRpY2lwYXRlIGluIHRoZSBhY3RpdmF0aW9uIGJ5IHJlZ2lzdGVyaW5nIGEgcHJvdmlkZXIgZm9yIGl0LlxuXHRcdGNvbnN0IGpvaW5lcnM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdHRoaXMuX29uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyLmZpcmUoe1xuXHRcdFx0c2NoZW1lLFxuXHRcdFx0am9pbihwcm9taXNlKSB7XG5cdFx0XHRcdGpvaW5lcnMucHVzaChwcm9taXNlKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5wcm92aWRlci5oYXMoc2NoZW1lKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBwcm92aWRlciBpcyBhbHJlYWR5IGhlcmUgc28gd2UgY2FuIHJldHVybiBkaXJlY3RseVxuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBwcm92aWRlciBpcyBub3QgeWV0IHRoZXJlLCBtYWtlIHN1cmUgdG8gam9pbiBvbiB0aGUgbGlzdGVuZXJzIGFzc3VtaW5nXG5cdFx0Ly8gdGhhdCBpdCB0YWtlcyBhIGJpdCBsb25nZXIgdG8gcmVnaXN0ZXIgdGhlIGZpbGUgc3lzdGVtIHByb3ZpZGVyLlxuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoam9pbmVycyk7XG5cdH1cblxuXHRhc3luYyBjYW5IYW5kbGVSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBBd2FpdCBhY3RpdmF0aW9uIG9mIHBvdGVudGlhbGx5IGV4dGVuc2lvbiBjb250cmlidXRlZCBwcm92aWRlcnNcblx0XHRhd2FpdCB0aGlzLmFjdGl2YXRlUHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKTtcblxuXHRcdHJldHVybiB0aGlzLmhhc1Byb3ZpZGVyKHJlc291cmNlKTtcblx0fVxuXG5cdGhhc1Byb3ZpZGVyKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlci5oYXMocmVzb3VyY2Uuc2NoZW1lKTtcblx0fVxuXG5cdGhhc0NhcGFiaWxpdHkocmVzb3VyY2U6IFVSSSwgY2FwYWJpbGl0eTogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnByb3ZpZGVyLmdldChyZXNvdXJjZS5zY2hlbWUpO1xuXG5cdFx0cmV0dXJuICEhKHByb3ZpZGVyICYmIChwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBjYXBhYmlsaXR5KSk7XG5cdH1cblxuXHRsaXN0Q2FwYWJpbGl0aWVzKCk6IEl0ZXJhYmxlPHsgc2NoZW1lOiBzdHJpbmc7IGNhcGFiaWxpdGllczogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIH0+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUubWFwKHRoaXMucHJvdmlkZXIsIChbc2NoZW1lLCBwcm92aWRlcl0pID0+ICh7IHNjaGVtZSwgY2FwYWJpbGl0aWVzOiBwcm92aWRlci5jYXBhYmlsaXRpZXMgfSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHdpdGhQcm92aWRlcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZVN5c3RlbVByb3ZpZGVyPiB7XG5cblx0XHQvLyBBc3NlcnQgcGF0aCBpcyBhYnNvbHV0ZVxuXHRcdGlmICghaXNBYnNvbHV0ZVBhdGgocmVzb3VyY2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdpbnZhbGlkUGF0aCcsIFwiVW5hYmxlIHRvIHJlc29sdmUgZmlsZXN5c3RlbSBwcm92aWRlciB3aXRoIHJlbGF0aXZlIGZpbGUgcGF0aCAnezB9J1wiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lOVkFMSURfUEFUSCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0aXZhdGUgcHJvdmlkZXJcblx0XHRhd2FpdCB0aGlzLmFjdGl2YXRlUHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKTtcblxuXHRcdC8vIEFzc2VydCBwcm92aWRlclxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5wcm92aWRlci5nZXQocmVzb3VyY2Uuc2NoZW1lKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvck5vVGVsZW1ldHJ5KCk7XG5cdFx0XHRlcnJvci5tZXNzYWdlID0gbG9jYWxpemUoJ25vUHJvdmlkZXJGb3VuZCcsIFwiRU5PUFJPOiBObyBmaWxlIHN5c3RlbSBwcm92aWRlciBmb3VuZCBmb3IgcmVzb3VyY2UgJ3swfSdcIiwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2l0aFJlYWRQcm92aWRlcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHk+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMud2l0aFByb3ZpZGVyKHJlc291cmNlKTtcblxuXHRcdGlmIChoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSB8fCBoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSB8fCBoYXNGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBGaWxlc3lzdGVtIHByb3ZpZGVyIGZvciBzY2hlbWUgJyR7cmVzb3VyY2Uuc2NoZW1lfScgbmVpdGhlciBoYXMgRmlsZVJlYWRXcml0ZSwgRmlsZVJlYWRTdHJlYW0gbm9yIEZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgY2FwYWJpbGl0eSB3aGljaCBpcyBuZWVkZWQgZm9yIHRoZSByZWFkIG9wZXJhdGlvbi5gKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2l0aFdyaXRlUHJvdmlkZXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSB8IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpO1xuXG5cdFx0aWYgKGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkocHJvdmlkZXIpIHx8IGhhc1JlYWRXcml0ZUNhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBGaWxlc3lzdGVtIHByb3ZpZGVyIGZvciBzY2hlbWUgJyR7cmVzb3VyY2Uuc2NoZW1lfScgbmVpdGhlciBoYXMgRmlsZVJlYWRXcml0ZSBub3IgRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSBjYXBhYmlsaXR5IHdoaWNoIGlzIG5lZWRlZCBmb3IgdGhlIHdyaXRlIG9wZXJhdGlvbi5gKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBPcGVyYXRpb24gZXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSdW5PcGVyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxGaWxlT3BlcmF0aW9uRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJ1bk9wZXJhdGlvbiA9IHRoaXMuX29uRGlkUnVuT3BlcmF0aW9uLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGaWxlIE1ldGFkYXRhIFJlc29sdmluZ1xuXG5cdGFzeW5jIHJlc29sdmUocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVJlc29sdmVNZXRhZGF0YUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+O1xuXHRhc3luYyByZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVzb2x2ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXQ+O1xuXHRhc3luYyByZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVzb2x2ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXQ+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZG9SZXNvbHZlRmlsZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gU3BlY2lhbGx5IGhhbmRsZSBmaWxlIG5vdCBmb3VuZCBjYXNlIGFzIGZpbGUgb3BlcmF0aW9uIHJlc3VsdFxuXHRcdFx0aWYgKHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycm9yKSA9PT0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdmaWxlTm90Rm91bmRFcnJvcicsIFwiVW5hYmxlIHRvIHJlc29sdmUgbm9uZXhpc3RlbnQgZmlsZSAnezB9J1wiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJ1YmJsZSB1cCBhbnkgb3RoZXIgZXJyb3IgYXMgaXNcblx0XHRcdHRocm93IGVuc3VyZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZUZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVJlc29sdmVNZXRhZGF0YUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+O1xuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZUZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdD47XG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlc29sdmVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhQcm92aWRlcihyZXNvdXJjZSk7XG5cdFx0Y29uc3QgaXNQYXRoQ2FzZVNlbnNpdGl2ZSA9IHRoaXMuaXNQYXRoQ2FzZVNlbnNpdGl2ZShwcm92aWRlcik7XG5cblx0XHRjb25zdCByZXNvbHZlVG8gPSBvcHRpb25zPy5yZXNvbHZlVG87XG5cdFx0Y29uc3QgcmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHMgPSBvcHRpb25zPy5yZXNvbHZlU2luZ2xlQ2hpbGREZXNjZW5kYW50cztcblx0XHRjb25zdCByZXNvbHZlTWV0YWRhdGEgPSBvcHRpb25zPy5yZXNvbHZlTWV0YWRhdGE7XG5cblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdChyZXNvdXJjZSk7XG5cblx0XHRsZXQgdHJpZTogVGVybmFyeVNlYXJjaFRyZWU8VVJJLCBib29sZWFuPiB8IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiB0aGlzLnRvRmlsZVN0YXQocHJvdmlkZXIsIHJlc291cmNlLCBzdGF0LCB1bmRlZmluZWQsICEhcmVzb2x2ZU1ldGFkYXRhLCAoc3RhdCwgc2libGluZ3MpID0+IHtcblxuXHRcdFx0Ly8gbGF6eSB0cmllIHRvIGNoZWNrIGZvciByZWN1cnNpdmUgcmVzb2x2aW5nXG5cdFx0XHRpZiAoIXRyaWUpIHtcblx0XHRcdFx0dHJpZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8dHJ1ZT4oKCkgPT4gIWlzUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdFx0XHR0cmllLnNldChyZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdGlmIChyZXNvbHZlVG8pIHtcblx0XHRcdFx0XHR0cmllLmZpbGwodHJ1ZSwgcmVzb2x2ZVRvKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBjaGVjayBmb3IgcmVjdXJzaXZlIHJlc29sdmluZ1xuXHRcdFx0aWYgKHRyaWUuZ2V0KHN0YXQucmVzb3VyY2UpIHx8IHRyaWUuZmluZFN1cGVyc3RyKHN0YXQucmVzb3VyY2Uud2l0aCh7IHF1ZXJ5OiBudWxsLCBmcmFnbWVudDogbnVsbCB9IC8qIHJlcXVpcmVkIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI4MTUxICovKSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNoZWNrIGZvciByZXNvbHZpbmcgc2luZ2xlIGNoaWxkIGZvbGRlcnNcblx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5ICYmIHJlc29sdmVTaW5nbGVDaGlsZERlc2NlbmRhbnRzKSB7XG5cdFx0XHRcdHJldHVybiBzaWJsaW5ncyA9PT0gMTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0b0ZpbGVTdGF0KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCByZXNvdXJjZTogVVJJLCBzdGF0OiBJU3RhdCB8IHsgdHlwZTogRmlsZVR5cGUgfSAmIFBhcnRpYWw8SVN0YXQ+LCBzaWJsaW5nczogbnVtYmVyIHwgdW5kZWZpbmVkLCByZXNvbHZlTWV0YWRhdGE6IGJvb2xlYW4sIHJlY3Vyc2U6IChzdGF0OiBJRmlsZVN0YXQsIHNpYmxpbmdzPzogbnVtYmVyKSA9PiBib29sZWFuKTogUHJvbWlzZTxJRmlsZVN0YXQ+O1xuXHRwcml2YXRlIGFzeW5jIHRvRmlsZVN0YXQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIsIHJlc291cmNlOiBVUkksIHN0YXQ6IElTdGF0LCBzaWJsaW5nczogbnVtYmVyIHwgdW5kZWZpbmVkLCByZXNvbHZlTWV0YWRhdGE6IHRydWUsIHJlY3Vyc2U6IChzdGF0OiBJRmlsZVN0YXQsIHNpYmxpbmdzPzogbnVtYmVyKSA9PiBib29sZWFuKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+O1xuXHRwcml2YXRlIGFzeW5jIHRvRmlsZVN0YXQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIsIHJlc291cmNlOiBVUkksIHN0YXQ6IElTdGF0IHwgeyB0eXBlOiBGaWxlVHlwZSB9ICYgUGFydGlhbDxJU3RhdD4sIHNpYmxpbmdzOiBudW1iZXIgfCB1bmRlZmluZWQsIHJlc29sdmVNZXRhZGF0YTogYm9vbGVhbiwgcmVjdXJzZTogKHN0YXQ6IElGaWxlU3RhdCwgc2libGluZ3M/OiBudW1iZXIpID0+IGJvb2xlYW4pOiBQcm9taXNlPElGaWxlU3RhdD4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXJFeHRVcmkgfSA9IHRoaXMuZ2V0RXh0VXJpKHByb3ZpZGVyKTtcblxuXHRcdC8vIGNvbnZlcnQgdG8gZmlsZSBzdGF0XG5cdFx0Y29uc3QgZmlsZVN0YXQ6IElGaWxlU3RhdCA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bmFtZTogcHJvdmlkZXJFeHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpLFxuXHRcdFx0aXNGaWxlOiAoc3RhdC50eXBlICYgRmlsZVR5cGUuRmlsZSkgIT09IDAsXG5cdFx0XHRpc0RpcmVjdG9yeTogKHN0YXQudHlwZSAmIEZpbGVUeXBlLkRpcmVjdG9yeSkgIT09IDAsXG5cdFx0XHRpc1N5bWJvbGljTGluazogKHN0YXQudHlwZSAmIEZpbGVUeXBlLlN5bWJvbGljTGluaykgIT09IDAsXG5cdFx0XHRtdGltZTogc3RhdC5tdGltZSxcblx0XHRcdGN0aW1lOiBzdGF0LmN0aW1lLFxuXHRcdFx0c2l6ZTogc3RhdC5zaXplLFxuXHRcdFx0cmVhZG9ubHk6IEJvb2xlYW4oKHN0YXQucGVybWlzc2lvbnMgPz8gMCkgJiBGaWxlUGVybWlzc2lvbi5SZWFkb25seSkgfHwgQm9vbGVhbihwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpLFxuXHRcdFx0bG9ja2VkOiBCb29sZWFuKChzdGF0LnBlcm1pc3Npb25zID8/IDApICYgRmlsZVBlcm1pc3Npb24uTG9ja2VkKSxcblx0XHRcdGV4ZWN1dGFibGU6IEJvb2xlYW4oKHN0YXQucGVybWlzc2lvbnMgPz8gMCkgJiBGaWxlUGVybWlzc2lvbi5FeGVjdXRhYmxlKSxcblx0XHRcdGV0YWc6IGV0YWcoeyBtdGltZTogc3RhdC5tdGltZSwgc2l6ZTogc3RhdC5zaXplIH0pLFxuXHRcdFx0Y2hpbGRyZW46IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHQvLyBjaGVjayB0byByZWN1cnNlIGZvciBkaXJlY3Rvcmllc1xuXHRcdGlmIChmaWxlU3RhdC5pc0RpcmVjdG9yeSAmJiByZWN1cnNlKGZpbGVTdGF0LCBzaWJsaW5ncykpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCBwcm92aWRlci5yZWFkZGlyKHJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRFbnRyaWVzID0gYXdhaXQgUHJvbWlzZXMuc2V0dGxlZChlbnRyaWVzLm1hcChhc3luYyAoW25hbWUsIHR5cGVdKSA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNoaWxkUmVzb3VyY2UgPSBwcm92aWRlckV4dFVyaS5qb2luUGF0aChyZXNvdXJjZSwgbmFtZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGlsZFN0YXQgPSByZXNvbHZlTWV0YWRhdGEgPyBhd2FpdCBwcm92aWRlci5zdGF0KGNoaWxkUmVzb3VyY2UpIDogeyB0eXBlIH07XG5cblx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnRvRmlsZVN0YXQocHJvdmlkZXIsIGNoaWxkUmVzb3VyY2UsIGNoaWxkU3RhdCwgZW50cmllcy5sZW5ndGgsIHJlc29sdmVNZXRhZGF0YSwgcmVjdXJzZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShlcnJvcik7XG5cblx0XHRcdFx0XHRcdHJldHVybiBudWxsOyAvLyBjYW4gaGFwcGVuIGUuZy4gZHVlIHRvIHBlcm1pc3Npb24gZXJyb3JzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gbWFrZSBzdXJlIHRvIGdldCByaWQgb2YgbnVsbCB2YWx1ZXMgdGhhdCBzaWduYWwgYSBmYWlsdXJlIHRvIHJlc29sdmUgYSBwYXJ0aWN1bGFyIGVudHJ5XG5cdFx0XHRcdGZpbGVTdGF0LmNoaWxkcmVuID0gY29hbGVzY2UocmVzb2x2ZWRFbnRyaWVzKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShlcnJvcik7XG5cblx0XHRcdFx0ZmlsZVN0YXQuY2hpbGRyZW4gPSBbXTsgLy8gZ3JhY2VmdWxseSBoYW5kbGUgZXJyb3JzLCB3ZSBtYXkgbm90IGhhdmUgcGVybWlzc2lvbnMgdG8gcmVhZFxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmlsZVN0YXQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbGVTdGF0O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSTsgb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMgfVtdKTogUHJvbWlzZTxJRmlsZVN0YXRSZXN1bHRbXT47XG5cdGFzeW5jIHJlc29sdmVBbGwodG9SZXNvbHZlOiB7IHJlc291cmNlOiBVUkk7IG9wdGlvbnM6IElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFdpdGhNZXRhZGF0YVtdPjtcblx0YXN5bmMgcmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSTsgb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMgfVtdKTogUHJvbWlzZTxJRmlsZVN0YXRSZXN1bHRbXT4ge1xuXHRcdHJldHVybiBQcm9taXNlcy5zZXR0bGVkKHRvUmVzb2x2ZS5tYXAoYXN5bmMgZW50cnkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdDogYXdhaXQgdGhpcy5kb1Jlc29sdmVGaWxlKGVudHJ5LnJlc291cmNlLCBlbnRyeS5vcHRpb25zKSwgc3VjY2VzczogdHJ1ZSB9O1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGVycm9yKTtcblxuXHRcdFx0XHRyZXR1cm4geyBzdGF0OiB1bmRlZmluZWQsIHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhQcm92aWRlcihyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdChyZXNvdXJjZSk7XG5cblx0XHRyZXR1cm4gdGhpcy50b0ZpbGVTdGF0KHByb3ZpZGVyLCByZXNvdXJjZSwgc3RhdCwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiBmYWxzZSAvKiBEbyBub3QgcmVzb2x2ZSBhbnkgY2hpbGRyZW4gKi8pO1xuXHR9XG5cblx0YXN5bmMgcmVhbHBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhQcm92aWRlcihyZXNvdXJjZSk7XG5cblx0XHRpZiAoaGFzRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eShwcm92aWRlcikpIHtcblx0XHRcdGNvbnN0IHJlYWxwYXRoID0gYXdhaXQgcHJvdmlkZXIucmVhbHBhdGgocmVzb3VyY2UpO1xuXG5cdFx0XHRyZXR1cm4gcmVzb3VyY2Uud2l0aCh7IHBhdGg6IHJlYWxwYXRoIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBleGlzdHMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KHJlc291cmNlKTtcblxuXHRcdFx0cmV0dXJuICEhc3RhdDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGaWxlIFJlYWRpbmcvV3JpdGluZ1xuXG5cdGFzeW5jIGNhbkNyZWF0ZUZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElDcmVhdGVGaWxlT3B0aW9ucyk6IFByb21pc2U8RXJyb3IgfCB0cnVlPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZG9WYWxpZGF0ZUNyZWF0ZUZpbGUocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVmFsaWRhdGVDcmVhdGVGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIHZhbGlkYXRlIG92ZXJ3cml0ZVxuXHRcdGlmICghb3B0aW9ucz8ub3ZlcndyaXRlICYmIGF3YWl0IHRoaXMuZXhpc3RzKHJlc291cmNlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZUV4aXN0cycsIFwiVW5hYmxlIHRvIGNyZWF0ZSBmaWxlICd7MH0nIHRoYXQgYWxyZWFkeSBleGlzdHMgd2hlbiBvdmVyd3JpdGUgZmxhZyBpcyBub3Qgc2V0XCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUZpbGUocmVzb3VyY2U6IFVSSSwgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtOiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtID0gVlNCdWZmZXIuZnJvbVN0cmluZygnJyksIG9wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXG5cdFx0Ly8gdmFsaWRhdGVcblx0XHRhd2FpdCB0aGlzLmRvVmFsaWRhdGVDcmVhdGVGaWxlKHJlc291cmNlLCBvcHRpb25zKTtcblxuXHRcdC8vIGRvIHdyaXRlIGludG8gZmlsZSAodGhpcyB3aWxsIGNyZWF0ZSBpdCB0b28pXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCB0aGlzLndyaXRlRmlsZShyZXNvdXJjZSwgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtKTtcblxuXHRcdC8vIGV2ZW50c1xuXHRcdHRoaXMuX29uRGlkUnVuT3BlcmF0aW9uLmZpcmUobmV3IEZpbGVPcGVyYXRpb25FdmVudChyZXNvdXJjZSwgRmlsZU9wZXJhdGlvbi5DUkVBVEUsIGZpbGVTdGF0KSk7XG5cblx0XHRyZXR1cm4gZmlsZVN0YXQ7XG5cdH1cblxuXHRhc3luYyB3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtOiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCBvcHRpb25zPzogSVdyaXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoV3JpdGVQcm92aWRlcihyZXNvdXJjZSksIHJlc291cmNlKTtcblx0XHRjb25zdCB7IHByb3ZpZGVyRXh0VXJpIH0gPSB0aGlzLmdldEV4dFVyaShwcm92aWRlcik7XG5cblx0XHRsZXQgd3JpdGVGaWxlT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0aWYgKGhhc0ZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHkocHJvdmlkZXIpICYmICF3cml0ZUZpbGVPcHRpb25zPy5hdG9taWMpIHtcblx0XHRcdGNvbnN0IGVuZm9yY2VkQXRvbWljV3JpdGUgPSBwcm92aWRlci5lbmZvcmNlQXRvbWljV3JpdGVGaWxlPy4ocmVzb3VyY2UpO1xuXHRcdFx0aWYgKGVuZm9yY2VkQXRvbWljV3JpdGUpIHtcblx0XHRcdFx0d3JpdGVGaWxlT3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgYXRvbWljOiBlbmZvcmNlZEF0b21pY1dyaXRlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gdmFsaWRhdGUgd3JpdGUgKHRoaXMgbWF5IGFscmVhZHkgcmV0dXJuIGEgcGVla2VkLWF0IGJ1ZmZlcilcblx0XHRcdGxldCB7IHN0YXQsIGJ1ZmZlcjogYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSB9ID0gYXdhaXQgdGhpcy52YWxpZGF0ZVdyaXRlRmlsZShwcm92aWRlciwgcmVzb3VyY2UsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbSwgd3JpdGVGaWxlT3B0aW9ucyk7XG5cblx0XHRcdC8vIG1rZGlyIHJlY3Vyc2l2ZWx5IGFzIG5lZWRlZFxuXHRcdFx0aWYgKCFzdGF0KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubWtkaXJwKHByb3ZpZGVyLCBwcm92aWRlckV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG9wdGltaXphdGlvbjogaWYgdGhlIHByb3ZpZGVyIGhhcyB1bmJ1ZmZlcmVkIHdyaXRlIGNhcGFiaWxpdHkgYW5kIHRoZSBkYXRhXG5cdFx0XHQvLyB0byB3cml0ZSBpcyBub3QgYSBidWZmZXIsIHdlIGNvbnN1bWUgdXAgdG8gMyBjaHVua3MgYW5kIHRyeSB0byB3cml0ZSB0aGUgZGF0YVxuXHRcdFx0Ly8gdW5idWZmZXJlZCB0byByZWR1Y2UgdGhlIG92ZXJoZWFkLiBJZiB0aGUgc3RyZWFtIG9yIHJlYWRhYmxlIGhhcyBtb3JlIGRhdGFcblx0XHRcdC8vIHRvIHByb3ZpZGUgd2UgY29udGludWUgdG8gd3JpdGUgYnVmZmVyZWQuXG5cdFx0XHRpZiAoIWJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pIHtcblx0XHRcdFx0YnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSA9IGF3YWl0IHRoaXMucGVla0J1ZmZlckZvcldyaXRpbmcocHJvdmlkZXIsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHdyaXRlIGZpbGU6IHVuYnVmZmVyZWRcblx0XHRcdGlmIChcblx0XHRcdFx0IWhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkocHJvdmlkZXIpIHx8XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBidWZmZXJlZCB3cml0aW5nIGlzIHVuc3VwcG9ydGVkXG5cdFx0XHRcdChoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSAmJiBidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtIGluc3RhbmNlb2YgVlNCdWZmZXIpIHx8XHRcdC8vIGRhdGEgaXMgYSBmdWxsIGJ1ZmZlciBhbHJlYWR5XG5cdFx0XHRcdChoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSAmJiBoYXNGaWxlQXRvbWljV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSAmJiB3cml0ZUZpbGVPcHRpb25zPy5hdG9taWMpXHQvLyBhdG9taWMgd3JpdGUgZm9yY2VzIHVuYnVmZmVyZWQgd3JpdGUgaWYgdGhlIHByb3ZpZGVyIHN1cHBvcnRzIGl0XG5cdFx0XHQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1dyaXRlVW5idWZmZXJlZChwcm92aWRlciwgcmVzb3VyY2UsIHdyaXRlRmlsZU9wdGlvbnMsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB3cml0ZSBmaWxlOiBidWZmZXJlZFxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZUJ1ZmZlcmVkKHByb3ZpZGVyLCByZXNvdXJjZSwgd3JpdGVGaWxlT3B0aW9ucywgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSBpbnN0YW5jZW9mIFZTQnVmZmVyID8gYnVmZmVyVG9SZWFkYWJsZShidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKSA6IGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBldmVudHNcblx0XHRcdHRoaXMuX29uRGlkUnVuT3BlcmF0aW9uLmZpcmUobmV3IEZpbGVPcGVyYXRpb25FdmVudChyZXNvdXJjZSwgRmlsZU9wZXJhdGlvbi5XUklURSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdlcnIud3JpdGUnLCBcIlVuYWJsZSB0byB3cml0ZSBmaWxlICd7MH0nICh7MX0pXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSksIGVuc3VyZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKS50b1N0cmluZygpKSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSwgd3JpdGVGaWxlT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZShyZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgcGVla0J1ZmZlckZvcldyaXRpbmcocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbTogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8VlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGVCdWZmZXJlZFN0cmVhbT4ge1xuXHRcdGxldCBwZWVrUmVzdWx0OiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgVlNCdWZmZXJSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtO1xuXHRcdGlmIChoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHByb3ZpZGVyKSAmJiAhKGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbSBpbnN0YW5jZW9mIFZTQnVmZmVyKSkge1xuXHRcdFx0aWYgKGlzUmVhZGFibGVTdHJlYW0oYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtKSkge1xuXHRcdFx0XHRjb25zdCBidWZmZXJlZFN0cmVhbSA9IGF3YWl0IHBlZWtTdHJlYW0oYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtLCAzKTtcblx0XHRcdFx0aWYgKGJ1ZmZlcmVkU3RyZWFtLmVuZGVkKSB7XG5cdFx0XHRcdFx0cGVla1Jlc3VsdCA9IFZTQnVmZmVyLmNvbmNhdChidWZmZXJlZFN0cmVhbS5idWZmZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHBlZWtSZXN1bHQgPSBidWZmZXJlZFN0cmVhbTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGVla1Jlc3VsdCA9IHBlZWtSZWFkYWJsZShidWZmZXJPclJlYWRhYmxlT3JTdHJlYW0sIGRhdGEgPT4gVlNCdWZmZXIuY29uY2F0KGRhdGEpLCAzKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cGVla1Jlc3VsdCA9IGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGVla1Jlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVXcml0ZUZpbGUocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIHJlc291cmNlOiBVUkksIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbTogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTx7IHN0YXQ6IElTdGF0IHwgdW5kZWZpbmVkOyBidWZmZXI6IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0gfCB1bmRlZmluZWQgfT4ge1xuXG5cdFx0Ly8gVmFsaWRhdGUgdW5sb2NrIHN1cHBvcnRcblx0XHRjb25zdCB1bmxvY2sgPSAhIW9wdGlvbnM/LnVubG9jaztcblx0XHRpZiAodW5sb2NrICYmICEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVXcml0ZVVubG9jaykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnd3JpdGVGYWlsZWRVbmxvY2tVbnN1cHBvcnRlZCcsIFwiVW5hYmxlIHRvIHVubG9jayBmaWxlICd7MH0nIGJlY2F1c2UgcHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBpdC5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSkpO1xuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIGFwcGVuZCBzdXBwb3J0XG5cdFx0aWYgKG9wdGlvbnM/LmFwcGVuZCAmJiAhaGFzRmlsZUFwcGVuZENhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdlcnIubm9BcHBlbmQnLCBcIkZpbGVzeXN0ZW0gcHJvdmlkZXIgZm9yIHNjaGVtZSAnezB9JyBkb2VzIG5vdCBkb2VzIG5vdCBzdXBwb3J0IGFwcGVuZFwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBhdG9taWMgc3VwcG9ydFxuXHRcdGNvbnN0IGF0b21pYyA9ICEhb3B0aW9ucz8uYXRvbWljO1xuXHRcdGlmIChhdG9taWMpIHtcblx0XHRcdGlmICghKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljV3JpdGUpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnd3JpdGVGYWlsZWRBdG9taWNVbnN1cHBvcnRlZDEnLCBcIlVuYWJsZSB0byBhdG9taWNhbGx5IHdyaXRlIGZpbGUgJ3swfScgYmVjYXVzZSBwcm92aWRlciBkb2VzIG5vdCBzdXBwb3J0IGl0LlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3dyaXRlRmFpbGVkQXRvbWljVW5zdXBwb3J0ZWQyJywgXCJVbmFibGUgdG8gYXRvbWljYWxseSB3cml0ZSBmaWxlICd7MH0nIGJlY2F1c2UgcHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCB1bmJ1ZmZlcmVkIHdyaXRlcy5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodW5sb2NrKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnd3JpdGVGYWlsZWRBdG9taWNVbmxvY2snLCBcIlVuYWJsZSB0byB1bmxvY2sgZmlsZSAnezB9JyBiZWNhdXNlIGF0b21pYyB3cml0ZSBpcyBlbmFibGVkLlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgdmlhIGZpbGUgc3RhdCBtZXRhIGRhdGFcblx0XHRsZXQgc3RhdDogSVN0YXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KHJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIGZpbGUgbWlnaHQgbm90IGV4aXN0XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZSBjYW5ub3QgYmUgZGlyZWN0b3J5XG5cdFx0aWYgKChzdGF0LnR5cGUgJiBGaWxlVHlwZS5EaXJlY3RvcnkpICE9PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdmaWxlSXNEaXJlY3RvcnlXcml0ZUVycm9yJywgXCJVbmFibGUgdG8gd3JpdGUgZmlsZSAnezB9JyB0aGF0IGlzIGFjdHVhbGx5IGEgZGlyZWN0b3J5XCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfSVNfRElSRUNUT1JZLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBGaWxlIGNhbm5vdCBiZSByZWFkb25seVxuXHRcdHRoaXMudGhyb3dJZkZpbGVJc1JlYWRvbmx5KHJlc291cmNlLCBzdGF0KTtcblxuXHRcdC8vIERpcnR5IHdyaXRlIHByZXZlbnRpb246IGlmIHRoZSBmaWxlIG9uIGRpc2sgaGFzIGJlZW4gY2hhbmdlZCBhbmQgZG9lcyBub3QgbWF0Y2ggb3VyIGV4cGVjdGVkXG5cdFx0Ly8gbXRpbWUgYW5kIGV0YWcsIHdlIGJhaWwgb3V0IHRvIHByZXZlbnQgZGlydHkgd3JpdGluZy5cblx0XHQvL1xuXHRcdC8vIEZpcnN0LCB3ZSBjaGVjayBmb3IgYSBtdGltZSB0aGF0IGlzIGluIHRoZSBmdXR1cmUgYmVmb3JlIHdlIGRvIG1vcmUgY2hlY2tzLiBUaGUgYXNzdW1wdGlvbiBpc1xuXHRcdC8vIHRoYXQgb25seSB0aGUgbXRpbWUgaXMgYW4gaW5kaWNhdG9yIGZvciBhIGZpbGUgdGhhdCBoYXMgY2hhbmdlZCBvbiBkaXNrLlxuXHRcdC8vXG5cdFx0Ly8gU2Vjb25kLCBpZiB0aGUgbXRpbWUgaGFzIGFkdmFuY2VkLCB3ZSBjb21wYXJlIHRoZSBzaXplIG9mIHRoZSBmaWxlIG9uIGRpc2sgd2l0aCBvdXIgcHJldmlvdXNcblx0XHQvLyBvbmUgdXNpbmcgdGhlIGV0YWcoKSBmdW5jdGlvbi4gUmVseWluZyBvbmx5IG9uIHRoZSBtdGltZSBjaGVjayBoYXMgcHJvb3ZlbiB0byBwcm9kdWNlIGZhbHNlXG5cdFx0Ly8gcG9zaXRpdmVzIGR1ZSB0byBmaWxlIHN5c3RlbSB3ZWlyZG5lc3MgKGVzcGVjaWFsbHkgYXJvdW5kIHJlbW90ZSBmaWxlIHN5c3RlbXMpLiBBcyBzdWNoLCB0aGVcblx0XHQvLyBjaGVjayBmb3Igc2l6ZSBpcyBhIHdlYWtlciBjaGVjayBiZWNhdXNlIGl0IGNhbiByZXR1cm4gYSBmYWxzZSBuZWdhdGl2ZSBpZiB0aGUgZmlsZSBoYXMgY2hhbmdlZFxuXHRcdC8vIGJ1dCB0byB0aGUgc2FtZSBsZW5ndGguIFRoaXMgaXMgYSBjb21wcm9taXNlIHdlIHRha2UgdG8gYXZvaWQgaGF2aW5nIHRvIHByb2R1Y2UgY2hlY2tzdW1zIG9mXG5cdFx0Ly8gdGhlIGZpbGUgY29udGVudCBmb3IgY29tcGFyaXNvbiB3aGljaCB3b3VsZCBiZSBtdWNoIHNsb3dlciB0byBjb21wdXRlLlxuXHRcdC8vXG5cdFx0Ly8gVGhpcmQsIGlmIHRoZSBldGFnKCkgdHVybnMgb3V0IHRvIGJlIGRpZmZlcmVudCwgd2UgZG8gb25lIGF0dGVtcHQgdG8gY29tcGFyZSB0aGUgYnVmZmVyIHdlXG5cdFx0Ly8gYXJlIGFib3V0IHRvIHdyaXRlIHdpdGggdGhlIGNvbnRlbnRzIG9uIGRpc2sgdG8gZmlndXJlIG91dCBpZiB0aGUgY29udGVudHMgYXJlIGlkZW50aWNhbC5cblx0XHQvLyBJbiB0aGF0IGNhc2Ugd2UgYWxsb3cgdGhlIHdyaXRpbmcgYXMgaXQgd291bGQgcmVzdWx0IGluIHRoZSBzYW1lIGNvbnRlbnRzIGluIHRoZSBmaWxlLlxuXHRcdGxldCBidWZmZXI6IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKFxuXHRcdFx0dHlwZW9mIG9wdGlvbnM/Lm10aW1lID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygb3B0aW9ucy5ldGFnID09PSAnc3RyaW5nJyAmJiBvcHRpb25zLmV0YWcgIT09IEVUQUdfRElTQUJMRUQgJiZcblx0XHRcdHR5cGVvZiBzdGF0Lm10aW1lID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc3RhdC5zaXplID09PSAnbnVtYmVyJyAmJlxuXHRcdFx0b3B0aW9ucy5tdGltZSA8IHN0YXQubXRpbWUgJiYgb3B0aW9ucy5ldGFnICE9PSBldGFnKHsgbXRpbWU6IG9wdGlvbnMubXRpbWUgLyogbm90IHVzaW5nIHN0YXQubXRpbWUgZm9yIGEgcmVhc29uLCBzZWUgYWJvdmUgKi8sIHNpemU6IHN0YXQuc2l6ZSB9KVxuXHRcdCkge1xuXHRcdFx0YnVmZmVyID0gYXdhaXQgdGhpcy5wZWVrQnVmZmVyRm9yV3JpdGluZyhwcm92aWRlciwgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtKTtcblx0XHRcdGlmIChidWZmZXIgaW5zdGFuY2VvZiBWU0J1ZmZlciAmJiBidWZmZXIuYnl0ZUxlbmd0aCA9PT0gc3RhdC5zaXplKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgeyB2YWx1ZSB9ID0gYXdhaXQgdGhpcy5yZWFkRmlsZShyZXNvdXJjZSwgeyBsaW1pdHM6IHsgc2l6ZTogc3RhdC5zaXplIH0gfSk7XG5cdFx0XHRcdFx0aWYgKGJ1ZmZlci5lcXVhbHModmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBzdGF0LCBidWZmZXIgfTsgLy8gYWxsb3cgd3JpdGluZyBzaW5jZSBjb250ZW50cyBhcmUgaWRlbnRpY2FsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSwgdGhyb3cgdGhlIEZJTEVfTU9ESUZJRURfU0lOQ0UgZXJyb3Jcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdmaWxlTW9kaWZpZWRFcnJvcicsIFwiRmlsZSBNb2RpZmllZCBTaW5jZVwiKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBzdGF0LCBidWZmZXIgfTtcblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMud2l0aFJlYWRQcm92aWRlcihyZXNvdXJjZSk7XG5cblx0XHRpZiAob3B0aW9ucz8uYXRvbWljKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1JlYWRGaWxlQXRvbWljKHByb3ZpZGVyLCByZXNvdXJjZSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvUmVhZEZpbGUocHJvdmlkZXIsIHJlc291cmNlLCBvcHRpb25zLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVhZEZpbGVBdG9taWMocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSwgcmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJRmlsZUNvbnRlbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMud3JpdGVRdWV1ZS5xdWV1ZUZvcihyZXNvdXJjZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmRvUmVhZEZpbGUocHJvdmlkZXIsIHJlc291cmNlLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRcdFx0cmVzb2x2ZShjb250ZW50KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aGlzLmdldEV4dFVyaShwcm92aWRlcikucHJvdmlkZXJFeHRVcmkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlYWRGaWxlKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5IHwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRjb25zdCBzdHJlYW0gPSBhd2FpdCB0aGlzLmRvUmVhZEZpbGVTdHJlYW0ocHJvdmlkZXIsIHJlc291cmNlLCB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0Ly8gb3B0aW1pemF0aW9uOiBzaW5jZSB3ZSBrbm93IHRoYXQgdGhlIGNhbGxlciBkb2VzIG5vdFxuXHRcdFx0Ly8gY2FyZSBhYm91dCBidWZmZXJpbmcsIHdlIGluZGljYXRlIHRoaXMgdG8gdGhlIHJlYWRlci5cblx0XHRcdC8vIHRoaXMgcmVkdWNlcyBhbGwgdGhlIG92ZXJoZWFkIHRoZSBidWZmZXJlZCByZWFkaW5nXG5cdFx0XHQvLyBoYXMgKG9wZW4sIHJlYWQsIGNsb3NlKSBpZiB0aGUgcHJvdmlkZXIgc3VwcG9ydHNcblx0XHRcdC8vIHVuYnVmZmVyZWQgcmVhZGluZy5cblx0XHRcdHByZWZlclVuYnVmZmVyZWQ6IHRydWVcblx0XHR9LCB0b2tlbik7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3RyZWFtLFxuXHRcdFx0dmFsdWU6IGF3YWl0IHN0cmVhbVRvQnVmZmVyKHN0cmVhbS52YWx1ZSlcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZVN0cmVhbU9wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGaWxlU3RyZWFtQ29udGVudD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy53aXRoUmVhZFByb3ZpZGVyKHJlc291cmNlKTtcblxuXHRcdHJldHVybiB0aGlzLmRvUmVhZEZpbGVTdHJlYW0ocHJvdmlkZXIsIHJlc291cmNlLCBvcHRpb25zLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVhZEZpbGVTdHJlYW0ocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkgfCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSwgcmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMgJiBJUmVhZEZpbGVTdHJlYW1PcHRpb25zICYgeyBwcmVmZXJVbmJ1ZmZlcmVkPzogYm9vbGVhbiB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZVN0cmVhbUNvbnRlbnQ+IHtcblxuXHRcdC8vIGluc3RhbGwgYSBjYW5jZWxsYXRpb24gdG9rZW4gdGhhdCBnZXRzIGNhbmNlbGxlZFxuXHRcdC8vIHdoZW4gYW55IGVycm9yIG9jY3Vycy4gdGhpcyBhbGxvd3MgdXMgdG8gcmVzb2x2ZVxuXHRcdC8vIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIHdoaWxlIHJlc29sdmluZyBtZXRhZGF0YVxuXHRcdC8vIGJ1dCBzdGlsbCBjYW5jZWwgdGhlIG9wZXJhdGlvbiBpbiBjZXJ0YWluIGNhc2VzLlxuXHRcdC8vXG5cdFx0Ly8gaW4gYWRkaXRpb24sIHdlIHBhc3MgdGhlIG9wdGlvbmFsIHRva2VuIGluIHRoYXRcblx0XHQvLyB3ZSBnb3QgZnJvbSB0aGUgb3V0c2lkZSB0byBldmVuIGFsbG93IGZvciBleHRlcm5hbFxuXHRcdC8vIGNhbmNlbGxhdGlvbiBvZiB0aGUgcmVhZCBvcGVyYXRpb24uXG5cdFx0Y29uc3QgY2FuY2VsbGFibGVTb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXG5cdFx0bGV0IHJlYWRGaWxlT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0aWYgKGhhc0ZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eShwcm92aWRlcikgJiYgcHJvdmlkZXIuZW5mb3JjZUF0b21pY1JlYWRGaWxlPy4ocmVzb3VyY2UpKSB7XG5cdFx0XHRyZWFkRmlsZU9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGF0b21pYzogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdC8vIHZhbGlkYXRlIHJlYWQgb3BlcmF0aW9uXG5cdFx0Y29uc3Qgc3RhdFByb21pc2UgPSB0aGlzLnZhbGlkYXRlUmVhZEZpbGUocmVzb3VyY2UsIHJlYWRGaWxlT3B0aW9ucykudGhlbihzdGF0ID0+IHN0YXQsIGVycm9yID0+IHtcblx0XHRcdGNhbmNlbGxhYmxlU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGZpbGVTdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gaWYgdGhlIGV0YWcgaXMgcHJvdmlkZWQsIHdlIGF3YWl0IHRoZSByZXN1bHQgb2YgdGhlIHZhbGlkYXRpb25cblx0XHRcdC8vIGR1ZSB0byB0aGUgbGlrZWxpaG9vZCBvZiBoaXR0aW5nIGEgTk9UX01PRElGSUVEX1NJTkNFIHJlc3VsdC5cblx0XHRcdC8vIG90aGVyd2lzZSwgd2UgbGV0IGl0IHJ1biBpbiBwYXJhbGxlbCB0byB0aGUgZmlsZSByZWFkaW5nIGZvclxuXHRcdFx0Ly8gb3B0aW1hbCBzdGFydHVwIHBlcmZvcm1hbmNlLlxuXHRcdFx0aWYgKHR5cGVvZiByZWFkRmlsZU9wdGlvbnM/LmV0YWcgPT09ICdzdHJpbmcnICYmIHJlYWRGaWxlT3B0aW9ucy5ldGFnICE9PSBFVEFHX0RJU0FCTEVEKSB7XG5cdFx0XHRcdGF3YWl0IHN0YXRQcm9taXNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZWFkIHVuYnVmZmVyZWRcblx0XHRcdGlmIChcblx0XHRcdFx0KHJlYWRGaWxlT3B0aW9ucz8uYXRvbWljICYmIGhhc0ZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eShwcm92aWRlcikpIHx8XHRcdFx0XHRcdFx0XHRcdC8vIGF0b21pYyByZWFkcyBhcmUgYWx3YXlzIHVuYnVmZmVyZWRcblx0XHRcdFx0IShoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSB8fCBoYXNGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHkocHJvdmlkZXIpKSB8fFx0Ly8gcHJvdmlkZXIgaGFzIG5vIGJ1ZmZlcmVkIGNhcGFiaWxpdHlcblx0XHRcdFx0KGhhc1JlYWRXcml0ZUNhcGFiaWxpdHkocHJvdmlkZXIpICYmIHJlYWRGaWxlT3B0aW9ucz8ucHJlZmVyVW5idWZmZXJlZClcdFx0XHRcdFx0XHRcdFx0Ly8gdW5idWZmZXJlZCByZWFkIGlzIHByZWZlcnJlZFxuXHRcdFx0KSB7XG5cdFx0XHRcdGZpbGVTdHJlYW0gPSB0aGlzLnJlYWRGaWxlVW5idWZmZXJlZChwcm92aWRlciwgcmVzb3VyY2UsIHJlYWRGaWxlT3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlYWQgc3RyZWFtZWQgKGFsd2F5cyBwcmVmZXIgb3ZlciBwcmltaXRpdmUgYnVmZmVyZWQgcmVhZClcblx0XHRcdGVsc2UgaWYgKGhhc0ZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eShwcm92aWRlcikpIHtcblx0XHRcdFx0ZmlsZVN0cmVhbSA9IHRoaXMucmVhZEZpbGVTdHJlYW1lZChwcm92aWRlciwgcmVzb3VyY2UsIGNhbmNlbGxhYmxlU291cmNlLnRva2VuLCByZWFkRmlsZU9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZWFkIGJ1ZmZlcmVkXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0ZmlsZVN0cmVhbSA9IHRoaXMucmVhZEZpbGVCdWZmZXJlZChwcm92aWRlciwgcmVzb3VyY2UsIGNhbmNlbGxhYmxlU291cmNlLnRva2VuLCByZWFkRmlsZU9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRmaWxlU3RyZWFtLm9uKCdlbmQnLCAoKSA9PiBjYW5jZWxsYWJsZVNvdXJjZS5kaXNwb3NlKCkpO1xuXHRcdFx0ZmlsZVN0cmVhbS5vbignZXJyb3InLCAoKSA9PiBjYW5jZWxsYWJsZVNvdXJjZS5kaXNwb3NlKCkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHN0YXRQcm9taXNlO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5maWxlU3RhdCxcblx0XHRcdFx0dmFsdWU6IGZpbGVTdHJlYW1cblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gQXdhaXQgdGhlIHN0cmVhbSB0byBmaW5pc2ggc28gdGhhdCB3ZSBleGl0IHRoaXMgbWV0aG9kXG5cdFx0XHQvLyBpbiBhIGNvbnNpc3RlbnQgc3RhdGUgd2l0aCBmaWxlIGhhbmRsZXMgY2xvc2VkXG5cdFx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExNDAyNClcblx0XHRcdGlmIChmaWxlU3RyZWFtKSB7XG5cdFx0XHRcdGF3YWl0IGNvbnN1bWVTdHJlYW0oZmlsZVN0cmVhbSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlLXRocm93IGVycm9ycyBhcyBmaWxlIG9wZXJhdGlvbiBlcnJvcnMgYnV0IHByZXNlcnZlXG5cdFx0XHQvLyBzcGVjaWZpYyBlcnJvcnMgKHN1Y2ggYXMgbm90IG1vZGlmaWVkIHNpbmNlKVxuXHRcdFx0dGhyb3cgdGhpcy5yZXN0b3JlUmVhZEVycm9yKGVycm9yLCByZXNvdXJjZSwgcmVhZEZpbGVPcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVSZWFkRXJyb3IoZXJyb3I6IEVycm9yLCByZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlU3RyZWFtT3B0aW9ucyk6IEZpbGVPcGVyYXRpb25FcnJvciB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdlcnIucmVhZCcsIFwiVW5hYmxlIHRvIHJlYWQgZmlsZSAnezB9JyAoezF9KVwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpLCBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcikudG9TdHJpbmcoKSk7XG5cblx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IobWVzc2FnZSwgZXJyb3Iuc3RhdCwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgVG9vTGFyZ2VGaWxlT3BlcmF0aW9uRXJyb3IpIHtcblx0XHRcdHJldHVybiBuZXcgVG9vTGFyZ2VGaWxlT3BlcmF0aW9uRXJyb3IobWVzc2FnZSwgZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCwgZXJyb3Iuc2l6ZSwgZXJyb3Iub3B0aW9ucyBhcyBJUmVhZEZpbGVPcHRpb25zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IEZpbGVPcGVyYXRpb25FcnJvcihtZXNzYWdlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZEZpbGVTdHJlYW1lZChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgb3B0aW9uczogSVJlYWRGaWxlU3RyZWFtT3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCkpOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHtcblx0XHRjb25zdCBmaWxlU3RyZWFtID0gcHJvdmlkZXIucmVhZEZpbGVTdHJlYW0ocmVzb3VyY2UsIG9wdGlvbnMsIHRva2VuKTtcblxuXHRcdHJldHVybiB0cmFuc2Zvcm0oZmlsZVN0cmVhbSwge1xuXHRcdFx0ZGF0YTogZGF0YSA9PiBkYXRhIGluc3RhbmNlb2YgVlNCdWZmZXIgPyBkYXRhIDogVlNCdWZmZXIud3JhcChkYXRhKSxcblx0XHRcdGVycm9yOiBlcnJvciA9PiB0aGlzLnJlc3RvcmVSZWFkRXJyb3IoZXJyb3IsIHJlc291cmNlLCBvcHRpb25zKVxuXHRcdH0sIGRhdGEgPT4gVlNCdWZmZXIuY29uY2F0KGRhdGEpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZEZpbGVCdWZmZXJlZChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCByZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG9wdGlvbnM6IElSZWFkRmlsZVN0cmVhbU9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCk7XG5cblx0XHRyZWFkRmlsZUludG9TdHJlYW0ocHJvdmlkZXIsIHJlc291cmNlLCBzdHJlYW0sIGRhdGEgPT4gZGF0YSwge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGJ1ZmZlclNpemU6IHRoaXMuQlVGRkVSX1NJWkUsXG5cdFx0XHRlcnJvclRyYW5zZm9ybWVyOiBlcnJvciA9PiB0aGlzLnJlc3RvcmVSZWFkRXJyb3IoZXJyb3IsIHJlc291cmNlLCBvcHRpb25zKVxuXHRcdH0sIHRva2VuKTtcblxuXHRcdHJldHVybiBzdHJlYW07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRGaWxlVW5idWZmZXJlZChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSB8IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5LCByZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlT3B0aW9ucyAmIElSZWFkRmlsZVN0cmVhbU9wdGlvbnMpOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08VlNCdWZmZXI+KGRhdGEgPT4gVlNCdWZmZXIuY29uY2F0KGRhdGEpKTtcblxuXHRcdC8vIFJlYWQgdGhlIGZpbGUgaW50byB0aGUgc3RyZWFtIGFzeW5jIGJ1dCBkbyBub3Qgd2FpdCBmb3Jcblx0XHQvLyB0aGlzIHRvIGNvbXBsZXRlIGJlY2F1c2Ugc3RyZWFtcyB3b3JrIHZpYSBldmVudHNcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGV0IGJ1ZmZlcjogVWludDhBcnJheTtcblx0XHRcdFx0aWYgKG9wdGlvbnM/LmF0b21pYyAmJiBoYXNGaWxlQXRvbWljUmVhZENhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gYXdhaXQgcHJvdmlkZXIucmVhZEZpbGUocmVzb3VyY2UsIHsgYXRvbWljOiB0cnVlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGF3YWl0IHByb3ZpZGVyLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHJlc3BlY3QgcG9zaXRpb24gb3B0aW9uXG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8ucG9zaXRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gYnVmZmVyLnNsaWNlKG9wdGlvbnMucG9zaXRpb24pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcmVzcGVjdCBsZW5ndGggb3B0aW9uXG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8ubGVuZ3RoID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGJ1ZmZlci5zbGljZSgwLCBvcHRpb25zLmxlbmd0aCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUaHJvdyBpZiBmaWxlIGlzIHRvbyBsYXJnZSB0byBsb2FkXG5cdFx0XHRcdHRoaXMudmFsaWRhdGVSZWFkRmlsZUxpbWl0cyhyZXNvdXJjZSwgYnVmZmVyLmJ5dGVMZW5ndGgsIG9wdGlvbnMpO1xuXG5cdFx0XHRcdC8vIEVuZCBzdHJlYW0gd2l0aCBkYXRhXG5cdFx0XHRcdHN0cmVhbS5lbmQoVlNCdWZmZXIud3JhcChidWZmZXIpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRzdHJlYW0uZXJyb3IoZXJyKTtcblx0XHRcdFx0c3RyZWFtLmVuZCgpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHRyZXR1cm4gc3RyZWFtO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVTdHJlYW1PcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5yZXNvbHZlKHJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblxuXHRcdC8vIFRocm93IGlmIHJlc291cmNlIGlzIGEgZGlyZWN0b3J5XG5cdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2ZpbGVJc0RpcmVjdG9yeVJlYWRFcnJvcicsIFwiVW5hYmxlIHRvIHJlYWQgZmlsZSAnezB9JyB0aGF0IGlzIGFjdHVhbGx5IGEgZGlyZWN0b3J5XCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfSVNfRElSRUNUT1JZLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBUaHJvdyBpZiBmaWxlIG5vdCBtb2RpZmllZCBzaW5jZSAodW5sZXNzIGRpc2FibGVkKVxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8uZXRhZyA9PT0gJ3N0cmluZycgJiYgb3B0aW9ucy5ldGFnICE9PSBFVEFHX0RJU0FCTEVEICYmIG9wdGlvbnMuZXRhZyA9PT0gc3RhdC5ldGFnKSB7XG5cdFx0XHR0aHJvdyBuZXcgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZU5vdE1vZGlmaWVkRXJyb3InLCBcIkZpbGUgbm90IG1vZGlmaWVkIHNpbmNlXCIpLCBzdGF0LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBUaHJvdyBpZiBmaWxlIGlzIHRvbyBsYXJnZSB0byBsb2FkXG5cdFx0dGhpcy52YWxpZGF0ZVJlYWRGaWxlTGltaXRzKHJlc291cmNlLCBzdGF0LnNpemUsIG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIHN0YXQ7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlUmVhZEZpbGVMaW1pdHMocmVzb3VyY2U6IFVSSSwgc2l6ZTogbnVtYmVyLCBvcHRpb25zPzogSVJlYWRGaWxlU3RyZWFtT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8ubGltaXRzPy5zaXplID09PSAnbnVtYmVyJyAmJiBzaXplID4gb3B0aW9ucy5saW1pdHMuc2l6ZSkge1xuXHRcdFx0dGhyb3cgbmV3IFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCdmaWxlVG9vTGFyZ2VFcnJvcicsIFwiVW5hYmxlIHRvIHJlYWQgZmlsZSAnezB9JyB0aGF0IGlzIHRvbyBsYXJnZSB0byBvcGVuXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFLCBzaXplLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTW92ZS9Db3B5L0RlbGV0ZS9DcmVhdGUgRm9sZGVyXG5cblx0YXN5bmMgY2FuTW92ZShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ2FuTW92ZUNvcHkoc291cmNlLCB0YXJnZXQsICdtb3ZlJywgb3ZlcndyaXRlKTtcblx0fVxuXG5cdGFzeW5jIGNhbkNvcHkoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTxFcnJvciB8IHRydWU+IHtcblx0XHRyZXR1cm4gdGhpcy5kb0Nhbk1vdmVDb3B5KHNvdXJjZSwgdGFyZ2V0LCAnY29weScsIG92ZXJ3cml0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQ2FuTW92ZUNvcHkoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBtb2RlOiAnbW92ZScgfCAnY29weScsIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT4ge1xuXHRcdGlmIChzb3VyY2UudG9TdHJpbmcoKSAhPT0gdGFyZ2V0LnRvU3RyaW5nKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZVByb3ZpZGVyID0gbW9kZSA9PT0gJ21vdmUnID8gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoV3JpdGVQcm92aWRlcihzb3VyY2UpLCBzb3VyY2UpIDogYXdhaXQgdGhpcy53aXRoUmVhZFByb3ZpZGVyKHNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFByb3ZpZGVyID0gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoV3JpdGVQcm92aWRlcih0YXJnZXQpLCB0YXJnZXQpO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9WYWxpZGF0ZU1vdmVDb3B5KHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQsIG1vZGUsIG92ZXJ3cml0ZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBtb3ZlKHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3ZlcndyaXRlPzogYm9vbGVhbik6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7XG5cdFx0Y29uc3Qgc291cmNlUHJvdmlkZXIgPSB0aGlzLnRocm93SWZGaWxlU3lzdGVtSXNSZWFkb25seShhd2FpdCB0aGlzLndpdGhXcml0ZVByb3ZpZGVyKHNvdXJjZSksIHNvdXJjZSk7XG5cdFx0Y29uc3QgdGFyZ2V0UHJvdmlkZXIgPSB0aGlzLnRocm93SWZGaWxlU3lzdGVtSXNSZWFkb25seShhd2FpdCB0aGlzLndpdGhXcml0ZVByb3ZpZGVyKHRhcmdldCksIHRhcmdldCk7XG5cblx0XHQvLyBtb3ZlXG5cdFx0Y29uc3QgbW9kZSA9IGF3YWl0IHRoaXMuZG9Nb3ZlQ29weShzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0LCAnbW92ZScsICEhb3ZlcndyaXRlKTtcblxuXHRcdC8vIHJlc29sdmUgYW5kIHNlbmQgZXZlbnRzXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCB0aGlzLnJlc29sdmUodGFyZ2V0LCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHR0aGlzLl9vbkRpZFJ1bk9wZXJhdGlvbi5maXJlKG5ldyBGaWxlT3BlcmF0aW9uRXZlbnQoc291cmNlLCBtb2RlID09PSAnbW92ZScgPyBGaWxlT3BlcmF0aW9uLk1PVkUgOiBGaWxlT3BlcmF0aW9uLkNPUFksIGZpbGVTdGF0KSk7XG5cblx0XHRyZXR1cm4gZmlsZVN0YXQ7XG5cdH1cblxuXHRhc3luYyBjb3B5KHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3ZlcndyaXRlPzogYm9vbGVhbik6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7XG5cdFx0Y29uc3Qgc291cmNlUHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhSZWFkUHJvdmlkZXIoc291cmNlKTtcblx0XHRjb25zdCB0YXJnZXRQcm92aWRlciA9IHRoaXMudGhyb3dJZkZpbGVTeXN0ZW1Jc1JlYWRvbmx5KGF3YWl0IHRoaXMud2l0aFdyaXRlUHJvdmlkZXIodGFyZ2V0KSwgdGFyZ2V0KTtcblxuXHRcdC8vIGNvcHlcblx0XHRjb25zdCBtb2RlID0gYXdhaXQgdGhpcy5kb01vdmVDb3B5KHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQsICdjb3B5JywgISFvdmVyd3JpdGUpO1xuXG5cdFx0Ly8gcmVzb2x2ZSBhbmQgc2VuZCBldmVudHNcblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHRoaXMucmVzb2x2ZSh0YXJnZXQsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdHRoaXMuX29uRGlkUnVuT3BlcmF0aW9uLmZpcmUobmV3IEZpbGVPcGVyYXRpb25FdmVudChzb3VyY2UsIG1vZGUgPT09ICdjb3B5JyA/IEZpbGVPcGVyYXRpb24uQ09QWSA6IEZpbGVPcGVyYXRpb24uTU9WRSwgZmlsZVN0YXQpKTtcblxuXHRcdHJldHVybiBmaWxlU3RhdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Nb3ZlQ29weShzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgc291cmNlOiBVUkksIHRhcmdldFByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCB0YXJnZXQ6IFVSSSwgbW9kZTogJ21vdmUnIHwgJ2NvcHknLCBvdmVyd3JpdGU6IGJvb2xlYW4pOiBQcm9taXNlPCdtb3ZlJyB8ICdjb3B5Jz4ge1xuXHRcdGlmIChzb3VyY2UudG9TdHJpbmcoKSA9PT0gdGFyZ2V0LnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiBtb2RlOyAvLyBzaW11bGF0ZSBub2RlLmpzIGJlaGF2aW91ciBoZXJlIGFuZCBkbyBhIG5vLW9wIGlmIHBhdGhzIG1hdGNoXG5cdFx0fVxuXG5cdFx0Ly8gdmFsaWRhdGlvblxuXHRcdGNvbnN0IHsgZXhpc3RzLCBpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSB9ID0gYXdhaXQgdGhpcy5kb1ZhbGlkYXRlTW92ZUNvcHkoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCwgbW9kZSwgb3ZlcndyaXRlKTtcblxuXHRcdC8vIGRlbGV0ZSBhcyBuZWVkZWQgKHVubGVzcyB0YXJnZXQgaXMgc2FtZSByZXN1cmNlIHdpdGggZGlmZmVyZW50IHBhdGggY2FzZSlcblx0XHRpZiAoZXhpc3RzICYmICFpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSAmJiBvdmVyd3JpdGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGVsKHRhcmdldCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIHBhcmVudCBmb2xkZXJzXG5cdFx0YXdhaXQgdGhpcy5ta2RpcnAodGFyZ2V0UHJvdmlkZXIsIHRoaXMuZ2V0RXh0VXJpKHRhcmdldFByb3ZpZGVyKS5wcm92aWRlckV4dFVyaS5kaXJuYW1lKHRhcmdldCkpO1xuXG5cdFx0Ly8gY29weSBzb3VyY2UgPT4gdGFyZ2V0XG5cdFx0aWYgKG1vZGUgPT09ICdjb3B5Jykge1xuXG5cdFx0XHQvLyBzYW1lIHByb3ZpZGVyIHdpdGggZmFzdCBjb3B5OiBsZXZlcmFnZSBjb3B5KCkgZnVuY3Rpb25hbGl0eVxuXHRcdFx0aWYgKHNvdXJjZVByb3ZpZGVyID09PSB0YXJnZXRQcm92aWRlciAmJiBoYXNGaWxlRm9sZGVyQ29weUNhcGFiaWxpdHkoc291cmNlUHJvdmlkZXIpKSB7XG5cdFx0XHRcdGF3YWl0IHNvdXJjZVByb3ZpZGVyLmNvcHkoc291cmNlLCB0YXJnZXQsIHsgb3ZlcndyaXRlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB3aGVuIGNvcHlpbmcgdmlhIGJ1ZmZlci91bmJ1ZmZlcmVkLCB3ZSBoYXZlIHRvIG1hbnVhbGx5XG5cdFx0XHQvLyB0cmF2ZXJzZSB0aGUgc291cmNlIGlmIGl0IGlzIGEgZm9sZGVyIGFuZCBub3QgYSBmaWxlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlRmlsZSA9IGF3YWl0IHRoaXMucmVzb2x2ZShzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc291cmNlRmlsZS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9Db3B5Rm9sZGVyKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2VGaWxlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvQ29weUZpbGUoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG1vZGU7XG5cdFx0fVxuXG5cdFx0Ly8gbW92ZSBzb3VyY2UgPT4gdGFyZ2V0XG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIHNhbWUgcHJvdmlkZXI6IGxldmVyYWdlIHJlbmFtZSgpIGZ1bmN0aW9uYWxpdHlcblx0XHRcdGlmIChzb3VyY2VQcm92aWRlciA9PT0gdGFyZ2V0UHJvdmlkZXIpIHtcblx0XHRcdFx0YXdhaXQgc291cmNlUHJvdmlkZXIucmVuYW1lKHNvdXJjZSwgdGFyZ2V0LCB7IG92ZXJ3cml0ZSB9KTtcblxuXHRcdFx0XHRyZXR1cm4gbW9kZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYWNyb3NzIHByb3ZpZGVyczogY29weSB0byB0YXJnZXQgJiBkZWxldGUgYXQgc291cmNlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb01vdmVDb3B5KHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQsICdjb3B5Jywgb3ZlcndyaXRlKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWwoc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdFx0XHRyZXR1cm4gJ2NvcHknO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Db3B5RmlsZShzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgc291cmNlOiBVUkksIHRhcmdldFByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gY29weTogc291cmNlIChidWZmZXJlZCkgPT4gdGFyZ2V0IChidWZmZXJlZClcblx0XHRpZiAoaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShzb3VyY2VQcm92aWRlcikgJiYgaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSh0YXJnZXRQcm92aWRlcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvUGlwZUJ1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQpO1xuXHRcdH1cblxuXHRcdC8vIGNvcHk6IHNvdXJjZSAoYnVmZmVyZWQpID0+IHRhcmdldCAodW5idWZmZXJlZClcblx0XHRpZiAoaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShzb3VyY2VQcm92aWRlcikgJiYgaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eSh0YXJnZXRQcm92aWRlcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvUGlwZUJ1ZmZlcmVkVG9VbmJ1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQpO1xuXHRcdH1cblxuXHRcdC8vIGNvcHk6IHNvdXJjZSAodW5idWZmZXJlZCkgPT4gdGFyZ2V0IChidWZmZXJlZClcblx0XHRpZiAoaGFzUmVhZFdyaXRlQ2FwYWJpbGl0eShzb3VyY2VQcm92aWRlcikgJiYgaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSh0YXJnZXRQcm92aWRlcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvUGlwZVVuYnVmZmVyZWRUb0J1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQpO1xuXHRcdH1cblxuXHRcdC8vIGNvcHk6IHNvdXJjZSAodW5idWZmZXJlZCkgPT4gdGFyZ2V0ICh1bmJ1ZmZlcmVkKVxuXHRcdGlmIChoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHNvdXJjZVByb3ZpZGVyKSAmJiBoYXNSZWFkV3JpdGVDYXBhYmlsaXR5KHRhcmdldFByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9QaXBlVW5idWZmZXJlZChzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQ29weUZvbGRlcihzb3VyY2VQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlciwgc291cmNlRm9sZGVyOiBJRmlsZVN0YXQsIHRhcmdldFByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCB0YXJnZXRGb2xkZXI6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gY3JlYXRlIGZvbGRlciBpbiB0YXJnZXRcblx0XHRhd2FpdCB0YXJnZXRQcm92aWRlci5ta2Rpcih0YXJnZXRGb2xkZXIpO1xuXG5cdFx0Ly8gY3JlYXRlIGNoaWxkcmVuIGluIHRhcmdldFxuXHRcdGlmIChBcnJheS5pc0FycmF5KHNvdXJjZUZvbGRlci5jaGlsZHJlbikpIHtcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoc291cmNlRm9sZGVyLmNoaWxkcmVuLm1hcChhc3luYyBzb3VyY2VDaGlsZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldENoaWxkID0gdGhpcy5nZXRFeHRVcmkodGFyZ2V0UHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpLmpvaW5QYXRoKHRhcmdldEZvbGRlciwgc291cmNlQ2hpbGQubmFtZSk7XG5cdFx0XHRcdGlmIChzb3VyY2VDaGlsZC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmRvQ29weUZvbGRlcihzb3VyY2VQcm92aWRlciwgYXdhaXQgdGhpcy5yZXNvbHZlKHNvdXJjZUNoaWxkLnJlc291cmNlKSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldENoaWxkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb0NvcHlGaWxlKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2VDaGlsZC5yZXNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldENoaWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9WYWxpZGF0ZU1vdmVDb3B5KHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCBzb3VyY2U6IFVSSSwgdGFyZ2V0UHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIsIHRhcmdldDogVVJJLCBtb2RlOiAnbW92ZScgfCAnY29weScsIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPHsgZXhpc3RzOiBib29sZWFuOyBpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZTogYm9vbGVhbiB9PiB7XG5cdFx0bGV0IGlzU2FtZVJlc291cmNlV2l0aERpZmZlcmVudFBhdGhDYXNlID0gZmFsc2U7XG5cblx0XHQvLyBDaGVjayBpZiBzb3VyY2UgaXMgZXF1YWwgb3IgcGFyZW50IHRvIHRhcmdldCAocmVxdWlyZXMgcHJvdmlkZXJzIHRvIGJlIHRoZSBzYW1lKVxuXHRcdGlmIChzb3VyY2VQcm92aWRlciA9PT0gdGFyZ2V0UHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHsgcHJvdmlkZXJFeHRVcmksIGlzUGF0aENhc2VTZW5zaXRpdmUgfSA9IHRoaXMuZ2V0RXh0VXJpKHNvdXJjZVByb3ZpZGVyKTtcblx0XHRcdGlmICghaXNQYXRoQ2FzZVNlbnNpdGl2ZSkge1xuXHRcdFx0XHRpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSA9IHByb3ZpZGVyRXh0VXJpLmlzRXF1YWwoc291cmNlLCB0YXJnZXQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNTYW1lUmVzb3VyY2VXaXRoRGlmZmVyZW50UGF0aENhc2UgJiYgbW9kZSA9PT0gJ2NvcHknKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgndW5hYmxlVG9Nb3ZlQ29weUVycm9yMScsIFwiVW5hYmxlIHRvIGNvcHkgd2hlbiBzb3VyY2UgJ3swfScgaXMgc2FtZSBhcyB0YXJnZXQgJ3sxfScgd2l0aCBkaWZmZXJlbnQgcGF0aCBjYXNlIG9uIGEgY2FzZSBpbnNlbnNpdGl2ZSBmaWxlIHN5c3RlbVwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3Ioc291cmNlKSwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHRhcmdldCkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSAmJiBwcm92aWRlckV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodGFyZ2V0LCBzb3VyY2UpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgndW5hYmxlVG9Nb3ZlQ29weUVycm9yMicsIFwiVW5hYmxlIHRvIG1vdmUvY29weSB3aGVuIHNvdXJjZSAnezB9JyBpcyBwYXJlbnQgb2YgdGFyZ2V0ICd7MX0nLlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3Ioc291cmNlKSwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHRhcmdldCkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFeHRyYSBjaGVja3MgaWYgdGFyZ2V0IGV4aXN0cyBhbmQgdGhpcyBpcyBub3QgYSByZW5hbWVcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmV4aXN0cyh0YXJnZXQpO1xuXHRcdGlmIChleGlzdHMgJiYgIWlzU2FtZVJlc291cmNlV2l0aERpZmZlcmVudFBhdGhDYXNlKSB7XG5cblx0XHRcdC8vIEJhaWwgb3V0IGlmIHRhcmdldCBleGlzdHMgYW5kIHdlIGFyZSBub3QgYWJvdXQgdG8gb3ZlcndyaXRlXG5cdFx0XHRpZiAoIW92ZXJ3cml0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKGxvY2FsaXplKCd1bmFibGVUb01vdmVDb3B5RXJyb3IzJywgXCJVbmFibGUgdG8gbW92ZS9jb3B5ICd7MH0nIGJlY2F1c2UgdGFyZ2V0ICd7MX0nIGFscmVhZHkgZXhpc3RzIGF0IGRlc3RpbmF0aW9uLlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3Ioc291cmNlKSwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHRhcmdldCkpLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNwZWNpYWwgY2FzZTogaWYgdGhlIHRhcmdldCBpcyBhIHBhcmVudCBvZiB0aGUgc291cmNlLCB3ZSBjYW5ub3QgZGVsZXRlXG5cdFx0XHQvLyBpdCBhcyBpdCB3b3VsZCBkZWxldGUgdGhlIHNvdXJjZSBhcyB3ZWxsLiBJbiB0aGlzIGNhc2Ugd2UgaGF2ZSB0byB0aHJvd1xuXHRcdFx0aWYgKHNvdXJjZVByb3ZpZGVyID09PSB0YXJnZXRQcm92aWRlcikge1xuXHRcdFx0XHRjb25zdCB7IHByb3ZpZGVyRXh0VXJpIH0gPSB0aGlzLmdldEV4dFVyaShzb3VyY2VQcm92aWRlcik7XG5cdFx0XHRcdGlmIChwcm92aWRlckV4dFVyaS5pc0VxdWFsT3JQYXJlbnQoc291cmNlLCB0YXJnZXQpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd1bmFibGVUb01vdmVDb3B5RXJyb3I0JywgXCJVbmFibGUgdG8gbW92ZS9jb3B5ICd7MH0nIGludG8gJ3sxfScgc2luY2UgYSBmaWxlIHdvdWxkIHJlcGxhY2UgdGhlIGZvbGRlciBpdCBpcyBjb250YWluZWQgaW4uXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihzb3VyY2UpLCB0aGlzLnJlc291cmNlRm9yRXJyb3IodGFyZ2V0KSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZXhpc3RzLCBpc1NhbWVSZXNvdXJjZVdpdGhEaWZmZXJlbnRQYXRoQ2FzZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHRVcmkocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiB7IHByb3ZpZGVyRXh0VXJpOiBJRXh0VXJpOyBpc1BhdGhDYXNlU2Vuc2l0aXZlOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IGlzUGF0aENhc2VTZW5zaXRpdmUgPSB0aGlzLmlzUGF0aENhc2VTZW5zaXRpdmUocHJvdmlkZXIpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyRXh0VXJpOiBpc1BhdGhDYXNlU2Vuc2l0aXZlID8gZXh0VXJpIDogZXh0VXJpSWdub3JlUGF0aENhc2UsXG5cdFx0XHRpc1BhdGhDYXNlU2Vuc2l0aXZlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgaXNQYXRoQ2FzZVNlbnNpdGl2ZShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlRm9sZGVyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpLCByZXNvdXJjZSk7XG5cblx0XHQvLyBta2RpciByZWN1cnNpdmVseVxuXHRcdGF3YWl0IHRoaXMubWtkaXJwKHByb3ZpZGVyLCByZXNvdXJjZSk7XG5cblx0XHQvLyBldmVudHNcblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHRoaXMucmVzb2x2ZShyZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0dGhpcy5fb25EaWRSdW5PcGVyYXRpb24uZmlyZShuZXcgRmlsZU9wZXJhdGlvbkV2ZW50KHJlc291cmNlLCBGaWxlT3BlcmF0aW9uLkNSRUFURSwgZmlsZVN0YXQpKTtcblxuXHRcdHJldHVybiBmaWxlU3RhdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWtkaXJwKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyLCBkaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzVG9DcmVhdGU6IHN0cmluZ1tdID0gW107XG5cblx0XHQvLyBta2RpciB1bnRpbCB3ZSByZWFjaCByb290XG5cdFx0Y29uc3QgeyBwcm92aWRlckV4dFVyaSB9ID0gdGhpcy5nZXRFeHRVcmkocHJvdmlkZXIpO1xuXHRcdHdoaWxlICghcHJvdmlkZXJFeHRVcmkuaXNFcXVhbChkaXJlY3RvcnksIHByb3ZpZGVyRXh0VXJpLmRpcm5hbWUoZGlyZWN0b3J5KSkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KGRpcmVjdG9yeSk7XG5cdFx0XHRcdGlmICgoc3RhdC50eXBlICYgRmlsZVR5cGUuRGlyZWN0b3J5KSA9PT0gMCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbWtkaXJFeGlzdHNFcnJvcicsIFwiVW5hYmxlIHRvIGNyZWF0ZSBmb2xkZXIgJ3swfScgdGhhdCBhbHJlYWR5IGV4aXN0cyBidXQgaXMgbm90IGEgZGlyZWN0b3J5XCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihkaXJlY3RvcnkpKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhazsgLy8gd2UgaGF2ZSBoaXQgYSBkaXJlY3RvcnkgdGhhdCBleGlzdHMgLT4gZ29vZFxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0XHQvLyBCdWJibGUgdXAgYW55IG90aGVyIGVycm9yIHRoYXQgaXMgbm90IGZpbGUgbm90IGZvdW5kXG5cdFx0XHRcdGlmICh0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnJvcikgIT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVwb24gZXJyb3IsIHJlbWVtYmVyIGRpcmVjdG9yaWVzIHRoYXQgbmVlZCB0byBiZSBjcmVhdGVkXG5cdFx0XHRcdGRpcmVjdG9yaWVzVG9DcmVhdGUucHVzaChwcm92aWRlckV4dFVyaS5iYXNlbmFtZShkaXJlY3RvcnkpKTtcblxuXHRcdFx0XHQvLyBDb250aW51ZSB1cFxuXHRcdFx0XHRkaXJlY3RvcnkgPSBwcm92aWRlckV4dFVyaS5kaXJuYW1lKGRpcmVjdG9yeSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGRpcmVjdG9yaWVzIGFzIG5lZWRlZFxuXHRcdGZvciAobGV0IGkgPSBkaXJlY3Rvcmllc1RvQ3JlYXRlLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRkaXJlY3RvcnkgPSBwcm92aWRlckV4dFVyaS5qb2luUGF0aChkaXJlY3RvcnksIGRpcmVjdG9yaWVzVG9DcmVhdGVbaV0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwcm92aWRlci5ta2RpcihkaXJlY3RvcnkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycm9yKSAhPT0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHMpIHtcblx0XHRcdFx0XHQvLyBGb3IgbWtkaXJwKCkgd2UgdG9sZXJhdGUgdGhhdCB0aGUgbWtkaXIoKSBjYWxsIGZhaWxzXG5cdFx0XHRcdFx0Ly8gaW4gY2FzZSB0aGUgZm9sZGVyIGFscmVhZHkgZXhpc3RzLiBUaGlzIGZvbGxvd3Mgbm9kZS5qc1xuXHRcdFx0XHRcdC8vIG93biBpbXBsZW1lbnRhdGlvbiBvZiBmcy5ta2Rpcih7IHJlY3Vyc2l2ZTogdHJ1ZSB9KSBhbmRcblx0XHRcdFx0XHQvLyByZWR1Y2VzIHRoZSBjaGFuY2VzIG9mIHJhY2UgY29uZGl0aW9ucyBsZWFkaW5nIHRvIGVycm9yc1xuXHRcdFx0XHRcdC8vIGlmIG11bHRpcGxlIGNhbGxzIHRyeSB0byBjcmVhdGUgdGhlIHNhbWUgZm9sZGVyc1xuXHRcdFx0XHRcdC8vIEFzIHN1Y2gsIHdlIG9ubHkgdGhyb3cgYW4gZXJyb3IgaGVyZSBpZiBpdCBpcyBvdGhlciB0aGFuXG5cdFx0XHRcdFx0Ly8gdGhlIGZhY3QgdGhhdCB0aGUgZmlsZSBhbHJlYWR5IGV4aXN0cy5cblx0XHRcdFx0XHQvLyAoc2VlIGFsc28gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzg5ODM0KVxuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2FuRGVsZXRlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBQYXJ0aWFsPElGaWxlRGVsZXRlT3B0aW9ucz4pOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvVmFsaWRhdGVEZWxldGUocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVmFsaWRhdGVEZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IFBhcnRpYWw8SUZpbGVEZWxldGVPcHRpb25zPik6IFByb21pc2U8SUZpbGVTeXN0ZW1Qcm92aWRlcj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy50aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHkoYXdhaXQgdGhpcy53aXRoUHJvdmlkZXIocmVzb3VyY2UpLCByZXNvdXJjZSk7XG5cblx0XHQvLyBWYWxpZGF0ZSB0cmFzaCBzdXBwb3J0XG5cdFx0Y29uc3QgdXNlVHJhc2ggPSAhIW9wdGlvbnM/LnVzZVRyYXNoO1xuXHRcdGlmICh1c2VUcmFzaCAmJiAhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5UcmFzaCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnZGVsZXRlRmFpbGVkVHJhc2hVbnN1cHBvcnRlZCcsIFwiVW5hYmxlIHRvIGRlbGV0ZSBmaWxlICd7MH0nIHZpYSB0cmFzaCBiZWNhdXNlIHByb3ZpZGVyIGRvZXMgbm90IHN1cHBvcnQgaXQuXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBhdG9taWMgc3VwcG9ydFxuXHRcdGNvbnN0IGF0b21pYyA9IG9wdGlvbnM/LmF0b21pYztcblx0XHRpZiAoYXRvbWljICYmICEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNEZWxldGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2RlbGV0ZUZhaWxlZEF0b21pY1Vuc3VwcG9ydGVkJywgXCJVbmFibGUgdG8gZGVsZXRlIGZpbGUgJ3swfScgYXRvbWljYWxseSBiZWNhdXNlIHByb3ZpZGVyIGRvZXMgbm90IHN1cHBvcnQgaXQuXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpKTtcblx0XHR9XG5cblx0XHRpZiAodXNlVHJhc2ggJiYgYXRvbWljKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2RlbGV0ZUZhaWxlZFRyYXNoQW5kQXRvbWljVW5zdXBwb3J0ZWQnLCBcIlVuYWJsZSB0byBhdG9taWNhbGx5IGRlbGV0ZSBmaWxlICd7MH0nIGJlY2F1c2UgdXNpbmcgdHJhc2ggaXMgZW5hYmxlZC5cIiwgdGhpcy5yZXNvdXJjZUZvckVycm9yKHJlc291cmNlKSkpO1xuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIGRlbGV0ZVxuXHRcdGxldCBzdGF0OiBJU3RhdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHByb3ZpZGVyLnN0YXQocmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBIYW5kbGVkIGxhdGVyXG5cdFx0fVxuXG5cdFx0aWYgKHN0YXQpIHtcblx0XHRcdHRoaXMudGhyb3dJZkZpbGVJc1JlYWRvbmx5KHJlc291cmNlLCBzdGF0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZGVsZXRlRmFpbGVkTm90Rm91bmQnLCBcIlVuYWJsZSB0byBkZWxldGUgbm9uZXhpc3RlbnQgZmlsZSAnezB9J1wiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgcmVjdXJzaXZlXG5cdFx0Y29uc3QgcmVjdXJzaXZlID0gISFvcHRpb25zPy5yZWN1cnNpdmU7XG5cdFx0aWYgKCFyZWN1cnNpdmUpIHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkgJiYgQXJyYXkuaXNBcnJheShzdGF0LmNoaWxkcmVuKSAmJiBzdGF0LmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdkZWxldGVGYWlsZWROb25FbXB0eUZvbGRlcicsIFwiVW5hYmxlIHRvIGRlbGV0ZSBub24tZW1wdHkgZm9sZGVyICd7MH0nLlwiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3ZpZGVyO1xuXHR9XG5cblx0YXN5bmMgZGVsKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBQYXJ0aWFsPElGaWxlRGVsZXRlT3B0aW9ucz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMuZG9WYWxpZGF0ZURlbGV0ZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cblx0XHRsZXQgZGVsZXRlRmlsZU9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdGlmIChoYXNGaWxlQXRvbWljRGVsZXRlQ2FwYWJpbGl0eShwcm92aWRlcikgJiYgIWRlbGV0ZUZpbGVPcHRpb25zPy5hdG9taWMpIHtcblx0XHRcdGNvbnN0IGVuZm9yY2VkQXRvbWljRGVsZXRlID0gcHJvdmlkZXIuZW5mb3JjZUF0b21pY0RlbGV0ZT8uKHJlc291cmNlKTtcblx0XHRcdGlmIChlbmZvcmNlZEF0b21pY0RlbGV0ZSkge1xuXHRcdFx0XHRkZWxldGVGaWxlT3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgYXRvbWljOiBlbmZvcmNlZEF0b21pY0RlbGV0ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVzZVRyYXNoID0gISFkZWxldGVGaWxlT3B0aW9ucz8udXNlVHJhc2g7XG5cdFx0Y29uc3QgcmVjdXJzaXZlID0gISFkZWxldGVGaWxlT3B0aW9ucz8ucmVjdXJzaXZlO1xuXHRcdGNvbnN0IGF0b21pYyA9IGRlbGV0ZUZpbGVPcHRpb25zPy5hdG9taWMgPz8gZmFsc2U7XG5cblx0XHQvLyBEZWxldGUgdGhyb3VnaCBwcm92aWRlclxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZShyZXNvdXJjZSwgeyByZWN1cnNpdmUsIHVzZVRyYXNoLCBhdG9taWMgfSk7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLl9vbkRpZFJ1bk9wZXJhdGlvbi5maXJlKG5ldyBGaWxlT3BlcmF0aW9uRXZlbnQocmVzb3VyY2UsIEZpbGVPcGVyYXRpb24uREVMRVRFKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQ2xvbmUgRmlsZVxuXG5cdGFzeW5jIGNsb25lRmlsZShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzb3VyY2VQcm92aWRlciA9IGF3YWl0IHRoaXMud2l0aFByb3ZpZGVyKHNvdXJjZSk7XG5cdFx0Y29uc3QgdGFyZ2V0UHJvdmlkZXIgPSB0aGlzLnRocm93SWZGaWxlU3lzdGVtSXNSZWFkb25seShhd2FpdCB0aGlzLndpdGhXcml0ZVByb3ZpZGVyKHRhcmdldCksIHRhcmdldCk7XG5cblx0XHRpZiAoc291cmNlUHJvdmlkZXIgPT09IHRhcmdldFByb3ZpZGVyICYmIHRoaXMuZ2V0RXh0VXJpKHNvdXJjZVByb3ZpZGVyKS5wcm92aWRlckV4dFVyaS5pc0VxdWFsKHNvdXJjZSwgdGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgaWYgcGF0aHMgYXJlIGVxdWFsXG5cdFx0fVxuXG5cdFx0Ly8gc2FtZSBwcm92aWRlciwgdXNlIGBjbG9uZUZpbGVgIHdoZW4gbmF0aXZlIHN1cHBvcnQgaXMgcHJvdmlkZWRcblx0XHRpZiAoc291cmNlUHJvdmlkZXIgPT09IHRhcmdldFByb3ZpZGVyICYmIGhhc0ZpbGVDbG9uZUNhcGFiaWxpdHkoc291cmNlUHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gc291cmNlUHJvdmlkZXIuY2xvbmVGaWxlKHNvdXJjZSwgdGFyZ2V0KTtcblx0XHR9XG5cblx0XHQvLyBvdGhlcndpc2UsIGVpdGhlciBwcm92aWRlcnMgYXJlIGRpZmZlcmVudCBvciB0aGVyZSBpcyBubyBuYXRpdmVcblx0XHQvLyBgY2xvbmVGaWxlYCBzdXBwb3J0LCB0aGVuIHdlIGZhbGxiYWNrIHRvIGVtdWxhdGUgYSBjbG9uZSBhcyBiZXN0XG5cdFx0Ly8gYXMgd2UgY2FuIHdpdGggdGhlIG90aGVyIHByaW1pdGl2ZXNcblxuXHRcdC8vIGNyZWF0ZSBwYXJlbnQgZm9sZGVyc1xuXHRcdGF3YWl0IHRoaXMubWtkaXJwKHRhcmdldFByb3ZpZGVyLCB0aGlzLmdldEV4dFVyaSh0YXJnZXRQcm92aWRlcikucHJvdmlkZXJFeHRVcmkuZGlybmFtZSh0YXJnZXQpKTtcblxuXHRcdC8vIGxldmVyYWdlIGBjb3B5YCBtZXRob2QgaWYgcHJvdmlkZWQgYW5kIHByb3ZpZGVycyBhcmUgaWRlbnRpY2FsXG5cdFx0Ly8gcXVldWUgb24gdGhlIHNvdXJjZSB0byBlbnN1cmUgYXRvbWljIHJlYWRcblx0XHRpZiAoc291cmNlUHJvdmlkZXIgPT09IHRhcmdldFByb3ZpZGVyICYmIGhhc0ZpbGVGb2xkZXJDb3B5Q2FwYWJpbGl0eShzb3VyY2VQcm92aWRlcikpIHtcblx0XHRcdHJldHVybiB0aGlzLndyaXRlUXVldWUucXVldWVGb3Ioc291cmNlLCAoKSA9PiBzb3VyY2VQcm92aWRlci5jb3B5KHNvdXJjZSwgdGFyZ2V0LCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KSwgdGhpcy5nZXRFeHRVcmkoc291cmNlUHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpKTtcblx0XHR9XG5cblx0XHQvLyBvdGhlcndpc2UgY29weSB2aWEgYnVmZmVyL3VuYnVmZmVyZWQgYW5kIHVzZSBhIHdyaXRlIHF1ZXVlXG5cdFx0Ly8gb24gdGhlIHNvdXJjZSB0byBlbnN1cmUgYXRvbWljIG9wZXJhdGlvbiBhcyBtdWNoIGFzIHBvc3NpYmxlXG5cdFx0cmV0dXJuIHRoaXMud3JpdGVRdWV1ZS5xdWV1ZUZvcihzb3VyY2UsICgpID0+IHRoaXMuZG9Db3B5RmlsZShzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KSwgdGhpcy5nZXRFeHRVcmkoc291cmNlUHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGaWxlIFdhdGNoaW5nXG5cblx0cHJpdmF0ZSByZWFkb25seSBpbnRlcm5hbE9uRGlkRmlsZXNDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxGaWxlQ2hhbmdlc0V2ZW50PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVuY29ycmVsYXRlZEZpbGVzQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RmlsZUNoYW5nZXNFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRmlsZXNDaGFuZ2UgPSB0aGlzLl9vbkRpZFVuY29ycmVsYXRlZEZpbGVzQ2hhbmdlLmV2ZW50OyAvLyBnbG9iYWwgYG9uRGlkRmlsZXNDaGFuZ2VgIHNraXBzIGNvcnJlbGF0ZWQgZXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRXYXRjaEVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXJyb3I+KCkpO1xuXHRyZWFkb25seSBvbkRpZFdhdGNoRXJyb3IgPSB0aGlzLl9vbkRpZFdhdGNoRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVXYXRjaGVycyA9IG5ldyBNYXA8bnVtYmVyIC8qIHdhdGNoIHJlcXVlc3QgaGFzaCAqLywgeyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTsgY291bnQ6IG51bWJlciB9PigpO1xuXG5cdHByaXZhdGUgc3RhdGljIFdBVENIRVJfQ09SUkVMQVRJT05fSURTID0gMDtcblxuXHRjcmVhdGVXYXRjaGVyKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElXYXRjaE9wdGlvbnNXaXRob3V0Q29ycmVsYXRpb24gJiB7IHJlY3Vyc2l2ZTogZmFsc2UgfSk6IElGaWxlU3lzdGVtV2F0Y2hlciB7XG5cdFx0cmV0dXJuIHRoaXMud2F0Y2gocmVzb3VyY2UsIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHQvLyBFeHBsaWNpdGx5IHNldCBhIGNvcnJlbGF0aW9uIGlkIHNvIHRoYXQgZmlsZSBldmVudHMgdGhhdCBvcmlnaW5hdGVcblx0XHRcdC8vIGZyb20gcmVxdWVzdHMgZnJvbSBleHRlbnNpb25zIGFyZSBleGNsdXNpdmVseSByb3V0ZWQgYmFjayB0byB0aGVcblx0XHRcdC8vIGV4dGVuc2lvbiBob3N0IGFuZCBub3QgaW50byB0aGUgd29ya2JlbmNoLlxuXHRcdFx0Y29ycmVsYXRpb25JZDogRmlsZVNlcnZpY2UuV0FUQ0hFUl9DT1JSRUxBVElPTl9JRFMrK1xuXHRcdH0pO1xuXHR9XG5cblx0d2F0Y2gocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdhdGNoT3B0aW9uc1dpdGhDb3JyZWxhdGlvbik6IElGaWxlU3lzdGVtV2F0Y2hlcjtcblx0d2F0Y2gocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElXYXRjaE9wdGlvbnNXaXRob3V0Q29ycmVsYXRpb24pOiBJRGlzcG9zYWJsZTtcblx0d2F0Y2gocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdhdGNoT3B0aW9ucyA9IHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pOiBJRmlsZVN5c3RlbVdhdGNoZXIgfCBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBGb3J3YXJkIHdhdGNoIHJlcXVlc3QgdG8gcHJvdmlkZXIgYW5kIHdpcmUgaW4gZGlzcG9zYWJsZXNcblx0XHRsZXQgd2F0Y2hEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGxldCBkaXNwb3NlV2F0Y2ggPSAoKSA9PiB7IHdhdGNoRGlzcG9zZWQgPSB0cnVlOyB9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZGlzcG9zZVdhdGNoKCkpKTtcblxuXHRcdC8vIFdhdGNoIGFuZCB3aXJlIGluIGRpc3Bvc2FibGUgd2hpY2ggaXMgYXN5bmMgYnV0XG5cdFx0Ly8gY2hlY2sgaWYgd2UgZ290IGRpc3Bvc2VkIG1lYW53aGlsZSBhbmQgZm9yd2FyZFxuXHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gYXdhaXQgdGhpcy5kb1dhdGNoKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKHdhdGNoRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRkaXNwb3NlKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRpc3Bvc2VXYXRjaCA9ICgpID0+IGRpc3Bvc2UoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdC8vIFdoZW4gYSBjb3JyZWxhdGlvbiBpZGVudGlmaWVyIGlzIHNldCwgcmV0dXJuIGEgc3BlY2lmaWNcblx0XHQvLyB3YXRjaGVyIHRoYXQgb25seSBlbWl0cyBldmVudHMgbWF0Y2hpbmcgdGhhdCBjb3JyZWFsYXRpb24uXG5cdFx0Y29uc3QgY29ycmVsYXRpb25JZCA9IG9wdGlvbnMuY29ycmVsYXRpb25JZDtcblx0XHRpZiAodHlwZW9mIGNvcnJlbGF0aW9uSWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBmaWxlQ2hhbmdlRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxGaWxlQ2hhbmdlc0V2ZW50PigpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmludGVybmFsT25EaWRGaWxlc0NoYW5nZS5ldmVudChlID0+IHtcblx0XHRcdFx0aWYgKGUuY29ycmVsYXRlcyhjb3JyZWxhdGlvbklkKSkge1xuXHRcdFx0XHRcdGZpbGVDaGFuZ2VFbWl0dGVyLmZpcmUoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgd2F0Y2hlcjogSUZpbGVTeXN0ZW1XYXRjaGVyID0ge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogZmlsZUNoYW5nZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIHdhdGNoZXI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dhdGNoKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElXYXRjaE9wdGlvbnMpOiBQcm9taXNlPElEaXNwb3NhYmxlPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLndpdGhQcm92aWRlcihyZXNvdXJjZSk7XG5cblx0XHQvLyBEZWR1cGxpY2F0ZSBpZGVudGljYWwgd2F0Y2ggcmVxdWVzdHNcblx0XHRjb25zdCB3YXRjaEhhc2ggPSBoYXNoKFt0aGlzLmdldEV4dFVyaShwcm92aWRlcikucHJvdmlkZXJFeHRVcmkuZ2V0Q29tcGFyaXNvbktleShyZXNvdXJjZSksIG9wdGlvbnNdKTtcblx0XHRsZXQgd2F0Y2hlciA9IHRoaXMuYWN0aXZlV2F0Y2hlcnMuZ2V0KHdhdGNoSGFzaCk7XG5cdFx0aWYgKCF3YXRjaGVyKSB7XG5cdFx0XHR3YXRjaGVyID0ge1xuXHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0ZGlzcG9zYWJsZTogcHJvdmlkZXIud2F0Y2gocmVzb3VyY2UsIG9wdGlvbnMpXG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLmFjdGl2ZVdhdGNoZXJzLnNldCh3YXRjaEhhc2gsIHdhdGNoZXIpO1xuXHRcdH1cblxuXHRcdC8vIEluY3JlbWVudCB1c2FnZSBjb3VudGVyXG5cdFx0d2F0Y2hlci5jb3VudCArPSAxO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAod2F0Y2hlcikge1xuXG5cdFx0XHRcdC8vIFVucmVmXG5cdFx0XHRcdHdhdGNoZXIuY291bnQtLTtcblxuXHRcdFx0XHQvLyBEaXNwb3NlIG9ubHkgd2hlbiBsYXN0IHVzZXIgaXMgcmVhY2hlZFxuXHRcdFx0XHRpZiAod2F0Y2hlci5jb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdGRpc3Bvc2Uod2F0Y2hlci5kaXNwb3NhYmxlKTtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZVdhdGNoZXJzLmRlbGV0ZSh3YXRjaEhhc2gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdGZvciAoY29uc3QgWywgd2F0Y2hlcl0gb2YgdGhpcy5hY3RpdmVXYXRjaGVycykge1xuXHRcdFx0ZGlzcG9zZSh3YXRjaGVyLmRpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuYWN0aXZlV2F0Y2hlcnMuY2xlYXIoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBIZWxwZXJzXG5cblx0cHJpdmF0ZSByZWFkb25seSB3cml0ZVF1ZXVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlc291cmNlUXVldWUoKSk7XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlQnVmZmVyZWQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgcmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdyaXRlRmlsZU9wdGlvbnMgfCB1bmRlZmluZWQsIHJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtOiBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGVCdWZmZXJlZFN0cmVhbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLndyaXRlUXVldWUucXVldWVGb3IocmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblxuXHRcdFx0Ly8gb3BlbiBoYW5kbGVcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHByb3ZpZGVyLm9wZW4ocmVzb3VyY2UsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IG9wdGlvbnM/LnVubG9jayA/PyBmYWxzZSwgYXBwZW5kOiBvcHRpb25zPy5hcHBlbmQgPz8gZmFsc2UgfSk7XG5cblx0XHRcdC8vIHdyaXRlIGludG8gaGFuZGxlIHVudGlsIGFsbCBieXRlcyBmcm9tIGJ1ZmZlciBoYXZlIGJlZW4gd3JpdHRlblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGlzUmVhZGFibGVTdHJlYW0ocmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pIHx8IGlzUmVhZGFibGVCdWZmZXJlZFN0cmVhbShyZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvV3JpdGVTdHJlYW1CdWZmZXJlZFF1ZXVlZChwcm92aWRlciwgaGFuZGxlLCByZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb1dyaXRlUmVhZGFibGVCdWZmZXJlZFF1ZXVlZChwcm92aWRlciwgaGFuZGxlLCByZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVuc3VyZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHRcdH0gZmluYWxseSB7XG5cblx0XHRcdFx0Ly8gY2xvc2UgaGFuZGxlIGFsd2F5c1xuXHRcdFx0XHRhd2FpdCBwcm92aWRlci5jbG9zZShoYW5kbGUpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMuZ2V0RXh0VXJpKHByb3ZpZGVyKS5wcm92aWRlckV4dFVyaSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV3JpdGVTdHJlYW1CdWZmZXJlZFF1ZXVlZChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBoYW5kbGU6IG51bWJlciwgc3RyZWFtT3JCdWZmZXJlZFN0cmVhbTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGVCdWZmZXJlZFN0cmVhbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBwb3NJbkZpbGUgPSAwO1xuXHRcdGxldCBzdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW07XG5cblx0XHQvLyBCdWZmZXJlZCBzdHJlYW06IGNvbnN1bWUgdGhlIGJ1ZmZlciBmaXJzdCBieSB3cml0aW5nXG5cdFx0Ly8gaXQgdG8gdGhlIHRhcmdldCBiZWZvcmUgcmVhZGluZyBmcm9tIHRoZSBzdHJlYW0uXG5cdFx0aWYgKGlzUmVhZGFibGVCdWZmZXJlZFN0cmVhbShzdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKSkge1xuXHRcdFx0aWYgKHN0cmVhbU9yQnVmZmVyZWRTdHJlYW0uYnVmZmVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgY2h1bmsgPSBWU0J1ZmZlci5jb25jYXQoc3RyZWFtT3JCdWZmZXJlZFN0cmVhbS5idWZmZXIpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvV3JpdGVCdWZmZXIocHJvdmlkZXIsIGhhbmRsZSwgY2h1bmssIGNodW5rLmJ5dGVMZW5ndGgsIHBvc0luRmlsZSwgMCk7XG5cblx0XHRcdFx0cG9zSW5GaWxlICs9IGNodW5rLmJ5dGVMZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBzdHJlYW0gaGFzIGJlZW4gY29uc3VtZWQsIHJldHVybiBlYXJseVxuXHRcdFx0aWYgKHN0cmVhbU9yQnVmZmVyZWRTdHJlYW0uZW5kZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzdHJlYW0gPSBzdHJlYW1PckJ1ZmZlcmVkU3RyZWFtLnN0cmVhbTtcblx0XHR9XG5cblx0XHQvLyBVbmJ1ZmZlcmVkIHN0cmVhbSAtIGp1c3QgdGFrZSBhcyBpc1xuXHRcdGVsc2Uge1xuXHRcdFx0c3RyZWFtID0gc3RyZWFtT3JCdWZmZXJlZFN0cmVhbTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0bGlzdGVuU3RyZWFtKHN0cmVhbSwge1xuXHRcdFx0XHRvbkRhdGE6IGFzeW5jIGNodW5rID0+IHtcblxuXHRcdFx0XHRcdC8vIHBhdXNlIHN0cmVhbSB0byBwZXJmb3JtIGFzeW5jIHdyaXRlIG9wZXJhdGlvblxuXHRcdFx0XHRcdHN0cmVhbS5wYXVzZSgpO1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZUJ1ZmZlcihwcm92aWRlciwgaGFuZGxlLCBjaHVuaywgY2h1bmsuYnl0ZUxlbmd0aCwgcG9zSW5GaWxlLCAwKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cG9zSW5GaWxlICs9IGNodW5rLmJ5dGVMZW5ndGg7XG5cblx0XHRcdFx0XHQvLyByZXN1bWUgc3RyZWFtIG5vdyB0aGF0IHdlIGhhdmUgc3VjY2Vzc2Z1bGx5IHdyaXR0ZW5cblx0XHRcdFx0XHQvLyBydW4gdGhpcyBvbiB0aGUgbmV4dCB0aWNrIHRvIHByZXZlbnQgaW5jcmVhc2luZyB0aGVcblx0XHRcdFx0XHQvLyBleGVjdXRpb24gc3RhY2sgYmVjYXVzZSByZXN1bWUoKSBtYXkgY2FsbCB0aGUgZXZlbnRcblx0XHRcdFx0XHQvLyBoYW5kbGVyIGFnYWluIGJlZm9yZSBmaW5pc2hpbmcuXG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBzdHJlYW0ucmVzdW1lKCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkVycm9yOiBlcnJvciA9PiByZWplY3QoZXJyb3IpLFxuXHRcdFx0XHRvbkVuZDogKCkgPT4gcmVzb2x2ZSgpXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Xcml0ZVJlYWRhYmxlQnVmZmVyZWRRdWV1ZWQocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgaGFuZGxlOiBudW1iZXIsIHJlYWRhYmxlOiBWU0J1ZmZlclJlYWRhYmxlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHBvc0luRmlsZSA9IDA7XG5cblx0XHRsZXQgY2h1bms6IFZTQnVmZmVyIHwgbnVsbDtcblx0XHR3aGlsZSAoKGNodW5rID0gcmVhZGFibGUucmVhZCgpKSAhPT0gbnVsbCkge1xuXHRcdFx0YXdhaXQgdGhpcy5kb1dyaXRlQnVmZmVyKHByb3ZpZGVyLCBoYW5kbGUsIGNodW5rLCBjaHVuay5ieXRlTGVuZ3RoLCBwb3NJbkZpbGUsIDApO1xuXG5cdFx0XHRwb3NJbkZpbGUgKz0gY2h1bmsuYnl0ZUxlbmd0aDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV3JpdGVCdWZmZXIocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgaGFuZGxlOiBudW1iZXIsIGJ1ZmZlcjogVlNCdWZmZXIsIGxlbmd0aDogbnVtYmVyLCBwb3NJbkZpbGU6IG51bWJlciwgcG9zSW5CdWZmZXI6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCB0b3RhbEJ5dGVzV3JpdHRlbiA9IDA7XG5cdFx0d2hpbGUgKHRvdGFsQnl0ZXNXcml0dGVuIDwgbGVuZ3RoKSB7XG5cblx0XHRcdC8vIFdyaXRlIHRocm91Z2ggdGhlIHByb3ZpZGVyXG5cdFx0XHRjb25zdCBieXRlc1dyaXR0ZW4gPSBhd2FpdCBwcm92aWRlci53cml0ZShoYW5kbGUsIHBvc0luRmlsZSArIHRvdGFsQnl0ZXNXcml0dGVuLCBidWZmZXIuYnVmZmVyLCBwb3NJbkJ1ZmZlciArIHRvdGFsQnl0ZXNXcml0dGVuLCBsZW5ndGggLSB0b3RhbEJ5dGVzV3JpdHRlbik7XG5cdFx0XHR0b3RhbEJ5dGVzV3JpdHRlbiArPSBieXRlc1dyaXR0ZW47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlVW5idWZmZXJlZChwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgcmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdyaXRlRmlsZU9wdGlvbnMgfCB1bmRlZmluZWQsIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW06IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlQnVmZmVyZWRTdHJlYW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53cml0ZVF1ZXVlLnF1ZXVlRm9yKHJlc291cmNlLCAoKSA9PiB0aGlzLmRvV3JpdGVVbmJ1ZmZlcmVkUXVldWVkKHByb3ZpZGVyLCByZXNvdXJjZSwgb3B0aW9ucywgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbSksIHRoaXMuZ2V0RXh0VXJpKHByb3ZpZGVyKS5wcm92aWRlckV4dFVyaSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV3JpdGVVbmJ1ZmZlcmVkUXVldWVkKHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCByZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJV3JpdGVGaWxlT3B0aW9ucyB8IHVuZGVmaW5lZCwgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtT3JCdWZmZXJlZFN0cmVhbTogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGVCdWZmZXJlZFN0cmVhbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBidWZmZXI6IFZTQnVmZmVyO1xuXHRcdGlmIChidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdGJ1ZmZlciA9IGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW07XG5cdFx0fSBlbHNlIGlmIChpc1JlYWRhYmxlU3RyZWFtKGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbU9yQnVmZmVyZWRTdHJlYW0pKSB7XG5cdFx0XHRidWZmZXIgPSBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKTtcblx0XHR9IGVsc2UgaWYgKGlzUmVhZGFibGVCdWZmZXJlZFN0cmVhbShidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKSkge1xuXHRcdFx0YnVmZmVyID0gYXdhaXQgYnVmZmVyZWRTdHJlYW1Ub0J1ZmZlcihidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnVmZmVyID0gcmVhZGFibGVUb0J1ZmZlcihidWZmZXJPclJlYWRhYmxlT3JTdHJlYW1PckJ1ZmZlcmVkU3RyZWFtKTtcblx0XHR9XG5cblx0XHQvLyBXcml0ZSB0aHJvdWdoIHRoZSBwcm92aWRlclxuXHRcdGF3YWl0IHByb3ZpZGVyLndyaXRlRmlsZShyZXNvdXJjZSwgYnVmZmVyLmJ1ZmZlciwgeyBjcmVhdGU6IHRydWUsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBvcHRpb25zPy51bmxvY2sgPz8gZmFsc2UsIGF0b21pYzogb3B0aW9ucz8uYXRvbWljID8/IGZhbHNlLCBhcHBlbmQ6IG9wdGlvbnM/LmFwcGVuZCA/PyBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9QaXBlQnVmZmVyZWQoc291cmNlUHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgc291cmNlOiBVUkksIHRhcmdldFByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMud3JpdGVRdWV1ZS5xdWV1ZUZvcih0YXJnZXQsICgpID0+IHRoaXMuZG9QaXBlQnVmZmVyZWRRdWV1ZWQoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgdGFyZ2V0UHJvdmlkZXIsIHRhcmdldCksIHRoaXMuZ2V0RXh0VXJpKHRhcmdldFByb3ZpZGVyKS5wcm92aWRlckV4dFVyaSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUGlwZUJ1ZmZlcmVkUXVldWVkKHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIHNvdXJjZTogVVJJLCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBzb3VyY2VIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgdGFyZ2V0SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXG5cdFx0XHQvLyBPcGVuIGhhbmRsZXNcblx0XHRcdHNvdXJjZUhhbmRsZSA9IGF3YWl0IHNvdXJjZVByb3ZpZGVyLm9wZW4oc291cmNlLCB7IGNyZWF0ZTogZmFsc2UgfSk7XG5cdFx0XHR0YXJnZXRIYW5kbGUgPSBhd2FpdCB0YXJnZXRQcm92aWRlci5vcGVuKHRhcmdldCwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSk7XG5cblx0XHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLmFsbG9jKHRoaXMuQlVGRkVSX1NJWkUpO1xuXG5cdFx0XHRsZXQgcG9zSW5GaWxlID0gMDtcblx0XHRcdGxldCBwb3NJbkJ1ZmZlciA9IDA7XG5cdFx0XHRsZXQgYnl0ZXNSZWFkID0gMDtcblx0XHRcdGRvIHtcblx0XHRcdFx0Ly8gcmVhZCBmcm9tIHNvdXJjZSAoc291cmNlSGFuZGxlKSBhdCBjdXJyZW50IHBvc2l0aW9uIChwb3NJbkZpbGUpIGludG8gYnVmZmVyIChidWZmZXIpIGF0XG5cdFx0XHRcdC8vIGJ1ZmZlciBwb3NpdGlvbiAocG9zSW5CdWZmZXIpIHVwIHRvIHRoZSBzaXplIG9mIHRoZSBidWZmZXIgKGJ1ZmZlci5ieXRlTGVuZ3RoKS5cblx0XHRcdFx0Ynl0ZXNSZWFkID0gYXdhaXQgc291cmNlUHJvdmlkZXIucmVhZChzb3VyY2VIYW5kbGUsIHBvc0luRmlsZSwgYnVmZmVyLmJ1ZmZlciwgcG9zSW5CdWZmZXIsIGJ1ZmZlci5ieXRlTGVuZ3RoIC0gcG9zSW5CdWZmZXIpO1xuXG5cdFx0XHRcdC8vIHdyaXRlIGludG8gdGFyZ2V0ICh0YXJnZXRIYW5kbGUpIGF0IGN1cnJlbnQgcG9zaXRpb24gKHBvc0luRmlsZSkgZnJvbSBidWZmZXIgKGJ1ZmZlcikgYXRcblx0XHRcdFx0Ly8gYnVmZmVyIHBvc2l0aW9uIChwb3NJbkJ1ZmZlcikgYWxsIGJ5dGVzIHdlIHJlYWQgKGJ5dGVzUmVhZCkuXG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZUJ1ZmZlcih0YXJnZXRQcm92aWRlciwgdGFyZ2V0SGFuZGxlLCBidWZmZXIsIGJ5dGVzUmVhZCwgcG9zSW5GaWxlLCBwb3NJbkJ1ZmZlcik7XG5cblx0XHRcdFx0cG9zSW5GaWxlICs9IGJ5dGVzUmVhZDtcblx0XHRcdFx0cG9zSW5CdWZmZXIgKz0gYnl0ZXNSZWFkO1xuXG5cdFx0XHRcdC8vIHdoZW4gYnVmZmVyIGZ1bGwsIGZpbGwgaXQgYWdhaW4gZnJvbSB0aGUgYmVnaW5uaW5nXG5cdFx0XHRcdGlmIChwb3NJbkJ1ZmZlciA9PT0gYnVmZmVyLmJ5dGVMZW5ndGgpIHtcblx0XHRcdFx0XHRwb3NJbkJ1ZmZlciA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH0gd2hpbGUgKGJ5dGVzUmVhZCA+IDApO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBlbnN1cmVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW1xuXHRcdFx0XHR0eXBlb2Ygc291cmNlSGFuZGxlID09PSAnbnVtYmVyJyA/IHNvdXJjZVByb3ZpZGVyLmNsb3NlKHNvdXJjZUhhbmRsZSkgOiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0dHlwZW9mIHRhcmdldEhhbmRsZSA9PT0gJ251bWJlcicgPyB0YXJnZXRQcm92aWRlci5jbG9zZSh0YXJnZXRIYW5kbGUpIDogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUGlwZVVuYnVmZmVyZWQoc291cmNlUHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIHNvdXJjZTogVVJJLCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53cml0ZVF1ZXVlLnF1ZXVlRm9yKHRhcmdldCwgKCkgPT4gdGhpcy5kb1BpcGVVbmJ1ZmZlcmVkUXVldWVkKHNvdXJjZVByb3ZpZGVyLCBzb3VyY2UsIHRhcmdldFByb3ZpZGVyLCB0YXJnZXQpLCB0aGlzLmdldEV4dFVyaSh0YXJnZXRQcm92aWRlcikucHJvdmlkZXJFeHRVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1BpcGVVbmJ1ZmZlcmVkUXVldWVkKHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCBzb3VyY2U6IFVSSSwgdGFyZ2V0UHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRhcmdldFByb3ZpZGVyLndyaXRlRmlsZSh0YXJnZXQsIGF3YWl0IHNvdXJjZVByb3ZpZGVyLnJlYWRGaWxlKHNvdXJjZSksIHsgY3JlYXRlOiB0cnVlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUGlwZVVuYnVmZmVyZWRUb0J1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCBzb3VyY2U6IFVSSSwgdGFyZ2V0UHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53cml0ZVF1ZXVlLnF1ZXVlRm9yKHRhcmdldCwgKCkgPT4gdGhpcy5kb1BpcGVVbmJ1ZmZlcmVkVG9CdWZmZXJlZFF1ZXVlZChzb3VyY2VQcm92aWRlciwgc291cmNlLCB0YXJnZXRQcm92aWRlciwgdGFyZ2V0KSwgdGhpcy5nZXRFeHRVcmkodGFyZ2V0UHJvdmlkZXIpLnByb3ZpZGVyRXh0VXJpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9QaXBlVW5idWZmZXJlZFRvQnVmZmVyZWRRdWV1ZWQoc291cmNlUHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIHNvdXJjZTogVVJJLCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gT3BlbiBoYW5kbGVcblx0XHRjb25zdCB0YXJnZXRIYW5kbGUgPSBhd2FpdCB0YXJnZXRQcm92aWRlci5vcGVuKHRhcmdldCwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSk7XG5cblx0XHQvLyBSZWFkIGVudGlyZSBidWZmZXIgZnJvbSBzb3VyY2UgYW5kIHdyaXRlIGJ1ZmZlcmVkXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHNvdXJjZVByb3ZpZGVyLnJlYWRGaWxlKHNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0aGlzLmRvV3JpdGVCdWZmZXIodGFyZ2V0UHJvdmlkZXIsIHRhcmdldEhhbmRsZSwgVlNCdWZmZXIud3JhcChidWZmZXIpLCBidWZmZXIuYnl0ZUxlbmd0aCwgMCwgMCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IGVuc3VyZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgdGFyZ2V0UHJvdmlkZXIuY2xvc2UodGFyZ2V0SGFuZGxlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUGlwZUJ1ZmZlcmVkVG9VbmJ1ZmZlcmVkKHNvdXJjZVByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIHNvdXJjZTogVVJJLCB0YXJnZXRQcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFJlYWQgYnVmZmVyIHZpYSBzdHJlYW0gYnVmZmVyZWRcblx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCBzdHJlYW1Ub0J1ZmZlcih0aGlzLnJlYWRGaWxlQnVmZmVyZWQoc291cmNlUHJvdmlkZXIsIHNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXG5cdFx0Ly8gV3JpdGUgYnVmZmVyIGludG8gdGFyZ2V0IGF0IG9uY2Vcblx0XHRhd2FpdCB0aGlzLmRvV3JpdGVVbmJ1ZmZlcmVkKHRhcmdldFByb3ZpZGVyLCB0YXJnZXQsIHVuZGVmaW5lZCwgYnVmZmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCB0aHJvd0lmRmlsZVN5c3RlbUlzUmVhZG9ubHk8VCBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXI+KHByb3ZpZGVyOiBULCByZXNvdXJjZTogVVJJKTogVCB7XG5cdFx0aWYgKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5SZWFkb25seSkge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZXJyLnJlYWRvbmx5JywgXCJVbmFibGUgdG8gbW9kaWZ5IHJlYWQtb25seSBmaWxlICd7MH0nXCIsIHRoaXMucmVzb3VyY2VGb3JFcnJvcihyZXNvdXJjZSkpLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlcjtcblx0fVxuXG5cdHByaXZhdGUgdGhyb3dJZkZpbGVJc1JlYWRvbmx5KHJlc291cmNlOiBVUkksIHN0YXQ6IElTdGF0KTogdm9pZCB7XG5cdFx0aWYgKChzdGF0LnBlcm1pc3Npb25zID8/IDApICYgRmlsZVBlcm1pc3Npb24uUmVhZG9ubHkpIHtcblx0XHRcdHRocm93IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2Vyci5yZWFkb25seScsIFwiVW5hYmxlIHRvIG1vZGlmeSByZWFkLW9ubHkgZmlsZSAnezB9J1wiLCB0aGlzLnJlc291cmNlRm9yRXJyb3IocmVzb3VyY2UpKSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc291cmNlRm9yRXJyb3IocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2UuZnNQYXRoO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNvdXJjZS50b1N0cmluZyh0cnVlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUscUJBQXFCO0FBQ3hDLFNBQVMsd0JBQXdCLGtCQUFrQiwwQkFBMEIsa0JBQWtCLGdCQUFnQixnQkFBMEY7QUFDek0sU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLGlCQUFpQixTQUFzQixvQkFBb0I7QUFDaEYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFFBQVEsc0JBQStCLHNCQUFzQjtBQUN0RSxTQUFTLGVBQWUsMEJBQTBCLGtCQUFrQixjQUFjLG9CQUFvQixjQUFjLFlBQVksaUJBQWlCO0FBRWpKLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQStCLE1BQU0sZUFBZSxrQkFBc0MsZUFBZSxvQkFBb0Isb0JBQW9CLHFCQUFxQixnQkFBZ0IsZ0NBQWdDLDZCQUE2QixVQUFVLHlCQUF5Qiw2QkFBNkIsNkJBQTZCLDZCQUE2QixpQ0FBaUMsd0JBQWlxQixvQ0FBb0MsdUJBQXVCLCtCQUErQix3QkFBd0IsNEJBQTRCLCtCQUErQiw4QkFBaUgsaUNBQWlDO0FBQ3YzQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3QjtBQUUxQixJQUFNLGNBQU4sY0FBMEIsV0FBbUM7QUFBQSxFQVNuRSxZQUEwQyxZQUF5QjtBQUNsRSxVQUFNO0FBRG1DO0FBRjFDO0FB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
