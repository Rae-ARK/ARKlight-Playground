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
import { URI } from "../../../../base/common/uri.js";
import { isEqual } from "../../../../base/common/extpath.js";
import { posix } from "../../../../base/common/path.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { rtrim, startsWithIgnoreCase, equalsIgnoreCase } from "../../../../base/common/strings.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { memoize } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { joinPath, isEqualOrParent, basenameOrAuthority } from "../../../../base/common/resources.js";
import { SortOrder } from "./files.js";
import { ExplorerFileNestingTrie } from "./explorerFileNestingTrie.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
class ExplorerModel {
  constructor(contextService, uriIdentityService, fileService, configService, filesConfigService) {
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this._onDidChangeRoots = new Emitter();
    const setRoots = () => this._roots = this.contextService.getWorkspace().folders.map((folder) => new ExplorerItem(folder.uri, fileService, configService, filesConfigService, void 0, true, false, false, false, folder.name));
    setRoots();
    this._listener = this.contextService.onDidChangeWorkspaceFolders(() => {
      setRoots();
      this._onDidChangeRoots.fire();
    });
  }
  get roots() {
    return this._roots;
  }
  get onDidChangeRoots() {
    return this._onDidChangeRoots.event;
  }
  /**
   * Returns an array of child stat from this stat that matches with the provided path.
   * Starts matching from the first root.
   * Will return empty array in case the FileStat does not exist.
   */
  findAll(resource) {
    return coalesce(this.roots.map((root) => root.find(resource)));
  }
  /**
   * Returns a FileStat that matches the passed resource.
   * In case multiple FileStat are matching the resource (same folder opened multiple times) returns the FileStat that has the closest root.
   * Will return undefined in case the FileStat does not exist.
   */
  findClosest(resource) {
    const folder = this.contextService.getWorkspaceFolder(resource);
    if (folder) {
      const root = this.roots.find((r) => this.uriIdentityService.extUri.isEqual(r.resource, folder.uri));
      if (root) {
        return root.find(resource);
      }
    }
    return null;
  }
  dispose() {
    this._onDidChangeRoots.dispose();
    dispose(this._listener);
  }
}
const _ExplorerItem = class _ExplorerItem {
  constructor(resource, fileService, configService, filesConfigService, _parent, _isDirectory, _isSymbolicLink, _readonly, _locked, _name = basenameOrAuthority(resource), _mtime, _unknown = false) {
    this.resource = resource;
    this.fileService = fileService;
    this.configService = configService;
    this.filesConfigService = filesConfigService;
    this._parent = _parent;
    this._isDirectory = _isDirectory;
    this._isSymbolicLink = _isSymbolicLink;
    this._readonly = _readonly;
    this._locked = _locked;
    this._name = _name;
    this._mtime = _mtime;
    this._unknown = _unknown;
    // used in tests
    this.error = void 0;
    this._isExcluded = false;
    // Find
    this.markedAsFindResult = false;
    this._isDirectoryResolved = false;
  }
  get isExcluded() {
    if (this._isExcluded) {
      return true;
    }
    if (!this._parent) {
      return false;
    }
    return this._parent.isExcluded;
  }
  set isExcluded(value) {
    this._isExcluded = value;
  }
  hasChildren(filter) {
    if (this.hasNests) {
      return this.nestedChildren?.some((c) => filter(c)) ?? false;
    } else {
      return this.isDirectory;
    }
  }
  get hasNests() {
    return !!this.nestedChildren?.length;
  }
  get isDirectoryResolved() {
    return this._isDirectoryResolved;
  }
  get isSymbolicLink() {
    return !!this._isSymbolicLink;
  }
  get isDirectory() {
    return !!this._isDirectory;
  }
  get isReadonly() {
    return this.filesConfigService.isReadonly(this.resource, { resource: this.resource, name: this.name, readonly: this._readonly, locked: this._locked });
  }
  get mtime() {
    return this._mtime;
  }
  get name() {
    return this._name;
  }
  get isUnknown() {
    return this._unknown;
  }
  get parent() {
    return this._parent;
  }
  get root() {
    if (!this._parent) {
      return this;
    }
    return this._parent.root;
  }
  get children() {
    return /* @__PURE__ */ new Map();
  }
  updateName(value) {
    this._parent?.removeChild(this);
    this._name = value;
    this._parent?.addChild(this);
  }
  getId() {
    let id = this.root.resource.toString() + "::" + this.resource.toString();
    if (this.isMarkedAsFiltered()) {
      id += "::findFilterResult";
    }
    return id;
  }
  toString() {
    return `ExplorerItem: ${this.name}`;
  }
  get isRoot() {
    return this === this.root;
  }
  static create(fileService, configService, filesConfigService, raw, parent, resolveTo) {
    const stat = new _ExplorerItem(raw.resource, fileService, configService, filesConfigService, parent, raw.isDirectory, raw.isSymbolicLink, raw.readonly, raw.locked, raw.name, raw.mtime, !raw.isFile && !raw.isDirectory);
    if (stat.isDirectory) {
      stat._isDirectoryResolved = !!raw.children || !!resolveTo && resolveTo.some((r) => {
        return isEqualOrParent(r, stat.resource);
      });
      if (raw.children) {
        for (let i = 0, len = raw.children.length; i < len; i++) {
          const child = _ExplorerItem.create(fileService, configService, filesConfigService, raw.children[i], stat, resolveTo);
          stat.addChild(child);
        }
      }
    }
    return stat;
  }
  /**
   * Merges the stat which was resolved from the disk with the local stat by copying over properties
   * and children. The merge will only consider resolved stat elements to avoid overwriting data which
   * exists locally.
   */
  static mergeLocalWithDisk(disk, local) {
    if (disk.resource.toString() !== local.resource.toString()) {
      return;
    }
    const mergingDirectories = disk.isDirectory || local.isDirectory;
    if (mergingDirectories && local._isDirectoryResolved && !disk._isDirectoryResolved) {
      return;
    }
    local.resource = disk.resource;
    if (!local.isRoot) {
      local.updateName(disk.name);
    }
    local._isDirectory = disk.isDirectory;
    local._mtime = disk.mtime;
    local._isDirectoryResolved = disk._isDirectoryResolved;
    local._isSymbolicLink = disk.isSymbolicLink;
    local.error = disk.error;
    if (mergingDirectories && disk._isDirectoryResolved) {
      const oldLocalChildren = new ResourceMap();
      local.children.forEach((child) => {
        oldLocalChildren.set(child.resource, child);
      });
      local.children.clear();
      disk.children.forEach((diskChild) => {
        const formerLocalChild = oldLocalChildren.get(diskChild.resource);
        if (formerLocalChild) {
          _ExplorerItem.mergeLocalWithDisk(diskChild, formerLocalChild);
          local.addChild(formerLocalChild);
          oldLocalChildren.delete(diskChild.resource);
        } else {
          local.addChild(diskChild);
        }
      });
      oldLocalChildren.forEach((oldChild) => {
        if (oldChild instanceof NewExplorerItem) {
          local.addChild(oldChild);
        }
      });
    }
  }
  /**
   * Adds a child element to this folder.
   */
  addChild(child) {
    child._parent = this;
    child.updateResource(false);
    this.children.set(this.getPlatformAwareName(child.name), child);
  }
  getChild(name) {
    return this.children.get(this.getPlatformAwareName(name));
  }
  fetchChildren(sortOrder) {
    const nestingConfig = this.configService.getValue({ resource: this.root.resource }).explorer.fileNesting;
    if (nestingConfig.enabled && this.nestedChildren) {
      return this.nestedChildren;
    }
    return (async () => {
      if (!this._isDirectoryResolved) {
        const resolveMetadata = sortOrder === SortOrder.Modified;
        this.error = void 0;
        try {
          const stat = await this.fileService.resolve(this.resource, { resolveSingleChildDescendants: true, resolveMetadata });
          const resolved = _ExplorerItem.create(this.fileService, this.configService, this.filesConfigService, stat, this);
          _ExplorerItem.mergeLocalWithDisk(resolved, this);
        } catch (e) {
          this.error = e;
          throw e;
        }
        this._isDirectoryResolved = true;
      }
      const items = [];
      if (nestingConfig.enabled) {
        const fileChildren = [];
        const dirChildren = [];
        for (const child of this.children.entries()) {
          child[1].nestedParent = void 0;
          if (child[1].isDirectory) {
            dirChildren.push(child);
          } else {
            fileChildren.push(child);
          }
        }
        const nested = this.fileNester.nest(
          fileChildren.map(([name]) => name),
          this.getPlatformAwareName(this.name)
        );
        for (const [fileEntryName, fileEntryItem] of fileChildren) {
          const nestedItems = nested.get(fileEntryName);
          if (nestedItems !== void 0) {
            fileEntryItem.nestedChildren = [];
            for (const name of nestedItems.keys()) {
              const child = assertReturnsDefined(this.children.get(name));
              fileEntryItem.nestedChildren.push(child);
              child.nestedParent = fileEntryItem;
            }
            items.push(fileEntryItem);
          } else {
            fileEntryItem.nestedChildren = void 0;
          }
        }
        for (const [_, dirEntryItem] of dirChildren.values()) {
          items.push(dirEntryItem);
        }
      } else {
        this.children.forEach((child) => {
          items.push(child);
        });
      }
      return items;
    })();
  }
  get fileNester() {
    if (!this.root._fileNester) {
      const nestingConfig = this.configService.getValue({ resource: this.root.resource }).explorer.fileNesting;
      const patterns = Object.entries(nestingConfig.patterns).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string" && entry[0] && entry[1]).map(([parentPattern, childrenPatterns]) => [
        this.getPlatformAwareName(parentPattern.trim()),
        childrenPatterns.split(",").map((p) => this.getPlatformAwareName(p.trim().replace(/\u200b/g, "").trim())).filter((p) => p !== "")
      ]);
      this.root._fileNester = new ExplorerFileNestingTrie(patterns);
    }
    return this.root._fileNester;
  }
  /**
   * Removes a child element from this folder.
   */
  removeChild(child) {
    this.nestedChildren = void 0;
    this.children.delete(this.getPlatformAwareName(child.name));
  }
  forgetChildren() {
    this.children.clear();
    this.nestedChildren = void 0;
    this._isDirectoryResolved = false;
    this._fileNester = void 0;
  }
  getPlatformAwareName(name) {
    return this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.PathCaseSensitive) ? name : name.toLowerCase();
  }
  /**
   * Moves this element under a new parent element.
   */
  move(newParent) {
    this.nestedParent?.removeChild(this);
    this._parent?.removeChild(this);
    newParent.removeChild(this);
    newParent.addChild(this);
    this.updateResource(true);
  }
  updateResource(recursive) {
    if (this._parent) {
      this.resource = joinPath(this._parent.resource, this.name);
    }
    if (recursive) {
      if (this.isDirectory) {
        this.children.forEach((child) => {
          child.updateResource(true);
        });
      }
    }
  }
  /**
   * Tells this stat that it was renamed. This requires changes to all children of this stat (if any)
   * so that the path property can be updated properly.
   */
  rename(renamedStat) {
    this.updateName(renamedStat.name);
    this._mtime = renamedStat.mtime;
    this.updateResource(true);
  }
  /**
   * Returns a child stat from this stat that matches with the provided path.
   * Will return "null" in case the child does not exist.
   */
  find(resource) {
    const ignoreCase = !this.fileService.hasCapability(resource, FileSystemProviderCapabilities.PathCaseSensitive);
    if (resource && this.resource.scheme === resource.scheme && equalsIgnoreCase(this.resource.authority, resource.authority) && (ignoreCase ? startsWithIgnoreCase(resource.path, this.resource.path) : resource.path.startsWith(this.resource.path))) {
      return this.findByPath(rtrim(resource.path, posix.sep), this.resource.path.length, ignoreCase);
    }
    return null;
  }
  findByPath(path, index, ignoreCase) {
    if (isEqual(rtrim(this.resource.path, posix.sep), path, ignoreCase)) {
      return this;
    }
    if (this.isDirectory) {
      while (index < path.length && path[index] === posix.sep) {
        index++;
      }
      let indexOfNextSep = path.indexOf(posix.sep, index);
      if (indexOfNextSep === -1) {
        indexOfNextSep = path.length;
      }
      const name = path.substring(index, indexOfNextSep);
      const child = this.children.get(this.getPlatformAwareName(name));
      if (child) {
        return child.findByPath(path, indexOfNextSep, ignoreCase);
      }
    }
    return null;
  }
  isMarkedAsFiltered() {
    return this.markedAsFindResult;
  }
  markItemAndParentsAsFiltered() {
    this.markedAsFindResult = true;
    this.parent?.markItemAndParentsAsFiltered();
  }
  unmarkItemAndChildren() {
    this.markedAsFindResult = false;
    this.children.forEach((child) => child.unmarkItemAndChildren());
  }
};
__decorateClass([
  memoize
], _ExplorerItem.prototype, "children", 1);
let ExplorerItem = _ExplorerItem;
class NewExplorerItem extends ExplorerItem {
  constructor(fileService, configService, filesConfigService, parent, isDirectory) {
    super(URI.file(""), fileService, configService, filesConfigService, parent, isDirectory);
    this._isDirectoryResolved = true;
  }
}
export {
  ExplorerItem,
  ExplorerModel,
  NewExplorerItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2NvbW1vbi9leHBsb3Jlck1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IHBvc2l4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJRmlsZVN0YXQsIElGaWxlU2VydmljZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IHJ0cmltLCBzdGFydHNXaXRoSWdub3JlQ2FzZSwgZXF1YWxzSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCwgaXNFcXVhbE9yUGFyZW50LCBiYXNlbmFtZU9yQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb24sIFNvcnRPcmRlciB9IGZyb20gJy4vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZSB9IGZyb20gJy4vZXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcblxuZXhwb3J0IGNsYXNzIEV4cGxvcmVyTW9kZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfcm9vdHMhOiBFeHBsb3Jlckl0ZW1bXTtcblx0cHJpdmF0ZSBfbGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJvb3RzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0ZmlsZXNDb25maWdTZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgc2V0Um9vdHMgPSAoKSA9PiB0aGlzLl9yb290cyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1xuXHRcdFx0Lm1hcChmb2xkZXIgPT4gbmV3IEV4cGxvcmVySXRlbShmb2xkZXIudXJpLCBmaWxlU2VydmljZSwgY29uZmlnU2VydmljZSwgZmlsZXNDb25maWdTZXJ2aWNlLCB1bmRlZmluZWQsIHRydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZvbGRlci5uYW1lKSk7XG5cdFx0c2V0Um9vdHMoKTtcblxuXHRcdHRoaXMuX2xpc3RlbmVyID0gdGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4ge1xuXHRcdFx0c2V0Um9vdHMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUm9vdHMuZmlyZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0IHJvb3RzKCk6IEV4cGxvcmVySXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcm9vdHM7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VSb290cygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlUm9vdHMuZXZlbnQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBhcnJheSBvZiBjaGlsZCBzdGF0IGZyb20gdGhpcyBzdGF0IHRoYXQgbWF0Y2hlcyB3aXRoIHRoZSBwcm92aWRlZCBwYXRoLlxuXHQgKiBTdGFydHMgbWF0Y2hpbmcgZnJvbSB0aGUgZmlyc3Qgcm9vdC5cblx0ICogV2lsbCByZXR1cm4gZW1wdHkgYXJyYXkgaW4gY2FzZSB0aGUgRmlsZVN0YXQgZG9lcyBub3QgZXhpc3QuXG5cdCAqL1xuXHRmaW5kQWxsKHJlc291cmNlOiBVUkkpOiBFeHBsb3Jlckl0ZW1bXSB7XG5cdFx0cmV0dXJuIGNvYWxlc2NlKHRoaXMucm9vdHMubWFwKHJvb3QgPT4gcm9vdC5maW5kKHJlc291cmNlKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBGaWxlU3RhdCB0aGF0IG1hdGNoZXMgdGhlIHBhc3NlZCByZXNvdXJjZS5cblx0ICogSW4gY2FzZSBtdWx0aXBsZSBGaWxlU3RhdCBhcmUgbWF0Y2hpbmcgdGhlIHJlc291cmNlIChzYW1lIGZvbGRlciBvcGVuZWQgbXVsdGlwbGUgdGltZXMpIHJldHVybnMgdGhlIEZpbGVTdGF0IHRoYXQgaGFzIHRoZSBjbG9zZXN0IHJvb3QuXG5cdCAqIFdpbGwgcmV0dXJuIHVuZGVmaW5lZCBpbiBjYXNlIHRoZSBGaWxlU3RhdCBkb2VzIG5vdCBleGlzdC5cblx0ICovXG5cdGZpbmRDbG9zZXN0KHJlc291cmNlOiBVUkkpOiBFeHBsb3Jlckl0ZW0gfCBudWxsIHtcblx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSk7XG5cdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IHRoaXMucm9vdHMuZmluZChyID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHIucmVzb3VyY2UsIGZvbGRlci51cmkpKTtcblx0XHRcdGlmIChyb290KSB7XG5cdFx0XHRcdHJldHVybiByb290LmZpbmQocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJvb3RzLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NlKHRoaXMuX2xpc3RlbmVyKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJJdGVtIHtcblx0X2lzRGlyZWN0b3J5UmVzb2x2ZWQ6IGJvb2xlYW47IC8vIHVzZWQgaW4gdGVzdHNcblx0cHVibGljIGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNFeGNsdWRlZCA9IGZhbHNlO1xuXG5cdHB1YmxpYyBuZXN0ZWRQYXJlbnQ6IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZDtcblx0cHVibGljIG5lc3RlZENoaWxkcmVuOiBFeHBsb3Jlckl0ZW1bXSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ1NlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgX3BhcmVudDogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX2lzRGlyZWN0b3J5PzogYm9vbGVhbixcblx0XHRwcml2YXRlIF9pc1N5bWJvbGljTGluaz86IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSBfcmVhZG9ubHk/OiBib29sZWFuLFxuXHRcdHByaXZhdGUgX2xvY2tlZD86IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSBfbmFtZTogc3RyaW5nID0gYmFzZW5hbWVPckF1dGhvcml0eShyZXNvdXJjZSksXG5cdFx0cHJpdmF0ZSBfbXRpbWU/OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfdW5rbm93biA9IGZhbHNlXG5cdCkge1xuXHRcdHRoaXMuX2lzRGlyZWN0b3J5UmVzb2x2ZWQgPSBmYWxzZTtcblx0fVxuXG5cdGdldCBpc0V4Y2x1ZGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9pc0V4Y2x1ZGVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9wYXJlbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcGFyZW50LmlzRXhjbHVkZWQ7XG5cdH1cblxuXHRzZXQgaXNFeGNsdWRlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2lzRXhjbHVkZWQgPSB2YWx1ZTtcblx0fVxuXG5cdGhhc0NoaWxkcmVuKGZpbHRlcjogKHN0YXQ6IEV4cGxvcmVySXRlbSkgPT4gYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmhhc05lc3RzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5uZXN0ZWRDaGlsZHJlbj8uc29tZShjID0+IGZpbHRlcihjKSkgPz8gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmlzRGlyZWN0b3J5O1xuXHRcdH1cblx0fVxuXG5cdGdldCBoYXNOZXN0cygpIHtcblx0XHRyZXR1cm4gISEodGhpcy5uZXN0ZWRDaGlsZHJlbj8ubGVuZ3RoKTtcblx0fVxuXG5cdGdldCBpc0RpcmVjdG9yeVJlc29sdmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0RpcmVjdG9yeVJlc29sdmVkO1xuXHR9XG5cblx0Z2V0IGlzU3ltYm9saWNMaW5rKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2lzU3ltYm9saWNMaW5rO1xuXHR9XG5cblx0Z2V0IGlzRGlyZWN0b3J5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2lzRGlyZWN0b3J5O1xuXHR9XG5cblx0Z2V0IGlzUmVhZG9ubHkoKTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZXNDb25maWdTZXJ2aWNlLmlzUmVhZG9ubHkodGhpcy5yZXNvdXJjZSwgeyByZXNvdXJjZTogdGhpcy5yZXNvdXJjZSwgbmFtZTogdGhpcy5uYW1lLCByZWFkb25seTogdGhpcy5fcmVhZG9ubHksIGxvY2tlZDogdGhpcy5fbG9ja2VkIH0pO1xuXHR9XG5cblx0Z2V0IG10aW1lKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX210aW1lO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbmFtZTtcblx0fVxuXG5cdGdldCBpc1Vua25vd24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Vua25vd247XG5cdH1cblxuXHRnZXQgcGFyZW50KCk6IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3BhcmVudDtcblx0fVxuXG5cdGdldCByb290KCk6IEV4cGxvcmVySXRlbSB7XG5cdFx0aWYgKCF0aGlzLl9wYXJlbnQpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9wYXJlbnQucm9vdDtcblx0fVxuXG5cdEBtZW1vaXplIGdldCBjaGlsZHJlbigpOiBNYXA8c3RyaW5nLCBFeHBsb3Jlckl0ZW0+IHtcblx0XHRyZXR1cm4gbmV3IE1hcDxzdHJpbmcsIEV4cGxvcmVySXRlbT4oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTmFtZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gUmUtYWRkIHRvIHBhcmVudCBzaW5jZSB0aGUgcGFyZW50IGhhcyBhIG5hbWUgbWFwIHRvIGNoaWxkcmVuIGFuZCB0aGUgbmFtZSBtaWdodCBoYXZlIGNoYW5nZWRcblx0XHR0aGlzLl9wYXJlbnQ/LnJlbW92ZUNoaWxkKHRoaXMpO1xuXHRcdHRoaXMuX25hbWUgPSB2YWx1ZTtcblx0XHR0aGlzLl9wYXJlbnQ/LmFkZENoaWxkKHRoaXMpO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRsZXQgaWQgPSB0aGlzLnJvb3QucmVzb3VyY2UudG9TdHJpbmcoKSArICc6OicgKyB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0XHRpZiAodGhpcy5pc01hcmtlZEFzRmlsdGVyZWQoKSkge1xuXHRcdFx0aWQgKz0gJzo6ZmluZEZpbHRlclJlc3VsdCc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYEV4cGxvcmVySXRlbTogJHt0aGlzLm5hbWV9YDtcblx0fVxuXG5cdGdldCBpc1Jvb3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMgPT09IHRoaXMucm9vdDtcblx0fVxuXG5cdHN0YXRpYyBjcmVhdGUoZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBmaWxlc0NvbmZpZ1NlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCByYXc6IElGaWxlU3RhdCwgcGFyZW50OiBFeHBsb3Jlckl0ZW0gfCB1bmRlZmluZWQsIHJlc29sdmVUbz86IHJlYWRvbmx5IFVSSVtdKTogRXhwbG9yZXJJdGVtIHtcblx0XHRjb25zdCBzdGF0ID0gbmV3IEV4cGxvcmVySXRlbShyYXcucmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlLCBmaWxlc0NvbmZpZ1NlcnZpY2UsIHBhcmVudCwgcmF3LmlzRGlyZWN0b3J5LCByYXcuaXNTeW1ib2xpY0xpbmssIHJhdy5yZWFkb25seSwgcmF3LmxvY2tlZCwgcmF3Lm5hbWUsIHJhdy5tdGltZSwgIXJhdy5pc0ZpbGUgJiYgIXJhdy5pc0RpcmVjdG9yeSk7XG5cblx0XHQvLyBSZWN1cnNpdmVseSBhZGQgY2hpbGRyZW4gaWYgcHJlc2VudFxuXHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cblx0XHRcdC8vIGlzRGlyZWN0b3J5UmVzb2x2ZWQgaXMgYSB2ZXJ5IGltcG9ydGFudCBpbmRpY2F0b3IgaW4gdGhlIHN0YXQgbW9kZWwgdGhhdCB0ZWxscyBpZiB0aGUgZm9sZGVyIHdhcyBmdWxseSByZXNvbHZlZFxuXHRcdFx0Ly8gdGhlIGZvbGRlciBpcyBmdWxseSByZXNvbHZlZCBpZiBlaXRoZXIgaXQgaGFzIGEgbGlzdCBvZiBjaGlsZHJlbiBvciB0aGUgY2xpZW50IHJlcXVlc3RlZCB0aGlzIGJ5IHVzaW5nIHRoZSByZXNvbHZlVG9cblx0XHRcdC8vIGFycmF5IG9mIHJlc291cmNlIHBhdGggdG8gcmVzb2x2ZS5cblx0XHRcdHN0YXQuX2lzRGlyZWN0b3J5UmVzb2x2ZWQgPSAhIXJhdy5jaGlsZHJlbiB8fCAoISFyZXNvbHZlVG8gJiYgcmVzb2x2ZVRvLnNvbWUoKHIpID0+IHtcblx0XHRcdFx0cmV0dXJuIGlzRXF1YWxPclBhcmVudChyLCBzdGF0LnJlc291cmNlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gUmVjdXJzZSBpbnRvIGNoaWxkcmVuXG5cdFx0XHRpZiAocmF3LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYXcuY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZCA9IEV4cGxvcmVySXRlbS5jcmVhdGUoZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UsIGZpbGVzQ29uZmlnU2VydmljZSwgcmF3LmNoaWxkcmVuW2ldLCBzdGF0LCByZXNvbHZlVG8pO1xuXHRcdFx0XHRcdHN0YXQuYWRkQ2hpbGQoY2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXQ7XG5cdH1cblxuXHQvKipcblx0ICogTWVyZ2VzIHRoZSBzdGF0IHdoaWNoIHdhcyByZXNvbHZlZCBmcm9tIHRoZSBkaXNrIHdpdGggdGhlIGxvY2FsIHN0YXQgYnkgY29weWluZyBvdmVyIHByb3BlcnRpZXNcblx0ICogYW5kIGNoaWxkcmVuLiBUaGUgbWVyZ2Ugd2lsbCBvbmx5IGNvbnNpZGVyIHJlc29sdmVkIHN0YXQgZWxlbWVudHMgdG8gYXZvaWQgb3ZlcndyaXRpbmcgZGF0YSB3aGljaFxuXHQgKiBleGlzdHMgbG9jYWxseS5cblx0ICovXG5cdHN0YXRpYyBtZXJnZUxvY2FsV2l0aERpc2soZGlzazogRXhwbG9yZXJJdGVtLCBsb2NhbDogRXhwbG9yZXJJdGVtKTogdm9pZCB7XG5cdFx0aWYgKGRpc2sucmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gbG9jYWwucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBNZXJnaW5nIG9ubHkgc3VwcG9ydGVkIGZvciBzdGF0cyB3aXRoIHRoZSBzYW1lIHJlc291cmNlXG5cdFx0fVxuXG5cdFx0Ly8gU3RvcCBtZXJnaW5nIHdoZW4gYSBmb2xkZXIgaXMgbm90IHJlc29sdmVkIHRvIGF2b2lkIGxvb3NpbmcgbG9jYWwgZGF0YVxuXHRcdGNvbnN0IG1lcmdpbmdEaXJlY3RvcmllcyA9IGRpc2suaXNEaXJlY3RvcnkgfHwgbG9jYWwuaXNEaXJlY3Rvcnk7XG5cdFx0aWYgKG1lcmdpbmdEaXJlY3RvcmllcyAmJiBsb2NhbC5faXNEaXJlY3RvcnlSZXNvbHZlZCAmJiAhZGlzay5faXNEaXJlY3RvcnlSZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFByb3BlcnRpZXNcblx0XHRsb2NhbC5yZXNvdXJjZSA9IGRpc2sucmVzb3VyY2U7XG5cdFx0aWYgKCFsb2NhbC5pc1Jvb3QpIHtcblx0XHRcdGxvY2FsLnVwZGF0ZU5hbWUoZGlzay5uYW1lKTtcblx0XHR9XG5cdFx0bG9jYWwuX2lzRGlyZWN0b3J5ID0gZGlzay5pc0RpcmVjdG9yeTtcblx0XHRsb2NhbC5fbXRpbWUgPSBkaXNrLm10aW1lO1xuXHRcdGxvY2FsLl9pc0RpcmVjdG9yeVJlc29sdmVkID0gZGlzay5faXNEaXJlY3RvcnlSZXNvbHZlZDtcblx0XHRsb2NhbC5faXNTeW1ib2xpY0xpbmsgPSBkaXNrLmlzU3ltYm9saWNMaW5rO1xuXHRcdGxvY2FsLmVycm9yID0gZGlzay5lcnJvcjtcblxuXHRcdC8vIE1lcmdlIENoaWxkcmVuIGlmIHJlc29sdmVkXG5cdFx0aWYgKG1lcmdpbmdEaXJlY3RvcmllcyAmJiBkaXNrLl9pc0RpcmVjdG9yeVJlc29sdmVkKSB7XG5cblx0XHRcdC8vIE1hcCByZXNvdXJjZSA9PiBzdGF0XG5cdFx0XHRjb25zdCBvbGRMb2NhbENoaWxkcmVuID0gbmV3IFJlc291cmNlTWFwPEV4cGxvcmVySXRlbT4oKTtcblx0XHRcdGxvY2FsLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4ge1xuXHRcdFx0XHRvbGRMb2NhbENoaWxkcmVuLnNldChjaGlsZC5yZXNvdXJjZSwgY2hpbGQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIENsZWFyIGN1cnJlbnQgY2hpbGRyZW5cblx0XHRcdGxvY2FsLmNoaWxkcmVuLmNsZWFyKCk7XG5cblx0XHRcdC8vIE1lcmdlIHJlY2VpdmVkIGNoaWxkcmVuXG5cdFx0XHRkaXNrLmNoaWxkcmVuLmZvckVhY2goZGlza0NoaWxkID0+IHtcblx0XHRcdFx0Y29uc3QgZm9ybWVyTG9jYWxDaGlsZCA9IG9sZExvY2FsQ2hpbGRyZW4uZ2V0KGRpc2tDaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdC8vIEV4aXN0aW5nIGNoaWxkOiBtZXJnZVxuXHRcdFx0XHRpZiAoZm9ybWVyTG9jYWxDaGlsZCkge1xuXHRcdFx0XHRcdEV4cGxvcmVySXRlbS5tZXJnZUxvY2FsV2l0aERpc2soZGlza0NoaWxkLCBmb3JtZXJMb2NhbENoaWxkKTtcblx0XHRcdFx0XHRsb2NhbC5hZGRDaGlsZChmb3JtZXJMb2NhbENoaWxkKTtcblx0XHRcdFx0XHRvbGRMb2NhbENoaWxkcmVuLmRlbGV0ZShkaXNrQ2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTmV3IGNoaWxkOiBhZGRcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bG9jYWwuYWRkQ2hpbGQoZGlza0NoaWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdG9sZExvY2FsQ2hpbGRyZW4uZm9yRWFjaChvbGRDaGlsZCA9PiB7XG5cdFx0XHRcdGlmIChvbGRDaGlsZCBpbnN0YW5jZW9mIE5ld0V4cGxvcmVySXRlbSkge1xuXHRcdFx0XHRcdGxvY2FsLmFkZENoaWxkKG9sZENoaWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgYSBjaGlsZCBlbGVtZW50IHRvIHRoaXMgZm9sZGVyLlxuXHQgKi9cblx0YWRkQ2hpbGQoY2hpbGQ6IEV4cGxvcmVySXRlbSk6IHZvaWQge1xuXHRcdC8vIEluaGVyaXQgc29tZSBwYXJlbnQgcHJvcGVydGllcyB0byBjaGlsZFxuXHRcdGNoaWxkLl9wYXJlbnQgPSB0aGlzO1xuXHRcdGNoaWxkLnVwZGF0ZVJlc291cmNlKGZhbHNlKTtcblx0XHR0aGlzLmNoaWxkcmVuLnNldCh0aGlzLmdldFBsYXRmb3JtQXdhcmVOYW1lKGNoaWxkLm5hbWUpLCBjaGlsZCk7XG5cdH1cblxuXHRnZXRDaGlsZChuYW1lOiBzdHJpbmcpOiBFeHBsb3Jlckl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLmdldCh0aGlzLmdldFBsYXRmb3JtQXdhcmVOYW1lKG5hbWUpKTtcblx0fVxuXG5cdGZldGNoQ2hpbGRyZW4oc29ydE9yZGVyOiBTb3J0T3JkZXIpOiBFeHBsb3Jlckl0ZW1bXSB8IFByb21pc2U8RXhwbG9yZXJJdGVtW10+IHtcblx0XHRjb25zdCBuZXN0aW5nQ29uZmlnID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IHRoaXMucm9vdC5yZXNvdXJjZSB9KS5leHBsb3Jlci5maWxlTmVzdGluZztcblxuXHRcdC8vIGZhc3QgcGF0aCB3aGVuIHRoZSBjaGlsZHJlbiBjYW4gYmUgcmVzb2x2ZWQgc3luY1xuXHRcdGlmIChuZXN0aW5nQ29uZmlnLmVuYWJsZWQgJiYgdGhpcy5uZXN0ZWRDaGlsZHJlbikge1xuXHRcdFx0cmV0dXJuIHRoaXMubmVzdGVkQ2hpbGRyZW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzRGlyZWN0b3J5UmVzb2x2ZWQpIHtcblx0XHRcdFx0Ly8gUmVzb2x2ZSBtZXRhZGF0YSBvbmx5IHdoZW4gdGhlIG10aW1lIGlzIG5lZWRlZCBzaW5jZSB0aGlzIGNhbiBiZSBleHBlbnNpdmVcblx0XHRcdFx0Ly8gTXRpbWUgaXMgb25seSB1c2VkIHdoZW4gdGhlIHNvcnQgb3JkZXIgaXMgJ21vZGlmaWVkJ1xuXHRcdFx0XHRjb25zdCByZXNvbHZlTWV0YWRhdGEgPSBzb3J0T3JkZXIgPT09IFNvcnRPcmRlci5Nb2RpZmllZDtcblx0XHRcdFx0dGhpcy5lcnJvciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRoaXMucmVzb3VyY2UsIHsgcmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHM6IHRydWUsIHJlc29sdmVNZXRhZGF0YSB9KTtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IEV4cGxvcmVySXRlbS5jcmVhdGUodGhpcy5maWxlU2VydmljZSwgdGhpcy5jb25maWdTZXJ2aWNlLCB0aGlzLmZpbGVzQ29uZmlnU2VydmljZSwgc3RhdCwgdGhpcyk7XG5cdFx0XHRcdFx0RXhwbG9yZXJJdGVtLm1lcmdlTG9jYWxXaXRoRGlzayhyZXNvbHZlZCwgdGhpcyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLmVycm9yID0gZTtcblx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2lzRGlyZWN0b3J5UmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtczogRXhwbG9yZXJJdGVtW10gPSBbXTtcblx0XHRcdGlmIChuZXN0aW5nQ29uZmlnLmVuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3QgZmlsZUNoaWxkcmVuOiBbc3RyaW5nLCBFeHBsb3Jlckl0ZW1dW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgZGlyQ2hpbGRyZW46IFtzdHJpbmcsIEV4cGxvcmVySXRlbV1bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGRyZW4uZW50cmllcygpKSB7XG5cdFx0XHRcdFx0Y2hpbGRbMV0ubmVzdGVkUGFyZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChjaGlsZFsxXS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0ZGlyQ2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZpbGVDaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZXN0ZWQgPSB0aGlzLmZpbGVOZXN0ZXIubmVzdChcblx0XHRcdFx0XHRmaWxlQ2hpbGRyZW4ubWFwKChbbmFtZV0pID0+IG5hbWUpLFxuXHRcdFx0XHRcdHRoaXMuZ2V0UGxhdGZvcm1Bd2FyZU5hbWUodGhpcy5uYW1lKSk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBbZmlsZUVudHJ5TmFtZSwgZmlsZUVudHJ5SXRlbV0gb2YgZmlsZUNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmVzdGVkSXRlbXMgPSBuZXN0ZWQuZ2V0KGZpbGVFbnRyeU5hbWUpO1xuXHRcdFx0XHRcdGlmIChuZXN0ZWRJdGVtcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRmaWxlRW50cnlJdGVtLm5lc3RlZENoaWxkcmVuID0gW107XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IG5hbWUgb2YgbmVzdGVkSXRlbXMua2V5cygpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNoaWxkID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5jaGlsZHJlbi5nZXQobmFtZSkpO1xuXHRcdFx0XHRcdFx0XHRmaWxlRW50cnlJdGVtLm5lc3RlZENoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0XHRcdFx0XHRjaGlsZC5uZXN0ZWRQYXJlbnQgPSBmaWxlRW50cnlJdGVtO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aXRlbXMucHVzaChmaWxlRW50cnlJdGVtKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZmlsZUVudHJ5SXRlbS5uZXN0ZWRDaGlsZHJlbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtfLCBkaXJFbnRyeUl0ZW1dIG9mIGRpckNoaWxkcmVuLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0aXRlbXMucHVzaChkaXJFbnRyeUl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4ge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goY2hpbGQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpdGVtcztcblx0XHR9KSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlsZU5lc3RlcjogRXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGZpbGVOZXN0ZXIoKTogRXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUge1xuXHRcdGlmICghdGhpcy5yb290Ll9maWxlTmVzdGVyKSB7XG5cdFx0XHRjb25zdCBuZXN0aW5nQ29uZmlnID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IHRoaXMucm9vdC5yZXNvdXJjZSB9KS5leHBsb3Jlci5maWxlTmVzdGluZztcblx0XHRcdGNvbnN0IHBhdHRlcm5zID0gT2JqZWN0LmVudHJpZXMobmVzdGluZ0NvbmZpZy5wYXR0ZXJucylcblx0XHRcdFx0LmZpbHRlcihlbnRyeSA9PlxuXHRcdFx0XHRcdHR5cGVvZiAoZW50cnlbMF0pID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgKGVudHJ5WzFdKSA9PT0gJ3N0cmluZycgJiYgZW50cnlbMF0gJiYgZW50cnlbMV0pXG5cdFx0XHRcdC5tYXAoKFtwYXJlbnRQYXR0ZXJuLCBjaGlsZHJlblBhdHRlcm5zXSkgPT5cblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR0aGlzLmdldFBsYXRmb3JtQXdhcmVOYW1lKHBhcmVudFBhdHRlcm4udHJpbSgpKSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuUGF0dGVybnMuc3BsaXQoJywnKS5tYXAocCA9PiB0aGlzLmdldFBsYXRmb3JtQXdhcmVOYW1lKHAudHJpbSgpLnJlcGxhY2UoL1xcdTIwMGIvZywgJycpLnRyaW0oKSkpXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIocCA9PiBwICE9PSAnJylcblx0XHRcdFx0XHRdIGFzIFtzdHJpbmcsIHN0cmluZ1tdXSk7XG5cblx0XHRcdHRoaXMucm9vdC5fZmlsZU5lc3RlciA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShwYXR0ZXJucyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJvb3QuX2ZpbGVOZXN0ZXI7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhIGNoaWxkIGVsZW1lbnQgZnJvbSB0aGlzIGZvbGRlci5cblx0ICovXG5cdHJlbW92ZUNoaWxkKGNoaWxkOiBFeHBsb3Jlckl0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLm5lc3RlZENoaWxkcmVuID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY2hpbGRyZW4uZGVsZXRlKHRoaXMuZ2V0UGxhdGZvcm1Bd2FyZU5hbWUoY2hpbGQubmFtZSkpO1xuXHR9XG5cblx0Zm9yZ2V0Q2hpbGRyZW4oKTogdm9pZCB7XG5cdFx0dGhpcy5jaGlsZHJlbi5jbGVhcigpO1xuXHRcdHRoaXMubmVzdGVkQ2hpbGRyZW4gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faXNEaXJlY3RvcnlSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2ZpbGVOZXN0ZXIgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFBsYXRmb3JtQXdhcmVOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZVNlcnZpY2UuaGFzQ2FwYWJpbGl0eSh0aGlzLnJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpID8gbmFtZSA6IG5hbWUudG9Mb3dlckNhc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlcyB0aGlzIGVsZW1lbnQgdW5kZXIgYSBuZXcgcGFyZW50IGVsZW1lbnQuXG5cdCAqL1xuXHRtb3ZlKG5ld1BhcmVudDogRXhwbG9yZXJJdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5uZXN0ZWRQYXJlbnQ/LnJlbW92ZUNoaWxkKHRoaXMpO1xuXHRcdHRoaXMuX3BhcmVudD8ucmVtb3ZlQ2hpbGQodGhpcyk7XG5cdFx0bmV3UGFyZW50LnJlbW92ZUNoaWxkKHRoaXMpOyAvLyBtYWtlIHN1cmUgdG8gcmVtb3ZlIGFueSBwcmV2aW91cyB2ZXJzaW9uIG9mIHRoZSBmaWxlIGlmIGFueVxuXHRcdG5ld1BhcmVudC5hZGRDaGlsZCh0aGlzKTtcblx0XHR0aGlzLnVwZGF0ZVJlc291cmNlKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSZXNvdXJjZShyZWN1cnNpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGFyZW50KSB7XG5cdFx0XHR0aGlzLnJlc291cmNlID0gam9pblBhdGgodGhpcy5fcGFyZW50LnJlc291cmNlLCB0aGlzLm5hbWUpO1xuXHRcdH1cblxuXHRcdGlmIChyZWN1cnNpdmUpIHtcblx0XHRcdGlmICh0aGlzLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHRoaXMuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB7XG5cdFx0XHRcdFx0Y2hpbGQudXBkYXRlUmVzb3VyY2UodHJ1ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUZWxscyB0aGlzIHN0YXQgdGhhdCBpdCB3YXMgcmVuYW1lZC4gVGhpcyByZXF1aXJlcyBjaGFuZ2VzIHRvIGFsbCBjaGlsZHJlbiBvZiB0aGlzIHN0YXQgKGlmIGFueSlcblx0ICogc28gdGhhdCB0aGUgcGF0aCBwcm9wZXJ0eSBjYW4gYmUgdXBkYXRlZCBwcm9wZXJseS5cblx0ICovXG5cdHJlbmFtZShyZW5hbWVkU3RhdDogeyBuYW1lOiBzdHJpbmc7IG10aW1lPzogbnVtYmVyIH0pOiB2b2lkIHtcblxuXHRcdC8vIE1lcmdlIGEgc3Vic2V0IG9mIFByb3BlcnRpZXMgdGhhdCBjYW4gY2hhbmdlIG9uIHJlbmFtZVxuXHRcdHRoaXMudXBkYXRlTmFtZShyZW5hbWVkU3RhdC5uYW1lKTtcblx0XHR0aGlzLl9tdGltZSA9IHJlbmFtZWRTdGF0Lm10aW1lO1xuXG5cdFx0Ly8gVXBkYXRlIFBhdGhzIGluY2x1ZGluZyBjaGlsZHJlblxuXHRcdHRoaXMudXBkYXRlUmVzb3VyY2UodHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIGNoaWxkIHN0YXQgZnJvbSB0aGlzIHN0YXQgdGhhdCBtYXRjaGVzIHdpdGggdGhlIHByb3ZpZGVkIHBhdGguXG5cdCAqIFdpbGwgcmV0dXJuIFwibnVsbFwiIGluIGNhc2UgdGhlIGNoaWxkIGRvZXMgbm90IGV4aXN0LlxuXHQgKi9cblx0ZmluZChyZXNvdXJjZTogVVJJKTogRXhwbG9yZXJJdGVtIHwgbnVsbCB7XG5cdFx0Ly8gUmV0dXJuIGlmIHBhdGggZm91bmRcblx0XHQvLyBGb3IgcGVyZm9ybWFuY2UgcmVhc29ucyB0cnkgdG8gZG8gdGhlIGNvbXBhcmlzb24gYXMgZmFzdCBhcyBwb3NzaWJsZVxuXHRcdGNvbnN0IGlnbm9yZUNhc2UgPSAhdGhpcy5maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KHJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdGlmIChyZXNvdXJjZSAmJiB0aGlzLnJlc291cmNlLnNjaGVtZSA9PT0gcmVzb3VyY2Uuc2NoZW1lICYmIGVxdWFsc0lnbm9yZUNhc2UodGhpcy5yZXNvdXJjZS5hdXRob3JpdHksIHJlc291cmNlLmF1dGhvcml0eSkgJiZcblx0XHRcdChpZ25vcmVDYXNlID8gc3RhcnRzV2l0aElnbm9yZUNhc2UocmVzb3VyY2UucGF0aCwgdGhpcy5yZXNvdXJjZS5wYXRoKSA6IHJlc291cmNlLnBhdGguc3RhcnRzV2l0aCh0aGlzLnJlc291cmNlLnBhdGgpKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmluZEJ5UGF0aChydHJpbShyZXNvdXJjZS5wYXRoLCBwb3NpeC5zZXApLCB0aGlzLnJlc291cmNlLnBhdGgubGVuZ3RoLCBpZ25vcmVDYXNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDsgLy9VbmFibGUgdG8gZmluZFxuXHR9XG5cblx0cHJpdmF0ZSBmaW5kQnlQYXRoKHBhdGg6IHN0cmluZywgaW5kZXg6IG51bWJlciwgaWdub3JlQ2FzZTogYm9vbGVhbik6IEV4cGxvcmVySXRlbSB8IG51bGwge1xuXHRcdGlmIChpc0VxdWFsKHJ0cmltKHRoaXMucmVzb3VyY2UucGF0aCwgcG9zaXguc2VwKSwgcGF0aCwgaWdub3JlQ2FzZSkpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHQvLyBJZ25vcmUgc2VwYXJ0b3IgdG8gbW9yZSBlYXNpbHkgZGVkdWN0IHRoZSBuZXh0IG5hbWUgdG8gc2VhcmNoXG5cdFx0XHR3aGlsZSAoaW5kZXggPCBwYXRoLmxlbmd0aCAmJiBwYXRoW2luZGV4XSA9PT0gcG9zaXguc2VwKSB7XG5cdFx0XHRcdGluZGV4Kys7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBpbmRleE9mTmV4dFNlcCA9IHBhdGguaW5kZXhPZihwb3NpeC5zZXAsIGluZGV4KTtcblx0XHRcdGlmIChpbmRleE9mTmV4dFNlcCA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgbm8gc2VwYXJhdG9yIHRha2UgdGhlIHJlbWFpbmRlciBvZiB0aGUgcGF0aFxuXHRcdFx0XHRpbmRleE9mTmV4dFNlcCA9IHBhdGgubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIG5hbWUgdG8gc2VhcmNoIGlzIGJldHdlZW4gdHdvIHNlcGFyYXRvcnNcblx0XHRcdGNvbnN0IG5hbWUgPSBwYXRoLnN1YnN0cmluZyhpbmRleCwgaW5kZXhPZk5leHRTZXApO1xuXG5cdFx0XHRjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGRyZW4uZ2V0KHRoaXMuZ2V0UGxhdGZvcm1Bd2FyZU5hbWUobmFtZSkpO1xuXG5cdFx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdFx0Ly8gV2UgZm91bmQgYSBjaGlsZCB3aXRoIHRoZSBnaXZlbiBuYW1lLCBzZWFyY2ggaW5zaWRlIGl0XG5cdFx0XHRcdHJldHVybiBjaGlsZC5maW5kQnlQYXRoKHBhdGgsIGluZGV4T2ZOZXh0U2VwLCBpZ25vcmVDYXNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8vIEZpbmRcblx0cHJpdmF0ZSBtYXJrZWRBc0ZpbmRSZXN1bHQgPSBmYWxzZTtcblx0aXNNYXJrZWRBc0ZpbHRlcmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1hcmtlZEFzRmluZFJlc3VsdDtcblx0fVxuXG5cdG1hcmtJdGVtQW5kUGFyZW50c0FzRmlsdGVyZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5tYXJrZWRBc0ZpbmRSZXN1bHQgPSB0cnVlO1xuXHRcdHRoaXMucGFyZW50Py5tYXJrSXRlbUFuZFBhcmVudHNBc0ZpbHRlcmVkKCk7XG5cdH1cblxuXHR1bm1hcmtJdGVtQW5kQ2hpbGRyZW4oKTogdm9pZCB7XG5cdFx0dGhpcy5tYXJrZWRBc0ZpbmRSZXN1bHQgPSBmYWxzZTtcblx0XHR0aGlzLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4gY2hpbGQudW5tYXJrSXRlbUFuZENoaWxkcmVuKCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOZXdFeHBsb3Jlckl0ZW0gZXh0ZW5kcyBFeHBsb3Jlckl0ZW0ge1xuXHRjb25zdHJ1Y3RvcihmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGZpbGVzQ29uZmlnU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHBhcmVudDogRXhwbG9yZXJJdGVtLCBpc0RpcmVjdG9yeTogYm9vbGVhbikge1xuXHRcdHN1cGVyKFVSSS5maWxlKCcnKSwgZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UsIGZpbGVzQ29uZmlnU2VydmljZSwgcGFyZW50LCBpc0RpcmVjdG9yeSk7XG5cdFx0dGhpcy5faXNEaXJlY3RvcnlSZXNvbHZlZCA9IHRydWU7XG5cdH1cbn1cbiJdLAog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
