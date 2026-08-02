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
import { localize } from "../../../../nls.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { getFileNamesMessage, IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ByteSize, FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IExplorerService } from "./files.js";
import { UndoConfirmLevel, VIEW_ID } from "../common/files.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Limiter, Promises, RunOnceWorker } from "../../../../base/common/async.js";
import { newWriteableBufferStream, VSBuffer } from "../../../../base/common/buffer.js";
import { basename, dirname, joinPath } from "../../../../base/common/resources.js";
import { ResourceFileEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { ExplorerItem } from "../common/explorerModel.js";
import { URI } from "../../../../base/common/uri.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { extractEditorsAndFilesDropData } from "../../../../platform/dnd/browser/dnd.js";
import { IWorkspaceEditingService } from "../../../services/workspaces/common/workspaceEditing.js";
import { isWeb } from "../../../../base/common/platform.js";
import { getActiveWindow, isDragEvent, triggerDownload } from "../../../../base/browser/dom.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { listenStream } from "../../../../base/common/stream.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { canceled } from "../../../../base/common/errors.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { WebFileSystemAccess } from "../../../../platform/files/browser/webFileSystemAccess.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
let BrowserFileUpload = class {
  constructor(progressService, dialogService, explorerService, editorService, fileService) {
    this.progressService = progressService;
    this.dialogService = dialogService;
    this.explorerService = explorerService;
    this.editorService = editorService;
    this.fileService = fileService;
  }
  upload(target, source) {
    const cts = new CancellationTokenSource();
    const uploadPromise = this.progressService.withProgress(
      {
        location: ProgressLocation.Window,
        delay: 800,
        cancellable: true,
        title: localize("uploadingFiles", "Uploading")
      },
      async (progress) => this.doUpload(target, this.toTransfer(source), progress, cts.token),
      () => cts.dispose(true)
    );
    this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => uploadPromise);
    return uploadPromise;
  }
  toTransfer(source) {
    if (isDragEvent(source)) {
      return source.dataTransfer;
    }
    const transfer = { items: [] };
    for (const file of source) {
      transfer.items.push({
        webkitGetAsEntry: () => {
          return {
            name: file.name,
            isDirectory: false,
            isFile: true,
            createReader: () => {
              throw new Error("Unsupported for files");
            },
            file: (resolve) => resolve(file)
          };
        }
      });
    }
    return transfer;
  }
  async doUpload(target, source, progress, token) {
    const items = source.items;
    const entries = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
      }
    }
    const results = [];
    const operation = {
      startTime: Date.now(),
      progressScheduler: new RunOnceWorker((steps) => {
        progress.report(steps[steps.length - 1]);
      }, 1e3),
      filesTotal: entries.length,
      filesUploaded: 0,
      totalBytesUploaded: 0
    };
    const uploadLimiter = new Limiter(BrowserFileUpload.MAX_PARALLEL_UPLOADS);
    await Promises.settled(entries.map((entry) => {
      return uploadLimiter.queue(async () => {
        if (token.isCancellationRequested) {
          return;
        }
        if (target && entry.name && target.getChild(entry.name)) {
          const { confirmed } = await this.dialogService.confirm(getFileOverwriteConfirm(entry.name));
          if (!confirmed) {
            return;
          }
          await this.explorerService.applyBulkEdit([new ResourceFileEdit(joinPath(target.resource, entry.name), void 0, { recursive: true, folder: target.getChild(entry.name)?.isDirectory })], {
            undoLabel: localize("overwrite", "Overwrite {0}", entry.name),
            progressLabel: localize("overwriting", "Overwriting {0}", entry.name)
          });
          if (token.isCancellationRequested) {
            return;
          }
        }
        const result = await this.doUploadEntry(entry, target.resource, target, progress, operation, token);
        if (result) {
          results.push(result);
        }
      });
    }));
    operation.progressScheduler.dispose();
    const firstUploadedFile = results[0];
    if (!token.isCancellationRequested && firstUploadedFile?.isFile) {
      await this.editorService.openEditor({ resource: firstUploadedFile.resource, options: { pinned: true } });
    }
  }
  async doUploadEntry(entry, parentResource, target, progress, operation, token) {
    if (token.isCancellationRequested || !entry.name || !entry.isFile && !entry.isDirectory) {
      return void 0;
    }
    let fileBytesUploaded = 0;
    const reportProgress = (fileSize, bytesUploaded) => {
      fileBytesUploaded += bytesUploaded;
      operation.totalBytesUploaded += bytesUploaded;
      const bytesUploadedPerSecond = operation.totalBytesUploaded / ((Date.now() - operation.startTime) / 1e3);
      let message;
      if (fileSize < ByteSize.MB) {
        if (operation.filesTotal === 1) {
          message = `${entry.name}`;
        } else {
          message = localize("uploadProgressSmallMany", "{0} of {1} files ({2}/s)", operation.filesUploaded, operation.filesTotal, ByteSize.formatSize(bytesUploadedPerSecond));
        }
      } else {
        message = localize("uploadProgressLarge", "{0} ({1} of {2}, {3}/s)", entry.name, ByteSize.formatSize(fileBytesUploaded), ByteSize.formatSize(fileSize), ByteSize.formatSize(bytesUploadedPerSecond));
      }
      operation.progressScheduler.work({ message });
    };
    operation.filesUploaded++;
    reportProgress(0, 0);
    const resource = joinPath(parentResource, entry.name);
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (typeof file.stream === "function" && file.size > ByteSize.MB) {
        await this.doUploadFileBuffered(resource, file, reportProgress, token);
      } else {
        await this.doUploadFileUnbuffered(resource, file, reportProgress);
      }
      return { isFile: true, resource };
    } else {
      await this.fileService.createFolder(resource);
      if (token.isCancellationRequested) {
        return void 0;
      }
      const dirReader = entry.createReader();
      const childEntries = [];
      let done = false;
      do {
        const childEntriesChunk = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
        if (childEntriesChunk.length > 0) {
          childEntries.push(...childEntriesChunk);
        } else {
          done = true;
        }
      } while (!done && !token.isCancellationRequested);
      operation.filesTotal += childEntries.length;
      const folderTarget = target?.getChild(entry.name) || void 0;
      const fileChildEntries = [];
      const folderChildEntries = [];
      for (const childEntry of childEntries) {
        if (childEntry.isFile) {
          fileChildEntries.push(childEntry);
        } else if (childEntry.isDirectory) {
          folderChildEntries.push(childEntry);
        }
      }
      const fileUploadQueue = new Limiter(BrowserFileUpload.MAX_PARALLEL_UPLOADS);
      await Promises.settled(fileChildEntries.map((fileChildEntry) => {
        return fileUploadQueue.queue(() => this.doUploadEntry(fileChildEntry, resource, folderTarget, progress, operation, token));
      }));
      for (const folderChildEntry of folderChildEntries) {
        await this.doUploadEntry(folderChildEntry, resource, folderTarget, progress, operation, token);
      }
      return { isFile: false, resource };
    }
  }
  async doUploadFileBuffered(resource, file, progressReporter, token) {
    const writeableStream = newWriteableBufferStream({
      // Set a highWaterMark to prevent the stream
      // for file upload to produce large buffers
      // in-memory
      highWaterMark: 10
    });
    const writeFilePromise = this.fileService.writeFile(resource, writeableStream);
    try {
      const reader = file.stream().getReader();
      let res = await reader.read();
      while (!res.done) {
        if (token.isCancellationRequested) {
          break;
        }
        const buffer = VSBuffer.wrap(res.value);
        await writeableStream.write(buffer);
        if (token.isCancellationRequested) {
          break;
        }
        progressReporter(file.size, buffer.byteLength);
        res = await reader.read();
      }
      writeableStream.end(void 0);
    } catch (error) {
      writeableStream.error(error);
      writeableStream.end();
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    await writeFilePromise;
  }
  doUploadFileUnbuffered(resource, file, progressReporter) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          if (event.target?.result instanceof ArrayBuffer) {
            const buffer = VSBuffer.wrap(new Uint8Array(event.target.result));
            await this.fileService.writeFile(resource, buffer);
            progressReporter(file.size, buffer.byteLength);
          } else {
            throw new Error("Could not read from dropped file.");
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
};
BrowserFileUpload.MAX_PARALLEL_UPLOADS = 20;
BrowserFileUpload = __decorateClass([
  __decorateParam(0, IProgressService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IExplorerService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IFileService)
], BrowserFileUpload);
let ExternalFileImport = class {
  constructor(fileService, hostService, contextService, configurationService, dialogService, workspaceEditingService, explorerService, editorService, progressService, notificationService, instantiationService) {
    this.fileService = fileService;
    this.hostService = hostService;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.workspaceEditingService = workspaceEditingService;
    this.explorerService = explorerService;
    this.editorService = editorService;
    this.progressService = progressService;
    this.notificationService = notificationService;
    this.instantiationService = instantiationService;
  }
  async import(target, source, targetWindow) {
    const cts = new CancellationTokenSource();
    const importPromise = this.progressService.withProgress(
      {
        location: ProgressLocation.Window,
        delay: 800,
        cancellable: true,
        title: localize("copyingFiles", "Copying...")
      },
      async () => await this.doImport(target, source, targetWindow, cts.token),
      () => cts.dispose(true)
    );
    this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => importPromise);
    return importPromise;
  }
  async doImport(target, source, targetWindow, token) {
    const candidateFiles = coalesce((await this.instantiationService.invokeFunction((accessor) => extractEditorsAndFilesDropData(accessor, source))).map((editor) => editor.resource));
    await Promise.all(candidateFiles.map((resource) => this.fileService.activateProvider(resource.scheme)));
    const files = coalesce(candidateFiles.filter((resource) => this.fileService.hasProvider(resource)));
    const resolvedFiles = await this.fileService.resolveAll(files.map((file) => ({ resource: file })));
    if (token.isCancellationRequested) {
      return;
    }
    this.hostService.focus(targetWindow);
    const folders = resolvedFiles.filter((resolvedFile) => resolvedFile.success && resolvedFile.stat?.isDirectory).map((resolvedFile) => ({ uri: resolvedFile.stat.resource }));
    if (folders.length > 0 && target.isRoot) {
      let ImportChoice;
      ((ImportChoice2) => {
        ImportChoice2[ImportChoice2["Copy"] = 1] = "Copy";
        ImportChoice2[ImportChoice2["Add"] = 2] = "Add";
      })(ImportChoice || (ImportChoice = {}));
      const buttons = [
        {
          label: folders.length > 1 ? localize("copyFolders", "&&Copy Folders") : localize("copyFolder", "&&Copy Folder"),
          run: () => 1 /* Copy */
        }
      ];
      let message;
      const workspaceFolderSchemas = this.contextService.getWorkspace().folders.map((folder) => folder.uri.scheme);
      if (folders.some((folder) => workspaceFolderSchemas.indexOf(folder.uri.scheme) >= 0)) {
        buttons.unshift({
          label: folders.length > 1 ? localize("addFolders", "&&Add Folders to Workspace") : localize("addFolder", "&&Add Folder to Workspace"),
          run: () => 2 /* Add */
        });
        message = folders.length > 1 ? localize("dropFolders", "Do you want to copy the folders or add the folders to the workspace?") : localize("dropFolder", "Do you want to copy '{0}' or add '{0}' as a folder to the workspace?", basename(folders[0].uri));
      } else {
        message = folders.length > 1 ? localize("copyfolders", "Are you sure to want to copy folders?") : localize("copyfolder", "Are you sure to want to copy '{0}'?", basename(folders[0].uri));
      }
      const { result } = await this.dialogService.prompt({
        type: Severity.Info,
        message,
        buttons,
        cancelButton: true
      });
      if (result === 2 /* Add */) {
        return this.workspaceEditingService.addFolders(folders);
      }
      if (result === 1 /* Copy */) {
        return this.importResources(target, files, token);
      }
    } else if (target instanceof ExplorerItem) {
      return this.importResources(target, files, token);
    }
  }
  async importResources(target, resources, token) {
    if (resources && resources.length > 0) {
      const targetStat = await this.fileService.resolve(target.resource);
      if (token.isCancellationRequested) {
        return;
      }
      const targetNames = /* @__PURE__ */ new Set();
      const caseSensitive = this.fileService.hasCapability(target.resource, FileSystemProviderCapabilities.PathCaseSensitive);
      if (targetStat.children) {
        targetStat.children.forEach((child) => {
          targetNames.add(caseSensitive ? child.name : child.name.toLowerCase());
        });
      }
      let inaccessibleFileCount = 0;
      const resourcesFiltered = coalesce(await Promises.settled(resources.map(async (resource) => {
        const fileDoesNotExist = !await this.fileService.exists(resource);
        if (fileDoesNotExist) {
          inaccessibleFileCount++;
          return void 0;
        }
        if (targetNames.has(caseSensitive ? basename(resource) : basename(resource).toLowerCase())) {
          const confirmationResult = await this.dialogService.confirm(getFileOverwriteConfirm(basename(resource)));
          if (!confirmationResult.confirmed) {
            return void 0;
          }
        }
        return resource;
      })));
      if (inaccessibleFileCount > 0) {
        this.notificationService.error(inaccessibleFileCount > 1 ? localize("filesInaccessible", "Some or all of the dropped files could not be accessed for import.") : localize("fileInaccessible", "The dropped file could not be accessed for import."));
      }
      const resourceFileEdits = resourcesFiltered.map((resource) => {
        const sourceFileName = basename(resource);
        const targetFile = joinPath(target.resource, sourceFileName);
        return new ResourceFileEdit(resource, targetFile, { overwrite: true, copy: true });
      });
      const undoLevel = this.configurationService.getValue().explorer.confirmUndo;
      await this.explorerService.applyBulkEdit(resourceFileEdits, {
        undoLabel: resourcesFiltered.length === 1 ? localize({ comment: ["substitution will be the name of the file that was imported"], key: "importFile" }, "Import {0}", basename(resourcesFiltered[0])) : localize({ comment: ["substitution will be the number of files that were imported"], key: "importnFile" }, "Import {0} resources", resourcesFiltered.length),
        progressLabel: resourcesFiltered.length === 1 ? localize({ comment: ["substitution will be the name of the file that was copied"], key: "copyingFile" }, "Copying {0}", basename(resourcesFiltered[0])) : localize({ comment: ["substitution will be the number of files that were copied"], key: "copyingnFile" }, "Copying {0} resources", resourcesFiltered.length),
        progressLocation: ProgressLocation.Window,
        confirmBeforeUndo: undoLevel === UndoConfirmLevel.Verbose || undoLevel === UndoConfirmLevel.Default
      });
      const autoOpen = this.configurationService.getValue().explorer.autoOpenDroppedFile;
      if (autoOpen && resourceFileEdits.length === 1) {
        const item = this.explorerService.findClosest(resourceFileEdits[0].newResource);
        if (item && !item.isDirectory) {
          this.editorService.openEditor({ resource: item.resource, options: { pinned: true } });
        }
      }
    }
  }
};
ExternalFileImport = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IHostService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IWorkspaceEditingService),
  __decorateParam(6, IExplorerService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IProgressService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IInstantiationService)
], ExternalFileImport);
let FileDownload = class {
  constructor(fileService, explorerService, progressService, logService, fileDialogService, storageService) {
    this.fileService = fileService;
    this.explorerService = explorerService;
    this.progressService = progressService;
    this.logService = logService;
    this.fileDialogService = fileDialogService;
    this.storageService = storageService;
  }
  download(source) {
    const cts = new CancellationTokenSource();
    const downloadPromise = this.progressService.withProgress(
      {
        location: ProgressLocation.Window,
        delay: 800,
        cancellable: isWeb,
        title: localize("downloadingFiles", "Downloading")
      },
      async (progress) => this.doDownload(source, progress, cts),
      () => cts.dispose(true)
    );
    this.progressService.withProgress({ location: VIEW_ID, delay: 500 }, () => downloadPromise);
    return downloadPromise;
  }
  async doDownload(sources, progress, cts) {
    for (const source of sources) {
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (isWeb) {
        await this.doDownloadBrowser(source.resource, progress, cts);
      } else {
        await this.doDownloadNative(source, progress, cts);
      }
    }
  }
  async doDownloadBrowser(resource, progress, cts) {
    const stat = await this.fileService.resolve(resource, { resolveMetadata: true });
    if (cts.token.isCancellationRequested) {
      return;
    }
    const maxBlobDownloadSize = 32 * ByteSize.MB;
    const preferFileSystemAccessWebApis = stat.isDirectory || stat.size > maxBlobDownloadSize;
    const activeWindow = getActiveWindow();
    if (preferFileSystemAccessWebApis && WebFileSystemAccess.supported(activeWindow)) {
      try {
        const parentFolder = await activeWindow.showDirectoryPicker();
        const operation = {
          startTime: Date.now(),
          progressScheduler: new RunOnceWorker((steps) => {
            progress.report(steps[steps.length - 1]);
          }, 1e3),
          filesTotal: stat.isDirectory ? 0 : 1,
          // folders increment filesTotal within downloadFolder method
          filesDownloaded: 0,
          totalBytesDownloaded: 0,
          fileBytesDownloaded: 0
        };
        if (stat.isDirectory) {
          const targetFolder = await parentFolder.getDirectoryHandle(stat.name, { create: true });
          await this.downloadFolderBrowser(stat, targetFolder, operation, cts.token);
        } else {
          await this.downloadFileBrowser(parentFolder, stat, operation, cts.token);
        }
        operation.progressScheduler.dispose();
      } catch (error) {
        this.logService.warn(error);
        cts.cancel();
      }
    } else if (stat.isFile) {
      let bufferOrUri;
      try {
        bufferOrUri = (await this.fileService.readFile(stat.resource, { limits: { size: maxBlobDownloadSize } }, cts.token)).value.buffer;
      } catch (error) {
        bufferOrUri = FileAccess.uriToBrowserUri(stat.resource);
      }
      if (!cts.token.isCancellationRequested) {
        triggerDownload(bufferOrUri, stat.name);
      }
    }
  }
  async downloadFileBufferedBrowser(resource, target, operation, token) {
    const contents = await this.fileService.readFileStream(resource, void 0, token);
    if (token.isCancellationRequested) {
      target.close();
      return;
    }
    return new Promise((resolve, reject) => {
      const sourceStream = contents.value;
      const disposables = new DisposableStore();
      disposables.add(toDisposable(() => target.close()));
      disposables.add(createSingleCallFunction(token.onCancellationRequested)(() => {
        disposables.dispose();
        reject(canceled());
      }));
      listenStream(sourceStream, {
        onData: (data) => {
          target.write(data.buffer);
          this.reportProgress(contents.name, contents.size, data.byteLength, operation);
        },
        onError: (error) => {
          disposables.dispose();
          reject(error);
        },
        onEnd: () => {
          disposables.dispose();
          resolve();
        }
      }, token);
    });
  }
  async downloadFileUnbufferedBrowser(resource, target, operation, token) {
    const contents = await this.fileService.readFile(resource, void 0, token);
    if (!token.isCancellationRequested) {
      target.write(contents.value.buffer);
      this.reportProgress(contents.name, contents.size, contents.value.byteLength, operation);
    }
    target.close();
  }
  async downloadFileBrowser(targetFolder, file, operation, token) {
    operation.filesDownloaded++;
    operation.fileBytesDownloaded = 0;
    this.reportProgress(file.name, 0, 0, operation);
    const targetFile = await targetFolder.getFileHandle(file.name, { create: true });
    const targetFileWriter = await targetFile.createWritable();
    if (file.size > ByteSize.MB) {
      return this.downloadFileBufferedBrowser(file.resource, targetFileWriter, operation, token);
    }
    return this.downloadFileUnbufferedBrowser(file.resource, targetFileWriter, operation, token);
  }
  async downloadFolderBrowser(folder, targetFolder, operation, token) {
    if (folder.children) {
      operation.filesTotal += folder.children.map((child) => child.isFile).length;
      for (const child of folder.children) {
        if (token.isCancellationRequested) {
          return;
        }
        if (child.isFile) {
          await this.downloadFileBrowser(targetFolder, child, operation, token);
        } else {
          const childFolder = await targetFolder.getDirectoryHandle(child.name, { create: true });
          const resolvedChildFolder = await this.fileService.resolve(child.resource, { resolveMetadata: true });
          await this.downloadFolderBrowser(resolvedChildFolder, childFolder, operation, token);
        }
      }
    }
  }
  reportProgress(name, fileSize, bytesDownloaded, operation) {
    operation.fileBytesDownloaded += bytesDownloaded;
    operation.totalBytesDownloaded += bytesDownloaded;
    const bytesDownloadedPerSecond = operation.totalBytesDownloaded / ((Date.now() - operation.startTime) / 1e3);
    let message;
    if (fileSize < ByteSize.MB) {
      if (operation.filesTotal === 1) {
        message = name;
      } else {
        message = localize("downloadProgressSmallMany", "{0} of {1} files ({2}/s)", operation.filesDownloaded, operation.filesTotal, ByteSize.formatSize(bytesDownloadedPerSecond));
      }
    } else {
      message = localize("downloadProgressLarge", "{0} ({1} of {2}, {3}/s)", name, ByteSize.formatSize(operation.fileBytesDownloaded), ByteSize.formatSize(fileSize), ByteSize.formatSize(bytesDownloadedPerSecond));
    }
    operation.progressScheduler.work({ message });
  }
  async doDownloadNative(explorerItem, progress, cts) {
    progress.report({ message: explorerItem.name });
    let defaultUri;
    const lastUsedDownloadPath = this.storageService.get(FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY, StorageScope.APPLICATION);
    if (lastUsedDownloadPath) {
      defaultUri = joinPath(URI.file(lastUsedDownloadPath), explorerItem.name);
    } else {
      defaultUri = joinPath(
        explorerItem.isDirectory ? await this.fileDialogService.defaultFolderPath(Schemas.file) : await this.fileDialogService.defaultFilePath(Schemas.file),
        explorerItem.name
      );
    }
    const destination = await this.fileDialogService.showSaveDialog({
      availableFileSystems: [Schemas.file],
      saveLabel: localize("downloadButton", "Download"),
      title: localize("chooseWhereToDownload", "Choose Where to Download"),
      defaultUri
    });
    if (destination) {
      this.storageService.store(FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY, dirname(destination).fsPath, StorageScope.APPLICATION, StorageTarget.MACHINE);
      await this.explorerService.applyBulkEdit([new ResourceFileEdit(explorerItem.resource, destination, { overwrite: true, copy: true })], {
        undoLabel: localize("downloadBulkEdit", "Download {0}", explorerItem.name),
        progressLabel: localize("downloadingBulkEdit", "Downloading {0}", explorerItem.name),
        progressLocation: ProgressLocation.Window
      });
    } else {
      cts.cancel();
    }
  }
};
FileDownload.LAST_USED_DOWNLOAD_PATH_STORAGE_KEY = "workbench.explorer.downloadPath";
FileDownload = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IExplorerService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IStorageService)
], FileDownload);
function getFileOverwriteConfirm(name) {
  return {
    message: localize("confirmOverwrite", "A file or folder with the name '{0}' already exists in the destination folder. Do you want to replace it?", name),
    detail: localize("irreversible", "This action is irreversible!"),
    primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace"),
    type: "warning"
  };
}
function getMultipleFilesOverwriteConfirm(files) {
  if (files.length > 1) {
    return {
      message: localize("confirmManyOverwrites", "The following {0} files and/or folders already exist in the destination folder. Do you want to replace them?", files.length),
      detail: getFileNamesMessage(files) + "\n" + localize("irreversible", "This action is irreversible!"),
      primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace"),
      type: "warning"
    };
  }
  return getFileOverwriteConfirm(basename(files[0]));
}
export {
  BrowserFileUpload,
  ExternalFileImport,
  FileDownload,
  getFileOverwriteConfirm,
  getMultipleFilesOverwriteConfirm
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZmlsZUltcG9ydEV4cG9ydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRGaWxlTmFtZXNNZXNzYWdlLCBJQ29uZmlybWF0aW9uLCBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlLCBJUHJvbXB0QnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1N0ZXAsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvbiwgVW5kb0NvbmZpcm1MZXZlbCwgVklFV19JRCB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMaW1pdGVyLCBQcm9taXNlcywgUnVuT25jZVdvcmtlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFJlc291cmNlRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJJdGVtIH0gZnJvbSAnLi4vY29tbW9uL2V4cGxvcmVyTW9kZWwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGV4dHJhY3RFZGl0b3JzQW5kRmlsZXNEcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VFZGl0aW5nLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93LCBpc0RyYWdFdmVudCwgdHJpZ2dlckRvd25sb2FkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGxpc3RlblN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgV2ViRmlsZVN5c3RlbUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2Jyb3dzZXIvd2ViRmlsZVN5c3RlbUFjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbi8vI3JlZ2lvbiBCcm93c2VyIEZpbGUgVXBsb2FkIChkcmFnIGFuZCBkcm9wLCBpbnB1dCBlbGVtZW50KVxuXG5pbnRlcmZhY2UgSUJyb3dzZXJVcGxvYWRPcGVyYXRpb24ge1xuXHRzdGFydFRpbWU6IG51bWJlcjtcblx0cHJvZ3Jlc3NTY2hlZHVsZXI6IFJ1bk9uY2VXb3JrZXI8SVByb2dyZXNzU3RlcD47XG5cblx0ZmlsZXNUb3RhbDogbnVtYmVyO1xuXHRmaWxlc1VwbG9hZGVkOiBudW1iZXI7XG5cblx0dG90YWxCeXRlc1VwbG9hZGVkOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJV2Via2l0RGF0YVRyYW5zZmVyIHtcblx0aXRlbXM6IElXZWJraXREYXRhVHJhbnNmZXJJdGVtW107XG59XG5cbmludGVyZmFjZSBJV2Via2l0RGF0YVRyYW5zZmVySXRlbSB7XG5cdHdlYmtpdEdldEFzRW50cnkoKTogSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeSB8IG51bGw7XG59XG5cbmludGVyZmFjZSBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5IHtcblx0bmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpc0ZpbGU6IGJvb2xlYW47XG5cdGlzRGlyZWN0b3J5OiBib29sZWFuO1xuXG5cdGZpbGUocmVzb2x2ZTogKGZpbGU6IEZpbGUpID0+IHZvaWQsIHJlamVjdDogKCkgPT4gdm9pZCk6IHZvaWQ7XG5cdGNyZWF0ZVJlYWRlcigpOiBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5UmVhZGVyO1xufVxuXG5pbnRlcmZhY2UgSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeVJlYWRlciB7XG5cdHJlYWRFbnRyaWVzKHJlc29sdmU6IChmaWxlOiBJV2Via2l0RGF0YVRyYW5zZmVySXRlbUVudHJ5W10pID0+IHZvaWQsIHJlamVjdDogKCkgPT4gdm9pZCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyRmlsZVVwbG9hZCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX1BBUkFMTEVMX1VQTE9BRFMgPSAyMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGxvcmVyU2VydmljZTogSUV4cGxvcmVyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdHVwbG9hZCh0YXJnZXQ6IEV4cGxvcmVySXRlbSwgc291cmNlOiBEcmFnRXZlbnQgfCBGaWxlTGlzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Ly8gSW5kaWNhdGUgcHJvZ3Jlc3MgZ2xvYmFsbHlcblx0XHRjb25zdCB1cGxvYWRQcm9taXNlID0gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0e1xuXHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHRcdGRlbGF5OiA4MDAsXG5cdFx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3VwbG9hZGluZ0ZpbGVzJywgXCJVcGxvYWRpbmdcIilcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBwcm9ncmVzcyA9PiB0aGlzLmRvVXBsb2FkKHRhcmdldCwgdGhpcy50b1RyYW5zZmVyKHNvdXJjZSksIHByb2dyZXNzLCBjdHMudG9rZW4pLFxuXHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSlcblx0XHQpO1xuXG5cdFx0Ly8gQWxzbyBpbmRpY2F0ZSBwcm9ncmVzcyBpbiB0aGUgZmlsZXMgdmlld1xuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBWSUVXX0lELCBkZWxheTogNTAwIH0sICgpID0+IHVwbG9hZFByb21pc2UpO1xuXG5cdFx0cmV0dXJuIHVwbG9hZFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHRvVHJhbnNmZXIoc291cmNlOiBEcmFnRXZlbnQgfCBGaWxlTGlzdCk6IElXZWJraXREYXRhVHJhbnNmZXIge1xuXHRcdGlmIChpc0RyYWdFdmVudChzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gc291cmNlLmRhdGFUcmFuc2ZlciBhcyB1bmtub3duIGFzIElXZWJraXREYXRhVHJhbnNmZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJhbnNmZXI6IElXZWJraXREYXRhVHJhbnNmZXIgPSB7IGl0ZW1zOiBbXSB9O1xuXG5cdFx0Ly8gV2Ugd2FudCB0byByZXVzZSB0aGUgc2FtZSBjb2RlIGZvciB1cGxvYWRpbmcgZnJvbVxuXHRcdC8vIERyYWcgJiBEcm9wIGFzIHdlbGwgYXMgaW5wdXQgZWxlbWVudCBiYXNlZCB1cGxvYWRcblx0XHQvLyBzbyB3ZSBjb252ZXJ0IGludG8gd2Via2l0IGRhdGEgdHJhbnNmZXIgd2hlbiB0aGVcblx0XHQvLyBpbnB1dCBlbGVtZW50IGFwcHJvYWNoIGlzIHVzZWQgKHNpbXBsaWZpZWQpLlxuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBzb3VyY2UpIHtcblx0XHRcdHRyYW5zZmVyLml0ZW1zLnB1c2goe1xuXHRcdFx0XHR3ZWJraXRHZXRBc0VudHJ5OiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG5hbWU6IGZpbGUubmFtZSxcblx0XHRcdFx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdFx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGNyZWF0ZVJlYWRlcjogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIGZvciBmaWxlcycpOyB9LFxuXHRcdFx0XHRcdFx0ZmlsZTogcmVzb2x2ZSA9PiByZXNvbHZlKGZpbGUpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRyYW5zZmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VwbG9hZCh0YXJnZXQ6IEV4cGxvcmVySXRlbSwgc291cmNlOiBJV2Via2l0RGF0YVRyYW5zZmVyLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpdGVtcyA9IHNvdXJjZS5pdGVtcztcblxuXHRcdC8vIFNvbWVob3cgdGhlIGl0ZW1zIHRoaW5nIGlzIGJlaW5nIG1vZGlmaWVkIGF0IHJhbmRvbSwgbWF5YmUgYXMgYSBzZWN1cml0eVxuXHRcdC8vIG1lYXN1cmUgc2luY2UgdGhpcyBpcyBhIERORCBvcGVyYXRpb24uIEFzIHN1Y2gsIHdlIGNvcHkgdGhlIGl0ZW1zIGludG9cblx0XHQvLyBhbiBhcnJheSB3ZSBvd24gYXMgZWFybHkgYXMgcG9zc2libGUgYmVmb3JlIHVzaW5nIGl0LlxuXHRcdGNvbnN0IGVudHJpZXM6IElXZWJraXREYXRhVHJhbnNmZXJJdGVtRW50cnlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0Ly8gYHdlYmtpdEdldEFzRW50cnkoKWAgcmV0dXJucyBgbnVsbGAgZm9yIGRhdGEgdHJhbnNmZXIgaXRlbXMgdGhhdFxuXHRcdFx0Ly8gZG8gbm90IHJlcHJlc2VudCBhIGZpbGUgc3lzdGVtIGVudHJ5IChlLmcuIGRyYWdnZWQgdGV4dC9VUkxzKS5cblx0XHRcdC8vIFNraXAgdGhvc2Ugc28gd2UgbmV2ZXIgb3BlcmF0ZSBvbiBhIGBudWxsYCBlbnRyeSBsYXRlciBvbi5cblx0XHRcdGNvbnN0IGVudHJ5ID0gaXRlbS53ZWJraXRHZXRBc0VudHJ5KCk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRzOiB7IGlzRmlsZTogYm9vbGVhbjsgcmVzb3VyY2U6IFVSSSB9W10gPSBbXTtcblx0XHRjb25zdCBvcGVyYXRpb246IElCcm93c2VyVXBsb2FkT3BlcmF0aW9uID0ge1xuXHRcdFx0c3RhcnRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0cHJvZ3Jlc3NTY2hlZHVsZXI6IG5ldyBSdW5PbmNlV29ya2VyPElQcm9ncmVzc1N0ZXA+KHN0ZXBzID0+IHsgcHJvZ3Jlc3MucmVwb3J0KHN0ZXBzW3N0ZXBzLmxlbmd0aCAtIDFdKTsgfSwgMTAwMCksXG5cblx0XHRcdGZpbGVzVG90YWw6IGVudHJpZXMubGVuZ3RoLFxuXHRcdFx0ZmlsZXNVcGxvYWRlZDogMCxcblxuXHRcdFx0dG90YWxCeXRlc1VwbG9hZGVkOiAwXG5cdFx0fTtcblxuXHRcdC8vIFVwbG9hZCBhbGwgZW50cmllcyBpbiBwYXJhbGxlbCB1cCB0byBhXG5cdFx0Ly8gY2VydGFpbiBtYXhpbXVtIGxldmVyYWdpbmcgdGhlIGBMaW1pdGVyYFxuXHRcdGNvbnN0IHVwbG9hZExpbWl0ZXIgPSBuZXcgTGltaXRlcihCcm93c2VyRmlsZVVwbG9hZC5NQVhfUEFSQUxMRUxfVVBMT0FEUyk7XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChlbnRyaWVzLm1hcChlbnRyeSA9PiB7XG5cdFx0XHRyZXR1cm4gdXBsb2FkTGltaXRlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENvbmZpcm0gb3ZlcndyaXRlIGFzIG5lZWRlZFxuXHRcdFx0XHRpZiAodGFyZ2V0ICYmIGVudHJ5Lm5hbWUgJiYgdGFyZ2V0LmdldENoaWxkKGVudHJ5Lm5hbWUpKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKGdldEZpbGVPdmVyd3JpdGVDb25maXJtKGVudHJ5Lm5hbWUpKTtcblx0XHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmFwcGx5QnVsa0VkaXQoW25ldyBSZXNvdXJjZUZpbGVFZGl0KGpvaW5QYXRoKHRhcmdldC5yZXNvdXJjZSwgZW50cnkubmFtZSksIHVuZGVmaW5lZCwgeyByZWN1cnNpdmU6IHRydWUsIGZvbGRlcjogdGFyZ2V0LmdldENoaWxkKGVudHJ5Lm5hbWUpPy5pc0RpcmVjdG9yeSB9KV0sIHtcblx0XHRcdFx0XHRcdHVuZG9MYWJlbDogbG9jYWxpemUoJ292ZXJ3cml0ZScsIFwiT3ZlcndyaXRlIHswfVwiLCBlbnRyeS5uYW1lKSxcblx0XHRcdFx0XHRcdHByb2dyZXNzTGFiZWw6IGxvY2FsaXplKCdvdmVyd3JpdGluZycsIFwiT3ZlcndyaXRpbmcgezB9XCIsIGVudHJ5Lm5hbWUpLFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVXBsb2FkIGVudHJ5XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZG9VcGxvYWRFbnRyeShlbnRyeSwgdGFyZ2V0LnJlc291cmNlLCB0YXJnZXQsIHByb2dyZXNzLCBvcGVyYXRpb24sIHRva2VuKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJlc3VsdHMucHVzaChyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRvcGVyYXRpb24ucHJvZ3Jlc3NTY2hlZHVsZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gT3BlbiB1cGxvYWRlZCBmaWxlIGluIGVkaXRvciBvbmx5IGlmIHdlIHVwbG9hZCBqdXN0IG9uZVxuXHRcdGNvbnN0IGZpcnN0VXBsb2FkZWRGaWxlID0gcmVzdWx0c1swXTtcblx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkICYmIGZpcnN0VXBsb2FkZWRGaWxlPy5pc0ZpbGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGZpcnN0VXBsb2FkZWRGaWxlLnJlc291cmNlLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9VcGxvYWRFbnRyeShlbnRyeTogSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeSwgcGFyZW50UmVzb3VyY2U6IFVSSSwgdGFyZ2V0OiBFeHBsb3Jlckl0ZW0gfCB1bmRlZmluZWQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIG9wZXJhdGlvbjogSUJyb3dzZXJVcGxvYWRPcGVyYXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBpc0ZpbGU6IGJvb2xlYW47IHJlc291cmNlOiBVUkkgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCAhZW50cnkubmFtZSB8fCAoIWVudHJ5LmlzRmlsZSAmJiAhZW50cnkuaXNEaXJlY3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJlcG9ydCBwcm9ncmVzc1xuXHRcdGxldCBmaWxlQnl0ZXNVcGxvYWRlZCA9IDA7XG5cdFx0Y29uc3QgcmVwb3J0UHJvZ3Jlc3MgPSAoZmlsZVNpemU6IG51bWJlciwgYnl0ZXNVcGxvYWRlZDogbnVtYmVyKTogdm9pZCA9PiB7XG5cdFx0XHRmaWxlQnl0ZXNVcGxvYWRlZCArPSBieXRlc1VwbG9hZGVkO1xuXHRcdFx0b3BlcmF0aW9uLnRvdGFsQnl0ZXNVcGxvYWRlZCArPSBieXRlc1VwbG9hZGVkO1xuXG5cdFx0XHRjb25zdCBieXRlc1VwbG9hZGVkUGVyU2Vjb25kID0gb3BlcmF0aW9uLnRvdGFsQnl0ZXNVcGxvYWRlZCAvICgoRGF0ZS5ub3coKSAtIG9wZXJhdGlvbi5zdGFydFRpbWUpIC8gMTAwMCk7XG5cblx0XHRcdC8vIFNtYWxsIGZpbGVcblx0XHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRpZiAoZmlsZVNpemUgPCBCeXRlU2l6ZS5NQikge1xuXHRcdFx0XHRpZiAob3BlcmF0aW9uLmZpbGVzVG90YWwgPT09IDEpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gYCR7ZW50cnkubmFtZX1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgndXBsb2FkUHJvZ3Jlc3NTbWFsbE1hbnknLCBcInswfSBvZiB7MX0gZmlsZXMgKHsyfS9zKVwiLCBvcGVyYXRpb24uZmlsZXNVcGxvYWRlZCwgb3BlcmF0aW9uLmZpbGVzVG90YWwsIEJ5dGVTaXplLmZvcm1hdFNpemUoYnl0ZXNVcGxvYWRlZFBlclNlY29uZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIExhcmdlIGZpbGVcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ3VwbG9hZFByb2dyZXNzTGFyZ2UnLCBcInswfSAoezF9IG9mIHsyfSwgezN9L3MpXCIsIGVudHJ5Lm5hbWUsIEJ5dGVTaXplLmZvcm1hdFNpemUoZmlsZUJ5dGVzVXBsb2FkZWQpLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGZpbGVTaXplKSwgQnl0ZVNpemUuZm9ybWF0U2l6ZShieXRlc1VwbG9hZGVkUGVyU2Vjb25kKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlcG9ydCBwcm9ncmVzcyBidXQgbGltaXQgdG8gdXBkYXRlIG9ubHkgb25jZSBwZXIgc2Vjb25kXG5cdFx0XHRvcGVyYXRpb24ucHJvZ3Jlc3NTY2hlZHVsZXIud29yayh7IG1lc3NhZ2UgfSk7XG5cdFx0fTtcblx0XHRvcGVyYXRpb24uZmlsZXNVcGxvYWRlZCsrO1xuXHRcdHJlcG9ydFByb2dyZXNzKDAsIDApO1xuXG5cdFx0Ly8gSGFuZGxlIGZpbGUgdXBsb2FkXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aChwYXJlbnRSZXNvdXJjZSwgZW50cnkubmFtZSk7XG5cdFx0aWYgKGVudHJ5LmlzRmlsZSkge1xuXHRcdFx0Y29uc3QgZmlsZSA9IGF3YWl0IG5ldyBQcm9taXNlPEZpbGU+KChyZXNvbHZlLCByZWplY3QpID0+IGVudHJ5LmZpbGUocmVzb2x2ZSwgcmVqZWN0KSk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaHJvbWUvRWRnZS9GaXJlZm94IHN1cHBvcnQgc3RyZWFtIG1ldGhvZCwgYnV0IG9ubHkgdXNlIGl0IGZvclxuXHRcdFx0Ly8gbGFyZ2VyIGZpbGVzIHRvIHJlZHVjZSB0aGUgb3ZlcmhlYWQgb2YgdGhlIHN0cmVhbWluZyBhcHByb2FjaFxuXHRcdFx0aWYgKHR5cGVvZiBmaWxlLnN0cmVhbSA9PT0gJ2Z1bmN0aW9uJyAmJiBmaWxlLnNpemUgPiBCeXRlU2l6ZS5NQikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvVXBsb2FkRmlsZUJ1ZmZlcmVkKHJlc291cmNlLCBmaWxlLCByZXBvcnRQcm9ncmVzcywgdG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGYWxsYmFjayB0byB1bmJ1ZmZlcmVkIHVwbG9hZCBmb3Igb3RoZXIgYnJvd3NlcnMgb3Igc21hbGwgZmlsZXNcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvVXBsb2FkRmlsZVVuYnVmZmVyZWQocmVzb3VyY2UsIGZpbGUsIHJlcG9ydFByb2dyZXNzKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgaXNGaWxlOiB0cnVlLCByZXNvdXJjZSB9O1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBmb2xkZXIgdXBsb2FkXG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIENyZWF0ZSB0YXJnZXQgZm9sZGVyXG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihyZXNvdXJjZSk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWN1cnNpdmUgdXBsb2FkIGZpbGVzIGluIHRoaXMgZGlyZWN0b3J5XG5cdFx0XHRjb25zdCBkaXJSZWFkZXIgPSBlbnRyeS5jcmVhdGVSZWFkZXIoKTtcblx0XHRcdGNvbnN0IGNoaWxkRW50cmllczogSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeVtdID0gW107XG5cdFx0XHRsZXQgZG9uZSA9IGZhbHNlO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRjb25zdCBjaGlsZEVudHJpZXNDaHVuayA9IGF3YWl0IG5ldyBQcm9taXNlPElXZWJraXREYXRhVHJhbnNmZXJJdGVtRW50cnlbXT4oKHJlc29sdmUsIHJlamVjdCkgPT4gZGlyUmVhZGVyLnJlYWRFbnRyaWVzKHJlc29sdmUsIHJlamVjdCkpO1xuXHRcdFx0XHRpZiAoY2hpbGRFbnRyaWVzQ2h1bmsubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNoaWxkRW50cmllcy5wdXNoKC4uLmNoaWxkRW50cmllc0NodW5rKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkb25lID0gdHJ1ZTsgLy8gYW4gZW1wdHkgYXJyYXkgaXMgYSBzaWduYWwgdGhhdCBhbGwgZW50cmllcyBoYXZlIGJlZW4gcmVhZFxuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlICghZG9uZSAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpO1xuXG5cdFx0XHQvLyBVcGRhdGUgb3BlcmF0aW9uIHRvdGFsIGJhc2VkIG9uIG5ldyBjb3VudHNcblx0XHRcdG9wZXJhdGlvbi5maWxlc1RvdGFsICs9IGNoaWxkRW50cmllcy5sZW5ndGg7XG5cblx0XHRcdC8vIFNwbGl0IHVwIGZpbGVzIGZyb20gZm9sZGVycyB0byB1cGxvYWRcblx0XHRcdGNvbnN0IGZvbGRlclRhcmdldCA9IHRhcmdldD8uZ2V0Q2hpbGQoZW50cnkubmFtZSkgfHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmlsZUNoaWxkRW50cmllczogSVdlYmtpdERhdGFUcmFuc2Zlckl0ZW1FbnRyeVtdID0gW107XG5cdFx0XHRjb25zdCBmb2xkZXJDaGlsZEVudHJpZXM6IElXZWJraXREYXRhVHJhbnNmZXJJdGVtRW50cnlbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZEVudHJ5IG9mIGNoaWxkRW50cmllcykge1xuXHRcdFx0XHRpZiAoY2hpbGRFbnRyeS5pc0ZpbGUpIHtcblx0XHRcdFx0XHRmaWxlQ2hpbGRFbnRyaWVzLnB1c2goY2hpbGRFbnRyeSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2hpbGRFbnRyeS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGZvbGRlckNoaWxkRW50cmllcy5wdXNoKGNoaWxkRW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwbG9hZCBmaWxlcyAodXAgdG8gYE1BWF9QQVJBTExFTF9VUExPQURTYCBpbiBwYXJhbGxlbClcblx0XHRcdGNvbnN0IGZpbGVVcGxvYWRRdWV1ZSA9IG5ldyBMaW1pdGVyKEJyb3dzZXJGaWxlVXBsb2FkLk1BWF9QQVJBTExFTF9VUExPQURTKTtcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoZmlsZUNoaWxkRW50cmllcy5tYXAoZmlsZUNoaWxkRW50cnkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZmlsZVVwbG9hZFF1ZXVlLnF1ZXVlKCgpID0+IHRoaXMuZG9VcGxvYWRFbnRyeShmaWxlQ2hpbGRFbnRyeSwgcmVzb3VyY2UsIGZvbGRlclRhcmdldCwgcHJvZ3Jlc3MsIG9wZXJhdGlvbiwgdG9rZW4pKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gVXBsb2FkIGZvbGRlcnMgKHNlcXVlbnRpYWxseSBnaXZlIHdlIGRvbid0IGtub3cgdGhlaXIgc2l6ZXMpXG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlckNoaWxkRW50cnkgb2YgZm9sZGVyQ2hpbGRFbnRyaWVzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9VcGxvYWRFbnRyeShmb2xkZXJDaGlsZEVudHJ5LCByZXNvdXJjZSwgZm9sZGVyVGFyZ2V0LCBwcm9ncmVzcywgb3BlcmF0aW9uLCB0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGlzRmlsZTogZmFsc2UsIHJlc291cmNlIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VwbG9hZEZpbGVCdWZmZXJlZChyZXNvdXJjZTogVVJJLCBmaWxlOiBGaWxlLCBwcm9ncmVzc1JlcG9ydGVyOiAoZmlsZVNpemU6IG51bWJlciwgYnl0ZXNVcGxvYWRlZDogbnVtYmVyKSA9PiB2b2lkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3cml0ZWFibGVTdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oe1xuXHRcdFx0Ly8gU2V0IGEgaGlnaFdhdGVyTWFyayB0byBwcmV2ZW50IHRoZSBzdHJlYW1cblx0XHRcdC8vIGZvciBmaWxlIHVwbG9hZCB0byBwcm9kdWNlIGxhcmdlIGJ1ZmZlcnNcblx0XHRcdC8vIGluLW1lbW9yeVxuXHRcdFx0aGlnaFdhdGVyTWFyazogMTBcblx0XHR9KTtcblx0XHRjb25zdCB3cml0ZUZpbGVQcm9taXNlID0gdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIHdyaXRlYWJsZVN0cmVhbSk7XG5cblx0XHQvLyBSZWFkIHRoZSBmaWxlIGluIGNodW5rcyB1c2luZyBGaWxlLnN0cmVhbSgpIHdlYiBBUElzXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlYWRlcjogUmVhZGFibGVTdHJlYW1EZWZhdWx0UmVhZGVyPFVpbnQ4QXJyYXk+ID0gZmlsZS5zdHJlYW0oKS5nZXRSZWFkZXIoKTtcblxuXHRcdFx0bGV0IHJlcyA9IGF3YWl0IHJlYWRlci5yZWFkKCk7XG5cdFx0XHR3aGlsZSAoIXJlcy5kb25lKSB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV3JpdGUgYnVmZmVyIGludG8gc3RyZWFtIGJ1dCBtYWtlIHN1cmUgdG8gd2FpdFxuXHRcdFx0XHQvLyBpbiBjYXNlIHRoZSBgaGlnaFdhdGVyTWFya2AgaXMgcmVhY2hlZFxuXHRcdFx0XHRjb25zdCBidWZmZXIgPSBWU0J1ZmZlci53cmFwKHJlcy52YWx1ZSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlYWJsZVN0cmVhbS53cml0ZShidWZmZXIpO1xuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVwb3J0IHByb2dyZXNzXG5cdFx0XHRcdHByb2dyZXNzUmVwb3J0ZXIoZmlsZS5zaXplLCBidWZmZXIuYnl0ZUxlbmd0aCk7XG5cblx0XHRcdFx0cmVzID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcblx0XHRcdH1cblx0XHRcdHdyaXRlYWJsZVN0cmVhbS5lbmQodW5kZWZpbmVkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0d3JpdGVhYmxlU3RyZWFtLmVycm9yKGVycm9yKTtcblx0XHRcdHdyaXRlYWJsZVN0cmVhbS5lbmQoKTtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gV2FpdCBmb3IgZmlsZSBiZWluZyB3cml0dGVuIHRvIHRhcmdldFxuXHRcdGF3YWl0IHdyaXRlRmlsZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBsb2FkRmlsZVVuYnVmZmVyZWQocmVzb3VyY2U6IFVSSSwgZmlsZTogRmlsZSwgcHJvZ3Jlc3NSZXBvcnRlcjogKGZpbGVTaXplOiBudW1iZXIsIGJ5dGVzVXBsb2FkZWQ6IG51bWJlcikgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXHRcdFx0cmVhZGVyLm9ubG9hZCA9IGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQudGFyZ2V0Py5yZXN1bHQgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgYnVmZmVyID0gVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShldmVudC50YXJnZXQucmVzdWx0KSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgYnVmZmVyKTtcblxuXHRcdFx0XHRcdFx0Ly8gUmVwb3J0IHByb2dyZXNzXG5cdFx0XHRcdFx0XHRwcm9ncmVzc1JlcG9ydGVyKGZpbGUuc2l6ZSwgYnVmZmVyLmJ5dGVMZW5ndGgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCByZWFkIGZyb20gZHJvcHBlZCBmaWxlLicpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTdGFydCByZWFkaW5nIHRoZSBmaWxlIHRvIHRyaWdnZXIgYG9ubG9hZGBcblx0XHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihmaWxlKTtcblx0XHR9KTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEV4dGVybmFsIEZpbGUgSW1wb3J0IChkcmFnIGFuZCBkcm9wKVxuXG5leHBvcnQgY2xhc3MgRXh0ZXJuYWxGaWxlSW1wb3J0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2U6IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSxcblx0XHRASUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGxvcmVyU2VydmljZTogSUV4cGxvcmVyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGltcG9ydCh0YXJnZXQ6IEV4cGxvcmVySXRlbSwgc291cmNlOiBEcmFnRXZlbnQsIHRhcmdldFdpbmRvdzogV2luZG93KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHQvLyBJbmRpY2F0ZSBwcm9ncmVzcyBnbG9iYWxseVxuXHRcdGNvbnN0IGltcG9ydFByb21pc2UgPSB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHR7XG5cdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0ZGVsYXk6IDgwMCxcblx0XHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29weWluZ0ZpbGVzJywgXCJDb3B5aW5nLi4uXCIpXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKCkgPT4gYXdhaXQgdGhpcy5kb0ltcG9ydCh0YXJnZXQsIHNvdXJjZSwgdGFyZ2V0V2luZG93LCBjdHMudG9rZW4pLFxuXHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSlcblx0XHQpO1xuXG5cdFx0Ly8gQWxzbyBpbmRpY2F0ZSBwcm9ncmVzcyBpbiB0aGUgZmlsZXMgdmlld1xuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBWSUVXX0lELCBkZWxheTogNTAwIH0sICgpID0+IGltcG9ydFByb21pc2UpO1xuXG5cdFx0cmV0dXJuIGltcG9ydFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW1wb3J0KHRhcmdldDogRXhwbG9yZXJJdGVtLCBzb3VyY2U6IERyYWdFdmVudCwgdGFyZ2V0V2luZG93OiBXaW5kb3csIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gQWN0aXZhdGUgYWxsIHByb3ZpZGVycyBmb3IgdGhlIHJlc291cmNlcyBkcm9wcGVkXG5cdFx0Y29uc3QgY2FuZGlkYXRlRmlsZXMgPSBjb2FsZXNjZSgoYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBleHRyYWN0RWRpdG9yc0FuZEZpbGVzRHJvcERhdGEoYWNjZXNzb3IsIHNvdXJjZSkpKS5tYXAoZWRpdG9yID0+IGVkaXRvci5yZXNvdXJjZSkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGNhbmRpZGF0ZUZpbGVzLm1hcChyZXNvdXJjZSA9PiB0aGlzLmZpbGVTZXJ2aWNlLmFjdGl2YXRlUHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKSkpO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIGRyb3BwZWQgZXh0ZXJuYWwgZmlsZXMgdG8gYmUgZm9sZGVyc1xuXHRcdGNvbnN0IGZpbGVzID0gY29hbGVzY2UoY2FuZGlkYXRlRmlsZXMuZmlsdGVyKHJlc291cmNlID0+IHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpKSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRGaWxlcyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZUFsbChmaWxlcy5tYXAoZmlsZSA9PiAoeyByZXNvdXJjZTogZmlsZSB9KSkpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUGFzcyBmb2N1cyB0byB3aW5kb3dcblx0XHR0aGlzLmhvc3RTZXJ2aWNlLmZvY3VzKHRhcmdldFdpbmRvdyk7XG5cblx0XHQvLyBIYW5kbGUgZm9sZGVycyBieSBhZGRpbmcgdG8gd29ya3NwYWNlIGlmIHdlIGFyZSBpbiB3b3Jrc3BhY2UgY29udGV4dCBhbmQgaWYgZHJvcHBlZCBvbiB0b3Bcblx0XHRjb25zdCBmb2xkZXJzID0gcmVzb2x2ZWRGaWxlcy5maWx0ZXIocmVzb2x2ZWRGaWxlID0+IHJlc29sdmVkRmlsZS5zdWNjZXNzICYmIHJlc29sdmVkRmlsZS5zdGF0Py5pc0RpcmVjdG9yeSkubWFwKHJlc29sdmVkRmlsZSA9PiAoeyB1cmk6IHJlc29sdmVkRmlsZS5zdGF0IS5yZXNvdXJjZSB9KSk7XG5cdFx0aWYgKGZvbGRlcnMubGVuZ3RoID4gMCAmJiB0YXJnZXQuaXNSb290KSB7XG5cdFx0XHRlbnVtIEltcG9ydENob2ljZSB7XG5cdFx0XHRcdENvcHkgPSAxLFxuXHRcdFx0XHRBZGQgPSAyXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElQcm9tcHRCdXR0b248SW1wb3J0Q2hvaWNlIHwgdW5kZWZpbmVkPltdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGZvbGRlcnMubGVuZ3RoID4gMSA/XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnY29weUZvbGRlcnMnLCBcIiYmQ29weSBGb2xkZXJzXCIpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdjb3B5Rm9sZGVyJywgXCImJkNvcHkgRm9sZGVyXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gSW1wb3J0Q2hvaWNlLkNvcHlcblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblxuXHRcdFx0Ly8gV2Ugb25seSBhbGxvdyB0byBhZGQgYSBmb2xkZXIgdG8gdGhlIHdvcmtzcGFjZSBpZiB0aGVyZSBpcyBhbHJlYWR5IGEgd29ya3NwYWNlIGZvbGRlciB3aXRoIHRoYXQgc2NoZW1lXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJTY2hlbWFzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaS5zY2hlbWUpO1xuXHRcdFx0aWYgKGZvbGRlcnMuc29tZShmb2xkZXIgPT4gd29ya3NwYWNlRm9sZGVyU2NoZW1hcy5pbmRleE9mKGZvbGRlci51cmkuc2NoZW1lKSA+PSAwKSkge1xuXHRcdFx0XHRidXR0b25zLnVuc2hpZnQoe1xuXHRcdFx0XHRcdGxhYmVsOiBmb2xkZXJzLmxlbmd0aCA+IDEgP1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FkZEZvbGRlcnMnLCBcIiYmQWRkIEZvbGRlcnMgdG8gV29ya3NwYWNlXCIpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhZGRGb2xkZXInLCBcIiYmQWRkIEZvbGRlciB0byBXb3Jrc3BhY2VcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBJbXBvcnRDaG9pY2UuQWRkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRtZXNzYWdlID0gZm9sZGVycy5sZW5ndGggPiAxID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgnZHJvcEZvbGRlcnMnLCBcIkRvIHlvdSB3YW50IHRvIGNvcHkgdGhlIGZvbGRlcnMgb3IgYWRkIHRoZSBmb2xkZXJzIHRvIHRoZSB3b3Jrc3BhY2U/XCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZHJvcEZvbGRlcicsIFwiRG8geW91IHdhbnQgdG8gY29weSAnezB9JyBvciBhZGQgJ3swfScgYXMgYSBmb2xkZXIgdG8gdGhlIHdvcmtzcGFjZT9cIiwgYmFzZW5hbWUoZm9sZGVyc1swXS51cmkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBmb2xkZXJzLmxlbmd0aCA+IDEgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdjb3B5Zm9sZGVycycsIFwiQXJlIHlvdSBzdXJlIHRvIHdhbnQgdG8gY29weSBmb2xkZXJzP1wiKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NvcHlmb2xkZXInLCBcIkFyZSB5b3Ugc3VyZSB0byB3YW50IHRvIGNvcHkgJ3swfSc/XCIsIGJhc2VuYW1lKGZvbGRlcnNbMF0udXJpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQWRkIGZvbGRlcnNcblx0XHRcdGlmIChyZXN1bHQgPT09IEltcG9ydENob2ljZS5BZGQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlRWRpdGluZ1NlcnZpY2UuYWRkRm9sZGVycyhmb2xkZXJzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29weSByZXNvdXJjZXNcblx0XHRcdGlmIChyZXN1bHQgPT09IEltcG9ydENob2ljZS5Db3B5KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmltcG9ydFJlc291cmNlcyh0YXJnZXQsIGZpbGVzLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGRyb3BwZWQgZmlsZXMgKG9ubHkgc3VwcG9ydCBGaWxlU3RhdCBhcyB0YXJnZXQpXG5cdFx0ZWxzZSBpZiAodGFyZ2V0IGluc3RhbmNlb2YgRXhwbG9yZXJJdGVtKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbXBvcnRSZXNvdXJjZXModGFyZ2V0LCBmaWxlcywgdG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW1wb3J0UmVzb3VyY2VzKHRhcmdldDogRXhwbG9yZXJJdGVtLCByZXNvdXJjZXM6IFVSSVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocmVzb3VyY2VzICYmIHJlc291cmNlcy5sZW5ndGggPiAwKSB7XG5cblx0XHRcdC8vIFJlc29sdmUgdGFyZ2V0IHRvIGNoZWNrIGZvciBuYW1lIGNvbGxpc2lvbnMgYW5kIGFzayB1c2VyXG5cdFx0XHRjb25zdCB0YXJnZXRTdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRhcmdldC5yZXNvdXJjZSk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGZvciBuYW1lIGNvbGxpc2lvbnNcblx0XHRcdGNvbnN0IHRhcmdldE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRjb25zdCBjYXNlU2Vuc2l0aXZlID0gdGhpcy5maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KHRhcmdldC5yZXNvdXJjZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlKTtcblx0XHRcdGlmICh0YXJnZXRTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdHRhcmdldFN0YXQuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB7XG5cdFx0XHRcdFx0dGFyZ2V0TmFtZXMuYWRkKGNhc2VTZW5zaXRpdmUgPyBjaGlsZC5uYW1lIDogY2hpbGQubmFtZS50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblxuXHRcdFx0bGV0IGluYWNjZXNzaWJsZUZpbGVDb3VudCA9IDA7XG5cdFx0XHRjb25zdCByZXNvdXJjZXNGaWx0ZXJlZCA9IGNvYWxlc2NlKChhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHJlc291cmNlcy5tYXAoYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRjb25zdCBmaWxlRG9lc05vdEV4aXN0ID0gIShhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhyZXNvdXJjZSkpO1xuXHRcdFx0XHRpZiAoZmlsZURvZXNOb3RFeGlzdCkge1xuXHRcdFx0XHRcdGluYWNjZXNzaWJsZUZpbGVDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGFyZ2V0TmFtZXMuaGFzKGNhc2VTZW5zaXRpdmUgPyBiYXNlbmFtZShyZXNvdXJjZSkgOiBiYXNlbmFtZShyZXNvdXJjZSkudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRjb25zdCBjb25maXJtYXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybShnZXRGaWxlT3ZlcndyaXRlQ29uZmlybShiYXNlbmFtZShyZXNvdXJjZSkpKTtcblx0XHRcdFx0XHRpZiAoIWNvbmZpcm1hdGlvblJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdFx0fSkpKSk7XG5cblx0XHRcdGlmIChpbmFjY2Vzc2libGVGaWxlQ291bnQgPiAwKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihpbmFjY2Vzc2libGVGaWxlQ291bnQgPiAxID8gbG9jYWxpemUoJ2ZpbGVzSW5hY2Nlc3NpYmxlJywgXCJTb21lIG9yIGFsbCBvZiB0aGUgZHJvcHBlZCBmaWxlcyBjb3VsZCBub3QgYmUgYWNjZXNzZWQgZm9yIGltcG9ydC5cIikgOiBsb2NhbGl6ZSgnZmlsZUluYWNjZXNzaWJsZScsIFwiVGhlIGRyb3BwZWQgZmlsZSBjb3VsZCBub3QgYmUgYWNjZXNzZWQgZm9yIGltcG9ydC5cIikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb3B5IHJlc291cmNlcyB0aHJvdWdoIGJ1bGsgZWRpdCBBUElcblx0XHRcdGNvbnN0IHJlc291cmNlRmlsZUVkaXRzID0gcmVzb3VyY2VzRmlsdGVyZWQubWFwKHJlc291cmNlID0+IHtcblx0XHRcdFx0Y29uc3Qgc291cmNlRmlsZU5hbWUgPSBiYXNlbmFtZShyZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldEZpbGUgPSBqb2luUGF0aCh0YXJnZXQucmVzb3VyY2UsIHNvdXJjZUZpbGVOYW1lKTtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IFJlc291cmNlRmlsZUVkaXQocmVzb3VyY2UsIHRhcmdldEZpbGUsIHsgb3ZlcndyaXRlOiB0cnVlLCBjb3B5OiB0cnVlIH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHVuZG9MZXZlbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5leHBsb3Jlci5jb25maXJtVW5kbztcblx0XHRcdGF3YWl0IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmFwcGx5QnVsa0VkaXQocmVzb3VyY2VGaWxlRWRpdHMsIHtcblx0XHRcdFx0dW5kb0xhYmVsOiByZXNvdXJjZXNGaWx0ZXJlZC5sZW5ndGggPT09IDEgP1xuXHRcdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydzdWJzdGl0dXRpb24gd2lsbCBiZSB0aGUgbmFtZSBvZiB0aGUgZmlsZSB0aGF0IHdhcyBpbXBvcnRlZCddLCBrZXk6ICdpbXBvcnRGaWxlJyB9LCBcIkltcG9ydCB7MH1cIiwgYmFzZW5hbWUocmVzb3VyY2VzRmlsdGVyZWRbMF0pKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ3N1YnN0aXR1dGlvbiB3aWxsIGJlIHRoZSBudW1iZXIgb2YgZmlsZXMgdGhhdCB3ZXJlIGltcG9ydGVkJ10sIGtleTogJ2ltcG9ydG5GaWxlJyB9LCBcIkltcG9ydCB7MH0gcmVzb3VyY2VzXCIsIHJlc291cmNlc0ZpbHRlcmVkLmxlbmd0aCksXG5cdFx0XHRcdHByb2dyZXNzTGFiZWw6IHJlc291cmNlc0ZpbHRlcmVkLmxlbmd0aCA9PT0gMSA/XG5cdFx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ3N1YnN0aXR1dGlvbiB3aWxsIGJlIHRoZSBuYW1lIG9mIHRoZSBmaWxlIHRoYXQgd2FzIGNvcGllZCddLCBrZXk6ICdjb3B5aW5nRmlsZScgfSwgXCJDb3B5aW5nIHswfVwiLCBiYXNlbmFtZShyZXNvdXJjZXNGaWx0ZXJlZFswXSkpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnc3Vic3RpdHV0aW9uIHdpbGwgYmUgdGhlIG51bWJlciBvZiBmaWxlcyB0aGF0IHdlcmUgY29waWVkJ10sIGtleTogJ2NvcHlpbmduRmlsZScgfSwgXCJDb3B5aW5nIHswfSByZXNvdXJjZXNcIiwgcmVzb3VyY2VzRmlsdGVyZWQubGVuZ3RoKSxcblx0XHRcdFx0cHJvZ3Jlc3NMb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHRcdGNvbmZpcm1CZWZvcmVVbmRvOiB1bmRvTGV2ZWwgPT09IFVuZG9Db25maXJtTGV2ZWwuVmVyYm9zZSB8fCB1bmRvTGV2ZWwgPT09IFVuZG9Db25maXJtTGV2ZWwuRGVmYXVsdCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBpZiB3ZSBvbmx5IGFkZCBvbmUgZmlsZSwganVzdCBvcGVuIGl0IGRpcmVjdGx5XG5cdFx0XHRjb25zdCBhdXRvT3BlbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5leHBsb3Jlci5hdXRvT3BlbkRyb3BwZWRGaWxlO1xuXHRcdFx0aWYgKGF1dG9PcGVuICYmIHJlc291cmNlRmlsZUVkaXRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5leHBsb3JlclNlcnZpY2UuZmluZENsb3Nlc3QocmVzb3VyY2VGaWxlRWRpdHNbMF0ubmV3UmVzb3VyY2UhKTtcblx0XHRcdFx0aWYgKGl0ZW0gJiYgIWl0ZW0uaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBpdGVtLnJlc291cmNlLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRG93bmxvYWQgKHdlYiwgbmF0aXZlKVxuXG5pbnRlcmZhY2UgSURvd25sb2FkT3BlcmF0aW9uIHtcblx0c3RhcnRUaW1lOiBudW1iZXI7XG5cdHByb2dyZXNzU2NoZWR1bGVyOiBSdW5PbmNlV29ya2VyPElQcm9ncmVzc1N0ZXA+O1xuXG5cdGZpbGVzVG90YWw6IG51bWJlcjtcblx0ZmlsZXNEb3dubG9hZGVkOiBudW1iZXI7XG5cblx0dG90YWxCeXRlc0Rvd25sb2FkZWQ6IG51bWJlcjtcblx0ZmlsZUJ5dGVzRG93bmxvYWRlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgRmlsZURvd25sb2FkIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMQVNUX1VTRURfRE9XTkxPQURfUEFUSF9TVE9SQUdFX0tFWSA9ICd3b3JrYmVuY2guZXhwbG9yZXIuZG93bmxvYWRQYXRoJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGxvcmVyU2VydmljZTogSUV4cGxvcmVyU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGRvd25sb2FkKHNvdXJjZTogRXhwbG9yZXJJdGVtW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdC8vIEluZGljYXRlIHByb2dyZXNzIGdsb2JhbGx5XG5cdFx0Y29uc3QgZG93bmxvYWRQcm9taXNlID0gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0e1xuXHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHRcdGRlbGF5OiA4MDAsXG5cdFx0XHRcdGNhbmNlbGxhYmxlOiBpc1dlYixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkb3dubG9hZGluZ0ZpbGVzJywgXCJEb3dubG9hZGluZ1wiKVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHByb2dyZXNzID0+IHRoaXMuZG9Eb3dubG9hZChzb3VyY2UsIHByb2dyZXNzLCBjdHMpLFxuXHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSlcblx0XHQpO1xuXG5cdFx0Ly8gQWxzbyBpbmRpY2F0ZSBwcm9ncmVzcyBpbiB0aGUgZmlsZXMgdmlld1xuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBWSUVXX0lELCBkZWxheTogNTAwIH0sICgpID0+IGRvd25sb2FkUHJvbWlzZSk7XG5cblx0XHRyZXR1cm4gZG93bmxvYWRQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0Rvd25sb2FkKHNvdXJjZXM6IEV4cGxvcmVySXRlbVtdLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2Ygc291cmNlcykge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdlYjogdXNlIERPTSBBUElzIHRvIGRvd25sb2FkIGZpbGVzIHdpdGggb3B0aW9uYWwgc3VwcG9ydFxuXHRcdFx0Ly8gZm9yIGZvbGRlcnMgYW5kIGxhcmdlIGZpbGVzXG5cdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb0Rvd25sb2FkQnJvd3Nlcihzb3VyY2UucmVzb3VyY2UsIHByb2dyZXNzLCBjdHMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOYXRpdmU6IHVzZSB3b3JraW5nIGNvcHkgZmlsZSBzZXJ2aWNlIHRvIGdldCBhdCB0aGUgY29udGVudHNcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvRG93bmxvYWROYXRpdmUoc291cmNlLCBwcm9ncmVzcywgY3RzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRG93bmxvYWRCcm93c2VyKHJlc291cmNlOiBVUkksIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblxuXHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYXhCbG9iRG93bmxvYWRTaXplID0gMzIgKiBCeXRlU2l6ZS5NQjsgLy8gYXZvaWQgdG8gZG93bmxvYWQgdmlhIGJsb2ItdHJpY2sgPjMyTUIgdG8gYXZvaWQgbWVtb3J5IHByZXNzdXJlXG5cdFx0Y29uc3QgcHJlZmVyRmlsZVN5c3RlbUFjY2Vzc1dlYkFwaXMgPSBzdGF0LmlzRGlyZWN0b3J5IHx8IHN0YXQuc2l6ZSA+IG1heEJsb2JEb3dubG9hZFNpemU7XG5cblx0XHQvLyBGb2xkZXI6IHVzZSBGUyBBUElzIHRvIGRvd25sb2FkIGZpbGVzIGFuZCBmb2xkZXJzIGlmIGF2YWlsYWJsZSBhbmQgcHJlZmVycmVkXG5cdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0aWYgKHByZWZlckZpbGVTeXN0ZW1BY2Nlc3NXZWJBcGlzICYmIFdlYkZpbGVTeXN0ZW1BY2Nlc3Muc3VwcG9ydGVkKGFjdGl2ZVdpbmRvdykpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudEZvbGRlcjogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSA9IGF3YWl0IGFjdGl2ZVdpbmRvdy5zaG93RGlyZWN0b3J5UGlja2VyKCk7XG5cdFx0XHRcdGNvbnN0IG9wZXJhdGlvbjogSURvd25sb2FkT3BlcmF0aW9uID0ge1xuXHRcdFx0XHRcdHN0YXJ0VGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRwcm9ncmVzc1NjaGVkdWxlcjogbmV3IFJ1bk9uY2VXb3JrZXI8SVByb2dyZXNzU3RlcD4oc3RlcHMgPT4geyBwcm9ncmVzcy5yZXBvcnQoc3RlcHNbc3RlcHMubGVuZ3RoIC0gMV0pOyB9LCAxMDAwKSxcblxuXHRcdFx0XHRcdGZpbGVzVG90YWw6IHN0YXQuaXNEaXJlY3RvcnkgPyAwIDogMSwgLy8gZm9sZGVycyBpbmNyZW1lbnQgZmlsZXNUb3RhbCB3aXRoaW4gZG93bmxvYWRGb2xkZXIgbWV0aG9kXG5cdFx0XHRcdFx0ZmlsZXNEb3dubG9hZGVkOiAwLFxuXG5cdFx0XHRcdFx0dG90YWxCeXRlc0Rvd25sb2FkZWQ6IDAsXG5cdFx0XHRcdFx0ZmlsZUJ5dGVzRG93bmxvYWRlZDogMFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0Rm9sZGVyID0gYXdhaXQgcGFyZW50Rm9sZGVyLmdldERpcmVjdG9yeUhhbmRsZShzdGF0Lm5hbWUsIHsgY3JlYXRlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG93bmxvYWRGb2xkZXJCcm93c2VyKHN0YXQsIHRhcmdldEZvbGRlciwgb3BlcmF0aW9uLCBjdHMudG9rZW4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG93bmxvYWRGaWxlQnJvd3NlcihwYXJlbnRGb2xkZXIsIHN0YXQsIG9wZXJhdGlvbiwgY3RzLnRva2VuKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG9wZXJhdGlvbi5wcm9ncmVzc1NjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihlcnJvcik7XG5cdFx0XHRcdGN0cy5jYW5jZWwoKTsgLy8gYHNob3dEaXJlY3RvcnlQaWNrZXJgIHdpbGwgdGhyb3cgYW4gZXJyb3Igd2hlbiB0aGUgdXNlciBjYW5jZWxzXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZTogdXNlIHRyYWRpdGlvbmFsIGRvd25sb2FkIHRvIGNpcmN1bXZlbnQgYnJvd3NlciBsaW1pdGF0aW9uc1xuXHRcdGVsc2UgaWYgKHN0YXQuaXNGaWxlKSB7XG5cdFx0XHRsZXQgYnVmZmVyT3JVcmk6IFVpbnQ4QXJyYXkgfCBVUkk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRidWZmZXJPclVyaSA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHN0YXQucmVzb3VyY2UsIHsgbGltaXRzOiB7IHNpemU6IG1heEJsb2JEb3dubG9hZFNpemUgfSB9LCBjdHMudG9rZW4pKS52YWx1ZS5idWZmZXI7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRidWZmZXJPclVyaSA9IEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKHN0YXQucmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0cmlnZ2VyRG93bmxvYWQoYnVmZmVyT3JVcmksIHN0YXQubmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZEZpbGVCdWZmZXJlZEJyb3dzZXIocmVzb3VyY2U6IFVSSSwgdGFyZ2V0OiBGaWxlU3lzdGVtV3JpdGFibGVGaWxlU3RyZWFtLCBvcGVyYXRpb246IElEb3dubG9hZE9wZXJhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHJlc291cmNlLCB1bmRlZmluZWQsIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRhcmdldC5jbG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2VTdHJlYW0gPSBjb250ZW50cy52YWx1ZTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRhcmdldC5jbG9zZSgpKSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24odG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQpKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWplY3QoY2FuY2VsZWQoKSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGxpc3RlblN0cmVhbShzb3VyY2VTdHJlYW0sIHtcblx0XHRcdFx0b25EYXRhOiBkYXRhID0+IHtcblx0XHRcdFx0XHR0YXJnZXQud3JpdGUoZGF0YS5idWZmZXIgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj4pO1xuXHRcdFx0XHRcdHRoaXMucmVwb3J0UHJvZ3Jlc3MoY29udGVudHMubmFtZSwgY29udGVudHMuc2l6ZSwgZGF0YS5ieXRlTGVuZ3RoLCBvcGVyYXRpb24pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkVycm9yOiBlcnJvciA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRW5kOiAoKSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdG9rZW4pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZEZpbGVVbmJ1ZmZlcmVkQnJvd3NlcihyZXNvdXJjZTogVVJJLCB0YXJnZXQ6IEZpbGVTeXN0ZW1Xcml0YWJsZUZpbGVTdHJlYW0sIG9wZXJhdGlvbjogSURvd25sb2FkT3BlcmF0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRhcmdldC53cml0ZShjb250ZW50cy52YWx1ZS5idWZmZXIgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj4pO1xuXHRcdFx0dGhpcy5yZXBvcnRQcm9ncmVzcyhjb250ZW50cy5uYW1lLCBjb250ZW50cy5zaXplLCBjb250ZW50cy52YWx1ZS5ieXRlTGVuZ3RoLCBvcGVyYXRpb24pO1xuXHRcdH1cblxuXHRcdHRhcmdldC5jbG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZEZpbGVCcm93c2VyKHRhcmdldEZvbGRlcjogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSwgZmlsZTogSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBvcGVyYXRpb246IElEb3dubG9hZE9wZXJhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSZXBvcnQgcHJvZ3Jlc3Ncblx0XHRvcGVyYXRpb24uZmlsZXNEb3dubG9hZGVkKys7XG5cdFx0b3BlcmF0aW9uLmZpbGVCeXRlc0Rvd25sb2FkZWQgPSAwOyAvLyByZXNldCBmb3IgdGhpcyBmaWxlXG5cdFx0dGhpcy5yZXBvcnRQcm9ncmVzcyhmaWxlLm5hbWUsIDAsIDAsIG9wZXJhdGlvbik7XG5cblx0XHQvLyBTdGFydCB0byBkb3dubG9hZFxuXHRcdGNvbnN0IHRhcmdldEZpbGUgPSBhd2FpdCB0YXJnZXRGb2xkZXIuZ2V0RmlsZUhhbmRsZShmaWxlLm5hbWUsIHsgY3JlYXRlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHRhcmdldEZpbGVXcml0ZXIgPSBhd2FpdCB0YXJnZXRGaWxlLmNyZWF0ZVdyaXRhYmxlKCk7XG5cblx0XHQvLyBGb3IgbGFyZ2UgZmlsZXMsIHdyaXRlIGJ1ZmZlcmVkIHVzaW5nIHN0cmVhbXNcblx0XHRpZiAoZmlsZS5zaXplID4gQnl0ZVNpemUuTUIpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvd25sb2FkRmlsZUJ1ZmZlcmVkQnJvd3NlcihmaWxlLnJlc291cmNlLCB0YXJnZXRGaWxlV3JpdGVyLCBvcGVyYXRpb24sIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBGb3Igc21hbGwgZmlsZXMgcHJlZmVyIHRvIHdyaXRlIHVuYnVmZmVyZWQgdG8gcmVkdWNlIG92ZXJoZWFkXG5cdFx0cmV0dXJuIHRoaXMuZG93bmxvYWRGaWxlVW5idWZmZXJlZEJyb3dzZXIoZmlsZS5yZXNvdXJjZSwgdGFyZ2V0RmlsZVdyaXRlciwgb3BlcmF0aW9uLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkRm9sZGVyQnJvd3Nlcihmb2xkZXI6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgdGFyZ2V0Rm9sZGVyOiBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlLCBvcGVyYXRpb246IElEb3dubG9hZE9wZXJhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGZvbGRlci5jaGlsZHJlbikge1xuXHRcdFx0b3BlcmF0aW9uLmZpbGVzVG90YWwgKz0gKGZvbGRlci5jaGlsZHJlbi5tYXAoY2hpbGQgPT4gY2hpbGQuaXNGaWxlKSkubGVuZ3RoO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGZvbGRlci5jaGlsZHJlbikge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY2hpbGQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kb3dubG9hZEZpbGVCcm93c2VyKHRhcmdldEZvbGRlciwgY2hpbGQsIG9wZXJhdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkRm9sZGVyID0gYXdhaXQgdGFyZ2V0Rm9sZGVyLmdldERpcmVjdG9yeUhhbmRsZShjaGlsZC5uYW1lLCB7IGNyZWF0ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZENoaWxkRm9sZGVyID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKGNoaWxkLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG93bmxvYWRGb2xkZXJCcm93c2VyKHJlc29sdmVkQ2hpbGRGb2xkZXIsIGNoaWxkRm9sZGVyLCBvcGVyYXRpb24sIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0UHJvZ3Jlc3MobmFtZTogc3RyaW5nLCBmaWxlU2l6ZTogbnVtYmVyLCBieXRlc0Rvd25sb2FkZWQ6IG51bWJlciwgb3BlcmF0aW9uOiBJRG93bmxvYWRPcGVyYXRpb24pOiB2b2lkIHtcblx0XHRvcGVyYXRpb24uZmlsZUJ5dGVzRG93bmxvYWRlZCArPSBieXRlc0Rvd25sb2FkZWQ7XG5cdFx0b3BlcmF0aW9uLnRvdGFsQnl0ZXNEb3dubG9hZGVkICs9IGJ5dGVzRG93bmxvYWRlZDtcblxuXHRcdGNvbnN0IGJ5dGVzRG93bmxvYWRlZFBlclNlY29uZCA9IG9wZXJhdGlvbi50b3RhbEJ5dGVzRG93bmxvYWRlZCAvICgoRGF0ZS5ub3coKSAtIG9wZXJhdGlvbi5zdGFydFRpbWUpIC8gMTAwMCk7XG5cblx0XHQvLyBTbWFsbCBmaWxlXG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRpZiAoZmlsZVNpemUgPCBCeXRlU2l6ZS5NQikge1xuXHRcdFx0aWYgKG9wZXJhdGlvbi5maWxlc1RvdGFsID09PSAxKSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBuYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdkb3dubG9hZFByb2dyZXNzU21hbGxNYW55JywgXCJ7MH0gb2YgezF9IGZpbGVzICh7Mn0vcylcIiwgb3BlcmF0aW9uLmZpbGVzRG93bmxvYWRlZCwgb3BlcmF0aW9uLmZpbGVzVG90YWwsIEJ5dGVTaXplLmZvcm1hdFNpemUoYnl0ZXNEb3dubG9hZGVkUGVyU2Vjb25kKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTGFyZ2UgZmlsZVxuXHRcdGVsc2Uge1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdkb3dubG9hZFByb2dyZXNzTGFyZ2UnLCBcInswfSAoezF9IG9mIHsyfSwgezN9L3MpXCIsIG5hbWUsIEJ5dGVTaXplLmZvcm1hdFNpemUob3BlcmF0aW9uLmZpbGVCeXRlc0Rvd25sb2FkZWQpLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGZpbGVTaXplKSwgQnl0ZVNpemUuZm9ybWF0U2l6ZShieXRlc0Rvd25sb2FkZWRQZXJTZWNvbmQpKTtcblx0XHR9XG5cblx0XHQvLyBSZXBvcnQgcHJvZ3Jlc3MgYnV0IGxpbWl0IHRvIHVwZGF0ZSBvbmx5IG9uY2UgcGVyIHNlY29uZFxuXHRcdG9wZXJhdGlvbi5wcm9ncmVzc1NjaGVkdWxlci53b3JrKHsgbWVzc2FnZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Eb3dubG9hZE5hdGl2ZShleHBsb3Jlckl0ZW06IEV4cGxvcmVySXRlbSwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGV4cGxvcmVySXRlbS5uYW1lIH0pO1xuXG5cdFx0bGV0IGRlZmF1bHRVcmk6IFVSSTtcblx0XHRjb25zdCBsYXN0VXNlZERvd25sb2FkUGF0aCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEZpbGVEb3dubG9hZC5MQVNUX1VTRURfRE9XTkxPQURfUEFUSF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAobGFzdFVzZWREb3dubG9hZFBhdGgpIHtcblx0XHRcdGRlZmF1bHRVcmkgPSBqb2luUGF0aChVUkkuZmlsZShsYXN0VXNlZERvd25sb2FkUGF0aCksIGV4cGxvcmVySXRlbS5uYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVmYXVsdFVyaSA9IGpvaW5QYXRoKFxuXHRcdFx0XHRleHBsb3Jlckl0ZW0uaXNEaXJlY3RvcnkgP1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZvbGRlclBhdGgoU2NoZW1hcy5maWxlKSA6XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoU2NoZW1hcy5maWxlKSxcblx0XHRcdFx0ZXhwbG9yZXJJdGVtLm5hbWVcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzdGluYXRpb24gPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlRGlhbG9nKHtcblx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSxcblx0XHRcdHNhdmVMYWJlbDogbG9jYWxpemUoJ2Rvd25sb2FkQnV0dG9uJywgXCJEb3dubG9hZFwiKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hvb3NlV2hlcmVUb0Rvd25sb2FkJywgXCJDaG9vc2UgV2hlcmUgdG8gRG93bmxvYWRcIiksXG5cdFx0XHRkZWZhdWx0VXJpXG5cdFx0fSk7XG5cblx0XHRpZiAoZGVzdGluYXRpb24pIHtcblxuXHRcdFx0Ly8gUmVtZW1iZXIgYXMgbGFzdCB1c2VkIGRvd25sb2FkIGZvbGRlclxuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShGaWxlRG93bmxvYWQuTEFTVF9VU0VEX0RPV05MT0FEX1BBVEhfU1RPUkFHRV9LRVksIGRpcm5hbWUoZGVzdGluYXRpb24pLmZzUGF0aCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0XHQvLyBQZXJmb3JtIGRvd25sb2FkXG5cdFx0XHRhd2FpdCB0aGlzLmV4cGxvcmVyU2VydmljZS5hcHBseUJ1bGtFZGl0KFtuZXcgUmVzb3VyY2VGaWxlRWRpdChleHBsb3Jlckl0ZW0ucmVzb3VyY2UsIGRlc3RpbmF0aW9uLCB7IG92ZXJ3cml0ZTogdHJ1ZSwgY29weTogdHJ1ZSB9KV0sIHtcblx0XHRcdFx0dW5kb0xhYmVsOiBsb2NhbGl6ZSgnZG93bmxvYWRCdWxrRWRpdCcsIFwiRG93bmxvYWQgezB9XCIsIGV4cGxvcmVySXRlbS5uYW1lKSxcblx0XHRcdFx0cHJvZ3Jlc3NMYWJlbDogbG9jYWxpemUoJ2Rvd25sb2FkaW5nQnVsa0VkaXQnLCBcIkRvd25sb2FkaW5nIHswfVwiLCBleHBsb3Jlckl0ZW0ubmFtZSksXG5cdFx0XHRcdHByb2dyZXNzTG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3RzLmNhbmNlbCgpOyAvLyBVc2VyIGNhbmNlbGVkIGEgZG93bmxvYWQuIEluIGNhc2UgdGhlcmUgd2VyZSBtdWx0aXBsZSBmaWxlcyBzZWxlY3RlZCB3ZSBzaG91bGQgY2FuY2VsIHRoZSByZW1haW5kZXIgb2YgdGhlIHByb21wdHMgIzg2MTAwXG5cdFx0fVxuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gSGVscGVyc1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmlsZU92ZXJ3cml0ZUNvbmZpcm0obmFtZTogc3RyaW5nKTogSUNvbmZpcm1hdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1PdmVyd3JpdGUnLCBcIkEgZmlsZSBvciBmb2xkZXIgd2l0aCB0aGUgbmFtZSAnezB9JyBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgZGVzdGluYXRpb24gZm9sZGVyLiBEbyB5b3Ugd2FudCB0byByZXBsYWNlIGl0P1wiLCBuYW1lKSxcblx0XHRkZXRhaWw6IGxvY2FsaXplKCdpcnJldmVyc2libGUnLCBcIlRoaXMgYWN0aW9uIGlzIGlycmV2ZXJzaWJsZSFcIiksXG5cdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZXBsYWNlQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBsYWNlXCIpLFxuXHRcdHR5cGU6ICd3YXJuaW5nJ1xuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TXVsdGlwbGVGaWxlc092ZXJ3cml0ZUNvbmZpcm0oZmlsZXM6IFVSSVtdKTogSUNvbmZpcm1hdGlvbiB7XG5cdGlmIChmaWxlcy5sZW5ndGggPiAxKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtTWFueU92ZXJ3cml0ZXMnLCBcIlRoZSBmb2xsb3dpbmcgezB9IGZpbGVzIGFuZC9vciBmb2xkZXJzIGFscmVhZHkgZXhpc3QgaW4gdGhlIGRlc3RpbmF0aW9uIGZvbGRlci4gRG8geW91IHdhbnQgdG8gcmVwbGFjZSB0aGVtP1wiLCBmaWxlcy5sZW5ndGgpLFxuXHRcdFx0ZGV0YWlsOiBnZXRGaWxlTmFtZXNNZXNzYWdlKGZpbGVzKSArICdcXG4nICsgbG9jYWxpemUoJ2lycmV2ZXJzaWJsZScsIFwiVGhpcyBhY3Rpb24gaXMgaXJyZXZlcnNpYmxlIVwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAncmVwbGFjZUJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVwbGFjZVwiKSxcblx0XHRcdHR5cGU6ICd3YXJuaW5nJ1xuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4gZ2V0RmlsZU92ZXJ3cml0ZUNvbmZpcm0oYmFzZW5hbWUoZmlsZXNbMF0pKTtcbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHFCQUFvQyxnQkFBZ0IsMEJBQXlDO0FBQ3RHLFNBQVMsVUFBVSxnQ0FBZ0Msb0JBQTJDO0FBQzlGLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFvQixrQkFBaUMsd0JBQXdCO0FBQzdFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQThCLGtCQUFrQixlQUFlO0FBQy9ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyxVQUFVLHFCQUFxQjtBQUNqRCxTQUFTLDBCQUEwQixnQkFBZ0I7QUFDbkQsU0FBUyxVQUFVLFNBQVMsZ0JBQWdCO0FBQzVDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUIsYUFBYSx1QkFBdUI7QUFDOUQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxZQUFZLGVBQWU7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBbUN0RCxJQUFNLG9CQUFOLE1BQXdCO0FBQUEsRUFJOUIsWUFDb0MsaUJBQ0YsZUFDRSxp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
