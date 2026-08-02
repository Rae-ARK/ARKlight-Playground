import { localize } from "../../../nls.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isFalsyOrWhitespace } from "../../../base/common/strings.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { CancellationError } from "../../../base/common/errors.js";
import * as files from "../../../platform/files/common/files.js";
import { Cache } from "./cache.js";
import { MainContext } from "./extHost.protocol.js";
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from "./extHostCommands.js";
import * as typeConverters from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { ExtHostCell, ExtHostNotebookDocument } from "./extHostNotebookDocument.js";
import { ExtHostNotebookEditor } from "./extHostNotebookEditor.js";
import { filter } from "../../../base/common/objects.js";
import { Schemas } from "../../../base/common/network.js";
import { QueryType } from "../../services/search/common/search.js";
import { CellSearchModel } from "../../contrib/search/common/cellSearchModel.js";
import { genericCellMatchesToTextSearchMatches } from "../../contrib/search/common/searchNotebookHelpers.js";
import { globMatchesResource, RegisteredEditorPriority } from "../../services/editor/common/editorResolverService.js";
const _ExtHostNotebookController = class _ExtHostNotebookController {
  constructor(mainContext, commands, _textDocumentsAndEditors, _textDocuments, _extHostFileSystem, _extHostSearch, _logService) {
    this._textDocumentsAndEditors = _textDocumentsAndEditors;
    this._textDocuments = _textDocuments;
    this._extHostFileSystem = _extHostFileSystem;
    this._extHostSearch = _extHostSearch;
    this._logService = _logService;
    this._notebookStatusBarItemProviders = /* @__PURE__ */ new Map();
    this._documents = new ResourceMap();
    this._editors = /* @__PURE__ */ new Map();
    this._onDidChangeActiveNotebookEditor = new Emitter();
    this.onDidChangeActiveNotebookEditor = this._onDidChangeActiveNotebookEditor.event;
    this._visibleNotebookEditors = [];
    this._onDidOpenNotebookDocument = new Emitter();
    this.onDidOpenNotebookDocument = this._onDidOpenNotebookDocument.event;
    this._onDidCloseNotebookDocument = new Emitter();
    this.onDidCloseNotebookDocument = this._onDidCloseNotebookDocument.event;
    this._onDidChangeVisibleNotebookEditors = new Emitter();
    this.onDidChangeVisibleNotebookEditors = this._onDidChangeVisibleNotebookEditors.event;
    this._statusBarCache = new Cache("NotebookCellStatusBarCache");
    // --- serialize/deserialize
    this._handlePool = 0;
    this._notebookSerializer = /* @__PURE__ */ new Map();
    this._notebookProxy = mainContext.getProxy(MainContext.MainThreadNotebook);
    this._notebookDocumentsProxy = mainContext.getProxy(MainContext.MainThreadNotebookDocuments);
    this._notebookEditorsProxy = mainContext.getProxy(MainContext.MainThreadNotebookEditors);
    this._commandsConverter = commands.converter;
    commands.registerArgumentProcessor({
      // Serialized INotebookCellActionContext
      processArgument: (arg) => {
        if (arg && arg.$mid === MarshalledId.NotebookCellActionContext) {
          const notebookUri = arg.notebookEditor?.notebookUri;
          const cellHandle = arg.cell.handle;
          const data = this._documents.get(notebookUri);
          const cell = data?.getCell(cellHandle);
          if (cell) {
            return cell.apiCell;
          }
        }
        if (arg && arg.$mid === MarshalledId.NotebookActionContext) {
          const notebookUri = arg.uri;
          const data = this._documents.get(notebookUri);
          if (data) {
            return data.apiNotebook;
          }
        }
        return arg;
      }
    });
    _ExtHostNotebookController._registerApiCommands(commands);
  }
  get activeNotebookEditor() {
    return this._activeNotebookEditor?.apiEditor;
  }
  get visibleNotebookEditors() {
    return this._visibleNotebookEditors.map((editor) => editor.apiEditor);
  }
  getEditorById(editorId) {
    const editor = this._editors.get(editorId);
    if (!editor) {
      throw new Error(`unknown text editor: ${editorId}. known editors: ${[...this._editors.keys()]} `);
    }
    return editor;
  }
  getIdByEditor(editor) {
    for (const [id, candidate] of this._editors) {
      if (candidate.apiEditor === editor) {
        return id;
      }
    }
    return void 0;
  }
  get notebookDocuments() {
    return [...this._documents.values()];
  }
  getNotebookDocument(uri, relaxed) {
    const result = this._documents.get(uri);
    if (!result && !relaxed) {
      throw new Error(`NO notebook document for '${uri}'`);
    }
    return result;
  }
  static _convertNotebookRegistrationData(extension, registration) {
    if (!registration) {
      return;
    }
    const viewOptionsFilenamePattern = registration.filenamePattern.map((pattern) => typeConverters.NotebookExclusiveDocumentPattern.from(pattern)).filter((pattern) => pattern !== void 0);
    if (registration.filenamePattern && !viewOptionsFilenamePattern) {
      console.warn(`Notebook content provider view options file name pattern is invalid ${registration.filenamePattern}`);
      return void 0;
    }
    return {
      extension: extension.identifier,
      providerDisplayName: extension.displayName || extension.name,
      displayName: registration.displayName,
      filenamePattern: viewOptionsFilenamePattern,
      priority: registration.exclusive ? RegisteredEditorPriority.exclusive : void 0
    };
  }
  registerNotebookCellStatusBarItemProvider(extension, notebookType, provider) {
    const handle = _ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++;
    const eventHandle = typeof provider.onDidChangeCellStatusBarItems === "function" ? _ExtHostNotebookController._notebookStatusBarItemProviderHandlePool++ : void 0;
    this._notebookStatusBarItemProviders.set(handle, provider);
    this._notebookProxy.$registerNotebookCellStatusBarItemProvider(handle, eventHandle, notebookType);
    let subscription;
    if (eventHandle !== void 0) {
      subscription = provider.onDidChangeCellStatusBarItems((_) => this._notebookProxy.$emitCellStatusBarEvent(eventHandle));
    }
    return new extHostTypes.Disposable(() => {
      this._notebookStatusBarItemProviders.delete(handle);
      this._notebookProxy.$unregisterNotebookCellStatusBarItemProvider(handle, eventHandle);
      subscription?.dispose();
    });
  }
  async createNotebookDocument(options) {
    const canonicalUri = await this._notebookDocumentsProxy.$tryCreateNotebook({
      viewType: options.viewType,
      content: options.content && typeConverters.NotebookData.from(options.content)
    });
    return URI.revive(canonicalUri);
  }
  async openNotebookDocument(uri) {
    const cached = this._documents.get(uri);
    if (cached) {
      return cached.apiNotebook;
    }
    const canonicalUri = await this._notebookDocumentsProxy.$tryOpenNotebook(uri);
    const document = this._documents.get(URI.revive(canonicalUri));
    return assertReturnsDefined(document?.apiNotebook);
  }
  async showNotebookDocument(notebook, options) {
    let resolvedOptions;
    if (typeof options === "object") {
      resolvedOptions = {
        position: typeConverters.ViewColumn.from(options.viewColumn),
        preserveFocus: options.preserveFocus,
        selections: options.selections && options.selections.map(typeConverters.NotebookRange.from),
        pinned: typeof options.preview === "boolean" ? !options.preview : void 0,
        label: typeof options.asRepl === "string" ? options.asRepl : typeof options.asRepl === "object" ? options.asRepl.label : void 0
      };
    } else {
      resolvedOptions = {
        preserveFocus: false,
        pinned: true
      };
    }
    const viewType = !!options?.asRepl ? "repl" : notebook.notebookType;
    const editorId = await this._notebookEditorsProxy.$tryShowNotebookDocument(notebook.uri, viewType, resolvedOptions);
    const editor = editorId && this._editors.get(editorId)?.apiEditor;
    if (editor) {
      return editor;
    }
    if (editorId) {
      throw new Error(`Could NOT open editor for "${notebook.uri.toString()}" because another editor opened in the meantime.`);
    } else {
      throw new Error(`Could NOT open editor for "${notebook.uri.toString()}".`);
    }
  }
  async $provideNotebookCellStatusBarItems(handle, uri, index, token) {
    const provider = this._notebookStatusBarItemProviders.get(handle);
    const revivedUri = URI.revive(uri);
    const document = this._documents.get(revivedUri);
    if (!document || !provider) {
      return;
    }
    const cell = document.getCellFromIndex(index);
    if (!cell) {
      return;
    }
    const result = await provider.provideCellStatusBarItems(cell.apiCell, token);
    if (!result) {
      return void 0;
    }
    const disposables = new DisposableStore();
    const cacheId = this._statusBarCache.add([disposables]);
    const resultArr = Array.isArray(result) ? result : [result];
    const items = resultArr.map((item) => typeConverters.NotebookStatusBarItem.from(item, this._commandsConverter, disposables));
    return {
      cacheId,
      items
    };
  }
  $releaseNotebookCellStatusBarItems(cacheId) {
    this._statusBarCache.delete(cacheId);
  }
  registerNotebookSerializer(extension, viewType, serializer, options, registration) {
    if (isFalsyOrWhitespace(viewType)) {
      throw new Error(`viewType cannot be empty or just whitespace`);
    }
    const handle = this._handlePool++;
    this._notebookSerializer.set(handle, { viewType, serializer, options });
    this._notebookProxy.$registerNotebookSerializer(
      handle,
      { id: extension.identifier, location: extension.extensionLocation },
      viewType,
      typeConverters.NotebookDocumentContentOptions.from(options),
      _ExtHostNotebookController._convertNotebookRegistrationData(extension, registration)
    );
    return toDisposable(() => {
      this._notebookProxy.$unregisterNotebookSerializer(handle);
    });
  }
  async $dataToNotebook(handle, bytes, token) {
    const serializer = this._notebookSerializer.get(handle);
    if (!serializer) {
      throw new Error("NO serializer found");
    }
    const data = await serializer.serializer.deserializeNotebook(bytes.buffer, token);
    return new SerializableObjectWithBuffers(typeConverters.NotebookData.from(data));
  }
  async $notebookToData(handle, data, token) {
    const serializer = this._notebookSerializer.get(handle);
    if (!serializer) {
      throw new Error("NO serializer found");
    }
    const bytes = await serializer.serializer.serializeNotebook(typeConverters.NotebookData.to(data.value), token);
    return VSBuffer.wrap(bytes);
  }
  async $saveNotebook(handle, uriComponents, versionId, options, token) {
    const uri = URI.revive(uriComponents);
    const serializer = this._notebookSerializer.get(handle);
    this.trace(`enter saveNotebook(versionId: ${versionId}, ${uri.toString()})`);
    try {
      if (!serializer) {
        throw new NotebookSaveError("NO serializer found");
      }
      const document = this._documents.get(uri);
      if (!document) {
        throw new NotebookSaveError("Document NOT found");
      }
      if (document.versionId !== versionId) {
        throw new NotebookSaveError("Document version mismatch, expected: " + versionId + ", actual: " + document.versionId);
      }
      if (!this._extHostFileSystem.value.isWritableFileSystem(uri.scheme)) {
        throw new files.FileOperationError(localize("err.readonly", "Unable to modify read-only file '{0}'", this._resourceForError(uri)), files.FileOperationResult.FILE_PERMISSION_DENIED);
      }
      const data = {
        metadata: filter(document.apiNotebook.metadata, (key) => !(serializer.options?.transientDocumentMetadata ?? {})[key]),
        cells: []
      };
      for (const cell of document.apiNotebook.getCells()) {
        const cellData = new extHostTypes.NotebookCellData(
          cell.kind,
          cell.document.getText(),
          cell.document.languageId,
          cell.mime,
          !serializer.options?.transientOutputs ? [...cell.outputs] : [],
          cell.metadata,
          cell.executionSummary
        );
        cellData.metadata = filter(cell.metadata, (key) => !(serializer.options?.transientCellMetadata ?? {})[key]);
        data.cells.push(cellData);
      }
      await this._validateWriteFile(uri, options);
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      const bytes = await serializer.serializer.serializeNotebook(data, token);
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      this.trace(`serialized versionId: ${versionId} ${uri.toString()}`);
      await this._extHostFileSystem.value.writeFile(uri, bytes);
      this.trace(`Finished write versionId: ${versionId} ${uri.toString()}`);
      const providerExtUri = this._extHostFileSystem.getFileSystemProviderExtUri(uri.scheme);
      const stat = await this._extHostFileSystem.value.stat(uri);
      const fileStats = {
        name: providerExtUri.basename(uri),
        isFile: (stat.type & files.FileType.File) !== 0,
        isDirectory: (stat.type & files.FileType.Directory) !== 0,
        isSymbolicLink: (stat.type & files.FileType.SymbolicLink) !== 0,
        mtime: stat.mtime,
        ctime: stat.ctime,
        size: stat.size,
        readonly: Boolean((stat.permissions ?? 0) & files.FilePermission.Readonly) || !this._extHostFileSystem.value.isWritableFileSystem(uri.scheme),
        locked: Boolean((stat.permissions ?? 0) & files.FilePermission.Locked),
        executable: Boolean((stat.permissions ?? 0) & files.FilePermission.Executable),
        etag: files.etag({ mtime: stat.mtime, size: stat.size })
      };
      this.trace(`exit saveNotebook(versionId: ${versionId}, ${uri.toString()})`);
      return fileStats;
    } catch (error) {
      if (error instanceof files.FileOperationError) {
        return { ...error, message: error.message };
      }
      throw error;
    }
  }
  /**
   * Search for query in all notebooks that can be deserialized by the serializer fetched by `handle`.
   *
   * @param handle used to get notebook serializer
   * @param textQuery the text query to search using
   * @param viewTypeFileTargets the globs (and associated ranks) that are targetting for opening this type of notebook
   * @param otherViewTypeFileTargets ranked globs for other editors that we should consider when deciding whether it will open as this notebook
   * @param token cancellation token
   * @returns `IRawClosedNotebookFileMatch` for every file. Files without matches will just have a `IRawClosedNotebookFileMatch`
   * 	with no `cellResults`. This allows the caller to know what was searched in already, even if it did not yield results.
   */
  async $searchInNotebooks(handle, textQuery, viewTypeFileTargets, otherViewTypeFileTargets, token) {
    const serializer = this._notebookSerializer.get(handle)?.serializer;
    if (!serializer) {
      return {
        limitHit: false,
        results: []
      };
    }
    const finalMatchedTargets = new ResourceSet();
    const runFileQueries = async (includes, token2, textQuery2) => {
      await Promise.all(includes.map(
        async (include) => await Promise.all(include.filenamePatterns.map((filePattern) => {
          const query = {
            _reason: textQuery2._reason,
            folderQueries: textQuery2.folderQueries,
            includePattern: textQuery2.includePattern,
            excludePattern: textQuery2.excludePattern,
            maxResults: textQuery2.maxResults,
            type: QueryType.File,
            filePattern
          };
          return this._extHostSearch.doInternalFileSearchWithCustomCallback(query, token2, (data) => {
            data.forEach((uri) => {
              if (finalMatchedTargets.has(uri)) {
                return;
              }
              const hasOtherMatches = otherViewTypeFileTargets.some((target) => {
                if (include.isFromSettings && !target.isFromSettings) {
                  return false;
                } else {
                  return target.filenamePatterns.some((targetFilePattern) => globMatchesResource(targetFilePattern, uri));
                }
              });
              if (hasOtherMatches) {
                return;
              }
              finalMatchedTargets.add(uri);
            });
          }).catch((err) => {
            if (err.code === "ENOENT") {
              console.warn(`Could not find notebook search results, ignoring notebook results.`);
              return {
                limitHit: false,
                messages: []
              };
            } else {
              throw err;
            }
          });
        }))
      ));
      return;
    };
    await runFileQueries(viewTypeFileTargets, token, textQuery);
    const results = new ResourceMap();
    let limitHit = false;
    const promises = Array.from(finalMatchedTargets).map(async (uri) => {
      const cellMatches = [];
      try {
        if (token.isCancellationRequested) {
          return;
        }
        if (textQuery.maxResults && [...results.values()].reduce((acc, value) => acc + value.cellResults.length, 0) > textQuery.maxResults) {
          limitHit = true;
          return;
        }
        const simpleCells = [];
        const notebook = this._documents.get(uri);
        if (notebook) {
          const cells = notebook.apiNotebook.getCells();
          cells.forEach((e) => simpleCells.push(
            {
              input: e.document.getText(),
              outputs: e.outputs.flatMap((value) => value.items.map((output) => output.data.toString()))
            }
          ));
        } else {
          const fileContent = await this._extHostFileSystem.value.readFile(uri);
          const bytes = VSBuffer.fromString(fileContent.toString());
          const notebook2 = await serializer.deserializeNotebook(bytes.buffer, token);
          if (token.isCancellationRequested) {
            return;
          }
          const data = typeConverters.NotebookData.from(notebook2);
          data.cells.forEach((cell) => simpleCells.push(
            {
              input: cell.source,
              outputs: cell.outputs.flatMap((value) => value.items.map((output) => output.valueBytes.toString()))
            }
          ));
        }
        if (token.isCancellationRequested) {
          return;
        }
        simpleCells.forEach((cell, index) => {
          const target = textQuery.contentPattern.pattern;
          const cellModel = new CellSearchModel(cell.input, void 0, cell.outputs);
          const inputMatches = cellModel.findInInputs(target);
          const outputMatches = cellModel.findInOutputs(target);
          const webviewResults = outputMatches.flatMap((outputMatch) => genericCellMatchesToTextSearchMatches(outputMatch.matches, outputMatch.textBuffer)).map((textMatch, index2) => {
            textMatch.webviewIndex = index2;
            return textMatch;
          });
          if (inputMatches.length > 0 || outputMatches.length > 0) {
            const cellMatch = {
              index,
              contentResults: genericCellMatchesToTextSearchMatches(inputMatches, cellModel.inputTextBuffer),
              webviewResults
            };
            cellMatches.push(cellMatch);
          }
        });
        const fileMatch = {
          resource: uri,
          cellResults: cellMatches
        };
        results.set(uri, fileMatch);
        return;
      } catch (e) {
        return;
      }
    });
    await Promise.all(promises);
    return {
      limitHit,
      results: [...results.values()]
    };
  }
  async _validateWriteFile(uri, options) {
    const stat = await this._extHostFileSystem.value.stat(uri);
    if (typeof options?.mtime === "number" && typeof options.etag === "string" && options.etag !== files.ETAG_DISABLED && typeof stat.mtime === "number" && typeof stat.size === "number" && options.mtime < stat.mtime && options.etag !== files.etag({ mtime: options.mtime, size: stat.size })) {
      throw new files.FileOperationError(localize("fileModifiedError", "File Modified Since"), files.FileOperationResult.FILE_MODIFIED_SINCE, options);
    }
    return;
  }
  _resourceForError(uri) {
    return uri.scheme === Schemas.file ? uri.fsPath : uri.toString();
  }
  // --- open, save, saveAs, backup
  _createExtHostEditor(document, editorId, data) {
    if (this._editors.has(editorId)) {
      throw new Error(`editor with id ALREADY EXSIST: ${editorId}`);
    }
    const editor = new ExtHostNotebookEditor(
      editorId,
      this._notebookEditorsProxy,
      document,
      data.visibleRanges.map(typeConverters.NotebookRange.to),
      data.selections.map(typeConverters.NotebookRange.to),
      typeof data.viewColumn === "number" ? typeConverters.ViewColumn.to(data.viewColumn) : void 0,
      data.viewType
    );
    this._editors.set(editorId, editor);
  }
  $acceptDocumentAndEditorsDelta(delta) {
    if (delta.value.removedDocuments) {
      for (const uri of delta.value.removedDocuments) {
        const revivedUri = URI.revive(uri);
        const document = this._documents.get(revivedUri);
        if (document) {
          document.dispose();
          this._documents.delete(revivedUri);
          this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: document.apiNotebook.getCells().map((cell) => cell.document.uri) });
          this._onDidCloseNotebookDocument.fire(document.apiNotebook);
        }
        for (const editor of this._editors.values()) {
          if (editor.notebookData.uri.toString() === revivedUri.toString()) {
            this._editors.delete(editor.id);
          }
        }
      }
    }
    if (delta.value.addedDocuments) {
      const addedCellDocuments = [];
      for (const modelData of delta.value.addedDocuments) {
        const uri = URI.revive(modelData.uri);
        if (this._documents.has(uri)) {
          throw new Error(`adding EXISTING notebook ${uri} `);
        }
        const document = new ExtHostNotebookDocument(
          this._notebookDocumentsProxy,
          this._textDocumentsAndEditors,
          this._textDocuments,
          uri,
          modelData
        );
        addedCellDocuments.push(...modelData.cells.map((cell) => ExtHostCell.asModelAddData(cell)));
        this._documents.get(uri)?.dispose();
        this._documents.set(uri, document);
        this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addedCellDocuments });
        this._onDidOpenNotebookDocument.fire(document.apiNotebook);
      }
    }
    if (delta.value.addedEditors) {
      for (const editorModelData of delta.value.addedEditors) {
        if (this._editors.has(editorModelData.id)) {
          return;
        }
        const revivedUri = URI.revive(editorModelData.documentUri);
        const document = this._documents.get(revivedUri);
        if (document) {
          this._createExtHostEditor(document, editorModelData.id, editorModelData);
        }
      }
    }
    const removedEditors = [];
    if (delta.value.removedEditors) {
      for (const editorid of delta.value.removedEditors) {
        const editor = this._editors.get(editorid);
        if (editor) {
          this._editors.delete(editorid);
          if (this._activeNotebookEditor?.id === editor.id) {
            this._activeNotebookEditor = void 0;
          }
          removedEditors.push(editor);
        }
      }
    }
    if (delta.value.visibleEditors) {
      this._visibleNotebookEditors = delta.value.visibleEditors.map((id) => this._editors.get(id)).filter((editor) => !!editor);
      const visibleEditorsSet = /* @__PURE__ */ new Set();
      this._visibleNotebookEditors.forEach((editor) => visibleEditorsSet.add(editor.id));
      for (const editor of this._editors.values()) {
        const newValue = visibleEditorsSet.has(editor.id);
        editor._acceptVisibility(newValue);
      }
      this._visibleNotebookEditors = [...this._editors.values()].map((e) => e).filter((e) => e.visible);
      this._onDidChangeVisibleNotebookEditors.fire(this.visibleNotebookEditors);
    }
    if (delta.value.newActiveEditor === null) {
      this._activeNotebookEditor = void 0;
    } else if (delta.value.newActiveEditor) {
      const activeEditor = this._editors.get(delta.value.newActiveEditor);
      if (!activeEditor) {
        console.error(`FAILED to find active notebook editor ${delta.value.newActiveEditor}`);
      }
      this._activeNotebookEditor = this._editors.get(delta.value.newActiveEditor);
    }
    if (delta.value.newActiveEditor !== void 0) {
      this._onDidChangeActiveNotebookEditor.fire(this._activeNotebookEditor?.apiEditor);
    }
  }
  static _registerApiCommands(extHostCommands) {
    const notebookTypeArg = ApiCommandArgument.String.with("notebookType", "A notebook type");
    const commandDataToNotebook = new ApiCommand(
      "vscode.executeDataToNotebook",
      "_executeDataToNotebook",
      "Invoke notebook serializer",
      [notebookTypeArg, new ApiCommandArgument("data", "Bytes to convert to data", (v) => v instanceof Uint8Array, (v) => VSBuffer.wrap(v))],
      new ApiCommandResult("Notebook Data", (data) => typeConverters.NotebookData.to(data.value))
    );
    const commandNotebookToData = new ApiCommand(
      "vscode.executeNotebookToData",
      "_executeNotebookToData",
      "Invoke notebook serializer",
      [notebookTypeArg, new ApiCommandArgument("NotebookData", "Notebook data to convert to bytes", (v) => true, (v) => new SerializableObjectWithBuffers(typeConverters.NotebookData.from(v)))],
      new ApiCommandResult("Bytes", (dto) => dto.buffer)
    );
    extHostCommands.registerApiCommand(commandDataToNotebook);
    extHostCommands.registerApiCommand(commandNotebookToData);
  }
  trace(msg) {
    this._logService.trace(`[Extension Host Notebook] ${msg}`);
  }
};
_ExtHostNotebookController._notebookStatusBarItemProviderHandlePool = 0;
let ExtHostNotebookController = _ExtHostNotebookController;
class NotebookSaveError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotebookSaveError";
  }
}
export {
  ExtHostNotebookController,
  NotebookSaveError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3ROb3RlYm9vay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVJlbGF0aXZlUGF0dGVybiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCAqIGFzIGZpbGVzIGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDYWNoZSB9IGZyb20gJy4vY2FjaGUuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rU2hhcGUsIElNYWluQ29udGV4dCwgSU1vZGVsQWRkZWREYXRhLCBJTm90ZWJvb2tDZWxsU3RhdHVzQmFyTGlzdER0bywgSU5vdGVib29rRG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhLCBJTm90ZWJvb2tEb2N1bWVudFNob3dPcHRpb25zLCBJTm90ZWJvb2tFZGl0b3JBZGREYXRhLCBJTm90ZWJvb2tQYXJ0aWFsRmlsZVN0YXRzV2l0aE1ldGFkYXRhLCBNYWluQ29udGV4dCwgTWFpblRocmVhZE5vdGVib29rRG9jdW1lbnRzU2hhcGUsIE1haW5UaHJlYWROb3RlYm9va0VkaXRvcnNTaGFwZSwgTWFpblRocmVhZE5vdGVib29rU2hhcGUsIE5vdGVib29rRGF0YUR0byB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBBcGlDb21tYW5kLCBBcGlDb21tYW5kQXJndW1lbnQsIEFwaUNvbW1hbmRSZXN1bHQsIENvbW1hbmRzQ29udmVydGVyLCBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydGVycyBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0VHlwZXMgZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRGaWx0ZXIsIElOb3RlYm9va0NvbnRyaWJ1dGlvbkRhdGEgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRXh0SG9zdENlbGwsIEV4dEhvc3ROb3RlYm9va0RvY3VtZW50IH0gZnJvbSAnLi9leHRIb3N0Tm90ZWJvb2tEb2N1bWVudC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuL2V4dEhvc3ROb3RlYm9va0VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSB9IGZyb20gJy4vZXh0SG9zdEZpbGVTeXN0ZW1Db25zdW1lci5qcyc7XG5pbXBvcnQgeyBmaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElGaWxlUXVlcnksIElUZXh0UXVlcnksIFF1ZXJ5VHlwZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElFeHRIb3N0U2VhcmNoIH0gZnJvbSAnLi9leHRIb3N0U2VhcmNoLmpzJztcbmltcG9ydCB7IENlbGxTZWFyY2hNb2RlbCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9jZWxsU2VhcmNoTW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQ2VsbE1hdGNoTm9Nb2RlbCwgSU5vdGVib29rRmlsZU1hdGNoTm9Nb2RlbCwgSVJhd0Nsb3NlZE5vdGVib29rRmlsZU1hdGNoLCBnZW5lcmljQ2VsbE1hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzIH0gZnJvbSAnLi4vLi4vY29udHJpYi9zZWFyY2gvY29tbW9uL3NlYXJjaE5vdGVib29rSGVscGVycy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1ByaW9yaXR5SW5mbyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgZ2xvYk1hdGNoZXNSZXNvdXJjZSwgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyIGltcGxlbWVudHMgRXh0SG9zdE5vdGVib29rU2hhcGUge1xuXHRwcml2YXRlIHN0YXRpYyBfbm90ZWJvb2tTdGF0dXNCYXJJdGVtUHJvdmlkZXJIYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rUHJveHk6IE1haW5UaHJlYWROb3RlYm9va1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0RvY3VtZW50c1Byb3h5OiBNYWluVGhyZWFkTm90ZWJvb2tEb2N1bWVudHNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFZGl0b3JzUHJveHk6IE1haW5UaHJlYWROb3RlYm9va0VkaXRvcnNTaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1N0YXR1c0Jhckl0ZW1Qcm92aWRlcnMgPSBuZXcgTWFwPG51bWJlciwgdnNjb2RlLk5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzID0gbmV3IFJlc291cmNlTWFwPEV4dEhvc3ROb3RlYm9va0RvY3VtZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JzID0gbmV3IE1hcDxzdHJpbmcsIEV4dEhvc3ROb3RlYm9va0VkaXRvcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlTm90ZWJvb2tFZGl0b3IgPSBuZXcgRW1pdHRlcjx2c2NvZGUuTm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlTm90ZWJvb2tFZGl0b3IgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZU5vdGVib29rRWRpdG9yLmV2ZW50O1xuXG5cdHByaXZhdGUgX2FjdGl2ZU5vdGVib29rRWRpdG9yOiBFeHRIb3N0Tm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdGdldCBhY3RpdmVOb3RlYm9va0VkaXRvcigpOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVOb3RlYm9va0VkaXRvcj8uYXBpRWRpdG9yO1xuXHR9XG5cdHByaXZhdGUgX3Zpc2libGVOb3RlYm9va0VkaXRvcnM6IEV4dEhvc3ROb3RlYm9va0VkaXRvcltdID0gW107XG5cdGdldCB2aXNpYmxlTm90ZWJvb2tFZGl0b3JzKCk6IHZzY29kZS5Ob3RlYm9va0VkaXRvcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZU5vdGVib29rRWRpdG9ycy5tYXAoZWRpdG9yID0+IGVkaXRvci5hcGlFZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRPcGVuTm90ZWJvb2tEb2N1bWVudCA9IG5ldyBFbWl0dGVyPHZzY29kZS5Ob3RlYm9va0RvY3VtZW50PigpO1xuXHRyZWFkb25seSBvbkRpZE9wZW5Ob3RlYm9va0RvY3VtZW50OiBFdmVudDx2c2NvZGUuTm90ZWJvb2tEb2N1bWVudD4gPSB0aGlzLl9vbkRpZE9wZW5Ob3RlYm9va0RvY3VtZW50LmV2ZW50O1xuXHRwcml2YXRlIF9vbkRpZENsb3NlTm90ZWJvb2tEb2N1bWVudCA9IG5ldyBFbWl0dGVyPHZzY29kZS5Ob3RlYm9va0RvY3VtZW50PigpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlTm90ZWJvb2tEb2N1bWVudDogRXZlbnQ8dnNjb2RlLk5vdGVib29rRG9jdW1lbnQ+ID0gdGhpcy5fb25EaWRDbG9zZU5vdGVib29rRG9jdW1lbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VWaXNpYmxlTm90ZWJvb2tFZGl0b3JzID0gbmV3IEVtaXR0ZXI8dnNjb2RlLk5vdGVib29rRWRpdG9yW10+KCk7XG5cdG9uRGlkQ2hhbmdlVmlzaWJsZU5vdGVib29rRWRpdG9ycyA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJsZU5vdGVib29rRWRpdG9ycy5ldmVudDtcblxuXHRwcml2YXRlIF9zdGF0dXNCYXJDYWNoZSA9IG5ldyBDYWNoZTxJRGlzcG9zYWJsZT4oJ05vdGVib29rQ2VsbFN0YXR1c0JhckNhY2hlJyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IElNYWluQ29udGV4dCxcblx0XHRjb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgX3RleHREb2N1bWVudHNBbmRFZGl0b3JzOiBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0XHRwcml2YXRlIF90ZXh0RG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgX2V4dEhvc3RGaWxlU3lzdGVtOiBJRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSxcblx0XHRwcml2YXRlIF9leHRIb3N0U2VhcmNoOiBJRXh0SG9zdFNlYXJjaCxcblx0XHRwcml2YXRlIF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9ub3RlYm9va1Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZE5vdGVib29rKTtcblx0XHR0aGlzLl9ub3RlYm9va0RvY3VtZW50c1Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZE5vdGVib29rRG9jdW1lbnRzKTtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvcnNQcm94eSA9IG1haW5Db250ZXh0LmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWROb3RlYm9va0VkaXRvcnMpO1xuXHRcdHRoaXMuX2NvbW1hbmRzQ29udmVydGVyID0gY29tbWFuZHMuY29udmVydGVyO1xuXG5cdFx0Y29tbWFuZHMucmVnaXN0ZXJBcmd1bWVudFByb2Nlc3Nvcih7XG5cdFx0XHQvLyBTZXJpYWxpemVkIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0XG5cdFx0XHRwcm9jZXNzQXJndW1lbnQ6IChhcmcpID0+IHtcblx0XHRcdFx0aWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLk5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRcdFx0XHRjb25zdCBub3RlYm9va1VyaSA9IGFyZy5ub3RlYm9va0VkaXRvcj8ubm90ZWJvb2tVcmk7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbEhhbmRsZSA9IGFyZy5jZWxsLmhhbmRsZTtcblxuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KG5vdGVib29rVXJpKTtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gZGF0YT8uZ2V0Q2VsbChjZWxsSGFuZGxlKTtcblx0XHRcdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNlbGwuYXBpQ2VsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLk5vdGVib29rQWN0aW9uQ29udGV4dCkge1xuXHRcdFx0XHRcdGNvbnN0IG5vdGVib29rVXJpID0gYXJnLnVyaTtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fZG9jdW1lbnRzLmdldChub3RlYm9va1VyaSk7XG5cdFx0XHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0XHRcdHJldHVybiBkYXRhLmFwaU5vdGVib29rO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0RXh0SG9zdE5vdGVib29rQ29udHJvbGxlci5fcmVnaXN0ZXJBcGlDb21tYW5kcyhjb21tYW5kcyk7XG5cdH1cblxuXHRnZXRFZGl0b3JCeUlkKGVkaXRvcklkOiBzdHJpbmcpOiBFeHRIb3N0Tm90ZWJvb2tFZGl0b3Ige1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvcnMuZ2V0KGVkaXRvcklkKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmtub3duIHRleHQgZWRpdG9yOiAke2VkaXRvcklkfS4ga25vd24gZWRpdG9yczogJHtbLi4udGhpcy5fZWRpdG9ycy5rZXlzKCldfSBgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdGdldElkQnlFZGl0b3IoZWRpdG9yOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3IpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBjYW5kaWRhdGVdIG9mIHRoaXMuX2VkaXRvcnMpIHtcblx0XHRcdGlmIChjYW5kaWRhdGUuYXBpRWRpdG9yID09PSBlZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuIGlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IG5vdGVib29rRG9jdW1lbnRzKCkge1xuXHRcdHJldHVybiBbLi4udGhpcy5fZG9jdW1lbnRzLnZhbHVlcygpXTtcblx0fVxuXG5cdGdldE5vdGVib29rRG9jdW1lbnQodXJpOiBVUkksIHJlbGF4ZWQ6IHRydWUpOiBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCB8IHVuZGVmaW5lZDtcblx0Z2V0Tm90ZWJvb2tEb2N1bWVudCh1cmk6IFVSSSk6IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50O1xuXHRnZXROb3RlYm9va0RvY3VtZW50KHVyaTogVVJJLCByZWxheGVkPzogdHJ1ZSk6IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCFyZXN1bHQgJiYgIXJlbGF4ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTk8gbm90ZWJvb2sgZG9jdW1lbnQgZm9yICcke3VyaX0nYCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29udmVydE5vdGVib29rUmVnaXN0cmF0aW9uRGF0YShleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcmVnaXN0cmF0aW9uOiB2c2NvZGUuTm90ZWJvb2tSZWdpc3RyYXRpb25EYXRhIHwgdW5kZWZpbmVkKTogSU5vdGVib29rQ29udHJpYnV0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyZWdpc3RyYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld09wdGlvbnNGaWxlbmFtZVBhdHRlcm4gPSByZWdpc3RyYXRpb24uZmlsZW5hbWVQYXR0ZXJuXG5cdFx0XHQubWFwKHBhdHRlcm4gPT4gdHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tFeGNsdXNpdmVEb2N1bWVudFBhdHRlcm4uZnJvbShwYXR0ZXJuKSlcblx0XHRcdC5maWx0ZXIocGF0dGVybiA9PiBwYXR0ZXJuICE9PSB1bmRlZmluZWQpIGFzIChzdHJpbmcgfCBJUmVsYXRpdmVQYXR0ZXJuIHwgSU5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRGaWx0ZXIpW107XG5cdFx0aWYgKHJlZ2lzdHJhdGlvbi5maWxlbmFtZVBhdHRlcm4gJiYgIXZpZXdPcHRpb25zRmlsZW5hbWVQYXR0ZXJuKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oYE5vdGVib29rIGNvbnRlbnQgcHJvdmlkZXIgdmlldyBvcHRpb25zIGZpbGUgbmFtZSBwYXR0ZXJuIGlzIGludmFsaWQgJHtyZWdpc3RyYXRpb24uZmlsZW5hbWVQYXR0ZXJufWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRwcm92aWRlckRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUsXG5cdFx0XHRkaXNwbGF5TmFtZTogcmVnaXN0cmF0aW9uLmRpc3BsYXlOYW1lLFxuXHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiB2aWV3T3B0aW9uc0ZpbGVuYW1lUGF0dGVybixcblx0XHRcdHByaW9yaXR5OiByZWdpc3RyYXRpb24uZXhjbHVzaXZlID8gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRyZWdpc3Rlck5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgbm90ZWJvb2tUeXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVByb3ZpZGVyKSB7XG5cblx0XHRjb25zdCBoYW5kbGUgPSBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyLl9ub3RlYm9va1N0YXR1c0Jhckl0ZW1Qcm92aWRlckhhbmRsZVBvb2wrKztcblx0XHRjb25zdCBldmVudEhhbmRsZSA9IHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZUNlbGxTdGF0dXNCYXJJdGVtcyA9PT0gJ2Z1bmN0aW9uJyA/IEV4dEhvc3ROb3RlYm9va0NvbnRyb2xsZXIuX25vdGVib29rU3RhdHVzQmFySXRlbVByb3ZpZGVySGFuZGxlUG9vbCsrIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tTdGF0dXNCYXJJdGVtUHJvdmlkZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9ub3RlYm9va1Byb3h5LiRyZWdpc3Rlck5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlcihoYW5kbGUsIGV2ZW50SGFuZGxlLCBub3RlYm9va1R5cGUpO1xuXG5cdFx0bGV0IHN1YnNjcmlwdGlvbjogdnNjb2RlLkRpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGV2ZW50SGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHN1YnNjcmlwdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ2VsbFN0YXR1c0Jhckl0ZW1zIShfID0+IHRoaXMuX25vdGVib29rUHJveHkuJGVtaXRDZWxsU3RhdHVzQmFyRXZlbnQoZXZlbnRIYW5kbGUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX25vdGVib29rU3RhdHVzQmFySXRlbVByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdHRoaXMuX25vdGVib29rUHJveHkuJHVucmVnaXN0ZXJOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXIoaGFuZGxlLCBldmVudEhhbmRsZSk7XG5cdFx0XHRzdWJzY3JpcHRpb24/LmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU5vdGVib29rRG9jdW1lbnQob3B0aW9uczogeyB2aWV3VHlwZTogc3RyaW5nOyBjb250ZW50PzogdnNjb2RlLk5vdGVib29rRGF0YSB9KTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBjYW5vbmljYWxVcmkgPSBhd2FpdCB0aGlzLl9ub3RlYm9va0RvY3VtZW50c1Byb3h5LiR0cnlDcmVhdGVOb3RlYm9vayh7XG5cdFx0XHR2aWV3VHlwZTogb3B0aW9ucy52aWV3VHlwZSxcblx0XHRcdGNvbnRlbnQ6IG9wdGlvbnMuY29udGVudCAmJiB0eXBlQ29udmVydGVycy5Ob3RlYm9va0RhdGEuZnJvbShvcHRpb25zLmNvbnRlbnQpXG5cdFx0fSk7XG5cdFx0cmV0dXJuIFVSSS5yZXZpdmUoY2Fub25pY2FsVXJpKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5Ob3RlYm9va0RvY3VtZW50KHVyaTogVVJJKTogUHJvbWlzZTx2c2NvZGUuTm90ZWJvb2tEb2N1bWVudD4ge1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX2RvY3VtZW50cy5nZXQodXJpKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkLmFwaU5vdGVib29rO1xuXHRcdH1cblx0XHRjb25zdCBjYW5vbmljYWxVcmkgPSBhd2FpdCB0aGlzLl9ub3RlYm9va0RvY3VtZW50c1Byb3h5LiR0cnlPcGVuTm90ZWJvb2sodXJpKTtcblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXQoVVJJLnJldml2ZShjYW5vbmljYWxVcmkpKTtcblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQoZG9jdW1lbnQ/LmFwaU5vdGVib29rKTtcblx0fVxuXG5cdGFzeW5jIHNob3dOb3RlYm9va0RvY3VtZW50KG5vdGVib29rOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudCwgb3B0aW9ucz86IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50U2hvd09wdGlvbnMpOiBQcm9taXNlPHZzY29kZS5Ob3RlYm9va0VkaXRvcj4ge1xuXHRcdGxldCByZXNvbHZlZE9wdGlvbnM6IElOb3RlYm9va0RvY3VtZW50U2hvd09wdGlvbnM7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuXHRcdFx0cmVzb2x2ZWRPcHRpb25zID0ge1xuXHRcdFx0XHRwb3NpdGlvbjogdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi5mcm9tKG9wdGlvbnMudmlld0NvbHVtbiksXG5cdFx0XHRcdHByZXNlcnZlRm9jdXM6IG9wdGlvbnMucHJlc2VydmVGb2N1cyxcblx0XHRcdFx0c2VsZWN0aW9uczogb3B0aW9ucy5zZWxlY3Rpb25zICYmIG9wdGlvbnMuc2VsZWN0aW9ucy5tYXAodHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tSYW5nZS5mcm9tKSxcblx0XHRcdFx0cGlubmVkOiB0eXBlb2Ygb3B0aW9ucy5wcmV2aWV3ID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy5wcmV2aWV3IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYWJlbDogdHlwZW9mIG9wdGlvbnMuYXNSZXBsID09PSAnc3RyaW5nJyA/XG5cdFx0XHRcdFx0b3B0aW9ucy5hc1JlcGwgOlxuXHRcdFx0XHRcdHR5cGVvZiBvcHRpb25zLmFzUmVwbCA9PT0gJ29iamVjdCcgP1xuXHRcdFx0XHRcdFx0b3B0aW9ucy5hc1JlcGwubGFiZWwgOlxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb2x2ZWRPcHRpb25zID0ge1xuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBmYWxzZSxcblx0XHRcdFx0cGlubmVkOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdUeXBlID0gISFvcHRpb25zPy5hc1JlcGwgPyAncmVwbCcgOiBub3RlYm9vay5ub3RlYm9va1R5cGU7XG5cdFx0Y29uc3QgZWRpdG9ySWQgPSBhd2FpdCB0aGlzLl9ub3RlYm9va0VkaXRvcnNQcm94eS4kdHJ5U2hvd05vdGVib29rRG9jdW1lbnQobm90ZWJvb2sudXJpLCB2aWV3VHlwZSwgcmVzb2x2ZWRPcHRpb25zKTtcblx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JJZCAmJiB0aGlzLl9lZGl0b3JzLmdldChlZGl0b3JJZCk/LmFwaUVkaXRvcjtcblxuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdHJldHVybiBlZGl0b3I7XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvcklkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIE5PVCBvcGVuIGVkaXRvciBmb3IgXCIke25vdGVib29rLnVyaS50b1N0cmluZygpfVwiIGJlY2F1c2UgYW5vdGhlciBlZGl0b3Igb3BlbmVkIGluIHRoZSBtZWFudGltZS5gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb3VsZCBOT1Qgb3BlbiBlZGl0b3IgZm9yIFwiJHtub3RlYm9vay51cmkudG9TdHJpbmcoKX1cIi5gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1zKGhhbmRsZTogbnVtYmVyLCB1cmk6IFVyaUNvbXBvbmVudHMsIGluZGV4OiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU5vdGVib29rQ2VsbFN0YXR1c0Jhckxpc3REdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX25vdGVib29rU3RhdHVzQmFySXRlbVByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRjb25zdCByZXZpdmVkVXJpID0gVVJJLnJldml2ZSh1cmkpO1xuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZG9jdW1lbnRzLmdldChyZXZpdmVkVXJpKTtcblx0XHRpZiAoIWRvY3VtZW50IHx8ICFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGwgPSBkb2N1bWVudC5nZXRDZWxsRnJvbUluZGV4KGluZGV4KTtcblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2VsbFN0YXR1c0Jhckl0ZW1zKGNlbGwuYXBpQ2VsbCwgdG9rZW4pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNhY2hlSWQgPSB0aGlzLl9zdGF0dXNCYXJDYWNoZS5hZGQoW2Rpc3Bvc2FibGVzXSk7XG5cdFx0Y29uc3QgcmVzdWx0QXJyID0gQXJyYXkuaXNBcnJheShyZXN1bHQpID8gcmVzdWx0IDogW3Jlc3VsdF07XG5cdFx0Y29uc3QgaXRlbXMgPSByZXN1bHRBcnIubWFwKGl0ZW0gPT4gdHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tTdGF0dXNCYXJJdGVtLmZyb20oaXRlbSwgdGhpcy5fY29tbWFuZHNDb252ZXJ0ZXIsIGRpc3Bvc2FibGVzKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNhY2hlSWQsXG5cdFx0XHRpdGVtc1xuXHRcdH07XG5cdH1cblxuXHQkcmVsZWFzZU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1zKGNhY2hlSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXR1c0JhckNhY2hlLmRlbGV0ZShjYWNoZUlkKTtcblx0fVxuXG5cdC8vIC0tLSBzZXJpYWxpemUvZGVzZXJpYWxpemVcblxuXHRwcml2YXRlIF9oYW5kbGVQb29sID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJpYWxpemVyID0gbmV3IE1hcDxudW1iZXIsIHsgdmlld1R5cGU6IHN0cmluZzsgc2VyaWFsaXplcjogdnNjb2RlLk5vdGVib29rU2VyaWFsaXplcjsgb3B0aW9uczogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50T3B0aW9ucyB8IHVuZGVmaW5lZCB9PigpO1xuXG5cdHJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB2aWV3VHlwZTogc3RyaW5nLCBzZXJpYWxpemVyOiB2c2NvZGUuTm90ZWJvb2tTZXJpYWxpemVyLCBvcHRpb25zPzogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50T3B0aW9ucywgcmVnaXN0cmF0aW9uPzogdnNjb2RlLk5vdGVib29rUmVnaXN0cmF0aW9uRGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZSh2aWV3VHlwZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgdmlld1R5cGUgY2Fubm90IGJlIGVtcHR5IG9yIGp1c3Qgd2hpdGVzcGFjZWApO1xuXHRcdH1cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9oYW5kbGVQb29sKys7XG5cdFx0dGhpcy5fbm90ZWJvb2tTZXJpYWxpemVyLnNldChoYW5kbGUsIHsgdmlld1R5cGUsIHNlcmlhbGl6ZXIsIG9wdGlvbnMgfSk7XG5cdFx0dGhpcy5fbm90ZWJvb2tQcm94eS4kcmVnaXN0ZXJOb3RlYm9va1NlcmlhbGl6ZXIoXG5cdFx0XHRoYW5kbGUsXG5cdFx0XHR7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllciwgbG9jYXRpb246IGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbiB9LFxuXHRcdFx0dmlld1R5cGUsXG5cdFx0XHR0eXBlQ29udmVydGVycy5Ob3RlYm9va0RvY3VtZW50Q29udGVudE9wdGlvbnMuZnJvbShvcHRpb25zKSxcblx0XHRcdEV4dEhvc3ROb3RlYm9va0NvbnRyb2xsZXIuX2NvbnZlcnROb3RlYm9va1JlZ2lzdHJhdGlvbkRhdGEoZXh0ZW5zaW9uLCByZWdpc3RyYXRpb24pXG5cdFx0KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX25vdGVib29rUHJveHkuJHVucmVnaXN0ZXJOb3RlYm9va1NlcmlhbGl6ZXIoaGFuZGxlKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRkYXRhVG9Ob3RlYm9vayhoYW5kbGU6IG51bWJlciwgYnl0ZXM6IFZTQnVmZmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPE5vdGVib29rRGF0YUR0bz4+IHtcblx0XHRjb25zdCBzZXJpYWxpemVyID0gdGhpcy5fbm90ZWJvb2tTZXJpYWxpemVyLmdldChoYW5kbGUpO1xuXHRcdGlmICghc2VyaWFsaXplcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOTyBzZXJpYWxpemVyIGZvdW5kJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBzZXJpYWxpemVyLnNlcmlhbGl6ZXIuZGVzZXJpYWxpemVOb3RlYm9vayhieXRlcy5idWZmZXIsIHRva2VuKTtcblx0XHRyZXR1cm4gbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rRGF0YS5mcm9tKGRhdGEpKTtcblx0fVxuXG5cdGFzeW5jICRub3RlYm9va1RvRGF0YShoYW5kbGU6IG51bWJlciwgZGF0YTogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8Tm90ZWJvb2tEYXRhRHRvPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSB0aGlzLl9ub3RlYm9va1NlcmlhbGl6ZXIuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFzZXJpYWxpemVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05PIHNlcmlhbGl6ZXIgZm91bmQnKTtcblx0XHR9XG5cdFx0Y29uc3QgYnl0ZXMgPSBhd2FpdCBzZXJpYWxpemVyLnNlcmlhbGl6ZXIuc2VyaWFsaXplTm90ZWJvb2sodHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tEYXRhLnRvKGRhdGEudmFsdWUpLCB0b2tlbik7XG5cdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAoYnl0ZXMpO1xuXHR9XG5cblx0YXN5bmMgJHNhdmVOb3RlYm9vayhoYW5kbGU6IG51bWJlciwgdXJpQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmVyc2lvbklkOiBudW1iZXIsIG9wdGlvbnM6IGZpbGVzLklXcml0ZUZpbGVPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElOb3RlYm9va1BhcnRpYWxGaWxlU3RhdHNXaXRoTWV0YWRhdGEgfCBmaWxlcy5GaWxlT3BlcmF0aW9uRXJyb3I+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKHVyaUNvbXBvbmVudHMpO1xuXHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSB0aGlzLl9ub3RlYm9va1NlcmlhbGl6ZXIuZ2V0KGhhbmRsZSk7XG5cdFx0dGhpcy50cmFjZShgZW50ZXIgc2F2ZU5vdGVib29rKHZlcnNpb25JZDogJHt2ZXJzaW9uSWR9LCAke3VyaS50b1N0cmluZygpfSlgKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXNlcmlhbGl6ZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IE5vdGVib29rU2F2ZUVycm9yKCdOTyBzZXJpYWxpemVyIGZvdW5kJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZG9jdW1lbnRzLmdldCh1cmkpO1xuXHRcdFx0aWYgKCFkb2N1bWVudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgTm90ZWJvb2tTYXZlRXJyb3IoJ0RvY3VtZW50IE5PVCBmb3VuZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZG9jdW1lbnQudmVyc2lvbklkICE9PSB2ZXJzaW9uSWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IE5vdGVib29rU2F2ZUVycm9yKCdEb2N1bWVudCB2ZXJzaW9uIG1pc21hdGNoLCBleHBlY3RlZDogJyArIHZlcnNpb25JZCArICcsIGFjdHVhbDogJyArIGRvY3VtZW50LnZlcnNpb25JZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fZXh0SG9zdEZpbGVTeXN0ZW0udmFsdWUuaXNXcml0YWJsZUZpbGVTeXN0ZW0odXJpLnNjaGVtZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IGZpbGVzLkZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZXJyLnJlYWRvbmx5JywgXCJVbmFibGUgdG8gbW9kaWZ5IHJlYWQtb25seSBmaWxlICd7MH0nXCIsIHRoaXMuX3Jlc291cmNlRm9yRXJyb3IodXJpKSksIGZpbGVzLkZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGE6IHZzY29kZS5Ob3RlYm9va0RhdGEgPSB7XG5cdFx0XHRcdG1ldGFkYXRhOiBmaWx0ZXIoZG9jdW1lbnQuYXBpTm90ZWJvb2subWV0YWRhdGEsIGtleSA9PiAhKHNlcmlhbGl6ZXIub3B0aW9ucz8udHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSA/PyB7fSlba2V5XSksXG5cdFx0XHRcdGNlbGxzOiBbXSxcblx0XHRcdH07XG5cblx0XHRcdC8vIHRoaXMgZGF0YSBtdXN0IGJlIHJldHJpZXZlZCBiZWZvcmUgYW55IGFzeW5jIGNhbGxzIHRvIGVuc3VyZSB0aGUgZGF0YSBpcyBmb3IgdGhlIGNvcnJlY3QgdmVyc2lvblxuXHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIGRvY3VtZW50LmFwaU5vdGVib29rLmdldENlbGxzKCkpIHtcblx0XHRcdFx0Y29uc3QgY2VsbERhdGEgPSBuZXcgZXh0SG9zdFR5cGVzLk5vdGVib29rQ2VsbERhdGEoXG5cdFx0XHRcdFx0Y2VsbC5raW5kLFxuXHRcdFx0XHRcdGNlbGwuZG9jdW1lbnQuZ2V0VGV4dCgpLFxuXHRcdFx0XHRcdGNlbGwuZG9jdW1lbnQubGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRjZWxsLm1pbWUsXG5cdFx0XHRcdFx0IShzZXJpYWxpemVyLm9wdGlvbnM/LnRyYW5zaWVudE91dHB1dHMpID8gWy4uLmNlbGwub3V0cHV0c10gOiBbXSxcblx0XHRcdFx0XHRjZWxsLm1ldGFkYXRhLFxuXHRcdFx0XHRcdGNlbGwuZXhlY3V0aW9uU3VtbWFyeVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGNlbGxEYXRhLm1ldGFkYXRhID0gZmlsdGVyKGNlbGwubWV0YWRhdGEsIGtleSA9PiAhKHNlcmlhbGl6ZXIub3B0aW9ucz8udHJhbnNpZW50Q2VsbE1ldGFkYXRhID8/IHt9KVtrZXldKTtcblx0XHRcdFx0ZGF0YS5jZWxscy5wdXNoKGNlbGxEYXRhKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsaWRhdGUgd3JpdGVcblx0XHRcdGF3YWl0IHRoaXMuX3ZhbGlkYXRlV3JpdGVGaWxlKHVyaSwgb3B0aW9ucyk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ5dGVzID0gYXdhaXQgc2VyaWFsaXplci5zZXJpYWxpemVyLnNlcmlhbGl6ZU5vdGVib29rKGRhdGEsIHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRG9uJ3QgYWNjZXB0IGFueSBjYW5jZWxsYXRpb24gYmV5b25kIHRoaXMgcG9pbnQsIHdlIG5lZWQgdG8gcmVwb3J0IHRoZSByZXN1bHQgb2YgdGhlIGZpbGUgd3JpdGVcblx0XHRcdHRoaXMudHJhY2UoYHNlcmlhbGl6ZWQgdmVyc2lvbklkOiAke3ZlcnNpb25JZH0gJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtLnZhbHVlLndyaXRlRmlsZSh1cmksIGJ5dGVzKTtcblx0XHRcdHRoaXMudHJhY2UoYEZpbmlzaGVkIHdyaXRlIHZlcnNpb25JZDogJHt2ZXJzaW9uSWR9ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRjb25zdCBwcm92aWRlckV4dFVyaSA9IHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtLmdldEZpbGVTeXN0ZW1Qcm92aWRlckV4dFVyaSh1cmkuc2NoZW1lKTtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9leHRIb3N0RmlsZVN5c3RlbS52YWx1ZS5zdGF0KHVyaSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTdGF0cyA9IHtcblx0XHRcdFx0bmFtZTogcHJvdmlkZXJFeHRVcmkuYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0aXNGaWxlOiAoc3RhdC50eXBlICYgZmlsZXMuRmlsZVR5cGUuRmlsZSkgIT09IDAsXG5cdFx0XHRcdGlzRGlyZWN0b3J5OiAoc3RhdC50eXBlICYgZmlsZXMuRmlsZVR5cGUuRGlyZWN0b3J5KSAhPT0gMCxcblx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IChzdGF0LnR5cGUgJiBmaWxlcy5GaWxlVHlwZS5TeW1ib2xpY0xpbmspICE9PSAwLFxuXHRcdFx0XHRtdGltZTogc3RhdC5tdGltZSxcblx0XHRcdFx0Y3RpbWU6IHN0YXQuY3RpbWUsXG5cdFx0XHRcdHNpemU6IHN0YXQuc2l6ZSxcblx0XHRcdFx0cmVhZG9ubHk6IEJvb2xlYW4oKHN0YXQucGVybWlzc2lvbnMgPz8gMCkgJiBmaWxlcy5GaWxlUGVybWlzc2lvbi5SZWFkb25seSkgfHwgIXRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtLnZhbHVlLmlzV3JpdGFibGVGaWxlU3lzdGVtKHVyaS5zY2hlbWUpLFxuXHRcdFx0XHRsb2NrZWQ6IEJvb2xlYW4oKHN0YXQucGVybWlzc2lvbnMgPz8gMCkgJiBmaWxlcy5GaWxlUGVybWlzc2lvbi5Mb2NrZWQpLFxuXHRcdFx0XHRleGVjdXRhYmxlOiBCb29sZWFuKChzdGF0LnBlcm1pc3Npb25zID8/IDApICYgZmlsZXMuRmlsZVBlcm1pc3Npb24uRXhlY3V0YWJsZSksXG5cdFx0XHRcdGV0YWc6IGZpbGVzLmV0YWcoeyBtdGltZTogc3RhdC5tdGltZSwgc2l6ZTogc3RhdC5zaXplIH0pXG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLnRyYWNlKGBleGl0IHNhdmVOb3RlYm9vayh2ZXJzaW9uSWQ6ICR7dmVyc2lvbklkfSwgJHt1cmkudG9TdHJpbmcoKX0pYCk7XG5cdFx0XHRyZXR1cm4gZmlsZVN0YXRzO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyByZXR1cm4gZmlsZU9wZXJhdGlvbnNFcnJvcnMgdG8ga2VlcCB0aGUgd2hvbGUgb2JqZWN0IGFjcm9zcyBzZXJpYWxpemF0aW9uLCB0aGVzZSBlcnJvcnMgYXJlIGhhbmRsZWQgc3BlY2lhbGx5IGJ5IHRoZSBXQ1Ncblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIGZpbGVzLkZpbGVPcGVyYXRpb25FcnJvcikge1xuXHRcdFx0XHRyZXR1cm4geyAuLi5lcnJvciwgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNlYXJjaCBmb3IgcXVlcnkgaW4gYWxsIG5vdGVib29rcyB0aGF0IGNhbiBiZSBkZXNlcmlhbGl6ZWQgYnkgdGhlIHNlcmlhbGl6ZXIgZmV0Y2hlZCBieSBgaGFuZGxlYC5cblx0ICpcblx0ICogQHBhcmFtIGhhbmRsZSB1c2VkIHRvIGdldCBub3RlYm9vayBzZXJpYWxpemVyXG5cdCAqIEBwYXJhbSB0ZXh0UXVlcnkgdGhlIHRleHQgcXVlcnkgdG8gc2VhcmNoIHVzaW5nXG5cdCAqIEBwYXJhbSB2aWV3VHlwZUZpbGVUYXJnZXRzIHRoZSBnbG9icyAoYW5kIGFzc29jaWF0ZWQgcmFua3MpIHRoYXQgYXJlIHRhcmdldHRpbmcgZm9yIG9wZW5pbmcgdGhpcyB0eXBlIG9mIG5vdGVib29rXG5cdCAqIEBwYXJhbSBvdGhlclZpZXdUeXBlRmlsZVRhcmdldHMgcmFua2VkIGdsb2JzIGZvciBvdGhlciBlZGl0b3JzIHRoYXQgd2Ugc2hvdWxkIGNvbnNpZGVyIHdoZW4gZGVjaWRpbmcgd2hldGhlciBpdCB3aWxsIG9wZW4gYXMgdGhpcyBub3RlYm9va1xuXHQgKiBAcGFyYW0gdG9rZW4gY2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEByZXR1cm5zIGBJUmF3Q2xvc2VkTm90ZWJvb2tGaWxlTWF0Y2hgIGZvciBldmVyeSBmaWxlLiBGaWxlcyB3aXRob3V0IG1hdGNoZXMgd2lsbCBqdXN0IGhhdmUgYSBgSVJhd0Nsb3NlZE5vdGVib29rRmlsZU1hdGNoYFxuXHQgKiBcdHdpdGggbm8gYGNlbGxSZXN1bHRzYC4gVGhpcyBhbGxvd3MgdGhlIGNhbGxlciB0byBrbm93IHdoYXQgd2FzIHNlYXJjaGVkIGluIGFscmVhZHksIGV2ZW4gaWYgaXQgZGlkIG5vdCB5aWVsZCByZXN1bHRzLlxuXHQgKi9cblx0YXN5bmMgJHNlYXJjaEluTm90ZWJvb2tzKGhhbmRsZTogbnVtYmVyLCB0ZXh0UXVlcnk6IElUZXh0UXVlcnksIHZpZXdUeXBlRmlsZVRhcmdldHM6IE5vdGVib29rUHJpb3JpdHlJbmZvW10sIG90aGVyVmlld1R5cGVGaWxlVGFyZ2V0czogTm90ZWJvb2tQcmlvcml0eUluZm9bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IHJlc3VsdHM6IElSYXdDbG9zZWROb3RlYm9va0ZpbGVNYXRjaFtdOyBsaW1pdEhpdDogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3Qgc2VyaWFsaXplciA9IHRoaXMuX25vdGVib29rU2VyaWFsaXplci5nZXQoaGFuZGxlKT8uc2VyaWFsaXplcjtcblx0XHRpZiAoIXNlcmlhbGl6ZXIpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxpbWl0SGl0OiBmYWxzZSxcblx0XHRcdFx0cmVzdWx0czogW11cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmluYWxNYXRjaGVkVGFyZ2V0cyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0Y29uc3QgcnVuRmlsZVF1ZXJpZXMgPSBhc3luYyAoaW5jbHVkZXM6IE5vdGVib29rUHJpb3JpdHlJbmZvW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgdGV4dFF1ZXJ5OiBJVGV4dFF1ZXJ5KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpbmNsdWRlcy5tYXAoYXN5bmMgaW5jbHVkZSA9PlxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpbmNsdWRlLmZpbGVuYW1lUGF0dGVybnMubWFwKGZpbGVQYXR0ZXJuID0+IHtcblx0XHRcdFx0XHRjb25zdCBxdWVyeTogSUZpbGVRdWVyeSA9IHtcblx0XHRcdFx0XHRcdF9yZWFzb246IHRleHRRdWVyeS5fcmVhc29uLFxuXHRcdFx0XHRcdFx0Zm9sZGVyUXVlcmllczogdGV4dFF1ZXJ5LmZvbGRlclF1ZXJpZXMsXG5cdFx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjogdGV4dFF1ZXJ5LmluY2x1ZGVQYXR0ZXJuLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHRleHRRdWVyeS5leGNsdWRlUGF0dGVybixcblx0XHRcdFx0XHRcdG1heFJlc3VsdHM6IHRleHRRdWVyeS5tYXhSZXN1bHRzLFxuXHRcdFx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRcdFx0XHRmaWxlUGF0dGVyblxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHQvLyB1c2UgcHJpb3JpdHkgaW5mbyB0byBleGNsdWRlIGluZm8gZnJvbSBvdGhlciBnbG9ic1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9leHRIb3N0U2VhcmNoLmRvSW50ZXJuYWxGaWxlU2VhcmNoV2l0aEN1c3RvbUNhbGxiYWNrKHF1ZXJ5LCB0b2tlbiwgKGRhdGEpID0+IHtcblx0XHRcdFx0XHRcdGRhdGEuZm9yRWFjaCh1cmkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZmluYWxNYXRjaGVkVGFyZ2V0cy5oYXModXJpKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCBoYXNPdGhlck1hdGNoZXMgPSBvdGhlclZpZXdUeXBlRmlsZVRhcmdldHMuc29tZSh0YXJnZXQgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHVzZSB0aGUgc2FtZSBzdHJhdGVneSB0aGF0IHRoZSBlZGl0b3Igc2VydmljZSB1c2VzIHRvIG9wZW4gZWRpdG9yc1xuXHRcdFx0XHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvYWMxNjMxNTI4ZTY3NjM3ZGE2NWVjOTk0YzZkYzM1ZDczZjZlMzNjYy9zcmMvdnMvd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9icm93c2VyL2VkaXRvclJlc29sdmVyU2VydmljZS50cyNMMzU5LUwzNjZcblx0XHRcdFx0XHRcdFx0XHRpZiAoaW5jbHVkZS5pc0Zyb21TZXR0aW5ncyAmJiAhdGFyZ2V0LmlzRnJvbVNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBpZiB0aGUgaW5jbHVkZSBpcyBmcm9tIHRoZSBzZXR0aW5ncyBhbmQgdGFyZ2V0IGlzbid0LCBldmVuIGlmIGl0IG1hdGNoZXMsIGl0J3Mgc3RpbGwgb3ZlcnJpZGRlbi5cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gbG9uZ2VyIGZpbGVQYXR0ZXJucyBhcmUgY29uc2lkZXJlZCBtb3JlIHNwZWNpZmMsIHNvIHRoZXkgYWx3YXlzIGhhdmUgcHJlY2VkZW5jZSB0aGUgc2hvcnRlciBwYXR0ZXJuc1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRhcmdldC5maWxlbmFtZVBhdHRlcm5zLnNvbWUodGFyZ2V0RmlsZVBhdHRlcm4gPT4gZ2xvYk1hdGNoZXNSZXNvdXJjZSh0YXJnZXRGaWxlUGF0dGVybiwgdXJpKSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0XHRpZiAoaGFzT3RoZXJNYXRjaGVzKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGZpbmFsTWF0Y2hlZFRhcmdldHMuYWRkKHVyaSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gZG9uJ3Qgc2hvdyBub3RlYm9vayByZXN1bHRzIGZvciByZW1vdGVodWIgcmVwb3MuXG5cdFx0XHRcdFx0XHRpZiAoZXJyLmNvZGUgPT09ICdFTk9FTlQnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUud2FybihgQ291bGQgbm90IGZpbmQgbm90ZWJvb2sgc2VhcmNoIHJlc3VsdHMsIGlnbm9yaW5nIG5vdGVib29rIHJlc3VsdHMuYCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0bGltaXRIaXQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2VzOiBbXSxcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkpXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybjtcblx0XHR9O1xuXG5cdFx0YXdhaXQgcnVuRmlsZVF1ZXJpZXModmlld1R5cGVGaWxlVGFyZ2V0cywgdG9rZW4sIHRleHRRdWVyeSk7XG5cblx0XHRjb25zdCByZXN1bHRzID0gbmV3IFJlc291cmNlTWFwPElOb3RlYm9va0ZpbGVNYXRjaE5vTW9kZWw+KCk7XG5cdFx0bGV0IGxpbWl0SGl0ID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvbWlzZXMgPSBBcnJheS5mcm9tKGZpbmFsTWF0Y2hlZFRhcmdldHMpLm1hcChhc3luYyAodXJpKSA9PiB7XG5cdFx0XHRjb25zdCBjZWxsTWF0Y2hlczogSU5vdGVib29rQ2VsbE1hdGNoTm9Nb2RlbFtdID0gW107XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGV4dFF1ZXJ5Lm1heFJlc3VsdHMgJiYgWy4uLnJlc3VsdHMudmFsdWVzKCldLnJlZHVjZSgoYWNjLCB2YWx1ZSkgPT4gYWNjICsgdmFsdWUuY2VsbFJlc3VsdHMubGVuZ3RoLCAwKSA+IHRleHRRdWVyeS5tYXhSZXN1bHRzKSB7XG5cdFx0XHRcdFx0bGltaXRIaXQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNpbXBsZUNlbGxzOiBBcnJheTx7IGlucHV0OiBzdHJpbmc7IG91dHB1dHM6IHN0cmluZ1tdIH0+ID0gW107XG5cdFx0XHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fZG9jdW1lbnRzLmdldCh1cmkpO1xuXHRcdFx0XHRpZiAobm90ZWJvb2spIHtcblx0XHRcdFx0XHRjb25zdCBjZWxscyA9IG5vdGVib29rLmFwaU5vdGVib29rLmdldENlbGxzKCk7XG5cdFx0XHRcdFx0Y2VsbHMuZm9yRWFjaChlID0+IHNpbXBsZUNlbGxzLnB1c2goXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlucHV0OiBlLmRvY3VtZW50LmdldFRleHQoKSxcblx0XHRcdFx0XHRcdFx0b3V0cHV0czogZS5vdXRwdXRzLmZsYXRNYXAodmFsdWUgPT4gdmFsdWUuaXRlbXMubWFwKG91dHB1dCA9PiBvdXRwdXQuZGF0YS50b1N0cmluZygpKSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtLnZhbHVlLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRcdFx0Y29uc3QgYnl0ZXMgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKGZpbGVDb250ZW50LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGNvbnN0IG5vdGVib29rID0gYXdhaXQgc2VyaWFsaXplci5kZXNlcmlhbGl6ZU5vdGVib29rKGJ5dGVzLmJ1ZmZlciwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBkYXRhID0gdHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tEYXRhLmZyb20obm90ZWJvb2spO1xuXG5cdFx0XHRcdFx0ZGF0YS5jZWxscy5mb3JFYWNoKGNlbGwgPT4gc2ltcGxlQ2VsbHMucHVzaChcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aW5wdXQ6IGNlbGwuc291cmNlLFxuXHRcdFx0XHRcdFx0XHRvdXRwdXRzOiBjZWxsLm91dHB1dHMuZmxhdE1hcCh2YWx1ZSA9PiB2YWx1ZS5pdGVtcy5tYXAob3V0cHV0ID0+IG91dHB1dC52YWx1ZUJ5dGVzLnRvU3RyaW5nKCkpKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cblxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzaW1wbGVDZWxscy5mb3JFYWNoKChjZWxsLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IHRleHRRdWVyeS5jb250ZW50UGF0dGVybi5wYXR0ZXJuO1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxNb2RlbCA9IG5ldyBDZWxsU2VhcmNoTW9kZWwoY2VsbC5pbnB1dCwgdW5kZWZpbmVkLCBjZWxsLm91dHB1dHMpO1xuXG5cdFx0XHRcdFx0Y29uc3QgaW5wdXRNYXRjaGVzID0gY2VsbE1vZGVsLmZpbmRJbklucHV0cyh0YXJnZXQpO1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dE1hdGNoZXMgPSBjZWxsTW9kZWwuZmluZEluT3V0cHV0cyh0YXJnZXQpO1xuXHRcdFx0XHRcdGNvbnN0IHdlYnZpZXdSZXN1bHRzID0gb3V0cHV0TWF0Y2hlc1xuXHRcdFx0XHRcdFx0LmZsYXRNYXAob3V0cHV0TWF0Y2ggPT5cblx0XHRcdFx0XHRcdFx0Z2VuZXJpY0NlbGxNYXRjaGVzVG9UZXh0U2VhcmNoTWF0Y2hlcyhvdXRwdXRNYXRjaC5tYXRjaGVzLCBvdXRwdXRNYXRjaC50ZXh0QnVmZmVyKSlcblx0XHRcdFx0XHRcdC5tYXAoKHRleHRNYXRjaCwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGV4dE1hdGNoLndlYnZpZXdJbmRleCA9IGluZGV4O1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGV4dE1hdGNoO1xuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAoaW5wdXRNYXRjaGVzLmxlbmd0aCA+IDAgfHwgb3V0cHV0TWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjZWxsTWF0Y2g6IElOb3RlYm9va0NlbGxNYXRjaE5vTW9kZWwgPSB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiBpbmRleCxcblx0XHRcdFx0XHRcdFx0Y29udGVudFJlc3VsdHM6IGdlbmVyaWNDZWxsTWF0Y2hlc1RvVGV4dFNlYXJjaE1hdGNoZXMoaW5wdXRNYXRjaGVzLCBjZWxsTW9kZWwuaW5wdXRUZXh0QnVmZmVyKSxcblx0XHRcdFx0XHRcdFx0d2Vidmlld1Jlc3VsdHNcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRjZWxsTWF0Y2hlcy5wdXNoKGNlbGxNYXRjaCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBmaWxlTWF0Y2ggPSB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHVyaSwgY2VsbFJlc3VsdHM6IGNlbGxNYXRjaGVzXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJlc3VsdHMuc2V0KHVyaSwgZmlsZU1hdGNoKTtcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaW1pdEhpdCxcblx0XHRcdHJlc3VsdHM6IFsuLi5yZXN1bHRzLnZhbHVlcygpXVxuXHRcdH07XG5cdH1cblxuXG5cblx0cHJpdmF0ZSBhc3luYyBfdmFsaWRhdGVXcml0ZUZpbGUodXJpOiBVUkksIG9wdGlvbnM6IGZpbGVzLklXcml0ZUZpbGVPcHRpb25zKSB7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2V4dEhvc3RGaWxlU3lzdGVtLnZhbHVlLnN0YXQodXJpKTtcblx0XHQvLyBEaXJ0eSB3cml0ZSBwcmV2ZW50aW9uXG5cdFx0aWYgKFxuXHRcdFx0dHlwZW9mIG9wdGlvbnM/Lm10aW1lID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygb3B0aW9ucy5ldGFnID09PSAnc3RyaW5nJyAmJiBvcHRpb25zLmV0YWcgIT09IGZpbGVzLkVUQUdfRElTQUJMRUQgJiZcblx0XHRcdHR5cGVvZiBzdGF0Lm10aW1lID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc3RhdC5zaXplID09PSAnbnVtYmVyJyAmJlxuXHRcdFx0b3B0aW9ucy5tdGltZSA8IHN0YXQubXRpbWUgJiYgb3B0aW9ucy5ldGFnICE9PSBmaWxlcy5ldGFnKHsgbXRpbWU6IG9wdGlvbnMubXRpbWUgLyogbm90IHVzaW5nIHN0YXQubXRpbWUgZm9yIGEgcmVhc29uLCBzZWUgYWJvdmUgKi8sIHNpemU6IHN0YXQuc2l6ZSB9KVxuXHRcdCkge1xuXHRcdFx0dGhyb3cgbmV3IGZpbGVzLkZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZU1vZGlmaWVkRXJyb3InLCBcIkZpbGUgTW9kaWZpZWQgU2luY2VcIiksIGZpbGVzLkZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb3VyY2VGb3JFcnJvcih1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHVyaS5mc1BhdGggOiB1cmkudG9TdHJpbmcoKTtcblx0fVxuXG5cdC8vIC0tLSBvcGVuLCBzYXZlLCBzYXZlQXMsIGJhY2t1cFxuXG5cblx0cHJpdmF0ZSBfY3JlYXRlRXh0SG9zdEVkaXRvcihkb2N1bWVudDogRXh0SG9zdE5vdGVib29rRG9jdW1lbnQsIGVkaXRvcklkOiBzdHJpbmcsIGRhdGE6IElOb3RlYm9va0VkaXRvckFkZERhdGEpIHtcblxuXHRcdGlmICh0aGlzLl9lZGl0b3JzLmhhcyhlZGl0b3JJZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgZWRpdG9yIHdpdGggaWQgQUxSRUFEWSBFWFNJU1Q6ICR7ZWRpdG9ySWR9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gbmV3IEV4dEhvc3ROb3RlYm9va0VkaXRvcihcblx0XHRcdGVkaXRvcklkLFxuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JzUHJveHksXG5cdFx0XHRkb2N1bWVudCxcblx0XHRcdGRhdGEudmlzaWJsZVJhbmdlcy5tYXAodHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tSYW5nZS50byksXG5cdFx0XHRkYXRhLnNlbGVjdGlvbnMubWFwKHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rUmFuZ2UudG8pLFxuXHRcdFx0dHlwZW9mIGRhdGEudmlld0NvbHVtbiA9PT0gJ251bWJlcicgPyB0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLnRvKGRhdGEudmlld0NvbHVtbikgOiB1bmRlZmluZWQsXG5cdFx0XHRkYXRhLnZpZXdUeXBlXG5cdFx0KTtcblxuXHRcdHRoaXMuX2VkaXRvcnMuc2V0KGVkaXRvcklkLCBlZGl0b3IpO1xuXHR9XG5cblx0JGFjY2VwdERvY3VtZW50QW5kRWRpdG9yc0RlbHRhKGRlbHRhOiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxJTm90ZWJvb2tEb2N1bWVudHNBbmRFZGl0b3JzRGVsdGE+KTogdm9pZCB7XG5cblx0XHRpZiAoZGVsdGEudmFsdWUucmVtb3ZlZERvY3VtZW50cykge1xuXHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgZGVsdGEudmFsdWUucmVtb3ZlZERvY3VtZW50cykge1xuXHRcdFx0XHRjb25zdCByZXZpdmVkVXJpID0gVVJJLnJldml2ZSh1cmkpO1xuXHRcdFx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXQocmV2aXZlZFVyaSk7XG5cblx0XHRcdFx0aWYgKGRvY3VtZW50KSB7XG5cdFx0XHRcdFx0ZG9jdW1lbnQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2RvY3VtZW50cy5kZWxldGUocmV2aXZlZFVyaSk7XG5cdFx0XHRcdFx0dGhpcy5fdGV4dERvY3VtZW50c0FuZEVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7IHJlbW92ZWREb2N1bWVudHM6IGRvY3VtZW50LmFwaU5vdGVib29rLmdldENlbGxzKCkubWFwKGNlbGwgPT4gY2VsbC5kb2N1bWVudC51cmkpIH0pO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xvc2VOb3RlYm9va0RvY3VtZW50LmZpcmUoZG9jdW1lbnQuYXBpTm90ZWJvb2spO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5fZWRpdG9ycy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdGlmIChlZGl0b3Iubm90ZWJvb2tEYXRhLnVyaS50b1N0cmluZygpID09PSByZXZpdmVkVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcnMuZGVsZXRlKGVkaXRvci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLnZhbHVlLmFkZGVkRG9jdW1lbnRzKSB7XG5cblx0XHRcdGNvbnN0IGFkZGVkQ2VsbERvY3VtZW50czogSU1vZGVsQWRkZWREYXRhW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBtb2RlbERhdGEgb2YgZGVsdGEudmFsdWUuYWRkZWREb2N1bWVudHMpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShtb2RlbERhdGEudXJpKTtcblxuXHRcdFx0XHRpZiAodGhpcy5fZG9jdW1lbnRzLmhhcyh1cmkpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBhZGRpbmcgRVhJU1RJTkcgbm90ZWJvb2sgJHt1cml9IGApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZG9jdW1lbnQgPSBuZXcgRXh0SG9zdE5vdGVib29rRG9jdW1lbnQoXG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tEb2N1bWVudHNQcm94eSxcblx0XHRcdFx0XHR0aGlzLl90ZXh0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0XHRcdFx0XHR0aGlzLl90ZXh0RG9jdW1lbnRzLFxuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRtb2RlbERhdGFcblx0XHRcdFx0KTtcblxuXHRcdFx0XHQvLyBhZGQgY2VsbCBkb2N1bWVudCBhcyB2c2NvZGUuVGV4dERvY3VtZW50XG5cdFx0XHRcdGFkZGVkQ2VsbERvY3VtZW50cy5wdXNoKC4uLm1vZGVsRGF0YS5jZWxscy5tYXAoY2VsbCA9PiBFeHRIb3N0Q2VsbC5hc01vZGVsQWRkRGF0YShjZWxsKSkpO1xuXG5cdFx0XHRcdHRoaXMuX2RvY3VtZW50cy5nZXQodXJpKT8uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9kb2N1bWVudHMuc2V0KHVyaSwgZG9jdW1lbnQpO1xuXHRcdFx0XHR0aGlzLl90ZXh0RG9jdW1lbnRzQW5kRWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHsgYWRkZWREb2N1bWVudHM6IGFkZGVkQ2VsbERvY3VtZW50cyB9KTtcblxuXHRcdFx0XHR0aGlzLl9vbkRpZE9wZW5Ob3RlYm9va0RvY3VtZW50LmZpcmUoZG9jdW1lbnQuYXBpTm90ZWJvb2spO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS52YWx1ZS5hZGRlZEVkaXRvcnMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yTW9kZWxEYXRhIG9mIGRlbHRhLnZhbHVlLmFkZGVkRWRpdG9ycykge1xuXHRcdFx0XHRpZiAodGhpcy5fZWRpdG9ycy5oYXMoZWRpdG9yTW9kZWxEYXRhLmlkKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJldml2ZWRVcmkgPSBVUkkucmV2aXZlKGVkaXRvck1vZGVsRGF0YS5kb2N1bWVudFVyaSk7XG5cdFx0XHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZG9jdW1lbnRzLmdldChyZXZpdmVkVXJpKTtcblxuXHRcdFx0XHRpZiAoZG9jdW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLl9jcmVhdGVFeHRIb3N0RWRpdG9yKGRvY3VtZW50LCBlZGl0b3JNb2RlbERhdGEuaWQsIGVkaXRvck1vZGVsRGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZW1vdmVkRWRpdG9yczogRXh0SG9zdE5vdGVib29rRWRpdG9yW10gPSBbXTtcblxuXHRcdGlmIChkZWx0YS52YWx1ZS5yZW1vdmVkRWRpdG9ycykge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3JpZCBvZiBkZWx0YS52YWx1ZS5yZW1vdmVkRWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JzLmdldChlZGl0b3JpZCk7XG5cblx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvcnMuZGVsZXRlKGVkaXRvcmlkKTtcblxuXHRcdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVOb3RlYm9va0VkaXRvcj8uaWQgPT09IGVkaXRvci5pZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWN0aXZlTm90ZWJvb2tFZGl0b3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVtb3ZlZEVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLnZhbHVlLnZpc2libGVFZGl0b3JzKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlTm90ZWJvb2tFZGl0b3JzID0gZGVsdGEudmFsdWUudmlzaWJsZUVkaXRvcnMubWFwKGlkID0+IHRoaXMuX2VkaXRvcnMuZ2V0KGlkKSEpLmZpbHRlcihlZGl0b3IgPT4gISFlZGl0b3IpIGFzIEV4dEhvc3ROb3RlYm9va0VkaXRvcltdO1xuXHRcdFx0Y29uc3QgdmlzaWJsZUVkaXRvcnNTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdHRoaXMuX3Zpc2libGVOb3RlYm9va0VkaXRvcnMuZm9yRWFjaChlZGl0b3IgPT4gdmlzaWJsZUVkaXRvcnNTZXQuYWRkKGVkaXRvci5pZCkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLl9lZGl0b3JzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gdmlzaWJsZUVkaXRvcnNTZXQuaGFzKGVkaXRvci5pZCk7XG5cdFx0XHRcdGVkaXRvci5fYWNjZXB0VmlzaWJpbGl0eShuZXdWYWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3Zpc2libGVOb3RlYm9va0VkaXRvcnMgPSBbLi4udGhpcy5fZWRpdG9ycy52YWx1ZXMoKV0ubWFwKGUgPT4gZSkuZmlsdGVyKGUgPT4gZS52aXNpYmxlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJsZU5vdGVib29rRWRpdG9ycy5maXJlKHRoaXMudmlzaWJsZU5vdGVib29rRWRpdG9ycyk7XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLnZhbHVlLm5ld0FjdGl2ZUVkaXRvciA9PT0gbnVsbCkge1xuXHRcdFx0Ly8gY2xlYXIgYWN0aXZlIG5vdGVib29rIGFzIGN1cnJlbnQgYWN0aXZlIGVkaXRvciBpcyBub24tbm90ZWJvb2sgZWRpdG9yXG5cdFx0XHR0aGlzLl9hY3RpdmVOb3RlYm9va0VkaXRvciA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKGRlbHRhLnZhbHVlLm5ld0FjdGl2ZUVkaXRvcikge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5fZWRpdG9ycy5nZXQoZGVsdGEudmFsdWUubmV3QWN0aXZlRWRpdG9yKTtcblx0XHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYEZBSUxFRCB0byBmaW5kIGFjdGl2ZSBub3RlYm9vayBlZGl0b3IgJHtkZWx0YS52YWx1ZS5uZXdBY3RpdmVFZGl0b3J9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3RpdmVOb3RlYm9va0VkaXRvciA9IHRoaXMuX2VkaXRvcnMuZ2V0KGRlbHRhLnZhbHVlLm5ld0FjdGl2ZUVkaXRvcik7XG5cdFx0fVxuXHRcdGlmIChkZWx0YS52YWx1ZS5uZXdBY3RpdmVFZGl0b3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVOb3RlYm9va0VkaXRvci5maXJlKHRoaXMuX2FjdGl2ZU5vdGVib29rRWRpdG9yPy5hcGlFZGl0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWdpc3RlckFwaUNvbW1hbmRzKGV4dEhvc3RDb21tYW5kczogRXh0SG9zdENvbW1hbmRzKSB7XG5cblx0XHRjb25zdCBub3RlYm9va1R5cGVBcmcgPSBBcGlDb21tYW5kQXJndW1lbnQuU3RyaW5nLndpdGgoJ25vdGVib29rVHlwZScsICdBIG5vdGVib29rIHR5cGUnKTtcblxuXHRcdGNvbnN0IGNvbW1hbmREYXRhVG9Ob3RlYm9vayA9IG5ldyBBcGlDb21tYW5kKFxuXHRcdFx0J3ZzY29kZS5leGVjdXRlRGF0YVRvTm90ZWJvb2snLCAnX2V4ZWN1dGVEYXRhVG9Ob3RlYm9vaycsICdJbnZva2Ugbm90ZWJvb2sgc2VyaWFsaXplcicsXG5cdFx0XHRbbm90ZWJvb2tUeXBlQXJnLCBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PFVpbnQ4QXJyYXksIFZTQnVmZmVyPignZGF0YScsICdCeXRlcyB0byBjb252ZXJ0IHRvIGRhdGEnLCB2ID0+IHYgaW5zdGFuY2VvZiBVaW50OEFycmF5LCB2ID0+IFZTQnVmZmVyLndyYXAodikpXSxcblx0XHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPE5vdGVib29rRGF0YUR0bz4sIHZzY29kZS5Ob3RlYm9va0RhdGE+KCdOb3RlYm9vayBEYXRhJywgZGF0YSA9PiB0eXBlQ29udmVydGVycy5Ob3RlYm9va0RhdGEudG8oZGF0YS52YWx1ZSkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNvbW1hbmROb3RlYm9va1RvRGF0YSA9IG5ldyBBcGlDb21tYW5kKFxuXHRcdFx0J3ZzY29kZS5leGVjdXRlTm90ZWJvb2tUb0RhdGEnLCAnX2V4ZWN1dGVOb3RlYm9va1RvRGF0YScsICdJbnZva2Ugbm90ZWJvb2sgc2VyaWFsaXplcicsXG5cdFx0XHRbbm90ZWJvb2tUeXBlQXJnLCBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHZzY29kZS5Ob3RlYm9va0RhdGEsIFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPE5vdGVib29rRGF0YUR0bz4+KCdOb3RlYm9va0RhdGEnLCAnTm90ZWJvb2sgZGF0YSB0byBjb252ZXJ0IHRvIGJ5dGVzJywgdiA9PiB0cnVlLCB2ID0+IG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh0eXBlQ29udmVydGVycy5Ob3RlYm9va0RhdGEuZnJvbSh2KSkpXSxcblx0XHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PFZTQnVmZmVyLCBVaW50OEFycmF5PignQnl0ZXMnLCBkdG8gPT4gZHRvLmJ1ZmZlcilcblx0XHQpO1xuXG5cdFx0ZXh0SG9zdENvbW1hbmRzLnJlZ2lzdGVyQXBpQ29tbWFuZChjb21tYW5kRGF0YVRvTm90ZWJvb2spO1xuXHRcdGV4dEhvc3RDb21tYW5kcy5yZWdpc3RlckFwaUNvbW1hbmQoY29tbWFuZE5vdGVib29rVG9EYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgdHJhY2UobXNnOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbRXh0ZW5zaW9uIEhvc3QgTm90ZWJvb2tdICR7bXNnfWApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va1NhdmVFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdFx0dGhpcy5uYW1lID0gJ05vdGVib29rU2F2ZUVycm9yJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxlQUFzQjtBQUUvQixTQUFTLGlCQUE4QixvQkFBb0I7QUFDM0QsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBRWxDLFlBQVksV0FBVztBQUN2QixTQUFTLGFBQWE7QUFDdEIsU0FBNk4sbUJBQStIO0FBQzVWLFNBQVMsWUFBWSxvQkFBb0Isd0JBQTREO0FBR3JHLFlBQVksb0JBQW9CO0FBQ2hDLFlBQVksa0JBQWtCO0FBRTlCLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsYUFB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QzlKO0FBRUEsVUFBTSx3QkFBd0IsSUFBSTtBQUFBLE1BQ2pDO0FBQUEsTUFBZ0M7QUFBQSxNQUEwQjtBQUFBLE1BQzFELENBQUMsaUJBQWlCLElBQUksbUJBQXdGLGdCQUFnQixxQ0FBcUMsT0FBSyxNQUFNLE9BQUssSUFBSSw4QkFBOEIsZUFBZSxhQUFhLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQzFQLElBQUksaUJBQXVDLFNBQVMsU0FBTyxJQUFJLE1BQU07QUFBQSxJQUN0RTtBQUVBLG9CQUFnQixtQkFBbUIscUJBQXFCO0FBQ3hELG9CQUFnQixtQkFBbUIscUJBQXFCO0FBQUEsRUFDekQ7QUFBQSxFQUVRLE1BQU0sS0FBbUI7QUFDaEMsU0FBSyxZQUFZLE1BQU0sNkJBQTZCLEdBQUcsRUFBRTtBQUFBLEVBQzFEO0FBQ0Q7QUFqc0JhLDJCQUNHLDJDQUFtRDtBQUQ1RCxJQUFNLDRCQUFOO0FBbXNCQSxNQUFNLDBCQUEwQixNQUFNO0FBQUEsRUFDNUMsWUFBWSxTQUFpQjtBQUM1QixVQUFNLE9BQU87QUFDYixTQUFLLE9BQU87QUFBQSxFQUNiO0FBQ0Q7IiwKICAibmFtZXMiOiBbInRva2VuIiwgInRleHRRdWVyeSIsICJub3RlYm9vayIsICJpbmRleCJdCn0K
