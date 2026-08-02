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
import { delta as arrayDelta, mapArrayOrNot } from "../../../base/common/arrays.js";
import { AsyncIterableProducer, Barrier } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { AsyncEmitter, Emitter } from "../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { Schemas } from "../../../base/common/network.js";
import { Counter } from "../../../base/common/numbers.js";
import { basename, basenameOrAuthority, dirname, ExtUri, relativePath } from "../../../base/common/resources.js";
import { compare } from "../../../base/common/strings.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { FileSystemProviderCapabilities } from "../../../platform/files/common/files.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { Severity } from "../../../platform/notification/common/notification.js";
import { Workspace, WorkspaceFolder } from "../../../platform/workspace/common/workspace.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { GlobPattern } from "./extHostTypeConverters.js";
import { Range } from "./extHostTypes.js";
import { IURITransformerService } from "./extHostUriTransformerService.js";
import { resultIsMatch } from "../../services/search/common/search.js";
import { MainContext } from "./extHost.protocol.js";
import { revive } from "../../../base/common/marshalling.js";
import { ExcludeSettingOptions, TextSearchContext2, TextSearchMatch2 } from "../../services/search/common/searchExtTypes.js";
import { bufferToStream, readableToBuffer, VSBuffer } from "../../../base/common/buffer.js";
import { toDecodeStream, toEncodeReadable, UTF8 } from "../../services/textfile/common/encoding.js";
import { consumeStream } from "../../../base/common/stream.js";
import { stringToSnapshot } from "../../services/textfile/common/textfiles.js";
function isFolderEqual(folderA, folderB, extHostFileSystemInfo) {
  return new ExtUri((uri) => ignorePathCasing(uri, extHostFileSystemInfo)).isEqual(folderA, folderB);
}
function compareWorkspaceFolderByUri(a, b, extHostFileSystemInfo) {
  return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? 0 : compare(a.uri.toString(), b.uri.toString());
}
function compareWorkspaceFolderByUriAndNameAndIndex(a, b, extHostFileSystemInfo) {
  if (a.index !== b.index) {
    return a.index < b.index ? -1 : 1;
  }
  return isFolderEqual(a.uri, b.uri, extHostFileSystemInfo) ? compare(a.name, b.name) : compare(a.uri.toString(), b.uri.toString());
}
function delta(oldFolders, newFolders, compare2, extHostFileSystemInfo) {
  const oldSortedFolders = oldFolders.slice(0).sort((a, b) => compare2(a, b, extHostFileSystemInfo));
  const newSortedFolders = newFolders.slice(0).sort((a, b) => compare2(a, b, extHostFileSystemInfo));
  return arrayDelta(oldSortedFolders, newSortedFolders, (a, b) => compare2(a, b, extHostFileSystemInfo));
}
function ignorePathCasing(uri, extHostFileSystemInfo) {
  const capabilities = extHostFileSystemInfo.getCapabilities(uri.scheme);
  return !(capabilities && capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
}
class ExtHostWorkspaceImpl extends Workspace {
  constructor(id, _name, folders, transient, configuration, _isUntitled, ignorePathCasing2) {
    super(id, folders.map((f) => new WorkspaceFolder(f)), transient, configuration, ignorePathCasing2);
    this._name = _name;
    this._isUntitled = _isUntitled;
    this._workspaceFolders = [];
    this._structure = TernarySearchTree.forUris(ignorePathCasing2, () => true);
    folders.forEach((folder) => {
      this._workspaceFolders.push(folder);
      this._structure.set(folder.uri, folder);
    });
  }
  static toExtHostWorkspace(data, previousConfirmedWorkspace, previousUnconfirmedWorkspace, extHostFileSystemInfo) {
    if (!data) {
      return { workspace: null, added: [], removed: [] };
    }
    const { id, name, folders, configuration, transient, isUntitled } = data;
    const newWorkspaceFolders = [];
    const oldWorkspace = previousConfirmedWorkspace;
    if (previousConfirmedWorkspace) {
      folders.forEach((folderData, index) => {
        const folderUri = URI.revive(folderData.uri);
        const existingFolder = ExtHostWorkspaceImpl._findFolder(previousUnconfirmedWorkspace || previousConfirmedWorkspace, folderUri, extHostFileSystemInfo);
        if (existingFolder) {
          existingFolder.name = folderData.name;
          existingFolder.index = folderData.index;
          newWorkspaceFolders.push(existingFolder);
        } else {
          newWorkspaceFolders.push({ uri: folderUri, name: folderData.name, index });
        }
      });
    } else {
      newWorkspaceFolders.push(...folders.map(({ uri, name: name2, index }) => ({ uri: URI.revive(uri), name: name2, index })));
    }
    newWorkspaceFolders.sort((f1, f2) => f1.index < f2.index ? -1 : 1);
    const workspace = new ExtHostWorkspaceImpl(id, name, newWorkspaceFolders, !!transient, configuration ? URI.revive(configuration) : null, !!isUntitled, (uri) => ignorePathCasing(uri, extHostFileSystemInfo));
    const { added, removed } = delta(oldWorkspace ? oldWorkspace.workspaceFolders : [], workspace.workspaceFolders, compareWorkspaceFolderByUri, extHostFileSystemInfo);
    return { workspace, added, removed };
  }
  static _findFolder(workspace, folderUriToFind, extHostFileSystemInfo) {
    for (let i = 0; i < workspace.folders.length; i++) {
      const folder = workspace.workspaceFolders[i];
      if (isFolderEqual(folder.uri, folderUriToFind, extHostFileSystemInfo)) {
        return folder;
      }
    }
    return void 0;
  }
  get name() {
    return this._name;
  }
  get isUntitled() {
    return this._isUntitled;
  }
  get workspaceFolders() {
    return this._workspaceFolders.slice(0);
  }
  getWorkspaceFolder(uri, resolveParent) {
    if (resolveParent && this._structure.get(uri)) {
      uri = dirname(uri);
    }
    return this._structure.findSubstr(uri);
  }
  resolveWorkspaceFolder(uri) {
    return this._structure.get(uri);
  }
}
let ExtHostWorkspace = class {
  constructor(extHostRpc, initData, extHostFileSystemInfo, logService, uriTransformerService) {
    this._onDidChangeWorkspace = new Emitter();
    this.onDidChangeWorkspace = this._onDidChangeWorkspace.event;
    this._onDidGrantWorkspaceTrust = new Emitter();
    this.onDidGrantWorkspaceTrust = this._onDidGrantWorkspaceTrust.event;
    this._onDidChangeWorkspaceTrustedFolders = new Emitter();
    this.onDidChangeWorkspaceTrustedFolders = this._onDidChangeWorkspaceTrustedFolders.event;
    this._activeSearchCallbacks = [];
    this._trusted = false;
    this._editSessionIdentityProviders = /* @__PURE__ */ new Map();
    // --- edit sessions ---
    this._providerHandlePool = 0;
    this._onWillCreateEditSessionIdentityEvent = new AsyncEmitter();
    // --- canonical uri identity ---
    this._canonicalUriProviders = /* @__PURE__ */ new Map();
    this._logService = logService;
    this._extHostFileSystemInfo = extHostFileSystemInfo;
    this._uriTransformerService = uriTransformerService;
    this._requestIdProvider = new Counter();
    this._barrier = new Barrier();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadWorkspace);
    this._messageService = extHostRpc.getProxy(MainContext.MainThreadMessageService);
    this._telemetryProxy = extHostRpc.getProxy(MainContext.MainThreadTelemetry);
    const data = initData.workspace;
    this._confirmedWorkspace = data ? new ExtHostWorkspaceImpl(data.id, data.name, [], !!data.transient, data.configuration ? URI.revive(data.configuration) : null, !!data.isUntitled, (uri) => ignorePathCasing(uri, extHostFileSystemInfo)) : void 0;
  }
  /**
   * Receives the configuration provider from ExtHostConfiguration after init. We cannot inject
   * IExtHostConfiguration directly because it creates a DI cycle (ExtHostConfiguration already
   * depends on IExtHostWorkspace). Once set, settings reads in findFiles become synchronous.
   */
  $setConfigProvider(provider) {
    this._configProvider = provider;
  }
  _useIgnoreFilesInFindFiles() {
    return this._configProvider?.getConfiguration("search").get("experimental.useIgnoreFilesInFindFiles") ?? false;
  }
  _userIgnoreFilesSetting() {
    return this._configProvider?.getConfiguration("search").get("useIgnoreFiles") ?? true;
  }
  $initializeWorkspace(data, trusted) {
    this._trusted = trusted;
    this.$acceptWorkspaceData(data);
    this._barrier.open();
  }
  waitForInitializeCall() {
    return this._barrier.wait();
  }
  // --- workspace ---
  get workspace() {
    return this._actualWorkspace;
  }
  get name() {
    return this._actualWorkspace ? this._actualWorkspace.name : void 0;
  }
  get workspaceFile() {
    if (this._actualWorkspace) {
      if (this._actualWorkspace.configuration) {
        if (this._actualWorkspace.isUntitled) {
          return URI.from({ scheme: Schemas.untitled, path: basename(dirname(this._actualWorkspace.configuration)) });
        }
        return this._actualWorkspace.configuration;
      }
    }
    return void 0;
  }
  get _actualWorkspace() {
    return this._unconfirmedWorkspace || this._confirmedWorkspace;
  }
  getWorkspaceFolders() {
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.workspaceFolders.slice(0);
  }
  async getWorkspaceFolders2() {
    await this._barrier.wait();
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.workspaceFolders.slice(0);
  }
  updateWorkspaceFolders(extension, index, deleteCount, ...workspaceFoldersToAdd) {
    const validatedDistinctWorkspaceFoldersToAdd = [];
    if (Array.isArray(workspaceFoldersToAdd)) {
      workspaceFoldersToAdd.forEach((folderToAdd) => {
        if (URI.isUri(folderToAdd.uri) && !validatedDistinctWorkspaceFoldersToAdd.some((f) => isFolderEqual(f.uri, folderToAdd.uri, this._extHostFileSystemInfo))) {
          validatedDistinctWorkspaceFoldersToAdd.push({ uri: folderToAdd.uri, name: folderToAdd.name || basenameOrAuthority(folderToAdd.uri) });
        }
      });
    }
    if (!!this._unconfirmedWorkspace) {
      return false;
    }
    if ([index, deleteCount].some((i) => typeof i !== "number" || i < 0)) {
      return false;
    }
    if (deleteCount === 0 && validatedDistinctWorkspaceFoldersToAdd.length === 0) {
      return false;
    }
    const currentWorkspaceFolders = this._actualWorkspace ? this._actualWorkspace.workspaceFolders : [];
    if (index + deleteCount > currentWorkspaceFolders.length) {
      return false;
    }
    const newWorkspaceFolders = currentWorkspaceFolders.slice(0);
    newWorkspaceFolders.splice(index, deleteCount, ...validatedDistinctWorkspaceFoldersToAdd.map((f) => ({
      uri: f.uri,
      name: f.name || basenameOrAuthority(f.uri),
      index: void 0
      /* fixed later */
    })));
    for (let i = 0; i < newWorkspaceFolders.length; i++) {
      const folder = newWorkspaceFolders[i];
      if (newWorkspaceFolders.some((otherFolder, index2) => index2 !== i && isFolderEqual(folder.uri, otherFolder.uri, this._extHostFileSystemInfo))) {
        return false;
      }
    }
    newWorkspaceFolders.forEach((f, index2) => f.index = index2);
    const { added, removed } = delta(currentWorkspaceFolders, newWorkspaceFolders, compareWorkspaceFolderByUriAndNameAndIndex, this._extHostFileSystemInfo);
    if (added.length === 0 && removed.length === 0) {
      return false;
    }
    if (this._proxy) {
      const extName = extension.displayName || extension.name;
      this._proxy.$updateWorkspaceFolders(extName, index, deleteCount, validatedDistinctWorkspaceFoldersToAdd).then(void 0, (error) => {
        this._unconfirmedWorkspace = void 0;
        const options = { source: { identifier: extension.identifier, label: extension.displayName || extension.name } };
        this._messageService.$showMessage(Severity.Error, localize("updateerror", "Extension '{0}' failed to update workspace folders: {1}", extName, error.toString()), options, []);
      });
    }
    this.trySetWorkspaceFolders(newWorkspaceFolders);
    return true;
  }
  getWorkspaceFolder(uri, resolveParent) {
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
  }
  async getWorkspaceFolder2(uri, resolveParent) {
    await this._barrier.wait();
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
  }
  async resolveWorkspaceFolder(uri) {
    await this._barrier.wait();
    if (!this._actualWorkspace) {
      return void 0;
    }
    return this._actualWorkspace.resolveWorkspaceFolder(uri);
  }
  getPath() {
    if (!this._actualWorkspace) {
      return void 0;
    }
    const { folders } = this._actualWorkspace;
    if (folders.length === 0) {
      return void 0;
    }
    return folders[0].uri.fsPath;
  }
  getRelativePath(pathOrUri, includeWorkspace) {
    let resource;
    let path = "";
    if (typeof pathOrUri === "string") {
      resource = URI.file(pathOrUri);
      path = pathOrUri;
    } else if (typeof pathOrUri !== "undefined") {
      resource = pathOrUri;
      path = pathOrUri.fsPath;
    }
    if (!resource) {
      return path;
    }
    const folder = this.getWorkspaceFolder(
      resource,
      true
    );
    if (!folder) {
      return path;
    }
    if (typeof includeWorkspace === "undefined" && this._actualWorkspace) {
      includeWorkspace = this._actualWorkspace.folders.length > 1;
    }
    let result = relativePath(folder.uri, resource);
    if (includeWorkspace && folder.name) {
      result = `${folder.name}/${result}`;
    }
    return result;
  }
  trySetWorkspaceFolders(folders) {
    if (this._actualWorkspace) {
      this._unconfirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace({
        id: this._actualWorkspace.id,
        name: this._actualWorkspace.name,
        configuration: this._actualWorkspace.configuration,
        folders,
        isUntitled: this._actualWorkspace.isUntitled
      }, this._actualWorkspace, void 0, this._extHostFileSystemInfo).workspace || void 0;
    }
  }
  $acceptWorkspaceData(data) {
    const { workspace, added, removed } = ExtHostWorkspaceImpl.toExtHostWorkspace(data, this._confirmedWorkspace, this._unconfirmedWorkspace, this._extHostFileSystemInfo);
    this._confirmedWorkspace = workspace || void 0;
    this._unconfirmedWorkspace = void 0;
    this._onDidChangeWorkspace.fire(Object.freeze({
      added,
      removed
    }));
  }
  // --- search ---
  /**
   * Note, null/undefined have different and important meanings for "exclude"
   */
  findFiles(include, exclude, maxResults, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findFiles: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles`);
    let excludeString = "";
    let useFileExcludes = true;
    if (exclude === null) {
      useFileExcludes = false;
    } else if (exclude !== void 0) {
      if (typeof exclude === "string") {
        excludeString = exclude;
      } else {
        excludeString = exclude.pattern;
      }
    }
    const useIgnoreFilesOptIn = this._useIgnoreFilesInFindFiles();
    const localIgnoreFiles = useIgnoreFilesOptIn && exclude !== null ? void 0 : false;
    return this._findFilesImpl({ type: "include", value: include }, {
      exclude: [excludeString],
      maxResults,
      useExcludeSettings: useFileExcludes ? ExcludeSettingOptions.FilesExclude : ExcludeSettingOptions.None,
      useIgnoreFiles: {
        local: localIgnoreFiles
      }
    }, extensionId, "findFiles", { useIgnoreFilesLocal: void 0, excludeWasNull: exclude === null }, token);
  }
  findFiles2(filePatterns, options = {}, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findFiles2New: fileSearch, extension: ${extensionId.value}, entryPoint: findFiles2New`);
    return this._findFilesImpl({ type: "filePatterns", value: filePatterns }, options, extensionId, "findFiles2", { useIgnoreFilesLocal: options.useIgnoreFiles?.local, excludeWasNull: false }, token);
  }
  async _findFilesImpl(query, options, extensionId, apiKind, intent, token) {
    const useIgnoreFilesLocalRequested = intent.useIgnoreFilesLocal === true ? "true" : intent.useIgnoreFilesLocal === false ? "false" : "unspecified";
    const sw = new StopWatch(true);
    let queryCount = 0;
    let respectedIgnoreFiles = this._userIgnoreFilesSetting();
    let resultCount = 0;
    let cancelled = false;
    let errored = false;
    try {
      if (token.isCancellationRequested) {
        cancelled = true;
        return [];
      }
      const filePatternsToUse = query.type === "include" ? [query.value] : query.value ?? [];
      if (!Array.isArray(filePatternsToUse)) {
        console.error("Invalid file pattern provided", filePatternsToUse);
        throw new Error(`Invalid file pattern provided ${JSON.stringify(filePatternsToUse)}`);
      }
      const queryOptions = filePatternsToUse.map((filePattern) => {
        const excludePatterns = globsToISearchPatternBuilder(options.exclude);
        const fileQueries = {
          ignoreSymlinks: typeof options.followSymlinks === "boolean" ? !options.followSymlinks : void 0,
          disregardIgnoreFiles: typeof options.useIgnoreFiles?.local === "boolean" ? !options.useIgnoreFiles.local : void 0,
          disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === "boolean" ? !options.useIgnoreFiles.global : void 0,
          disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === "boolean" ? !options.useIgnoreFiles.parent : void 0,
          disregardExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings === ExcludeSettingOptions.None,
          disregardSearchExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude,
          maxResults: options.maxResults,
          excludePattern: excludePatterns.length > 0 ? excludePatterns : void 0,
          ignoreGlobCase: options.caseInsensitive,
          _reason: "startFileSearch",
          shouldGlobSearch: query.type === "include" ? void 0 : true
        };
        const parseInclude = parseSearchExcludeInclude(GlobPattern.from(filePattern));
        const folderToUse = parseInclude?.folder;
        if (query.type === "include") {
          fileQueries.includePattern = parseInclude?.pattern;
        } else {
          fileQueries.filePattern = parseInclude?.pattern;
        }
        return {
          folder: folderToUse,
          options: fileQueries
        };
      });
      queryCount = queryOptions.length;
      const userHonorsIgnore = this._userIgnoreFilesSetting();
      respectedIgnoreFiles = queryOptions.every((q) => q.options.disregardIgnoreFiles === true ? false : q.options.disregardIgnoreFiles === false ? true : userHonorsIgnore);
      const result = await this._findFilesBase(queryOptions, token);
      resultCount = result.length;
      cancelled = token.isCancellationRequested;
      return result;
    } catch (err) {
      errored = true;
      cancelled = token.isCancellationRequested;
      throw err;
    } finally {
      this._reportFindFilesTelemetry({
        extensionId: extensionId.value,
        apiKind,
        respectedIgnoreFiles,
        useIgnoreFilesLocalRequested,
        excludeWasNull: intent.excludeWasNull,
        resultCount,
        durationMs: sw.elapsed(),
        queryCount,
        cancelled,
        errored
      });
    }
  }
  async _findFilesBase(queryOptions, token) {
    let tokenToUse = token;
    let linkedSource;
    if (!CancellationToken.isCancellationToken(token)) {
      linkedSource = new CancellationTokenSource();
      const foreignToken = token;
      if (typeof foreignToken.onCancellationRequested === "function") {
        foreignToken.onCancellationRequested(() => linkedSource.cancel());
      }
      tokenToUse = linkedSource.token;
    }
    const result = await Promise.all(queryOptions?.map(
      (option) => this._proxy.$startFileSearch(
        option.folder ?? null,
        option.options,
        tokenToUse
      ).then((data) => Array.isArray(data) ? data.map((d) => URI.revive(d)) : [])
    ) ?? []);
    const flatResult = result.flat();
    linkedSource?.dispose();
    const extUri = new ExtUri((uri) => ignorePathCasing(uri, this._extHostFileSystemInfo));
    const uriMap = /* @__PURE__ */ new Map();
    for (const uri of flatResult) {
      const key = extUri.getComparisonKey(uri);
      if (!uriMap.has(key)) {
        uriMap.set(key, uri);
      }
    }
    return Array.from(uriMap.values());
  }
  _reportFindFilesTelemetry(event) {
    this._telemetryProxy.$publicLog2("extHostFindFiles", event);
  }
  findTextInFiles2(query, options, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findTextInFiles2: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles2`);
    const getOptions = (include) => {
      if (!options) {
        return {
          folder: void 0,
          options: {}
        };
      }
      const parsedInclude = include ? parseSearchExcludeInclude(GlobPattern.from(include)) : void 0;
      const excludePatterns = options.exclude ? globsToISearchPatternBuilder(options.exclude) : void 0;
      return {
        options: {
          ignoreSymlinks: typeof options.followSymlinks === "boolean" ? !options.followSymlinks : void 0,
          disregardIgnoreFiles: typeof options.useIgnoreFiles?.local === "boolean" ? !options.useIgnoreFiles?.local : void 0,
          disregardGlobalIgnoreFiles: typeof options.useIgnoreFiles?.global === "boolean" ? !options.useIgnoreFiles?.global : void 0,
          disregardParentIgnoreFiles: typeof options.useIgnoreFiles?.parent === "boolean" ? !options.useIgnoreFiles?.parent : void 0,
          disregardExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings === ExcludeSettingOptions.None,
          disregardSearchExcludeSettings: options.useExcludeSettings !== void 0 && options.useExcludeSettings !== ExcludeSettingOptions.SearchAndFilesExclude,
          fileEncoding: options.encoding,
          maxResults: options.maxResults,
          ignoreGlobCase: options.caseInsensitive,
          previewOptions: options.previewOptions ? {
            matchLines: options.previewOptions?.numMatchLines ?? 100,
            charsPerLine: options.previewOptions?.charsPerLine ?? 1e4
          } : void 0,
          surroundingContext: options.surroundingContext,
          includePattern: parsedInclude?.pattern,
          excludePattern: excludePatterns
        },
        folder: parsedInclude?.folder
      };
    };
    const queryOptionsRaw = options?.include?.map((include) => getOptions(include)) ?? [getOptions(void 0)];
    const queryOptions = queryOptionsRaw.filter((queryOps) => !!queryOps);
    const disposables = new DisposableStore();
    const progressEmitter = disposables.add(new Emitter());
    const complete = this.findTextInFilesBase(
      query,
      queryOptions,
      (result, uri) => progressEmitter.fire({ result, uri }),
      token
    );
    const asyncIterable = new AsyncIterableProducer(async (emitter) => {
      disposables.add(progressEmitter.event((e) => {
        const result = e.result;
        const uri = e.uri;
        if (resultIsMatch(result)) {
          emitter.emitOne(new TextSearchMatch2(
            uri,
            result.rangeLocations.map((range) => ({
              previewRange: new Range(range.preview.startLineNumber, range.preview.startColumn, range.preview.endLineNumber, range.preview.endColumn),
              sourceRange: new Range(range.source.startLineNumber, range.source.startColumn, range.source.endLineNumber, range.source.endColumn)
            })),
            result.previewText
          ));
        } else {
          emitter.emitOne(new TextSearchContext2(
            uri,
            result.text,
            result.lineNumber
          ));
        }
      }));
      await complete;
    });
    return {
      results: asyncIterable,
      complete: complete.then((e) => {
        disposables.dispose();
        return {
          limitHit: e?.limitHit ?? false
        };
      })
    };
  }
  async findTextInFilesBase(query, queryOptions, callback, token = CancellationToken.None) {
    const requestId = this._requestIdProvider.getNext();
    let isCanceled = false;
    token.onCancellationRequested((_) => {
      isCanceled = true;
    });
    this._activeSearchCallbacks[requestId] = (p) => {
      if (isCanceled) {
        return;
      }
      const uri = URI.revive(p.resource);
      p.results.forEach((rawResult) => {
        const result = revive(rawResult);
        callback(result, uri);
      });
    };
    if (token.isCancellationRequested) {
      return {};
    }
    try {
      const result = await Promise.all(queryOptions?.map(
        (option) => this._proxy.$startTextSearch(
          query,
          option.folder ?? null,
          option.options,
          requestId,
          token
        ) || {}
      ) ?? []);
      delete this._activeSearchCallbacks[requestId];
      return result.reduce((acc, val) => {
        return {
          limitHit: acc?.limitHit || (val?.limitHit ?? false),
          message: [acc?.message ?? [], val?.message ?? []].flat()
        };
      }, {}) ?? { limitHit: false };
    } catch (err) {
      delete this._activeSearchCallbacks[requestId];
      throw err;
    }
  }
  async findTextInFiles(query, options, callback, extensionId, token = CancellationToken.None) {
    this._logService.trace(`extHostWorkspace#findTextInFiles: textSearch, extension: ${extensionId.value}, entryPoint: findTextInFiles`);
    const previewOptions = typeof options.previewOptions === "undefined" ? {
      matchLines: 100,
      charsPerLine: 1e4
    } : options.previewOptions;
    const parsedInclude = parseSearchExcludeInclude(GlobPattern.from(options.include));
    const excludePattern = typeof options.exclude === "string" ? options.exclude : options.exclude ? options.exclude.pattern : void 0;
    const queryOptions = {
      ignoreSymlinks: typeof options.followSymlinks === "boolean" ? !options.followSymlinks : void 0,
      disregardIgnoreFiles: typeof options.useIgnoreFiles === "boolean" ? !options.useIgnoreFiles : void 0,
      disregardGlobalIgnoreFiles: typeof options.useGlobalIgnoreFiles === "boolean" ? !options.useGlobalIgnoreFiles : void 0,
      disregardParentIgnoreFiles: typeof options.useParentIgnoreFiles === "boolean" ? !options.useParentIgnoreFiles : void 0,
      disregardExcludeSettings: typeof options.useDefaultExcludes === "boolean" ? !options.useDefaultExcludes : true,
      disregardSearchExcludeSettings: typeof options.useSearchExclude === "boolean" ? !options.useSearchExclude : true,
      fileEncoding: options.encoding,
      maxResults: options.maxResults,
      previewOptions,
      surroundingContext: options.afterContext,
      // TODO: remove ability to have before/after context separately
      includePattern: parsedInclude?.pattern,
      excludePattern: excludePattern ? [{ pattern: excludePattern }] : void 0
    };
    const progress = (result, uri) => {
      if (resultIsMatch(result)) {
        callback({
          uri,
          preview: {
            text: result.previewText,
            matches: mapArrayOrNot(
              result.rangeLocations,
              (m) => new Range(m.preview.startLineNumber, m.preview.startColumn, m.preview.endLineNumber, m.preview.endColumn)
            )
          },
          ranges: mapArrayOrNot(
            result.rangeLocations,
            (r) => new Range(r.source.startLineNumber, r.source.startColumn, r.source.endLineNumber, r.source.endColumn)
          )
        });
      } else {
        callback({
          uri,
          text: result.text,
          lineNumber: result.lineNumber
        });
      }
    };
    return this.findTextInFilesBase(query, [{ options: queryOptions, folder: parsedInclude?.folder }], progress, token);
  }
  $handleTextSearchResult(result, requestId) {
    this._activeSearchCallbacks[requestId]?.(result);
  }
  async save(uri) {
    const result = await this._proxy.$save(uri, { saveAs: false });
    return URI.revive(result);
  }
  async saveAs(uri) {
    const result = await this._proxy.$save(uri, { saveAs: true });
    return URI.revive(result);
  }
  saveAll(includeUntitled) {
    return this._proxy.$saveAll(includeUntitled);
  }
  resolveProxy(url) {
    return this._proxy.$resolveProxy(url);
  }
  lookupAuthorization(authInfo) {
    return this._proxy.$lookupAuthorization(authInfo);
  }
  lookupKerberosAuthorization(url) {
    return this._proxy.$lookupKerberosAuthorization(url);
  }
  loadCertificates() {
    return this._proxy.$loadCertificates();
  }
  // --- trust ---
  get trusted() {
    return this._trusted;
  }
  requestResourceTrust(options) {
    return this._proxy.$requestResourceTrust(options);
  }
  requestWorkspaceTrust(options) {
    return this._proxy.$requestWorkspaceTrust(options);
  }
  $onDidGrantWorkspaceTrust() {
    if (!this._trusted) {
      this._trusted = true;
      this._onDidGrantWorkspaceTrust.fire();
    }
  }
  $onDidChangeWorkspaceTrustedFolders() {
    this._onDidChangeWorkspaceTrustedFolders.fire();
  }
  isResourceTrusted(resource) {
    return this._proxy.$isResourceTrusted(resource);
  }
  // called by ext host
  registerEditSessionIdentityProvider(scheme, provider) {
    if (this._editSessionIdentityProviders.has(scheme)) {
      throw new Error(`A provider has already been registered for scheme ${scheme}`);
    }
    this._editSessionIdentityProviders.set(scheme, provider);
    const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
    const handle = this._providerHandlePool++;
    this._proxy.$registerEditSessionIdentityProvider(handle, outgoingScheme);
    return toDisposable(() => {
      this._editSessionIdentityProviders.delete(scheme);
      this._proxy.$unregisterEditSessionIdentityProvider(handle);
    });
  }
  // called by main thread
  async $getEditSessionIdentifier(workspaceFolder, cancellationToken) {
    this._logService.info("Getting edit session identifier for workspaceFolder", workspaceFolder);
    const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
    if (!folder) {
      this._logService.warn("Unable to resolve workspace folder");
      return void 0;
    }
    this._logService.info("Invoking #provideEditSessionIdentity for workspaceFolder", folder);
    const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
    this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
    if (!provider) {
      return void 0;
    }
    const result = await provider.provideEditSessionIdentity(folder, cancellationToken);
    this._logService.info("Provider returned edit session identifier: ", result);
    if (!result) {
      return void 0;
    }
    return result;
  }
  async $provideEditSessionIdentityMatch(workspaceFolder, identity1, identity2, cancellationToken) {
    this._logService.info("Getting edit session identifier for workspaceFolder", workspaceFolder);
    const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
    if (!folder) {
      this._logService.warn("Unable to resolve workspace folder");
      return void 0;
    }
    this._logService.info("Invoking #provideEditSessionIdentity for workspaceFolder", folder);
    const provider = this._editSessionIdentityProviders.get(folder.uri.scheme);
    this._logService.info(`Provider for scheme ${folder.uri.scheme} is defined: `, !!provider);
    if (!provider) {
      return void 0;
    }
    const result = await provider.provideEditSessionIdentityMatch?.(identity1, identity2, cancellationToken);
    this._logService.info("Provider returned edit session identifier match result: ", result);
    if (!result) {
      return void 0;
    }
    return result;
  }
  getOnWillCreateEditSessionIdentityEvent(extension) {
    return (listener, thisArg, disposables) => {
      const wrappedListener = function wrapped(e) {
        listener.call(thisArg, e);
      };
      wrappedListener.extension = extension;
      return this._onWillCreateEditSessionIdentityEvent.event(wrappedListener, void 0, disposables);
    };
  }
  // main thread calls this to trigger participants
  async $onWillCreateEditSessionIdentity(workspaceFolder, token, timeout) {
    const folder = await this.resolveWorkspaceFolder(URI.revive(workspaceFolder));
    if (folder === void 0) {
      throw new Error("Unable to resolve workspace folder");
    }
    await this._onWillCreateEditSessionIdentityEvent.fireAsync({ workspaceFolder: folder }, token, async (thenable, listener) => {
      const now = Date.now();
      await Promise.resolve(thenable);
      if (Date.now() - now > timeout) {
        this._logService.warn("SLOW edit session create-participant", listener.extension.identifier);
      }
    });
    if (token.isCancellationRequested) {
      return void 0;
    }
  }
  // called by ext host
  registerCanonicalUriProvider(scheme, provider) {
    if (this._canonicalUriProviders.has(scheme)) {
      throw new Error(`A provider has already been registered for scheme ${scheme}`);
    }
    this._canonicalUriProviders.set(scheme, provider);
    const outgoingScheme = this._uriTransformerService.transformOutgoingScheme(scheme);
    const handle = this._providerHandlePool++;
    this._proxy.$registerCanonicalUriProvider(handle, outgoingScheme);
    return toDisposable(() => {
      this._canonicalUriProviders.delete(scheme);
      this._proxy.$unregisterCanonicalUriProvider(handle);
    });
  }
  async provideCanonicalUri(uri, options, cancellationToken) {
    const provider = this._canonicalUriProviders.get(uri.scheme);
    if (!provider) {
      return void 0;
    }
    const result = await provider.provideCanonicalUri?.(URI.revive(uri), options, cancellationToken);
    if (!result) {
      return void 0;
    }
    return result;
  }
  // called by main thread
  async $provideCanonicalUri(uri, targetScheme, cancellationToken) {
    return this.provideCanonicalUri(URI.revive(uri), { targetScheme }, cancellationToken);
  }
  // --- encodings ---
  async decode(content, args) {
    const [uri, opts] = this.toEncodeDecodeParameters(args);
    const options = await this._proxy.$resolveDecoding(uri, opts);
    const stream = (await toDecodeStream(bufferToStream(VSBuffer.wrap(content)), {
      ...options,
      acceptTextOnly: true,
      overwriteEncoding: (detectedEncoding) => {
        if (detectedEncoding === null || detectedEncoding === options.preferredEncoding) {
          return Promise.resolve(options.preferredEncoding);
        }
        return this._proxy.$validateDetectedEncoding(uri, detectedEncoding, opts);
      }
    })).stream;
    return consumeStream(stream, (chunks) => chunks.join(""));
  }
  async encode(content, args) {
    const [uri, options] = this.toEncodeDecodeParameters(args);
    const { encoding, addBOM } = await this._proxy.$resolveEncoding(uri, options);
    if (encoding === UTF8 && !addBOM) {
      return VSBuffer.fromString(content).buffer;
    }
    const res = await toEncodeReadable(stringToSnapshot(content), encoding, { addBOM });
    return readableToBuffer(res).buffer;
  }
  toEncodeDecodeParameters(opts) {
    const uri = isUriComponents(opts?.uri) ? opts.uri : void 0;
    const encoding = typeof opts?.encoding === "string" ? opts.encoding : void 0;
    return [uri, encoding ? { encoding } : void 0];
  }
};
ExtHostWorkspace = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, IExtHostFileSystemInfo),
  __decorateParam(3, ILogService),
  __decorateParam(4, IURITransformerService)
], ExtHostWorkspace);
const IExtHostWorkspace = createDecorator("IExtHostWorkspace");
function parseSearchExcludeInclude(include) {
  let pattern;
  let includeFolder;
  if (include) {
    if (typeof include === "string") {
      pattern = include;
    } else {
      pattern = include.pattern;
      includeFolder = URI.revive(include.baseUri);
    }
    return {
      pattern,
      folder: includeFolder
    };
  }
  return void 0;
}
function globsToISearchPatternBuilder(excludes) {
  return (excludes?.map((exclude) => {
    if (typeof exclude === "string") {
      if (exclude === "") {
        return void 0;
      }
      return {
        pattern: exclude,
        uri: void 0
      };
    } else {
      const parsedExclude = parseSearchExcludeInclude(exclude);
      if (!parsedExclude) {
        return void 0;
      }
      return {
        pattern: parsedExclude.pattern,
        uri: parsedExclude.folder
      };
    }
  }) ?? []).filter((e) => !!e);
}
export {
  ExtHostWorkspace,
  IExtHostWorkspace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RXb3Jrc3BhY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWx0YSBhcyBhcnJheURlbHRhLCBtYXBBcnJheU9yTm90IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEFzeW5jSXRlcmFibGVQcm9kdWNlciwgQmFycmllciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBBc3luY0VtaXR0ZXIsIEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgQ291bnRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGJhc2VuYW1lT3JBdXRob3JpdHksIGRpcm5hbWUsIEV4dFVyaSwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzVXJpQ29tcG9uZW50cywgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uSWRlbnRpdHlNYXRjaCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZSwgV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyB9IGZyb20gJy4vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2xvYlBhdHRlcm4gfSBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IElVUklUcmFuc2Zvcm1lclNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RVcmlUcmFuc2Zvcm1lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCBJU2VhcmNoUGF0dGVybkJ1aWxkZXIsIElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vcXVlcnlCdWlsZGVyLmpzJztcbmltcG9ydCB7IElSYXdGaWxlTWF0Y2gyLCBJVGV4dFNlYXJjaFJlc3VsdCwgcmVzdWx0SXNNYXRjaCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFeHRIb3N0V29ya3NwYWNlU2hhcGUsIElSZWxhdGl2ZVBhdHRlcm5EdG8sIElXb3Jrc3BhY2VEYXRhLCBNYWluQ29udGV4dCwgTWFpblRocmVhZE1lc3NhZ2VPcHRpb25zLCBNYWluVGhyZWFkTWVzc2FnZVNlcnZpY2VTaGFwZSwgTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLCBNYWluVGhyZWFkV29ya3NwYWNlU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgQXV0aEluZm8sIENyZWRlbnRpYWxzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBFeGNsdWRlU2V0dGluZ09wdGlvbnMsIFRleHRTZWFyY2hDb250ZXh0MiwgVGV4dFNlYXJjaE1hdGNoMiB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoRXh0VHlwZXMuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9TdHJlYW0sIHJlYWRhYmxlVG9CdWZmZXIsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHRvRGVjb2RlU3RyZWFtLCB0b0VuY29kZVJlYWRhYmxlLCBVVEY4IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IGNvbnN1bWVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgc3RyaW5nVG9TbmFwc2hvdCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuLy8gVHlwZS1vbmx5IGltcG9ydCB0byBhdm9pZCBhIHJ1bnRpbWUgY3ljbGUgd2l0aCBleHRIb3N0Q29uZmlndXJhdGlvbi50cy5cbmltcG9ydCB0eXBlIHsgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyIH0gZnJvbSAnLi9leHRIb3N0Q29uZmlndXJhdGlvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlciB7XG5cdGdldFdvcmtzcGFjZUZvbGRlcjIodXJpOiB2c2NvZGUuVXJpLCByZXNvbHZlUGFyZW50PzogYm9vbGVhbik6IFByb21pc2U8dnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZD47XG5cdHJlc29sdmVXb3Jrc3BhY2VGb2xkZXIodXJpOiB2c2NvZGUuVXJpKTogUHJvbWlzZTx2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkPjtcblx0Z2V0V29ya3NwYWNlRm9sZGVyczIoKTogUHJvbWlzZTx2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10gfCB1bmRlZmluZWQ+O1xuXHRyZXNvbHZlUHJveHkodXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdGxvb2t1cEF1dGhvcml6YXRpb24oYXV0aEluZm86IEF1dGhJbmZvKTogUHJvbWlzZTxDcmVkZW50aWFscyB8IHVuZGVmaW5lZD47XG5cdGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbih1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0bG9hZENlcnRpZmljYXRlcygpOiBQcm9taXNlPHN0cmluZ1tdPjtcbn1cblxuZnVuY3Rpb24gaXNGb2xkZXJFcXVhbChmb2xkZXJBOiBVUkksIGZvbGRlckI6IFVSSSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvOiBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvKTogYm9vbGVhbiB7XG5cdHJldHVybiBuZXcgRXh0VXJpKHVyaSA9PiBpZ25vcmVQYXRoQ2FzaW5nKHVyaSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSkuaXNFcXVhbChmb2xkZXJBLCBmb2xkZXJCKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVdvcmtzcGFjZUZvbGRlckJ5VXJpKGE6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIGI6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyk6IG51bWJlciB7XG5cdHJldHVybiBpc0ZvbGRlckVxdWFsKGEudXJpLCBiLnVyaSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSA/IDAgOiBjb21wYXJlKGEudXJpLnRvU3RyaW5nKCksIGIudXJpLnRvU3RyaW5nKCkpO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlV29ya3NwYWNlRm9sZGVyQnlVcmlBbmROYW1lQW5kSW5kZXgoYTogdnNjb2RlLldvcmtzcGFjZUZvbGRlciwgYjogdnNjb2RlLldvcmtzcGFjZUZvbGRlciwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvOiBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvKTogbnVtYmVyIHtcblx0aWYgKGEuaW5kZXggIT09IGIuaW5kZXgpIHtcblx0XHRyZXR1cm4gYS5pbmRleCA8IGIuaW5kZXggPyAtMSA6IDE7XG5cdH1cblxuXHRyZXR1cm4gaXNGb2xkZXJFcXVhbChhLnVyaSwgYi51cmksIGV4dEhvc3RGaWxlU3lzdGVtSW5mbykgPyBjb21wYXJlKGEubmFtZSwgYi5uYW1lKSA6IGNvbXBhcmUoYS51cmkudG9TdHJpbmcoKSwgYi51cmkudG9TdHJpbmcoKSk7XG59XG5cbmZ1bmN0aW9uIGRlbHRhKG9sZEZvbGRlcnM6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSwgbmV3Rm9sZGVyczogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdLCBjb21wYXJlOiAoYTogdnNjb2RlLldvcmtzcGFjZUZvbGRlciwgYjogdnNjb2RlLldvcmtzcGFjZUZvbGRlciwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvOiBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSA9PiBudW1iZXIsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyk6IHsgcmVtb3ZlZDogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdOyBhZGRlZDogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdIH0ge1xuXHRjb25zdCBvbGRTb3J0ZWRGb2xkZXJzID0gb2xkRm9sZGVycy5zbGljZSgwKS5zb3J0KChhLCBiKSA9PiBjb21wYXJlKGEsIGIsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbykpO1xuXHRjb25zdCBuZXdTb3J0ZWRGb2xkZXJzID0gbmV3Rm9sZGVycy5zbGljZSgwKS5zb3J0KChhLCBiKSA9PiBjb21wYXJlKGEsIGIsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbykpO1xuXG5cdHJldHVybiBhcnJheURlbHRhKG9sZFNvcnRlZEZvbGRlcnMsIG5ld1NvcnRlZEZvbGRlcnMsIChhLCBiKSA9PiBjb21wYXJlKGEsIGIsIGV4dEhvc3RGaWxlU3lzdGVtSW5mbykpO1xufVxuXG5mdW5jdGlvbiBpZ25vcmVQYXRoQ2FzaW5nKHVyaTogVVJJLCBleHRIb3N0RmlsZVN5c3RlbUluZm86IElFeHRIb3N0RmlsZVN5c3RlbUluZm8pOiBib29sZWFuIHtcblx0Y29uc3QgY2FwYWJpbGl0aWVzID0gZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmdldENhcGFiaWxpdGllcyh1cmkuc2NoZW1lKTtcblx0cmV0dXJuICEoY2FwYWJpbGl0aWVzICYmIChjYXBhYmlsaXRpZXMgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpKTtcbn1cblxuaW50ZXJmYWNlIE11dGFibGVXb3Jrc3BhY2VGb2xkZXIgZXh0ZW5kcyB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHtcblx0bmFtZTogc3RyaW5nO1xuXHRpbmRleDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUXVlcnlPcHRpb25zPFQ+IHtcblx0b3B0aW9uczogVDtcblx0Zm9sZGVyOiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbnR5cGUgRmluZEZpbGVzQXBpS2luZCA9ICdmaW5kRmlsZXMnIHwgJ2ZpbmRGaWxlczInO1xuXG5pbnRlcmZhY2UgRmluZEZpbGVzQ2FsbEludGVudCB7XG5cdC8qKiBWYWx1ZSB0aGUgZXh0ZW5zaW9uIGV4cGxpY2l0bHkgcGFzc2VkIGZvciBgdXNlSWdub3JlRmlsZXMubG9jYWxgIChmaW5kRmlsZXMyKTsgYHVuZGVmaW5lZGAgaWYgbm90IHNwZWNpZmllZCBvciBOL0EgZm9yIGxlZ2FjeSBgZmluZEZpbGVzYC4gKi9cblx0cmVhZG9ubHkgdXNlSWdub3JlRmlsZXNMb2NhbDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgdGhlIGV4dGVuc2lvbiBwYXNzZWQgYG51bGxgIGFzIHRoZSBgZXhjbHVkZWAgYXJndW1lbnQgdG8gbGVnYWN5IGBmaW5kRmlsZXNgICh0aGUgZG9jdW1lbnRlZCBlc2NhcGUgaGF0Y2gpLiBBbHdheXMgYGZhbHNlYCBmb3IgZmluZEZpbGVzMi4gKi9cblx0cmVhZG9ubHkgZXhjbHVkZVdhc051bGw6IGJvb2xlYW47XG59XG5cbmNsYXNzIEV4dEhvc3RXb3Jrc3BhY2VJbXBsIGV4dGVuZHMgV29ya3NwYWNlIHtcblxuXHRzdGF0aWMgdG9FeHRIb3N0V29ya3NwYWNlKGRhdGE6IElXb3Jrc3BhY2VEYXRhIHwgbnVsbCwgcHJldmlvdXNDb25maXJtZWRXb3Jrc3BhY2U6IEV4dEhvc3RXb3Jrc3BhY2VJbXBsIHwgdW5kZWZpbmVkLCBwcmV2aW91c1VuY29uZmlybWVkV29ya3NwYWNlOiBFeHRIb3N0V29ya3NwYWNlSW1wbCB8IHVuZGVmaW5lZCwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvOiBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvKTogeyB3b3Jrc3BhY2U6IEV4dEhvc3RXb3Jrc3BhY2VJbXBsIHwgbnVsbDsgYWRkZWQ6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXTsgcmVtb3ZlZDogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdIH0ge1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHsgd29ya3NwYWNlOiBudWxsLCBhZGRlZDogW10sIHJlbW92ZWQ6IFtdIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBpZCwgbmFtZSwgZm9sZGVycywgY29uZmlndXJhdGlvbiwgdHJhbnNpZW50LCBpc1VudGl0bGVkIH0gPSBkYXRhO1xuXHRcdGNvbnN0IG5ld1dvcmtzcGFjZUZvbGRlcnM6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSA9IFtdO1xuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBhbiBleGlzdGluZyB3b3Jrc3BhY2UsIHdlIHRyeSB0byBmaW5kIHRoZSBmb2xkZXJzIHRoYXQgbWF0Y2ggb3VyXG5cdFx0Ly8gZGF0YSBhbmQgdXBkYXRlIHRoZWlyIHByb3BlcnRpZXMuIEl0IGNvdWxkIGJlIHRoYXQgYW4gZXh0ZW5zaW9uIHN0b3JlZCB0aGVtXG5cdFx0Ly8gZm9yIGxhdGVyIHVzZSBhbmQgd2Ugd2FudCB0byBrZWVwIHRoZW0gXCJsaXZlXCIgaWYgdGhleSBhcmUgc3RpbGwgcHJlc2VudC5cblx0XHRjb25zdCBvbGRXb3Jrc3BhY2UgPSBwcmV2aW91c0NvbmZpcm1lZFdvcmtzcGFjZTtcblx0XHRpZiAocHJldmlvdXNDb25maXJtZWRXb3Jrc3BhY2UpIHtcblx0XHRcdGZvbGRlcnMuZm9yRWFjaCgoZm9sZGVyRGF0YSwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLnJldml2ZShmb2xkZXJEYXRhLnVyaSk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nRm9sZGVyID0gRXh0SG9zdFdvcmtzcGFjZUltcGwuX2ZpbmRGb2xkZXIocHJldmlvdXNVbmNvbmZpcm1lZFdvcmtzcGFjZSB8fCBwcmV2aW91c0NvbmZpcm1lZFdvcmtzcGFjZSwgZm9sZGVyVXJpLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pO1xuXG5cdFx0XHRcdGlmIChleGlzdGluZ0ZvbGRlcikge1xuXHRcdFx0XHRcdGV4aXN0aW5nRm9sZGVyLm5hbWUgPSBmb2xkZXJEYXRhLm5hbWU7XG5cdFx0XHRcdFx0ZXhpc3RpbmdGb2xkZXIuaW5kZXggPSBmb2xkZXJEYXRhLmluZGV4O1xuXG5cdFx0XHRcdFx0bmV3V29ya3NwYWNlRm9sZGVycy5wdXNoKGV4aXN0aW5nRm9sZGVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXdXb3Jrc3BhY2VGb2xkZXJzLnB1c2goeyB1cmk6IGZvbGRlclVyaSwgbmFtZTogZm9sZGVyRGF0YS5uYW1lLCBpbmRleCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld1dvcmtzcGFjZUZvbGRlcnMucHVzaCguLi5mb2xkZXJzLm1hcCgoeyB1cmksIG5hbWUsIGluZGV4IH0pID0+ICh7IHVyaTogVVJJLnJldml2ZSh1cmkpLCBuYW1lLCBpbmRleCB9KSkpO1xuXHRcdH1cblxuXHRcdC8vIG1ha2Ugc3VyZSB0byByZXN0b3JlIHNvcnQgb3JkZXIgYmFzZWQgb24gaW5kZXhcblx0XHRuZXdXb3Jrc3BhY2VGb2xkZXJzLnNvcnQoKGYxLCBmMikgPT4gZjEuaW5kZXggPCBmMi5pbmRleCA/IC0xIDogMSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBuZXcgRXh0SG9zdFdvcmtzcGFjZUltcGwoaWQsIG5hbWUsIG5ld1dvcmtzcGFjZUZvbGRlcnMsICEhdHJhbnNpZW50LCBjb25maWd1cmF0aW9uID8gVVJJLnJldml2ZShjb25maWd1cmF0aW9uKSA6IG51bGwsICEhaXNVbnRpdGxlZCwgdXJpID0+IGlnbm9yZVBhdGhDYXNpbmcodXJpLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pKTtcblx0XHRjb25zdCB7IGFkZGVkLCByZW1vdmVkIH0gPSBkZWx0YShvbGRXb3Jrc3BhY2UgPyBvbGRXb3Jrc3BhY2Uud29ya3NwYWNlRm9sZGVycyA6IFtdLCB3b3Jrc3BhY2Uud29ya3NwYWNlRm9sZGVycywgY29tcGFyZVdvcmtzcGFjZUZvbGRlckJ5VXJpLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pO1xuXG5cdFx0cmV0dXJuIHsgd29ya3NwYWNlLCBhZGRlZCwgcmVtb3ZlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmRGb2xkZXIod29ya3NwYWNlOiBFeHRIb3N0V29ya3NwYWNlSW1wbCwgZm9sZGVyVXJpVG9GaW5kOiBVUkksIGV4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyk6IE11dGFibGVXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGZvbGRlciA9IHdvcmtzcGFjZS53b3Jrc3BhY2VGb2xkZXJzW2ldO1xuXHRcdFx0aWYgKGlzRm9sZGVyRXF1YWwoZm9sZGVyLnVyaSwgZm9sZGVyVXJpVG9GaW5kLCBleHRIb3N0RmlsZVN5c3RlbUluZm8pKSB7XG5cdFx0XHRcdHJldHVybiBmb2xkZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUZvbGRlcnM6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJ1Y3R1cmU6IFRlcm5hcnlTZWFyY2hUcmVlPFVSSSwgdnNjb2RlLldvcmtzcGFjZUZvbGRlcj47XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgcHJpdmF0ZSBfbmFtZTogc3RyaW5nLCBmb2xkZXJzOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10sIHRyYW5zaWVudDogYm9vbGVhbiwgY29uZmlndXJhdGlvbjogVVJJIHwgbnVsbCwgcHJpdmF0ZSBfaXNVbnRpdGxlZDogYm9vbGVhbiwgaWdub3JlUGF0aENhc2luZzogKGtleTogVVJJKSA9PiBib29sZWFuKSB7XG5cdFx0c3VwZXIoaWQsIGZvbGRlcnMubWFwKGYgPT4gbmV3IFdvcmtzcGFjZUZvbGRlcihmKSksIHRyYW5zaWVudCwgY29uZmlndXJhdGlvbiwgaWdub3JlUGF0aENhc2luZyk7XG5cdFx0dGhpcy5fc3RydWN0dXJlID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpczx2c2NvZGUuV29ya3NwYWNlRm9sZGVyPihpZ25vcmVQYXRoQ2FzaW5nLCAoKSA9PiB0cnVlKTtcblxuXHRcdC8vIHNldHVwIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIGRhdGEgc3RydWN0dXJlXG5cdFx0Zm9sZGVycy5mb3JFYWNoKGZvbGRlciA9PiB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VGb2xkZXJzLnB1c2goZm9sZGVyKTtcblx0XHRcdHRoaXMuX3N0cnVjdHVyZS5zZXQoZm9sZGVyLnVyaSwgZm9sZGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX25hbWU7XG5cdH1cblxuXHRnZXQgaXNVbnRpdGxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNVbnRpdGxlZDtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VGb2xkZXJzKCk6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUZvbGRlcnMuc2xpY2UoMCk7XG5cdH1cblxuXHRnZXRXb3Jrc3BhY2VGb2xkZXIodXJpOiBVUkksIHJlc29sdmVQYXJlbnQ/OiBib29sZWFuKTogdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHJlc29sdmVQYXJlbnQgJiYgdGhpcy5fc3RydWN0dXJlLmdldCh1cmkpKSB7XG5cdFx0XHQvLyBgdXJpYCBpcyBhIHdvcmtzcGFjZSBmb2xkZXIgc28gd2UgY2hlY2sgZm9yIGl0cyBwYXJlbnRcblx0XHRcdHVyaSA9IGRpcm5hbWUodXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N0cnVjdHVyZS5maW5kU3Vic3RyKHVyaSk7XG5cdH1cblxuXHRyZXNvbHZlV29ya3NwYWNlRm9sZGVyKHVyaTogVVJJKTogdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0cnVjdHVyZS5nZXQodXJpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdFdvcmtzcGFjZSBpbXBsZW1lbnRzIEV4dEhvc3RXb3Jrc3BhY2VTaGFwZSwgSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya3NwYWNlID0gbmV3IEVtaXR0ZXI8dnNjb2RlLldvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2U6IEV2ZW50PHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRHcmFudFdvcmtzcGFjZVRydXN0ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRHcmFudFdvcmtzcGFjZVRydXN0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkR3JhbnRXb3Jrc3BhY2VUcnVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtzcGFjZVRydXN0ZWRGb2xkZXJzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VUcnVzdGVkRm9sZGVyczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZVRydXN0ZWRGb2xkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0SWRQcm92aWRlcjogQ291bnRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfYmFycmllcjogQmFycmllcjtcblxuXHRwcml2YXRlIF9jb25maXJtZWRXb3Jrc3BhY2U/OiBFeHRIb3N0V29ya3NwYWNlSW1wbDtcblx0cHJpdmF0ZSBfdW5jb25maXJtZWRXb3Jrc3BhY2U/OiBFeHRIb3N0V29ya3NwYWNlSW1wbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZFdvcmtzcGFjZVNoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlU2VydmljZTogTWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVByb3h5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RGaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbztcblx0cHJpdmF0ZSByZWFkb25seSBfdXJpVHJhbnNmb3JtZXJTZXJ2aWNlOiBJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVNlYXJjaENhbGxiYWNrczogKChtYXRjaDogSVJhd0ZpbGVNYXRjaDIpID0+IGFueSlbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3RydXN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5FZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXI+KCk7XG5cblx0Ly8gUHVzaGVkIGluIGJ5IEV4dEhvc3RDb25maWd1cmF0aW9uIGFmdGVyIGluaXQgKHNlZSBgJHNldENvbmZpZ1Byb3ZpZGVyYCkuXG5cdHByaXZhdGUgX2NvbmZpZ1Byb3ZpZGVyPzogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UsXG5cdFx0QElFeHRIb3N0RmlsZVN5c3RlbUluZm8gZXh0SG9zdEZpbGVTeXN0ZW1JbmZvOiBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVVSSVRyYW5zZm9ybWVyU2VydmljZSB1cmlUcmFuc2Zvcm1lclNlcnZpY2U6IElVUklUcmFuc2Zvcm1lclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UgPSBsb2dTZXJ2aWNlO1xuXHRcdHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtSW5mbyA9IGV4dEhvc3RGaWxlU3lzdGVtSW5mbztcblx0XHR0aGlzLl91cmlUcmFuc2Zvcm1lclNlcnZpY2UgPSB1cmlUcmFuc2Zvcm1lclNlcnZpY2U7XG5cdFx0dGhpcy5fcmVxdWVzdElkUHJvdmlkZXIgPSBuZXcgQ291bnRlcigpO1xuXHRcdHRoaXMuX2JhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UpO1xuXHRcdHRoaXMuX21lc3NhZ2VTZXJ2aWNlID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkTWVzc2FnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVByb3h5ID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGVsZW1ldHJ5KTtcblx0XHRjb25zdCBkYXRhID0gaW5pdERhdGEud29ya3NwYWNlO1xuXHRcdHRoaXMuX2NvbmZpcm1lZFdvcmtzcGFjZSA9IGRhdGEgPyBuZXcgRXh0SG9zdFdvcmtzcGFjZUltcGwoZGF0YS5pZCwgZGF0YS5uYW1lLCBbXSwgISFkYXRhLnRyYW5zaWVudCwgZGF0YS5jb25maWd1cmF0aW9uID8gVVJJLnJldml2ZShkYXRhLmNvbmZpZ3VyYXRpb24pIDogbnVsbCwgISFkYXRhLmlzVW50aXRsZWQsIHVyaSA9PiBpZ25vcmVQYXRoQ2FzaW5nKHVyaSwgZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVjZWl2ZXMgdGhlIGNvbmZpZ3VyYXRpb24gcHJvdmlkZXIgZnJvbSBFeHRIb3N0Q29uZmlndXJhdGlvbiBhZnRlciBpbml0LiBXZSBjYW5ub3QgaW5qZWN0XG5cdCAqIElFeHRIb3N0Q29uZmlndXJhdGlvbiBkaXJlY3RseSBiZWNhdXNlIGl0IGNyZWF0ZXMgYSBESSBjeWNsZSAoRXh0SG9zdENvbmZpZ3VyYXRpb24gYWxyZWFkeVxuXHQgKiBkZXBlbmRzIG9uIElFeHRIb3N0V29ya3NwYWNlKS4gT25jZSBzZXQsIHNldHRpbmdzIHJlYWRzIGluIGZpbmRGaWxlcyBiZWNvbWUgc3luY2hyb25vdXMuXG5cdCAqL1xuXHQkc2V0Q29uZmlnUHJvdmlkZXIocHJvdmlkZXI6IEV4dEhvc3RDb25maWdQcm92aWRlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbmZpZ1Byb3ZpZGVyID0gcHJvdmlkZXI7XG5cdH1cblxuXHRwcml2YXRlIF91c2VJZ25vcmVGaWxlc0luRmluZEZpbGVzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWdQcm92aWRlcj8uZ2V0Q29uZmlndXJhdGlvbignc2VhcmNoJykuZ2V0PGJvb2xlYW4+KCdleHBlcmltZW50YWwudXNlSWdub3JlRmlsZXNJbkZpbmRGaWxlcycpID8/IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlcklnbm9yZUZpbGVzU2V0dGluZygpOiBib29sZWFuIHtcblx0XHQvLyBEZWZhdWx0IGluIGBzZWFyY2gudXNlSWdub3JlRmlsZXNgIGlzIGB0cnVlYDsgbWlycm9yIHRoYXQgaGVyZSBzbyB0ZWxlbWV0cnkgY29tcHV0ZWQgYWdhaW5zdFxuXHRcdC8vIGFuIHVuc2V0IGNvbmZpZyBzdGlsbCByZWZsZWN0cyB0aGUgZmFsbGJhY2sgdGhlIHF1ZXJ5IGJ1aWxkZXIgd2lsbCBhcHBseS5cblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnUHJvdmlkZXI/LmdldENvbmZpZ3VyYXRpb24oJ3NlYXJjaCcpLmdldDxib29sZWFuPigndXNlSWdub3JlRmlsZXMnKSA/PyB0cnVlO1xuXHR9XG5cblx0JGluaXRpYWxpemVXb3Jrc3BhY2UoZGF0YTogSVdvcmtzcGFjZURhdGEgfCBudWxsLCB0cnVzdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJ1c3RlZCA9IHRydXN0ZWQ7XG5cdFx0dGhpcy4kYWNjZXB0V29ya3NwYWNlRGF0YShkYXRhKTtcblx0XHR0aGlzLl9iYXJyaWVyLm9wZW4oKTtcblx0fVxuXG5cdHdhaXRGb3JJbml0aWFsaXplQ2FsbCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fYmFycmllci53YWl0KCk7XG5cdH1cblxuXHQvLyAtLS0gd29ya3NwYWNlIC0tLVxuXG5cdGdldCB3b3Jrc3BhY2UoKTogV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsV29ya3NwYWNlO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsV29ya3NwYWNlID8gdGhpcy5fYWN0dWFsV29ya3NwYWNlLm5hbWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgd29ya3NwYWNlRmlsZSgpOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fYWN0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRpZiAodGhpcy5fYWN0dWFsV29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0aWYgKHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5pc1VudGl0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiBiYXNlbmFtZShkaXJuYW1lKHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSkgfSk7IC8vIFVudGl0bGVkIFdvcmtzcGFjZTogcmV0dXJuIHVudGl0bGVkIFVSSVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5jb25maWd1cmF0aW9uOyAvLyBXb3Jrc3BhY2U6IHJldHVybiB0aGUgY29uZmlndXJhdGlvbiBsb2NhdGlvblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfYWN0dWFsV29ya3NwYWNlKCk6IEV4dEhvc3RXb3Jrc3BhY2VJbXBsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdW5jb25maXJtZWRXb3Jrc3BhY2UgfHwgdGhpcy5fY29uZmlybWVkV29ya3NwYWNlO1xuXHR9XG5cblx0Z2V0V29ya3NwYWNlRm9sZGVycygpOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fYWN0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsV29ya3NwYWNlLndvcmtzcGFjZUZvbGRlcnMuc2xpY2UoMCk7XG5cdH1cblxuXHRhc3luYyBnZXRXb3Jrc3BhY2VGb2xkZXJzMigpOiBQcm9taXNlPHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXJbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2JhcnJpZXIud2FpdCgpO1xuXHRcdGlmICghdGhpcy5fYWN0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsV29ya3NwYWNlLndvcmtzcGFjZUZvbGRlcnMuc2xpY2UoMCk7XG5cdH1cblxuXHR1cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpbmRleDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCAuLi53b3Jrc3BhY2VGb2xkZXJzVG9BZGQ6IHsgdXJpOiB2c2NvZGUuVXJpOyBuYW1lPzogc3RyaW5nIH1bXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZhbGlkYXRlZERpc3RpbmN0V29ya3NwYWNlRm9sZGVyc1RvQWRkOiB7IHVyaTogdnNjb2RlLlVyaTsgbmFtZT86IHN0cmluZyB9W10gPSBbXTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh3b3Jrc3BhY2VGb2xkZXJzVG9BZGQpKSB7XG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXJzVG9BZGQuZm9yRWFjaChmb2xkZXJUb0FkZCA9PiB7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkoZm9sZGVyVG9BZGQudXJpKSAmJiAhdmFsaWRhdGVkRGlzdGluY3RXb3Jrc3BhY2VGb2xkZXJzVG9BZGQuc29tZShmID0+IGlzRm9sZGVyRXF1YWwoZi51cmksIGZvbGRlclRvQWRkLnVyaSwgdGhpcy5fZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSkpIHtcblx0XHRcdFx0XHR2YWxpZGF0ZWREaXN0aW5jdFdvcmtzcGFjZUZvbGRlcnNUb0FkZC5wdXNoKHsgdXJpOiBmb2xkZXJUb0FkZC51cmksIG5hbWU6IGZvbGRlclRvQWRkLm5hbWUgfHwgYmFzZW5hbWVPckF1dGhvcml0eShmb2xkZXJUb0FkZC51cmkpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoISF0aGlzLl91bmNvbmZpcm1lZFdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBwcmV2ZW50IGFjY3VtdWxhdGVkIGNhbGxzIHdpdGhvdXQgYSBjb25maXJtZWQgd29ya3NwYWNlXG5cdFx0fVxuXG5cdFx0aWYgKFtpbmRleCwgZGVsZXRlQ291bnRdLnNvbWUoaSA9PiB0eXBlb2YgaSAhPT0gJ251bWJlcicgfHwgaSA8IDApKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHZhbGlkYXRlIG51bWJlcnNcblx0XHR9XG5cblx0XHRpZiAoZGVsZXRlQ291bnQgPT09IDAgJiYgdmFsaWRhdGVkRGlzdGluY3RXb3Jrc3BhY2VGb2xkZXJzVG9BZGQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vdGhpbmcgdG8gZGVsZXRlIG9yIGFkZFxuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzOiBNdXRhYmxlV29ya3NwYWNlRm9sZGVyW10gPSB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UgPyB0aGlzLl9hY3R1YWxXb3Jrc3BhY2Uud29ya3NwYWNlRm9sZGVycyA6IFtdO1xuXHRcdGlmIChpbmRleCArIGRlbGV0ZUNvdW50ID4gY3VycmVudFdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGNhbm5vdCBkZWxldGUgbW9yZSB0aGFuIHdlIGhhdmVcblx0XHR9XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgdXBkYXRlV29ya3NwYWNlRm9sZGVycyBtZXRob2Qgb24gb3VyIGRhdGEgdG8gZG8gbW9yZSB2YWxpZGF0aW9uXG5cdFx0Y29uc3QgbmV3V29ya3NwYWNlRm9sZGVycyA9IGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzLnNsaWNlKDApO1xuXHRcdG5ld1dvcmtzcGFjZUZvbGRlcnMuc3BsaWNlKGluZGV4LCBkZWxldGVDb3VudCwgLi4udmFsaWRhdGVkRGlzdGluY3RXb3Jrc3BhY2VGb2xkZXJzVG9BZGQubWFwKGYgPT4gKHsgdXJpOiBmLnVyaSwgbmFtZTogZi5uYW1lIHx8IGJhc2VuYW1lT3JBdXRob3JpdHkoZi51cmkpLCBpbmRleDogdW5kZWZpbmVkISAvKiBmaXhlZCBsYXRlciAqLyB9KSkpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuZXdXb3Jrc3BhY2VGb2xkZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBuZXdXb3Jrc3BhY2VGb2xkZXJzW2ldO1xuXHRcdFx0aWYgKG5ld1dvcmtzcGFjZUZvbGRlcnMuc29tZSgob3RoZXJGb2xkZXIsIGluZGV4KSA9PiBpbmRleCAhPT0gaSAmJiBpc0ZvbGRlckVxdWFsKGZvbGRlci51cmksIG90aGVyRm9sZGVyLnVyaSwgdGhpcy5fZXh0SG9zdEZpbGVTeXN0ZW1JbmZvKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBjYW5ub3QgYWRkIHRoZSBzYW1lIGZvbGRlciBtdWx0aXBsZSB0aW1lc1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG5ld1dvcmtzcGFjZUZvbGRlcnMuZm9yRWFjaCgoZiwgaW5kZXgpID0+IGYuaW5kZXggPSBpbmRleCk7IC8vIGZpeCBpbmRleFxuXHRcdGNvbnN0IHsgYWRkZWQsIHJlbW92ZWQgfSA9IGRlbHRhKGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzLCBuZXdXb3Jrc3BhY2VGb2xkZXJzLCBjb21wYXJlV29ya3NwYWNlRm9sZGVyQnlVcmlBbmROYW1lQW5kSW5kZXgsIHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtSW5mbyk7XG5cdFx0aWYgKGFkZGVkLmxlbmd0aCA9PT0gMCAmJiByZW1vdmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBub3RoaW5nIGFjdHVhbGx5IGNoYW5nZWRcblx0XHR9XG5cblx0XHQvLyBUcmlnZ2VyIG9uIG1haW4gc2lkZVxuXHRcdGlmICh0aGlzLl9wcm94eSkge1xuXHRcdFx0Y29uc3QgZXh0TmFtZSA9IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dE5hbWUsIGluZGV4LCBkZWxldGVDb3VudCwgdmFsaWRhdGVkRGlzdGluY3RXb3Jrc3BhY2VGb2xkZXJzVG9BZGQpLnRoZW4odW5kZWZpbmVkLCBlcnJvciA9PiB7XG5cblx0XHRcdFx0Ly8gaW4gY2FzZSBvZiBhbiBlcnJvciwgbWFrZSBzdXJlIHRvIGNsZWFyIG91dCB0aGUgdW5jb25maXJtZWQgd29ya3NwYWNlXG5cdFx0XHRcdC8vIGJlY2F1c2Ugd2UgY2Fubm90IGV4cGVjdCB0aGUgYWNrbm93bGVkZ2VtZW50IGZyb20gdGhlIG1haW4gc2lkZSBmb3IgdGhpc1xuXHRcdFx0XHR0aGlzLl91bmNvbmZpcm1lZFdvcmtzcGFjZSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBzaG93IGVycm9yIHRvIHVzZXJcblx0XHRcdFx0Y29uc3Qgb3B0aW9uczogTWFpblRocmVhZE1lc3NhZ2VPcHRpb25zID0geyBzb3VyY2U6IHsgaWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGxhYmVsOiBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUgfSB9O1xuXHRcdFx0XHR0aGlzLl9tZXNzYWdlU2VydmljZS4kc2hvd01lc3NhZ2UoU2V2ZXJpdHkuRXJyb3IsIGxvY2FsaXplKCd1cGRhdGVlcnJvcicsIFwiRXh0ZW5zaW9uICd7MH0nIGZhaWxlZCB0byB1cGRhdGUgd29ya3NwYWNlIGZvbGRlcnM6IHsxfVwiLCBleHROYW1lLCBlcnJvci50b1N0cmluZygpKSwgb3B0aW9ucywgW10pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IHRvIGFjY2VwdCBkaXJlY3RseVxuXHRcdHRoaXMudHJ5U2V0V29ya3NwYWNlRm9sZGVycyhuZXdXb3Jrc3BhY2VGb2xkZXJzKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0V29ya3NwYWNlRm9sZGVyKHVyaTogdnNjb2RlLlVyaSwgcmVzb2x2ZVBhcmVudD86IGJvb2xlYW4pOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2FjdHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5nZXRXb3Jrc3BhY2VGb2xkZXIodXJpLCByZXNvbHZlUGFyZW50KTtcblx0fVxuXG5cdGFzeW5jIGdldFdvcmtzcGFjZUZvbGRlcjIodXJpOiB2c2NvZGUuVXJpLCByZXNvbHZlUGFyZW50PzogYm9vbGVhbik6IFByb21pc2U8dnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2JhcnJpZXIud2FpdCgpO1xuXHRcdGlmICghdGhpcy5fYWN0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsV29ya3NwYWNlLmdldFdvcmtzcGFjZUZvbGRlcih1cmksIHJlc29sdmVQYXJlbnQpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVdvcmtzcGFjZUZvbGRlcih1cmk6IHZzY29kZS5VcmkpOiBQcm9taXNlPHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9iYXJyaWVyLndhaXQoKTtcblx0XHRpZiAoIXRoaXMuX2FjdHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5yZXNvbHZlV29ya3NwYWNlRm9sZGVyKHVyaSk7XG5cdH1cblxuXHRnZXRQYXRoKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyB0aGlzIGlzIGxlZ2FjeSBmcm9tIHRoZSBkYXlzIGJlZm9yZSBoYXZpbmdcblx0XHQvLyBtdWx0aS1yb290IGFuZCB3ZSBrZWVwIGl0IG9ubHkgYWxpdmUgaWYgdGhlcmVcblx0XHQvLyBpcyBqdXN0IG9uZSB3b3Jrc3BhY2UgZm9sZGVyLlxuXHRcdGlmICghdGhpcy5fYWN0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZm9sZGVycyB9ID0gdGhpcy5fYWN0dWFsV29ya3NwYWNlO1xuXHRcdGlmIChmb2xkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gIzU0NDgzIEBKb2ggV2h5IGFyZSB3ZSBzdGlsbCB1c2luZyBmc1BhdGg/XG5cdFx0cmV0dXJuIGZvbGRlcnNbMF0udXJpLmZzUGF0aDtcblx0fVxuXG5cdGdldFJlbGF0aXZlUGF0aChwYXRoT3JVcmk6IHN0cmluZyB8IHZzY29kZS5VcmksIGluY2x1ZGVXb3Jrc3BhY2U/OiBib29sZWFuKTogc3RyaW5nIHtcblxuXHRcdGxldCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwYXRoOiBzdHJpbmcgPSAnJztcblx0XHRpZiAodHlwZW9mIHBhdGhPclVyaSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJlc291cmNlID0gVVJJLmZpbGUocGF0aE9yVXJpKTtcblx0XHRcdHBhdGggPSBwYXRoT3JVcmk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgcGF0aE9yVXJpICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmVzb3VyY2UgPSBwYXRoT3JVcmk7XG5cdFx0XHRwYXRoID0gcGF0aE9yVXJpLmZzUGF0aDtcblx0XHR9XG5cblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gcGF0aDtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLmdldFdvcmtzcGFjZUZvbGRlcihcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJ1ZVxuXHRcdCk7XG5cblx0XHRpZiAoIWZvbGRlcikge1xuXHRcdFx0cmV0dXJuIHBhdGg7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBpbmNsdWRlV29ya3NwYWNlID09PSAndW5kZWZpbmVkJyAmJiB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UpIHtcblx0XHRcdGluY2x1ZGVXb3Jrc3BhY2UgPSB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPiAxO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQgPSByZWxhdGl2ZVBhdGgoZm9sZGVyLnVyaSwgcmVzb3VyY2UpO1xuXHRcdGlmIChpbmNsdWRlV29ya3NwYWNlICYmIGZvbGRlci5uYW1lKSB7XG5cdFx0XHRyZXN1bHQgPSBgJHtmb2xkZXIubmFtZX0vJHtyZXN1bHR9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdCE7XG5cdH1cblxuXHRwcml2YXRlIHRyeVNldFdvcmtzcGFjZUZvbGRlcnMoZm9sZGVyczogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdKTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGUgZGlyZWN0bHkgaGVyZS4gVGhlIHdvcmtzcGFjZSBpcyB1bmNvbmZpcm1lZCBhcyBsb25nIGFzIHdlIGRpZCBub3QgZ2V0IGFuXG5cdFx0Ly8gYWNrbm93bGVkZ2VtZW50IGZyb20gdGhlIG1haW4gc2lkZSAodmlhICRhY2NlcHRXb3Jrc3BhY2VEYXRhKVxuXHRcdGlmICh0aGlzLl9hY3R1YWxXb3Jrc3BhY2UpIHtcblx0XHRcdHRoaXMuX3VuY29uZmlybWVkV29ya3NwYWNlID0gRXh0SG9zdFdvcmtzcGFjZUltcGwudG9FeHRIb3N0V29ya3NwYWNlKHtcblx0XHRcdFx0aWQ6IHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5pZCxcblx0XHRcdFx0bmFtZTogdGhpcy5fYWN0dWFsV29ya3NwYWNlLm5hbWUsXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHRoaXMuX2FjdHVhbFdvcmtzcGFjZS5jb25maWd1cmF0aW9uLFxuXHRcdFx0XHRmb2xkZXJzLFxuXHRcdFx0XHRpc1VudGl0bGVkOiB0aGlzLl9hY3R1YWxXb3Jrc3BhY2UuaXNVbnRpdGxlZFxuXHRcdFx0fSwgdGhpcy5fYWN0dWFsV29ya3NwYWNlLCB1bmRlZmluZWQsIHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtSW5mbykud29ya3NwYWNlIHx8IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQkYWNjZXB0V29ya3NwYWNlRGF0YShkYXRhOiBJV29ya3NwYWNlRGF0YSB8IG51bGwpOiB2b2lkIHtcblxuXHRcdGNvbnN0IHsgd29ya3NwYWNlLCBhZGRlZCwgcmVtb3ZlZCB9ID0gRXh0SG9zdFdvcmtzcGFjZUltcGwudG9FeHRIb3N0V29ya3NwYWNlKGRhdGEsIHRoaXMuX2NvbmZpcm1lZFdvcmtzcGFjZSwgdGhpcy5fdW5jb25maXJtZWRXb3Jrc3BhY2UsIHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtSW5mbyk7XG5cblx0XHQvLyBVcGRhdGUgb3VyIHdvcmtzcGFjZSBvYmplY3QuIFdlIGhhdmUgYSBjb25maXJtZWQgd29ya3NwYWNlLCBzbyB3ZSBkcm9wIG91clxuXHRcdC8vIHVuY29uZmlybWVkIHdvcmtzcGFjZS5cblx0XHR0aGlzLl9jb25maXJtZWRXb3Jrc3BhY2UgPSB3b3Jrc3BhY2UgfHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3VuY29uZmlybWVkV29ya3NwYWNlID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2UuZmlyZShPYmplY3QuZnJlZXplKHtcblx0XHRcdGFkZGVkLFxuXHRcdFx0cmVtb3ZlZCxcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gc2VhcmNoIC0tLVxuXG5cdC8qKlxuXHQgKiBOb3RlLCBudWxsL3VuZGVmaW5lZCBoYXZlIGRpZmZlcmVudCBhbmQgaW1wb3J0YW50IG1lYW5pbmdzIGZvciBcImV4Y2x1ZGVcIlxuXHQgKi9cblx0ZmluZEZpbGVzKGluY2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCwgZXhjbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgbnVsbCB8IHVuZGVmaW5lZCwgbWF4UmVzdWx0czogbnVtYmVyIHwgdW5kZWZpbmVkLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPHZzY29kZS5VcmlbXT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYGV4dEhvc3RXb3Jrc3BhY2UjZmluZEZpbGVzOiBmaWxlU2VhcmNoLCBleHRlbnNpb246ICR7ZXh0ZW5zaW9uSWQudmFsdWV9LCBlbnRyeVBvaW50OiBmaW5kRmlsZXNgKTtcblxuXHRcdGxldCBleGNsdWRlU3RyaW5nOiBzdHJpbmcgPSAnJztcblx0XHRsZXQgdXNlRmlsZUV4Y2x1ZGVzID0gdHJ1ZTtcblx0XHRpZiAoZXhjbHVkZSA9PT0gbnVsbCkge1xuXHRcdFx0dXNlRmlsZUV4Y2x1ZGVzID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChleGNsdWRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICh0eXBlb2YgZXhjbHVkZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZXhjbHVkZVN0cmluZyA9IGV4Y2x1ZGU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleGNsdWRlU3RyaW5nID0gZXhjbHVkZS5wYXR0ZXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVzZUlnbm9yZUZpbGVzT3B0SW4gPSB0aGlzLl91c2VJZ25vcmVGaWxlc0luRmluZEZpbGVzKCk7XG5cdFx0Ly8gYHVzZUlnbm9yZUZpbGVzLmxvY2FsYCBzZW1hbnRpY3M6IGBmYWxzZWAgbWVhbnMgXCJkbyBub3QgcmVzcGVjdCBsb2NhbCAuZ2l0aWdub3JlXCIgKC0tbm8taWdub3JlIHRvIHJnKS5cblx0XHQvLyBEZWZhdWx0IChQUiAjMjA0ODQ1KTogaGFyZGNvZGVkIGBmYWxzZWAgZm9yIGV2ZXJ5IGxlZ2FjeSBmaW5kRmlsZXMgY2FsbGVyLCByZWdhcmRsZXNzIG9mIGBzZWFyY2gudXNlSWdub3JlRmlsZXNgLlxuXHRcdC8vIE9wdC1pbiAoYHNlYXJjaC5leHBlcmltZW50YWwudXNlSWdub3JlRmlsZXNJbkZpbmRGaWxlczogdHJ1ZWApOiBob25vciB0aGUgdXNlcidzIGBzZWFyY2gudXNlSWdub3JlRmlsZXNgLFxuXHRcdC8vIHdoaWxlIGtlZXBpbmcgYGV4Y2x1ZGUgPT09IG51bGxgIGFzIHRoZSBkb2N1bWVudGVkIGVzY2FwZSBoYXRjaCAobm8gZXhjbHVkZXMgPT4gYnlwYXNzIC5naXRpZ25vcmUpLlxuXHRcdGNvbnN0IGxvY2FsSWdub3JlRmlsZXMgPSB1c2VJZ25vcmVGaWxlc09wdEluICYmIGV4Y2x1ZGUgIT09IG51bGwgPyB1bmRlZmluZWQgOiBmYWxzZTtcblxuXHRcdC8vIHRvZG86IGNvbnNpZGVyIGV4Y2x1ZGUgYmFzZVVSSSBpZiBhdmFpbGFibGVcblx0XHRyZXR1cm4gdGhpcy5fZmluZEZpbGVzSW1wbCh7IHR5cGU6ICdpbmNsdWRlJywgdmFsdWU6IGluY2x1ZGUgfSwge1xuXHRcdFx0ZXhjbHVkZTogW2V4Y2x1ZGVTdHJpbmddLFxuXHRcdFx0bWF4UmVzdWx0cyxcblx0XHRcdHVzZUV4Y2x1ZGVTZXR0aW5nczogdXNlRmlsZUV4Y2x1ZGVzID8gRXhjbHVkZVNldHRpbmdPcHRpb25zLkZpbGVzRXhjbHVkZSA6IEV4Y2x1ZGVTZXR0aW5nT3B0aW9ucy5Ob25lLFxuXHRcdFx0dXNlSWdub3JlRmlsZXM6IHtcblx0XHRcdFx0bG9jYWw6IGxvY2FsSWdub3JlRmlsZXNcblx0XHRcdH1cblx0XHR9LCBleHRlbnNpb25JZCwgJ2ZpbmRGaWxlcycsIHsgdXNlSWdub3JlRmlsZXNMb2NhbDogdW5kZWZpbmVkLCBleGNsdWRlV2FzTnVsbDogZXhjbHVkZSA9PT0gbnVsbCB9LCB0b2tlbik7XG5cdH1cblxuXG5cdGZpbmRGaWxlczIoZmlsZVBhdHRlcm5zOiByZWFkb25seSB2c2NvZGUuR2xvYlBhdHRlcm5bXSxcblx0XHRvcHRpb25zOiB2c2NvZGUuRmluZEZpbGVzMk9wdGlvbnMgPSB7fSxcblx0XHRleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHR0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8dnNjb2RlLlVyaVtdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgZXh0SG9zdFdvcmtzcGFjZSNmaW5kRmlsZXMyTmV3OiBmaWxlU2VhcmNoLCBleHRlbnNpb246ICR7ZXh0ZW5zaW9uSWQudmFsdWV9LCBlbnRyeVBvaW50OiBmaW5kRmlsZXMyTmV3YCk7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRGaWxlc0ltcGwoeyB0eXBlOiAnZmlsZVBhdHRlcm5zJywgdmFsdWU6IGZpbGVQYXR0ZXJucyB9LCBvcHRpb25zLCBleHRlbnNpb25JZCwgJ2ZpbmRGaWxlczInLCB7IHVzZUlnbm9yZUZpbGVzTG9jYWw6IG9wdGlvbnMudXNlSWdub3JlRmlsZXM/LmxvY2FsLCBleGNsdWRlV2FzTnVsbDogZmFsc2UgfSwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluZEZpbGVzSW1wbChcblx0XHQvLyB0aGUgb2xkIGBmaW5kRmlsZXNgIHVzZWQgYGluY2x1ZGVgIHRvIHF1ZXJ5LCBidXQgdGhlIG5ldyBgZmluZEZpbGVzMmAgdXNlcyBgZmlsZVBhdHRlcm5gIHRvIHF1ZXJ5LlxuXHRcdC8vIGBmaWxlUGF0dGVybmAgaXMgdGhlIHByb3BlciB3YXkgdG8gaGFuZGxlIHRoaXMsIHNpbmNlIGl0IHRha2VzIGxlc3MgcHJlY2VkZW5jZSB0aGFuIHRoZSBpZ25vcmUgZmlsZXMuXG5cdFx0cXVlcnk6IHsgcmVhZG9ubHkgdHlwZTogJ2luY2x1ZGUnOyByZWFkb25seSB2YWx1ZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIH0gfCB7IHJlYWRvbmx5IHR5cGU6ICdmaWxlUGF0dGVybnMnOyByZWFkb25seSB2YWx1ZTogcmVhZG9ubHkgdnNjb2RlLkdsb2JQYXR0ZXJuW10gfSxcblx0XHRvcHRpb25zOiB2c2NvZGUuRmluZEZpbGVzMk9wdGlvbnMsXG5cdFx0ZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsXG5cdFx0YXBpS2luZDogRmluZEZpbGVzQXBpS2luZCxcblx0XHRpbnRlbnQ6IEZpbmRGaWxlc0NhbGxJbnRlbnQsXG5cdFx0dG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlblxuXHQpOiBQcm9taXNlPHZzY29kZS5VcmlbXT4ge1xuXHRcdGNvbnN0IHVzZUlnbm9yZUZpbGVzTG9jYWxSZXF1ZXN0ZWQ6ICd1bnNwZWNpZmllZCcgfCAndHJ1ZScgfCAnZmFsc2UnID1cblx0XHRcdGludGVudC51c2VJZ25vcmVGaWxlc0xvY2FsID09PSB0cnVlID8gJ3RydWUnXG5cdFx0XHRcdDogaW50ZW50LnVzZUlnbm9yZUZpbGVzTG9jYWwgPT09IGZhbHNlID8gJ2ZhbHNlJ1xuXHRcdFx0XHRcdDogJ3Vuc3BlY2lmaWVkJztcblx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2godHJ1ZSk7XG5cdFx0bGV0IHF1ZXJ5Q291bnQgPSAwO1xuXHRcdGxldCByZXNwZWN0ZWRJZ25vcmVGaWxlcyA9IHRoaXMuX3VzZXJJZ25vcmVGaWxlc1NldHRpbmcoKTtcblx0XHRsZXQgcmVzdWx0Q291bnQgPSAwO1xuXHRcdGxldCBjYW5jZWxsZWQgPSBmYWxzZTtcblx0XHRsZXQgZXJyb3JlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0Y2FuY2VsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaWxlUGF0dGVybnNUb1VzZSA9IHF1ZXJ5LnR5cGUgPT09ICdpbmNsdWRlJyA/IFtxdWVyeS52YWx1ZV0gOiBxdWVyeS52YWx1ZSA/PyBbXTtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShmaWxlUGF0dGVybnNUb1VzZSkpIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignSW52YWxpZCBmaWxlIHBhdHRlcm4gcHJvdmlkZWQnLCBmaWxlUGF0dGVybnNUb1VzZSk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBmaWxlIHBhdHRlcm4gcHJvdmlkZWQgJHtKU09OLnN0cmluZ2lmeShmaWxlUGF0dGVybnNUb1VzZSl9YCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zPElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucz5bXSA9IGZpbGVQYXR0ZXJuc1RvVXNlLm1hcChmaWxlUGF0dGVybiA9PiB7XG5cblx0XHRcdFx0Y29uc3QgZXhjbHVkZVBhdHRlcm5zID0gZ2xvYnNUb0lTZWFyY2hQYXR0ZXJuQnVpbGRlcihvcHRpb25zLmV4Y2x1ZGUpO1xuXG5cdFx0XHRcdGNvbnN0IGZpbGVRdWVyaWVzOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0aWdub3JlU3ltbGlua3M6IHR5cGVvZiBvcHRpb25zLmZvbGxvd1N5bWxpbmtzID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy5mb2xsb3dTeW1saW5rcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkaXNyZWdhcmRJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMudXNlSWdub3JlRmlsZXM/LmxvY2FsID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy51c2VJZ25vcmVGaWxlcy5sb2NhbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMudXNlSWdub3JlRmlsZXM/Lmdsb2JhbCA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlSWdub3JlRmlsZXMuZ2xvYmFsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc3JlZ2FyZFBhcmVudElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy51c2VJZ25vcmVGaWxlcz8ucGFyZW50ID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy51c2VJZ25vcmVGaWxlcy5wYXJlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzOiBvcHRpb25zLnVzZUV4Y2x1ZGVTZXR0aW5ncyAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbnMudXNlRXhjbHVkZVNldHRpbmdzID09PSBFeGNsdWRlU2V0dGluZ09wdGlvbnMuTm9uZSxcblx0XHRcdFx0XHRkaXNyZWdhcmRTZWFyY2hFeGNsdWRlU2V0dGluZ3M6IG9wdGlvbnMudXNlRXhjbHVkZVNldHRpbmdzICE9PSB1bmRlZmluZWQgJiYgKG9wdGlvbnMudXNlRXhjbHVkZVNldHRpbmdzICE9PSBFeGNsdWRlU2V0dGluZ09wdGlvbnMuU2VhcmNoQW5kRmlsZXNFeGNsdWRlKSxcblx0XHRcdFx0XHRtYXhSZXN1bHRzOiBvcHRpb25zLm1heFJlc3VsdHMsXG5cdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IGV4Y2x1ZGVQYXR0ZXJucy5sZW5ndGggPiAwID8gZXhjbHVkZVBhdHRlcm5zIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGlnbm9yZUdsb2JDYXNlOiBvcHRpb25zLmNhc2VJbnNlbnNpdGl2ZSxcblx0XHRcdFx0XHRfcmVhc29uOiAnc3RhcnRGaWxlU2VhcmNoJyxcblx0XHRcdFx0XHRzaG91bGRHbG9iU2VhcmNoOiBxdWVyeS50eXBlID09PSAnaW5jbHVkZScgPyB1bmRlZmluZWQgOiB0cnVlLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHBhcnNlSW5jbHVkZSA9IHBhcnNlU2VhcmNoRXhjbHVkZUluY2x1ZGUoR2xvYlBhdHRlcm4uZnJvbShmaWxlUGF0dGVybikpO1xuXHRcdFx0XHRjb25zdCBmb2xkZXJUb1VzZSA9IHBhcnNlSW5jbHVkZT8uZm9sZGVyO1xuXHRcdFx0XHRpZiAocXVlcnkudHlwZSA9PT0gJ2luY2x1ZGUnKSB7XG5cdFx0XHRcdFx0ZmlsZVF1ZXJpZXMuaW5jbHVkZVBhdHRlcm4gPSBwYXJzZUluY2x1ZGU/LnBhdHRlcm47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZmlsZVF1ZXJpZXMuZmlsZVBhdHRlcm4gPSBwYXJzZUluY2x1ZGU/LnBhdHRlcm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZvbGRlcjogZm9sZGVyVG9Vc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogZmlsZVF1ZXJpZXNcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXG5cdFx0XHRxdWVyeUNvdW50ID0gcXVlcnlPcHRpb25zLmxlbmd0aDtcblx0XHRcdC8vIEVmZmVjdGl2ZSBpZ25vcmUtZmlsZSBiZWhhdmlvciBhY3Jvc3MgYWxsIHN1Yi1xdWVyaWVzOiBhIGNhbGwgcmVzcGVjdGVkIGAuZ2l0aWdub3JlYCBvbmx5IHdoZW4gZXZlcnlcblx0XHRcdC8vIHN1Yi1xdWVyeSBpcyBlaXRoZXIgZXhwbGljaXRseSBob25vcmluZyBpdCBvciBmYWxscyBiYWNrIHRvIGEgdXNlciBzZXR0aW5nIHRoYXQgaG9ub3JzIGl0LiBXaGVuXG5cdFx0XHQvLyBgZGlzcmVnYXJkSWdub3JlRmlsZXNgIGlzIGB1bmRlZmluZWRgIHRoZSBxdWVyeSBidWlsZGVyIHVzZXMgYHNlYXJjaC51c2VJZ25vcmVGaWxlc2AsIHdoaWNoIHdlIG1pcnJvciBoZXJlLlxuXHRcdFx0Y29uc3QgdXNlckhvbm9yc0lnbm9yZSA9IHRoaXMuX3VzZXJJZ25vcmVGaWxlc1NldHRpbmcoKTtcblx0XHRcdHJlc3BlY3RlZElnbm9yZUZpbGVzID0gcXVlcnlPcHRpb25zLmV2ZXJ5KHEgPT5cblx0XHRcdFx0cS5vcHRpb25zLmRpc3JlZ2FyZElnbm9yZUZpbGVzID09PSB0cnVlID8gZmFsc2Vcblx0XHRcdFx0XHQ6IHEub3B0aW9ucy5kaXNyZWdhcmRJZ25vcmVGaWxlcyA9PT0gZmFsc2UgPyB0cnVlXG5cdFx0XHRcdFx0XHQ6IHVzZXJIb25vcnNJZ25vcmUpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9maW5kRmlsZXNCYXNlKHF1ZXJ5T3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0cmVzdWx0Q291bnQgPSByZXN1bHQubGVuZ3RoO1xuXHRcdFx0Y2FuY2VsbGVkID0gdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3JlZCA9IHRydWU7XG5cdFx0XHRjYW5jZWxsZWQgPSB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZDtcblx0XHRcdHRocm93IGVycjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcmVwb3J0RmluZEZpbGVzVGVsZW1ldHJ5KHtcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbklkLnZhbHVlLFxuXHRcdFx0XHRhcGlLaW5kLFxuXHRcdFx0XHRyZXNwZWN0ZWRJZ25vcmVGaWxlcyxcblx0XHRcdFx0dXNlSWdub3JlRmlsZXNMb2NhbFJlcXVlc3RlZCxcblx0XHRcdFx0ZXhjbHVkZVdhc051bGw6IGludGVudC5leGNsdWRlV2FzTnVsbCxcblx0XHRcdFx0cmVzdWx0Q291bnQsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IHN3LmVsYXBzZWQoKSxcblx0XHRcdFx0cXVlcnlDb3VudCxcblx0XHRcdFx0Y2FuY2VsbGVkLFxuXHRcdFx0XHRlcnJvcmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluZEZpbGVzQmFzZShcblx0XHRxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uczxJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnM+W10gfCB1bmRlZmluZWQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG5cdCk6IFByb21pc2U8dnNjb2RlLlVyaVtdPiB7XG5cdFx0Ly8gRW5zdXJlIHRoZSB0b2tlbiBpcyByZWNvZ25pemVkIGJ5IHRoZSBSUEMgcHJvdG9jb2wuIFRva2VucyBmcm9tIGV4dGVuc2lvblxuXHRcdC8vIGJ1bmRsZXMgbWF5IHVzZSBhIGRpZmZlcmVudCBDYW5jZWxsYXRpb25Ub2tlbiBtb2R1bGUgYW5kIGZhaWwgdGhlIGluc3RhbmNlb2Zcblx0XHQvLyBjaGVjayBpbiBpc0NhbmNlbGxhdGlvblRva2VuKCksIGNhdXNpbmcgdGhlbSB0byBiZSBzZXJpYWxpemVkICh3aXRob3V0XG5cdFx0Ly8gZnVuY3Rpb25zKSByYXRoZXIgdGhhbiBoYW5kbGVkIGFzIGNhbmNlbGxhdGlvbiBzaWduYWxzLlxuXHRcdGxldCB0b2tlblRvVXNlID0gdG9rZW47XG5cdFx0bGV0IGxpbmtlZFNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKHRva2VuKSkge1xuXHRcdFx0bGlua2VkU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRjb25zdCBmb3JlaWduVG9rZW4gPSB0b2tlbiBhcyB1bmtub3duIGFzIFBhcnRpYWw8Q2FuY2VsbGF0aW9uVG9rZW4+O1xuXHRcdFx0aWYgKHR5cGVvZiBmb3JlaWduVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0Zm9yZWlnblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGxpbmtlZFNvdXJjZSEuY2FuY2VsKCkpO1xuXHRcdFx0fVxuXHRcdFx0dG9rZW5Ub1VzZSA9IGxpbmtlZFNvdXJjZS50b2tlbjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbChxdWVyeU9wdGlvbnM/Lm1hcChvcHRpb24gPT4gdGhpcy5fcHJveHkuJHN0YXJ0RmlsZVNlYXJjaChcblx0XHRcdG9wdGlvbi5mb2xkZXIgPz8gbnVsbCxcblx0XHRcdG9wdGlvbi5vcHRpb25zLFxuXHRcdFx0dG9rZW5Ub1VzZSkudGhlbihkYXRhID0+IEFycmF5LmlzQXJyYXkoZGF0YSkgPyBkYXRhLm1hcChkID0+IFVSSS5yZXZpdmUoZCkpIDogW10pXG5cdFx0KSA/PyBbXSk7XG5cblx0XHRjb25zdCBmbGF0UmVzdWx0ID0gcmVzdWx0LmZsYXQoKTtcblx0XHRsaW5rZWRTb3VyY2U/LmRpc3Bvc2UoKTtcblxuXHRcdC8vIERlZHVwZSBlbnRyaWVzIGluIGEgZmxhdCBhcnJheVxuXHRcdGNvbnN0IGV4dFVyaSA9IG5ldyBFeHRVcmkodXJpID0+IGlnbm9yZVBhdGhDYXNpbmcodXJpLCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbUluZm8pKTtcblx0XHRjb25zdCB1cmlNYXAgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLlVyaT4oKTtcblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIGZsYXRSZXN1bHQpIHtcblx0XHRcdGNvbnN0IGtleSA9IGV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHVyaSk7XG5cdFx0XHRpZiAoIXVyaU1hcC5oYXMoa2V5KSkge1xuXHRcdFx0XHR1cmlNYXAuc2V0KGtleSwgdXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh1cmlNYXAudmFsdWVzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0RmluZEZpbGVzVGVsZW1ldHJ5KGV2ZW50OiB7XG5cdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHRhcGlLaW5kOiBGaW5kRmlsZXNBcGlLaW5kO1xuXHRcdHJlc3BlY3RlZElnbm9yZUZpbGVzOiBib29sZWFuO1xuXHRcdHVzZUlnbm9yZUZpbGVzTG9jYWxSZXF1ZXN0ZWQ6ICd1bnNwZWNpZmllZCcgfCAndHJ1ZScgfCAnZmFsc2UnO1xuXHRcdGV4Y2x1ZGVXYXNOdWxsOiBib29sZWFuO1xuXHRcdHJlc3VsdENvdW50OiBudW1iZXI7XG5cdFx0ZHVyYXRpb25NczogbnVtYmVyO1xuXHRcdHF1ZXJ5Q291bnQ6IG51bWJlcjtcblx0XHRjYW5jZWxsZWQ6IGJvb2xlYW47XG5cdFx0ZXJyb3JlZDogYm9vbGVhbjtcblx0fSk6IHZvaWQge1xuXHRcdHR5cGUgRmluZEZpbGVzRXZlbnQgPSB7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0YXBpS2luZDogc3RyaW5nO1xuXHRcdFx0cmVzcGVjdGVkSWdub3JlRmlsZXM6IGJvb2xlYW47XG5cdFx0XHR1c2VJZ25vcmVGaWxlc0xvY2FsUmVxdWVzdGVkOiBzdHJpbmc7XG5cdFx0XHRleGNsdWRlV2FzTnVsbDogYm9vbGVhbjtcblx0XHRcdHJlc3VsdENvdW50OiBudW1iZXI7XG5cdFx0XHRkdXJhdGlvbk1zOiBudW1iZXI7XG5cdFx0XHRxdWVyeUNvdW50OiBudW1iZXI7XG5cdFx0XHRjYW5jZWxsZWQ6IGJvb2xlYW47XG5cdFx0XHRlcnJvcmVkOiBib29sZWFuO1xuXHRcdH07XG5cdFx0dHlwZSBGaW5kRmlsZXNFdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdvc29ydGVnYSc7XG5cdFx0XHRjb21tZW50OiAnVGVsZW1ldHJ5IGZvciB0aGUgZXh0ZW5zaW9uIEFQSSB3b3Jrc3BhY2UuZmluZEZpbGVzIC8gZmluZEZpbGVzMiBjYWxscy4gVXNlZCB0byBhc3Nlc3MgdGhlIGltcGFjdCBvZiBmbGlwcGluZyB0aGUgZGVmYXVsdCBmb3Igc2VhcmNoLmV4cGVyaW1lbnRhbC51c2VJZ25vcmVGaWxlc0luRmluZEZpbGVzIGJ5IGNvbXBhcmluZyByZXN1bHQgY291bnRzIGFuZCBkdXJhdGlvbnMgYmV0d2VlbiBjYWxscyB0aGF0IHJlc3BlY3RlZCAuZ2l0aWdub3JlIGFuZCB0aG9zZSB0aGF0IGRpZCBub3QuJztcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSWQgb2YgdGhlIGV4dGVuc2lvbiB0aGF0IGlzc3VlZCB0aGUgZmluZEZpbGVzIGNhbGwuJyB9O1xuXHRcdFx0YXBpS2luZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1doaWNoIEFQSSBlbnRyeSBwb2ludDogZmluZEZpbGVzIChsZWdhY3kpIG9yIGZpbmRGaWxlczIuJyB9O1xuXHRcdFx0cmVzcGVjdGVkSWdub3JlRmlsZXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1bmRlcmx5aW5nIHNlYXJjaCByZXNwZWN0ZWQgbG9jYWwgLmdpdGlnbm9yZSBmb3IgdGhpcyBjYWxsIChlZmZlY3RpdmUgdmFsdWUgYWZ0ZXIgYXBwbHlpbmcgdGhlIGV4cGVyaW1lbnRhbCBzZXR0aW5nIGFuZCBhbnkgZXNjYXBlIGhhdGNoZXMpLicgfTtcblx0XHRcdHVzZUlnbm9yZUZpbGVzTG9jYWxSZXF1ZXN0ZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGF0IHRoZSBleHRlbnNpb24gZXhwbGljaXRseSBwYXNzZWQgZm9yIHVzZUlnbm9yZUZpbGVzLmxvY2FsIChmaW5kRmlsZXMyIG9ubHkpOiBcInRydWVcIiwgXCJmYWxzZVwiLCBvciBcInVuc3BlY2lmaWVkXCIgKGFsd2F5cyBcInVuc3BlY2lmaWVkXCIgZm9yIGxlZ2FjeSBmaW5kRmlsZXMgc2luY2UgdGhhdCBBUEkgZG9lcyBub3QgZXhwb3NlIHRoZSBvcHRpb24pLicgfTtcblx0XHRcdGV4Y2x1ZGVXYXNOdWxsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hldGhlciB0aGUgZXh0ZW5zaW9uIHBhc3NlZCBudWxsIGFzIHRoZSBleGNsdWRlIGFyZ3VtZW50IHRvIGxlZ2FjeSBmaW5kRmlsZXMgKHRoZSBkb2N1bWVudGVkIGVzY2FwZSBoYXRjaCBmb3IgdW5maWx0ZXJlZCByZXN1bHRzKS4gQWx3YXlzIGZhbHNlIGZvciBmaW5kRmlsZXMyLicgfTtcblx0XHRcdHJlc3VsdENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHVuaXF1ZSByZXN1bHRzIHJldHVybmVkIHRvIHRoZSBleHRlbnNpb24uJyB9O1xuXHRcdFx0ZHVyYXRpb25NczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RvdGFsIHdhbGwtY2xvY2sgZHVyYXRpb24gb2YgdGhlIGZpbmRGaWxlcyBjYWxsIGluIG1pbGxpc2Vjb25kcy4nIH07XG5cdFx0XHRxdWVyeUNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHVuZGVybHlpbmcgZmlsZS1zZWFyY2ggcXVlcmllcyBkaXNwYXRjaGVkIChvbmUgcGVyIHdvcmtzcGFjZSBmb2xkZXIvZmlsZSBwYXR0ZXJuKS4nIH07XG5cdFx0XHRjYW5jZWxsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBjYWxsIHdhcyBjYW5jZWxsZWQgYmVmb3JlIGNvbXBsZXRpb24uJyB9O1xuXHRcdFx0ZXJyb3JlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGNhbGwgdGhyZXcgYW4gZXJyb3IuJyB9O1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5UHJveHkuJHB1YmxpY0xvZzI8RmluZEZpbGVzRXZlbnQsIEZpbmRGaWxlc0V2ZW50Q2xhc3NpZmljYXRpb24+KCdleHRIb3N0RmluZEZpbGVzJywgZXZlbnQpO1xuXHR9XG5cblx0ZmluZFRleHRJbkZpbGVzMihxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeTIsIG9wdGlvbnM6IHZzY29kZS5GaW5kVGV4dEluRmlsZXNPcHRpb25zMiB8IHVuZGVmaW5lZCwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogdnNjb2RlLkZpbmRUZXh0SW5GaWxlc1Jlc3BvbnNlIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBleHRIb3N0V29ya3NwYWNlI2ZpbmRUZXh0SW5GaWxlczI6IHRleHRTZWFyY2gsIGV4dGVuc2lvbjogJHtleHRlbnNpb25JZC52YWx1ZX0sIGVudHJ5UG9pbnQ6IGZpbmRUZXh0SW5GaWxlczJgKTtcblxuXG5cdFx0Y29uc3QgZ2V0T3B0aW9ucyA9IChpbmNsdWRlOiB2c2NvZGUuR2xvYlBhdHRlcm4gfCB1bmRlZmluZWQpOiBRdWVyeU9wdGlvbnM8SVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zPiA9PiB7XG5cdFx0XHRpZiAoIW9wdGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmb2xkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvcHRpb25zOiB7fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyc2VkSW5jbHVkZSA9IGluY2x1ZGUgPyBwYXJzZVNlYXJjaEV4Y2x1ZGVJbmNsdWRlKEdsb2JQYXR0ZXJuLmZyb20oaW5jbHVkZSkpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBleGNsdWRlUGF0dGVybnMgPSBvcHRpb25zLmV4Y2x1ZGUgPyBnbG9ic1RvSVNlYXJjaFBhdHRlcm5CdWlsZGVyKG9wdGlvbnMuZXhjbHVkZSkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9wdGlvbnM6IHtcblxuXHRcdFx0XHRcdGlnbm9yZVN5bWxpbmtzOiB0eXBlb2Ygb3B0aW9ucy5mb2xsb3dTeW1saW5rcyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMuZm9sbG93U3ltbGlua3MgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGlzcmVnYXJkSWdub3JlRmlsZXM6IHR5cGVvZiBvcHRpb25zLnVzZUlnbm9yZUZpbGVzPy5sb2NhbCA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlSWdub3JlRmlsZXM/LmxvY2FsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc3JlZ2FyZEdsb2JhbElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy51c2VJZ25vcmVGaWxlcz8uZ2xvYmFsID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy51c2VJZ25vcmVGaWxlcz8uZ2xvYmFsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc3JlZ2FyZFBhcmVudElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy51c2VJZ25vcmVGaWxlcz8ucGFyZW50ID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy51c2VJZ25vcmVGaWxlcz8ucGFyZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5nczogb3B0aW9ucy51c2VFeGNsdWRlU2V0dGluZ3MgIT09IHVuZGVmaW5lZCAmJiBvcHRpb25zLnVzZUV4Y2x1ZGVTZXR0aW5ncyA9PT0gRXhjbHVkZVNldHRpbmdPcHRpb25zLk5vbmUsXG5cdFx0XHRcdFx0ZGlzcmVnYXJkU2VhcmNoRXhjbHVkZVNldHRpbmdzOiBvcHRpb25zLnVzZUV4Y2x1ZGVTZXR0aW5ncyAhPT0gdW5kZWZpbmVkICYmIChvcHRpb25zLnVzZUV4Y2x1ZGVTZXR0aW5ncyAhPT0gRXhjbHVkZVNldHRpbmdPcHRpb25zLlNlYXJjaEFuZEZpbGVzRXhjbHVkZSksXG5cdFx0XHRcdFx0ZmlsZUVuY29kaW5nOiBvcHRpb25zLmVuY29kaW5nLFxuXHRcdFx0XHRcdG1heFJlc3VsdHM6IG9wdGlvbnMubWF4UmVzdWx0cyxcblx0XHRcdFx0XHRpZ25vcmVHbG9iQ2FzZTogb3B0aW9ucy5jYXNlSW5zZW5zaXRpdmUsXG5cdFx0XHRcdFx0cHJldmlld09wdGlvbnM6IG9wdGlvbnMucHJldmlld09wdGlvbnMgPyB7XG5cdFx0XHRcdFx0XHRtYXRjaExpbmVzOiBvcHRpb25zLnByZXZpZXdPcHRpb25zPy5udW1NYXRjaExpbmVzID8/IDEwMCxcblx0XHRcdFx0XHRcdGNoYXJzUGVyTGluZTogb3B0aW9ucy5wcmV2aWV3T3B0aW9ucz8uY2hhcnNQZXJMaW5lID8/IDEwMDAwLFxuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3Vycm91bmRpbmdDb250ZXh0OiBvcHRpb25zLnN1cnJvdW5kaW5nQ29udGV4dCxcblxuXHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiBwYXJzZWRJbmNsdWRlPy5wYXR0ZXJuLFxuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBleGNsdWRlUGF0dGVybnNcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLFxuXHRcdFx0XHRmb2xkZXI6IHBhcnNlZEluY2x1ZGU/LmZvbGRlclxuXHRcdFx0fSBzYXRpc2ZpZXMgUXVlcnlPcHRpb25zPElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucz47XG5cdFx0fTtcblxuXHRcdGNvbnN0IHF1ZXJ5T3B0aW9uc1JhdzogKFF1ZXJ5T3B0aW9uczxJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnM+IHwgdW5kZWZpbmVkKVtdID0gKChvcHRpb25zPy5pbmNsdWRlPy5tYXAoKGluY2x1ZGUpID0+XG5cdFx0XHRnZXRPcHRpb25zKGluY2x1ZGUpKSkpID8/IFtnZXRPcHRpb25zKHVuZGVmaW5lZCldO1xuXG5cdFx0Y29uc3QgcXVlcnlPcHRpb25zID0gcXVlcnlPcHRpb25zUmF3LmZpbHRlcigocXVlcnlPcHMpOiBxdWVyeU9wcyBpcyBRdWVyeU9wdGlvbnM8SVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zPiA9PiAhIXF1ZXJ5T3BzKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHByb2dyZXNzRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlc3VsdDogSVRleHRTZWFyY2hSZXN1bHQ8VVJJPjsgdXJpOiBVUkkgfT4oKSk7XG5cdFx0Y29uc3QgY29tcGxldGUgPSB0aGlzLmZpbmRUZXh0SW5GaWxlc0Jhc2UoXG5cdFx0XHRxdWVyeSxcblx0XHRcdHF1ZXJ5T3B0aW9ucyxcblx0XHRcdChyZXN1bHQsIHVyaSkgPT4gcHJvZ3Jlc3NFbWl0dGVyLmZpcmUoeyByZXN1bHQsIHVyaSB9KSxcblx0XHRcdHRva2VuXG5cdFx0KTtcblx0XHRjb25zdCBhc3luY0l0ZXJhYmxlID0gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcjx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdDI+KGFzeW5jIGVtaXR0ZXIgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb2dyZXNzRW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZS5yZXN1bHQ7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IGUudXJpO1xuXHRcdFx0XHRpZiAocmVzdWx0SXNNYXRjaChyZXN1bHQpKSB7XG5cdFx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKG5ldyBUZXh0U2VhcmNoTWF0Y2gyKFxuXHRcdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdFx0cmVzdWx0LnJhbmdlTG9jYXRpb25zLm1hcCgocmFuZ2UpID0+ICh7XG5cdFx0XHRcdFx0XHRcdHByZXZpZXdSYW5nZTogbmV3IFJhbmdlKHJhbmdlLnByZXZpZXcuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5wcmV2aWV3LnN0YXJ0Q29sdW1uLCByYW5nZS5wcmV2aWV3LmVuZExpbmVOdW1iZXIsIHJhbmdlLnByZXZpZXcuZW5kQ29sdW1uKSxcblx0XHRcdFx0XHRcdFx0c291cmNlUmFuZ2U6IG5ldyBSYW5nZShyYW5nZS5zb3VyY2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zb3VyY2Uuc3RhcnRDb2x1bW4sIHJhbmdlLnNvdXJjZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5zb3VyY2UuZW5kQ29sdW1uKVxuXHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdFx0cmVzdWx0LnByZXZpZXdUZXh0XG5cblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUobmV3IFRleHRTZWFyY2hDb250ZXh0Mihcblx0XHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRcdHJlc3VsdC50ZXh0LFxuXHRcdFx0XHRcdFx0cmVzdWx0LmxpbmVOdW1iZXJcblx0XHRcdFx0XHQpKTtcblxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRhd2FpdCBjb21wbGV0ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHRzOiBhc3luY0l0ZXJhYmxlLFxuXHRcdFx0Y29tcGxldGU6IGNvbXBsZXRlLnRoZW4oKGUpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxpbWl0SGl0OiBlPy5saW1pdEhpdCA/PyBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cblx0YXN5bmMgZmluZFRleHRJbkZpbGVzQmFzZShxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnM8SVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zPltdIHwgdW5kZWZpbmVkLCBjYWxsYmFjazogKHJlc3VsdDogSVRleHRTZWFyY2hSZXN1bHQ8VVJJPiwgdXJpOiBVUkkpID0+IHZvaWQsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gdGhpcy5fcmVxdWVzdElkUHJvdmlkZXIuZ2V0TmV4dCgpO1xuXG5cdFx0bGV0IGlzQ2FuY2VsZWQgPSBmYWxzZTtcblx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChfID0+IHtcblx0XHRcdGlzQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fYWN0aXZlU2VhcmNoQ2FsbGJhY2tzW3JlcXVlc3RJZF0gPSBwID0+IHtcblx0XHRcdGlmIChpc0NhbmNlbGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShwLnJlc291cmNlKTtcblx0XHRcdHAucmVzdWx0cyEuZm9yRWFjaChyYXdSZXN1bHQgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IElUZXh0U2VhcmNoUmVzdWx0PFVSST4gPSByZXZpdmUocmF3UmVzdWx0KTtcblx0XHRcdFx0Y2FsbGJhY2socmVzdWx0LCB1cmkpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbChxdWVyeU9wdGlvbnM/Lm1hcChvcHRpb24gPT4gdGhpcy5fcHJveHkuJHN0YXJ0VGV4dFNlYXJjaChcblx0XHRcdFx0cXVlcnksXG5cdFx0XHRcdG9wdGlvbi5mb2xkZXIgPz8gbnVsbCxcblx0XHRcdFx0b3B0aW9uLm9wdGlvbnMsXG5cdFx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdFx0dG9rZW4pIHx8IHt9XG5cdFx0XHQpID8/IFtdKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9hY3RpdmVTZWFyY2hDYWxsYmFja3NbcmVxdWVzdElkXTtcblx0XHRcdHJldHVybiByZXN1bHQucmVkdWNlKChhY2MsIHZhbCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxpbWl0SGl0OiBhY2M/LmxpbWl0SGl0IHx8ICh2YWw/LmxpbWl0SGl0ID8/IGZhbHNlKSxcblx0XHRcdFx0XHRtZXNzYWdlOiBbYWNjPy5tZXNzYWdlID8/IFtdLCB2YWw/Lm1lc3NhZ2UgPz8gW11dLmZsYXQoKSxcblx0XHRcdFx0fTtcblx0XHRcdH0sIHt9KSA/PyB7IGxpbWl0SGl0OiBmYWxzZSB9O1xuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fYWN0aXZlU2VhcmNoQ2FsbGJhY2tzW3JlcXVlc3RJZF07XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZmluZFRleHRJbkZpbGVzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmluZFRleHRJbkZpbGVzT3B0aW9ucyAmIHsgdXNlU2VhcmNoRXhjbHVkZT86IGJvb2xlYW4gfSwgY2FsbGJhY2s6IChyZXN1bHQ6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0KSA9PiB2b2lkLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBleHRIb3N0V29ya3NwYWNlI2ZpbmRUZXh0SW5GaWxlczogdGV4dFNlYXJjaCwgZXh0ZW5zaW9uOiAke2V4dGVuc2lvbklkLnZhbHVlfSwgZW50cnlQb2ludDogZmluZFRleHRJbkZpbGVzYCk7XG5cblx0XHRjb25zdCBwcmV2aWV3T3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucyA9IHR5cGVvZiBvcHRpb25zLnByZXZpZXdPcHRpb25zID09PSAndW5kZWZpbmVkJyA/XG5cdFx0XHR7XG5cdFx0XHRcdG1hdGNoTGluZXM6IDEwMCxcblx0XHRcdFx0Y2hhcnNQZXJMaW5lOiAxMDAwMFxuXHRcdFx0fSA6XG5cdFx0XHRvcHRpb25zLnByZXZpZXdPcHRpb25zO1xuXG5cdFx0Y29uc3QgcGFyc2VkSW5jbHVkZSA9IHBhcnNlU2VhcmNoRXhjbHVkZUluY2x1ZGUoR2xvYlBhdHRlcm4uZnJvbShvcHRpb25zLmluY2x1ZGUpKTtcblxuXHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJuID0gKHR5cGVvZiBvcHRpb25zLmV4Y2x1ZGUgPT09ICdzdHJpbmcnKSA/IG9wdGlvbnMuZXhjbHVkZSA6XG5cdFx0XHRvcHRpb25zLmV4Y2x1ZGUgPyBvcHRpb25zLmV4Y2x1ZGUucGF0dGVybiA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBxdWVyeU9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyA9IHtcblx0XHRcdGlnbm9yZVN5bWxpbmtzOiB0eXBlb2Ygb3B0aW9ucy5mb2xsb3dTeW1saW5rcyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMuZm9sbG93U3ltbGlua3MgOiB1bmRlZmluZWQsXG5cdFx0XHRkaXNyZWdhcmRJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMudXNlSWdub3JlRmlsZXMgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLnVzZUlnbm9yZUZpbGVzIDogdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcmVnYXJkR2xvYmFsSWdub3JlRmlsZXM6IHR5cGVvZiBvcHRpb25zLnVzZUdsb2JhbElnbm9yZUZpbGVzID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy51c2VHbG9iYWxJZ25vcmVGaWxlcyA6IHVuZGVmaW5lZCxcblx0XHRcdGRpc3JlZ2FyZFBhcmVudElnbm9yZUZpbGVzOiB0eXBlb2Ygb3B0aW9ucy51c2VQYXJlbnRJZ25vcmVGaWxlcyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlUGFyZW50SWdub3JlRmlsZXMgOiB1bmRlZmluZWQsXG5cdFx0XHRkaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3M6IHR5cGVvZiBvcHRpb25zLnVzZURlZmF1bHRFeGNsdWRlcyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlRGVmYXVsdEV4Y2x1ZGVzIDogdHJ1ZSxcblx0XHRcdGRpc3JlZ2FyZFNlYXJjaEV4Y2x1ZGVTZXR0aW5nczogdHlwZW9mIG9wdGlvbnMudXNlU2VhcmNoRXhjbHVkZSA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMudXNlU2VhcmNoRXhjbHVkZSA6IHRydWUsXG5cdFx0XHRmaWxlRW5jb2Rpbmc6IG9wdGlvbnMuZW5jb2RpbmcsXG5cdFx0XHRtYXhSZXN1bHRzOiBvcHRpb25zLm1heFJlc3VsdHMsXG5cdFx0XHRwcmV2aWV3T3B0aW9ucyxcblx0XHRcdHN1cnJvdW5kaW5nQ29udGV4dDogb3B0aW9ucy5hZnRlckNvbnRleHQsIC8vIFRPRE86IHJlbW92ZSBhYmlsaXR5IHRvIGhhdmUgYmVmb3JlL2FmdGVyIGNvbnRleHQgc2VwYXJhdGVseVxuXG5cdFx0XHRpbmNsdWRlUGF0dGVybjogcGFyc2VkSW5jbHVkZT8ucGF0dGVybixcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBleGNsdWRlUGF0dGVybiA/IFt7IHBhdHRlcm46IGV4Y2x1ZGVQYXR0ZXJuIH1dIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHRjb25zdCBwcm9ncmVzcyA9IChyZXN1bHQ6IElUZXh0U2VhcmNoUmVzdWx0PFVSST4sIHVyaTogVVJJKSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0SXNNYXRjaChyZXN1bHQpKSB7XG5cdFx0XHRcdGNhbGxiYWNrKHtcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0cHJldmlldzoge1xuXHRcdFx0XHRcdFx0dGV4dDogcmVzdWx0LnByZXZpZXdUZXh0LFxuXHRcdFx0XHRcdFx0bWF0Y2hlczogbWFwQXJyYXlPck5vdChcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnJhbmdlTG9jYXRpb25zLFxuXHRcdFx0XHRcdFx0XHRtID0+IG5ldyBSYW5nZShtLnByZXZpZXcuc3RhcnRMaW5lTnVtYmVyLCBtLnByZXZpZXcuc3RhcnRDb2x1bW4sIG0ucHJldmlldy5lbmRMaW5lTnVtYmVyLCBtLnByZXZpZXcuZW5kQ29sdW1uKSlcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJhbmdlczogbWFwQXJyYXlPck5vdChcblx0XHRcdFx0XHRcdHJlc3VsdC5yYW5nZUxvY2F0aW9ucyxcblx0XHRcdFx0XHRcdHIgPT4gbmV3IFJhbmdlKHIuc291cmNlLnN0YXJ0TGluZU51bWJlciwgci5zb3VyY2Uuc3RhcnRDb2x1bW4sIHIuc291cmNlLmVuZExpbmVOdW1iZXIsIHIuc291cmNlLmVuZENvbHVtbikpXG5cdFx0XHRcdH0gc2F0aXNmaWVzIHZzY29kZS5UZXh0U2VhcmNoTWF0Y2gpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2FsbGJhY2soe1xuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHR0ZXh0OiByZXN1bHQudGV4dCxcblx0XHRcdFx0XHRsaW5lTnVtYmVyOiByZXN1bHQubGluZU51bWJlclxuXHRcdFx0XHR9IHNhdGlzZmllcyB2c2NvZGUuVGV4dFNlYXJjaENvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGhpcy5maW5kVGV4dEluRmlsZXNCYXNlKHF1ZXJ5LCBbeyBvcHRpb25zOiBxdWVyeU9wdGlvbnMsIGZvbGRlcjogcGFyc2VkSW5jbHVkZT8uZm9sZGVyIH1dLCBwcm9ncmVzcywgdG9rZW4pO1xuXHR9XG5cblx0JGhhbmRsZVRleHRTZWFyY2hSZXN1bHQocmVzdWx0OiBJUmF3RmlsZU1hdGNoMiwgcmVxdWVzdElkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVTZWFyY2hDYWxsYmFja3NbcmVxdWVzdElkXT8uKHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyBzYXZlKHVyaTogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kc2F2ZSh1cmksIHsgc2F2ZUFzOiBmYWxzZSB9KTtcblxuXHRcdHJldHVybiBVUkkucmV2aXZlKHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyBzYXZlQXModXJpOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRzYXZlKHVyaSwgeyBzYXZlQXM6IHRydWUgfSk7XG5cblx0XHRyZXR1cm4gVVJJLnJldml2ZShyZXN1bHQpO1xuXHR9XG5cblx0c2F2ZUFsbChpbmNsdWRlVW50aXRsZWQ/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRzYXZlQWxsKGluY2x1ZGVVbnRpdGxlZCk7XG5cdH1cblxuXHRyZXNvbHZlUHJveHkodXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kcmVzb2x2ZVByb3h5KHVybCk7XG5cdH1cblxuXHRsb29rdXBBdXRob3JpemF0aW9uKGF1dGhJbmZvOiBBdXRoSW5mbyk6IFByb21pc2U8Q3JlZGVudGlhbHMgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGxvb2t1cEF1dGhvcml6YXRpb24oYXV0aEluZm8pO1xuXHR9XG5cblx0bG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uKHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbih1cmwpO1xuXHR9XG5cblx0bG9hZENlcnRpZmljYXRlcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRsb2FkQ2VydGlmaWNhdGVzKCk7XG5cdH1cblxuXHQvLyAtLS0gdHJ1c3QgLS0tXG5cblx0Z2V0IHRydXN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RydXN0ZWQ7XG5cdH1cblxuXHRyZXF1ZXN0UmVzb3VyY2VUcnVzdChvcHRpb25zOiB2c2NvZGUuUmVzb3VyY2VUcnVzdFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXF1ZXN0UmVzb3VyY2VUcnVzdChvcHRpb25zKTtcblx0fVxuXG5cdHJlcXVlc3RXb3Jrc3BhY2VUcnVzdChvcHRpb25zPzogdnNjb2RlLldvcmtzcGFjZVRydXN0UmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlcXVlc3RXb3Jrc3BhY2VUcnVzdChvcHRpb25zKTtcblx0fVxuXG5cdCRvbkRpZEdyYW50V29ya3NwYWNlVHJ1c3QoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cnVzdGVkKSB7XG5cdFx0XHR0aGlzLl90cnVzdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uRGlkR3JhbnRXb3Jrc3BhY2VUcnVzdC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0JG9uRGlkQ2hhbmdlV29ya3NwYWNlVHJ1c3RlZEZvbGRlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VUcnVzdGVkRm9sZGVycy5maXJlKCk7XG5cdH1cblxuXHRpc1Jlc291cmNlVHJ1c3RlZChyZXNvdXJjZTogdnNjb2RlLlVyaSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kaXNSZXNvdXJjZVRydXN0ZWQocmVzb3VyY2UpO1xuXHR9XG5cblx0Ly8gLS0tIGVkaXQgc2Vzc2lvbnMgLS0tXG5cblx0cHJpdmF0ZSBfcHJvdmlkZXJIYW5kbGVQb29sID0gMDtcblxuXHQvLyBjYWxsZWQgYnkgZXh0IGhvc3Rcblx0cmVnaXN0ZXJFZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVyKSB7XG5cdFx0aWYgKHRoaXMuX2VkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcnMuaGFzKHNjaGVtZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQSBwcm92aWRlciBoYXMgYWxyZWFkeSBiZWVuIHJlZ2lzdGVyZWQgZm9yIHNjaGVtZSAke3NjaGVtZX1gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0U2Vzc2lvbklkZW50aXR5UHJvdmlkZXJzLnNldChzY2hlbWUsIHByb3ZpZGVyKTtcblx0XHRjb25zdCBvdXRnb2luZ1NjaGVtZSA9IHRoaXMuX3VyaVRyYW5zZm9ybWVyU2VydmljZS50cmFuc2Zvcm1PdXRnb2luZ1NjaGVtZShzY2hlbWUpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX3Byb3ZpZGVySGFuZGxlUG9vbCsrO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckVkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcihoYW5kbGUsIG91dGdvaW5nU2NoZW1lKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVycy5kZWxldGUoc2NoZW1lKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyRWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVyKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBjYWxsZWQgYnkgbWFpbiB0aHJlYWRcblx0YXN5bmMgJGdldEVkaXRTZXNzaW9uSWRlbnRpZmllcih3b3Jrc3BhY2VGb2xkZXI6IFVyaUNvbXBvbmVudHMsIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdHZXR0aW5nIGVkaXQgc2Vzc2lvbiBpZGVudGlmaWVyIGZvciB3b3Jrc3BhY2VGb2xkZXInLCB3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHRoaXMucmVzb2x2ZVdvcmtzcGFjZUZvbGRlcihVUkkucmV2aXZlKHdvcmtzcGFjZUZvbGRlcikpO1xuXHRcdGlmICghZm9sZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1VuYWJsZSB0byByZXNvbHZlIHdvcmtzcGFjZSBmb2xkZXInKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdJbnZva2luZyAjcHJvdmlkZUVkaXRTZXNzaW9uSWRlbnRpdHkgZm9yIHdvcmtzcGFjZUZvbGRlcicsIGZvbGRlcik7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2VkaXRTZXNzaW9uSWRlbnRpdHlQcm92aWRlcnMuZ2V0KGZvbGRlci51cmkuc2NoZW1lKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFByb3ZpZGVyIGZvciBzY2hlbWUgJHtmb2xkZXIudXJpLnNjaGVtZX0gaXMgZGVmaW5lZDogYCwgISFwcm92aWRlcik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlRWRpdFNlc3Npb25JZGVudGl0eShmb2xkZXIsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1Byb3ZpZGVyIHJldHVybmVkIGVkaXQgc2Vzc2lvbiBpZGVudGlmaWVyOiAnLCByZXN1bHQpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUVkaXRTZXNzaW9uSWRlbnRpdHlNYXRjaCh3b3Jrc3BhY2VGb2xkZXI6IFVyaUNvbXBvbmVudHMsIGlkZW50aXR5MTogc3RyaW5nLCBpZGVudGl0eTI6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2ggfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ0dldHRpbmcgZWRpdCBzZXNzaW9uIGlkZW50aWZpZXIgZm9yIHdvcmtzcGFjZUZvbGRlcicsIHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5yZXNvbHZlV29ya3NwYWNlRm9sZGVyKFVSSS5yZXZpdmUod29ya3NwYWNlRm9sZGVyKSk7XG5cdFx0aWYgKCFmb2xkZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignVW5hYmxlIHRvIHJlc29sdmUgd29ya3NwYWNlIGZvbGRlcicpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ0ludm9raW5nICNwcm92aWRlRWRpdFNlc3Npb25JZGVudGl0eSBmb3Igd29ya3NwYWNlRm9sZGVyJywgZm9sZGVyKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZWRpdFNlc3Npb25JZGVudGl0eVByb3ZpZGVycy5nZXQoZm9sZGVyLnVyaS5zY2hlbWUpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUHJvdmlkZXIgZm9yIHNjaGVtZSAke2ZvbGRlci51cmkuc2NoZW1lfSBpcyBkZWZpbmVkOiBgLCAhIXByb3ZpZGVyKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2g/LihpZGVudGl0eTEsIGlkZW50aXR5MiwgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnUHJvdmlkZXIgcmV0dXJuZWQgZWRpdCBzZXNzaW9uIGlkZW50aWZpZXIgbWF0Y2ggcmVzdWx0OiAnLCByZXN1bHQpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxDcmVhdGVFZGl0U2Vzc2lvbklkZW50aXR5RXZlbnQgPSBuZXcgQXN5bmNFbWl0dGVyPHZzY29kZS5FZGl0U2Vzc2lvbklkZW50aXR5V2lsbENyZWF0ZUV2ZW50PigpO1xuXG5cdGdldE9uV2lsbENyZWF0ZUVkaXRTZXNzaW9uSWRlbnRpdHlFdmVudChleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IEV2ZW50PHZzY29kZS5FZGl0U2Vzc2lvbklkZW50aXR5V2lsbENyZWF0ZUV2ZW50PiB7XG5cdFx0cmV0dXJuIChsaXN0ZW5lciwgdGhpc0FyZywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdGNvbnN0IHdyYXBwZWRMaXN0ZW5lcjogSUV4dGVuc2lvbkxpc3RlbmVyPHZzY29kZS5FZGl0U2Vzc2lvbklkZW50aXR5V2lsbENyZWF0ZUV2ZW50PiA9IGZ1bmN0aW9uIHdyYXBwZWQoZSkgeyBsaXN0ZW5lci5jYWxsKHRoaXNBcmcsIGUpOyB9O1xuXHRcdFx0d3JhcHBlZExpc3RlbmVyLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdHJldHVybiB0aGlzLl9vbldpbGxDcmVhdGVFZGl0U2Vzc2lvbklkZW50aXR5RXZlbnQuZXZlbnQod3JhcHBlZExpc3RlbmVyLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gbWFpbiB0aHJlYWQgY2FsbHMgdGhpcyB0byB0cmlnZ2VyIHBhcnRpY2lwYW50c1xuXHRhc3luYyAkb25XaWxsQ3JlYXRlRWRpdFNlc3Npb25JZGVudGl0eSh3b3Jrc3BhY2VGb2xkZXI6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgdGltZW91dDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5yZXNvbHZlV29ya3NwYWNlRm9sZGVyKFVSSS5yZXZpdmUod29ya3NwYWNlRm9sZGVyKSk7XG5cblx0XHRpZiAoZm9sZGVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIHJlc29sdmUgd29ya3NwYWNlIGZvbGRlcicpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX29uV2lsbENyZWF0ZUVkaXRTZXNzaW9uSWRlbnRpdHlFdmVudC5maXJlQXN5bmMoeyB3b3Jrc3BhY2VGb2xkZXI6IGZvbGRlciB9LCB0b2tlbiwgYXN5bmMgKHRoZW5hYmxlOiBQcm9taXNlPHVua25vd24+LCBsaXN0ZW5lcikgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGVuYWJsZSk7XG5cdFx0XHRpZiAoRGF0ZS5ub3coKSAtIG5vdyA+IHRpbWVvdXQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdTTE9XIGVkaXQgc2Vzc2lvbiBjcmVhdGUtcGFydGljaXBhbnQnLCAoPElFeHRlbnNpb25MaXN0ZW5lcjx2c2NvZGUuRWRpdFNlc3Npb25JZGVudGl0eVdpbGxDcmVhdGVFdmVudD4+bGlzdGVuZXIpLmV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gY2Fub25pY2FsIHVyaSBpZGVudGl0eSAtLS1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5vbmljYWxVcmlQcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLkNhbm9uaWNhbFVyaVByb3ZpZGVyPigpO1xuXG5cdC8vIGNhbGxlZCBieSBleHQgaG9zdFxuXHRyZWdpc3RlckNhbm9uaWNhbFVyaVByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkNhbm9uaWNhbFVyaVByb3ZpZGVyKSB7XG5cdFx0aWYgKHRoaXMuX2Nhbm9uaWNhbFVyaVByb3ZpZGVycy5oYXMoc2NoZW1lKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBIHByb3ZpZGVyIGhhcyBhbHJlYWR5IGJlZW4gcmVnaXN0ZXJlZCBmb3Igc2NoZW1lICR7c2NoZW1lfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Nhbm9uaWNhbFVyaVByb3ZpZGVycy5zZXQoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0Y29uc3Qgb3V0Z29pbmdTY2hlbWUgPSB0aGlzLl91cmlUcmFuc2Zvcm1lclNlcnZpY2UudHJhbnNmb3JtT3V0Z29pbmdTY2hlbWUoc2NoZW1lKTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9wcm92aWRlckhhbmRsZVBvb2wrKztcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDYW5vbmljYWxVcmlQcm92aWRlcihoYW5kbGUsIG91dGdvaW5nU2NoZW1lKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2Fub25pY2FsVXJpUHJvdmlkZXJzLmRlbGV0ZShzY2hlbWUpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJDYW5vbmljYWxVcmlQcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNhbm9uaWNhbFVyaSh1cmk6IFVSSSwgb3B0aW9uczogdnNjb2RlLkNhbm9uaWNhbFVyaVJlcXVlc3RPcHRpb25zLCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY2Fub25pY2FsVXJpUHJvdmlkZXJzLmdldCh1cmkuc2NoZW1lKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDYW5vbmljYWxVcmk/LihVUkkucmV2aXZlKHVyaSksIG9wdGlvbnMsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gY2FsbGVkIGJ5IG1haW4gdGhyZWFkXG5cdGFzeW5jICRwcm92aWRlQ2Fub25pY2FsVXJpKHVyaTogVXJpQ29tcG9uZW50cywgdGFyZ2V0U2NoZW1lOiBzdHJpbmcsIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnByb3ZpZGVDYW5vbmljYWxVcmkoVVJJLnJldml2ZSh1cmkpLCB7IHRhcmdldFNjaGVtZSB9LCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdH1cblxuXHQvLyAtLS0gZW5jb2RpbmdzIC0tLVxuXG5cdGFzeW5jIGRlY29kZShjb250ZW50OiBVaW50OEFycmF5LCBhcmdzPzogeyB1cmk/OiB2c2NvZGUuVXJpOyBlbmNvZGluZz86IHN0cmluZyB9KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBbdXJpLCBvcHRzXSA9IHRoaXMudG9FbmNvZGVEZWNvZGVQYXJhbWV0ZXJzKGFyZ3MpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZURlY29kaW5nKHVyaSwgb3B0cyk7XG5cblx0XHRjb25zdCBzdHJlYW0gPSAoYXdhaXQgdG9EZWNvZGVTdHJlYW0oYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIud3JhcChjb250ZW50KSksIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRhY2NlcHRUZXh0T25seTogdHJ1ZSxcblx0XHRcdG92ZXJ3cml0ZUVuY29kaW5nOiBkZXRlY3RlZEVuY29kaW5nID0+IHtcblx0XHRcdFx0aWYgKGRldGVjdGVkRW5jb2RpbmcgPT09IG51bGwgfHwgZGV0ZWN0ZWRFbmNvZGluZyA9PT0gb3B0aW9ucy5wcmVmZXJyZWRFbmNvZGluZykge1xuXHRcdFx0XHRcdC8vIFByZXZlbnQgYW5vdGhlciByb3VuZHRyaXAgdG8gdGhlIG1haW4gdGhyZWFkXG5cdFx0XHRcdFx0Ly8gaWYgdGhlIGRldGVjdGVkIGVuY29kaW5nIGlzIG51bGwgb3IgdGhlIHNhbWVcblx0XHRcdFx0XHQvLyBhcyB0aGUgcHJlZmVycmVkIGVuY29kaW5nXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShvcHRpb25zLnByZWZlcnJlZEVuY29kaW5nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kdmFsaWRhdGVEZXRlY3RlZEVuY29kaW5nKHVyaSwgZGV0ZWN0ZWRFbmNvZGluZywgb3B0cyk7XG5cdFx0XHR9LFxuXHRcdH0pKS5zdHJlYW07XG5cblx0XHRyZXR1cm4gY29uc3VtZVN0cmVhbShzdHJlYW0sIGNodW5rcyA9PiBjaHVua3Muam9pbignJykpO1xuXHR9XG5cblx0YXN5bmMgZW5jb2RlKGNvbnRlbnQ6IHN0cmluZywgYXJncz86IHsgdXJpPzogdnNjb2RlLlVyaTsgZW5jb2Rpbmc/OiBzdHJpbmcgfSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IFt1cmksIG9wdGlvbnNdID0gdGhpcy50b0VuY29kZURlY29kZVBhcmFtZXRlcnMoYXJncyk7XG5cdFx0Y29uc3QgeyBlbmNvZGluZywgYWRkQk9NIH0gPSBhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZUVuY29kaW5nKHVyaSwgb3B0aW9ucyk7XG5cblx0XHQvLyB3aGVuIGVuY29kaW5nIGlzIHN0YW5kYXJkIHNraXAgZW5jb2Rpbmcgc3RlcFxuXHRcdGlmIChlbmNvZGluZyA9PT0gVVRGOCAmJiAhYWRkQk9NKSB7XG5cdFx0XHRyZXR1cm4gVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KS5idWZmZXI7XG5cdFx0fVxuXG5cdFx0Ly8gb3RoZXJ3aXNlIGNyZWF0ZSBlbmNvZGVkIHJlYWRhYmxlXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdG9FbmNvZGVSZWFkYWJsZShzdHJpbmdUb1NuYXBzaG90KGNvbnRlbnQpLCBlbmNvZGluZywgeyBhZGRCT00gfSk7XG5cdFx0cmV0dXJuIHJlYWRhYmxlVG9CdWZmZXIocmVzKS5idWZmZXI7XG5cdH1cblxuXHRwcml2YXRlIHRvRW5jb2RlRGVjb2RlUGFyYW1ldGVycyhvcHRzPzogeyB1cmk/OiB2c2NvZGUuVXJpOyBlbmNvZGluZz86IHN0cmluZyB9KTogW1VyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIHsgZW5jb2Rpbmc6IHN0cmluZyB9IHwgdW5kZWZpbmVkXSB7XG5cdFx0Y29uc3QgdXJpID0gaXNVcmlDb21wb25lbnRzKG9wdHM/LnVyaSkgPyBvcHRzLnVyaSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBlbmNvZGluZyA9IHR5cGVvZiBvcHRzPy5lbmNvZGluZyA9PT0gJ3N0cmluZycgPyBvcHRzLmVuY29kaW5nIDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIFt1cmksIGVuY29kaW5nID8geyBlbmNvZGluZyB9IDogdW5kZWZpbmVkXTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgSUV4dEhvc3RXb3Jrc3BhY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RXb3Jrc3BhY2U+KCdJRXh0SG9zdFdvcmtzcGFjZScpO1xuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdFdvcmtzcGFjZSBleHRlbmRzIEV4dEhvc3RXb3Jrc3BhY2UsIEV4dEhvc3RXb3Jrc3BhY2VTaGFwZSwgSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlciB7IH1cblxuZnVuY3Rpb24gcGFyc2VTZWFyY2hFeGNsdWRlSW5jbHVkZShpbmNsdWRlOiBzdHJpbmcgfCBJUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHsgcGF0dGVybjogc3RyaW5nOyBmb2xkZXI/OiBVUkkgfSB8IHVuZGVmaW5lZCB7XG5cdGxldCBwYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBpbmNsdWRlRm9sZGVyOiBVUkkgfCB1bmRlZmluZWQ7XG5cdGlmIChpbmNsdWRlKSB7XG5cdFx0aWYgKHR5cGVvZiBpbmNsdWRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cGF0dGVybiA9IGluY2x1ZGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBhdHRlcm4gPSBpbmNsdWRlLnBhdHRlcm47XG5cdFx0XHRpbmNsdWRlRm9sZGVyID0gVVJJLnJldml2ZShpbmNsdWRlLmJhc2VVcmkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRwYXR0ZXJuLFxuXHRcdFx0Zm9sZGVyOiBpbmNsdWRlRm9sZGVyXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSUV4dGVuc2lvbkxpc3RlbmVyPEU+IHtcblx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdChlOiBFKTogYW55O1xufVxuXG5mdW5jdGlvbiBnbG9ic1RvSVNlYXJjaFBhdHRlcm5CdWlsZGVyKGV4Y2x1ZGVzOiB2c2NvZGUuR2xvYlBhdHRlcm5bXSB8IHVuZGVmaW5lZCk6IElTZWFyY2hQYXR0ZXJuQnVpbGRlcjxVUkk+W10ge1xuXHRyZXR1cm4gKFxuXHRcdGV4Y2x1ZGVzPy5tYXAoKGV4Y2x1ZGUpOiBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VVJJPiB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGV4Y2x1ZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGlmIChleGNsdWRlID09PSAnJykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRwYXR0ZXJuOiBleGNsdWRlLFxuXHRcdFx0XHRcdHVyaTogdW5kZWZpbmVkXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTZWFyY2hQYXR0ZXJuQnVpbGRlcjxVUkk+O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkRXhjbHVkZSA9IHBhcnNlU2VhcmNoRXhjbHVkZUluY2x1ZGUoZXhjbHVkZSk7XG5cdFx0XHRcdGlmICghcGFyc2VkRXhjbHVkZSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRwYXR0ZXJuOiBwYXJzZWRFeGNsdWRlLnBhdHRlcm4sXG5cdFx0XHRcdFx0dXJpOiBwYXJzZWRFeGNsdWRlLmZvbGRlclxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VVJJPjtcblx0XHRcdH1cblx0XHR9KSA/PyBbXVxuXHQpLmZpbHRlcigoZSk6IGUgaXMgSVNlYXJjaFBhdHRlcm5CdWlsZGVyPFVSST4gPT4gISFlKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLFlBQVkscUJBQXFCO0FBQ25ELFNBQVMsdUJBQXVCLGVBQWU7QUFDL0MsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsY0FBYyxlQUFzQjtBQUM3QyxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUscUJBQXFCLFNBQVMsUUFBUSxvQkFBb0I7QUFDN0UsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLFdBQTBCO0FBQ3BELFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsV0FBVyx1QkFBdUI7QUFDM0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsOEJBQThCO0FBRXZDLFNBQTRDLHFCQUFxQjtBQUVqRSxTQUFxRSxtQkFBZ0k7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QUFBLElBQ3JDO0FBR0EsVUFBTSxNQUFNLE1BQU0saUJBQWlCLGlCQUFpQixPQUFPLEdBQUcsVUFBVSxFQUFFLE9BQU8sQ0FBQztBQUNsRixXQUFPLGlCQUFpQixHQUFHLEVBQUU7QUFBQSxFQUM5QjtBQUFBLEVBRVEseUJBQXlCLE1BQStHO0FBQy9JLFVBQU0sTUFBTSxnQkFBZ0IsTUFBTSxHQUFHLElBQUksS0FBSyxNQUFNO0FBQ3BELFVBQU0sV0FBVyxPQUFPLE1BQU0sYUFBYSxXQUFXLEtBQUssV0FBVztBQUV0RSxXQUFPLENBQUMsS0FBSyxXQUFXLEVBQUUsU0FBUyxJQUFJLE1BQVM7QUFBQSxFQUNqRDtBQUNEO0FBNThCYSxtQkFBTjtBQUFBLEVBb0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeENVO0FBODhCTixNQUFNLG9CQUFvQixnQkFBbUMsbUJBQW1CO0FBR3ZGLFNBQVMsMEJBQTBCLFNBQXlHO0FBQzNJLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSSxTQUFTO0FBQ1osUUFBSSxPQUFPLFlBQVksVUFBVTtBQUNoQyxnQkFBVTtBQUFBLElBQ1gsT0FBTztBQUNOLGdCQUFVLFFBQVE7QUFDbEIsc0JBQWdCLElBQUksT0FBTyxRQUFRLE9BQU87QUFBQSxJQUMzQztBQUVBLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFPQSxTQUFTLDZCQUE2QixVQUEwRTtBQUMvRyxVQUNDLFVBQVUsSUFBSSxDQUFDLFlBQW9EO0FBQ2xFLFFBQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsVUFBSSxZQUFZLElBQUk7QUFDbkIsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsUUFDTixTQUFTO0FBQUEsUUFDVCxLQUFLO0FBQUEsTUFDTjtBQUFBLElBQ0QsT0FBTztBQUNOLFlBQU0sZ0JBQWdCLDBCQUEwQixPQUFPO0FBQ3ZELFVBQUksQ0FBQyxlQUFlO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTztBQUFBLFFBQ04sU0FBUyxjQUFjO0FBQUEsUUFDdkIsS0FBSyxjQUFjO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDLEtBQUssQ0FBQyxHQUNOLE9BQU8sQ0FBQyxNQUF1QyxDQUFDLENBQUMsQ0FBQztBQUNyRDsiLAogICJuYW1lcyI6IFsiY29tcGFyZSIsICJpZ25vcmVQYXRoQ2FzaW5nIiwgIm5hbWUiLCAiaW5kZXgiXQp9Cg==
