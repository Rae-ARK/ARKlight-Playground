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
import { deepClone } from "../../../../base/common/objects.js";
import { isObject, assertReturnsDefined } from "../../../../base/common/types.js";
import { AbstractTextEditor } from "./textEditor.js";
import { TEXT_DIFF_EDITOR_ID, EditorExtensions, isEditorInput, isEditorInputWithOptionsAndGroup, isTextEditorViewState, createTooLargeFileError } from "../../../common/editor.js";
import { applyTextEditorOptions } from "../../../common/editor/editorOptions.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { TextDiffEditorModel } from "../../../common/editor/textDiffEditorModel.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { TextFileOperationResult } from "../../../services/textfile/common/textfiles.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { isEqual } from "../../../../base/common/resources.js";
import { multibyteAwareBtoa } from "../../../../base/common/strings.js";
import { ByteSize, FileOperationResult, IFileService, TooLargeFileOperationError } from "../../../../platform/files/common/files.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { DiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
let TextDiffEditor = class extends AbstractTextEditor {
  constructor(group, telemetryService, instantiationService, storageService, configurationService, editorService, themeService, editorGroupService, fileService, preferencesService, editorResolverService) {
    super(TextDiffEditor.ID, group, telemetryService, instantiationService, storageService, configurationService, themeService, editorService, editorGroupService, fileService);
    this.preferencesService = preferencesService;
    this.editorResolverService = editorResolverService;
    this.diffEditorControl = void 0;
    this.inputLifecycleStopWatch = void 0;
    this._previousViewModel = null;
  }
  get scopedContextKeyService() {
    if (!this.diffEditorControl) {
      return void 0;
    }
    const originalEditor = this.diffEditorControl.getOriginalEditor();
    const modifiedEditor = this.diffEditorControl.getModifiedEditor();
    return (originalEditor.hasTextFocus() ? originalEditor : modifiedEditor).invokeWithinContext((accessor) => accessor.get(IContextKeyService));
  }
  getTitle() {
    if (this.input) {
      return this.input.getName();
    }
    return localize("textDiffEditor", "Text Diff Editor");
  }
  createEditorControl(parent, configuration) {
    this.diffEditorControl = this._register(this.instantiationService.createInstance(DiffEditorWidget, parent, configuration, {}));
  }
  updateEditorControlOptions(options) {
    this.diffEditorControl?.updateOptions(options);
  }
  getMainControl() {
    return this.diffEditorControl?.getModifiedEditor();
  }
  async setInput(input, options, context, token) {
    if (this._previousViewModel) {
      this._previousViewModel.dispose();
      this._previousViewModel = null;
    }
    this.inputLifecycleStopWatch = void 0;
    await super.setInput(input, options, context, token);
    try {
      const resolvedModel = await input.resolve();
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (!(resolvedModel instanceof TextDiffEditorModel)) {
        await this.openAsBinary(input, options);
        return void 0;
      }
      const control = assertReturnsDefined(this.diffEditorControl);
      const resolvedDiffEditorModel = resolvedModel;
      const vm = resolvedDiffEditorModel.textDiffEditorModel ? control.createViewModel(resolvedDiffEditorModel.textDiffEditorModel) : null;
      this._previousViewModel = vm;
      await vm?.waitForDiff();
      control.setModel(vm);
      let hasPreviousViewState = false;
      if (!isTextEditorViewState(options?.viewState)) {
        hasPreviousViewState = this.restoreTextDiffEditorViewState(input, options, context, control);
      }
      let optionsGotApplied = false;
      if (options) {
        optionsGotApplied = applyTextEditorOptions(options, control, ScrollType.Immediate);
      }
      if (!optionsGotApplied && !hasPreviousViewState) {
        control.revealFirstDiff();
      }
      control.updateOptions({
        ...this.getReadonlyConfiguration(resolvedDiffEditorModel.modifiedModel?.isReadonly()),
        originalEditable: !resolvedDiffEditorModel.originalModel?.isReadonly()
      });
      control.handleInitialized();
      this.inputLifecycleStopWatch = new StopWatch(false);
    } catch (error) {
      await this.handleSetInputError(error, input, options);
    }
  }
  async handleSetInputError(error, input, options) {
    if (this.isFileBinaryError(error)) {
      return this.openAsBinary(input, options);
    }
    if (error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
      let message;
      if (error instanceof TooLargeFileOperationError) {
        message = localize("fileTooLargeForHeapErrorWithSize", "At least one file is not displayed in the text compare editor because it is very large ({0}).", ByteSize.formatSize(error.size));
      } else {
        message = localize("fileTooLargeForHeapErrorWithoutSize", "At least one file is not displayed in the text compare editor because it is very large.");
      }
      throw createTooLargeFileError(this.group, input, options, message, this.preferencesService);
    }
    throw error;
  }
  restoreTextDiffEditorViewState(editor, options, context, control) {
    const editorViewState = this.loadEditorViewState(editor, context);
    if (editorViewState) {
      if (options?.selection && editorViewState.modified) {
        editorViewState.modified.cursorState = [];
      }
      control.restoreViewState(editorViewState);
      if (options?.revealIfVisible) {
        control.revealFirstDiff();
      }
      return true;
    }
    return false;
  }
  async openAsBinary(input, options) {
    const original = input.original;
    const modified = input.modified;
    const modifiedResource = modified.resource;
    if (modifiedResource) {
      const fallbackEditorId = this.editorResolverService.getBinaryDiffFallbackEditor(modifiedResource);
      const originalResource = original.resource;
      if (fallbackEditorId && originalResource) {
        const resolved = await this.editorResolverService.resolveEditor({
          original: { resource: originalResource },
          modified: { resource: modifiedResource },
          // Passing an explicit `override` bypasses the automatic `never` filtering and the diff
          // special-casing, so the resolver returns the custom diff editor directly.
          options: { ...options, override: fallbackEditorId }
        }, this.group);
        if (isEditorInputWithOptionsAndGroup(resolved)) {
          this.group.replaceEditors([{
            editor: input,
            replacement: resolved.editor,
            options: {
              ...resolved.options,
              activation: EditorActivation.PRESERVE,
              pinned: this.group.isPinned(input),
              sticky: this.group.isSticky(input)
            }
          }]);
          return;
        }
      }
    }
    const binaryDiffInput = this.instantiationService.createInstance(DiffEditorInput, input.getName(), input.getDescription(), original, modified, true);
    const fileEditorFactory = Registry.as(EditorExtensions.EditorFactory).getFileEditorFactory();
    if (fileEditorFactory.isFileEditor(original)) {
      original.setForceOpenAsBinary();
    }
    if (fileEditorFactory.isFileEditor(modified)) {
      modified.setForceOpenAsBinary();
    }
    this.group.replaceEditors([{
      editor: input,
      replacement: binaryDiffInput,
      options: {
        ...options,
        // Make sure to not steal away the currently active group
        // because we are triggering another openEditor() call
        // and do not control the initial intent that resulted
        // in us now opening as binary.
        activation: EditorActivation.PRESERVE,
        pinned: this.group.isPinned(input),
        sticky: this.group.isSticky(input)
      }
    }]);
  }
  setOptions(options) {
    super.setOptions(options);
    if (options) {
      applyTextEditorOptions(options, assertReturnsDefined(this.diffEditorControl), ScrollType.Smooth);
    }
  }
  shouldHandleConfigurationChangeEvent(e, resource) {
    if (super.shouldHandleConfigurationChangeEvent(e, resource)) {
      return true;
    }
    return e.affectsConfiguration(resource, "diffEditor") || e.affectsConfiguration(resource, "accessibility.verbosity.diffEditor");
  }
  computeConfiguration(configuration) {
    const editorConfiguration = super.computeConfiguration(configuration);
    if (isObject(configuration.diffEditor)) {
      const diffEditorConfiguration = deepClone(configuration.diffEditor);
      diffEditorConfiguration.diffCodeLens = diffEditorConfiguration.codeLens;
      delete diffEditorConfiguration.codeLens;
      diffEditorConfiguration.diffWordWrap = diffEditorConfiguration.wordWrap;
      delete diffEditorConfiguration.wordWrap;
      Object.assign(editorConfiguration, diffEditorConfiguration);
    }
    const verbose = configuration.accessibility?.verbosity?.diffEditor ?? false;
    editorConfiguration.accessibilityVerbose = verbose;
    return editorConfiguration;
  }
  getConfigurationOverrides(configuration) {
    return {
      ...super.getConfigurationOverrides(configuration),
      ...this.getReadonlyConfiguration(this.input?.isReadonly()),
      originalEditable: this.input instanceof DiffEditorInput && !this.input.original.isReadonly(),
      lineDecorationsWidth: "2ch"
    };
  }
  updateReadonly(input) {
    if (input instanceof DiffEditorInput) {
      this.diffEditorControl?.updateOptions({
        ...this.getReadonlyConfiguration(input.isReadonly()),
        originalEditable: !input.original.isReadonly()
      });
    } else {
      super.updateReadonly(input);
    }
  }
  isFileBinaryError(error) {
    if (Array.isArray(error)) {
      const errors = error;
      return errors.some((error2) => this.isFileBinaryError(error2));
    }
    return error.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY;
  }
  clearInput() {
    if (this._previousViewModel) {
      this._previousViewModel.dispose();
      this._previousViewModel = null;
    }
    super.clearInput();
    const inputLifecycleElapsed = this.inputLifecycleStopWatch?.elapsed();
    this.inputLifecycleStopWatch = void 0;
    if (typeof inputLifecycleElapsed === "number") {
      this.logInputLifecycleTelemetry(inputLifecycleElapsed, this.getControl()?.getModel()?.modified?.getLanguageId());
    }
    this.diffEditorControl?.setModel(null);
  }
  logInputLifecycleTelemetry(duration, languageId) {
    let collapseUnchangedRegions = false;
    if (this.diffEditorControl instanceof DiffEditorWidget) {
      collapseUnchangedRegions = this.diffEditorControl.collapseUnchangedRegions;
    }
    this.telemetryService.publicLog2("diffEditor.editorVisibleTime", {
      editorVisibleTimeMs: duration,
      languageId: languageId ?? "",
      collapseUnchangedRegions
    });
  }
  getControl() {
    return this.diffEditorControl;
  }
  focus() {
    super.focus();
    this.diffEditorControl?.focus();
  }
  hasFocus() {
    return this.diffEditorControl?.hasTextFocus() || super.hasFocus();
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    if (visible) {
      this.diffEditorControl?.onVisible();
    } else {
      this.diffEditorControl?.onHide();
    }
  }
  layout(dimension) {
    this.diffEditorControl?.layout(dimension);
  }
  setBoundarySashes(sashes) {
    this.diffEditorControl?.setBoundarySashes(sashes);
  }
  tracksEditorViewState(input) {
    return input instanceof DiffEditorInput;
  }
  computeEditorViewState(resource) {
    if (!this.diffEditorControl) {
      return void 0;
    }
    const model = this.diffEditorControl.getModel();
    if (!model?.modified || !model.original) {
      return void 0;
    }
    const modelUri = this.toEditorViewStateResource(model);
    if (!modelUri) {
      return void 0;
    }
    if (!isEqual(modelUri, resource)) {
      return void 0;
    }
    return this.diffEditorControl.saveViewState() ?? void 0;
  }
  toEditorViewStateResource(modelOrInput) {
    let original;
    let modified;
    if (modelOrInput instanceof DiffEditorInput) {
      original = modelOrInput.original.resource;
      modified = modelOrInput.modified.resource;
    } else if (!isEditorInput(modelOrInput)) {
      original = modelOrInput.original.uri;
      modified = modelOrInput.modified.uri;
    }
    if (!original || !modified) {
      return void 0;
    }
    return URI.from({ scheme: "diff", path: `${multibyteAwareBtoa(original.toString())}${multibyteAwareBtoa(modified.toString())}` });
  }
};
TextDiffEditor.ID = TEXT_DIFF_EDITOR_ID;
TextDiffEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, ITextResourceConfigurationService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, IEditorResolverService)
], TextDiffEditor);
export {
  TextDiffEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci90ZXh0RGlmZkVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QsIGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMsIElFZGl0b3JPcHRpb25zIGFzIElDb2RlRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUZXh0RWRpdG9yLCBJRWRpdG9yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vdGV4dEVkaXRvci5qcyc7XG5pbXBvcnQgeyBURVhUX0RJRkZfRURJVE9SX0lELCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zLCBJVGV4dERpZmZFZGl0b3JQYW5lLCBJRWRpdG9yT3BlbkNvbnRleHQsIGlzRWRpdG9ySW5wdXQsIGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwLCBpc1RleHRFZGl0b3JWaWV3U3RhdGUsIGNyZWF0ZVRvb0xhcmdlRmlsZUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgYXBwbHlUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBUZXh0RGlmZkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci90ZXh0RGlmZkVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZU9wZXJhdGlvbkVycm9yLCBUZXh0RmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSwgSURpZmZFZGl0b3JWaWV3U3RhdGUsIElEaWZmRWRpdG9yTW9kZWwsIElEaWZmRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGl2YXRpb24sIElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG11bHRpYnl0ZUF3YXJlQnRvYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQnl0ZVNpemUsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCBUb29MYXJnZUZpbGVPcGVyYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yV2lkZ2V0LmpzJztcblxuLyoqXG4gKiBUaGUgdGV4dCBlZGl0b3IgdGhhdCBsZXZlcmFnZXMgdGhlIGRpZmYgdGV4dCBlZGl0b3IgZm9yIHRoZSBlZGl0aW5nIGV4cGVyaWVuY2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXh0RGlmZkVkaXRvciBleHRlbmRzIEFic3RyYWN0VGV4dEVkaXRvcjxJRGlmZkVkaXRvclZpZXdTdGF0ZT4gaW1wbGVtZW50cyBJVGV4dERpZmZFZGl0b3JQYW5lIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gVEVYVF9ESUZGX0VESVRPUl9JRDtcblxuXHRwcml2YXRlIGRpZmZFZGl0b3JDb250cm9sOiBJRGlmZkVkaXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGlucHV0TGlmZWN5Y2xlU3RvcFdhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgZ2V0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKCk6IElDb250ZXh0S2V5U2VydmljZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmRpZmZFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsRWRpdG9yID0gdGhpcy5kaWZmRWRpdG9yQ29udHJvbC5nZXRPcmlnaW5hbEVkaXRvcigpO1xuXHRcdGNvbnN0IG1vZGlmaWVkRWRpdG9yID0gdGhpcy5kaWZmRWRpdG9yQ29udHJvbC5nZXRNb2RpZmllZEVkaXRvcigpO1xuXG5cdFx0cmV0dXJuIChvcmlnaW5hbEVkaXRvci5oYXNUZXh0Rm9jdXMoKSA/IG9yaWdpbmFsRWRpdG9yIDogbW9kaWZpZWRFZGl0b3IpLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoVGV4dERpZmZFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGVkaXRvckdyb3VwU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0VGl0bGUoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5wdXQuZ2V0TmFtZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgndGV4dERpZmZFZGl0b3InLCBcIlRleHQgRGlmZiBFZGl0b3JcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlRWRpdG9yQ29udHJvbChwYXJlbnQ6IEhUTUxFbGVtZW50LCBjb25maWd1cmF0aW9uOiBJQ29kZUVkaXRvck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLmRpZmZFZGl0b3JDb250cm9sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9yV2lkZ2V0LCBwYXJlbnQsIGNvbmZpZ3VyYXRpb24sIHt9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlRWRpdG9yQ29udHJvbE9wdGlvbnMob3B0aW9uczogSUNvZGVFZGl0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5kaWZmRWRpdG9yQ29udHJvbD8udXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRNYWluQ29udHJvbCgpOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvckNvbnRyb2w/LmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2aW91c1ZpZXdNb2RlbDogSURpZmZFZGl0b3JWaWV3TW9kZWwgfCBudWxsID0gbnVsbDtcblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogRGlmZkVkaXRvcklucHV0LCBvcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3ByZXZpb3VzVmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLl9wcmV2aW91c1ZpZXdNb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9wcmV2aW91c1ZpZXdNb2RlbCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYW51cCBwcmV2aW91cyB0aGluZ3MgYXNzb2NpYXRlZCB3aXRoIHRoZSBpbnB1dFxuXHRcdHRoaXMuaW5wdXRMaWZlY3ljbGVTdG9wV2F0Y2ggPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBTZXQgaW5wdXQgYW5kIHJlc29sdmVcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkTW9kZWwgPSBhd2FpdCBpbnB1dC5yZXNvbHZlKCk7XG5cblx0XHRcdC8vIENoZWNrIGZvciBjYW5jZWxsYXRpb25cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGYWxsYmFjayB0byBvcGVuIGFzIGJpbmFyeSBpZiBub3QgdGV4dFxuXHRcdFx0aWYgKCEocmVzb2x2ZWRNb2RlbCBpbnN0YW5jZW9mIFRleHREaWZmRWRpdG9yTW9kZWwpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbkFzQmluYXJ5KGlucHV0LCBvcHRpb25zKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IEVkaXRvciBNb2RlbFxuXHRcdFx0Y29uc3QgY29udHJvbCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZGlmZkVkaXRvckNvbnRyb2wpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWREaWZmRWRpdG9yTW9kZWwgPSByZXNvbHZlZE1vZGVsO1xuXG5cdFx0XHRjb25zdCB2bSA9IHJlc29sdmVkRGlmZkVkaXRvck1vZGVsLnRleHREaWZmRWRpdG9yTW9kZWwgPyBjb250cm9sLmNyZWF0ZVZpZXdNb2RlbChyZXNvbHZlZERpZmZFZGl0b3JNb2RlbC50ZXh0RGlmZkVkaXRvck1vZGVsKSA6IG51bGw7XG5cdFx0XHR0aGlzLl9wcmV2aW91c1ZpZXdNb2RlbCA9IHZtO1xuXHRcdFx0YXdhaXQgdm0/LndhaXRGb3JEaWZmKCk7XG5cdFx0XHRjb250cm9sLnNldE1vZGVsKHZtKTtcblxuXHRcdFx0Ly8gUmVzdG9yZSB2aWV3IHN0YXRlICh1bmxlc3MgcHJvdmlkZWQgYnkgb3B0aW9ucylcblx0XHRcdGxldCBoYXNQcmV2aW91c1ZpZXdTdGF0ZSA9IGZhbHNlO1xuXHRcdFx0aWYgKCFpc1RleHRFZGl0b3JWaWV3U3RhdGUob3B0aW9ucz8udmlld1N0YXRlKSkge1xuXHRcdFx0XHRoYXNQcmV2aW91c1ZpZXdTdGF0ZSA9IHRoaXMucmVzdG9yZVRleHREaWZmRWRpdG9yVmlld1N0YXRlKGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCBjb250cm9sKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXBwbHkgb3B0aW9ucyB0byBlZGl0b3IgaWYgYW55XG5cdFx0XHRsZXQgb3B0aW9uc0dvdEFwcGxpZWQgPSBmYWxzZTtcblx0XHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHRcdG9wdGlvbnNHb3RBcHBsaWVkID0gYXBwbHlUZXh0RWRpdG9yT3B0aW9ucyhvcHRpb25zLCBjb250cm9sLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghb3B0aW9uc0dvdEFwcGxpZWQgJiYgIWhhc1ByZXZpb3VzVmlld1N0YXRlKSB7XG5cdFx0XHRcdGNvbnRyb2wucmV2ZWFsRmlyc3REaWZmKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNpbmNlIHRoZSByZXNvbHZlZCBtb2RlbCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBiZWluZyByZWFkb25seVxuXHRcdFx0Ly8gb3Igbm90LCB3ZSBhcHBseSBpdCBoZXJlIHRvIHRoZSBlZGl0b3IgZXZlbiB0aG91Z2ggdGhlIGVkaXRvciBpbnB1dFxuXHRcdFx0Ly8gd2FzIGFscmVhZHkgYXNrZWQgZm9yIGJlaW5nIHJlYWRvbmx5IG9yIG5vdC4gVGhlIHJhdGlvbmFsZSBpcyB0aGF0XG5cdFx0XHQvLyBhIHJlc29sdmVkIG1vZGVsIG1pZ2h0IGhhdmUgbW9yZSBzcGVjaWZpYyBpbmZvcm1hdGlvbiBhYm91dCBiZWluZ1xuXHRcdFx0Ly8gcmVhZG9ubHkgb3Igbm90IHRoYXQgdGhlIGlucHV0IGRpZCBub3QgaGF2ZS5cblx0XHRcdGNvbnRyb2wudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdC4uLnRoaXMuZ2V0UmVhZG9ubHlDb25maWd1cmF0aW9uKHJlc29sdmVkRGlmZkVkaXRvck1vZGVsLm1vZGlmaWVkTW9kZWw/LmlzUmVhZG9ubHkoKSksXG5cdFx0XHRcdG9yaWdpbmFsRWRpdGFibGU6ICFyZXNvbHZlZERpZmZFZGl0b3JNb2RlbC5vcmlnaW5hbE1vZGVsPy5pc1JlYWRvbmx5KClcblx0XHRcdH0pO1xuXG5cdFx0XHRjb250cm9sLmhhbmRsZUluaXRpYWxpemVkKCk7XG5cblx0XHRcdC8vIFN0YXJ0IHRvIG1lYXN1cmUgaW5wdXQgbGlmZWN5Y2xlXG5cdFx0XHR0aGlzLmlucHV0TGlmZWN5Y2xlU3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaChmYWxzZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlU2V0SW5wdXRFcnJvcihlcnJvciwgaW5wdXQsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlU2V0SW5wdXRFcnJvcihlcnJvcjogRXJyb3IsIGlucHV0OiBEaWZmRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSGFuZGxlIGNhc2Ugd2hlcmUgY29udGVudCBhcHBlYXJzIHRvIGJlIGJpbmFyeVxuXHRcdGlmICh0aGlzLmlzRmlsZUJpbmFyeUVycm9yKGVycm9yKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3BlbkFzQmluYXJ5KGlucHV0LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgY2FzZSB3aGVyZSBhIGZpbGUgaXMgdG9vIGxhcmdlIHRvIG9wZW4gd2l0aG91dCBjb25maXJtYXRpb25cblx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9UT09fTEFSR0UpIHtcblx0XHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBUb29MYXJnZUZpbGVPcGVyYXRpb25FcnJvcikge1xuXHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2ZpbGVUb29MYXJnZUZvckhlYXBFcnJvcldpdGhTaXplJywgXCJBdCBsZWFzdCBvbmUgZmlsZSBpcyBub3QgZGlzcGxheWVkIGluIHRoZSB0ZXh0IGNvbXBhcmUgZWRpdG9yIGJlY2F1c2UgaXQgaXMgdmVyeSBsYXJnZSAoezB9KS5cIiwgQnl0ZVNpemUuZm9ybWF0U2l6ZShlcnJvci5zaXplKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2ZpbGVUb29MYXJnZUZvckhlYXBFcnJvcldpdGhvdXRTaXplJywgXCJBdCBsZWFzdCBvbmUgZmlsZSBpcyBub3QgZGlzcGxheWVkIGluIHRoZSB0ZXh0IGNvbXBhcmUgZWRpdG9yIGJlY2F1c2UgaXQgaXMgdmVyeSBsYXJnZS5cIik7XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IGNyZWF0ZVRvb0xhcmdlRmlsZUVycm9yKHRoaXMuZ3JvdXAsIGlucHV0LCBvcHRpb25zLCBtZXNzYWdlLCB0aGlzLnByZWZlcmVuY2VzU2VydmljZSk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIG1ha2Ugc3VyZSB0aGUgZXJyb3IgYnViYmxlcyB1cFxuXHRcdHRocm93IGVycm9yO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlVGV4dERpZmZFZGl0b3JWaWV3U3RhdGUoZWRpdG9yOiBEaWZmRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCBjb250cm9sOiBJRGlmZkVkaXRvcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVkaXRvclZpZXdTdGF0ZSA9IHRoaXMubG9hZEVkaXRvclZpZXdTdGF0ZShlZGl0b3IsIGNvbnRleHQpO1xuXHRcdGlmIChlZGl0b3JWaWV3U3RhdGUpIHtcblx0XHRcdGlmIChvcHRpb25zPy5zZWxlY3Rpb24gJiYgZWRpdG9yVmlld1N0YXRlLm1vZGlmaWVkKSB7XG5cdFx0XHRcdGVkaXRvclZpZXdTdGF0ZS5tb2RpZmllZC5jdXJzb3JTdGF0ZSA9IFtdOyAvLyBwcmV2ZW50IGR1cGxpY2F0ZSBzZWxlY3Rpb25zIHZpYSBvcHRpb25zXG5cdFx0XHR9XG5cblx0XHRcdGNvbnRyb2wucmVzdG9yZVZpZXdTdGF0ZShlZGl0b3JWaWV3U3RhdGUpO1xuXG5cdFx0XHRpZiAob3B0aW9ucz8ucmV2ZWFsSWZWaXNpYmxlKSB7XG5cdFx0XHRcdGNvbnRyb2wucmV2ZWFsRmlyc3REaWZmKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkFzQmluYXJ5KGlucHV0OiBEaWZmRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gaW5wdXQub3JpZ2luYWw7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBpbnB1dC5tb2RpZmllZDtcblxuXHRcdC8vIFRoZSB0ZXh0IGRpZmYgZWRpdG9yIGNhbm5vdCByZW5kZXIgYmluYXJ5IGNvbnRlbnQuIEJlZm9yZSBmYWxsaW5nIGJhY2sgdG8gdGhlIGdlbmVyaWMgYmluYXJ5XG5cdFx0Ly8gXCJjYW5ub3QgZGlzcGxheVwiIHBhbmVsLCBjaGVjayB3aGV0aGVyIGEgY3VzdG9tIGVkaXRvciBjYW4gcmVuZGVyIGEgZGlmZiBmb3IgdGhpcyByZXNvdXJjZSBhbmRcblx0XHQvLyB1c2UgaXQgaW5zdGVhZC4gVGhpcyBpbnRlbnRpb25hbGx5IGluY2x1ZGVzIGVkaXRvcnMgdGhhdCBvcHRlZCBvdXQgb2YgZGlmZnMgdmlhIGEgYG5ldmVyYFxuXHRcdC8vIHByaW9yaXR5OiB0aGV5IG9wdCBvdXQgZm9yIHRleHQgZmlsZXMsIGJ1dCBhIGN1c3RvbSBkaWZmIGVkaXRvciBpcyBzdHJpY3RseSBiZXR0ZXIgdGhhbiB0aGVcblx0XHQvLyBiaW5hcnkgZmFsbGJhY2sgd2hlbiB0aGUgY29udGVudCBpcyBiaW5hcnkgKGUuZy4gYW4gaW1hZ2Ugb3IgaGV4IGRpZmYgZWRpdG9yKS5cblx0XHRjb25zdCBtb2RpZmllZFJlc291cmNlID0gbW9kaWZpZWQucmVzb3VyY2U7XG5cdFx0aWYgKG1vZGlmaWVkUmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGZhbGxiYWNrRWRpdG9ySWQgPSB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5nZXRCaW5hcnlEaWZmRmFsbGJhY2tFZGl0b3IobW9kaWZpZWRSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFJlc291cmNlID0gb3JpZ2luYWwucmVzb3VyY2U7XG5cdFx0XHRpZiAoZmFsbGJhY2tFZGl0b3JJZCAmJiBvcmlnaW5hbFJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IG9yaWdpbmFsUmVzb3VyY2UgfSxcblx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogbW9kaWZpZWRSZXNvdXJjZSB9LFxuXHRcdFx0XHRcdC8vIFBhc3NpbmcgYW4gZXhwbGljaXQgYG92ZXJyaWRlYCBieXBhc3NlcyB0aGUgYXV0b21hdGljIGBuZXZlcmAgZmlsdGVyaW5nIGFuZCB0aGUgZGlmZlxuXHRcdFx0XHRcdC8vIHNwZWNpYWwtY2FzaW5nLCBzbyB0aGUgcmVzb2x2ZXIgcmV0dXJucyB0aGUgY3VzdG9tIGRpZmYgZWRpdG9yIGRpcmVjdGx5LlxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgLi4ub3B0aW9ucywgb3ZlcnJpZGU6IGZhbGxiYWNrRWRpdG9ySWQgfVxuXHRcdFx0XHR9LCB0aGlzLmdyb3VwKTtcblx0XHRcdFx0aWYgKGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwKHJlc29sdmVkKSkge1xuXHRcdFx0XHRcdHRoaXMuZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3tcblx0XHRcdFx0XHRcdGVkaXRvcjogaW5wdXQsXG5cdFx0XHRcdFx0XHRyZXBsYWNlbWVudDogcmVzb2x2ZWQuZWRpdG9yLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHQuLi5yZXNvbHZlZC5vcHRpb25zLFxuXHRcdFx0XHRcdFx0XHRhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLlBSRVNFUlZFLFxuXHRcdFx0XHRcdFx0XHRwaW5uZWQ6IHRoaXMuZ3JvdXAuaXNQaW5uZWQoaW5wdXQpLFxuXHRcdFx0XHRcdFx0XHRzdGlja3k6IHRoaXMuZ3JvdXAuaXNTdGlja3koaW5wdXQpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGJpbmFyeURpZmZJbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZkVkaXRvcklucHV0LCBpbnB1dC5nZXROYW1lKCksIGlucHV0LmdldERlc2NyaXB0aW9uKCksIG9yaWdpbmFsLCBtb2RpZmllZCwgdHJ1ZSk7XG5cblx0XHQvLyBGb3J3YXJkIGJpbmFyeSBmbGFnIHRvIGlucHV0IGlmIHN1cHBvcnRlZFxuXHRcdGNvbnN0IGZpbGVFZGl0b3JGYWN0b3J5ID0gUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5nZXRGaWxlRWRpdG9yRmFjdG9yeSgpO1xuXHRcdGlmIChmaWxlRWRpdG9yRmFjdG9yeS5pc0ZpbGVFZGl0b3Iob3JpZ2luYWwpKSB7XG5cdFx0XHRvcmlnaW5hbC5zZXRGb3JjZU9wZW5Bc0JpbmFyeSgpO1xuXHRcdH1cblxuXHRcdGlmIChmaWxlRWRpdG9yRmFjdG9yeS5pc0ZpbGVFZGl0b3IobW9kaWZpZWQpKSB7XG5cdFx0XHRtb2RpZmllZC5zZXRGb3JjZU9wZW5Bc0JpbmFyeSgpO1xuXHRcdH1cblxuXHRcdC8vIFJlcGxhY2UgdGhpcyBlZGl0b3Igd2l0aCB0aGUgYmluYXJ5IG9uZVxuXHRcdHRoaXMuZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3tcblx0XHRcdGVkaXRvcjogaW5wdXQsXG5cdFx0XHRyZXBsYWNlbWVudDogYmluYXJ5RGlmZklucHV0LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHQvLyBNYWtlIHN1cmUgdG8gbm90IHN0ZWFsIGF3YXkgdGhlIGN1cnJlbnRseSBhY3RpdmUgZ3JvdXBcblx0XHRcdFx0Ly8gYmVjYXVzZSB3ZSBhcmUgdHJpZ2dlcmluZyBhbm90aGVyIG9wZW5FZGl0b3IoKSBjYWxsXG5cdFx0XHRcdC8vIGFuZCBkbyBub3QgY29udHJvbCB0aGUgaW5pdGlhbCBpbnRlbnQgdGhhdCByZXN1bHRlZFxuXHRcdFx0XHQvLyBpbiB1cyBub3cgb3BlbmluZyBhcyBiaW5hcnkuXG5cdFx0XHRcdGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uUFJFU0VSVkUsXG5cdFx0XHRcdHBpbm5lZDogdGhpcy5ncm91cC5pc1Bpbm5lZChpbnB1dCksXG5cdFx0XHRcdHN0aWNreTogdGhpcy5ncm91cC5pc1N0aWNreShpbnB1dClcblx0XHRcdH1cblx0XHR9XSk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRPcHRpb25zKG9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0YXBwbHlUZXh0RWRpdG9yT3B0aW9ucyhvcHRpb25zLCBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmRpZmZFZGl0b3JDb250cm9sKSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRIYW5kbGVDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQoZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgcmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdXBlci5zaG91bGRIYW5kbGVDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQoZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihyZXNvdXJjZSwgJ2RpZmZFZGl0b3InKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKHJlc291cmNlLCAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuZGlmZkVkaXRvcicpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNvbXB1dGVDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb246IElFZGl0b3JDb25maWd1cmF0aW9uKTogSUNvZGVFZGl0b3JPcHRpb25zIHtcblx0XHRjb25zdCBlZGl0b3JDb25maWd1cmF0aW9uID0gc3VwZXIuY29tcHV0ZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbik7XG5cblx0XHQvLyBIYW5kbGUgZGlmZiBlZGl0b3Igc3BlY2lhbGx5IGJ5IG1lcmdpbmcgaW4gZGlmZkVkaXRvciBjb25maWd1cmF0aW9uXG5cdFx0aWYgKGlzT2JqZWN0KGNvbmZpZ3VyYXRpb24uZGlmZkVkaXRvcikpIHtcblx0XHRcdGNvbnN0IGRpZmZFZGl0b3JDb25maWd1cmF0aW9uOiBJRGlmZkVkaXRvck9wdGlvbnMgPSBkZWVwQ2xvbmUoY29uZmlndXJhdGlvbi5kaWZmRWRpdG9yKTtcblxuXHRcdFx0Ly8gVXNlciBzZXR0aW5ncyBkZWZpbmVzIGBkaWZmRWRpdG9yLmNvZGVMZW5zYCwgYnV0IGhlcmUgd2UgcmVuYW1lIHRoYXQgdG8gYGRpZmZFZGl0b3IuZGlmZkNvZGVMZW5zYCB0byBhdm9pZCBjb2xsaXNpb25zIHdpdGggYGVkaXRvci5jb2RlTGVuc2AuXG5cdFx0XHRkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi5kaWZmQ29kZUxlbnMgPSBkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi5jb2RlTGVucztcblx0XHRcdGRlbGV0ZSBkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi5jb2RlTGVucztcblxuXHRcdFx0Ly8gVXNlciBzZXR0aW5ncyBkZWZpbmVzIGBkaWZmRWRpdG9yLndvcmRXcmFwYCwgYnV0IGhlcmUgd2UgcmVuYW1lIHRoYXQgdG8gYGRpZmZFZGl0b3IuZGlmZldvcmRXcmFwYCB0byBhdm9pZCBjb2xsaXNpb25zIHdpdGggYGVkaXRvci53b3JkV3JhcGAuXG5cdFx0XHRkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi5kaWZmV29yZFdyYXAgPSA8J29mZicgfCAnb24nIHwgJ2luaGVyaXQnIHwgdW5kZWZpbmVkPmRpZmZFZGl0b3JDb25maWd1cmF0aW9uLndvcmRXcmFwO1xuXHRcdFx0ZGVsZXRlIGRpZmZFZGl0b3JDb25maWd1cmF0aW9uLndvcmRXcmFwO1xuXG5cdFx0XHRPYmplY3QuYXNzaWduKGVkaXRvckNvbmZpZ3VyYXRpb24sIGRpZmZFZGl0b3JDb25maWd1cmF0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJib3NlID0gY29uZmlndXJhdGlvbi5hY2Nlc3NpYmlsaXR5Py52ZXJib3NpdHk/LmRpZmZFZGl0b3IgPz8gZmFsc2U7XG5cdFx0KGVkaXRvckNvbmZpZ3VyYXRpb24gYXMgSURpZmZFZGl0b3JPcHRpb25zKS5hY2Nlc3NpYmlsaXR5VmVyYm9zZSA9IHZlcmJvc2U7XG5cblx0XHRyZXR1cm4gZWRpdG9yQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRDb25maWd1cmF0aW9uT3ZlcnJpZGVzKGNvbmZpZ3VyYXRpb246IElFZGl0b3JDb25maWd1cmF0aW9uKTogSURpZmZFZGl0b3JPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3VwZXIuZ2V0Q29uZmlndXJhdGlvbk92ZXJyaWRlcyhjb25maWd1cmF0aW9uKSxcblx0XHRcdC4uLnRoaXMuZ2V0UmVhZG9ubHlDb25maWd1cmF0aW9uKHRoaXMuaW5wdXQ/LmlzUmVhZG9ubHkoKSksXG5cdFx0XHRvcmlnaW5hbEVkaXRhYmxlOiB0aGlzLmlucHV0IGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0ICYmICF0aGlzLmlucHV0Lm9yaWdpbmFsLmlzUmVhZG9ubHkoKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAnMmNoJ1xuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlUmVhZG9ubHkoaW5wdXQ6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHR0aGlzLmRpZmZFZGl0b3JDb250cm9sPy51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0Li4udGhpcy5nZXRSZWFkb25seUNvbmZpZ3VyYXRpb24oaW5wdXQuaXNSZWFkb25seSgpKSxcblx0XHRcdFx0b3JpZ2luYWxFZGl0YWJsZTogIWlucHV0Lm9yaWdpbmFsLmlzUmVhZG9ubHkoKSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci51cGRhdGVSZWFkb25seShpbnB1dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc0ZpbGVCaW5hcnlFcnJvcihlcnJvcjogRXJyb3JbXSk6IGJvb2xlYW47XG5cdHByaXZhdGUgaXNGaWxlQmluYXJ5RXJyb3IoZXJyb3I6IEVycm9yKTogYm9vbGVhbjtcblx0cHJpdmF0ZSBpc0ZpbGVCaW5hcnlFcnJvcihlcnJvcjogRXJyb3IgfCBFcnJvcltdKTogYm9vbGVhbiB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZXJyb3IpKSB7XG5cdFx0XHRjb25zdCBlcnJvcnMgPSBlcnJvcjtcblxuXHRcdFx0cmV0dXJuIGVycm9ycy5zb21lKGVycm9yID0+IHRoaXMuaXNGaWxlQmluYXJ5RXJyb3IoZXJyb3IpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKDxUZXh0RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS50ZXh0RmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gVGV4dEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JU19CSU5BUlk7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wcmV2aW91c1ZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy5fcHJldmlvdXNWaWV3TW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHJldmlvdXNWaWV3TW9kZWwgPSBudWxsO1xuXHRcdH1cblxuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblxuXHRcdC8vIExvZyBpbnB1dCBsaWZlY3ljbGUgdGVsZW1ldHJ5XG5cdFx0Y29uc3QgaW5wdXRMaWZlY3ljbGVFbGFwc2VkID0gdGhpcy5pbnB1dExpZmVjeWNsZVN0b3BXYXRjaD8uZWxhcHNlZCgpO1xuXHRcdHRoaXMuaW5wdXRMaWZlY3ljbGVTdG9wV2F0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBpbnB1dExpZmVjeWNsZUVsYXBzZWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLmxvZ0lucHV0TGlmZWN5Y2xlVGVsZW1ldHJ5KGlucHV0TGlmZWN5Y2xlRWxhcHNlZCwgdGhpcy5nZXRDb250cm9sKCk/LmdldE1vZGVsKCk/Lm1vZGlmaWVkPy5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIE1vZGVsXG5cdFx0dGhpcy5kaWZmRWRpdG9yQ29udHJvbD8uc2V0TW9kZWwobnVsbCk7XG5cdH1cblxuXHRwcml2YXRlIGxvZ0lucHV0TGlmZWN5Y2xlVGVsZW1ldHJ5KGR1cmF0aW9uOiBudW1iZXIsIGxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGxldCBjb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnMgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5kaWZmRWRpdG9yQ29udHJvbCBpbnN0YW5jZW9mIERpZmZFZGl0b3JXaWRnZXQpIHtcblx0XHRcdGNvbGxhcHNlVW5jaGFuZ2VkUmVnaW9ucyA9IHRoaXMuZGlmZkVkaXRvckNvbnRyb2wuY29sbGFwc2VVbmNoYW5nZWRSZWdpb25zO1xuXHRcdH1cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7XG5cdFx0XHRlZGl0b3JWaXNpYmxlVGltZU1zOiBudW1iZXI7XG5cdFx0XHRsYW5ndWFnZUlkOiBzdHJpbmc7XG5cdFx0XHRjb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnM6IGJvb2xlYW47XG5cdFx0fSwge1xuXHRcdFx0b3duZXI6ICdoZWRpZXQnO1xuXHRcdFx0ZWRpdG9yVmlzaWJsZVRpbWVNczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0luZGljYXRlcyB0aGUgdGltZSB0aGUgZGlmZiBlZGl0b3Igd2FzIHZpc2libGUgdG8gdGhlIHVzZXInIH07XG5cdFx0XHRsYW5ndWFnZUlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5kaWNhdGVzIGZvciB3aGljaCBsYW5ndWFnZSB0aGUgZGlmZiBlZGl0b3Igd2FzIHNob3duJyB9O1xuXHRcdFx0Y29sbGFwc2VVbmNoYW5nZWRSZWdpb25zOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5kaWNhdGVzIHdoZXRoZXIgdW5jaGFuZ2VkIHJlZ2lvbnMgd2VyZSBjb2xsYXBzZWQnIH07XG5cdFx0XHRjb21tZW50OiAnVGhpcyBldmVudCBnaXZlcyBpbnNpZ2h0IGFib3V0IGhvdyBsb25nIHRoZSBkaWZmIGVkaXRvciB3YXMgdmlzaWJsZSB0byB0aGUgdXNlci4nO1xuXHRcdH0+KCdkaWZmRWRpdG9yLmVkaXRvclZpc2libGVUaW1lJywge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZVRpbWVNczogZHVyYXRpb24sXG5cdFx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkID8/ICcnLFxuXHRcdFx0Y29sbGFwc2VVbmNoYW5nZWRSZWdpb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpOiBJRGlmZkVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvckNvbnRyb2w7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0dGhpcy5kaWZmRWRpdG9yQ29udHJvbD8uZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRpZmZFZGl0b3JDb250cm9sPy5oYXNUZXh0Rm9jdXMoKSB8fCBzdXBlci5oYXNGb2N1cygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldEVkaXRvclZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLnNldEVkaXRvclZpc2libGUodmlzaWJsZSk7XG5cblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0dGhpcy5kaWZmRWRpdG9yQ29udHJvbD8ub25WaXNpYmxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGlmZkVkaXRvckNvbnRyb2w/Lm9uSGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuZGlmZkVkaXRvckNvbnRyb2w/LmxheW91dChkaW1lbnNpb24pO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpIHtcblx0XHR0aGlzLmRpZmZFZGl0b3JDb250cm9sPy5zZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHRyYWNrc0VkaXRvclZpZXdTdGF0ZShpbnB1dDogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaW5wdXQgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZUVkaXRvclZpZXdTdGF0ZShyZXNvdXJjZTogVVJJKTogSURpZmZFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5kaWZmRWRpdG9yQ29udHJvbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZGlmZkVkaXRvckNvbnRyb2wuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsPy5tb2RpZmllZCB8fCAhbW9kZWwub3JpZ2luYWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHZpZXcgc3RhdGUgYWx3YXlzIG5lZWRzIGEgbW9kZWxcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFVyaSA9IHRoaXMudG9FZGl0b3JWaWV3U3RhdGVSZXNvdXJjZShtb2RlbCk7XG5cdFx0aWYgKCFtb2RlbFVyaSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gbW9kZWwgVVJJIGlzIG5lZWRlZCB0byBtYWtlIHN1cmUgd2Ugc2F2ZSB0aGUgdmlldyBzdGF0ZSBjb3JyZWN0bHlcblx0XHR9XG5cblx0XHRpZiAoIWlzRXF1YWwobW9kZWxVcmksIHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gcHJldmVudCBzYXZpbmcgdmlldyBzdGF0ZSBmb3IgYSBtb2RlbCB0aGF0IGlzIG5vdCB0aGUgZXhwZWN0ZWQgb25lXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvckNvbnRyb2wuc2F2ZVZpZXdTdGF0ZSgpID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0b0VkaXRvclZpZXdTdGF0ZVJlc291cmNlKG1vZGVsT3JJbnB1dDogSURpZmZFZGl0b3JNb2RlbCB8IEVkaXRvcklucHV0KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgb3JpZ2luYWw6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbW9kaWZpZWQ6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChtb2RlbE9ySW5wdXQgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdG9yaWdpbmFsID0gbW9kZWxPcklucHV0Lm9yaWdpbmFsLnJlc291cmNlO1xuXHRcdFx0bW9kaWZpZWQgPSBtb2RlbE9ySW5wdXQubW9kaWZpZWQucmVzb3VyY2U7XG5cdFx0fSBlbHNlIGlmICghaXNFZGl0b3JJbnB1dChtb2RlbE9ySW5wdXQpKSB7XG5cdFx0XHRvcmlnaW5hbCA9IG1vZGVsT3JJbnB1dC5vcmlnaW5hbC51cmk7XG5cdFx0XHRtb2RpZmllZCA9IG1vZGVsT3JJbnB1dC5tb2RpZmllZC51cmk7XG5cdFx0fVxuXG5cdFx0aWYgKCFvcmlnaW5hbCB8fCAhbW9kaWZpZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIGEgVVJJIHRoYXQgaXMgdGhlIEJhc2U2NCBjb25jYXRlbmF0aW9uIG9mIG9yaWdpbmFsICsgbW9kaWZpZWQgcmVzb3VyY2Vcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICdkaWZmJywgcGF0aDogYCR7bXVsdGlieXRlQXdhcmVCdG9hKG9yaWdpbmFsLnRvU3RyaW5nKCkpfSR7bXVsdGlieXRlQXdhcmVCdG9hKG1vZGlmaWVkLnRvU3RyaW5nKCkpfWAgfSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxVQUFVLDRCQUE0QjtBQUcvQyxTQUFTLDBCQUFnRDtBQUN6RCxTQUFTLHFCQUE2QyxrQkFBMkQsZUFBZSxrQ0FBa0MsdUJBQXVCLCtCQUErQjtBQUV4TixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFnRCx5Q0FBeUM7QUFDekYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBaUMsK0JBQStCO0FBQ2hFLFNBQVMsa0JBQWdGO0FBQ3pGLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUF1Qiw0QkFBNEI7QUFDbkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyx3QkFBNEM7QUFDckQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsVUFBOEIscUJBQXFCLGNBQWMsa0NBQWtDO0FBRTVHLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQXdCO0FBSzFCLElBQU0saUJBQU4sY0FBNkIsbUJBQXdFO0FB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
