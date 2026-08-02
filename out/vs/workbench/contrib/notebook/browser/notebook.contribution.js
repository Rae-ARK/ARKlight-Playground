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
import { Schemas } from "../../../../base/common/network.js";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { toFormattedString } from "../../../../base/common/jsonFormatter.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as nls from "../../../../nls.js";
import { Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { NotebookEditor } from "./notebookEditor.js";
import { NotebookEditorInput } from "../common/notebookEditorInput.js";
import { INotebookService } from "../common/notebookService.js";
import { NotebookService } from "./services/notebookServiceImpl.js";
import { CellKind, CellUri, NotebookWorkingCopyTypeIdentifier, NotebookSetting, NotebookCellsChangeType, NotebookMetadataUri } from "../common/notebookCommon.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { INotebookEditorModelResolverService } from "../common/notebookEditorModelResolverService.js";
import { NotebookDiffEditorInput } from "../common/notebookDiffEditorInput.js";
import { NotebookTextDiffEditor } from "./diff/notebookDiffEditor.js";
import { INotebookEditorWorkerService } from "../common/services/notebookWorkerService.js";
import { NotebookEditorWorkerServiceImpl } from "./services/notebookWorkerServiceImpl.js";
import { INotebookCellStatusBarService } from "../common/notebookCellStatusBarService.js";
import { NotebookCellStatusBarService } from "./services/notebookCellStatusBarServiceImpl.js";
import { INotebookEditorService } from "./services/notebookEditorService.js";
import { NotebookEditorWidgetService } from "./services/notebookEditorServiceImpl.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Event } from "../../../../base/common/event.js";
import { getFormattedOutputJSON, getStreamOutputData } from "./diff/diffElementViewModel.js";
import { NotebookModelResolverServiceImpl } from "../common/notebookEditorModelResolverServiceImpl.js";
import { INotebookKernelHistoryService, INotebookKernelService } from "../common/notebookKernelService.js";
import { NotebookKernelService } from "./services/notebookKernelServiceImpl.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { NotebookRendererMessagingService } from "./services/notebookRendererMessagingServiceImpl.js";
import { INotebookRendererMessagingService } from "../common/notebookRendererMessagingService.js";
import { INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory } from "./viewModel/notebookOutlineDataSourceFactory.js";
import "./controller/coreActions.js";
import "./controller/insertCellActions.js";
import "./controller/executeActions.js";
import "./controller/sectionActions.js";
import "./controller/layoutActions.js";
import "./controller/editActions.js";
import "./controller/cellOutputActions.js";
import "./controller/apiActions.js";
import "./controller/foldingController.js";
import "./controller/chat/notebook.chat.contribution.js";
import "./controller/variablesActions.js";
import "./contrib/editorHint/emptyCellEditorHint.js";
import "./contrib/clipboard/notebookClipboard.js";
import "./contrib/find/notebookFind.js";
import "./contrib/format/formatting.js";
import "./contrib/saveParticipants/saveParticipants.js";
import "./contrib/gettingStarted/notebookGettingStarted.js";
import "./contrib/layout/layoutActions.js";
import "./contrib/marker/markerProvider.js";
import "./contrib/navigation/arrow.js";
import "./contrib/outline/notebookOutline.js";
import "./contrib/profile/notebookProfile.js";
import "./contrib/cellStatusBar/statusBarProviders.js";
import "./contrib/cellStatusBar/contributedStatusBarItemController.js";
import "./contrib/cellStatusBar/executionStatusBarItemController.js";
import "./contrib/editorStatusBar/editorStatusBar.js";
import "./contrib/undoRedo/notebookUndoRedo.js";
import "./contrib/cellCommands/cellCommands.js";
import "./contrib/viewportWarmup/viewportWarmup.js";
import "./contrib/troubleshoot/layout.js";
import "./contrib/debug/notebookBreakpoints.js";
import "./contrib/debug/notebookCellPausing.js";
import "./contrib/debug/notebookDebugDecorations.js";
import "./contrib/execute/executionEditorProgress.js";
import "./contrib/kernelDetection/notebookKernelDetection.js";
import "./contrib/cellDiagnostics/cellDiagnostics.js";
import "./contrib/multicursor/notebookMulticursor.js";
import "./contrib/multicursor/notebookSelectionHighlight.js";
import "./contrib/notebookVariables/notebookInlineVariables.js";
import "./diff/notebookDiffActions.js";
import { editorOptionsRegistry } from "../../../../editor/common/config/editorOptions.js";
import { NotebookExecutionStateService } from "./services/notebookExecutionStateServiceImpl.js";
import { NotebookExecutionService } from "./services/notebookExecutionServiceImpl.js";
import { INotebookExecutionService } from "../common/notebookExecutionService.js";
import { INotebookKeymapService } from "../common/notebookKeymapService.js";
import { NotebookKeymapService } from "./services/notebookKeymapServiceImpl.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { INotebookExecutionStateService } from "../common/notebookExecutionStateService.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { COMMENTEDITOR_DECORATION_KEY } from "../../comments/browser/commentReply.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { NotebookKernelHistoryService } from "./services/notebookKernelHistoryServiceImpl.js";
import { INotebookLoggingService } from "../common/notebookLoggingService.js";
import { NotebookLoggingService } from "./services/notebookLoggingServiceImpl.js";
import product from "../../../../platform/product/common/product.js";
import { NotebookVariables } from "./contrib/notebookVariables/notebookVariables.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { NotebookAccessibilityHelp } from "./notebookAccessibilityHelp.js";
import { NotebookAccessibleView } from "./notebookAccessibleView.js";
import { DefaultFormatter } from "../../format/browser/formatActionsMultiple.js";
import { NotebookMultiTextDiffEditor } from "./diff/notebookMultiDiffEditor.js";
import { NotebookMultiDiffEditorInput } from "./diff/notebookMultiDiffEditorInput.js";
import { getFormattedMetadataJSON } from "../common/model/notebookCellTextModel.js";
import { INotebookOutlineEntryFactory, NotebookOutlineEntryFactory } from "./viewModel/notebookOutlineEntryFactory.js";
import { getFormattedNotebookMetadataJSON } from "../common/model/notebookMetadataTextModel.js";
import { NotebookOutputEditor } from "./outputEditor/notebookOutputEditor.js";
import { NotebookOutputEditorInput } from "./outputEditor/notebookOutputEditorInput.js";
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookEditor,
    NotebookEditor.ID,
    "Notebook Editor"
  ),
  [
    new SyncDescriptor(NotebookEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookTextDiffEditor,
    NotebookTextDiffEditor.ID,
    "Notebook Diff Editor"
  ),
  [
    new SyncDescriptor(NotebookDiffEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookOutputEditor,
    NotebookOutputEditor.ID,
    "Notebook Output Editor"
  ),
  [
    new SyncDescriptor(NotebookOutputEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookMultiTextDiffEditor,
    NotebookMultiTextDiffEditor.ID,
    "Notebook Diff Editor"
  ),
  [
    new SyncDescriptor(NotebookMultiDiffEditorInput)
  ]
);
let NotebookDiffEditorSerializer = class {
  constructor(_configurationService) {
    this._configurationService = _configurationService;
  }
  canSerialize() {
    return true;
  }
  serialize(input) {
    assertType(input instanceof NotebookDiffEditorInput);
    return JSON.stringify({
      resource: input.resource,
      originalResource: input.original.resource,
      name: input.getName(),
      originalName: input.original.getName(),
      textDiffName: input.getName(),
      viewType: input.viewType
    });
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, originalResource, name, viewType } = data;
    if (!data || !URI.isUri(resource) || !URI.isUri(originalResource) || typeof name !== "string" || typeof viewType !== "string") {
      return void 0;
    }
    if (this._configurationService.getValue("notebook.experimental.enableNewDiffEditor")) {
      return NotebookMultiDiffEditorInput.create(instantiationService, resource, name, void 0, originalResource, viewType);
    } else {
      return NotebookDiffEditorInput.create(instantiationService, resource, name, void 0, originalResource, viewType);
    }
  }
  static canResolveBackup(editorInput, backupResource) {
    return false;
  }
};
NotebookDiffEditorSerializer = __decorateClass([
  __decorateParam(0, IConfigurationService)
], NotebookDiffEditorSerializer);
class NotebookEditorSerializer {
  canSerialize(input) {
    return input.typeId === NotebookEditorInput.ID;
  }
  serialize(input) {
    assertType(input instanceof NotebookEditorInput);
    const data = {
      resource: input.resource,
      preferredResource: input.preferredResource,
      viewType: input.viewType,
      options: input.options
    };
    return JSON.stringify(data);
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, preferredResource, viewType, options } = data;
    if (!data || !URI.isUri(resource) || typeof viewType !== "string") {
      return void 0;
    }
    const input = NotebookEditorInput.getOrCreate(instantiationService, resource, preferredResource, viewType, options);
    return input;
  }
}
class NotebookOutputEditorSerializer {
  canSerialize(input) {
    return input.typeId === NotebookOutputEditorInput.ID;
  }
  serialize(input) {
    assertType(input instanceof NotebookOutputEditorInput);
    const data = input.getSerializedData();
    if (!data) {
      return void 0;
    }
    return JSON.stringify(data);
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const input = instantiationService.createInstance(NotebookOutputEditorInput, data.notebookUri, data.cellIndex, void 0, data.outputIndex);
    return input;
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  NotebookEditorInput.ID,
  NotebookEditorSerializer
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  NotebookDiffEditorInput.ID,
  NotebookDiffEditorSerializer
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  NotebookOutputEditorInput.ID,
  NotebookOutputEditorSerializer
);
let NotebookContribution = class extends Disposable {
  constructor(undoRedoService, configurationService, codeEditorService) {
    super();
    this.codeEditorService = codeEditorService;
    this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.undoRedoPerCell)) {
        this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);
      }
    }));
    this._register(this.codeEditorService.registerDecorationType("comment-controller", COMMENTEDITOR_DECORATION_KEY, {}));
  }
  // Add or remove the cell undo redo comparison key based on the user setting
  updateCellUndoRedoComparisonKey(configurationService, undoRedoService) {
    const undoRedoPerCell = configurationService.getValue(NotebookSetting.undoRedoPerCell);
    if (!undoRedoPerCell) {
      if (!this._uriComparisonKeyComputer) {
        this._uriComparisonKeyComputer = undoRedoService.registerUriComparisonKeyComputer(CellUri.scheme, {
          getComparisonKey: (uri) => {
            if (undoRedoPerCell) {
              return uri.toString();
            }
            return NotebookContribution._getCellUndoRedoComparisonKey(uri);
          }
        });
      }
    } else {
      this._uriComparisonKeyComputer?.dispose();
      this._uriComparisonKeyComputer = void 0;
    }
  }
  static _getCellUndoRedoComparisonKey(uri) {
    const data = CellUri.parse(uri);
    if (!data) {
      return uri.toString();
    }
    return data.notebook.toString();
  }
  dispose() {
    super.dispose();
    this._uriComparisonKeyComputer?.dispose();
  }
};
NotebookContribution.ID = "workbench.contrib.notebook";
NotebookContribution = __decorateClass([
  __decorateParam(0, IUndoRedoService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ICodeEditorService)
], NotebookContribution);
let CellContentProvider = class {
  constructor(textModelService, _modelService, _languageService, _notebookModelResolverService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._registration = textModelService.registerTextModelContentProvider(CellUri.scheme, this);
  }
  dispose() {
    this._registration.dispose();
  }
  async provideTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parse(resource);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    let result = null;
    if (!ref.object.isResolved()) {
      return null;
    }
    for (const cell of ref.object.notebook.cells) {
      if (cell.uri.toString() === resource.toString()) {
        const bufferFactory = {
          create: (defaultEOL) => {
            return { textBuffer: cell.textBuffer, disposable: Disposable.None };
          },
          getFirstLineText: (limit) => {
            return cell.textBuffer.getLineContent(1).substring(0, limit);
          }
        };
        const languageId = this._languageService.getLanguageIdByLanguageName(cell.language);
        const languageSelection = languageId ? this._languageService.createById(languageId) : cell.cellKind === CellKind.Markup ? this._languageService.createById("markdown") : this._languageService.createByFilepathOrFirstLine(resource, cell.textBuffer.getLineContent(1));
        result = this._modelService.createModel(
          bufferFactory,
          languageSelection,
          resource
        );
        break;
      }
    }
    if (!result) {
      ref.dispose();
      return null;
    }
    const once = Event.any(result.onWillDispose, ref.object.notebook.onWillDispose)(() => {
      once.dispose();
      ref.dispose();
    });
    return result;
  }
};
CellContentProvider.ID = "workbench.contrib.cellContentProvider";
CellContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, INotebookEditorModelResolverService)
], CellContentProvider);
let CellInfoContentProvider = class {
  constructor(textModelService, _modelService, _languageService, _labelService, _notebookModelResolverService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._labelService = _labelService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._disposables = [];
    this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellMetadata, {
      provideTextContent: this.provideMetadataTextContent.bind(this)
    }));
    this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellOutput, {
      provideTextContent: this.provideOutputTextContent.bind(this)
    }));
    this._disposables.push(this._labelService.registerFormatter({
      scheme: Schemas.vscodeNotebookCellMetadata,
      formatting: {
        label: "${path} (metadata)",
        separator: "/"
      }
    }));
    this._disposables.push(this._labelService.registerFormatter({
      scheme: Schemas.vscodeNotebookCellOutput,
      formatting: {
        label: "${path} (output)",
        separator: "/"
      }
    }));
  }
  dispose() {
    dispose(this._disposables);
  }
  async provideMetadataTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellMetadata);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    let result = null;
    const mode = this._languageService.createById("json");
    const disposables = new DisposableStore();
    for (const cell of ref.object.notebook.cells) {
      if (cell.handle === data.handle) {
        const cellIndex = ref.object.notebook.cells.indexOf(cell);
        const metadataSource = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language, true);
        result = this._modelService.createModel(
          metadataSource,
          mode,
          resource
        );
        this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent((e) => {
          if (result && e.rawEvents.some((event) => (event.kind === NotebookCellsChangeType.ChangeCellMetadata || event.kind === NotebookCellsChangeType.ChangeCellLanguage) && event.index === cellIndex)) {
            const value = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language, true);
            if (result.getValue() !== value) {
              result.setValue(value);
            }
          }
        })));
        break;
      }
    }
    if (!result) {
      ref.dispose();
      return null;
    }
    const once = result.onWillDispose(() => {
      disposables.dispose();
      once.dispose();
      ref.dispose();
    });
    return result;
  }
  parseStreamOutput(op) {
    if (!op) {
      return;
    }
    const streamOutputData = getStreamOutputData(op.outputs);
    if (streamOutputData) {
      return {
        content: streamOutputData,
        mode: this._languageService.createById(PLAINTEXT_LANGUAGE_ID)
      };
    }
    return;
  }
  _getResult(data, cell) {
    let result = void 0;
    const mode = this._languageService.createById("json");
    const op = cell.outputs.find((op2) => op2.outputId === data.outputId || op2.alternativeOutputId === data.outputId);
    const streamOutputData = this.parseStreamOutput(op);
    if (streamOutputData) {
      result = streamOutputData;
      return result;
    }
    const obj = cell.outputs.map((output) => ({
      metadata: output.metadata,
      outputItems: output.outputs.map((opit) => ({
        mimeType: opit.mime,
        data: opit.data.toString()
      }))
    }));
    const outputSource = toFormattedString(obj, {});
    result = {
      content: outputSource,
      mode
    };
    return result;
  }
  async provideOutputsTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellOutput);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    const cell = ref.object.notebook.cells.find((cell2) => cell2.handle === data.handle);
    if (!cell) {
      ref.dispose();
      return null;
    }
    const mode = this._languageService.createById("json");
    const model = this._modelService.createModel(getFormattedOutputJSON(cell.outputs || []), mode, resource, true);
    const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
      model.setValue(getFormattedOutputJSON(cell.outputs || []));
    });
    const once = model.onWillDispose(() => {
      once.dispose();
      cellModelListener.dispose();
      ref.dispose();
    });
    return model;
  }
  async provideOutputTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parseCellOutputUri(resource);
    if (!data) {
      return this.provideOutputsTextContent(resource);
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    const cell = ref.object.notebook.cells.find((cell2) => !!cell2.outputs.find((op) => op.outputId === data.outputId || op.alternativeOutputId === data.outputId));
    if (!cell) {
      ref.dispose();
      return null;
    }
    const result = this._getResult(data, cell);
    if (!result) {
      ref.dispose();
      return null;
    }
    const model = this._modelService.createModel(result.content, result.mode, resource);
    const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
      const newResult = this._getResult(data, cell);
      if (!newResult) {
        return;
      }
      model.setValue(newResult.content);
      model.setLanguage(newResult.mode.languageId);
    });
    const once = model.onWillDispose(() => {
      once.dispose();
      cellModelListener.dispose();
      ref.dispose();
    });
    return model;
  }
};
CellInfoContentProvider.ID = "workbench.contrib.cellInfoContentProvider";
CellInfoContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, INotebookEditorModelResolverService)
], CellInfoContentProvider);
let NotebookMetadataContentProvider = class {
  constructor(textModelService, _modelService, _languageService, _labelService, _notebookModelResolverService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._labelService = _labelService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._disposables = [];
    this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookMetadata, {
      provideTextContent: this.provideMetadataTextContent.bind(this)
    }));
    this._disposables.push(this._labelService.registerFormatter({
      scheme: Schemas.vscodeNotebookMetadata,
      formatting: {
        label: "${path} (metadata)",
        separator: "/"
      }
    }));
  }
  dispose() {
    dispose(this._disposables);
  }
  async provideMetadataTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = NotebookMetadataUri.parse(resource);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data);
    let result = null;
    const mode = this._languageService.createById("json");
    const disposables = new DisposableStore();
    const metadataSource = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
    result = this._modelService.createModel(
      metadataSource,
      mode,
      resource
    );
    if (!result) {
      ref.dispose();
      return null;
    }
    this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent((e) => {
      if (result && e.rawEvents.some((event) => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ChangeDocumentMetadata || event.kind === NotebookCellsChangeType.ModelChange)) {
        const value = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
        if (result.getValue() !== value) {
          result.setValue(value);
        }
      }
    })));
    const once = result.onWillDispose(() => {
      disposables.dispose();
      once.dispose();
      ref.dispose();
    });
    return result;
  }
};
NotebookMetadataContentProvider.ID = "workbench.contrib.notebookMetadataContentProvider";
NotebookMetadataContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, INotebookEditorModelResolverService)
], NotebookMetadataContentProvider);
class RegisterSchemasContribution extends Disposable {
  constructor() {
    super();
    this.registerMetadataSchemas();
  }
  registerMetadataSchemas() {
    const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
    const metadataSchema = {
      properties: {
        ["language"]: {
          type: "string",
          description: "The language for the cell"
        }
      },
      // patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    jsonRegistry.registerSchema("vscode://schemas/notebook/cellmetadata", metadataSchema);
  }
}
RegisterSchemasContribution.ID = "workbench.contrib.registerCellSchemas";
let NotebookEditorManager = class {
  constructor(_editorService, _notebookEditorModelService, editorGroups) {
    this._editorService = _editorService;
    this._notebookEditorModelService = _notebookEditorModelService;
    this._disposables = new DisposableStore();
    this._disposables.add(Event.debounce(
      this._notebookEditorModelService.onDidChangeDirty,
      (last, current) => !last ? [current] : [...last, current],
      100
    )(this._openMissingDirtyNotebookEditors, this));
    this._disposables.add(_notebookEditorModelService.onWillFailWithConflict((e) => {
      for (const group of editorGroups.groups) {
        const conflictInputs = group.editors.filter((input) => input instanceof NotebookEditorInput && input.viewType !== e.viewType && isEqual(input.resource, e.resource));
        const p = group.closeEditors(conflictInputs);
        e.waitUntil(p);
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
  }
  _openMissingDirtyNotebookEditors(models) {
    const result = [];
    for (const model of models) {
      if (model.isDirty() && !this._editorService.isOpened({ resource: model.resource, typeId: NotebookEditorInput.ID, editorId: model.viewType }) && extname(model.resource) !== ".interactive") {
        result.push({
          resource: model.resource,
          options: { inactive: true, preserveFocus: true, pinned: true, override: model.viewType }
        });
      }
    }
    if (result.length > 0) {
      this._editorService.openEditors(result);
    }
  }
};
NotebookEditorManager.ID = "workbench.contrib.notebookEditorManager";
NotebookEditorManager = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, INotebookEditorModelResolverService),
  __decorateParam(2, IEditorGroupsService)
], NotebookEditorManager);
let SimpleNotebookWorkingCopyEditorHandler = class extends Disposable {
  constructor(_instantiationService, _workingCopyEditorService, _extensionService, _notebookService) {
    super();
    this._instantiationService = _instantiationService;
    this._workingCopyEditorService = _workingCopyEditorService;
    this._extensionService = _extensionService;
    this._notebookService = _notebookService;
    this._installHandler();
  }
  async handles(workingCopy) {
    const viewType = this.handlesSync(workingCopy);
    if (!viewType) {
      return false;
    }
    return this._notebookService.canResolve(viewType);
  }
  handlesSync(workingCopy) {
    const viewType = this._getViewType(workingCopy);
    if (!viewType || viewType === "interactive") {
      return void 0;
    }
    return viewType;
  }
  isOpen(workingCopy, editor) {
    if (!this.handlesSync(workingCopy)) {
      return false;
    }
    return editor instanceof NotebookEditorInput && editor.viewType === this._getViewType(workingCopy) && isEqual(workingCopy.resource, editor.resource);
  }
  createEditor(workingCopy) {
    return NotebookEditorInput.getOrCreate(this._instantiationService, workingCopy.resource, void 0, this._getViewType(workingCopy));
  }
  async _installHandler() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    this._register(this._workingCopyEditorService.registerHandler(this));
  }
  _getViewType(workingCopy) {
    const notebookType = NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
    if (notebookType && notebookType.viewType === notebookType.notebookType) {
      return notebookType?.viewType;
    }
    return void 0;
  }
};
SimpleNotebookWorkingCopyEditorHandler.ID = "workbench.contrib.simpleNotebookWorkingCopyEditorHandler";
SimpleNotebookWorkingCopyEditorHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyEditorService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, INotebookService)
], SimpleNotebookWorkingCopyEditorHandler);
let NotebookLanguageSelectorScoreRefine = class {
  constructor(_notebookService, languageFeaturesService) {
    this._notebookService = _notebookService;
    languageFeaturesService.setNotebookTypeResolver(this._getNotebookInfo.bind(this));
  }
  _getNotebookInfo(uri) {
    const cellUri = CellUri.parse(uri);
    if (!cellUri) {
      return void 0;
    }
    const notebook = this._notebookService.getNotebookTextModel(cellUri.notebook);
    if (!notebook) {
      return void 0;
    }
    return {
      uri: notebook.uri,
      type: notebook.viewType
    };
  }
};
NotebookLanguageSelectorScoreRefine.ID = "workbench.contrib.notebookLanguageSelectorScoreRefine";
NotebookLanguageSelectorScoreRefine = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, ILanguageFeaturesService)
], NotebookLanguageSelectorScoreRefine);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(NotebookContribution.ID, NotebookContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(CellContentProvider.ID, CellContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(CellInfoContentProvider.ID, CellInfoContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(NotebookMetadataContentProvider.ID, NotebookMetadataContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RegisterSchemasContribution.ID, RegisterSchemasContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(NotebookEditorManager.ID, NotebookEditorManager, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(NotebookLanguageSelectorScoreRefine.ID, NotebookLanguageSelectorScoreRefine, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SimpleNotebookWorkingCopyEditorHandler.ID, SimpleNotebookWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookVariables, LifecyclePhase.Eventually);
AccessibleViewRegistry.register(new NotebookAccessibleView());
AccessibleViewRegistry.register(new NotebookAccessibilityHelp());
registerSingleton(INotebookService, NotebookService, InstantiationType.Delayed);
registerSingleton(INotebookEditorWorkerService, NotebookEditorWorkerServiceImpl, InstantiationType.Delayed);
registerSingleton(INotebookEditorModelResolverService, NotebookModelResolverServiceImpl, InstantiationType.Delayed);
registerSingleton(INotebookCellStatusBarService, NotebookCellStatusBarService, InstantiationType.Delayed);
registerSingleton(INotebookEditorService, NotebookEditorWidgetService, InstantiationType.Delayed);
registerSingleton(INotebookKernelService, NotebookKernelService, InstantiationType.Delayed);
registerSingleton(INotebookKernelHistoryService, NotebookKernelHistoryService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionService, NotebookExecutionService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionStateService, NotebookExecutionStateService, InstantiationType.Delayed);
registerSingleton(INotebookRendererMessagingService, NotebookRendererMessagingService, InstantiationType.Delayed);
registerSingleton(INotebookKeymapService, NotebookKeymapService, InstantiationType.Delayed);
registerSingleton(INotebookLoggingService, NotebookLoggingService, InstantiationType.Delayed);
registerSingleton(INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory, InstantiationType.Delayed);
registerSingleton(INotebookOutlineEntryFactory, NotebookOutlineEntryFactory, InstantiationType.Delayed);
const schemas = {};
function isConfigurationPropertySchema(x) {
  return typeof x.type !== "undefined" || typeof x.anyOf !== "undefined";
}
for (const editorOption of editorOptionsRegistry) {
  const schema = editorOption.schema;
  if (schema) {
    if (isConfigurationPropertySchema(schema)) {
      schemas[`editor.${editorOption.name}`] = schema;
    } else {
      for (const key in schema) {
        if (Object.hasOwnProperty.call(schema, key)) {
          schemas[key] = schema[key];
        }
      }
    }
  }
}
const editorOptionsCustomizationSchema = {
  description: nls.localize("notebook.editorOptions.experimentalCustomization", "Settings for code editors used in notebooks. This can be used to customize most editor.* settings."),
  default: {},
  allOf: [
    {
      properties: schemas
    }
    // , {
    // 	patternProperties: {
    // 		'^\\[.*\\]$': {
    // 			type: 'object',
    // 			default: {},
    // 			properties: schemas
    // 		}
    // 	}
    // }
  ],
  tags: ["notebookLayout"]
};
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "notebook",
  order: 100,
  title: nls.localize("notebookConfigurationTitle", "Notebook"),
  type: "object",
  properties: {
    [NotebookSetting.displayOrder]: {
      description: nls.localize("notebook.displayOrder.description", "Priority list for output mime types"),
      type: "array",
      items: {
        type: "string"
      },
      default: []
    },
    [NotebookSetting.cellToolbarLocation]: {
      description: nls.localize("notebook.cellToolbarLocation.description", "Where the cell toolbar should be shown, or whether it should be hidden."),
      type: "object",
      additionalProperties: {
        markdownDescription: nls.localize("notebook.cellToolbarLocation.viewType", "Configure the cell toolbar position for for specific file types"),
        type: "string",
        enum: ["left", "right", "hidden"]
      },
      default: {
        "default": "right"
      },
      tags: ["notebookLayout"]
    },
    [NotebookSetting.showCellStatusBar]: {
      description: nls.localize("notebook.showCellStatusbar.description", "Whether the cell status bar should be shown."),
      type: "string",
      enum: ["hidden", "visible", "visibleAfterExecute"],
      enumDescriptions: [
        nls.localize("notebook.showCellStatusbar.hidden.description", "The cell status bar is always hidden."),
        nls.localize("notebook.showCellStatusbar.visible.description", "The cell status bar is always visible."),
        nls.localize("notebook.showCellStatusbar.visibleAfterExecute.description", "The cell status bar is hidden until the cell has executed. Then it becomes visible to show the execution status.")
      ],
      default: "visible",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.cellExecutionTimeVerbosity]: {
      description: nls.localize("notebook.cellExecutionTimeVerbosity.description", "Controls the verbosity of the cell execution time in the cell status bar."),
      type: "string",
      enum: ["default", "verbose"],
      enumDescriptions: [
        nls.localize("notebook.cellExecutionTimeVerbosity.default.description", "The cell execution duration is visible, with advanced information in the hover tooltip."),
        nls.localize("notebook.cellExecutionTimeVerbosity.verbose.description", "The cell last execution timestamp and duration are visible, with advanced information in the hover tooltip.")
      ],
      default: "default",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.textDiffEditorPreview]: {
      description: nls.localize("notebook.diff.enablePreview.description", "Whether to use the enhanced text diff editor for notebook."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.diffOverviewRuler]: {
      description: nls.localize("notebook.diff.enableOverviewRuler.description", "Whether to render the overview ruler in the diff editor for notebook."),
      type: "boolean",
      default: false,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.cellToolbarVisibility]: {
      markdownDescription: nls.localize("notebook.cellToolbarVisibility.description", "Whether the cell toolbar should appear on hover or click."),
      type: "string",
      enum: ["hover", "click"],
      default: "click",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.undoRedoPerCell]: {
      description: nls.localize("notebook.undoRedoPerCell.description", "Whether to use separate undo/redo stack for each cell."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.compactView]: {
      description: nls.localize("notebook.compactView.description", "Control whether the notebook editor should be rendered in a compact form. For example, when turned on, it will decrease the left margin width."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.focusIndicator]: {
      description: nls.localize("notebook.focusIndicator.description", "Controls where the focus indicator is rendered, either along the cell borders or on the left gutter."),
      type: "string",
      enum: ["border", "gutter"],
      default: "gutter",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.insertToolbarLocation]: {
      description: nls.localize("notebook.insertToolbarPosition.description", "Control where the insert cell actions should appear."),
      type: "string",
      enum: ["betweenCells", "notebookToolbar", "both", "hidden"],
      enumDescriptions: [
        nls.localize("insertToolbarLocation.betweenCells", "A toolbar that appears on hover between cells."),
        nls.localize("insertToolbarLocation.notebookToolbar", "The toolbar at the top of the notebook editor."),
        nls.localize("insertToolbarLocation.both", "Both toolbars."),
        nls.localize("insertToolbarLocation.hidden", "The insert actions don't appear anywhere.")
      ],
      default: "both",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.globalToolbar]: {
      description: nls.localize("notebook.globalToolbar.description", "Control whether to render a global toolbar inside the notebook editor."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.stickyScrollEnabled]: {
      description: nls.localize("notebook.stickyScrollEnabled.description", "Experimental. Control whether to render notebook Sticky Scroll headers in the notebook editor."),
      type: "boolean",
      default: false,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.stickyScrollMode]: {
      description: nls.localize("notebook.stickyScrollMode.description", "Control whether nested sticky lines appear to stack flat or indented."),
      type: "string",
      enum: ["flat", "indented"],
      enumDescriptions: [
        nls.localize("notebook.stickyScrollMode.flat", "Nested sticky lines appear flat."),
        nls.localize("notebook.stickyScrollMode.indented", "Nested sticky lines appear indented.")
      ],
      default: "indented",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.consolidatedOutputButton]: {
      description: nls.localize("notebook.consolidatedOutputButton.description", "Control whether outputs action should be rendered in the output toolbar."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    // [NotebookSetting.openOutputInPreviewEditor]: {
    // 	description: nls.localize('notebook.output.openInPreviewEditor.description', "Controls whether or not the action to open a cell output in a preview editor is enabled. This action can be used via the cell output menu."),
    // 	type: 'boolean',
    // 	default: false,
    // 	tags: ['preview']
    // },
    [NotebookSetting.showFoldingControls]: {
      description: nls.localize("notebook.showFoldingControls.description", "Controls when the Markdown header folding arrow is shown."),
      type: "string",
      enum: ["always", "never", "mouseover"],
      enumDescriptions: [
        nls.localize("showFoldingControls.always", "The folding controls are always visible."),
        nls.localize("showFoldingControls.never", "Never show the folding controls and reduce the gutter size."),
        nls.localize("showFoldingControls.mouseover", "The folding controls are visible only on mouseover.")
      ],
      default: "mouseover",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.dragAndDropEnabled]: {
      description: nls.localize("notebook.dragAndDrop.description", "Control whether the notebook editor should allow moving cells through drag and drop."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.consolidatedRunButton]: {
      description: nls.localize("notebook.consolidatedRunButton.description", "Control whether extra actions are shown in a dropdown next to the run button."),
      type: "boolean",
      default: false,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.globalToolbarShowLabel]: {
      description: nls.localize("notebook.globalToolbarShowLabel", "Control whether the actions on the notebook toolbar should render label or not."),
      type: "string",
      enum: ["always", "never", "dynamic"],
      default: "always",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.textOutputLineLimit]: {
      markdownDescription: nls.localize("notebook.textOutputLineLimit", "Controls how many lines of text are displayed in a text output. If {0} is enabled, this setting is used to determine the scroll height of the output.", "`#notebook.output.scrolling#`"),
      type: "number",
      default: 30,
      tags: ["notebookLayout", "notebookOutputLayout"],
      minimum: 1
    },
    [NotebookSetting.LinkifyOutputFilePaths]: {
      description: nls.localize("notebook.disableOutputFilePathLinks", "Control whether to disable filepath links in the output of notebook cells."),
      type: "boolean",
      default: true,
      tags: ["notebookOutputLayout"]
    },
    [NotebookSetting.minimalErrorRendering]: {
      description: nls.localize("notebook.minimalErrorRendering", "Control whether to render error output in a minimal style."),
      type: "boolean",
      default: false,
      tags: ["notebookOutputLayout"]
    },
    [NotebookSetting.markupFontSize]: {
      markdownDescription: nls.localize("notebook.markup.fontSize", "Controls the font size in pixels of rendered markup in notebooks. When set to {0}, 120% of {1} is used.", "`0`", "`#editor.fontSize#`"),
      type: "number",
      default: 0,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.markdownLineHeight]: {
      markdownDescription: nls.localize("notebook.markdown.lineHeight", "Controls the line height in pixels of markdown cells in notebooks. When set to {0}, {1} will be used", "`0`", "`normal`"),
      type: "number",
      default: 0,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.cellEditorOptionsCustomizations]: editorOptionsCustomizationSchema,
    [NotebookSetting.interactiveWindowCollapseCodeCells]: {
      markdownDescription: nls.localize("notebook.interactiveWindow.collapseCodeCells", "Controls whether code cells in the interactive window are collapsed by default."),
      type: "string",
      enum: ["always", "never", "fromEditor"],
      default: "fromEditor"
    },
    [NotebookSetting.outputLineHeight]: {
      markdownDescription: nls.localize("notebook.outputLineHeight", "Line height of the output text within notebook cells.\n - When set to 0, editor line height is used.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values."),
      type: "number",
      default: 0,
      tags: ["notebookLayout", "notebookOutputLayout"]
    },
    [NotebookSetting.outputFontSize]: {
      markdownDescription: nls.localize("notebook.outputFontSize", "Font size for the output text within notebook cells. When set to 0, {0} is used.", "`#editor.fontSize#`"),
      type: "number",
      default: 0,
      tags: ["notebookLayout", "notebookOutputLayout"]
    },
    [NotebookSetting.outputFontFamily]: {
      markdownDescription: nls.localize("notebook.outputFontFamily", "The font family of the output text within notebook cells. When set to empty, the {0} is used.", "`#editor.fontFamily#`"),
      type: "string",
      tags: ["notebookLayout", "notebookOutputLayout"]
    },
    [NotebookSetting.outputScrolling]: {
      markdownDescription: nls.localize("notebook.outputScrolling", "Initially render notebook outputs in a scrollable region when longer than the limit."),
      type: "boolean",
      tags: ["notebookLayout", "notebookOutputLayout"],
      default: typeof product.quality === "string" && product.quality !== "stable"
      // only enable as default in insiders
    },
    [NotebookSetting.outputWordWrap]: {
      markdownDescription: nls.localize("notebook.outputWordWrap", "Controls whether the lines in output should wrap."),
      type: "boolean",
      tags: ["notebookLayout", "notebookOutputLayout"],
      default: false
    },
    [NotebookSetting.defaultFormatter]: {
      description: nls.localize("notebookFormatter.default", "Defines a default notebook formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
      type: ["string", "null"],
      default: null,
      enum: DefaultFormatter.extensionIds,
      enumItemLabels: DefaultFormatter.extensionItemLabels,
      markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
    },
    [NotebookSetting.formatOnSave]: {
      markdownDescription: nls.localize("notebook.formatOnSave", "Format a notebook on save. A formatter must be available and the editor must not be shutting down. When {0} is set to `afterDelay`, the file will only be formatted when saved explicitly.", "`#files.autoSave#`"),
      type: "boolean",
      tags: ["notebookLayout"],
      default: false
    },
    [NotebookSetting.insertFinalNewline]: {
      markdownDescription: nls.localize("notebook.insertFinalNewline", "When enabled, insert a final new line into the end of code cells when saving a notebook."),
      type: "boolean",
      tags: ["notebookLayout"],
      default: false
    },
    [NotebookSetting.formatOnCellExecution]: {
      markdownDescription: nls.localize("notebook.formatOnCellExecution", "Format a notebook cell upon execution. A formatter must be available."),
      type: "boolean",
      default: false
    },
    [NotebookSetting.confirmDeleteRunningCell]: {
      markdownDescription: nls.localize("notebook.confirmDeleteRunningCell", "Control whether a confirmation prompt is required to delete a running cell."),
      type: "boolean",
      default: true
    },
    [NotebookSetting.findFilters]: {
      markdownDescription: nls.localize("notebook.findFilters", "Customize the Find Widget behavior for searching within notebook cells. When both markup source and markup preview are enabled, the Find Widget will search either the source code or preview based on the current state of the cell."),
      type: "object",
      properties: {
        markupSource: {
          type: "boolean",
          default: true
        },
        markupPreview: {
          type: "boolean",
          default: true
        },
        codeSource: {
          type: "boolean",
          default: true
        },
        codeOutput: {
          type: "boolean",
          default: true
        }
      },
      default: {
        markupSource: true,
        markupPreview: true,
        codeSource: true,
        codeOutput: true
      },
      tags: ["notebookLayout"]
    },
    [NotebookSetting.remoteSaving]: {
      markdownDescription: nls.localize("notebook.remoteSaving", "Enables the incremental saving of notebooks between processes and across Remote connections. When enabled, only the changes to the notebook are sent to the extension host, improving performance for large notebooks and slow network connections."),
      type: "boolean",
      default: typeof product.quality === "string" && product.quality !== "stable",
      // only enable as default in insiders
      tags: ["experimental"]
    },
    [NotebookSetting.scrollToRevealCell]: {
      markdownDescription: nls.localize("notebook.scrolling.revealNextCellOnExecute.description", "How far to scroll when revealing the next cell upon running {0}.", "notebook.cell.executeAndSelectBelow"),
      type: "string",
      enum: ["fullCell", "firstLine", "none"],
      markdownEnumDescriptions: [
        nls.localize("notebook.scrolling.revealNextCellOnExecute.fullCell.description", "Scroll to fully reveal the next cell."),
        nls.localize("notebook.scrolling.revealNextCellOnExecute.firstLine.description", "Scroll to reveal the first line of the next cell."),
        nls.localize("notebook.scrolling.revealNextCellOnExecute.none.description", "Do not scroll.")
      ],
      default: "fullCell"
    },
    [NotebookSetting.cellGenerate]: {
      markdownDescription: nls.localize("notebook.cellGenerate", "Enable experimental generate action to create code cell with inline chat enabled."),
      type: "boolean",
      default: true
    },
    [NotebookSetting.notebookVariablesView]: {
      markdownDescription: nls.localize("notebook.VariablesView.description", "Enable the experimental notebook variables view within the debug panel."),
      type: "boolean",
      default: false
    },
    [NotebookSetting.notebookInlineValues]: {
      markdownDescription: nls.localize("notebook.inlineValues.description", "Control whether to show inline values within notebook code cells after cell execution. Values will remain until the cell is edited, re-executed, or explicitly cleared via the Clear All Outputs toolbar button or the `Notebook: Clear Inline Values` command."),
      type: "string",
      enum: ["on", "auto", "off"],
      enumDescriptions: [
        nls.localize("notebook.inlineValues.on", "Always show inline values, with a regex fallback if no inline value provider is registered. Note: There may be a performance impact in larger cells if the fallback is used."),
        nls.localize("notebook.inlineValues.auto", "Show inline values only when an inline value provider is registered."),
        nls.localize("notebook.inlineValues.off", "Never show inline values.")
      ],
      default: "off"
    },
    [NotebookSetting.cellFailureDiagnostics]: {
      markdownDescription: nls.localize("notebook.cellFailureDiagnostics", "Show available diagnostics for cell failures."),
      type: "boolean",
      default: true
    },
    [NotebookSetting.outputBackupSizeLimit]: {
      markdownDescription: nls.localize("notebook.backup.sizeLimit", "The limit of notebook output size in kilobytes (KB) where notebook files will no longer be backed up for hot reload. Use 0 for unlimited."),
      type: "number",
      default: 1e4
    },
    [NotebookSetting.multiCursor]: {
      markdownDescription: nls.localize("notebook.multiCursor.enabled", "Experimental. Enables a limited set of multi cursor controls across multiple cells in the notebook editor. Currently supported are core editor actions (typing/cut/copy/paste/composition) and a limited subset of editor commands."),
      type: "boolean",
      default: false
    },
    [NotebookSetting.markupFontFamily]: {
      markdownDescription: nls.localize("notebook.markup.fontFamily", "Controls the font family of rendered markup in notebooks. When left blank, this will fall back to the default workbench font family."),
      type: "string",
      default: "",
      tags: ["notebookLayout"]
    }
  }
});
export {
  NotebookContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2suY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB0b0Zvcm1hdHRlZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgSVRleHRCdWZmZXJGYWN0b3J5LCBJVGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VsZWN0aW9uLCBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJpYWxpemVyLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuL25vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9ySW5wdXQsIE5vdGVib29rRWRpdG9ySW5wdXRPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBDZWxsVXJpLCBJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsLCBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIsIE5vdGVib29rU2V0dGluZywgSUNlbGxPdXRwdXQsIElDZWxsLCBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSwgTm90ZWJvb2tNZXRhZGF0YVVyaSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0RGlmZkVkaXRvciB9IGZyb20gJy4vZGlmZi9ub3RlYm9va0RpZmZFZGl0b3IuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXJ2aWNlcy9ub3RlYm9va1dvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlSW1wbCB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tXb3JrZXJTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsU3RhdHVzQmFyU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGdldEZvcm1hdHRlZE91dHB1dEpTT04sIGdldFN0cmVhbU91dHB1dERhdGEgfSBmcm9tICcuL2RpZmYvZGlmZkVsZW1lbnRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZUltcGwgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2UsIElOb3RlYm9va0tlcm5lbFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tLZXJuZWxTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUVkaXRvckhhbmRsZXIsIElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5LCBOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnkgfSBmcm9tICcuL3ZpZXdNb2RlbC9ub3RlYm9va091dGxpbmVEYXRhU291cmNlRmFjdG9yeS5qcyc7XG5cbi8vIEVkaXRvciBDb250cm9sbGVyXG5pbXBvcnQgJy4vY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY29udHJvbGxlci9pbnNlcnRDZWxsQWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY29udHJvbGxlci9leGVjdXRlQWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY29udHJvbGxlci9zZWN0aW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY29udHJvbGxlci9sYXlvdXRBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL2VkaXRBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL2NlbGxPdXRwdXRBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL2FwaUFjdGlvbnMuanMnO1xuaW1wb3J0ICcuL2NvbnRyb2xsZXIvZm9sZGluZ0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICcuL2NvbnRyb2xsZXIvY2hhdC9ub3RlYm9vay5jaGF0LmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgJy4vY29udHJvbGxlci92YXJpYWJsZXNBY3Rpb25zLmpzJztcblxuLy8gRWRpdG9yIENvbnRyaWJ1dGlvblxuaW1wb3J0ICcuL2NvbnRyaWIvZWRpdG9ySGludC9lbXB0eUNlbGxFZGl0b3JIaW50LmpzJztcbmltcG9ydCAnLi9jb250cmliL2NsaXBib2FyZC9ub3RlYm9va0NsaXBib2FyZC5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9maW5kL25vdGVib29rRmluZC5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9mb3JtYXQvZm9ybWF0dGluZy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9zYXZlUGFydGljaXBhbnRzL3NhdmVQYXJ0aWNpcGFudHMuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvZ2V0dGluZ1N0YXJ0ZWQvbm90ZWJvb2tHZXR0aW5nU3RhcnRlZC5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9sYXlvdXQvbGF5b3V0QWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9tYXJrZXIvbWFya2VyUHJvdmlkZXIuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvbmF2aWdhdGlvbi9hcnJvdy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9vdXRsaW5lL25vdGVib29rT3V0bGluZS5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9wcm9maWxlL25vdGVib29rUHJvZmlsZS5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9jZWxsU3RhdHVzQmFyL3N0YXR1c0JhclByb3ZpZGVycy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9jZWxsU3RhdHVzQmFyL2NvbnRyaWJ1dGVkU3RhdHVzQmFySXRlbUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvY2VsbFN0YXR1c0Jhci9leGVjdXRpb25TdGF0dXNCYXJJdGVtQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9lZGl0b3JTdGF0dXNCYXIvZWRpdG9yU3RhdHVzQmFyLmpzJztcbmltcG9ydCAnLi9jb250cmliL3VuZG9SZWRvL25vdGVib29rVW5kb1JlZG8uanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvY2VsbENvbW1hbmRzL2NlbGxDb21tYW5kcy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi92aWV3cG9ydFdhcm11cC92aWV3cG9ydFdhcm11cC5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi90cm91Ymxlc2hvb3QvbGF5b3V0LmpzJztcbmltcG9ydCAnLi9jb250cmliL2RlYnVnL25vdGVib29rQnJlYWtwb2ludHMuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvZGVidWcvbm90ZWJvb2tDZWxsUGF1c2luZy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9kZWJ1Zy9ub3RlYm9va0RlYnVnRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvZXhlY3V0ZS9leGVjdXRpb25FZGl0b3JQcm9ncmVzcy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9rZXJuZWxEZXRlY3Rpb24vbm90ZWJvb2tLZXJuZWxEZXRlY3Rpb24uanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvY2VsbERpYWdub3N0aWNzL2NlbGxEaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9tdWx0aWN1cnNvci9ub3RlYm9va011bHRpY3Vyc29yLmpzJztcbmltcG9ydCAnLi9jb250cmliL211bHRpY3Vyc29yL25vdGVib29rU2VsZWN0aW9uSGlnaGxpZ2h0LmpzJztcbmltcG9ydCAnLi9jb250cmliL25vdGVib29rVmFyaWFibGVzL25vdGVib29rSW5saW5lVmFyaWFibGVzLmpzJztcblxuLy8gRGlmZiBFZGl0b3IgQ29udHJpYnV0aW9uXG5pbXBvcnQgJy4vZGlmZi9ub3RlYm9va0RpZmZBY3Rpb25zLmpzJztcblxuLy8gU2VydmljZXNcbmltcG9ydCB7IGVkaXRvck9wdGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rRXhlY3V0aW9uU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2V5bWFwU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0tleW1hcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tLZXltYXBTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va0tleW1hcFNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0luZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENPTU1FTlRFRElUT1JfREVDT1JBVElPTl9LRVkgfSBmcm9tICcuLi8uLi9jb21tZW50cy9icm93c2VyL2NvbW1lbnRSZXBseS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rTG9nZ2luZ1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tWYXJpYWJsZXMgfSBmcm9tICcuL2NvbnRyaWIvbm90ZWJvb2tWYXJpYWJsZXMvbm90ZWJvb2tWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE5vdGVib29rQWNjZXNzaWJpbGl0eUhlbHAgfSBmcm9tICcuL25vdGVib29rQWNjZXNzaWJpbGl0eUhlbHAuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tBY2Nlc3NpYmxlVmlldyB9IGZyb20gJy4vbm90ZWJvb2tBY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Rm9ybWF0dGVyIH0gZnJvbSAnLi4vLi4vZm9ybWF0L2Jyb3dzZXIvZm9ybWF0QWN0aW9uc011bHRpcGxlLmpzJztcbmltcG9ydCB7IE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvciB9IGZyb20gJy4vZGlmZi9ub3RlYm9va011bHRpRGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va011bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi9kaWZmL25vdGVib29rTXVsdGlEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0Rm9ybWF0dGVkTWV0YWRhdGFKU09OIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsL25vdGVib29rQ2VsbFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LCBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkgfSBmcm9tICcuL3ZpZXdNb2RlbC9ub3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgZ2V0Rm9ybWF0dGVkTm90ZWJvb2tNZXRhZGF0YUpTT04gfSBmcm9tICcuLi9jb21tb24vbW9kZWwvbm90ZWJvb2tNZXRhZGF0YVRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va091dHB1dEVkaXRvciB9IGZyb20gJy4vb3V0cHV0RWRpdG9yL25vdGVib29rT3V0cHV0RWRpdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3V0cHV0RWRpdG9ySW5wdXQgfSBmcm9tICcuL291dHB1dEVkaXRvci9ub3RlYm9va091dHB1dEVkaXRvcklucHV0LmpzJztcblxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gKi9cblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHROb3RlYm9va0VkaXRvcixcblx0XHROb3RlYm9va0VkaXRvci5JRCxcblx0XHQnTm90ZWJvb2sgRWRpdG9yJ1xuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKE5vdGVib29rRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0Tm90ZWJvb2tUZXh0RGlmZkVkaXRvcixcblx0XHROb3RlYm9va1RleHREaWZmRWRpdG9yLklELFxuXHRcdCdOb3RlYm9vayBEaWZmIEVkaXRvcidcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihOb3RlYm9va0RpZmZFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHROb3RlYm9va091dHB1dEVkaXRvcixcblx0XHROb3RlYm9va091dHB1dEVkaXRvci5JRCxcblx0XHQnTm90ZWJvb2sgT3V0cHV0IEVkaXRvcidcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihOb3RlYm9va091dHB1dEVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvcixcblx0XHROb3RlYm9va011bHRpVGV4dERpZmZFZGl0b3IuSUQsXG5cdFx0J05vdGVib29rIERpZmYgRWRpdG9yJ1xuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKE5vdGVib29rTXVsdGlEaWZmRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cbmNsYXNzIE5vdGVib29rRGlmZkVkaXRvclNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cdGNvbnN0cnVjdG9yKEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSkgeyB9XG5cdGNhblNlcmlhbGl6ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNlcmlhbGl6ZShpbnB1dDogRWRpdG9ySW5wdXQpOiBzdHJpbmcge1xuXHRcdGFzc2VydFR5cGUoaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0RpZmZFZGl0b3JJbnB1dCk7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSxcblx0XHRcdG9yaWdpbmFsUmVzb3VyY2U6IGlucHV0Lm9yaWdpbmFsLnJlc291cmNlLFxuXHRcdFx0bmFtZTogaW5wdXQuZ2V0TmFtZSgpLFxuXHRcdFx0b3JpZ2luYWxOYW1lOiBpbnB1dC5vcmlnaW5hbC5nZXROYW1lKCksXG5cdFx0XHR0ZXh0RGlmZk5hbWU6IGlucHV0LmdldE5hbWUoKSxcblx0XHRcdHZpZXdUeXBlOiBpbnB1dC52aWV3VHlwZSxcblx0XHR9KTtcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJhdzogc3RyaW5nKSB7XG5cdFx0dHlwZSBEYXRhID0geyByZXNvdXJjZTogVVJJOyBvcmlnaW5hbFJlc291cmNlOiBVUkk7IG5hbWU6IHN0cmluZzsgb3JpZ2luYWxOYW1lOiBzdHJpbmc7IHZpZXdUeXBlOiBzdHJpbmc7IHRleHREaWZmTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBncm91cDogbnVtYmVyIH07XG5cdFx0Y29uc3QgZGF0YSA9IDxEYXRhPnBhcnNlKHJhdyk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IHJlc291cmNlLCBvcmlnaW5hbFJlc291cmNlLCBuYW1lLCB2aWV3VHlwZSB9ID0gZGF0YTtcblx0XHRpZiAoIWRhdGEgfHwgIVVSSS5pc1VyaShyZXNvdXJjZSkgfHwgIVVSSS5pc1VyaShvcmlnaW5hbFJlc291cmNlKSB8fCB0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHZpZXdUeXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ25vdGVib29rLmV4cGVyaW1lbnRhbC5lbmFibGVOZXdEaWZmRWRpdG9yJykpIHtcblx0XHRcdHJldHVybiBOb3RlYm9va011bHRpRGlmZkVkaXRvcklucHV0LmNyZWF0ZShpbnN0YW50aWF0aW9uU2VydmljZSwgcmVzb3VyY2UsIG5hbWUsIHVuZGVmaW5lZCwgb3JpZ2luYWxSZXNvdXJjZSwgdmlld1R5cGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gTm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQuY3JlYXRlKGluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvdXJjZSwgbmFtZSwgdW5kZWZpbmVkLCBvcmlnaW5hbFJlc291cmNlLCB2aWV3VHlwZSk7XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIGNhblJlc29sdmVCYWNrdXAoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0LCBiYWNrdXBSZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cbn1cbnR5cGUgU2VyaWFsaXplZE5vdGVib29rRWRpdG9yRGF0YSA9IHsgcmVzb3VyY2U6IFVSSTsgcHJlZmVycmVkUmVzb3VyY2U6IFVSSTsgdmlld1R5cGU6IHN0cmluZzsgb3B0aW9ucz86IE5vdGVib29rRWRpdG9ySW5wdXRPcHRpb25zIH07XG5jbGFzcyBOb3RlYm9va0VkaXRvclNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cdGNhblNlcmlhbGl6ZShpbnB1dDogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaW5wdXQudHlwZUlkID09PSBOb3RlYm9va0VkaXRvcklucHV0LklEO1xuXHR9XG5cdHNlcmlhbGl6ZShpbnB1dDogRWRpdG9ySW5wdXQpOiBzdHJpbmcge1xuXHRcdGFzc2VydFR5cGUoaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KTtcblx0XHRjb25zdCBkYXRhOiBTZXJpYWxpemVkTm90ZWJvb2tFZGl0b3JEYXRhID0ge1xuXHRcdFx0cmVzb3VyY2U6IGlucHV0LnJlc291cmNlLFxuXHRcdFx0cHJlZmVycmVkUmVzb3VyY2U6IGlucHV0LnByZWZlcnJlZFJlc291cmNlLFxuXHRcdFx0dmlld1R5cGU6IGlucHV0LnZpZXdUeXBlLFxuXHRcdFx0b3B0aW9uczogaW5wdXQub3B0aW9uc1xuXHRcdH07XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGRhdGEpO1xuXHR9XG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJhdzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZGF0YSA9IDxTZXJpYWxpemVkTm90ZWJvb2tFZGl0b3JEYXRhPnBhcnNlKHJhdyk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgdmlld1R5cGUsIG9wdGlvbnMgfSA9IGRhdGE7XG5cdFx0aWYgKCFkYXRhIHx8ICFVUkkuaXNVcmkocmVzb3VyY2UpIHx8IHR5cGVvZiB2aWV3VHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXQgPSBOb3RlYm9va0VkaXRvcklucHV0LmdldE9yQ3JlYXRlKGluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvdXJjZSwgcHJlZmVycmVkUmVzb3VyY2UsIHZpZXdUeXBlLCBvcHRpb25zKTtcblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgU2VyaWFsaXplZE5vdGVib29rT3V0cHV0RWRpdG9yRGF0YSA9IHsgbm90ZWJvb2tVcmk6IFVSSTsgY2VsbEluZGV4OiBudW1iZXI7IG91dHB1dEluZGV4OiBudW1iZXIgfTtcbmNsYXNzIE5vdGVib29rT3V0cHV0RWRpdG9yU2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y2FuU2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dC50eXBlSWQgPT09IE5vdGVib29rT3V0cHV0RWRpdG9ySW5wdXQuSUQ7XG5cdH1cblx0c2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0YXNzZXJ0VHlwZShpbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rT3V0cHV0RWRpdG9ySW5wdXQpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IGlucHV0LmdldFNlcmlhbGl6ZWREYXRhKCk7IC8vIGluIGNhc2Ugb2YgY2VsbCBtb3ZlbWVudCBldGMgZ2V0IGxhdGVzdCBpbmRpY2VzXG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShkYXRhKTtcblx0fVxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCByYXc6IHN0cmluZyk6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkYXRhID0gPFNlcmlhbGl6ZWROb3RlYm9va091dHB1dEVkaXRvckRhdGE+cGFyc2UocmF3KTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va091dHB1dEVkaXRvcklucHV0LCBkYXRhLm5vdGVib29rVXJpLCBkYXRhLmNlbGxJbmRleCwgdW5kZWZpbmVkLCBkYXRhLm91dHB1dEluZGV4KTtcblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoXG5cdE5vdGVib29rRWRpdG9ySW5wdXQuSUQsXG5cdE5vdGVib29rRWRpdG9yU2VyaWFsaXplclxuKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoXG5cdE5vdGVib29rRGlmZkVkaXRvcklucHV0LklELFxuXHROb3RlYm9va0RpZmZFZGl0b3JTZXJpYWxpemVyXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihcblx0Tm90ZWJvb2tPdXRwdXRFZGl0b3JJbnB1dC5JRCxcblx0Tm90ZWJvb2tPdXRwdXRFZGl0b3JTZXJpYWxpemVyXG4pO1xuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm5vdGVib29rJztcblxuXHRwcml2YXRlIF91cmlDb21wYXJpc29uS2V5Q29tcHV0ZXI/OiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVuZG9SZWRvU2VydmljZSB1bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cGRhdGVDZWxsVW5kb1JlZG9Db21wYXJpc29uS2V5KGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB1bmRvUmVkb1NlcnZpY2UpO1xuXG5cdFx0Ly8gV2F0Y2ggZm9yIGNoYW5nZXMgdG8gdW5kb1JlZG9QZXJDZWxsIHNldHRpbmdcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcudW5kb1JlZG9QZXJDZWxsKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNlbGxVbmRvUmVkb0NvbXBhcmlzb25LZXkoY29uZmlndXJhdGlvblNlcnZpY2UsIHVuZG9SZWRvU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVnaXN0ZXIgY29tbWVudCBkZWNvcmF0aW9uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKCdjb21tZW50LWNvbnRyb2xsZXInLCBDT01NRU5URURJVE9SX0RFQ09SQVRJT05fS0VZLCB7fSkpO1xuXHR9XG5cblx0Ly8gQWRkIG9yIHJlbW92ZSB0aGUgY2VsbCB1bmRvIHJlZG8gY29tcGFyaXNvbiBrZXkgYmFzZWQgb24gdGhlIHVzZXIgc2V0dGluZ1xuXHRwcml2YXRlIHVwZGF0ZUNlbGxVbmRvUmVkb0NvbXBhcmlzb25LZXkoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlKSB7XG5cdFx0Y29uc3QgdW5kb1JlZG9QZXJDZWxsID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLnVuZG9SZWRvUGVyQ2VsbCk7XG5cblx0XHRpZiAoIXVuZG9SZWRvUGVyQ2VsbCkge1xuXHRcdFx0Ly8gQWRkIGNvbXBhcmlzb24ga2V5IHRvIG1hcCBjZWxsID0+IG1haW4gZG9jdW1lbnRcblx0XHRcdGlmICghdGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyKSB7XG5cdFx0XHRcdHRoaXMuX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlciA9IHVuZG9SZWRvU2VydmljZS5yZWdpc3RlclVyaUNvbXBhcmlzb25LZXlDb21wdXRlcihDZWxsVXJpLnNjaGVtZSwge1xuXHRcdFx0XHRcdGdldENvbXBhcmlzb25LZXk6ICh1cmk6IFVSSSk6IHN0cmluZyA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodW5kb1JlZG9QZXJDZWxsKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBOb3RlYm9va0NvbnRyaWJ1dGlvbi5fZ2V0Q2VsbFVuZG9SZWRvQ29tcGFyaXNvbktleSh1cmkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIERpc3Bvc2UgY29tcGFyaXNvbiBrZXlcblx0XHRcdHRoaXMuX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlcj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRDZWxsVW5kb1JlZG9Db21wYXJpc29uS2V5KHVyaTogVVJJKSB7XG5cdFx0Y29uc3QgZGF0YSA9IENlbGxVcmkucGFyc2UodXJpKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1cmkudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGF0YS5ub3RlYm9vay50b1N0cmluZygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyPy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQ2VsbENvbnRlbnRQcm92aWRlciBpbXBsZW1lbnRzIElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jZWxsQ29udGVudFByb3ZpZGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb246IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9uID0gdGV4dE1vZGVsU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihDZWxsVXJpLnNjaGVtZSwgdGhpcyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlVGV4dENvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKTtcblx0XHQvLyBjb25zdCBkYXRhID0gcGFyc2VDZWxsVXJpKHJlc291cmNlKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX25vdGVib29rTW9kZWxSZXNvbHZlclNlcnZpY2UucmVzb2x2ZShkYXRhLm5vdGVib29rKTtcblx0XHRsZXQgcmVzdWx0OiBJVGV4dE1vZGVsIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAoIXJlZi5vYmplY3QuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgcmVmLm9iamVjdC5ub3RlYm9vay5jZWxscykge1xuXHRcdFx0aWYgKGNlbGwudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0Y29uc3QgYnVmZmVyRmFjdG9yeTogSVRleHRCdWZmZXJGYWN0b3J5ID0ge1xuXHRcdFx0XHRcdGNyZWF0ZTogKGRlZmF1bHRFT0wpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB7IHRleHRCdWZmZXI6IGNlbGwudGV4dEJ1ZmZlciBhcyBJVGV4dEJ1ZmZlciwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZS5Ob25lIH07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRGaXJzdExpbmVUZXh0OiAobGltaXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ29udGVudCgxKS5zdWJzdHJpbmcoMCwgbGltaXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoY2VsbC5sYW5ndWFnZSk7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlU2VsZWN0aW9uID0gbGFuZ3VhZ2VJZCA/IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKGxhbmd1YWdlSWQpIDogKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCA/IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdtYXJrZG93bicpIDogdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5RmlsZXBhdGhPckZpcnN0TGluZShyZXNvdXJjZSwgY2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb250ZW50KDEpKSk7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbChcblx0XHRcdFx0XHRidWZmZXJGYWN0b3J5LFxuXHRcdFx0XHRcdGxhbmd1YWdlU2VsZWN0aW9uLFxuXHRcdFx0XHRcdHJlc291cmNlXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25jZSA9IEV2ZW50LmFueShyZXN1bHQub25XaWxsRGlzcG9zZSwgcmVmLm9iamVjdC5ub3RlYm9vay5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRvbmNlLmRpc3Bvc2UoKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIENlbGxJbmZvQ29udGVudFByb3ZpZGVyIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2VsbEluZm9Db250ZW50UHJvdmlkZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMucHVzaCh0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsTWV0YWRhdGEsIHtcblx0XHRcdHByb3ZpZGVUZXh0Q29udGVudDogdGhpcy5wcm92aWRlTWV0YWRhdGFUZXh0Q29udGVudC5iaW5kKHRoaXMpXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMucHVzaCh0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0LCB7XG5cdFx0XHRwcm92aWRlVGV4dENvbnRlbnQ6IHRoaXMucHJvdmlkZU91dHB1dFRleHRDb250ZW50LmJpbmQodGhpcylcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKHRoaXMuX2xhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsTWV0YWRhdGEsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHtwYXRofSAobWV0YWRhdGEpJyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLydcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKHRoaXMuX2xhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0LFxuXHRcdFx0Zm9ybWF0dGluZzoge1xuXHRcdFx0XHRsYWJlbDogJyR7cGF0aH0gKG91dHB1dCknLFxuXHRcdFx0XHRzZXBhcmF0b3I6ICcvJ1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlTWV0YWRhdGFUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gQ2VsbFVyaS5wYXJzZUNlbGxQcm9wZXJ0eVVyaShyZXNvdXJjZSwgU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxNZXRhZGF0YSk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9ub3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmUoZGF0YS5ub3RlYm9vayk7XG5cdFx0bGV0IHJlc3VsdDogSVRleHRNb2RlbCB8IG51bGwgPSBudWxsO1xuXG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdqc29uJyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIHJlZi5vYmplY3Qubm90ZWJvb2suY2VsbHMpIHtcblx0XHRcdGlmIChjZWxsLmhhbmRsZSA9PT0gZGF0YS5oYW5kbGUpIHtcblx0XHRcdFx0Y29uc3QgY2VsbEluZGV4ID0gcmVmLm9iamVjdC5ub3RlYm9vay5jZWxscy5pbmRleE9mKGNlbGwpO1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YVNvdXJjZSA9IGdldEZvcm1hdHRlZE1ldGFkYXRhSlNPTihyZWYub2JqZWN0Lm5vdGVib29rLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50Q2VsbE1ldGFkYXRhLCBjZWxsLm1ldGFkYXRhLCBjZWxsLmxhbmd1YWdlLCB0cnVlKTtcblx0XHRcdFx0cmVzdWx0ID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0XHRcdG1ldGFkYXRhU291cmNlLFxuXHRcdFx0XHRcdG1vZGUsXG5cdFx0XHRcdFx0cmVzb3VyY2Vcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMucHVzaChkaXNwb3NhYmxlcy5hZGQocmVmLm9iamVjdC5ub3RlYm9vay5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdCAmJiBlLnJhd0V2ZW50cy5zb21lKGV2ZW50ID0+IChldmVudC5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTWV0YWRhdGEgfHwgZXZlbnQua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbExhbmd1YWdlKSAmJiBldmVudC5pbmRleCA9PT0gY2VsbEluZGV4KSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBnZXRGb3JtYXR0ZWRNZXRhZGF0YUpTT04ocmVmLm9iamVjdC5ub3RlYm9vay50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudENlbGxNZXRhZGF0YSwgY2VsbC5tZXRhZGF0YSwgY2VsbC5sYW5ndWFnZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0LmdldFZhbHVlKCkgIT09IHZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uY2UgPSByZXN1bHQub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRvbmNlLmRpc3Bvc2UoKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVN0cmVhbU91dHB1dChvcD86IElDZWxsT3V0cHV0KTogeyBjb250ZW50OiBzdHJpbmc7IG1vZGU6IElMYW5ndWFnZVNlbGVjdGlvbiB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW9wKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RyZWFtT3V0cHV0RGF0YSA9IGdldFN0cmVhbU91dHB1dERhdGEob3Aub3V0cHV0cyk7XG5cdFx0aWYgKHN0cmVhbU91dHB1dERhdGEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHN0cmVhbU91dHB1dERhdGEsXG5cdFx0XHRcdG1vZGU6IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKFBMQUlOVEVYVF9MQU5HVUFHRV9JRClcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVzdWx0KGRhdGE6IHtcblx0XHRub3RlYm9vazogVVJJO1xuXHRcdG91dHB1dElkPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR9LCBjZWxsOiBJQ2VsbCkge1xuXHRcdGxldCByZXN1bHQ6IHsgY29udGVudDogc3RyaW5nOyBtb2RlOiBJTGFuZ3VhZ2VTZWxlY3Rpb24gfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZCgnanNvbicpO1xuXHRcdGNvbnN0IG9wID0gY2VsbC5vdXRwdXRzLmZpbmQob3AgPT4gb3Aub3V0cHV0SWQgPT09IGRhdGEub3V0cHV0SWQgfHwgb3AuYWx0ZXJuYXRpdmVPdXRwdXRJZCA9PT0gZGF0YS5vdXRwdXRJZCk7XG5cdFx0Y29uc3Qgc3RyZWFtT3V0cHV0RGF0YSA9IHRoaXMucGFyc2VTdHJlYW1PdXRwdXQob3ApO1xuXHRcdGlmIChzdHJlYW1PdXRwdXREYXRhKSB7XG5cdFx0XHRyZXN1bHQgPSBzdHJlYW1PdXRwdXREYXRhO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRjb25zdCBvYmogPSBjZWxsLm91dHB1dHMubWFwKG91dHB1dCA9PiAoe1xuXHRcdFx0bWV0YWRhdGE6IG91dHB1dC5tZXRhZGF0YSxcblx0XHRcdG91dHB1dEl0ZW1zOiBvdXRwdXQub3V0cHV0cy5tYXAob3BpdCA9PiAoe1xuXHRcdFx0XHRtaW1lVHlwZTogb3BpdC5taW1lLFxuXHRcdFx0XHRkYXRhOiBvcGl0LmRhdGEudG9TdHJpbmcoKVxuXHRcdFx0fSkpXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0U291cmNlID0gdG9Gb3JtYXR0ZWRTdHJpbmcob2JqLCB7fSk7XG5cdFx0cmVzdWx0ID0ge1xuXHRcdFx0Y29udGVudDogb3V0cHV0U291cmNlLFxuXHRcdFx0bW9kZVxuXHRcdH07XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZU91dHB1dHNUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gQ2VsbFVyaS5wYXJzZUNlbGxQcm9wZXJ0eVVyaShyZXNvdXJjZSwgU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZS5yZXNvbHZlKGRhdGEubm90ZWJvb2spO1xuXHRcdGNvbnN0IGNlbGwgPSByZWYub2JqZWN0Lm5vdGVib29rLmNlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmhhbmRsZSA9PT0gZGF0YS5oYW5kbGUpO1xuXG5cdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdqc29uJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoZ2V0Rm9ybWF0dGVkT3V0cHV0SlNPTihjZWxsLm91dHB1dHMgfHwgW10pLCBtb2RlLCByZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0Y29uc3QgY2VsbE1vZGVsTGlzdGVuZXIgPSBFdmVudC5hbnkoY2VsbC5vbkRpZENoYW5nZU91dHB1dHMgPz8gRXZlbnQuTm9uZSwgY2VsbC5vbkRpZENoYW5nZU91dHB1dEl0ZW1zID8/IEV2ZW50Lk5vbmUpKCgpID0+IHtcblx0XHRcdG1vZGVsLnNldFZhbHVlKGdldEZvcm1hdHRlZE91dHB1dEpTT04oY2VsbC5vdXRwdXRzIHx8IFtdKSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvbmNlID0gbW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRvbmNlLmRpc3Bvc2UoKTtcblx0XHRcdGNlbGxNb2RlbExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlT3V0cHV0VGV4dENvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IENlbGxVcmkucGFyc2VDZWxsT3V0cHV0VXJpKHJlc291cmNlKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLnByb3ZpZGVPdXRwdXRzVGV4dENvbnRlbnQocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX25vdGVib29rTW9kZWxSZXNvbHZlclNlcnZpY2UucmVzb2x2ZShkYXRhLm5vdGVib29rKTtcblx0XHRjb25zdCBjZWxsID0gcmVmLm9iamVjdC5ub3RlYm9vay5jZWxscy5maW5kKGNlbGwgPT4gISFjZWxsLm91dHB1dHMuZmluZChvcCA9PiBvcC5vdXRwdXRJZCA9PT0gZGF0YS5vdXRwdXRJZCB8fCBvcC5hbHRlcm5hdGl2ZU91dHB1dElkID09PSBkYXRhLm91dHB1dElkKSk7XG5cblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9nZXRSZXN1bHQoZGF0YSwgY2VsbCk7XG5cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKHJlc3VsdC5jb250ZW50LCByZXN1bHQubW9kZSwgcmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNlbGxNb2RlbExpc3RlbmVyID0gRXZlbnQuYW55KGNlbGwub25EaWRDaGFuZ2VPdXRwdXRzID8/IEV2ZW50Lk5vbmUsIGNlbGwub25EaWRDaGFuZ2VPdXRwdXRJdGVtcyA/PyBFdmVudC5Ob25lKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdSZXN1bHQgPSB0aGlzLl9nZXRSZXN1bHQoZGF0YSwgY2VsbCk7XG5cblx0XHRcdGlmICghbmV3UmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bW9kZWwuc2V0VmFsdWUobmV3UmVzdWx0LmNvbnRlbnQpO1xuXHRcdFx0bW9kZWwuc2V0TGFuZ3VhZ2UobmV3UmVzdWx0Lm1vZGUubGFuZ3VhZ2VJZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvbmNlID0gbW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRvbmNlLmRpc3Bvc2UoKTtcblx0XHRcdGNlbGxNb2RlbExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tNZXRhZGF0YUNvbnRlbnRQcm92aWRlciB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5ub3RlYm9va01ldGFkYXRhQ29udGVudFByb3ZpZGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZTogSU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnB1c2godGV4dE1vZGVsU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihTY2hlbWFzLnZzY29kZU5vdGVib29rTWV0YWRhdGEsIHtcblx0XHRcdHByb3ZpZGVUZXh0Q29udGVudDogdGhpcy5wcm92aWRlTWV0YWRhdGFUZXh0Q29udGVudC5iaW5kKHRoaXMpXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMucHVzaCh0aGlzLl9sYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZU5vdGVib29rTWV0YWRhdGEsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHtwYXRofSAobWV0YWRhdGEpJyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLydcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZU1ldGFkYXRhVGV4dENvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IE5vdGVib29rTWV0YWRhdGFVcmkucGFyc2UocmVzb3VyY2UpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZS5yZXNvbHZlKGRhdGEpO1xuXHRcdGxldCByZXN1bHQ6IElUZXh0TW9kZWwgfCBudWxsID0gbnVsbDtcblxuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZCgnanNvbicpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1ldGFkYXRhU291cmNlID0gZ2V0Rm9ybWF0dGVkTm90ZWJvb2tNZXRhZGF0YUpTT04ocmVmLm9iamVjdC5ub3RlYm9vay50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEsIHJlZi5vYmplY3Qubm90ZWJvb2subWV0YWRhdGEpO1xuXHRcdHJlc3VsdCA9IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbChcblx0XHRcdG1ldGFkYXRhU291cmNlLFxuXHRcdFx0bW9kZSxcblx0XHRcdHJlc291cmNlXG5cdFx0KTtcblxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMucHVzaChkaXNwb3NhYmxlcy5hZGQocmVmLm9iamVjdC5ub3RlYm9vay5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0ICYmIGUucmF3RXZlbnRzLnNvbWUoZXZlbnQgPT4gKGV2ZW50LmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxDb250ZW50IHx8IGV2ZW50LmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZURvY3VtZW50TWV0YWRhdGEgfHwgZXZlbnQua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UpKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGdldEZvcm1hdHRlZE5vdGVib29rTWV0YWRhdGFKU09OKHJlZi5vYmplY3Qubm90ZWJvb2sudHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnREb2N1bWVudE1ldGFkYXRhLCByZWYub2JqZWN0Lm5vdGVib29rLm1ldGFkYXRhKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5nZXRWYWx1ZSgpICE9PSB2YWx1ZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSkpO1xuXG5cdFx0Y29uc3Qgb25jZSA9IHJlc3VsdC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdG9uY2UuZGlzcG9zZSgpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgUmVnaXN0ZXJTY2hlbWFzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5yZWdpc3RlckNlbGxTY2hlbWFzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJNZXRhZGF0YVNjaGVtYXMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNZXRhZGF0YVNjaGVtYXMoKTogdm9pZCB7XG5cdFx0Y29uc3QganNvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cdFx0Y29uc3QgbWV0YWRhdGFTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRbJ2xhbmd1YWdlJ106IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBsYW5ndWFnZSBmb3IgdGhlIGNlbGwnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQvLyBwYXR0ZXJuUHJvcGVydGllczogYWxsU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXMsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHRcdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdFx0XHRhbGxvd0NvbW1lbnRzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYSgndnNjb2RlOi8vc2NoZW1hcy9ub3RlYm9vay9jZWxsbWV0YWRhdGEnLCBtZXRhZGF0YVNjaGVtYSk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tFZGl0b3JNYW5hZ2VyIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm5vdGVib29rRWRpdG9yTWFuYWdlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvck1vZGVsU2VydmljZTogSU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIGVkaXRvckdyb3VwczogSUVkaXRvckdyb3Vwc1NlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gT1BFTiBub3RlYm9vayBlZGl0b3IgZm9yIG1vZGVscyB0aGF0IGhhdmUgdHVybmVkIGRpcnR5IHdpdGhvdXQgYmVpbmcgdmlzaWJsZSBpbiBhbiBlZGl0b3Jcblx0XHR0eXBlIEUgPSBJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChFdmVudC5kZWJvdW5jZTxFLCBFW10+KFxuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JNb2RlbFNlcnZpY2Uub25EaWRDaGFuZ2VEaXJ0eSxcblx0XHRcdChsYXN0LCBjdXJyZW50KSA9PiAhbGFzdCA/IFtjdXJyZW50XSA6IFsuLi5sYXN0LCBjdXJyZW50XSxcblx0XHRcdDEwMFxuXHRcdCkodGhpcy5fb3Blbk1pc3NpbmdEaXJ0eU5vdGVib29rRWRpdG9ycywgdGhpcykpO1xuXG5cdFx0Ly8gQ0xPU0UgZWRpdG9ycyB3aGVuIHdlIGFyZSBhYm91dCB0byBvcGVuIGNvbmZsaWN0aW5nIG5vdGVib29rc1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChfbm90ZWJvb2tFZGl0b3JNb2RlbFNlcnZpY2Uub25XaWxsRmFpbFdpdGhDb25mbGljdChlID0+IHtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZWRpdG9yR3JvdXBzLmdyb3Vwcykge1xuXHRcdFx0XHRjb25zdCBjb25mbGljdElucHV0cyA9IGdyb3VwLmVkaXRvcnMuZmlsdGVyKGlucHV0ID0+IGlucHV0IGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCAmJiBpbnB1dC52aWV3VHlwZSAhPT0gZS52aWV3VHlwZSAmJiBpc0VxdWFsKGlucHV0LnJlc291cmNlLCBlLnJlc291cmNlKSk7XG5cdFx0XHRcdGNvbnN0IHAgPSBncm91cC5jbG9zZUVkaXRvcnMoY29uZmxpY3RJbnB1dHMpO1xuXHRcdFx0XHRlLndhaXRVbnRpbChwKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5NaXNzaW5nRGlydHlOb3RlYm9va0VkaXRvcnMobW9kZWxzOiBJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsW10pOiB2b2lkIHtcblx0XHRjb25zdCByZXN1bHQ6IElSZXNvdXJjZUVkaXRvcklucHV0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIG1vZGVscykge1xuXHRcdFx0aWYgKG1vZGVsLmlzRGlydHkoKSAmJiAhdGhpcy5fZWRpdG9yU2VydmljZS5pc09wZW5lZCh7IHJlc291cmNlOiBtb2RlbC5yZXNvdXJjZSwgdHlwZUlkOiBOb3RlYm9va0VkaXRvcklucHV0LklELCBlZGl0b3JJZDogbW9kZWwudmlld1R5cGUgfSkgJiYgZXh0bmFtZShtb2RlbC5yZXNvdXJjZSkgIT09ICcuaW50ZXJhY3RpdmUnKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogbW9kZWwucmVzb3VyY2UsXG5cdFx0XHRcdFx0b3B0aW9uczogeyBpbmFjdGl2ZTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgcGlubmVkOiB0cnVlLCBvdmVycmlkZTogbW9kZWwudmlld1R5cGUgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKHJlc3VsdCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNpbXBsZU5vdGVib29rV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JraW5nQ29weUVkaXRvckhhbmRsZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zaW1wbGVOb3RlYm9va1dvcmtpbmdDb3B5RWRpdG9ySGFuZGxlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9pbnN0YWxsSGFuZGxlcigpO1xuXHR9XG5cblx0YXN5bmMgaGFuZGxlcyh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHZpZXdUeXBlID0gdGhpcy5oYW5kbGVzU3luYyh3b3JraW5nQ29weSk7XG5cdFx0aWYgKCF2aWV3VHlwZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va1NlcnZpY2UuY2FuUmVzb2x2ZSh2aWV3VHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZXNTeW5jKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogc3RyaW5nIC8qIHZpZXdUeXBlICovIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2aWV3VHlwZSA9IHRoaXMuX2dldFZpZXdUeXBlKHdvcmtpbmdDb3B5KTtcblx0XHRpZiAoIXZpZXdUeXBlIHx8IHZpZXdUeXBlID09PSAnaW50ZXJhY3RpdmUnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB2aWV3VHlwZTtcblx0fVxuXG5cdGlzT3Blbih3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5oYW5kbGVzU3luYyh3b3JraW5nQ29weSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yIGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCAmJiBlZGl0b3Iudmlld1R5cGUgPT09IHRoaXMuX2dldFZpZXdUeXBlKHdvcmtpbmdDb3B5KSAmJiBpc0VxdWFsKHdvcmtpbmdDb3B5LnJlc291cmNlLCBlZGl0b3IucmVzb3VyY2UpO1xuXHR9XG5cblx0Y3JlYXRlRWRpdG9yKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBOb3RlYm9va0VkaXRvcklucHV0LmdldE9yQ3JlYXRlKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCB3b3JraW5nQ29weS5yZXNvdXJjZSwgdW5kZWZpbmVkLCB0aGlzLl9nZXRWaWV3VHlwZSh3b3JraW5nQ29weSkhKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luc3RhbGxIYW5kbGVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3JraW5nQ29weUVkaXRvclNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpZXdUeXBlKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tUeXBlID0gTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLnBhcnNlKHdvcmtpbmdDb3B5LnR5cGVJZCk7XG5cdFx0aWYgKG5vdGVib29rVHlwZSAmJiBub3RlYm9va1R5cGUudmlld1R5cGUgPT09IG5vdGVib29rVHlwZS5ub3RlYm9va1R5cGUpIHtcblx0XHRcdHJldHVybiBub3RlYm9va1R5cGU/LnZpZXdUeXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rTGFuZ3VhZ2VTZWxlY3RvclNjb3JlUmVmaW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubm90ZWJvb2tMYW5ndWFnZVNlbGVjdG9yU2NvcmVSZWZpbmUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNldE5vdGVib29rVHlwZVJlc29sdmVyKHRoaXMuX2dldE5vdGVib29rSW5mby5iaW5kKHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE5vdGVib29rSW5mbyh1cmk6IFVSSSk6IE5vdGVib29rSW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkucGFyc2UodXJpKTtcblx0XHRpZiAoIWNlbGxVcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKGNlbGxVcmkubm90ZWJvb2spO1xuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IG5vdGVib29rLnVyaSxcblx0XHRcdHR5cGU6IG5vdGVib29rLnZpZXdUeXBlXG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCB3b3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tDb250cmlidXRpb24uSUQsIE5vdGVib29rQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENlbGxDb250ZW50UHJvdmlkZXIuSUQsIENlbGxDb250ZW50UHJvdmlkZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2VsbEluZm9Db250ZW50UHJvdmlkZXIuSUQsIENlbGxJbmZvQ29udGVudFByb3ZpZGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE5vdGVib29rTWV0YWRhdGFDb250ZW50UHJvdmlkZXIuSUQsIE5vdGVib29rTWV0YWRhdGFDb250ZW50UHJvdmlkZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUmVnaXN0ZXJTY2hlbWFzQ29udHJpYnV0aW9uLklELCBSZWdpc3RlclNjaGVtYXNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tFZGl0b3JNYW5hZ2VyLklELCBOb3RlYm9va0VkaXRvck1hbmFnZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tMYW5ndWFnZVNlbGVjdG9yU2NvcmVSZWZpbmUuSUQsIE5vdGVib29rTGFuZ3VhZ2VTZWxlY3RvclNjb3JlUmVmaW5lLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFNpbXBsZU5vdGVib29rV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyLklELCBTaW1wbGVOb3RlYm9va1dvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbndvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihOb3RlYm9va1ZhcmlhYmxlcywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IE5vdGVib29rQWNjZXNzaWJsZVZpZXcoKSk7XG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBOb3RlYm9va0FjY2Vzc2liaWxpdHlIZWxwKCkpO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tTZXJ2aWNlLCBOb3RlYm9va1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlSW1wbCwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSwgTm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZUltcGwsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UsIE5vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGVib29rRWRpdG9yU2VydmljZSwgTm90ZWJvb2tFZGl0b3JXaWRnZXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va0tlcm5lbFNlcnZpY2UsIE5vdGVib29rS2VybmVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSwgTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLCBOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLCBOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2UsIE5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va0tleW1hcFNlcnZpY2UsIE5vdGVib29rS2V5bWFwU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tMb2dnaW5nU2VydmljZSwgTm90ZWJvb2tMb2dnaW5nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5LCBOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnksIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeSwgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuY29uc3Qgc2NoZW1hczogSUpTT05TY2hlbWFNYXAgPSB7fTtcbmZ1bmN0aW9uIGlzQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKHg6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB7IFtwYXRoOiBzdHJpbmddOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0pOiB4IGlzIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEge1xuXHRyZXR1cm4gKHR5cGVvZiB4LnR5cGUgIT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiB4LmFueU9mICE9PSAndW5kZWZpbmVkJyk7XG59XG5mb3IgKGNvbnN0IGVkaXRvck9wdGlvbiBvZiBlZGl0b3JPcHRpb25zUmVnaXN0cnkpIHtcblx0Y29uc3Qgc2NoZW1hID0gZWRpdG9yT3B0aW9uLnNjaGVtYTtcblx0aWYgKHNjaGVtYSkge1xuXHRcdGlmIChpc0NvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYShzY2hlbWEpKSB7XG5cdFx0XHRzY2hlbWFzW2BlZGl0b3IuJHtlZGl0b3JPcHRpb24ubmFtZX1gXSA9IHNjaGVtYTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gc2NoZW1hKSB7XG5cdFx0XHRcdGlmIChPYmplY3QuaGFzT3duUHJvcGVydHkuY2FsbChzY2hlbWEsIGtleSkpIHtcblx0XHRcdFx0XHRzY2hlbWFzW2tleV0gPSBzY2hlbWFba2V5XTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jb25zdCBlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvblNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZWRpdG9yT3B0aW9ucy5leHBlcmltZW50YWxDdXN0b21pemF0aW9uJywgJ1NldHRpbmdzIGZvciBjb2RlIGVkaXRvcnMgdXNlZCBpbiBub3RlYm9va3MuIFRoaXMgY2FuIGJlIHVzZWQgdG8gY3VzdG9taXplIG1vc3QgZWRpdG9yLiogc2V0dGluZ3MuJyksXG5cdGRlZmF1bHQ6IHt9LFxuXHRhbGxPZjogW1xuXHRcdHtcblx0XHRcdHByb3BlcnRpZXM6IHNjaGVtYXMsXG5cdFx0fVxuXHRcdC8vICwge1xuXHRcdC8vIFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHQvLyBcdFx0J15cXFxcWy4qXFxcXF0kJzoge1xuXHRcdC8vIFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdC8vIFx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdC8vIFx0XHRcdHByb3BlcnRpZXM6IHNjaGVtYXNcblx0XHQvLyBcdFx0fVxuXHRcdC8vIFx0fVxuXHRcdC8vIH1cblx0XSxcblx0dGFnczogWydub3RlYm9va0xheW91dCddXG59O1xuXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnbm90ZWJvb2snLFxuXHRvcmRlcjogMTAwLFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdub3RlYm9va0NvbmZpZ3VyYXRpb25UaXRsZScsIFwiTm90ZWJvb2tcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W05vdGVib29rU2V0dGluZy5kaXNwbGF5T3JkZXJdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5kaXNwbGF5T3JkZXIuZGVzY3JpcHRpb24nLCBcIlByaW9yaXR5IGxpc3QgZm9yIG91dHB1dCBtaW1lIHR5cGVzXCIpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDogW11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuY2VsbFRvb2xiYXJMb2NhdGlvbl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxUb29sYmFyTG9jYXRpb24uZGVzY3JpcHRpb24nLCBcIldoZXJlIHRoZSBjZWxsIHRvb2xiYXIgc2hvdWxkIGJlIHNob3duLCBvciB3aGV0aGVyIGl0IHNob3VsZCBiZSBoaWRkZW4uXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxUb29sYmFyTG9jYXRpb24udmlld1R5cGUnLCBcIkNvbmZpZ3VyZSB0aGUgY2VsbCB0b29sYmFyIHBvc2l0aW9uIGZvciBmb3Igc3BlY2lmaWMgZmlsZSB0eXBlc1wiKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnbGVmdCcsICdyaWdodCcsICdoaWRkZW4nXVxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J2RlZmF1bHQnOiAncmlnaHQnXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnNob3dDZWxsU3RhdHVzQmFyXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2hvd0NlbGxTdGF0dXNiYXIuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdGhlIGNlbGwgc3RhdHVzIGJhciBzaG91bGQgYmUgc2hvd24uXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2hpZGRlbicsICd2aXNpYmxlJywgJ3Zpc2libGVBZnRlckV4ZWN1dGUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5zaG93Q2VsbFN0YXR1c2Jhci5oaWRkZW4uZGVzY3JpcHRpb24nLCBcIlRoZSBjZWxsIHN0YXR1cyBiYXIgaXMgYWx3YXlzIGhpZGRlbi5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2hvd0NlbGxTdGF0dXNiYXIudmlzaWJsZS5kZXNjcmlwdGlvbicsIFwiVGhlIGNlbGwgc3RhdHVzIGJhciBpcyBhbHdheXMgdmlzaWJsZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2hvd0NlbGxTdGF0dXNiYXIudmlzaWJsZUFmdGVyRXhlY3V0ZS5kZXNjcmlwdGlvbicsIFwiVGhlIGNlbGwgc3RhdHVzIGJhciBpcyBoaWRkZW4gdW50aWwgdGhlIGNlbGwgaGFzIGV4ZWN1dGVkLiBUaGVuIGl0IGJlY29tZXMgdmlzaWJsZSB0byBzaG93IHRoZSBleGVjdXRpb24gc3RhdHVzLlwiKV0sXG5cdFx0XHRkZWZhdWx0OiAndmlzaWJsZScsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuY2VsbEV4ZWN1dGlvblRpbWVWZXJib3NpdHldOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsRXhlY3V0aW9uVGltZVZlcmJvc2l0eS5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgdGhlIHZlcmJvc2l0eSBvZiB0aGUgY2VsbCBleGVjdXRpb24gdGltZSBpbiB0aGUgY2VsbCBzdGF0dXMgYmFyLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ3ZlcmJvc2UnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsRXhlY3V0aW9uVGltZVZlcmJvc2l0eS5kZWZhdWx0LmRlc2NyaXB0aW9uJywgXCJUaGUgY2VsbCBleGVjdXRpb24gZHVyYXRpb24gaXMgdmlzaWJsZSwgd2l0aCBhZHZhbmNlZCBpbmZvcm1hdGlvbiBpbiB0aGUgaG92ZXIgdG9vbHRpcC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbEV4ZWN1dGlvblRpbWVWZXJib3NpdHkudmVyYm9zZS5kZXNjcmlwdGlvbicsIFwiVGhlIGNlbGwgbGFzdCBleGVjdXRpb24gdGltZXN0YW1wIGFuZCBkdXJhdGlvbiBhcmUgdmlzaWJsZSwgd2l0aCBhZHZhbmNlZCBpbmZvcm1hdGlvbiBpbiB0aGUgaG92ZXIgdG9vbHRpcC5cIildLFxuXHRcdFx0ZGVmYXVsdDogJ2RlZmF1bHQnLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnRleHREaWZmRWRpdG9yUHJldmlld106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmRpZmYuZW5hYmxlUHJldmlldy5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0byB1c2UgdGhlIGVuaGFuY2VkIHRleHQgZGlmZiBlZGl0b3IgZm9yIG5vdGVib29rLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZGlmZk92ZXJ2aWV3UnVsZXJdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5kaWZmLmVuYWJsZU92ZXJ2aWV3UnVsZXIuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdG8gcmVuZGVyIHRoZSBvdmVydmlldyBydWxlciBpbiB0aGUgZGlmZiBlZGl0b3IgZm9yIG5vdGVib29rLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmNlbGxUb29sYmFyVmlzaWJpbGl0eV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbFRvb2xiYXJWaXNpYmlsaXR5LmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRoZSBjZWxsIHRvb2xiYXIgc2hvdWxkIGFwcGVhciBvbiBob3ZlciBvciBjbGljay5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnaG92ZXInLCAnY2xpY2snXSxcblx0XHRcdGRlZmF1bHQ6ICdjbGljaycsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcudW5kb1JlZG9QZXJDZWxsXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sudW5kb1JlZG9QZXJDZWxsLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRvIHVzZSBzZXBhcmF0ZSB1bmRvL3JlZG8gc3RhY2sgZm9yIGVhY2ggY2VsbC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmNvbXBhY3RWaWV3XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY29tcGFjdFZpZXcuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2wgd2hldGhlciB0aGUgbm90ZWJvb2sgZWRpdG9yIHNob3VsZCBiZSByZW5kZXJlZCBpbiBhIGNvbXBhY3QgZm9ybS4gRm9yIGV4YW1wbGUsIHdoZW4gdHVybmVkIG9uLCBpdCB3aWxsIGRlY3JlYXNlIHRoZSBsZWZ0IG1hcmdpbiB3aWR0aC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmZvY3VzSW5kaWNhdG9yXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZm9jdXNJbmRpY2F0b3IuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXJlIHRoZSBmb2N1cyBpbmRpY2F0b3IgaXMgcmVuZGVyZWQsIGVpdGhlciBhbG9uZyB0aGUgY2VsbCBib3JkZXJzIG9yIG9uIHRoZSBsZWZ0IGd1dHRlci5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYm9yZGVyJywgJ2d1dHRlciddLFxuXHRcdFx0ZGVmYXVsdDogJ2d1dHRlcicsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuaW5zZXJ0VG9vbGJhckxvY2F0aW9uXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suaW5zZXJ0VG9vbGJhclBvc2l0aW9uLmRlc2NyaXB0aW9uJywgXCJDb250cm9sIHdoZXJlIHRoZSBpbnNlcnQgY2VsbCBhY3Rpb25zIHNob3VsZCBhcHBlYXIuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2JldHdlZW5DZWxscycsICdub3RlYm9va1Rvb2xiYXInLCAnYm90aCcsICdoaWRkZW4nXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdpbnNlcnRUb29sYmFyTG9jYXRpb24uYmV0d2VlbkNlbGxzJywgXCJBIHRvb2xiYXIgdGhhdCBhcHBlYXJzIG9uIGhvdmVyIGJldHdlZW4gY2VsbHMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2luc2VydFRvb2xiYXJMb2NhdGlvbi5ub3RlYm9va1Rvb2xiYXInLCBcIlRoZSB0b29sYmFyIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGVib29rIGVkaXRvci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnaW5zZXJ0VG9vbGJhckxvY2F0aW9uLmJvdGgnLCBcIkJvdGggdG9vbGJhcnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2luc2VydFRvb2xiYXJMb2NhdGlvbi5oaWRkZW4nLCBcIlRoZSBpbnNlcnQgYWN0aW9ucyBkb24ndCBhcHBlYXIgYW55d2hlcmUuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdib3RoJyxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5nbG9iYWxUb29sYmFyXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZ2xvYmFsVG9vbGJhci5kZXNjcmlwdGlvbicsIFwiQ29udHJvbCB3aGV0aGVyIHRvIHJlbmRlciBhIGdsb2JhbCB0b29sYmFyIGluc2lkZSB0aGUgbm90ZWJvb2sgZWRpdG9yLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuc3RpY2t5U2Nyb2xsRW5hYmxlZF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnN0aWNreVNjcm9sbEVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIkV4cGVyaW1lbnRhbC4gQ29udHJvbCB3aGV0aGVyIHRvIHJlbmRlciBub3RlYm9vayBTdGlja3kgU2Nyb2xsIGhlYWRlcnMgaW4gdGhlIG5vdGVib29rIGVkaXRvci5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5zdGlja3lTY3JvbGxNb2RlXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc3RpY2t5U2Nyb2xsTW9kZS5kZXNjcmlwdGlvbicsIFwiQ29udHJvbCB3aGV0aGVyIG5lc3RlZCBzdGlja3kgbGluZXMgYXBwZWFyIHRvIHN0YWNrIGZsYXQgb3IgaW5kZW50ZWQuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2ZsYXQnLCAnaW5kZW50ZWQnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5zdGlja3lTY3JvbGxNb2RlLmZsYXQnLCBcIk5lc3RlZCBzdGlja3kgbGluZXMgYXBwZWFyIGZsYXQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLnN0aWNreVNjcm9sbE1vZGUuaW5kZW50ZWQnLCBcIk5lc3RlZCBzdGlja3kgbGluZXMgYXBwZWFyIGluZGVudGVkLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnaW5kZW50ZWQnLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbi5kZXNjcmlwdGlvbicsIFwiQ29udHJvbCB3aGV0aGVyIG91dHB1dHMgYWN0aW9uIHNob3VsZCBiZSByZW5kZXJlZCBpbiB0aGUgb3V0cHV0IHRvb2xiYXIuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0Ly8gW05vdGVib29rU2V0dGluZy5vcGVuT3V0cHV0SW5QcmV2aWV3RWRpdG9yXToge1xuXHRcdC8vIFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sub3V0cHV0Lm9wZW5JblByZXZpZXdFZGl0b3IuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgb3Igbm90IHRoZSBhY3Rpb24gdG8gb3BlbiBhIGNlbGwgb3V0cHV0IGluIGEgcHJldmlldyBlZGl0b3IgaXMgZW5hYmxlZC4gVGhpcyBhY3Rpb24gY2FuIGJlIHVzZWQgdmlhIHRoZSBjZWxsIG91dHB1dCBtZW51LlwiKSxcblx0XHQvLyBcdHR5cGU6ICdib29sZWFuJyxcblx0XHQvLyBcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdC8vIFx0dGFnczogWydwcmV2aWV3J11cblx0XHQvLyB9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuc2hvd0ZvbGRpbmdDb250cm9sc106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnNob3dGb2xkaW5nQ29udHJvbHMuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZW4gdGhlIE1hcmtkb3duIGhlYWRlciBmb2xkaW5nIGFycm93IGlzIHNob3duLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhbHdheXMnLCAnbmV2ZXInLCAnbW91c2VvdmVyJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2hvd0ZvbGRpbmdDb250cm9scy5hbHdheXMnLCBcIlRoZSBmb2xkaW5nIGNvbnRyb2xzIGFyZSBhbHdheXMgdmlzaWJsZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2hvd0ZvbGRpbmdDb250cm9scy5uZXZlcicsIFwiTmV2ZXIgc2hvdyB0aGUgZm9sZGluZyBjb250cm9scyBhbmQgcmVkdWNlIHRoZSBndXR0ZXIgc2l6ZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2hvd0ZvbGRpbmdDb250cm9scy5tb3VzZW92ZXInLCBcIlRoZSBmb2xkaW5nIGNvbnRyb2xzIGFyZSB2aXNpYmxlIG9ubHkgb24gbW91c2VvdmVyLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnbW91c2VvdmVyJyxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5kcmFnQW5kRHJvcEVuYWJsZWRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5kcmFnQW5kRHJvcC5kZXNjcmlwdGlvbicsIFwiQ29udHJvbCB3aGV0aGVyIHRoZSBub3RlYm9vayBlZGl0b3Igc2hvdWxkIGFsbG93IG1vdmluZyBjZWxscyB0aHJvdWdoIGRyYWcgYW5kIGRyb3AuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRSdW5CdXR0b25dOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5jb25zb2xpZGF0ZWRSdW5CdXR0b24uZGVzY3JpcHRpb24nLCBcIkNvbnRyb2wgd2hldGhlciBleHRyYSBhY3Rpb25zIGFyZSBzaG93biBpbiBhIGRyb3Bkb3duIG5leHQgdG8gdGhlIHJ1biBidXR0b24uXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZ2xvYmFsVG9vbGJhclNob3dMYWJlbF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmdsb2JhbFRvb2xiYXJTaG93TGFiZWwnLCBcIkNvbnRyb2wgd2hldGhlciB0aGUgYWN0aW9ucyBvbiB0aGUgbm90ZWJvb2sgdG9vbGJhciBzaG91bGQgcmVuZGVyIGxhYmVsIG9yIG5vdC5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWx3YXlzJywgJ25ldmVyJywgJ2R5bmFtaWMnXSxcblx0XHRcdGRlZmF1bHQ6ICdhbHdheXMnLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnRleHRPdXRwdXRMaW5lTGltaXRdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnRleHRPdXRwdXRMaW5lTGltaXQnLCBcIkNvbnRyb2xzIGhvdyBtYW55IGxpbmVzIG9mIHRleHQgYXJlIGRpc3BsYXllZCBpbiBhIHRleHQgb3V0cHV0LiBJZiB7MH0gaXMgZW5hYmxlZCwgdGhpcyBzZXR0aW5nIGlzIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBzY3JvbGwgaGVpZ2h0IG9mIHRoZSBvdXRwdXQuXCIsICdgI25vdGVib29rLm91dHB1dC5zY3JvbGxpbmcjYCcpLFxuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAzMCxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnLCAnbm90ZWJvb2tPdXRwdXRMYXlvdXQnXSxcblx0XHRcdG1pbmltdW06IDEsXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLkxpbmtpZnlPdXRwdXRGaWxlUGF0aHNdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5kaXNhYmxlT3V0cHV0RmlsZVBhdGhMaW5rcycsIFwiQ29udHJvbCB3aGV0aGVyIHRvIGRpc2FibGUgZmlsZXBhdGggbGlua3MgaW4gdGhlIG91dHB1dCBvZiBub3RlYm9vayBjZWxscy5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydub3RlYm9va091dHB1dExheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm1pbmltYWxFcnJvclJlbmRlcmluZ106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLm1pbmltYWxFcnJvclJlbmRlcmluZycsIFwiQ29udHJvbCB3aGV0aGVyIHRvIHJlbmRlciBlcnJvciBvdXRwdXQgaW4gYSBtaW5pbWFsIHN0eWxlLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydub3RlYm9va091dHB1dExheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm1hcmt1cEZvbnRTaXplXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5tYXJrdXAuZm9udFNpemUnLCBcIkNvbnRyb2xzIHRoZSBmb250IHNpemUgaW4gcGl4ZWxzIG9mIHJlbmRlcmVkIG1hcmt1cCBpbiBub3RlYm9va3MuIFdoZW4gc2V0IHRvIHswfSwgMTIwJSBvZiB7MX0gaXMgdXNlZC5cIiwgJ2AwYCcsICdgI2VkaXRvci5mb250U2l6ZSNgJyksXG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDAsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcubWFya2Rvd25MaW5lSGVpZ2h0XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5tYXJrZG93bi5saW5lSGVpZ2h0JywgXCJDb250cm9scyB0aGUgbGluZSBoZWlnaHQgaW4gcGl4ZWxzIG9mIG1hcmtkb3duIGNlbGxzIGluIG5vdGVib29rcy4gV2hlbiBzZXQgdG8gezB9LCB7MX0gd2lsbCBiZSB1c2VkXCIsICdgMGAnLCAnYG5vcm1hbGAnKSxcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jZWxsRWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zXTogZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25TY2hlbWEsXG5cdFx0W05vdGVib29rU2V0dGluZy5pbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5pbnRlcmFjdGl2ZVdpbmRvdy5jb2xsYXBzZUNvZGVDZWxscycsIFwiQ29udHJvbHMgd2hldGhlciBjb2RlIGNlbGxzIGluIHRoZSBpbnRlcmFjdGl2ZSB3aW5kb3cgYXJlIGNvbGxhcHNlZCBieSBkZWZhdWx0LlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhbHdheXMnLCAnbmV2ZXInLCAnZnJvbUVkaXRvciddLFxuXHRcdFx0ZGVmYXVsdDogJ2Zyb21FZGl0b3InXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm91dHB1dExpbmVIZWlnaHRdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLm91dHB1dExpbmVIZWlnaHQnLCBcIkxpbmUgaGVpZ2h0IG9mIHRoZSBvdXRwdXQgdGV4dCB3aXRoaW4gbm90ZWJvb2sgY2VsbHMuXFxuIC0gV2hlbiBzZXQgdG8gMCwgZWRpdG9yIGxpbmUgaGVpZ2h0IGlzIHVzZWQuXFxuIC0gVmFsdWVzIGJldHdlZW4gMCBhbmQgOCB3aWxsIGJlIHVzZWQgYXMgYSBtdWx0aXBsaWVyIHdpdGggdGhlIGZvbnQgc2l6ZS5cXG4gLSBWYWx1ZXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIDggd2lsbCBiZSB1c2VkIGFzIGVmZmVjdGl2ZSB2YWx1ZXMuXCIpLFxuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAwLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCcsICdub3RlYm9va091dHB1dExheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm91dHB1dEZvbnRTaXplXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5vdXRwdXRGb250U2l6ZScsIFwiRm9udCBzaXplIGZvciB0aGUgb3V0cHV0IHRleHQgd2l0aGluIG5vdGVib29rIGNlbGxzLiBXaGVuIHNldCB0byAwLCB7MH0gaXMgdXNlZC5cIiwgJ2AjZWRpdG9yLmZvbnRTaXplI2AnKSxcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnLCAnbm90ZWJvb2tPdXRwdXRMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5vdXRwdXRGb250RmFtaWx5XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5vdXRwdXRGb250RmFtaWx5JywgXCJUaGUgZm9udCBmYW1pbHkgb2YgdGhlIG91dHB1dCB0ZXh0IHdpdGhpbiBub3RlYm9vayBjZWxscy4gV2hlbiBzZXQgdG8gZW1wdHksIHRoZSB7MH0gaXMgdXNlZC5cIiwgJ2AjZWRpdG9yLmZvbnRGYW1pbHkjYCcpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0JywgJ25vdGVib29rT3V0cHV0TGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcub3V0cHV0U2Nyb2xsaW5nXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5vdXRwdXRTY3JvbGxpbmcnLCBcIkluaXRpYWxseSByZW5kZXIgbm90ZWJvb2sgb3V0cHV0cyBpbiBhIHNjcm9sbGFibGUgcmVnaW9uIHdoZW4gbG9uZ2VyIHRoYW4gdGhlIGxpbWl0LlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnLCAnbm90ZWJvb2tPdXRwdXRMYXlvdXQnXSxcblx0XHRcdGRlZmF1bHQ6IHR5cGVvZiBwcm9kdWN0LnF1YWxpdHkgPT09ICdzdHJpbmcnICYmIHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScgLy8gb25seSBlbmFibGUgYXMgZGVmYXVsdCBpbiBpbnNpZGVyc1xuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5vdXRwdXRXb3JkV3JhcF06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sub3V0cHV0V29yZFdyYXAnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGxpbmVzIGluIG91dHB1dCBzaG91bGQgd3JhcC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0JywgJ25vdGVib29rT3V0cHV0TGF5b3V0J10sXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5kZWZhdWx0Rm9ybWF0dGVyXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2tGb3JtYXR0ZXIuZGVmYXVsdCcsIFwiRGVmaW5lcyBhIGRlZmF1bHQgbm90ZWJvb2sgZm9ybWF0dGVyIHdoaWNoIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBhbGwgb3RoZXIgZm9ybWF0dGVyIHNldHRpbmdzLiBNdXN0IGJlIHRoZSBpZGVudGlmaWVyIG9mIGFuIGV4dGVuc2lvbiBjb250cmlidXRpbmcgYSBmb3JtYXR0ZXIuXCIpLFxuXHRcdFx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddLFxuXHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdGVudW06IERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSWRzLFxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSXRlbUxhYmVscyxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogRGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25EZXNjcmlwdGlvbnNcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZm9ybWF0T25TYXZlXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5mb3JtYXRPblNhdmUnLCBcIkZvcm1hdCBhIG5vdGVib29rIG9uIHNhdmUuIEEgZm9ybWF0dGVyIG11c3QgYmUgYXZhaWxhYmxlIGFuZCB0aGUgZWRpdG9yIG11c3Qgbm90IGJlIHNodXR0aW5nIGRvd24uIFdoZW4gezB9IGlzIHNldCB0byBgYWZ0ZXJEZWxheWAsIHRoZSBmaWxlIHdpbGwgb25seSBiZSBmb3JtYXR0ZWQgd2hlbiBzYXZlZCBleHBsaWNpdGx5LlwiLCAnYCNmaWxlcy5hdXRvU2F2ZSNgJyksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J10sXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5pbnNlcnRGaW5hbE5ld2xpbmVdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmluc2VydEZpbmFsTmV3bGluZScsIFwiV2hlbiBlbmFibGVkLCBpbnNlcnQgYSBmaW5hbCBuZXcgbGluZSBpbnRvIHRoZSBlbmQgb2YgY29kZSBjZWxscyB3aGVuIHNhdmluZyBhIG5vdGVib29rLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmZvcm1hdE9uQ2VsbEV4ZWN1dGlvbl06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZm9ybWF0T25DZWxsRXhlY3V0aW9uJywgXCJGb3JtYXQgYSBub3RlYm9vayBjZWxsIHVwb24gZXhlY3V0aW9uLiBBIGZvcm1hdHRlciBtdXN0IGJlIGF2YWlsYWJsZS5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jb25maXJtRGVsZXRlUnVubmluZ0NlbGxdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNvbmZpcm1EZWxldGVSdW5uaW5nQ2VsbCcsIFwiQ29udHJvbCB3aGV0aGVyIGEgY29uZmlybWF0aW9uIHByb21wdCBpcyByZXF1aXJlZCB0byBkZWxldGUgYSBydW5uaW5nIGNlbGwuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5maW5kRmlsdGVyc106IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZmluZEZpbHRlcnMnLCBcIkN1c3RvbWl6ZSB0aGUgRmluZCBXaWRnZXQgYmVoYXZpb3IgZm9yIHNlYXJjaGluZyB3aXRoaW4gbm90ZWJvb2sgY2VsbHMuIFdoZW4gYm90aCBtYXJrdXAgc291cmNlIGFuZCBtYXJrdXAgcHJldmlldyBhcmUgZW5hYmxlZCwgdGhlIEZpbmQgV2lkZ2V0IHdpbGwgc2VhcmNoIGVpdGhlciB0aGUgc291cmNlIGNvZGUgb3IgcHJldmlldyBiYXNlZCBvbiB0aGUgY3VycmVudCBzdGF0ZSBvZiB0aGUgY2VsbC5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bWFya3VwU291cmNlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya3VwUHJldmlldzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvZGVTb3VyY2U6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb2RlT3V0cHV0OiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0bWFya3VwU291cmNlOiB0cnVlLFxuXHRcdFx0XHRtYXJrdXBQcmV2aWV3OiB0cnVlLFxuXHRcdFx0XHRjb2RlU291cmNlOiB0cnVlLFxuXHRcdFx0XHRjb2RlT3V0cHV0OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnJlbW90ZVNhdmluZ106IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sucmVtb3RlU2F2aW5nJywgXCJFbmFibGVzIHRoZSBpbmNyZW1lbnRhbCBzYXZpbmcgb2Ygbm90ZWJvb2tzIGJldHdlZW4gcHJvY2Vzc2VzIGFuZCBhY3Jvc3MgUmVtb3RlIGNvbm5lY3Rpb25zLiBXaGVuIGVuYWJsZWQsIG9ubHkgdGhlIGNoYW5nZXMgdG8gdGhlIG5vdGVib29rIGFyZSBzZW50IHRvIHRoZSBleHRlbnNpb24gaG9zdCwgaW1wcm92aW5nIHBlcmZvcm1hbmNlIGZvciBsYXJnZSBub3RlYm9va3MgYW5kIHNsb3cgbmV0d29yayBjb25uZWN0aW9ucy5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0eXBlb2YgcHJvZHVjdC5xdWFsaXR5ID09PSAnc3RyaW5nJyAmJiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnLCAvLyBvbmx5IGVuYWJsZSBhcyBkZWZhdWx0IGluIGluc2lkZXJzXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnNjcm9sbFRvUmV2ZWFsQ2VsbF06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2Nyb2xsaW5nLnJldmVhbE5leHRDZWxsT25FeGVjdXRlLmRlc2NyaXB0aW9uJywgXCJIb3cgZmFyIHRvIHNjcm9sbCB3aGVuIHJldmVhbGluZyB0aGUgbmV4dCBjZWxsIHVwb24gcnVubmluZyB7MH0uXCIsICdub3RlYm9vay5jZWxsLmV4ZWN1dGVBbmRTZWxlY3RCZWxvdycpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Z1bGxDZWxsJywgJ2ZpcnN0TGluZScsICdub25lJ10sXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5zY3JvbGxpbmcucmV2ZWFsTmV4dENlbGxPbkV4ZWN1dGUuZnVsbENlbGwuZGVzY3JpcHRpb24nLCAnU2Nyb2xsIHRvIGZ1bGx5IHJldmVhbCB0aGUgbmV4dCBjZWxsLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLnNjcm9sbGluZy5yZXZlYWxOZXh0Q2VsbE9uRXhlY3V0ZS5maXJzdExpbmUuZGVzY3JpcHRpb24nLCAnU2Nyb2xsIHRvIHJldmVhbCB0aGUgZmlyc3QgbGluZSBvZiB0aGUgbmV4dCBjZWxsLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLnNjcm9sbGluZy5yZXZlYWxOZXh0Q2VsbE9uRXhlY3V0ZS5ub25lLmRlc2NyaXB0aW9uJywgJ0RvIG5vdCBzY3JvbGwuJyksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2Z1bGxDZWxsJ1xuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jZWxsR2VuZXJhdGVdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxHZW5lcmF0ZScsIFwiRW5hYmxlIGV4cGVyaW1lbnRhbCBnZW5lcmF0ZSBhY3Rpb24gdG8gY3JlYXRlIGNvZGUgY2VsbCB3aXRoIGlubGluZSBjaGF0IGVuYWJsZWQuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5ub3RlYm9va1ZhcmlhYmxlc1ZpZXddOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLlZhcmlhYmxlc1ZpZXcuZGVzY3JpcHRpb24nLCBcIkVuYWJsZSB0aGUgZXhwZXJpbWVudGFsIG5vdGVib29rIHZhcmlhYmxlcyB2aWV3IHdpdGhpbiB0aGUgZGVidWcgcGFuZWwuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcubm90ZWJvb2tJbmxpbmVWYWx1ZXNdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmlubGluZVZhbHVlcy5kZXNjcmlwdGlvbicsIFwiQ29udHJvbCB3aGV0aGVyIHRvIHNob3cgaW5saW5lIHZhbHVlcyB3aXRoaW4gbm90ZWJvb2sgY29kZSBjZWxscyBhZnRlciBjZWxsIGV4ZWN1dGlvbi4gVmFsdWVzIHdpbGwgcmVtYWluIHVudGlsIHRoZSBjZWxsIGlzIGVkaXRlZCwgcmUtZXhlY3V0ZWQsIG9yIGV4cGxpY2l0bHkgY2xlYXJlZCB2aWEgdGhlIENsZWFyIEFsbCBPdXRwdXRzIHRvb2xiYXIgYnV0dG9uIG9yIHRoZSBgTm90ZWJvb2s6IENsZWFyIElubGluZSBWYWx1ZXNgIGNvbW1hbmQuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ29uJywgJ2F1dG8nLCAnb2ZmJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suaW5saW5lVmFsdWVzLm9uJywgXCJBbHdheXMgc2hvdyBpbmxpbmUgdmFsdWVzLCB3aXRoIGEgcmVnZXggZmFsbGJhY2sgaWYgbm8gaW5saW5lIHZhbHVlIHByb3ZpZGVyIGlzIHJlZ2lzdGVyZWQuIE5vdGU6IFRoZXJlIG1heSBiZSBhIHBlcmZvcm1hbmNlIGltcGFjdCBpbiBsYXJnZXIgY2VsbHMgaWYgdGhlIGZhbGxiYWNrIGlzIHVzZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLmlubGluZVZhbHVlcy5hdXRvJywgXCJTaG93IGlubGluZSB2YWx1ZXMgb25seSB3aGVuIGFuIGlubGluZSB2YWx1ZSBwcm92aWRlciBpcyByZWdpc3RlcmVkLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5pbmxpbmVWYWx1ZXMub2ZmJywgXCJOZXZlciBzaG93IGlubGluZSB2YWx1ZXMuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdvZmYnXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmNlbGxGYWlsdXJlRGlhZ25vc3RpY3NdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxGYWlsdXJlRGlhZ25vc3RpY3MnLCBcIlNob3cgYXZhaWxhYmxlIGRpYWdub3N0aWNzIGZvciBjZWxsIGZhaWx1cmVzLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcub3V0cHV0QmFja3VwU2l6ZUxpbWl0XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5iYWNrdXAuc2l6ZUxpbWl0JywgXCJUaGUgbGltaXQgb2Ygbm90ZWJvb2sgb3V0cHV0IHNpemUgaW4ga2lsb2J5dGVzIChLQikgd2hlcmUgbm90ZWJvb2sgZmlsZXMgd2lsbCBubyBsb25nZXIgYmUgYmFja2VkIHVwIGZvciBob3QgcmVsb2FkLiBVc2UgMCBmb3IgdW5saW1pdGVkLlwiKSxcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMTAwMDBcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcubXVsdGlDdXJzb3JdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCBcIkV4cGVyaW1lbnRhbC4gRW5hYmxlcyBhIGxpbWl0ZWQgc2V0IG9mIG11bHRpIGN1cnNvciBjb250cm9scyBhY3Jvc3MgbXVsdGlwbGUgY2VsbHMgaW4gdGhlIG5vdGVib29rIGVkaXRvci4gQ3VycmVudGx5IHN1cHBvcnRlZCBhcmUgY29yZSBlZGl0b3IgYWN0aW9ucyAodHlwaW5nL2N1dC9jb3B5L3Bhc3RlL2NvbXBvc2l0aW9uKSBhbmQgYSBsaW1pdGVkIHN1YnNldCBvZiBlZGl0b3IgY29tbWFuZHMuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcubWFya3VwRm9udEZhbWlseV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2subWFya3VwLmZvbnRGYW1pbHknLCBcIkNvbnRyb2xzIHRoZSBmb250IGZhbWlseSBvZiByZW5kZXJlZCBtYXJrdXAgaW4gbm90ZWJvb2tzLiBXaGVuIGxlZnQgYmxhbmssIHRoaXMgd2lsbCBmYWxsIGJhY2sgdG8gdGhlIGRlZmF1bHQgd29ya2JlbmNoIGZvbnQgZmFtaWx5LlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBc0IsWUFBWSxpQkFBaUIsZUFBZTtBQUNsRSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMscUJBQXFCO0FBQzlCLFNBQTZCLHdCQUF3QjtBQUNyRCxTQUFvQyx5QkFBeUI7QUFDN0QsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQXdFO0FBQ2pGLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUFpRDtBQUMxRCxTQUFTLGNBQWMscUJBQThFLGdCQUFnQixzQ0FBc0M7QUFDM0osU0FBb0Qsd0JBQXdCO0FBRTVFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQXVEO0FBQ2hFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsVUFBVSxTQUF1QyxtQ0FBbUMsaUJBQXFDLHlCQUF5QiwyQkFBMkI7QUFDdEwsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBb0MsY0FBYyxzQkFBc0I7QUFFeEUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsd0JBQXdCLDJCQUEyQjtBQUM1RCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLCtCQUErQiw4QkFBOEI7QUFDdEUsU0FBUyw2QkFBNkI7QUFHdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBb0MsaUNBQWlDO0FBQ3JFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsdUNBQXVDLDRDQUE0QztBQUc1RixPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUdQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFHUCxPQUFPO0FBR1AsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw4QkFBOEI7QUFDdkMsT0FBTyxhQUFhO0FBQ3BCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsOEJBQThCLG1DQUFtQztBQUMxRSxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlDQUFpQztBQUkxQyxTQUFTLEdBQXdCLGlCQUFpQixVQUFVLEVBQUU7QUFBQSxFQUM3RCxxQkFBcUI7QUFBQSxJQUNwQjtBQUFBLElBQ0EsZUFBZTtBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFDQTtBQUFBLElBQ0MsSUFBSSxlQUFlLG1CQUFtQjtBQUFBLEVBQ3ZDO0FBQ0Q7QUFFQSxTQUFTLEdBQXdCLGlCQUFpQixVQUFVLEVBQUU7QUFBQSxFQUM3RCxxQkFBcUI7QUFBQSxJQUNwQjtBQUFBLElBQ0EsdUJBQXVCO0FBQUEsSUFDdkI7QUFBQSxFQUNEO0FBQUEsRUFDQTtBQUFBLElBQ0MsSUFBSSxlQUFlLHVCQUF1QjtBQUFBLEVBQzNDO0FBQ0Q7QUFFQSxTQUFTLEdBQXdCLGlCQUFpQixVQUFVLEVBQUU7QUFBQSxFQUM3RCxxQkFBcUI7QUFBQSxJQUNwQjtBQUFBLElBQ0EscUJBQXFCO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBQUEsRUFDQTtBQUFBLElBQ0MsSUFBSSxlQUFlLHlCQUF5QjtBQUFBLEVBQzdDO0FBQ0Q7QUFFQSxTQUFTLEdBQXdCLGlCQUFpQixVQUFVLEVBQUU7QUFBQSxFQUM3RCxxQkFBcUI7QUFBQSxJQUNwQjtBQUFBLElBQ0EsNEJBQTRCO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFDQTtBQUFBLElBQ0MsSUFBSSxlQUFlLDRCQUE0QjtBQUFBLEVBQ2hEO0FBQ0Q7QUFFQSxJQUFNLCtCQUFOLE1BQWdFO0FBQUEsRUFDL0QsWUFBb0QsdUJBQThDO0FBQTlDO0FBQUEsRUFBZ0Q7QUFBQSxFQUNwRyxlQUF3QjtBQUN2QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsVUFBVSxPQUE0QjtBQUNyQyxlQUFXLGlCQUFpQix1QkFBdUI7QUFDbkQsV0FBTyxLQUFLLFVBQVU7QUFBQSxNQUNyQixVQUFVLE1BQU07QUFBQSxNQUNoQixrQkFBa0IsTUFBTSxTQUFTO0FBQUEsTUFDakMsTUFBTSxNQUFNLFFBQVE7QUFBQSxNQUNwQixjQUFjLE1BQU0sU0FBUyxRQUFRO0FBQUEsTUFDckMsY0FBYyxNQUFNLFFBQVE7QUFBQSxNQUM1QixVQUFVLE1BQU07QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsWUFBWSxzQkFBNkMsS0FBYTtBQUVyRSxVQUFNLE9BQWEsTUFBTSxHQUFHO0FBQzVCLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLEVBQUUsVUFBVSxrQkFBa0IsTUFBTSxTQUFTLElBQUk7QUFDdkQsUUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLE1BQU0sUUFBUSxLQUFLLENBQUMsSUFBSSxNQUFNLGdCQUFnQixLQUFLLE9BQU8sU0FBUyxZQUFZLE9BQU8sYUFBYSxVQUFVO0FBQzlILGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLHNCQUFzQixTQUFTLDJDQUEyQyxHQUFHO0FBQ3JGLGFBQU8sNkJBQTZCLE9BQU8sc0JBQXNCLFVBQVUsTUFBTSxRQUFXLGtCQUFrQixRQUFRO0FBQUEsSUFDdkgsT0FBTztBQUNOLGFBQU8sd0JBQXdCLE9BQU8sc0JBQXNCLFVBQVUsTUFBTSxRQUFXLGtCQUFrQixRQUFRO0FBQUEsSUFDbEg7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFPLGlCQUFpQixhQUEwQixnQkFBOEI7QUFDL0UsV0FBTztBQUFBLEVBQ1I7QUFFRDtBQXhDTSwrQkFBTjtBQUFBLEVBQ2M7QUFBQSxHQURSO0FBMENOLE1BQU0seUJBQXNEO0FBQUEsRUFDM0QsYUFBYSxPQUE2QjtBQUN6QyxXQUFPLE1BQU0sV0FBVyxvQkFBb0I7QUFBQSxFQUM3QztBQUFBLEVBQ0EsVUFBVSxPQUE0QjtBQUNyQyxlQUFXLGlCQUFpQixtQkFBbUI7QUFDL0MsVUFBTSxPQUFxQztBQUFBLE1BQzFDLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLG1CQUFtQixNQUFNO0FBQUEsTUFDekIsVUFBVSxNQUFNO0FBQUEsTUFDaEIsU0FBUyxNQUFNO0FBQUEsSUFDaEI7QUFDQSxXQUFPLEtBQUssVUFBVSxJQUFJO0FBQUEsRUFDM0I7QUFBQSxFQUNBLFlBQVksc0JBQTZDLEtBQWE7QUFDckUsVUFBTSxPQUFxQyxNQUFNLEdBQUc7QUFDcEQsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sRUFBRSxVQUFVLG1CQUFtQixVQUFVLFFBQVEsSUFBSTtBQUMzRCxRQUFJLENBQUMsUUFBUSxDQUFDLElBQUksTUFBTSxRQUFRLEtBQUssT0FBTyxhQUFhLFVBQVU7QUFDbEUsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFFBQVEsb0JBQW9CLFlBQVksc0JBQXNCLFVBQVUsbUJBQW1CLFVBQVUsT0FBTztBQUNsSCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBR0EsTUFBTSwrQkFBNEQ7QUFBQSxFQUNqRSxhQUFhLE9BQTZCO0FBQ3pDLFdBQU8sTUFBTSxXQUFXLDBCQUEwQjtBQUFBLEVBQ25EO0FBQUEsRUFDQSxVQUFVLE9BQXdDO0FBQ2pELGVBQVcsaUJBQWlCLHlCQUF5QjtBQUVyRCxVQUFNLE9BQU8sTUFBTSxrQkFBa0I7QUFDckMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyxVQUFVLElBQUk7QUFBQSxFQUMzQjtBQUFBLEVBQ0EsWUFBWSxzQkFBNkMsS0FBc0M7QUFDOUYsVUFBTSxPQUEyQyxNQUFNLEdBQUc7QUFDMUQsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sUUFBUSxxQkFBcUIsZUFBZSwyQkFBMkIsS0FBSyxhQUFhLEtBQUssV0FBVyxRQUFXLEtBQUssV0FBVztBQUMxSSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsU0FBUyxHQUEyQixpQkFBaUIsYUFBYSxFQUFFO0FBQUEsRUFDbkUsb0JBQW9CO0FBQUEsRUFDcEI7QUFDRDtBQUVBLFNBQVMsR0FBMkIsaUJBQWlCLGFBQWEsRUFBRTtBQUFBLEVBQ25FLHdCQUF3QjtBQUFBLEVBQ3hCO0FBQ0Q7QUFFQSxTQUFTLEdBQTJCLGlCQUFpQixhQUFhLEVBQUU7QUFBQSxFQUNuRSwwQkFBMEI7QUFBQSxFQUMxQjtBQUNEO0FBRU8sSUFBTSx1QkFBTixjQUFtQyxXQUE2QztBQUFBLEVBTXRGLFlBQ21CLGlCQUNLLHNCQUNjLG1CQUNwQztBQUNELFVBQU07QUFGK0I7QUFJckMsU0FBSyxnQ0FBZ0Msc0JBQXNCLGVBQWU7QUFHMUUsU0FBSyxVQUFVLHFCQUFxQix5QkFBeUIsT0FBSztBQUNqRSxVQUFJLEVBQUUscUJBQXFCLGdCQUFnQixlQUFlLEdBQUc7QUFDNUQsYUFBSyxnQ0FBZ0Msc0JBQXNCLGVBQWU7QUFBQSxNQUMzRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLEtBQUssa0JBQWtCLHVCQUF1QixzQkFBc0IsOEJBQThCLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDckg7QUFBQTtBQUFBLEVBR1EsZ0NBQWdDLHNCQUE2QyxpQkFBbUM7QUFDdkgsVUFBTSxrQkFBa0IscUJBQXFCLFNBQWtCLGdCQUFnQixlQUFlO0FBRTlGLFFBQUksQ0FBQyxpQkFBaUI7QUFFckIsVUFBSSxDQUFDLEtBQUssMkJBQTJCO0FBQ3BDLGFBQUssNEJBQTRCLGdCQUFnQixpQ0FBaUMsUUFBUSxRQUFRO0FBQUEsVUFDakcsa0JBQWtCLENBQUMsUUFBcUI7QUFDdkMsZ0JBQUksaUJBQWlCO0FBQ3BCLHFCQUFPLElBQUksU0FBUztBQUFBLFlBQ3JCO0FBQ0EsbUJBQU8scUJBQXFCLDhCQUE4QixHQUFHO0FBQUEsVUFDOUQ7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxPQUFPO0FBRU4sV0FBSywyQkFBMkIsUUFBUTtBQUN4QyxXQUFLLDRCQUE0QjtBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBZSw4QkFBOEIsS0FBVTtBQUN0RCxVQUFNLE9BQU8sUUFBUSxNQUFNLEdBQUc7QUFDOUIsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLElBQUksU0FBUztBQUFBLElBQ3JCO0FBRUEsV0FBTyxLQUFLLFNBQVMsU0FBUztBQUFBLEVBQy9CO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFDZCxTQUFLLDJCQUEyQixRQUFRO0FBQUEsRUFDekM7QUFDRDtBQTlEYSxxQkFFSSxLQUFLO0FBRlQsdUJBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVO0FBZ0ViLElBQU0sc0JBQU4sTUFBK0Q7QUFBQSxFQU05RCxZQUNvQixrQkFDYSxlQUNHLGtCQUNtQiwrQkFDckQ7QUFIK0I7QUFDRztBQUNtQjtBQUV0RCxTQUFLLGdCQUFnQixpQkFBaUIsaUNBQWlDLFFBQVEsUUFBUSxJQUFJO0FBQUEsRUFDNUY7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxjQUFjLFFBQVE7QUFBQSxFQUM1QjtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsVUFBMkM7QUFDbkUsVUFBTSxXQUFXLEtBQUssY0FBYyxTQUFTLFFBQVE7QUFDckQsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVE7QUFFbkMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sTUFBTSxNQUFNLEtBQUssOEJBQThCLFFBQVEsS0FBSyxRQUFRO0FBQzFFLFFBQUksU0FBNEI7QUFFaEMsUUFBSSxDQUFDLElBQUksT0FBTyxXQUFXLEdBQUc7QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFFQSxlQUFXLFFBQVEsSUFBSSxPQUFPLFNBQVMsT0FBTztBQUM3QyxVQUFJLEtBQUssSUFBSSxTQUFTLE1BQU0sU0FBUyxTQUFTLEdBQUc7QUFDaEQsY0FBTSxnQkFBb0M7QUFBQSxVQUN6QyxRQUFRLENBQUMsZUFBZTtBQUN2QixtQkFBTyxFQUFFLFlBQVksS0FBSyxZQUEyQixZQUFZLFdBQVcsS0FBSztBQUFBLFVBQ2xGO0FBQUEsVUFDQSxrQkFBa0IsQ0FBQyxVQUFrQjtBQUNwQyxtQkFBTyxLQUFLLFdBQVcsZUFBZSxDQUFDLEVBQUUsVUFBVSxHQUFHLEtBQUs7QUFBQSxVQUM1RDtBQUFBLFFBQ0Q7QUFDQSxjQUFNLGFBQWEsS0FBSyxpQkFBaUIsNEJBQTRCLEtBQUssUUFBUTtBQUNsRixjQUFNLG9CQUFvQixhQUFhLEtBQUssaUJBQWlCLFdBQVcsVUFBVSxJQUFLLEtBQUssYUFBYSxTQUFTLFNBQVMsS0FBSyxpQkFBaUIsV0FBVyxVQUFVLElBQUksS0FBSyxpQkFBaUIsNEJBQTRCLFVBQVUsS0FBSyxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBQ3ZRLGlCQUFTLEtBQUssY0FBYztBQUFBLFVBQzNCO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxRQUFRO0FBQ1osVUFBSSxRQUFRO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sTUFBTSxJQUFJLE9BQU8sZUFBZSxJQUFJLE9BQU8sU0FBUyxhQUFhLEVBQUUsTUFBTTtBQUNyRixXQUFLLFFBQVE7QUFDYixVQUFJLFFBQVE7QUFBQSxJQUNiLENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBdEVNLG9CQUVXLEtBQUs7QUFGaEIsc0JBQU47QUFBQSxFQU9HO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FWRztBQXdFTixJQUFNLDBCQUFOLE1BQThCO0FBQUEsRUFNN0IsWUFDb0Isa0JBQ2EsZUFDRyxrQkFDSCxlQUNzQiwrQkFDckQ7QUFKK0I7QUFDRztBQUNIO0FBQ3NCO0FBUHZELFNBQWlCLGVBQThCLENBQUM7QUFTL0MsU0FBSyxhQUFhLEtBQUssaUJBQWlCLGlDQUFpQyxRQUFRLDRCQUE0QjtBQUFBLE1BQzVHLG9CQUFvQixLQUFLLDJCQUEyQixLQUFLLElBQUk7QUFBQSxJQUM5RCxDQUFDLENBQUM7QUFFRixTQUFLLGFBQWEsS0FBSyxpQkFBaUIsaUNBQWlDLFFBQVEsMEJBQTBCO0FBQUEsTUFDMUcsb0JBQW9CLEtBQUsseUJBQXlCLEtBQUssSUFBSTtBQUFBLElBQzVELENBQUMsQ0FBQztBQUVGLFNBQUssYUFBYSxLQUFLLEtBQUssY0FBYyxrQkFBa0I7QUFBQSxNQUMzRCxRQUFRLFFBQVE7QUFBQSxNQUNoQixZQUFZO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxXQUFXO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxhQUFhLEtBQUssS0FBSyxjQUFjLGtCQUFrQjtBQUFBLE1BQzNELFFBQVEsUUFBUTtBQUFBLE1BQ2hCLFlBQVk7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFlBQVEsS0FBSyxZQUFZO0FBQUEsRUFDMUI7QUFBQSxFQUVBLE1BQU0sMkJBQTJCLFVBQTJDO0FBQzNFLFVBQU0sV0FBVyxLQUFLLGNBQWMsU0FBUyxRQUFRO0FBQ3JELFFBQUksVUFBVTtBQUNiLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxPQUFPLFFBQVEscUJBQXFCLFVBQVUsUUFBUSwwQkFBMEI7QUFDdEYsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sTUFBTSxNQUFNLEtBQUssOEJBQThCLFFBQVEsS0FBSyxRQUFRO0FBQzFFLFFBQUksU0FBNEI7QUFFaEMsVUFBTSxPQUFPLEtBQUssaUJBQWlCLFdBQVcsTUFBTTtBQUNwRCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsZUFBVyxRQUFRLElBQUksT0FBTyxTQUFTLE9BQU87QUFDN0MsVUFBSSxLQUFLLFdBQVcsS0FBSyxRQUFRO0FBQ2hDLGNBQU0sWUFBWSxJQUFJLE9BQU8sU0FBUyxNQUFNLFFBQVEsSUFBSTtBQUN4RCxjQUFNLGlCQUFpQix5QkFBeUIsSUFBSSxPQUFPLFNBQVMsaUJBQWlCLHVCQUF1QixLQUFLLFVBQVUsS0FBSyxVQUFVLElBQUk7QUFDOUksaUJBQVMsS0FBSyxjQUFjO0FBQUEsVUFDM0I7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFDQSxhQUFLLGFBQWEsS0FBSyxZQUFZLElBQUksSUFBSSxPQUFPLFNBQVMsbUJBQW1CLE9BQUs7QUFDbEYsY0FBSSxVQUFVLEVBQUUsVUFBVSxLQUFLLFlBQVUsTUFBTSxTQUFTLHdCQUF3QixzQkFBc0IsTUFBTSxTQUFTLHdCQUF3Qix1QkFBdUIsTUFBTSxVQUFVLFNBQVMsR0FBRztBQUMvTCxrQkFBTSxRQUFRLHlCQUF5QixJQUFJLE9BQU8sU0FBUyxpQkFBaUIsdUJBQXVCLEtBQUssVUFBVSxLQUFLLFVBQVUsSUFBSTtBQUNySSxnQkFBSSxPQUFPLFNBQVMsTUFBTSxPQUFPO0FBQ2hDLHFCQUFPLFNBQVMsS0FBSztBQUFBLFlBQ3RCO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQyxDQUFDLENBQUM7QUFDSDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLFFBQVE7QUFDWixVQUFJLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sT0FBTyxPQUFPLGNBQWMsTUFBTTtBQUN2QyxrQkFBWSxRQUFRO0FBQ3BCLFdBQUssUUFBUTtBQUNiLFVBQUksUUFBUTtBQUFBLElBQ2IsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxrQkFBa0IsSUFBNkU7QUFDdEcsUUFBSSxDQUFDLElBQUk7QUFDUjtBQUFBLElBQ0Q7QUFFQSxVQUFNLG1CQUFtQixvQkFBb0IsR0FBRyxPQUFPO0FBQ3ZELFFBQUksa0JBQWtCO0FBQ3JCLGFBQU87QUFBQSxRQUNOLFNBQVM7QUFBQSxRQUNULE1BQU0sS0FBSyxpQkFBaUIsV0FBVyxxQkFBcUI7QUFBQSxNQUM3RDtBQUFBLElBQ0Q7QUFFQTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFdBQVcsTUFHaEIsTUFBYTtBQUNmLFFBQUksU0FBb0U7QUFFeEUsVUFBTSxPQUFPLEtBQUssaUJBQWlCLFdBQVcsTUFBTTtBQUNwRCxVQUFNLEtBQUssS0FBSyxRQUFRLEtBQUssQ0FBQUEsUUFBTUEsSUFBRyxhQUFhLEtBQUssWUFBWUEsSUFBRyx3QkFBd0IsS0FBSyxRQUFRO0FBQzVHLFVBQU0sbUJBQW1CLEtBQUssa0JBQWtCLEVBQUU7QUFDbEQsUUFBSSxrQkFBa0I7QUFDckIsZUFBUztBQUNULGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxNQUFNLEtBQUssUUFBUSxJQUFJLGFBQVc7QUFBQSxNQUN2QyxVQUFVLE9BQU87QUFBQSxNQUNqQixhQUFhLE9BQU8sUUFBUSxJQUFJLFdBQVM7QUFBQSxRQUN4QyxVQUFVLEtBQUs7QUFBQSxRQUNmLE1BQU0sS0FBSyxLQUFLLFNBQVM7QUFBQSxNQUMxQixFQUFFO0FBQUEsSUFDSCxFQUFFO0FBRUYsVUFBTSxlQUFlLGtCQUFrQixLQUFLLENBQUMsQ0FBQztBQUM5QyxhQUFTO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSwwQkFBMEIsVUFBMkM7QUFDMUUsVUFBTSxXQUFXLEtBQUssY0FBYyxTQUFTLFFBQVE7QUFDckQsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sUUFBUSxxQkFBcUIsVUFBVSxRQUFRLHdCQUF3QjtBQUNwRixRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxNQUFNLE1BQU0sS0FBSyw4QkFBOEIsUUFBUSxLQUFLLFFBQVE7QUFDMUUsVUFBTSxPQUFPLElBQUksT0FBTyxTQUFTLE1BQU0sS0FBSyxDQUFBQyxVQUFRQSxNQUFLLFdBQVcsS0FBSyxNQUFNO0FBRS9FLFFBQUksQ0FBQyxNQUFNO0FBQ1YsVUFBSSxRQUFRO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sS0FBSyxpQkFBaUIsV0FBVyxNQUFNO0FBQ3BELFVBQU0sUUFBUSxLQUFLLGNBQWMsWUFBWSx1QkFBdUIsS0FBSyxXQUFXLENBQUMsQ0FBQyxHQUFHLE1BQU0sVUFBVSxJQUFJO0FBQzdHLFVBQU0sb0JBQW9CLE1BQU0sSUFBSSxLQUFLLHNCQUFzQixNQUFNLE1BQU0sS0FBSywwQkFBMEIsTUFBTSxJQUFJLEVBQUUsTUFBTTtBQUMzSCxZQUFNLFNBQVMsdUJBQXVCLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQzFELENBQUM7QUFFRCxVQUFNLE9BQU8sTUFBTSxjQUFjLE1BQU07QUFDdEMsV0FBSyxRQUFRO0FBQ2Isd0JBQWtCLFFBQVE7QUFDMUIsVUFBSSxRQUFRO0FBQUEsSUFDYixDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0seUJBQXlCLFVBQTJDO0FBQ3pFLFVBQU0sV0FBVyxLQUFLLGNBQWMsU0FBUyxRQUFRO0FBQ3JELFFBQUksVUFBVTtBQUNiLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxPQUFPLFFBQVEsbUJBQW1CLFFBQVE7QUFDaEQsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLEtBQUssMEJBQTBCLFFBQVE7QUFBQSxJQUMvQztBQUVBLFVBQU0sTUFBTSxNQUFNLEtBQUssOEJBQThCLFFBQVEsS0FBSyxRQUFRO0FBQzFFLFVBQU0sT0FBTyxJQUFJLE9BQU8sU0FBUyxNQUFNLEtBQUssQ0FBQUEsVUFBUSxDQUFDLENBQUNBLE1BQUssUUFBUSxLQUFLLFFBQU0sR0FBRyxhQUFhLEtBQUssWUFBWSxHQUFHLHdCQUF3QixLQUFLLFFBQVEsQ0FBQztBQUV4SixRQUFJLENBQUMsTUFBTTtBQUNWLFVBQUksUUFBUTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFTLEtBQUssV0FBVyxNQUFNLElBQUk7QUFFekMsUUFBSSxDQUFDLFFBQVE7QUFDWixVQUFJLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sUUFBUSxLQUFLLGNBQWMsWUFBWSxPQUFPLFNBQVMsT0FBTyxNQUFNLFFBQVE7QUFDbEYsVUFBTSxvQkFBb0IsTUFBTSxJQUFJLEtBQUssc0JBQXNCLE1BQU0sTUFBTSxLQUFLLDBCQUEwQixNQUFNLElBQUksRUFBRSxNQUFNO0FBQzNILFlBQU0sWUFBWSxLQUFLLFdBQVcsTUFBTSxJQUFJO0FBRTVDLFVBQUksQ0FBQyxXQUFXO0FBQ2Y7QUFBQSxNQUNEO0FBRUEsWUFBTSxTQUFTLFVBQVUsT0FBTztBQUNoQyxZQUFNLFlBQVksVUFBVSxLQUFLLFVBQVU7QUFBQSxJQUM1QyxDQUFDO0FBRUQsVUFBTSxPQUFPLE1BQU0sY0FBYyxNQUFNO0FBQ3RDLFdBQUssUUFBUTtBQUNiLHdCQUFrQixRQUFRO0FBQzFCLFVBQUksUUFBUTtBQUFBLElBQ2IsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUE1Tk0sd0JBRVcsS0FBSztBQUZoQiwwQkFBTjtBQUFBLEVBT0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYRztBQThOTixJQUFNLGtDQUFOLE1BQXNDO0FBQUEsRUFLckMsWUFDb0Isa0JBQ2EsZUFDRyxrQkFDSCxlQUNzQiwrQkFDckQ7QUFKK0I7QUFDRztBQUNIO0FBQ3NCO0FBUHZELFNBQWlCLGVBQThCLENBQUM7QUFTL0MsU0FBSyxhQUFhLEtBQUssaUJBQWlCLGlDQUFpQyxRQUFRLHdCQUF3QjtBQUFBLE1BQ3hHLG9CQUFvQixLQUFLLDJCQUEyQixLQUFLLElBQUk7QUFBQSxJQUM5RCxDQUFDLENBQUM7QUFFRixTQUFLLGFBQWEsS0FBSyxLQUFLLGNBQWMsa0JBQWtCO0FBQUEsTUFDM0QsUUFBUSxRQUFRO0FBQUEsTUFDaEIsWUFBWTtBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsV0FBVztBQUFBLE1BQ1o7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsWUFBUSxLQUFLLFlBQVk7QUFBQSxFQUMxQjtBQUFBLEVBRUEsTUFBTSwyQkFBMkIsVUFBMkM7QUFDM0UsVUFBTSxXQUFXLEtBQUssY0FBYyxTQUFTLFFBQVE7QUFDckQsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sb0JBQW9CLE1BQU0sUUFBUTtBQUMvQyxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxNQUFNLE1BQU0sS0FBSyw4QkFBOEIsUUFBUSxJQUFJO0FBQ2pFLFFBQUksU0FBNEI7QUFFaEMsVUFBTSxPQUFPLEtBQUssaUJBQWlCLFdBQVcsTUFBTTtBQUNwRCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxpQkFBaUIsaUNBQWlDLElBQUksT0FBTyxTQUFTLGlCQUFpQiwyQkFBMkIsSUFBSSxPQUFPLFNBQVMsUUFBUTtBQUNwSixhQUFTLEtBQUssY0FBYztBQUFBLE1BQzNCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLFFBQVE7QUFDWixVQUFJLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssYUFBYSxLQUFLLFlBQVksSUFBSSxJQUFJLE9BQU8sU0FBUyxtQkFBbUIsT0FBSztBQUNsRixVQUFJLFVBQVUsRUFBRSxVQUFVLEtBQUssV0FBVSxNQUFNLFNBQVMsd0JBQXdCLHFCQUFxQixNQUFNLFNBQVMsd0JBQXdCLDBCQUEwQixNQUFNLFNBQVMsd0JBQXdCLFdBQVksR0FBRztBQUMzTixjQUFNLFFBQVEsaUNBQWlDLElBQUksT0FBTyxTQUFTLGlCQUFpQiwyQkFBMkIsSUFBSSxPQUFPLFNBQVMsUUFBUTtBQUMzSSxZQUFJLE9BQU8sU0FBUyxNQUFNLE9BQU87QUFDaEMsaUJBQU8sU0FBUyxLQUFLO0FBQUEsUUFDdEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUMsQ0FBQztBQUVILFVBQU0sT0FBTyxPQUFPLGNBQWMsTUFBTTtBQUN2QyxrQkFBWSxRQUFRO0FBQ3BCLFdBQUssUUFBUTtBQUNiLFVBQUksUUFBUTtBQUFBLElBQ2IsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUExRU0sZ0NBQ1csS0FBSztBQURoQixrQ0FBTjtBQUFBLEVBTUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FWRztBQTRFTixNQUFNLG9DQUFvQyxXQUE2QztBQUFBLEVBSXRGLGNBQWM7QUFDYixVQUFNO0FBQ04sU0FBSyx3QkFBd0I7QUFBQSxFQUM5QjtBQUFBLEVBRVEsMEJBQWdDO0FBQ3ZDLFVBQU0sZUFBZSxTQUFTLEdBQThCLGVBQWUsZ0JBQWdCO0FBQzNGLFVBQU0saUJBQThCO0FBQUEsTUFDbkMsWUFBWTtBQUFBLFFBQ1gsQ0FBQyxVQUFVLEdBQUc7QUFBQSxVQUNiLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBO0FBQUEsTUFFQSxzQkFBc0I7QUFBQSxNQUN0QixxQkFBcUI7QUFBQSxNQUNyQixlQUFlO0FBQUEsSUFDaEI7QUFFQSxpQkFBYSxlQUFlLDBDQUEwQyxjQUFjO0FBQUEsRUFDckY7QUFDRDtBQTFCTSw0QkFFVyxLQUFLO0FBMEJ0QixJQUFNLHdCQUFOLE1BQThEO0FBQUEsRUFNN0QsWUFDa0MsZ0JBQ3FCLDZCQUNoQyxjQUNyQjtBQUhnQztBQUNxQjtBQUp2RCxTQUFpQixlQUFlLElBQUksZ0JBQWdCO0FBU25ELFNBQUssYUFBYSxJQUFJLE1BQU07QUFBQSxNQUMzQixLQUFLLDRCQUE0QjtBQUFBLE1BQ2pDLENBQUMsTUFBTSxZQUFZLENBQUMsT0FBTyxDQUFDLE9BQU8sSUFBSSxDQUFDLEdBQUcsTUFBTSxPQUFPO0FBQUEsTUFDeEQ7QUFBQSxJQUNELEVBQUUsS0FBSyxrQ0FBa0MsSUFBSSxDQUFDO0FBRzlDLFNBQUssYUFBYSxJQUFJLDRCQUE0Qix1QkFBdUIsT0FBSztBQUM3RSxpQkFBVyxTQUFTLGFBQWEsUUFBUTtBQUN4QyxjQUFNLGlCQUFpQixNQUFNLFFBQVEsT0FBTyxXQUFTLGlCQUFpQix1QkFBdUIsTUFBTSxhQUFhLEVBQUUsWUFBWSxRQUFRLE1BQU0sVUFBVSxFQUFFLFFBQVEsQ0FBQztBQUNqSyxjQUFNLElBQUksTUFBTSxhQUFhLGNBQWM7QUFDM0MsVUFBRSxVQUFVLENBQUM7QUFBQSxNQUNkO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssYUFBYSxRQUFRO0FBQUEsRUFDM0I7QUFBQSxFQUVRLGlDQUFpQyxRQUE4QztBQUN0RixVQUFNLFNBQWlDLENBQUM7QUFDeEMsZUFBVyxTQUFTLFFBQVE7QUFDM0IsVUFBSSxNQUFNLFFBQVEsS0FBSyxDQUFDLEtBQUssZUFBZSxTQUFTLEVBQUUsVUFBVSxNQUFNLFVBQVUsUUFBUSxvQkFBb0IsSUFBSSxVQUFVLE1BQU0sU0FBUyxDQUFDLEtBQUssUUFBUSxNQUFNLFFBQVEsTUFBTSxnQkFBZ0I7QUFDM0wsZUFBTyxLQUFLO0FBQUEsVUFDWCxVQUFVLE1BQU07QUFBQSxVQUNoQixTQUFTLEVBQUUsVUFBVSxNQUFNLGVBQWUsTUFBTSxRQUFRLE1BQU0sVUFBVSxNQUFNLFNBQVM7QUFBQSxRQUN4RixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFDQSxRQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLFdBQUssZUFBZSxZQUFZLE1BQU07QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFDRDtBQS9DTSxzQkFFVyxLQUFLO0FBRmhCLHdCQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FURztBQWlETixJQUFNLHlDQUFOLGNBQXFELFdBQXdFO0FBQUEsRUFJNUgsWUFDeUMsdUJBQ0ksMkJBQ1IsbUJBQ0Qsa0JBQ2xDO0FBQ0QsVUFBTTtBQUxrQztBQUNJO0FBQ1I7QUFDRDtBQUluQyxTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQUEsRUFFQSxNQUFNLFFBQVEsYUFBdUQ7QUFDcEUsVUFBTSxXQUFXLEtBQUssWUFBWSxXQUFXO0FBQzdDLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssaUJBQWlCLFdBQVcsUUFBUTtBQUFBLEVBQ2pEO0FBQUEsRUFFUSxZQUFZLGFBQXdFO0FBQzNGLFVBQU0sV0FBVyxLQUFLLGFBQWEsV0FBVztBQUM5QyxRQUFJLENBQUMsWUFBWSxhQUFhLGVBQWU7QUFDNUMsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBTyxhQUFxQyxRQUE4QjtBQUN6RSxRQUFJLENBQUMsS0FBSyxZQUFZLFdBQVcsR0FBRztBQUNuQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sa0JBQWtCLHVCQUF1QixPQUFPLGFBQWEsS0FBSyxhQUFhLFdBQVcsS0FBSyxRQUFRLFlBQVksVUFBVSxPQUFPLFFBQVE7QUFBQSxFQUNwSjtBQUFBLEVBRUEsYUFBYSxhQUFrRDtBQUM5RCxXQUFPLG9CQUFvQixZQUFZLEtBQUssdUJBQXVCLFlBQVksVUFBVSxRQUFXLEtBQUssYUFBYSxXQUFXLENBQUU7QUFBQSxFQUNwSTtBQUFBLEVBRUEsTUFBYyxrQkFBaUM7QUFDOUMsVUFBTSxLQUFLLGtCQUFrQixrQ0FBa0M7QUFFL0QsU0FBSyxVQUFVLEtBQUssMEJBQTBCLGdCQUFnQixJQUFJLENBQUM7QUFBQSxFQUNwRTtBQUFBLEVBRVEsYUFBYSxhQUFxQztBQUN6RCxVQUFNLGVBQWUsa0NBQWtDLE1BQU0sWUFBWSxNQUFNO0FBQy9FLFFBQUksZ0JBQWdCLGFBQWEsYUFBYSxhQUFhLGNBQWM7QUFDeEUsYUFBTyxjQUFjO0FBQUEsSUFDdEI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBMURNLHVDQUVXLEtBQUs7QUFGaEIseUNBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSRztBQTRETixJQUFNLHNDQUFOLE1BQTBDO0FBQUEsRUFJekMsWUFDb0Msa0JBQ1QseUJBQ3pCO0FBRmtDO0FBR25DLDRCQUF3Qix3QkFBd0IsS0FBSyxpQkFBaUIsS0FBSyxJQUFJLENBQUM7QUFBQSxFQUNqRjtBQUFBLEVBRVEsaUJBQWlCLEtBQW9DO0FBQzVELFVBQU0sVUFBVSxRQUFRLE1BQU0sR0FBRztBQUNqQyxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxXQUFXLEtBQUssaUJBQWlCLHFCQUFxQixRQUFRLFFBQVE7QUFDNUUsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxNQUNOLEtBQUssU0FBUztBQUFBLE1BQ2QsTUFBTSxTQUFTO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQ0Q7QUF6Qk0sb0NBRVcsS0FBSztBQUZoQixzQ0FBTjtBQUFBLEVBS0c7QUFBQSxFQUNBO0FBQUEsR0FORztBQTJCTixNQUFNLGlDQUFpQyxTQUFTLEdBQW9DLG9CQUFvQixTQUFTO0FBQ2pILCtCQUErQixxQkFBcUIsSUFBSSxzQkFBc0IsZUFBZSxZQUFZO0FBQ3pHLCtCQUErQixvQkFBb0IsSUFBSSxxQkFBcUIsZUFBZSxZQUFZO0FBQ3ZHLCtCQUErQix3QkFBd0IsSUFBSSx5QkFBeUIsZUFBZSxZQUFZO0FBQy9HLCtCQUErQixnQ0FBZ0MsSUFBSSxpQ0FBaUMsZUFBZSxZQUFZO0FBQy9ILCtCQUErQiw0QkFBNEIsSUFBSSw2QkFBNkIsZUFBZSxZQUFZO0FBQ3ZILCtCQUErQixzQkFBc0IsSUFBSSx1QkFBdUIsZUFBZSxZQUFZO0FBQzNHLCtCQUErQixvQ0FBb0MsSUFBSSxxQ0FBcUMsZUFBZSxZQUFZO0FBQ3ZJLCtCQUErQix1Q0FBdUMsSUFBSSx3Q0FBd0MsZUFBZSxZQUFZO0FBQzdJLCtCQUErQiw4QkFBOEIsbUJBQW1CLGVBQWUsVUFBVTtBQUV6Ryx1QkFBdUIsU0FBUyxJQUFJLHVCQUF1QixDQUFDO0FBQzVELHVCQUF1QixTQUFTLElBQUksMEJBQTBCLENBQUM7QUFFL0Qsa0JBQWtCLGtCQUFrQixpQkFBaUIsa0JBQWtCLE9BQU87QUFDOUUsa0JBQWtCLDhCQUE4QixpQ0FBaUMsa0JBQWtCLE9BQU87QUFDMUcsa0JBQWtCLHFDQUFxQyxrQ0FBa0Msa0JBQWtCLE9BQU87QUFDbEgsa0JBQWtCLCtCQUErQiw4QkFBOEIsa0JBQWtCLE9BQU87QUFDeEcsa0JBQWtCLHdCQUF3Qiw2QkFBNkIsa0JBQWtCLE9BQU87QUFDaEcsa0JBQWtCLHdCQUF3Qix1QkFBdUIsa0JBQWtCLE9BQU87QUFDMUYsa0JBQWtCLCtCQUErQiw4QkFBOEIsa0JBQWtCLE9BQU87QUFDeEcsa0JBQWtCLDJCQUEyQiwwQkFBMEIsa0JBQWtCLE9BQU87QUFDaEcsa0JBQWtCLGdDQUFnQywrQkFBK0Isa0JBQWtCLE9BQU87QUFDMUcsa0JBQWtCLG1DQUFtQyxrQ0FBa0Msa0JBQWtCLE9BQU87QUFDaEgsa0JBQWtCLHdCQUF3Qix1QkFBdUIsa0JBQWtCLE9BQU87QUFDMUYsa0JBQWtCLHlCQUF5Qix3QkFBd0Isa0JBQWtCLE9BQU87QUFDNUYsa0JBQWtCLHVDQUF1QyxzQ0FBc0Msa0JBQWtCLE9BQU87QUFDeEgsa0JBQWtCLDhCQUE4Qiw2QkFBNkIsa0JBQWtCLE9BQU87QUFFdEcsTUFBTSxVQUEwQixDQUFDO0FBQ2pDLFNBQVMsOEJBQThCLEdBQXVIO0FBQzdKLFNBQVEsT0FBTyxFQUFFLFNBQVMsZUFBZSxPQUFPLEVBQUUsVUFBVTtBQUM3RDtBQUNBLFdBQVcsZ0JBQWdCLHVCQUF1QjtBQUNqRCxRQUFNLFNBQVMsYUFBYTtBQUM1QixNQUFJLFFBQVE7QUFDWCxRQUFJLDhCQUE4QixNQUFNLEdBQUc7QUFDMUMsY0FBUSxVQUFVLGFBQWEsSUFBSSxFQUFFLElBQUk7QUFBQSxJQUMxQyxPQUFPO0FBQ04saUJBQVcsT0FBTyxRQUFRO0FBQ3pCLFlBQUksT0FBTyxlQUFlLEtBQUssUUFBUSxHQUFHLEdBQUc7QUFDNUMsa0JBQVEsR0FBRyxJQUFJLE9BQU8sR0FBRztBQUFBLFFBQzFCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLG1DQUFpRTtBQUFBLEVBQ3RFLGFBQWEsSUFBSSxTQUFTLG9EQUFvRCxvR0FBb0c7QUFBQSxFQUNsTCxTQUFTLENBQUM7QUFBQSxFQUNWLE9BQU87QUFBQSxJQUNOO0FBQUEsTUFDQyxZQUFZO0FBQUEsSUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUQ7QUFBQSxFQUNBLE1BQU0sQ0FBQyxnQkFBZ0I7QUFDeEI7QUFFQSxNQUFNLHdCQUF3QixTQUFTLEdBQTJCLFdBQVcsYUFBYTtBQUMxRixzQkFBc0Isc0JBQXNCO0FBQUEsRUFDM0MsSUFBSTtBQUFBLEVBQ0osT0FBTztBQUFBLEVBQ1AsT0FBTyxJQUFJLFNBQVMsOEJBQThCLFVBQVU7QUFBQSxFQUM1RCxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsSUFDWCxDQUFDLGdCQUFnQixZQUFZLEdBQUc7QUFBQSxNQUMvQixhQUFhLElBQUksU0FBUyxxQ0FBcUMscUNBQXFDO0FBQUEsTUFDcEcsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLFNBQVMsQ0FBQztBQUFBLElBQ1g7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLG1CQUFtQixHQUFHO0FBQUEsTUFDdEMsYUFBYSxJQUFJLFNBQVMsNENBQTRDLHlFQUF5RTtBQUFBLE1BQy9JLE1BQU07QUFBQSxNQUNOLHNCQUFzQjtBQUFBLFFBQ3JCLHFCQUFxQixJQUFJLFNBQVMseUNBQXlDLGlFQUFpRTtBQUFBLFFBQzVJLE1BQU07QUFBQSxRQUNOLE1BQU0sQ0FBQyxRQUFRLFNBQVMsUUFBUTtBQUFBLE1BQ2pDO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWjtBQUFBLE1BQ0EsTUFBTSxDQUFDLGdCQUFnQjtBQUFBLElBQ3hCO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixpQkFBaUIsR0FBRztBQUFBLE1BQ3BDLGFBQWEsSUFBSSxTQUFTLDBDQUEwQyw4Q0FBOEM7QUFBQSxNQUNsSCxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsVUFBVSxXQUFXLHFCQUFxQjtBQUFBLE1BQ2pELGtCQUFrQjtBQUFBLFFBQ2pCLElBQUksU0FBUyxpREFBaUQsdUNBQXVDO0FBQUEsUUFDckcsSUFBSSxTQUFTLGtEQUFrRCx3Q0FBd0M7QUFBQSxRQUN2RyxJQUFJLFNBQVMsOERBQThELGtIQUFrSDtBQUFBLE1BQUM7QUFBQSxNQUMvTCxTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsZ0JBQWdCO0FBQUEsSUFDeEI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLDBCQUEwQixHQUFHO0FBQUEsTUFDN0MsYUFBYSxJQUFJLFNBQVMsbURBQW1ELDJFQUEyRTtBQUFBLE1BQ3hKLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxXQUFXLFNBQVM7QUFBQSxNQUMzQixrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMsMkRBQTJELHlGQUF5RjtBQUFBLFFBQ2pLLElBQUksU0FBUywyREFBMkQsNkdBQTZHO0FBQUEsTUFBQztBQUFBLE1BQ3ZMLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IscUJBQXFCLEdBQUc7QUFBQSxNQUN4QyxhQUFhLElBQUksU0FBUywyQ0FBMkMsNERBQTREO0FBQUEsTUFDakksTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGdCQUFnQjtBQUFBLElBQ3hCO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixpQkFBaUIsR0FBRztBQUFBLE1BQ3BDLGFBQWEsSUFBSSxTQUFTLGlEQUFpRCx1RUFBdUU7QUFBQSxNQUNsSixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsZ0JBQWdCO0FBQUEsSUFDeEI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLHFCQUFxQixHQUFHO0FBQUEsTUFDeEMscUJBQXFCLElBQUksU0FBUyw4Q0FBOEMsMkRBQTJEO0FBQUEsTUFDM0ksTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFNBQVMsT0FBTztBQUFBLE1BQ3ZCLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsZUFBZSxHQUFHO0FBQUEsTUFDbEMsYUFBYSxJQUFJLFNBQVMsd0NBQXdDLHdEQUF3RDtBQUFBLE1BQzFILE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsV0FBVyxHQUFHO0FBQUEsTUFDOUIsYUFBYSxJQUFJLFNBQVMsb0NBQW9DLGdKQUFnSjtBQUFBLE1BQzlNLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsY0FBYyxHQUFHO0FBQUEsTUFDakMsYUFBYSxJQUFJLFNBQVMsdUNBQXVDLHNHQUFzRztBQUFBLE1BQ3ZLLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxVQUFVLFFBQVE7QUFBQSxNQUN6QixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsZ0JBQWdCO0FBQUEsSUFDeEI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLHFCQUFxQixHQUFHO0FBQUEsTUFDeEMsYUFBYSxJQUFJLFNBQVMsOENBQThDLHNEQUFzRDtBQUFBLE1BQzlILE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxnQkFBZ0IsbUJBQW1CLFFBQVEsUUFBUTtBQUFBLE1BQzFELGtCQUFrQjtBQUFBLFFBQ2pCLElBQUksU0FBUyxzQ0FBc0MsZ0RBQWdEO0FBQUEsUUFDbkcsSUFBSSxTQUFTLHlDQUF5QyxnREFBZ0Q7QUFBQSxRQUN0RyxJQUFJLFNBQVMsOEJBQThCLGdCQUFnQjtBQUFBLFFBQzNELElBQUksU0FBUyxnQ0FBZ0MsMkNBQTJDO0FBQUEsTUFDekY7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsYUFBYSxHQUFHO0FBQUEsTUFDaEMsYUFBYSxJQUFJLFNBQVMsc0NBQXNDLHdFQUF3RTtBQUFBLE1BQ3hJLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsbUJBQW1CLEdBQUc7QUFBQSxNQUN0QyxhQUFhLElBQUksU0FBUyw0Q0FBNEMsZ0dBQWdHO0FBQUEsTUFDdEssTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGdCQUFnQjtBQUFBLElBQ3hCO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixnQkFBZ0IsR0FBRztBQUFBLE1BQ25DLGFBQWEsSUFBSSxTQUFTLHlDQUF5Qyx1RUFBdUU7QUFBQSxNQUMxSSxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsUUFBUSxVQUFVO0FBQUEsTUFDekIsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLGtDQUFrQyxrQ0FBa0M7QUFBQSxRQUNqRixJQUFJLFNBQVMsc0NBQXNDLHNDQUFzQztBQUFBLE1BQzFGO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsZ0JBQWdCO0FBQUEsSUFDeEI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLHdCQUF3QixHQUFHO0FBQUEsTUFDM0MsYUFBYSxJQUFJLFNBQVMsaURBQWlELDBFQUEwRTtBQUFBLE1BQ3JKLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBT0EsQ0FBQyxnQkFBZ0IsbUJBQW1CLEdBQUc7QUFBQSxNQUN0QyxhQUFhLElBQUksU0FBUyw0Q0FBNEMsMkRBQTJEO0FBQUEsTUFDakksTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFVBQVUsU0FBUyxXQUFXO0FBQUEsTUFDckMsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLDhCQUE4QiwwQ0FBMEM7QUFBQSxRQUNyRixJQUFJLFNBQVMsNkJBQTZCLDZEQUE2RDtBQUFBLFFBQ3ZHLElBQUksU0FBUyxpQ0FBaUMscURBQXFEO0FBQUEsTUFDcEc7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0Isa0JBQWtCLEdBQUc7QUFBQSxNQUNyQyxhQUFhLElBQUksU0FBUyxvQ0FBb0Msc0ZBQXNGO0FBQUEsTUFDcEosTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGdCQUFnQjtBQUFBLElBQ3hCO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixxQkFBcUIsR0FBRztBQUFBLE1BQ3hDLGFBQWEsSUFBSSxTQUFTLDhDQUE4QywrRUFBK0U7QUFBQSxNQUN2SixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsZ0JBQWdCO0FBQUEsSUFDeEI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLHNCQUFzQixHQUFHO0FBQUEsTUFDekMsYUFBYSxJQUFJLFNBQVMsbUNBQW1DLGlGQUFpRjtBQUFBLE1BQzlJLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxVQUFVLFNBQVMsU0FBUztBQUFBLE1BQ25DLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsbUJBQW1CLEdBQUc7QUFBQSxNQUN0QyxxQkFBcUIsSUFBSSxTQUFTLGdDQUFnQyx5SkFBeUosK0JBQStCO0FBQUEsTUFDMVAsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGtCQUFrQixzQkFBc0I7QUFBQSxNQUMvQyxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0Isc0JBQXNCLEdBQUc7QUFBQSxNQUN6QyxhQUFhLElBQUksU0FBUyx1Q0FBdUMsNEVBQTRFO0FBQUEsTUFDN0ksTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLHNCQUFzQjtBQUFBLElBQzlCO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixxQkFBcUIsR0FBRztBQUFBLE1BQ3hDLGFBQWEsSUFBSSxTQUFTLGtDQUFrQyw0REFBNEQ7QUFBQSxNQUN4SCxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsc0JBQXNCO0FBQUEsSUFDOUI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGNBQWMsR0FBRztBQUFBLE1BQ2pDLHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLDJHQUEyRyxPQUFPLHFCQUFxQjtBQUFBLE1BQ3JNLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0I7QUFBQSxJQUN4QjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0Isa0JBQWtCLEdBQUc7QUFBQSxNQUNyQyxxQkFBcUIsSUFBSSxTQUFTLGdDQUFnQyx3R0FBd0csT0FBTyxVQUFVO0FBQUEsTUFDM0wsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGdCQUFnQjtBQUFBLElBQ3hCO0FBQUEsSUFDQSxDQUFDLGdCQUFnQiwrQkFBK0IsR0FBRztBQUFBLElBQ25ELENBQUMsZ0JBQWdCLGtDQUFrQyxHQUFHO0FBQUEsTUFDckQscUJBQXFCLElBQUksU0FBUyxnREFBZ0QsaUZBQWlGO0FBQUEsTUFDbkssTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFVBQVUsU0FBUyxZQUFZO0FBQUEsTUFDdEMsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGdCQUFnQixHQUFHO0FBQUEsTUFDbkMscUJBQXFCLElBQUksU0FBUyw2QkFBNkIsMFBBQTBQO0FBQUEsTUFDelQsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGtCQUFrQixzQkFBc0I7QUFBQSxJQUNoRDtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsY0FBYyxHQUFHO0FBQUEsTUFDakMscUJBQXFCLElBQUksU0FBUywyQkFBMkIsb0ZBQW9GLHFCQUFxQjtBQUFBLE1BQ3RLLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxrQkFBa0Isc0JBQXNCO0FBQUEsSUFDaEQ7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGdCQUFnQixHQUFHO0FBQUEsTUFDbkMscUJBQXFCLElBQUksU0FBUyw2QkFBNkIsaUdBQWlHLHVCQUF1QjtBQUFBLE1BQ3ZMLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxrQkFBa0Isc0JBQXNCO0FBQUEsSUFDaEQ7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGVBQWUsR0FBRztBQUFBLE1BQ2xDLHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLHNGQUFzRjtBQUFBLE1BQ3BKLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxrQkFBa0Isc0JBQXNCO0FBQUEsTUFDL0MsU0FBUyxPQUFPLFFBQVEsWUFBWSxZQUFZLFFBQVEsWUFBWTtBQUFBO0FBQUEsSUFDckU7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGNBQWMsR0FBRztBQUFBLE1BQ2pDLHFCQUFxQixJQUFJLFNBQVMsMkJBQTJCLG1EQUFtRDtBQUFBLE1BQ2hILE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxrQkFBa0Isc0JBQXNCO0FBQUEsTUFDL0MsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGdCQUFnQixHQUFHO0FBQUEsTUFDbkMsYUFBYSxJQUFJLFNBQVMsNkJBQTZCLGlLQUFpSztBQUFBLE1BQ3hOLE1BQU0sQ0FBQyxVQUFVLE1BQU07QUFBQSxNQUN2QixTQUFTO0FBQUEsTUFDVCxNQUFNLGlCQUFpQjtBQUFBLE1BQ3ZCLGdCQUFnQixpQkFBaUI7QUFBQSxNQUNqQywwQkFBMEIsaUJBQWlCO0FBQUEsSUFDNUM7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLFlBQVksR0FBRztBQUFBLE1BQy9CLHFCQUFxQixJQUFJLFNBQVMseUJBQXlCLDhMQUE4TCxvQkFBb0I7QUFBQSxNQUM3USxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsZ0JBQWdCO0FBQUEsTUFDdkIsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGtCQUFrQixHQUFHO0FBQUEsTUFDckMscUJBQXFCLElBQUksU0FBUywrQkFBK0IsMEZBQTBGO0FBQUEsTUFDM0osTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLGdCQUFnQjtBQUFBLE1BQ3ZCLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixxQkFBcUIsR0FBRztBQUFBLE1BQ3hDLHFCQUFxQixJQUFJLFNBQVMsa0NBQWtDLHVFQUF1RTtBQUFBLE1BQzNJLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGdCQUFnQix3QkFBd0IsR0FBRztBQUFBLE1BQzNDLHFCQUFxQixJQUFJLFNBQVMscUNBQXFDLDZFQUE2RTtBQUFBLE1BQ3BKLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixXQUFXLEdBQUc7QUFBQSxNQUM5QixxQkFBcUIsSUFBSSxTQUFTLHdCQUF3Qix1T0FBdU87QUFBQSxNQUNqUyxNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxjQUFjO0FBQUEsVUFDYixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsUUFDVjtBQUFBLFFBQ0EsZUFBZTtBQUFBLFVBQ2QsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBLFlBQVk7QUFBQSxVQUNYLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxRQUNWO0FBQUEsUUFDQSxZQUFZO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLGVBQWU7QUFBQSxRQUNmLFlBQVk7QUFBQSxRQUNaLFlBQVk7QUFBQSxNQUNiO0FBQUEsTUFDQSxNQUFNLENBQUMsZ0JBQWdCO0FBQUEsSUFDeEI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLFlBQVksR0FBRztBQUFBLE1BQy9CLHFCQUFxQixJQUFJLFNBQVMseUJBQXlCLHFQQUFxUDtBQUFBLE1BQ2hULE1BQU07QUFBQSxNQUNOLFNBQVMsT0FBTyxRQUFRLFlBQVksWUFBWSxRQUFRLFlBQVk7QUFBQTtBQUFBLE1BQ3BFLE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLGtCQUFrQixHQUFHO0FBQUEsTUFDckMscUJBQXFCLElBQUksU0FBUywwREFBMEQsb0VBQW9FLHFDQUFxQztBQUFBLE1BQ3JNLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxZQUFZLGFBQWEsTUFBTTtBQUFBLE1BQ3RDLDBCQUEwQjtBQUFBLFFBQ3pCLElBQUksU0FBUyxtRUFBbUUsdUNBQXVDO0FBQUEsUUFDdkgsSUFBSSxTQUFTLG9FQUFvRSxtREFBbUQ7QUFBQSxRQUNwSSxJQUFJLFNBQVMsK0RBQStELGdCQUFnQjtBQUFBLE1BQzdGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsWUFBWSxHQUFHO0FBQUEsTUFDL0IscUJBQXFCLElBQUksU0FBUyx5QkFBeUIsbUZBQW1GO0FBQUEsTUFDOUksTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLHFCQUFxQixHQUFHO0FBQUEsTUFDeEMscUJBQXFCLElBQUksU0FBUyxzQ0FBc0MseUVBQXlFO0FBQUEsTUFDakosTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLG9CQUFvQixHQUFHO0FBQUEsTUFDdkMscUJBQXFCLElBQUksU0FBUyxxQ0FBcUMsaVFBQWlRO0FBQUEsTUFDeFUsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLE1BQU0sUUFBUSxLQUFLO0FBQUEsTUFDMUIsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLDRCQUE0Qiw4S0FBOEs7QUFBQSxRQUN2TixJQUFJLFNBQVMsOEJBQThCLHNFQUFzRTtBQUFBLFFBQ2pILElBQUksU0FBUyw2QkFBNkIsMkJBQTJCO0FBQUEsTUFDdEU7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixzQkFBc0IsR0FBRztBQUFBLE1BQ3pDLHFCQUFxQixJQUFJLFNBQVMsbUNBQW1DLCtDQUErQztBQUFBLE1BQ3BILE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixxQkFBcUIsR0FBRztBQUFBLE1BQ3hDLHFCQUFxQixJQUFJLFNBQVMsNkJBQTZCLDJJQUEySTtBQUFBLE1BQzFNLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixXQUFXLEdBQUc7QUFBQSxNQUM5QixxQkFBcUIsSUFBSSxTQUFTLGdDQUFnQyxxT0FBcU87QUFBQSxNQUN2UyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsZ0JBQWdCLEdBQUc7QUFBQSxNQUNuQyxxQkFBcUIsSUFBSSxTQUFTLDhCQUE4QixzSUFBc0k7QUFBQSxNQUN0TSxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsZ0JBQWdCO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsib3AiLCAiY2VsbCJdCn0K
