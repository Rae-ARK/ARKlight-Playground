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
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { equals, deepClone } from "../../../../base/common/objects.js";
import { Promises, ResourceQueue } from "../../../../base/common/async.js";
import { IFileService, FileOperationResult } from "../../../../platform/files/common/files.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { isReadableStream, peekStream } from "../../../../base/common/stream.js";
import { bufferToStream, prefixedBufferReadable, prefixedBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Schemas } from "../../../../base/common/network.js";
import { hash } from "../../../../base/common/hash.js";
import { isEmptyObject } from "../../../../base/common/types.js";
import { NO_TYPE_ID } from "./workingCopy.js";
class WorkingCopyBackupsModel {
  constructor(backupRoot, fileService) {
    this.backupRoot = backupRoot;
    this.fileService = fileService;
    this.cache = new ResourceMap();
  }
  static async create(backupRoot, fileService) {
    const model = new WorkingCopyBackupsModel(backupRoot, fileService);
    await model.resolve();
    return model;
  }
  async resolve() {
    try {
      const backupRootStat = await this.fileService.resolve(this.backupRoot);
      if (backupRootStat.children) {
        await Promises.settled(backupRootStat.children.filter((child) => child.isDirectory).map(async (backupSchemaFolder) => {
          const backupSchemaFolderStat = await this.fileService.resolve(backupSchemaFolder.resource);
          if (backupSchemaFolderStat.children) {
            for (const backupForSchema of backupSchemaFolderStat.children) {
              if (!backupForSchema.isDirectory) {
                this.add(backupForSchema.resource);
              }
            }
          }
        }));
      }
    } catch (error) {
    }
  }
  add(resource, versionId = 0, meta) {
    this.cache.set(resource, {
      versionId,
      meta: deepClone(meta)
    });
  }
  update(resource, meta) {
    const entry = this.cache.get(resource);
    if (entry) {
      entry.meta = deepClone(meta);
    }
  }
  count() {
    return this.cache.size;
  }
  has(resource, versionId, meta) {
    const entry = this.cache.get(resource);
    if (!entry) {
      return false;
    }
    if (typeof versionId === "number" && versionId !== entry.versionId) {
      return false;
    }
    if (meta && !equals(meta, entry.meta)) {
      return false;
    }
    return true;
  }
  get() {
    return Array.from(this.cache.keys());
  }
  remove(resource) {
    this.cache.delete(resource);
  }
  clear() {
    this.cache.clear();
  }
}
let WorkingCopyBackupService = class extends Disposable {
  constructor(backupWorkspaceHome, fileService, logService) {
    super();
    this.fileService = fileService;
    this.logService = logService;
    this.impl = this._register(this.initialize(backupWorkspaceHome));
  }
  initialize(backupWorkspaceHome) {
    if (backupWorkspaceHome) {
      return new WorkingCopyBackupServiceImpl(backupWorkspaceHome, this.fileService, this.logService);
    }
    return new InMemoryWorkingCopyBackupService();
  }
  reinitialize(backupWorkspaceHome) {
    if (this.impl instanceof WorkingCopyBackupServiceImpl) {
      if (backupWorkspaceHome) {
        this.impl.initialize(backupWorkspaceHome);
      } else {
        this.impl = new InMemoryWorkingCopyBackupService();
      }
    }
  }
  hasBackupSync(identifier, versionId, meta) {
    return this.impl.hasBackupSync(identifier, versionId, meta);
  }
  backup(identifier, content, versionId, meta, token) {
    return this.impl.backup(identifier, content, versionId, meta, token);
  }
  discardBackup(identifier, token) {
    return this.impl.discardBackup(identifier, token);
  }
  discardBackups(filter) {
    return this.impl.discardBackups(filter);
  }
  getBackups() {
    return this.impl.getBackups();
  }
  resolve(identifier) {
    return this.impl.resolve(identifier);
  }
  toBackupResource(identifier) {
    return this.impl.toBackupResource(identifier);
  }
  joinBackups() {
    return this.impl.joinBackups();
  }
};
WorkingCopyBackupService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService)
], WorkingCopyBackupService);
let WorkingCopyBackupServiceImpl = class extends Disposable {
  constructor(backupWorkspaceHome, fileService, logService) {
    super();
    this.backupWorkspaceHome = backupWorkspaceHome;
    this.fileService = fileService;
    this.logService = logService;
    this.ioOperationQueues = this._register(new ResourceQueue());
    this.model = void 0;
    this.initialize(backupWorkspaceHome);
  }
  initialize(backupWorkspaceResource) {
    this.backupWorkspaceHome = backupWorkspaceResource;
    this.ready = this.doInitialize();
  }
  async doInitialize() {
    this.model = await WorkingCopyBackupsModel.create(this.backupWorkspaceHome, this.fileService);
    return this.model;
  }
  hasBackupSync(identifier, versionId, meta) {
    if (!this.model) {
      return false;
    }
    const backupResource = this.toBackupResource(identifier);
    return this.model.has(backupResource, versionId, meta);
  }
  async backup(identifier, content, versionId, meta, token) {
    const model = await this.ready;
    if (token?.isCancellationRequested) {
      return;
    }
    const backupResource = this.toBackupResource(identifier);
    if (model.has(backupResource, versionId, meta)) {
      return;
    }
    return this.ioOperationQueues.queueFor(backupResource, async () => {
      if (token?.isCancellationRequested) {
        return;
      }
      if (model.has(backupResource, versionId, meta)) {
        return;
      }
      let preamble = this.createPreamble(identifier, meta);
      if (preamble.length >= WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH) {
        preamble = this.createPreamble(identifier);
      }
      const preambleBuffer = VSBuffer.fromString(preamble);
      let backupBuffer;
      if (isReadableStream(content)) {
        backupBuffer = prefixedBufferStream(preambleBuffer, content);
      } else if (content) {
        backupBuffer = prefixedBufferReadable(preambleBuffer, content);
      } else {
        backupBuffer = VSBuffer.concat([preambleBuffer, VSBuffer.fromString("")]);
      }
      await this.fileService.writeFile(backupResource, backupBuffer);
      model.add(backupResource, versionId, meta);
    });
  }
  createPreamble(identifier, meta) {
    return `${identifier.resource.toString()}${WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR}${JSON.stringify({ ...meta, typeId: identifier.typeId })}${WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER}`;
  }
  async discardBackups(filter) {
    const model = await this.ready;
    const except = filter?.except;
    if (Array.isArray(except) && except.length > 0) {
      const exceptMap = new ResourceMap();
      for (const exceptWorkingCopy of except) {
        exceptMap.set(this.toBackupResource(exceptWorkingCopy), true);
      }
      await Promises.settled(model.get().map(async (backupResource) => {
        if (!exceptMap.has(backupResource)) {
          await this.doDiscardBackup(backupResource);
        }
      }));
    } else {
      await this.deleteIgnoreFileNotFound(this.backupWorkspaceHome);
      model.clear();
    }
  }
  discardBackup(identifier, token) {
    const backupResource = this.toBackupResource(identifier);
    return this.doDiscardBackup(backupResource, token);
  }
  async doDiscardBackup(backupResource, token) {
    const model = await this.ready;
    if (token?.isCancellationRequested) {
      return;
    }
    return this.ioOperationQueues.queueFor(backupResource, async () => {
      if (token?.isCancellationRequested) {
        return;
      }
      await this.deleteIgnoreFileNotFound(backupResource);
      model.remove(backupResource);
    });
  }
  async deleteIgnoreFileNotFound(backupResource) {
    try {
      await this.fileService.del(backupResource, { recursive: true });
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
    }
  }
  async getBackups() {
    const model = await this.ready;
    await this.joinBackups();
    const backups = await Promise.all(model.get().map((backupResource) => this.resolveIdentifier(backupResource, model)));
    return coalesce(backups);
  }
  async resolveIdentifier(backupResource, model) {
    let res = void 0;
    await this.ioOperationQueues.queueFor(backupResource, async () => {
      if (!model.has(backupResource)) {
        return;
      }
      const backupPreamble = await this.readToMatchingString(backupResource, WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER, WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH);
      if (!backupPreamble) {
        return;
      }
      const metaStartIndex = backupPreamble.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR);
      let resourcePreamble;
      let metaPreamble;
      if (metaStartIndex > 0) {
        resourcePreamble = backupPreamble.substring(0, metaStartIndex);
        metaPreamble = backupPreamble.substr(metaStartIndex + 1);
      } else {
        resourcePreamble = backupPreamble;
        metaPreamble = void 0;
      }
      const { typeId, meta } = this.parsePreambleMeta(metaPreamble);
      model.update(backupResource, meta);
      res = {
        typeId: typeId ?? NO_TYPE_ID,
        resource: URI.parse(resourcePreamble)
      };
    });
    return res;
  }
  async readToMatchingString(backupResource, matchingString, maximumBytesToRead) {
    const contents = (await this.fileService.readFile(backupResource, { length: maximumBytesToRead })).value.toString();
    const matchingStringIndex = contents.indexOf(matchingString);
    if (matchingStringIndex >= 0) {
      return contents.substr(0, matchingStringIndex);
    }
    return void 0;
  }
  async resolve(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const model = await this.ready;
    let res = void 0;
    await this.ioOperationQueues.queueFor(backupResource, async () => {
      if (!model.has(backupResource)) {
        return;
      }
      const backupStream = await this.fileService.readFileStream(backupResource);
      const peekedBackupStream = await peekStream(backupStream.value, 1);
      const firstBackupChunk = VSBuffer.concat(peekedBackupStream.buffer);
      const preambleEndIndex = firstBackupChunk.buffer.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER_CHARCODE);
      if (preambleEndIndex === -1) {
        this.logService.trace(`Backup: Could not find meta end marker in ${backupResource}. The file is probably corrupt (filesize: ${backupStream.size}).`);
        return void 0;
      }
      const preambelRaw = firstBackupChunk.slice(0, preambleEndIndex).toString();
      let meta;
      const metaStartIndex = preambelRaw.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR);
      if (metaStartIndex !== -1) {
        meta = this.parsePreambleMeta(preambelRaw.substr(metaStartIndex + 1)).meta;
      }
      model.update(backupResource, meta);
      const firstBackupChunkWithoutPreamble = firstBackupChunk.slice(preambleEndIndex + 1);
      let value;
      if (peekedBackupStream.ended) {
        value = bufferToStream(firstBackupChunkWithoutPreamble);
      } else {
        value = prefixedBufferStream(firstBackupChunkWithoutPreamble, peekedBackupStream.stream);
      }
      res = { value, meta };
    });
    return res;
  }
  parsePreambleMeta(preambleMetaRaw) {
    let typeId = void 0;
    let meta = void 0;
    if (preambleMetaRaw) {
      try {
        meta = JSON.parse(preambleMetaRaw);
        typeId = meta?.typeId;
        if (typeof meta?.typeId === "string") {
          delete meta.typeId;
          if (isEmptyObject(meta)) {
            meta = void 0;
          }
        }
      } catch (error) {
      }
    }
    return { typeId, meta };
  }
  toBackupResource(identifier) {
    return joinPath(this.backupWorkspaceHome, identifier.resource.scheme, hashIdentifier(identifier));
  }
  joinBackups() {
    return this.ioOperationQueues.whenDrained();
  }
};
WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER = "\n";
WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER_CHARCODE = "\n".charCodeAt(0);
WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR = " ";
// using a character that is know to be escaped in a URI as separator
WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH = 1e4;
WorkingCopyBackupServiceImpl = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService)
], WorkingCopyBackupServiceImpl);
class InMemoryWorkingCopyBackupService extends Disposable {
  constructor() {
    super(...arguments);
    this.backups = new ResourceMap();
  }
  hasBackupSync(identifier, versionId) {
    const backupResource = this.toBackupResource(identifier);
    return this.backups.has(backupResource);
  }
  async backup(identifier, content, versionId, meta, token) {
    const backupResource = this.toBackupResource(identifier);
    this.backups.set(backupResource, {
      typeId: identifier.typeId,
      content: content instanceof VSBuffer ? content : content ? isReadableStream(content) ? await streamToBuffer(content) : readableToBuffer(content) : VSBuffer.fromString(""),
      meta
    });
  }
  async resolve(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const backup = this.backups.get(backupResource);
    if (backup) {
      return { value: bufferToStream(backup.content), meta: backup.meta };
    }
    return void 0;
  }
  async getBackups() {
    return Array.from(this.backups.entries()).map(([resource, backup]) => ({ typeId: backup.typeId, resource }));
  }
  async discardBackup(identifier) {
    this.backups.delete(this.toBackupResource(identifier));
  }
  async discardBackups(filter) {
    const except = filter?.except;
    if (Array.isArray(except) && except.length > 0) {
      const exceptMap = new ResourceMap();
      for (const exceptWorkingCopy of except) {
        exceptMap.set(this.toBackupResource(exceptWorkingCopy), true);
      }
      for (const backup of await this.getBackups()) {
        if (!exceptMap.has(this.toBackupResource(backup))) {
          await this.discardBackup(backup);
        }
      }
    } else {
      this.backups.clear();
    }
  }
  toBackupResource(identifier) {
    return URI.from({ scheme: Schemas.inMemory, path: hashIdentifier(identifier) });
  }
  async joinBackups() {
    return;
  }
}
function hashIdentifier(identifier) {
  let resource;
  if (identifier.typeId.length > 0) {
    const typeIdHash = hashString(identifier.typeId);
    if (identifier.resource.path) {
      resource = joinPath(identifier.resource, typeIdHash);
    } else {
      resource = identifier.resource.with({ path: typeIdHash });
    }
  } else {
    resource = identifier.resource;
  }
  return hashPath(resource);
}
function hashPath(resource) {
  const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
  return hashString(str);
}
function hashString(str) {
  return hash(str).toString(16);
}
export {
  InMemoryWorkingCopyBackupService,
  WorkingCopyBackupService,
  WorkingCopyBackupsModel,
  hashIdentifier
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGVxdWFscywgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgUmVzb3VyY2VRdWV1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwLCBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBpc1JlYWRhYmxlU3RyZWFtLCBwZWVrU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvU3RyZWFtLCBwcmVmaXhlZEJ1ZmZlclJlYWRhYmxlLCBwcmVmaXhlZEJ1ZmZlclN0cmVhbSwgcmVhZGFibGVUb0J1ZmZlciwgc3RyZWFtVG9CdWZmZXIsIFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlLCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBpc0VtcHR5T2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5QmFja3VwTWV0YSwgSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgTk9fVFlQRV9JRCB9IGZyb20gJy4vd29ya2luZ0NvcHkuanMnO1xuXG5leHBvcnQgY2xhc3MgV29ya2luZ0NvcHlCYWNrdXBzTW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGUgPSBuZXcgUmVzb3VyY2VNYXA8eyB2ZXJzaW9uSWQ/OiBudW1iZXI7IG1ldGE/OiBJV29ya2luZ0NvcHlCYWNrdXBNZXRhIH0+KCk7XG5cblx0c3RhdGljIGFzeW5jIGNyZWF0ZShiYWNrdXBSb290OiBVUkksIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPFdvcmtpbmdDb3B5QmFja3Vwc01vZGVsPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgV29ya2luZ0NvcHlCYWNrdXBzTW9kZWwoYmFja3VwUm9vdCwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihwcml2YXRlIGJhY2t1cFJvb3Q6IFVSSSwgcHJpdmF0ZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKSB7IH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGJhY2t1cFJvb3RTdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRoaXMuYmFja3VwUm9vdCk7XG5cdFx0XHRpZiAoYmFja3VwUm9vdFN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChiYWNrdXBSb290U3RhdC5jaGlsZHJlblxuXHRcdFx0XHRcdC5maWx0ZXIoY2hpbGQgPT4gY2hpbGQuaXNEaXJlY3RvcnkpXG5cdFx0XHRcdFx0Lm1hcChhc3luYyBiYWNrdXBTY2hlbWFGb2xkZXIgPT4ge1xuXG5cdFx0XHRcdFx0XHQvLyBSZWFkIGJhY2t1cCBkaXJlY3RvcnkgZm9yIGJhY2t1cHNcblx0XHRcdFx0XHRcdGNvbnN0IGJhY2t1cFNjaGVtYUZvbGRlclN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoYmFja3VwU2NoZW1hRm9sZGVyLnJlc291cmNlKTtcblxuXHRcdFx0XHRcdFx0Ly8gUmVtZW1iZXIga25vd24gYmFja3VwcyBpbiBvdXIgY2FjaGVzXG5cdFx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdFx0Ly8gTm90ZTogdGhpcyBkb2VzIE5PVCBhY2NvdW50IGZvciByZXNvbHZpbmdcblx0XHRcdFx0XHRcdC8vIGFzc29jaWF0ZWQgbWV0YSBkYXRhIGJlY2F1c2UgdGhhdCByZXF1aXJlc1xuXHRcdFx0XHRcdFx0Ly8gb3BlbmluZyB0aGUgYmFja3VwIGFuZCByZWFkaW5nIHRoZSBtZXRhXG5cdFx0XHRcdFx0XHQvLyBwcmVhbWJsZS4gSW5zdGVhZCwgd2hlbiBiYWNrdXBzIGFyZSBhY3R1YWxseVxuXHRcdFx0XHRcdFx0Ly8gcmVzb2x2ZWQsIHRoZSBtZXRhIGRhdGEgd2lsbCBiZSBhZGRlZCB2aWFcblx0XHRcdFx0XHRcdC8vIGFkZGl0aW9uYWwgYHVwZGF0ZWAgY2FsbHMuXG5cdFx0XHRcdFx0XHRpZiAoYmFja3VwU2NoZW1hRm9sZGVyU3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGJhY2t1cEZvclNjaGVtYSBvZiBiYWNrdXBTY2hlbWFGb2xkZXJTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFiYWNrdXBGb3JTY2hlbWEuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuYWRkKGJhY2t1cEZvclNjaGVtYS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmUgYW55IGVycm9yc1xuXHRcdH1cblx0fVxuXG5cdGFkZChyZXNvdXJjZTogVVJJLCB2ZXJzaW9uSWQgPSAwLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSk6IHZvaWQge1xuXHRcdHRoaXMuY2FjaGUuc2V0KHJlc291cmNlLCB7XG5cdFx0XHR2ZXJzaW9uSWQsXG5cdFx0XHRtZXRhOiBkZWVwQ2xvbmUobWV0YSlcblx0XHR9KTtcblx0fVxuXG5cdHVwZGF0ZShyZXNvdXJjZTogVVJJLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5jYWNoZS5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0ZW50cnkubWV0YSA9IGRlZXBDbG9uZShtZXRhKTtcblx0XHR9XG5cdH1cblxuXHRjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmNhY2hlLnNpemU7XG5cdH1cblxuXHRoYXMocmVzb3VyY2U6IFVSSSwgdmVyc2lvbklkPzogbnVtYmVyLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5jYWNoZS5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gdW5rbm93biByZXNvdXJjZVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmVyc2lvbklkID09PSAnbnVtYmVyJyAmJiB2ZXJzaW9uSWQgIT09IGVudHJ5LnZlcnNpb25JZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBkaWZmZXJlbnQgdmVyc2lvbklkXG5cdFx0fVxuXG5cdFx0aWYgKG1ldGEgJiYgIWVxdWFscyhtZXRhLCBlbnRyeS5tZXRhKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBkaWZmZXJlbnQgbWV0YWRhdGFcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldCgpOiBVUklbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5jYWNoZS5rZXlzKCkpO1xuXHR9XG5cblx0cmVtb3ZlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlLmRlbGV0ZShyZXNvdXJjZSk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlLmNsZWFyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGltcGw6IFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwgfCBJbk1lbW9yeVdvcmtpbmdDb3B5QmFja3VwU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRiYWNrdXBXb3Jrc3BhY2VIb21lOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5pbXBsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbml0aWFsaXplKGJhY2t1cFdvcmtzcGFjZUhvbWUpKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZShiYWNrdXBXb3Jrc3BhY2VIb21lOiBVUkkgfCB1bmRlZmluZWQpOiBXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsIHwgSW5NZW1vcnlXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Uge1xuXHRcdGlmIChiYWNrdXBXb3Jrc3BhY2VIb21lKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwoYmFja3VwV29ya3NwYWNlSG9tZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IEluTWVtb3J5V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlKCk7XG5cdH1cblxuXHRyZWluaXRpYWxpemUoYmFja3VwV29ya3NwYWNlSG9tZTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cblx0XHQvLyBSZS1pbml0IGltcGxlbWVudGF0aW9uICh1bmxlc3Mgd2UgYXJlIHJ1bm5pbmcgaW4tbWVtb3J5KVxuXHRcdGlmICh0aGlzLmltcGwgaW5zdGFuY2VvZiBXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsKSB7XG5cdFx0XHRpZiAoYmFja3VwV29ya3NwYWNlSG9tZSkge1xuXHRcdFx0XHR0aGlzLmltcGwuaW5pdGlhbGl6ZShiYWNrdXBXb3Jrc3BhY2VIb21lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaW1wbCA9IG5ldyBJbk1lbW9yeVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgdmVyc2lvbklkPzogbnVtYmVyLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmltcGwuaGFzQmFja3VwU3luYyhpZGVudGlmaWVyLCB2ZXJzaW9uSWQsIG1ldGEpO1xuXHR9XG5cblx0YmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIGNvbnRlbnQ/OiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgVlNCdWZmZXJSZWFkYWJsZSwgdmVyc2lvbklkPzogbnVtYmVyLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmltcGwuYmFja3VwKGlkZW50aWZpZXIsIGNvbnRlbnQsIHZlcnNpb25JZCwgbWV0YSwgdG9rZW4pO1xuXHR9XG5cblx0ZGlzY2FyZEJhY2t1cChpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW1wbC5kaXNjYXJkQmFja3VwKGlkZW50aWZpZXIsIHRva2VuKTtcblx0fVxuXG5cdGRpc2NhcmRCYWNrdXBzKGZpbHRlcj86IHsgZXhjZXB0OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmltcGwuZGlzY2FyZEJhY2t1cHMoZmlsdGVyKTtcblx0fVxuXG5cdGdldEJhY2t1cHMoKTogUHJvbWlzZTxJV29ya2luZ0NvcHlJZGVudGlmaWVyW10+IHtcblx0XHRyZXR1cm4gdGhpcy5pbXBsLmdldEJhY2t1cHMoKTtcblx0fVxuXG5cdHJlc29sdmU8VCBleHRlbmRzIElXb3JraW5nQ29weUJhY2t1cE1ldGE+KGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwPFQ+IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW1wbC5yZXNvbHZlKGlkZW50aWZpZXIpO1xuXHR9XG5cblx0dG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5pbXBsLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cdH1cblxuXHRqb2luQmFja3VwcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbXBsLmpvaW5CYWNrdXBzKCk7XG5cdH1cbn1cblxuY2xhc3MgV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlSW1wbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQUkVBTUJMRV9FTkRfTUFSS0VSID0gJ1xcbic7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSRUFNQkxFX0VORF9NQVJLRVJfQ0hBUkNPREUgPSAnXFxuJy5jaGFyQ29kZUF0KDApO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQUkVBTUJMRV9NRVRBX1NFUEFSQVRPUiA9ICcgJzsgLy8gdXNpbmcgYSBjaGFyYWN0ZXIgdGhhdCBpcyBrbm93IHRvIGJlIGVzY2FwZWQgaW4gYSBVUkkgYXMgc2VwYXJhdG9yXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSRUFNQkxFX01BWF9MRU5HVEggPSAxMDAwMDtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlvT3BlcmF0aW9uUXVldWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlc291cmNlUXVldWUoKSk7IC8vIHF1ZXVlIElPIG9wZXJhdGlvbnMgdG8gZW5zdXJlIHdyaXRlL2RlbGV0ZSBmaWxlIG9yZGVyXG5cblx0cHJpdmF0ZSByZWFkeSE6IFByb21pc2U8V29ya2luZ0NvcHlCYWNrdXBzTW9kZWw+O1xuXHRwcml2YXRlIG1vZGVsOiBXb3JraW5nQ29weUJhY2t1cHNNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGJhY2t1cFdvcmtzcGFjZUhvbWU6IFVSSSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5pbml0aWFsaXplKGJhY2t1cFdvcmtzcGFjZUhvbWUpO1xuXHR9XG5cblx0aW5pdGlhbGl6ZShiYWNrdXBXb3Jrc3BhY2VSZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5iYWNrdXBXb3Jrc3BhY2VIb21lID0gYmFja3VwV29ya3NwYWNlUmVzb3VyY2U7XG5cblx0XHR0aGlzLnJlYWR5ID0gdGhpcy5kb0luaXRpYWxpemUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Jbml0aWFsaXplKCk6IFByb21pc2U8V29ya2luZ0NvcHlCYWNrdXBzTW9kZWw+IHtcblxuXHRcdC8vIENyZWF0ZSBiYWNrdXAgbW9kZWxcblx0XHR0aGlzLm1vZGVsID0gYXdhaXQgV29ya2luZ0NvcHlCYWNrdXBzTW9kZWwuY3JlYXRlKHRoaXMuYmFja3VwV29ya3NwYWNlSG9tZSwgdGhpcy5maWxlU2VydmljZSk7XG5cblx0XHRyZXR1cm4gdGhpcy5tb2RlbDtcblx0fVxuXG5cdGhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgdmVyc2lvbklkPzogbnVtYmVyLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJhY2t1cFJlc291cmNlID0gdGhpcy50b0JhY2t1cFJlc291cmNlKGlkZW50aWZpZXIpO1xuXG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaGFzKGJhY2t1cFJlc291cmNlLCB2ZXJzaW9uSWQsIG1ldGEpO1xuXHR9XG5cblx0YXN5bmMgYmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIGNvbnRlbnQ/OiBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgdmVyc2lvbklkPzogbnVtYmVyLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5yZWFkeTtcblx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cdFx0aWYgKG1vZGVsLmhhcyhiYWNrdXBSZXNvdXJjZSwgdmVyc2lvbklkLCBtZXRhKSkge1xuXHRcdFx0Ly8gcmV0dXJuIGVhcmx5IGlmIGJhY2t1cCB2ZXJzaW9uIGlkIG1hdGNoZXMgcmVxdWVzdGVkIG9uZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmlvT3BlcmF0aW9uUXVldWVzLnF1ZXVlRm9yKGJhY2t1cFJlc291cmNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsLmhhcyhiYWNrdXBSZXNvdXJjZSwgdmVyc2lvbklkLCBtZXRhKSkge1xuXHRcdFx0XHQvLyByZXR1cm4gZWFybHkgaWYgYmFja3VwIHZlcnNpb24gaWQgbWF0Y2hlcyByZXF1ZXN0ZWQgb25lXG5cdFx0XHRcdC8vIHRoaXMgY2FuIGhhcHBlbiB3aGVuIG11bHRpcGxlIGJhY2t1cCBJTyBvcGVyYXRpb25zIGdvdFxuXHRcdFx0XHQvLyBzY2hlZHVsZWQsIHJhY2luZyBhZ2FpbnN0IGVhY2ggb3RoZXIuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5jb2RlIGFzOiBSZXNvdXJjZSArIE1FVEEtU1RBUlQgKyBNZXRhICsgRU5EXG5cdFx0XHQvLyBhbmQgcmVzcGVjdCBtYXggbGVuZ3RoIHJlc3RyaWN0aW9ucyBpbiBjYXNlXG5cdFx0XHQvLyBtZXRhIGlzIHRvbyBsYXJnZS5cblx0XHRcdGxldCBwcmVhbWJsZSA9IHRoaXMuY3JlYXRlUHJlYW1ibGUoaWRlbnRpZmllciwgbWV0YSk7XG5cdFx0XHRpZiAocHJlYW1ibGUubGVuZ3RoID49IFdvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwuUFJFQU1CTEVfTUFYX0xFTkdUSCkge1xuXHRcdFx0XHRwcmVhbWJsZSA9IHRoaXMuY3JlYXRlUHJlYW1ibGUoaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSBiYWNrdXAgd2l0aCB2YWx1ZVxuXHRcdFx0Y29uc3QgcHJlYW1ibGVCdWZmZXIgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKHByZWFtYmxlKTtcblx0XHRcdGxldCBiYWNrdXBCdWZmZXI6IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGU7XG5cdFx0XHRpZiAoaXNSZWFkYWJsZVN0cmVhbShjb250ZW50KSkge1xuXHRcdFx0XHRiYWNrdXBCdWZmZXIgPSBwcmVmaXhlZEJ1ZmZlclN0cmVhbShwcmVhbWJsZUJ1ZmZlciwgY29udGVudCk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0YmFja3VwQnVmZmVyID0gcHJlZml4ZWRCdWZmZXJSZWFkYWJsZShwcmVhbWJsZUJ1ZmZlciwgY29udGVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRiYWNrdXBCdWZmZXIgPSBWU0J1ZmZlci5jb25jYXQoW3ByZWFtYmxlQnVmZmVyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKV0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXcml0ZSBiYWNrdXAgdmlhIGZpbGUgc2VydmljZVxuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoYmFja3VwUmVzb3VyY2UsIGJhY2t1cEJ1ZmZlcik7XG5cblx0XHRcdC8vXG5cdFx0XHQvLyBVcGRhdGUgbW9kZWxcblx0XHRcdC8vXG5cdFx0XHQvLyBOb3RlOiBub3QgY2hlY2tpbmcgZm9yIGNhbmNlbGxhdGlvbiBoZXJlIGJlY2F1c2UgYSBzdWNjZXNzZnVsXG5cdFx0XHQvLyB3cml0ZSBpbnRvIHRoZSBiYWNrdXAgZmlsZSBzaG91bGQgYmUgbm90ZWQgaW4gdGhlIG1vZGVsIHRvXG5cdFx0XHQvLyBwcmV2ZW50IHRoZSBtb2RlbCBiZWluZyBvdXQgb2Ygc3luYyB3aXRoIHRoZSBiYWNrdXAgZmlsZVxuXHRcdFx0bW9kZWwuYWRkKGJhY2t1cFJlc291cmNlLCB2ZXJzaW9uSWQsIG1ldGEpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQcmVhbWJsZShpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2lkZW50aWZpZXIucmVzb3VyY2UudG9TdHJpbmcoKX0ke1dvcmtpbmdDb3B5QmFja3VwU2VydmljZUltcGwuUFJFQU1CTEVfTUVUQV9TRVBBUkFUT1J9JHtKU09OLnN0cmluZ2lmeSh7IC4uLm1ldGEsIHR5cGVJZDogaWRlbnRpZmllci50eXBlSWQgfSl9JHtXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsLlBSRUFNQkxFX0VORF9NQVJLRVJ9YDtcblx0fVxuXG5cdGFzeW5jIGRpc2NhcmRCYWNrdXBzKGZpbHRlcj86IHsgZXhjZXB0OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5yZWFkeTtcblxuXHRcdC8vIERpc2NhcmQgYWxsIGJ1dCBzb21lIGJhY2t1cHNcblx0XHRjb25zdCBleGNlcHQgPSBmaWx0ZXI/LmV4Y2VwdDtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShleGNlcHQpICYmIGV4Y2VwdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBleGNlcHRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0XHRcdGZvciAoY29uc3QgZXhjZXB0V29ya2luZ0NvcHkgb2YgZXhjZXB0KSB7XG5cdFx0XHRcdGV4Y2VwdE1hcC5zZXQodGhpcy50b0JhY2t1cFJlc291cmNlKGV4Y2VwdFdvcmtpbmdDb3B5KSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQobW9kZWwuZ2V0KCkubWFwKGFzeW5jIGJhY2t1cFJlc291cmNlID0+IHtcblx0XHRcdFx0aWYgKCFleGNlcHRNYXAuaGFzKGJhY2t1cFJlc291cmNlKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9EaXNjYXJkQmFja3VwKGJhY2t1cFJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIERpc2NhcmQgYWxsIGJhY2t1cHNcblx0XHRlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlSWdub3JlRmlsZU5vdEZvdW5kKHRoaXMuYmFja3VwV29ya3NwYWNlSG9tZSk7XG5cblx0XHRcdG1vZGVsLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzY2FyZEJhY2t1cChpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cblx0XHRyZXR1cm4gdGhpcy5kb0Rpc2NhcmRCYWNrdXAoYmFja3VwUmVzb3VyY2UsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9EaXNjYXJkQmFja3VwKGJhY2t1cFJlc291cmNlOiBVUkksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMucmVhZHk7XG5cdFx0aWYgKHRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmlvT3BlcmF0aW9uUXVldWVzLnF1ZXVlRm9yKGJhY2t1cFJlc291cmNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVsZXRlIGJhY2t1cCBmaWxlIGlnbm9yaW5nIGFueSBmaWxlIG5vdCBmb3VuZCBlcnJvcnNcblx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlSWdub3JlRmlsZU5vdEZvdW5kKGJhY2t1cFJlc291cmNlKTtcblxuXHRcdFx0Ly9cblx0XHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdFx0Ly9cblx0XHRcdC8vIE5vdGU6IG5vdCBjaGVja2luZyBmb3IgY2FuY2VsbGF0aW9uIGhlcmUgYmVjYXVzZSBhIHN1Y2Nlc3NmdWxcblx0XHRcdC8vIGRlbGV0ZSBvZiB0aGUgYmFja3VwIGZpbGUgc2hvdWxkIGJlIG5vdGVkIGluIHRoZSBtb2RlbCB0b1xuXHRcdFx0Ly8gcHJldmVudCB0aGUgbW9kZWwgYmVpbmcgb3V0IG9mIHN5bmMgd2l0aCB0aGUgYmFja3VwIGZpbGVcblx0XHRcdG1vZGVsLnJlbW92ZShiYWNrdXBSZXNvdXJjZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlbGV0ZUlnbm9yZUZpbGVOb3RGb3VuZChiYWNrdXBSZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGJhY2t1cFJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRocm93IGVycm9yOyAvLyByZS10aHJvdyBhbnkgb3RoZXIgZXJyb3IgdGhhbiBmaWxlIG5vdCBmb3VuZCB3aGljaCBpcyBPS1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEJhY2t1cHMoKTogUHJvbWlzZTxJV29ya2luZ0NvcHlJZGVudGlmaWVyW10+IHtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMucmVhZHk7XG5cblx0XHQvLyBFbnN1cmUgdG8gYXdhaXQgYW55IHBlbmRpbmcgYmFja3VwIG9wZXJhdGlvbnNcblx0XHRhd2FpdCB0aGlzLmpvaW5CYWNrdXBzKCk7XG5cblx0XHRjb25zdCBiYWNrdXBzID0gYXdhaXQgUHJvbWlzZS5hbGwobW9kZWwuZ2V0KCkubWFwKGJhY2t1cFJlc291cmNlID0+IHRoaXMucmVzb2x2ZUlkZW50aWZpZXIoYmFja3VwUmVzb3VyY2UsIG1vZGVsKSkpO1xuXG5cdFx0cmV0dXJuIGNvYWxlc2NlKGJhY2t1cHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlSWRlbnRpZmllcihiYWNrdXBSZXNvdXJjZTogVVJJLCBtb2RlbDogV29ya2luZ0NvcHlCYWNrdXBzTW9kZWwpOiBQcm9taXNlPElXb3JraW5nQ29weUlkZW50aWZpZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgcmVzOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0YXdhaXQgdGhpcy5pb09wZXJhdGlvblF1ZXVlcy5xdWV1ZUZvcihiYWNrdXBSZXNvdXJjZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCFtb2RlbC5oYXMoYmFja3VwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gcmVxdWlyZSBiYWNrdXAgdG8gYmUgcHJlc2VudFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWFkIHRoZSBlbnRpcmUgYmFja3VwIHByZWFtYmxlIGJ5IHJlYWRpbmcgdXAgdG9cblx0XHRcdC8vIGBQUkVBTUJMRV9NQVhfTEVOR1RIYCBpbiB0aGUgYmFja3VwIGZpbGUgdW50aWxcblx0XHRcdC8vIHRoZSBgUFJFQU1CTEVfRU5EX01BUktFUmAgaXMgZm91bmRcblx0XHRcdGNvbnN0IGJhY2t1cFByZWFtYmxlID0gYXdhaXQgdGhpcy5yZWFkVG9NYXRjaGluZ1N0cmluZyhiYWNrdXBSZXNvdXJjZSwgV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlSW1wbC5QUkVBTUJMRV9FTkRfTUFSS0VSLCBXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsLlBSRUFNQkxFX01BWF9MRU5HVEgpO1xuXHRcdFx0aWYgKCFiYWNrdXBQcmVhbWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpZ3VyZSBvdXQgdGhlIG9mZnNldCBpbiB0aGUgcHJlYW1ibGUgd2hlcmUgbWV0YVxuXHRcdFx0Ly8gaW5mb3JtYXRpb24gcG9zc2libHkgc3RhcnRzLiBUaGlzIGNhbiBiZSBgLTFgIGZvclxuXHRcdFx0Ly8gb2xkZXIgYmFja3VwcyB3aXRob3V0IG1ldGEuXG5cdFx0XHRjb25zdCBtZXRhU3RhcnRJbmRleCA9IGJhY2t1cFByZWFtYmxlLmluZGV4T2YoV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlSW1wbC5QUkVBTUJMRV9NRVRBX1NFUEFSQVRPUik7XG5cblx0XHRcdC8vIEV4dHJhY3QgdGhlIHByZWFtYmxlIGNvbnRlbnQgZm9yIHJlc291cmNlIGFuZCBtZXRhXG5cdFx0XHRsZXQgcmVzb3VyY2VQcmVhbWJsZTogc3RyaW5nO1xuXHRcdFx0bGV0IG1ldGFQcmVhbWJsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG1ldGFTdGFydEluZGV4ID4gMCkge1xuXHRcdFx0XHRyZXNvdXJjZVByZWFtYmxlID0gYmFja3VwUHJlYW1ibGUuc3Vic3RyaW5nKDAsIG1ldGFTdGFydEluZGV4KTtcblx0XHRcdFx0bWV0YVByZWFtYmxlID0gYmFja3VwUHJlYW1ibGUuc3Vic3RyKG1ldGFTdGFydEluZGV4ICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvdXJjZVByZWFtYmxlID0gYmFja3VwUHJlYW1ibGU7XG5cdFx0XHRcdG1ldGFQcmVhbWJsZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJ5IHRvIHBhcnNlIHRoZSBtZXRhIHByZWFtYmxlIGZvciBmaWd1cmluZyBvdXRcblx0XHRcdC8vIGB0eXBlSWRgIGFuZCBgbWV0YWAgaWYgZGVmaW5lZC5cblx0XHRcdGNvbnN0IHsgdHlwZUlkLCBtZXRhIH0gPSB0aGlzLnBhcnNlUHJlYW1ibGVNZXRhKG1ldGFQcmVhbWJsZSk7XG5cblx0XHRcdC8vIFVwZGF0ZSBtb2RlbCBlbnRyeSB3aXRoIG5vdyByZXNvbHZlZCBtZXRhXG5cdFx0XHRtb2RlbC51cGRhdGUoYmFja3VwUmVzb3VyY2UsIG1ldGEpO1xuXG5cdFx0XHRyZXMgPSB7XG5cdFx0XHRcdHR5cGVJZDogdHlwZUlkID8/IE5PX1RZUEVfSUQsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UocmVzb3VyY2VQcmVhbWJsZSlcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkVG9NYXRjaGluZ1N0cmluZyhiYWNrdXBSZXNvdXJjZTogVVJJLCBtYXRjaGluZ1N0cmluZzogc3RyaW5nLCBtYXhpbXVtQnl0ZXNUb1JlYWQ6IG51bWJlcik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBSZXNvdXJjZSwgeyBsZW5ndGg6IG1heGltdW1CeXRlc1RvUmVhZCB9KSkudmFsdWUudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IG1hdGNoaW5nU3RyaW5nSW5kZXggPSBjb250ZW50cy5pbmRleE9mKG1hdGNoaW5nU3RyaW5nKTtcblx0XHRpZiAobWF0Y2hpbmdTdHJpbmdJbmRleCA+PSAwKSB7XG5cdFx0XHRyZXR1cm4gY29udGVudHMuc3Vic3RyKDAsIG1hdGNoaW5nU3RyaW5nSW5kZXgpO1xuXHRcdH1cblxuXHRcdC8vIFVuYWJsZSB0byBmaW5kIG1hdGNoaW5nIHN0cmluZyBpbiBmaWxlXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmU8VCBleHRlbmRzIElXb3JraW5nQ29weUJhY2t1cE1ldGE+KGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwPFQ+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMucmVhZHk7XG5cblx0XHRsZXQgcmVzOiBJUmVzb2x2ZWRXb3JraW5nQ29weUJhY2t1cDxUPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGF3YWl0IHRoaXMuaW9PcGVyYXRpb25RdWV1ZXMucXVldWVGb3IoYmFja3VwUmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghbW9kZWwuaGFzKGJhY2t1cFJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHJlcXVpcmUgYmFja3VwIHRvIGJlIHByZXNlbnRcblx0XHRcdH1cblxuXHRcdFx0Ly8gTG9hZCB0aGUgYmFja3VwIGNvbnRlbnQgYW5kIHBlZWsgaW50byB0aGUgZmlyc3QgY2h1bmtcblx0XHRcdC8vIHRvIGJlIGFibGUgdG8gcmVzb2x2ZSB0aGUgbWV0YSBkYXRhXG5cdFx0XHRjb25zdCBiYWNrdXBTdHJlYW0gPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKGJhY2t1cFJlc291cmNlKTtcblx0XHRcdGNvbnN0IHBlZWtlZEJhY2t1cFN0cmVhbSA9IGF3YWl0IHBlZWtTdHJlYW0oYmFja3VwU3RyZWFtLnZhbHVlLCAxKTtcblx0XHRcdGNvbnN0IGZpcnN0QmFja3VwQ2h1bmsgPSBWU0J1ZmZlci5jb25jYXQocGVla2VkQmFja3VwU3RyZWFtLmJ1ZmZlcik7XG5cblx0XHRcdC8vIFdlIGhhdmUgc2VlbiByZXBvcnRzIChlLmcuIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83ODUwMCkgd2hlcmVcblx0XHRcdC8vIGlmIFZTQ29kZSBnb2VzIGRvd24gd2hpbGUgd3JpdGluZyB0aGUgYmFja3VwIGZpbGUsIHRoZSBmaWxlIGNhbiB0dXJuIGVtcHR5IGJlY2F1c2Vcblx0XHRcdC8vIGl0IGFsd2F5cyBmaXJzdCBnZXRzIHRydW5jYXRlZCBhbmQgdGhlbiB3cml0dGVuIHRvLiBJbiB0aGlzIGNhc2UsIHdlIHdpbGwgbm90IGZpbmRcblx0XHRcdC8vIHRoZSBtZXRhLWVuZCBtYXJrZXIgKCdcXG4nKSBhbmQgYXMgc3VjaCB0aGUgYmFja3VwIGNhbiBvbmx5IGJlIGludmFsaWQuIFdlIGJhaWwgb3V0XG5cdFx0XHQvLyBoZXJlIGlmIHRoYXQgaXMgdGhlIGNhc2UuXG5cdFx0XHRjb25zdCBwcmVhbWJsZUVuZEluZGV4ID0gZmlyc3RCYWNrdXBDaHVuay5idWZmZXIuaW5kZXhPZihXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsLlBSRUFNQkxFX0VORF9NQVJLRVJfQ0hBUkNPREUpO1xuXHRcdFx0aWYgKHByZWFtYmxlRW5kSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQmFja3VwOiBDb3VsZCBub3QgZmluZCBtZXRhIGVuZCBtYXJrZXIgaW4gJHtiYWNrdXBSZXNvdXJjZX0uIFRoZSBmaWxlIGlzIHByb2JhYmx5IGNvcnJ1cHQgKGZpbGVzaXplOiAke2JhY2t1cFN0cmVhbS5zaXplfSkuYCk7XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJlYW1iZWxSYXcgPSBmaXJzdEJhY2t1cENodW5rLnNsaWNlKDAsIHByZWFtYmxlRW5kSW5kZXgpLnRvU3RyaW5nKCk7XG5cblx0XHRcdC8vIEV4dHJhY3QgbWV0YSBkYXRhIChpZiBhbnkpXG5cdFx0XHRsZXQgbWV0YTogVCB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1ldGFTdGFydEluZGV4ID0gcHJlYW1iZWxSYXcuaW5kZXhPZihXb3JraW5nQ29weUJhY2t1cFNlcnZpY2VJbXBsLlBSRUFNQkxFX01FVEFfU0VQQVJBVE9SKTtcblx0XHRcdGlmIChtZXRhU3RhcnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0bWV0YSA9IHRoaXMucGFyc2VQcmVhbWJsZU1ldGEocHJlYW1iZWxSYXcuc3Vic3RyKG1ldGFTdGFydEluZGV4ICsgMSkpLm1ldGEgYXMgVDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIG1vZGVsIGVudHJ5IHdpdGggbm93IHJlc29sdmVkIG1ldGFcblx0XHRcdG1vZGVsLnVwZGF0ZShiYWNrdXBSZXNvdXJjZSwgbWV0YSk7XG5cblx0XHRcdC8vIEJ1aWxkIGEgbmV3IHN0cmVhbSB3aXRob3V0IHRoZSBwcmVhbWJsZVxuXHRcdFx0Y29uc3QgZmlyc3RCYWNrdXBDaHVua1dpdGhvdXRQcmVhbWJsZSA9IGZpcnN0QmFja3VwQ2h1bmsuc2xpY2UocHJlYW1ibGVFbmRJbmRleCArIDEpO1xuXHRcdFx0bGV0IHZhbHVlOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtO1xuXHRcdFx0aWYgKHBlZWtlZEJhY2t1cFN0cmVhbS5lbmRlZCkge1xuXHRcdFx0XHR2YWx1ZSA9IGJ1ZmZlclRvU3RyZWFtKGZpcnN0QmFja3VwQ2h1bmtXaXRob3V0UHJlYW1ibGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFsdWUgPSBwcmVmaXhlZEJ1ZmZlclN0cmVhbShmaXJzdEJhY2t1cENodW5rV2l0aG91dFByZWFtYmxlLCBwZWVrZWRCYWNrdXBTdHJlYW0uc3RyZWFtKTtcblx0XHRcdH1cblxuXHRcdFx0cmVzID0geyB2YWx1ZSwgbWV0YSB9O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VQcmVhbWJsZU1ldGE8VCBleHRlbmRzIElXb3JraW5nQ29weUJhY2t1cE1ldGE+KHByZWFtYmxlTWV0YVJhdzogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyB0eXBlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgbWV0YTogVCB8IHVuZGVmaW5lZCB9IHtcblx0XHRsZXQgdHlwZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IG1ldGE6IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAocHJlYW1ibGVNZXRhUmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRtZXRhID0gSlNPTi5wYXJzZShwcmVhbWJsZU1ldGFSYXcpO1xuXHRcdFx0XHR0eXBlSWQgPSBtZXRhPy50eXBlSWQ7XG5cblx0XHRcdFx0Ly8gYHR5cGVJZGAgaXMgYSBwcm9wZXJ0eSB0aGF0IHdlIGFkZCBzbyB3ZVxuXHRcdFx0XHQvLyByZW1vdmUgaXQgd2hlbiByZXR1cm5pbmcgdG8gY2xpZW50cy5cblx0XHRcdFx0aWYgKHR5cGVvZiBtZXRhPy50eXBlSWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIG1ldGEudHlwZUlkO1xuXG5cdFx0XHRcdFx0aWYgKGlzRW1wdHlPYmplY3QobWV0YSkpIHtcblx0XHRcdFx0XHRcdG1ldGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBpZ25vcmUgSlNPTiBwYXJzZSBlcnJvcnNcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB0eXBlSWQsIG1ldGEgfTtcblx0fVxuXG5cdHRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFVSSSB7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKHRoaXMuYmFja3VwV29ya3NwYWNlSG9tZSwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblx0fVxuXG5cdGpvaW5CYWNrdXBzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmlvT3BlcmF0aW9uUXVldWVzLndoZW5EcmFpbmVkKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluTWVtb3J5V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgYmFja3VwcyA9IG5ldyBSZXNvdXJjZU1hcDx7IHR5cGVJZDogc3RyaW5nOyBjb250ZW50OiBWU0J1ZmZlcjsgbWV0YT86IElXb3JraW5nQ29weUJhY2t1cE1ldGEgfT4oKTtcblxuXHRoYXNCYWNrdXBTeW5jKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIHZlcnNpb25JZD86IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGJhY2t1cFJlc291cmNlID0gdGhpcy50b0JhY2t1cFJlc291cmNlKGlkZW50aWZpZXIpO1xuXG5cdFx0cmV0dXJuIHRoaXMuYmFja3Vwcy5oYXMoYmFja3VwUmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgYmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIGNvbnRlbnQ/OiBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgdmVyc2lvbklkPzogbnVtYmVyLCBtZXRhPzogSVdvcmtpbmdDb3B5QmFja3VwTWV0YSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJhY2t1cFJlc291cmNlID0gdGhpcy50b0JhY2t1cFJlc291cmNlKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMuYmFja3Vwcy5zZXQoYmFja3VwUmVzb3VyY2UsIHtcblx0XHRcdHR5cGVJZDogaWRlbnRpZmllci50eXBlSWQsXG5cdFx0XHRjb250ZW50OiBjb250ZW50IGluc3RhbmNlb2YgVlNCdWZmZXIgPyBjb250ZW50IDogY29udGVudCA/IGlzUmVhZGFibGVTdHJlYW0oY29udGVudCkgPyBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihjb250ZW50KSA6IHJlYWRhYmxlVG9CdWZmZXIoY29udGVudCkgOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSxcblx0XHRcdG1ldGFcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmU8VCBleHRlbmRzIElXb3JraW5nQ29weUJhY2t1cE1ldGE+KGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwPFQ+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgYmFja3VwID0gdGhpcy5iYWNrdXBzLmdldChiYWNrdXBSZXNvdXJjZSk7XG5cdFx0aWYgKGJhY2t1cCkge1xuXHRcdFx0cmV0dXJuIHsgdmFsdWU6IGJ1ZmZlclRvU3RyZWFtKGJhY2t1cC5jb250ZW50KSwgbWV0YTogYmFja3VwLm1ldGEgYXMgVCB8IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRCYWNrdXBzKCk6IFByb21pc2U8SVdvcmtpbmdDb3B5SWRlbnRpZmllcltdPiB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5iYWNrdXBzLmVudHJpZXMoKSkubWFwKChbcmVzb3VyY2UsIGJhY2t1cF0pID0+ICh7IHR5cGVJZDogYmFja3VwLnR5cGVJZCwgcmVzb3VyY2UgfSkpO1xuXHR9XG5cblx0YXN5bmMgZGlzY2FyZEJhY2t1cChpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5iYWNrdXBzLmRlbGV0ZSh0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcikpO1xuXHR9XG5cblx0YXN5bmMgZGlzY2FyZEJhY2t1cHMoZmlsdGVyPzogeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhjZXB0ID0gZmlsdGVyPy5leGNlcHQ7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZXhjZXB0KSAmJiBleGNlcHQubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZXhjZXB0TWFwID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4Y2VwdFdvcmtpbmdDb3B5IG9mIGV4Y2VwdCkge1xuXHRcdFx0XHRleGNlcHRNYXAuc2V0KHRoaXMudG9CYWNrdXBSZXNvdXJjZShleGNlcHRXb3JraW5nQ29weSksIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGJhY2t1cCBvZiBhd2FpdCB0aGlzLmdldEJhY2t1cHMoKSkge1xuXHRcdFx0XHRpZiAoIWV4Y2VwdE1hcC5oYXModGhpcy50b0JhY2t1cFJlc291cmNlKGJhY2t1cCkpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kaXNjYXJkQmFja3VwKGJhY2t1cCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5iYWNrdXBzLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0dG9CYWNrdXBSZXNvdXJjZShpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6IGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpIH0pO1xuXHR9XG5cblx0YXN5bmMgam9pbkJhY2t1cHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cbi8qXG4gKiBFeHBvcnRlZCBvbmx5IGZvciB0ZXN0aW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNoSWRlbnRpZmllcihpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogc3RyaW5nIHtcblxuXHQvLyBJTVBPUlRBTlQ6IGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSwgZW5zdXJlIHRoYXRcblx0Ly8gd2UgaWdub3JlIHRoZSBgdHlwZUlkYCB1bmxlc3MgYSB2YWx1ZSBpcyBwcm92aWRlZC5cblx0Ly8gVG8gcHJlc2VydmUgcHJldmlvdXMgYmFja3VwcyB3aXRob3V0IHR5cGUgaWQsIHdlXG5cdC8vIG5lZWQgdG8ganVzdCBoYXNoIHRoZSByZXNvdXJjZS4gT3RoZXJ3aXNlIHdlIHVzZVxuXHQvLyB0aGUgdHlwZSBpZCBhcyBhIHNlZWQgdG8gdGhlIHJlc291cmNlIHBhdGguXG5cdGxldCByZXNvdXJjZTogVVJJO1xuXHRpZiAoaWRlbnRpZmllci50eXBlSWQubGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IHR5cGVJZEhhc2ggPSBoYXNoU3RyaW5nKGlkZW50aWZpZXIudHlwZUlkKTtcblx0XHRpZiAoaWRlbnRpZmllci5yZXNvdXJjZS5wYXRoKSB7XG5cdFx0XHRyZXNvdXJjZSA9IGpvaW5QYXRoKGlkZW50aWZpZXIucmVzb3VyY2UsIHR5cGVJZEhhc2gpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IGlkZW50aWZpZXIucmVzb3VyY2Uud2l0aCh7IHBhdGg6IHR5cGVJZEhhc2ggfSk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJlc291cmNlID0gaWRlbnRpZmllci5yZXNvdXJjZTtcblx0fVxuXG5cdHJldHVybiBoYXNoUGF0aChyZXNvdXJjZSk7XG59XG5cbmZ1bmN0aW9uIGhhc2hQYXRoKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRjb25zdCBzdHIgPSByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fCByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgPyByZXNvdXJjZS5mc1BhdGggOiByZXNvdXJjZS50b1N0cmluZygpO1xuXG5cdHJldHVybiBoYXNoU3RyaW5nKHN0cik7XG59XG5cbmZ1bmN0aW9uIGhhc2hTdHJpbmcoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gaGFzaChzdHIpLnRvU3RyaW5nKDE2KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsUUFBUSxpQkFBaUI7QUFDbEMsU0FBUyxVQUFVLHFCQUFxQjtBQUV4QyxTQUFTLGNBQWtDLDJCQUEyQjtBQUN0RSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQixrQkFBa0I7QUFDN0MsU0FBUyxnQkFBZ0Isd0JBQXdCLHNCQUFzQixrQkFBa0IsZ0JBQWdCLGdCQUEwRDtBQUNuSyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUU1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMscUJBQXFCO0FBQzlCLFNBQXlELGtCQUFrQjtBQUVwRSxNQUFNLHdCQUF3QjtBQUFBLEVBWTVCLFlBQW9CLFlBQXlCLGFBQTJCO0FBQXBEO0FBQXlCO0FBVnJELFNBQWlCLFFBQVEsSUFBSSxZQUFtRTtBQUFBLEVBVWQ7QUFBQSxFQVJsRixhQUFhLE9BQU8sWUFBaUIsYUFBNkQ7QUFDakcsVUFBTSxRQUFRLElBQUksd0JBQXdCLFlBQVksV0FBVztBQUVqRSxVQUFNLE1BQU0sUUFBUTtBQUVwQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBSUEsTUFBYyxVQUF5QjtBQUN0QyxRQUFJO0FBQ0gsWUFBTSxpQkFBaUIsTUFBTSxLQUFLLFlBQVksUUFBUSxLQUFLLFVBQVU7QUFDckUsVUFBSSxlQUFlLFVBQVU7QUFDNUIsY0FBTSxTQUFTLFFBQVEsZUFBZSxTQUNwQyxPQUFPLFdBQVMsTUFBTSxXQUFX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
