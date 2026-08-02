import { Throttler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ExtUri } from "../../../base/common/resources.js";
import { isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { createFileSystemProviderError, FileChangeType, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType } from "../common/files.js";
import { BroadcastDataChannel } from "../../../base/browser/broadcast.js";
const ERR_FILE_NOT_FOUND = createFileSystemProviderError(localize("fileNotExists", "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
const ERR_FILE_IS_DIR = createFileSystemProviderError(localize("fileIsDirectory", "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory);
const ERR_FILE_NOT_DIR = createFileSystemProviderError(localize("fileNotDirectory", "File is not a directory"), FileSystemProviderErrorCode.FileNotADirectory);
const ERR_DIR_NOT_EMPTY = createFileSystemProviderError(localize("dirIsNotEmpty", "Directory is not empty"), FileSystemProviderErrorCode.Unknown);
const ERR_FILE_EXCEEDS_STORAGE_QUOTA = createFileSystemProviderError(localize("fileExceedsStorageQuota", "File exceeds available storage quota"), FileSystemProviderErrorCode.FileExceedsStorageQuota);
const ERR_UNKNOWN_INTERNAL = (message) => createFileSystemProviderError(localize("internal", "Internal error occurred in IndexedDB File System Provider. ({0})", message), FileSystemProviderErrorCode.Unknown);
class IndexedDBFileSystemNode {
  constructor(entry) {
    this.entry = entry;
    this.type = entry.type;
  }
  read(path) {
    return this.doRead(path.split("/").filter((p) => p.length));
  }
  doRead(pathParts) {
    if (pathParts.length === 0) {
      return this.entry;
    }
    if (this.entry.type !== FileType.Directory) {
      throw ERR_UNKNOWN_INTERNAL("Internal error reading from IndexedDBFSNode -- expected directory at " + this.entry.path);
    }
    const next = this.entry.children.get(pathParts[0]);
    if (!next) {
      return void 0;
    }
    return next.doRead(pathParts.slice(1));
  }
  delete(path) {
    const toDelete = path.split("/").filter((p) => p.length);
    if (toDelete.length === 0) {
      if (this.entry.type !== FileType.Directory) {
        throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode. Expected root entry to be directory`);
      }
      this.entry.children.clear();
    } else {
      return this.doDelete(toDelete, path);
    }
  }
  doDelete(pathParts, originalPath) {
    if (pathParts.length === 0) {
      throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode -- got no deletion path parts (encountered while deleting ${originalPath})`);
    } else if (this.entry.type !== FileType.Directory) {
      throw ERR_UNKNOWN_INTERNAL("Internal error deleting from IndexedDBFSNode -- expected directory at " + this.entry.path);
    } else if (pathParts.length === 1) {
      this.entry.children.delete(pathParts[0]);
    } else {
      const next = this.entry.children.get(pathParts[0]);
      if (!next) {
        throw ERR_UNKNOWN_INTERNAL("Internal error deleting from IndexedDBFSNode -- expected entry at " + this.entry.path + "/" + next);
      }
      next.doDelete(pathParts.slice(1), originalPath);
    }
  }
  add(path, entry) {
    this.doAdd(path.split("/").filter((p) => p.length), entry, path);
  }
  doAdd(pathParts, entry, originalPath) {
    if (pathParts.length === 0) {
      throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- adding empty path (encountered while adding ${originalPath})`);
    } else if (this.entry.type !== FileType.Directory) {
      throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- parent is not a directory (encountered while adding ${originalPath})`);
    } else if (pathParts.length === 1) {
      const next = pathParts[0];
      const existing = this.entry.children.get(next);
      if (entry.type === "dir") {
        if (existing?.entry.type === FileType.File) {
          throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
        }
        this.entry.children.set(next, existing ?? new IndexedDBFileSystemNode({
          type: FileType.Directory,
          path: this.entry.path + "/" + next,
          children: /* @__PURE__ */ new Map()
        }));
      } else {
        if (existing?.entry.type === FileType.Directory) {
          throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting directory with file: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
        }
        this.entry.children.set(next, new IndexedDBFileSystemNode({
          type: FileType.File,
          path: this.entry.path + "/" + next,
          size: entry.size
        }));
      }
    } else if (pathParts.length > 1) {
      const next = pathParts[0];
      let childNode = this.entry.children.get(next);
      if (!childNode) {
        childNode = new IndexedDBFileSystemNode({
          children: /* @__PURE__ */ new Map(),
          path: this.entry.path + "/" + next,
          type: FileType.Directory
        });
        this.entry.children.set(next, childNode);
      } else if (childNode.type === FileType.File) {
        throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file entry with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
      }
      childNode.doAdd(pathParts.slice(1), entry, originalPath);
    }
  }
  print(indentation = "") {
    console.log(indentation + this.entry.path);
    if (this.entry.type === FileType.Directory) {
      this.entry.children.forEach((child) => child.print(indentation + " "));
    }
  }
}
class IndexedDBFileSystemProvider extends Disposable {
  constructor(scheme, indexedDB, store, watchCrossWindowChanges) {
    super();
    this.scheme = scheme;
    this.indexedDB = indexedDB;
    this.store = store;
    this.capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend | FileSystemProviderCapabilities.PathCaseSensitive;
    this.onDidChangeCapabilities = Event.None;
    this.extUri = new ExtUri(() => false);
    this._onDidChangeFile = this._register(new Emitter());
    this.onDidChangeFile = this._onDidChangeFile.event;
    this.mtimes = /* @__PURE__ */ new Map();
    this.fileWriteBatch = [];
    this.writeManyThrottler = new Throttler();
    if (watchCrossWindowChanges) {
      this.changesBroadcastChannel = this._register(new BroadcastDataChannel(`vscode.indexedDB.${scheme}.changes`));
      this._register(this.changesBroadcastChannel.onDidReceiveData((changes) => {
        this._onDidChangeFile.fire(changes.map((c) => ({ type: c.type, resource: URI.revive(c.resource) })));
      }));
    }
  }
  watch(resource, opts) {
    return Disposable.None;
  }
  async mkdir(resource) {
    try {
      const resourceStat = await this.stat(resource);
      if (resourceStat.type === FileType.File) {
        throw ERR_FILE_NOT_DIR;
      }
    } catch (error) {
    }
    (await this.getFiletree()).add(resource.path, { type: "dir" });
  }
  async stat(resource) {
    const entry = (await this.getFiletree()).read(resource.path);
    if (entry?.type === FileType.File) {
      return {
        type: FileType.File,
        ctime: 0,
        mtime: this.mtimes.get(resource.toString()) || 0,
        size: entry.size ?? (await this.readFile(resource)).byteLength
      };
    }
    if (entry?.type === FileType.Directory) {
      return {
        type: FileType.Directory,
        ctime: 0,
        mtime: 0,
        size: 0
      };
    }
    throw ERR_FILE_NOT_FOUND;
  }
  async readdir(resource) {
    const entry = (await this.getFiletree()).read(resource.path);
    if (!entry) {
      return [];
    }
    if (entry.type !== FileType.Directory) {
      throw ERR_FILE_NOT_DIR;
    } else {
      return [...entry.children.entries()].map(([name, node]) => [name, node.type]);
    }
  }
  async readFile(resource) {
    const result = await this.indexedDB.runInTransaction(this.store, "readonly", (objectStore) => objectStore.get(resource.path));
    if (result === void 0) {
      throw ERR_FILE_NOT_FOUND;
    }
    const buffer = result instanceof Uint8Array ? result : isString(result) ? VSBuffer.fromString(result).buffer : void 0;
    if (buffer === void 0) {
      throw ERR_UNKNOWN_INTERNAL(`IndexedDB entry at "${resource.path}" in unexpected format`);
    }
    const fileTree = await this.getFiletree();
    fileTree.add(resource.path, { type: "file", size: buffer.byteLength });
    return buffer;
  }
  async writeFile(resource, content, opts) {
    const existing = await this.stat(resource).catch(() => void 0);
    if (existing?.type === FileType.Directory) {
      throw ERR_FILE_IS_DIR;
    }
    let finalContent = content;
    if (opts.append && existing) {
      const existingContent = await this.readFile(resource);
      const combined = new Uint8Array(existingContent.byteLength + content.byteLength);
      combined.set(existingContent, 0);
      combined.set(content, existingContent.byteLength);
      finalContent = combined;
    }
    await this.bulkWrite([[resource, finalContent]]);
  }
  async rename(from, to, opts) {
    const fileTree = await this.getFiletree();
    const fromEntry = fileTree.read(from.path);
    if (!fromEntry) {
      throw ERR_FILE_NOT_FOUND;
    }
    const toEntry = fileTree.read(to.path);
    if (toEntry) {
      if (!opts.overwrite) {
        throw createFileSystemProviderError("file exists already", FileSystemProviderErrorCode.FileExists);
      }
      if (toEntry.type !== fromEntry.type) {
        throw createFileSystemProviderError("Cannot rename files with different types", FileSystemProviderErrorCode.Unknown);
      }
      await this.delete(to, { recursive: true, useTrash: false, atomic: false });
    }
    const toTargetResource = (path) => this.extUri.joinPath(to, this.extUri.relativePath(from, from.with({ path })) || "");
    const sourceEntries = await this.tree(from);
    const sourceFiles = [];
    for (const sourceEntry of sourceEntries) {
      if (sourceEntry[1] === FileType.File) {
        sourceFiles.push(sourceEntry);
      } else if (sourceEntry[1] === FileType.Directory) {
        fileTree.add(toTargetResource(sourceEntry[0]).path, { type: "dir" });
      }
    }
    if (sourceFiles.length) {
      const targetFiles = [];
      const sourceFilesContents = await this.indexedDB.runInTransaction(this.store, "readonly", (objectStore) => sourceFiles.map(([path]) => objectStore.get(path)));
      for (let index = 0; index < sourceFiles.length; index++) {
        const content = sourceFilesContents[index] instanceof Uint8Array ? sourceFilesContents[index] : isString(sourceFilesContents[index]) ? VSBuffer.fromString(sourceFilesContents[index]).buffer : void 0;
        if (content) {
          targetFiles.push([toTargetResource(sourceFiles[index][0]), content]);
        }
      }
      await this.bulkWrite(targetFiles);
    }
    await this.delete(from, { recursive: true, useTrash: false, atomic: false });
  }
  async delete(resource, opts) {
    let stat;
    try {
      stat = await this.stat(resource);
    } catch (e) {
      if (e.code === FileSystemProviderErrorCode.FileNotFound) {
        return;
      }
      throw e;
    }
    let toDelete;
    if (opts.recursive) {
      const tree = await this.tree(resource);
      toDelete = tree.map(([path]) => path);
    } else {
      if (stat.type === FileType.Directory && (await this.readdir(resource)).length) {
        throw ERR_DIR_NOT_EMPTY;
      }
      toDelete = [resource.path];
    }
    await this.deleteKeys(toDelete);
    (await this.getFiletree()).delete(resource.path);
    toDelete.forEach((key) => this.mtimes.delete(key));
    this.triggerChanges(toDelete.map((path) => ({ resource: resource.with({ path }), type: FileChangeType.DELETED })));
  }
  async tree(resource) {
    const stat = await this.stat(resource);
    const allEntries = [[resource.path, stat.type]];
    if (stat.type === FileType.Directory) {
      const dirEntries = await this.readdir(resource);
      for (const [key, type] of dirEntries) {
        const childResource = this.extUri.joinPath(resource, key);
        allEntries.push([childResource.path, type]);
        if (type === FileType.Directory) {
          const childEntries = await this.tree(childResource);
          allEntries.push(...childEntries);
        }
      }
    }
    return allEntries;
  }
  triggerChanges(changes) {
    if (changes.length) {
      this._onDidChangeFile.fire(changes);
      this.changesBroadcastChannel?.postData(changes);
    }
  }
  getFiletree() {
    if (!this.cachedFiletree) {
      this.cachedFiletree = (async () => {
        const rootNode = new IndexedDBFileSystemNode({
          children: /* @__PURE__ */ new Map(),
          path: "",
          type: FileType.Directory
        });
        const result = await this.indexedDB.runInTransaction(this.store, "readonly", (objectStore) => objectStore.getAllKeys());
        const keys = result.map((key) => key.toString());
        keys.forEach((key) => rootNode.add(key, { type: "file" }));
        return rootNode;
      })();
    }
    return this.cachedFiletree;
  }
  async bulkWrite(files) {
    files.forEach(([resource, content]) => this.fileWriteBatch.push({ content, resource }));
    await this.writeManyThrottler.queue(() => this.writeMany());
    const fileTree = await this.getFiletree();
    for (const [resource, content] of files) {
      fileTree.add(resource.path, { type: "file", size: content.byteLength });
      this.mtimes.set(resource.toString(), Date.now());
    }
    this.triggerChanges(files.map(([resource]) => ({ resource, type: FileChangeType.UPDATED })));
  }
  async writeMany() {
    if (this.fileWriteBatch.length) {
      const fileBatch = this.fileWriteBatch.splice(0, this.fileWriteBatch.length);
      try {
        await this.indexedDB.runInTransaction(this.store, "readwrite", (objectStore) => fileBatch.map((entry) => {
          return objectStore.put(entry.content, entry.resource.path);
        }));
      } catch (ex) {
        if (ex instanceof DOMException && ex.name === "QuotaExceededError") {
          throw ERR_FILE_EXCEEDS_STORAGE_QUOTA;
        }
        throw ex;
      }
    }
  }
  async deleteKeys(keys) {
    if (keys.length) {
      await this.indexedDB.runInTransaction(this.store, "readwrite", (objectStore) => keys.map((key) => objectStore.delete(key)));
    }
  }
  async reset() {
    await this.indexedDB.runInTransaction(this.store, "readwrite", (objectStore) => objectStore.clear());
  }
}
export {
  IndexedDBFileSystemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL2Jyb3dzZXIvaW5kZXhlZERCRmlsZVN5c3RlbVByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVGhyb3R0bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRVcmkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUR0byB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciwgRmlsZUNoYW5nZVR5cGUsIElGaWxlRGVsZXRlT3B0aW9ucywgSUZpbGVPdmVyd3JpdGVPcHRpb25zLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgRmlsZVR5cGUsIElGaWxlV3JpdGVPcHRpb25zLCBJRmlsZUNoYW5nZSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgSVN0YXQsIElXYXRjaE9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5kZXhlZERCIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2luZGV4ZWREQi5qcyc7XG5pbXBvcnQgeyBCcm9hZGNhc3REYXRhQ2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm9hZGNhc3QuanMnO1xuXG4vLyBTdGFuZGFyZCBGUyBFcnJvcnMgKGV4cGVjdGVkIHRvIGJlIHRocm93biBpbiBwcm9kdWN0aW9uIHdoZW4gaW52YWxpZCBGUyBvcGVyYXRpb25zIGFyZSByZXF1ZXN0ZWQpXG5jb25zdCBFUlJfRklMRV9OT1RfRk9VTkQgPSBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihsb2NhbGl6ZSgnZmlsZU5vdEV4aXN0cycsIFwiRmlsZSBkb2VzIG5vdCBleGlzdFwiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5jb25zdCBFUlJfRklMRV9JU19ESVIgPSBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihsb2NhbGl6ZSgnZmlsZUlzRGlyZWN0b3J5JywgXCJGaWxlIGlzIERpcmVjdG9yeVwiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVJc0FEaXJlY3RvcnkpO1xuY29uc3QgRVJSX0ZJTEVfTk9UX0RJUiA9IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGxvY2FsaXplKCdmaWxlTm90RGlyZWN0b3J5JywgXCJGaWxlIGlzIG5vdCBhIGRpcmVjdG9yeVwiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RBRGlyZWN0b3J5KTtcbmNvbnN0IEVSUl9ESVJfTk9UX0VNUFRZID0gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IobG9jYWxpemUoJ2RpcklzTm90RW1wdHknLCBcIkRpcmVjdG9yeSBpcyBub3QgZW1wdHlcIiksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Vbmtub3duKTtcbmNvbnN0IEVSUl9GSUxFX0VYQ0VFRFNfU1RPUkFHRV9RVU9UQSA9IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGxvY2FsaXplKCdmaWxlRXhjZWVkc1N0b3JhZ2VRdW90YScsIFwiRmlsZSBleGNlZWRzIGF2YWlsYWJsZSBzdG9yYWdlIHF1b3RhXCIpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4Y2VlZHNTdG9yYWdlUXVvdGEpO1xuXG4vLyBBcmJpdHJhcnkgSW50ZXJuYWwgRXJyb3JzXG5jb25zdCBFUlJfVU5LTk9XTl9JTlRFUk5BTCA9IChtZXNzYWdlOiBzdHJpbmcpID0+IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGxvY2FsaXplKCdpbnRlcm5hbCcsIFwiSW50ZXJuYWwgZXJyb3Igb2NjdXJyZWQgaW4gSW5kZXhlZERCIEZpbGUgU3lzdGVtIFByb3ZpZGVyLiAoezB9KVwiLCBtZXNzYWdlKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVua25vd24pO1xuXG50eXBlIERpckVudHJ5ID0gW3N0cmluZywgRmlsZVR5cGVdO1xuXG50eXBlIEluZGV4ZWREQkZpbGVTeXN0ZW1FbnRyeSA9XG5cdHwge1xuXHRcdHBhdGg6IHN0cmluZztcblx0XHR0eXBlOiBGaWxlVHlwZS5EaXJlY3Rvcnk7XG5cdFx0Y2hpbGRyZW46IE1hcDxzdHJpbmcsIEluZGV4ZWREQkZpbGVTeXN0ZW1Ob2RlPjtcblx0fVxuXHR8IHtcblx0XHRwYXRoOiBzdHJpbmc7XG5cdFx0dHlwZTogRmlsZVR5cGUuRmlsZTtcblx0XHRzaXplOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdH07XG5cbmNsYXNzIEluZGV4ZWREQkZpbGVTeXN0ZW1Ob2RlIHtcblx0cHVibGljIHR5cGU6IEZpbGVUeXBlO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZW50cnk6IEluZGV4ZWREQkZpbGVTeXN0ZW1FbnRyeSkge1xuXHRcdHRoaXMudHlwZSA9IGVudHJ5LnR5cGU7XG5cdH1cblxuXHRyZWFkKHBhdGg6IHN0cmluZyk6IEluZGV4ZWREQkZpbGVTeXN0ZW1FbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZG9SZWFkKHBhdGguc3BsaXQoJy8nKS5maWx0ZXIocCA9PiBwLmxlbmd0aCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlYWQocGF0aFBhcnRzOiBzdHJpbmdbXSk6IEluZGV4ZWREQkZpbGVTeXN0ZW1FbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHBhdGhQYXJ0cy5sZW5ndGggPT09IDApIHsgcmV0dXJuIHRoaXMuZW50cnk7IH1cblx0XHRpZiAodGhpcy5lbnRyeS50eXBlICE9PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IEVSUl9VTktOT1dOX0lOVEVSTkFMKCdJbnRlcm5hbCBlcnJvciByZWFkaW5nIGZyb20gSW5kZXhlZERCRlNOb2RlIC0tIGV4cGVjdGVkIGRpcmVjdG9yeSBhdCAnICsgdGhpcy5lbnRyeS5wYXRoKTtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dCA9IHRoaXMuZW50cnkuY2hpbGRyZW4uZ2V0KHBhdGhQYXJ0c1swXSk7XG5cblx0XHRpZiAoIW5leHQpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdHJldHVybiBuZXh0LmRvUmVhZChwYXRoUGFydHMuc2xpY2UoMSkpO1xuXHR9XG5cblx0ZGVsZXRlKHBhdGg6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRvRGVsZXRlID0gcGF0aC5zcGxpdCgnLycpLmZpbHRlcihwID0+IHAubGVuZ3RoKTtcblx0XHRpZiAodG9EZWxldGUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5lbnRyeS50eXBlICE9PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEludGVybmFsIGVycm9yIGRlbGV0aW5nIGZyb20gSW5kZXhlZERCRlNOb2RlLiBFeHBlY3RlZCByb290IGVudHJ5IHRvIGJlIGRpcmVjdG9yeWApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbnRyeS5jaGlsZHJlbi5jbGVhcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0RlbGV0ZSh0b0RlbGV0ZSwgcGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0RlbGV0ZShwYXRoUGFydHM6IHN0cmluZ1tdLCBvcmlnaW5hbFBhdGg6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBFUlJfVU5LTk9XTl9JTlRFUk5BTChgSW50ZXJuYWwgZXJyb3IgZGVsZXRpbmcgZnJvbSBJbmRleGVkREJGU05vZGUgLS0gZ290IG5vIGRlbGV0aW9uIHBhdGggcGFydHMgKGVuY291bnRlcmVkIHdoaWxlIGRlbGV0aW5nICR7b3JpZ2luYWxQYXRofSlgKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodGhpcy5lbnRyeS50eXBlICE9PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IEVSUl9VTktOT1dOX0lOVEVSTkFMKCdJbnRlcm5hbCBlcnJvciBkZWxldGluZyBmcm9tIEluZGV4ZWREQkZTTm9kZSAtLSBleHBlY3RlZCBkaXJlY3RvcnkgYXQgJyArIHRoaXMuZW50cnkucGF0aCk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMuZW50cnkuY2hpbGRyZW4uZGVsZXRlKHBhdGhQYXJ0c1swXSk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgbmV4dCA9IHRoaXMuZW50cnkuY2hpbGRyZW4uZ2V0KHBhdGhQYXJ0c1swXSk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoJ0ludGVybmFsIGVycm9yIGRlbGV0aW5nIGZyb20gSW5kZXhlZERCRlNOb2RlIC0tIGV4cGVjdGVkIGVudHJ5IGF0ICcgKyB0aGlzLmVudHJ5LnBhdGggKyAnLycgKyBuZXh0KTtcblx0XHRcdH1cblx0XHRcdG5leHQuZG9EZWxldGUocGF0aFBhcnRzLnNsaWNlKDEpLCBvcmlnaW5hbFBhdGgpO1xuXHRcdH1cblx0fVxuXG5cdGFkZChwYXRoOiBzdHJpbmcsIGVudHJ5OiB7IHR5cGU6ICdmaWxlJzsgc2l6ZT86IG51bWJlciB9IHwgeyB0eXBlOiAnZGlyJyB9KSB7XG5cdFx0dGhpcy5kb0FkZChwYXRoLnNwbGl0KCcvJykuZmlsdGVyKHAgPT4gcC5sZW5ndGgpLCBlbnRyeSwgcGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkKHBhdGhQYXJ0czogc3RyaW5nW10sIGVudHJ5OiB7IHR5cGU6ICdmaWxlJzsgc2l6ZT86IG51bWJlciB9IHwgeyB0eXBlOiAnZGlyJyB9LCBvcmlnaW5hbFBhdGg6IHN0cmluZykge1xuXHRcdGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBFUlJfVU5LTk9XTl9JTlRFUk5BTChgSW50ZXJuYWwgZXJyb3IgY3JlYXRpbmcgSW5kZXhlZERCRlNOb2RlIC0tIGFkZGluZyBlbXB0eSBwYXRoIChlbmNvdW50ZXJlZCB3aGlsZSBhZGRpbmcgJHtvcmlnaW5hbFBhdGh9KWApO1xuXHRcdH1cblx0XHRlbHNlIGlmICh0aGlzLmVudHJ5LnR5cGUgIT09IEZpbGVUeXBlLkRpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEludGVybmFsIGVycm9yIGNyZWF0aW5nIEluZGV4ZWREQkZTTm9kZSAtLSBwYXJlbnQgaXMgbm90IGEgZGlyZWN0b3J5IChlbmNvdW50ZXJlZCB3aGlsZSBhZGRpbmcgJHtvcmlnaW5hbFBhdGh9KWApO1xuXHRcdH1cblx0XHRlbHNlIGlmIChwYXRoUGFydHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gcGF0aFBhcnRzWzBdO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmVudHJ5LmNoaWxkcmVuLmdldChuZXh0KTtcblx0XHRcdGlmIChlbnRyeS50eXBlID09PSAnZGlyJykge1xuXHRcdFx0XHRpZiAoZXhpc3Rpbmc/LmVudHJ5LnR5cGUgPT09IEZpbGVUeXBlLkZpbGUpIHtcblx0XHRcdFx0XHR0aHJvdyBFUlJfVU5LTk9XTl9JTlRFUk5BTChgSW50ZXJuYWwgZXJyb3IgY3JlYXRpbmcgSW5kZXhlZERCRlNOb2RlIC0tIG92ZXJ3cml0aW5nIGZpbGUgd2l0aCBkaXJlY3Rvcnk6ICR7dGhpcy5lbnRyeS5wYXRofS8ke25leHR9IChlbmNvdW50ZXJlZCB3aGlsZSBhZGRpbmcgJHtvcmlnaW5hbFBhdGh9KWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZW50cnkuY2hpbGRyZW4uc2V0KG5leHQsIGV4aXN0aW5nID8/IG5ldyBJbmRleGVkREJGaWxlU3lzdGVtTm9kZSh7XG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5LFxuXHRcdFx0XHRcdHBhdGg6IHRoaXMuZW50cnkucGF0aCArICcvJyArIG5leHQsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IG5ldyBNYXAoKSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGV4aXN0aW5nPy5lbnRyeS50eXBlID09PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdFx0XHR0aHJvdyBFUlJfVU5LTk9XTl9JTlRFUk5BTChgSW50ZXJuYWwgZXJyb3IgY3JlYXRpbmcgSW5kZXhlZERCRlNOb2RlIC0tIG92ZXJ3cml0aW5nIGRpcmVjdG9yeSB3aXRoIGZpbGU6ICR7dGhpcy5lbnRyeS5wYXRofS8ke25leHR9IChlbmNvdW50ZXJlZCB3aGlsZSBhZGRpbmcgJHtvcmlnaW5hbFBhdGh9KWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZW50cnkuY2hpbGRyZW4uc2V0KG5leHQsIG5ldyBJbmRleGVkREJGaWxlU3lzdGVtTm9kZSh7XG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRwYXRoOiB0aGlzLmVudHJ5LnBhdGggKyAnLycgKyBuZXh0LFxuXHRcdFx0XHRcdHNpemU6IGVudHJ5LnNpemUsXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSBpZiAocGF0aFBhcnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IG5leHQgPSBwYXRoUGFydHNbMF07XG5cdFx0XHRsZXQgY2hpbGROb2RlID0gdGhpcy5lbnRyeS5jaGlsZHJlbi5nZXQobmV4dCk7XG5cdFx0XHRpZiAoIWNoaWxkTm9kZSkge1xuXHRcdFx0XHRjaGlsZE5vZGUgPSBuZXcgSW5kZXhlZERCRmlsZVN5c3RlbU5vZGUoe1xuXHRcdFx0XHRcdGNoaWxkcmVuOiBuZXcgTWFwKCksXG5cdFx0XHRcdFx0cGF0aDogdGhpcy5lbnRyeS5wYXRoICsgJy8nICsgbmV4dCxcblx0XHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5EaXJlY3Rvcnlcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuZW50cnkuY2hpbGRyZW4uc2V0KG5leHQsIGNoaWxkTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChjaGlsZE5vZGUudHlwZSA9PT0gRmlsZVR5cGUuRmlsZSkge1xuXHRcdFx0XHR0aHJvdyBFUlJfVU5LTk9XTl9JTlRFUk5BTChgSW50ZXJuYWwgZXJyb3IgY3JlYXRpbmcgSW5kZXhlZERCRlNOb2RlIC0tIG92ZXJ3cml0aW5nIGZpbGUgZW50cnkgd2l0aCBkaXJlY3Rvcnk6ICR7dGhpcy5lbnRyeS5wYXRofS8ke25leHR9IChlbmNvdW50ZXJlZCB3aGlsZSBhZGRpbmcgJHtvcmlnaW5hbFBhdGh9KWApO1xuXHRcdFx0fVxuXHRcdFx0Y2hpbGROb2RlLmRvQWRkKHBhdGhQYXJ0cy5zbGljZSgxKSwgZW50cnksIG9yaWdpbmFsUGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpbnQoaW5kZW50YXRpb24gPSAnJykge1xuXHRcdGNvbnNvbGUubG9nKGluZGVudGF0aW9uICsgdGhpcy5lbnRyeS5wYXRoKTtcblx0XHRpZiAodGhpcy5lbnRyeS50eXBlID09PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdHRoaXMuZW50cnkuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiBjaGlsZC5wcmludChpbmRlbnRhdGlvbiArICcgJykpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5kZXhlZERCRmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHkge1xuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllczogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzID1cblx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZVxuXHRcdHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmRcblx0XHR8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXM6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGV4dFVyaSA9IG5ldyBFeHRVcmkoKCkgPT4gZmFsc2UpIC8qIENhc2UgU2Vuc2l0aXZlICovO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlc0Jyb2FkY2FzdENoYW5uZWw6IEJyb2FkY2FzdERhdGFDaGFubmVsPFVyaUR0bzxJRmlsZUNoYW5nZT5bXT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmlsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGU6IEV2ZW50PHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+ID0gdGhpcy5fb25EaWRDaGFuZ2VGaWxlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbXRpbWVzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRwcml2YXRlIGNhY2hlZEZpbGV0cmVlOiBQcm9taXNlPEluZGV4ZWREQkZpbGVTeXN0ZW1Ob2RlPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3cml0ZU1hbnlUaHJvdHRsZXI6IFRocm90dGxlcjtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBzY2hlbWU6IHN0cmluZywgcHJpdmF0ZSBpbmRleGVkREI6IEluZGV4ZWREQiwgcHJpdmF0ZSByZWFkb25seSBzdG9yZTogc3RyaW5nLCB3YXRjaENyb3NzV2luZG93Q2hhbmdlczogYm9vbGVhbikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy53cml0ZU1hbnlUaHJvdHRsZXIgPSBuZXcgVGhyb3R0bGVyKCk7XG5cblx0XHRpZiAod2F0Y2hDcm9zc1dpbmRvd0NoYW5nZXMpIHtcblx0XHRcdHRoaXMuY2hhbmdlc0Jyb2FkY2FzdENoYW5uZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJvYWRjYXN0RGF0YUNoYW5uZWw8VXJpRHRvPElGaWxlQ2hhbmdlPltdPihgdnNjb2RlLmluZGV4ZWREQi4ke3NjaGVtZX0uY2hhbmdlc2ApKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhbmdlc0Jyb2FkY2FzdENoYW5uZWwub25EaWRSZWNlaXZlRGF0YShjaGFuZ2VzID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGaWxlLmZpcmUoY2hhbmdlcy5tYXAoYyA9PiAoeyB0eXBlOiBjLnR5cGUsIHJlc291cmNlOiBVUkkucmV2aXZlKGMucmVzb3VyY2UpIH0pKSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0d2F0Y2gocmVzb3VyY2U6IFVSSSwgb3B0czogSVdhdGNoT3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0YXN5bmMgbWtkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVN0YXQgPSBhd2FpdCB0aGlzLnN0YXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKHJlc291cmNlU3RhdC50eXBlID09PSBGaWxlVHlwZS5GaWxlKSB7XG5cdFx0XHRcdHRocm93IEVSUl9GSUxFX05PVF9ESVI7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogSWdub3JlICovIH1cblx0XHQoYXdhaXQgdGhpcy5nZXRGaWxldHJlZSgpKS5hZGQocmVzb3VyY2UucGF0aCwgeyB0eXBlOiAnZGlyJyB9KTtcblx0fVxuXG5cdGFzeW5jIHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVN0YXQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IChhd2FpdCB0aGlzLmdldEZpbGV0cmVlKCkpLnJlYWQocmVzb3VyY2UucGF0aCk7XG5cblx0XHRpZiAoZW50cnk/LnR5cGUgPT09IEZpbGVUeXBlLkZpbGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdGN0aW1lOiAwLFxuXHRcdFx0XHRtdGltZTogdGhpcy5tdGltZXMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpIHx8IDAsXG5cdFx0XHRcdHNpemU6IGVudHJ5LnNpemUgPz8gKGF3YWl0IHRoaXMucmVhZEZpbGUocmVzb3VyY2UpKS5ieXRlTGVuZ3RoXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChlbnRyeT8udHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5EaXJlY3RvcnksXG5cdFx0XHRcdGN0aW1lOiAwLFxuXHRcdFx0XHRtdGltZTogMCxcblx0XHRcdFx0c2l6ZTogMFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aHJvdyBFUlJfRklMRV9OT1RfRk9VTkQ7XG5cdH1cblxuXHRhc3luYyByZWFkZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPERpckVudHJ5W10+IHtcblx0XHRjb25zdCBlbnRyeSA9IChhd2FpdCB0aGlzLmdldEZpbGV0cmVlKCkpLnJlYWQocmVzb3VyY2UucGF0aCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0Ly8gRGlycyBhcmVuJ3Qgc2F2ZWQgdG8gZGlzaywgc28gZW1wdHkgZGlycyB3aWxsIGJlIGxvc3Qgb24gcmVsb2FkLlxuXHRcdFx0Ly8gVGh1cyB3ZSBoYXZlIHR3byBvcHRpb25zIGZvciB3aGF0IGhhcHBlbnMgd2hlbiB5b3UgdHJ5IHRvIHJlYWQgYSBkaXIgYW5kIG5vdGhpbmcgaXMgZm91bmQ6XG5cdFx0XHQvLyAtIFRocm93IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmRcblx0XHRcdC8vIC0gUmV0dXJuIFtdXG5cdFx0XHQvLyBXZSBjaG9vc2UgdG8gcmV0dXJuIFtdIGFzIGNyZWF0aW5nIGEgZGlyIHRoZW4gcmVhZGluZyBpdCAoZXZlbiBhZnRlciByZWxvYWQpIHNob3VsZCBub3QgdGhyb3cgYW4gZXJyb3IuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmIChlbnRyeS50eXBlICE9PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IEVSUl9GSUxFX05PVF9ESVI7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0cmV0dXJuIFsuLi5lbnRyeS5jaGlsZHJlbi5lbnRyaWVzKCldLm1hcCgoW25hbWUsIG5vZGVdKSA9PiBbbmFtZSwgbm9kZS50eXBlXSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuaW5kZXhlZERCLnJ1bkluVHJhbnNhY3Rpb24odGhpcy5zdG9yZSwgJ3JlYWRvbmx5Jywgb2JqZWN0U3RvcmUgPT4gb2JqZWN0U3RvcmUuZ2V0KHJlc291cmNlLnBhdGgpKTtcblx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IEVSUl9GSUxFX05PVF9GT1VORDtcblx0XHR9XG5cdFx0Y29uc3QgYnVmZmVyID0gcmVzdWx0IGluc3RhbmNlb2YgVWludDhBcnJheSA/IHJlc3VsdCA6IGlzU3RyaW5nKHJlc3VsdCkgPyBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlc3VsdCkuYnVmZmVyIDogdW5kZWZpbmVkO1xuXHRcdGlmIChidWZmZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgRVJSX1VOS05PV05fSU5URVJOQUwoYEluZGV4ZWREQiBlbnRyeSBhdCBcIiR7cmVzb3VyY2UucGF0aH1cIiBpbiB1bmV4cGVjdGVkIGZvcm1hdGApO1xuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBjYWNoZVxuXHRcdGNvbnN0IGZpbGVUcmVlID0gYXdhaXQgdGhpcy5nZXRGaWxldHJlZSgpO1xuXHRcdGZpbGVUcmVlLmFkZChyZXNvdXJjZS5wYXRoLCB7IHR5cGU6ICdmaWxlJywgc2l6ZTogYnVmZmVyLmJ5dGVMZW5ndGggfSk7XG5cblx0XHRyZXR1cm4gYnVmZmVyO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdHM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCB0aGlzLnN0YXQocmVzb3VyY2UpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKGV4aXN0aW5nPy50eXBlID09PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IEVSUl9GSUxFX0lTX0RJUjtcblx0XHR9XG5cblx0XHRsZXQgZmluYWxDb250ZW50ID0gY29udGVudDtcblx0XHRpZiAob3B0cy5hcHBlbmQgJiYgZXhpc3RpbmcpIHtcblx0XHRcdC8vIFJlYWQgZXhpc3RpbmcgY29udGVudCBhbmQgYXBwZW5kIG5ldyBjb250ZW50IHRvIGl0XG5cdFx0XHRjb25zdCBleGlzdGluZ0NvbnRlbnQgPSBhd2FpdCB0aGlzLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNvbWJpbmVkID0gbmV3IFVpbnQ4QXJyYXkoZXhpc3RpbmdDb250ZW50LmJ5dGVMZW5ndGggKyBjb250ZW50LmJ5dGVMZW5ndGgpO1xuXHRcdFx0Y29tYmluZWQuc2V0KGV4aXN0aW5nQ29udGVudCwgMCk7XG5cdFx0XHRjb21iaW5lZC5zZXQoY29udGVudCwgZXhpc3RpbmdDb250ZW50LmJ5dGVMZW5ndGgpO1xuXHRcdFx0ZmluYWxDb250ZW50ID0gY29tYmluZWQ7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5idWxrV3JpdGUoW1tyZXNvdXJjZSwgZmluYWxDb250ZW50XV0pO1xuXHR9XG5cblx0YXN5bmMgcmVuYW1lKGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZVRyZWUgPSBhd2FpdCB0aGlzLmdldEZpbGV0cmVlKCk7XG5cdFx0Y29uc3QgZnJvbUVudHJ5ID0gZmlsZVRyZWUucmVhZChmcm9tLnBhdGgpO1xuXHRcdGlmICghZnJvbUVudHJ5KSB7XG5cdFx0XHR0aHJvdyBFUlJfRklMRV9OT1RfRk9VTkQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9FbnRyeSA9IGZpbGVUcmVlLnJlYWQodG8ucGF0aCk7XG5cdFx0aWYgKHRvRW50cnkpIHtcblx0XHRcdGlmICghb3B0cy5vdmVyd3JpdGUpIHtcblx0XHRcdFx0dGhyb3cgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoJ2ZpbGUgZXhpc3RzIGFscmVhZHknLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9FbnRyeS50eXBlICE9PSBmcm9tRW50cnkudHlwZSkge1xuXHRcdFx0XHR0aHJvdyBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcignQ2Fubm90IHJlbmFtZSBmaWxlcyB3aXRoIGRpZmZlcmVudCB0eXBlcycsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Vbmtub3duKTtcblx0XHRcdH1cblx0XHRcdC8vIGRlbGV0ZSB0aGUgdGFyZ2V0IGZpbGUgaWYgZXhpc3RzXG5cdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZSh0bywgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCB0b1RhcmdldFJlc291cmNlID0gKHBhdGg6IHN0cmluZyk6IFVSSSA9PiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0bywgdGhpcy5leHRVcmkucmVsYXRpdmVQYXRoKGZyb20sIGZyb20ud2l0aCh7IHBhdGggfSkpIHx8ICcnKTtcblxuXHRcdGNvbnN0IHNvdXJjZUVudHJpZXMgPSBhd2FpdCB0aGlzLnRyZWUoZnJvbSk7XG5cdFx0Y29uc3Qgc291cmNlRmlsZXM6IERpckVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNvdXJjZUVudHJ5IG9mIHNvdXJjZUVudHJpZXMpIHtcblx0XHRcdGlmIChzb3VyY2VFbnRyeVsxXSA9PT0gRmlsZVR5cGUuRmlsZSkge1xuXHRcdFx0XHRzb3VyY2VGaWxlcy5wdXNoKHNvdXJjZUVudHJ5KTtcblx0XHRcdH0gZWxzZSBpZiAoc291cmNlRW50cnlbMV0gPT09IEZpbGVUeXBlLkRpcmVjdG9yeSkge1xuXHRcdFx0XHQvLyBhZGQgZGlyZWN0b3JpZXMgdG8gdGhlIHRyZWVcblx0XHRcdFx0ZmlsZVRyZWUuYWRkKHRvVGFyZ2V0UmVzb3VyY2Uoc291cmNlRW50cnlbMF0pLnBhdGgsIHsgdHlwZTogJ2RpcicgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNvdXJjZUZpbGVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0RmlsZXM6IFtVUkksIFVpbnQ4QXJyYXldW10gPSBbXTtcblx0XHRcdGNvbnN0IHNvdXJjZUZpbGVzQ29udGVudHMgPSBhd2FpdCB0aGlzLmluZGV4ZWREQi5ydW5JblRyYW5zYWN0aW9uKHRoaXMuc3RvcmUsICdyZWFkb25seScsIG9iamVjdFN0b3JlID0+IHNvdXJjZUZpbGVzLm1hcCgoW3BhdGhdKSA9PiBvYmplY3RTdG9yZS5nZXQocGF0aCkpKTtcblx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBzb3VyY2VGaWxlcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHNvdXJjZUZpbGVzQ29udGVudHNbaW5kZXhdIGluc3RhbmNlb2YgVWludDhBcnJheSA/IHNvdXJjZUZpbGVzQ29udGVudHNbaW5kZXhdIDogaXNTdHJpbmcoc291cmNlRmlsZXNDb250ZW50c1tpbmRleF0pID8gVlNCdWZmZXIuZnJvbVN0cmluZyhzb3VyY2VGaWxlc0NvbnRlbnRzW2luZGV4XSkuYnVmZmVyIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRcdHRhcmdldEZpbGVzLnB1c2goW3RvVGFyZ2V0UmVzb3VyY2Uoc291cmNlRmlsZXNbaW5kZXhdWzBdKSwgY29udGVudF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLmJ1bGtXcml0ZSh0YXJnZXRGaWxlcyk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5kZWxldGUoZnJvbSwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZURlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgc3RhdDogSVN0YXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLnN0YXQocmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlLmNvZGUgPT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cblx0XHRsZXQgdG9EZWxldGU6IHN0cmluZ1tdO1xuXHRcdGlmIChvcHRzLnJlY3Vyc2l2ZSkge1xuXHRcdFx0Y29uc3QgdHJlZSA9IGF3YWl0IHRoaXMudHJlZShyZXNvdXJjZSk7XG5cdFx0XHR0b0RlbGV0ZSA9IHRyZWUubWFwKChbcGF0aF0pID0+IHBhdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoc3RhdC50eXBlID09PSBGaWxlVHlwZS5EaXJlY3RvcnkgJiYgKGF3YWl0IHRoaXMucmVhZGRpcihyZXNvdXJjZSkpLmxlbmd0aCkge1xuXHRcdFx0XHR0aHJvdyBFUlJfRElSX05PVF9FTVBUWTtcblx0XHRcdH1cblx0XHRcdHRvRGVsZXRlID0gW3Jlc291cmNlLnBhdGhdO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmRlbGV0ZUtleXModG9EZWxldGUpO1xuXHRcdChhd2FpdCB0aGlzLmdldEZpbGV0cmVlKCkpLmRlbGV0ZShyZXNvdXJjZS5wYXRoKTtcblx0XHR0b0RlbGV0ZS5mb3JFYWNoKGtleSA9PiB0aGlzLm10aW1lcy5kZWxldGUoa2V5KSk7XG5cdFx0dGhpcy50cmlnZ2VyQ2hhbmdlcyh0b0RlbGV0ZS5tYXAocGF0aCA9PiAoeyByZXNvdXJjZTogcmVzb3VyY2Uud2l0aCh7IHBhdGggfSksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJlZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxEaXJFbnRyeVtdPiB7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuc3RhdChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgYWxsRW50cmllczogRGlyRW50cnlbXSA9IFtbcmVzb3VyY2UucGF0aCwgc3RhdC50eXBlXV07XG5cdFx0aWYgKHN0YXQudHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCBkaXJFbnRyaWVzID0gYXdhaXQgdGhpcy5yZWFkZGlyKHJlc291cmNlKTtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdHlwZV0gb2YgZGlyRW50cmllcykge1xuXHRcdFx0XHRjb25zdCBjaGlsZFJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgocmVzb3VyY2UsIGtleSk7XG5cdFx0XHRcdGFsbEVudHJpZXMucHVzaChbY2hpbGRSZXNvdXJjZS5wYXRoLCB0eXBlXSk7XG5cdFx0XHRcdGlmICh0eXBlID09PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZEVudHJpZXMgPSBhd2FpdCB0aGlzLnRyZWUoY2hpbGRSZXNvdXJjZSk7XG5cdFx0XHRcdFx0YWxsRW50cmllcy5wdXNoKC4uLmNoaWxkRW50cmllcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFsbEVudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIHRyaWdnZXJDaGFuZ2VzKGNoYW5nZXM6IElGaWxlQ2hhbmdlW10pOiB2b2lkIHtcblx0XHRpZiAoY2hhbmdlcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRmlsZS5maXJlKGNoYW5nZXMpO1xuXG5cdFx0XHR0aGlzLmNoYW5nZXNCcm9hZGNhc3RDaGFubmVsPy5wb3N0RGF0YShjaGFuZ2VzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEZpbGV0cmVlKCk6IFByb21pc2U8SW5kZXhlZERCRmlsZVN5c3RlbU5vZGU+IHtcblx0XHRpZiAoIXRoaXMuY2FjaGVkRmlsZXRyZWUpIHtcblx0XHRcdHRoaXMuY2FjaGVkRmlsZXRyZWUgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByb290Tm9kZSA9IG5ldyBJbmRleGVkREJGaWxlU3lzdGVtTm9kZSh7XG5cdFx0XHRcdFx0Y2hpbGRyZW46IG5ldyBNYXAoKSxcblx0XHRcdFx0XHRwYXRoOiAnJyxcblx0XHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5EaXJlY3Rvcnlcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuaW5kZXhlZERCLnJ1bkluVHJhbnNhY3Rpb24odGhpcy5zdG9yZSwgJ3JlYWRvbmx5Jywgb2JqZWN0U3RvcmUgPT4gb2JqZWN0U3RvcmUuZ2V0QWxsS2V5cygpKTtcblx0XHRcdFx0Y29uc3Qga2V5cyA9IHJlc3VsdC5tYXAoa2V5ID0+IGtleS50b1N0cmluZygpKTtcblx0XHRcdFx0a2V5cy5mb3JFYWNoKGtleSA9PiByb290Tm9kZS5hZGQoa2V5LCB7IHR5cGU6ICdmaWxlJyB9KSk7XG5cdFx0XHRcdHJldHVybiByb290Tm9kZTtcblx0XHRcdH0pKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNhY2hlZEZpbGV0cmVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBidWxrV3JpdGUoZmlsZXM6IFtVUkksIFVpbnQ4QXJyYXldW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmaWxlcy5mb3JFYWNoKChbcmVzb3VyY2UsIGNvbnRlbnRdKSA9PiB0aGlzLmZpbGVXcml0ZUJhdGNoLnB1c2goeyBjb250ZW50LCByZXNvdXJjZSB9KSk7XG5cdFx0YXdhaXQgdGhpcy53cml0ZU1hbnlUaHJvdHRsZXIucXVldWUoKCkgPT4gdGhpcy53cml0ZU1hbnkoKSk7XG5cblx0XHRjb25zdCBmaWxlVHJlZSA9IGF3YWl0IHRoaXMuZ2V0RmlsZXRyZWUoKTtcblx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgY29udGVudF0gb2YgZmlsZXMpIHtcblx0XHRcdGZpbGVUcmVlLmFkZChyZXNvdXJjZS5wYXRoLCB7IHR5cGU6ICdmaWxlJywgc2l6ZTogY29udGVudC5ieXRlTGVuZ3RoIH0pO1xuXHRcdFx0dGhpcy5tdGltZXMuc2V0KHJlc291cmNlLnRvU3RyaW5nKCksIERhdGUubm93KCkpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJpZ2dlckNoYW5nZXMoZmlsZXMubWFwKChbcmVzb3VyY2VdKSA9PiAoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWxlV3JpdGVCYXRjaDogeyByZXNvdXJjZTogVVJJOyBjb250ZW50OiBVaW50OEFycmF5IH1bXSA9IFtdO1xuXHRwcml2YXRlIGFzeW5jIHdyaXRlTWFueSgpIHtcblx0XHRpZiAodGhpcy5maWxlV3JpdGVCYXRjaC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGZpbGVCYXRjaCA9IHRoaXMuZmlsZVdyaXRlQmF0Y2guc3BsaWNlKDAsIHRoaXMuZmlsZVdyaXRlQmF0Y2gubGVuZ3RoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaW5kZXhlZERCLnJ1bkluVHJhbnNhY3Rpb24odGhpcy5zdG9yZSwgJ3JlYWR3cml0ZScsIG9iamVjdFN0b3JlID0+IGZpbGVCYXRjaC5tYXAoZW50cnkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBvYmplY3RTdG9yZS5wdXQoZW50cnkuY29udGVudCwgZW50cnkucmVzb3VyY2UucGF0aCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHRcdGlmIChleCBpbnN0YW5jZW9mIERPTUV4Y2VwdGlvbiAmJiBleC5uYW1lID09PSAnUXVvdGFFeGNlZWRlZEVycm9yJykge1xuXHRcdFx0XHRcdHRocm93IEVSUl9GSUxFX0VYQ0VFRFNfU1RPUkFHRV9RVU9UQTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IGV4O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVsZXRlS2V5cyhrZXlzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChrZXlzLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy5pbmRleGVkREIucnVuSW5UcmFuc2FjdGlvbih0aGlzLnN0b3JlLCAncmVhZHdyaXRlJywgb2JqZWN0U3RvcmUgPT4ga2V5cy5tYXAoa2V5ID0+IG9iamVjdFN0b3JlLmRlbGV0ZShrZXkpKSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5pbmRleGVkREIucnVuSW5UcmFuc2FjdGlvbih0aGlzLnN0b3JlLCAncmVhZHdyaXRlJywgb2JqZWN0U3RvcmUgPT4gb2JqZWN0U3RvcmUuY2xlYXIoKSk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQkFBK0IsZ0JBQTJELGdDQUFnQyw2QkFBNkIsZ0JBQXNIO0FBRXRSLFNBQVMsNEJBQTRCO0FBR3JDLE1BQU0scUJBQXFCLDhCQUE4QixTQUFTLGlCQUFpQixxQkFBcUIsR0FBRyw0QkFBNEIsWUFBWTtBQUNuSixNQUFNLGtCQUFrQiw4QkFBOEIsU0FBUyxtQkFBbUIsbUJBQW1CLEdBQUcsNEJBQTRCLGdCQUFnQjtBQUNwSixN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
