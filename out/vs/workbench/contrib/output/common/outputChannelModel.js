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
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import * as resources from "../../../../base/common/resources.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Promises, ThrottledDelayer } from "../../../../base/common/async.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../../platform/files/common/files.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Disposable, toDisposable, MutableDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isNumber } from "../../../../base/common/types.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ILoggerService, ILogService, LogLevel } from "../../../../platform/log/common/log.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { LOG_MIME, OutputChannelUpdateMode } from "../../../services/output/common/output.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { TextModel } from "../../../../editor/common/model/textModel.js";
import { binarySearch, sortedDiff } from "../../../../base/common/arrays.js";
const LOG_ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s(\[(info|trace|debug|error|warning)\])\s(\[(.*?)\])?/;
function parseLogEntryAt(model, lineNumber) {
  const lineContent = model.getLineContent(lineNumber);
  const match = LOG_ENTRY_REGEX.exec(lineContent);
  if (match) {
    const timestamp = new Date(match[1]).getTime();
    const timestampRange = new Range(lineNumber, 1, lineNumber, match[1].length);
    const logLevel = parseLogLevel(match[3]);
    const logLevelRange = new Range(lineNumber, timestampRange.endColumn + 1, lineNumber, timestampRange.endColumn + 1 + match[2].length);
    const category = match[5];
    const startLine = lineNumber;
    let endLine = lineNumber;
    const lineCount = model.getLineCount();
    while (endLine < lineCount) {
      const nextLineContent = model.getLineContent(endLine + 1);
      const isLastLine = endLine + 1 === lineCount && nextLineContent === "";
      if (LOG_ENTRY_REGEX.test(nextLineContent) || isLastLine) {
        break;
      }
      endLine++;
    }
    const range = new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
    return { range, timestamp, timestampRange, logLevel, logLevelRange, category };
  }
  return null;
}
function* logEntryIterator(model, process) {
  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const logEntry = parseLogEntryAt(model, lineNumber);
    if (logEntry) {
      yield process(logEntry);
      lineNumber = logEntry.range.endLineNumber;
    }
  }
}
function changeStartLineNumber(logEntry, lineNumber) {
  return {
    ...logEntry,
    range: new Range(lineNumber, logEntry.range.startColumn, lineNumber + logEntry.range.endLineNumber - logEntry.range.startLineNumber, logEntry.range.endColumn),
    timestampRange: new Range(lineNumber, logEntry.timestampRange.startColumn, lineNumber, logEntry.timestampRange.endColumn),
    logLevelRange: new Range(lineNumber, logEntry.logLevelRange.startColumn, lineNumber, logEntry.logLevelRange.endColumn)
  };
}
function parseLogLevel(level) {
  switch (level.toLowerCase()) {
    case "trace":
      return LogLevel.Trace;
    case "debug":
      return LogLevel.Debug;
    case "info":
      return LogLevel.Info;
    case "warning":
      return LogLevel.Warning;
    case "error":
      return LogLevel.Error;
    default:
      throw new Error(`Unknown log level: ${level}`);
  }
}
let FileContentProvider = class extends Disposable {
  constructor({ name, resource }, fileService, instantiationService, logService) {
    super();
    this.fileService = fileService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this._onDidAppend = this._register(new Emitter());
    this._onDidReset = this._register(new Emitter());
    this.watching = false;
    this.etag = "";
    this.logEntries = [];
    this.startOffset = 0;
    this.endOffset = 0;
    this.name = name ?? "";
    this.resource = resource;
    this.syncDelayer = new ThrottledDelayer(500);
    this._register(toDisposable(() => this.unwatch()));
  }
  get onDidAppend() {
    return this._onDidAppend.event;
  }
  get onDidReset() {
    return this._onDidReset.event;
  }
  reset(offset) {
    this.endOffset = this.startOffset = offset ?? this.startOffset;
    this.logEntries = [];
  }
  resetToEnd() {
    this.startOffset = this.endOffset;
    this.logEntries = [];
  }
  watch() {
    if (!this.watching) {
      this.logService.trace("Started polling", this.resource.toString());
      this.poll();
      this.watching = true;
    }
  }
  unwatch() {
    if (this.watching) {
      this.syncDelayer.cancel();
      this.watching = false;
      this.logService.trace("Stopped polling", this.resource.toString());
    }
  }
  poll() {
    const loop = () => this.doWatch().then(() => this.poll());
    this.syncDelayer.trigger(loop).catch((error) => {
      if (!isCancellationError(error)) {
        throw error;
      }
    });
  }
  async doWatch() {
    try {
      if (!this.fileService.hasProvider(this.resource)) {
        return;
      }
      const stat = await this.fileService.stat(this.resource);
      if (stat.etag !== this.etag) {
        this.etag = stat.etag;
        if (isNumber(stat.size) && this.endOffset > stat.size) {
          this.reset(0);
          this._onDidReset.fire();
        } else {
          this._onDidAppend.fire();
        }
      }
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
    }
  }
  getLogEntries() {
    return this.logEntries;
  }
  async getContent(donotConsumeLogEntries) {
    try {
      if (!this.fileService.hasProvider(this.resource)) {
        return {
          name: this.name,
          content: "",
          consume: () => {
          }
        };
      }
      const fileContent = await this.fileService.readFile(this.resource, { position: this.endOffset });
      const content = fileContent.value.toString();
      const logEntries = donotConsumeLogEntries ? [] : this.parseLogEntries(content, this.logEntries[this.logEntries.length - 1]);
      let consumed = false;
      return {
        name: this.name,
        content,
        consume: () => {
          if (!consumed) {
            consumed = true;
            this.endOffset += fileContent.value.byteLength;
            this.etag = fileContent.etag;
            this.logEntries.push(...logEntries);
          }
        }
      };
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
      return {
        name: this.name,
        content: "",
        consume: () => {
        }
      };
    }
  }
  parseLogEntries(content, lastLogEntry) {
    const model = this.instantiationService.createInstance(TextModel, content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
    try {
      if (!parseLogEntryAt(model, 1)) {
        return [];
      }
      const logEntries = [];
      let logEntryStartLineNumber = lastLogEntry ? lastLogEntry.range.endLineNumber + 1 : 1;
      for (const entry of logEntryIterator(model, (e) => changeStartLineNumber(e, logEntryStartLineNumber))) {
        logEntries.push(entry);
        logEntryStartLineNumber = entry.range.endLineNumber + 1;
      }
      return logEntries;
    } finally {
      model.dispose();
    }
  }
};
FileContentProvider = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService)
], FileContentProvider);
let MultiFileContentProvider = class extends Disposable {
  constructor(filesInfos, instantiationService, fileService, logService) {
    super();
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.logService = logService;
    this._onDidAppend = this._register(new Emitter());
    this.onDidAppend = this._onDidAppend.event;
    this.onDidReset = Event.None;
    this.logEntries = [];
    this.fileContentProviderItems = [];
    this.watching = false;
    for (const file of filesInfos) {
      this.fileContentProviderItems.push(this.createFileContentProvider(file));
    }
    this._register(toDisposable(() => {
      for (const [, disposables] of this.fileContentProviderItems) {
        disposables.dispose();
      }
    }));
  }
  createFileContentProvider(file) {
    const disposables = new DisposableStore();
    const fileOutput = disposables.add(new FileContentProvider(file, this.fileService, this.instantiationService, this.logService));
    disposables.add(fileOutput.onDidAppend(() => this._onDidAppend.fire()));
    return [fileOutput, disposables];
  }
  watch() {
    if (!this.watching) {
      this.watching = true;
      for (const [output] of this.fileContentProviderItems) {
        output.watch();
      }
    }
  }
  unwatch() {
    if (this.watching) {
      this.watching = false;
      for (const [output] of this.fileContentProviderItems) {
        output.unwatch();
      }
    }
  }
  updateFiles(files) {
    const wasWatching = this.watching;
    if (wasWatching) {
      this.unwatch();
    }
    const result = sortedDiff(this.fileContentProviderItems.map(([output]) => output), files, (a, b) => resources.extUri.compare(a.resource, b.resource));
    for (const { start, deleteCount, toInsert } of result) {
      const outputs = toInsert.map((file) => this.createFileContentProvider(file));
      const outputsToRemove = this.fileContentProviderItems.splice(start, deleteCount, ...outputs);
      for (const [, disposables] of outputsToRemove) {
        disposables.dispose();
      }
    }
    if (wasWatching) {
      this.watch();
    }
  }
  reset() {
    for (const [output] of this.fileContentProviderItems) {
      output.reset();
    }
    this.logEntries = [];
  }
  resetToEnd() {
    for (const [output] of this.fileContentProviderItems) {
      output.resetToEnd();
    }
    this.logEntries = [];
  }
  getLogEntries() {
    return this.logEntries;
  }
  async getContent() {
    const outputs = await Promise.all(this.fileContentProviderItems.map(([output]) => output.getContent(true)));
    const { content, logEntries } = this.combineLogEntries(outputs, this.logEntries[this.logEntries.length - 1]);
    let consumed = false;
    return {
      content,
      consume: () => {
        if (!consumed) {
          consumed = true;
          outputs.forEach(({ consume }) => consume());
          this.logEntries.push(...logEntries);
        }
      }
    };
  }
  combineLogEntries(outputs, lastEntry) {
    outputs = outputs.filter((output) => !!output.content);
    if (outputs.length === 0) {
      return { logEntries: [], content: "" };
    }
    const logEntries = [];
    const contents = [];
    const process = (model2, logEntry, name) => {
      const lineContent = model2.getValueInRange(logEntry.range);
      const content2 = name ? `${lineContent.substring(0, logEntry.logLevelRange.endColumn)} [${name}]${lineContent.substring(logEntry.logLevelRange.endColumn)}` : lineContent;
      return [{
        ...logEntry,
        category: name,
        range: new Range(logEntry.range.startLineNumber, logEntry.logLevelRange.startColumn, logEntry.range.endLineNumber, name ? logEntry.range.endColumn + name.length + 3 : logEntry.range.endColumn)
      }, content2];
    };
    const model = this.instantiationService.createInstance(TextModel, outputs[0].content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
    try {
      for (const [logEntry, content2] of logEntryIterator(model, (e) => process(model, e, outputs[0].name))) {
        logEntries.push(logEntry);
        contents.push(content2);
      }
    } finally {
      model.dispose();
    }
    for (let index = 1; index < outputs.length; index++) {
      const { content: content2, name } = outputs[index];
      const model2 = this.instantiationService.createInstance(TextModel, content2, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
      try {
        const iterator = logEntryIterator(model2, (e) => process(model2, e, name));
        let next = iterator.next();
        while (!next.done) {
          const [logEntry, content3] = next.value;
          const logEntriesToAdd = [logEntry];
          const contentsToAdd = [content3];
          let insertionIndex;
          if (logEntry.timestamp >= logEntries[logEntries.length - 1].timestamp) {
            insertionIndex = logEntries.length;
            for (next = iterator.next(); !next.done; next = iterator.next()) {
              logEntriesToAdd.push(next.value[0]);
              contentsToAdd.push(next.value[1]);
            }
          } else {
            if (logEntry.timestamp <= logEntries[0].timestamp) {
              insertionIndex = 0;
            } else {
              const idx = binarySearch(logEntries, logEntry, (a, b) => a.timestamp - b.timestamp);
              insertionIndex = idx < 0 ? ~idx : idx;
            }
            for (next = iterator.next(); !next.done && next.value[0].timestamp <= logEntries[insertionIndex].timestamp; next = iterator.next()) {
              logEntriesToAdd.push(next.value[0]);
              contentsToAdd.push(next.value[1]);
            }
          }
          contents.splice(insertionIndex, 0, ...contentsToAdd);
          logEntries.splice(insertionIndex, 0, ...logEntriesToAdd);
        }
      } finally {
        model2.dispose();
      }
    }
    let content = "";
    const updatedLogEntries = [];
    let logEntryStartLineNumber = lastEntry ? lastEntry.range.endLineNumber + 1 : 1;
    for (let i = 0; i < logEntries.length; i++) {
      content += contents[i] + "\n";
      const updatedLogEntry = changeStartLineNumber(logEntries[i], logEntryStartLineNumber);
      updatedLogEntries.push(updatedLogEntry);
      logEntryStartLineNumber = updatedLogEntry.range.endLineNumber + 1;
    }
    return { logEntries: updatedLogEntries, content };
  }
};
MultiFileContentProvider = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, ILogService)
], MultiFileContentProvider);
let AbstractFileOutputChannelModel = class extends Disposable {
  constructor(modelUri, language, outputContentProvider, modelService, editorWorkerService) {
    super();
    this.modelUri = modelUri;
    this.language = language;
    this.outputContentProvider = outputContentProvider;
    this.modelService = modelService;
    this.editorWorkerService = editorWorkerService;
    this._onDispose = this._register(new Emitter());
    this.onDispose = this._onDispose.event;
    this.loadModelPromise = null;
    this.modelDisposable = this._register(new MutableDisposable());
    this.model = null;
    this.modelUpdateInProgress = false;
    this.modelUpdateCancellationSource = this._register(new MutableDisposable());
    this.appendThrottler = this._register(new ThrottledDelayer(300));
  }
  async loadModel() {
    this.loadModelPromise = Promises.withAsyncBody(async (c, e) => {
      try {
        this.modelDisposable.value = new DisposableStore();
        this.model = this.modelService.createModel("", this.language, this.modelUri);
        const { content, consume } = await this.outputContentProvider.getContent();
        consume();
        this.doAppendContent(this.model, content);
        this.modelDisposable.value.add(this.outputContentProvider.onDidReset(() => this.onDidContentChange(true, true)));
        this.modelDisposable.value.add(this.outputContentProvider.onDidAppend(() => this.onDidContentChange(false, false)));
        this.outputContentProvider.watch();
        this.modelDisposable.value.add(toDisposable(() => this.outputContentProvider.unwatch()));
        this.modelDisposable.value.add(this.model.onWillDispose(() => {
          this.outputContentProvider.reset();
          this.modelDisposable.value = void 0;
          this.cancelModelUpdate();
          this.model = null;
        }));
        c(this.model);
      } catch (error) {
        e(error);
      }
    });
    return this.loadModelPromise;
  }
  getLogEntries() {
    return this.outputContentProvider.getLogEntries();
  }
  onDidContentChange(reset, appendImmediately) {
    if (reset && !this.modelUpdateInProgress) {
      this.doUpdate(OutputChannelUpdateMode.Clear, true);
    }
    this.doUpdate(OutputChannelUpdateMode.Append, appendImmediately);
  }
  doUpdate(mode, immediate) {
    if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
      this.cancelModelUpdate();
    }
    if (!this.model) {
      return;
    }
    this.modelUpdateInProgress = true;
    if (!this.modelUpdateCancellationSource.value) {
      this.modelUpdateCancellationSource.value = new CancellationTokenSource();
    }
    const token = this.modelUpdateCancellationSource.value.token;
    if (mode === OutputChannelUpdateMode.Clear) {
      this.clearContent(this.model);
    } else if (mode === OutputChannelUpdateMode.Replace) {
      this.replacePromise = this.replaceContent(this.model, token).finally(() => this.replacePromise = void 0);
    } else {
      this.appendContent(this.model, immediate, token);
    }
  }
  clearContent(model) {
    model.applyEdits([EditOperation.delete(model.getFullModelRange())]);
    this.modelUpdateInProgress = false;
  }
  appendContent(model, immediate, token) {
    this.appendThrottler.trigger(async () => {
      if (token.isCancellationRequested) {
        return;
      }
      if (this.replacePromise) {
        try {
          await this.replacePromise;
        } catch (e) {
        }
        if (token.isCancellationRequested) {
          return;
        }
      }
      const { content, consume } = await this.outputContentProvider.getContent();
      if (token.isCancellationRequested) {
        return;
      }
      consume();
      this.doAppendContent(model, content);
      this.modelUpdateInProgress = false;
    }, immediate ? 0 : void 0).catch((error) => {
      if (!isCancellationError(error)) {
        throw error;
      }
    });
  }
  doAppendContent(model, content) {
    const lastLine = model.getLineCount();
    const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
    model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
  }
  async replaceContent(model, token) {
    const { content, consume } = await this.outputContentProvider.getContent();
    if (token.isCancellationRequested) {
      return;
    }
    const edits = await this.getReplaceEdits(model, content.toString());
    if (token.isCancellationRequested) {
      return;
    }
    consume();
    if (edits.length) {
      model.applyEdits(edits);
    }
    this.modelUpdateInProgress = false;
  }
  async getReplaceEdits(model, contentToReplace) {
    if (!contentToReplace) {
      return [EditOperation.delete(model.getFullModelRange())];
    }
    if (contentToReplace !== model.getValue()) {
      const edits = await this.editorWorkerService.computeMoreMinimalEdits(model.uri, [{ text: contentToReplace.toString(), range: model.getFullModelRange() }]);
      if (edits?.length) {
        return edits.map((edit) => EditOperation.replace(Range.lift(edit.range), edit.text));
      }
    }
    return [];
  }
  cancelModelUpdate() {
    this.modelUpdateCancellationSource.value?.cancel();
    this.modelUpdateCancellationSource.value = void 0;
    this.appendThrottler.cancel();
    this.replacePromise = void 0;
    this.modelUpdateInProgress = false;
  }
  isVisible() {
    return !!this.model;
  }
  dispose() {
    this._onDispose.fire();
    super.dispose();
  }
  append(message) {
    throw new Error("Not supported");
  }
  replace(message) {
    throw new Error("Not supported");
  }
};
AbstractFileOutputChannelModel = __decorateClass([
  __decorateParam(3, IModelService),
  __decorateParam(4, IEditorWorkerService)
], AbstractFileOutputChannelModel);
let FileOutputChannelModel = class extends AbstractFileOutputChannelModel {
  constructor(modelUri, language, source, fileService, modelService, instantiationService, logService, editorWorkerService) {
    const fileOutput = new FileContentProvider(source, fileService, instantiationService, logService);
    super(modelUri, language, fileOutput, modelService, editorWorkerService);
    this.source = source;
    this.fileOutput = this._register(fileOutput);
  }
  clear() {
    this.update(OutputChannelUpdateMode.Clear, void 0, true);
  }
  update(mode, till, immediate) {
    const loadModelPromise = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
    loadModelPromise.then(() => {
      if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
        if (isNumber(till)) {
          this.fileOutput.reset(till);
        } else {
          this.fileOutput.resetToEnd();
        }
      }
      this.doUpdate(mode, immediate);
    });
  }
  updateChannelSources(files) {
    throw new Error("Not supported");
  }
};
FileOutputChannelModel = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IEditorWorkerService)
], FileOutputChannelModel);
let MultiFileOutputChannelModel = class extends AbstractFileOutputChannelModel {
  constructor(modelUri, language, source, fileService, modelService, logService, editorWorkerService, instantiationService) {
    const multifileOutput = new MultiFileContentProvider(source, instantiationService, fileService, logService);
    super(modelUri, language, multifileOutput, modelService, editorWorkerService);
    this.source = source;
    this.multifileOutput = this._register(multifileOutput);
  }
  updateChannelSources(files) {
    this.multifileOutput.unwatch();
    this.multifileOutput.updateFiles(files);
    this.multifileOutput.reset();
    this.doUpdate(OutputChannelUpdateMode.Replace, true);
    if (this.isVisible()) {
      this.multifileOutput.watch();
    }
  }
  clear() {
    const loadModelPromise = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
    loadModelPromise.then(() => {
      this.multifileOutput.resetToEnd();
      this.doUpdate(OutputChannelUpdateMode.Clear, true);
    });
  }
  update(mode, till, immediate) {
    throw new Error("Not supported");
  }
};
MultiFileOutputChannelModel = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IModelService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IEditorWorkerService),
  __decorateParam(7, IInstantiationService)
], MultiFileOutputChannelModel);
let OutputChannelBackedByFile = class extends FileOutputChannelModel {
  constructor(id, modelUri, language, file, fileService, modelService, loggerService, instantiationService, logService, editorWorkerService) {
    super(modelUri, language, { resource: file, name: "" }, fileService, modelService, instantiationService, logService, editorWorkerService);
    this.logger = loggerService.createLogger(file, { logLevel: "always", donotRotate: true, donotUseFormatters: true, hidden: true });
    this._offset = 0;
  }
  append(message) {
    this.write(message);
    this.update(OutputChannelUpdateMode.Append, void 0, this.isVisible());
  }
  replace(message) {
    const till = this._offset;
    this.write(message);
    this.update(OutputChannelUpdateMode.Replace, till, true);
  }
  write(content) {
    this._offset += VSBuffer.fromString(content).byteLength;
    this.logger.info(content);
    if (this.isVisible()) {
      this.logger.flush();
    }
  }
};
OutputChannelBackedByFile = __decorateClass([
  __decorateParam(4, IFileService),
  __decorateParam(5, IModelService),
  __decorateParam(6, ILoggerService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IEditorWorkerService)
], OutputChannelBackedByFile);
let DelegatedOutputChannelModel = class extends Disposable {
  constructor(id, modelUri, language, outputDir, outputDirCreationPromise, instantiationService, fileService) {
    super();
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this._onDispose = this._register(new Emitter());
    this.onDispose = this._onDispose.event;
    this.outputChannelModel = this.createOutputChannelModel(id, modelUri, language, outputDir, outputDirCreationPromise);
    const resource = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, "")}.log`);
    this.source = { resource };
  }
  async createOutputChannelModel(id, modelUri, language, outputDir, outputDirPromise) {
    await outputDirPromise;
    const file = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, "")}.log`);
    await this.fileService.createFile(file);
    const outputChannelModel = this._register(this.instantiationService.createInstance(OutputChannelBackedByFile, id, modelUri, language, file));
    this._register(outputChannelModel.onDispose(() => this._onDispose.fire()));
    return outputChannelModel;
  }
  getLogEntries() {
    return [];
  }
  append(output) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.append(output));
  }
  update(mode, till, immediate) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.update(mode, till, immediate));
  }
  loadModel() {
    return this.outputChannelModel.then((outputChannelModel) => outputChannelModel.loadModel());
  }
  clear() {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.clear());
  }
  replace(value) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.replace(value));
  }
  updateChannelSources(files) {
    this.outputChannelModel.then((outputChannelModel) => outputChannelModel.updateChannelSources(files));
  }
};
DelegatedOutputChannelModel = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IFileService)
], DelegatedOutputChannelModel);
export {
  AbstractFileOutputChannelModel,
  DelegatedOutputChannelModel,
  FileOutputChannelModel,
  MultiFileOutputChannelModel,
  parseLogEntryAt
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL291dHB1dC9jb21tb24vb3V0cHV0Q2hhbm5lbE1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiwgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSwgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dFbnRyeSwgSU91dHB1dENvbnRlbnRTb3VyY2UsIExPR19NSU1FLCBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgYmluYXJ5U2VhcmNoLCBzb3J0ZWREaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcblxuY29uc3QgTE9HX0VOVFJZX1JFR0VYID0gL14oXFxkezR9LVxcZHsyfS1cXGR7Mn0gXFxkezJ9OlxcZHsyfTpcXGR7Mn1cXC5cXGR7M30pXFxzKFxcWyhpbmZvfHRyYWNlfGRlYnVnfGVycm9yfHdhcm5pbmcpXFxdKVxccyhcXFsoLio/KVxcXSk/LztcblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTG9nRW50cnlBdChtb2RlbDogSVRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyKTogSUxvZ0VudHJ5IHwgbnVsbCB7XG5cdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdGNvbnN0IG1hdGNoID0gTE9HX0VOVFJZX1JFR0VYLmV4ZWMobGluZUNvbnRlbnQpO1xuXHRpZiAobWF0Y2gpIHtcblx0XHRjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZShtYXRjaFsxXSkuZ2V0VGltZSgpO1xuXHRcdGNvbnN0IHRpbWVzdGFtcFJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIG1hdGNoWzFdLmxlbmd0aCk7XG5cdFx0Y29uc3QgbG9nTGV2ZWwgPSBwYXJzZUxvZ0xldmVsKG1hdGNoWzNdKTtcblx0XHRjb25zdCBsb2dMZXZlbFJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIHRpbWVzdGFtcFJhbmdlLmVuZENvbHVtbiArIDEsIGxpbmVOdW1iZXIsIHRpbWVzdGFtcFJhbmdlLmVuZENvbHVtbiArIDEgKyBtYXRjaFsyXS5sZW5ndGgpO1xuXHRcdGNvbnN0IGNhdGVnb3J5ID0gbWF0Y2hbNV07XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gbGluZU51bWJlcjtcblx0XHRsZXQgZW5kTGluZSA9IGxpbmVOdW1iZXI7XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHR3aGlsZSAoZW5kTGluZSA8IGxpbmVDb3VudCkge1xuXHRcdFx0Y29uc3QgbmV4dExpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoZW5kTGluZSArIDEpO1xuXHRcdFx0Y29uc3QgaXNMYXN0TGluZSA9IGVuZExpbmUgKyAxID09PSBsaW5lQ291bnQgJiYgbmV4dExpbmVDb250ZW50ID09PSAnJzsgLy8gTGFzdCBsaW5lIHdpbGwgYmUgYWx3YXlzIGVtcHR5XG5cdFx0XHRpZiAoTE9HX0VOVFJZX1JFR0VYLnRlc3QobmV4dExpbmVDb250ZW50KSB8fCBpc0xhc3RMaW5lKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZW5kTGluZSsrO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmUsIDEsIGVuZExpbmUsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZSkpO1xuXHRcdHJldHVybiB7IHJhbmdlLCB0aW1lc3RhbXAsIHRpbWVzdGFtcFJhbmdlLCBsb2dMZXZlbCwgbG9nTGV2ZWxSYW5nZSwgY2F0ZWdvcnkgfTtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24qIGxvZ0VudHJ5SXRlcmF0b3I8VD4obW9kZWw6IElUZXh0TW9kZWwsIHByb2Nlc3M6IChsb2dFbnRyeTogSUxvZ0VudHJ5KSA9PiBUKTogSXRlcmFibGVJdGVyYXRvcjxUPiB7XG5cdGZvciAobGV0IGxpbmVOdW1iZXIgPSAxOyBsaW5lTnVtYmVyIDw9IG1vZGVsLmdldExpbmVDb3VudCgpOyBsaW5lTnVtYmVyKyspIHtcblx0XHRjb25zdCBsb2dFbnRyeSA9IHBhcnNlTG9nRW50cnlBdChtb2RlbCwgbGluZU51bWJlcik7XG5cdFx0aWYgKGxvZ0VudHJ5KSB7XG5cdFx0XHR5aWVsZCBwcm9jZXNzKGxvZ0VudHJ5KTtcblx0XHRcdGxpbmVOdW1iZXIgPSBsb2dFbnRyeS5yYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjaGFuZ2VTdGFydExpbmVOdW1iZXIobG9nRW50cnk6IElMb2dFbnRyeSwgbGluZU51bWJlcjogbnVtYmVyKTogSUxvZ0VudHJ5IHtcblx0cmV0dXJuIHtcblx0XHQuLi5sb2dFbnRyeSxcblx0XHRyYW5nZTogbmV3IFJhbmdlKGxpbmVOdW1iZXIsIGxvZ0VudHJ5LnJhbmdlLnN0YXJ0Q29sdW1uLCBsaW5lTnVtYmVyICsgbG9nRW50cnkucmFuZ2UuZW5kTGluZU51bWJlciAtIGxvZ0VudHJ5LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgbG9nRW50cnkucmFuZ2UuZW5kQ29sdW1uKSxcblx0XHR0aW1lc3RhbXBSYW5nZTogbmV3IFJhbmdlKGxpbmVOdW1iZXIsIGxvZ0VudHJ5LnRpbWVzdGFtcFJhbmdlLnN0YXJ0Q29sdW1uLCBsaW5lTnVtYmVyLCBsb2dFbnRyeS50aW1lc3RhbXBSYW5nZS5lbmRDb2x1bW4pLFxuXHRcdGxvZ0xldmVsUmFuZ2U6IG5ldyBSYW5nZShsaW5lTnVtYmVyLCBsb2dFbnRyeS5sb2dMZXZlbFJhbmdlLnN0YXJ0Q29sdW1uLCBsaW5lTnVtYmVyLCBsb2dFbnRyeS5sb2dMZXZlbFJhbmdlLmVuZENvbHVtbiksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlTG9nTGV2ZWwobGV2ZWw6IHN0cmluZyk6IExvZ0xldmVsIHtcblx0c3dpdGNoIChsZXZlbC50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0Y2FzZSAndHJhY2UnOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLlRyYWNlO1xuXHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdHJldHVybiBMb2dMZXZlbC5EZWJ1Zztcblx0XHRjYXNlICdpbmZvJzpcblx0XHRcdHJldHVybiBMb2dMZXZlbC5JbmZvO1xuXHRcdGNhc2UgJ3dhcm5pbmcnOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLldhcm5pbmc7XG5cdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLkVycm9yO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gbG9nIGxldmVsOiAke2xldmVsfWApO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU91dHB1dENoYW5uZWxNb2RlbCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgb25EaXNwb3NlOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgc291cmNlOiBJT3V0cHV0Q29udGVudFNvdXJjZSB8IFJlYWRvbmx5QXJyYXk8SU91dHB1dENvbnRlbnRTb3VyY2U+O1xuXHRnZXRMb2dFbnRyaWVzKCk6IFJlYWRvbmx5QXJyYXk8SUxvZ0VudHJ5Pjtcblx0YXBwZW5kKG91dHB1dDogc3RyaW5nKTogdm9pZDtcblx0dXBkYXRlKG1vZGU6IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLCB0aWxsOiBudW1iZXIgfCB1bmRlZmluZWQsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQ7XG5cdHVwZGF0ZUNoYW5uZWxTb3VyY2VzKHNvdXJjZXM6IFJlYWRvbmx5QXJyYXk8SU91dHB1dENvbnRlbnRTb3VyY2U+KTogdm9pZDtcblx0bG9hZE1vZGVsKCk6IFByb21pc2U8SVRleHRNb2RlbD47XG5cdGNsZWFyKCk6IHZvaWQ7XG5cdHJlcGxhY2UodmFsdWU6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJQ29udGVudFByb3ZpZGVyIHtcblx0cmVhZG9ubHkgb25EaWRBcHBlbmQ6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZFJlc2V0OiBFdmVudDx2b2lkPjtcblx0cmVzZXQoKTogdm9pZDtcblx0d2F0Y2goKTogdm9pZDtcblx0dW53YXRjaCgpOiB2b2lkO1xuXHRnZXRDb250ZW50KCk6IFByb21pc2U8eyByZWFkb25seSBjb250ZW50OiBzdHJpbmc7IHJlYWRvbmx5IGNvbnN1bWU6ICgpID0+IHZvaWQgfT47XG5cdGdldExvZ0VudHJpZXMoKTogUmVhZG9ubHlBcnJheTxJTG9nRW50cnk+O1xufVxuXG5jbGFzcyBGaWxlQ29udGVudFByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50UHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQXBwZW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZEFwcGVuZCgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQXBwZW5kLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXNldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRSZXNldCgpIHsgcmV0dXJuIHRoaXMuX29uRGlkUmVzZXQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHdhdGNoaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgc3luY0RlbGF5ZXI6IFRocm90dGxlZERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgZXRhZzogc3RyaW5nIHwgdW5kZWZpbmVkID0gJyc7XG5cblx0cHJpdmF0ZSBsb2dFbnRyaWVzOiBJTG9nRW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIHN0YXJ0T2Zmc2V0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGVuZE9mZnNldDogbnVtYmVyID0gMDtcblxuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0eyBuYW1lLCByZXNvdXJjZSB9OiBJT3V0cHV0Q29udGVudFNvdXJjZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMubmFtZSA9IG5hbWUgPz8gJyc7XG5cdFx0dGhpcy5yZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdHRoaXMuc3luY0RlbGF5ZXIgPSBuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPig1MDApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnVud2F0Y2goKSkpO1xuXHR9XG5cblx0cmVzZXQob2Zmc2V0PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5lbmRPZmZzZXQgPSB0aGlzLnN0YXJ0T2Zmc2V0ID0gb2Zmc2V0ID8/IHRoaXMuc3RhcnRPZmZzZXQ7XG5cdFx0dGhpcy5sb2dFbnRyaWVzID0gW107XG5cdH1cblxuXHRyZXNldFRvRW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RhcnRPZmZzZXQgPSB0aGlzLmVuZE9mZnNldDtcblx0XHR0aGlzLmxvZ0VudHJpZXMgPSBbXTtcblx0fVxuXG5cdHdhdGNoKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53YXRjaGluZykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdTdGFydGVkIHBvbGxpbmcnLCB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy5wb2xsKCk7XG5cdFx0XHR0aGlzLndhdGNoaW5nID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHR1bndhdGNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndhdGNoaW5nKSB7XG5cdFx0XHR0aGlzLnN5bmNEZWxheWVyLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy53YXRjaGluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdTdG9wcGVkIHBvbGxpbmcnLCB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcG9sbCgpOiB2b2lkIHtcblx0XHRjb25zdCBsb29wID0gKCkgPT4gdGhpcy5kb1dhdGNoKCkudGhlbigoKSA9PiB0aGlzLnBvbGwoKSk7XG5cdFx0dGhpcy5zeW5jRGVsYXllci50cmlnZ2VyKGxvb3ApLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV2F0Y2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcih0aGlzLnJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0aWYgKHN0YXQuZXRhZyAhPT0gdGhpcy5ldGFnKSB7XG5cdFx0XHRcdHRoaXMuZXRhZyA9IHN0YXQuZXRhZztcblx0XHRcdFx0aWYgKGlzTnVtYmVyKHN0YXQuc2l6ZSkgJiYgdGhpcy5lbmRPZmZzZXQgPiBzdGF0LnNpemUpIHtcblx0XHRcdFx0XHR0aGlzLnJlc2V0KDApO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVzZXQuZmlyZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQXBwZW5kLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRMb2dFbnRyaWVzKCk6IFJlYWRvbmx5QXJyYXk8SUxvZ0VudHJ5PiB7XG5cdFx0cmV0dXJuIHRoaXMubG9nRW50cmllcztcblx0fVxuXG5cdGFzeW5jIGdldENvbnRlbnQoZG9ub3RDb25zdW1lTG9nRW50cmllcz86IGJvb2xlYW4pOiBQcm9taXNlPHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBjb250ZW50OiBzdHJpbmc7IHJlYWRvbmx5IGNvbnN1bWU6ICgpID0+IHZvaWQgfT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIodGhpcy5yZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdFx0Y29uc3VtZTogKCkgPT4geyAvKiBObyBPcCAqLyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5yZXNvdXJjZSwgeyBwb3NpdGlvbjogdGhpcy5lbmRPZmZzZXQgfSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGxvZ0VudHJpZXMgPSBkb25vdENvbnN1bWVMb2dFbnRyaWVzID8gW10gOiB0aGlzLnBhcnNlTG9nRW50cmllcyhjb250ZW50LCB0aGlzLmxvZ0VudHJpZXNbdGhpcy5sb2dFbnRyaWVzLmxlbmd0aCAtIDFdKTtcblx0XHRcdGxldCBjb25zdW1lZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb25zdW1lOiAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFjb25zdW1lZCkge1xuXHRcdFx0XHRcdFx0Y29uc3VtZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5lbmRPZmZzZXQgKz0gZmlsZUNvbnRlbnQudmFsdWUuYnl0ZUxlbmd0aDtcblx0XHRcdFx0XHRcdHRoaXMuZXRhZyA9IGZpbGVDb250ZW50LmV0YWc7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ0VudHJpZXMucHVzaCguLi5sb2dFbnRyaWVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0Y29uc3VtZTogKCkgPT4geyAvKiBObyBPcCAqLyB9XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VMb2dFbnRyaWVzKGNvbnRlbnQ6IHN0cmluZywgbGFzdExvZ0VudHJ5OiBJTG9nRW50cnkgfCB1bmRlZmluZWQpOiBJTG9nRW50cnlbXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRNb2RlbCwgY29udGVudCwgTE9HX01JTUUsIFRleHRNb2RlbC5ERUZBVUxUX0NSRUFUSU9OX09QVElPTlMsIG51bGwpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXBhcnNlTG9nRW50cnlBdChtb2RlbCwgMSkpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbG9nRW50cmllczogSUxvZ0VudHJ5W10gPSBbXTtcblx0XHRcdGxldCBsb2dFbnRyeVN0YXJ0TGluZU51bWJlciA9IGxhc3RMb2dFbnRyeSA/IGxhc3RMb2dFbnRyeS5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMSA6IDE7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGxvZ0VudHJ5SXRlcmF0b3IobW9kZWwsIChlKSA9PiBjaGFuZ2VTdGFydExpbmVOdW1iZXIoZSwgbG9nRW50cnlTdGFydExpbmVOdW1iZXIpKSkge1xuXHRcdFx0XHRsb2dFbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0XHRsb2dFbnRyeVN0YXJ0TGluZU51bWJlciA9IGVudHJ5LnJhbmdlLmVuZExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvZ0VudHJpZXM7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTXVsdGlGaWxlQ29udGVudFByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50UHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQXBwZW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQXBwZW5kID0gdGhpcy5fb25EaWRBcHBlbmQuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkUmVzZXQgPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgbG9nRW50cmllczogSUxvZ0VudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBmaWxlQ29udGVudFByb3ZpZGVySXRlbXM6IFtGaWxlQ29udGVudFByb3ZpZGVyLCBEaXNwb3NhYmxlU3RvcmVdW10gPSBbXTtcblxuXHRwcml2YXRlIHdhdGNoaW5nOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZmlsZXNJbmZvczogSU91dHB1dENvbnRlbnRTb3VyY2VbXSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXNJbmZvcykge1xuXHRcdFx0dGhpcy5maWxlQ29udGVudFByb3ZpZGVySXRlbXMucHVzaCh0aGlzLmNyZWF0ZUZpbGVDb250ZW50UHJvdmlkZXIoZmlsZSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBbLCBkaXNwb3NhYmxlc10gb2YgdGhpcy5maWxlQ29udGVudFByb3ZpZGVySXRlbXMpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRmlsZUNvbnRlbnRQcm92aWRlcihmaWxlOiBJT3V0cHV0Q29udGVudFNvdXJjZSk6IFtGaWxlQ29udGVudFByb3ZpZGVyLCBEaXNwb3NhYmxlU3RvcmVdIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBmaWxlT3V0cHV0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlQ29udGVudFByb3ZpZGVyKGZpbGUsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlT3V0cHV0Lm9uRGlkQXBwZW5kKCgpID0+IHRoaXMuX29uRGlkQXBwZW5kLmZpcmUoKSkpO1xuXHRcdHJldHVybiBbZmlsZU91dHB1dCwgZGlzcG9zYWJsZXNdO1xuXHR9XG5cblx0d2F0Y2goKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndhdGNoaW5nKSB7XG5cdFx0XHR0aGlzLndhdGNoaW5nID0gdHJ1ZTtcblx0XHRcdGZvciAoY29uc3QgW291dHB1dF0gb2YgdGhpcy5maWxlQ29udGVudFByb3ZpZGVySXRlbXMpIHtcblx0XHRcdFx0b3V0cHV0LndhdGNoKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dW53YXRjaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53YXRjaGluZykge1xuXHRcdFx0dGhpcy53YXRjaGluZyA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBbb3V0cHV0XSBvZiB0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcykge1xuXHRcdFx0XHRvdXRwdXQudW53YXRjaCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZUZpbGVzKGZpbGVzOiBJT3V0cHV0Q29udGVudFNvdXJjZVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzV2F0Y2hpbmcgPSB0aGlzLndhdGNoaW5nO1xuXHRcdGlmICh3YXNXYXRjaGluZykge1xuXHRcdFx0dGhpcy51bndhdGNoKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc29ydGVkRGlmZih0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcy5tYXAoKFtvdXRwdXRdKSA9PiBvdXRwdXQpLCBmaWxlcywgKGEsIGIpID0+IHJlc291cmNlcy5leHRVcmkuY29tcGFyZShhLnJlc291cmNlLCBiLnJlc291cmNlKSk7XG5cdFx0Zm9yIChjb25zdCB7IHN0YXJ0LCBkZWxldGVDb3VudCwgdG9JbnNlcnQgfSBvZiByZXN1bHQpIHtcblx0XHRcdGNvbnN0IG91dHB1dHMgPSB0b0luc2VydC5tYXAoZmlsZSA9PiB0aGlzLmNyZWF0ZUZpbGVDb250ZW50UHJvdmlkZXIoZmlsZSkpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0c1RvUmVtb3ZlID0gdGhpcy5maWxlQ29udGVudFByb3ZpZGVySXRlbXMuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgLi4ub3V0cHV0cyk7XG5cdFx0XHRmb3IgKGNvbnN0IFssIGRpc3Bvc2FibGVzXSBvZiBvdXRwdXRzVG9SZW1vdmUpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh3YXNXYXRjaGluZykge1xuXHRcdFx0dGhpcy53YXRjaCgpO1xuXHRcdH1cblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW291dHB1dF0gb2YgdGhpcy5maWxlQ29udGVudFByb3ZpZGVySXRlbXMpIHtcblx0XHRcdG91dHB1dC5yZXNldCgpO1xuXHRcdH1cblx0XHR0aGlzLmxvZ0VudHJpZXMgPSBbXTtcblx0fVxuXG5cdHJlc2V0VG9FbmQoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbb3V0cHV0XSBvZiB0aGlzLmZpbGVDb250ZW50UHJvdmlkZXJJdGVtcykge1xuXHRcdFx0b3V0cHV0LnJlc2V0VG9FbmQoKTtcblx0XHR9XG5cdFx0dGhpcy5sb2dFbnRyaWVzID0gW107XG5cdH1cblxuXHRnZXRMb2dFbnRyaWVzKCk6IFJlYWRvbmx5QXJyYXk8SUxvZ0VudHJ5PiB7XG5cdFx0cmV0dXJuIHRoaXMubG9nRW50cmllcztcblx0fVxuXG5cdGFzeW5jIGdldENvbnRlbnQoKTogUHJvbWlzZTx7IHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZzsgcmVhZG9ubHkgY29uc3VtZTogKCkgPT4gdm9pZCB9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0cyA9IGF3YWl0IFByb21pc2UuYWxsKHRoaXMuZmlsZUNvbnRlbnRQcm92aWRlckl0ZW1zLm1hcCgoW291dHB1dF0pID0+IG91dHB1dC5nZXRDb250ZW50KHRydWUpKSk7XG5cdFx0Y29uc3QgeyBjb250ZW50LCBsb2dFbnRyaWVzIH0gPSB0aGlzLmNvbWJpbmVMb2dFbnRyaWVzKG91dHB1dHMsIHRoaXMubG9nRW50cmllc1t0aGlzLmxvZ0VudHJpZXMubGVuZ3RoIC0gMV0pO1xuXHRcdGxldCBjb25zdW1lZCA9IGZhbHNlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50LFxuXHRcdFx0Y29uc3VtZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWNvbnN1bWVkKSB7XG5cdFx0XHRcdFx0Y29uc3VtZWQgPSB0cnVlO1xuXHRcdFx0XHRcdG91dHB1dHMuZm9yRWFjaCgoeyBjb25zdW1lIH0pID0+IGNvbnN1bWUoKSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dFbnRyaWVzLnB1c2goLi4ubG9nRW50cmllcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb21iaW5lTG9nRW50cmllcyhvdXRwdXRzOiB7IGNvbnRlbnQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH1bXSwgbGFzdEVudHJ5OiBJTG9nRW50cnkgfCB1bmRlZmluZWQpOiB7IGxvZ0VudHJpZXM6IElMb2dFbnRyeVtdOyBjb250ZW50OiBzdHJpbmcgfSB7XG5cblx0XHRvdXRwdXRzID0gb3V0cHV0cy5maWx0ZXIob3V0cHV0ID0+ICEhb3V0cHV0LmNvbnRlbnQpO1xuXG5cdFx0aWYgKG91dHB1dHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBsb2dFbnRyaWVzOiBbXSwgY29udGVudDogJycgfTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2dFbnRyaWVzOiBJTG9nRW50cnlbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHByb2Nlc3MgPSAobW9kZWw6IElUZXh0TW9kZWwsIGxvZ0VudHJ5OiBJTG9nRW50cnksIG5hbWU6IHN0cmluZyk6IFtJTG9nRW50cnksIHN0cmluZ10gPT4ge1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobG9nRW50cnkucmFuZ2UpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IG5hbWUgPyBgJHtsaW5lQ29udGVudC5zdWJzdHJpbmcoMCwgbG9nRW50cnkubG9nTGV2ZWxSYW5nZS5lbmRDb2x1bW4pfSBbJHtuYW1lfV0ke2xpbmVDb250ZW50LnN1YnN0cmluZyhsb2dFbnRyeS5sb2dMZXZlbFJhbmdlLmVuZENvbHVtbil9YCA6IGxpbmVDb250ZW50O1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdC4uLmxvZ0VudHJ5LFxuXHRcdFx0XHRjYXRlZ29yeTogbmFtZSxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShsb2dFbnRyeS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGxvZ0VudHJ5LmxvZ0xldmVsUmFuZ2Uuc3RhcnRDb2x1bW4sIGxvZ0VudHJ5LnJhbmdlLmVuZExpbmVOdW1iZXIsIG5hbWUgPyBsb2dFbnRyeS5yYW5nZS5lbmRDb2x1bW4gKyBuYW1lLmxlbmd0aCArIDMgOiBsb2dFbnRyeS5yYW5nZS5lbmRDb2x1bW4pLFxuXHRcdFx0fSwgY29udGVudF07XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0TW9kZWwsIG91dHB1dHNbMF0uY29udGVudCwgTE9HX01JTUUsIFRleHRNb2RlbC5ERUZBVUxUX0NSRUFUSU9OX09QVElPTlMsIG51bGwpO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtsb2dFbnRyeSwgY29udGVudF0gb2YgbG9nRW50cnlJdGVyYXRvcihtb2RlbCwgKGUpID0+IHByb2Nlc3MobW9kZWwsIGUsIG91dHB1dHNbMF0ubmFtZSkpKSB7XG5cdFx0XHRcdGxvZ0VudHJpZXMucHVzaChsb2dFbnRyeSk7XG5cdFx0XHRcdGNvbnRlbnRzLnB1c2goY29udGVudCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpbmRleCA9IDE7IGluZGV4IDwgb3V0cHV0cy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHsgY29udGVudCwgbmFtZSB9ID0gb3V0cHV0c1tpbmRleF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dE1vZGVsLCBjb250ZW50LCBMT0dfTUlNRSwgVGV4dE1vZGVsLkRFRkFVTFRfQ1JFQVRJT05fT1BUSU9OUywgbnVsbCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpdGVyYXRvciA9IGxvZ0VudHJ5SXRlcmF0b3IobW9kZWwsIChlKSA9PiBwcm9jZXNzKG1vZGVsLCBlLCBuYW1lKSk7XG5cdFx0XHRcdGxldCBuZXh0ID0gaXRlcmF0b3IubmV4dCgpO1xuXHRcdFx0XHR3aGlsZSAoIW5leHQuZG9uZSkge1xuXHRcdFx0XHRcdGNvbnN0IFtsb2dFbnRyeSwgY29udGVudF0gPSBuZXh0LnZhbHVlO1xuXHRcdFx0XHRcdGNvbnN0IGxvZ0VudHJpZXNUb0FkZCA9IFtsb2dFbnRyeV07XG5cdFx0XHRcdFx0Y29uc3QgY29udGVudHNUb0FkZCA9IFtjb250ZW50XTtcblxuXHRcdFx0XHRcdGxldCBpbnNlcnRpb25JbmRleDtcblxuXHRcdFx0XHRcdC8vIElmIHRoZSB0aW1lc3RhbXAgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIHRoZSBsYXN0IHRpbWVzdGFtcCxcblx0XHRcdFx0XHQvLyB3ZSBjYW4ganVzdCBhcHBlbmQgYWxsIHRoZSBlbnRyaWVzIGF0IHRoZSBlbmRcblx0XHRcdFx0XHRpZiAobG9nRW50cnkudGltZXN0YW1wID49IGxvZ0VudHJpZXNbbG9nRW50cmllcy5sZW5ndGggLSAxXS50aW1lc3RhbXApIHtcblx0XHRcdFx0XHRcdGluc2VydGlvbkluZGV4ID0gbG9nRW50cmllcy5sZW5ndGg7XG5cdFx0XHRcdFx0XHRmb3IgKG5leHQgPSBpdGVyYXRvci5uZXh0KCk7ICFuZXh0LmRvbmU7IG5leHQgPSBpdGVyYXRvci5uZXh0KCkpIHtcblx0XHRcdFx0XHRcdFx0bG9nRW50cmllc1RvQWRkLnB1c2gobmV4dC52YWx1ZVswXSk7XG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRzVG9BZGQucHVzaChuZXh0LnZhbHVlWzFdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAobG9nRW50cnkudGltZXN0YW1wIDw9IGxvZ0VudHJpZXNbMF0udGltZXN0YW1wKSB7XG5cdFx0XHRcdFx0XHRcdC8vIElmIHRoZSB0aW1lc3RhbXAgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIHRoZSBmaXJzdCB0aW1lc3RhbXBcblx0XHRcdFx0XHRcdFx0Ly8gdGhlbiBpbnNlcnQgYXQgdGhlIGJlZ2lubmluZ1xuXHRcdFx0XHRcdFx0XHRpbnNlcnRpb25JbmRleCA9IDA7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBPdGhlcndpc2UsIGZpbmQgdGhlIGluc2VydGlvbiBpbmRleFxuXHRcdFx0XHRcdFx0XHRjb25zdCBpZHggPSBiaW5hcnlTZWFyY2gobG9nRW50cmllcywgbG9nRW50cnksIChhLCBiKSA9PiBhLnRpbWVzdGFtcCAtIGIudGltZXN0YW1wKTtcblx0XHRcdFx0XHRcdFx0aW5zZXJ0aW9uSW5kZXggPSBpZHggPCAwID8gfmlkeCA6IGlkeDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gQ29sbGVjdCBhbGwgZW50cmllcyB0aGF0IGhhdmUgYSB0aW1lc3RhbXAgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIHRoZSB0aW1lc3RhbXAgYXQgdGhlIGluc2VydGlvbiBpbmRleFxuXHRcdFx0XHRcdFx0Zm9yIChuZXh0ID0gaXRlcmF0b3IubmV4dCgpOyAhbmV4dC5kb25lICYmIG5leHQudmFsdWVbMF0udGltZXN0YW1wIDw9IGxvZ0VudHJpZXNbaW5zZXJ0aW9uSW5kZXhdLnRpbWVzdGFtcDsgbmV4dCA9IGl0ZXJhdG9yLm5leHQoKSkge1xuXHRcdFx0XHRcdFx0XHRsb2dFbnRyaWVzVG9BZGQucHVzaChuZXh0LnZhbHVlWzBdKTtcblx0XHRcdFx0XHRcdFx0Y29udGVudHNUb0FkZC5wdXNoKG5leHQudmFsdWVbMV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnRlbnRzLnNwbGljZShpbnNlcnRpb25JbmRleCwgMCwgLi4uY29udGVudHNUb0FkZCk7XG5cdFx0XHRcdFx0bG9nRW50cmllcy5zcGxpY2UoaW5zZXJ0aW9uSW5kZXgsIDAsIC4uLmxvZ0VudHJpZXNUb0FkZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgY29udGVudCA9ICcnO1xuXHRcdGNvbnN0IHVwZGF0ZWRMb2dFbnRyaWVzOiBJTG9nRW50cnlbXSA9IFtdO1xuXHRcdGxldCBsb2dFbnRyeVN0YXJ0TGluZU51bWJlciA9IGxhc3RFbnRyeSA/IGxhc3RFbnRyeS5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMSA6IDE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsb2dFbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb250ZW50ICs9IGNvbnRlbnRzW2ldICsgJ1xcbic7XG5cdFx0XHRjb25zdCB1cGRhdGVkTG9nRW50cnkgPSBjaGFuZ2VTdGFydExpbmVOdW1iZXIobG9nRW50cmllc1tpXSwgbG9nRW50cnlTdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0dXBkYXRlZExvZ0VudHJpZXMucHVzaCh1cGRhdGVkTG9nRW50cnkpO1xuXHRcdFx0bG9nRW50cnlTdGFydExpbmVOdW1iZXIgPSB1cGRhdGVkTG9nRW50cnkucmFuZ2UuZW5kTGluZU51bWJlciArIDE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgbG9nRW50cmllczogdXBkYXRlZExvZ0VudHJpZXMsIGNvbnRlbnQgfTtcblx0fVxuXG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEZpbGVPdXRwdXRDaGFubmVsTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU91dHB1dENoYW5uZWxNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpc3Bvc2UuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIGxvYWRNb2RlbFByb21pc2U6IFByb21pc2U8SVRleHRNb2RlbD4gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcm90ZWN0ZWQgbW9kZWw6IElUZXh0TW9kZWwgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBtb2RlbFVwZGF0ZUluUHJvZ3Jlc3M6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbFVwZGF0ZUNhbmNlbGxhdGlvblNvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYXBwZW5kVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXIoMzAwKSk7XG5cdHByaXZhdGUgcmVwbGFjZVByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0YWJzdHJhY3QgcmVhZG9ubHkgc291cmNlOiBJT3V0cHV0Q29udGVudFNvdXJjZSB8IFJlYWRvbmx5QXJyYXk8SU91dHB1dENvbnRlbnRTb3VyY2U+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxVcmk6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlOiBJTGFuZ3VhZ2VTZWxlY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXRDb250ZW50UHJvdmlkZXI6IElDb250ZW50UHJvdmlkZXIsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRNb2RlbCgpOiBQcm9taXNlPElUZXh0TW9kZWw+IHtcblx0XHR0aGlzLmxvYWRNb2RlbFByb21pc2UgPSBQcm9taXNlcy53aXRoQXN5bmNCb2R5PElUZXh0TW9kZWw+KGFzeW5jIChjLCBlKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZS52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0dGhpcy5tb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCB0aGlzLmxhbmd1YWdlLCB0aGlzLm1vZGVsVXJpKTtcblx0XHRcdFx0Y29uc3QgeyBjb250ZW50LCBjb25zdW1lIH0gPSBhd2FpdCB0aGlzLm91dHB1dENvbnRlbnRQcm92aWRlci5nZXRDb250ZW50KCk7XG5cdFx0XHRcdGNvbnN1bWUoKTtcblx0XHRcdFx0dGhpcy5kb0FwcGVuZENvbnRlbnQodGhpcy5tb2RlbCwgY29udGVudCk7XG5cdFx0XHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlLnZhbHVlLmFkZCh0aGlzLm91dHB1dENvbnRlbnRQcm92aWRlci5vbkRpZFJlc2V0KCgpID0+IHRoaXMub25EaWRDb250ZW50Q2hhbmdlKHRydWUsIHRydWUpKSk7XG5cdFx0XHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlLnZhbHVlLmFkZCh0aGlzLm91dHB1dENvbnRlbnRQcm92aWRlci5vbkRpZEFwcGVuZCgoKSA9PiB0aGlzLm9uRGlkQ29udGVudENoYW5nZShmYWxzZSwgZmFsc2UpKSk7XG5cdFx0XHRcdHRoaXMub3V0cHV0Q29udGVudFByb3ZpZGVyLndhdGNoKCk7XG5cdFx0XHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlLnZhbHVlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5vdXRwdXRDb250ZW50UHJvdmlkZXIudW53YXRjaCgpKSk7XG5cdFx0XHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlLnZhbHVlLmFkZCh0aGlzLm1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMub3V0cHV0Q29udGVudFByb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbERpc3Bvc2FibGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5jYW5jZWxNb2RlbFVwZGF0ZSgpO1xuXHRcdFx0XHRcdHRoaXMubW9kZWwgPSBudWxsO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGModGhpcy5tb2RlbCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy5sb2FkTW9kZWxQcm9taXNlO1xuXHR9XG5cblx0Z2V0TG9nRW50cmllcygpOiByZWFkb25seSBJTG9nRW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMub3V0cHV0Q29udGVudFByb3ZpZGVyLmdldExvZ0VudHJpZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDb250ZW50Q2hhbmdlKHJlc2V0OiBib29sZWFuLCBhcHBlbmRJbW1lZGlhdGVseTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChyZXNldCAmJiAhdGhpcy5tb2RlbFVwZGF0ZUluUHJvZ3Jlc3MpIHtcblx0XHRcdHRoaXMuZG9VcGRhdGUoT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuQ2xlYXIsIHRydWUpO1xuXHRcdH1cblx0XHR0aGlzLmRvVXBkYXRlKE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLkFwcGVuZCwgYXBwZW5kSW1tZWRpYXRlbHkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvVXBkYXRlKG1vZGU6IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLCBpbW1lZGlhdGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAobW9kZSA9PT0gT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuQ2xlYXIgfHwgbW9kZSA9PT0gT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5jYW5jZWxNb2RlbFVwZGF0ZSgpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMubW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm1vZGVsVXBkYXRlSW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0aWYgKCF0aGlzLm1vZGVsVXBkYXRlQ2FuY2VsbGF0aW9uU291cmNlLnZhbHVlKSB7XG5cdFx0XHR0aGlzLm1vZGVsVXBkYXRlQ2FuY2VsbGF0aW9uU291cmNlLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5tb2RlbFVwZGF0ZUNhbmNlbGxhdGlvblNvdXJjZS52YWx1ZS50b2tlbjtcblxuXHRcdGlmIChtb2RlID09PSBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5DbGVhcikge1xuXHRcdFx0dGhpcy5jbGVhckNvbnRlbnQodGhpcy5tb2RlbCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAobW9kZSA9PT0gT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5yZXBsYWNlUHJvbWlzZSA9IHRoaXMucmVwbGFjZUNvbnRlbnQodGhpcy5tb2RlbCwgdG9rZW4pLmZpbmFsbHkoKCkgPT4gdGhpcy5yZXBsYWNlUHJvbWlzZSA9IHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmFwcGVuZENvbnRlbnQodGhpcy5tb2RlbCwgaW1tZWRpYXRlLCB0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckNvbnRlbnQobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpKV0pO1xuXHRcdHRoaXMubW9kZWxVcGRhdGVJblByb2dyZXNzID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZENvbnRlbnQobW9kZWw6IElUZXh0TW9kZWwsIGltbWVkaWF0ZTogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogdm9pZCB7XG5cdFx0dGhpcy5hcHBlbmRUaHJvdHRsZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHQvKiBBYm9ydCBpZiBvcGVyYXRpb24gaXMgY2FuY2VsbGVkICovXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvKiBXYWl0IGZvciByZXBsYWNlIHRvIGZpbmlzaCAqL1xuXHRcdFx0aWYgKHRoaXMucmVwbGFjZVByb21pc2UpIHtcblx0XHRcdFx0dHJ5IHsgYXdhaXQgdGhpcy5yZXBsYWNlUHJvbWlzZTsgfSBjYXRjaCAoZSkgeyAvKiBJZ25vcmUgKi8gfVxuXHRcdFx0XHQvKiBBYm9ydCBpZiBvcGVyYXRpb24gaXMgY2FuY2VsbGVkICovXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvKiBHZXQgY29udGVudCB0byBhcHBlbmQgKi9cblx0XHRcdGNvbnN0IHsgY29udGVudCwgY29uc3VtZSB9ID0gYXdhaXQgdGhpcy5vdXRwdXRDb250ZW50UHJvdmlkZXIuZ2V0Q29udGVudCgpO1xuXHRcdFx0LyogQWJvcnQgaWYgb3BlcmF0aW9uIGlzIGNhbmNlbGxlZCAqL1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0LyogQXBwbmVkIENvbnRlbnQgKi9cblx0XHRcdGNvbnN1bWUoKTtcblx0XHRcdHRoaXMuZG9BcHBlbmRDb250ZW50KG1vZGVsLCBjb250ZW50KTtcblx0XHRcdHRoaXMubW9kZWxVcGRhdGVJblByb2dyZXNzID0gZmFsc2U7XG5cdFx0fSwgaW1tZWRpYXRlID8gMCA6IHVuZGVmaW5lZCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9BcHBlbmRDb250ZW50KG1vZGVsOiBJVGV4dE1vZGVsLCBjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGxhc3RMaW5lTWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZSk7XG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKGxhc3RMaW5lLCBsYXN0TGluZU1heENvbHVtbiksIGNvbnRlbnQpXSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlcGxhY2VDb250ZW50KG1vZGVsOiBJVGV4dE1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvKiBHZXQgY29udGVudCB0byByZXBsYWNlICovXG5cdFx0Y29uc3QgeyBjb250ZW50LCBjb25zdW1lIH0gPSBhd2FpdCB0aGlzLm91dHB1dENvbnRlbnRQcm92aWRlci5nZXRDb250ZW50KCk7XG5cdFx0LyogQWJvcnQgaWYgb3BlcmF0aW9uIGlzIGNhbmNlbGxlZCAqL1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8qIENvbXB1dGUgRWRpdHMgKi9cblx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHRoaXMuZ2V0UmVwbGFjZUVkaXRzKG1vZGVsLCBjb250ZW50LnRvU3RyaW5nKCkpO1xuXHRcdC8qIEFib3J0IGlmIG9wZXJhdGlvbiBpcyBjYW5jZWxsZWQgKi9cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdW1lKCk7XG5cdFx0aWYgKGVkaXRzLmxlbmd0aCkge1xuXHRcdFx0LyogQXBwbHkgRWRpdHMgKi9cblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoZWRpdHMpO1xuXHRcdH1cblx0XHR0aGlzLm1vZGVsVXBkYXRlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZXBsYWNlRWRpdHMobW9kZWw6IElUZXh0TW9kZWwsIGNvbnRlbnRUb1JlcGxhY2U6IHN0cmluZyk6IFByb21pc2U8SVNpbmdsZUVkaXRPcGVyYXRpb25bXT4ge1xuXHRcdGlmICghY29udGVudFRvUmVwbGFjZSkge1xuXHRcdFx0cmV0dXJuIFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpKV07XG5cdFx0fVxuXHRcdGlmIChjb250ZW50VG9SZXBsYWNlICE9PSBtb2RlbC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHRoaXMuZWRpdG9yV29ya2VyU2VydmljZS5jb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmksIFt7IHRleHQ6IGNvbnRlbnRUb1JlcGxhY2UudG9TdHJpbmcoKSwgcmFuZ2U6IG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkgfV0pO1xuXHRcdFx0aWYgKGVkaXRzPy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRzLm1hcChlZGl0ID0+IEVkaXRPcGVyYXRpb24ucmVwbGFjZShSYW5nZS5saWZ0KGVkaXQucmFuZ2UpLCBlZGl0LnRleHQpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNhbmNlbE1vZGVsVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWxVcGRhdGVDYW5jZWxsYXRpb25Tb3VyY2UudmFsdWU/LmNhbmNlbCgpO1xuXHRcdHRoaXMubW9kZWxVcGRhdGVDYW5jZWxsYXRpb25Tb3VyY2UudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5hcHBlbmRUaHJvdHRsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5yZXBsYWNlUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLm1vZGVsVXBkYXRlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLm1vZGVsO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpc3Bvc2UuZmlyZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFwcGVuZChtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7IH1cblx0cmVwbGFjZShtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7IH1cblxuXHRhYnN0cmFjdCBjbGVhcigpOiB2b2lkO1xuXHRhYnN0cmFjdCB1cGRhdGUobW9kZTogT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUsIHRpbGw6IG51bWJlciB8IHVuZGVmaW5lZCwgaW1tZWRpYXRlOiBib29sZWFuKTogdm9pZDtcblx0YWJzdHJhY3QgdXBkYXRlQ2hhbm5lbFNvdXJjZXMoZmlsZXM6IElPdXRwdXRDb250ZW50U291cmNlW10pOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgRmlsZU91dHB1dENoYW5uZWxNb2RlbCBleHRlbmRzIEFic3RyYWN0RmlsZU91dHB1dENoYW5uZWxNb2RlbCBpbXBsZW1lbnRzIElPdXRwdXRDaGFubmVsTW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZU91dHB1dDogRmlsZUNvbnRlbnRQcm92aWRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtb2RlbFVyaTogVVJJLFxuXHRcdGxhbmd1YWdlOiBJTGFuZ3VhZ2VTZWxlY3Rpb24sXG5cdFx0cmVhZG9ubHkgc291cmNlOiBJT3V0cHV0Q29udGVudFNvdXJjZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFZGl0b3JXb3JrZXJTZXJ2aWNlIGVkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBmaWxlT3V0cHV0ID0gbmV3IEZpbGVDb250ZW50UHJvdmlkZXIoc291cmNlLCBmaWxlU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdHN1cGVyKG1vZGVsVXJpLCBsYW5ndWFnZSwgZmlsZU91dHB1dCwgbW9kZWxTZXJ2aWNlLCBlZGl0b3JXb3JrZXJTZXJ2aWNlKTtcblx0XHR0aGlzLmZpbGVPdXRwdXQgPSB0aGlzLl9yZWdpc3RlcihmaWxlT3V0cHV0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlKE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLkNsZWFyLCB1bmRlZmluZWQsIHRydWUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlKG1vZGU6IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLCB0aWxsOiBudW1iZXIgfCB1bmRlZmluZWQsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGxvYWRNb2RlbFByb21pc2UgPSB0aGlzLmxvYWRNb2RlbFByb21pc2UgPyB0aGlzLmxvYWRNb2RlbFByb21pc2UgOiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRsb2FkTW9kZWxQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKG1vZGUgPT09IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLkNsZWFyIHx8IG1vZGUgPT09IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLlJlcGxhY2UpIHtcblx0XHRcdFx0aWYgKGlzTnVtYmVyKHRpbGwpKSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlT3V0cHV0LnJlc2V0KHRpbGwpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZmlsZU91dHB1dC5yZXNldFRvRW5kKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuZG9VcGRhdGUobW9kZSwgaW1tZWRpYXRlKTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZUNoYW5uZWxTb3VyY2VzKGZpbGVzOiBJT3V0cHV0Q29udGVudFNvdXJjZVtdKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBNdWx0aUZpbGVPdXRwdXRDaGFubmVsTW9kZWwgZXh0ZW5kcyBBYnN0cmFjdEZpbGVPdXRwdXRDaGFubmVsTW9kZWwgaW1wbGVtZW50cyBJT3V0cHV0Q2hhbm5lbE1vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG11bHRpZmlsZU91dHB1dDogTXVsdGlGaWxlQ29udGVudFByb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1vZGVsVXJpOiBVUkksXG5cdFx0bGFuZ3VhZ2U6IElMYW5ndWFnZVNlbGVjdGlvbixcblx0XHRyZWFkb25seSBzb3VyY2U6IElPdXRwdXRDb250ZW50U291cmNlW10sXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFZGl0b3JXb3JrZXJTZXJ2aWNlIGVkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgbXVsdGlmaWxlT3V0cHV0ID0gbmV3IE11bHRpRmlsZUNvbnRlbnRQcm92aWRlcihzb3VyY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0c3VwZXIobW9kZWxVcmksIGxhbmd1YWdlLCBtdWx0aWZpbGVPdXRwdXQsIG1vZGVsU2VydmljZSwgZWRpdG9yV29ya2VyU2VydmljZSk7XG5cdFx0dGhpcy5tdWx0aWZpbGVPdXRwdXQgPSB0aGlzLl9yZWdpc3RlcihtdWx0aWZpbGVPdXRwdXQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlQ2hhbm5lbFNvdXJjZXMoZmlsZXM6IElPdXRwdXRDb250ZW50U291cmNlW10pOiB2b2lkIHtcblx0XHR0aGlzLm11bHRpZmlsZU91dHB1dC51bndhdGNoKCk7XG5cdFx0dGhpcy5tdWx0aWZpbGVPdXRwdXQudXBkYXRlRmlsZXMoZmlsZXMpO1xuXHRcdHRoaXMubXVsdGlmaWxlT3V0cHV0LnJlc2V0KCk7XG5cdFx0dGhpcy5kb1VwZGF0ZShPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5SZXBsYWNlLCB0cnVlKTtcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0dGhpcy5tdWx0aWZpbGVPdXRwdXQud2F0Y2goKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcigpOiB2b2lkIHtcblx0XHRjb25zdCBsb2FkTW9kZWxQcm9taXNlID0gdGhpcy5sb2FkTW9kZWxQcm9taXNlID8gdGhpcy5sb2FkTW9kZWxQcm9taXNlIDogUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0bG9hZE1vZGVsUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMubXVsdGlmaWxlT3V0cHV0LnJlc2V0VG9FbmQoKTtcblx0XHRcdHRoaXMuZG9VcGRhdGUoT3V0cHV0Q2hhbm5lbFVwZGF0ZU1vZGUuQ2xlYXIsIHRydWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlKG1vZGU6IE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLCB0aWxsOiBudW1iZXIgfCB1bmRlZmluZWQsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTsgfVxufVxuXG5jbGFzcyBPdXRwdXRDaGFubmVsQmFja2VkQnlGaWxlIGV4dGVuZHMgRmlsZU91dHB1dENoYW5uZWxNb2RlbCBpbXBsZW1lbnRzIElPdXRwdXRDaGFubmVsTW9kZWwge1xuXG5cdHByaXZhdGUgbG9nZ2VyOiBJTG9nZ2VyO1xuXHRwcml2YXRlIF9vZmZzZXQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdG1vZGVsVXJpOiBVUkksXG5cdFx0bGFuZ3VhZ2U6IElMYW5ndWFnZVNlbGVjdGlvbixcblx0XHRmaWxlOiBVUkksXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgZWRpdG9yV29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIobW9kZWxVcmksIGxhbmd1YWdlLCB7IHJlc291cmNlOiBmaWxlLCBuYW1lOiAnJyB9LCBmaWxlU2VydmljZSwgbW9kZWxTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgbG9nU2VydmljZSwgZWRpdG9yV29ya2VyU2VydmljZSk7XG5cblx0XHQvLyBEb25vdCByb3RhdGUgdG8gY2hlY2sgZm9yIHRoZSBmaWxlIHJlc2V0XG5cdFx0dGhpcy5sb2dnZXIgPSBsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihmaWxlLCB7IGxvZ0xldmVsOiAnYWx3YXlzJywgZG9ub3RSb3RhdGU6IHRydWUsIGRvbm90VXNlRm9ybWF0dGVyczogdHJ1ZSwgaGlkZGVuOiB0cnVlIH0pO1xuXHRcdHRoaXMuX29mZnNldCA9IDA7XG5cdH1cblxuXHRvdmVycmlkZSBhcHBlbmQobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy53cml0ZShtZXNzYWdlKTtcblx0XHR0aGlzLnVwZGF0ZShPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5BcHBlbmQsIHVuZGVmaW5lZCwgdGhpcy5pc1Zpc2libGUoKSk7XG5cdH1cblxuXHRvdmVycmlkZSByZXBsYWNlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRpbGwgPSB0aGlzLl9vZmZzZXQ7XG5cdFx0dGhpcy53cml0ZShtZXNzYWdlKTtcblx0XHR0aGlzLnVwZGF0ZShPdXRwdXRDaGFubmVsVXBkYXRlTW9kZS5SZXBsYWNlLCB0aWxsLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgd3JpdGUoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb2Zmc2V0ICs9IFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkuYnl0ZUxlbmd0aDtcblx0XHR0aGlzLmxvZ2dlci5pbmZvKGNvbnRlbnQpO1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5mbHVzaCgpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBEZWxlZ2F0ZWRPdXRwdXRDaGFubmVsTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU91dHB1dENoYW5uZWxNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaXNwb3NlOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXRDaGFubmVsTW9kZWw6IFByb21pc2U8SU91dHB1dENoYW5uZWxNb2RlbD47XG5cdHJlYWRvbmx5IHNvdXJjZTogSU91dHB1dENvbnRlbnRTb3VyY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRtb2RlbFVyaTogVVJJLFxuXHRcdGxhbmd1YWdlOiBJTGFuZ3VhZ2VTZWxlY3Rpb24sXG5cdFx0b3V0cHV0RGlyOiBVUkksXG5cdFx0b3V0cHV0RGlyQ3JlYXRpb25Qcm9taXNlOiBQcm9taXNlPHZvaWQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub3V0cHV0Q2hhbm5lbE1vZGVsID0gdGhpcy5jcmVhdGVPdXRwdXRDaGFubmVsTW9kZWwoaWQsIG1vZGVsVXJpLCBsYW5ndWFnZSwgb3V0cHV0RGlyLCBvdXRwdXREaXJDcmVhdGlvblByb21pc2UpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VzLmpvaW5QYXRoKG91dHB1dERpciwgYCR7aWQucmVwbGFjZSgvW1xcXFwvOlxcKlxcP1wiPD5cXHxdL2csICcnKX0ubG9nYCk7XG5cdFx0dGhpcy5zb3VyY2UgPSB7IHJlc291cmNlIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZU91dHB1dENoYW5uZWxNb2RlbChpZDogc3RyaW5nLCBtb2RlbFVyaTogVVJJLCBsYW5ndWFnZTogSUxhbmd1YWdlU2VsZWN0aW9uLCBvdXRwdXREaXI6IFVSSSwgb3V0cHV0RGlyUHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IFByb21pc2U8SU91dHB1dENoYW5uZWxNb2RlbD4ge1xuXHRcdGF3YWl0IG91dHB1dERpclByb21pc2U7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlcy5qb2luUGF0aChvdXRwdXREaXIsIGAke2lkLnJlcGxhY2UoL1tcXFxcLzpcXCpcXD9cIjw+XFx8XS9nLCAnJyl9LmxvZ2ApO1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShmaWxlKTtcblx0XHRjb25zdCBvdXRwdXRDaGFubmVsTW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE91dHB1dENoYW5uZWxCYWNrZWRCeUZpbGUsIGlkLCBtb2RlbFVyaSwgbGFuZ3VhZ2UsIGZpbGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvdXRwdXRDaGFubmVsTW9kZWwub25EaXNwb3NlKCgpID0+IHRoaXMuX29uRGlzcG9zZS5maXJlKCkpKTtcblx0XHRyZXR1cm4gb3V0cHV0Q2hhbm5lbE1vZGVsO1xuXHR9XG5cblx0Z2V0TG9nRW50cmllcygpOiByZWFkb25seSBJTG9nRW50cnlbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXBwZW5kKG91dHB1dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5vdXRwdXRDaGFubmVsTW9kZWwudGhlbihvdXRwdXRDaGFubmVsTW9kZWwgPT4gb3V0cHV0Q2hhbm5lbE1vZGVsLmFwcGVuZChvdXRwdXQpKTtcblx0fVxuXG5cdHVwZGF0ZShtb2RlOiBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZSwgdGlsbDogbnVtYmVyIHwgdW5kZWZpbmVkLCBpbW1lZGlhdGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLm91dHB1dENoYW5uZWxNb2RlbC50aGVuKG91dHB1dENoYW5uZWxNb2RlbCA9PiBvdXRwdXRDaGFubmVsTW9kZWwudXBkYXRlKG1vZGUsIHRpbGwsIGltbWVkaWF0ZSkpO1xuXHR9XG5cblx0bG9hZE1vZGVsKCk6IFByb21pc2U8SVRleHRNb2RlbD4ge1xuXHRcdHJldHVybiB0aGlzLm91dHB1dENoYW5uZWxNb2RlbC50aGVuKG91dHB1dENoYW5uZWxNb2RlbCA9PiBvdXRwdXRDaGFubmVsTW9kZWwubG9hZE1vZGVsKCkpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5vdXRwdXRDaGFubmVsTW9kZWwudGhlbihvdXRwdXRDaGFubmVsTW9kZWwgPT4gb3V0cHV0Q2hhbm5lbE1vZGVsLmNsZWFyKCkpO1xuXHR9XG5cblx0cmVwbGFjZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5vdXRwdXRDaGFubmVsTW9kZWwudGhlbihvdXRwdXRDaGFubmVsTW9kZWwgPT4gb3V0cHV0Q2hhbm5lbE1vZGVsLnJlcGxhY2UodmFsdWUpKTtcblx0fVxuXG5cdHVwZGF0ZUNoYW5uZWxTb3VyY2VzKGZpbGVzOiBJT3V0cHV0Q29udGVudFNvdXJjZVtdKTogdm9pZCB7XG5cdFx0dGhpcy5vdXRwdXRDaGFubmVsTW9kZWwudGhlbihvdXRwdXRDaGFubmVsTW9kZWwgPT4gb3V0cHV0Q2hhbm5lbE1vZGVsLnVwZGF0ZUNoYW5uZWxTb3VyY2VzKGZpbGVzKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw2QkFBNkI7QUFDdEMsWUFBWSxlQUFlO0FBRTNCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsVUFBVSx3QkFBd0I7QUFDM0MsU0FBUyxxQkFBcUIsY0FBYyw2QkFBNkI7QUFDekUsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxZQUFZLGNBQTJCLG1CQUFtQix1QkFBdUI7QUFDMUYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBMkM7QUFDcEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWtCLGdCQUFnQixhQUFhLGdCQUFnQjtBQUMvRCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBMEMsVUFBVSwrQkFBK0I7QUFDbkYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjLGtCQUFrQjtBQUV6QyxNQUFNLGtCQUFrQjtBQUVqQixTQUFTLGdCQUFnQixPQUFtQixZQUFzQztBQUN4RixRQUFNLGNBQWMsTUFBTSxlQUFlLFVBQVU7QUFDbkQsUUFBTSxRQUFRLGdCQUFnQixLQUFLLFdBQVc7QUFDOUMsTUFBSSxPQUFPO0FBQ1YsVUFBTSxZQUFZLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFF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
