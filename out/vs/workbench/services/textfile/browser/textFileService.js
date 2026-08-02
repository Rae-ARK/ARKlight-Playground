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
import { toBufferOrReadable, TextFileOperationError, TextFileOperationResult, stringToSnapshot, TextFileEditorModelState } from "../common/textfiles.js";
import { SaveSourceRegistry } from "../../../common/editor.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { IFileService, FileOperationResult } from "../../../../platform/files/common/files.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { extname as pathExtname } from "../../../../base/common/path.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IUntitledTextEditorService } from "../../untitled/common/untitledTextEditorService.js";
import { UntitledTextEditorModel } from "../../untitled/common/untitledTextEditorModel.js";
import { TextFileEditorModelManager } from "../common/textFileEditorModelManager.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Schemas } from "../../../../base/common/network.js";
import { createTextBufferFactoryFromSnapshot, createTextBufferFactoryFromStream } from "../../../../editor/common/model/textModel.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { joinPath, dirname, basename, toLocalResource, extname, isEqual } from "../../../../base/common/resources.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { bufferToStream } from "../../../../base/common/buffer.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { BaseTextEditorModel } from "../../../common/editor/textEditorModel.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { IPathService } from "../../path/common/pathService.js";
import { IWorkingCopyFileService } from "../../workingCopy/common/workingCopyFileService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, WORKSPACE_EXTENSION } from "../../../../platform/workspace/common/workspace.js";
import { UTF8, UTF8_with_bom, UTF16be, UTF16le, encodingExists, toEncodeReadable, toDecodeStream, DecodeStreamErrorKind } from "../common/encoding.js";
import { consumeStream } from "../../../../base/common/stream.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { IDecorationsService } from "../../decorations/common/decorations.js";
import { Emitter } from "../../../../base/common/event.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { listErrorForeground } from "../../../../platform/theme/common/colorRegistry.js";
let AbstractTextFileService = class extends Disposable {
  constructor(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, logService, elevatedFileService, decorationsService) {
    super();
    this.fileService = fileService;
    this.lifecycleService = lifecycleService;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.environmentService = environmentService;
    this.dialogService = dialogService;
    this.fileDialogService = fileDialogService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.filesConfigurationService = filesConfigurationService;
    this.codeEditorService = codeEditorService;
    this.pathService = pathService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this.languageService = languageService;
    this.logService = logService;
    this.elevatedFileService = elevatedFileService;
    this.decorationsService = decorationsService;
    this.files = this._register(this.instantiationService.createInstance(TextFileEditorModelManager));
    this.untitled = untitledTextEditorService;
    this.provideDecorations();
  }
  //#region decorations
  provideDecorations() {
    const provider = this._register(new class extends Disposable {
      constructor(files) {
        super();
        this.files = files;
        this.label = localize("textFileModelDecorations", "Text File Model Decorations");
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.registerListeners();
      }
      registerListeners() {
        this._register(this.files.onDidResolve(({ model }) => {
          if (model.isReadonly() || model.hasState(TextFileEditorModelState.ORPHAN)) {
            this._onDidChange.fire([model.resource]);
          }
        }));
        this._register(this.files.onDidRemove((modelUri) => this._onDidChange.fire([modelUri])));
        this._register(this.files.onDidChangeReadonly((model) => this._onDidChange.fire([model.resource])));
        this._register(this.files.onDidChangeOrphaned((model) => this._onDidChange.fire([model.resource])));
      }
      provideDecorations(uri) {
        const model = this.files.get(uri);
        if (!model || model.isDisposed()) {
          return void 0;
        }
        const isReadonly = model.isReadonly();
        const isOrphaned = model.hasState(TextFileEditorModelState.ORPHAN);
        if (isReadonly && isOrphaned) {
          return {
            color: listErrorForeground,
            letter: Codicon.lockSmall,
            strikethrough: true,
            tooltip: localize("readonlyAndDeleted", "Deleted, Read-only")
          };
        } else if (isReadonly) {
          return {
            letter: Codicon.lockSmall,
            tooltip: localize("readonly", "Read-only")
          };
        } else if (isOrphaned) {
          return {
            color: listErrorForeground,
            strikethrough: true,
            tooltip: localize("deleted", "Deleted")
          };
        }
        return void 0;
      }
    }(this.files));
    this._register(this.decorationsService.registerDecorationsProvider(provider));
  }
  get encoding() {
    if (!this._encoding) {
      this._encoding = this._register(this.instantiationService.createInstance(EncodingOracle));
    }
    return this._encoding;
  }
  async read(resource, options) {
    const [bufferStream, decoder] = await this.doRead(resource, {
      ...options,
      // optimization: since we know that the caller does not
      // care about buffering, we indicate this to the reader.
      // this reduces all the overhead the buffered reading
      // has (open, read, close) if the provider supports
      // unbuffered reading.
      preferUnbuffered: true
    });
    return {
      ...bufferStream,
      encoding: decoder.detected.encoding || UTF8,
      value: await consumeStream(decoder.stream, (strings) => strings.join(""))
    };
  }
  async readStream(resource, options) {
    const [bufferStream, decoder] = await this.doRead(resource, options);
    return {
      ...bufferStream,
      encoding: decoder.detected.encoding || UTF8,
      value: await createTextBufferFactoryFromStream(decoder.stream)
    };
  }
  async doRead(resource, options) {
    const cts = new CancellationTokenSource();
    let bufferStream;
    if (options?.preferUnbuffered) {
      const content = await this.fileService.readFile(resource, options, cts.token);
      bufferStream = {
        ...content,
        value: bufferToStream(content.value)
      };
    } else {
      bufferStream = await this.fileService.readFileStream(resource, options, cts.token);
    }
    try {
      const decoder = await this.doGetDecodedStream(resource, bufferStream.value, options);
      return [bufferStream, decoder];
    } catch (error) {
      cts.dispose(true);
      if (error.decodeStreamErrorKind === DecodeStreamErrorKind.STREAM_IS_BINARY) {
        throw new TextFileOperationError(localize("fileBinaryError", "File seems to be binary and cannot be opened as text"), TextFileOperationResult.FILE_IS_BINARY, options);
      } else {
        throw error;
      }
    }
  }
  async create(operations, undoInfo) {
    const operationsWithContents = await Promise.all(operations.map(async (operation) => {
      const contents = await this.getEncodedReadable(operation.resource, operation.value);
      return {
        resource: operation.resource,
        contents,
        overwrite: operation.options?.overwrite
      };
    }));
    return this.workingCopyFileService.create(operationsWithContents, CancellationToken.None, undoInfo);
  }
  async write(resource, value, options) {
    const readable = await this.getEncodedReadable(resource, value, options);
    if (options?.writeElevated && this.elevatedFileService.isSupported(resource)) {
      return this.elevatedFileService.writeFileElevated(resource, readable, options);
    }
    return this.fileService.writeFile(resource, readable, options);
  }
  async getEncodedReadable(resource, value, options) {
    const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource, options);
    if (encoding === UTF8 && !addBOM) {
      return typeof value === "undefined" ? void 0 : toBufferOrReadable(value);
    }
    value = value || "";
    const snapshot = typeof value === "string" ? stringToSnapshot(value) : value;
    return toEncodeReadable(snapshot, encoding, { addBOM });
  }
  async getDecodedStream(resource, value, options) {
    return (await this.doGetDecodedStream(resource, value, options)).stream;
  }
  doGetDecodedStream(resource, stream, options) {
    return toDecodeStream(stream, {
      acceptTextOnly: options?.acceptTextOnly ?? false,
      guessEncoding: options?.autoGuessEncoding || this.textResourceConfigurationService.getValue(resource, "files.autoGuessEncoding"),
      candidateGuessEncodings: options?.candidateGuessEncodings || this.textResourceConfigurationService.getValue(resource, "files.candidateGuessEncodings"),
      overwriteEncoding: async (detectedEncoding) => this.validateDetectedEncoding(resource, detectedEncoding ?? void 0, options)
    });
  }
  getEncoding(resource) {
    const model = resource.scheme === Schemas.untitled ? this.untitled.get(resource) : this.files.get(resource);
    return model?.getEncoding() ?? this.encoding.getUnvalidatedEncodingForResource(resource);
  }
  async resolveDecoding(resource, options) {
    return {
      preferredEncoding: (await this.encoding.getPreferredReadEncoding(resource, options, void 0)).encoding,
      guessEncoding: options?.autoGuessEncoding || this.textResourceConfigurationService.getValue(resource, "files.autoGuessEncoding"),
      candidateGuessEncodings: options?.candidateGuessEncodings || this.textResourceConfigurationService.getValue(resource, "files.candidateGuessEncodings")
    };
  }
  async validateDetectedEncoding(resource, detectedEncoding, options) {
    const { encoding } = await this.encoding.getPreferredReadEncoding(resource, options, detectedEncoding);
    return encoding;
  }
  resolveEncoding(resource, options) {
    return this.encoding.getWriteEncoding(resource, options);
  }
  //#endregion
  //#region save
  async save(resource, options) {
    if (resource.scheme === Schemas.untitled) {
      const model = this.untitled.get(resource);
      if (model) {
        let targetUri;
        if (model.hasAssociatedFilePath) {
          targetUri = await this.suggestSavePath(resource);
        } else {
          targetUri = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(resource), options?.availableFileSystems);
        }
        if (targetUri) {
          return this.saveAs(resource, targetUri, options);
        }
      }
    } else {
      const model = this.files.get(resource);
      if (model) {
        return await model.save(options) ? resource : void 0;
      }
    }
    return void 0;
  }
  async saveAs(source, target, options) {
    if (!target) {
      target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(options?.suggestedTarget ?? source), options?.availableFileSystems);
    }
    if (!target) {
      return;
    }
    if (this.filesConfigurationService.isReadonly(target)) {
      const confirmed = await this.confirmMakeWriteable(target);
      if (!confirmed) {
        return;
      } else {
        this.filesConfigurationService.updateReadonly(target, false);
      }
    }
    if (isEqual(source, target)) {
      return this.save(source, {
        ...options,
        force: true
        /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */
      });
    }
    if (this.fileService.hasProvider(source) && this.uriIdentityService.extUri.isEqual(source, target) && await this.fileService.exists(source)) {
      await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
      const success = await this.save(source, options);
      if (!success) {
        await this.save(target, options);
      }
      return target;
    }
    return this.doSaveAs(source, target, options);
  }
  async doSaveAs(source, target, options) {
    let success = false;
    let resolvedTextModel;
    if (source.scheme !== Schemas.untitled) {
      const textFileModel = this.files.get(source);
      if (textFileModel?.isResolved()) {
        resolvedTextModel = textFileModel;
      }
    } else {
      const untitledTextModel = this.untitled.get(source);
      if (untitledTextModel?.isResolved()) {
        resolvedTextModel = untitledTextModel;
      }
    }
    if (resolvedTextModel) {
      success = await this.doSaveAsTextFile(resolvedTextModel, source, target, options);
    } else if (this.fileService.hasProvider(source)) {
      await this.fileService.copy(source, target, true);
      success = true;
    } else {
      const textModel = this.modelService.getModel(source);
      if (textModel) {
        success = await this.doSaveAsTextFile(textModel, source, target, options);
      }
    }
    if (!success) {
      return void 0;
    }
    try {
      await this.revert(source);
    } catch (error) {
      this.logService.error(error);
    }
    if (source.scheme === Schemas.untitled) {
      this.untitled.notifyDidSave(source, target);
    }
    return target;
  }
  async doSaveAsTextFile(sourceModel, source, target, options) {
    let sourceModelEncoding = void 0;
    const sourceModelWithEncodingSupport = sourceModel;
    if (typeof sourceModelWithEncodingSupport.getEncoding === "function") {
      sourceModelEncoding = sourceModelWithEncodingSupport.getEncoding();
    }
    let targetExists = false;
    let targetModel = this.files.get(target);
    if (targetModel?.isResolved()) {
      targetExists = true;
    } else {
      targetExists = await this.fileService.exists(target);
      if (!targetExists) {
        await this.create([{ resource: target, value: "" }]);
      }
      try {
        targetModel = await this.files.resolve(target, { encoding: sourceModelEncoding });
      } catch (error) {
        if (targetExists) {
          if (error.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY || error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
            await this.fileService.del(target);
            return this.doSaveAsTextFile(sourceModel, source, target, options);
          }
        }
        throw error;
      }
    }
    let write;
    if (sourceModel instanceof UntitledTextEditorModel && sourceModel.hasAssociatedFilePath && targetExists && this.uriIdentityService.extUri.isEqual(target, toLocalResource(sourceModel.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme))) {
      write = await this.confirmOverwrite(target);
    } else {
      write = true;
    }
    if (!write) {
      return false;
    }
    let sourceTextModel = void 0;
    if (sourceModel instanceof BaseTextEditorModel) {
      if (sourceModel.isResolved()) {
        sourceTextModel = sourceModel.textEditorModel ?? void 0;
      }
    } else {
      sourceTextModel = sourceModel;
    }
    let targetTextModel = void 0;
    if (targetModel.isResolved()) {
      targetTextModel = targetModel.textEditorModel;
    }
    if (sourceTextModel && targetTextModel) {
      targetModel.updatePreferredEncoding(sourceModelEncoding);
      this.modelService.updateModel(targetTextModel, createTextBufferFactoryFromSnapshot(sourceTextModel.createSnapshot()));
      const sourceLanguageId = sourceTextModel.getLanguageId();
      const targetLanguageId = targetTextModel.getLanguageId();
      if (sourceLanguageId !== PLAINTEXT_LANGUAGE_ID && targetLanguageId === PLAINTEXT_LANGUAGE_ID) {
        targetTextModel.setLanguage(sourceLanguageId);
      }
      const sourceOptions = sourceTextModel.getOptions();
      targetTextModel.updateOptions({
        tabSize: sourceOptions.tabSize,
        indentSize: sourceOptions.indentSize,
        insertSpaces: sourceOptions.insertSpaces
      });
      const sourceEOL = sourceTextModel.getEndOfLineSequence();
      targetTextModel.setEOL(sourceEOL);
      const sourceTransientProperties = this.codeEditorService.getTransientModelProperties(sourceTextModel);
      if (sourceTransientProperties) {
        for (const [key, value] of sourceTransientProperties) {
          this.codeEditorService.setTransientModelProperty(targetTextModel, key, value);
        }
      }
    }
    if (!options?.source) {
      options = {
        ...options,
        source: targetExists ? AbstractTextFileService.TEXTFILE_SAVE_REPLACE_SOURCE : AbstractTextFileService.TEXTFILE_SAVE_CREATE_SOURCE
      };
    }
    return targetModel.save({
      ...options,
      from: source
    });
  }
  async confirmOverwrite(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmOverwrite", "'{0}' already exists. Do you want to replace it?", basename(resource)),
      detail: localize("overwriteIrreversible", "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
      primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace")
    });
    return confirmed;
  }
  async confirmMakeWriteable(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmMakeWriteable", "'{0}' is marked as read-only. Do you want to save anyway?", basename(resource)),
      detail: localize("confirmMakeWriteableDetail", "Paths can be configured as read-only via settings."),
      primaryButton: localize({ key: "makeWriteableButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Save Anyway")
    });
    return confirmed;
  }
  async suggestSavePath(resource) {
    if (this.fileService.hasProvider(resource)) {
      return resource;
    }
    const remoteAuthority = this.environmentService.remoteAuthority;
    const defaultFilePath = await this.fileDialogService.defaultFilePath();
    let suggestedFilename = void 0;
    if (resource.scheme === Schemas.untitled) {
      const model = this.untitled.get(resource);
      if (model) {
        if (model.hasAssociatedFilePath) {
          return toLocalResource(resource, remoteAuthority, this.pathService.defaultUriScheme);
        }
        let nameCandidate;
        if (await this.pathService.hasValidBasename(joinPath(defaultFilePath, model.name), model.name)) {
          nameCandidate = model.name;
        } else {
          nameCandidate = basename(resource);
        }
        const languageId = model.getLanguageId();
        if (languageId && languageId !== PLAINTEXT_LANGUAGE_ID) {
          suggestedFilename = this.suggestFilename(languageId, nameCandidate);
        } else {
          suggestedFilename = nameCandidate;
        }
      }
    }
    if (!suggestedFilename) {
      suggestedFilename = basename(resource);
    }
    return joinPath(defaultFilePath, suggestedFilename);
  }
  suggestFilename(languageId, untitledName) {
    const languageName = this.languageService.getLanguageName(languageId);
    if (!languageName) {
      return untitledName;
    }
    const untitledExtension = pathExtname(untitledName);
    const extensions = this.languageService.getExtensions(languageId);
    if (extensions.includes(untitledExtension)) {
      return untitledName;
    }
    const primaryExtension = extensions.at(0);
    if (primaryExtension) {
      if (untitledExtension) {
        return `${untitledName.substring(0, untitledName.indexOf(untitledExtension))}${primaryExtension}`;
      }
      return `${untitledName}${primaryExtension}`;
    }
    const filenames = this.languageService.getFilenames(languageId);
    if (filenames.includes(untitledName)) {
      return untitledName;
    }
    return filenames.at(0) ?? untitledName;
  }
  //#endregion
  //#region revert
  async revert(resource, options) {
    if (resource.scheme === Schemas.untitled) {
      const model = this.untitled.get(resource);
      if (model) {
        return model.revert(options);
      }
    } else {
      const model = this.files.get(resource);
      if (model && (model.isDirty() || options?.force)) {
        return model.revert(options);
      }
    }
  }
  //#endregion
  //#region dirty
  isDirty(resource) {
    const model = resource.scheme === Schemas.untitled ? this.untitled.get(resource) : this.files.get(resource);
    if (model) {
      return model.isDirty();
    }
    return false;
  }
  //#endregion
};
AbstractTextFileService.TEXTFILE_SAVE_CREATE_SOURCE = SaveSourceRegistry.registerSource("textFileCreate.source", localize("textFileCreate.source", "File Created"));
AbstractTextFileService.TEXTFILE_SAVE_REPLACE_SOURCE = SaveSourceRegistry.registerSource("textFileOverwrite.source", localize("textFileOverwrite.source", "File Replaced"));
AbstractTextFileService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUntitledTextEditorService),
  __decorateParam(2, ILifecycleService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, ITextResourceConfigurationService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, ICodeEditorService),
  __decorateParam(11, IPathService),
  __decorateParam(12, IWorkingCopyFileService),
  __decorateParam(13, IUriIdentityService),
  __decorateParam(14, ILanguageService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IElevatedFileService),
  __decorateParam(17, IDecorationsService)
], AbstractTextFileService);
let EncodingOracle = class extends Disposable {
  constructor(textResourceConfigurationService, environmentService, contextService, uriIdentityService) {
    super();
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this._encodingOverrides = this.getDefaultEncodingOverrides();
    this.registerListeners();
  }
  get encodingOverrides() {
    return this._encodingOverrides;
  }
  set encodingOverrides(value) {
    this._encodingOverrides = value;
  }
  registerListeners() {
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.encodingOverrides = this.getDefaultEncodingOverrides()));
  }
  getDefaultEncodingOverrides() {
    const defaultEncodingOverrides = [];
    defaultEncodingOverrides.push({ parent: this.environmentService.userRoamingDataHome, encoding: UTF8 });
    defaultEncodingOverrides.push({ extension: WORKSPACE_EXTENSION, encoding: UTF8 });
    defaultEncodingOverrides.push({ parent: this.environmentService.untitledWorkspacesHome, encoding: UTF8 });
    this.contextService.getWorkspace().folders.forEach((folder) => {
      defaultEncodingOverrides.push({ parent: joinPath(folder.uri, ".vscode"), encoding: UTF8 });
    });
    return defaultEncodingOverrides;
  }
  async getWriteEncoding(resource, options) {
    const { encoding, hasBOM } = await this.getPreferredWriteEncoding(resource, options ? options.encoding : void 0);
    return { encoding, addBOM: hasBOM };
  }
  async getPreferredWriteEncoding(resource, preferredEncoding) {
    const resourceEncoding = await this.getValidatedEncodingForResource(resource, preferredEncoding);
    return {
      encoding: resourceEncoding,
      hasBOM: resourceEncoding === UTF16be || resourceEncoding === UTF16le || resourceEncoding === UTF8_with_bom
      // enforce BOM for certain encodings
    };
  }
  async getPreferredReadEncoding(resource, options, detectedEncoding) {
    let preferredEncoding;
    if (options?.encoding) {
      if (detectedEncoding === UTF8_with_bom && options.encoding === UTF8) {
        preferredEncoding = UTF8_with_bom;
      } else {
        preferredEncoding = options.encoding;
      }
    } else if (typeof detectedEncoding === "string") {
      preferredEncoding = detectedEncoding;
    } else if (this.textResourceConfigurationService.getValue(resource, "files.encoding") === UTF8_with_bom) {
      preferredEncoding = UTF8;
    }
    const encoding = await this.getValidatedEncodingForResource(resource, preferredEncoding);
    return {
      encoding,
      hasBOM: encoding === UTF16be || encoding === UTF16le || encoding === UTF8_with_bom
      // enforce BOM for certain encodings
    };
  }
  getUnvalidatedEncodingForResource(resource, preferredEncoding) {
    let fileEncoding;
    const override = this.getEncodingOverride(resource);
    if (override) {
      fileEncoding = override;
    } else if (preferredEncoding) {
      fileEncoding = preferredEncoding;
    } else {
      fileEncoding = this.textResourceConfigurationService.getValue(resource, "files.encoding");
    }
    return fileEncoding || UTF8;
  }
  async getValidatedEncodingForResource(resource, preferredEncoding) {
    let fileEncoding = this.getUnvalidatedEncodingForResource(resource, preferredEncoding);
    if (fileEncoding !== UTF8 && !await encodingExists(fileEncoding)) {
      fileEncoding = UTF8;
    }
    return fileEncoding;
  }
  getEncodingOverride(resource) {
    if (resource && this.encodingOverrides?.length) {
      for (const override of this.encodingOverrides) {
        if (override.parent && this.uriIdentityService.extUri.isEqualOrParent(resource, override.parent)) {
          return override.encoding;
        }
        if (override.extension && extname(resource) === `.${override.extension}`) {
          return override.encoding;
        }
      }
    }
    return void 0;
  }
};
EncodingOracle = __decorateClass([
  __decorateParam(0, ITextResourceConfigurationService),
  __decorateParam(1, IWorkbenchEnvironmentService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IUriIdentityService)
], EncodingOracle);
export {
  AbstractTextFileService,
  EncodingOracle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9icm93c2VyL3RleHRGaWxlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRW5jb2RpbmdTdXBwb3J0LCBJVGV4dEZpbGVTZXJ2aWNlLCBJVGV4dEZpbGVTdHJlYW1Db250ZW50LCBJVGV4dEZpbGVDb250ZW50LCBJUmVzb3VyY2VFbmNvZGluZ3MsIElSZWFkVGV4dEZpbGVPcHRpb25zLCBJV3JpdGVUZXh0RmlsZU9wdGlvbnMsIHRvQnVmZmVyT3JSZWFkYWJsZSwgVGV4dEZpbGVPcGVyYXRpb25FcnJvciwgVGV4dEZpbGVPcGVyYXRpb25SZXN1bHQsIElUZXh0RmlsZVNhdmVPcHRpb25zLCBJVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIsIElSZXNvdXJjZUVuY29kaW5nLCBzdHJpbmdUb1NuYXBzaG90LCBJVGV4dEZpbGVTYXZlQXNPcHRpb25zLCBJUmVhZFRleHRGaWxlRW5jb2RpbmdPcHRpb25zLCBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUsIElSZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwgfSBmcm9tICcuLi9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElSZXZlcnRPcHRpb25zLCBTYXZlU291cmNlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgSUNyZWF0ZUZpbGVPcHRpb25zLCBJRmlsZVN0cmVhbUNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBleHRuYW1lIGFzIHBhdGhFeHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSwgSVVudGl0bGVkVGV4dEVkaXRvck1vZGVsTWFuYWdlciB9IGZyb20gJy4uLy4uL3VudGl0bGVkL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFVudGl0bGVkVGV4dEVkaXRvck1vZGVsLCBVbnRpdGxlZFRleHRFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uL3VudGl0bGVkL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciB9IGZyb20gJy4uL2NvbW1vbi90ZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90LCBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCwgZGlybmFtZSwgYmFzZW5hbWUsIHRvTG9jYWxSZXNvdXJjZSwgZXh0bmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgYnVmZmVyVG9TdHJlYW0sIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSVRleHRTbmFwc2hvdCwgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQmFzZVRleHRFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvdGV4dEVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLCBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbywgSUNyZWF0ZUZpbGVPcGVyYXRpb24gfSBmcm9tICcuLi8uLi93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV09SS1NQQUNFX0VYVEVOU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFVURjgsIFVURjhfd2l0aF9ib20sIFVURjE2YmUsIFVURjE2bGUsIGVuY29kaW5nRXhpc3RzLCB0b0VuY29kZVJlYWRhYmxlLCB0b0RlY29kZVN0cmVhbSwgSURlY29kZVN0cmVhbVJlc3VsdCwgRGVjb2RlU3RyZWFtRXJyb3IsIERlY29kZVN0cmVhbUVycm9yS2luZCB9IGZyb20gJy4uL2NvbW1vbi9lbmNvZGluZy5qcyc7XG5pbXBvcnQgeyBjb25zdW1lU3RyZWFtLCBSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUVsZXZhdGVkRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZWxldmF0ZWRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbkRhdGEsIElEZWNvcmF0aW9uc1Byb3ZpZGVyLCBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbGlzdEVycm9yRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VGV4dEZpbGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXh0RmlsZVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRFWFRGSUxFX1NBVkVfQ1JFQVRFX1NPVVJDRSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgndGV4dEZpbGVDcmVhdGUuc291cmNlJywgbG9jYWxpemUoJ3RleHRGaWxlQ3JlYXRlLnNvdXJjZScsIFwiRmlsZSBDcmVhdGVkXCIpKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEVYVEZJTEVfU0FWRV9SRVBMQUNFX1NPVVJDRSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgndGV4dEZpbGVPdmVyd3JpdGUuc291cmNlJywgbG9jYWxpemUoJ3RleHRGaWxlT3ZlcndyaXRlLnNvdXJjZScsIFwiRmlsZSBSZXBsYWNlZFwiKSk7XG5cblx0cmVhZG9ubHkgZmlsZXM6IElUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcjtcblxuXHRyZWFkb25seSB1bnRpdGxlZDogSVVudGl0bGVkVGV4dEVkaXRvck1vZGVsTWFuYWdlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSB1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlOiBJVW50aXRsZWRUZXh0RWRpdG9yTW9kZWxNYW5hZ2VyLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRWxldmF0ZWRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVsZXZhdGVkRmlsZVNlcnZpY2U6IElFbGV2YXRlZEZpbGVTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmZpbGVzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcikpO1xuXHRcdHRoaXMudW50aXRsZWQgPSB1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXG5cdFx0dGhpcy5wcm92aWRlRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBkZWNvcmF0aW9uc1xuXG5cdHByaXZhdGUgcHJvdmlkZURlY29yYXRpb25zKCk6IHZvaWQge1xuXG5cdFx0Ly8gVGV4dCBmaWxlIG1vZGVsIGRlY29yYXRpb25zXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgY2xhc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURlY29yYXRpb25zUHJvdmlkZXIge1xuXG5cdFx0XHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCd0ZXh0RmlsZU1vZGVsRGVjb3JhdGlvbnMnLCBcIlRleHQgRmlsZSBNb2RlbCBEZWNvcmF0aW9uc1wiKTtcblxuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUklbXT4oKSk7XG5cdFx0XHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGZpbGVzOiBJVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIpIHtcblx0XHRcdFx0c3VwZXIoKTtcblxuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHRcdFx0Ly8gQ3JlYXRlc1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVzLm9uRGlkUmVzb2x2ZSgoeyBtb2RlbCB9KSA9PiB7XG5cdFx0XHRcdFx0aWYgKG1vZGVsLmlzUmVhZG9ubHkoKSB8fCBtb2RlbC5oYXNTdGF0ZShUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuT1JQSEFOKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbbW9kZWwucmVzb3VyY2VdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBSZW1vdmFsczogb25jZSBhIHRleHQgZmlsZSBtb2RlbCBpcyBubyBsb25nZXJcblx0XHRcdFx0Ly8gdW5kZXIgb3VyIGNvbnRyb2wsIG1ha2Ugc3VyZSB0byBzaWduYWwgdGhpcyBhc1xuXHRcdFx0XHQvLyBkZWNvcmF0aW9uIGNoYW5nZSBiZWNhdXNlIGZyb20gdGhpcyBwb2ludCBvbiB3ZVxuXHRcdFx0XHQvLyBoYXZlIG5vIHdheSBvZiB1cGRhdGluZyB0aGUgZGVjb3JhdGlvbiBhbnltb3JlLlxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVzLm9uRGlkUmVtb3ZlKG1vZGVsVXJpID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW21vZGVsVXJpXSkpKTtcblxuXHRcdFx0XHQvLyBDaGFuZ2VzXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXMub25EaWRDaGFuZ2VSZWFkb25seShtb2RlbCA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKFttb2RlbC5yZXNvdXJjZV0pKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXMub25EaWRDaGFuZ2VPcnBoYW5lZChtb2RlbCA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKFttb2RlbC5yZXNvdXJjZV0pKSk7XG5cdFx0XHR9XG5cblx0XHRcdHByb3ZpZGVEZWNvcmF0aW9ucyh1cmk6IFVSSSk6IElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5maWxlcy5nZXQodXJpKTtcblx0XHRcdFx0aWYgKCFtb2RlbCB8fCBtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXNSZWFkb25seSA9IG1vZGVsLmlzUmVhZG9ubHkoKTtcblx0XHRcdFx0Y29uc3QgaXNPcnBoYW5lZCA9IG1vZGVsLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5PUlBIQU4pO1xuXG5cdFx0XHRcdC8vIFJlYWRvbmx5ICsgT3JwaGFuZWRcblx0XHRcdFx0aWYgKGlzUmVhZG9ubHkgJiYgaXNPcnBoYW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRjb2xvcjogbGlzdEVycm9yRm9yZWdyb3VuZCxcblx0XHRcdFx0XHRcdGxldHRlcjogQ29kaWNvbi5sb2NrU21hbGwsXG5cdFx0XHRcdFx0XHRzdHJpa2V0aHJvdWdoOiB0cnVlLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3JlYWRvbmx5QW5kRGVsZXRlZCcsIFwiRGVsZXRlZCwgUmVhZC1vbmx5XCIpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZWFkb25seVxuXHRcdFx0XHRlbHNlIGlmIChpc1JlYWRvbmx5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxldHRlcjogQ29kaWNvbi5sb2NrU21hbGwsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVhZG9ubHknLCBcIlJlYWQtb25seVwiKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT3JwaGFuZWRcblx0XHRcdFx0ZWxzZSBpZiAoaXNPcnBoYW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRjb2xvcjogbGlzdEVycm9yRm9yZWdyb3VuZCxcblx0XHRcdFx0XHRcdHN0cmlrZXRocm91Z2g6IHRydWUsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVsZXRlZCcsIFwiRGVsZXRlZFwiKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KHRoaXMuZmlsZXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVjb3JhdGlvbnNTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihwcm92aWRlcikpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHRleHQgZmlsZSByZWFkIC8gd3JpdGUgLyBjcmVhdGVcblxuXHRwcml2YXRlIF9lbmNvZGluZzogRW5jb2RpbmdPcmFjbGUgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGVuY29kaW5nKCk6IEVuY29kaW5nT3JhY2xlIHtcblx0XHRpZiAoIXRoaXMuX2VuY29kaW5nKSB7XG5cdFx0XHR0aGlzLl9lbmNvZGluZyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5jb2RpbmdPcmFjbGUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZW5jb2Rpbmc7XG5cdH1cblxuXHRhc3luYyByZWFkKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZFRleHRGaWxlT3B0aW9ucyk6IFByb21pc2U8SVRleHRGaWxlQ29udGVudD4ge1xuXHRcdGNvbnN0IFtidWZmZXJTdHJlYW0sIGRlY29kZXJdID0gYXdhaXQgdGhpcy5kb1JlYWQocmVzb3VyY2UsIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHQvLyBvcHRpbWl6YXRpb246IHNpbmNlIHdlIGtub3cgdGhhdCB0aGUgY2FsbGVyIGRvZXMgbm90XG5cdFx0XHQvLyBjYXJlIGFib3V0IGJ1ZmZlcmluZywgd2UgaW5kaWNhdGUgdGhpcyB0byB0aGUgcmVhZGVyLlxuXHRcdFx0Ly8gdGhpcyByZWR1Y2VzIGFsbCB0aGUgb3ZlcmhlYWQgdGhlIGJ1ZmZlcmVkIHJlYWRpbmdcblx0XHRcdC8vIGhhcyAob3BlbiwgcmVhZCwgY2xvc2UpIGlmIHRoZSBwcm92aWRlciBzdXBwb3J0c1xuXHRcdFx0Ly8gdW5idWZmZXJlZCByZWFkaW5nLlxuXHRcdFx0cHJlZmVyVW5idWZmZXJlZDogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmJ1ZmZlclN0cmVhbSxcblx0XHRcdGVuY29kaW5nOiBkZWNvZGVyLmRldGVjdGVkLmVuY29kaW5nIHx8IFVURjgsXG5cdFx0XHR2YWx1ZTogYXdhaXQgY29uc3VtZVN0cmVhbShkZWNvZGVyLnN0cmVhbSwgc3RyaW5ncyA9PiBzdHJpbmdzLmpvaW4oJycpKVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyByZWFkU3RyZWFtKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZFRleHRGaWxlT3B0aW9ucyk6IFByb21pc2U8SVRleHRGaWxlU3RyZWFtQ29udGVudD4ge1xuXHRcdGNvbnN0IFtidWZmZXJTdHJlYW0sIGRlY29kZXJdID0gYXdhaXQgdGhpcy5kb1JlYWQocmVzb3VyY2UsIG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmJ1ZmZlclN0cmVhbSxcblx0XHRcdGVuY29kaW5nOiBkZWNvZGVyLmRldGVjdGVkLmVuY29kaW5nIHx8IFVURjgsXG5cdFx0XHR2YWx1ZTogYXdhaXQgY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU3RyZWFtKGRlY29kZXIuc3RyZWFtKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVhZChyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRUZXh0RmlsZU9wdGlvbnMgJiB7IHByZWZlclVuYnVmZmVyZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPFtJRmlsZVN0cmVhbUNvbnRlbnQsIElEZWNvZGVTdHJlYW1SZXN1bHRdPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHQvLyByZWFkIHN0cmVhbSByYXcgKGVpdGhlciBidWZmZXJlZCBvciB1bmJ1ZmZlcmVkKVxuXHRcdGxldCBidWZmZXJTdHJlYW06IElGaWxlU3RyZWFtQ29udGVudDtcblx0XHRpZiAob3B0aW9ucz8ucHJlZmVyVW5idWZmZXJlZCkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIG9wdGlvbnMsIGN0cy50b2tlbik7XG5cdFx0XHRidWZmZXJTdHJlYW0gPSB7XG5cdFx0XHRcdC4uLmNvbnRlbnQsXG5cdFx0XHRcdHZhbHVlOiBidWZmZXJUb1N0cmVhbShjb250ZW50LnZhbHVlKVxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnVmZmVyU3RyZWFtID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZVN0cmVhbShyZXNvdXJjZSwgb3B0aW9ucywgY3RzLnRva2VuKTtcblx0XHR9XG5cblx0XHQvLyByZWFkIHRocm91Z2ggZW5jb2RpbmcgbGlicmFyeVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkZWNvZGVyID0gYXdhaXQgdGhpcy5kb0dldERlY29kZWRTdHJlYW0ocmVzb3VyY2UsIGJ1ZmZlclN0cmVhbS52YWx1ZSwgb3B0aW9ucyk7XG5cblx0XHRcdHJldHVybiBbYnVmZmVyU3RyZWFtLCBkZWNvZGVyXTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdG8gY2FuY2VsIHJlYWRpbmcgb24gZXJyb3IgdG9cblx0XHRcdC8vIHN0b3AgZmlsZSBzZXJ2aWNlIGFjdGl2aXR5IGFzIHNvb24gYXNcblx0XHRcdC8vIHBvc3NpYmxlLiBXaGVuIGZvciBleGFtcGxlIGEgbGFyZ2UgYmluYXJ5XG5cdFx0XHQvLyBmaWxlIGlzIHJlYWQgd2Ugd2FudCB0byBjYW5jZWwgdGhlIHJlYWRcblx0XHRcdC8vIGluc3RhbnRseS5cblx0XHRcdC8vIFJlZnM6XG5cdFx0XHQvLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzg4MDVcblx0XHRcdC8vIC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzMjc3MVxuXHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cblx0XHRcdC8vIHNwZWNpYWwgdHJlYXRtZW50IGZvciBzdHJlYW1zIHRoYXQgYXJlIGJpbmFyeVxuXHRcdFx0aWYgKCg8RGVjb2RlU3RyZWFtRXJyb3I+ZXJyb3IpLmRlY29kZVN0cmVhbUVycm9yS2luZCA9PT0gRGVjb2RlU3RyZWFtRXJyb3JLaW5kLlNUUkVBTV9JU19CSU5BUlkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFRleHRGaWxlT3BlcmF0aW9uRXJyb3IobG9jYWxpemUoJ2ZpbGVCaW5hcnlFcnJvcicsIFwiRmlsZSBzZWVtcyB0byBiZSBiaW5hcnkgYW5kIGNhbm5vdCBiZSBvcGVuZWQgYXMgdGV4dFwiKSwgVGV4dEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JU19CSU5BUlksIG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZS10aHJvdyBhbnkgb3RoZXIgZXJyb3IgYXMgaXQgaXNcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBjcmVhdGUob3BlcmF0aW9uczogeyByZXNvdXJjZTogVVJJOyB2YWx1ZT86IHN0cmluZyB8IElUZXh0U25hcHNob3Q7IG9wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMgfVtdLCB1bmRvSW5mbz86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvKTogUHJvbWlzZTxyZWFkb25seSBJRmlsZVN0YXRXaXRoTWV0YWRhdGFbXT4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbnNXaXRoQ29udGVudHM6IElDcmVhdGVGaWxlT3BlcmF0aW9uW10gPSBhd2FpdCBQcm9taXNlLmFsbChvcGVyYXRpb25zLm1hcChhc3luYyBvcGVyYXRpb24gPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLmdldEVuY29kZWRSZWFkYWJsZShvcGVyYXRpb24ucmVzb3VyY2UsIG9wZXJhdGlvbi52YWx1ZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvdXJjZTogb3BlcmF0aW9uLnJlc291cmNlLFxuXHRcdFx0XHRjb250ZW50cyxcblx0XHRcdFx0b3ZlcndyaXRlOiBvcGVyYXRpb24ub3B0aW9ucz8ub3ZlcndyaXRlXG5cdFx0XHR9O1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiB0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuY3JlYXRlKG9wZXJhdGlvbnNXaXRoQ29udGVudHMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHVuZG9JbmZvKTtcblx0fVxuXG5cdGFzeW5jIHdyaXRlKHJlc291cmNlOiBVUkksIHZhbHVlOiBzdHJpbmcgfCBJVGV4dFNuYXBzaG90LCBvcHRpb25zPzogSVdyaXRlVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRjb25zdCByZWFkYWJsZSA9IGF3YWl0IHRoaXMuZ2V0RW5jb2RlZFJlYWRhYmxlKHJlc291cmNlLCB2YWx1ZSwgb3B0aW9ucyk7XG5cblx0XHRpZiAob3B0aW9ucz8ud3JpdGVFbGV2YXRlZCAmJiB0aGlzLmVsZXZhdGVkRmlsZVNlcnZpY2UuaXNTdXBwb3J0ZWQocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lbGV2YXRlZEZpbGVTZXJ2aWNlLndyaXRlRmlsZUVsZXZhdGVkKHJlc291cmNlLCByZWFkYWJsZSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCByZWFkYWJsZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBnZXRFbmNvZGVkUmVhZGFibGUocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmFsdWU6IElUZXh0U25hcHNob3QpOiBQcm9taXNlPFZTQnVmZmVyUmVhZGFibGU+O1xuXHRhc3luYyBnZXRFbmNvZGVkUmVhZGFibGUocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlPjtcblx0YXN5bmMgZ2V0RW5jb2RlZFJlYWRhYmxlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHZhbHVlPzogSVRleHRTbmFwc2hvdCk6IFByb21pc2U8VlNCdWZmZXJSZWFkYWJsZSB8IHVuZGVmaW5lZD47XG5cdGFzeW5jIGdldEVuY29kZWRSZWFkYWJsZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB2YWx1ZT86IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgdW5kZWZpbmVkPjtcblx0YXN5bmMgZ2V0RW5jb2RlZFJlYWRhYmxlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHZhbHVlPzogc3RyaW5nIHwgSVRleHRTbmFwc2hvdCk6IFByb21pc2U8VlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgdW5kZWZpbmVkPjtcblx0YXN5bmMgZ2V0RW5jb2RlZFJlYWRhYmxlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHZhbHVlOiBzdHJpbmcgfCBJVGV4dFNuYXBzaG90LCBvcHRpb25zPzogSVdyaXRlVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTxWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGU+O1xuXHRhc3luYyBnZXRFbmNvZGVkUmVhZGFibGUocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmFsdWU/OiBzdHJpbmcgfCBJVGV4dFNuYXBzaG90LCBvcHRpb25zPzogSVdyaXRlVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTxWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIGNoZWNrIGZvciBlbmNvZGluZ1xuXHRcdGNvbnN0IHsgZW5jb2RpbmcsIGFkZEJPTSB9ID0gYXdhaXQgdGhpcy5lbmNvZGluZy5nZXRXcml0ZUVuY29kaW5nKHJlc291cmNlLCBvcHRpb25zKTtcblxuXHRcdC8vIHdoZW4gZW5jb2RpbmcgaXMgc3RhbmRhcmQgc2tpcCBlbmNvZGluZyBzdGVwXG5cdFx0aWYgKGVuY29kaW5nID09PSBVVEY4ICYmICFhZGRCT00pIHtcblx0XHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHRcdDogdG9CdWZmZXJPclJlYWRhYmxlKHZhbHVlKTtcblx0XHR9XG5cblx0XHQvLyBvdGhlcndpc2UgY3JlYXRlIGVuY29kZWQgcmVhZGFibGVcblx0XHR2YWx1ZSA9IHZhbHVlIHx8ICcnO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHN0cmluZ1RvU25hcHNob3QodmFsdWUpIDogdmFsdWU7XG5cdFx0cmV0dXJuIHRvRW5jb2RlUmVhZGFibGUoc25hcHNob3QsIGVuY29kaW5nLCB7IGFkZEJPTSB9KTtcblx0fVxuXG5cdGFzeW5jIGdldERlY29kZWRTdHJlYW0ocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmFsdWU6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0sIG9wdGlvbnM/OiBJUmVhZFRleHRGaWxlRW5jb2RpbmdPcHRpb25zKTogUHJvbWlzZTxSZWFkYWJsZVN0cmVhbTxzdHJpbmc+PiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLmRvR2V0RGVjb2RlZFN0cmVhbShyZXNvdXJjZSwgdmFsdWUsIG9wdGlvbnMpKS5zdHJlYW07XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0RGVjb2RlZFN0cmVhbShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBzdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0sIG9wdGlvbnM/OiBJUmVhZFRleHRGaWxlRW5jb2RpbmdPcHRpb25zKTogUHJvbWlzZTxJRGVjb2RlU3RyZWFtUmVzdWx0PiB7XG5cblx0XHQvLyByZWFkIHRocm91Z2ggZW5jb2RpbmcgbGlicmFyeVxuXHRcdHJldHVybiB0b0RlY29kZVN0cmVhbShzdHJlYW0sIHtcblx0XHRcdGFjY2VwdFRleHRPbmx5OiBvcHRpb25zPy5hY2NlcHRUZXh0T25seSA/PyBmYWxzZSxcblx0XHRcdGd1ZXNzRW5jb2Rpbmc6XG5cdFx0XHRcdG9wdGlvbnM/LmF1dG9HdWVzc0VuY29kaW5nIHx8XG5cdFx0XHRcdHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocmVzb3VyY2UsICdmaWxlcy5hdXRvR3Vlc3NFbmNvZGluZycpLFxuXHRcdFx0Y2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6XG5cdFx0XHRcdG9wdGlvbnM/LmNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzIHx8XG5cdFx0XHRcdHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocmVzb3VyY2UsICdmaWxlcy5jYW5kaWRhdGVHdWVzc0VuY29kaW5ncycpLFxuXHRcdFx0b3ZlcndyaXRlRW5jb2Rpbmc6IGFzeW5jIGRldGVjdGVkRW5jb2RpbmcgPT4gdGhpcy52YWxpZGF0ZURldGVjdGVkRW5jb2RpbmcocmVzb3VyY2UsIGRldGVjdGVkRW5jb2RpbmcgPz8gdW5kZWZpbmVkLCBvcHRpb25zKVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0RW5jb2RpbmcocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbW9kZWwgPSByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgPyB0aGlzLnVudGl0bGVkLmdldChyZXNvdXJjZSkgOiB0aGlzLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIG1vZGVsPy5nZXRFbmNvZGluZygpID8/IHRoaXMuZW5jb2RpbmcuZ2V0VW52YWxpZGF0ZWRFbmNvZGluZ0ZvclJlc291cmNlKHJlc291cmNlKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVEZWNvZGluZyhyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSVJlYWRUZXh0RmlsZUVuY29kaW5nT3B0aW9ucyk6IFByb21pc2U8eyBwcmVmZXJyZWRFbmNvZGluZzogc3RyaW5nOyBndWVzc0VuY29kaW5nOiBib29sZWFuOyBjYW5kaWRhdGVHdWVzc0VuY29kaW5nczogc3RyaW5nW10gfT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmVmZXJyZWRFbmNvZGluZzogKGF3YWl0IHRoaXMuZW5jb2RpbmcuZ2V0UHJlZmVycmVkUmVhZEVuY29kaW5nKHJlc291cmNlLCBvcHRpb25zLCB1bmRlZmluZWQpKS5lbmNvZGluZyxcblx0XHRcdGd1ZXNzRW5jb2Rpbmc6XG5cdFx0XHRcdG9wdGlvbnM/LmF1dG9HdWVzc0VuY29kaW5nIHx8XG5cdFx0XHRcdHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocmVzb3VyY2UsICdmaWxlcy5hdXRvR3Vlc3NFbmNvZGluZycpLFxuXHRcdFx0Y2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6XG5cdFx0XHRcdG9wdGlvbnM/LmNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzIHx8XG5cdFx0XHRcdHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocmVzb3VyY2UsICdmaWxlcy5jYW5kaWRhdGVHdWVzc0VuY29kaW5ncycpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyB2YWxpZGF0ZURldGVjdGVkRW5jb2RpbmcocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgZGV0ZWN0ZWRFbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSVJlYWRUZXh0RmlsZUVuY29kaW5nT3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgeyBlbmNvZGluZyB9ID0gYXdhaXQgdGhpcy5lbmNvZGluZy5nZXRQcmVmZXJyZWRSZWFkRW5jb2RpbmcocmVzb3VyY2UsIG9wdGlvbnMsIGRldGVjdGVkRW5jb2RpbmcpO1xuXG5cdFx0cmV0dXJuIGVuY29kaW5nO1xuXHR9XG5cblx0cmVzb2x2ZUVuY29kaW5nKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJV3JpdGVUZXh0RmlsZU9wdGlvbnMpOiBQcm9taXNlPHsgZW5jb2Rpbmc6IHN0cmluZzsgYWRkQk9NOiBib29sZWFuIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5lbmNvZGluZy5nZXRXcml0ZUVuY29kaW5nKHJlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIHNhdmVcblxuXHRhc3luYyBzYXZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJVGV4dEZpbGVTYXZlT3B0aW9ucyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBVbnRpdGxlZFxuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy51bnRpdGxlZC5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGxldCB0YXJnZXRVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBVbnRpdGxlZCB3aXRoIGFzc29jaWF0ZWQgZmlsZSBwYXRoIGRvbid0IG5lZWQgdG8gcHJvbXB0XG5cdFx0XHRcdGlmIChtb2RlbC5oYXNBc3NvY2lhdGVkRmlsZVBhdGgpIHtcblx0XHRcdFx0XHR0YXJnZXRVcmkgPSBhd2FpdCB0aGlzLnN1Z2dlc3RTYXZlUGF0aChyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPdGhlcndpc2UgYXNrIHVzZXJcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dGFyZ2V0VXJpID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5waWNrRmlsZVRvU2F2ZShhd2FpdCB0aGlzLnN1Z2dlc3RTYXZlUGF0aChyZXNvdXJjZSksIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNhdmUgYXMgaWYgdGFyZ2V0IHByb3ZpZGVkXG5cdFx0XHRcdGlmICh0YXJnZXRVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5zYXZlQXMocmVzb3VyY2UsIHRhcmdldFVyaSwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaWxlXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZmlsZXMuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgbW9kZWwuc2F2ZShvcHRpb25zKSA/IHJlc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBzYXZlQXMoc291cmNlOiBVUkksIHRhcmdldD86IFVSSSwgb3B0aW9ucz86IElUZXh0RmlsZVNhdmVBc09wdGlvbnMpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Ly8gR2V0IHRvIHRhcmdldCByZXNvdXJjZVxuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHR0YXJnZXQgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlVG9TYXZlKGF3YWl0IHRoaXMuc3VnZ2VzdFNhdmVQYXRoKG9wdGlvbnM/LnN1Z2dlc3RlZFRhcmdldCA/PyBzb3VyY2UpLCBvcHRpb25zPy5hdmFpbGFibGVGaWxlU3lzdGVtcyk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybjsgLy8gdXNlciBjYW5jZWxlZFxuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB0YXJnZXQgaXMgbm90IG1hcmtlZCBhcyByZWFkb25seSBhbmQgcHJvbXB0IG90aGVyd2lzZVxuXHRcdGlmICh0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaXNSZWFkb25seSh0YXJnZXQpKSB7XG5cdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmNvbmZpcm1NYWtlV3JpdGVhYmxlKHRhcmdldCk7XG5cdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUmVhZG9ubHkodGFyZ2V0LCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSnVzdCBzYXZlIGlmIHRhcmdldCBpcyBzYW1lIGFzIG1vZGVscyBvd24gcmVzb3VyY2Vcblx0XHRpZiAoaXNFcXVhbChzb3VyY2UsIHRhcmdldCkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNhdmUoc291cmNlLCB7IC4uLm9wdGlvbnMsIGZvcmNlOiB0cnVlICAvKiBmb3JjZSB0byBzYXZlLCBldmVuIGlmIG5vdCBkaXJ0eSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk5NjE5KSAqLyB9KTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgdGFyZ2V0IGlzIGRpZmZlcmVudCBidXQgb2Ygc2FtZSBpZGVudGl0eSwgd2Vcblx0XHQvLyBtb3ZlIHRoZSBzb3VyY2UgdG8gdGhlIHRhcmdldCwga25vd2luZyB0aGF0IHRoZVxuXHRcdC8vIHVuZGVybHlpbmcgZmlsZSBzeXN0ZW0gY2Fubm90IGhhdmUgYm90aCBhbmQgdGhlbiBzYXZlLlxuXHRcdC8vIEhvd2V2ZXIsIHRoaXMgd2lsbCBvbmx5IHdvcmsgaWYgdGhlIHNvdXJjZSBleGlzdHNcblx0XHQvLyBhbmQgaXMgbm90IG9ycGhhbmVkLCBzbyB3ZSBuZWVkIHRvIGNoZWNrIHRoYXQgdG9vLlxuXHRcdGlmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHNvdXJjZSkgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc291cmNlLCB0YXJnZXQpICYmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhzb3VyY2UpKSkge1xuXHRcdFx0YXdhaXQgdGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm1vdmUoW3sgZmlsZTogeyBzb3VyY2UsIHRhcmdldCB9IH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB3ZSBkb24ndCBrbm93IHdoZXRoZXIgd2UgaGF2ZSBhXG5cdFx0XHQvLyBtb2RlbCBmb3IgdGhlIHNvdXJjZSBvciB0aGUgdGFyZ2V0IFVSSSBzbyB3ZVxuXHRcdFx0Ly8gc2ltcGx5IHRyeSB0byBzYXZlIHdpdGggYm90aCByZXNvdXJjZXMuXG5cdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5zYXZlKHNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zYXZlKHRhcmdldCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0fVxuXG5cdFx0Ly8gRG8gaXRcblx0XHRyZXR1cm4gdGhpcy5kb1NhdmVBcyhzb3VyY2UsIHRhcmdldCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZUFzKHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3B0aW9ucz86IElUZXh0RmlsZVNhdmVPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgc3VjY2VzcyA9IGZhbHNlO1xuXG5cdFx0bGV0IHJlc29sdmVkVGV4dE1vZGVsOiBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsIHwgSVJlc29sdmVkVW50aXRsZWRUZXh0RWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdGNvbnN0IHRleHRGaWxlTW9kZWwgPSB0aGlzLmZpbGVzLmdldChzb3VyY2UpO1xuXHRcdFx0aWYgKHRleHRGaWxlTW9kZWw/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRyZXNvbHZlZFRleHRNb2RlbCA9IHRleHRGaWxlTW9kZWw7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHVudGl0bGVkVGV4dE1vZGVsID0gdGhpcy51bnRpdGxlZC5nZXQoc291cmNlKTtcblx0XHRcdGlmICh1bnRpdGxlZFRleHRNb2RlbD8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdHJlc29sdmVkVGV4dE1vZGVsID0gdW50aXRsZWRUZXh0TW9kZWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHNvdXJjZSBpcyBhbiBleGlzdGluZyByZXNvbHZlZCBmaWxlIG9yIHVudGl0bGVkIHRleHQgbW9kZWwsIHdlIGNhblxuXHRcdC8vIGRpcmVjdGx5IHVzZSB0aGF0IG1vZGVsIHRvIGNvcHkgdGhlIGNvbnRlbnRzIHRvIHRoZSB0YXJnZXQgZGVzdGluYXRpb25cblx0XHRpZiAocmVzb2x2ZWRUZXh0TW9kZWwpIHtcblx0XHRcdHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmRvU2F2ZUFzVGV4dEZpbGUocmVzb2x2ZWRUZXh0TW9kZWwsIHNvdXJjZSwgdGFyZ2V0LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgaWYgdGhlIHNvdXJjZSBjYW4gYmUgaGFuZGxlZCBieSB0aGUgZmlsZSBzZXJ2aWNlXG5cdFx0Ly8gd2UgY2FuIHNpbXBseSBpbnZva2UgdGhlIGNvcHkoKSBmdW5jdGlvbiB0byBzYXZlIGFzXG5cdFx0ZWxzZSBpZiAodGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihzb3VyY2UpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNvcHkoc291cmNlLCB0YXJnZXQsIHRydWUpO1xuXG5cdFx0XHRzdWNjZXNzID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBGaW5hbGx5IHdlIHNpbXBseSBjaGVjayBpZiB3ZSBjYW4gZmluZCBhIGVkaXRvciBtb2RlbCB0aGF0XG5cdFx0Ly8gd291bGQgZ2l2ZSB1cyBhY2Nlc3MgdG8gdGhlIGNvbnRlbnRzLlxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwoc291cmNlKTtcblx0XHRcdGlmICh0ZXh0TW9kZWwpIHtcblx0XHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuZG9TYXZlQXNUZXh0RmlsZSh0ZXh0TW9kZWwsIHNvdXJjZSwgdGFyZ2V0LCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmV2ZXJ0IHRoZSBzb3VyY2Vcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXZlcnQoc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBJdCBpcyBwb3NzaWJsZSB0aGF0IHJldmVydGluZyB0aGUgc291cmNlIGZhaWxzLCBmb3IgZXhhbXBsZVxuXHRcdFx0Ly8gd2hlbiBhIHJlbW90ZSBpcyBkaXNjb25uZWN0ZWQgYW5kIHdlIGNhbm5vdCByZWFkIGl0IGFueW1vcmUuXG5cdFx0XHQvLyBIb3dldmVyLCB0aGlzIHNob3VsZCBub3QgaW50ZXJydXB0IHRoZSBcIlNhdmUgQXNcIiBmbG93LCBzb1xuXHRcdFx0Ly8gd2UgZ3JhY2VmdWxseSBjYXRjaCB0aGUgZXJyb3IgYW5kIGp1c3QgbG9nIGl0LlxuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblxuXHRcdC8vIEV2ZW50c1xuXHRcdGlmIChzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHR0aGlzLnVudGl0bGVkLm5vdGlmeURpZFNhdmUoc291cmNlLCB0YXJnZXQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZUFzVGV4dEZpbGUoc291cmNlTW9kZWw6IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCB8IElSZXNvbHZlZFVudGl0bGVkVGV4dEVkaXRvck1vZGVsIHwgSVRleHRNb2RlbCwgc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvcHRpb25zPzogSVRleHRGaWxlU2F2ZU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIEZpbmQgc291cmNlIGVuY29kaW5nIGlmIGFueVxuXHRcdGxldCBzb3VyY2VNb2RlbEVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc291cmNlTW9kZWxXaXRoRW5jb2RpbmdTdXBwb3J0ID0gKHNvdXJjZU1vZGVsIGFzIHVua25vd24gYXMgSUVuY29kaW5nU3VwcG9ydCk7XG5cdFx0aWYgKHR5cGVvZiBzb3VyY2VNb2RlbFdpdGhFbmNvZGluZ1N1cHBvcnQuZ2V0RW5jb2RpbmcgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHNvdXJjZU1vZGVsRW5jb2RpbmcgPSBzb3VyY2VNb2RlbFdpdGhFbmNvZGluZ1N1cHBvcnQuZ2V0RW5jb2RpbmcoKTtcblx0XHR9XG5cblx0XHQvLyBQcmVmZXIgYW4gZXhpc3RpbmcgbW9kZWwgaWYgaXQgaXMgYWxyZWFkeSByZXNvbHZlZCBmb3IgdGhlIGdpdmVuIHRhcmdldCByZXNvdXJjZVxuXHRcdGxldCB0YXJnZXRFeGlzdHMgPSBmYWxzZTtcblx0XHRsZXQgdGFyZ2V0TW9kZWwgPSB0aGlzLmZpbGVzLmdldCh0YXJnZXQpO1xuXHRcdGlmICh0YXJnZXRNb2RlbD8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHR0YXJnZXRFeGlzdHMgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBjcmVhdGUgdGhlIHRhcmdldCBmaWxlIGVtcHR5IGlmIGl0IGRvZXMgbm90IGV4aXN0IGFscmVhZHkgYW5kIHJlc29sdmUgaXQgZnJvbSB0aGVyZVxuXHRcdGVsc2Uge1xuXHRcdFx0dGFyZ2V0RXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModGFyZ2V0KTtcblxuXHRcdFx0Ly8gY3JlYXRlIHRhcmdldCBmaWxlIGFkaG9jIGlmIGl0IGRvZXMgbm90IGV4aXN0IHlldFxuXHRcdFx0aWYgKCF0YXJnZXRFeGlzdHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGUoW3sgcmVzb3VyY2U6IHRhcmdldCwgdmFsdWU6ICcnIH1dKTtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGFyZ2V0TW9kZWwgPSBhd2FpdCB0aGlzLmZpbGVzLnJlc29sdmUodGFyZ2V0LCB7IGVuY29kaW5nOiBzb3VyY2VNb2RlbEVuY29kaW5nIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gaWYgdGhlIHRhcmdldCBhbHJlYWR5IGV4aXN0cyBhbmQgd2FzIG5vdCBjcmVhdGVkIGJ5IHVzLCBpdCBpcyBwb3NzaWJsZVxuXHRcdFx0XHQvLyB0aGF0IHdlIGNhbm5vdCByZXNvbHZlIHRoZSB0YXJnZXQgYXMgdGV4dCBtb2RlbCBpZiBpdCBpcyBiaW5hcnkgb3IgdG9vXG5cdFx0XHRcdC8vIGxhcmdlLiBpbiB0aGF0IGNhc2Ugd2UgaGF2ZSB0byBkZWxldGUgdGhlIHRhcmdldCBmaWxlIGZpcnN0IGFuZCB0aGVuXG5cdFx0XHRcdC8vIHJlLXJ1biB0aGUgb3BlcmF0aW9uLlxuXHRcdFx0XHRpZiAodGFyZ2V0RXhpc3RzKSB7XG5cdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0KDxUZXh0RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS50ZXh0RmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gVGV4dEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JU19CSU5BUlkgfHxcblx0XHRcdFx0XHRcdCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh0YXJnZXQpO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb1NhdmVBc1RleHRGaWxlKHNvdXJjZU1vZGVsLCBzb3VyY2UsIHRhcmdldCwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29uZmlybSB0byBvdmVyd3JpdGUgaWYgd2UgaGF2ZSBhbiB1bnRpdGxlZCBmaWxlIHdpdGggYXNzb2NpYXRlZCBmaWxlIHdoZXJlXG5cdFx0Ly8gdGhlIGZpbGUgYWN0dWFsbHkgZXhpc3RzIG9uIGRpc2sgYW5kIHdlIGFyZSBpbnN0cnVjdGVkIHRvIHNhdmUgdG8gdGhhdCBmaWxlXG5cdFx0Ly8gcGF0aC4gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSBmaWxlIHdhcyBjcmVhdGVkIGFmdGVyIHRoZSB1bnRpdGxlZCBmaWxlIHdhcyBvcGVuZWQuXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82Nzk0NlxuXHRcdGxldCB3cml0ZTogYm9vbGVhbjtcblx0XHRpZiAoc291cmNlTW9kZWwgaW5zdGFuY2VvZiBVbnRpdGxlZFRleHRFZGl0b3JNb2RlbCAmJiBzb3VyY2VNb2RlbC5oYXNBc3NvY2lhdGVkRmlsZVBhdGggJiYgdGFyZ2V0RXhpc3RzICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRhcmdldCwgdG9Mb2NhbFJlc291cmNlKHNvdXJjZU1vZGVsLnJlc291cmNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksIHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSkpKSB7XG5cdFx0XHR3cml0ZSA9IGF3YWl0IHRoaXMuY29uZmlybU92ZXJ3cml0ZSh0YXJnZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3cml0ZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCF3cml0ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBzb3VyY2VUZXh0TW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHNvdXJjZU1vZGVsIGluc3RhbmNlb2YgQmFzZVRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0aWYgKHNvdXJjZU1vZGVsLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRzb3VyY2VUZXh0TW9kZWwgPSBzb3VyY2VNb2RlbC50ZXh0RWRpdG9yTW9kZWwgPz8gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzb3VyY2VUZXh0TW9kZWwgPSBzb3VyY2VNb2RlbCBhcyBJVGV4dE1vZGVsO1xuXHRcdH1cblxuXHRcdGxldCB0YXJnZXRUZXh0TW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRhcmdldE1vZGVsLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0dGFyZ2V0VGV4dE1vZGVsID0gdGFyZ2V0TW9kZWwudGV4dEVkaXRvck1vZGVsO1xuXHRcdH1cblxuXHRcdC8vIHRha2Ugb3ZlciBtb2RlbCB2YWx1ZSwgZW5jb2RpbmcgYW5kIGxhbmd1YWdlIChvbmx5IGlmIG1vcmUgc3BlY2lmaWMpIGZyb20gc291cmNlIG1vZGVsXG5cdFx0aWYgKHNvdXJjZVRleHRNb2RlbCAmJiB0YXJnZXRUZXh0TW9kZWwpIHtcblxuXHRcdFx0Ly8gZW5jb2Rpbmdcblx0XHRcdHRhcmdldE1vZGVsLnVwZGF0ZVByZWZlcnJlZEVuY29kaW5nKHNvdXJjZU1vZGVsRW5jb2RpbmcpO1xuXG5cdFx0XHQvLyBjb250ZW50XG5cdFx0XHR0aGlzLm1vZGVsU2VydmljZS51cGRhdGVNb2RlbCh0YXJnZXRUZXh0TW9kZWwsIGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90KHNvdXJjZVRleHRNb2RlbC5jcmVhdGVTbmFwc2hvdCgpKSk7XG5cblx0XHRcdC8vIGxhbmd1YWdlXG5cdFx0XHRjb25zdCBzb3VyY2VMYW5ndWFnZUlkID0gc291cmNlVGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdGNvbnN0IHRhcmdldExhbmd1YWdlSWQgPSB0YXJnZXRUZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0aWYgKHNvdXJjZUxhbmd1YWdlSWQgIT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCAmJiB0YXJnZXRMYW5ndWFnZUlkID09PSBQTEFJTlRFWFRfTEFOR1VBR0VfSUQpIHtcblx0XHRcdFx0dGFyZ2V0VGV4dE1vZGVsLnNldExhbmd1YWdlKHNvdXJjZUxhbmd1YWdlSWQpOyAvLyBvbmx5IHVzZSBpZiBtb3JlIHNwZWNpZmljIHRoYW4gcGxhaW4vdGV4dFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBpbmRlbnRhdGlvbiBvcHRpb25zIChwcmVzZXJ2ZSB0YWJzIHZzIHNwYWNlcywgdGFiIHNpemUsIGluZGVudCBzaXplKVxuXHRcdFx0Y29uc3Qgc291cmNlT3B0aW9ucyA9IHNvdXJjZVRleHRNb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0XHR0YXJnZXRUZXh0TW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdHRhYlNpemU6IHNvdXJjZU9wdGlvbnMudGFiU2l6ZSxcblx0XHRcdFx0aW5kZW50U2l6ZTogc291cmNlT3B0aW9ucy5pbmRlbnRTaXplLFxuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IHNvdXJjZU9wdGlvbnMuaW5zZXJ0U3BhY2VzXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gZW5kIG9mIGxpbmUgc2VxdWVuY2UgKHByZXNlcnZlIExGIHZzIENSTEYpXG5cdFx0XHRjb25zdCBzb3VyY2VFT0wgPSBzb3VyY2VUZXh0TW9kZWwuZ2V0RW5kT2ZMaW5lU2VxdWVuY2UoKTtcblx0XHRcdHRhcmdldFRleHRNb2RlbC5zZXRFT0woc291cmNlRU9MKTtcblxuXHRcdFx0Ly8gdHJhbnNpZW50IHByb3BlcnRpZXNcblx0XHRcdGNvbnN0IHNvdXJjZVRyYW5zaWVudFByb3BlcnRpZXMgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmdldFRyYW5zaWVudE1vZGVsUHJvcGVydGllcyhzb3VyY2VUZXh0TW9kZWwpO1xuXHRcdFx0aWYgKHNvdXJjZVRyYW5zaWVudFByb3BlcnRpZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2Ygc291cmNlVHJhbnNpZW50UHJvcGVydGllcykge1xuXHRcdFx0XHRcdHRoaXMuY29kZUVkaXRvclNlcnZpY2Uuc2V0VHJhbnNpZW50TW9kZWxQcm9wZXJ0eSh0YXJnZXRUZXh0TW9kZWwsIGtleSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc2V0IHNvdXJjZSBvcHRpb25zIGRlcGVuZGluZyBvbiB0YXJnZXQgZXhpc3RzIG9yIG5vdFxuXHRcdGlmICghb3B0aW9ucz8uc291cmNlKSB7XG5cdFx0XHRvcHRpb25zID0ge1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRzb3VyY2U6IHRhcmdldEV4aXN0cyA/IEFic3RyYWN0VGV4dEZpbGVTZXJ2aWNlLlRFWFRGSUxFX1NBVkVfUkVQTEFDRV9TT1VSQ0UgOiBBYnN0cmFjdFRleHRGaWxlU2VydmljZS5URVhURklMRV9TQVZFX0NSRUFURV9TT1VSQ0Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gc2F2ZSBtb2RlbFxuXHRcdHJldHVybiB0YXJnZXRNb2RlbC5zYXZlKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRmcm9tOiBzb3VyY2Vcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybU92ZXJ3cml0ZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtT3ZlcndyaXRlJywgXCInezB9JyBhbHJlYWR5IGV4aXN0cy4gRG8geW91IHdhbnQgdG8gcmVwbGFjZSBpdD9cIiwgYmFzZW5hbWUocmVzb3VyY2UpKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ292ZXJ3cml0ZUlycmV2ZXJzaWJsZScsIFwiQSBmaWxlIG9yIGZvbGRlciB3aXRoIHRoZSBuYW1lICd7MH0nIGFscmVhZHkgZXhpc3RzIGluIHRoZSBmb2xkZXIgJ3sxfScuIFJlcGxhY2luZyBpdCB3aWxsIG92ZXJ3cml0ZSBpdHMgY3VycmVudCBjb250ZW50cy5cIiwgYmFzZW5hbWUocmVzb3VyY2UpLCBiYXNlbmFtZShkaXJuYW1lKHJlc291cmNlKSkpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZXBsYWNlQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBsYWNlXCIpLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNvbmZpcm1lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybU1ha2VXcml0ZWFibGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybU1ha2VXcml0ZWFibGUnLCBcIid7MH0nIGlzIG1hcmtlZCBhcyByZWFkLW9ubHkuIERvIHlvdSB3YW50IHRvIHNhdmUgYW55d2F5P1wiLCBiYXNlbmFtZShyZXNvdXJjZSkpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybU1ha2VXcml0ZWFibGVEZXRhaWwnLCBcIlBhdGhzIGNhbiBiZSBjb25maWd1cmVkIGFzIHJlYWQtb25seSB2aWEgc2V0dGluZ3MuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdtYWtlV3JpdGVhYmxlQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTYXZlIEFueXdheVwiKVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNvbmZpcm1lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3VnZ2VzdFNhdmVQYXRoKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXG5cdFx0Ly8gSnVzdCB0YWtlIHRoZSByZXNvdXJjZSBhcyBpcyBpZiB0aGUgZmlsZSBzZXJ2aWNlIGNhbiBoYW5kbGUgaXRcblx0XHRpZiAodGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0Y29uc3QgZGVmYXVsdEZpbGVQYXRoID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKTtcblxuXHRcdC8vIE90aGVyd2lzZSB0cnkgdG8gc3VnZ2VzdCBhIHBhdGggdGhhdCBjYW4gYmUgc2F2ZWRcblx0XHRsZXQgc3VnZ2VzdGVkRmlsZW5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMudW50aXRsZWQuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXG5cdFx0XHRcdC8vIFVudGl0bGVkIHdpdGggYXNzb2NpYXRlZCBmaWxlIHBhdGhcblx0XHRcdFx0aWYgKG1vZGVsLmhhc0Fzc29jaWF0ZWRGaWxlUGF0aCkge1xuXHRcdFx0XHRcdHJldHVybiB0b0xvY2FsUmVzb3VyY2UocmVzb3VyY2UsIHJlbW90ZUF1dGhvcml0eSwgdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVudGl0bGVkIHdpdGhvdXQgYXNzb2NpYXRlZCBmaWxlIHBhdGg6IHVzZSBuYW1lXG5cdFx0XHRcdC8vIG9mIHVudGl0bGVkIG1vZGVsIGlmIGl0IGlzIGEgdmFsaWQgcGF0aCBuYW1lIGFuZFxuXHRcdFx0XHQvLyBmaWd1cmUgb3V0IHRoZSBmaWxlIGV4dGVuc2lvbiBmcm9tIHRoZSBtb2RlIGlmIGFueS5cblxuXHRcdFx0XHRsZXQgbmFtZUNhbmRpZGF0ZTogc3RyaW5nO1xuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5wYXRoU2VydmljZS5oYXNWYWxpZEJhc2VuYW1lKGpvaW5QYXRoKGRlZmF1bHRGaWxlUGF0aCwgbW9kZWwubmFtZSksIG1vZGVsLm5hbWUpKSB7XG5cdFx0XHRcdFx0bmFtZUNhbmRpZGF0ZSA9IG1vZGVsLm5hbWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmFtZUNhbmRpZGF0ZSA9IGJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRcdGlmIChsYW5ndWFnZUlkICYmIGxhbmd1YWdlSWQgIT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCkge1xuXHRcdFx0XHRcdHN1Z2dlc3RlZEZpbGVuYW1lID0gdGhpcy5zdWdnZXN0RmlsZW5hbWUobGFuZ3VhZ2VJZCwgbmFtZUNhbmRpZGF0ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3VnZ2VzdGVkRmlsZW5hbWUgPSBuYW1lQ2FuZGlkYXRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbGJhY2sgdG8gYmFzZW5hbWUgb2YgcmVzb3VyY2Vcblx0XHRpZiAoIXN1Z2dlc3RlZEZpbGVuYW1lKSB7XG5cdFx0XHRzdWdnZXN0ZWRGaWxlbmFtZSA9IGJhc2VuYW1lKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gcGxhY2Ugd2hlcmUgbGFzdCBhY3RpdmUgZmlsZSB3YXMgaWYgYW55XG5cdFx0Ly8gT3RoZXJ3aXNlIGZhbGxiYWNrIHRvIHVzZXIgaG9tZVxuXHRcdHJldHVybiBqb2luUGF0aChkZWZhdWx0RmlsZVBhdGgsIHN1Z2dlc3RlZEZpbGVuYW1lKTtcblx0fVxuXG5cdHN1Z2dlc3RGaWxlbmFtZShsYW5ndWFnZUlkOiBzdHJpbmcsIHVudGl0bGVkTmFtZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VOYW1lID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGxhbmd1YWdlSWQpO1xuXHRcdGlmICghbGFuZ3VhZ2VOYW1lKSB7XG5cdFx0XHRyZXR1cm4gdW50aXRsZWROYW1lOyAvLyB1bmtub3duIGxhbmd1YWdlLCBzbyB3ZSBjYW5ub3Qgc3VnZ2VzdCBhIGJldHRlciBuYW1lXG5cdFx0fVxuXG5cdFx0Y29uc3QgdW50aXRsZWRFeHRlbnNpb24gPSBwYXRoRXh0bmFtZSh1bnRpdGxlZE5hbWUpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldEV4dGVuc2lvbnMobGFuZ3VhZ2VJZCk7XG5cdFx0aWYgKGV4dGVuc2lvbnMuaW5jbHVkZXModW50aXRsZWRFeHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW50aXRsZWROYW1lOyAvLyBwcmVzZXJ2ZSBleHRlbnNpb24gaWYgaXQgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBtb2RlXG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpbWFyeUV4dGVuc2lvbiA9IGV4dGVuc2lvbnMuYXQoMCk7XG5cdFx0aWYgKHByaW1hcnlFeHRlbnNpb24pIHtcblx0XHRcdGlmICh1bnRpdGxlZEV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gYCR7dW50aXRsZWROYW1lLnN1YnN0cmluZygwLCB1bnRpdGxlZE5hbWUuaW5kZXhPZih1bnRpdGxlZEV4dGVuc2lvbikpfSR7cHJpbWFyeUV4dGVuc2lvbn1gO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYCR7dW50aXRsZWROYW1lfSR7cHJpbWFyeUV4dGVuc2lvbn1gO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVuYW1lcyA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldEZpbGVuYW1lcyhsYW5ndWFnZUlkKTtcblx0XHRpZiAoZmlsZW5hbWVzLmluY2x1ZGVzKHVudGl0bGVkTmFtZSkpIHtcblx0XHRcdHJldHVybiB1bnRpdGxlZE5hbWU7IC8vIHByZXNlcnZlIG5hbWUgaWYgaXQgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBtb2RlXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbGVuYW1lcy5hdCgwKSA/PyB1bnRpdGxlZE5hbWU7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gcmV2ZXJ0XG5cblx0YXN5bmMgcmV2ZXJ0KHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gVW50aXRsZWRcblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMudW50aXRsZWQuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwucmV2ZXJ0KG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbGVcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5maWxlcy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKG1vZGVsICYmIChtb2RlbC5pc0RpcnR5KCkgfHwgb3B0aW9ucz8uZm9yY2UpKSB7XG5cdFx0XHRcdHJldHVybiBtb2RlbC5yZXZlcnQob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGRpcnR5XG5cblx0aXNEaXJ0eShyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWwgPSByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgPyB0aGlzLnVudGl0bGVkLmdldChyZXNvdXJjZSkgOiB0aGlzLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWwuaXNEaXJ0eSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFbmNvZGluZ092ZXJyaWRlIHtcblx0cGFyZW50PzogVVJJO1xuXHRleHRlbnNpb24/OiBzdHJpbmc7XG5cdGVuY29kaW5nOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBFbmNvZGluZ09yYWNsZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUmVzb3VyY2VFbmNvZGluZ3Mge1xuXG5cdHByaXZhdGUgX2VuY29kaW5nT3ZlcnJpZGVzOiBJRW5jb2RpbmdPdmVycmlkZVtdO1xuXHRwcm90ZWN0ZWQgZ2V0IGVuY29kaW5nT3ZlcnJpZGVzKCk6IElFbmNvZGluZ092ZXJyaWRlW10geyByZXR1cm4gdGhpcy5fZW5jb2RpbmdPdmVycmlkZXM7IH1cblx0cHJvdGVjdGVkIHNldCBlbmNvZGluZ092ZXJyaWRlcyh2YWx1ZTogSUVuY29kaW5nT3ZlcnJpZGVbXSkgeyB0aGlzLl9lbmNvZGluZ092ZXJyaWRlcyA9IHZhbHVlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2VuY29kaW5nT3ZlcnJpZGVzID0gdGhpcy5nZXREZWZhdWx0RW5jb2RpbmdPdmVycmlkZXMoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBXb3Jrc3BhY2UgRm9sZGVyIENoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMuZW5jb2RpbmdPdmVycmlkZXMgPSB0aGlzLmdldERlZmF1bHRFbmNvZGluZ092ZXJyaWRlcygpKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlZmF1bHRFbmNvZGluZ092ZXJyaWRlcygpOiBJRW5jb2RpbmdPdmVycmlkZVtdIHtcblx0XHRjb25zdCBkZWZhdWx0RW5jb2RpbmdPdmVycmlkZXM6IElFbmNvZGluZ092ZXJyaWRlW10gPSBbXTtcblxuXHRcdC8vIEdsb2JhbCBzZXR0aW5nc1xuXHRcdGRlZmF1bHRFbmNvZGluZ092ZXJyaWRlcy5wdXNoKHsgcGFyZW50OiB0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCBlbmNvZGluZzogVVRGOCB9KTtcblxuXHRcdC8vIFdvcmtzcGFjZSBmaWxlcyAodmlhIGV4dGVuc2lvbiBhbmQgdmlhIHVudGl0bGVkIHdvcmtzcGFjZXMgbG9jYXRpb24pXG5cdFx0ZGVmYXVsdEVuY29kaW5nT3ZlcnJpZGVzLnB1c2goeyBleHRlbnNpb246IFdPUktTUEFDRV9FWFRFTlNJT04sIGVuY29kaW5nOiBVVEY4IH0pO1xuXHRcdGRlZmF1bHRFbmNvZGluZ092ZXJyaWRlcy5wdXNoKHsgcGFyZW50OiB0aGlzLmVudmlyb25tZW50U2VydmljZS51bnRpdGxlZFdvcmtzcGFjZXNIb21lLCBlbmNvZGluZzogVVRGOCB9KTtcblxuXHRcdC8vIEZvbGRlciBTZXR0aW5nc1xuXHRcdHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5mb3JFYWNoKGZvbGRlciA9PiB7XG5cdFx0XHRkZWZhdWx0RW5jb2RpbmdPdmVycmlkZXMucHVzaCh7IHBhcmVudDogam9pblBhdGgoZm9sZGVyLnVyaSwgJy52c2NvZGUnKSwgZW5jb2Rpbmc6IFVURjggfSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGVmYXVsdEVuY29kaW5nT3ZlcnJpZGVzO1xuXHR9XG5cblx0YXN5bmMgZ2V0V3JpdGVFbmNvZGluZyhyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSVdyaXRlVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTx7IGVuY29kaW5nOiBzdHJpbmc7IGFkZEJPTTogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3QgeyBlbmNvZGluZywgaGFzQk9NIH0gPSBhd2FpdCB0aGlzLmdldFByZWZlcnJlZFdyaXRlRW5jb2RpbmcocmVzb3VyY2UsIG9wdGlvbnMgPyBvcHRpb25zLmVuY29kaW5nIDogdW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB7IGVuY29kaW5nLCBhZGRCT006IGhhc0JPTSB9O1xuXHR9XG5cblx0YXN5bmMgZ2V0UHJlZmVycmVkV3JpdGVFbmNvZGluZyhyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBwcmVmZXJyZWRFbmNvZGluZz86IHN0cmluZyk6IFByb21pc2U8SVJlc291cmNlRW5jb2Rpbmc+IHtcblx0XHRjb25zdCByZXNvdXJjZUVuY29kaW5nID0gYXdhaXQgdGhpcy5nZXRWYWxpZGF0ZWRFbmNvZGluZ0ZvclJlc291cmNlKHJlc291cmNlLCBwcmVmZXJyZWRFbmNvZGluZyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5jb2Rpbmc6IHJlc291cmNlRW5jb2RpbmcsXG5cdFx0XHRoYXNCT006IHJlc291cmNlRW5jb2RpbmcgPT09IFVURjE2YmUgfHwgcmVzb3VyY2VFbmNvZGluZyA9PT0gVVRGMTZsZSB8fCByZXNvdXJjZUVuY29kaW5nID09PSBVVEY4X3dpdGhfYm9tIC8vIGVuZm9yY2UgQk9NIGZvciBjZXJ0YWluIGVuY29kaW5nc1xuXHRcdH07XG5cdH1cblxuXHRhc3luYyBnZXRQcmVmZXJyZWRSZWFkRW5jb2RpbmcocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElSZWFkVGV4dEZpbGVFbmNvZGluZ09wdGlvbnMsIGRldGVjdGVkRW5jb2Rpbmc/OiBzdHJpbmcpOiBQcm9taXNlPElSZXNvdXJjZUVuY29kaW5nPiB7XG5cdFx0bGV0IHByZWZlcnJlZEVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBFbmNvZGluZyBwYXNzZWQgaW4gYXMgb3B0aW9uXG5cdFx0aWYgKG9wdGlvbnM/LmVuY29kaW5nKSB7XG5cdFx0XHRpZiAoZGV0ZWN0ZWRFbmNvZGluZyA9PT0gVVRGOF93aXRoX2JvbSAmJiBvcHRpb25zLmVuY29kaW5nID09PSBVVEY4KSB7XG5cdFx0XHRcdHByZWZlcnJlZEVuY29kaW5nID0gVVRGOF93aXRoX2JvbTsgLy8gaW5kaWNhdGUgdGhlIGZpbGUgaGFzIEJPTSBpZiB3ZSBhcmUgdG8gcmVzb2x2ZSB3aXRoIFVURiA4XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcmVmZXJyZWRFbmNvZGluZyA9IG9wdGlvbnMuZW5jb2Rpbmc7IC8vIGdpdmUgcGFzc2VkIGluIGVuY29kaW5nIGhpZ2hlc3QgcHJpb3JpdHlcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbmNvZGluZyBkZXRlY3RlZFxuXHRcdGVsc2UgaWYgKHR5cGVvZiBkZXRlY3RlZEVuY29kaW5nID09PSAnc3RyaW5nJykge1xuXHRcdFx0cHJlZmVycmVkRW5jb2RpbmcgPSBkZXRlY3RlZEVuY29kaW5nO1xuXHRcdH1cblxuXHRcdC8vIEVuY29kaW5nIGNvbmZpZ3VyZWRcblx0XHRlbHNlIGlmICh0aGlzLnRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHJlc291cmNlLCAnZmlsZXMuZW5jb2RpbmcnKSA9PT0gVVRGOF93aXRoX2JvbSkge1xuXHRcdFx0cHJlZmVycmVkRW5jb2RpbmcgPSBVVEY4OyAvLyBpZiB3ZSBkaWQgbm90IGRldGVjdCBVVEYgOCBCT00gYmVmb3JlLCB0aGlzIGNhbiBvbmx5IGJlIFVURiA4IHRoZW5cblx0XHR9XG5cblx0XHRjb25zdCBlbmNvZGluZyA9IGF3YWl0IHRoaXMuZ2V0VmFsaWRhdGVkRW5jb2RpbmdGb3JSZXNvdXJjZShyZXNvdXJjZSwgcHJlZmVycmVkRW5jb2RpbmcpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuY29kaW5nLFxuXHRcdFx0aGFzQk9NOiBlbmNvZGluZyA9PT0gVVRGMTZiZSB8fCBlbmNvZGluZyA9PT0gVVRGMTZsZSB8fCBlbmNvZGluZyA9PT0gVVRGOF93aXRoX2JvbSAvLyBlbmZvcmNlIEJPTSBmb3IgY2VydGFpbiBlbmNvZGluZ3Ncblx0XHR9O1xuXHR9XG5cblx0Z2V0VW52YWxpZGF0ZWRFbmNvZGluZ0ZvclJlc291cmNlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHByZWZlcnJlZEVuY29kaW5nPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgZmlsZUVuY29kaW5nOiBzdHJpbmc7XG5cblx0XHRjb25zdCBvdmVycmlkZSA9IHRoaXMuZ2V0RW5jb2RpbmdPdmVycmlkZShyZXNvdXJjZSk7XG5cdFx0aWYgKG92ZXJyaWRlKSB7XG5cdFx0XHRmaWxlRW5jb2RpbmcgPSBvdmVycmlkZTsgLy8gZW5jb2Rpbmcgb3ZlcnJpZGUgYWx3YXlzIHdpbnNcblx0XHR9IGVsc2UgaWYgKHByZWZlcnJlZEVuY29kaW5nKSB7XG5cdFx0XHRmaWxlRW5jb2RpbmcgPSBwcmVmZXJyZWRFbmNvZGluZzsgLy8gcHJlZmVycmVkIGVuY29kaW5nIGNvbWVzIHNlY29uZFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaWxlRW5jb2RpbmcgPSB0aGlzLnRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHJlc291cmNlLCAnZmlsZXMuZW5jb2RpbmcnKTsgLy8gYW5kIGxhc3Qgd2UgY2hlY2sgZm9yIHNldHRpbmdzXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbGVFbmNvZGluZyB8fCBVVEY4O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWYWxpZGF0ZWRFbmNvZGluZ0ZvclJlc291cmNlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHByZWZlcnJlZEVuY29kaW5nPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRsZXQgZmlsZUVuY29kaW5nID0gdGhpcy5nZXRVbnZhbGlkYXRlZEVuY29kaW5nRm9yUmVzb3VyY2UocmVzb3VyY2UsIHByZWZlcnJlZEVuY29kaW5nKTtcblx0XHRpZiAoZmlsZUVuY29kaW5nICE9PSBVVEY4ICYmICEoYXdhaXQgZW5jb2RpbmdFeGlzdHMoZmlsZUVuY29kaW5nKSkpIHtcblx0XHRcdGZpbGVFbmNvZGluZyA9IFVURjg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbGVFbmNvZGluZztcblx0fVxuXG5cdHByaXZhdGUgZ2V0RW5jb2RpbmdPdmVycmlkZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVzb3VyY2UgJiYgdGhpcy5lbmNvZGluZ092ZXJyaWRlcz8ubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG92ZXJyaWRlIG9mIHRoaXMuZW5jb2RpbmdPdmVycmlkZXMpIHtcblxuXHRcdFx0XHQvLyBjaGVjayBpZiB0aGUgcmVzb3VyY2UgaXMgY2hpbGQgb2YgZW5jb2Rpbmcgb3ZlcnJpZGUgcGF0aFxuXHRcdFx0XHRpZiAob3ZlcnJpZGUucGFyZW50ICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIG92ZXJyaWRlLnBhcmVudCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3ZlcnJpZGUuZW5jb2Rpbmc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBjaGVjayBpZiB0aGUgcmVzb3VyY2UgZXh0ZW5zaW9uIGlzIGVxdWFsIHRvIGVuY29kaW5nIG92ZXJyaWRlXG5cdFx0XHRcdGlmIChvdmVycmlkZS5leHRlbnNpb24gJiYgZXh0bmFtZShyZXNvdXJjZSkgPT09IGAuJHtvdmVycmlkZS5leHRlbnNpb259YCkge1xuXHRcdFx0XHRcdHJldHVybiBvdmVycmlkZS5lbmNvZGluZztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBd0osb0JBQW9CLHdCQUF3Qix5QkFBK0Ysa0JBQXdFLGdDQUE4RDtBQUN6YSxTQUF5QiwwQkFBMEI7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFrQywyQkFBMEY7QUFDckksU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLG1CQUFtQjtBQUN2QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtDQUFtRTtBQUM1RSxTQUEyQywrQkFBK0I7QUFDMUUsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMscUNBQXFDLHlDQUF5QztBQUN2RixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFVBQVUsU0FBUyxVQUFVLGlCQUFpQixTQUFTLGVBQWU7QUFDL0UsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQXFDLHNCQUE4QztBQUVuRixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtCQUFpRjtBQUMxRixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQiwyQkFBMkI7QUFDOUQsU0FBUyxNQUFNLGVBQWUsU0FBUyxTQUFTLGdCQUFnQixrQkFBa0IsZ0JBQXdELDZCQUE2QjtBQUN2SyxTQUFTLHFCQUFxQztBQUM5QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyw0QkFBNEI7QUFDckMsU0FBZ0QsMkJBQTJCO0FBQzNFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFD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
