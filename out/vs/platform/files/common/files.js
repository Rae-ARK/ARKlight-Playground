import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { sep } from "../../../base/common/path.js";
import { startsWithIgnoreCase } from "../../../base/common/strings.js";
import { isNumber } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { isWeb } from "../../../base/common/platform.js";
import { Schemas } from "../../../base/common/network.js";
import { Lazy } from "../../../base/common/lazy.js";
const IFileService = createDecorator("fileService");
function isFileOpenForWriteOptions(options) {
  return options.create === true;
}
var FileType = /* @__PURE__ */ ((FileType2) => {
  FileType2[FileType2["Unknown"] = 0] = "Unknown";
  FileType2[FileType2["File"] = 1] = "File";
  FileType2[FileType2["Directory"] = 2] = "Directory";
  FileType2[FileType2["SymbolicLink"] = 64] = "SymbolicLink";
  return FileType2;
})(FileType || {});
var FilePermission = /* @__PURE__ */ ((FilePermission2) => {
  FilePermission2[FilePermission2["Readonly"] = 1] = "Readonly";
  FilePermission2[FilePermission2["Locked"] = 2] = "Locked";
  FilePermission2[FilePermission2["Executable"] = 4] = "Executable";
  return FilePermission2;
})(FilePermission || {});
var FileChangeFilter = /* @__PURE__ */ ((FileChangeFilter2) => {
  FileChangeFilter2[FileChangeFilter2["UPDATED"] = 2] = "UPDATED";
  FileChangeFilter2[FileChangeFilter2["ADDED"] = 4] = "ADDED";
  FileChangeFilter2[FileChangeFilter2["DELETED"] = 8] = "DELETED";
  return FileChangeFilter2;
})(FileChangeFilter || {});
function isFileSystemWatcher(thing) {
  const candidate = thing;
  return !!candidate && typeof candidate.onDidChange === "function";
}
var FileSystemProviderCapabilities = /* @__PURE__ */ ((FileSystemProviderCapabilities2) => {
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["None"] = 0] = "None";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileReadWrite"] = 2] = "FileReadWrite";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileOpenReadWriteClose"] = 4] = "FileOpenReadWriteClose";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileReadStream"] = 16] = "FileReadStream";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileFolderCopy"] = 8] = "FileFolderCopy";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["PathCaseSensitive"] = 1024] = "PathCaseSensitive";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["Readonly"] = 2048] = "Readonly";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["Trash"] = 4096] = "Trash";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileWriteUnlock"] = 8192] = "FileWriteUnlock";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAtomicRead"] = 16384] = "FileAtomicRead";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAtomicWrite"] = 32768] = "FileAtomicWrite";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAtomicDelete"] = 65536] = "FileAtomicDelete";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileClone"] = 131072] = "FileClone";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileRealpath"] = 262144] = "FileRealpath";
  FileSystemProviderCapabilities2[FileSystemProviderCapabilities2["FileAppend"] = 524288] = "FileAppend";
  return FileSystemProviderCapabilities2;
})(FileSystemProviderCapabilities || {});
function hasReadWriteCapability(provider) {
  return !!(provider.capabilities & 2 /* FileReadWrite */);
}
function hasFileAppendCapability(provider) {
  return !!(provider.capabilities & 524288 /* FileAppend */);
}
function hasFileFolderCopyCapability(provider) {
  return !!(provider.capabilities & 8 /* FileFolderCopy */);
}
function hasFileCloneCapability(provider) {
  return !!(provider.capabilities & 131072 /* FileClone */);
}
function hasFileRealpathCapability(provider) {
  return !!(provider.capabilities & 262144 /* FileRealpath */);
}
function hasOpenReadWriteCloseCapability(provider) {
  return !!(provider.capabilities & 4 /* FileOpenReadWriteClose */);
}
function hasFileReadStreamCapability(provider) {
  return !!(provider.capabilities & 16 /* FileReadStream */);
}
function hasFileAtomicReadCapability(provider) {
  if (!hasReadWriteCapability(provider)) {
    return false;
  }
  return !!(provider.capabilities & 16384 /* FileAtomicRead */);
}
function hasFileAtomicWriteCapability(provider) {
  if (!hasReadWriteCapability(provider)) {
    return false;
  }
  return !!(provider.capabilities & 32768 /* FileAtomicWrite */);
}
function hasFileAtomicDeleteCapability(provider) {
  return !!(provider.capabilities & 65536 /* FileAtomicDelete */);
}
function hasReadonlyCapability(provider) {
  return !!(provider.capabilities & 2048 /* Readonly */);
}
var FileSystemProviderErrorCode = /* @__PURE__ */ ((FileSystemProviderErrorCode2) => {
  FileSystemProviderErrorCode2["FileExists"] = "EntryExists";
  FileSystemProviderErrorCode2["FileNotFound"] = "EntryNotFound";
  FileSystemProviderErrorCode2["FileNotADirectory"] = "EntryNotADirectory";
  FileSystemProviderErrorCode2["FileIsADirectory"] = "EntryIsADirectory";
  FileSystemProviderErrorCode2["FileExceedsStorageQuota"] = "EntryExceedsStorageQuota";
  FileSystemProviderErrorCode2["FileTooLarge"] = "EntryTooLarge";
  FileSystemProviderErrorCode2["FileWriteLocked"] = "EntryWriteLocked";
  FileSystemProviderErrorCode2["NoPermissions"] = "NoPermissions";
  FileSystemProviderErrorCode2["Unavailable"] = "Unavailable";
  FileSystemProviderErrorCode2["Unknown"] = "Unknown";
  return FileSystemProviderErrorCode2;
})(FileSystemProviderErrorCode || {});
class FileSystemProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
  static create(error, code) {
    const providerError = new FileSystemProviderError(error.toString(), code);
    markAsFileSystemProviderError(providerError, code);
    return providerError;
  }
}
function createFileSystemProviderError(error, code) {
  return FileSystemProviderError.create(error, code);
}
function ensureFileSystemProviderError(error) {
  if (!error) {
    return createFileSystemProviderError(localize("unknownError", "Unknown Error"), "Unknown" /* Unknown */);
  }
  return error;
}
function markAsFileSystemProviderError(error, code) {
  error.name = code ? `${code} (FileSystemError)` : `FileSystemError`;
  return error;
}
function toFileSystemProviderErrorCode(error) {
  if (!error) {
    return "Unknown" /* Unknown */;
  }
  if (error instanceof FileSystemProviderError) {
    return error.code;
  }
  const match = /^(.+) \(FileSystemError\)$/.exec(error.name);
  if (!match) {
    return "Unknown" /* Unknown */;
  }
  switch (match[1]) {
    case "EntryExists" /* FileExists */:
      return "EntryExists" /* FileExists */;
    case "EntryIsADirectory" /* FileIsADirectory */:
      return "EntryIsADirectory" /* FileIsADirectory */;
    case "EntryNotADirectory" /* FileNotADirectory */:
      return "EntryNotADirectory" /* FileNotADirectory */;
    case "EntryNotFound" /* FileNotFound */:
      return "EntryNotFound" /* FileNotFound */;
    case "EntryTooLarge" /* FileTooLarge */:
      return "EntryTooLarge" /* FileTooLarge */;
    case "EntryWriteLocked" /* FileWriteLocked */:
      return "EntryWriteLocked" /* FileWriteLocked */;
    case "NoPermissions" /* NoPermissions */:
      return "NoPermissions" /* NoPermissions */;
    case "Unavailable" /* Unavailable */:
      return "Unavailable" /* Unavailable */;
  }
  return "Unknown" /* Unknown */;
}
function toFileOperationResult(error) {
  if (error instanceof FileOperationError) {
    return error.fileOperationResult;
  }
  switch (toFileSystemProviderErrorCode(error)) {
    case "EntryNotFound" /* FileNotFound */:
      return 1 /* FILE_NOT_FOUND */;
    case "EntryIsADirectory" /* FileIsADirectory */:
      return 0 /* FILE_IS_DIRECTORY */;
    case "EntryNotADirectory" /* FileNotADirectory */:
      return 9 /* FILE_NOT_DIRECTORY */;
    case "EntryWriteLocked" /* FileWriteLocked */:
      return 5 /* FILE_WRITE_LOCKED */;
    case "NoPermissions" /* NoPermissions */:
      return 6 /* FILE_PERMISSION_DENIED */;
    case "EntryExists" /* FileExists */:
      return 4 /* FILE_MOVE_CONFLICT */;
    case "EntryTooLarge" /* FileTooLarge */:
      return 7 /* FILE_TOO_LARGE */;
    default:
      return 10 /* FILE_OTHER_ERROR */;
  }
}
var FileOperation = /* @__PURE__ */ ((FileOperation2) => {
  FileOperation2[FileOperation2["CREATE"] = 0] = "CREATE";
  FileOperation2[FileOperation2["DELETE"] = 1] = "DELETE";
  FileOperation2[FileOperation2["MOVE"] = 2] = "MOVE";
  FileOperation2[FileOperation2["COPY"] = 3] = "COPY";
  FileOperation2[FileOperation2["WRITE"] = 4] = "WRITE";
  return FileOperation2;
})(FileOperation || {});
class FileOperationEvent {
  constructor(resource, operation, target) {
    this.resource = resource;
    this.operation = operation;
    this.target = target;
  }
  isOperation(operation) {
    return this.operation === operation;
  }
}
var FileChangeType = /* @__PURE__ */ ((FileChangeType2) => {
  FileChangeType2[FileChangeType2["UPDATED"] = 0] = "UPDATED";
  FileChangeType2[FileChangeType2["ADDED"] = 1] = "ADDED";
  FileChangeType2[FileChangeType2["DELETED"] = 2] = "DELETED";
  return FileChangeType2;
})(FileChangeType || {});
const _FileChangesEvent = class _FileChangesEvent {
  constructor(changes, ignorePathCasing) {
    this.ignorePathCasing = ignorePathCasing;
    this.correlationId = void 0;
    this.added = new Lazy(() => {
      const added = TernarySearchTree.forUris(() => this.ignorePathCasing);
      added.fill(this.rawAdded.map((resource) => [resource, true]));
      return added;
    });
    this.updated = new Lazy(() => {
      const updated = TernarySearchTree.forUris(() => this.ignorePathCasing);
      updated.fill(this.rawUpdated.map((resource) => [resource, true]));
      return updated;
    });
    this.deleted = new Lazy(() => {
      const deleted = TernarySearchTree.forUris(() => this.ignorePathCasing);
      deleted.fill(this.rawDeleted.map((resource) => [resource, true]));
      return deleted;
    });
    /**
     * @deprecated use the `contains` or `affects` method to efficiently find
     * out if the event relates to a given resource. these methods ensure:
     * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
     * - correctly handles `FileChangeType.DELETED` events
     */
    this.rawAdded = [];
    /**
    * @deprecated use the `contains` or `affects` method to efficiently find
    * out if the event relates to a given resource. these methods ensure:
    * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
    * - correctly handles `FileChangeType.DELETED` events
    */
    this.rawUpdated = [];
    /**
    * @deprecated use the `contains` or `affects` method to efficiently find
    * out if the event relates to a given resource. these methods ensure:
    * - that there is no expensive lookup needed (by using a `TernarySearchTree`)
    * - correctly handles `FileChangeType.DELETED` events
    */
    this.rawDeleted = [];
    for (const change of changes) {
      switch (change.type) {
        case 1 /* ADDED */:
          this.rawAdded.push(change.resource);
          break;
        case 0 /* UPDATED */:
          this.rawUpdated.push(change.resource);
          break;
        case 2 /* DELETED */:
          this.rawDeleted.push(change.resource);
          break;
      }
      if (this.correlationId !== _FileChangesEvent.MIXED_CORRELATION) {
        if (typeof change.cId === "number") {
          if (this.correlationId === void 0) {
            this.correlationId = change.cId;
          } else if (this.correlationId !== change.cId) {
            this.correlationId = _FileChangesEvent.MIXED_CORRELATION;
          }
        } else {
          if (this.correlationId !== void 0) {
            this.correlationId = _FileChangesEvent.MIXED_CORRELATION;
          }
        }
      }
    }
  }
  /**
   * Find out if the file change events match the provided resource.
   *
   * Note: when passing `FileChangeType.DELETED`, we consider a match
   * also when the parent of the resource got deleted.
   */
  contains(resource, ...types) {
    return this.doContains(resource, { includeChildren: false }, ...types);
  }
  /**
   * Find out if the file change events either match the provided
   * resource, or contain a child of this resource.
   */
  affects(resource, ...types) {
    return this.doContains(resource, { includeChildren: true }, ...types);
  }
  doContains(resource, options, ...types) {
    if (!resource) {
      return false;
    }
    const hasTypesFilter = types.length > 0;
    if (!hasTypesFilter || types.includes(1 /* ADDED */)) {
      if (this.added.value.get(resource)) {
        return true;
      }
      if (options.includeChildren && this.added.value.findSuperstr(resource)) {
        return true;
      }
    }
    if (!hasTypesFilter || types.includes(0 /* UPDATED */)) {
      if (this.updated.value.get(resource)) {
        return true;
      }
      if (options.includeChildren && this.updated.value.findSuperstr(resource)) {
        return true;
      }
    }
    if (!hasTypesFilter || types.includes(2 /* DELETED */)) {
      if (this.deleted.value.findSubstr(resource)) {
        return true;
      }
      if (options.includeChildren && this.deleted.value.findSuperstr(resource)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Returns if this event contains added files.
   */
  gotAdded() {
    return this.rawAdded.length > 0;
  }
  /**
   * Returns if this event contains deleted files.
   */
  gotDeleted() {
    return this.rawDeleted.length > 0;
  }
  /**
   * Returns if this event contains updated files.
   */
  gotUpdated() {
    return this.rawUpdated.length > 0;
  }
  /**
   * Returns if this event contains changes that correlate to the
   * provided `correlationId`.
   *
   * File change event correlation is an advanced watch feature that
   * allows to  identify from which watch request the events originate
   * from. This correlation allows to route events specifically
   * only to the requestor and not emit them to all listeners.
   */
  correlates(correlationId) {
    return this.correlationId === correlationId;
  }
  /**
   * Figure out if the event contains changes that correlate to one
   * correlation identifier.
   *
   * File change event correlation is an advanced watch feature that
   * allows to  identify from which watch request the events originate
   * from. This correlation allows to route events specifically
   * only to the requestor and not emit them to all listeners.
   */
  hasCorrelation() {
    return typeof this.correlationId === "number";
  }
};
_FileChangesEvent.MIXED_CORRELATION = null;
let FileChangesEvent = _FileChangesEvent;
function isParent(path, candidate, ignoreCase) {
  if (!path || !candidate || path === candidate) {
    return false;
  }
  if (candidate.length > path.length) {
    return false;
  }
  if (candidate.charAt(candidate.length - 1) !== sep) {
    candidate += sep;
  }
  if (ignoreCase) {
    return startsWithIgnoreCase(path, candidate);
  }
  return path.indexOf(candidate) === 0;
}
class FileOperationError extends Error {
  constructor(message, fileOperationResult, options) {
    super(message);
    this.fileOperationResult = fileOperationResult;
    this.options = options;
  }
}
class TooLargeFileOperationError extends FileOperationError {
  constructor(message, fileOperationResult, size, options) {
    super(message, fileOperationResult, options);
    this.fileOperationResult = fileOperationResult;
    this.size = size;
  }
}
class NotModifiedSinceFileOperationError extends FileOperationError {
  constructor(message, stat, options) {
    super(message, 2 /* FILE_NOT_MODIFIED_SINCE */, options);
    this.stat = stat;
  }
}
var FileOperationResult = /* @__PURE__ */ ((FileOperationResult2) => {
  FileOperationResult2[FileOperationResult2["FILE_IS_DIRECTORY"] = 0] = "FILE_IS_DIRECTORY";
  FileOperationResult2[FileOperationResult2["FILE_NOT_FOUND"] = 1] = "FILE_NOT_FOUND";
  FileOperationResult2[FileOperationResult2["FILE_NOT_MODIFIED_SINCE"] = 2] = "FILE_NOT_MODIFIED_SINCE";
  FileOperationResult2[FileOperationResult2["FILE_MODIFIED_SINCE"] = 3] = "FILE_MODIFIED_SINCE";
  FileOperationResult2[FileOperationResult2["FILE_MOVE_CONFLICT"] = 4] = "FILE_MOVE_CONFLICT";
  FileOperationResult2[FileOperationResult2["FILE_WRITE_LOCKED"] = 5] = "FILE_WRITE_LOCKED";
  FileOperationResult2[FileOperationResult2["FILE_PERMISSION_DENIED"] = 6] = "FILE_PERMISSION_DENIED";
  FileOperationResult2[FileOperationResult2["FILE_TOO_LARGE"] = 7] = "FILE_TOO_LARGE";
  FileOperationResult2[FileOperationResult2["FILE_INVALID_PATH"] = 8] = "FILE_INVALID_PATH";
  FileOperationResult2[FileOperationResult2["FILE_NOT_DIRECTORY"] = 9] = "FILE_NOT_DIRECTORY";
  FileOperationResult2[FileOperationResult2["FILE_OTHER_ERROR"] = 10] = "FILE_OTHER_ERROR";
  return FileOperationResult2;
})(FileOperationResult || {});
const AutoSaveConfiguration = {
  OFF: "off",
  AFTER_DELAY: "afterDelay",
  ON_FOCUS_CHANGE: "onFocusChange",
  ON_WINDOW_CHANGE: "onWindowChange"
};
const HotExitConfiguration = {
  OFF: "off",
  ON_EXIT: "onExit",
  ON_EXIT_AND_WINDOW_CLOSE: "onExitAndWindowClose"
};
const FILES_ASSOCIATIONS_CONFIG = "files.associations";
const FILES_EXCLUDE_CONFIG = "files.exclude";
const FILES_READONLY_INCLUDE_CONFIG = "files.readonlyInclude";
const FILES_READONLY_EXCLUDE_CONFIG = "files.readonlyExclude";
const FILES_READONLY_FROM_PERMISSIONS_CONFIG = "files.readonlyFromPermissions";
var FileKind = /* @__PURE__ */ ((FileKind2) => {
  FileKind2[FileKind2["FILE"] = 0] = "FILE";
  FileKind2[FileKind2["FOLDER"] = 1] = "FOLDER";
  FileKind2[FileKind2["ROOT_FOLDER"] = 2] = "ROOT_FOLDER";
  return FileKind2;
})(FileKind || {});
const ETAG_DISABLED = "";
function etag(stat) {
  if (typeof stat.size !== "number" || typeof stat.mtime !== "number") {
    return void 0;
  }
  return stat.mtime.toString(29) + stat.size.toString(31);
}
async function whenProviderRegistered(file, fileService) {
  if (fileService.hasProvider(URI.from({ scheme: file.scheme }))) {
    return;
  }
  return new Promise((resolve) => {
    const disposable = fileService.onDidChangeFileSystemProviderRegistrations((e) => {
      if (e.scheme === file.scheme && e.added) {
        disposable.dispose();
        resolve();
      }
    });
  });
}
const _ByteSize = class _ByteSize {
  static formatSize(size) {
    if (!isNumber(size)) {
      size = 0;
    }
    if (size < _ByteSize.KB) {
      return localize("sizeB", "{0}B", size.toFixed(0));
    }
    if (size < _ByteSize.MB) {
      return localize("sizeKB", "{0}KB", (size / _ByteSize.KB).toFixed(2));
    }
    if (size < _ByteSize.GB) {
      return localize("sizeMB", "{0}MB", (size / _ByteSize.MB).toFixed(2));
    }
    if (size < _ByteSize.TB) {
      return localize("sizeGB", "{0}GB", (size / _ByteSize.GB).toFixed(2));
    }
    return localize("sizeTB", "{0}TB", (size / _ByteSize.TB).toFixed(2));
  }
};
_ByteSize.KB = 1024;
_ByteSize.MB = _ByteSize.KB * _ByteSize.KB;
_ByteSize.GB = _ByteSize.MB * _ByteSize.KB;
_ByteSize.TB = _ByteSize.GB * _ByteSize.KB;
let ByteSize = _ByteSize;
function getLargeFileConfirmationLimit(arg) {
  const isRemote = typeof arg === "string" || arg?.scheme === Schemas.vscodeRemote;
  const isLocal = typeof arg !== "string" && arg?.scheme === Schemas.file;
  if (isLocal) {
    return 1024 * ByteSize.MB;
  }
  if (isRemote) {
    return 10 * ByteSize.MB;
  }
  if (isWeb) {
    return 50 * ByteSize.MB;
  }
  return 1024 * ByteSize.MB;
}
export {
  AutoSaveConfiguration,
  ByteSize,
  ETAG_DISABLED,
  FILES_ASSOCIATIONS_CONFIG,
  FILES_EXCLUDE_CONFIG,
  FILES_READONLY_EXCLUDE_CONFIG,
  FILES_READONLY_FROM_PERMISSIONS_CONFIG,
  FILES_READONLY_INCLUDE_CONFIG,
  FileChangeFilter,
  FileChangeType,
  FileChangesEvent,
  FileKind,
  FileOperation,
  FileOperationError,
  FileOperationEvent,
  FileOperationResult,
  FilePermission,
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileType,
  HotExitConfiguration,
  IFileService,
  NotModifiedSinceFileOperationError,
  TooLargeFileOperationError,
  createFileSystemProviderError,
  ensureFileSystemProviderError,
  etag,
  getLargeFileConfirmationLimit,
  hasFileAppendCapability,
  hasFileAtomicDeleteCapability,
  hasFileAtomicReadCapability,
  hasFileAtomicWriteCapability,
  hasFileCloneCapability,
  hasFileFolderCopyCapability,
  hasFileReadStreamCapability,
  hasFileRealpathCapability,
  hasOpenReadWriteCloseCapability,
  hasReadWriteCapability,
  hasReadonlyCapability,
  isFileOpenForWriteOptions,
  isFileSystemWatcher,
  isParent,
  markAsFileSystemProviderError,
  toFileOperationResult,
  toFileSystemProviderErrorCode,
  whenProviderRegistered
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlLCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUV4cHJlc3Npb24sIElSZWxhdGl2ZVBhdHRlcm4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgc2VwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBSZWFkYWJsZVN0cmVhbUV2ZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBzdGFydHNXaXRoSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcblxuLy8jcmVnaW9uIGZpbGUgc2VydmljZSAmIHByb3ZpZGVyc1xuXG5leHBvcnQgY29uc3QgSUZpbGVTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElGaWxlU2VydmljZT4oJ2ZpbGVTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgaXMgZmlyZWQgd2hlbiBhIGZpbGUgc3lzdGVtIHByb3ZpZGVyIGlzIGFkZGVkIG9yIHJlbW92ZWRcblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uczogRXZlbnQ8SUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBpcyBmaXJlZCB3aGVuIGEgcmVnaXN0ZXJlZCBmaWxlIHN5c3RlbSBwcm92aWRlciBjaGFuZ2VzIGl0cyBjYXBhYmlsaXRpZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllczogRXZlbnQ8SUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBpcyBmaXJlZCB3aGVuIGEgZmlsZSBzeXN0ZW0gcHJvdmlkZXIgaXMgYWJvdXQgdG8gYmUgYWN0aXZhdGVkLiBMaXN0ZW5lcnNcblx0ICogY2FuIGpvaW4gdGhpcyBldmVudCB3aXRoIGEgbG9uZyBydW5uaW5nIHByb21pc2UgdG8gaGVscCBpbiB0aGUgYWN0aXZhdGlvbiBwcm9jZXNzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXI6IEV2ZW50PElGaWxlU3lzdGVtUHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBmaWxlIHN5c3RlbSBwcm92aWRlciBmb3IgYSBjZXJ0YWluIHNjaGVtZS5cblx0ICovXG5cdHJlZ2lzdGVyUHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBmaWxlIHN5c3RlbSBwcm92aWRlciBmb3IgYSBjZXJ0YWluIHNjaGVtZS5cblx0ICovXG5cdGdldFByb3ZpZGVyKHNjaGVtZTogc3RyaW5nKTogSUZpbGVTeXN0ZW1Qcm92aWRlciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVHJpZXMgdG8gYWN0aXZhdGUgYSBwcm92aWRlciB3aXRoIHRoZSBnaXZlbiBzY2hlbWUuXG5cdCAqL1xuXHRhY3RpdmF0ZVByb3ZpZGVyKHNjaGVtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIHRoaXMgZmlsZSBzZXJ2aWNlIGNhbiBoYW5kbGUgdGhlIGdpdmVuIHJlc291cmNlIGJ5XG5cdCAqIGZpcnN0IGFjdGl2YXRpbmcgYW55IGV4dGVuc2lvbiB0aGF0IHdhbnRzIHRvIGJlIGFjdGl2YXRlZFxuXHQgKiBvbiB0aGUgcHJvdmlkZWQgcmVzb3VyY2Ugc2NoZW1lIHRvIGluY2x1ZGUgZXh0ZW5zaW9ucyB0aGF0XG5cdCAqIGNvbnRyaWJ1dGUgZmlsZSBzeXN0ZW0gcHJvdmlkZXJzIGZvciB0aGUgZ2l2ZW4gcmVzb3VyY2UuXG5cdCAqL1xuXHRjYW5IYW5kbGVSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPjtcblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIHRoZSBmaWxlIHNlcnZpY2UgaGFzIGEgcmVnaXN0ZXJlZCBwcm92aWRlciBmb3IgdGhlXG5cdCAqIHByb3ZpZGVkIHJlc291cmNlLlxuXHQgKlxuXHQgKiBOb3RlOiB0aGlzIGRvZXMgTk9UIGFjY291bnQgZm9yIGNvbnRyaWJ1dGVkIHByb3ZpZGVycyBmcm9tXG5cdCAqIGV4dGVuc2lvbnMgdGhhdCBoYXZlIG5vdCBiZWVuIGFjdGl2YXRlZCB5ZXQuIFRvIGluY2x1ZGUgdGhvc2UsXG5cdCAqIGNvbnNpZGVyIHRvIGNhbGwgYGF3YWl0IGZpbGVTZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlKWAuXG5cdCAqL1xuXHRoYXNQcm92aWRlcihyZXNvdXJjZTogVVJJKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIHRoZSBwcm92aWRlciBmb3IgdGhlIHByb3ZpZGVkIHJlc291cmNlIGhhcyB0aGUgcHJvdmlkZWQgZmlsZSBzeXN0ZW0gY2FwYWJpbGl0eS5cblx0ICovXG5cdGhhc0NhcGFiaWxpdHkocmVzb3VyY2U6IFVSSSwgY2FwYWJpbGl0eTogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogTGlzdCB0aGUgc2NoZW1lcyBhbmQgY2FwYWJpbGl0aWVzIGZvciByZWdpc3RlcmVkIGZpbGUgc3lzdGVtIHByb3ZpZGVyc1xuXHQgKi9cblx0bGlzdENhcGFiaWxpdGllcygpOiBJdGVyYWJsZTx7IHNjaGVtZTogc3RyaW5nOyBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB9PjtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIGxpc3RlbiBmb3IgZmlsZSBjaGFuZ2VzLiBUaGUgZXZlbnQgd2lsbCBmaXJlIGZvciBldmVyeSBmaWxlIHdpdGhpbiB0aGUgb3BlbmVkIHdvcmtzcGFjZVxuXHQgKiAoaWYgYW55KSBhcyB3ZWxsIGFzIGFsbCBmaWxlcyB0aGF0IGhhdmUgYmVlbiB3YXRjaGVkIGV4cGxpY2l0bHkgdXNpbmcgdGhlICN3YXRjaCgpIEFQSS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkRmlsZXNDaGFuZ2U6IEV2ZW50PEZpbGVDaGFuZ2VzRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB0aGF0IGlzIGZpcmVkIHVwb24gc3VjY2Vzc2Z1bCBjb21wbGV0aW9uIG9mIGEgY2VydGFpbiBmaWxlIG9wZXJhdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUnVuT3BlcmF0aW9uOiBFdmVudDxGaWxlT3BlcmF0aW9uRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBwcm9wZXJ0aWVzIG9mIGEgZmlsZS9mb2xkZXIgaWRlbnRpZmllZCBieSB0aGUgcmVzb3VyY2UuIEZvciBhIGZvbGRlciwgY2hpbGRyZW5cblx0ICogaW5mb3JtYXRpb24gaXMgcmVzb2x2ZWQgYXMgd2VsbCBkZXBlbmRpbmcgb24gdGhlIHByb3ZpZGVkIG9wdGlvbnMuIFVzZSBgc3RhdCgpYCBtZXRob2QgaWZcblx0ICogeW91IGRvIG5vdCBuZWVkIGNoaWxkcmVuIGluZm9ybWF0aW9uLlxuXHQgKlxuXHQgKiBJZiB0aGUgb3B0aW9uYWwgcGFyYW1ldGVyIFwicmVzb2x2ZVRvXCIgaXMgc3BlY2lmaWVkIGluIG9wdGlvbnMsIHRoZSBzdGF0IHNlcnZpY2UgaXMgYXNrZWRcblx0ICogdG8gcHJvdmlkZSBhIHN0YXQgb2JqZWN0IHRoYXQgc2hvdWxkIGNvbnRhaW4gdGhlIGZ1bGwgZ3JhcGggb2YgZm9sZGVycyB1cCB0byBhbGwgb2YgdGhlXG5cdCAqIHRhcmdldCByZXNvdXJjZXMuXG5cdCAqXG5cdCAqIElmIHRoZSBvcHRpb25hbCBwYXJhbWV0ZXIgXCJyZXNvbHZlU2luZ2xlQ2hpbGREZXNjZW5kYW50c1wiIGlzIHNwZWNpZmllZCBpbiBvcHRpb25zLFxuXHQgKiB0aGUgc3RhdCBzZXJ2aWNlIGlzIGFza2VkIHRvIGF1dG9tYXRpY2FsbHkgcmVzb2x2ZSBjaGlsZCBmb2xkZXJzIHRoYXQgb25seVxuXHQgKiBjb250YWluIGEgc2luZ2xlIGVsZW1lbnQuXG5cdCAqXG5cdCAqIElmIHRoZSBvcHRpb25hbCBwYXJhbWV0ZXIgXCJyZXNvbHZlTWV0YWRhdGFcIiBpcyBzcGVjaWZpZWQgaW4gb3B0aW9ucyxcblx0ICogdGhlIHN0YXQgd2lsbCBjb250YWluIG1ldGFkYXRhIGluZm9ybWF0aW9uIHN1Y2ggYXMgc2l6ZSwgbXRpbWUgYW5kIGV0YWcuXG5cdCAqL1xuXHRyZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblx0cmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlc29sdmVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0PjtcblxuXHQvKipcblx0ICogU2FtZSBhcyBgcmVzb2x2ZSgpYCBidXQgc3VwcG9ydHMgcmVzb2x2aW5nIG11bHRpcGxlIHJlc291cmNlcyBpbiBwYXJhbGxlbC5cblx0ICpcblx0ICogSWYgb25lIG9mIHRoZSByZXNvbHZlIHRhcmdldHMgZmFpbHMgdG8gcmVzb2x2ZSByZXR1cm5zIGEgZmFrZSBgSUZpbGVTdGF0YCBpbnN0ZWFkIG9mXG5cdCAqIG1ha2luZyB0aGUgd2hvbGUgY2FsbCBmYWlsLlxuXHQgKi9cblx0cmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSTsgb3B0aW9uczogSVJlc29sdmVNZXRhZGF0YUZpbGVPcHRpb25zIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+O1xuXHRyZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJOyBvcHRpb25zPzogSVJlc29sdmVGaWxlT3B0aW9ucyB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPjtcblxuXHQvKipcblx0ICogU2FtZSBhcyBgcmVzb2x2ZSgpYCBidXQgd2l0aG91dCByZXNvbHZpbmcgdGhlIGNoaWxkcmVuIG9mIGEgZm9sZGVyIGlmIHRoZVxuXHQgKiByZXNvdXJjZSBpcyBwb2ludGluZyB0byBhIGZvbGRlci5cblx0ICovXG5cdHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YT47XG5cblx0LyoqXG5cdCAqIEF0dGVtcHRzIHRvIHJlc29sdmUgdGhlIHJlYWwgcGF0aCBvZiB0aGUgcHJvdmlkZWQgcmVzb3VyY2UuIFRoZSByZWFsIHBhdGggY2FuIGJlXG5cdCAqIGRpZmZlcmVudCBmcm9tIHRoZSByZXNvdXJjZSBwYXRoIGZvciBleGFtcGxlIHdoZW4gaXQgaXMgYSBzeW1saW5rLlxuXHQgKlxuXHQgKiBXaWxsIHJldHVybiBgdW5kZWZpbmVkYCBpZiB0aGUgcmVhbCBwYXRoIGNhbm5vdCBiZSByZXNvbHZlZC5cblx0ICovXG5cdHJlYWxwYXRoKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIEZpbmRzIG91dCBpZiBhIGZpbGUvZm9sZGVyIGlkZW50aWZpZWQgYnkgdGhlIHJlc291cmNlIGV4aXN0cy5cblx0ICovXG5cdGV4aXN0cyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPjtcblxuXHQvKipcblx0ICogUmVhZCB0aGUgY29udGVudHMgb2YgdGhlIHByb3ZpZGVkIHJlc291cmNlIHVuYnVmZmVyZWQuXG5cdCAqL1xuXHRyZWFkRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVDb250ZW50PjtcblxuXHQvKipcblx0ICogUmVhZCB0aGUgY29udGVudHMgb2YgdGhlIHByb3ZpZGVkIHJlc291cmNlIGJ1ZmZlcmVkIGFzIHN0cmVhbS5cblx0ICovXG5cdHJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVTdHJlYW1PcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZVN0cmVhbUNvbnRlbnQ+O1xuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBjb250ZW50IHJlcGxhY2luZyBpdHMgcHJldmlvdXMgdmFsdWUuXG5cdCAqIElmIGBvcHRpb25zLmFwcGVuZGAgaXMgdHJ1ZSwgYXBwZW5kcyBjb250ZW50IHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUgaW5zdGVhZC5cblx0ICpcblx0ICogRW1pdHMgYSBgRmlsZU9wZXJhdGlvbi5XUklURWAgZmlsZSBvcGVyYXRpb24gZXZlbnQgd2hlbiBzdWNjZXNzZnVsLlxuXHQgKi9cblx0d3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlck9yUmVhZGFibGVPclN0cmVhbTogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+O1xuXG5cdC8qKlxuXHQgKiBNb3ZlcyB0aGUgZmlsZS9mb2xkZXIgdG8gYSBuZXcgcGF0aCBpZGVudGlmaWVkIGJ5IHRoZSByZXNvdXJjZS5cblx0ICpcblx0ICogVGhlIG9wdGlvbmFsIHBhcmFtZXRlciBvdmVyd3JpdGUgY2FuIGJlIHNldCB0byByZXBsYWNlIGFuIGV4aXN0aW5nIGZpbGUgYXQgdGhlIGxvY2F0aW9uLlxuXHQgKlxuXHQgKiBFbWl0cyBhIGBGaWxlT3BlcmF0aW9uLk1PVkVgIGZpbGUgb3BlcmF0aW9uIGV2ZW50IHdoZW4gc3VjY2Vzc2Z1bC5cblx0ICovXG5cdG1vdmUoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+O1xuXG5cdC8qKlxuXHQgKiBGaW5kIG91dCBpZiBhIG1vdmUgb3BlcmF0aW9uIGlzIHBvc3NpYmxlIGdpdmVuIHRoZSBhcmd1bWVudHMuIE5vIGNoYW5nZXMgb24gZGlzayB3aWxsXG5cdCAqIGJlIHBlcmZvcm1lZC4gUmV0dXJucyBhbiBFcnJvciBpZiB0aGUgb3BlcmF0aW9uIGNhbm5vdCBiZSBkb25lLlxuXHQgKi9cblx0Y2FuTW92ZShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT47XG5cblx0LyoqXG5cdCAqIENvcGllcyB0aGUgZmlsZS9mb2xkZXIgdG8gYSBwYXRoIGlkZW50aWZpZWQgYnkgdGhlIHJlc291cmNlLiBBIGZvbGRlciBpcyBjb3BpZWRcblx0ICogcmVjdXJzaXZlbHkuXG5cdCAqXG5cdCAqIEVtaXRzIGEgYEZpbGVPcGVyYXRpb24uQ09QWWAgZmlsZSBvcGVyYXRpb24gZXZlbnQgd2hlbiBzdWNjZXNzZnVsLlxuXHQgKi9cblx0Y29weShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG92ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT47XG5cblx0LyoqXG5cdCAqIEZpbmQgb3V0IGlmIGEgY29weSBvcGVyYXRpb24gaXMgcG9zc2libGUgZ2l2ZW4gdGhlIGFyZ3VtZW50cy4gTm8gY2hhbmdlcyBvbiBkaXNrIHdpbGxcblx0ICogYmUgcGVyZm9ybWVkLiBSZXR1cm5zIGFuIEVycm9yIGlmIHRoZSBvcGVyYXRpb24gY2Fubm90IGJlIGRvbmUuXG5cdCAqL1xuXHRjYW5Db3B5KHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3ZlcndyaXRlPzogYm9vbGVhbik6IFByb21pc2U8RXJyb3IgfCB0cnVlPjtcblxuXHQvKipcblx0ICogQ2xvbmVzIGEgZmlsZSB0byBhIHBhdGggaWRlbnRpZmllZCBieSB0aGUgcmVzb3VyY2UuIEZvbGRlcnMgYXJlIG5vdCBzdXBwb3J0ZWQuXG5cdCAqXG5cdCAqIElmIHRoZSB0YXJnZXQgcGF0aCBleGlzdHMsIGl0IHdpbGwgYmUgb3ZlcndyaXR0ZW4uXG5cdCAqL1xuXHRjbG9uZUZpbGUoc291cmNlOiBVUkksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBmaWxlIHdpdGggdGhlIGdpdmVuIHBhdGggYW5kIG9wdGlvbmFsIGNvbnRlbnRzLiBUaGUgcmV0dXJuZWQgcHJvbWlzZVxuXHQgKiB3aWxsIGhhdmUgdGhlIHN0YXQgbW9kZWwgb2JqZWN0IGFzIGEgcmVzdWx0LlxuXHQgKlxuXHQgKiBUaGUgb3B0aW9uYWwgcGFyYW1ldGVyIGNvbnRlbnQgY2FuIGJlIHVzZWQgYXMgdmFsdWUgdG8gZmlsbCBpbnRvIHRoZSBuZXcgZmlsZS5cblx0ICpcblx0ICogRW1pdHMgYSBgRmlsZU9wZXJhdGlvbi5DUkVBVEVgIGZpbGUgb3BlcmF0aW9uIGV2ZW50IHdoZW4gc3VjY2Vzc2Z1bC5cblx0ICovXG5cdGNyZWF0ZUZpbGUocmVzb3VyY2U6IFVSSSwgYnVmZmVyT3JSZWFkYWJsZU9yU3RyZWFtPzogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgb3B0aW9ucz86IElDcmVhdGVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblxuXHQvKipcblx0ICogRmluZCBvdXQgaWYgYSBmaWxlIGNyZWF0ZSBvcGVyYXRpb24gaXMgcG9zc2libGUgZ2l2ZW4gdGhlIGFyZ3VtZW50cy4gTm8gY2hhbmdlcyBvbiBkaXNrIHdpbGxcblx0ICogYmUgcGVyZm9ybWVkLiBSZXR1cm5zIGFuIEVycm9yIGlmIHRoZSBvcGVyYXRpb24gY2Fubm90IGJlIGRvbmUuXG5cdCAqL1xuXHRjYW5DcmVhdGVGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT47XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgZm9sZGVyIHdpdGggdGhlIGdpdmVuIHBhdGguIFRoZSByZXR1cm5lZCBwcm9taXNlXG5cdCAqIHdpbGwgaGF2ZSB0aGUgc3RhdCBtb2RlbCBvYmplY3QgYXMgYSByZXN1bHQuXG5cdCAqXG5cdCAqIEVtaXRzIGEgYEZpbGVPcGVyYXRpb24uQ1JFQVRFYCBmaWxlIG9wZXJhdGlvbiBldmVudCB3aGVuIHN1Y2Nlc3NmdWwuXG5cdCAqL1xuXHRjcmVhdGVGb2xkZXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblxuXHQvKipcblx0ICogRGVsZXRlcyB0aGUgcHJvdmlkZWQgZmlsZS4gVGhlIG9wdGlvbmFsIHVzZVRyYXNoIHBhcmFtZXRlciBhbGxvd3MgdG9cblx0ICogbW92ZSB0aGUgZmlsZSB0byB0cmFzaC4gVGhlIG9wdGlvbmFsIHJlY3Vyc2l2ZSBwYXJhbWV0ZXIgYWxsb3dzIHRvIGRlbGV0ZVxuXHQgKiBub24tZW1wdHkgZm9sZGVycyByZWN1cnNpdmVseS5cblx0ICpcblx0ICogRW1pdHMgYSBgRmlsZU9wZXJhdGlvbi5ERUxFVEVgIGZpbGUgb3BlcmF0aW9uIGV2ZW50IHdoZW4gc3VjY2Vzc2Z1bC5cblx0ICovXG5cdGRlbChyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogUGFydGlhbDxJRmlsZURlbGV0ZU9wdGlvbnM+KTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogRmluZCBvdXQgaWYgYSBkZWxldGUgb3BlcmF0aW9uIGlzIHBvc3NpYmxlIGdpdmVuIHRoZSBhcmd1bWVudHMuIE5vIGNoYW5nZXMgb24gZGlzayB3aWxsXG5cdCAqIGJlIHBlcmZvcm1lZC4gUmV0dXJucyBhbiBFcnJvciBpZiB0aGUgb3BlcmF0aW9uIGNhbm5vdCBiZSBkb25lLlxuXHQgKi9cblx0Y2FuRGVsZXRlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBQYXJ0aWFsPElGaWxlRGVsZXRlT3B0aW9ucz4pOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgc2lnbmFscyBhbiBlcnJvciB3aGVuIHdhdGNoaW5nIGZvciBmaWxlIGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFdhdGNoRXJyb3I6IEV2ZW50PEVycm9yPjtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIHN0YXJ0IGEgd2F0Y2hlciB0aGF0IHJlcG9ydHMgZmlsZS9mb2xkZXIgY2hhbmdlIGV2ZW50cyBvbiB0aGUgcHJvdmlkZWQgcmVzb3VyY2UuXG5cdCAqXG5cdCAqIFRoZSB3YXRjaGVyIHJ1bnMgY29ycmVsYXRlZCBhbmQgdGh1cywgZmlsZSBldmVudHMgd2lsbCBiZSByZXBvcnRlZCBvbiB0aGUgcmV0dXJuZWRcblx0ICogYElGaWxlU3lzdGVtV2F0Y2hlcmAgYW5kIG5vdCBvbiB0aGUgZ2VuZXJpYyBgSUZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2VgIGV2ZW50LlxuXHQgKlxuXHQgKiBOb3RlOiBvbmx5IG5vbi1yZWN1cnNpdmUgZmlsZSB3YXRjaGluZyBzdXBwb3J0cyBldmVudCBjb3JyZWxhdGlvbiBmb3Igbm93LlxuXHQgKi9cblx0Y3JlYXRlV2F0Y2hlcihyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJV2F0Y2hPcHRpb25zV2l0aG91dENvcnJlbGF0aW9uICYgeyByZWN1cnNpdmU6IGZhbHNlIH0pOiBJRmlsZVN5c3RlbVdhdGNoZXI7XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byBzdGFydCBhIHdhdGNoZXIgdGhhdCByZXBvcnRzIGZpbGUvZm9sZGVyIGNoYW5nZSBldmVudHMgb24gdGhlIHByb3ZpZGVkIHJlc291cmNlLlxuXHQgKlxuXHQgKiBUaGUgd2F0Y2hlciBydW5zIHVuY29ycmVsYXRlZCBhbmQgdGh1cyB3aWxsIHJlcG9ydCBhbGwgZXZlbnRzIGZyb20gYElGaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlYC5cblx0ICogVGhpcyBtZWFucywgbW9zdCBsaXN0ZW5lcnMgaW4gdGhlIGFwcGxpY2F0aW9uIHdpbGwgcmVjZWl2ZSB5b3VyIGV2ZW50cy4gSXQgaXMgZW5jb3VyYWdlZCB0b1xuXHQgKiB1c2UgY29ycmVsYXRlZCB3YXRjaGVycyAodmlhIGBJV2F0Y2hPcHRpb25zV2l0aENvcnJlbGF0aW9uYCkgdG8gbGltaXQgZXZlbnRzIHRvIHlvdXIgbGlzdGVuZXIuXG5cdCovXG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJV2F0Y2hPcHRpb25zV2l0aG91dENvcnJlbGF0aW9uKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIEZyZWVzIHVwIGFueSByZXNvdXJjZXMgb2NjdXBpZWQgYnkgdGhpcyBzZXJ2aWNlLlxuXHQgKi9cblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlT3ZlcndyaXRlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFNldCB0byBgdHJ1ZWAgdG8gb3ZlcndyaXRlIGEgZmlsZSBpZiBpdCBleGlzdHMuIFdpbGxcblx0ICogdGhyb3cgYW4gZXJyb3Igb3RoZXJ3aXNlIGlmIHRoZSBmaWxlIGRvZXMgZXhpc3QuXG5cdCAqL1xuXHRyZWFkb25seSBvdmVyd3JpdGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVVbmxvY2tPcHRpb25zIHtcblxuXHQvKipcblx0ICogU2V0IHRvIGB0cnVlYCB0byB0cnkgdG8gcmVtb3ZlIGFueSB3cml0ZSBsb2NrcyB0aGUgZmlsZSBtaWdodFxuXHQgKiBoYXZlLiBBIGZpbGUgdGhhdCBpcyB3cml0ZSBsb2NrZWQgd2lsbCB0aHJvdyBhbiBlcnJvciBmb3IgYW55XG5cdCAqIGF0dGVtcHQgdG8gd3JpdGUgdG8gdW5sZXNzIGB1bmxvY2s6IHRydWVgIGlzIHByb3ZpZGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgdW5sb2NrOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlQXRvbWljUmVhZE9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9uYWwgYGF0b21pY2AgZmxhZyBjYW4gYmUgdXNlZCB0byBtYWtlIHN1cmVcblx0ICogdGhlIGByZWFkRmlsZWAgbWV0aG9kIGlzIG5vdCBydW5uaW5nIGluIHBhcmFsbGVsIHdpdGhcblx0ICogYW55IGB3cml0ZWAgb3BlcmF0aW9ucyBpbiB0aGUgc2FtZSBwcm9jZXNzLlxuXHQgKlxuXHQgKiBUeXBpY2FsbHkgeW91IHNob3VsZCBub3QgbmVlZCB0byB1c2UgdGhpcyBmbGFnIGJ1dCBpZlxuXHQgKiBmb3IgZXhhbXBsZSB5b3UgYXJlIHF1aWNrbHkgcmVhZGluZyBhIGZpbGUgcmlnaHQgYWZ0ZXJcblx0ICogYSBmaWxlIGV2ZW50IG9jY3VycmVkIGFuZCB0aGUgZmlsZSBjaGFuZ2VzIGEgbG90LCB0aGVyZVxuXHQgKiBpcyBhIGNoYW5jZSB0aGF0IGEgcmVhZCByZXR1cm5zIGFuIGVtcHR5IG9yIHBhcnRpYWwgZmlsZVxuXHQgKiBiZWNhdXNlIGEgcGVuZGluZyB3cml0ZSBoYXMgbm90IGZpbmlzaGVkIHlldC5cblx0ICpcblx0ICogTm90ZTogdGhpcyBkb2VzIG5vdCBwcmV2ZW50IHRoZSBmaWxlIGZyb20gYmVpbmcgd3JpdHRlblxuXHQgKiB0byBmcm9tIGEgZGlmZmVyZW50IHByb2Nlc3MuIElmIHlvdSBuZWVkIHN1Y2ggYXRvbWljXG5cdCAqIG9wZXJhdGlvbnMsIHlvdSBiZXR0ZXIgdXNlIGEgcmVhbCBkYXRhYmFzZSBhcyBzdG9yYWdlLlxuXHQgKi9cblx0cmVhZG9ubHkgYXRvbWljOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlQXRvbWljT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFRoZSBwb3N0Zml4IGlzIHVzZWQgdG8gY3JlYXRlIGEgdGVtcG9yYXJ5IGZpbGUgYmFzZWRcblx0ICogb24gdGhlIG9yaWdpbmFsIHJlc291cmNlLiBUaGUgcmVzdWx0aW5nIHRlbXBvcmFyeVxuXHQgKiBmaWxlIHdpbGwgYmUgaW4gdGhlIHNhbWUgZm9sZGVyIGFzIHRoZSByZXNvdXJjZSBhbmRcblx0ICogaGF2ZSBgcG9zdGZpeGAgYXBwZW5kZWQgdG8gdGhlIHJlc291cmNlIG5hbWUuXG5cdCAqXG5cdCAqIEV4YW1wbGU6IGdpdmVuIGEgZmlsZSByZXNvdXJjZSBgZmlsZTovLy9zb21lL3BhdGgvZm9vLnR4dGBcblx0ICogYW5kIGEgcG9zdGZpeCBgLnZzY3RtcGAsIHRoZSB0ZW1wb3JhcnkgZmlsZSB3aWxsIGJlXG5cdCAqIGNyZWF0ZWQgYXMgYGZpbGU6Ly8vc29tZS9wYXRoL2Zvby50eHQudnNjdG1wYC5cblx0ICovXG5cdHJlYWRvbmx5IHBvc3RmaXg6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUF0b21pY1dyaXRlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFRoZSBvcHRpb25hbCBgYXRvbWljYCBmbGFnIGNhbiBiZSB1c2VkIHRvIG1ha2Ugc3VyZVxuXHQgKiB0aGUgYHdyaXRlRmlsZWAgbWV0aG9kIHVwZGF0ZXMgdGhlIHRhcmdldCBmaWxlIGF0b21pY2FsbHlcblx0ICogYnkgZmlyc3Qgd3JpdGluZyB0byBhIHRlbXBvcmFyeSBmaWxlIGluIHRoZSBzYW1lIGZvbGRlclxuXHQgKiBhbmQgdGhlbiByZW5hbWluZyBpdCBvdmVyIHRoZSB0YXJnZXQuXG5cdCAqL1xuXHRyZWFkb25seSBhdG9taWM6IElGaWxlQXRvbWljT3B0aW9ucyB8IGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlQXRvbWljRGVsZXRlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFRoZSBvcHRpb25hbCBgYXRvbWljYCBmbGFnIGNhbiBiZSB1c2VkIHRvIG1ha2Ugc3VyZVxuXHQgKiB0aGUgYGRlbGV0ZWAgbWV0aG9kIGRlbGV0ZXMgdGhlIHRhcmdldCBhdG9taWNhbGx5IGJ5XG5cdCAqIGZpcnN0IHJlbmFtaW5nIGl0IHRvIGEgdGVtcG9yYXJ5IHJlc291cmNlIGluIHRoZSBzYW1lXG5cdCAqIGZvbGRlciBhbmQgdGhlbiBkZWxldGluZyBpdC5cblx0ICovXG5cdHJlYWRvbmx5IGF0b21pYzogSUZpbGVBdG9taWNPcHRpb25zIHwgZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVSZWFkTGltaXRzIHtcblxuXHQvKipcblx0ICogSWYgdGhlIGZpbGUgZXhjZWVkcyB0aGUgZ2l2ZW4gc2l6ZSwgYW4gZXJyb3Igb2Yga2luZFxuXHQgKiBgRklMRV9UT09fTEFSR0VgIHdpbGwgYmUgdGhyb3duLlxuXHQgKi9cblx0c2l6ZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVJlYWRTdHJlYW1PcHRpb25zIHtcblxuXHQvKipcblx0ICogSXMgYW4gaW50ZWdlciBzcGVjaWZ5aW5nIHdoZXJlIHRvIGJlZ2luIHJlYWRpbmcgZnJvbSBpbiB0aGUgZmlsZS4gSWYgcG9zaXRpb24gaXMgdW5kZWZpbmVkLFxuXHQgKiBkYXRhIHdpbGwgYmUgcmVhZCBmcm9tIHRoZSBjdXJyZW50IGZpbGUgcG9zaXRpb24uXG5cdCAqL1xuXHRyZWFkb25seSBwb3NpdGlvbj86IG51bWJlcjtcblxuXHQvKipcblx0ICogSXMgYW4gaW50ZWdlciBzcGVjaWZ5aW5nIGhvdyBtYW55IGJ5dGVzIHRvIHJlYWQgZnJvbSB0aGUgZmlsZS4gQnkgZGVmYXVsdCwgYWxsIGJ5dGVzXG5cdCAqIHdpbGwgYmUgcmVhZC5cblx0ICovXG5cdHJlYWRvbmx5IGxlbmd0aD86IG51bWJlcjtcblxuXHQvKipcblx0ICogSWYgcHJvdmlkZWQsIHRoZSBzaXplIG9mIHRoZSBmaWxlIHdpbGwgYmUgY2hlY2tlZCBhZ2FpbnN0IHRoZSBsaW1pdHNcblx0ICogYW5kIGFuIGVycm9yIHdpbGwgYmUgdGhyb3duIGlmIGFueSBsaW1pdCBpcyBleGNlZWRlZC5cblx0ICovXG5cdHJlYWRvbmx5IGxpbWl0cz86IElGaWxlUmVhZExpbWl0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVdyaXRlT3B0aW9ucyBleHRlbmRzIElGaWxlT3ZlcndyaXRlT3B0aW9ucywgSUZpbGVVbmxvY2tPcHRpb25zLCBJRmlsZUF0b21pY1dyaXRlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFNldCB0byBgdHJ1ZWAgdG8gY3JlYXRlIGEgZmlsZSB3aGVuIGl0IGRvZXMgbm90IGV4aXN0LiBXaWxsXG5cdCAqIHRocm93IGFuIGVycm9yIG90aGVyd2lzZSBpZiB0aGUgZmlsZSBkb2VzIG5vdCBleGlzdC5cblx0ICovXG5cdHJlYWRvbmx5IGNyZWF0ZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2V0IHRvIGB0cnVlYCB0byBhcHBlbmQgY29udGVudCB0byB0aGUgZW5kIG9mIHRoZSBmaWxlLiBJbXBsaWVzIGBjcmVhdGU6IHRydWVgLFxuXHQgKiBhbmQgc2V0IG9ubHkgd2hlbiB0aGUgY29ycmVzcG9uZGluZyBgRmlsZUFwcGVuZGAgY2FwYWJpbGl0eSBpcyBkZWZpbmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgYXBwZW5kPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSUZpbGVPcGVuT3B0aW9ucyA9IElGaWxlT3BlbkZvclJlYWRPcHRpb25zIHwgSUZpbGVPcGVuRm9yV3JpdGVPcHRpb25zO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNGaWxlT3BlbkZvcldyaXRlT3B0aW9ucyhvcHRpb25zOiBJRmlsZU9wZW5PcHRpb25zKTogb3B0aW9ucyBpcyBJRmlsZU9wZW5Gb3JXcml0ZU9wdGlvbnMge1xuXHRyZXR1cm4gb3B0aW9ucy5jcmVhdGUgPT09IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVPcGVuRm9yUmVhZE9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBBIGhpbnQgdGhhdCB0aGUgZmlsZSBzaG91bGQgYmUgb3BlbmVkIGZvciByZWFkaW5nIG9ubHkuXG5cdCAqL1xuXHRyZWFkb25seSBjcmVhdGU6IGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlT3BlbkZvcldyaXRlT3B0aW9ucyBleHRlbmRzIElGaWxlVW5sb2NrT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIEEgaGludCB0aGF0IHRoZSBmaWxlIHNob3VsZCBiZSBvcGVuZWQgZm9yIHJlYWRpbmcgYW5kIHdyaXRpbmcuXG5cdCAqL1xuXHRyZWFkb25seSBjcmVhdGU6IHRydWU7XG5cblx0LyoqXG5cdCAqIE9wZW4gdGhlIGZpbGUgaW4gYXBwZW5kIG1vZGUuIFRoaXMgd2lsbCB3cml0ZSBkYXRhIHRvIHRoZVxuXHQgKiBlbmQgb2YgdGhlIGZpbGUuXG5cdCAqL1xuXHRyZWFkb25seSBhcHBlbmQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlRGVsZXRlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFNldCB0byBgdHJ1ZWAgdG8gcmVjdXJzaXZlbHkgZGVsZXRlIGFueSBjaGlsZHJlbiBvZiB0aGUgZmlsZS4gVGhpc1xuXHQgKiBvbmx5IGFwcGxpZXMgdG8gZm9sZGVycyBhbmQgY2FuIGxlYWQgdG8gYW4gZXJyb3IgdW5sZXNzIHByb3ZpZGVkXG5cdCAqIGlmIHRoZSBmb2xkZXIgaXMgbm90IGVtcHR5LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVjdXJzaXZlOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTZXQgdG8gYHRydWVgIHRvIGF0dGVtcHQgdG8gbW92ZSB0aGUgZmlsZSB0byB0cmFzaFxuXHQgKiBpbnN0ZWFkIG9mIGRlbGV0aW5nIGl0IHBlcm1hbmVudGx5IGZyb20gZGlzay5cblx0ICpcblx0ICogVGhpcyBvcHRpb24gbWF5YmUgbm90IGJlIHN1cHBvcnRlZCBvbiBhbGwgcHJvdmlkZXJzLlxuXHQgKi9cblx0cmVhZG9ubHkgdXNlVHJhc2g6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBvcHRpb25hbCBgYXRvbWljYCBmbGFnIGNhbiBiZSB1c2VkIHRvIG1ha2Ugc3VyZVxuXHQgKiB0aGUgYGRlbGV0ZWAgbWV0aG9kIGRlbGV0ZXMgdGhlIHRhcmdldCBhdG9taWNhbGx5IGJ5XG5cdCAqIGZpcnN0IHJlbmFtaW5nIGl0IHRvIGEgdGVtcG9yYXJ5IHJlc291cmNlIGluIHRoZSBzYW1lXG5cdCAqIGZvbGRlciBhbmQgdGhlbiBkZWxldGluZyBpdC5cblx0ICpcblx0ICogVGhpcyBvcHRpb24gbWF5YmUgbm90IGJlIHN1cHBvcnRlZCBvbiBhbGwgcHJvdmlkZXJzLlxuXHQgKi9cblx0cmVhZG9ubHkgYXRvbWljOiBJRmlsZUF0b21pY09wdGlvbnMgfCBmYWxzZTtcbn1cblxuZXhwb3J0IGVudW0gRmlsZVR5cGUge1xuXG5cdC8qKlxuXHQgKiBGaWxlIGlzIHVua25vd24gKG5laXRoZXIgZmlsZSwgZGlyZWN0b3J5IG5vciBzeW1ib2xpYyBsaW5rKS5cblx0ICovXG5cdFVua25vd24gPSAwLFxuXG5cdC8qKlxuXHQgKiBGaWxlIGlzIGEgbm9ybWFsIGZpbGUuXG5cdCAqL1xuXHRGaWxlID0gMSxcblxuXHQvKipcblx0ICogRmlsZSBpcyBhIGRpcmVjdG9yeS5cblx0ICovXG5cdERpcmVjdG9yeSA9IDIsXG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgYSBzeW1ib2xpYyBsaW5rLlxuXHQgKlxuXHQgKiBOb3RlOiBldmVuIHdoZW4gdGhlIGZpbGUgaXMgYSBzeW1ib2xpYyBsaW5rLCB5b3UgY2FuIHRlc3QgZm9yXG5cdCAqIGBGaWxlVHlwZS5GaWxlYCBhbmQgYEZpbGVUeXBlLkRpcmVjdG9yeWAgdG8ga25vdyB0aGUgdHlwZSBvZlxuXHQgKiB0aGUgdGFyZ2V0IHRoZSBsaW5rIHBvaW50cyB0by5cblx0ICovXG5cdFN5bWJvbGljTGluayA9IDY0XG59XG5cbmV4cG9ydCBlbnVtIEZpbGVQZXJtaXNzaW9uIHtcblxuXHQvKipcblx0ICogRmlsZSBpcyByZWFkb25seS4gQ29tcG9uZW50cyBsaWtlIGVkaXRvcnMgc2hvdWxkIG5vdFxuXHQgKiBvZmZlciB0byBlZGl0IHRoZSBjb250ZW50cy5cblx0ICovXG5cdFJlYWRvbmx5ID0gMSxcblxuXHQvKipcblx0ICogRmlsZSBpcyBsb2NrZWQuIENvbXBvbmVudHMgbGlrZSBlZGl0b3JzIHNob3VsZCBvZmZlclxuXHQgKiB0byBlZGl0IHRoZSBjb250ZW50cyBhbmQgYXNrIHRoZSB1c2VyIHVwb24gc2F2aW5nIHRvXG5cdCAqIHJlbW92ZSB0aGUgbG9jay5cblx0ICovXG5cdExvY2tlZCA9IDIsXG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgZXhlY3V0YWJsZS4gUmVsZXZhbnQgZm9yIFVuaXgtbGlrZSBzeXN0ZW1zIHdoZXJlXG5cdCAqIHRoZSBleGVjdXRhYmxlIGJpdCBkZXRlcm1pbmVzIGlmIGEgZmlsZSBjYW4gYmUgcnVuLlxuXHQgKi9cblx0RXhlY3V0YWJsZSA9IDRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RhdCB7XG5cblx0LyoqXG5cdCAqIFRoZSBmaWxlIHR5cGUuXG5cdCAqL1xuXHRyZWFkb25seSB0eXBlOiBGaWxlVHlwZTtcblxuXHQvKipcblx0ICogVGhlIGxhc3QgbW9kaWZpY2F0aW9uIGRhdGUgcmVwcmVzZW50ZWQgYXMgbWlsbGlzIGZyb20gdW5peCBlcG9jaC5cblx0ICovXG5cdHJlYWRvbmx5IG10aW1lOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBjcmVhdGlvbiBkYXRlIHJlcHJlc2VudGVkIGFzIG1pbGxpcyBmcm9tIHVuaXggZXBvY2guXG5cdCAqL1xuXHRyZWFkb25seSBjdGltZTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2l6ZSBvZiB0aGUgZmlsZSBpbiBieXRlcy5cblx0ICovXG5cdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIGZpbGUgcGVybWlzc2lvbnMuXG5cdCAqL1xuXHRyZWFkb25seSBwZXJtaXNzaW9ucz86IEZpbGVQZXJtaXNzaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXYXRjaE9wdGlvbnNXaXRob3V0Q29ycmVsYXRpb24ge1xuXG5cdC8qKlxuXHQgKiBTZXQgdG8gYHRydWVgIHRvIHdhdGNoIGZvciBjaGFuZ2VzIHJlY3Vyc2l2ZWx5IGluIGEgZm9sZGVyXG5cdCAqIGFuZCBhbGwgb2YgaXRzIGNoaWxkcmVuLlxuXHQgKi9cblx0cmVjdXJzaXZlOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBIHNldCBvZiBnbG9iIHBhdHRlcm5zIG9yIHBhdGhzIHRvIGV4Y2x1ZGUgZnJvbSB3YXRjaGluZy5cblx0ICogUGF0aHMgY2FuIGJlIHJlbGF0aXZlIG9yIGFic29sdXRlIGFuZCB3aGVuIHJlbGF0aXZlIGFyZVxuXHQgKiByZXNvbHZlZCBhZ2FpbnN0IHRoZSB3YXRjaGVkIGZvbGRlci4gR2xvYiBwYXR0ZXJucyBhcmVcblx0ICogYWx3YXlzIG1hdGNoZWQgcmVsYXRpdmUgdG8gdGhlIHdhdGNoZWQgZm9sZGVyLlxuXHQgKi9cblx0ZXhjbHVkZXM6IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBBbiBvcHRpb25hbCBzZXQgb2YgZ2xvYiBwYXR0ZXJucyBvciBwYXRocyB0byBpbmNsdWRlIGZvclxuXHQgKiB3YXRjaGluZy4gSWYgbm90IHByb3ZpZGVkLCBhbGwgcGF0aHMgYXJlIGNvbnNpZGVyZWQgZm9yXG5cdCAqIGV2ZW50cy5cblx0ICogUGF0aHMgY2FuIGJlIHJlbGF0aXZlIG9yIGFic29sdXRlIGFuZCB3aGVuIHJlbGF0aXZlIGFyZVxuXHQgKiByZXNvbHZlZCBhZ2FpbnN0IHRoZSB3YXRjaGVkIGZvbGRlci4gR2xvYiBwYXR0ZXJucyBhcmVcblx0ICogYWx3YXlzIG1hdGNoZWQgcmVsYXRpdmUgdG8gdGhlIHdhdGNoZWQgZm9sZGVyLlxuXHQgKi9cblx0aW5jbHVkZXM/OiBBcnJheTxzdHJpbmcgfCBJUmVsYXRpdmVQYXR0ZXJuPjtcblxuXHQvKipcblx0ICogSWYgcHJvdmlkZWQsIGFsbG93cyB0byBmaWx0ZXIgdGhlIGV2ZW50cyB0aGF0IHRoZSB3YXRjaGVyIHNob3VsZCBjb25zaWRlclxuXHQgKiBmb3IgZW1pdHRpbmcuIElmIG5vdCBwcm92aWRlZCwgYWxsIGV2ZW50cyBhcmUgZW1pdHRlZC5cblx0ICpcblx0ICogRm9yIGV4YW1wbGUsIHRvIGVtaXQgYWRkZWQgYW5kIHVwZGF0ZWQgZXZlbnRzLCBzZXQgdG86XG5cdCAqIGBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEIHwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEYC5cblx0ICovXG5cdGZpbHRlcj86IEZpbGVDaGFuZ2VGaWx0ZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdhdGNoT3B0aW9ucyBleHRlbmRzIElXYXRjaE9wdGlvbnNXaXRob3V0Q29ycmVsYXRpb24ge1xuXG5cdC8qKlxuXHQgKiBJZiBwcm92aWRlZCwgZmlsZSBjaGFuZ2UgZXZlbnRzIGZyb20gdGhlIHdhdGNoZXIgdGhhdFxuXHQgKiBhcmUgYSByZXN1bHQgb2YgdGhpcyB3YXRjaCByZXF1ZXN0IHdpbGwgY2FycnkgdGhlIHNhbWVcblx0ICogaWQuXG5cdCAqL1xuXHRyZWFkb25seSBjb3JyZWxhdGlvbklkPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBGaWxlQ2hhbmdlRmlsdGVyIHtcblx0VVBEQVRFRCA9IDEgPDwgMSxcblx0QURERUQgPSAxIDw8IDIsXG5cdERFTEVURUQgPSAxIDw8IDNcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2F0Y2hPcHRpb25zV2l0aENvcnJlbGF0aW9uIGV4dGVuZHMgSVdhdGNoT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGNvcnJlbGF0aW9uSWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVdhdGNoZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHdoaWNoIGZpcmVzIG9uIGZpbGUvZm9sZGVyIGNoYW5nZSBvbmx5IGZvciBjaGFuZ2VzXG5cdCAqIHRoYXQgY29ycmVsYXRlIHRvIHRoZSB3YXRjaCByZXF1ZXN0IHdpdGggbWF0Y2hpbmcgY29ycmVsYXRpb25cblx0ICogaWRlbnRpZmllci5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxGaWxlQ2hhbmdlc0V2ZW50Pjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmlsZVN5c3RlbVdhdGNoZXIodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBJRmlsZVN5c3RlbVdhdGNoZXIge1xuXHRjb25zdCBjYW5kaWRhdGUgPSB0aGluZyBhcyBJRmlsZVN5c3RlbVdhdGNoZXIgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuICEhY2FuZGlkYXRlICYmIHR5cGVvZiBjYW5kaWRhdGUub25EaWRDaGFuZ2UgPT09ICdmdW5jdGlvbic7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB7XG5cblx0LyoqXG5cdCAqIE5vIGNhcGFiaWxpdGllcy5cblx0ICovXG5cdE5vbmUgPSAwLFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0cyB1bmJ1ZmZlcmVkIHJlYWQvd3JpdGUuXG5cdCAqL1xuXHRGaWxlUmVhZFdyaXRlID0gMSA8PCAxLFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0cyBvcGVuL3JlYWQvd3JpdGUvY2xvc2UgbG93IGxldmVsIGZpbGUgb3BlcmF0aW9ucy5cblx0ICovXG5cdEZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgPSAxIDw8IDIsXG5cblx0LyoqXG5cdCAqIFByb3ZpZGVyIHN1cHBvcnRzIHN0cmVhbSBiYXNlZCByZWFkaW5nLlxuXHQgKi9cblx0RmlsZVJlYWRTdHJlYW0gPSAxIDw8IDQsXG5cblx0LyoqXG5cdCAqIFByb3ZpZGVyIHN1cHBvcnRzIGNvcHkgb3BlcmF0aW9uLlxuXHQgKi9cblx0RmlsZUZvbGRlckNvcHkgPSAxIDw8IDMsXG5cblx0LyoqXG5cdCAqIFByb3ZpZGVyIGlzIHBhdGggY2FzZSBzZW5zaXRpdmUuXG5cdCAqL1xuXHRQYXRoQ2FzZVNlbnNpdGl2ZSA9IDEgPDwgMTAsXG5cblx0LyoqXG5cdCAqIEFsbCBmaWxlcyBvZiB0aGUgcHJvdmlkZXIgYXJlIHJlYWRvbmx5LlxuXHQgKi9cblx0UmVhZG9ubHkgPSAxIDw8IDExLFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0cyB0byBkZWxldGUgdmlhIHRyYXNoLlxuXHQgKi9cblx0VHJhc2ggPSAxIDw8IDEyLFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0IHRvIHVubG9jayBmaWxlcyBmb3Igd3JpdGluZy5cblx0ICovXG5cdEZpbGVXcml0ZVVubG9jayA9IDEgPDwgMTMsXG5cblx0LyoqXG5cdCAqIFByb3ZpZGVyIHN1cHBvcnQgdG8gcmVhZCBmaWxlcyBhdG9taWNhbGx5LiBUaGlzIGltcGxpZXMgdGhlXG5cdCAqIHByb3ZpZGVyIHByb3ZpZGVzIHRoZSBgRmlsZVJlYWRXcml0ZWAgY2FwYWJpbGl0eSB0b28uXG5cdCAqL1xuXHRGaWxlQXRvbWljUmVhZCA9IDEgPDwgMTQsXG5cblx0LyoqXG5cdCAqIFByb3ZpZGVyIHN1cHBvcnQgdG8gd3JpdGUgZmlsZXMgYXRvbWljYWxseS4gVGhpcyBpbXBsaWVzIHRoZVxuXHQgKiBwcm92aWRlciBwcm92aWRlcyB0aGUgYEZpbGVSZWFkV3JpdGVgIGNhcGFiaWxpdHkgdG9vLlxuXHQgKi9cblx0RmlsZUF0b21pY1dyaXRlID0gMSA8PCAxNSxcblxuXHQvKipcblx0ICogUHJvdmlkZXIgc3VwcG9ydCB0byBkZWxldGUgYXRvbWljYWxseS5cblx0ICovXG5cdEZpbGVBdG9taWNEZWxldGUgPSAxIDw8IDE2LFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0IHRvIGNsb25lIGZpbGVzIGF0b21pY2FsbHkuXG5cdCAqL1xuXHRGaWxlQ2xvbmUgPSAxIDw8IDE3LFxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBzdXBwb3J0IHRvIHJlc29sdmUgcmVhbCBwYXRocy5cblx0ICovXG5cdEZpbGVSZWFscGF0aCA9IDEgPDwgMTgsXG5cblx0LyoqXG5cdCAqIFByb3ZpZGVyIHN1cHBvcnQgdG8gYXBwZW5kIHRvIGZpbGVzLlxuXHQgKi9cblx0RmlsZUFwcGVuZCA9IDEgPDwgMTlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcztcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXM6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmlsZTogRXZlbnQ8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT47XG5cdHJlYWRvbmx5IG9uRGlkV2F0Y2hFcnJvcj86IEV2ZW50PHN0cmluZz47XG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdHM6IElXYXRjaE9wdGlvbnMpOiBJRGlzcG9zYWJsZTtcblxuXHRzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0Pjtcblx0bWtkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD47XG5cdHJlYWRkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8W3N0cmluZywgRmlsZVR5cGVdW10+O1xuXHRkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblxuXHRyZW5hbWUoZnJvbTogVVJJLCB0bzogVVJJLCBvcHRzOiBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRjb3B5Pyhmcm9tOiBVUkksIHRvOiBVUkksIG9wdHM6IElGaWxlT3ZlcndyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cblx0cmVhZEZpbGU/KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+O1xuXHR3cml0ZUZpbGU/KHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdHM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblxuXHRyZWFkRmlsZVN0cmVhbT8ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT47XG5cblx0b3Blbj8ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVPcGVuT3B0aW9ucyk6IFByb21pc2U8bnVtYmVyPjtcblx0Y2xvc2U/KGZkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWFkPyhmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+O1xuXHR3cml0ZT8oZmQ6IG51bWJlciwgcG9zOiBudW1iZXIsIGRhdGE6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPjtcblxuXHRjbG9uZUZpbGU/KGZyb206IFVSSSwgdG86IFVSSSk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRyZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5Pjtcblx0d3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdHM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1JlYWRXcml0ZUNhcGFiaWxpdHkocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiBwcm92aWRlciBpcyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5IHtcblx0cmV0dXJuICEhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0ZpbGVBcHBlbmRDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUFwcGVuZCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlRm9sZGVyQ29weUNhcGFiaWxpdHkgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0Y29weShmcm9tOiBVUkksIHRvOiBVUkksIG9wdHM6IElGaWxlT3ZlcndyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNGaWxlRm9sZGVyQ29weUNhcGFiaWxpdHkocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiBwcm92aWRlciBpcyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVGb2xkZXJDb3B5Q2FwYWJpbGl0eSB7XG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUZvbGRlckNvcHkpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUNsb25lQ2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRjbG9uZUZpbGUoZnJvbTogVVJJLCB0bzogVVJJKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0ZpbGVDbG9uZUNhcGFiaWxpdHkocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiBwcm92aWRlciBpcyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVDbG9uZUNhcGFiaWxpdHkge1xuXHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVDbG9uZSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhbHBhdGhDYXBhYmlsaXR5IGV4dGVuZHMgSUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdHJlYWxwYXRoKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHN0cmluZz47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNGaWxlUmVhbHBhdGhDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhbHBhdGhDYXBhYmlsaXR5IHtcblx0cmV0dXJuICEhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhbHBhdGgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRvcGVuKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlT3Blbk9wdGlvbnMpOiBQcm9taXNlPG51bWJlcj47XG5cdGNsb3NlKGZkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWFkKGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj47XG5cdHdyaXRlKGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5IHtcblx0cmV0dXJuICEhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRyZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxVaW50OEFycmF5Pjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0ZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IHByb3ZpZGVyIGlzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5IHtcblx0cmV0dXJuICEhKHByb3ZpZGVyLmNhcGFiaWxpdGllcyAmIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljUmVhZENhcGFiaWxpdHkgZXh0ZW5kcyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0cmVhZEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0cz86IElGaWxlQXRvbWljUmVhZE9wdGlvbnMpOiBQcm9taXNlPFVpbnQ4QXJyYXk+O1xuXHRlbmZvcmNlQXRvbWljUmVhZEZpbGU/KHJlc291cmNlOiBVUkkpOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljUmVhZENhcGFiaWxpdHkge1xuXHRpZiAoIWhhc1JlYWRXcml0ZUNhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSByZXF1aXJlIHRoZSBgRmlsZVJlYWRXcml0ZWAgY2FwYWJpbGl0eSB0b29cblx0fVxuXG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1JlYWQpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1dyaXRlQ2FwYWJpbGl0eSBleHRlbmRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHR3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudHM6IFVpbnQ4QXJyYXksIG9wdHM/OiBJRmlsZUF0b21pY1dyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdGVuZm9yY2VBdG9taWNXcml0ZUZpbGU/KHJlc291cmNlOiBVUkkpOiBJRmlsZUF0b21pY09wdGlvbnMgfCBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0ZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHkocHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIpOiBwcm92aWRlciBpcyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHkge1xuXHRpZiAoIWhhc1JlYWRXcml0ZUNhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSByZXF1aXJlIHRoZSBgRmlsZVJlYWRXcml0ZWAgY2FwYWJpbGl0eSB0b29cblx0fVxuXG5cdHJldHVybiAhIShwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNEZWxldGVDYXBhYmlsaXR5IGV4dGVuZHMgSUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdGRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZUF0b21pY0RlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRlbmZvcmNlQXRvbWljRGVsZXRlPyhyZXNvdXJjZTogVVJJKTogSUZpbGVBdG9taWNPcHRpb25zIHwgZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNGaWxlQXRvbWljRGVsZXRlQ2FwYWJpbGl0eShwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcik6IHByb3ZpZGVyIGlzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY0RlbGV0ZUNhcGFiaWxpdHkge1xuXHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNEZWxldGUpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoUmVhZG9ubHlDYXBhYmlsaXR5IGV4dGVuZHMgSUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXM7XG5cblx0LyoqXG5cdCAqIEFuIG9wdGlvbmFsIG1lc3NhZ2UgdG8gc2hvdyBpbiB0aGUgVUkgdG8gZXhwbGFpbiB3aHkgdGhlIGZpbGUgc3lzdGVtIGlzIHJlYWRvbmx5LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVhZE9ubHlNZXNzYWdlPzogSU1hcmtkb3duU3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzUmVhZG9ubHlDYXBhYmlsaXR5KHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKTogcHJvdmlkZXIgaXMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhSZWFkb25seUNhcGFiaWxpdHkge1xuXHRyZXR1cm4gISEocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KTtcbn1cblxuZXhwb3J0IGVudW0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlIHtcblx0RmlsZUV4aXN0cyA9ICdFbnRyeUV4aXN0cycsXG5cdEZpbGVOb3RGb3VuZCA9ICdFbnRyeU5vdEZvdW5kJyxcblx0RmlsZU5vdEFEaXJlY3RvcnkgPSAnRW50cnlOb3RBRGlyZWN0b3J5Jyxcblx0RmlsZUlzQURpcmVjdG9yeSA9ICdFbnRyeUlzQURpcmVjdG9yeScsXG5cdEZpbGVFeGNlZWRzU3RvcmFnZVF1b3RhID0gJ0VudHJ5RXhjZWVkc1N0b3JhZ2VRdW90YScsXG5cdEZpbGVUb29MYXJnZSA9ICdFbnRyeVRvb0xhcmdlJyxcblx0RmlsZVdyaXRlTG9ja2VkID0gJ0VudHJ5V3JpdGVMb2NrZWQnLFxuXHROb1Blcm1pc3Npb25zID0gJ05vUGVybWlzc2lvbnMnLFxuXHRVbmF2YWlsYWJsZSA9ICdVbmF2YWlsYWJsZScsXG5cdFVua25vd24gPSAnVW5rbm93bidcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgY29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlO1xufVxuXG5leHBvcnQgY2xhc3MgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IgZXh0ZW5kcyBFcnJvciBpbXBsZW1lbnRzIElGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciB7XG5cblx0c3RhdGljIGNyZWF0ZShlcnJvcjogRXJyb3IgfCBzdHJpbmcsIGNvZGU6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSk6IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIHtcblx0XHRjb25zdCBwcm92aWRlckVycm9yID0gbmV3IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yLnRvU3RyaW5nKCksIGNvZGUpO1xuXHRcdG1hcmtBc0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHByb3ZpZGVyRXJyb3IsIGNvZGUpO1xuXG5cdFx0cmV0dXJuIHByb3ZpZGVyRXJyb3I7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgcmVhZG9ubHkgY29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yOiBFcnJvciB8IHN0cmluZywgY29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3Ige1xuXHRyZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IuY3JlYXRlKGVycm9yLCBjb2RlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yPzogRXJyb3IpOiBFcnJvciB7XG5cdGlmICghZXJyb3IpIHtcblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IobG9jYWxpemUoJ3Vua25vd25FcnJvcicsIFwiVW5rbm93biBFcnJvclwiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVua25vd24pOyAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzI3OThcblx0fVxuXG5cdHJldHVybiBlcnJvcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcmtBc0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yOiBFcnJvciwgY29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKTogRXJyb3Ige1xuXHRlcnJvci5uYW1lID0gY29kZSA/IGAke2NvZGV9IChGaWxlU3lzdGVtRXJyb3IpYCA6IGBGaWxlU3lzdGVtRXJyb3JgO1xuXG5cdHJldHVybiBlcnJvcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCB8IG51bGwpOiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUge1xuXG5cdC8vIEd1YXJkIGFnYWluc3QgYWJ1c2Vcblx0aWYgKCFlcnJvcikge1xuXHRcdHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bjtcblx0fVxuXG5cdC8vIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIGNvbWVzIHdpdGggdGhlIGNvZGVcblx0aWYgKGVycm9yIGluc3RhbmNlb2YgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IpIHtcblx0XHRyZXR1cm4gZXJyb3IuY29kZTtcblx0fVxuXG5cdC8vIEFueSBvdGhlciBlcnJvciwgY2hlY2sgZm9yIG5hbWUgbWF0Y2ggYnkgYXNzdW1pbmcgdGhhdCB0aGUgZXJyb3Jcblx0Ly8gd2VudCB0aHJvdWdoIHRoZSBtYXJrQXNGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcigpIG1ldGhvZFxuXHRjb25zdCBtYXRjaCA9IC9eKC4rKSBcXChGaWxlU3lzdGVtRXJyb3JcXCkkLy5leGVjKGVycm9yLm5hbWUpO1xuXHRpZiAoIW1hdGNoKSB7XG5cdFx0cmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Vbmtub3duO1xuXHR9XG5cblx0c3dpdGNoIChtYXRjaFsxXSkge1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHM6IHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cztcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlSXNBRGlyZWN0b3J5OiByZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVJc0FEaXJlY3Rvcnk7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEFEaXJlY3Rvcnk6IHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEFEaXJlY3Rvcnk7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kOiByZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZDtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlVG9vTGFyZ2U6IHJldHVybiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZVRvb0xhcmdlO1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVXcml0ZUxvY2tlZDogcmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlV3JpdGVMb2NrZWQ7XG5cdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9uczogcmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zO1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlOiByZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlO1xuXHR9XG5cblx0cmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Vbmtub3duO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yOiBFcnJvcik6IEZpbGVPcGVyYXRpb25SZXN1bHQge1xuXG5cdC8vIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIGNvbWVzIHdpdGggdGhlIHJlc3VsdCBhbHJlYWR5XG5cdGlmIChlcnJvciBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvcikge1xuXHRcdHJldHVybiBlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0O1xuXHR9XG5cblx0Ly8gT3RoZXJ3aXNlIHRyeSB0byBmaW5kIGZyb20gY29kZVxuXHRzd2l0Y2ggKHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycm9yKSkge1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZDpcblx0XHRcdHJldHVybiBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EO1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVJc0FEaXJlY3Rvcnk6XG5cdFx0XHRyZXR1cm4gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lTX0RJUkVDVE9SWTtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90QURpcmVjdG9yeTpcblx0XHRcdHJldHVybiBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0RJUkVDVE9SWTtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlV3JpdGVMb2NrZWQ6XG5cdFx0XHRyZXR1cm4gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1dSSVRFX0xPQ0tFRDtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zOlxuXHRcdFx0cmV0dXJuIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRDtcblx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlRXhpc3RzOlxuXHRcdFx0cmV0dXJuIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUO1xuXHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVUb29MYXJnZTpcblx0XHRcdHJldHVybiBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX09USEVSX0VSUk9SO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50IHtcblx0cmVhZG9ubHkgYWRkZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNjaGVtZTogc3RyaW5nO1xuXHRyZWFkb25seSBwcm92aWRlcj86IElGaWxlU3lzdGVtUHJvdmlkZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgcHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXI7XG5cdHJlYWRvbmx5IHNjaGVtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3lzdGVtUHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQge1xuXHRyZWFkb25seSBzY2hlbWU6IHN0cmluZztcblx0am9pbihwcm9taXNlOiBQcm9taXNlPHZvaWQ+KTogdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRmlsZU9wZXJhdGlvbiB7XG5cdENSRUFURSxcblx0REVMRVRFLFxuXHRNT1ZFLFxuXHRDT1BZLFxuXHRXUklURVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlT3BlcmF0aW9uRXZlbnQge1xuXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IG9wZXJhdGlvbjogRmlsZU9wZXJhdGlvbjtcblxuXHRpc09wZXJhdGlvbihvcGVyYXRpb246IEZpbGVPcGVyYXRpb24uREVMRVRFIHwgRmlsZU9wZXJhdGlvbi5XUklURSk6IGJvb2xlYW47XG5cdGlzT3BlcmF0aW9uKG9wZXJhdGlvbjogRmlsZU9wZXJhdGlvbi5DUkVBVEUgfCBGaWxlT3BlcmF0aW9uLk1PVkUgfCBGaWxlT3BlcmF0aW9uLkNPUFkpOiB0aGlzIGlzIElGaWxlT3BlcmF0aW9uRXZlbnRXaXRoTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVPcGVyYXRpb25FdmVudFdpdGhNZXRhZGF0YSBleHRlbmRzIElGaWxlT3BlcmF0aW9uRXZlbnQge1xuXHRyZWFkb25seSB0YXJnZXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVPcGVyYXRpb25FdmVudCBpbXBsZW1lbnRzIElGaWxlT3BlcmF0aW9uRXZlbnQge1xuXG5cdGNvbnN0cnVjdG9yKHJlc291cmNlOiBVUkksIG9wZXJhdGlvbjogRmlsZU9wZXJhdGlvbi5ERUxFVEUgfCBGaWxlT3BlcmF0aW9uLldSSVRFKTtcblx0Y29uc3RydWN0b3IocmVzb3VyY2U6IFVSSSwgb3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uLkNSRUFURSB8IEZpbGVPcGVyYXRpb24uTU9WRSB8IEZpbGVPcGVyYXRpb24uQ09QWSwgdGFyZ2V0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEpO1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSByZXNvdXJjZTogVVJJLCByZWFkb25seSBvcGVyYXRpb246IEZpbGVPcGVyYXRpb24sIHJlYWRvbmx5IHRhcmdldD86IElGaWxlU3RhdFdpdGhNZXRhZGF0YSkgeyB9XG5cblx0aXNPcGVyYXRpb24ob3BlcmF0aW9uOiBGaWxlT3BlcmF0aW9uLkRFTEVURSB8IEZpbGVPcGVyYXRpb24uV1JJVEUpOiBib29sZWFuO1xuXHRpc09wZXJhdGlvbihvcGVyYXRpb246IEZpbGVPcGVyYXRpb24uQ1JFQVRFIHwgRmlsZU9wZXJhdGlvbi5NT1ZFIHwgRmlsZU9wZXJhdGlvbi5DT1BZKTogdGhpcyBpcyBJRmlsZU9wZXJhdGlvbkV2ZW50V2l0aE1ldGFkYXRhO1xuXHRpc09wZXJhdGlvbihvcGVyYXRpb246IEZpbGVPcGVyYXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vcGVyYXRpb24gPT09IG9wZXJhdGlvbjtcblx0fVxufVxuXG4vKipcbiAqIFBvc3NpYmxlIGNoYW5nZXMgdGhhdCBjYW4gb2NjdXIgdG8gYSBmaWxlLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBGaWxlQ2hhbmdlVHlwZSB7XG5cdFVQREFURUQsXG5cdEFEREVELFxuXHRERUxFVEVEXG59XG5cbi8qKlxuICogSWRlbnRpZmllcyBhIHNpbmdsZSBjaGFuZ2UgaW4gYSBmaWxlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlQ2hhbmdlIHtcblxuXHQvKipcblx0ICogVGhlIHR5cGUgb2YgY2hhbmdlIHRoYXQgb2NjdXJyZWQgdG8gdGhlIGZpbGUuXG5cdCAqL1xuXHR0eXBlOiBGaWxlQ2hhbmdlVHlwZTtcblxuXHQvKipcblx0ICogVGhlIHVuaWZpZWQgcmVzb3VyY2UgaWRlbnRpZmllciBvZiB0aGUgZmlsZSB0aGF0IGNoYW5nZWQuXG5cdCAqL1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXG5cdC8qKlxuXHQgKiBJZiBwcm92aWRlZCB3aGVuIHN0YXJ0aW5nIHRoZSBmaWxlIHdhdGNoZXIsIHRoZSBjb3JyZWxhdGlvblxuXHQgKiBpZGVudGlmaWVyIHdpbGwgbWF0Y2ggdGhlIG9yaWdpbmFsIGZpbGUgd2F0Y2hpbmcgcmVxdWVzdCBhc1xuXHQgKiBhIHdheSB0byBpZGVudGlmeSB0aGUgb3JpZ2luYWwgY29tcG9uZW50IHRoYXQgaXMgaW50ZXJlc3RlZFxuXHQgKiBpbiB0aGUgY2hhbmdlLlxuXHQgKi9cblx0cmVhZG9ubHkgY0lkPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgRmlsZUNoYW5nZXNFdmVudCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUlYRURfQ09SUkVMQVRJT04gPSBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29ycmVsYXRpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkIHwgdHlwZW9mIEZpbGVDaGFuZ2VzRXZlbnQuTUlYRURfQ09SUkVMQVRJT04gPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoY2hhbmdlczogcmVhZG9ubHkgSUZpbGVDaGFuZ2VbXSwgcHJpdmF0ZSByZWFkb25seSBpZ25vcmVQYXRoQ2FzaW5nOiBib29sZWFuKSB7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXG5cdFx0XHQvLyBTcGxpdCBieSB0eXBlXG5cdFx0XHRzd2l0Y2ggKGNoYW5nZS50eXBlKSB7XG5cdFx0XHRcdGNhc2UgRmlsZUNoYW5nZVR5cGUuQURERUQ6XG5cdFx0XHRcdFx0dGhpcy5yYXdBZGRlZC5wdXNoKGNoYW5nZS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRDpcblx0XHRcdFx0XHR0aGlzLnJhd1VwZGF0ZWQucHVzaChjaGFuZ2UucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQ6XG5cdFx0XHRcdFx0dGhpcy5yYXdEZWxldGVkLnB1c2goY2hhbmdlLnJlc291cmNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlndXJlIG91dCBldmVudHMgY29ycmVsYXRpb25cblx0XHRcdGlmICh0aGlzLmNvcnJlbGF0aW9uSWQgIT09IEZpbGVDaGFuZ2VzRXZlbnQuTUlYRURfQ09SUkVMQVRJT04pIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjaGFuZ2UuY0lkID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGlmICh0aGlzLmNvcnJlbGF0aW9uSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5jb3JyZWxhdGlvbklkID0gY2hhbmdlLmNJZDsgXHRcdFx0XHRcdFx0XHQvLyBjb3JyZWxhdGlvbiBub3QgeWV0IHNldCwganVzdCB0YWtlIGl0XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmNvcnJlbGF0aW9uSWQgIT09IGNoYW5nZS5jSWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29ycmVsYXRpb25JZCA9IEZpbGVDaGFuZ2VzRXZlbnQuTUlYRURfQ09SUkVMQVRJT047XHQvLyBjb3JyZWxhdGlvbiBtaXNtYXRjaCwgd2UgaGF2ZSBtaXhlZCBjb3JyZWxhdGlvblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAodGhpcy5jb3JyZWxhdGlvbklkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29ycmVsYXRpb25JZCA9IEZpbGVDaGFuZ2VzRXZlbnQuTUlYRURfQ09SUkVMQVRJT047XHQvLyBjb3JyZWxhdGlvbiBtaXNtYXRjaCwgd2UgaGF2ZSBtaXhlZCBjb3JyZWxhdGlvblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWRkZWQgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0Y29uc3QgYWRkZWQgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzPGJvb2xlYW4+KCgpID0+IHRoaXMuaWdub3JlUGF0aENhc2luZyk7XG5cdFx0YWRkZWQuZmlsbCh0aGlzLnJhd0FkZGVkLm1hcChyZXNvdXJjZSA9PiBbcmVzb3VyY2UsIHRydWVdKSk7XG5cblx0XHRyZXR1cm4gYWRkZWQ7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlZCA9IG5ldyBMYXp5KCgpID0+IHtcblx0XHRjb25zdCB1cGRhdGVkID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpczxib29sZWFuPigoKSA9PiB0aGlzLmlnbm9yZVBhdGhDYXNpbmcpO1xuXHRcdHVwZGF0ZWQuZmlsbCh0aGlzLnJhd1VwZGF0ZWQubWFwKHJlc291cmNlID0+IFtyZXNvdXJjZSwgdHJ1ZV0pKTtcblxuXHRcdHJldHVybiB1cGRhdGVkO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGV0ZWQgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0Y29uc3QgZGVsZXRlZCA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8Ym9vbGVhbj4oKCkgPT4gdGhpcy5pZ25vcmVQYXRoQ2FzaW5nKTtcblx0XHRkZWxldGVkLmZpbGwodGhpcy5yYXdEZWxldGVkLm1hcChyZXNvdXJjZSA9PiBbcmVzb3VyY2UsIHRydWVdKSk7XG5cblx0XHRyZXR1cm4gZGVsZXRlZDtcblx0fSk7XG5cblx0LyoqXG5cdCAqIEZpbmQgb3V0IGlmIHRoZSBmaWxlIGNoYW5nZSBldmVudHMgbWF0Y2ggdGhlIHByb3ZpZGVkIHJlc291cmNlLlxuXHQgKlxuXHQgKiBOb3RlOiB3aGVuIHBhc3NpbmcgYEZpbGVDaGFuZ2VUeXBlLkRFTEVURURgLCB3ZSBjb25zaWRlciBhIG1hdGNoXG5cdCAqIGFsc28gd2hlbiB0aGUgcGFyZW50IG9mIHRoZSByZXNvdXJjZSBnb3QgZGVsZXRlZC5cblx0ICovXG5cdGNvbnRhaW5zKHJlc291cmNlOiBVUkksIC4uLnR5cGVzOiBGaWxlQ2hhbmdlVHlwZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9Db250YWlucyhyZXNvdXJjZSwgeyBpbmNsdWRlQ2hpbGRyZW46IGZhbHNlIH0sIC4uLnR5cGVzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIG91dCBpZiB0aGUgZmlsZSBjaGFuZ2UgZXZlbnRzIGVpdGhlciBtYXRjaCB0aGUgcHJvdmlkZWRcblx0ICogcmVzb3VyY2UsIG9yIGNvbnRhaW4gYSBjaGlsZCBvZiB0aGlzIHJlc291cmNlLlxuXHQgKi9cblx0YWZmZWN0cyhyZXNvdXJjZTogVVJJLCAuLi50eXBlczogRmlsZUNoYW5nZVR5cGVbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ29udGFpbnMocmVzb3VyY2UsIHsgaW5jbHVkZUNoaWxkcmVuOiB0cnVlIH0sIC4uLnR5cGVzKTtcblx0fVxuXG5cdHByaXZhdGUgZG9Db250YWlucyhyZXNvdXJjZTogVVJJLCBvcHRpb25zOiB7IGluY2x1ZGVDaGlsZHJlbjogYm9vbGVhbiB9LCAuLi50eXBlczogRmlsZUNoYW5nZVR5cGVbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNUeXBlc0ZpbHRlciA9IHR5cGVzLmxlbmd0aCA+IDA7XG5cblx0XHQvLyBBZGRlZFxuXHRcdGlmICghaGFzVHlwZXNGaWx0ZXIgfHwgdHlwZXMuaW5jbHVkZXMoRmlsZUNoYW5nZVR5cGUuQURERUQpKSB7XG5cdFx0XHRpZiAodGhpcy5hZGRlZC52YWx1ZS5nZXQocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9ucy5pbmNsdWRlQ2hpbGRyZW4gJiYgdGhpcy5hZGRlZC52YWx1ZS5maW5kU3VwZXJzdHIocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZWRcblx0XHRpZiAoIWhhc1R5cGVzRmlsdGVyIHx8IHR5cGVzLmluY2x1ZGVzKEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKSB7XG5cdFx0XHRpZiAodGhpcy51cGRhdGVkLnZhbHVlLmdldChyZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvcHRpb25zLmluY2x1ZGVDaGlsZHJlbiAmJiB0aGlzLnVwZGF0ZWQudmFsdWUuZmluZFN1cGVyc3RyKHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZWxldGVkXG5cdFx0aWYgKCFoYXNUeXBlc0ZpbHRlciB8fCB0eXBlcy5pbmNsdWRlcyhGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSkge1xuXHRcdFx0aWYgKHRoaXMuZGVsZXRlZC52YWx1ZS5maW5kU3Vic3RyKHJlc291cmNlKSAvKiBkZWxldGVkIGFsc28gY29uc2lkZXJzIHBhcmVudCBmb2xkZXJzICovKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9ucy5pbmNsdWRlQ2hpbGRyZW4gJiYgdGhpcy5kZWxldGVkLnZhbHVlLmZpbmRTdXBlcnN0cihyZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWYgdGhpcyBldmVudCBjb250YWlucyBhZGRlZCBmaWxlcy5cblx0ICovXG5cdGdvdEFkZGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJhd0FkZGVkLmxlbmd0aCA+IDA7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBpZiB0aGlzIGV2ZW50IGNvbnRhaW5zIGRlbGV0ZWQgZmlsZXMuXG5cdCAqL1xuXHRnb3REZWxldGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJhd0RlbGV0ZWQubGVuZ3RoID4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGlmIHRoaXMgZXZlbnQgY29udGFpbnMgdXBkYXRlZCBmaWxlcy5cblx0ICovXG5cdGdvdFVwZGF0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmF3VXBkYXRlZC5sZW5ndGggPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWYgdGhpcyBldmVudCBjb250YWlucyBjaGFuZ2VzIHRoYXQgY29ycmVsYXRlIHRvIHRoZVxuXHQgKiBwcm92aWRlZCBgY29ycmVsYXRpb25JZGAuXG5cdCAqXG5cdCAqIEZpbGUgY2hhbmdlIGV2ZW50IGNvcnJlbGF0aW9uIGlzIGFuIGFkdmFuY2VkIHdhdGNoIGZlYXR1cmUgdGhhdFxuXHQgKiBhbGxvd3MgdG8gIGlkZW50aWZ5IGZyb20gd2hpY2ggd2F0Y2ggcmVxdWVzdCB0aGUgZXZlbnRzIG9yaWdpbmF0ZVxuXHQgKiBmcm9tLiBUaGlzIGNvcnJlbGF0aW9uIGFsbG93cyB0byByb3V0ZSBldmVudHMgc3BlY2lmaWNhbGx5XG5cdCAqIG9ubHkgdG8gdGhlIHJlcXVlc3RvciBhbmQgbm90IGVtaXQgdGhlbSB0byBhbGwgbGlzdGVuZXJzLlxuXHQgKi9cblx0Y29ycmVsYXRlcyhjb3JyZWxhdGlvbklkOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb3JyZWxhdGlvbklkID09PSBjb3JyZWxhdGlvbklkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpZ3VyZSBvdXQgaWYgdGhlIGV2ZW50IGNvbnRhaW5zIGNoYW5nZXMgdGhhdCBjb3JyZWxhdGUgdG8gb25lXG5cdCAqIGNvcnJlbGF0aW9uIGlkZW50aWZpZXIuXG5cdCAqXG5cdCAqIEZpbGUgY2hhbmdlIGV2ZW50IGNvcnJlbGF0aW9uIGlzIGFuIGFkdmFuY2VkIHdhdGNoIGZlYXR1cmUgdGhhdFxuXHQgKiBhbGxvd3MgdG8gIGlkZW50aWZ5IGZyb20gd2hpY2ggd2F0Y2ggcmVxdWVzdCB0aGUgZXZlbnRzIG9yaWdpbmF0ZVxuXHQgKiBmcm9tLiBUaGlzIGNvcnJlbGF0aW9uIGFsbG93cyB0byByb3V0ZSBldmVudHMgc3BlY2lmaWNhbGx5XG5cdCAqIG9ubHkgdG8gdGhlIHJlcXVlc3RvciBhbmQgbm90IGVtaXQgdGhlbSB0byBhbGwgbGlzdGVuZXJzLlxuXHQgKi9cblx0aGFzQ29ycmVsYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGlzLmNvcnJlbGF0aW9uSWQgPT09ICdudW1iZXInO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIHVzZSB0aGUgYGNvbnRhaW5zYCBvciBgYWZmZWN0c2AgbWV0aG9kIHRvIGVmZmljaWVudGx5IGZpbmRcblx0ICogb3V0IGlmIHRoZSBldmVudCByZWxhdGVzIHRvIGEgZ2l2ZW4gcmVzb3VyY2UuIHRoZXNlIG1ldGhvZHMgZW5zdXJlOlxuXHQgKiAtIHRoYXQgdGhlcmUgaXMgbm8gZXhwZW5zaXZlIGxvb2t1cCBuZWVkZWQgKGJ5IHVzaW5nIGEgYFRlcm5hcnlTZWFyY2hUcmVlYClcblx0ICogLSBjb3JyZWN0bHkgaGFuZGxlcyBgRmlsZUNoYW5nZVR5cGUuREVMRVRFRGAgZXZlbnRzXG5cdCAqL1xuXHRyZWFkb25seSByYXdBZGRlZDogVVJJW10gPSBbXTtcblxuXHQvKipcblx0KiBAZGVwcmVjYXRlZCB1c2UgdGhlIGBjb250YWluc2Agb3IgYGFmZmVjdHNgIG1ldGhvZCB0byBlZmZpY2llbnRseSBmaW5kXG5cdCogb3V0IGlmIHRoZSBldmVudCByZWxhdGVzIHRvIGEgZ2l2ZW4gcmVzb3VyY2UuIHRoZXNlIG1ldGhvZHMgZW5zdXJlOlxuXHQqIC0gdGhhdCB0aGVyZSBpcyBubyBleHBlbnNpdmUgbG9va3VwIG5lZWRlZCAoYnkgdXNpbmcgYSBgVGVybmFyeVNlYXJjaFRyZWVgKVxuXHQqIC0gY29ycmVjdGx5IGhhbmRsZXMgYEZpbGVDaGFuZ2VUeXBlLkRFTEVURURgIGV2ZW50c1xuXHQqL1xuXHRyZWFkb25seSByYXdVcGRhdGVkOiBVUklbXSA9IFtdO1xuXG5cdC8qKlxuXHQqIEBkZXByZWNhdGVkIHVzZSB0aGUgYGNvbnRhaW5zYCBvciBgYWZmZWN0c2AgbWV0aG9kIHRvIGVmZmljaWVudGx5IGZpbmRcblx0KiBvdXQgaWYgdGhlIGV2ZW50IHJlbGF0ZXMgdG8gYSBnaXZlbiByZXNvdXJjZS4gdGhlc2UgbWV0aG9kcyBlbnN1cmU6XG5cdCogLSB0aGF0IHRoZXJlIGlzIG5vIGV4cGVuc2l2ZSBsb29rdXAgbmVlZGVkIChieSB1c2luZyBhIGBUZXJuYXJ5U2VhcmNoVHJlZWApXG5cdCogLSBjb3JyZWN0bHkgaGFuZGxlcyBgRmlsZUNoYW5nZVR5cGUuREVMRVRFRGAgZXZlbnRzXG5cdCovXG5cdHJlYWRvbmx5IHJhd0RlbGV0ZWQ6IFVSSVtdID0gW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1BhcmVudChwYXRoOiBzdHJpbmcsIGNhbmRpZGF0ZTogc3RyaW5nLCBpZ25vcmVDYXNlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRpZiAoIXBhdGggfHwgIWNhbmRpZGF0ZSB8fCBwYXRoID09PSBjYW5kaWRhdGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoY2FuZGlkYXRlLmxlbmd0aCA+IHBhdGgubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGNhbmRpZGF0ZS5jaGFyQXQoY2FuZGlkYXRlLmxlbmd0aCAtIDEpICE9PSBzZXApIHtcblx0XHRjYW5kaWRhdGUgKz0gc2VwO1xuXHR9XG5cblx0aWYgKGlnbm9yZUNhc2UpIHtcblx0XHRyZXR1cm4gc3RhcnRzV2l0aElnbm9yZUNhc2UocGF0aCwgY2FuZGlkYXRlKTtcblx0fVxuXG5cdHJldHVybiBwYXRoLmluZGV4T2YoY2FuZGlkYXRlKSA9PT0gMDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQmFzZUZpbGVTdGF0IHtcblxuXHQvKipcblx0ICogVGhlIHVuaWZpZWQgcmVzb3VyY2UgaWRlbnRpZmllciBvZiB0aGlzIGZpbGUgb3IgZm9sZGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblxuXHQvKipcblx0ICogVGhlIG5hbWUgd2hpY2ggaXMgdGhlIGxhc3Qgc2VnbWVudFxuXHQgKiBvZiB0aGUge3twYXRofX0uXG5cdCAqL1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBzaXplIG9mIHRoZSBmaWxlLlxuXHQgKlxuXHQgKiBUaGUgdmFsdWUgbWF5IG9yIG1heSBub3QgYmUgcmVzb2x2ZWQgYXNcblx0ICogaXQgaXMgb3B0aW9uYWwuXG5cdCAqL1xuXHRyZWFkb25seSBzaXplPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgbGFzdCBtb2RpZmljYXRpb24gZGF0ZSByZXByZXNlbnRlZCBhcyBtaWxsaXMgZnJvbSB1bml4IGVwb2NoLlxuXHQgKlxuXHQgKiBUaGUgdmFsdWUgbWF5IG9yIG1heSBub3QgYmUgcmVzb2x2ZWQgYXNcblx0ICogaXQgaXMgb3B0aW9uYWwuXG5cdCAqL1xuXHRyZWFkb25seSBtdGltZT86IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIGNyZWF0aW9uIGRhdGUgcmVwcmVzZW50ZWQgYXMgbWlsbGlzIGZyb20gdW5peCBlcG9jaC5cblx0ICpcblx0ICogVGhlIHZhbHVlIG1heSBvciBtYXkgbm90IGJlIHJlc29sdmVkIGFzXG5cdCAqIGl0IGlzIG9wdGlvbmFsLlxuXHQgKi9cblx0cmVhZG9ubHkgY3RpbWU/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEEgdW5pcXVlIGlkZW50aWZpZXIgdGhhdCByZXByZXNlbnRzIHRoZVxuXHQgKiBjdXJyZW50IHN0YXRlIG9mIHRoZSBmaWxlIG9yIGRpcmVjdG9yeS5cblx0ICpcblx0ICogVGhlIHZhbHVlIG1heSBvciBtYXkgbm90IGJlIHJlc29sdmVkIGFzXG5cdCAqIGl0IGlzIG9wdGlvbmFsLlxuXHQgKi9cblx0cmVhZG9ubHkgZXRhZz86IHN0cmluZztcblxuXHQvKipcblx0ICogRmlsZSBpcyByZWFkb25seS4gQ29tcG9uZW50cyBsaWtlIGVkaXRvcnMgc2hvdWxkIG5vdFxuXHQgKiBvZmZlciB0byBlZGl0IHRoZSBjb250ZW50cy5cblx0ICovXG5cdHJlYWRvbmx5IHJlYWRvbmx5PzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRmlsZSBpcyBsb2NrZWQuIENvbXBvbmVudHMgbGlrZSBlZGl0b3JzIHNob3VsZCBvZmZlclxuXHQgKiB0byBlZGl0IHRoZSBjb250ZW50cyBhbmQgYXNrIHRoZSB1c2VyIHVwb24gc2F2aW5nIHRvXG5cdCAqIHJlbW92ZSB0aGUgbG9jay5cblx0ICovXG5cdHJlYWRvbmx5IGxvY2tlZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZpbGUgaXMgZXhlY3V0YWJsZS4gUmVsZXZhbnQgZm9yIFVuaXgtbGlrZSBzeXN0ZW1zIHdoZXJlXG5cdCAqIHRoZSBleGVjdXRhYmxlIGJpdCBkZXRlcm1pbmVzIGlmIGEgZmlsZSBjYW4gYmUgcnVuLlxuXHQgKi9cblx0cmVhZG9ubHkgZXhlY3V0YWJsZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhc2VGaWxlU3RhdFdpdGhNZXRhZGF0YSBleHRlbmRzIFJlcXVpcmVkPElCYXNlRmlsZVN0YXQ+IHsgfVxuXG4vKipcbiAqIEEgZmlsZSByZXNvdXJjZSB3aXRoIG1ldGEgaW5mb3JtYXRpb24gYW5kIHJlc29sdmVkIGNoaWxkcmVuIGlmIGFueS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN0YXQgZXh0ZW5kcyBJQmFzZUZpbGVTdGF0IHtcblxuXHQvKipcblx0ICogVGhlIHJlc291cmNlIGlzIGEgZmlsZS5cblx0ICovXG5cdHJlYWRvbmx5IGlzRmlsZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIHJlc291cmNlIGlzIGEgZGlyZWN0b3J5LlxuXHQgKi9cblx0cmVhZG9ubHkgaXNEaXJlY3Rvcnk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSByZXNvdXJjZSBpcyBhIHN5bWJvbGljIGxpbmsuIE5vdGU6IGV2ZW4gd2hlbiB0aGVcblx0ICogZmlsZSBpcyBhIHN5bWJvbGljIGxpbmssIHlvdSBjYW4gdGVzdCBmb3IgYEZpbGVUeXBlLkZpbGVgXG5cdCAqIGFuZCBgRmlsZVR5cGUuRGlyZWN0b3J5YCB0byBrbm93IHRoZSB0eXBlIG9mIHRoZSB0YXJnZXRcblx0ICogdGhlIGxpbmsgcG9pbnRzIHRvLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNTeW1ib2xpY0xpbms6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBjaGlsZHJlbiBvZiB0aGUgZmlsZSBzdGF0IG9yIHVuZGVmaW5lZCBpZiBub25lLlxuXHQgKi9cblx0Y2hpbGRyZW46IElGaWxlU3RhdFtdIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3RhdFdpdGhNZXRhZGF0YSBleHRlbmRzIElGaWxlU3RhdCwgSUJhc2VGaWxlU3RhdFdpdGhNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IG10aW1lOiBudW1iZXI7XG5cdHJlYWRvbmx5IGN0aW1lOiBudW1iZXI7XG5cdHJlYWRvbmx5IGV0YWc6IHN0cmluZztcblx0cmVhZG9ubHkgc2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSByZWFkb25seTogYm9vbGVhbjtcblx0cmVhZG9ubHkgbG9ja2VkOiBib29sZWFuO1xuXHRyZWFkb25seSBleGVjdXRhYmxlOiBib29sZWFuO1xuXHRyZWFkb25seSBjaGlsZHJlbjogSUZpbGVTdGF0V2l0aE1ldGFkYXRhW10gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTdGF0UmVzdWx0IHtcblx0cmVhZG9ubHkgc3RhdD86IElGaWxlU3RhdDtcblx0cmVhZG9ubHkgc3VjY2VzczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVN0YXRSZXN1bHRXaXRoTWV0YWRhdGEgZXh0ZW5kcyBJRmlsZVN0YXRSZXN1bHQge1xuXHRyZWFkb25seSBzdGF0PzogSUZpbGVTdGF0V2l0aE1ldGFkYXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEgZXh0ZW5kcyBPbWl0PElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgJ2NoaWxkcmVuJz4geyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVDb250ZW50IGV4dGVuZHMgSUJhc2VGaWxlU3RhdFdpdGhNZXRhZGF0YSB7XG5cblx0LyoqXG5cdCAqIFRoZSBjb250ZW50IG9mIGEgZmlsZSBhcyBidWZmZXIuXG5cdCAqL1xuXHRyZWFkb25seSB2YWx1ZTogVlNCdWZmZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTdHJlYW1Db250ZW50IGV4dGVuZHMgSUJhc2VGaWxlU3RhdFdpdGhNZXRhZGF0YSB7XG5cblx0LyoqXG5cdCAqIFRoZSBjb250ZW50IG9mIGEgZmlsZSBhcyBzdHJlYW0uXG5cdCAqL1xuXHRyZWFkb25seSB2YWx1ZTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQmFzZVJlYWRGaWxlT3B0aW9ucyBleHRlbmRzIElGaWxlUmVhZFN0cmVhbU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgb3B0aW9uYWwgZXRhZyBwYXJhbWV0ZXIgYWxsb3dzIHRvIHJldHVybiBlYXJseSBmcm9tIHJlc29sdmluZyB0aGUgcmVzb3VyY2UgaWZcblx0ICogdGhlIGNvbnRlbnRzIG9uIGRpc2sgbWF0Y2ggdGhlIGV0YWcuIFRoaXMgcHJldmVudHMgYWNjdW11bGF0ZWQgcmVhZGluZyBvZiByZXNvdXJjZXNcblx0ICogdGhhdCBoYXZlIGJlZW4gcmVhZCBhbHJlYWR5IHdpdGggdGhlIHNhbWUgZXRhZy5cblx0ICogSXQgaXMgdGhlIHRhc2sgb2YgdGhlIGNhbGxlciB0byBtYWtlcyBzdXJlIHRvIGhhbmRsZSB0aGlzIGVycm9yIGNhc2UgZnJvbSB0aGUgcHJvbWlzZS5cblx0ICovXG5cdHJlYWRvbmx5IGV0YWc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlYWRGaWxlU3RyZWFtT3B0aW9ucyBleHRlbmRzIElCYXNlUmVhZEZpbGVPcHRpb25zIHsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWFkRmlsZU9wdGlvbnMgZXh0ZW5kcyBJQmFzZVJlYWRGaWxlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFRoZSBvcHRpb25hbCBgYXRvbWljYCBmbGFnIGNhbiBiZSB1c2VkIHRvIG1ha2Ugc3VyZVxuXHQgKiB0aGUgYHJlYWRGaWxlYCBtZXRob2QgaXMgbm90IHJ1bm5pbmcgaW4gcGFyYWxsZWwgd2l0aFxuXHQgKiBhbnkgYHdyaXRlYCBvcGVyYXRpb25zIGluIHRoZSBzYW1lIHByb2Nlc3MuXG5cdCAqXG5cdCAqIFR5cGljYWxseSB5b3Ugc2hvdWxkIG5vdCBuZWVkIHRvIHVzZSB0aGlzIGZsYWcgYnV0IGlmXG5cdCAqIGZvciBleGFtcGxlIHlvdSBhcmUgcXVpY2tseSByZWFkaW5nIGEgZmlsZSByaWdodCBhZnRlclxuXHQgKiBhIGZpbGUgZXZlbnQgb2NjdXJyZWQgYW5kIHRoZSBmaWxlIGNoYW5nZXMgYSBsb3QsIHRoZXJlXG5cdCAqIGlzIGEgY2hhbmNlIHRoYXQgYSByZWFkIHJldHVybnMgYW4gZW1wdHkgb3IgcGFydGlhbCBmaWxlXG5cdCAqIGJlY2F1c2UgYSBwZW5kaW5nIHdyaXRlIGhhcyBub3QgZmluaXNoZWQgeWV0LlxuXHQgKlxuXHQgKiBOb3RlOiB0aGlzIGRvZXMgbm90IHByZXZlbnQgdGhlIGZpbGUgZnJvbSBiZWluZyB3cml0dGVuXG5cdCAqIHRvIGZyb20gYSBkaWZmZXJlbnQgcHJvY2Vzcy4gSWYgeW91IG5lZWQgc3VjaCBhdG9taWNcblx0ICogb3BlcmF0aW9ucywgeW91IGJldHRlciB1c2UgYSByZWFsIGRhdGFiYXNlIGFzIHN0b3JhZ2UuXG5cdCAqL1xuXHRyZWFkb25seSBhdG9taWM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXcml0ZUZpbGVPcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIGxhc3Qga25vd24gbW9kaWZpY2F0aW9uIHRpbWUgb2YgdGhlIGZpbGUuIFRoaXMgY2FuIGJlIHVzZWQgdG8gcHJldmVudCBkaXJ0eSB3cml0ZXMuXG5cdCAqL1xuXHRyZWFkb25seSBtdGltZT86IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIGV0YWcgb2YgdGhlIGZpbGUuIFRoaXMgY2FuIGJlIHVzZWQgdG8gcHJldmVudCBkaXJ0eSB3cml0ZXMuXG5cdCAqL1xuXHRyZWFkb25seSBldGFnPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRvIGF0dGVtcHQgdG8gdW5sb2NrIGEgZmlsZSBiZWZvcmUgd3JpdGluZy5cblx0ICovXG5cdHJlYWRvbmx5IHVubG9jaz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBvcHRpb25hbCBgYXRvbWljYCBmbGFnIGNhbiBiZSB1c2VkIHRvIG1ha2Ugc3VyZVxuXHQgKiB0aGUgYHdyaXRlRmlsZWAgbWV0aG9kIHVwZGF0ZXMgdGhlIHRhcmdldCBmaWxlIGF0b21pY2FsbHlcblx0ICogYnkgZmlyc3Qgd3JpdGluZyB0byBhIHRlbXBvcmFyeSBmaWxlIGluIHRoZSBzYW1lIGZvbGRlclxuXHQgKiBhbmQgdGhlbiByZW5hbWluZyBpdCBvdmVyIHRoZSB0YXJnZXQuXG5cdCAqL1xuXHRyZWFkb25seSBhdG9taWM/OiBJRmlsZUF0b21pY09wdGlvbnMgfCBmYWxzZTtcblxuXHQvKipcblx0ICogSWYgc2V0IHRvIHRydWUsIHdpbGwgYXBwZW5kIHRvIHRoZSBlbmQgb2YgdGhlIGZpbGUgaW5zdGVhZCBvZlxuXHQgKiByZXBsYWNpbmcgaXRzIGNvbnRlbnRzLiBXaWxsIGNyZWF0ZSB0aGUgZmlsZSBpZiBpdCBkb2Vzbid0IGV4aXN0LlxuXHQgKi9cblx0cmVhZG9ubHkgYXBwZW5kPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb2x2ZUZpbGVPcHRpb25zIHtcblxuXHQvKipcblx0ICogQXV0b21hdGljYWxseSBjb250aW51ZSByZXNvbHZpbmcgY2hpbGRyZW4gb2YgYSBkaXJlY3RvcnkgdW50aWwgdGhlIHByb3ZpZGVkIHJlc291cmNlc1xuXHQgKiBhcmUgZm91bmQuXG5cdCAqL1xuXHRyZWFkb25seSByZXNvbHZlVG8/OiByZWFkb25seSBVUklbXTtcblxuXHQvKipcblx0ICogQXV0b21hdGljYWxseSBjb250aW51ZSByZXNvbHZpbmcgY2hpbGRyZW4gb2YgYSBkaXJlY3RvcnkgaWYgdGhlIG51bWJlciBvZiBjaGlsZHJlbiBpcyAxLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaWxsIHJlc29sdmUgbXRpbWUsIGN0aW1lLCBzaXplIGFuZCBldGFnIG9mIGZpbGVzIGlmIGVuYWJsZWQuIFRoaXMgY2FuIGhhdmUgYSBuZWdhdGl2ZSBpbXBhY3Rcblx0ICogb24gcGVyZm9ybWFuY2UgYW5kIHRodXMgc2hvdWxkIG9ubHkgYmUgdXNlZCB3aGVuIHRoZXNlIHZhbHVlcyBhcmUgcmVxdWlyZWQuXG5cdCAqL1xuXHRyZWFkb25seSByZXNvbHZlTWV0YWRhdGE/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyBleHRlbmRzIElSZXNvbHZlRmlsZU9wdGlvbnMge1xuXHRyZWFkb25seSByZXNvbHZlTWV0YWRhdGE6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNyZWF0ZUZpbGVPcHRpb25zIHtcblxuXHQvKipcblx0ICogT3ZlcndyaXRlIHRoZSBmaWxlIHRvIGNyZWF0ZSBpZiBpdCBhbHJlYWR5IGV4aXN0cyBvbiBkaXNrLiBPdGhlcndpc2Vcblx0ICogYW4gZXJyb3Igd2lsbCBiZSB0aHJvd24gKEZJTEVfTU9ESUZJRURfU0lOQ0UpLlxuXHQgKi9cblx0cmVhZG9ubHkgb3ZlcndyaXRlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVPcGVyYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0bWVzc2FnZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGZpbGVPcGVyYXRpb25SZXN1bHQ6IEZpbGVPcGVyYXRpb25SZXN1bHQsXG5cdFx0cmVhZG9ubHkgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMgfCBJV3JpdGVGaWxlT3B0aW9ucyB8IElDcmVhdGVGaWxlT3B0aW9uc1xuXHQpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9vTGFyZ2VGaWxlT3BlcmF0aW9uRXJyb3IgZXh0ZW5kcyBGaWxlT3BlcmF0aW9uRXJyb3Ige1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRtZXNzYWdlOiBzdHJpbmcsXG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZmlsZU9wZXJhdGlvblJlc3VsdDogRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1RPT19MQVJHRSxcblx0XHRyZWFkb25seSBzaXplOiBudW1iZXIsXG5cdFx0b3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIobWVzc2FnZSwgZmlsZU9wZXJhdGlvblJlc3VsdCwgb3B0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IgZXh0ZW5kcyBGaWxlT3BlcmF0aW9uRXJyb3Ige1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1lc3NhZ2U6IHN0cmluZyxcblx0XHRyZWFkb25seSBzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsXG5cdFx0b3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIobWVzc2FnZSwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9NT0RJRklFRF9TSU5DRSwgb3B0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRmlsZU9wZXJhdGlvblJlc3VsdCB7XG5cdEZJTEVfSVNfRElSRUNUT1JZLFxuXHRGSUxFX05PVF9GT1VORCxcblx0RklMRV9OT1RfTU9ESUZJRURfU0lOQ0UsXG5cdEZJTEVfTU9ESUZJRURfU0lOQ0UsXG5cdEZJTEVfTU9WRV9DT05GTElDVCxcblx0RklMRV9XUklURV9MT0NLRUQsXG5cdEZJTEVfUEVSTUlTU0lPTl9ERU5JRUQsXG5cdEZJTEVfVE9PX0xBUkdFLFxuXHRGSUxFX0lOVkFMSURfUEFUSCxcblx0RklMRV9OT1RfRElSRUNUT1JZLFxuXHRGSUxFX09USEVSX0VSUk9SXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2V0dGluZ3NcblxuZXhwb3J0IGNvbnN0IEF1dG9TYXZlQ29uZmlndXJhdGlvbiA9IHtcblx0T0ZGOiAnb2ZmJyxcblx0QUZURVJfREVMQVk6ICdhZnRlckRlbGF5Jyxcblx0T05fRk9DVVNfQ0hBTkdFOiAnb25Gb2N1c0NoYW5nZScsXG5cdE9OX1dJTkRPV19DSEFOR0U6ICdvbldpbmRvd0NoYW5nZSdcbn07XG5cbmV4cG9ydCBjb25zdCBIb3RFeGl0Q29uZmlndXJhdGlvbiA9IHtcblx0T0ZGOiAnb2ZmJyxcblx0T05fRVhJVDogJ29uRXhpdCcsXG5cdE9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRTogJ29uRXhpdEFuZFdpbmRvd0Nsb3NlJ1xufTtcblxuZXhwb3J0IGNvbnN0IEZJTEVTX0FTU09DSUFUSU9OU19DT05GSUcgPSAnZmlsZXMuYXNzb2NpYXRpb25zJztcbmV4cG9ydCBjb25zdCBGSUxFU19FWENMVURFX0NPTkZJRyA9ICdmaWxlcy5leGNsdWRlJztcbmV4cG9ydCBjb25zdCBGSUxFU19SRUFET05MWV9JTkNMVURFX0NPTkZJRyA9ICdmaWxlcy5yZWFkb25seUluY2x1ZGUnO1xuZXhwb3J0IGNvbnN0IEZJTEVTX1JFQURPTkxZX0VYQ0xVREVfQ09ORklHID0gJ2ZpbGVzLnJlYWRvbmx5RXhjbHVkZSc7XG5leHBvcnQgY29uc3QgRklMRVNfUkVBRE9OTFlfRlJPTV9QRVJNSVNTSU9OU19DT05GSUcgPSAnZmlsZXMucmVhZG9ubHlGcm9tUGVybWlzc2lvbnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElHbG9iUGF0dGVybnMge1xuXHRbZmlsZXBhdHRlcm46IHN0cmluZ106IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVzQ29uZmlndXJhdGlvbiB7XG5cdGZpbGVzPzogSUZpbGVzQ29uZmlndXJhdGlvbk5vZGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVzQ29uZmlndXJhdGlvbk5vZGUge1xuXHRhc3NvY2lhdGlvbnM6IHsgW2ZpbGVwYXR0ZXJuOiBzdHJpbmddOiBzdHJpbmcgfTtcblx0ZXhjbHVkZTogSUV4cHJlc3Npb247XG5cdHdhdGNoZXJFeGNsdWRlOiBJR2xvYlBhdHRlcm5zO1xuXHR3YXRjaGVySW5jbHVkZTogc3RyaW5nW107XG5cdGVuY29kaW5nOiBzdHJpbmc7XG5cdGF1dG9HdWVzc0VuY29kaW5nOiBib29sZWFuO1xuXHRjYW5kaWRhdGVHdWVzc0VuY29kaW5nczogc3RyaW5nW107XG5cdGRlZmF1bHRMYW5ndWFnZTogc3RyaW5nO1xuXHR0cmltVHJhaWxpbmdXaGl0ZXNwYWNlOiBib29sZWFuO1xuXHRhdXRvU2F2ZTogc3RyaW5nO1xuXHRhdXRvU2F2ZURlbGF5OiBudW1iZXI7XG5cdGF1dG9TYXZlV29ya3NwYWNlRmlsZXNPbmx5OiBib29sZWFuO1xuXHRhdXRvU2F2ZVdoZW5Ob0Vycm9yczogYm9vbGVhbjtcblx0ZW9sOiBzdHJpbmc7XG5cdGVuYWJsZVRyYXNoOiBib29sZWFuO1xuXHRob3RFeGl0OiBzdHJpbmc7XG5cdHNhdmVDb25mbGljdFJlc29sdXRpb246ICdhc2tVc2VyJyB8ICdvdmVyd3JpdGVGaWxlT25EaXNrJztcblx0cmVhZG9ubHlJbmNsdWRlOiBJR2xvYlBhdHRlcm5zO1xuXHRyZWFkb25seUV4Y2x1ZGU6IElHbG9iUGF0dGVybnM7XG5cdHJlYWRvbmx5RnJvbVBlcm1pc3Npb25zOiBib29sZWFuO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFV0aWxpdGllc1xuXG5leHBvcnQgZW51bSBGaWxlS2luZCB7XG5cdEZJTEUsXG5cdEZPTERFUixcblx0Uk9PVF9GT0xERVJcbn1cblxuLyoqXG4gKiBBIGhpbnQgdG8gZGlzYWJsZSBldGFnIGNoZWNraW5nIGZvciByZWFkaW5nL3dyaXRpbmcuXG4gKi9cbmV4cG9ydCBjb25zdCBFVEFHX0RJU0FCTEVEID0gJyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBldGFnKHN0YXQ6IHsgbXRpbWU6IG51bWJlcjsgc2l6ZTogbnVtYmVyIH0pOiBzdHJpbmc7XG5leHBvcnQgZnVuY3Rpb24gZXRhZyhzdGF0OiB7IG10aW1lOiBudW1iZXIgfCB1bmRlZmluZWQ7IHNpemU6IG51bWJlciB8IHVuZGVmaW5lZCB9KTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuZXhwb3J0IGZ1bmN0aW9uIGV0YWcoc3RhdDogeyBtdGltZTogbnVtYmVyIHwgdW5kZWZpbmVkOyBzaXplOiBudW1iZXIgfCB1bmRlZmluZWQgfSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2Ygc3RhdC5zaXplICE9PSAnbnVtYmVyJyB8fCB0eXBlb2Ygc3RhdC5tdGltZSAhPT0gJ251bWJlcicpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHN0YXQubXRpbWUudG9TdHJpbmcoMjkpICsgc3RhdC5zaXplLnRvU3RyaW5nKDMxKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdoZW5Qcm92aWRlclJlZ2lzdGVyZWQoZmlsZTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmIChmaWxlU2VydmljZS5oYXNQcm92aWRlcihVUkkuZnJvbSh7IHNjaGVtZTogZmlsZS5zY2hlbWUgfSkpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBmaWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMoZSA9PiB7XG5cdFx0XHRpZiAoZS5zY2hlbWUgPT09IGZpbGUuc2NoZW1lICYmIGUuYWRkZWQpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogSGVscGVyIHRvIGZvcm1hdCBhIHJhdyBieXRlIHNpemUgaW50byBhIGh1bWFuIHJlYWRhYmxlIGxhYmVsLlxuICovXG5leHBvcnQgY2xhc3MgQnl0ZVNpemUge1xuXG5cdHN0YXRpYyByZWFkb25seSBLQiA9IDEwMjQ7XG5cdHN0YXRpYyByZWFkb25seSBNQiA9IEJ5dGVTaXplLktCICogQnl0ZVNpemUuS0I7XG5cdHN0YXRpYyByZWFkb25seSBHQiA9IEJ5dGVTaXplLk1CICogQnl0ZVNpemUuS0I7XG5cdHN0YXRpYyByZWFkb25seSBUQiA9IEJ5dGVTaXplLkdCICogQnl0ZVNpemUuS0I7XG5cblx0c3RhdGljIGZvcm1hdFNpemUoc2l6ZTogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAoIWlzTnVtYmVyKHNpemUpKSB7XG5cdFx0XHRzaXplID0gMDtcblx0XHR9XG5cblx0XHRpZiAoc2l6ZSA8IEJ5dGVTaXplLktCKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NpemVCJywgXCJ7MH1CXCIsIHNpemUudG9GaXhlZCgwKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNpemUgPCBCeXRlU2l6ZS5NQikge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaXplS0InLCBcInswfUtCXCIsIChzaXplIC8gQnl0ZVNpemUuS0IpLnRvRml4ZWQoMikpO1xuXHRcdH1cblxuXHRcdGlmIChzaXplIDwgQnl0ZVNpemUuR0IpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2l6ZU1CJywgXCJ7MH1NQlwiLCAoc2l6ZSAvIEJ5dGVTaXplLk1CKS50b0ZpeGVkKDIpKTtcblx0XHR9XG5cblx0XHRpZiAoc2l6ZSA8IEJ5dGVTaXplLlRCKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NpemVHQicsIFwiezB9R0JcIiwgKHNpemUgLyBCeXRlU2l6ZS5HQikudG9GaXhlZCgyKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzaXplVEInLCBcInswfVRCXCIsIChzaXplIC8gQnl0ZVNpemUuVEIpLnRvRml4ZWQoMikpO1xuXHR9XG59XG5cbi8vIEZpbGUgbGltaXRzXG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXJnZUZpbGVDb25maXJtYXRpb25MaW1pdChyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBudW1iZXI7XG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFyZ2VGaWxlQ29uZmlybWF0aW9uTGltaXQodXJpPzogVVJJKTogbnVtYmVyO1xuZXhwb3J0IGZ1bmN0aW9uIGdldExhcmdlRmlsZUNvbmZpcm1hdGlvbkxpbWl0KGFyZz86IHN0cmluZyB8IFVSSSk6IG51bWJlciB7XG5cdGNvbnN0IGlzUmVtb3RlID0gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgfHwgYXJnPy5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRjb25zdCBpc0xvY2FsID0gdHlwZW9mIGFyZyAhPT0gJ3N0cmluZycgJiYgYXJnPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZTtcblxuXHRpZiAoaXNMb2NhbCkge1xuXHRcdC8vIExvY2FsIGFsbW9zdCBoYXMgbm8gbGltaXQgaW4gZmlsZSBzaXplXG5cdFx0cmV0dXJuIDEwMjQgKiBCeXRlU2l6ZS5NQjtcblx0fVxuXG5cdGlmIChpc1JlbW90ZSkge1xuXHRcdC8vIFdpdGggYSByZW1vdGUsIHBpY2sgYSBsb3cgbGltaXQgdG8gYXZvaWRcblx0XHQvLyBwb3RlbnRpYWxseSBjb3N0bHkgZmlsZSB0cmFuc2ZlcnNcblx0XHRyZXR1cm4gMTAgKiBCeXRlU2l6ZS5NQjtcblx0fVxuXG5cdGlmIChpc1dlYikge1xuXHRcdC8vIFdlYjogd2UgY2Fubm90IGtub3cgZm9yIHN1cmUgaWYgYSBjb3N0XG5cdFx0Ly8gaXMgYXNzb2NpYXRlZCB3aXRoIHRoZSBmaWxlIHRyYW5zZmVyXG5cdFx0Ly8gc28gd2UgcGljayBhIHJlYXNvbmFibHkgc21hbGwgbGltaXRcblx0XHRyZXR1cm4gNTAgKiBCeXRlU2l6ZS5NQjtcblx0fVxuXG5cdC8vIExvY2FsIGRlc2t0b3A6IGFsbW9zdCBubyBsaW1pdCBpbiBmaWxlIHNpemVcblx0cmV0dXJuIDEwMjQgKiBCeXRlU2l6ZS5NQjtcbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFVQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFdBQVc7QUFFcEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxZQUFZO0FBSWQsTUFBTSxlQUFlLGdCQUE4QixhQUFhO0FBaVhoRSxTQUFTLDBCQUEwQixTQUFnRTtBQUN6RyxTQUFPLFFBQVEsV0FBVztBQUMzQjtBQW9ETyxJQUFLLFdBQUwsa0JBQUtBLGNBQUw7QUFLTixFQUFBQSxvQkFBQSxhQUFVLEtBQVY7QUFLQSxFQUFBQSxvQkFBQSxVQUFPLEtBQVA7QUFLQSxFQUFBQSxvQkFBQSxlQUFZLEtBQVo7QUFTQSxFQUFBQSxvQkFBQSxrQkFBZSxNQUFmO0FBeEJXLFNBQUFBO0FBQUEsR0FBQTtBQTJCTCxJQUFLLGlCQUFMLGtCQUFLQyxvQkFBTDtBQU1OLEVBQUFBLGdDQUFBLGNBQVcsS0FBWDtBQU9BLEVBQUFBLGdDQUFBLFlBQVMsS0FBVDtBQU1BLEVBQUFBLGdDQUFBLGdCQUFhLEtBQWI7QUFuQlcsU0FBQUE7QUFBQSxHQUFBO0FBZ0dMLElBQVcsbUJBQVgsa0JBQVdDLHNCQUFYO0FBQ04sRUFBQUEsb0NBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsb0NBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsb0NBQUEsYUFBVSxLQUFWO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQW9CWCxTQUFTLG9CQUFvQixPQUE2QztBQUNoRixRQUFNLFlBQVk7QUFFbEIsU0FBTyxDQUFDLENBQUMsYUFBYSxPQUFPLFVBQVUsZ0JBQWdCO0FBQ3hEO0FBRU8sSUFBVyxpQ0FBWCxr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QUFOO0FBb0NBLFNBQVMsOEJBQThCLEtBQTRCO0FBQ3pFLFFBQU0sV0FBVyxPQUFPLFFBQVEsWUFBWSxLQUFLLFdBQVcsUUFBUTtBQUNwRSxRQUFNLFVBQVUsT0FBTyxRQUFRLFlBQVksS0FBSyxXQUFXLFFBQVE7QUFFbkUsTUFBSSxTQUFTO0FBRVosV0FBTyxPQUFPLFNBQVM7QUFBQSxFQUN4QjtBQUVBLE1BQUksVUFBVTtBQUdiLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFFQSxNQUFJLE9BQU87QUFJVixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBR0EsU0FBTyxPQUFPLFNBQVM7QUFDeEI7IiwKICAibmFtZXMiOiBbIkZpbGVUeXBlIiwgIkZpbGVQZXJtaXNzaW9uIiwgIkZpbGVDaGFuZ2VGaWx0ZXIiLCAiRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIiwgIkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSIsICJGaWxlT3BlcmF0aW9uIiwgIkZpbGVDaGFuZ2VUeXBlIiwgIkZpbGVPcGVyYXRpb25SZXN1bHQiLCAiRmlsZUtpbmQiXQp9Cg==
