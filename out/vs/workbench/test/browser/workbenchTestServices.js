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
import { mainWindow } from "../../../base/browser/window.js";
import { timeout } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { isValidBasename } from "../../../base/common/extpath.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { observableValue } from "../../../base/common/observable.js";
import { posix, win32 } from "../../../base/common/path.js";
import { isWindows } from "../../../base/common/platform.js";
import { env } from "../../../base/common/process.js";
import { basename, isEqual } from "../../../base/common/resources.js";
import { newWriteableStream } from "../../../base/common/stream.js";
import { assertReturnsDefined, upcast } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { ICodeEditorService } from "../../../editor/browser/services/codeEditorService.js";
import { Position as EditorPosition } from "../../../editor/common/core/position.js";
import { Range } from "../../../editor/common/core/range.js";
import { Selection } from "../../../editor/common/core/selection.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../editor/common/languages/languageConfigurationRegistry.js";
import { DefaultEndOfLine, EndOfLinePreference } from "../../../editor/common/model.js";
import { createTextBufferFactoryFromStream } from "../../../editor/common/model/textModel.js";
import { IEditorWorkerService } from "../../../editor/common/services/editorWorker.js";
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from "../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../editor/common/services/languageFeaturesService.js";
import { LanguageService } from "../../../editor/common/services/languageService.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ModelService } from "../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../editor/common/services/resolverService.js";
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from "../../../editor/common/services/textResourceConfiguration.js";
import { ITreeSitterLibraryService } from "../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { TestCodeEditor } from "../../../editor/test/browser/testCodeEditor.js";
import { TestLanguageConfigurationService } from "../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { TestEditorWorkerService } from "../../../editor/test/common/services/testEditorWorkerService.js";
import { TestTreeSitterLibraryService } from "../../../editor/test/common/services/testTreeSitterLibraryService.js";
import { IAccessibilityService } from "../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IAccessibilitySignalService } from "../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IActionViewItemService, NullActionViewItemService } from "../../../platform/actions/browser/actionViewItemService.js";
import { IMenuService } from "../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IDefaultAccountService } from "../../../platform/defaultAccount/common/defaultAccount.js";
import { ContextMenuService } from "../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService, IContextViewService } from "../../../platform/contextview/browser/contextView.js";
import { ContextViewService } from "../../../platform/contextview/browser/contextViewService.js";
import { IDialogService, IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../platform/dialogs/test/common/testDialogService.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { TargetPlatform } from "../../../platform/extensions/common/extensions.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../platform/files/common/files.js";
import { FileService } from "../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { NullHoverService } from "../../../platform/hover/test/browser/nullHoverService.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { MockContextKeyService, MockKeybindingService } from "../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { IListService } from "../../../platform/list/browser/listService.js";
import { ILoggerService, ILogService, NullLogService } from "../../../platform/log/common/log.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../platform/markdown/browser/markdownRenderer.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../platform/notification/test/common/testNotificationService.js";
import product from "../../../platform/product/common/product.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IProgressService, Progress } from "../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from "../../../platform/remote/common/remoteSocketFactoryService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../platform/telemetry/common/telemetryUtils.js";
import { ITerminalLogService } from "../../../platform/terminal/common/terminal.js";
import { TerminalLogService } from "../../../platform/terminal/common/terminalLogService.js";
import { ColorScheme } from "../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../platform/undoRedo/common/undoRedoService.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../platform/uriIdentity/common/uriIdentityService.js";
import { IUserDataProfilesService, UserDataProfilesService } from "../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../platform/workspace/common/workspaceTrust.js";
import { TestWorkspace } from "../../../platform/workspace/test/common/testWorkspace.js";
import { IWorkspacesService } from "../../../platform/workspaces/common/workspaces.js";
import { EditorPaneDescriptor } from "../../browser/editor.js";
import { Extensions as PaneCompositeExtensions } from "../../browser/panecomposite.js";
import { DEFAULT_EDITOR_PART_OPTIONS } from "../../browser/parts/editor/editor.js";
import { EditorPane } from "../../browser/parts/editor/editorPane.js";
import { MainEditorPart } from "../../browser/parts/editor/editorPart.js";
import { EditorParts } from "../../browser/parts/editor/editorParts.js";
import { SideBySideEditor } from "../../browser/parts/editor/sideBySideEditor.js";
import { TextEditorPaneSelection } from "../../browser/parts/editor/textEditor.js";
import { TextResourceEditor } from "../../browser/parts/editor/textResourceEditor.js";
import { EditorExtensions, EditorInputCapabilities, EditorExtensions as Extensions } from "../../common/editor.js";
import { EditorInput } from "../../common/editor/editorInput.js";
import { SideBySideEditorInput } from "../../common/editor/sideBySideEditorInput.js";
import { TextResourceEditorInput } from "../../common/editor/textResourceEditorInput.js";
import { ViewContainerLocation } from "../../common/views.js";
import { IChatWidgetService } from "../../contrib/chat/browser/chat.js";
import { FileEditorInput } from "../../contrib/files/browser/editors/fileEditorInput.js";
import { TextFileEditor } from "../../contrib/files/browser/editors/textFileEditor.js";
import { FILE_EDITOR_INPUT_ID } from "../../contrib/files/common/files.js";
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService } from "../../contrib/terminal/browser/terminal.js";
import { TerminalConfigurationService } from "../../contrib/terminal/browser/terminalConfigurationService.js";
import { IEnvironmentVariableService } from "../../contrib/terminal/common/environmentVariable.js";
import { EnvironmentVariableService } from "../../contrib/terminal/common/environmentVariableService.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../../contrib/terminal/common/terminal.js";
import { IChatEntitlementService } from "../../services/chat/common/chatEntitlementService.js";
import { IDecorationsService } from "../../services/decorations/common/decorations.js";
import { CodeEditorService } from "../../services/editor/browser/codeEditorService.js";
import { EditorPaneService } from "../../services/editor/browser/editorPaneService.js";
import { EditorResolverService } from "../../services/editor/browser/editorResolverService.js";
import { CustomEditorLabelService, ICustomEditorLabelService } from "../../services/editor/common/customEditorLabelService.js";
import { GroupOrientation, IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEditorPaneService } from "../../services/editor/common/editorPaneService.js";
import { IEditorResolverService } from "../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { BrowserWorkbenchEnvironmentService } from "../../services/environment/browser/environmentService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { EnablementState } from "../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { BrowserElevatedFileService } from "../../services/files/browser/elevatedFileService.js";
import { IElevatedFileService } from "../../services/files/common/elevatedFileService.js";
import { FilesConfigurationService, IFilesConfigurationService } from "../../services/filesConfiguration/common/filesConfigurationService.js";
import { IHistoryService } from "../../services/history/common/history.js";
import { IHostService } from "../../services/host/browser/host.js";
import { LabelService } from "../../services/label/common/labelService.js";
import { ILanguageDetectionService } from "../../services/languageDetection/common/languageDetectionWorkerService.js";
import { IWorkbenchLayoutService, Parts } from "../../services/layout/browser/layoutService.js";
import { ILifecycleService, ShutdownReason } from "../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { IPathService } from "../../services/path/common/pathService.js";
import { QuickInputService } from "../../services/quickinput/browser/quickInputService.js";
import { IRemoteAgentService } from "../../services/remote/common/remoteAgentService.js";
import { BrowserTextFileService } from "../../services/textfile/browser/browserTextFileService.js";
import { EncodingOracle } from "../../services/textfile/browser/textFileService.js";
import { UTF16be, UTF16le, UTF8_with_bom } from "../../services/textfile/common/encoding.js";
import { ITextEditorService, TextEditorService } from "../../services/textfile/common/textEditorService.js";
import { TextFileEditorModel } from "../../services/textfile/common/textFileEditorModel.js";
import { ITextFileService } from "../../services/textfile/common/textfiles.js";
import { TextModelResolverService } from "../../services/textmodelResolver/common/textModelResolverService.js";
import { UntitledTextEditorInput } from "../../services/untitled/common/untitledTextEditorInput.js";
import { IUntitledTextEditorService, UntitledTextEditorService } from "../../services/untitled/common/untitledTextEditorService.js";
import { IUserDataProfileService } from "../../services/userDataProfile/common/userDataProfile.js";
import { UserDataProfileService } from "../../services/userDataProfile/common/userDataProfileService.js";
import { BrowserWorkingCopyBackupService } from "../../services/workingCopy/browser/workingCopyBackupService.js";
import { IWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackup.js";
import { InMemoryWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackupService.js";
import { IWorkingCopyEditorService, WorkingCopyEditorService } from "../../services/workingCopy/common/workingCopyEditorService.js";
import { IWorkingCopyFileService, WorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IWorkingCopyService, WorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { TestChatEntitlementService, TestContextService, TestExtensionService, TestFileService, TestHistoryService, TestLifecycleService, TestLoggerService, TestMarkerService, TestProductService, TestStorageService, TestTextResourcePropertiesService, TestWorkspaceTrustManagementService, TestWorkspaceTrustRequestService } from "../common/workbenchTestServices.js";
import { DefaultAccountService } from "../../services/accounts/browser/defaultAccount.js";
function createFileEditorInput(instantiationService, resource) {
  return instantiationService.createInstance(FileEditorInput, resource, void 0, void 0, void 0, void 0, void 0, void 0);
}
Registry.as(EditorExtensions.EditorFactory).registerFileEditorFactory({
  typeId: FILE_EDITOR_INPUT_ID,
  createFileEditor: (resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService) => {
    return instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents);
  },
  isFileEditor: (obj) => {
    return obj instanceof FileEditorInput;
  }
});
class TestTextResourceEditor extends TextResourceEditor {
  createEditorControl(parent, configuration) {
    this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, {}));
  }
}
class TestTextFileEditor extends TextFileEditor {
  createEditorControl(parent, configuration) {
    this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, { contributions: [] }));
  }
  setSelection(selection, reason) {
    this._options = selection ? upcast({ selection }) : void 0;
    this._onDidChangeSelection.fire({ reason });
  }
  getSelection() {
    const options = this.options;
    if (!options) {
      return void 0;
    }
    const textSelection = options.selection;
    if (!textSelection) {
      return void 0;
    }
    return new TextEditorPaneSelection(new Selection(textSelection.startLineNumber, textSelection.startColumn, textSelection.endLineNumber ?? textSelection.startLineNumber, textSelection.endColumn ?? textSelection.startColumn));
  }
}
class TestWorkingCopyService extends WorkingCopyService {
  testUnregisterWorkingCopy(workingCopy) {
    return super.unregisterWorkingCopy(workingCopy);
  }
}
function workbenchInstantiationService(overrides, disposables = new DisposableStore()) {
  const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
    [ILifecycleService, disposables.add(new TestLifecycleService())],
    [IActionViewItemService, new SyncDescriptor(NullActionViewItemService)]
  )));
  instantiationService.stub(IProductService, TestProductService);
  instantiationService.stub(IEditorWorkerService, new TestEditorWorkerService());
  instantiationService.stub(IWorkingCopyService, disposables.add(new TestWorkingCopyService()));
  const environmentService = overrides?.environmentService ? overrides.environmentService(instantiationService) : TestEnvironmentService;
  instantiationService.stub(IEnvironmentService, environmentService);
  instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
  instantiationService.stub(ILogService, new NullLogService());
  const contextKeyService = overrides?.contextKeyService ? overrides.contextKeyService(instantiationService) : instantiationService.createInstance(MockContextKeyService);
  instantiationService.stub(IContextKeyService, contextKeyService);
  instantiationService.stub(IProgressService, new TestProgressService());
  const workspaceContextService = new TestContextService(TestWorkspace);
  instantiationService.stub(IWorkspaceContextService, workspaceContextService);
  const configService = overrides?.configurationService ? overrides.configurationService(instantiationService) : new TestConfigurationService({
    files: {
      participants: {
        timeout: 6e4
      }
    }
  });
  instantiationService.stub(IConfigurationService, configService);
  const textResourceConfigurationService = new TestTextResourceConfigurationService(configService);
  instantiationService.stub(ITextResourceConfigurationService, textResourceConfigurationService);
  instantiationService.stub(IUntitledTextEditorService, disposables.add(instantiationService.createInstance(UntitledTextEditorService)));
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IRemoteAgentService, new TestRemoteAgentService());
  instantiationService.stub(ILanguageDetectionService, new TestLanguageDetectionService());
  instantiationService.stub(IPathService, overrides?.pathService ? overrides.pathService(instantiationService) : new TestPathService());
  const layoutService = new TestLayoutService();
  instantiationService.stub(IWorkbenchLayoutService, layoutService);
  instantiationService.stub(IDialogService, new TestDialogService());
  const accessibilityService = new TestAccessibilityService();
  instantiationService.stub(IAccessibilityService, accessibilityService);
  instantiationService.stub(IAccessibilitySignalService, {
    playSignal: async () => {
    },
    isSoundEnabled(signal) {
      return false;
    }
  });
  instantiationService.stub(IFileDialogService, instantiationService.createInstance(TestFileDialogService));
  instantiationService.stub(ILanguageService, disposables.add(instantiationService.createInstance(LanguageService)));
  instantiationService.stub(ILanguageFeaturesService, new LanguageFeaturesService());
  instantiationService.stub(ILanguageFeatureDebounceService, instantiationService.createInstance(LanguageFeatureDebounceService));
  instantiationService.stub(IHistoryService, new TestHistoryService());
  instantiationService.stub(ITextResourcePropertiesService, new TestTextResourcePropertiesService(configService));
  instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
  const themeService = new TestThemeService();
  instantiationService.stub(IThemeService, themeService);
  instantiationService.stub(ILanguageConfigurationService, disposables.add(new TestLanguageConfigurationService()));
  instantiationService.stub(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
  instantiationService.stub(IModelService, disposables.add(instantiationService.createInstance(ModelService)));
  const fileService = overrides?.fileService ? overrides.fileService(instantiationService) : disposables.add(new TestFileService());
  instantiationService.stub(IFileService, fileService);
  instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
  const markerService = new TestMarkerService();
  instantiationService.stub(IMarkerService, markerService);
  instantiationService.stub(IFilesConfigurationService, disposables.add(instantiationService.createInstance(TestFilesConfigurationService)));
  const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(instantiationService.createInstance(UserDataProfilesService)));
  instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));
  instantiationService.stub(IWorkingCopyBackupService, overrides?.workingCopyBackupService ? overrides?.workingCopyBackupService(instantiationService) : disposables.add(new TestWorkingCopyBackupService()));
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  instantiationService.stub(INotificationService, new TestNotificationService());
  instantiationService.stub(IUntitledTextEditorService, disposables.add(instantiationService.createInstance(UntitledTextEditorService)));
  instantiationService.stub(IMenuService, new TestMenuService());
  const keybindingService = new MockKeybindingService();
  instantiationService.stub(IKeybindingService, keybindingService);
  instantiationService.stub(IDecorationsService, new TestDecorationsService());
  instantiationService.stub(IExtensionService, new TestExtensionService());
  instantiationService.stub(IWorkingCopyFileService, disposables.add(instantiationService.createInstance(WorkingCopyFileService)));
  instantiationService.stub(ITextFileService, overrides?.textFileService ? overrides.textFileService(instantiationService) : disposables.add(instantiationService.createInstance(TestTextFileService)));
  instantiationService.stub(IHostService, instantiationService.createInstance(TestHostService));
  instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
  instantiationService.stub(ILoggerService, disposables.add(new TestLoggerService(TestEnvironmentService.logsHome)));
  const editorGroupService = new TestEditorGroupsService([new TestEditorGroupView(0)]);
  instantiationService.stub(IEditorGroupsService, editorGroupService);
  instantiationService.stub(ILabelService, disposables.add(instantiationService.createInstance(LabelService)));
  const editorService = overrides?.editorService ? overrides.editorService(instantiationService) : disposables.add(new TestEditorService(editorGroupService));
  instantiationService.stub(IEditorService, editorService);
  instantiationService.stub(IEditorPaneService, new EditorPaneService());
  instantiationService.stub(IWorkingCopyEditorService, disposables.add(instantiationService.createInstance(WorkingCopyEditorService)));
  instantiationService.stub(IEditorResolverService, disposables.add(instantiationService.createInstance(EditorResolverService)));
  const textEditorService = overrides?.textEditorService ? overrides.textEditorService(instantiationService) : disposables.add(instantiationService.createInstance(TextEditorService));
  instantiationService.stub(ITextEditorService, textEditorService);
  instantiationService.stub(ICodeEditorService, disposables.add(new CodeEditorService(editorService, themeService, configService)));
  instantiationService.stub(IPaneCompositePartService, disposables.add(new TestPaneCompositeService()));
  instantiationService.stub(IListService, new TestListService());
  instantiationService.stub(IContextViewService, disposables.add(instantiationService.createInstance(ContextViewService)));
  instantiationService.stub(IContextMenuService, disposables.add(instantiationService.createInstance(ContextMenuService)));
  instantiationService.stub(IQuickInputService, disposables.add(new QuickInputService(configService, instantiationService, keybindingService, contextKeyService, themeService, layoutService)));
  instantiationService.stub(IWorkspacesService, new TestWorkspacesService());
  instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
  instantiationService.stub(IWorkspaceTrustRequestService, disposables.add(new TestWorkspaceTrustRequestService(false)));
  instantiationService.stub(ITerminalInstanceService, new TestTerminalInstanceService());
  instantiationService.stub(ITerminalEditorService, new TestTerminalEditorService());
  instantiationService.stub(ITerminalGroupService, new TestTerminalGroupService());
  instantiationService.stub(ITerminalProfileService, new TestTerminalProfileService());
  instantiationService.stub(ITerminalProfileResolverService, new TestTerminalProfileResolverService());
  instantiationService.stub(ITerminalConfigurationService, disposables.add(instantiationService.createInstance(TestTerminalConfigurationService)));
  instantiationService.stub(ITerminalLogService, disposables.add(instantiationService.createInstance(TerminalLogService)));
  instantiationService.stub(IEnvironmentVariableService, disposables.add(instantiationService.createInstance(EnvironmentVariableService)));
  instantiationService.stub(IElevatedFileService, new BrowserElevatedFileService());
  instantiationService.stub(IRemoteSocketFactoryService, new RemoteSocketFactoryService());
  instantiationService.stub(ICustomEditorLabelService, disposables.add(new CustomEditorLabelService(configService, workspaceContextService)));
  instantiationService.stub(IHoverService, NullHoverService);
  instantiationService.stub(IChatEntitlementService, new TestChatEntitlementService());
  instantiationService.stub(IMarkdownRendererService, instantiationService.createInstance(MarkdownRendererService));
  instantiationService.stub(IChatWidgetService, instantiationService.createInstance(TestChatWidgetService));
  instantiationService.stub(IDefaultAccountService, DefaultAccountService);
  return instantiationService;
}
let TestServiceAccessor = class {
  constructor(lifecycleService, textFileService, textEditorService, workingCopyFileService, filesConfigurationService, contextService, modelService, fileService, fileDialogService, dialogService, workingCopyService, editorService, editorPaneService, environmentService, pathService, editorGroupService, editorResolverService, languageService, textModelResolverService, untitledTextEditorService, testConfigurationService, workingCopyBackupService, hostService, quickInputService, labelService, logService, uriIdentityService, instantitionService, notificationService, workingCopyEditorService, instantiationService, elevatedFileService, workspaceTrustRequestService, decorationsService, progressService) {
    this.lifecycleService = lifecycleService;
    this.textFileService = textFileService;
    this.textEditorService = textEditorService;
    this.workingCopyFileService = workingCopyFileService;
    this.filesConfigurationService = filesConfigurationService;
    this.contextService = contextService;
    this.modelService = modelService;
    this.fileService = fileService;
    this.fileDialogService = fileDialogService;
    this.dialogService = dialogService;
    this.workingCopyService = workingCopyService;
    this.editorService = editorService;
    this.editorPaneService = editorPaneService;
    this.environmentService = environmentService;
    this.pathService = pathService;
    this.editorGroupService = editorGroupService;
    this.editorResolverService = editorResolverService;
    this.languageService = languageService;
    this.textModelResolverService = textModelResolverService;
    this.untitledTextEditorService = untitledTextEditorService;
    this.testConfigurationService = testConfigurationService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.hostService = hostService;
    this.quickInputService = quickInputService;
    this.labelService = labelService;
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this.instantitionService = instantitionService;
    this.notificationService = notificationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.instantiationService = instantiationService;
    this.elevatedFileService = elevatedFileService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.decorationsService = decorationsService;
    this.progressService = progressService;
  }
};
TestServiceAccessor = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, ITextEditorService),
  __decorateParam(3, IWorkingCopyFileService),
  __decorateParam(4, IFilesConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IModelService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IFileDialogService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, IWorkingCopyService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IEditorPaneService),
  __decorateParam(13, IWorkbenchEnvironmentService),
  __decorateParam(14, IPathService),
  __decorateParam(15, IEditorGroupsService),
  __decorateParam(16, IEditorResolverService),
  __decorateParam(17, ILanguageService),
  __decorateParam(18, ITextModelService),
  __decorateParam(19, IUntitledTextEditorService),
  __decorateParam(20, IConfigurationService),
  __decorateParam(21, IWorkingCopyBackupService),
  __decorateParam(22, IHostService),
  __decorateParam(23, IQuickInputService),
  __decorateParam(24, ILabelService),
  __decorateParam(25, ILogService),
  __decorateParam(26, IUriIdentityService),
  __decorateParam(27, IInstantiationService),
  __decorateParam(28, INotificationService),
  __decorateParam(29, IWorkingCopyEditorService),
  __decorateParam(30, IInstantiationService),
  __decorateParam(31, IElevatedFileService),
  __decorateParam(32, IWorkspaceTrustRequestService),
  __decorateParam(33, IDecorationsService),
  __decorateParam(34, IProgressService)
], TestServiceAccessor);
let TestTextFileService = class extends BrowserTextFileService {
  constructor(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, logService, elevatedFileService, decorationsService) {
    super(
      fileService,
      untitledTextEditorService,
      lifecycleService,
      instantiationService,
      modelService,
      environmentService,
      dialogService,
      fileDialogService,
      textResourceConfigurationService,
      filesConfigurationService,
      codeEditorService,
      pathService,
      workingCopyFileService,
      uriIdentityService,
      languageService,
      elevatedFileService,
      logService,
      decorationsService
    );
    this.readStreamError = void 0;
    this.writeError = void 0;
  }
  setReadStreamErrorOnce(error) {
    this.readStreamError = error;
  }
  async readStream(resource, options) {
    if (this.readStreamError) {
      const error = this.readStreamError;
      this.readStreamError = void 0;
      throw error;
    }
    const content = await this.fileService.readFileStream(resource, options);
    return {
      resource: content.resource,
      name: content.name,
      mtime: content.mtime,
      ctime: content.ctime,
      etag: content.etag,
      encoding: "utf8",
      value: await createTextBufferFactoryFromStream(content.value),
      size: 10,
      readonly: false,
      locked: false,
      executable: false
    };
  }
  setWriteErrorOnce(error) {
    this.writeError = error;
  }
  async write(resource, value, options) {
    if (this.writeError) {
      const error = this.writeError;
      this.writeError = void 0;
      throw error;
    }
    return super.write(resource, value, options);
  }
};
TestTextFileService = __decorateClass([
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
], TestTextFileService);
class TestBrowserTextFileServiceWithEncodingOverrides extends BrowserTextFileService {
  get encoding() {
    if (!this._testEncoding) {
      this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
    }
    return this._testEncoding;
  }
}
class TestEncodingOracle extends EncodingOracle {
  get encodingOverrides() {
    return [
      { extension: "utf16le", encoding: UTF16le },
      { extension: "utf16be", encoding: UTF16be },
      { extension: "utf8bom", encoding: UTF8_with_bom }
    ];
  }
  set encodingOverrides(overrides) {
  }
}
class TestEnvironmentServiceWithArgs extends BrowserWorkbenchEnvironmentService {
  constructor() {
    super(...arguments);
    this.args = [];
  }
}
const TestEnvironmentService = new TestEnvironmentServiceWithArgs("", URI.file("tests").with({ scheme: "vscode-tests" }), /* @__PURE__ */ Object.create(null), TestProductService);
class TestProgressService {
  withProgress(options, task, onDidCancel) {
    return task(Progress.None);
  }
}
class TestDecorationsService {
  constructor() {
    this.onDidChangeDecorations = Event.None;
  }
  registerDecorationsProvider(_provider) {
    return Disposable.None;
  }
  getDecoration(_uri, _includeChildren, _overwrite) {
    return void 0;
  }
}
class TestMenuService {
  createMenu(_id, _scopedKeybindingService) {
    return {
      onDidChange: Event.None,
      dispose: () => void 0,
      getActions: () => []
    };
  }
  getMenuActions(id, contextKeyService, options) {
    return [];
  }
  getMenuContexts(id) {
    return /* @__PURE__ */ new Set();
  }
  resetHiddenStates() {
  }
}
let TestFileDialogService = class {
  constructor(pathService) {
    this.pathService = pathService;
  }
  async defaultFilePath(_schemeFilter) {
    return this.pathService.userHome();
  }
  async defaultFolderPath(_schemeFilter) {
    return this.pathService.userHome();
  }
  async defaultWorkspacePath(_schemeFilter) {
    return this.pathService.userHome();
  }
  async preferredHome(_schemeFilter) {
    return this.pathService.userHome();
  }
  pickFileFolderAndOpen(_options) {
    return Promise.resolve(0);
  }
  pickFileAndOpen(_options) {
    return Promise.resolve(0);
  }
  pickFolderAndOpen(_options) {
    return Promise.resolve(0);
  }
  pickWorkspaceAndOpen(_options) {
    return Promise.resolve(0);
  }
  setPickFileToSave(path) {
    this.fileToSave = path;
  }
  pickFileToSave(defaultUri, availableFileSystems) {
    return Promise.resolve(this.fileToSave);
  }
  showSaveDialog(_options) {
    return Promise.resolve(void 0);
  }
  showOpenDialog(_options) {
    return Promise.resolve(void 0);
  }
  setConfirmResult(result) {
    this.confirmResult = result;
  }
  showSaveConfirm(fileNamesOrResources) {
    return Promise.resolve(this.confirmResult);
  }
};
TestFileDialogService = __decorateClass([
  __decorateParam(0, IPathService)
], TestFileDialogService);
class TestLayoutService {
  constructor() {
    this.openedDefaultEditors = false;
    this.mainContainerDimension = { width: 800, height: 600 };
    this.activeContainerDimension = { width: 800, height: 600 };
    this.mainContainerOffset = { top: 0, quickPickTop: 0 };
    this.activeContainerOffset = { top: 0, quickPickTop: 0 };
    this.mainContainer = mainWindow.document.body;
    this.containers = [mainWindow.document.body];
    this.activeContainer = mainWindow.document.body;
    this.onDidChangeZenMode = Event.None;
    this.onDidChangeMainEditorCenteredLayout = Event.None;
    this.onDidChangeWindowMaximized = Event.None;
    this.onDidChangePanelPosition = Event.None;
    this.onDidChangePanelAlignment = Event.None;
    this.onDidChangePartVisibility = Event.None;
    this.onDidLayoutMainContainer = Event.None;
    this.onDidLayoutActiveContainer = Event.None;
    this.onDidLayoutContainer = Event.None;
    this.onDidChangeNotificationsVisibility = Event.None;
    this.onDidAddContainer = Event.None;
    this.onDidChangeActiveContainer = Event.None;
    this.onDidChangeAuxiliaryBarMaximized = Event.None;
    this.whenReady = Promise.resolve(void 0);
    this.whenRestored = Promise.resolve(void 0);
  }
  layout() {
  }
  isRestored() {
    return true;
  }
  hasFocus(_part) {
    return false;
  }
  isFloatingPanelsEnabled() {
    return false;
  }
  focusPart(_part) {
  }
  hasMainWindowBorder() {
    return false;
  }
  getMainWindowBorderRadius() {
    return void 0;
  }
  isVisible(_part) {
    return true;
  }
  getContainer() {
    return mainWindow.document.body;
  }
  whenContainerStylesLoaded() {
    return void 0;
  }
  isTitleBarHidden() {
    return false;
  }
  isStatusBarHidden() {
    return false;
  }
  isActivityBarHidden() {
    return false;
  }
  setActivityBarHidden(_hidden) {
  }
  setBannerHidden(_hidden) {
  }
  isSideBarHidden() {
    return false;
  }
  async setEditorHidden(_hidden) {
  }
  async setSideBarHidden(_hidden) {
  }
  async setAuxiliaryBarHidden(_hidden) {
  }
  async setPartHidden(_hidden, part) {
  }
  isSecondarySideBarVisible() {
    return false;
  }
  toggleSecondarySideBar() {
  }
  isPanelHidden() {
    return false;
  }
  async setPanelHidden(_hidden) {
  }
  toggleMaximizedPanel() {
  }
  isPanelMaximized() {
    return false;
  }
  toggleMaximizedAuxiliaryBar() {
  }
  setAuxiliaryBarMaximized(maximized) {
    return false;
  }
  isAuxiliaryBarMaximized() {
    return false;
  }
  getMenubarVisibility() {
    throw new Error("not implemented");
  }
  toggleMenuBar() {
  }
  getSideBarPosition() {
    return 0;
  }
  getPanelPosition() {
    return 0;
  }
  getPanelAlignment() {
    return "center";
  }
  async setPanelPosition(_position) {
  }
  async setPanelAlignment(_alignment) {
  }
  addClass(_clazz) {
  }
  removeClass(_clazz) {
  }
  getMaximumEditorDimensions() {
    throw new Error("not implemented");
  }
  toggleZenMode() {
  }
  isMainEditorLayoutCentered() {
    return false;
  }
  centerMainEditorLayout(_active) {
  }
  resizePart(_part, _sizeChangeWidth, _sizeChangeHeight) {
  }
  getSize(part) {
    throw new Error("Method not implemented.");
  }
  setSize(part, size) {
    throw new Error("Method not implemented.");
  }
  registerPart(part) {
    return Disposable.None;
  }
  isWindowMaximized(targetWindow) {
    return false;
  }
  updateWindowMaximizedState(targetWindow, maximized) {
  }
  getVisibleNeighborPart(part, direction) {
    return void 0;
  }
  focus() {
  }
}
const activeViewlet = {};
class TestPaneCompositeService extends Disposable {
  constructor() {
    super();
    this.parts = /* @__PURE__ */ new Map();
    this.parts.set(ViewContainerLocation.Panel, new TestPanelPart());
    this.parts.set(ViewContainerLocation.Sidebar, new TestSideBarPart());
    this.onDidPaneCompositeOpen = Event.any(...[ViewContainerLocation.Panel, ViewContainerLocation.Sidebar].map((loc) => Event.map(this.parts.get(loc).onDidPaneCompositeOpen, (composite) => {
      return { composite, viewContainerLocation: loc };
    })));
    this.onDidPaneCompositeClose = Event.any(...[ViewContainerLocation.Panel, ViewContainerLocation.Sidebar].map((loc) => Event.map(this.parts.get(loc).onDidPaneCompositeClose, (composite) => {
      return { composite, viewContainerLocation: loc };
    })));
  }
  getPartId(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).partId;
  }
  getRegistryId(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).registryId;
  }
  openPaneComposite(id, viewContainerLocation, focus) {
    return this.getPartByLocation(viewContainerLocation).openPaneComposite(id, focus);
  }
  getActivePaneComposite(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getActivePaneComposite();
  }
  getPaneComposite(id, viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getPaneComposite(id);
  }
  getPaneComposites(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getPaneComposites();
  }
  getProgressIndicator(id, viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getProgressIndicator(id);
  }
  hideActivePaneComposite(viewContainerLocation) {
    this.getPartByLocation(viewContainerLocation).hideActivePaneComposite();
  }
  getLastActivePaneCompositeId(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getLastActivePaneCompositeId();
  }
  getPinnedPaneCompositeIds(viewContainerLocation) {
    throw new Error("Method not implemented.");
  }
  getVisiblePaneCompositeIds(viewContainerLocation) {
    throw new Error("Method not implemented.");
  }
  getPaneCompositeIds(viewContainerLocation) {
    throw new Error("Method not implemented.");
  }
  getPartByLocation(viewContainerLocation) {
    return assertReturnsDefined(this.parts.get(viewContainerLocation));
  }
}
class TestSideBarPart {
  constructor() {
    this.onDidViewletRegisterEmitter = new Emitter();
    this.onDidViewletDeregisterEmitter = new Emitter();
    this.onDidViewletOpenEmitter = new Emitter();
    this.onDidViewletCloseEmitter = new Emitter();
    this.partId = Parts.SIDEBAR_PART;
    this.registryId = PaneCompositeExtensions.Viewlets;
    this.element = void 0;
    this.minimumWidth = 0;
    this.maximumWidth = 0;
    this.minimumHeight = 0;
    this.maximumHeight = 0;
    this.onDidChange = Event.None;
    this.onDidPaneCompositeOpen = this.onDidViewletOpenEmitter.event;
    this.onDidPaneCompositeClose = this.onDidViewletCloseEmitter.event;
  }
  openPaneComposite(id, focus) {
    return Promise.resolve(void 0);
  }
  getPaneComposites() {
    return [];
  }
  getAllViewlets() {
    return [];
  }
  getActivePaneComposite() {
    return activeViewlet;
  }
  getDefaultViewletId() {
    return "workbench.view.explorer";
  }
  getPaneComposite(id) {
    return void 0;
  }
  getProgressIndicator(id) {
    return void 0;
  }
  hideActivePaneComposite() {
  }
  getLastActivePaneCompositeId() {
    return void 0;
  }
  dispose() {
  }
  getPinnedPaneCompositeIds() {
    return [];
  }
  getVisiblePaneCompositeIds() {
    return [];
  }
  getPaneCompositeIds() {
    return [];
  }
  layout(width, height, top, left) {
  }
}
class TestPanelPart {
  constructor() {
    this.element = void 0;
    this.minimumWidth = 0;
    this.maximumWidth = 0;
    this.minimumHeight = 0;
    this.maximumHeight = 0;
    this.onDidChange = Event.None;
    this.onDidPaneCompositeOpen = new Emitter().event;
    this.onDidPaneCompositeClose = new Emitter().event;
    this.partId = Parts.AUXILIARYBAR_PART;
    this.registryId = PaneCompositeExtensions.Auxiliary;
  }
  async openPaneComposite(id, focus) {
    return void 0;
  }
  getPaneComposite(id) {
    return activeViewlet;
  }
  getPaneComposites() {
    return [];
  }
  getPinnedPaneCompositeIds() {
    return [];
  }
  getVisiblePaneCompositeIds() {
    return [];
  }
  getPaneCompositeIds() {
    return [];
  }
  getActivePaneComposite() {
    return activeViewlet;
  }
  setPanelEnablement(id, enabled) {
  }
  dispose() {
  }
  getProgressIndicator(id) {
    return null;
  }
  hideActivePaneComposite() {
  }
  getLastActivePaneCompositeId() {
    return void 0;
  }
  layout(width, height, top, left) {
  }
}
class TestViewsService {
  constructor() {
    this.onDidChangeViewContainerVisibility = new Emitter().event;
    this.onDidChangeViewVisibilityEmitter = new Emitter();
    this.onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;
    this.onDidChangeFocusedViewEmitter = new Emitter();
    this.onDidChangeFocusedView = this.onDidChangeFocusedViewEmitter.event;
  }
  isViewContainerVisible(id) {
    return true;
  }
  isViewContainerActive(id) {
    return true;
  }
  getVisibleViewContainer() {
    return null;
  }
  openViewContainer(id, focus) {
    return Promise.resolve(null);
  }
  closeViewContainer(id) {
  }
  isViewVisible(id) {
    return true;
  }
  getActiveViewWithId(id) {
    return null;
  }
  getViewWithId(id) {
    return null;
  }
  openView(id, focus) {
    return Promise.resolve(null);
  }
  closeView(id) {
  }
  getViewProgressIndicator(id) {
    return null;
  }
  getActiveViewPaneContainerWithId(id) {
    return null;
  }
  getFocusedViewName() {
    return "";
  }
  getFocusedView() {
    return null;
  }
}
class TestEditorGroupsService {
  constructor(groups = []) {
    this.groups = groups;
    this.parts = [this];
    this.windowId = mainWindow.vscodeWindowId;
    this.onDidCreateAuxiliaryEditorPart = Event.None;
    this.onDidChangeActiveGroup = Event.None;
    this.onDidActivateGroup = Event.None;
    this.onDidAddGroup = Event.None;
    this.onDidRemoveGroup = Event.None;
    this.onDidMoveGroup = Event.None;
    this.onDidChangeGroupIndex = Event.None;
    this.onDidChangeGroupLabel = Event.None;
    this.onDidChangeGroupLocked = Event.None;
    this.onDidChangeGroupMaximized = Event.None;
    this.onDidLayout = Event.None;
    this.onDidChangeEditorPartOptions = Event.None;
    this.onDidScroll = Event.None;
    this.onWillDispose = Event.None;
    this.orientation = GroupOrientation.HORIZONTAL;
    this.isReady = true;
    this.whenReady = Promise.resolve(void 0);
    this.whenRestored = Promise.resolve(void 0);
    this.hasRestorableState = false;
    this.contentDimension = { width: 800, height: 600 };
    this.mainPart = this;
    this.activeModalEditorPart = void 0;
  }
  get activeGroup() {
    return this.groups[0];
  }
  get sideGroup() {
    return this.groups[0];
  }
  get count() {
    return this.groups.length;
  }
  getPart(group) {
    return this;
  }
  saveWorkingSet(name) {
    throw new Error("Method not implemented.");
  }
  getWorkingSets() {
    throw new Error("Method not implemented.");
  }
  applyWorkingSet(workingSet, options) {
    throw new Error("Method not implemented.");
  }
  deleteWorkingSet(workingSet) {
    throw new Error("Method not implemented.");
  }
  getGroups(_order) {
    return this.groups;
  }
  getGroup(identifier) {
    return this.groups.find((group) => group.id === identifier);
  }
  getLabel(_identifier) {
    return "Group 1";
  }
  findGroup(_scope, _source, _wrap) {
    throw new Error("not implemented");
  }
  activateGroup(_group) {
    throw new Error("not implemented");
  }
  restoreGroup(_group) {
    throw new Error("not implemented");
  }
  getSize(_group) {
    return { width: 100, height: 100 };
  }
  setSize(_group, _size) {
  }
  arrangeGroups(_arrangement) {
  }
  toggleMaximizeGroup() {
  }
  hasMaximizedGroup() {
    throw new Error("not implemented");
  }
  toggleExpandGroup() {
  }
  applyLayout(_layout) {
  }
  getLayout() {
    throw new Error("not implemented");
  }
  setGroupOrientation(_orientation) {
  }
  addGroup(_location, _direction) {
    throw new Error("not implemented");
  }
  removeGroup(_group) {
  }
  moveGroup(_group, _location, _direction) {
    throw new Error("not implemented");
  }
  mergeGroup(_group, _target, _options) {
    throw new Error("not implemented");
  }
  mergeAllGroups(_group, _options) {
    throw new Error("not implemented");
  }
  copyGroup(_group, _location, _direction) {
    throw new Error("not implemented");
  }
  centerLayout(active) {
  }
  isLayoutCentered() {
    return false;
  }
  createEditorDropTarget(container, delegate) {
    return Disposable.None;
  }
  registerContextKeyProvider(_provider) {
    throw new Error("not implemented");
  }
  getScopedInstantiationService(part) {
    throw new Error("Method not implemented.");
  }
  enforcePartOptions(options) {
    return Disposable.None;
  }
  registerEditorPart(part) {
    return Disposable.None;
  }
  createAuxiliaryEditorPart() {
    throw new Error("Method not implemented.");
  }
  createModalEditorPart() {
    throw new Error("Method not implemented.");
  }
}
class TestEditorGroupView {
  constructor(id) {
    this.id = id;
    this.windowId = mainWindow.vscodeWindowId;
    this.groupsView = void 0;
    this.selectedEditors = [];
    this.editors = [];
    this.whenRestored = Promise.resolve(void 0);
    this.isEmpty = true;
    this.onWillDispose = Event.None;
    this.onDidModelChange = Event.None;
    this.onWillCloseEditor = Event.None;
    this.onDidCloseEditor = Event.None;
    this.onDidOpenEditorFail = Event.None;
    this.onDidFocus = Event.None;
    this.onDidChange = Event.None;
    this.onWillMoveEditor = Event.None;
    this.onWillOpenEditor = Event.None;
    this.onDidActiveEditorChange = Event.None;
  }
  getEditors(_order) {
    return [];
  }
  findEditors(_resource) {
    return [];
  }
  getEditorByIndex(_index) {
    throw new Error("not implemented");
  }
  getIndexOfEditor(_editor) {
    return -1;
  }
  isFirst(editor) {
    return false;
  }
  isLast(editor) {
    return false;
  }
  openEditor(_editor, _options) {
    throw new Error("not implemented");
  }
  openEditors(_editors) {
    throw new Error("not implemented");
  }
  isPinned(_editor) {
    return false;
  }
  isSticky(_editor) {
    return false;
  }
  isTransient(_editor) {
    return false;
  }
  isActive(_editor) {
    return false;
  }
  setSelection(_activeSelectedEditor, _inactiveSelectedEditors) {
    throw new Error("not implemented");
  }
  isSelected(_editor) {
    return false;
  }
  contains(candidate) {
    return false;
  }
  moveEditor(_editor, _target, _options) {
    return true;
  }
  moveEditors(_editors, _target) {
    return true;
  }
  copyEditor(_editor, _target, _options) {
  }
  copyEditors(_editors, _target) {
  }
  async closeEditor(_editor, options) {
    return true;
  }
  async closeEditors(_editors, options) {
    return true;
  }
  closeAllEditors(options) {
    return true;
  }
  async replaceEditors(_editors) {
  }
  pinEditor(_editor) {
  }
  stickEditor(editor) {
  }
  unstickEditor(editor) {
  }
  lock(locked) {
  }
  focus() {
  }
  get scopedContextKeyService() {
    throw new Error("not implemented");
  }
  setActive(_isActive) {
  }
  notifyIndexChanged(_index) {
  }
  notifyLabelChanged(_label) {
  }
  dispose() {
  }
  toJSON() {
    return /* @__PURE__ */ Object.create(null);
  }
  layout(_width, _height) {
  }
  relayout() {
  }
  createEditorActions(_menuDisposable) {
    throw new Error("not implemented");
  }
}
class TestEditorGroupAccessor {
  constructor() {
    this.label = "";
    this.windowId = mainWindow.vscodeWindowId;
    this.groups = [];
    this.partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS };
    this.onDidChangeEditorPartOptions = Event.None;
    this.onDidVisibilityChange = Event.None;
  }
  getGroup(identifier) {
    throw new Error("Method not implemented.");
  }
  getGroups(order) {
    throw new Error("Method not implemented.");
  }
  activateGroup(identifier) {
    throw new Error("Method not implemented.");
  }
  restoreGroup(identifier) {
    throw new Error("Method not implemented.");
  }
  addGroup(location, direction) {
    throw new Error("Method not implemented.");
  }
  mergeGroup(group, target, options) {
    throw new Error("Method not implemented.");
  }
  moveGroup(group, location, direction) {
    throw new Error("Method not implemented.");
  }
  copyGroup(group, location, direction) {
    throw new Error("Method not implemented.");
  }
  removeGroup(group) {
    throw new Error("Method not implemented.");
  }
  arrangeGroups(arrangement, target) {
    throw new Error("Method not implemented.");
  }
  toggleMaximizeGroup(group) {
    throw new Error("Method not implemented.");
  }
  toggleExpandGroup(group) {
    throw new Error("Method not implemented.");
  }
}
class TestEditorService extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    this.onDidActiveEditorChange = Event.None;
    this.onDidVisibleEditorsChange = Event.None;
    this.onDidEditorsChange = Event.None;
    this.onWillOpenEditor = Event.None;
    this.onDidCloseEditor = Event.None;
    this.onDidOpenEditorFail = Event.None;
    this.onDidMostRecentlyActiveEditorsChange = Event.None;
    this.editors = [];
    this.mostRecentlyActiveEditors = [];
    this.visibleEditorPanes = [];
    this.visibleTextEditorControls = [];
    this.visibleEditors = [];
    this.count = this.editors.length;
  }
  get activeTextEditorControl() {
    return this._activeTextEditorControl;
  }
  set activeTextEditorControl(value) {
    this._activeTextEditorControl = value;
  }
  get activeEditor() {
    return this._activeEditor;
  }
  set activeEditor(value) {
    this._activeEditor = value;
  }
  getVisibleTextEditorControls(order) {
    return this.visibleTextEditorControls;
  }
  createScoped(editorGroupsContainer) {
    return this;
  }
  getEditors() {
    return [];
  }
  // eslint-disable-next-line local/code-no-any-casts
  findEditors() {
    return [];
  }
  async openEditor(editor, optionsOrGroup, group) {
    if ("dispose" in editor) {
      this._register(editor);
    }
    return void 0;
  }
  async closeEditor(editor, options) {
  }
  async closeEditors(editors, options) {
  }
  doResolveEditorOpenRequest(editor) {
    if (!this.editorGroupService) {
      return void 0;
    }
    return [this.editorGroupService.activeGroup, editor, void 0];
  }
  openEditors(_editors, _group) {
    throw new Error("not implemented");
  }
  isOpened(_editor) {
    return false;
  }
  isVisible(_editor) {
    return false;
  }
  replaceEditors(_editors, _group) {
    return Promise.resolve(void 0);
  }
  save(editors, options) {
    throw new Error("Method not implemented.");
  }
  saveAll(options) {
    throw new Error("Method not implemented.");
  }
  revert(editors, options) {
    throw new Error("Method not implemented.");
  }
  revertAll(options) {
    throw new Error("Method not implemented.");
  }
}
class TestWorkingCopyBackupService extends InMemoryWorkingCopyBackupService {
  constructor() {
    super();
    this.resolved = /* @__PURE__ */ new Set();
  }
  parseBackupContent(textBufferFactory) {
    const textBuffer = textBufferFactory.create(DefaultEndOfLine.LF).textBuffer;
    const lineCount = textBuffer.getLineCount();
    const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
    return textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
  }
  async resolve(identifier) {
    this.resolved.add(identifier);
    return super.resolve(identifier);
  }
}
function toUntypedWorkingCopyId(resource) {
  return toTypedWorkingCopyId(resource, "");
}
function toTypedWorkingCopyId(resource, typeId = "testBackupTypeId") {
  return { typeId, resource };
}
class InMemoryTestWorkingCopyBackupService extends BrowserWorkingCopyBackupService {
  constructor() {
    const disposables = new DisposableStore();
    const environmentService = TestEnvironmentService;
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
    disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new InMemoryFileSystemProvider())));
    super(new TestContextService(TestWorkspace), environmentService, fileService, logService);
    this.backupResourceJoiners = [];
    this.discardBackupJoiners = [];
    this.discardedBackups = [];
    this._register(disposables);
  }
  testGetFileService() {
    return this.fileService;
  }
  joinBackupResource() {
    return new Promise((resolve) => this.backupResourceJoiners.push(resolve));
  }
  joinDiscardBackup() {
    return new Promise((resolve) => this.discardBackupJoiners.push(resolve));
  }
  async backup(identifier, content, versionId, meta, token) {
    await super.backup(identifier, content, versionId, meta, token);
    while (this.backupResourceJoiners.length) {
      this.backupResourceJoiners.pop()();
    }
  }
  async discardBackup(identifier) {
    await super.discardBackup(identifier);
    this.discardedBackups.push(identifier);
    while (this.discardBackupJoiners.length) {
      this.discardBackupJoiners.pop()();
    }
  }
  async getBackupContents(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const fileContents = await this.fileService.readFile(backupResource);
    return fileContents.value.toString();
  }
}
class TestBeforeShutdownEvent {
  constructor() {
    this.reason = ShutdownReason.CLOSE;
  }
  veto(value) {
    this.value = value;
  }
  finalVeto(vetoFn) {
    this.value = vetoFn();
    this.finalValue = vetoFn;
  }
}
class TestWillShutdownEvent {
  constructor() {
    this.value = [];
    this.joiners = () => [];
    this.reason = ShutdownReason.CLOSE;
    this.token = CancellationToken.None;
  }
  join(promise, joiner) {
    this.value.push(typeof promise === "function" ? promise() : promise);
  }
  force() {
  }
}
class TestTextResourceConfigurationService {
  constructor(configurationService = new TestConfigurationService()) {
    this.configurationService = configurationService;
  }
  onDidChangeConfiguration() {
    return { dispose() {
    } };
  }
  getValue(resource, arg2, arg3) {
    const position = EditorPosition.isIPosition(arg2) ? arg2 : null;
    const section = position ? typeof arg3 === "string" ? arg3 : void 0 : typeof arg2 === "string" ? arg2 : void 0;
    return this.configurationService.getValue(section, { resource });
  }
  inspect(resource, position, section) {
    return this.configurationService.inspect(section, { resource });
  }
  updateValue(resource, key, value, configurationTarget) {
    return this.configurationService.updateValue(key, value);
  }
}
class RemoteFileSystemProvider {
  constructor(wrappedFsp, remoteAuthority) {
    this.wrappedFsp = wrappedFsp;
    this.remoteAuthority = remoteAuthority;
    this.capabilities = this.wrappedFsp.capabilities;
    this.onDidChangeCapabilities = this.wrappedFsp.onDidChangeCapabilities;
    this.onDidChangeFile = Event.map(this.wrappedFsp.onDidChangeFile, (changes) => changes.map((c) => {
      return {
        type: c.type,
        resource: c.resource.with({ scheme: Schemas.vscodeRemote, authority: this.remoteAuthority })
      };
    }));
  }
  watch(resource, opts) {
    return this.wrappedFsp.watch(this.toFileResource(resource), opts);
  }
  stat(resource) {
    return this.wrappedFsp.stat(this.toFileResource(resource));
  }
  mkdir(resource) {
    return this.wrappedFsp.mkdir(this.toFileResource(resource));
  }
  readdir(resource) {
    return this.wrappedFsp.readdir(this.toFileResource(resource));
  }
  delete(resource, opts) {
    return this.wrappedFsp.delete(this.toFileResource(resource), opts);
  }
  rename(from, to, opts) {
    return this.wrappedFsp.rename(this.toFileResource(from), this.toFileResource(to), opts);
  }
  copy(from, to, opts) {
    return this.wrappedFsp.copy(this.toFileResource(from), this.toFileResource(to), opts);
  }
  readFile(resource) {
    return this.wrappedFsp.readFile(this.toFileResource(resource));
  }
  writeFile(resource, content, opts) {
    return this.wrappedFsp.writeFile(this.toFileResource(resource), content, opts);
  }
  open(resource, opts) {
    return this.wrappedFsp.open(this.toFileResource(resource), opts);
  }
  close(fd) {
    return this.wrappedFsp.close(fd);
  }
  read(fd, pos, data, offset, length) {
    return this.wrappedFsp.read(fd, pos, data, offset, length);
  }
  write(fd, pos, data, offset, length) {
    return this.wrappedFsp.write(fd, pos, data, offset, length);
  }
  readFileStream(resource, opts, token) {
    return this.wrappedFsp.readFileStream(this.toFileResource(resource), opts, token);
  }
  toFileResource(resource) {
    return resource.with({ scheme: Schemas.file, authority: "" });
  }
}
class TestInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
  get capabilities() {
    return FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.FileReadStream;
  }
  readFileStream(resource) {
    const BUFFER_SIZE = 64 * 1024;
    const stream = newWriteableStream((data) => VSBuffer.concat(data.map((data2) => VSBuffer.wrap(data2))).buffer);
    (async () => {
      try {
        const data = await this.readFile(resource);
        let offset = 0;
        while (offset < data.length) {
          await timeout(0);
          await stream.write(data.subarray(offset, offset + BUFFER_SIZE));
          offset += BUFFER_SIZE;
        }
        await timeout(0);
        stream.end();
      } catch (error) {
        stream.end(error);
      }
    })();
    return stream;
  }
}
const productService = { _serviceBrand: void 0, ...product };
class TestHostService {
  constructor() {
    this._hasFocus = true;
    this._onDidChangeFocus = new Emitter();
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeWindow = new Emitter();
    this.onDidChangeActiveWindow = this._onDidChangeWindow.event;
    this.onDidChangeFullScreen = Event.None;
    this.colorScheme = ColorScheme.DARK;
    this.onDidChangeColorScheme = Event.None;
  }
  get hasFocus() {
    return this._hasFocus;
  }
  async hadLastFocus() {
    return this._hasFocus;
  }
  setFocus(focus) {
    this._hasFocus = focus;
    this._onDidChangeFocus.fire(this._hasFocus);
  }
  async restart() {
  }
  async reload() {
  }
  async close() {
  }
  async shutdown() {
  }
  async withExpectedShutdown(expectedShutdownTask) {
    return await expectedShutdownTask();
  }
  async focus() {
  }
  async moveTop() {
  }
  async getCursorScreenPoint() {
    return void 0;
  }
  async getWindows(options) {
    return [];
  }
  async openWindow(arg1, arg2) {
  }
  async toggleFullScreen() {
  }
  async getScreenshot(rect) {
    return void 0;
  }
  async getNativeWindowHandle(_windowId) {
    return void 0;
  }
  async showToast(_options, token) {
    return { supported: false, clicked: false };
  }
  async setWindowDimmed(_targetWindow, _dimmed) {
  }
}
class TestFilesConfigurationService extends FilesConfigurationService {
  testOnFilesConfigurationChange(configuration) {
    super.onFilesConfigurationChange(configuration, true);
  }
}
class TestReadonlyTextFileEditorModel extends TextFileEditorModel {
  isReadonly() {
    return true;
  }
}
class TestEditorInput extends EditorInput {
  constructor(resource, _typeId) {
    super();
    this.resource = resource;
    this._typeId = _typeId;
  }
  get typeId() {
    return this._typeId;
  }
  get editorId() {
    return this._typeId;
  }
  resolve() {
    return Promise.resolve(null);
  }
}
function registerTestEditor(id, inputs, serializerInputId) {
  const disposables = new DisposableStore();
  class TestEditor extends EditorPane {
    constructor(group) {
      super(id, group, NullTelemetryService, new TestThemeService(), disposables.add(new TestStorageService()));
      this._scopedContextKeyService = new MockContextKeyService();
    }
    async setInput(input, options, context, token) {
      super.setInput(input, options, context, token);
      await input.resolve();
    }
    getId() {
      return id;
    }
    layout() {
    }
    createEditor() {
    }
    get scopedContextKeyService() {
      return this._scopedContextKeyService;
    }
  }
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestEditor, id, "Test Editor Control"), inputs));
  if (serializerInputId) {
    class EditorsObserverTestEditorInputSerializer {
      canSerialize(editorInput) {
        return true;
      }
      serialize(editorInput) {
        const testEditorInput = editorInput;
        const testInput = {
          resource: testEditorInput.resource.toString()
        };
        return JSON.stringify(testInput);
      }
      deserialize(instantiationService, serializedEditorInput) {
        const testInput = JSON.parse(serializedEditorInput);
        return new TestFileEditorInput(URI.parse(testInput.resource), serializerInputId);
      }
    }
    disposables.add(Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(serializerInputId, EditorsObserverTestEditorInputSerializer));
  }
  return disposables;
}
function registerTestFileEditor() {
  const disposables = new DisposableStore();
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(
    EditorPaneDescriptor.create(
      TestTextFileEditor,
      TestTextFileEditor.ID,
      "Text File Editor"
    ),
    [new SyncDescriptor(FileEditorInput)]
  ));
  return disposables;
}
function registerTestResourceEditor() {
  const disposables = new DisposableStore();
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(
    EditorPaneDescriptor.create(
      TestTextResourceEditor,
      TestTextResourceEditor.ID,
      "Text Editor"
    ),
    [
      new SyncDescriptor(UntitledTextEditorInput),
      new SyncDescriptor(TextResourceEditorInput)
    ]
  ));
  return disposables;
}
function registerTestSideBySideEditor() {
  const disposables = new DisposableStore();
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(
    EditorPaneDescriptor.create(
      SideBySideEditor,
      SideBySideEditor.ID,
      "Text Editor"
    ),
    [
      new SyncDescriptor(SideBySideEditorInput)
    ]
  ));
  return disposables;
}
class TestFileEditorInput extends EditorInput {
  constructor(resource, _typeId) {
    super();
    this.resource = resource;
    this._typeId = _typeId;
    this.gotDisposed = false;
    this.gotSaved = false;
    this.gotSavedAs = false;
    this.gotReverted = false;
    this.dirty = false;
    this.fails = false;
    this.disableToUntyped = false;
    this._capabilities = EditorInputCapabilities.None;
    this.movedEditor = void 0;
    this.moveDisabledReason = void 0;
    this.preferredResource = this.resource;
  }
  get typeId() {
    return this._typeId;
  }
  get editorId() {
    return this._typeId;
  }
  get capabilities() {
    return this._capabilities;
  }
  set capabilities(capabilities) {
    if (this._capabilities !== capabilities) {
      this._capabilities = capabilities;
      this._onDidChangeCapabilities.fire();
    }
  }
  resolve() {
    return !this.fails ? Promise.resolve(null) : Promise.reject(new Error("fails"));
  }
  matches(other) {
    if (super.matches(other)) {
      return true;
    }
    if (other instanceof EditorInput) {
      return !!(other?.resource && this.resource.toString() === other.resource.toString() && other instanceof TestFileEditorInput && other.typeId === this.typeId);
    }
    return isEqual(this.resource, other.resource) && (this.editorId === other.options?.override || other.options?.override === void 0);
  }
  setPreferredResource(resource) {
  }
  async setEncoding(encoding) {
  }
  getEncoding() {
    return void 0;
  }
  setPreferredName(name) {
  }
  setPreferredDescription(description) {
  }
  setPreferredEncoding(encoding) {
  }
  setPreferredContents(contents) {
  }
  setLanguageId(languageId, source) {
  }
  setPreferredLanguageId(languageId) {
  }
  setForceOpenAsBinary() {
  }
  setFailToOpen() {
    this.fails = true;
  }
  async save(groupId, options) {
    this.gotSaved = true;
    this.dirty = false;
    return this;
  }
  async saveAs(groupId, options) {
    this.gotSavedAs = true;
    return this;
  }
  async revert(group, options) {
    this.gotReverted = true;
    this.gotSaved = false;
    this.gotSavedAs = false;
    this.dirty = false;
  }
  toUntyped() {
    if (this.disableToUntyped) {
      return void 0;
    }
    return { resource: this.resource };
  }
  setModified() {
    this.modified = true;
  }
  isModified() {
    return this.modified === void 0 ? this.dirty : this.modified;
  }
  setDirty() {
    this.dirty = true;
  }
  isDirty() {
    return this.dirty;
  }
  isResolved() {
    return false;
  }
  dispose() {
    super.dispose();
    this.gotDisposed = true;
  }
  async rename() {
    return this.movedEditor;
  }
  setMoveDisabled(reason) {
    this.moveDisabledReason = reason;
  }
  canMove(sourceGroup, targetGroup) {
    if (typeof this.moveDisabledReason === "string") {
      return this.moveDisabledReason;
    }
    return super.canMove(sourceGroup, targetGroup);
  }
}
class TestForceRevealFileEditorInput extends TestFileEditorInput {
  get capabilities() {
    return EditorInputCapabilities.ForceReveal;
  }
}
class TestEditorPart extends MainEditorPart {
  constructor() {
    super(...arguments);
    this.mainPart = this;
    this.parts = [this];
    this.activeModalEditorPart = void 0;
    this.onDidCreateAuxiliaryEditorPart = Event.None;
  }
  testSaveState() {
    return super.saveState();
  }
  clearState() {
    const workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    for (const key of Object.keys(workspaceMemento)) {
      delete workspaceMemento[key];
    }
    const profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    for (const key of Object.keys(profileMemento)) {
      delete profileMemento[key];
    }
  }
  registerEditorPart(part) {
    return Disposable.None;
  }
  createAuxiliaryEditorPart() {
    throw new Error("Method not implemented.");
  }
  createModalEditorPart() {
    throw new Error("Method not implemented.");
  }
  getScopedInstantiationService(part) {
    throw new Error("Method not implemented.");
  }
  getPart(group) {
    return this;
  }
  saveWorkingSet(name) {
    throw new Error("Method not implemented.");
  }
  getWorkingSets() {
    throw new Error("Method not implemented.");
  }
  applyWorkingSet(workingSet, options) {
    throw new Error("Method not implemented.");
  }
  deleteWorkingSet(workingSet) {
    throw new Error("Method not implemented.");
  }
  registerContextKeyProvider(provider) {
    throw new Error("Method not implemented.");
  }
}
class TestEditorParts extends EditorParts {
  createMainEditorPart() {
    this.testMainPart = this.instantiationService.createInstance(TestEditorPart, this);
    return this.testMainPart;
  }
}
async function createEditorParts(instantiationService, disposables) {
  const parts = instantiationService.createInstance(TestEditorParts);
  const part = disposables.add(parts).testMainPart;
  part.create(document.createElement("div"));
  part.layout(1080, 800, 0, 0);
  await parts.whenReady;
  return parts;
}
async function createEditorPart(instantiationService, disposables) {
  return (await createEditorParts(instantiationService, disposables)).testMainPart;
}
class TestListService {
  constructor() {
    this.lastFocusedList = void 0;
  }
  register() {
    return Disposable.None;
  }
}
class TestPathService {
  constructor(fallbackUserHome = URI.from({ scheme: Schemas.file, path: "/" }), defaultUriScheme = Schemas.file) {
    this.fallbackUserHome = fallbackUserHome;
    this.defaultUriScheme = defaultUriScheme;
  }
  hasValidBasename(resource, arg2, name) {
    if (typeof arg2 === "string" || typeof arg2 === "undefined") {
      return isValidBasename(arg2 ?? basename(resource));
    }
    return isValidBasename(name ?? basename(resource));
  }
  get path() {
    return Promise.resolve(isWindows ? win32 : posix);
  }
  userHome(options) {
    return options?.preferLocal ? this.fallbackUserHome : Promise.resolve(this.fallbackUserHome);
  }
  get resolvedUserHome() {
    return this.fallbackUserHome;
  }
  async fileURI(path) {
    return URI.file(path);
  }
}
function getLastResolvedFileStat(model) {
  const candidate = model;
  return candidate?.lastResolvedFileStat;
}
class TestWorkspacesService {
  constructor() {
    this.onDidChangeRecentlyOpened = Event.None;
  }
  async createUntitledWorkspace(folders, remoteAuthority) {
    throw new Error("Method not implemented.");
  }
  async deleteUntitledWorkspace(workspace) {
  }
  async addRecentlyOpened(recents) {
  }
  async removeRecentlyOpened(workspaces) {
  }
  async clearRecentlyOpened() {
  }
  async getRecentlyOpened() {
    return { files: [], workspaces: [] };
  }
  async getDirtyWorkspaces() {
    return [];
  }
  async enterWorkspace(path) {
    throw new Error("Method not implemented.");
  }
  async getWorkspaceIdentifier(workspacePath) {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalInstanceService {
  constructor() {
    this.onDidCreateInstance = Event.None;
    this.onDidRegisterBackend = Event.None;
  }
  convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile, cwd) {
    throw new Error("Method not implemented.");
  }
  preparePathForTerminalAsync(path, executable, title, shellType, remoteAuthority) {
    throw new Error("Method not implemented.");
  }
  createInstance(options, target) {
    throw new Error("Method not implemented.");
  }
  async getBackend(remoteAuthority) {
    throw new Error("Method not implemented.");
  }
  didRegisterBackend(backend) {
    throw new Error("Method not implemented.");
  }
  getRegisteredBackends() {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalEditorService {
  constructor() {
    this.instances = [];
    this.onDidDisposeInstance = Event.None;
    this.onDidFocusInstance = Event.None;
    this.onDidChangeInstanceCapability = Event.None;
    this.onDidChangeActiveInstance = Event.None;
    this.onDidChangeInstances = Event.None;
  }
  openEditor(instance, editorOptions) {
    throw new Error("Method not implemented.");
  }
  detachInstance(instance) {
    throw new Error("Method not implemented.");
  }
  splitInstance(instanceToSplit, shellLaunchConfig) {
    throw new Error("Method not implemented.");
  }
  revealActiveEditor(preserveFocus) {
    throw new Error("Method not implemented.");
  }
  resolveResource(instance) {
    throw new Error("Method not implemented.");
  }
  reviveInput(deserializedInput) {
    throw new Error("Method not implemented.");
  }
  getInputFromResource(resource) {
    throw new Error("Method not implemented.");
  }
  setActiveInstance(instance) {
    throw new Error("Method not implemented.");
  }
  focusActiveInstance() {
    throw new Error("Method not implemented.");
  }
  async focusInstance(instance) {
    throw new Error("Method not implemented.");
  }
  getInstanceFromResource(resource) {
    throw new Error("Method not implemented.");
  }
  focusFindWidget() {
    throw new Error("Method not implemented.");
  }
  hideFindWidget() {
    throw new Error("Method not implemented.");
  }
  findNext() {
    throw new Error("Method not implemented.");
  }
  findPrevious() {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalGroupService {
  constructor() {
    this.instances = [];
    this.groups = [];
    this.activeGroupIndex = 0;
    this.lastAccessedMenu = "inline-tab";
    this.onDidChangeActiveGroup = Event.None;
    this.onDidDisposeGroup = Event.None;
    this.onDidShow = Event.None;
    this.onDidChangeGroups = Event.None;
    this.onDidChangePanelOrientation = Event.None;
    this.onDidDisposeInstance = Event.None;
    this.onDidFocusInstance = Event.None;
    this.onDidChangeInstanceCapability = Event.None;
    this.onDidChangeActiveInstance = Event.None;
    this.onDidChangeInstances = Event.None;
  }
  createGroup(instance) {
    throw new Error("Method not implemented.");
  }
  getGroupForInstance(instance) {
    throw new Error("Method not implemented.");
  }
  moveGroup(source, target) {
    throw new Error("Method not implemented.");
  }
  moveGroupToEnd(source) {
    throw new Error("Method not implemented.");
  }
  moveInstance(source, target, side) {
    throw new Error("Method not implemented.");
  }
  unsplitInstance(instance) {
    throw new Error("Method not implemented.");
  }
  joinInstances(instances) {
    throw new Error("Method not implemented.");
  }
  instanceIsSplit(instance) {
    throw new Error("Method not implemented.");
  }
  getGroupLabels() {
    throw new Error("Method not implemented.");
  }
  setActiveGroupByIndex(index) {
    throw new Error("Method not implemented.");
  }
  setActiveGroupToNext() {
    throw new Error("Method not implemented.");
  }
  setActiveGroupToPrevious() {
    throw new Error("Method not implemented.");
  }
  setActiveInstanceByIndex(terminalIndex) {
    throw new Error("Method not implemented.");
  }
  setContainer(container) {
    throw new Error("Method not implemented.");
  }
  showPanel(focus) {
    throw new Error("Method not implemented.");
  }
  hidePanel() {
    throw new Error("Method not implemented.");
  }
  focusTabs() {
    throw new Error("Method not implemented.");
  }
  focusHover() {
    throw new Error("Method not implemented.");
  }
  setActiveInstance(instance) {
    throw new Error("Method not implemented.");
  }
  focusActiveInstance() {
    throw new Error("Method not implemented.");
  }
  async focusInstance(instance) {
    throw new Error("Method not implemented.");
  }
  getInstanceFromResource(resource) {
    throw new Error("Method not implemented.");
  }
  focusFindWidget() {
    throw new Error("Method not implemented.");
  }
  hideFindWidget() {
    throw new Error("Method not implemented.");
  }
  findNext() {
    throw new Error("Method not implemented.");
  }
  findPrevious() {
    throw new Error("Method not implemented.");
  }
  updateVisibility() {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalProfileService {
  constructor() {
    this.availableProfiles = [];
    this.contributedProfiles = [];
    this.profilesReady = Promise.resolve();
    this.onDidChangeAvailableProfiles = Event.None;
  }
  getPlatformKey() {
    throw new Error("Method not implemented.");
  }
  refreshAvailableProfiles() {
    throw new Error("Method not implemented.");
  }
  getDefaultProfileName() {
    throw new Error("Method not implemented.");
  }
  getDefaultProfile() {
    throw new Error("Method not implemented.");
  }
  getContributedDefaultProfile(shellLaunchConfig) {
    throw new Error("Method not implemented.");
  }
  registerContributedProfile(args) {
    throw new Error("Method not implemented.");
  }
  registerInternalContributedProfile(_profile) {
    return Disposable.None;
  }
  getContributedProfileProvider(extensionIdentifier, id) {
    throw new Error("Method not implemented.");
  }
  registerTerminalProfileProvider(extensionIdentifier, id, profileProvider) {
    throw new Error("Method not implemented.");
  }
  overrideDefaultProfile(extensionIdentifier, id) {
    return Disposable.None;
  }
}
class TestTerminalProfileResolverService {
  constructor() {
    this.defaultProfileName = "";
  }
  resolveIcon(shellLaunchConfig) {
  }
  async resolveShellLaunchConfig(shellLaunchConfig, options) {
  }
  async getDefaultProfile(options) {
    return { path: "/default", profileName: "Default", isDefault: true };
  }
  async getDefaultShell(options) {
    return "/default";
  }
  async getDefaultShellArgs(options) {
    return [];
  }
  getDefaultIcon() {
    return Codicon.terminal;
  }
  async getEnvironment() {
    return env;
  }
  getSafeConfigValue(key, os) {
    return void 0;
  }
  getSafeConfigValueFullKey(key) {
    return void 0;
  }
  createProfileFromShellAndShellArgs(shell, shellArgs) {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalConfigurationService extends TerminalConfigurationService {
  get fontMetrics() {
    return this._fontMetrics;
  }
  // eslint-disable-next-line local/code-no-any-casts
  setConfig(config) {
    this._config = config;
  }
}
class TestQuickInputService {
  constructor() {
    this.onShow = Event.None;
    this.onHide = Event.None;
    this.alignment = observableValue("TestQuickInputService.alignment", "top");
    this.currentQuickInput = void 0;
    this.quickAccess = void 0;
  }
  async pick(picks, options, token) {
    if (Array.isArray(picks)) {
      return { label: "selectedPick", description: "pick description", value: "selectedPick" };
    } else {
      return void 0;
    }
  }
  async input(options, token) {
    return options ? "resolved" + options.prompt : "resolved";
  }
  createQuickPick() {
    throw new Error("not implemented.");
  }
  createInputBox() {
    throw new Error("not implemented.");
  }
  createQuickWidget() {
    throw new Error("Method not implemented.");
  }
  createQuickTree() {
    throw new Error("not implemented.");
  }
  focus() {
    throw new Error("not implemented.");
  }
  toggle() {
    throw new Error("not implemented.");
  }
  navigate(next, quickNavigate) {
    throw new Error("not implemented.");
  }
  accept() {
    throw new Error("not implemented.");
  }
  back() {
    throw new Error("not implemented.");
  }
  cancel() {
    throw new Error("not implemented.");
  }
  setAlignment(alignment) {
    throw new Error("not implemented.");
  }
  toggleHover() {
    throw new Error("not implemented.");
  }
}
class TestLanguageDetectionService {
  isEnabledForLanguage(languageId) {
    return false;
  }
  async detectLanguage(resource, supportedLangs) {
    return void 0;
  }
}
class TestRemoteAgentService {
  getConnection() {
    return null;
  }
  async getEnvironment() {
    return null;
  }
  async getRawEnvironment() {
    return null;
  }
  async getExtensionHostExitInfo(reconnectionToken) {
    return null;
  }
  async getDiagnosticInfo(options) {
    return void 0;
  }
  async updateTelemetryLevel(telemetryLevel) {
  }
  async logTelemetry(eventName, data) {
  }
  async flushTelemetry() {
  }
  async getRoundTripTime() {
    return void 0;
  }
  async endConnection() {
  }
}
class TestRemoteExtensionsScannerService {
  async whenExtensionsReady() {
    return { failed: [] };
  }
  scanExtensions() {
    throw new Error("Method not implemented.");
  }
}
class TestWorkbenchExtensionEnablementService {
  constructor() {
    this.onEnablementChanged = Event.None;
  }
  getEnablementState(extension) {
    return EnablementState.EnabledGlobally;
  }
  getEnablementStates(extensions, workspaceTypeOverrides) {
    return [];
  }
  getDependenciesEnablementStates(extension) {
    return [];
  }
  canChangeEnablement(extension) {
    return true;
  }
  canChangeWorkspaceEnablement(extension) {
    return true;
  }
  isEnabled(extension) {
    return true;
  }
  isEnabledEnablementState(enablementState) {
    return true;
  }
  isDisabledGlobally(extension) {
    return false;
  }
  async setEnablement(extensions, state) {
    return [];
  }
  async updateExtensionsEnablementsWhenWorkspaceTrustChanges() {
  }
}
class TestWorkbenchExtensionManagementService {
  constructor() {
    this.onInstallExtension = Event.None;
    this.onDidInstallExtensions = Event.None;
    this.onUninstallExtension = Event.None;
    this.onDidUninstallExtension = Event.None;
    this.onDidUpdateExtensionMetadata = Event.None;
    this.onProfileAwareInstallExtension = Event.None;
    this.onProfileAwareDidInstallExtensions = Event.None;
    this.onProfileAwareUninstallExtension = Event.None;
    this.onProfileAwareDidUninstallExtension = Event.None;
    this.onDidProfileAwareUninstallExtensions = Event.None;
    this.onProfileAwareDidUpdateExtensionMetadata = Event.None;
    this.onDidChangeProfile = Event.None;
    this.onDidEnableExtensions = Event.None;
    this.preferPreReleases = true;
  }
  installVSIX(location, manifest, installOptions) {
    throw new Error("Method not implemented.");
  }
  installFromLocation(location) {
    throw new Error("Method not implemented.");
  }
  installGalleryExtensions(extensions) {
    throw new Error("Method not implemented.");
  }
  async updateFromGallery(gallery, extension, installOptions) {
    return extension;
  }
  zip(extension) {
    throw new Error("Method not implemented.");
  }
  getManifest(vsix) {
    throw new Error("Method not implemented.");
  }
  install(vsix, options) {
    throw new Error("Method not implemented.");
  }
  isAllowed() {
    return true;
  }
  async canInstall(extension) {
    return true;
  }
  installFromGallery(extension, options) {
    throw new Error("Method not implemented.");
  }
  uninstall(extension, options) {
    throw new Error("Method not implemented.");
  }
  uninstallExtensions(extensions) {
    throw new Error("Method not implemented.");
  }
  async getInstalled(type) {
    return [];
  }
  getExtensionsControlManifest() {
    throw new Error("Method not implemented.");
  }
  async updateMetadata(local, metadata) {
    return local;
  }
  registerParticipant(pariticipant) {
  }
  async getTargetPlatform() {
    return TargetPlatform.UNDEFINED;
  }
  async cleanUp() {
  }
  download() {
    throw new Error("Method not implemented.");
  }
  copyExtensions() {
    throw new Error("Not Supported");
  }
  toggleApplicationScope() {
    throw new Error("Not Supported");
  }
  installExtensionsFromProfile() {
    throw new Error("Not Supported");
  }
  whenProfileChanged(from, to) {
    throw new Error("Not Supported");
  }
  getInstalledWorkspaceExtensionLocations() {
    throw new Error("Method not implemented.");
  }
  getInstalledWorkspaceExtensions() {
    throw new Error("Method not implemented.");
  }
  installResourceExtension() {
    throw new Error("Method not implemented.");
  }
  getExtensions() {
    throw new Error("Method not implemented.");
  }
  resetPinnedStateForAllUserExtensions(pinned) {
    throw new Error("Method not implemented.");
  }
  getInstallableServers(extension) {
    throw new Error("Method not implemented.");
  }
  isPublisherTrusted(extension) {
    return false;
  }
  getTrustedPublishers() {
    return [];
  }
  trustPublishers() {
  }
  untrustPublishers() {
  }
  async requestPublisherTrust(extensions) {
  }
}
class TestWebExtensionsScannerService {
  constructor() {
    this.onDidChangeProfile = Event.None;
  }
  async scanSystemExtensions() {
    return [];
  }
  async scanUserExtensions() {
    return [];
  }
  async scanExtensionsUnderDevelopment() {
    return [];
  }
  async copyExtensions() {
    throw new Error("Method not implemented.");
  }
  scanExistingExtension(extensionLocation, extensionType) {
    throw new Error("Method not implemented.");
  }
  addExtension(location, metadata) {
    throw new Error("Method not implemented.");
  }
  addExtensionFromGallery(galleryExtension, metadata) {
    throw new Error("Method not implemented.");
  }
  removeExtension() {
    throw new Error("Method not implemented.");
  }
  updateMetadata(extension, metaData, profileLocation) {
    throw new Error("Method not implemented.");
  }
  scanExtensionManifest(extensionLocation) {
    throw new Error("Method not implemented.");
  }
}
async function workbenchTeardown(instantiationService) {
  return instantiationService.invokeFunction(async (accessor) => {
    const workingCopyService = accessor.get(IWorkingCopyService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    for (const workingCopy of workingCopyService.workingCopies) {
      await workingCopy.revert();
    }
    for (const group of editorGroupService.groups) {
      await group.closeAllEditors();
    }
    for (const group of editorGroupService.groups) {
      editorGroupService.removeGroup(group);
    }
  });
}
class TestContextMenuService {
  constructor() {
    this.onDidShowContextMenu = Event.None;
    this.onDidHideContextMenu = Event.None;
  }
  showContextMenu(delegate) {
    throw new Error("Method not implemented.");
  }
}
class TestChatWidgetService {
  constructor() {
    this.onDidAddWidget = Event.None;
    this.onDidChangeWidgetVisibility = Event.None;
    this.onDidBackgroundSession = Event.None;
    this.onDidChangeFocusedWidget = Event.None;
    this.onDidChangeFocusedSession = Event.None;
  }
  async reveal(widget, preserveFocus) {
    return false;
  }
  async revealWidget(preserveFocus) {
    return void 0;
  }
  getAllWidgets() {
    return [];
  }
  getWidgetByInputUri(uri) {
    return void 0;
  }
  async openSession(sessionResource, target, options) {
    return void 0;
  }
  getWidgetBySessionResource(sessionResource) {
    return void 0;
  }
  getWidgetsByLocations(location) {
    return [];
  }
  register(newWidget) {
    return Disposable.None;
  }
}
export {
  InMemoryTestWorkingCopyBackupService,
  RemoteFileSystemProvider,
  TestBeforeShutdownEvent,
  TestBrowserTextFileServiceWithEncodingOverrides,
  TestChatWidgetService,
  TestContextMenuService,
  TestDecorationsService,
  TestEditorGroupAccessor,
  TestEditorGroupView,
  TestEditorGroupsService,
  TestEditorInput,
  TestEditorPart,
  TestEditorParts,
  TestEditorService,
  TestEncodingOracle,
  TestEnvironmentService,
  TestFileDialogService,
  TestFileEditorInput,
  TestFileService,
  TestFilesConfigurationService,
  TestForceRevealFileEditorInput,
  TestHostService,
  TestInMemoryFileSystemProvider,
  TestLayoutService,
  TestLifecycleService,
  TestListService,
  TestMenuService,
  TestPaneCompositeService,
  TestPanelPart,
  TestPathService,
  TestProgressService,
  TestQuickInputService,
  TestReadonlyTextFileEditorModel,
  TestRemoteAgentService,
  TestRemoteExtensionsScannerService,
  TestServiceAccessor,
  TestSideBarPart,
  TestTerminalConfigurationService,
  TestTerminalEditorService,
  TestTerminalGroupService,
  TestTerminalInstanceService,
  TestTerminalProfileResolverService,
  TestTerminalProfileService,
  TestTextFileEditor,
  TestTextFileService,
  TestTextResourceConfigurationService,
  TestTextResourceEditor,
  TestViewsService,
  TestWebExtensionsScannerService,
  TestWillShutdownEvent,
  TestWorkbenchExtensionEnablementService,
  TestWorkbenchExtensionManagementService,
  TestWorkingCopyBackupService,
  TestWorkingCopyService,
  TestWorkspacesService,
  createEditorPart,
  createEditorParts,
  createFileEditorInput,
  getLastResolvedFileStat,
  productService,
  registerTestEditor,
  registerTestFileEditor,
  registerTestResourceEditor,
  registerTestSideBySideEditor,
  toTypedWorkingCopyId,
  toUntypedWorkingCopyId,
  workbenchInstantiationService,
  workbenchTeardown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUNvbnRleHRNZW51RGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlyZWN0aW9uLCBJVmlld1NpemUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc1ZhbGlkQmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBwb3NpeCwgd2luMzIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW52IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBuZXdXcml0ZWFibGVTdHJlYW0sIFJlYWRhYmxlU3RyZWFtRXZlbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCwgdXBjYXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiBhcyBFZGl0b3JQb3NpdGlvbiwgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3IsIElFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0RW5kT2ZMaW5lLCBFbmRPZkxpbmVQcmVmZXJlbmNlLCBJVGV4dEJ1ZmZlckZhY3RvcnksIElUZXh0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVNpdHRlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3Rlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3NlcnZpY2VzL3Rlc3RFZGl0b3JXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvdGVzdC9jb21tb24vdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLCBOdWxsQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWVudSwgSU1lbnVBY3Rpb25PcHRpb25zLCBJTWVudUNoYW5nZUV2ZW50LCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRm9sZGVyQmFja3VwSW5mbywgSVdvcmtzcGFjZUJhY2t1cEluZm8gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9iYWNrdXAvY29tbW9uL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlWYWx1ZSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dE1lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudU1lbnVEZWxlZ2F0ZSwgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWdub3N0aWNJbmZvLCBJRGlhZ25vc3RpY0luZm9PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhZ25vc3RpY3MvY29tbW9uL2RpYWdub3N0aWNzLmpzJztcbmltcG9ydCB7IENvbmZpcm1SZXN1bHQsIElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UsIElPcGVuRGlhbG9nT3B0aW9ucywgSVBpY2tBbmRPcGVuT3B0aW9ucywgSVNhdmVEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUZXN0RGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvdGVzdC9jb21tb24vdGVzdERpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMsIElSZXNvdXJjZUVkaXRvcklucHV0LCBJUmVzb3VyY2VFZGl0b3JJbnB1dElkZW50aWZpZXIsIElUZXh0RWRpdG9yT3B0aW9ucywgSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFBhcnRpY2lwYW50LCBJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCwgSUdhbGxlcnlFeHRlbnNpb24sIElHYWxsZXJ5TWV0YWRhdGEsIElMb2NhbEV4dGVuc2lvbiwgSW5zdGFsbEV4dGVuc2lvbkluZm8sIEluc3RhbGxFeHRlbnNpb25SZXN1bHQsIEluc3RhbGxFeHRlbnNpb25TdW1tYXJ5LCBJbnN0YWxsT3B0aW9ucywgTWV0YWRhdGEsIFVuaW5zdGFsbEV4dGVuc2lvbkluZm8sIFVuaW5zdGFsbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb24sIElFeHRlbnNpb25EZXNjcmlwdGlvbiwgSVJlbGF4ZWRFeHRlbnNpb25NYW5pZmVzdCwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBGaWxlVHlwZSwgSUZpbGVDaGFuZ2UsIElGaWxlRGVsZXRlT3B0aW9ucywgSUZpbGVPcGVuT3B0aW9ucywgSUZpbGVPdmVyd3JpdGVPcHRpb25zLCBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgSUZpbGVTeXN0ZW1Qcm92aWRlciwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIElGaWxlV3JpdGVPcHRpb25zLCBJU3RhdCwgSVdhdGNoT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBOdWxsSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvdGVzdC9icm93c2VyL251bGxIb3ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlLCBNb2NrS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMYXlvdXRPZmZzZXRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UsIElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMsIElQcm9ncmVzc0RpYWxvZ09wdGlvbnMsIElQcm9ncmVzc0luZGljYXRvciwgSVByb2dyZXNzTm90aWZpY2F0aW9uT3B0aW9ucywgSVByb2dyZXNzT3B0aW9ucywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCwgSVByb2dyZXNzV2luZG93T3B0aW9ucywgUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUlucHV0Qm94LCBJSW5wdXRPcHRpb25zLCBJUGlja09wdGlvbnMsIElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja05hdmlnYXRlQ29uZmlndXJhdGlvbiwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIElRdWlja1RyZWUsIElRdWlja1RyZWVJdGVtLCBJUXVpY2tXaWRnZXQsIFF1aWNrSW5wdXRBbGlnbm1lbnQsIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHRlbnNpb25zU2Nhbm5lci5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UsIFJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeURhdGEsIElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlLCBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbEJhY2tlbmQsIElUZXJtaW5hbExvZ1NlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGUsIFRlcm1pbmFsSWNvbiwgVGVybWluYWxMb2NhdGlvbiwgVGVybWluYWxTaGVsbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsTG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2xvclNjaGVtZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IFVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkb1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJT3BlbkVtcHR5V2luZG93T3B0aW9ucywgSU9wZW5XaW5kb3dPcHRpb25zLCBJUmVjdGFuZ2xlLCBJV2luZG93T3BlbmFibGUsIE1lbnVCYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgVGVzdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFbnRlcldvcmtzcGFjZVJlc3VsdCwgSVJlY2VudCwgSVJlY2VudGx5T3BlbmVkLCBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhLCBJV29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgUGFuZUNvbXBvc2l0ZSwgUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3IsIEV4dGVuc2lvbnMgYXMgUGFuZUNvbXBvc2l0ZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgUGFydCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9QQVJUX09QVElPTlMsIEVkaXRvclNlcnZpY2VJbXBsLCBJRWRpdG9yR3JvdXBzVmlldywgSUVkaXRvckdyb3VwVGl0bGVIZWlnaHQsIElFZGl0b3JHcm91cFZpZXcgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgTWFpbkVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IEVkaXRvclBhcnRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFydHMuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRvclBhbmVTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci90ZXh0RWRpdG9yLmpzJztcbmltcG9ydCB7IFRleHRSZXNvdXJjZUVkaXRvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnQgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL3BhbmVDb21wb3NpdGVQYXJ0LmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLCBFZGl0b3JzT3JkZXIsIEVkaXRvckV4dGVuc2lvbnMgYXMgRXh0ZW5zaW9ucywgR3JvdXBJZGVudGlmaWVyLCBJQWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnQsIElFZGl0b3JDbG9zZUV2ZW50LCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBJRWRpdG9ySWRlbnRpZmllciwgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yUGFuZSwgSUVkaXRvclBhbmVTZWxlY3Rpb24sIElFZGl0b3JQYXJ0T3B0aW9ucywgSUVkaXRvclNlcmlhbGl6ZXIsIElFZGl0b3JXaWxsTW92ZUV2ZW50LCBJRWRpdG9yV2lsbE9wZW5FdmVudCwgSUZpbGVFZGl0b3JJbnB1dCwgSU1vdmVSZXN1bHQsIElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgSVRleHREaWZmRWRpdG9yUGFuZSwgSVRvb2xiYXJBY3Rpb25zLCBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgSVVudHlwZWRFZGl0b3JJbnB1dCwgSVZpc2libGVFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJR3JvdXBNb2RlbENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IvdGV4dFJlc291cmNlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGUgfSBmcm9tICcuLi8uLi9jb21tb24vcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJVmlldywgSVZpZXdEZXNjcmlwdG9yLCBWaWV3Q29udGFpbmVyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZWRpdG9ycy9maWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgVGV4dEZpbGVFZGl0b3IgfSBmcm9tICcuLi8uLi9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZWRpdG9ycy90ZXh0RmlsZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBGSUxFX0VESVRPUl9JTlBVVF9JRCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMsIElEZXNlcmlhbGl6ZWRUZXJtaW5hbEVkaXRvcklucHV0LCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsRWRpdG9yU2VydmljZSwgSVRlcm1pbmFsR3JvdXAsIElUZXJtaW5hbEdyb3VwU2VydmljZSwgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbEluc3RhbmNlU2VydmljZSwgVGVybWluYWxFZGl0b3JMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVnaXN0ZXJDb250cmlidXRlZFByb2ZpbGVBcmdzLCBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucywgSVRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyLCBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlU2VydmljZSwgdHlwZSBJVGVybWluYWxDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uLCBJRGVjb3JhdGlvbkRhdGEsIElEZWNvcmF0aW9uc1Byb3ZpZGVyLCBJRGVjb3JhdGlvbnNTZXJ2aWNlLCBJUmVzb3VyY2VEZWNvcmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9icm93c2VyL2VkaXRvclBhbmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9icm93c2VyL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UsIElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2N1c3RvbUVkaXRvckxhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cExheW91dCwgR3JvdXBEaXJlY3Rpb24sIEdyb3VwT3JpZW50YXRpb24sIEdyb3Vwc0FycmFuZ2VtZW50LCBHcm91cHNPcmRlciwgSUF1eGlsaWFyeUVkaXRvclBhcnQsIElDbG9zZUFsbEVkaXRvcnNPcHRpb25zLCBJQ2xvc2VFZGl0b3JPcHRpb25zLCBJQ2xvc2VFZGl0b3JzRmlsdGVyLCBJRWRpdG9yRHJvcFRhcmdldERlbGVnYXRlLCBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cEFjdGl2YXRpb25FdmVudCwgSUVkaXRvckdyb3VwQ29udGV4dEtleVByb3ZpZGVyLCBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLCBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvclBhcnQsIElFZGl0b3JSZXBsYWNlbWVudCwgSUVkaXRvcldvcmtpbmdTZXQsIElFZGl0b3JXb3JraW5nU2V0T3B0aW9ucywgSUZpbmRHcm91cFNjb3BlLCBJTWVyZ2VHcm91cE9wdGlvbnMsIElNb2RhbEVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JQYW5lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvcnNDaGFuZ2VFdmVudCwgSUVkaXRvclNlcnZpY2UsIElSZXZlcnRBbGxFZGl0b3JzT3B0aW9ucywgSVNhdmVFZGl0b3JzT3B0aW9ucywgSVNhdmVFZGl0b3JzUmVzdWx0LCBJVmlzaWJsZUVkaXRvcnNDaGFuZ2VFdmVudCwgUHJlZmVycmVkR3JvdXAgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVuYWJsZW1lbnRTdGF0ZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIElSZXNvdXJjZUV4dGVuc2lvbiwgSVNjYW5uZWRFeHRlbnNpb24sIElXZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVsZXZhdGVkRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9maWxlcy9icm93c2VyL2VsZXZhdGVkRmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVsZXZhdGVkRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9maWxlcy9jb21tb24vZWxldmF0ZWRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSwgSVRvYXN0T3B0aW9ucywgSVRvYXN0UmVzdWx0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGFiZWwvY29tbW9uL2xhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGFuZ3VhZ2VEZXRlY3Rpb24vY29tbW9uL2xhbmd1YWdlRGV0ZWN0aW9uV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudCwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhbmVsQWxpZ25tZW50LCBQb3NpdGlvbiBhcyBQYXJ0UG9zaXRpb24sIFBhcnRzLCBTSU5HTEVfV0lORE9XX1BBUlRTIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgSW50ZXJuYWxCZWZvcmVTaHV0ZG93bkV2ZW50LCBJV2lsbFNodXRkb3duRXZlbnRKb2luZXIsIFNodXRkb3duUmVhc29uLCBXaWxsU2h1dGRvd25FdmVudCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3F1aWNraW5wdXQvYnJvd3Nlci9xdWlja0lucHV0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdEV4aXRJbmZvLCBJUmVtb3RlQWdlbnRDb25uZWN0aW9uLCBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlclRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2Jyb3dzZXIvYnJvd3NlclRleHRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbmNvZGluZ09yYWNsZSwgSUVuY29kaW5nT3ZlcnJpZGUgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9icm93c2VyL3RleHRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVVEYxNmJlLCBVVEYxNmxlLCBVVEY4X3dpdGhfYm9tIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yU2VydmljZSwgVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGV4dEZpbGVFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0RmlsZUVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IElSZWFkVGV4dEZpbGVPcHRpb25zLCBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgSVRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyLCBJVGV4dEZpbGVTZXJ2aWNlLCBJVGV4dEZpbGVTdHJlYW1Db250ZW50LCBJV3JpdGVUZXh0RmlsZU9wdGlvbnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbFJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRtb2RlbFJlc29sdmVyL2NvbW1vbi90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVVudGl0bGVkVGV4dEVkaXRvck1vZGVsTWFuYWdlciwgSVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UsIFVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlcldvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2Jyb3dzZXIvd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weSwgSVdvcmtpbmdDb3B5QmFja3VwTWV0YSwgSVdvcmtpbmdDb3B5SWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRXb3JraW5nQ29weUJhY2t1cCwgSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSwgV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlGaWxlU2VydmljZSwgV29ya2luZ0NvcHlGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UsIFdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIFRlc3RDb250ZXh0U2VydmljZSwgVGVzdEV4dGVuc2lvblNlcnZpY2UsIFRlc3RGaWxlU2VydmljZSwgVGVzdEhpc3RvcnlTZXJ2aWNlLCBUZXN0TGlmZWN5Y2xlU2VydmljZSwgVGVzdExvZ2dlclNlcnZpY2UsIFRlc3RNYXJrZXJTZXJ2aWNlLCBUZXN0UHJvZHVjdFNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSwgVGVzdFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgVGVzdFdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IERlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2FjY291bnRzL2Jyb3dzZXIvZGVmYXVsdEFjY291bnQuanMnO1xuXG4vLyBCYWNrY29tcGF0IGV4cG9ydFxuZXhwb3J0IHsgVGVzdEZpbGVTZXJ2aWNlLCBUZXN0TGlmZWN5Y2xlU2VydmljZSB9O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmlsZUVkaXRvcklucHV0KGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJlc291cmNlOiBVUkkpOiBGaWxlRWRpdG9ySW5wdXQge1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRvcklucHV0LCByZXNvdXJjZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG59XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJGaWxlRWRpdG9yRmFjdG9yeSh7XG5cblx0dHlwZUlkOiBGSUxFX0VESVRPUl9JTlBVVF9JRCxcblxuXHRjcmVhdGVGaWxlRWRpdG9yOiAocmVzb3VyY2UsIHByZWZlcnJlZFJlc291cmNlLCBwcmVmZXJyZWROYW1lLCBwcmVmZXJyZWREZXNjcmlwdGlvbiwgcHJlZmVycmVkRW5jb2RpbmcsIHByZWZlcnJlZExhbmd1YWdlSWQsIHByZWZlcnJlZENvbnRlbnRzLCBpbnN0YW50aWF0aW9uU2VydmljZSk6IElGaWxlRWRpdG9ySW5wdXQgPT4ge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlRWRpdG9ySW5wdXQsIHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgcHJlZmVycmVkTmFtZSwgcHJlZmVycmVkRGVzY3JpcHRpb24sIHByZWZlcnJlZEVuY29kaW5nLCBwcmVmZXJyZWRMYW5ndWFnZUlkLCBwcmVmZXJyZWRDb250ZW50cyk7XG5cdH0sXG5cblx0aXNGaWxlRWRpdG9yOiAob2JqKTogb2JqIGlzIElGaWxlRWRpdG9ySW5wdXQgPT4ge1xuXHRcdHJldHVybiBvYmogaW5zdGFuY2VvZiBGaWxlRWRpdG9ySW5wdXQ7XG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgVGVzdFRleHRSZXNvdXJjZUVkaXRvciBleHRlbmRzIFRleHRSZXNvdXJjZUVkaXRvciB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUVkaXRvckNvbnRyb2wocGFyZW50OiBIVE1MRWxlbWVudCwgY29uZmlndXJhdGlvbjogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JDb250cm9sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0Q29kZUVkaXRvciwgcGFyZW50LCBjb25maWd1cmF0aW9uLCB7fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGV4dEZpbGVFZGl0b3IgZXh0ZW5kcyBUZXh0RmlsZUVkaXRvciB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUVkaXRvckNvbnRyb2wocGFyZW50OiBIVE1MRWxlbWVudCwgY29uZmlndXJhdGlvbjogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JDb250cm9sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0Q29kZUVkaXRvciwgcGFyZW50LCBjb25maWd1cmF0aW9uLCB7IGNvbnRyaWJ1dGlvbnM6IFtdIH0pKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgcmVhc29uOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IHNlbGVjdGlvbiA/IHVwY2FzdDxJRWRpdG9yT3B0aW9ucywgSVRleHRFZGl0b3JPcHRpb25zPih7IHNlbGVjdGlvbiB9KSA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyByZWFzb24gfSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZWxlY3Rpb24oKTogSUVkaXRvclBhbmVTZWxlY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG5cdFx0aWYgKCFvcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRTZWxlY3Rpb24gPSAob3B0aW9ucyBhcyBJVGV4dEVkaXRvck9wdGlvbnMpLnNlbGVjdGlvbjtcblx0XHRpZiAoIXRleHRTZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBUZXh0RWRpdG9yUGFuZVNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKHRleHRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB0ZXh0U2VsZWN0aW9uLnN0YXJ0Q29sdW1uLCB0ZXh0U2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPz8gdGV4dFNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHRleHRTZWxlY3Rpb24uZW5kQ29sdW1uID8/IHRleHRTZWxlY3Rpb24uc3RhcnRDb2x1bW4pKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgZXh0ZW5kcyBJSW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRzdHViPFQ+KHNlcnZpY2U6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBjdG9yOiBhbnkpOiBUO1xufVxuXG5leHBvcnQgY2xhc3MgVGVzdFdvcmtpbmdDb3B5U2VydmljZSBleHRlbmRzIFdvcmtpbmdDb3B5U2VydmljZSB7XG5cdHRlc3RVbnJlZ2lzdGVyV29ya2luZ0NvcHkod29ya2luZ0NvcHk6IElXb3JraW5nQ29weSk6IHZvaWQge1xuXHRcdHJldHVybiBzdXBlci51bnJlZ2lzdGVyV29ya2luZ0NvcHkod29ya2luZ0NvcHkpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZShcblx0b3ZlcnJpZGVzPzoge1xuXHRcdGVudmlyb25tZW50U2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJRW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRcdGZpbGVTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElGaWxlU2VydmljZTtcblx0XHR3b3JraW5nQ29weUJhY2t1cFNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGV4dEZpbGVTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElUZXh0RmlsZVNlcnZpY2U7XG5cdFx0cGF0aFNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSVBhdGhTZXJ2aWNlO1xuXHRcdGVkaXRvclNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSUVkaXRvclNlcnZpY2U7XG5cdFx0Y29udGV4dEtleVNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdHRleHRFZGl0b3JTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElUZXh0RWRpdG9yU2VydmljZTtcblx0fSxcblx0ZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4gPSBuZXcgRGlzcG9zYWJsZVN0b3JlKClcbik6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFtJTGlmZWN5Y2xlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKV0sXG5cdFx0W0lBY3Rpb25WaWV3SXRlbVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOdWxsQWN0aW9uVmlld0l0ZW1TZXJ2aWNlKV0sXG5cdCkpKTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yV29ya2VyU2VydmljZSwgbmV3IFRlc3RFZGl0b3JXb3JrZXJTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JraW5nQ29weVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFdvcmtpbmdDb3B5U2VydmljZSgpKSk7XG5cdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IG92ZXJyaWRlcz8uZW52aXJvbm1lbnRTZXJ2aWNlID8gb3ZlcnJpZGVzLmVudmlyb25tZW50U2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkgOiBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IG92ZXJyaWRlcz8uY29udGV4dEtleVNlcnZpY2UgPyBvdmVycmlkZXMuY29udGV4dEtleVNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpIDogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9ja0NvbnRleHRLZXlTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKFRlc3RXb3Jrc3BhY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gb3ZlcnJpZGVzPy5jb25maWd1cmF0aW9uU2VydmljZSA/IG92ZXJyaWRlcy5jb25maWd1cmF0aW9uU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkgOiBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRmaWxlczoge1xuXHRcdFx0cGFydGljaXBhbnRzOiB7XG5cdFx0XHRcdHRpbWVvdXQ6IDYwMDAwXG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHRjb25zdCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0VGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UoY29uZmlnU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudFNlcnZpY2UsIG5ldyBUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UsIG5ldyBUZXN0TGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQYXRoU2VydmljZSwgb3ZlcnJpZGVzPy5wYXRoU2VydmljZSA/IG92ZXJyaWRlcy5wYXRoU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkgOiBuZXcgVGVzdFBhdGhTZXJ2aWNlKCkpO1xuXHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gbmV3IFRlc3RMYXlvdXRTZXJ2aWNlKCk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCBuZXcgVGVzdERpYWxvZ1NlcnZpY2UoKSk7XG5cdGNvbnN0IGFjY2Vzc2liaWxpdHlTZXJ2aWNlID0gbmV3IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSgpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY2Nlc3NpYmlsaXR5U2VydmljZSwgYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsIHtcblx0XHRwbGF5U2lnbmFsOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0aXNTb3VuZEVuYWJsZWQoc2lnbmFsOiB1bmtub3duKSB7IHJldHVybiBmYWxzZTsgfSxcblx0fSBhcyBhbnkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlRGlhbG9nU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdEZpbGVEaWFsb2dTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSGlzdG9yeVNlcnZpY2UsIG5ldyBUZXN0SGlzdG9yeVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCBuZXcgVGVzdFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlKGNvbmZpZ1NlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVW5kb1JlZG9TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbmRvUmVkb1NlcnZpY2UpKTtcblx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gbmV3IFRlc3RUaGVtZVNlcnZpY2UoKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGhlbWVTZXJ2aWNlLCB0aGVtZVNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLCBuZXcgVGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTW9kZWxTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZWxTZXJ2aWNlKSkpO1xuXHRjb25zdCBmaWxlU2VydmljZSA9IG92ZXJyaWRlcz8uZmlsZVNlcnZpY2UgPyBvdmVycmlkZXMuZmlsZVNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpIDogZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBVcmlJZGVudGl0eVNlcnZpY2UoZmlsZVNlcnZpY2UpKSk7XG5cdGNvbnN0IG1hcmtlclNlcnZpY2UgPSBuZXcgVGVzdE1hcmtlclNlcnZpY2UoKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWFya2VyU2VydmljZSwgbWFya2VyU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0RmlsZXNDb25maWd1cmF0aW9uU2VydmljZSkpKTtcblx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgb3ZlcnJpZGVzPy53b3JraW5nQ29weUJhY2t1cFNlcnZpY2UgPyBvdmVycmlkZXM/LndvcmtpbmdDb3B5QmFja3VwU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkgOiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1lbnVTZXJ2aWNlLCBuZXcgVGVzdE1lbnVTZXJ2aWNlKCkpO1xuXHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IG5ldyBNb2NrS2V5YmluZGluZ1NlcnZpY2UoKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJS2V5YmluZGluZ1NlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGVjb3JhdGlvbnNTZXJ2aWNlLCBuZXcgVGVzdERlY29yYXRpb25zU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2luZ0NvcHlGaWxlU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGV4dEZpbGVTZXJ2aWNlLCBvdmVycmlkZXM/LnRleHRGaWxlU2VydmljZSA/IG92ZXJyaWRlcy50ZXh0RmlsZVNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpIDogZGlzcG9zYWJsZXMuYWRkKDxJVGV4dEZpbGVTZXJ2aWNlPmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXh0RmlsZVNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvc3RTZXJ2aWNlLCA8SUhvc3RTZXJ2aWNlPmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RIb3N0U2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXh0TW9kZWxTZXJ2aWNlLCA8SVRleHRNb2RlbFNlcnZpY2U+ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRNb2RlbFJlc29sdmVyU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nZ2VyU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TG9nZ2VyU2VydmljZShUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lKSkpO1xuXHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBuZXcgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UoW25ldyBUZXN0RWRpdG9yR3JvdXBWaWV3KDApXSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIGVkaXRvckdyb3VwU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwgPElMYWJlbFNlcnZpY2U+ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhYmVsU2VydmljZSkpKTtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IG92ZXJyaWRlcz8uZWRpdG9yU2VydmljZSA/IG92ZXJyaWRlcy5lZGl0b3JTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSA6IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvclNlcnZpY2UoZWRpdG9yR3JvdXBTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JQYW5lU2VydmljZSwgbmV3IEVkaXRvclBhbmVTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JraW5nQ29weUVkaXRvclNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclJlc29sdmVyU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclJlc29sdmVyU2VydmljZSkpKTtcblx0Y29uc3QgdGV4dEVkaXRvclNlcnZpY2UgPSBvdmVycmlkZXM/LnRleHRFZGl0b3JTZXJ2aWNlID8gb3ZlcnJpZGVzLnRleHRFZGl0b3JTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSA6IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RWRpdG9yU2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXh0RWRpdG9yU2VydmljZSwgdGV4dEVkaXRvclNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb2RlRWRpdG9yU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBDb2RlRWRpdG9yU2VydmljZShlZGl0b3JTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UGFuZUNvbXBvc2l0ZVNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaXN0U2VydmljZSwgbmV3IFRlc3RMaXN0U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dFZpZXdTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29udGV4dFZpZXdTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0TWVudVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0TWVudVNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFF1aWNrSW5wdXRTZXJ2aWNlKGNvbmZpZ1NlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRoZW1lU2VydmljZSwgbGF5b3V0U2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlc1NlcnZpY2UsIG5ldyBUZXN0V29ya3NwYWNlc1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlKGZhbHNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbEluc3RhbmNlU2VydmljZSwgbmV3IFRlc3RUZXJtaW5hbEluc3RhbmNlU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxFZGl0b3JTZXJ2aWNlLCBuZXcgVGVzdFRlcm1pbmFsRWRpdG9yU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxHcm91cFNlcnZpY2UsIG5ldyBUZXN0VGVybWluYWxHcm91cFNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsIG5ldyBUZXN0VGVybWluYWxQcm9maWxlU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBuZXcgVGVzdFRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbExvZ1NlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvZ1NlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVsZXZhdGVkRmlsZVNlcnZpY2UsIG5ldyBCcm93c2VyRWxldmF0ZWRGaWxlU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UsIG5ldyBSZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEN1c3RvbUVkaXRvckxhYmVsU2VydmljZShjb25maWdTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG92ZXJTZXJ2aWNlLCBOdWxsSG92ZXJTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgbmV3IFRlc3RDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RDaGF0V2lkZ2V0U2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEZWZhdWx0QWNjb3VudFNlcnZpY2UsIERlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xufVxuXG5leHBvcnQgY2xhc3MgVGVzdFNlcnZpY2VBY2Nlc3NvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwdWJsaWMgbGlmZWN5Y2xlU2VydmljZTogVGVzdExpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHVibGljIHRleHRGaWxlU2VydmljZTogVGVzdFRleHRGaWxlU2VydmljZSxcblx0XHRASVRleHRFZGl0b3JTZXJ2aWNlIHB1YmxpYyB0ZXh0RWRpdG9yU2VydmljZTogSVRleHRFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwdWJsaWMgd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHB1YmxpYyBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0RmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHB1YmxpYyBjb250ZXh0U2VydmljZTogVGVzdENvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHB1YmxpYyBtb2RlbFNlcnZpY2U6IE1vZGVsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHB1YmxpYyBmaWxlU2VydmljZTogVGVzdEZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHVibGljIGZpbGVEaWFsb2dTZXJ2aWNlOiBUZXN0RmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHB1YmxpYyBkaWFsb2dTZXJ2aWNlOiBUZXN0RGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSBwdWJsaWMgd29ya2luZ0NvcHlTZXJ2aWNlOiBUZXN0V29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwdWJsaWMgZWRpdG9yU2VydmljZTogVGVzdEVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JQYW5lU2VydmljZSBwdWJsaWMgZWRpdG9yUGFuZVNlcnZpY2U6IElFZGl0b3JQYW5lU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwdWJsaWMgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHVibGljIHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHB1YmxpYyBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHB1YmxpYyBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHVibGljIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHVibGljIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIHB1YmxpYyB1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlOiBVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHVibGljIHRlc3RDb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHB1YmxpYyB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2U6IFRlc3RXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwdWJsaWMgaG9zdFNlcnZpY2U6IFRlc3RIb3N0U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHB1YmxpYyBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHB1YmxpYyBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHB1YmxpYyBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwdWJsaWMgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHVibGljIGluc3RhbnRpdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHVibGljIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHB1YmxpYyB3b3JraW5nQ29weUVkaXRvclNlcnZpY2U6IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwdWJsaWMgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVsZXZhdGVkRmlsZVNlcnZpY2UgcHVibGljIGVsZXZhdGVkRmlsZVNlcnZpY2U6IElFbGV2YXRlZEZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwdWJsaWMgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogVGVzdFdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdFx0QElEZWNvcmF0aW9uc1NlcnZpY2UgcHVibGljIGRlY29yYXRpb25zU2VydmljZTogSURlY29yYXRpb25zU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwdWJsaWMgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRleHRGaWxlU2VydmljZSBleHRlbmRzIEJyb3dzZXJUZXh0RmlsZVNlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRTdHJlYW1FcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHdyaXRlRXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U6IElVbnRpdGxlZFRleHRFZGl0b3JNb2RlbE1hbmFnZXIsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVsZXZhdGVkRmlsZVNlcnZpY2UgZWxldmF0ZWRGaWxlU2VydmljZTogSUVsZXZhdGVkRmlsZVNlcnZpY2UsXG5cdFx0QElEZWNvcmF0aW9uc1NlcnZpY2UgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHR1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLFxuXHRcdFx0bGlmZWN5Y2xlU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0bW9kZWxTZXJ2aWNlLFxuXHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0ZGlhbG9nU2VydmljZSxcblx0XHRcdGZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdFx0dGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29kZUVkaXRvclNlcnZpY2UsXG5cdFx0XHRwYXRoU2VydmljZSxcblx0XHRcdHdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0XHR1cmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0XHRsYW5ndWFnZVNlcnZpY2UsXG5cdFx0XHRlbGV2YXRlZEZpbGVTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdGRlY29yYXRpb25zU2VydmljZVxuXHRcdCk7XG5cdH1cblxuXHRzZXRSZWFkU3RyZWFtRXJyb3JPbmNlKGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLnJlYWRTdHJlYW1FcnJvciA9IGVycm9yO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVhZFN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRUZXh0RmlsZU9wdGlvbnMpOiBQcm9taXNlPElUZXh0RmlsZVN0cmVhbUNvbnRlbnQ+IHtcblx0XHRpZiAodGhpcy5yZWFkU3RyZWFtRXJyb3IpIHtcblx0XHRcdGNvbnN0IGVycm9yID0gdGhpcy5yZWFkU3RyZWFtRXJyb3I7XG5cdFx0XHR0aGlzLnJlYWRTdHJlYW1FcnJvciA9IHVuZGVmaW5lZDtcblxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGVTdHJlYW0ocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogY29udGVudC5yZXNvdXJjZSxcblx0XHRcdG5hbWU6IGNvbnRlbnQubmFtZSxcblx0XHRcdG10aW1lOiBjb250ZW50Lm10aW1lLFxuXHRcdFx0Y3RpbWU6IGNvbnRlbnQuY3RpbWUsXG5cdFx0XHRldGFnOiBjb250ZW50LmV0YWcsXG5cdFx0XHRlbmNvZGluZzogJ3V0ZjgnLFxuXHRcdFx0dmFsdWU6IGF3YWl0IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbShjb250ZW50LnZhbHVlKSxcblx0XHRcdHNpemU6IDEwLFxuXHRcdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdFx0bG9ja2VkOiBmYWxzZSxcblx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHNldFdyaXRlRXJyb3JPbmNlKGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLndyaXRlRXJyb3IgPSBlcnJvcjtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHdyaXRlKHJlc291cmNlOiBVUkksIHZhbHVlOiBzdHJpbmcgfCBJVGV4dFNuYXBzaG90LCBvcHRpb25zPzogSVdyaXRlVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRpZiAodGhpcy53cml0ZUVycm9yKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IHRoaXMud3JpdGVFcnJvcjtcblx0XHRcdHRoaXMud3JpdGVFcnJvciA9IHVuZGVmaW5lZDtcblxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLndyaXRlKHJlc291cmNlLCB2YWx1ZSwgb3B0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RCcm93c2VyVGV4dEZpbGVTZXJ2aWNlV2l0aEVuY29kaW5nT3ZlcnJpZGVzIGV4dGVuZHMgQnJvd3NlclRleHRGaWxlU2VydmljZSB7XG5cblx0cHJpdmF0ZSBfdGVzdEVuY29kaW5nOiBUZXN0RW5jb2RpbmdPcmFjbGUgfCB1bmRlZmluZWQ7XG5cdG92ZXJyaWRlIGdldCBlbmNvZGluZygpOiBUZXN0RW5jb2RpbmdPcmFjbGUge1xuXHRcdGlmICghdGhpcy5fdGVzdEVuY29kaW5nKSB7XG5cdFx0XHR0aGlzLl90ZXN0RW5jb2RpbmcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RFbmNvZGluZ09yYWNsZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl90ZXN0RW5jb2Rpbmc7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFbmNvZGluZ09yYWNsZSBleHRlbmRzIEVuY29kaW5nT3JhY2xlIHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IGVuY29kaW5nT3ZlcnJpZGVzKCk6IElFbmNvZGluZ092ZXJyaWRlW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHR7IGV4dGVuc2lvbjogJ3V0ZjE2bGUnLCBlbmNvZGluZzogVVRGMTZsZSB9LFxuXHRcdFx0eyBleHRlbnNpb246ICd1dGYxNmJlJywgZW5jb2Rpbmc6IFVURjE2YmUgfSxcblx0XHRcdHsgZXh0ZW5zaW9uOiAndXRmOGJvbScsIGVuY29kaW5nOiBVVEY4X3dpdGhfYm9tIH1cblx0XHRdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldCBlbmNvZGluZ092ZXJyaWRlcyhvdmVycmlkZXM6IElFbmNvZGluZ092ZXJyaWRlW10pIHsgfVxufVxuXG5jbGFzcyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlV2l0aEFyZ3MgZXh0ZW5kcyBCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHtcblx0YXJncyA9IFtdO1xufVxuXG5leHBvcnQgY29uc3QgVGVzdEVudmlyb25tZW50U2VydmljZSA9IG5ldyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlV2l0aEFyZ3MoJycsIFVSSS5maWxlKCd0ZXN0cycpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtdGVzdHMnIH0pLCBPYmplY3QuY3JlYXRlKG51bGwpLCBUZXN0UHJvZHVjdFNlcnZpY2UpO1xuXG5leHBvcnQgY2xhc3MgVGVzdFByb2dyZXNzU2VydmljZSBpbXBsZW1lbnRzIElQcm9ncmVzc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHdpdGhQcm9ncmVzcyhcblx0XHRvcHRpb25zOiBJUHJvZ3Jlc3NPcHRpb25zIHwgSVByb2dyZXNzRGlhbG9nT3B0aW9ucyB8IElQcm9ncmVzc1dpbmRvd09wdGlvbnMgfCBJUHJvZ3Jlc3NOb3RpZmljYXRpb25PcHRpb25zIHwgSVByb2dyZXNzQ29tcG9zaXRlT3B0aW9ucyxcblx0XHR0YXNrOiAocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4gUHJvbWlzZTxhbnk+LFxuXHRcdG9uRGlkQ2FuY2VsPzogKChjaG9pY2U/OiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHZvaWQpIHwgdW5kZWZpbmVkXG5cdCk6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRhc2soUHJvZ3Jlc3MuTm9uZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3REZWNvcmF0aW9uc1NlcnZpY2UgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURlY29yYXRpb25zOiBFdmVudDxJUmVzb3VyY2VEZWNvcmF0aW9uQ2hhbmdlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblxuXHRyZWdpc3RlckRlY29yYXRpb25zUHJvdmlkZXIoX3Byb3ZpZGVyOiBJRGVjb3JhdGlvbnNQcm92aWRlcik6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHRnZXREZWNvcmF0aW9uKF91cmk6IFVSSSwgX2luY2x1ZGVDaGlsZHJlbjogYm9vbGVhbiwgX292ZXJ3cml0ZT86IElEZWNvcmF0aW9uRGF0YSk6IElEZWNvcmF0aW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdE1lbnVTZXJ2aWNlIGltcGxlbWVudHMgSU1lbnVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjcmVhdGVNZW51KF9pZDogTWVudUlkLCBfc2NvcGVkS2V5YmluZGluZ1NlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IElNZW51IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBbXVxuXHRcdH07XG5cdH1cblxuXHRnZXRNZW51QWN0aW9ucyhpZDogTWVudUlkLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBvcHRpb25zPzogSU1lbnVBY3Rpb25PcHRpb25zKTogW3N0cmluZywgQXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGdldE1lbnVDb250ZXh0cyhpZDogTWVudUlkKTogUmVhZG9ubHlTZXQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIG5ldyBTZXQ8c3RyaW5nPigpO1xuXHR9XG5cblx0cmVzZXRIaWRkZW5TdGF0ZXMoKTogdm9pZCB7XG5cdFx0Ly8gbm90aGluZ1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RmlsZURpYWxvZ1NlcnZpY2UgaW1wbGVtZW50cyBJRmlsZURpYWxvZ1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY29uZmlybVJlc3VsdCE6IENvbmZpcm1SZXN1bHQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2Vcblx0KSB7IH1cblx0YXN5bmMgZGVmYXVsdEZpbGVQYXRoKF9zY2hlbWVGaWx0ZXI/OiBzdHJpbmcpOiBQcm9taXNlPFVSST4geyByZXR1cm4gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpOyB9XG5cdGFzeW5jIGRlZmF1bHRGb2xkZXJQYXRoKF9zY2hlbWVGaWx0ZXI/OiBzdHJpbmcpOiBQcm9taXNlPFVSST4geyByZXR1cm4gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpOyB9XG5cdGFzeW5jIGRlZmF1bHRXb3Jrc3BhY2VQYXRoKF9zY2hlbWVGaWx0ZXI/OiBzdHJpbmcpOiBQcm9taXNlPFVSST4geyByZXR1cm4gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpOyB9XG5cdGFzeW5jIHByZWZlcnJlZEhvbWUoX3NjaGVtZUZpbHRlcj86IHN0cmluZyk6IFByb21pc2U8VVJJPiB7IHJldHVybiB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7IH1cblx0cGlja0ZpbGVGb2xkZXJBbmRPcGVuKF9vcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTxhbnk+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgwKTsgfVxuXHRwaWNrRmlsZUFuZE9wZW4oX29wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBQcm9taXNlPGFueT4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKDApOyB9XG5cdHBpY2tGb2xkZXJBbmRPcGVuKF9vcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTxhbnk+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgwKTsgfVxuXHRwaWNrV29ya3NwYWNlQW5kT3Blbihfb3B0aW9uczogSVBpY2tBbmRPcGVuT3B0aW9ucyk6IFByb21pc2U8YW55PiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoMCk7IH1cblxuXHRwcml2YXRlIGZpbGVUb1NhdmUhOiBVUkk7XG5cdHNldFBpY2tGaWxlVG9TYXZlKHBhdGg6IFVSSSk6IHZvaWQgeyB0aGlzLmZpbGVUb1NhdmUgPSBwYXRoOyB9XG5cdHBpY2tGaWxlVG9TYXZlKGRlZmF1bHRVcmk6IFVSSSwgYXZhaWxhYmxlRmlsZVN5c3RlbXM/OiBzdHJpbmdbXSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5maWxlVG9TYXZlKTsgfVxuXG5cdHNob3dTYXZlRGlhbG9nKF9vcHRpb25zOiBJU2F2ZURpYWxvZ09wdGlvbnMpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7IH1cblx0c2hvd09wZW5EaWFsb2coX29wdGlvbnM6IElPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8VVJJW10gfCB1bmRlZmluZWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9XG5cblx0c2V0Q29uZmlybVJlc3VsdChyZXN1bHQ6IENvbmZpcm1SZXN1bHQpOiB2b2lkIHsgdGhpcy5jb25maXJtUmVzdWx0ID0gcmVzdWx0OyB9XG5cdHNob3dTYXZlQ29uZmlybShmaWxlTmFtZXNPclJlc291cmNlczogKHN0cmluZyB8IFVSSSlbXSk6IFByb21pc2U8Q29uZmlybVJlc3VsdD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY29uZmlybVJlc3VsdCk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RMYXlvdXRTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtiZW5jaExheW91dFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdG9wZW5lZERlZmF1bHRFZGl0b3JzID0gZmFsc2U7XG5cblx0bWFpbkNvbnRhaW5lckRpbWVuc2lvbjogSURpbWVuc2lvbiA9IHsgd2lkdGg6IDgwMCwgaGVpZ2h0OiA2MDAgfTtcblx0YWN0aXZlQ29udGFpbmVyRGltZW5zaW9uOiBJRGltZW5zaW9uID0geyB3aWR0aDogODAwLCBoZWlnaHQ6IDYwMCB9O1xuXHRtYWluQ29udGFpbmVyT2Zmc2V0OiBJTGF5b3V0T2Zmc2V0SW5mbyA9IHsgdG9wOiAwLCBxdWlja1BpY2tUb3A6IDAgfTtcblx0YWN0aXZlQ29udGFpbmVyT2Zmc2V0OiBJTGF5b3V0T2Zmc2V0SW5mbyA9IHsgdG9wOiAwLCBxdWlja1BpY2tUb3A6IDAgfTtcblxuXHRtYWluQ29udGFpbmVyOiBIVE1MRWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keTtcblx0Y29udGFpbmVycyA9IFttYWluV2luZG93LmRvY3VtZW50LmJvZHldO1xuXHRhY3RpdmVDb250YWluZXI6IEhUTUxFbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlWmVuTW9kZTogRXZlbnQ8Ym9vbGVhbj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1haW5FZGl0b3JDZW50ZXJlZExheW91dDogRXZlbnQ8Ym9vbGVhbj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVdpbmRvd01heGltaXplZDogRXZlbnQ8eyB3aW5kb3dJZDogbnVtYmVyOyBtYXhpbWl6ZWQ6IGJvb2xlYW4gfT4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhbmVsUG9zaXRpb246IEV2ZW50PHN0cmluZz4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhbmVsQWxpZ25tZW50OiBFdmVudDxQYW5lbEFsaWdubWVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5OiBFdmVudDxJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRvbkRpZExheW91dE1haW5Db250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRvbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkTGF5b3V0Q29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQWRkQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VBY3RpdmVDb250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZUF1eGlsaWFyeUJhck1heGltaXplZCA9IEV2ZW50Lk5vbmU7XG5cblx0bGF5b3V0KCk6IHZvaWQgeyB9XG5cdGlzUmVzdG9yZWQoKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdHdoZW5SZWFkeTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR3aGVuUmVzdG9yZWQ6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0aGFzRm9jdXMoX3BhcnQ6IFBhcnRzKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGZvY3VzUGFydChfcGFydDogUGFydHMpOiB2b2lkIHsgfVxuXHRoYXNNYWluV2luZG93Qm9yZGVyKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0TWFpbldpbmRvd0JvcmRlclJhZGl1cygpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGlzVmlzaWJsZShfcGFydDogUGFydHMpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0Z2V0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keTsgfVxuXHR3aGVuQ29udGFpbmVyU3R5bGVzTG9hZGVkKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGlzVGl0bGVCYXJIaWRkZW4oKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc1N0YXR1c0JhckhpZGRlbigpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGlzQWN0aXZpdHlCYXJIaWRkZW4oKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRzZXRBY3Rpdml0eUJhckhpZGRlbihfaGlkZGVuOiBib29sZWFuKTogdm9pZCB7IH1cblx0c2V0QmFubmVySGlkZGVuKF9oaWRkZW46IGJvb2xlYW4pOiB2b2lkIHsgfVxuXHRpc1NpZGVCYXJIaWRkZW4oKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBzZXRFZGl0b3JIaWRkZW4oX2hpZGRlbjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldFNpZGVCYXJIaWRkZW4oX2hpZGRlbjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldEF1eGlsaWFyeUJhckhpZGRlbihfaGlkZGVuOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2V0UGFydEhpZGRlbihfaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGlzU2Vjb25kYXJ5U2lkZUJhclZpc2libGUoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHR0b2dnbGVTZWNvbmRhcnlTaWRlQmFyKCk6IHZvaWQgeyB9XG5cdGlzUGFuZWxIaWRkZW4oKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBzZXRQYW5lbEhpZGRlbihfaGlkZGVuOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0dG9nZ2xlTWF4aW1pemVkUGFuZWwoKTogdm9pZCB7IH1cblx0aXNQYW5lbE1heGltaXplZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdHRvZ2dsZU1heGltaXplZEF1eGlsaWFyeUJhcigpOiB2b2lkIHsgfVxuXHRzZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc0F1eGlsaWFyeUJhck1heGltaXplZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGdldE1lbnViYXJWaXNpYmlsaXR5KCk6IE1lbnVCYXJWaXNpYmlsaXR5IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHR0b2dnbGVNZW51QmFyKCk6IHZvaWQgeyB9XG5cdGdldFNpZGVCYXJQb3NpdGlvbigpIHsgcmV0dXJuIDA7IH1cblx0Z2V0UGFuZWxQb3NpdGlvbigpIHsgcmV0dXJuIDA7IH1cblx0Z2V0UGFuZWxBbGlnbm1lbnQoKTogUGFuZWxBbGlnbm1lbnQgeyByZXR1cm4gJ2NlbnRlcic7IH1cblx0YXN5bmMgc2V0UGFuZWxQb3NpdGlvbihfcG9zaXRpb246IFBhcnRQb3NpdGlvbik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldFBhbmVsQWxpZ25tZW50KF9hbGlnbm1lbnQ6IFBhbmVsQWxpZ25tZW50KTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YWRkQ2xhc3MoX2NsYXp6OiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRyZW1vdmVDbGFzcyhfY2xheno6IHN0cmluZyk6IHZvaWQgeyB9XG5cdGdldE1heGltdW1FZGl0b3JEaW1lbnNpb25zKCk6IElEaW1lbnNpb24geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHRvZ2dsZVplbk1vZGUoKTogdm9pZCB7IH1cblx0aXNNYWluRWRpdG9yTGF5b3V0Q2VudGVyZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRjZW50ZXJNYWluRWRpdG9yTGF5b3V0KF9hY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHsgfVxuXHRyZXNpemVQYXJ0KF9wYXJ0OiBQYXJ0cywgX3NpemVDaGFuZ2VXaWR0aDogbnVtYmVyLCBfc2l6ZUNoYW5nZUhlaWdodDogbnVtYmVyKTogdm9pZCB7IH1cblx0Z2V0U2l6ZShwYXJ0OiBQYXJ0cyk6IElWaWV3U2l6ZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRTaXplKHBhcnQ6IFBhcnRzLCBzaXplOiBJVmlld1NpemUpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZ2lzdGVyUGFydChwYXJ0OiBQYXJ0KTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdGlzV2luZG93TWF4aW1pemVkKHRhcmdldFdpbmRvdzogV2luZG93KSB7IHJldHVybiBmYWxzZTsgfVxuXHR1cGRhdGVXaW5kb3dNYXhpbWl6ZWRTdGF0ZSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgbWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7IH1cblx0Z2V0VmlzaWJsZU5laWdoYm9yUGFydChwYXJ0OiBQYXJ0cywgZGlyZWN0aW9uOiBEaXJlY3Rpb24pOiBQYXJ0cyB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Zm9jdXMoKSB7IH1cbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5jb25zdCBhY3RpdmVWaWV3bGV0OiBQYW5lQ29tcG9zaXRlID0ge30gYXMgYW55O1xuXG5leHBvcnQgY2xhc3MgVGVzdFBhbmVDb21wb3NpdGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZFBhbmVDb21wb3NpdGVPcGVuOiBFdmVudDx7IGNvbXBvc2l0ZTogSVBhbmVDb21wb3NpdGU7IHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0+O1xuXHRyZWFkb25seSBvbkRpZFBhbmVDb21wb3NpdGVDbG9zZTogRXZlbnQ8eyBjb21wb3NpdGU6IElQYW5lQ29tcG9zaXRlOyB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiB9PjtcblxuXHRwcml2YXRlIHBhcnRzID0gbmV3IE1hcDxWaWV3Q29udGFpbmVyTG9jYXRpb24sIElQYW5lQ29tcG9zaXRlUGFydD4oKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5wYXJ0cy5zZXQoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCBuZXcgVGVzdFBhbmVsUGFydCgpKTtcblx0XHR0aGlzLnBhcnRzLnNldChWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgbmV3IFRlc3RTaWRlQmFyUGFydCgpKTtcblxuXHRcdHRoaXMub25EaWRQYW5lQ29tcG9zaXRlT3BlbiA9IEV2ZW50LmFueSguLi4oW1ZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXJdLm1hcChsb2MgPT4gRXZlbnQubWFwKHRoaXMucGFydHMuZ2V0KGxvYykhLm9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4sIGNvbXBvc2l0ZSA9PiB7IHJldHVybiB7IGNvbXBvc2l0ZSwgdmlld0NvbnRhaW5lckxvY2F0aW9uOiBsb2MgfTsgfSkpKSk7XG5cdFx0dGhpcy5vbkRpZFBhbmVDb21wb3NpdGVDbG9zZSA9IEV2ZW50LmFueSguLi4oW1ZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXJdLm1hcChsb2MgPT4gRXZlbnQubWFwKHRoaXMucGFydHMuZ2V0KGxvYykhLm9uRGlkUGFuZUNvbXBvc2l0ZUNsb3NlLCBjb21wb3NpdGUgPT4geyByZXR1cm4geyBjb21wb3NpdGUsIHZpZXdDb250YWluZXJMb2NhdGlvbjogbG9jIH07IH0pKSkpO1xuXHR9XG5cblx0Z2V0UGFydElkKHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogU0lOR0xFX1dJTkRPV19QQVJUUyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5wYXJ0SWQ7XG5cdH1cblx0Z2V0UmVnaXN0cnlJZCh2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5yZWdpc3RyeUlkO1xuXHR9XG5cdG9wZW5QYW5lQ29tcG9zaXRlKGlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPElQYW5lQ29tcG9zaXRlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5vcGVuUGFuZUNvbXBvc2l0ZShpZCwgZm9jdXMpO1xuXHR9XG5cdGdldEFjdGl2ZVBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKCk7XG5cdH1cblx0Z2V0UGFuZUNvbXBvc2l0ZShpZDogc3RyaW5nLCB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0QnlMb2NhdGlvbih2aWV3Q29udGFpbmVyTG9jYXRpb24pLmdldFBhbmVDb21wb3NpdGUoaWQpO1xuXHR9XG5cdGdldFBhbmVDb21wb3NpdGVzKHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3JbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5nZXRQYW5lQ29tcG9zaXRlcygpO1xuXHR9XG5cdGdldFByb2dyZXNzSW5kaWNhdG9yKGlkOiBzdHJpbmcsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogSVByb2dyZXNzSW5kaWNhdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0QnlMb2NhdGlvbih2aWV3Q29udGFpbmVyTG9jYXRpb24pLmdldFByb2dyZXNzSW5kaWNhdG9yKGlkKTtcblx0fVxuXHRoaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZSgpO1xuXHR9XG5cdGdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQodmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbikuZ2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZCgpO1xuXHR9XG5cblx0Z2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyh2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHN0cmluZ1tdIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcyh2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHN0cmluZ1tdIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRQYW5lQ29tcG9zaXRlSWRzKHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogc3RyaW5nW10ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogSVBhbmVDb21wb3NpdGVQYXJ0IHtcblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wYXJ0cy5nZXQodmlld0NvbnRhaW5lckxvY2F0aW9uKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RTaWRlQmFyUGFydCBpbXBsZW1lbnRzIElQYW5lQ29tcG9zaXRlUGFydCB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdG9uRGlkVmlld2xldFJlZ2lzdGVyRW1pdHRlciA9IG5ldyBFbWl0dGVyPFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yPigpO1xuXHRvbkRpZFZpZXdsZXREZXJlZ2lzdGVyRW1pdHRlciA9IG5ldyBFbWl0dGVyPFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yPigpO1xuXHRvbkRpZFZpZXdsZXRPcGVuRW1pdHRlciA9IG5ldyBFbWl0dGVyPElQYW5lQ29tcG9zaXRlPigpO1xuXHRvbkRpZFZpZXdsZXRDbG9zZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJUGFuZUNvbXBvc2l0ZT4oKTtcblxuXHRyZWFkb25seSBwYXJ0SWQgPSBQYXJ0cy5TSURFQkFSX1BBUlQ7XG5cdHJlYWRvbmx5IHJlZ2lzdHJ5SWQgPSBQYW5lQ29tcG9zaXRlRXh0ZW5zaW9ucy5WaWV3bGV0cztcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQgPSB1bmRlZmluZWQhO1xuXHRtaW5pbXVtV2lkdGggPSAwO1xuXHRtYXhpbXVtV2lkdGggPSAwO1xuXHRtaW5pbXVtSGVpZ2h0ID0gMDtcblx0bWF4aW11bUhlaWdodCA9IDA7XG5cdG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0b25EaWRQYW5lQ29tcG9zaXRlT3BlbiA9IHRoaXMub25EaWRWaWV3bGV0T3BlbkVtaXR0ZXIuZXZlbnQ7XG5cdG9uRGlkUGFuZUNvbXBvc2l0ZUNsb3NlID0gdGhpcy5vbkRpZFZpZXdsZXRDbG9zZUVtaXR0ZXIuZXZlbnQ7XG5cblx0b3BlblBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZywgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7IH1cblx0Z2V0UGFuZUNvbXBvc2l0ZXMoKTogUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3JbXSB7IHJldHVybiBbXTsgfVxuXHRnZXRBbGxWaWV3bGV0cygpOiBQYW5lQ29tcG9zaXRlRGVzY3JpcHRvcltdIHsgcmV0dXJuIFtdOyB9XG5cdGdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKTogSVBhbmVDb21wb3NpdGUgeyByZXR1cm4gYWN0aXZlVmlld2xldDsgfVxuXHRnZXREZWZhdWx0Vmlld2xldElkKCk6IHN0cmluZyB7IHJldHVybiAnd29ya2JlbmNoLnZpZXcuZXhwbG9yZXInOyB9XG5cdGdldFBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZyk6IFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRnZXRQcm9ncmVzc0luZGljYXRvcihpZDogc3RyaW5nKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0aGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoKTogdm9pZCB7IH1cblx0Z2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gdW5kZWZpbmVkITsgfVxuXHRkaXNwb3NlKCkgeyB9XG5cdGdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoKSB7IHJldHVybiBbXTsgfVxuXHRnZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpIHsgcmV0dXJuIFtdOyB9XG5cdGdldFBhbmVDb21wb3NpdGVJZHMoKSB7IHJldHVybiBbXTsgfVxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFBhbmVsUGFydCBpbXBsZW1lbnRzIElQYW5lQ29tcG9zaXRlUGFydCB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50ID0gdW5kZWZpbmVkITtcblx0bWluaW11bVdpZHRoID0gMDtcblx0bWF4aW11bVdpZHRoID0gMDtcblx0bWluaW11bUhlaWdodCA9IDA7XG5cdG1heGltdW1IZWlnaHQgPSAwO1xuXHRvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4gPSBuZXcgRW1pdHRlcjxJUGFuZUNvbXBvc2l0ZT4oKS5ldmVudDtcblx0b25EaWRQYW5lQ29tcG9zaXRlQ2xvc2UgPSBuZXcgRW1pdHRlcjxJUGFuZUNvbXBvc2l0ZT4oKS5ldmVudDtcblx0cmVhZG9ubHkgcGFydElkID0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ7XG5cdHJlYWRvbmx5IHJlZ2lzdHJ5SWQgPSBQYW5lQ29tcG9zaXRlRXh0ZW5zaW9ucy5BdXhpbGlhcnk7XG5cblx0YXN5bmMgb3BlblBhbmVDb21wb3NpdGUoaWQ/OiBzdHJpbmcsIGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Z2V0UGFuZUNvbXBvc2l0ZShpZDogc3RyaW5nKTogYW55IHsgcmV0dXJuIGFjdGl2ZVZpZXdsZXQ7IH1cblx0Z2V0UGFuZUNvbXBvc2l0ZXMoKSB7IHJldHVybiBbXTsgfVxuXHRnZXRQaW5uZWRQYW5lQ29tcG9zaXRlSWRzKCkgeyByZXR1cm4gW107IH1cblx0Z2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoKSB7IHJldHVybiBbXTsgfVxuXHRnZXRQYW5lQ29tcG9zaXRlSWRzKCkgeyByZXR1cm4gW107IH1cblx0Z2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpOiBJUGFuZUNvbXBvc2l0ZSB7IHJldHVybiBhY3RpdmVWaWV3bGV0OyB9XG5cdHNldFBhbmVsRW5hYmxlbWVudChpZDogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKTogdm9pZCB7IH1cblx0ZGlzcG9zZSgpIHsgfVxuXHRnZXRQcm9ncmVzc0luZGljYXRvcihpZDogc3RyaW5nKSB7IHJldHVybiBudWxsITsgfVxuXHRoaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZSgpOiB2b2lkIHsgfVxuXHRnZXRMYXN0QWN0aXZlUGFuZUNvbXBvc2l0ZUlkKCk6IHN0cmluZyB7IHJldHVybiB1bmRlZmluZWQhOyB9XG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcik6IHZvaWQgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0Vmlld3NTZXJ2aWNlIGltcGxlbWVudHMgSVZpZXdzU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cblx0b25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eSA9IG5ldyBFbWl0dGVyPHsgaWQ6IHN0cmluZzsgdmlzaWJsZTogYm9vbGVhbjsgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiB9PigpLmV2ZW50O1xuXHRpc1ZpZXdDb250YWluZXJWaXNpYmxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0aXNWaWV3Q29udGFpbmVyQWN0aXZlKGlkOiBzdHJpbmcpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0Z2V0VmlzaWJsZVZpZXdDb250YWluZXIoKTogVmlld0NvbnRhaW5lciB8IG51bGwgeyByZXR1cm4gbnVsbDsgfVxuXHRvcGVuVmlld0NvbnRhaW5lcihpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPElQYW5lQ29tcG9zaXRlIHwgbnVsbD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpOyB9XG5cdGNsb3NlVmlld0NvbnRhaW5lcihpZDogc3RyaW5nKTogdm9pZCB7IH1cblxuXHRvbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5RW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgaWQ6IHN0cmluZzsgdmlzaWJsZTogYm9vbGVhbiB9PigpO1xuXHRvbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5ID0gdGhpcy5vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5RW1pdHRlci5ldmVudDtcblx0b25EaWRDaGFuZ2VGb2N1c2VkVmlld0VtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRvbkRpZENoYW5nZUZvY3VzZWRWaWV3ID0gdGhpcy5vbkRpZENoYW5nZUZvY3VzZWRWaWV3RW1pdHRlci5ldmVudDtcblx0aXNWaWV3VmlzaWJsZShpZDogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGdldEFjdGl2ZVZpZXdXaXRoSWQ8VCBleHRlbmRzIElWaWV3PihpZDogc3RyaW5nKTogVCB8IG51bGwgeyByZXR1cm4gbnVsbDsgfVxuXHRnZXRWaWV3V2l0aElkPFQgZXh0ZW5kcyBJVmlldz4oaWQ6IHN0cmluZyk6IFQgfCBudWxsIHsgcmV0dXJuIG51bGw7IH1cblx0b3BlblZpZXc8VCBleHRlbmRzIElWaWV3PihpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPFQgfCBudWxsPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7IH1cblx0Y2xvc2VWaWV3KGlkOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRnZXRWaWV3UHJvZ3Jlc3NJbmRpY2F0b3IoaWQ6IHN0cmluZykgeyByZXR1cm4gbnVsbCE7IH1cblx0Z2V0QWN0aXZlVmlld1BhbmVDb250YWluZXJXaXRoSWQoaWQ6IHN0cmluZykgeyByZXR1cm4gbnVsbDsgfVxuXHRnZXRGb2N1c2VkVmlld05hbWUoKTogc3RyaW5nIHsgcmV0dXJuICcnOyB9XG5cdGdldEZvY3VzZWRWaWV3KCk6IElWaWV3RGVzY3JpcHRvciB8IG51bGwgeyByZXR1cm4gbnVsbDsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UgaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHVibGljIGdyb3VwczogVGVzdEVkaXRvckdyb3VwVmlld1tdID0gW10pIHsgfVxuXG5cdHJlYWRvbmx5IHBhcnRzOiByZWFkb25seSBJRWRpdG9yUGFydFtdID0gW3RoaXNdO1xuXG5cdHdpbmRvd0lkID0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZDtcblxuXHRyZWFkb25seSBvbkRpZENyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQ6IEV2ZW50PElBdXhpbGlhcnlFZGl0b3JQYXJ0PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlR3JvdXA6IEV2ZW50PElFZGl0b3JHcm91cD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEFjdGl2YXRlR3JvdXA6IEV2ZW50PElFZGl0b3JHcm91cEFjdGl2YXRpb25FdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEFkZEdyb3VwOiBFdmVudDxJRWRpdG9yR3JvdXA+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVHcm91cDogRXZlbnQ8SUVkaXRvckdyb3VwPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkTW92ZUdyb3VwOiBFdmVudDxJRWRpdG9yR3JvdXA+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cEluZGV4OiBFdmVudDxJRWRpdG9yR3JvdXA+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cExhYmVsOiBFdmVudDxJRWRpdG9yR3JvdXA+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cExvY2tlZDogRXZlbnQ8SUVkaXRvckdyb3VwPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQ6IEV2ZW50PGJvb2xlYW4+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXQ6IEV2ZW50PElEaW1lbnNpb24+ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkU2Nyb2xsID0gRXZlbnQuTm9uZTtcblx0b25XaWxsRGlzcG9zZSA9IEV2ZW50Lk5vbmU7XG5cblx0b3JpZW50YXRpb24gPSBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUw7XG5cdGlzUmVhZHkgPSB0cnVlO1xuXHR3aGVuUmVhZHk6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0d2hlblJlc3RvcmVkOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdGhhc1Jlc3RvcmFibGVTdGF0ZSA9IGZhbHNlO1xuXG5cdGNvbnRlbnREaW1lbnNpb24gPSB7IHdpZHRoOiA4MDAsIGhlaWdodDogNjAwIH07XG5cblx0Z2V0IGFjdGl2ZUdyb3VwKCk6IElFZGl0b3JHcm91cCB7IHJldHVybiB0aGlzLmdyb3Vwc1swXTsgfVxuXHRnZXQgc2lkZUdyb3VwKCk6IElFZGl0b3JHcm91cCB7IHJldHVybiB0aGlzLmdyb3Vwc1swXTsgfVxuXHRnZXQgY291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZ3JvdXBzLmxlbmd0aDsgfVxuXG5cdGdldFBhcnQoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCk6IElFZGl0b3JQYXJ0IHsgcmV0dXJuIHRoaXM7IH1cblx0c2F2ZVdvcmtpbmdTZXQobmFtZTogc3RyaW5nKTogSUVkaXRvcldvcmtpbmdTZXQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0V29ya2luZ1NldHMoKTogSUVkaXRvcldvcmtpbmdTZXRbXSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhcHBseVdvcmtpbmdTZXQod29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQgfCAnZW1wdHknLCBvcHRpb25zPzogSUVkaXRvcldvcmtpbmdTZXRPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRkZWxldGVXb3JraW5nU2V0KHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0KTogUHJvbWlzZTxib29sZWFuPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRHcm91cHMoX29yZGVyPzogR3JvdXBzT3JkZXIpOiByZWFkb25seSBJRWRpdG9yR3JvdXBbXSB7IHJldHVybiB0aGlzLmdyb3VwczsgfVxuXHRnZXRHcm91cChpZGVudGlmaWVyOiBudW1iZXIpOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5ncm91cHMuZmluZChncm91cCA9PiBncm91cC5pZCA9PT0gaWRlbnRpZmllcik7IH1cblx0Z2V0TGFiZWwoX2lkZW50aWZpZXI6IG51bWJlcik6IHN0cmluZyB7IHJldHVybiAnR3JvdXAgMSc7IH1cblx0ZmluZEdyb3VwKF9zY29wZTogSUZpbmRHcm91cFNjb3BlLCBfc291cmNlPzogbnVtYmVyIHwgSUVkaXRvckdyb3VwLCBfd3JhcD86IGJvb2xlYW4pOiBJRWRpdG9yR3JvdXAgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGFjdGl2YXRlR3JvdXAoX2dyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXApOiBJRWRpdG9yR3JvdXAgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHJlc3RvcmVHcm91cChfZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCk6IElFZGl0b3JHcm91cCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0Z2V0U2l6ZShfZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCk6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB7IHJldHVybiB7IHdpZHRoOiAxMDAsIGhlaWdodDogMTAwIH07IH1cblx0c2V0U2l6ZShfZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCwgX3NpemU6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSk6IHZvaWQgeyB9XG5cdGFycmFuZ2VHcm91cHMoX2FycmFuZ2VtZW50OiBHcm91cHNBcnJhbmdlbWVudCk6IHZvaWQgeyB9XG5cdHRvZ2dsZU1heGltaXplR3JvdXAoKTogdm9pZCB7IH1cblx0aGFzTWF4aW1pemVkR3JvdXAoKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0dG9nZ2xlRXhwYW5kR3JvdXAoKTogdm9pZCB7IH1cblx0YXBwbHlMYXlvdXQoX2xheW91dDogRWRpdG9yR3JvdXBMYXlvdXQpOiB2b2lkIHsgfVxuXHRnZXRMYXlvdXQoKTogRWRpdG9yR3JvdXBMYXlvdXQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHNldEdyb3VwT3JpZW50YXRpb24oX29yaWVudGF0aW9uOiBHcm91cE9yaWVudGF0aW9uKTogdm9pZCB7IH1cblx0YWRkR3JvdXAoX2xvY2F0aW9uOiBudW1iZXIgfCBJRWRpdG9yR3JvdXAsIF9kaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRyZW1vdmVHcm91cChfZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCk6IHZvaWQgeyB9XG5cdG1vdmVHcm91cChfZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCwgX2xvY2F0aW9uOiBudW1iZXIgfCBJRWRpdG9yR3JvdXAsIF9kaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRtZXJnZUdyb3VwKF9ncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwLCBfdGFyZ2V0OiBudW1iZXIgfCBJRWRpdG9yR3JvdXAsIF9vcHRpb25zPzogSU1lcmdlR3JvdXBPcHRpb25zKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0bWVyZ2VBbGxHcm91cHMoX2dyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXAsIF9vcHRpb25zPzogSU1lcmdlR3JvdXBPcHRpb25zKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0Y29weUdyb3VwKF9ncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwLCBfbG9jYXRpb246IG51bWJlciB8IElFZGl0b3JHcm91cCwgX2RpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24pOiBJRWRpdG9yR3JvdXAgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGNlbnRlckxheW91dChhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHsgfVxuXHRpc0xheW91dENlbnRlcmVkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Y3JlYXRlRWRpdG9yRHJvcFRhcmdldChjb250YWluZXI6IEhUTUxFbGVtZW50LCBkZWxlZ2F0ZTogSUVkaXRvckRyb3BUYXJnZXREZWxlZ2F0ZSk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHRyZWdpc3RlckNvbnRleHRLZXlQcm92aWRlcjxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlPihfcHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxUPik6IElEaXNwb3NhYmxlIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRnZXRTY29wZWRJbnN0YW50aWF0aW9uU2VydmljZShwYXJ0OiBJRWRpdG9yUGFydCk6IElJbnN0YW50aWF0aW9uU2VydmljZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXG5cdHBhcnRPcHRpb25zITogSUVkaXRvclBhcnRPcHRpb25zO1xuXHRlbmZvcmNlUGFydE9wdGlvbnMob3B0aW9uczogSUVkaXRvclBhcnRPcHRpb25zKTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cblx0cmVhZG9ubHkgbWFpblBhcnQgPSB0aGlzO1xuXHRyZWFkb25seSBhY3RpdmVNb2RhbEVkaXRvclBhcnQ6IElNb2RhbEVkaXRvclBhcnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlZ2lzdGVyRWRpdG9yUGFydChwYXJ0OiBhbnkpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0Y3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydCgpOiBQcm9taXNlPElBdXhpbGlhcnlFZGl0b3JQYXJ0PiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRjcmVhdGVNb2RhbEVkaXRvclBhcnQoKTogUHJvbWlzZTxJTW9kYWxFZGl0b3JQYXJ0PiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEVkaXRvckdyb3VwVmlldyBpbXBsZW1lbnRzIElFZGl0b3JHcm91cFZpZXcge1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBpZDogbnVtYmVyKSB7IH1cblxuXHR3aW5kb3dJZCA9IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQ7XG5cdGdyb3Vwc1ZpZXc6IElFZGl0b3JHcm91cHNWaWV3ID0gdW5kZWZpbmVkITtcblx0YWN0aXZlRWRpdG9yUGFuZSE6IElWaXNpYmxlRWRpdG9yUGFuZTtcblx0YWN0aXZlRWRpdG9yITogRWRpdG9ySW5wdXQ7XG5cdHNlbGVjdGVkRWRpdG9yczogRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRwcmV2aWV3RWRpdG9yITogRWRpdG9ySW5wdXQ7XG5cdGNvdW50ITogbnVtYmVyO1xuXHRzdGlja3lDb3VudCE6IG51bWJlcjtcblx0ZGlzcG9zZWQhOiBib29sZWFuO1xuXHRlZGl0b3JzOiByZWFkb25seSBFZGl0b3JJbnB1dFtdID0gW107XG5cdGxhYmVsITogc3RyaW5nO1xuXHRpc0xvY2tlZCE6IGJvb2xlYW47XG5cdGFyaWFMYWJlbCE6IHN0cmluZztcblx0aW5kZXghOiBudW1iZXI7XG5cdHdoZW5SZXN0b3JlZDogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRlbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdG1pbmltdW1XaWR0aCE6IG51bWJlcjtcblx0bWF4aW11bVdpZHRoITogbnVtYmVyO1xuXHRtaW5pbXVtSGVpZ2h0ITogbnVtYmVyO1xuXHRtYXhpbXVtSGVpZ2h0ITogbnVtYmVyO1xuXG5cdHRpdGxlSGVpZ2h0ITogSUVkaXRvckdyb3VwVGl0bGVIZWlnaHQ7XG5cblx0aXNFbXB0eSA9IHRydWU7XG5cblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZE1vZGVsQ2hhbmdlOiBFdmVudDxJR3JvdXBNb2RlbENoYW5nZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uV2lsbENsb3NlRWRpdG9yOiBFdmVudDxJRWRpdG9yQ2xvc2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENsb3NlRWRpdG9yOiBFdmVudDxJRWRpdG9yQ2xvc2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZE9wZW5FZGl0b3JGYWlsOiBFdmVudDxFZGl0b3JJbnB1dD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25XaWxsTW92ZUVkaXRvcjogRXZlbnQ8SUVkaXRvcldpbGxNb3ZlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25XaWxsT3BlbkVkaXRvcjogRXZlbnQ8SUVkaXRvcldpbGxPcGVuRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2U6IEV2ZW50PElBY3RpdmVFZGl0b3JDaGFuZ2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXG5cdGdldEVkaXRvcnMoX29yZGVyPzogRWRpdG9yc09yZGVyKTogcmVhZG9ubHkgRWRpdG9ySW5wdXRbXSB7IHJldHVybiBbXTsgfVxuXHRmaW5kRWRpdG9ycyhfcmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IEVkaXRvcklucHV0W10geyByZXR1cm4gW107IH1cblx0Z2V0RWRpdG9yQnlJbmRleChfaW5kZXg6IG51bWJlcik6IEVkaXRvcklucHV0IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRnZXRJbmRleE9mRWRpdG9yKF9lZGl0b3I6IEVkaXRvcklucHV0KTogbnVtYmVyIHsgcmV0dXJuIC0xOyB9XG5cdGlzRmlyc3QoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0aXNMYXN0KGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdG9wZW5FZGl0b3IoX2VkaXRvcjogRWRpdG9ySW5wdXQsIF9vcHRpb25zPzogSUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0b3BlbkVkaXRvcnMoX2VkaXRvcnM6IEVkaXRvcklucHV0V2l0aE9wdGlvbnNbXSk6IFByb21pc2U8SUVkaXRvclBhbmU+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRpc1Bpbm5lZChfZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0aXNTdGlja3koX2VkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGlzVHJhbnNpZW50KF9lZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc0FjdGl2ZShfZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdHNldFNlbGVjdGlvbihfYWN0aXZlU2VsZWN0ZWRFZGl0b3I6IEVkaXRvcklucHV0LCBfaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnM6IEVkaXRvcklucHV0W10pOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRpc1NlbGVjdGVkKF9lZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRjb250YWlucyhjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0bW92ZUVkaXRvcihfZWRpdG9yOiBFZGl0b3JJbnB1dCwgX3RhcmdldDogSUVkaXRvckdyb3VwLCBfb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG1vdmVFZGl0b3JzKF9lZGl0b3JzOiBFZGl0b3JJbnB1dFdpdGhPcHRpb25zW10sIF90YXJnZXQ6IElFZGl0b3JHcm91cCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRjb3B5RWRpdG9yKF9lZGl0b3I6IEVkaXRvcklucHV0LCBfdGFyZ2V0OiBJRWRpdG9yR3JvdXAsIF9vcHRpb25zPzogSUVkaXRvck9wdGlvbnMpOiB2b2lkIHsgfVxuXHRjb3B5RWRpdG9ycyhfZWRpdG9yczogRWRpdG9ySW5wdXRXaXRoT3B0aW9uc1tdLCBfdGFyZ2V0OiBJRWRpdG9yR3JvdXApOiB2b2lkIHsgfVxuXHRhc3luYyBjbG9zZUVkaXRvcihfZWRpdG9yPzogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJQ2xvc2VFZGl0b3JPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiB0cnVlOyB9XG5cdGFzeW5jIGNsb3NlRWRpdG9ycyhfZWRpdG9yczogRWRpdG9ySW5wdXRbXSB8IElDbG9zZUVkaXRvcnNGaWx0ZXIsIG9wdGlvbnM/OiBJQ2xvc2VFZGl0b3JPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiB0cnVlOyB9XG5cdGNsb3NlQWxsRWRpdG9ycyhvcHRpb25zPzogSUNsb3NlQWxsRWRpdG9yc09wdGlvbnMpOiBhbnkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyByZXBsYWNlRWRpdG9ycyhfZWRpdG9yczogSUVkaXRvclJlcGxhY2VtZW50W10pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRwaW5FZGl0b3IoX2VkaXRvcj86IEVkaXRvcklucHV0KTogdm9pZCB7IH1cblx0c3RpY2tFZGl0b3IoZWRpdG9yPzogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpOiB2b2lkIHsgfVxuXHR1bnN0aWNrRWRpdG9yKGVkaXRvcj86IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogdm9pZCB7IH1cblx0bG9jayhsb2NrZWQ6IGJvb2xlYW4pOiB2b2lkIHsgfVxuXHRmb2N1cygpOiB2b2lkIHsgfVxuXHRnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRzZXRBY3RpdmUoX2lzQWN0aXZlOiBib29sZWFuKTogdm9pZCB7IH1cblx0bm90aWZ5SW5kZXhDaGFuZ2VkKF9pbmRleDogbnVtYmVyKTogdm9pZCB7IH1cblx0bm90aWZ5TGFiZWxDaGFuZ2VkKF9sYWJlbDogc3RyaW5nKTogdm9pZCB7IH1cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxuXHR0b0pTT04oKTogb2JqZWN0IHsgcmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7IH1cblx0bGF5b3V0KF93aWR0aDogbnVtYmVyLCBfaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHsgfVxuXHRyZWxheW91dCgpIHsgfVxuXHRjcmVhdGVFZGl0b3JBY3Rpb25zKF9tZW51RGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB7IGFjdGlvbnM6IElUb29sYmFyQWN0aW9uczsgb25EaWRDaGFuZ2U6IEV2ZW50PElNZW51Q2hhbmdlRXZlbnQ+IH0geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RWRpdG9yR3JvdXBBY2Nlc3NvciBpbXBsZW1lbnRzIElFZGl0b3JHcm91cHNWaWV3IHtcblxuXHRsYWJlbDogc3RyaW5nID0gJyc7XG5cdHdpbmRvd0lkID0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZDtcblxuXHRncm91cHM6IElFZGl0b3JHcm91cFZpZXdbXSA9IFtdO1xuXHRhY3RpdmVHcm91cCE6IElFZGl0b3JHcm91cFZpZXc7XG5cblx0cGFydE9wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucyA9IHsgLi4uREVGQVVMVF9FRElUT1JfUEFSVF9PUFRJT05TIH07XG5cblx0b25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkVmlzaWJpbGl0eUNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cblx0Z2V0R3JvdXAoaWRlbnRpZmllcjogbnVtYmVyKTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRHcm91cHMob3JkZXI6IEdyb3Vwc09yZGVyKTogSUVkaXRvckdyb3VwVmlld1tdIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGFjdGl2YXRlR3JvdXAoaWRlbnRpZmllcjogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldyk6IElFZGl0b3JHcm91cFZpZXcgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0cmVzdG9yZUdyb3VwKGlkZW50aWZpZXI6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcpOiBJRWRpdG9yR3JvdXBWaWV3IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGFkZEdyb3VwKGxvY2F0aW9uOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3LCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwVmlldyB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRtZXJnZUdyb3VwKGdyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3LCB0YXJnZXQ6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcsIG9wdGlvbnM/OiBJTWVyZ2VHcm91cE9wdGlvbnMgfCB1bmRlZmluZWQpOiBib29sZWFuIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdG1vdmVHcm91cChncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldywgbG9jYXRpb246IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcsIGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24pOiBJRWRpdG9yR3JvdXBWaWV3IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNvcHlHcm91cChncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldywgbG9jYXRpb246IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcsIGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24pOiBJRWRpdG9yR3JvdXBWaWV3IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlbW92ZUdyb3VwKGdyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3KTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhcnJhbmdlR3JvdXBzKGFycmFuZ2VtZW50OiBHcm91cHNBcnJhbmdlbWVudCwgdGFyZ2V0PzogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0dG9nZ2xlTWF4aW1pemVHcm91cChncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldyk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0dG9nZ2xlRXhwYW5kR3JvdXAoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RWRpdG9yU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBFZGl0b3JTZXJ2aWNlSW1wbCB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZTogRXZlbnQ8SVZpc2libGVFZGl0b3JzQ2hhbmdlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRFZGl0b3JzQ2hhbmdlOiBFdmVudDxJRWRpdG9yc0NoYW5nZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uV2lsbE9wZW5FZGl0b3I6IEV2ZW50PElFZGl0b3JXaWxsT3BlbkV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2VFZGl0b3I6IEV2ZW50PElFZGl0b3JDbG9zZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkT3BlbkVkaXRvckZhaWw6IEV2ZW50PElFZGl0b3JJZGVudGlmaWVyPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZTogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgX2FjdGl2ZVRleHRFZGl0b3JDb250cm9sOiBJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKCk6IElDb2RlRWRpdG9yIHwgSURpZmZFZGl0b3IgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7IH1cblx0cHVibGljIHNldCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCh2YWx1ZTogSUNvZGVFZGl0b3IgfCBJRGlmZkVkaXRvciB8IHVuZGVmaW5lZCkgeyB0aGlzLl9hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IHZhbHVlOyB9XG5cblx0YWN0aXZlRWRpdG9yUGFuZTogSVZpc2libGVFZGl0b3JQYW5lIHwgdW5kZWZpbmVkO1xuXHRhY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2FjdGl2ZUVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgYWN0aXZlRWRpdG9yKCk6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUVkaXRvcjsgfVxuXHRwdWJsaWMgc2V0IGFjdGl2ZUVkaXRvcih2YWx1ZTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpIHsgdGhpcy5fYWN0aXZlRWRpdG9yID0gdmFsdWU7IH1cblxuXHRlZGl0b3JzOiByZWFkb25seSBFZGl0b3JJbnB1dFtdID0gW107XG5cdG1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnM6IHJlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblx0dmlzaWJsZUVkaXRvclBhbmVzOiByZWFkb25seSBJVmlzaWJsZUVkaXRvclBhbmVbXSA9IFtdO1xuXHR2aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzID0gW107XG5cdGdldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMob3JkZXI6IEVkaXRvcnNPcmRlcik6IHJlYWRvbmx5IChJRWRpdG9yIHwgSURpZmZFZGl0b3IpW10geyByZXR1cm4gdGhpcy52aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzOyB9XG5cdHZpc2libGVFZGl0b3JzOiByZWFkb25seSBFZGl0b3JJbnB1dFtdID0gW107XG5cdGNvdW50ID0gdGhpcy5lZGl0b3JzLmxlbmd0aDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGVkaXRvckdyb3VwU2VydmljZT86IElFZGl0b3JHcm91cHNTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXHRjcmVhdGVTY29wZWQoZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyKTogSUVkaXRvclNlcnZpY2UgeyByZXR1cm4gdGhpczsgfVxuXHRnZXRFZGl0b3JzKCkgeyByZXR1cm4gW107IH1cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGZpbmRFZGl0b3JzKCkgeyByZXR1cm4gW10gYXMgYW55OyB9XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zLCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD47XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD47XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIGdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPElUZXh0RGlmZkVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0LCBvcHRpb25zT3JHcm91cD86IElFZGl0b3JPcHRpb25zIHwgUHJlZmVycmVkR3JvdXAsIGdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gb3BlbkVkaXRvciB0YWtlcyBvd25lcnNoaXAgb2YgdGhlIGlucHV0LCByZWdpc3RlciBpdCB0byB0aGUgVGVzdEVkaXRvclNlcnZpY2Vcblx0XHQvLyBzbyBpdCdzIG5vdCBtYXJrZWQgYXMgbGVha2VkIGR1cmluZyB0ZXN0cy5cblx0XHRpZiAoJ2Rpc3Bvc2UnIGluIGVkaXRvcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRhc3luYyBjbG9zZUVkaXRvcihlZGl0b3I6IElFZGl0b3JJZGVudGlmaWVyLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGNsb3NlRWRpdG9ycyhlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGRvUmVzb2x2ZUVkaXRvck9wZW5SZXF1ZXN0KGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogW0lFZGl0b3JHcm91cCwgRWRpdG9ySW5wdXQsIElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvckdyb3VwU2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gW3RoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLCBlZGl0b3IgYXMgRWRpdG9ySW5wdXQsIHVuZGVmaW5lZF07XG5cdH1cblx0b3BlbkVkaXRvcnMoX2VkaXRvcnM6IGFueSwgX2dyb3VwPzogYW55KTogUHJvbWlzZTxJRWRpdG9yUGFuZVtdPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0aXNPcGVuZWQoX2VkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc1Zpc2libGUoX2VkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdHJlcGxhY2VFZGl0b3JzKF9lZGl0b3JzOiBhbnksIF9ncm91cDogYW55KSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTsgfVxuXHRzYXZlKGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10sIG9wdGlvbnM/OiBJU2F2ZUVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxJU2F2ZUVkaXRvcnNSZXN1bHQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHNhdmVBbGwob3B0aW9ucz86IElTYXZlRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPElTYXZlRWRpdG9yc1Jlc3VsdD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0cmV2ZXJ0KGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10sIG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0cmV2ZXJ0QWxsKG9wdGlvbnM/OiBJUmV2ZXJ0QWxsRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIGV4dGVuZHMgSW5NZW1vcnlXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IHJlc29sdmVkOiBTZXQ8SVdvcmtpbmdDb3B5SWRlbnRpZmllcj4gPSBuZXcgU2V0KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHBhcnNlQmFja3VwQ29udGVudCh0ZXh0QnVmZmVyRmFjdG9yeTogSVRleHRCdWZmZXJGYWN0b3J5KTogc3RyaW5nIHtcblx0XHRjb25zdCB0ZXh0QnVmZmVyID0gdGV4dEJ1ZmZlckZhY3RvcnkuY3JlYXRlKERlZmF1bHRFbmRPZkxpbmUuTEYpLnRleHRCdWZmZXI7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gdGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZSgxLCAxLCBsaW5lQ291bnQsIHRleHRCdWZmZXIuZ2V0TGluZUxlbmd0aChsaW5lQ291bnQpICsgMSk7XG5cblx0XHRyZXR1cm4gdGV4dEJ1ZmZlci5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UsIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZTxUIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YT4oaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8SVJlc29sdmVkV29ya2luZ0NvcHlCYWNrdXA8VD4gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLnJlc29sdmVkLmFkZChpZGVudGlmaWVyKTtcblxuXHRcdHJldHVybiBzdXBlci5yZXNvbHZlKGlkZW50aWZpZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1VudHlwZWRXb3JraW5nQ29weUlkKHJlc291cmNlOiBVUkkpOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyIHtcblx0cmV0dXJuIHRvVHlwZWRXb3JraW5nQ29weUlkKHJlc291cmNlLCAnJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1R5cGVkV29ya2luZ0NvcHlJZChyZXNvdXJjZTogVVJJLCB0eXBlSWQgPSAndGVzdEJhY2t1cFR5cGVJZCcpOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyIHtcblx0cmV0dXJuIHsgdHlwZUlkLCByZXNvdXJjZSB9O1xufVxuXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlUZXN0V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIGV4dGVuZHMgQnJvd3NlcldvcmtpbmdDb3B5QmFja3VwU2VydmljZSB7XG5cblx0cHJpdmF0ZSBiYWNrdXBSZXNvdXJjZUpvaW5lcnM6IEZ1bmN0aW9uW107XG5cdHByaXZhdGUgZGlzY2FyZEJhY2t1cEpvaW5lcnM6IEZ1bmN0aW9uW107XG5cblx0ZGlzY2FyZGVkQmFja3VwczogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IFRlc3RFbnZpcm9ubWVudFNlcnZpY2U7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0c3VwZXIobmV3IFRlc3RDb250ZXh0U2VydmljZShUZXN0V29ya3NwYWNlKSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycyA9IFtdO1xuXHRcdHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMgPSBbXTtcblx0XHR0aGlzLmRpc2NhcmRlZEJhY2t1cHMgPSBbXTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHRlc3RHZXRGaWxlU2VydmljZSgpOiBJRmlsZVNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlO1xuXHR9XG5cblx0am9pbkJhY2t1cFJlc291cmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMuYmFja3VwUmVzb3VyY2VKb2luZXJzLnB1c2gocmVzb2x2ZSkpO1xuXHR9XG5cblx0am9pbkRpc2NhcmRCYWNrdXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gdGhpcy5kaXNjYXJkQmFja3VwSm9pbmVycy5wdXNoKHJlc29sdmUpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGJhY2t1cChpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBjb250ZW50PzogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGUsIHZlcnNpb25JZD86IG51bWJlciwgbWV0YT86IGFueSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLmJhY2t1cChpZGVudGlmaWVyLCBjb250ZW50LCB2ZXJzaW9uSWQsIG1ldGEsIHRva2VuKTtcblxuXHRcdHdoaWxlICh0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYmFja3VwUmVzb3VyY2VKb2luZXJzLnBvcCgpISgpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc2NhcmRCYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLmRpc2NhcmRCYWNrdXAoaWRlbnRpZmllcik7XG5cdFx0dGhpcy5kaXNjYXJkZWRCYWNrdXBzLnB1c2goaWRlbnRpZmllcik7XG5cblx0XHR3aGlsZSAodGhpcy5kaXNjYXJkQmFja3VwSm9pbmVycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMucG9wKCkhKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0QmFja3VwQ29udGVudHMoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFJlc291cmNlKTtcblxuXHRcdHJldHVybiBmaWxlQ29udGVudHMudmFsdWUudG9TdHJpbmcoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQgaW1wbGVtZW50cyBJbnRlcm5hbEJlZm9yZVNodXRkb3duRXZlbnQge1xuXG5cdHZhbHVlOiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0ZmluYWxWYWx1ZTogKCgpID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KSB8IHVuZGVmaW5lZDtcblx0cmVhc29uID0gU2h1dGRvd25SZWFzb24uQ0xPU0U7XG5cblx0dmV0byh2YWx1ZTogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pOiB2b2lkIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRmaW5hbFZldG8odmV0b0ZuOiAoKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPik6IHZvaWQge1xuXHRcdHRoaXMudmFsdWUgPSB2ZXRvRm4oKTtcblx0XHR0aGlzLmZpbmFsVmFsdWUgPSB2ZXRvRm47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RXaWxsU2h1dGRvd25FdmVudCBpbXBsZW1lbnRzIFdpbGxTaHV0ZG93bkV2ZW50IHtcblxuXHR2YWx1ZTogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdGpvaW5lcnMgPSAoKSA9PiBbXTtcblx0cmVhc29uID0gU2h1dGRvd25SZWFzb24uQ0xPU0U7XG5cdHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZTtcblxuXHRqb2luKHByb21pc2U6IFByb21pc2U8dm9pZD4gfCAoKCkgPT4gUHJvbWlzZTx2b2lkPiksIGpvaW5lcjogSVdpbGxTaHV0ZG93bkV2ZW50Sm9pbmVyKTogdm9pZCB7XG5cdFx0dGhpcy52YWx1ZS5wdXNoKHR5cGVvZiBwcm9taXNlID09PSAnZnVuY3Rpb24nID8gcHJvbWlzZSgpIDogcHJvbWlzZSk7XG5cdH1cblxuXHRmb3JjZSgpIHsgLyogTm8tT3AgaW4gdGVzdHMgKi8gfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGltcGxlbWVudHMgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKSB7IH1cblxuXHRvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKSB7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9O1xuXHR9XG5cblx0Z2V0VmFsdWU8VD4ocmVzb3VyY2U6IFVSSSwgYXJnMj86IGFueSwgYXJnMz86IGFueSk6IFQge1xuXHRcdGNvbnN0IHBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsID0gRWRpdG9yUG9zaXRpb24uaXNJUG9zaXRpb24oYXJnMikgPyBhcmcyIDogbnVsbDtcblx0XHRjb25zdCBzZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBwb3NpdGlvbiA/ICh0eXBlb2YgYXJnMyA9PT0gJ3N0cmluZycgPyBhcmczIDogdW5kZWZpbmVkKSA6ICh0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycgPyBhcmcyIDogdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzZWN0aW9uLCB7IHJlc291cmNlIH0pIGFzIFQ7XG5cdH1cblxuXHRpbnNwZWN0PFQ+KHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsLCBzZWN0aW9uOiBzdHJpbmcpOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PFQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxUPihzZWN0aW9uLCB7IHJlc291cmNlIH0pO1xuXHR9XG5cblx0dXBkYXRlVmFsdWUocmVzb3VyY2U6IFVSSSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnksIGNvbmZpZ3VyYXRpb25UYXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoa2V5LCB2YWx1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlbW90ZUZpbGVTeXN0ZW1Qcm92aWRlciBpbXBsZW1lbnRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd3JhcHBlZEZzcDogSUZpbGVTeXN0ZW1Qcm92aWRlciwgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBdXRob3JpdHk6IHN0cmluZykge1xuXHRcdHRoaXMuY2FwYWJpbGl0aWVzID0gdGhpcy53cmFwcGVkRnNwLmNhcGFiaWxpdGllcztcblx0XHR0aGlzLm9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzID0gdGhpcy53cmFwcGVkRnNwLm9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VGaWxlID0gRXZlbnQubWFwKHRoaXMud3JhcHBlZEZzcC5vbkRpZENoYW5nZUZpbGUsIGNoYW5nZXMgPT4gY2hhbmdlcy5tYXAoYyA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBjLnR5cGUsXG5cdFx0XHRcdHJlc291cmNlOiBjLnJlc291cmNlLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLCBhdXRob3JpdHk6IHRoaXMucmVtb3RlQXV0aG9yaXR5IH0pLFxuXHRcdFx0fTtcblx0XHR9KSk7XG5cdH1cblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcztcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXM6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmlsZTogRXZlbnQ8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT47XG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdHM6IElXYXRjaE9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7IHJldHVybiB0aGlzLndyYXBwZWRGc3Aud2F0Y2godGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSksIG9wdHMpOyB9XG5cblx0c3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLnN0YXQodGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSkpOyB9XG5cdG1rZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5ta2Rpcih0aGlzLnRvRmlsZVJlc291cmNlKHJlc291cmNlKSk7IH1cblx0cmVhZGRpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxbc3RyaW5nLCBGaWxlVHlwZV1bXT4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLnJlYWRkaXIodGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSkpOyB9XG5cdGRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZURlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5kZWxldGUodGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSksIG9wdHMpOyB9XG5cblx0cmVuYW1lKGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLndyYXBwZWRGc3AucmVuYW1lKHRoaXMudG9GaWxlUmVzb3VyY2UoZnJvbSksIHRoaXMudG9GaWxlUmVzb3VyY2UodG8pLCBvcHRzKTsgfVxuXHRjb3B5KGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLndyYXBwZWRGc3AuY29weSEodGhpcy50b0ZpbGVSZXNvdXJjZShmcm9tKSwgdGhpcy50b0ZpbGVSZXNvdXJjZSh0byksIG9wdHMpOyB9XG5cblx0cmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLnJlYWRGaWxlISh0aGlzLnRvRmlsZVJlc291cmNlKHJlc291cmNlKSk7IH1cblx0d3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdHM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLndyYXBwZWRGc3Aud3JpdGVGaWxlISh0aGlzLnRvRmlsZVJlc291cmNlKHJlc291cmNlKSwgY29udGVudCwgb3B0cyk7IH1cblxuXHRvcGVuKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlT3Blbk9wdGlvbnMpOiBQcm9taXNlPG51bWJlcj4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLm9wZW4hKHRoaXMudG9GaWxlUmVzb3VyY2UocmVzb3VyY2UpLCBvcHRzKTsgfVxuXHRjbG9zZShmZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLndyYXBwZWRGc3AuY2xvc2UhKGZkKTsgfVxuXHRyZWFkKGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLnJlYWQhKGZkLCBwb3MsIGRhdGEsIG9mZnNldCwgbGVuZ3RoKTsgfVxuXHR3cml0ZShmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC53cml0ZSEoZmQsIHBvcywgZGF0YSwgb2Zmc2V0LCBsZW5ndGgpOyB9XG5cblx0cmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLnJlYWRGaWxlU3RyZWFtISh0aGlzLnRvRmlsZVJlc291cmNlKHJlc291cmNlKSwgb3B0cywgdG9rZW4pOyB9XG5cblx0cHJpdmF0ZSB0b0ZpbGVSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogVVJJIHsgcmV0dXJuIHJlc291cmNlLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgYXV0aG9yaXR5OiAnJyB9KTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgaW1wbGVtZW50cyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSB7XG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIHtcblx0XHRyZXR1cm4gRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGVcblx0XHRcdHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlXG5cdFx0XHR8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkkpOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxVaW50OEFycmF5PiB7XG5cdFx0Y29uc3QgQlVGRkVSX1NJWkUgPSA2NCAqIDEwMjQ7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+KGRhdGEgPT4gVlNCdWZmZXIuY29uY2F0KGRhdGEubWFwKGRhdGEgPT4gVlNCdWZmZXIud3JhcChkYXRhKSkpLmJ1ZmZlcik7XG5cblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMucmVhZEZpbGUocmVzb3VyY2UpO1xuXG5cdFx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdFx0XHR3aGlsZSAob2Zmc2V0IDwgZGF0YS5sZW5ndGgpIHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRcdGF3YWl0IHN0cmVhbS53cml0ZShkYXRhLnN1YmFycmF5KG9mZnNldCwgb2Zmc2V0ICsgQlVGRkVSX1NJWkUpKTtcblx0XHRcdFx0XHRvZmZzZXQgKz0gQlVGRkVSX1NJWkU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRzdHJlYW0uZW5kKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRzdHJlYW0uZW5kKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0cmV0dXJuIHN0cmVhbTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0IH07XG5cbmV4cG9ydCBjbGFzcyBUZXN0SG9zdFNlcnZpY2UgaW1wbGVtZW50cyBJSG9zdFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2hhc0ZvY3VzID0gdHJ1ZTtcblx0Z2V0IGhhc0ZvY3VzKCkgeyByZXR1cm4gdGhpcy5faGFzRm9jdXM7IH1cblx0YXN5bmMgaGFkTGFzdEZvY3VzKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gdGhpcy5faGFzRm9jdXM7IH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUZvY3VzID0gbmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1cyA9IHRoaXMuX29uRGlkQ2hhbmdlRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VXaW5kb3cgPSBuZXcgRW1pdHRlcjxudW1iZXI+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlV2luZG93ID0gdGhpcy5fb25EaWRDaGFuZ2VXaW5kb3cuZXZlbnQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGdWxsU2NyZWVuOiBFdmVudDx7IHdpbmRvd0lkOiBudW1iZXI7IGZ1bGxzY3JlZW46IGJvb2xlYW4gfT4gPSBFdmVudC5Ob25lO1xuXG5cdHNldEZvY3VzKGZvY3VzOiBib29sZWFuKSB7XG5cdFx0dGhpcy5faGFzRm9jdXMgPSBmb2N1cztcblx0XHR0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmZpcmUodGhpcy5faGFzRm9jdXMpO1xuXHR9XG5cblx0YXN5bmMgcmVzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZWxvYWQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgd2l0aEV4cGVjdGVkU2h1dGRvd248VD4oZXhwZWN0ZWRTaHV0ZG93blRhc2s6ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gYXdhaXQgZXhwZWN0ZWRTaHV0ZG93blRhc2soKTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG1vdmVUb3AoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ2V0Q3Vyc29yU2NyZWVuUG9pbnQoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIGdldFdpbmRvd3Mob3B0aW9uczogdW5rbm93bikgeyByZXR1cm4gW107IH1cblxuXHRhc3luYyBvcGVuV2luZG93KGFyZzE/OiBJT3BlbkVtcHR5V2luZG93T3B0aW9ucyB8IElXaW5kb3dPcGVuYWJsZVtdLCBhcmcyPzogSU9wZW5XaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyB0b2dnbGVGdWxsU2NyZWVuKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0YXN5bmMgZ2V0U2NyZWVuc2hvdChyZWN0PzogSVJlY3RhbmdsZSk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIGdldE5hdGl2ZVdpbmRvd0hhbmRsZShfd2luZG93SWQ6IG51bWJlcik6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIHNob3dUb2FzdChfb3B0aW9uczogSVRvYXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9hc3RSZXN1bHQ+IHsgcmV0dXJuIHsgc3VwcG9ydGVkOiBmYWxzZSwgY2xpY2tlZDogZmFsc2UgfTsgfVxuXG5cdGFzeW5jIHNldFdpbmRvd0RpbW1lZChfdGFyZ2V0V2luZG93OiBXaW5kb3csIF9kaW1tZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdHJlYWRvbmx5IGNvbG9yU2NoZW1lID0gQ29sb3JTY2hlbWUuREFSSztcblx0b25EaWRDaGFuZ2VDb2xvclNjaGVtZSA9IEV2ZW50Lk5vbmU7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdHRlc3RPbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uOiBhbnkpOiB2b2lkIHtcblx0XHRzdXBlci5vbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uLCB0cnVlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJlYWRvbmx5VGV4dEZpbGVFZGl0b3JNb2RlbCBleHRlbmRzIFRleHRGaWxlRWRpdG9yTW9kZWwge1xuXG5cdG92ZXJyaWRlIGlzUmVhZG9ubHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVzb3VyY2U6IFVSSSwgcHJpdmF0ZSByZWFkb25seSBfdHlwZUlkOiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90eXBlSWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdHlwZUlkO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVzb2x2ZSgpOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgbnVsbD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVGVzdEVkaXRvcihpZDogc3RyaW5nLCBpbnB1dHM6IFN5bmNEZXNjcmlwdG9yPEVkaXRvcklucHV0PltdLCBzZXJpYWxpemVySW5wdXRJZD86IHN0cmluZyk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y2xhc3MgVGVzdEVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdFx0cHJpdmF0ZSBfc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHRcdGNvbnN0cnVjdG9yKGdyb3VwOiBJRWRpdG9yR3JvdXApIHtcblx0XHRcdHN1cGVyKGlkLCBncm91cCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCksIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXG5cdFx0XHRhd2FpdCBpbnB1dC5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgZ2V0SWQoKTogc3RyaW5nIHsgcmV0dXJuIGlkOyB9XG5cdFx0bGF5b3V0KCk6IHZvaWQgeyB9XG5cdFx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcigpOiB2b2lkIHsgfVxuXG5cdFx0b3ZlcnJpZGUgZ2V0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2FibGVzLmFkZChSZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoVGVzdEVkaXRvciwgaWQsICdUZXN0IEVkaXRvciBDb250cm9sJyksIGlucHV0cykpO1xuXG5cdGlmIChzZXJpYWxpemVySW5wdXRJZCkge1xuXG5cdFx0aW50ZXJmYWNlIElTZXJpYWxpemVkVGVzdElucHV0IHtcblx0XHRcdHJlc291cmNlOiBzdHJpbmc7XG5cdFx0fVxuXG5cdFx0Y2xhc3MgRWRpdG9yc09ic2VydmVyVGVzdEVkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblxuXHRcdFx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0c2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB7XG5cdFx0XHRcdGNvbnN0IHRlc3RFZGl0b3JJbnB1dCA9IDxUZXN0RmlsZUVkaXRvcklucHV0PmVkaXRvcklucHV0O1xuXHRcdFx0XHRjb25zdCB0ZXN0SW5wdXQ6IElTZXJpYWxpemVkVGVzdElucHV0ID0ge1xuXHRcdFx0XHRcdHJlc291cmNlOiB0ZXN0RWRpdG9ySW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh0ZXN0SW5wdXQpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJpYWxpemVkRWRpdG9ySW5wdXQ6IHN0cmluZyk6IEVkaXRvcklucHV0IHtcblx0XHRcdFx0Y29uc3QgdGVzdElucHV0OiBJU2VyaWFsaXplZFRlc3RJbnB1dCA9IEpTT04ucGFyc2Uoc2VyaWFsaXplZEVkaXRvcklucHV0KTtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHRlc3RJbnB1dC5yZXNvdXJjZSksIHNlcmlhbGl6ZXJJbnB1dElkISk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKHNlcmlhbGl6ZXJJbnB1dElkLCBFZGl0b3JzT2JzZXJ2ZXJUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyKSk7XG5cdH1cblxuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlc3RGaWxlRWRpdG9yKCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKFJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRcdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRcdFRlc3RUZXh0RmlsZUVkaXRvcixcblx0XHRcdFRlc3RUZXh0RmlsZUVkaXRvci5JRCxcblx0XHRcdCdUZXh0IEZpbGUgRWRpdG9yJ1xuXHRcdCksXG5cdFx0W25ldyBTeW5jRGVzY3JpcHRvcihGaWxlRWRpdG9ySW5wdXQpXVxuXHQpKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlc3RSZXNvdXJjZUVkaXRvcigpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZChSZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0XHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0XHRUZXN0VGV4dFJlc291cmNlRWRpdG9yLFxuXHRcdFx0VGVzdFRleHRSZXNvdXJjZUVkaXRvci5JRCxcblx0XHRcdCdUZXh0IEVkaXRvcidcblx0XHQpLFxuXHRcdFtcblx0XHRcdG5ldyBTeW5jRGVzY3JpcHRvcihVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCksXG5cdFx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpXG5cdFx0XVxuXHQpKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlc3RTaWRlQnlTaWRlRWRpdG9yKCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKFJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRcdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRcdFNpZGVCeVNpZGVFZGl0b3IsXG5cdFx0XHRTaWRlQnlTaWRlRWRpdG9yLklELFxuXHRcdFx0J1RleHQgRWRpdG9yJ1xuXHRcdCksXG5cdFx0W1xuXHRcdFx0bmV3IFN5bmNEZXNjcmlwdG9yKFNpZGVCeVNpZGVFZGl0b3JJbnB1dClcblx0XHRdXG5cdCkpO1xuXG5cdHJldHVybiBkaXNwb3NhYmxlcztcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RGaWxlRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElGaWxlRWRpdG9ySW5wdXQge1xuXG5cdHJlYWRvbmx5IHByZWZlcnJlZFJlc291cmNlO1xuXG5cdGdvdERpc3Bvc2VkID0gZmFsc2U7XG5cdGdvdFNhdmVkID0gZmFsc2U7XG5cdGdvdFNhdmVkQXMgPSBmYWxzZTtcblx0Z290UmV2ZXJ0ZWQgPSBmYWxzZTtcblx0ZGlydHkgPSBmYWxzZTtcblx0bW9kaWZpZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmFpbHMgPSBmYWxzZTtcblxuXHRkaXNhYmxlVG9VbnR5cGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSBfdHlwZUlkOiBzdHJpbmdcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucHJlZmVycmVkUmVzb3VyY2UgPSB0aGlzLnJlc291cmNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpIHsgcmV0dXJuIHRoaXMuX3R5cGVJZDsgfVxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKSB7IHJldHVybiB0aGlzLl90eXBlSWQ7IH1cblxuXHRwcml2YXRlIF9jYXBhYmlsaXRpZXM6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuTm9uZTtcblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7IHJldHVybiB0aGlzLl9jYXBhYmlsaXRpZXM7IH1cblx0b3ZlcnJpZGUgc2V0IGNhcGFiaWxpdGllcyhjYXBhYmlsaXRpZXM6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzKSB7XG5cdFx0aWYgKHRoaXMuX2NhcGFiaWxpdGllcyAhPT0gY2FwYWJpbGl0aWVzKSB7XG5cdFx0XHR0aGlzLl9jYXBhYmlsaXRpZXMgPSBjYXBhYmlsaXRpZXM7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgcmVzb2x2ZSgpOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgbnVsbD4geyByZXR1cm4gIXRoaXMuZmFpbHMgPyBQcm9taXNlLnJlc29sdmUobnVsbCkgOiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2ZhaWxzJykpOyB9XG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXI6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQgfCBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfCBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdXBlci5tYXRjaGVzKG90aGVyKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChvdGhlciBpbnN0YW5jZW9mIEVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gISEob3RoZXI/LnJlc291cmNlICYmIHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gb3RoZXIucmVzb3VyY2UudG9TdHJpbmcoKSAmJiBvdGhlciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQgJiYgb3RoZXIudHlwZUlkID09PSB0aGlzLnR5cGVJZCk7XG5cdFx0fVxuXHRcdHJldHVybiBpc0VxdWFsKHRoaXMucmVzb3VyY2UsIG90aGVyLnJlc291cmNlKSAmJiAodGhpcy5lZGl0b3JJZCA9PT0gb3RoZXIub3B0aW9ucz8ub3ZlcnJpZGUgfHwgb3RoZXIub3B0aW9ucz8ub3ZlcnJpZGUgPT09IHVuZGVmaW5lZCk7XG5cdH1cblx0c2V0UHJlZmVycmVkUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHZvaWQgeyB9XG5cdGFzeW5jIHNldEVuY29kaW5nKGVuY29kaW5nOiBzdHJpbmcpIHsgfVxuXHRnZXRFbmNvZGluZygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRzZXRQcmVmZXJyZWROYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQgeyB9XG5cdHNldFByZWZlcnJlZERlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRzZXRQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nKSB7IH1cblx0c2V0UHJlZmVycmVkQ29udGVudHMoY29udGVudHM6IHN0cmluZyk6IHZvaWQgeyB9XG5cdHNldExhbmd1YWdlSWQobGFuZ3VhZ2VJZDogc3RyaW5nLCBzb3VyY2U/OiBzdHJpbmcpIHsgfVxuXHRzZXRQcmVmZXJyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZykgeyB9XG5cdHNldEZvcmNlT3BlbkFzQmluYXJ5KCk6IHZvaWQgeyB9XG5cdHNldEZhaWxUb09wZW4oKTogdm9pZCB7XG5cdFx0dGhpcy5mYWlscyA9IHRydWU7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgc2F2ZShncm91cElkOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5nb3RTYXZlZCA9IHRydWU7XG5cdFx0dGhpcy5kaXJ0eSA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHNhdmVBcyhncm91cElkOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5nb3RTYXZlZEFzID0gdHJ1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXHRvdmVycmlkZSBhc3luYyByZXZlcnQoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5nb3RSZXZlcnRlZCA9IHRydWU7XG5cdFx0dGhpcy5nb3RTYXZlZCA9IGZhbHNlO1xuXHRcdHRoaXMuZ290U2F2ZWRBcyA9IGZhbHNlO1xuXHRcdHRoaXMuZGlydHkgPSBmYWxzZTtcblx0fVxuXHRvdmVycmlkZSB0b1VudHlwZWQoKTogSVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZGlzYWJsZVRvVW50eXBlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHRoaXMucmVzb3VyY2UgfTtcblx0fVxuXHRzZXRNb2RpZmllZCgpOiB2b2lkIHsgdGhpcy5tb2RpZmllZCA9IHRydWU7IH1cblx0b3ZlcnJpZGUgaXNNb2RpZmllZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RpZmllZCA9PT0gdW5kZWZpbmVkID8gdGhpcy5kaXJ0eSA6IHRoaXMubW9kaWZpZWQ7XG5cdH1cblx0c2V0RGlydHkoKTogdm9pZCB7IHRoaXMuZGlydHkgPSB0cnVlOyB9XG5cdG92ZXJyaWRlIGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlydHk7XG5cdH1cblx0aXNSZXNvbHZlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZ290RGlzcG9zZWQgPSB0cnVlO1xuXHR9XG5cdG1vdmVkRWRpdG9yOiBJTW92ZVJlc3VsdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgYXN5bmMgcmVuYW1lKCk6IFByb21pc2U8SU1vdmVSZXN1bHQgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMubW92ZWRFZGl0b3I7IH1cblxuXHRwcml2YXRlIG1vdmVEaXNhYmxlZFJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRzZXRNb3ZlRGlzYWJsZWQocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1vdmVEaXNhYmxlZFJlYXNvbiA9IHJlYXNvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbk1vdmUoc291cmNlR3JvdXA6IEdyb3VwSWRlbnRpZmllciwgdGFyZ2V0R3JvdXA6IEdyb3VwSWRlbnRpZmllcik6IHN0cmluZyB8IHRydWUge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5tb3ZlRGlzYWJsZWRSZWFzb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb3ZlRGlzYWJsZWRSZWFzb247XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5jYW5Nb3ZlKHNvdXJjZUdyb3VwLCB0YXJnZXRHcm91cCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RGb3JjZVJldmVhbEZpbGVFZGl0b3JJbnB1dCBleHRlbmRzIFRlc3RGaWxlRWRpdG9ySW5wdXQge1xuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMgeyByZXR1cm4gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuRm9yY2VSZXZlYWw7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFZGl0b3JQYXJ0IGV4dGVuZHMgTWFpbkVkaXRvclBhcnQgaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWFpblBhcnQgPSB0aGlzO1xuXHRyZWFkb25seSBwYXJ0czogcmVhZG9ubHkgSUVkaXRvclBhcnRbXSA9IFt0aGlzXTtcblx0cmVhZG9ubHkgYWN0aXZlTW9kYWxFZGl0b3JQYXJ0OiBJTW9kYWxFZGl0b3JQYXJ0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydDogRXZlbnQ8SUF1eGlsaWFyeUVkaXRvclBhcnQ+ID0gRXZlbnQuTm9uZTtcblxuXHR0ZXN0U2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdHJldHVybiBzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdGNsZWFyU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlTWVtZW50byA9IHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHdvcmtzcGFjZU1lbWVudG8pKSB7XG5cdFx0XHRkZWxldGUgd29ya3NwYWNlTWVtZW50b1trZXldO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVNZW1lbnRvID0gdGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHByb2ZpbGVNZW1lbnRvKSkge1xuXHRcdFx0ZGVsZXRlIHByb2ZpbGVNZW1lbnRvW2tleV07XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJFZGl0b3JQYXJ0KHBhcnQ6IElFZGl0b3JQYXJ0KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRjcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KCk6IFByb21pc2U8SUF1eGlsaWFyeUVkaXRvclBhcnQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRjcmVhdGVNb2RhbEVkaXRvclBhcnQoKTogUHJvbWlzZTxJTW9kYWxFZGl0b3JQYXJ0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Z2V0U2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UocGFydDogSUVkaXRvclBhcnQpOiBJSW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGdldFBhcnQoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCk6IElFZGl0b3JQYXJ0IHsgcmV0dXJuIHRoaXM7IH1cblxuXHRzYXZlV29ya2luZ1NldChuYW1lOiBzdHJpbmcpOiBJRWRpdG9yV29ya2luZ1NldCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRXb3JraW5nU2V0cygpOiBJRWRpdG9yV29ya2luZ1NldFtdIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGFwcGx5V29ya2luZ1NldCh3b3JraW5nU2V0OiBJRWRpdG9yV29ya2luZ1NldCB8ICdlbXB0eScsIG9wdGlvbnM/OiBJRWRpdG9yV29ya2luZ1NldE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGRlbGV0ZVdvcmtpbmdTZXQod29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQpOiBQcm9taXNlPGJvb2xlYW4+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cblx0cmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXI8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4ocHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxUPik6IElEaXNwb3NhYmxlIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RWRpdG9yUGFydHMgZXh0ZW5kcyBFZGl0b3JQYXJ0cyB7XG5cdHRlc3RNYWluUGFydCE6IFRlc3RFZGl0b3JQYXJ0O1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVNYWluRWRpdG9yUGFydCgpOiBNYWluRWRpdG9yUGFydCB7XG5cdFx0dGhpcy50ZXN0TWFpblBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RFZGl0b3JQYXJ0LCB0aGlzKTtcblxuXHRcdHJldHVybiB0aGlzLnRlc3RNYWluUGFydDtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlRWRpdG9yUGFydHMoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8VGVzdEVkaXRvclBhcnRzPiB7XG5cdGNvbnN0IHBhcnRzID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdEVkaXRvclBhcnRzKTtcblx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChwYXJ0cykudGVzdE1haW5QYXJ0O1xuXHRwYXJ0LmNyZWF0ZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdHBhcnQubGF5b3V0KDEwODAsIDgwMCwgMCwgMCk7XG5cblx0YXdhaXQgcGFydHMud2hlblJlYWR5O1xuXG5cdHJldHVybiBwYXJ0cztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUVkaXRvclBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8VGVzdEVkaXRvclBhcnQ+IHtcblx0cmV0dXJuIChhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0cyhpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpKS50ZXN0TWFpblBhcnQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TGlzdFNlcnZpY2UgaW1wbGVtZW50cyBJTGlzdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRsYXN0Rm9jdXNlZExpc3Q6IGFueSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRyZWdpc3RlcigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFBhdGhTZXJ2aWNlIGltcGxlbWVudHMgSVBhdGhTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGZhbGxiYWNrVXNlckhvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvJyB9KSwgcHVibGljIGRlZmF1bHRVcmlTY2hlbWUgPSBTY2hlbWFzLmZpbGUpIHsgfVxuXG5cdGhhc1ZhbGlkQmFzZW5hbWUocmVzb3VyY2U6IFVSSSwgYmFzZW5hbWU/OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRoYXNWYWxpZEJhc2VuYW1lKHJlc291cmNlOiBVUkksIG9zOiBPcGVyYXRpbmdTeXN0ZW0sIGJhc2VuYW1lPzogc3RyaW5nKTogYm9vbGVhbjtcblx0aGFzVmFsaWRCYXNlbmFtZShyZXNvdXJjZTogVVJJLCBhcmcyPzogc3RyaW5nIHwgT3BlcmF0aW5nU3lzdGVtLCBuYW1lPzogc3RyaW5nKTogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGFyZzIgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gaXNWYWxpZEJhc2VuYW1lKGFyZzIgPz8gYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNWYWxpZEJhc2VuYW1lKG5hbWUgPz8gYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0fVxuXG5cdGdldCBwYXRoKCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGlzV2luZG93cyA/IHdpbjMyIDogcG9zaXgpOyB9XG5cblx0dXNlckhvbWUob3B0aW9ucz86IHsgcHJlZmVyTG9jYWw6IGJvb2xlYW4gfSk6IFByb21pc2U8VVJJPjtcblx0dXNlckhvbWUob3B0aW9uczogeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KTogVVJJO1xuXHR1c2VySG9tZShvcHRpb25zPzogeyBwcmVmZXJMb2NhbDogYm9vbGVhbiB9KTogUHJvbWlzZTxVUkk+IHwgVVJJIHtcblx0XHRyZXR1cm4gb3B0aW9ucz8ucHJlZmVyTG9jYWwgPyB0aGlzLmZhbGxiYWNrVXNlckhvbWUgOiBQcm9taXNlLnJlc29sdmUodGhpcy5mYWxsYmFja1VzZXJIb21lKTtcblx0fVxuXG5cdGdldCByZXNvbHZlZFVzZXJIb21lKCkgeyByZXR1cm4gdGhpcy5mYWxsYmFja1VzZXJIb21lOyB9XG5cblx0YXN5bmMgZmlsZVVSSShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPFVSST4ge1xuXHRcdHJldHVybiBVUkkuZmlsZShwYXRoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIgZXh0ZW5kcyBJVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIsIElEaXNwb3NhYmxlIHtcblx0YWRkKHJlc291cmNlOiBVUkksIG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogdm9pZDtcblx0cmVtb3ZlKHJlc291cmNlOiBVUkkpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsIGV4dGVuZHMgSVRleHRGaWxlRWRpdG9yTW9kZWwge1xuXHRyZWFkb25seSBsYXN0UmVzb2x2ZWRGaWxlU3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWw6IHVua25vd24pOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfCB1bmRlZmluZWQge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBtb2RlbCBhcyBJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIGNhbmRpZGF0ZT8ubGFzdFJlc29sdmVkRmlsZVN0YXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya3NwYWNlc1NlcnZpY2UgaW1wbGVtZW50cyBJV29ya3NwYWNlc1NlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCA9IEV2ZW50Lk5vbmU7XG5cblx0YXN5bmMgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoZm9sZGVycz86IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSwgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogUHJvbWlzZTxJV29ya3NwYWNlSWRlbnRpZmllcj4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgZGVsZXRlVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGFkZFJlY2VudGx5T3BlbmVkKHJlY2VudHM6IElSZWNlbnRbXSk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHJlbW92ZVJlY2VudGx5T3BlbmVkKHdvcmtzcGFjZXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgY2xlYXJSZWNlbnRseU9wZW5lZCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRSZWNlbnRseU9wZW5lZCgpOiBQcm9taXNlPElSZWNlbnRseU9wZW5lZD4geyByZXR1cm4geyBmaWxlczogW10sIHdvcmtzcGFjZXM6IFtdIH07IH1cblx0YXN5bmMgZ2V0RGlydHlXb3Jrc3BhY2VzKCk6IFByb21pc2U8KElGb2xkZXJCYWNrdXBJbmZvIHwgSVdvcmtzcGFjZUJhY2t1cEluZm8pW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGVudGVyV29ya3NwYWNlKHBhdGg6IFVSSSk6IFByb21pc2U8SUVudGVyV29ya3NwYWNlUmVzdWx0IHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBnZXRXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZVBhdGg6IFVSSSk6IFByb21pc2U8SVdvcmtzcGFjZUlkZW50aWZpZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGVybWluYWxJbnN0YW5jZVNlcnZpY2UgaW1wbGVtZW50cyBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2Uge1xuXHRvbkRpZENyZWF0ZUluc3RhbmNlID0gRXZlbnQuTm9uZTtcblx0b25EaWRSZWdpc3RlckJhY2tlbmQgPSBFdmVudC5Ob25lO1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb252ZXJ0UHJvZmlsZVRvU2hlbGxMYXVuY2hDb25maWcoc2hlbGxMYXVuY2hDb25maWdPclByb2ZpbGU/OiBJU2hlbGxMYXVuY2hDb25maWcgfCBJVGVybWluYWxQcm9maWxlLCBjd2Q/OiBzdHJpbmcgfCBVUkkpOiBJU2hlbGxMYXVuY2hDb25maWcgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0cHJlcGFyZVBhdGhGb3JUZXJtaW5hbEFzeW5jKHBhdGg6IHN0cmluZywgZXhlY3V0YWJsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0aXRsZTogc3RyaW5nLCBzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlLCByZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRjcmVhdGVJbnN0YW5jZShvcHRpb25zOiBJQ3JlYXRlVGVybWluYWxPcHRpb25zLCB0YXJnZXQ6IFRlcm1pbmFsTG9jYXRpb24pOiBJVGVybWluYWxJbnN0YW5jZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBnZXRCYWNrZW5kKHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsQmFja2VuZCB8IHVuZGVmaW5lZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZGlkUmVnaXN0ZXJCYWNrZW5kKGJhY2tlbmQ6IElUZXJtaW5hbEJhY2tlbmQpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldFJlZ2lzdGVyZWRCYWNrZW5kcygpOiBJdGVyYWJsZUl0ZXJhdG9yPElUZXJtaW5hbEJhY2tlbmQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGVybWluYWxFZGl0b3JTZXJ2aWNlIGltcGxlbWVudHMgSVRlcm1pbmFsRWRpdG9yU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YWN0aXZlSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRpbnN0YW5jZXM6IHJlYWRvbmx5IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0b25EaWREaXNwb3NlSW5zdGFuY2UgPSBFdmVudC5Ob25lO1xuXHRvbkRpZEZvY3VzSW5zdGFuY2UgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZUluc3RhbmNlcyA9IEV2ZW50Lk5vbmU7XG5cdG9wZW5FZGl0b3IoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBlZGl0b3JPcHRpb25zPzogVGVybWluYWxFZGl0b3JMb2NhdGlvbik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZGV0YWNoSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzcGxpdEluc3RhbmNlKGluc3RhbmNlVG9TcGxpdDogSVRlcm1pbmFsSW5zdGFuY2UsIHNoZWxsTGF1bmNoQ29uZmlnPzogSVNoZWxsTGF1bmNoQ29uZmlnKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0cmV2ZWFsQWN0aXZlRWRpdG9yKHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRyZXNvbHZlUmVzb3VyY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogVVJJIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJldml2ZUlucHV0KGRlc2VyaWFsaXplZElucHV0OiBJRGVzZXJpYWxpemVkVGVybWluYWxFZGl0b3JJbnB1dCk6IFRlcm1pbmFsRWRpdG9ySW5wdXQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0SW5wdXRGcm9tUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IFRlcm1pbmFsRWRpdG9ySW5wdXQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRmb2N1c0FjdGl2ZUluc3RhbmNlKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgZm9jdXNJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldEluc3RhbmNlRnJvbVJlc291cmNlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRmb2N1c0ZpbmRXaWRnZXQoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRoaWRlRmluZFdpZGdldCgpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGZpbmROZXh0KCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZmluZFByZXZpb3VzKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RUZXJtaW5hbEdyb3VwU2VydmljZSBpbXBsZW1lbnRzIElUZXJtaW5hbEdyb3VwU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YWN0aXZlSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRpbnN0YW5jZXM6IHJlYWRvbmx5IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0Z3JvdXBzOiByZWFkb25seSBJVGVybWluYWxHcm91cFtdID0gW107XG5cdGFjdGl2ZUdyb3VwOiBJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZDtcblx0YWN0aXZlR3JvdXBJbmRleDogbnVtYmVyID0gMDtcblx0bGFzdEFjY2Vzc2VkTWVudTogJ2lubGluZS10YWInIHwgJ3RhYi1saXN0JyA9ICdpbmxpbmUtdGFiJztcblx0b25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkRGlzcG9zZUdyb3VwID0gRXZlbnQuTm9uZTtcblx0b25EaWRTaG93ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VHcm91cHMgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZVBhbmVsT3JpZW50YXRpb24gPSBFdmVudC5Ob25lO1xuXHRvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkRm9jdXNJbnN0YW5jZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlSW5zdGFuY2VzID0gRXZlbnQuTm9uZTtcblx0Y3JlYXRlR3JvdXAoaW5zdGFuY2U/OiBhbnkpOiBJVGVybWluYWxHcm91cCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdG1vdmVHcm91cChzb3VyY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgSVRlcm1pbmFsSW5zdGFuY2VbXSwgdGFyZ2V0OiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0bW92ZUdyb3VwVG9FbmQoc291cmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IElUZXJtaW5hbEluc3RhbmNlW10pOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdG1vdmVJbnN0YW5jZShzb3VyY2U6IElUZXJtaW5hbEluc3RhbmNlLCB0YXJnZXQ6IElUZXJtaW5hbEluc3RhbmNlLCBzaWRlOiAnYmVmb3JlJyB8ICdhZnRlcicpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHVuc3BsaXRJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGpvaW5JbnN0YW5jZXMoaW5zdGFuY2VzOiBJVGVybWluYWxJbnN0YW5jZVtdKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRpbnN0YW5jZUlzU3BsaXQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRHcm91cExhYmVscygpOiBzdHJpbmdbXSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRBY3RpdmVHcm91cEJ5SW5kZXgoaW5kZXg6IG51bWJlcik6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2V0QWN0aXZlR3JvdXBUb05leHQoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRBY3RpdmVHcm91cFRvUHJldmlvdXMoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgodGVybWluYWxJbmRleDogbnVtYmVyKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRDb250YWluZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2hvd1BhbmVsKGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0aGlkZVBhbmVsKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNUYWJzKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNIb3ZlcigpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNBY3RpdmVJbnN0YW5jZSgpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGFzeW5jIGZvY3VzSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRJbnN0YW5jZUZyb21SZXNvdXJjZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNGaW5kV2lkZ2V0KCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0aGlkZUZpbmRXaWRnZXQoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRmaW5kTmV4dCgpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGZpbmRQcmV2aW91cygpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHVwZGF0ZVZpc2liaWxpdHkoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgaW1wbGVtZW50cyBJVGVybWluYWxQcm9maWxlU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YXZhaWxhYmxlUHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXSA9IFtdO1xuXHRjb250cmlidXRlZFByb2ZpbGVzOiBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlW10gPSBbXTtcblx0cHJvZmlsZXNSZWFkeTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRvbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzID0gRXZlbnQuTm9uZTtcblx0Z2V0UGxhdGZvcm1LZXkoKTogUHJvbWlzZTxzdHJpbmc+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZnJlc2hBdmFpbGFibGVQcm9maWxlcygpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldERlZmF1bHRQcm9maWxlTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0RGVmYXVsdFByb2ZpbGUoKTogSVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRDb250cmlidXRlZERlZmF1bHRQcm9maWxlKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcpOiBQcm9taXNlPElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZ2lzdGVyQ29udHJpYnV0ZWRQcm9maWxlKGFyZ3M6IElSZWdpc3RlckNvbnRyaWJ1dGVkUHJvZmlsZUFyZ3MpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZ2lzdGVySW50ZXJuYWxDb250cmlidXRlZFByb2ZpbGUoX3Byb2ZpbGU6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0Z2V0Q29udHJpYnV0ZWRQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nKTogSVRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyIHwgdW5kZWZpbmVkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZ2lzdGVyVGVybWluYWxQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nLCBwcm9maWxlUHJvdmlkZXI6IElUZXJtaW5hbFByb2ZpbGVQcm92aWRlcik6IElEaXNwb3NhYmxlIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdG92ZXJyaWRlRGVmYXVsdFByb2ZpbGUoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nKTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIGltcGxlbWVudHMgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0ZGVmYXVsdFByb2ZpbGVOYW1lID0gJyc7XG5cdHJlc29sdmVJY29uKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcpOiB2b2lkIHsgfVxuXHRhc3luYyByZXNvbHZlU2hlbGxMYXVuY2hDb25maWcoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgb3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXREZWZhdWx0UHJvZmlsZShvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT4geyByZXR1cm4geyBwYXRoOiAnL2RlZmF1bHQnLCBwcm9maWxlTmFtZTogJ0RlZmF1bHQnLCBpc0RlZmF1bHQ6IHRydWUgfTsgfVxuXHRhc3luYyBnZXREZWZhdWx0U2hlbGwob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJy9kZWZhdWx0JzsgfVxuXHRhc3luYyBnZXREZWZhdWx0U2hlbGxBcmdzKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTxzdHJpbmcgfCBzdHJpbmdbXT4geyByZXR1cm4gW107IH1cblx0Z2V0RGVmYXVsdEljb24oKTogVGVybWluYWxJY29uICYgVGhlbWVJY29uIHsgcmV0dXJuIENvZGljb24udGVybWluYWw7IH1cblx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7IHJldHVybiBlbnY7IH1cblx0Z2V0U2FmZUNvbmZpZ1ZhbHVlKGtleTogc3RyaW5nLCBvczogT3BlcmF0aW5nU3lzdGVtKTogdW5rbm93biB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Z2V0U2FmZUNvbmZpZ1ZhbHVlRnVsbEtleShrZXk6IHN0cmluZyk6IHVua25vd24gfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGNyZWF0ZVByb2ZpbGVGcm9tU2hlbGxBbmRTaGVsbEFyZ3Moc2hlbGw/OiB1bmtub3duLCBzaGVsbEFyZ3M/OiB1bmtub3duKTogUHJvbWlzZTxzdHJpbmcgfCBJVGVybWluYWxQcm9maWxlPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0Z2V0IGZvbnRNZXRyaWNzKCkgeyByZXR1cm4gdGhpcy5fZm9udE1ldHJpY3M7IH1cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdHNldENvbmZpZyhjb25maWc6IFBhcnRpYWw8SVRlcm1pbmFsQ29uZmlndXJhdGlvbj4pIHsgdGhpcy5fY29uZmlnID0gY29uZmlnIGFzIGFueTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFF1aWNrSW5wdXRTZXJ2aWNlIGltcGxlbWVudHMgSVF1aWNrSW5wdXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25TaG93ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25IaWRlID0gRXZlbnQuTm9uZTtcblxuXHRyZWFkb25seSBhbGlnbm1lbnQgPSBvYnNlcnZhYmxlVmFsdWUoJ1Rlc3RRdWlja0lucHV0U2VydmljZS5hbGlnbm1lbnQnLCAndG9wJyBhcyBRdWlja0lucHV0QWxpZ25tZW50KTtcblx0cmVhZG9ubHkgY3VycmVudFF1aWNrSW5wdXQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHF1aWNrQWNjZXNzID0gdW5kZWZpbmVkITtcblx0YmFja0J1dHRvbiE6IElRdWlja0lucHV0QnV0dG9uO1xuXG5cdHBpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihwaWNrczogUHJvbWlzZTxRdWlja1BpY2tJbnB1dDxUPltdPiB8IFF1aWNrUGlja0lucHV0PFQ+W10sIG9wdGlvbnM/OiBJUGlja09wdGlvbnM8VD4gJiB7IGNhblBpY2tNYW55OiB0cnVlIH0sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFRbXT47XG5cdHBpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihwaWNrczogUHJvbWlzZTxRdWlja1BpY2tJbnB1dDxUPltdPiB8IFF1aWNrUGlja0lucHV0PFQ+W10sIG9wdGlvbnM/OiBJUGlja09wdGlvbnM8VD4gJiB7IGNhblBpY2tNYW55OiBmYWxzZSB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUPjtcblx0YXN5bmMgcGljazxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+KHBpY2tzOiBQcm9taXNlPFF1aWNrUGlja0lucHV0PFQ+W10+IHwgUXVpY2tQaWNrSW5wdXQ8VD5bXSwgb3B0aW9ucz86IE9taXQ8SVBpY2tPcHRpb25zPFQ+LCAnY2FuUGlja01hbnknPiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHBpY2tzKSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gPGFueT57IGxhYmVsOiAnc2VsZWN0ZWRQaWNrJywgZGVzY3JpcHRpb246ICdwaWNrIGRlc2NyaXB0aW9uJywgdmFsdWU6ICdzZWxlY3RlZFBpY2snIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaW5wdXQob3B0aW9ucz86IElJbnB1dE9wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gb3B0aW9ucyA/ICdyZXNvbHZlZCcgKyBvcHRpb25zLnByb21wdCA6ICdyZXNvbHZlZCc7IH1cblxuXHRjcmVhdGVRdWlja1BpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPigpOiBJUXVpY2tQaWNrPFQsIHsgdXNlU2VwYXJhdG9yczogYm9vbGVhbiB9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNyZWF0ZUlucHV0Qm94KCk6IElJbnB1dEJveCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNyZWF0ZVF1aWNrV2lkZ2V0KCk6IElRdWlja1dpZGdldCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRjcmVhdGVRdWlja1RyZWU8VCBleHRlbmRzIElRdWlja1RyZWVJdGVtPigpOiBJUXVpY2tUcmVlPFQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXMoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHRvZ2dsZSgpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0bmF2aWdhdGUobmV4dDogYm9vbGVhbiwgcXVpY2tOYXZpZ2F0ZT86IElRdWlja05hdmlnYXRlQ29uZmlndXJhdGlvbik6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhY2NlcHQoKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGJhY2soKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNhbmNlbCgpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2V0QWxpZ25tZW50KGFsaWdubWVudDogJ3RvcCcgfCAnY2VudGVyJyB8IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlciB9KTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHRvZ2dsZUhvdmVyKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5jbGFzcyBUZXN0TGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIGltcGxlbWVudHMgSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0aXNFbmFibGVkRm9yTGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBkZXRlY3RMYW5ndWFnZShyZXNvdXJjZTogVVJJLCBzdXBwb3J0ZWRMYW5ncz86IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJlbW90ZUFnZW50U2VydmljZSBpbXBsZW1lbnRzIElSZW1vdGVBZ2VudFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGdldENvbm5lY3Rpb24oKTogSVJlbW90ZUFnZW50Q29ubmVjdGlvbiB8IG51bGwgeyByZXR1cm4gbnVsbDsgfVxuXHRhc3luYyBnZXRFbnZpcm9ubWVudCgpOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD4geyByZXR1cm4gbnVsbDsgfVxuXHRhc3luYyBnZXRSYXdFbnZpcm9ubWVudCgpOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD4geyByZXR1cm4gbnVsbDsgfVxuXHRhc3luYyBnZXRFeHRlbnNpb25Ib3N0RXhpdEluZm8ocmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyk6IFByb21pc2U8SUV4dGVuc2lvbkhvc3RFeGl0SW5mbyB8IG51bGw+IHsgcmV0dXJuIG51bGw7IH1cblx0YXN5bmMgZ2V0RGlhZ25vc3RpY0luZm8ob3B0aW9uczogSURpYWdub3N0aWNJbmZvT3B0aW9ucyk6IFByb21pc2U8SURpYWdub3N0aWNJbmZvIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXBkYXRlVGVsZW1ldHJ5TGV2ZWwodGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgbG9nVGVsZW1ldHJ5KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogSVRlbGVtZXRyeURhdGEpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBmbHVzaFRlbGVtZXRyeSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRSb3VuZFRyaXBUaW1lKCk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZW5kQ29ubmVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBpbXBsZW1lbnRzIElSZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YXN5bmMgd2hlbkV4dGVuc2lvbnNSZWFkeSgpOiBQcm9taXNlPEluc3RhbGxFeHRlbnNpb25TdW1tYXJ5PiB7IHJldHVybiB7IGZhaWxlZDogW10gfTsgfVxuXHRzY2FuRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRvbkVuYWJsZW1lbnRDaGFuZ2VkID0gRXZlbnQuTm9uZTtcblx0Z2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IEVuYWJsZW1lbnRTdGF0ZSB7IHJldHVybiBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5OyB9XG5cdGdldEVuYWJsZW1lbnRTdGF0ZXMoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCB3b3Jrc3BhY2VUeXBlT3ZlcnJpZGVzPzogeyB0cnVzdGVkPzogYm9vbGVhbiB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkKTogRW5hYmxlbWVudFN0YXRlW10geyByZXR1cm4gW107IH1cblx0Z2V0RGVwZW5kZW5jaWVzRW5hYmxlbWVudFN0YXRlcyhleHRlbnNpb246IElFeHRlbnNpb24pOiBbSUV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlXVtdIHsgcmV0dXJuIFtdOyB9XG5cdGNhbkNoYW5nZUVuYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGNhbkNoYW5nZVdvcmtzcGFjZUVuYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGlzRW5hYmxlZChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0aXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGVuYWJsZW1lbnRTdGF0ZTogRW5hYmxlbWVudFN0YXRlKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGlzRGlzYWJsZWRHbG9iYWxseShleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBzdGF0ZTogRW5hYmxlbWVudFN0YXRlKTogUHJvbWlzZTxib29sZWFuW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIHVwZGF0ZUV4dGVuc2lvbnNFbmFibGVtZW50c1doZW5Xb3Jrc3BhY2VUcnVzdENoYW5nZXMoKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0b25JbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25EaWRJbnN0YWxsRXh0ZW5zaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG9uVW5pbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25EaWRVbmluc3RhbGxFeHRlbnNpb24gPSBFdmVudC5Ob25lO1xuXHRvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhID0gRXZlbnQuTm9uZTtcblx0b25Qcm9maWxlQXdhcmVJbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25Qcm9maWxlQXdhcmVEaWRJbnN0YWxsRXh0ZW5zaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG9uUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25Qcm9maWxlQXdhcmVEaWRVbmluc3RhbGxFeHRlbnNpb24gPSBFdmVudC5Ob25lO1xuXHRvbkRpZFByb2ZpbGVBd2FyZVVuaW5zdGFsbEV4dGVuc2lvbnMgPSBFdmVudC5Ob25lO1xuXHRvblByb2ZpbGVBd2FyZURpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VQcm9maWxlID0gRXZlbnQuTm9uZTtcblx0b25EaWRFbmFibGVFeHRlbnNpb25zID0gRXZlbnQuTm9uZTtcblx0cHJlZmVyUHJlUmVsZWFzZXMgPSB0cnVlO1xuXHRpbnN0YWxsVlNJWChsb2NhdGlvbjogVVJJLCBtYW5pZmVzdDogUmVhZG9ubHk8SVJlbGF4ZWRFeHRlbnNpb25NYW5pZmVzdD4sIGluc3RhbGxPcHRpb25zPzogSW5zdGFsbE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRpbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGFzeW5jIHVwZGF0ZUZyb21HYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHJldHVybiBleHRlbnNpb247IH1cblx0emlwKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0Z2V0TWFuaWZlc3QodnNpeDogVVJJKTogUHJvbWlzZTxSZWFkb25seTxJUmVsYXhlZEV4dGVuc2lvbk1hbmlmZXN0Pj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRpbnN0YWxsKHZzaXg6IFVSSSwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0aXNBbGxvd2VkKCk6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcgeyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBjYW5JbnN0YWxsKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPHRydWU+IHsgcmV0dXJuIHRydWU7IH1cblx0aW5zdGFsbEZyb21HYWxsZXJ5KGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHVuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0dW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBVbmluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0YXN5bmMgZ2V0SW5zdGFsbGVkKHR5cGU/OiBFeHRlbnNpb25UeXBlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4geyByZXR1cm4gW107IH1cblx0Z2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpOiBQcm9taXNlPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHJldHVybiBsb2NhbDsgfVxuXHRyZWdpc3RlclBhcnRpY2lwYW50KHBhcml0aWNpcGFudDogSUV4dGVuc2lvbk1hbmFnZW1lbnRQYXJ0aWNpcGFudCk6IHZvaWQgeyB9XG5cdGFzeW5jIGdldFRhcmdldFBsYXRmb3JtKCk6IFByb21pc2U8VGFyZ2V0UGxhdGZvcm0+IHsgcmV0dXJuIFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRDsgfVxuXHRhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGRvd25sb2FkKCk6IFByb21pc2U8VVJJPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGNvcHlFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXHR0b2dnbGVBcHBsaWNhdGlvblNjb3BlKCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cdGluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXHR3aGVuUHJvZmlsZUNoYW5nZWQoZnJvbTogSVVzZXJEYXRhUHJvZmlsZSwgdG86IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblx0Z2V0SW5zdGFsbGVkV29ya3NwYWNlRXh0ZW5zaW9uTG9jYXRpb25zKCk6IFVSSVtdIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnMoKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0aW5zdGFsbFJlc291cmNlRXh0ZW5zaW9uKCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRFeHRlbnNpb25zKCk6IFByb21pc2U8SVJlc291cmNlRXh0ZW5zaW9uW10+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldEluc3RhbGxhYmxlU2VydmVycyhleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRpc1B1Ymxpc2hlclRydXN0ZWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0VHJ1c3RlZFB1Ymxpc2hlcnMoKSB7IHJldHVybiBbXTsgfVxuXHR0cnVzdFB1Ymxpc2hlcnMoKTogdm9pZCB7IH1cblx0dW50cnVzdFB1Ymxpc2hlcnMoKTogdm9pZCB7IH1cblx0YXN5bmMgcmVxdWVzdFB1Ymxpc2hlclRydXN0KGV4dGVuc2lvbnM6IEluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5cblxuZXhwb3J0IGNsYXNzIFRlc3RXZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgaW1wbGVtZW50cyBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRvbkRpZENoYW5nZVByb2ZpbGUgPSBFdmVudC5Ob25lO1xuXHRhc3luYyBzY2FuU3lzdGVtRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25bXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgc2NhblVzZXJFeHRlbnNpb25zKCk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgc2NhbkV4dGVuc2lvbnNVbmRlckRldmVsb3BtZW50KCk6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBjb3B5RXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvblR5cGU6IEV4dGVuc2lvblR5cGUpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRhZGRFeHRlbnNpb24obG9jYXRpb246IFVSSSwgbWV0YWRhdGE/OiBQYXJ0aWFsPElHYWxsZXJ5TWV0YWRhdGEgJiB7IGlzQXBwbGljYXRpb25TY29wZWQ6IGJvb2xlYW47IGlzTWFjaGluZVNjb3BlZDogYm9vbGVhbjsgaXNCdWlsdGluOiBib29sZWFuOyBpc1N5c3RlbTogYm9vbGVhbjsgdXBkYXRlZDogYm9vbGVhbjsgcHJlUmVsZWFzZTogYm9vbGVhbjsgaW5zdGFsbGVkVGltZXN0YW1wOiBudW1iZXIgfT4gfCB1bmRlZmluZWQpOiBQcm9taXNlPElFeHRlbnNpb24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0YWRkRXh0ZW5zaW9uRnJvbUdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG1ldGFkYXRhPzogUGFydGlhbDxJR2FsbGVyeU1ldGFkYXRhICYgeyBpc0FwcGxpY2F0aW9uU2NvcGVkOiBib29sZWFuOyBpc01hY2hpbmVTY29wZWQ6IGJvb2xlYW47IGlzQnVpbHRpbjogYm9vbGVhbjsgaXNTeXN0ZW06IGJvb2xlYW47IHVwZGF0ZWQ6IGJvb2xlYW47IHByZVJlbGVhc2U6IGJvb2xlYW47IGluc3RhbGxlZFRpbWVzdGFtcDogbnVtYmVyIH0+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJRXh0ZW5zaW9uPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHJlbW92ZUV4dGVuc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0dXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uOiBJU2Nhbm5lZEV4dGVuc2lvbiwgbWV0YURhdGE6IFBhcnRpYWw8TWV0YWRhdGE+LCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2NhbkV4dGVuc2lvbk1hbmlmZXN0KGV4dGVuc2lvbkxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPFJlYWRvbmx5PElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3Q+IHwgbnVsbD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd29ya2JlbmNoVGVhcmRvd24oaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB3b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcykge1xuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHkucmV2ZXJ0KCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBlZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGVkaXRvckdyb3VwU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGVkaXRvckdyb3VwU2VydmljZS5yZW1vdmVHcm91cChncm91cCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RDb250ZXh0TWVudVNlcnZpY2UgaW1wbGVtZW50cyBJQ29udGV4dE1lbnVTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRTaG93Q29udGV4dE1lbnUgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEhpZGVDb250ZXh0TWVudSA9IEV2ZW50Lk5vbmU7XG5cblx0c2hvd0NvbnRleHRNZW51KGRlbGVnYXRlOiBJQ29udGV4dE1lbnVEZWxlZ2F0ZSB8IElDb250ZXh0TWVudU1lbnVEZWxlZ2F0ZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdENoYXRXaWRnZXRTZXJ2aWNlIGltcGxlbWVudHMgSUNoYXRXaWRnZXRTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0bGFzdEZvY3VzZWRXaWRnZXQ6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdG9uRGlkQWRkV2lkZ2V0ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VXaWRnZXRWaXNpYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0b25EaWRCYWNrZ3JvdW5kU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlRm9jdXNlZFdpZGdldCA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXG5cdGFzeW5jIHJldmVhbCh3aWRnZXQ6IElDaGF0V2lkZ2V0LCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgcmV2ZWFsV2lkZ2V0KHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldEFsbFdpZGdldHMoKTogUmVhZG9ubHlBcnJheTxJQ2hhdFdpZGdldD4geyByZXR1cm4gW107IH1cblx0Z2V0V2lkZ2V0QnlJbnB1dFVyaSh1cmk6IFVSSSk6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRvcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUNoYXRXaWRnZXQgfCB1bmRlZmluZWQ+O1xuXHRvcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGFyZ2V0PzogUHJlZmVycmVkR3JvdXAsIG9wdGlvbnM/OiBJQ2hhdEVkaXRvck9wdGlvbnMpOiBQcm9taXNlPElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkPjtcblx0YXN5bmMgb3BlblNlc3Npb24oc2Vzc2lvblJlc291cmNlOiB1bmtub3duLCB0YXJnZXQ/OiB1bmtub3duLCBvcHRpb25zPzogdW5rbm93bik6IFByb21pc2U8SUNoYXRXaWRnZXQgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRnZXRXaWRnZXRzQnlMb2NhdGlvbnMobG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uKTogUmVhZG9ubHlBcnJheTxJQ2hhdFdpZGdldD4geyByZXR1cm4gW107IH1cblx0cmVnaXN0ZXIobmV3V2lkZ2V0OiBJQ2hhdFdpZGdldCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFRQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBMEQ7QUFDbkUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFl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
