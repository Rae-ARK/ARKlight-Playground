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
import "../../services/contribution.js";
import * as dom from "../../../../base/browser/dom.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, createEventDeliveryQueue } from "../../../../base/common/event.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import "./editor.css";
import { applyFontInfo } from "../../config/domFontInfo.js";
import { EditorConfiguration } from "../../config/editorConfiguration.js";
import { TabFocus } from "../../config/tabFocus.js";
import { EditorExtensionsRegistry } from "../../editorExtensions.js";
import { ICodeEditorService } from "../../services/codeEditorService.js";
import { View } from "../../view.js";
import { DOMLineBreaksComputerFactory } from "../../view/domLineBreaksComputer.js";
import { ViewUserInputEvents } from "../../view/viewUserInputEvents.js";
import { CodeEditorContributions } from "./codeEditorContributions.js";
import { EditorOption, filterFontDecorations, filterValidationDecorations } from "../../../common/config/editorOptions.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { editorUnnecessaryCodeOpacity } from "../../../common/core/editorColorRegistry.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { WordOperations } from "../../../common/cursor/cursorWordOperations.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { InternalEditorAction } from "../../../common/editorAction.js";
import * as editorCommon from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { EndOfLinePreference } from "../../../common/model.js";
import { ClassName } from "../../../common/model/intervalTree.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { VerticalRevealType } from "../../../common/viewEvents.js";
import { MonospaceLineBreaksComputerFactory } from "../../../common/viewModel/monospaceLineBreaksComputer.js";
import { ViewModel } from "../../../common/viewModel/viewModelImpl.js";
import { OutgoingViewModelEventKind } from "../../../common/viewModelEventDispatcher.js";
import * as nls from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { editorErrorForeground, editorHintForeground, editorInfoForeground, editorWarningForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { TextModelEditSource, EditSources } from "../../../common/textModelEditSource.js";
import { isObject } from "../../../../base/common/types.js";
import { IUserInteractionService } from "../../../../platform/userInteraction/browser/userInteractionService.js";
let CodeEditorWidget = class extends Disposable {
  constructor(domElement, _options, codeEditorWidgetOptions, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, userInteractionService) {
    super();
    this.languageConfigurationService = languageConfigurationService;
    //#region Eventing
    this._deliveryQueue = createEventDeliveryQueue();
    this._contributions = this._register(new CodeEditorContributions());
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidChangeModelContent = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelContent = this._onDidChangeModelContent.event;
    this._onDidChangeModelLanguage = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelLanguage = this._onDidChangeModelLanguage.event;
    this._onDidChangeModelLanguageConfiguration = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelLanguageConfiguration = this._onDidChangeModelLanguageConfiguration.event;
    this._onDidChangeModelOptions = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelOptions = this._onDidChangeModelOptions.event;
    this._onDidChangeModelDecorations = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelDecorations = this._onDidChangeModelDecorations.event;
    this._onDidChangeLineHeight = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeLineHeight = this._onDidChangeLineHeight.event;
    this._onDidChangeFont = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeFont = this._onDidChangeFont.event;
    this._onDidChangeModelTokens = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelTokens = this._onDidChangeModelTokens.event;
    this._onDidChangeConfiguration = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._onWillChangeModel = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onWillChangeModel = this._onWillChangeModel.event;
    this._onDidChangeModel = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModel = this._onDidChangeModel.event;
    this._onDidChangeCursorPosition = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeCursorPosition = this._onDidChangeCursorPosition.event;
    this._onDidChangeCursorSelection = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeCursorSelection = this._onDidChangeCursorSelection.event;
    this._onDidAttemptReadOnlyEdit = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidAttemptReadOnlyEdit = this._onDidAttemptReadOnlyEdit.event;
    this._onDidLayoutChange = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidLayoutChange = this._onDidLayoutChange.event;
    this._editorTextFocus = this._register(new BooleanEventEmitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidFocusEditorText = this._editorTextFocus.onDidChangeToTrue;
    this.onDidBlurEditorText = this._editorTextFocus.onDidChangeToFalse;
    this._editorWidgetFocus = this._register(new BooleanEventEmitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidFocusEditorWidget = this._editorWidgetFocus.onDidChangeToTrue;
    this.onDidBlurEditorWidget = this._editorWidgetFocus.onDidChangeToFalse;
    this._onWillType = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillType = this._onWillType.event;
    this._onDidType = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidType = this._onDidType.event;
    this._onDidCompositionStart = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidCompositionStart = this._onDidCompositionStart.event;
    this._onDidCompositionEnd = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidCompositionEnd = this._onDidCompositionEnd.event;
    this._onDidPaste = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidPaste = this._onDidPaste.event;
    this._onWillCopy = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillCopy = this._onWillCopy.event;
    this._onWillCut = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillCut = this._onWillCut.event;
    this._onWillPaste = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillPaste = this._onWillPaste.event;
    this._onMouseUp = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseUp = this._onMouseUp.event;
    this._onMouseDown = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDown = this._onMouseDown.event;
    this._onMouseDrag = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDrag = this._onMouseDrag.event;
    this._onMouseDrop = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDrop = this._onMouseDrop.event;
    this._onMouseDropCanceled = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDropCanceled = this._onMouseDropCanceled.event;
    this._onDropIntoEditor = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDropIntoEditor = this._onDropIntoEditor.event;
    this._onContextMenu = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onContextMenu = this._onContextMenu.event;
    this._onMouseMove = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseMove = this._onMouseMove.event;
    this._onMouseLeave = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseLeave = this._onMouseLeave.event;
    this._onMouseWheel = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseWheel = this._onMouseWheel.event;
    this._onKeyUp = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onKeyUp = this._onKeyUp.event;
    this._onKeyDown = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onKeyDown = this._onKeyDown.event;
    this._onDidContentSizeChange = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidContentSizeChange = this._onDidContentSizeChange.event;
    this._onDidScrollChange = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidScrollChange = this._onDidScrollChange.event;
    this._onDidChangeViewZones = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeViewZones = this._onDidChangeViewZones.event;
    this._onDidChangeHiddenAreas = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeHiddenAreas = this._onDidChangeHiddenAreas.event;
    this._updateCounter = 0;
    this._onWillTriggerEditorOperationEvent = this._register(new Emitter());
    this.onWillTriggerEditorOperationEvent = this._onWillTriggerEditorOperationEvent.event;
    this._onBeginUpdate = this._register(new Emitter());
    this.onBeginUpdate = this._onBeginUpdate.event;
    this._onEndUpdate = this._register(new Emitter());
    this.onEndUpdate = this._onEndUpdate.event;
    this._onBeforeExecuteEdit = this._register(new Emitter());
    this.onBeforeExecuteEdit = this._onBeforeExecuteEdit.event;
    this._actions = /* @__PURE__ */ new Map();
    this._bannerDomNode = null;
    this._dropIntoEditorDecorations = this.createDecorationsCollection();
    this.inComposition = false;
    codeEditorService.willCreateCodeEditor();
    const options = { ..._options };
    this._domElement = domElement;
    this._userInteractionService = userInteractionService;
    this._overflowWidgetsDomNode = options.overflowWidgetsDomNode;
    delete options.overflowWidgetsDomNode;
    this._id = ++EDITOR_ID;
    this._decorationTypeKeysToIds = {};
    this._decorationTypeSubtypes = {};
    this._telemetryData = codeEditorWidgetOptions.telemetryData;
    this._configuration = this._register(this._createConfiguration(
      codeEditorWidgetOptions.isSimpleWidget || false,
      codeEditorWidgetOptions.contextMenuId ?? (codeEditorWidgetOptions.isSimpleWidget ? MenuId.SimpleEditorContext : MenuId.EditorContext),
      options,
      accessibilityService
    ));
    this._domElement.style?.setProperty("--editor-font-size", this._configuration.options.get(EditorOption.fontSize) + "px");
    this._register(this._configuration.onDidChange((e) => {
      this._onDidChangeConfiguration.fire(e);
      const options2 = this._configuration.options;
      if (e.hasChanged(EditorOption.layoutInfo)) {
        const layoutInfo = options2.get(EditorOption.layoutInfo);
        this._onDidLayoutChange.fire(layoutInfo);
      }
      if (e.hasChanged(EditorOption.fontSize)) {
        this._domElement.style.setProperty("--editor-font-size", options2.get(EditorOption.fontSize) + "px");
      }
    }));
    this._contextKeyService = this._register(contextKeyService.createScoped(this._domElement));
    if (codeEditorWidgetOptions.contextKeyValues) {
      for (const [key, value] of Object.entries(codeEditorWidgetOptions.contextKeyValues)) {
        this._contextKeyService.createKey(key, value);
      }
    }
    this._notificationService = notificationService;
    this._codeEditorService = codeEditorService;
    this._commandService = commandService;
    this._themeService = themeService;
    this._register(new EditorContextKeysManager(this, this._contextKeyService));
    this._register(new EditorModeContext(this, this._contextKeyService, languageFeaturesService));
    this._instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
    this._modelData = null;
    this._contentWidgets = {};
    this._overlayWidgets = {};
    this._glyphMarginWidgets = {};
    let contributions;
    if (Array.isArray(codeEditorWidgetOptions.contributions)) {
      contributions = codeEditorWidgetOptions.contributions;
    } else {
      contributions = EditorExtensionsRegistry.getEditorContributions();
    }
    this._contributions.initialize(this, contributions, this._instantiationService);
    for (const action of EditorExtensionsRegistry.getEditorActions()) {
      if (this._actions.has(action.id)) {
        onUnexpectedError(new Error(`Cannot have two actions with the same id ${action.id}`));
        continue;
      }
      const internalAction = new InternalEditorAction(
        action.id,
        action.label,
        action.alias,
        action.metadata,
        action.precondition ?? void 0,
        (args) => {
          return this._instantiationService.invokeFunction((accessor) => {
            return Promise.resolve(action.runEditorCommand(accessor, this, args));
          });
        },
        this._contextKeyService
      );
      this._actions.set(internalAction.id, internalAction);
    }
    const isDropIntoEnabled = () => {
      return !this._configuration.options.get(EditorOption.readOnly) && this._configuration.options.get(EditorOption.dropIntoEditor).enabled;
    };
    this._register(new dom.DragAndDropObserver(this._domElement, {
      onDragOver: (e) => {
        if (!isDropIntoEnabled()) {
          return;
        }
        const target = this.getTargetAtClientPoint(e.clientX, e.clientY);
        if (target?.position) {
          this.showDropIndicatorAt(target.position);
        }
      },
      onDrop: async (e) => {
        if (!isDropIntoEnabled()) {
          return;
        }
        this.removeDropIndicator();
        if (!e.dataTransfer) {
          return;
        }
        const target = this.getTargetAtClientPoint(e.clientX, e.clientY);
        if (target?.position) {
          this._onDropIntoEditor.fire({ position: target.position, event: e });
        }
      },
      onDragLeave: () => {
        this.removeDropIndicator();
      },
      onDragEnd: () => {
        this.removeDropIndicator();
      }
    }));
    this._codeEditorService.addCodeEditor(this);
  }
  //#endregion
  get isSimpleWidget() {
    return this._configuration.isSimpleWidget;
  }
  get contextMenuId() {
    return this._configuration.contextMenuId;
  }
  get contextKeyService() {
    return this._contextKeyService;
  }
  writeScreenReaderContent(reason) {
    this._modelData?.view.writeScreenReaderContent(reason);
  }
  _createConfiguration(isSimpleWidget, contextMenuId, options, accessibilityService) {
    return new EditorConfiguration(isSimpleWidget, contextMenuId, options, this._domElement, accessibilityService);
  }
  getId() {
    return this.getEditorType() + ":" + this._id;
  }
  getEditorType() {
    return editorCommon.EditorType.ICodeEditor;
  }
  dispose() {
    this._codeEditorService.removeCodeEditor(this);
    this._actions.clear();
    this._contentWidgets = {};
    this._overlayWidgets = {};
    this._removeDecorationTypes();
    this._postDetachModelCleanup(this._detachModel());
    this._onDidDispose.fire();
    super.dispose();
  }
  invokeWithinContext(fn) {
    return this._instantiationService.invokeFunction(fn);
  }
  updateOptions(newOptions) {
    this._configuration.updateOptions(newOptions || {});
  }
  getOptions() {
    return this._configuration.options;
  }
  getOption(id) {
    return this._configuration.options.get(id);
  }
  getRawOptions() {
    return this._configuration.getRawOptions();
  }
  getOverflowWidgetsDomNode() {
    return this._overflowWidgetsDomNode;
  }
  getConfiguredWordAtPosition(position) {
    if (!this._modelData) {
      return null;
    }
    return WordOperations.getWordAtPosition(this._modelData.model, this._configuration.options.get(EditorOption.wordSeparators), this._configuration.options.get(EditorOption.wordSegmenterLocales), position);
  }
  getValue(options = null) {
    if (!this._modelData) {
      return "";
    }
    const preserveBOM = options && options.preserveBOM ? true : false;
    let eolPreference = EndOfLinePreference.TextDefined;
    if (options && options.lineEnding && options.lineEnding === "\n") {
      eolPreference = EndOfLinePreference.LF;
    } else if (options && options.lineEnding && options.lineEnding === "\r\n") {
      eolPreference = EndOfLinePreference.CRLF;
    }
    return this._modelData.model.getValue(eolPreference, preserveBOM);
  }
  setValue(newValue) {
    try {
      this._beginUpdate();
      if (!this._modelData) {
        return;
      }
      this._modelData.model.setValue(newValue);
    } finally {
      this._endUpdate();
    }
  }
  getModel() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.model;
  }
  setModel(_model = null) {
    try {
      this._beginUpdate();
      const model = _model;
      if (this._modelData === null && model === null) {
        return;
      }
      if (this._modelData && this._modelData.model === model) {
        return;
      }
      const e = {
        oldModelUrl: this._modelData?.model.uri || null,
        newModelUrl: model?.uri || null
      };
      this._onWillChangeModel.fire(e);
      const hasTextFocus = this.hasTextFocus();
      const detachedModel = this._detachModel();
      this._attachModel(model);
      if (this.hasModel()) {
        if (hasTextFocus) {
          this.focus();
        }
      } else {
        this._editorTextFocus.setValue(false);
        this._editorWidgetFocus.setValue(false);
      }
      this._removeDecorationTypes();
      this._onDidChangeModel.fire(e);
      this._postDetachModelCleanup(detachedModel);
      this._contributionsDisposable = this._contributions.onAfterModelAttached();
    } finally {
      this._endUpdate();
    }
  }
  _removeDecorationTypes() {
    this._decorationTypeKeysToIds = {};
    if (this._decorationTypeSubtypes) {
      for (const decorationType in this._decorationTypeSubtypes) {
        const subTypes = this._decorationTypeSubtypes[decorationType];
        for (const subType in subTypes) {
          this._removeDecorationType(decorationType + "-" + subType);
        }
      }
      this._decorationTypeSubtypes = {};
    }
  }
  getVisibleRanges() {
    if (!this._modelData) {
      return [];
    }
    return this._modelData.viewModel.getVisibleRanges();
  }
  getVisibleRangesPlusViewportAboveBelow() {
    if (!this._modelData) {
      return [];
    }
    return this._modelData.viewModel.getVisibleRangesPlusViewportAboveBelow();
  }
  getWhitespaces() {
    if (!this._modelData) {
      return [];
    }
    return this._modelData.viewModel.viewLayout.getWhitespaces();
  }
  static _getVerticalOffsetAfterPosition(modelData, modelLineNumber, modelColumn, includeViewZones) {
    const modelPosition = modelData.model.validatePosition({
      lineNumber: modelLineNumber,
      column: modelColumn
    });
    const viewPosition = modelData.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
    return modelData.viewModel.viewLayout.getVerticalOffsetAfterLineNumber(viewPosition.lineNumber, includeViewZones);
  }
  getTopForLineNumber(lineNumber, includeViewZones = false) {
    if (!this._modelData) {
      return -1;
    }
    return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, 1, includeViewZones);
  }
  getTopForPosition(lineNumber, column) {
    if (!this._modelData) {
      return -1;
    }
    return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, column, false);
  }
  static _getVerticalOffsetForPosition(modelData, modelLineNumber, modelColumn, includeViewZones = false) {
    const modelPosition = modelData.model.validatePosition({
      lineNumber: modelLineNumber,
      column: modelColumn
    });
    const viewPosition = modelData.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
    return modelData.viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber, includeViewZones);
  }
  getBottomForLineNumber(lineNumber, includeViewZones = false) {
    if (!this._modelData) {
      return -1;
    }
    return CodeEditorWidget._getVerticalOffsetAfterPosition(this._modelData, lineNumber, Number.MAX_SAFE_INTEGER, includeViewZones);
  }
  getLineHeightForPosition(position) {
    if (!this._modelData) {
      return -1;
    }
    const viewModel = this._modelData.viewModel;
    const coordinatesConverter = viewModel.coordinatesConverter;
    const pos = Position.lift(position);
    if (coordinatesConverter.modelPositionIsVisible(pos)) {
      const viewPosition = coordinatesConverter.convertModelPositionToViewPosition(pos);
      return viewModel.viewLayout.getLineHeightForLineNumber(viewPosition.lineNumber);
    }
    return 0;
  }
  setHiddenAreas(ranges, source, forceUpdate) {
    this._modelData?.viewModel.setHiddenAreas(ranges.map((r) => Range.lift(r)), source, forceUpdate);
  }
  getVisibleColumnFromPosition(rawPosition) {
    if (!this._modelData) {
      return rawPosition.column;
    }
    const position = this._modelData.model.validatePosition(rawPosition);
    const tabSize = this._modelData.model.getOptions().tabSize;
    return CursorColumns.visibleColumnFromColumn(this._modelData.model.getLineContent(position.lineNumber), position.column, tabSize) + 1;
  }
  getStatusbarColumn(rawPosition) {
    if (!this._modelData) {
      return rawPosition.column;
    }
    const position = this._modelData.model.validatePosition(rawPosition);
    const tabSize = this._modelData.model.getOptions().tabSize;
    return CursorColumns.toStatusbarColumn(this._modelData.model.getLineContent(position.lineNumber), position.column, tabSize);
  }
  getPosition() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getPosition();
  }
  setPosition(position, source = "api") {
    if (!this._modelData) {
      return;
    }
    if (!Position.isIPosition(position)) {
      throw new Error("Invalid arguments");
    }
    this._modelData.viewModel.setSelections(source, [{
      selectionStartLineNumber: position.lineNumber,
      selectionStartColumn: position.column,
      positionLineNumber: position.lineNumber,
      positionColumn: position.column
    }]);
  }
  _sendRevealRange(modelRange, verticalType, revealHorizontal, scrollType) {
    if (!this._modelData) {
      return;
    }
    if (!Range.isIRange(modelRange)) {
      throw new Error("Invalid arguments");
    }
    const validatedModelRange = this._modelData.model.validateRange(modelRange);
    const viewRange = this._modelData.viewModel.coordinatesConverter.convertModelRangeToViewRange(validatedModelRange);
    this._modelData.viewModel.revealRange("api", revealHorizontal, viewRange, verticalType, scrollType);
  }
  revealAllCursors(revealHorizontal, minimalReveal) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.revealAllCursors("api", revealHorizontal, minimalReveal);
  }
  revealLine(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.Simple, scrollType);
  }
  revealLineInCenter(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.Center, scrollType);
  }
  revealLineInCenterIfOutsideViewport(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.CenterIfOutsideViewport, scrollType);
  }
  revealLineNearTop(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.NearTop, scrollType);
  }
  _revealLine(lineNumber, revealType, scrollType) {
    if (typeof lineNumber !== "number") {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      new Range(lineNumber, 1, lineNumber, 1),
      revealType,
      false,
      scrollType
    );
  }
  revealPosition(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.Simple,
      true,
      scrollType
    );
  }
  revealPositionInCenter(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.Center,
      true,
      scrollType
    );
  }
  revealPositionInCenterIfOutsideViewport(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.CenterIfOutsideViewport,
      true,
      scrollType
    );
  }
  revealPositionNearTop(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.NearTop,
      true,
      scrollType
    );
  }
  _revealPosition(position, verticalType, revealHorizontal, scrollType) {
    if (!Position.isIPosition(position)) {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      new Range(position.lineNumber, position.column, position.lineNumber, position.column),
      verticalType,
      revealHorizontal,
      scrollType
    );
  }
  getSelection() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getSelection();
  }
  getSelections() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getSelections();
  }
  setSelection(something, source = "api") {
    const isSelection = Selection.isISelection(something);
    const isRange = Range.isIRange(something);
    if (!isSelection && !isRange) {
      throw new Error("Invalid arguments");
    }
    if (isSelection) {
      this._setSelectionImpl(something, source);
    } else if (isRange) {
      const selection = {
        selectionStartLineNumber: something.startLineNumber,
        selectionStartColumn: something.startColumn,
        positionLineNumber: something.endLineNumber,
        positionColumn: something.endColumn
      };
      this._setSelectionImpl(selection, source);
    }
  }
  _setSelectionImpl(sel, source) {
    if (!this._modelData) {
      return;
    }
    const selection = new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn);
    this._modelData.viewModel.setSelections(source, [selection]);
  }
  revealLines(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.Simple,
      scrollType
    );
  }
  revealLinesInCenter(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.Center,
      scrollType
    );
  }
  revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.CenterIfOutsideViewport,
      scrollType
    );
  }
  revealLinesNearTop(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.NearTop,
      scrollType
    );
  }
  _revealLines(startLineNumber, endLineNumber, verticalType, scrollType) {
    if (typeof startLineNumber !== "number" || typeof endLineNumber !== "number") {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      new Range(startLineNumber, 1, endLineNumber, 1),
      verticalType,
      false,
      scrollType
    );
  }
  revealRange(range, scrollType = editorCommon.ScrollType.Smooth, revealVerticalInCenter = false, revealHorizontal = true) {
    this._revealRange(
      range,
      revealVerticalInCenter ? VerticalRevealType.Center : VerticalRevealType.Simple,
      revealHorizontal,
      scrollType
    );
  }
  revealRangeInCenter(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.Center,
      true,
      scrollType
    );
  }
  revealRangeInCenterIfOutsideViewport(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.CenterIfOutsideViewport,
      true,
      scrollType
    );
  }
  revealRangeNearTop(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.NearTop,
      true,
      scrollType
    );
  }
  revealRangeNearTopIfOutsideViewport(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.NearTopIfOutsideViewport,
      true,
      scrollType
    );
  }
  revealRangeAtTop(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.Top,
      true,
      scrollType
    );
  }
  _revealRange(range, verticalType, revealHorizontal, scrollType) {
    if (!Range.isIRange(range)) {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      Range.lift(range),
      verticalType,
      revealHorizontal,
      scrollType
    );
  }
  setSelections(ranges, source = "api", reason = CursorChangeReason.NotSet) {
    if (!this._modelData) {
      return;
    }
    if (!ranges || ranges.length === 0) {
      throw new Error("Invalid arguments");
    }
    for (let i = 0, len = ranges.length; i < len; i++) {
      if (!Selection.isISelection(ranges[i])) {
        throw new Error("Invalid arguments");
      }
    }
    this._modelData.viewModel.setSelections(source, ranges, reason);
  }
  getContentWidth() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getContentWidth();
  }
  getScrollWidth() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getScrollWidth();
  }
  getScrollLeft() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getCurrentScrollLeft();
  }
  getContentHeight() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getContentHeight();
  }
  getScrollHeight() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getScrollHeight();
  }
  getScrollTop() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getCurrentScrollTop();
  }
  setScrollLeft(newScrollLeft, scrollType = editorCommon.ScrollType.Immediate) {
    if (!this._modelData) {
      return;
    }
    if (typeof newScrollLeft !== "number") {
      throw new Error("Invalid arguments");
    }
    this._modelData.viewModel.viewLayout.setScrollPosition({
      scrollLeft: newScrollLeft
    }, scrollType);
  }
  setScrollTop(newScrollTop, scrollType = editorCommon.ScrollType.Immediate) {
    if (!this._modelData) {
      return;
    }
    if (typeof newScrollTop !== "number") {
      throw new Error("Invalid arguments");
    }
    this._modelData.viewModel.viewLayout.setScrollPosition({
      scrollTop: newScrollTop
    }, scrollType);
  }
  setScrollPosition(position, scrollType = editorCommon.ScrollType.Immediate) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.viewLayout.setScrollPosition(position, scrollType);
  }
  hasPendingScrollAnimation() {
    if (!this._modelData) {
      return false;
    }
    return this._modelData.viewModel.viewLayout.hasPendingScrollAnimation();
  }
  saveViewState() {
    if (!this._modelData) {
      return null;
    }
    const contributionsState = this._contributions.saveViewState();
    const cursorState = this._modelData.viewModel.saveCursorState();
    const viewState = this._modelData.viewModel.saveState();
    return {
      cursorState,
      viewState,
      contributionsState
    };
  }
  restoreViewState(s) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    const codeEditorState = s;
    if (codeEditorState && codeEditorState.cursorState && codeEditorState.viewState) {
      const cursorState = codeEditorState.cursorState;
      if (Array.isArray(cursorState)) {
        if (cursorState.length > 0) {
          this._modelData.viewModel.restoreCursorState(cursorState);
        }
      } else {
        this._modelData.viewModel.restoreCursorState([cursorState]);
      }
      this._contributions.restoreViewState(codeEditorState.contributionsState || {});
      const reducedState = this._modelData.viewModel.reduceRestoreState(codeEditorState.viewState);
      this._modelData.view.restoreState(reducedState);
    }
  }
  handleInitialized() {
    this._getViewModel()?.visibleLinesStabilized();
  }
  onVisible() {
    this._modelData?.view.refreshFocusState();
  }
  onHide() {
    this._modelData?.view.refreshFocusState();
  }
  getContribution(id) {
    return this._contributions.get(id);
  }
  getActions() {
    return Array.from(this._actions.values());
  }
  getSupportedActions() {
    let result = this.getActions();
    result = result.filter((action) => action.isSupported());
    return result;
  }
  getAction(id) {
    return this._actions.get(id) || null;
  }
  trigger(source, handlerId, payload) {
    payload = payload || {};
    try {
      this._onWillTriggerEditorOperationEvent.fire({ source, handlerId, payload });
      this._beginUpdate();
      switch (handlerId) {
        case editorCommon.Handler.CompositionStart:
          this._startComposition();
          return;
        case editorCommon.Handler.CompositionEnd:
          this._endComposition(source);
          return;
        case editorCommon.Handler.Type: {
          const args = payload;
          this._type(source, args.text || "");
          return;
        }
        case editorCommon.Handler.ReplacePreviousChar: {
          const args = payload;
          this._compositionType(source, args.text || "", args.replaceCharCnt || 0, 0, 0);
          return;
        }
        case editorCommon.Handler.CompositionType: {
          const args = payload;
          this._compositionType(source, args.text || "", args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0);
          return;
        }
        case editorCommon.Handler.Paste: {
          const args = payload;
          this._paste(source, args.text || "", args.pasteOnNewLine || false, args.multicursorText || null, args.mode || null, args.clipboardEvent);
          return;
        }
        case editorCommon.Handler.Cut:
          this._cut(source);
          return;
      }
      const action = this.getAction(handlerId);
      if (action) {
        Promise.resolve(action.run(payload)).then(void 0, onUnexpectedError);
        return;
      }
      if (!this._modelData) {
        return;
      }
      if (this._triggerEditorCommand(source, handlerId, payload)) {
        return;
      }
      this._triggerCommand(handlerId, payload);
    } finally {
      this._endUpdate();
    }
  }
  _triggerCommand(handlerId, payload) {
    this._commandService.executeCommand(handlerId, payload);
  }
  _startComposition() {
    if (!this._modelData) {
      return;
    }
    this.inComposition = true;
    this._modelData.viewModel.startComposition();
    this._onDidCompositionStart.fire();
  }
  _endComposition(source) {
    if (!this._modelData) {
      return;
    }
    this.inComposition = false;
    this._modelData.viewModel.endComposition(source);
    this._onDidCompositionEnd.fire();
  }
  _type(source, text) {
    if (!this._modelData || text.length === 0) {
      return;
    }
    if (source === "keyboard") {
      this._onWillType.fire(text);
    }
    this._modelData.viewModel.type(text, source);
    if (source === "keyboard") {
      this._onDidType.fire(text);
    }
  }
  _compositionType(source, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source);
  }
  _paste(source, text, pasteOnNewLine, multicursorText, mode, clipboardEvent) {
    if (!this._modelData) {
      return;
    }
    const viewModel = this._modelData.viewModel;
    const startPosition = viewModel.getSelection().getStartPosition();
    viewModel.paste(text, pasteOnNewLine, multicursorText, source);
    const endPosition = viewModel.getSelection().getStartPosition();
    if (source === "keyboard") {
      this._onDidPaste.fire({
        clipboardEvent,
        range: new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column),
        languageId: mode
      });
    }
  }
  _cut(source) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.cut(source);
  }
  _triggerEditorCommand(source, handlerId, payload) {
    const command = EditorExtensionsRegistry.getEditorCommand(handlerId);
    if (command) {
      payload = payload || {};
      if (isObject(payload)) {
        payload.source = source;
      }
      this._instantiationService.invokeFunction((accessor) => {
        Promise.resolve(command.runEditorCommand(accessor, this, payload)).then(void 0, onUnexpectedError);
      });
      return true;
    }
    return false;
  }
  _getViewModel() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel;
  }
  pushUndoStop() {
    if (!this._modelData) {
      return false;
    }
    if (this._configuration.options.get(EditorOption.readOnly)) {
      return false;
    }
    this._modelData.model.pushStackElement();
    return true;
  }
  popUndoStop() {
    if (!this._modelData) {
      return false;
    }
    if (this._configuration.options.get(EditorOption.readOnly)) {
      return false;
    }
    this._modelData.model.popStackElement();
    return true;
  }
  edit(edit, reason) {
    return this.executeEdits(reason, edit.replacements.map((e) => ({ range: e.range, text: e.text })), void 0);
  }
  executeEdits(source, edits, endCursorState) {
    if (!this._modelData) {
      return false;
    }
    if (this._configuration.options.get(EditorOption.readOnly)) {
      return false;
    }
    let cursorStateComputer;
    if (!endCursorState) {
      cursorStateComputer = () => null;
    } else if (Array.isArray(endCursorState)) {
      cursorStateComputer = () => endCursorState;
    } else {
      cursorStateComputer = endCursorState;
    }
    let sourceStr;
    let reason;
    if (source instanceof TextModelEditSource) {
      reason = source;
      sourceStr = source.metadata.source;
    } else {
      reason = EditSources.unknown({ name: source });
      sourceStr = source;
    }
    this._onBeforeExecuteEdit.fire({ source: sourceStr ?? void 0 });
    this._modelData.viewModel.executeEdits(sourceStr, edits, cursorStateComputer, reason);
    return true;
  }
  executeCommand(source, command) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.executeCommand(command, source);
  }
  executeCommands(source, commands) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.executeCommands(commands, source);
  }
  createDecorationsCollection(decorations) {
    return new EditorDecorationsCollection(this, decorations);
  }
  changeDecorations(callback) {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.model.changeDecorations(callback, this._id);
  }
  getLineDecorations(lineNumber) {
    if (!this._modelData) {
      return null;
    }
    const options = this._configuration.options;
    return this._modelData.model.getLineDecorations(lineNumber, this._id, filterValidationDecorations(options), filterFontDecorations(options));
  }
  getDecorationsInRange(range) {
    if (!this._modelData) {
      return null;
    }
    const options = this._configuration.options;
    return this._modelData.model.getDecorationsInRange(range, this._id, filterValidationDecorations(options), filterFontDecorations(options));
  }
  getFontSizeAtPosition(position) {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getFontSizeAtPosition(position);
  }
  /**
   * @deprecated
   */
  deltaDecorations(oldDecorations, newDecorations) {
    if (!this._modelData) {
      return [];
    }
    if (oldDecorations.length === 0 && newDecorations.length === 0) {
      return oldDecorations;
    }
    return this._modelData.model.deltaDecorations(oldDecorations, newDecorations, this._id);
  }
  removeDecorations(decorationIds) {
    if (!this._modelData || decorationIds.length === 0) {
      return;
    }
    this._modelData.model.changeDecorations((changeAccessor) => {
      changeAccessor.deltaDecorations(decorationIds, []);
    });
  }
  setDecorationsByType(description, decorationTypeKey, decorationOptions) {
    const newDecorationsSubTypes = {};
    const oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
    this._decorationTypeSubtypes[decorationTypeKey] = newDecorationsSubTypes;
    const newModelDecorations = [];
    for (const decorationOption of decorationOptions) {
      let typeKey = decorationTypeKey;
      if (decorationOption.renderOptions) {
        const subType = hash(decorationOption.renderOptions).toString(16);
        typeKey = decorationTypeKey + "-" + subType;
        if (!oldDecorationsSubTypes[subType] && !newDecorationsSubTypes[subType]) {
          this._registerDecorationType(description, typeKey, decorationOption.renderOptions, decorationTypeKey);
        }
        newDecorationsSubTypes[subType] = true;
      }
      const opts = this._resolveDecorationOptions(typeKey, !!decorationOption.hoverMessage);
      if (decorationOption.hoverMessage) {
        opts.hoverMessage = decorationOption.hoverMessage;
      }
      newModelDecorations.push({ range: decorationOption.range, options: opts });
    }
    for (const subType in oldDecorationsSubTypes) {
      if (!newDecorationsSubTypes[subType]) {
        this._removeDecorationType(decorationTypeKey + "-" + subType);
      }
    }
    const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
    this.changeDecorations((accessor) => this._decorationTypeKeysToIds[decorationTypeKey] = accessor.deltaDecorations(oldDecorationsIds, newModelDecorations));
    return this._decorationTypeKeysToIds[decorationTypeKey] || [];
  }
  setDecorationsByTypeFast(decorationTypeKey, ranges) {
    const oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
    for (const subType in oldDecorationsSubTypes) {
      this._removeDecorationType(decorationTypeKey + "-" + subType);
    }
    this._decorationTypeSubtypes[decorationTypeKey] = {};
    const opts = ModelDecorationOptions.createDynamic(this._resolveDecorationOptions(decorationTypeKey, false));
    const newModelDecorations = new Array(ranges.length);
    for (let i = 0, len = ranges.length; i < len; i++) {
      newModelDecorations[i] = { range: ranges[i], options: opts };
    }
    const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
    this.changeDecorations((accessor) => this._decorationTypeKeysToIds[decorationTypeKey] = accessor.deltaDecorations(oldDecorationsIds, newModelDecorations));
  }
  removeDecorationsByType(decorationTypeKey) {
    const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey];
    if (oldDecorationsIds) {
      this.changeDecorations((accessor) => accessor.deltaDecorations(oldDecorationsIds, []));
    }
    if (this._decorationTypeKeysToIds.hasOwnProperty(decorationTypeKey)) {
      delete this._decorationTypeKeysToIds[decorationTypeKey];
    }
    if (this._decorationTypeSubtypes.hasOwnProperty(decorationTypeKey)) {
      const items = this._decorationTypeSubtypes[decorationTypeKey];
      for (const subType of Object.keys(items)) {
        this._removeDecorationType(decorationTypeKey + "-" + subType);
      }
      delete this._decorationTypeSubtypes[decorationTypeKey];
    }
  }
  getLayoutInfo() {
    const options = this._configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    return layoutInfo;
  }
  createOverviewRuler(cssClassName) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    return this._modelData.view.createOverviewRuler(cssClassName);
  }
  getContainerDomNode() {
    return this._domElement;
  }
  getDomNode() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    return this._modelData.view.domNode.domNode;
  }
  delegateVerticalScrollbarPointerDown(browserEvent) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  layout(dimension, postponeRendering = false) {
    this._configuration.observeContainer(dimension);
    if (!postponeRendering) {
      this.render();
    }
  }
  focus() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.focus();
  }
  hasTextFocus() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return false;
    }
    return this._modelData.view.isFocused();
  }
  hasWidgetFocus() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return false;
    }
    return this._modelData.view.isWidgetFocused();
  }
  addContentWidget(widget) {
    const widgetData = {
      widget,
      position: widget.getPosition()
    };
    if (this._contentWidgets.hasOwnProperty(widget.getId())) {
      console.warn("Overwriting a content widget with the same id:" + widget.getId());
    }
    this._contentWidgets[widget.getId()] = widgetData;
    if (this._modelData && this._modelData.hasRealView) {
      this._modelData.view.addContentWidget(widgetData);
    }
  }
  layoutContentWidget(widget) {
    const widgetId = widget.getId();
    if (this._contentWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._contentWidgets[widgetId];
      widgetData.position = widget.getPosition();
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.layoutContentWidget(widgetData);
      }
    }
  }
  removeContentWidget(widget) {
    const widgetId = widget.getId();
    if (this._contentWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._contentWidgets[widgetId];
      delete this._contentWidgets[widgetId];
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.removeContentWidget(widgetData);
      }
    }
  }
  addOverlayWidget(widget) {
    const widgetData = {
      widget,
      position: widget.getPosition()
    };
    if (this._overlayWidgets.hasOwnProperty(widget.getId())) {
      console.warn("Overwriting an overlay widget with the same id.");
    }
    this._overlayWidgets[widget.getId()] = widgetData;
    if (this._modelData && this._modelData.hasRealView) {
      this._modelData.view.addOverlayWidget(widgetData);
    }
  }
  layoutOverlayWidget(widget) {
    const widgetId = widget.getId();
    if (this._overlayWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._overlayWidgets[widgetId];
      widgetData.position = widget.getPosition();
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.layoutOverlayWidget(widgetData);
      }
    }
  }
  removeOverlayWidget(widget) {
    const widgetId = widget.getId();
    if (this._overlayWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._overlayWidgets[widgetId];
      delete this._overlayWidgets[widgetId];
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.removeOverlayWidget(widgetData);
      }
    }
  }
  addGlyphMarginWidget(widget) {
    const widgetData = {
      widget,
      position: widget.getPosition()
    };
    if (this._glyphMarginWidgets.hasOwnProperty(widget.getId())) {
      console.warn("Overwriting a glyph margin widget with the same id.");
    }
    this._glyphMarginWidgets[widget.getId()] = widgetData;
    if (this._modelData && this._modelData.hasRealView) {
      this._modelData.view.addGlyphMarginWidget(widgetData);
    }
  }
  layoutGlyphMarginWidget(widget) {
    const widgetId = widget.getId();
    if (this._glyphMarginWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._glyphMarginWidgets[widgetId];
      widgetData.position = widget.getPosition();
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.layoutGlyphMarginWidget(widgetData);
      }
    }
  }
  removeGlyphMarginWidget(widget) {
    const widgetId = widget.getId();
    if (this._glyphMarginWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._glyphMarginWidgets[widgetId];
      delete this._glyphMarginWidgets[widgetId];
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.removeGlyphMarginWidget(widgetData);
      }
    }
  }
  changeViewZones(callback) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.change(callback);
  }
  getTargetAtClientPoint(clientX, clientY) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    return this._modelData.view.getTargetAtClientPoint(clientX, clientY);
  }
  getScrolledVisiblePosition(rawPosition) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    const position = this._modelData.model.validatePosition(rawPosition);
    const options = this._configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const top = CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, position.lineNumber, position.column) - this.getScrollTop();
    const left = this._modelData.view.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - this.getScrollLeft();
    const height = this.getLineHeightForPosition(position);
    return {
      top,
      left,
      height
    };
  }
  getOffsetForColumn(lineNumber, column) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return -1;
    }
    return this._modelData.view.getOffsetForColumn(lineNumber, column);
  }
  getWidthOfLine(lineNumber) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return -1;
    }
    return this._modelData.view.getLineWidth(lineNumber);
  }
  resetLineWidthCaches() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.resetLineWidthCaches();
  }
  render(forceRedraw = false) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.viewModel.batchEvents(() => {
      this._modelData.view.render(true, forceRedraw);
    });
  }
  renderAsync(forceRedraw = false) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.viewModel.batchEvents(() => {
      this._modelData.view.render(false, forceRedraw);
    });
  }
  setAriaOptions(options) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.setAriaOptions(options);
  }
  applyFontInfo(target) {
    applyFontInfo(target, this._configuration.options.get(EditorOption.fontInfo));
  }
  setBanner(domNode, domNodeHeight) {
    if (this._bannerDomNode && this._domElement.contains(this._bannerDomNode)) {
      this._bannerDomNode.remove();
    }
    this._bannerDomNode = domNode;
    this._configuration.setReservedHeight(domNode ? domNodeHeight : 0);
    if (this._bannerDomNode) {
      this._domElement.prepend(this._bannerDomNode);
    }
  }
  _attachModel(model) {
    if (!model) {
      this._modelData = null;
      return;
    }
    const listenersToRemove = [];
    this._domElement.setAttribute("data-mode-id", model.getLanguageId());
    this._configuration.setIsDominatedByLongLines(model.isDominatedByLongLines());
    this._configuration.setModelLineCount(model.getLineCount());
    const attachedView = model.onBeforeAttached();
    const viewModel = new ViewModel(
      this._id,
      this._configuration,
      model,
      DOMLineBreaksComputerFactory.create(dom.getWindow(this._domElement)),
      MonospaceLineBreaksComputerFactory.create(this._configuration.options),
      (callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(this._domElement), callback),
      this.languageConfigurationService,
      this._themeService,
      attachedView,
      {
        batchChanges: (cb) => {
          try {
            this._beginUpdate();
            return cb();
          } finally {
            this._endUpdate();
          }
        }
      }
    );
    listenersToRemove.push(model.onWillDispose(() => this.setModel(null)));
    listenersToRemove.push(viewModel.onEvent((e) => {
      switch (e.kind) {
        case OutgoingViewModelEventKind.ContentSizeChanged:
          this._onDidContentSizeChange.fire(e);
          break;
        case OutgoingViewModelEventKind.FocusChanged:
          this._editorTextFocus.setValue(e.hasFocus);
          break;
        case OutgoingViewModelEventKind.WidgetFocusChanged:
          this._editorWidgetFocus.setValue(e.hasFocus);
          break;
        case OutgoingViewModelEventKind.ScrollChanged:
          this._onDidScrollChange.fire(e);
          break;
        case OutgoingViewModelEventKind.ViewZonesChanged:
          this._onDidChangeViewZones.fire();
          break;
        case OutgoingViewModelEventKind.HiddenAreasChanged:
          this._onDidChangeHiddenAreas.fire();
          break;
        case OutgoingViewModelEventKind.ReadOnlyEditAttempt:
          this._onDidAttemptReadOnlyEdit.fire();
          break;
        case OutgoingViewModelEventKind.CursorStateChanged: {
          if (e.reachedMaxCursorCount) {
            const multiCursorLimit = this.getOption(EditorOption.multiCursorLimit);
            const message = nls.localize("cursors.maximum", "The number of cursors has been limited to {0}. Consider using [find and replace](https://code.visualstudio.com/docs/editor/codebasics#_find-and-replace) for larger changes or increase the editor multi cursor limit setting.", multiCursorLimit);
            this._notificationService.prompt(Severity.Warning, message, [
              {
                label: "Find and Replace",
                run: () => {
                  this._commandService.executeCommand("editor.action.startFindReplaceAction");
                }
              },
              {
                label: nls.localize("goToSetting", "Increase Multi Cursor Limit"),
                run: () => {
                  this._commandService.executeCommand("workbench.action.openSettings2", {
                    query: "editor.multiCursorLimit"
                  });
                }
              }
            ]);
          }
          const positions = [];
          for (let i = 0, len = e.selections.length; i < len; i++) {
            positions[i] = e.selections[i].getPosition();
          }
          const e1 = {
            position: positions[0],
            secondaryPositions: positions.slice(1),
            reason: e.reason,
            source: e.source
          };
          this._onDidChangeCursorPosition.fire(e1);
          const e2 = {
            selection: e.selections[0],
            secondarySelections: e.selections.slice(1),
            modelVersionId: e.modelVersionId,
            oldSelections: e.oldSelections,
            oldModelVersionId: e.oldModelVersionId,
            source: e.source,
            reason: e.reason
          };
          this._onDidChangeCursorSelection.fire(e2);
          break;
        }
        case OutgoingViewModelEventKind.ModelDecorationsChanged:
          this._onDidChangeModelDecorations.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelLanguageChanged:
          this._domElement.setAttribute("data-mode-id", model.getLanguageId());
          this._onDidChangeModelLanguage.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelLanguageConfigurationChanged:
          this._onDidChangeModelLanguageConfiguration.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelContentChanged:
          this._onDidChangeModelContent.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelOptionsChanged:
          this._onDidChangeModelOptions.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelTokensChanged:
          this._onDidChangeModelTokens.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelLineHeightChanged:
          this._onDidChangeLineHeight.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelFontChangedEvent:
          this._onDidChangeFont.fire(e.event);
          break;
      }
    }));
    const [view, hasRealView] = this._createView(viewModel);
    if (hasRealView) {
      this._domElement.appendChild(view.domNode.domNode);
      let keys = Object.keys(this._contentWidgets);
      for (let i = 0, len = keys.length; i < len; i++) {
        const widgetId = keys[i];
        view.addContentWidget(this._contentWidgets[widgetId]);
      }
      keys = Object.keys(this._overlayWidgets);
      for (let i = 0, len = keys.length; i < len; i++) {
        const widgetId = keys[i];
        view.addOverlayWidget(this._overlayWidgets[widgetId]);
      }
      keys = Object.keys(this._glyphMarginWidgets);
      for (let i = 0, len = keys.length; i < len; i++) {
        const widgetId = keys[i];
        view.addGlyphMarginWidget(this._glyphMarginWidgets[widgetId]);
      }
      view.render(false, true);
      view.domNode.domNode.setAttribute("data-uri", model.uri.toString());
      listenersToRemove.push(view.onWillCopy((e) => this._onWillCopy.fire(e)));
      listenersToRemove.push(view.onWillCut((e) => this._onWillCut.fire(e)));
      listenersToRemove.push(view.onWillPaste((e) => this._onWillPaste.fire(e)));
    }
    this._modelData = new ModelData(model, viewModel, view, hasRealView, listenersToRemove, attachedView);
  }
  _createView(viewModel) {
    let commandDelegate;
    if (this.isSimpleWidget) {
      commandDelegate = {
        paste: (text, pasteOnNewLine, multicursorText, mode) => {
          this._paste("keyboard", text, pasteOnNewLine, multicursorText, mode);
        },
        type: (text) => {
          this._type("keyboard", text);
        },
        compositionType: (text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) => {
          this._compositionType("keyboard", text, replacePrevCharCnt, replaceNextCharCnt, positionDelta);
        },
        startComposition: () => {
          this._startComposition();
        },
        endComposition: () => {
          this._endComposition("keyboard");
        },
        cut: () => {
          this._cut("keyboard");
        }
      };
    } else {
      commandDelegate = {
        paste: (text, pasteOnNewLine, multicursorText, mode) => {
          const payload = { text, pasteOnNewLine, multicursorText, mode };
          this._commandService.executeCommand(editorCommon.Handler.Paste, payload);
        },
        type: (text) => {
          const payload = { text };
          this._commandService.executeCommand(editorCommon.Handler.Type, payload);
        },
        compositionType: (text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) => {
          if (replaceNextCharCnt || positionDelta) {
            const payload = { text, replacePrevCharCnt, replaceNextCharCnt, positionDelta };
            this._commandService.executeCommand(editorCommon.Handler.CompositionType, payload);
          } else {
            const payload = { text, replaceCharCnt: replacePrevCharCnt };
            this._commandService.executeCommand(editorCommon.Handler.ReplacePreviousChar, payload);
          }
        },
        startComposition: () => {
          this._commandService.executeCommand(editorCommon.Handler.CompositionStart, {});
        },
        endComposition: () => {
          this._commandService.executeCommand(editorCommon.Handler.CompositionEnd, {});
        },
        cut: () => {
          this._commandService.executeCommand(editorCommon.Handler.Cut, {});
        }
      };
    }
    const viewUserInputEvents = new ViewUserInputEvents(viewModel.coordinatesConverter);
    viewUserInputEvents.onKeyDown = (e) => this._onKeyDown.fire(e);
    viewUserInputEvents.onKeyUp = (e) => this._onKeyUp.fire(e);
    viewUserInputEvents.onContextMenu = (e) => this._onContextMenu.fire(e);
    viewUserInputEvents.onMouseMove = (e) => this._onMouseMove.fire(e);
    viewUserInputEvents.onMouseLeave = (e) => this._onMouseLeave.fire(e);
    viewUserInputEvents.onMouseDown = (e) => this._onMouseDown.fire(e);
    viewUserInputEvents.onMouseUp = (e) => this._onMouseUp.fire(e);
    viewUserInputEvents.onMouseDrag = (e) => this._onMouseDrag.fire(e);
    viewUserInputEvents.onMouseDrop = (e) => this._onMouseDrop.fire(e);
    viewUserInputEvents.onMouseDropCanceled = (e) => this._onMouseDropCanceled.fire(e);
    viewUserInputEvents.onMouseWheel = (e) => this._onMouseWheel.fire(e);
    const view = new View(
      this._domElement,
      this.getId(),
      commandDelegate,
      this._configuration,
      this._themeService.getColorTheme(),
      viewModel,
      viewUserInputEvents,
      this._overflowWidgetsDomNode,
      this._instantiationService,
      this._userInteractionService
    );
    return [view, true];
  }
  _postDetachModelCleanup(detachedModel) {
    detachedModel?.removeAllDecorationsWithOwnerId(this._id);
  }
  _detachModel() {
    this._contributionsDisposable?.dispose();
    this._contributionsDisposable = void 0;
    if (!this._modelData) {
      return null;
    }
    const model = this._modelData.model;
    const removeDomNode = this._modelData.hasRealView ? this._modelData.view.domNode.domNode : null;
    this._modelData.dispose();
    this._modelData = null;
    this._domElement.removeAttribute("data-mode-id");
    if (removeDomNode && this._domElement.contains(removeDomNode)) {
      removeDomNode.remove();
    }
    if (this._bannerDomNode && this._domElement.contains(this._bannerDomNode)) {
      this._bannerDomNode.remove();
    }
    return model;
  }
  _registerDecorationType(description, key, options, parentTypeKey) {
    this._codeEditorService.registerDecorationType(description, key, options, parentTypeKey, this);
  }
  _removeDecorationType(key) {
    this._codeEditorService.removeDecorationType(key);
  }
  _resolveDecorationOptions(typeKey, writable) {
    return this._codeEditorService.resolveDecorationOptions(typeKey, writable);
  }
  getTelemetryData() {
    return this._telemetryData;
  }
  hasModel() {
    return this._modelData !== null;
  }
  showDropIndicatorAt(position) {
    const newDecorations = [{
      range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
      options: CodeEditorWidget.dropIntoEditorDecorationOptions
    }];
    this._dropIntoEditorDecorations.set(newDecorations);
    this.revealPosition(position, editorCommon.ScrollType.Immediate);
  }
  removeDropIndicator() {
    this._dropIntoEditorDecorations.clear();
  }
  setContextValue(key, value) {
    this._contextKeyService.createKey(key, value);
  }
  _beginUpdate() {
    this._updateCounter++;
    if (this._updateCounter === 1) {
      this._onBeginUpdate.fire();
    }
  }
  _endUpdate() {
    this._updateCounter--;
    if (this._updateCounter === 0) {
      this._onEndUpdate.fire();
    }
  }
};
CodeEditorWidget.dropIntoEditorDecorationOptions = ModelDecorationOptions.register({
  description: "workbench-dnd-target",
  className: "dnd-target"
});
CodeEditorWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, ILanguageConfigurationService),
  __decorateParam(11, ILanguageFeaturesService),
  __decorateParam(12, IUserInteractionService)
], CodeEditorWidget);
let EDITOR_ID = 0;
class ModelData {
  constructor(model, viewModel, view, hasRealView, listenersToRemove, attachedView) {
    this.model = model;
    this.viewModel = viewModel;
    this.view = view;
    this.hasRealView = hasRealView;
    this.listenersToRemove = listenersToRemove;
    this.attachedView = attachedView;
  }
  dispose() {
    dispose(this.listenersToRemove);
    this.model.onBeforeDetached(this.attachedView);
    if (this.hasRealView) {
      this.view.dispose();
    }
    this.viewModel.dispose();
  }
}
var BooleanEventValue = /* @__PURE__ */ ((BooleanEventValue2) => {
  BooleanEventValue2[BooleanEventValue2["NotSet"] = 0] = "NotSet";
  BooleanEventValue2[BooleanEventValue2["False"] = 1] = "False";
  BooleanEventValue2[BooleanEventValue2["True"] = 2] = "True";
  return BooleanEventValue2;
})(BooleanEventValue || {});
class BooleanEventEmitter extends Disposable {
  constructor(_emitterOptions) {
    super();
    this._emitterOptions = _emitterOptions;
    this._onDidChangeToTrue = this._register(new Emitter(this._emitterOptions));
    this.onDidChangeToTrue = this._onDidChangeToTrue.event;
    this._onDidChangeToFalse = this._register(new Emitter(this._emitterOptions));
    this.onDidChangeToFalse = this._onDidChangeToFalse.event;
    this._value = 0 /* NotSet */;
  }
  setValue(_value) {
    const value = _value ? 2 /* True */ : 1 /* False */;
    if (this._value === value) {
      return;
    }
    this._value = value;
    if (this._value === 2 /* True */) {
      this._onDidChangeToTrue.fire();
    } else if (this._value === 1 /* False */) {
      this._onDidChangeToFalse.fire();
    }
  }
}
class InteractionEmitter extends Emitter {
  constructor(_contributions, deliveryQueue) {
    super({ deliveryQueue });
    this._contributions = _contributions;
  }
  fire(event) {
    this._contributions.onBeforeInteractionEvent();
    super.fire(event);
  }
}
class EditorContextKeysManager extends Disposable {
  constructor(editor, contextKeyService) {
    super();
    this._editor = editor;
    contextKeyService.createKey("editorId", editor.getId());
    this._editorSimpleInput = EditorContextKeys.editorSimpleInput.bindTo(contextKeyService);
    this._editorFocus = EditorContextKeys.focus.bindTo(contextKeyService);
    this._textInputFocus = EditorContextKeys.textInputFocus.bindTo(contextKeyService);
    this._editorTextFocus = EditorContextKeys.editorTextFocus.bindTo(contextKeyService);
    this._tabMovesFocus = EditorContextKeys.tabMovesFocus.bindTo(contextKeyService);
    this._editorReadonly = EditorContextKeys.readOnly.bindTo(contextKeyService);
    this._inDiffEditor = EditorContextKeys.inDiffEditor.bindTo(contextKeyService);
    this._editorColumnSelection = EditorContextKeys.columnSelection.bindTo(contextKeyService);
    this._hasMultipleSelections = EditorContextKeys.hasMultipleSelections.bindTo(contextKeyService);
    this._hasNonEmptySelection = EditorContextKeys.hasNonEmptySelection.bindTo(contextKeyService);
    this._canUndo = EditorContextKeys.canUndo.bindTo(contextKeyService);
    this._canRedo = EditorContextKeys.canRedo.bindTo(contextKeyService);
    this._register(this._editor.onDidChangeConfiguration(() => this._updateFromConfig()));
    this._register(this._editor.onDidChangeCursorSelection(() => this._updateFromSelection()));
    this._register(this._editor.onDidFocusEditorWidget(() => this._updateFromFocus()));
    this._register(this._editor.onDidBlurEditorWidget(() => this._updateFromFocus()));
    this._register(this._editor.onDidFocusEditorText(() => this._updateFromFocus()));
    this._register(this._editor.onDidBlurEditorText(() => this._updateFromFocus()));
    this._register(this._editor.onDidChangeModel(() => this._updateFromModel()));
    this._register(this._editor.onDidChangeConfiguration(() => this._updateFromModel()));
    this._register(TabFocus.onDidChangeTabFocus((tabFocusMode) => this._tabMovesFocus.set(tabFocusMode)));
    this._updateFromConfig();
    this._updateFromSelection();
    this._updateFromFocus();
    this._updateFromModel();
    this._editorSimpleInput.set(this._editor.isSimpleWidget);
  }
  _updateFromConfig() {
    const options = this._editor.getOptions();
    this._tabMovesFocus.set(options.get(EditorOption.tabFocusMode) || TabFocus.getTabFocusMode());
    this._editorReadonly.set(options.get(EditorOption.readOnly));
    this._inDiffEditor.set(options.get(EditorOption.inDiffEditor));
    this._editorColumnSelection.set(options.get(EditorOption.columnSelection));
  }
  _updateFromSelection() {
    const selections = this._editor.getSelections();
    if (!selections) {
      this._hasMultipleSelections.reset();
      this._hasNonEmptySelection.reset();
    } else {
      this._hasMultipleSelections.set(selections.length > 1);
      this._hasNonEmptySelection.set(selections.some((s) => !s.isEmpty()));
    }
  }
  _updateFromFocus() {
    this._editorFocus.set(this._editor.hasWidgetFocus() && !this._editor.isSimpleWidget);
    this._editorTextFocus.set(this._editor.hasTextFocus() && !this._editor.isSimpleWidget);
    this._textInputFocus.set(this._editor.hasTextFocus());
  }
  _updateFromModel() {
    const model = this._editor.getModel();
    this._canUndo.set(Boolean(model && model.canUndo()));
    this._canRedo.set(Boolean(model && model.canRedo()));
  }
}
class EditorModeContext extends Disposable {
  constructor(_editor, _contextKeyService, _languageFeaturesService) {
    super();
    this._editor = _editor;
    this._contextKeyService = _contextKeyService;
    this._languageFeaturesService = _languageFeaturesService;
    this._langId = EditorContextKeys.languageId.bindTo(_contextKeyService);
    this._hasCompletionItemProvider = EditorContextKeys.hasCompletionItemProvider.bindTo(_contextKeyService);
    this._hasCodeActionsProvider = EditorContextKeys.hasCodeActionsProvider.bindTo(_contextKeyService);
    this._hasCodeLensProvider = EditorContextKeys.hasCodeLensProvider.bindTo(_contextKeyService);
    this._hasDefinitionProvider = EditorContextKeys.hasDefinitionProvider.bindTo(_contextKeyService);
    this._hasDeclarationProvider = EditorContextKeys.hasDeclarationProvider.bindTo(_contextKeyService);
    this._hasImplementationProvider = EditorContextKeys.hasImplementationProvider.bindTo(_contextKeyService);
    this._hasTypeDefinitionProvider = EditorContextKeys.hasTypeDefinitionProvider.bindTo(_contextKeyService);
    this._hasHoverProvider = EditorContextKeys.hasHoverProvider.bindTo(_contextKeyService);
    this._hasDocumentHighlightProvider = EditorContextKeys.hasDocumentHighlightProvider.bindTo(_contextKeyService);
    this._hasDocumentSymbolProvider = EditorContextKeys.hasDocumentSymbolProvider.bindTo(_contextKeyService);
    this._hasReferenceProvider = EditorContextKeys.hasReferenceProvider.bindTo(_contextKeyService);
    this._hasRenameProvider = EditorContextKeys.hasRenameProvider.bindTo(_contextKeyService);
    this._hasSignatureHelpProvider = EditorContextKeys.hasSignatureHelpProvider.bindTo(_contextKeyService);
    this._hasInlayHintsProvider = EditorContextKeys.hasInlayHintsProvider.bindTo(_contextKeyService);
    this._hasDocumentFormattingProvider = EditorContextKeys.hasDocumentFormattingProvider.bindTo(_contextKeyService);
    this._hasDocumentSelectionFormattingProvider = EditorContextKeys.hasDocumentSelectionFormattingProvider.bindTo(_contextKeyService);
    this._hasMultipleDocumentFormattingProvider = EditorContextKeys.hasMultipleDocumentFormattingProvider.bindTo(_contextKeyService);
    this._hasMultipleDocumentSelectionFormattingProvider = EditorContextKeys.hasMultipleDocumentSelectionFormattingProvider.bindTo(_contextKeyService);
    this._isInEmbeddedEditor = EditorContextKeys.isInEmbeddedEditor.bindTo(_contextKeyService);
    const update = () => this._update();
    this._register(_editor.onDidChangeModel(update));
    this._register(_editor.onDidChangeModelLanguage(update));
    this._register(_languageFeaturesService.completionProvider.onDidChange(update));
    this._register(_languageFeaturesService.codeActionProvider.onDidChange(update));
    this._register(_languageFeaturesService.codeLensProvider.onDidChange(update));
    this._register(_languageFeaturesService.definitionProvider.onDidChange(update));
    this._register(_languageFeaturesService.declarationProvider.onDidChange(update));
    this._register(_languageFeaturesService.implementationProvider.onDidChange(update));
    this._register(_languageFeaturesService.typeDefinitionProvider.onDidChange(update));
    this._register(_languageFeaturesService.hoverProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentHighlightProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentSymbolProvider.onDidChange(update));
    this._register(_languageFeaturesService.referenceProvider.onDidChange(update));
    this._register(_languageFeaturesService.renameProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentFormattingEditProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(update));
    this._register(_languageFeaturesService.signatureHelpProvider.onDidChange(update));
    this._register(_languageFeaturesService.inlayHintsProvider.onDidChange(update));
    update();
  }
  dispose() {
    super.dispose();
  }
  reset() {
    this._contextKeyService.bufferChangeEvents(() => {
      this._langId.reset();
      this._hasCompletionItemProvider.reset();
      this._hasCodeActionsProvider.reset();
      this._hasCodeLensProvider.reset();
      this._hasDefinitionProvider.reset();
      this._hasDeclarationProvider.reset();
      this._hasImplementationProvider.reset();
      this._hasTypeDefinitionProvider.reset();
      this._hasHoverProvider.reset();
      this._hasDocumentHighlightProvider.reset();
      this._hasDocumentSymbolProvider.reset();
      this._hasReferenceProvider.reset();
      this._hasRenameProvider.reset();
      this._hasDocumentFormattingProvider.reset();
      this._hasDocumentSelectionFormattingProvider.reset();
      this._hasSignatureHelpProvider.reset();
      this._isInEmbeddedEditor.reset();
    });
  }
  _update() {
    const model = this._editor.getModel();
    if (!model) {
      this.reset();
      return;
    }
    this._contextKeyService.bufferChangeEvents(() => {
      this._langId.set(model.getLanguageId());
      this._hasCompletionItemProvider.set(this._languageFeaturesService.completionProvider.has(model));
      this._hasCodeActionsProvider.set(this._languageFeaturesService.codeActionProvider.has(model));
      this._hasCodeLensProvider.set(this._languageFeaturesService.codeLensProvider.has(model));
      this._hasDefinitionProvider.set(this._languageFeaturesService.definitionProvider.has(model));
      this._hasDeclarationProvider.set(this._languageFeaturesService.declarationProvider.has(model));
      this._hasImplementationProvider.set(this._languageFeaturesService.implementationProvider.has(model));
      this._hasTypeDefinitionProvider.set(this._languageFeaturesService.typeDefinitionProvider.has(model));
      this._hasHoverProvider.set(this._languageFeaturesService.hoverProvider.has(model));
      this._hasDocumentHighlightProvider.set(this._languageFeaturesService.documentHighlightProvider.has(model));
      this._hasDocumentSymbolProvider.set(this._languageFeaturesService.documentSymbolProvider.has(model));
      this._hasReferenceProvider.set(this._languageFeaturesService.referenceProvider.has(model));
      this._hasRenameProvider.set(this._languageFeaturesService.renameProvider.has(model));
      this._hasSignatureHelpProvider.set(this._languageFeaturesService.signatureHelpProvider.has(model));
      this._hasInlayHintsProvider.set(this._languageFeaturesService.inlayHintsProvider.has(model));
      this._hasDocumentFormattingProvider.set(this._languageFeaturesService.documentFormattingEditProvider.has(model) || this._languageFeaturesService.documentRangeFormattingEditProvider.has(model));
      this._hasDocumentSelectionFormattingProvider.set(this._languageFeaturesService.documentRangeFormattingEditProvider.has(model));
      this._hasMultipleDocumentFormattingProvider.set(this._languageFeaturesService.documentFormattingEditProvider.all(model).length + this._languageFeaturesService.documentRangeFormattingEditProvider.all(model).length > 1);
      this._hasMultipleDocumentSelectionFormattingProvider.set(this._languageFeaturesService.documentRangeFormattingEditProvider.all(model).length > 1);
      this._isInEmbeddedEditor.set(model.uri.scheme === Schemas.walkThroughSnippet || model.uri.scheme === Schemas.vscodeChatCodeBlock);
    });
  }
}
class EditorDecorationsCollection {
  constructor(_editor, decorations) {
    this._editor = _editor;
    this._decorationIds = [];
    this._isChangingDecorations = false;
    if (Array.isArray(decorations) && decorations.length > 0) {
      this.set(decorations);
    }
  }
  get length() {
    return this._decorationIds.length;
  }
  onDidChange(listener, thisArgs, disposables) {
    return this._editor.onDidChangeModelDecorations((e) => {
      if (this._isChangingDecorations) {
        return;
      }
      listener.call(thisArgs, e);
    }, disposables);
  }
  getRange(index) {
    if (!this._editor.hasModel()) {
      return null;
    }
    if (index >= this._decorationIds.length) {
      return null;
    }
    return this._editor.getModel().getDecorationRange(this._decorationIds[index]);
  }
  getRanges() {
    if (!this._editor.hasModel()) {
      return [];
    }
    const model = this._editor.getModel();
    const result = [];
    for (const decorationId of this._decorationIds) {
      const range = model.getDecorationRange(decorationId);
      if (range) {
        result.push(range);
      }
    }
    return result;
  }
  has(decoration) {
    return this._decorationIds.includes(decoration.id);
  }
  clear() {
    if (this._decorationIds.length === 0) {
      return;
    }
    this.set([]);
  }
  set(newDecorations) {
    try {
      this._isChangingDecorations = true;
      this._editor.changeDecorations((accessor) => {
        this._decorationIds = accessor.deltaDecorations(this._decorationIds, newDecorations);
      });
    } finally {
      this._isChangingDecorations = false;
    }
    return this._decorationIds;
  }
  append(newDecorations) {
    let newDecorationIds = [];
    try {
      this._isChangingDecorations = true;
      this._editor.changeDecorations((accessor) => {
        newDecorationIds = accessor.deltaDecorations([], newDecorations);
        this._decorationIds = this._decorationIds.concat(newDecorationIds);
      });
    } finally {
      this._isChangingDecorations = false;
    }
    return newDecorationIds;
  }
}
const squigglyStart = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3' enable-background='new 0 0 6 3' height='3' width='6'><g fill='`);
const squigglyEnd = encodeURIComponent(`'><polygon points='5.5,0 2.5,3 1.1,3 4.1,0'/><polygon points='4,0 6,2 6,0.6 5.4,0'/><polygon points='0,2 1,3 2.4,3 0,0.6'/></g></svg>`);
function getSquigglySVGData(color) {
  return squigglyStart + encodeURIComponent(color.toString()) + squigglyEnd;
}
const dotdotdotStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" height="3" width="12"><g fill="`);
const dotdotdotEnd = encodeURIComponent(`"><circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/><circle cx="9" cy="1" r="1"/></g></svg>`);
function getDotDotDotSVGData(color) {
  return dotdotdotStart + encodeURIComponent(color.toString()) + dotdotdotEnd;
}
registerThemingParticipant((theme, collector) => {
  const errorForeground = theme.getColor(editorErrorForeground);
  if (errorForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorErrorDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(errorForeground)}") repeat-x bottom left; }`);
    collector.addRule(`:root { --monaco-editor-error-decoration: url("data:image/svg+xml,${getSquigglySVGData(errorForeground)}"); }`);
  }
  const warningForeground = theme.getColor(editorWarningForeground);
  if (warningForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorWarningDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(warningForeground)}") repeat-x bottom left; }`);
    collector.addRule(`:root { --monaco-editor-warning-decoration: url("data:image/svg+xml,${getSquigglySVGData(warningForeground)}"); }`);
  }
  const infoForeground = theme.getColor(editorInfoForeground);
  if (infoForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorInfoDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(infoForeground)}") repeat-x bottom left; }`);
    collector.addRule(`:root { --monaco-editor-info-decoration: url("data:image/svg+xml,${getSquigglySVGData(infoForeground)}"); }`);
  }
  const hintForeground = theme.getColor(editorHintForeground);
  if (hintForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorHintDecoration} { background: url("data:image/svg+xml,${getDotDotDotSVGData(hintForeground)}") no-repeat bottom left; }`);
    collector.addRule(`:root { --monaco-editor-hint-decoration: url("data:image/svg+xml,${getDotDotDotSVGData(hintForeground)}"); }`);
  }
  const unnecessaryForeground = theme.getColor(editorUnnecessaryCodeOpacity);
  if (unnecessaryForeground) {
    collector.addRule(`.monaco-editor.showUnused .${ClassName.EditorUnnecessaryInlineDecoration} { opacity: ${unnecessaryForeground.rgba.a}; }`);
    collector.addRule(`:root { --monaco-editor-unnecessary-decoration-opacity: ${unnecessaryForeground.rgba.a}; }`);
  }
});
export {
  BooleanEventEmitter,
  CodeEditorWidget,
  EditorModeContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uLy4uL3NlcnZpY2VzL2NvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEVtaXR0ZXJPcHRpb25zLCBFdmVudCwgRXZlbnREZWxpdmVyeVF1ZXVlLCBjcmVhdGVFdmVudERlbGl2ZXJ5UXVldWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAnLi9lZGl0b3IuY3NzJztcbmltcG9ydCB7IGFwcGx5Rm9udEluZm8gfSBmcm9tICcuLi8uLi9jb25maWcvZG9tRm9udEluZm8uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29uZmlndXJhdGlvbiwgSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUYWJGb2N1cyB9IGZyb20gJy4uLy4uL2NvbmZpZy90YWJGb2N1cy5qcyc7XG5pbXBvcnQgKiBhcyBlZGl0b3JCcm93c2VyIGZyb20gJy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZENvcHlFdmVudCwgSUNsaXBib2FyZFBhc3RlRXZlbnQgfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL2VkaXRDb250ZXh0L2NsaXBib2FyZFV0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSwgSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGVudFdpZGdldERhdGEsIElHbHlwaE1hcmdpbldpZGdldERhdGEsIElPdmVybGF5V2lkZ2V0RGF0YSwgVmlldyB9IGZyb20gJy4uLy4uL3ZpZXcuanMnO1xuaW1wb3J0IHsgRE9NTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSB9IGZyb20gJy4uLy4uL3ZpZXcvZG9tTGluZUJyZWFrc0NvbXB1dGVyLmpzJztcbmltcG9ydCB7IElDb21tYW5kRGVsZWdhdGUgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFZpZXdVc2VySW5wdXRFdmVudHMgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdVc2VySW5wdXRFdmVudHMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvckNvbnRyaWJ1dGlvbnMgfSBmcm9tICcuL2NvZGVFZGl0b3JDb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIEVkaXRvckxheW91dEluZm8sIEVkaXRvck9wdGlvbiwgRmluZENvbXB1dGVkRWRpdG9yT3B0aW9uVmFsdWVCeUlkLCBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCBJRWRpdG9yT3B0aW9ucywgZmlsdGVyRm9udERlY29yYXRpb25zLCBmaWx0ZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2N1cnNvckNvbHVtbnMuanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL2RpbWVuc2lvbi5qcyc7XG5pbXBvcnQgeyBlZGl0b3JVbm5lY2Vzc2FyeUNvZGVPcGFjaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24sIFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29yZEF0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IFdvcmRPcGVyYXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvci9jdXJzb3JXb3JkT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDaGFuZ2VSZWFzb24sIElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCwgSUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQWN0aW9uLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckNvbW1vbiBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlLCBJQXR0YWNoZWRWaWV3LCBJQ3Vyc29yU3RhdGVDb21wdXRlciwgSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uLCBJTW9kZWxEZWNvcmF0aW9uLCBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENsYXNzTmFtZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9pbnRlcnZhbFRyZWUuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCwgSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQsIElNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50LCBJTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIElNb2RlbE9wdGlvbnNDaGFuZ2VkRXZlbnQsIElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCwgTW9kZWxGb250Q2hhbmdlZEV2ZW50LCBNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IFZlcnRpY2FsUmV2ZWFsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IElFZGl0b3JXaGl0ZXNwYWNlLCBJVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9tb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbEV2ZW50RGlzcGF0Y2hlci5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlWYWx1ZSwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGVkaXRvckVycm9yRm9yZWdyb3VuZCwgZWRpdG9ySGludEZvcmVncm91bmQsIGVkaXRvckluZm9Gb3JlZ3JvdW5kLCBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbEVkaXRTb3VyY2UsIEVkaXRTb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDb2RlRWRpdG9yV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIGVkaXRvckJyb3dzZXIuSUNvZGVFZGl0b3Ige1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGRyb3BJbnRvRWRpdG9yRGVjb3JhdGlvbk9wdGlvbnMgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ3dvcmtiZW5jaC1kbmQtdGFyZ2V0Jyxcblx0XHRjbGFzc05hbWU6ICdkbmQtdGFyZ2V0J1xuXHR9KTtcblxuXHQvLyNyZWdpb24gRXZlbnRpbmdcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWxpdmVyeVF1ZXVlID0gY3JlYXRlRXZlbnREZWxpdmVyeVF1ZXVlKCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfY29udHJpYnV0aW9uczogQ29kZUVkaXRvckNvbnRyaWJ1dGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29kZUVkaXRvckNvbnRyaWJ1dGlvbnMoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxDb250ZW50OiBFbWl0dGVyPElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vZGVsQ29udGVudENoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50OiBFdmVudDxJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxDb250ZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZTogRW1pdHRlcjxJTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZTogRXZlbnQ8SU1vZGVsTGFuZ3VhZ2VDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb246IEVtaXR0ZXI8SU1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb246IEV2ZW50PElNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxPcHRpb25zOiBFbWl0dGVyPElNb2RlbE9wdGlvbnNDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxPcHRpb25zOiBFdmVudDxJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxPcHRpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9uczogRW1pdHRlcjxJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9uczogRXZlbnQ8SU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbERlY29yYXRpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTGluZUhlaWdodDogRW1pdHRlcjxNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VMaW5lSGVpZ2h0OiBFdmVudDxNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VMaW5lSGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9udDogRW1pdHRlcjxNb2RlbEZvbnRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TW9kZWxGb250Q2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VGb250OiBFdmVudDxNb2RlbEZvbnRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VGb250LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxUb2tlbnM6IEVtaXR0ZXI8SU1vZGVsVG9rZW5zQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxUb2tlbnM6IEV2ZW50PElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsVG9rZW5zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRW1pdHRlcjxDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb246IEV2ZW50PENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25XaWxsQ2hhbmdlTW9kZWw6IEVtaXR0ZXI8ZWRpdG9yQ29tbW9uLklNb2RlbENoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxlZGl0b3JDb21tb24uSU1vZGVsQ2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQ2hhbmdlTW9kZWw6IEV2ZW50PGVkaXRvckNvbW1vbi5JTW9kZWxDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25XaWxsQ2hhbmdlTW9kZWwuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsOiBFbWl0dGVyPGVkaXRvckNvbW1vbi5JTW9kZWxDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8ZWRpdG9yQ29tbW9uLklNb2RlbENoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWw6IEV2ZW50PGVkaXRvckNvbW1vbi5JTW9kZWxDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uOiBFbWl0dGVyPElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uOiBFdmVudDxJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbjogRW1pdHRlcjxJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDdXJzb3JTZWxlY3Rpb25DaGFuZ2VkRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbjogRXZlbnQ8SUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEF0dGVtcHRSZWFkT25seUVkaXQ6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPHZvaWQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQXR0ZW1wdFJlYWRPbmx5RWRpdDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEF0dGVtcHRSZWFkT25seUVkaXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMYXlvdXRDaGFuZ2U6IEVtaXR0ZXI8RWRpdG9yTGF5b3V0SW5mbz4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFZGl0b3JMYXlvdXRJbmZvPih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRMYXlvdXRDaGFuZ2U6IEV2ZW50PEVkaXRvckxheW91dEluZm8+ID0gdGhpcy5fb25EaWRMYXlvdXRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yVGV4dEZvY3VzOiBCb29sZWFuRXZlbnRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJvb2xlYW5FdmVudEVtaXR0ZXIoeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRm9jdXNFZGl0b3JUZXh0OiBFdmVudDx2b2lkPiA9IHRoaXMuX2VkaXRvclRleHRGb2N1cy5vbkRpZENoYW5nZVRvVHJ1ZTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQmx1ckVkaXRvclRleHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fZWRpdG9yVGV4dEZvY3VzLm9uRGlkQ2hhbmdlVG9GYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JXaWRnZXRGb2N1czogQm9vbGVhbkV2ZW50RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCb29sZWFuRXZlbnRFbWl0dGVyKHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEZvY3VzRWRpdG9yV2lkZ2V0OiBFdmVudDx2b2lkPiA9IHRoaXMuX2VkaXRvcldpZGdldEZvY3VzLm9uRGlkQ2hhbmdlVG9UcnVlO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRCbHVyRWRpdG9yV2lkZ2V0OiBFdmVudDx2b2lkPiA9IHRoaXMuX2VkaXRvcldpZGdldEZvY3VzLm9uRGlkQ2hhbmdlVG9GYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxUeXBlOiBFbWl0dGVyPHN0cmluZz4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPHN0cmluZz4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsVHlwZSA9IHRoaXMuX29uV2lsbFR5cGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUeXBlOiBFbWl0dGVyPHN0cmluZz4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPHN0cmluZz4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRUeXBlID0gdGhpcy5fb25EaWRUeXBlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29tcG9zaXRpb25TdGFydDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8dm9pZD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDb21wb3NpdGlvblN0YXJ0ID0gdGhpcy5fb25EaWRDb21wb3NpdGlvblN0YXJ0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29tcG9zaXRpb25FbmQ6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPHZvaWQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ29tcG9zaXRpb25FbmQgPSB0aGlzLl9vbkRpZENvbXBvc2l0aW9uRW5kLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUGFzdGU6IEVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JUGFzdGVFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPGVkaXRvckJyb3dzZXIuSVBhc3RlRXZlbnQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUGFzdGUgPSB0aGlzLl9vbkRpZFBhc3RlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbENvcHk6IEVtaXR0ZXI8SUNsaXBib2FyZENvcHlFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPElDbGlwYm9hcmRDb3B5RXZlbnQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbENvcHkgPSB0aGlzLl9vbldpbGxDb3B5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbEN1dDogRW1pdHRlcjxJQ2xpcGJvYXJkQ29weUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8SUNsaXBib2FyZENvcHlFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQ3V0ID0gdGhpcy5fb25XaWxsQ3V0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFBhc3RlOiBFbWl0dGVyPElDbGlwYm9hcmRQYXN0ZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8SUNsaXBib2FyZFBhc3RlRXZlbnQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbFBhc3RlID0gdGhpcy5fb25XaWxsUGFzdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb3VzZVVwOiBFbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlVXA6IEV2ZW50PGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fb25Nb3VzZVVwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VEb3duOiBFbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlRG93bjogRXZlbnQ8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbk1vdXNlRG93bi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlRHJhZzogRW1pdHRlcjxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Nb3VzZURyYWc6IEV2ZW50PGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fb25Nb3VzZURyYWcuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb3VzZURyb3A6IEVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JUGFydGlhbEVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxlZGl0b3JCcm93c2VyLklQYXJ0aWFsRWRpdG9yTW91c2VFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Nb3VzZURyb3A6IEV2ZW50PGVkaXRvckJyb3dzZXIuSVBhcnRpYWxFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX29uTW91c2VEcm9wLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VEcm9wQ2FuY2VsZWQ6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPHZvaWQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW91c2VEcm9wQ2FuY2VsZWQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25Nb3VzZURyb3BDYW5jZWxlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRyb3BJbnRvRWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjx7IHJlYWRvbmx5IHBvc2l0aW9uOiBJUG9zaXRpb247IHJlYWRvbmx5IGV2ZW50OiBEcmFnRXZlbnQgfT4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Ecm9wSW50b0VkaXRvciA9IHRoaXMuX29uRHJvcEludG9FZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Db250ZXh0TWVudTogRW1pdHRlcjxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db250ZXh0TWVudTogRXZlbnQ8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbkNvbnRleHRNZW51LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VNb3ZlOiBFbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlTW92ZTogRXZlbnQ8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbk1vdXNlTW92ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlTGVhdmU6IEVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JUGFydGlhbEVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxlZGl0b3JCcm93c2VyLklQYXJ0aWFsRWRpdG9yTW91c2VFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Nb3VzZUxlYXZlOiBFdmVudDxlZGl0b3JCcm93c2VyLklQYXJ0aWFsRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbk1vdXNlTGVhdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb3VzZVdoZWVsOiBFbWl0dGVyPElNb3VzZVdoZWVsRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxJTW91c2VXaGVlbEV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlV2hlZWw6IEV2ZW50PElNb3VzZVdoZWVsRXZlbnQ+ID0gdGhpcy5fb25Nb3VzZVdoZWVsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uS2V5VXA6IEVtaXR0ZXI8SUtleWJvYXJkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxJS2V5Ym9hcmRFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25LZXlVcDogRXZlbnQ8SUtleWJvYXJkRXZlbnQ+ID0gdGhpcy5fb25LZXlVcC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbktleURvd246IEVtaXR0ZXI8SUtleWJvYXJkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxJS2V5Ym9hcmRFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25LZXlEb3duOiBFdmVudDxJS2V5Ym9hcmRFdmVudD4gPSB0aGlzLl9vbktleURvd24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb250ZW50U2l6ZUNoYW5nZTogRW1pdHRlcjxlZGl0b3JDb21tb24uSUNvbnRlbnRTaXplQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGVkaXRvckNvbW1vbi5JQ29udGVudFNpemVDaGFuZ2VkRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENvbnRlbnRTaXplQ2hhbmdlOiBFdmVudDxlZGl0b3JDb21tb24uSUNvbnRlbnRTaXplQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX29uRGlkQ29udGVudFNpemVDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTY3JvbGxDaGFuZ2U6IEVtaXR0ZXI8ZWRpdG9yQ29tbW9uLklTY3JvbGxFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxlZGl0b3JDb21tb24uSVNjcm9sbEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRTY3JvbGxDaGFuZ2U6IEV2ZW50PGVkaXRvckNvbW1vbi5JU2Nyb2xsRXZlbnQ+ID0gdGhpcy5fb25EaWRTY3JvbGxDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaWV3Wm9uZXM6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3Wm9uZXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3Wm9uZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIaWRkZW5BcmVhczogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUhpZGRlbkFyZWFzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlSGlkZGVuQXJlYXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ291bnRlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsVHJpZ2dlckVkaXRvck9wZXJhdGlvbkV2ZW50OiBFbWl0dGVyPGVkaXRvckNvbW1vbi5JVHJpZ2dlckVkaXRvck9wZXJhdGlvbkV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGVkaXRvckNvbW1vbi5JVHJpZ2dlckVkaXRvck9wZXJhdGlvbkV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbFRyaWdnZXJFZGl0b3JPcGVyYXRpb25FdmVudDogRXZlbnQ8ZWRpdG9yQ29tbW9uLklUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQ+ID0gdGhpcy5fb25XaWxsVHJpZ2dlckVkaXRvck9wZXJhdGlvbkV2ZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVnaW5VcGRhdGU6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQmVnaW5VcGRhdGU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25CZWdpblVwZGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVuZFVwZGF0ZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25FbmRVcGRhdGU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25FbmRVcGRhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWZvcmVFeGVjdXRlRWRpdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQgfT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkJlZm9yZUV4ZWN1dGVFZGl0ID0gdGhpcy5fb25CZWZvcmVFeGVjdXRlRWRpdC5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwdWJsaWMgZ2V0IGlzU2ltcGxlV2lkZ2V0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmlzU2ltcGxlV2lkZ2V0O1xuXHR9XG5cblx0cHVibGljIGdldCBjb250ZXh0TWVudUlkKCk6IE1lbnVJZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uY29udGV4dE1lbnVJZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeURhdGE/OiBvYmplY3Q7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX292ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pZDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uOiBJRWRpdG9yQ29uZmlndXJhdGlvbjtcblx0cHJpdmF0ZSBfY29udHJpYnV0aW9uc0Rpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfYWN0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBlZGl0b3JDb21tb24uSUVkaXRvckFjdGlvbj4oKTtcblxuXHQvLyAtLS0gTWVtYmVycyBsb2dpY2FsbHkgYXNzb2NpYXRlZCB0byBhIG1vZGVsXG5cdHByb3RlY3RlZCBfbW9kZWxEYXRhOiBNb2RlbERhdGEgfCBudWxsO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRnZXQgY29udGV4dEtleVNlcnZpY2UoKSB7IHJldHVybiB0aGlzLl9jb250ZXh0S2V5U2VydmljZTsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VzZXJJbnRlcmFjdGlvblNlcnZpY2U6IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlO1xuXG5cdHByaXZhdGUgX2NvbnRlbnRXaWRnZXRzOiB7IFtrZXk6IHN0cmluZ106IElDb250ZW50V2lkZ2V0RGF0YSB9O1xuXHRwcml2YXRlIF9vdmVybGF5V2lkZ2V0czogeyBba2V5OiBzdHJpbmddOiBJT3ZlcmxheVdpZGdldERhdGEgfTtcblx0cHJpdmF0ZSBfZ2x5cGhNYXJnaW5XaWRnZXRzOiB7IFtrZXk6IHN0cmluZ106IElHbHlwaE1hcmdpbldpZGdldERhdGEgfTtcblxuXHQvKipcblx0ICogbWFwIGZyb20gXCJwYXJlbnRcIiBkZWNvcmF0aW9uIHR5cGUgdG8gbGl2ZSBkZWNvcmF0aW9uIGlkcy5cblx0ICovXG5cdHByaXZhdGUgX2RlY29yYXRpb25UeXBlS2V5c1RvSWRzOiB7IFtkZWNvcmF0aW9uVHlwZUtleTogc3RyaW5nXTogc3RyaW5nW10gfTtcblx0cHJpdmF0ZSBfZGVjb3JhdGlvblR5cGVTdWJ0eXBlczogeyBbZGVjb3JhdGlvblR5cGVLZXk6IHN0cmluZ106IHsgW3N1YnR5cGU6IHN0cmluZ106IGJvb2xlYW4gfSB9O1xuXG5cdHByaXZhdGUgX2Jhbm5lckRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBfZHJvcEludG9FZGl0b3JEZWNvcmF0aW9uczogRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uID0gdGhpcy5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblxuXHRwdWJsaWMgaW5Db21wb3NpdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdF9vcHRpb25zOiBSZWFkb25seTxJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucz4sXG5cdFx0Y29kZUVkaXRvcldpZGdldE9wdGlvbnM6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckludGVyYWN0aW9uU2VydmljZSB1c2VySW50ZXJhY3Rpb25TZXJ2aWNlOiBJVXNlckludGVyYWN0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb2RlRWRpdG9yU2VydmljZS53aWxsQ3JlYXRlQ29kZUVkaXRvcigpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHsgLi4uX29wdGlvbnMgfTtcblxuXHRcdHRoaXMuX2RvbUVsZW1lbnQgPSBkb21FbGVtZW50O1xuXHRcdHRoaXMuX3VzZXJJbnRlcmFjdGlvblNlcnZpY2UgPSB1c2VySW50ZXJhY3Rpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX292ZXJmbG93V2lkZ2V0c0RvbU5vZGUgPSBvcHRpb25zLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGU7XG5cdFx0ZGVsZXRlIG9wdGlvbnMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTtcblx0XHR0aGlzLl9pZCA9ICgrK0VESVRPUl9JRCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHMgPSB7fTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzID0ge307XG5cdFx0dGhpcy5fdGVsZW1ldHJ5RGF0YSA9IGNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLnRlbGVtZXRyeURhdGE7XG5cblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fY3JlYXRlQ29uZmlndXJhdGlvbihjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucy5pc1NpbXBsZVdpZGdldCB8fCBmYWxzZSxcblx0XHRcdGNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLmNvbnRleHRNZW51SWQgPz8gKGNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLmlzU2ltcGxlV2lkZ2V0ID8gTWVudUlkLlNpbXBsZUVkaXRvckNvbnRleHQgOiBNZW51SWQuRWRpdG9yQ29udGV4dCksXG5cdFx0XHRvcHRpb25zLCBhY2Nlc3NpYmlsaXR5U2VydmljZSkpO1xuXHRcdHRoaXMuX2RvbUVsZW1lbnQuc3R5bGU/LnNldFByb3BlcnR5KCctLWVkaXRvci1mb250LXNpemUnLCB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250U2l6ZSkgKyAncHgnKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZShlKTtcblxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pKSB7XG5cdFx0XHRcdGNvbnN0IGxheW91dEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0XHRcdHRoaXMuX29uRGlkTGF5b3V0Q2hhbmdlLmZpcmUobGF5b3V0SW5mbyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250U2l6ZSkpIHtcblx0XHRcdFx0dGhpcy5fZG9tRWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1lZGl0b3ItZm9udC1zaXplJywgb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRTaXplKSArICdweCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX2RvbUVsZW1lbnQpKTtcblx0XHRpZiAoY29kZUVkaXRvcldpZGdldE9wdGlvbnMuY29udGV4dEtleVZhbHVlcykge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoY29kZUVkaXRvcldpZGdldE9wdGlvbnMuY29udGV4dEtleVZhbHVlcykpIHtcblx0XHRcdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KGtleSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlID0gbm90aWZpY2F0aW9uU2VydmljZTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZSA9IGNvZGVFZGl0b3JTZXJ2aWNlO1xuXHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlID0gY29tbWFuZFNlcnZpY2U7XG5cdFx0dGhpcy5fdGhlbWVTZXJ2aWNlID0gdGhlbWVTZXJ2aWNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBFZGl0b3JDb250ZXh0S2V5c01hbmFnZXIodGhpcywgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRWRpdG9yTW9kZUNvbnRleHQodGhpcywgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZV0pKSk7XG5cblx0XHR0aGlzLl9tb2RlbERhdGEgPSBudWxsO1xuXG5cdFx0dGhpcy5fY29udGVudFdpZGdldHMgPSB7fTtcblx0XHR0aGlzLl9vdmVybGF5V2lkZ2V0cyA9IHt9O1xuXHRcdHRoaXMuX2dseXBoTWFyZ2luV2lkZ2V0cyA9IHt9O1xuXG5cdFx0bGV0IGNvbnRyaWJ1dGlvbnM6IElFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLmNvbnRyaWJ1dGlvbnMpKSB7XG5cdFx0XHRjb250cmlidXRpb25zID0gY29kZUVkaXRvcldpZGdldE9wdGlvbnMuY29udHJpYnV0aW9ucztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udHJpYnV0aW9ucyA9IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMuaW5pdGlhbGl6ZSh0aGlzLCBjb250cmlidXRpb25zLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQWN0aW9ucygpKSB7XG5cdFx0XHRpZiAodGhpcy5fYWN0aW9ucy5oYXMoYWN0aW9uLmlkKSkge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoYENhbm5vdCBoYXZlIHR3byBhY3Rpb25zIHdpdGggdGhlIHNhbWUgaWQgJHthY3Rpb24uaWR9YCkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGludGVybmFsQWN0aW9uID0gbmV3IEludGVybmFsRWRpdG9yQWN0aW9uKFxuXHRcdFx0XHRhY3Rpb24uaWQsXG5cdFx0XHRcdGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0YWN0aW9uLmFsaWFzLFxuXHRcdFx0XHRhY3Rpb24ubWV0YWRhdGEsXG5cdFx0XHRcdGFjdGlvbi5wcmVjb25kaXRpb24gPz8gdW5kZWZpbmVkLFxuXHRcdFx0XHQoYXJnczogdW5rbm93bik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoYWN0aW9uLnJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3IsIHRoaXMsIGFyZ3MpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2Vcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9hY3Rpb25zLnNldChpbnRlcm5hbEFjdGlvbi5pZCwgaW50ZXJuYWxBY3Rpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzRHJvcEludG9FbmFibGVkID0gKCkgPT4ge1xuXHRcdFx0cmV0dXJuICF0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZWFkT25seSlcblx0XHRcdFx0JiYgdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZHJvcEludG9FZGl0b3IpLmVuYWJsZWQ7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRHJhZ0FuZERyb3BPYnNlcnZlcih0aGlzLl9kb21FbGVtZW50LCB7XG5cdFx0XHRvbkRyYWdPdmVyOiBlID0+IHtcblx0XHRcdFx0aWYgKCFpc0Ryb3BJbnRvRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5nZXRUYXJnZXRBdENsaWVudFBvaW50KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcblx0XHRcdFx0aWYgKHRhcmdldD8ucG9zaXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLnNob3dEcm9wSW5kaWNhdG9yQXQodGFyZ2V0LnBvc2l0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uRHJvcDogYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGlmICghaXNEcm9wSW50b0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucmVtb3ZlRHJvcEluZGljYXRvcigpO1xuXG5cdFx0XHRcdGlmICghZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmdldFRhcmdldEF0Q2xpZW50UG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuXHRcdFx0XHRpZiAodGFyZ2V0Py5wb3NpdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuX29uRHJvcEludG9FZGl0b3IuZmlyZSh7IHBvc2l0aW9uOiB0YXJnZXQucG9zaXRpb24sIGV2ZW50OiBlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnTGVhdmU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5yZW1vdmVEcm9wSW5kaWNhdG9yKCk7XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnRW5kOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRHJvcEluZGljYXRvcigpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5hZGRDb2RlRWRpdG9yKHRoaXMpO1xuXHR9XG5cblx0cHVibGljIHdyaXRlU2NyZWVuUmVhZGVyQ29udGVudChyZWFzb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsRGF0YT8udmlldy53cml0ZVNjcmVlblJlYWRlckNvbnRlbnQocmVhc29uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlQ29uZmlndXJhdGlvbihpc1NpbXBsZVdpZGdldDogYm9vbGVhbiwgY29udGV4dE1lbnVJZDogTWVudUlkLCBvcHRpb25zOiBSZWFkb25seTxJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucz4sIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UpOiBFZGl0b3JDb25maWd1cmF0aW9uIHtcblx0XHRyZXR1cm4gbmV3IEVkaXRvckNvbmZpZ3VyYXRpb24oaXNTaW1wbGVXaWRnZXQsIGNvbnRleHRNZW51SWQsIG9wdGlvbnMsIHRoaXMuX2RvbUVsZW1lbnQsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdldEVkaXRvclR5cGUoKSArICc6JyArIHRoaXMuX2lkO1xuXHR9XG5cblx0cHVibGljIGdldEVkaXRvclR5cGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWRpdG9yQ29tbW9uLkVkaXRvclR5cGUuSUNvZGVFZGl0b3I7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5yZW1vdmVDb2RlRWRpdG9yKHRoaXMpO1xuXG5cdFx0dGhpcy5fYWN0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuX2NvbnRlbnRXaWRnZXRzID0ge307XG5cdFx0dGhpcy5fb3ZlcmxheVdpZGdldHMgPSB7fTtcblxuXHRcdHRoaXMuX3JlbW92ZURlY29yYXRpb25UeXBlcygpO1xuXHRcdHRoaXMuX3Bvc3REZXRhY2hNb2RlbENsZWFudXAodGhpcy5fZGV0YWNoTW9kZWwoKSk7XG5cblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGludm9rZVdpdGhpbkNvbnRleHQ8VD4oZm46IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4gVCk6IFQge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmbik7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlT3B0aW9ucyhuZXdPcHRpb25zOiBSZWFkb25seTxJRWRpdG9yT3B0aW9ucz4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZU9wdGlvbnMobmV3T3B0aW9ucyB8fCB7fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3B0aW9ucygpOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHR9XG5cblx0cHVibGljIGdldE9wdGlvbjxUIGV4dGVuZHMgRWRpdG9yT3B0aW9uPihpZDogVCk6IEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZDxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoaWQpO1xuXHR9XG5cblx0cHVibGljIGdldFJhd09wdGlvbnMoKTogSUVkaXRvck9wdGlvbnMge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmdldFJhd09wdGlvbnMoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRPdmVyZmxvd1dpZGdldHNEb21Ob2RlKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb25maWd1cmVkV29yZEF0UG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gV29yZE9wZXJhdGlvbnMuZ2V0V29yZEF0UG9zaXRpb24odGhpcy5fbW9kZWxEYXRhLm1vZGVsLCB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycyksIHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRTZWdtZW50ZXJMb2NhbGVzKSwgcG9zaXRpb24pO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlKG9wdGlvbnM6IHsgcHJlc2VydmVCT006IGJvb2xlYW47IGxpbmVFbmRpbmc6IHN0cmluZyB9IHwgbnVsbCA9IG51bGwpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlc2VydmVCT006IGJvb2xlYW4gPSAob3B0aW9ucyAmJiBvcHRpb25zLnByZXNlcnZlQk9NKSA/IHRydWUgOiBmYWxzZTtcblx0XHRsZXQgZW9sUHJlZmVyZW5jZSA9IEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5saW5lRW5kaW5nICYmIG9wdGlvbnMubGluZUVuZGluZyA9PT0gJ1xcbicpIHtcblx0XHRcdGVvbFByZWZlcmVuY2UgPSBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGO1xuXHRcdH0gZWxzZSBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmxpbmVFbmRpbmcgJiYgb3B0aW9ucy5saW5lRW5kaW5nID09PSAnXFxyXFxuJykge1xuXHRcdFx0ZW9sUHJlZmVyZW5jZSA9IEVuZE9mTGluZVByZWZlcmVuY2UuQ1JMRjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS5tb2RlbC5nZXRWYWx1ZShlb2xQcmVmZXJlbmNlLCBwcmVzZXJ2ZUJPTSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUobmV3VmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9iZWdpblVwZGF0ZSgpO1xuXHRcdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbW9kZWxEYXRhLm1vZGVsLnNldFZhbHVlKG5ld1ZhbHVlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZW5kVXBkYXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldE1vZGVsKCk6IElUZXh0TW9kZWwgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEubW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgc2V0TW9kZWwoX21vZGVsOiBJVGV4dE1vZGVsIHwgZWRpdG9yQ29tbW9uLklEaWZmRWRpdG9yTW9kZWwgfCBlZGl0b3JDb21tb24uSURpZmZFZGl0b3JWaWV3TW9kZWwgfCBudWxsID0gbnVsbCk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9iZWdpblVwZGF0ZSgpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSA8SVRleHRNb2RlbCB8IG51bGw+X21vZGVsO1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsRGF0YSA9PT0gbnVsbCAmJiBtb2RlbCA9PT0gbnVsbCkge1xuXHRcdFx0XHQvLyBDdXJyZW50IG1vZGVsIGlzIHRoZSBuZXcgbW9kZWxcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX21vZGVsRGF0YSAmJiB0aGlzLl9tb2RlbERhdGEubW9kZWwgPT09IG1vZGVsKSB7XG5cdFx0XHRcdC8vIEN1cnJlbnQgbW9kZWwgaXMgdGhlIG5ldyBtb2RlbFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGU6IGVkaXRvckNvbW1vbi5JTW9kZWxDaGFuZ2VkRXZlbnQgPSB7XG5cdFx0XHRcdG9sZE1vZGVsVXJsOiB0aGlzLl9tb2RlbERhdGE/Lm1vZGVsLnVyaSB8fCBudWxsLFxuXHRcdFx0XHRuZXdNb2RlbFVybDogbW9kZWw/LnVyaSB8fCBudWxsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25XaWxsQ2hhbmdlTW9kZWwuZmlyZShlKTtcblxuXHRcdFx0Y29uc3QgaGFzVGV4dEZvY3VzID0gdGhpcy5oYXNUZXh0Rm9jdXMoKTtcblx0XHRcdGNvbnN0IGRldGFjaGVkTW9kZWwgPSB0aGlzLl9kZXRhY2hNb2RlbCgpO1xuXHRcdFx0dGhpcy5fYXR0YWNoTW9kZWwobW9kZWwpO1xuXHRcdFx0aWYgKHRoaXMuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHQvLyB3ZSBoYXZlIGEgbmV3IG1vZGVsICh3aXRoIGEgbmV3IHZpZXcpIVxuXHRcdFx0XHRpZiAoaGFzVGV4dEZvY3VzKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB3ZSBoYXZlIG5vIG1vZGVsIChhbmQgbm8gdmlldykgYW55bW9yZVxuXHRcdFx0XHQvLyBtYWtlIHN1cmUgdGhlIG91dHNpZGUgd29ybGQga25vd3Mgd2UgYXJlIG5vdCBmb2N1c2VkXG5cdFx0XHRcdHRoaXMuX2VkaXRvclRleHRGb2N1cy5zZXRWYWx1ZShmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldEZvY3VzLnNldFZhbHVlKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcmVtb3ZlRGVjb3JhdGlvblR5cGVzKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsLmZpcmUoZSk7XG5cdFx0XHR0aGlzLl9wb3N0RGV0YWNoTW9kZWxDbGVhbnVwKGRldGFjaGVkTW9kZWwpO1xuXG5cdFx0XHR0aGlzLl9jb250cmlidXRpb25zRGlzcG9zYWJsZSA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMub25BZnRlck1vZGVsQXR0YWNoZWQoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZW5kVXBkYXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRGVjb3JhdGlvblR5cGVzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RlY29yYXRpb25UeXBlS2V5c1RvSWRzID0ge307XG5cdFx0aWYgKHRoaXMuX2RlY29yYXRpb25UeXBlU3VidHlwZXMpIHtcblx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvblR5cGUgaW4gdGhpcy5fZGVjb3JhdGlvblR5cGVTdWJ0eXBlcykge1xuXHRcdFx0XHRjb25zdCBzdWJUeXBlcyA9IHRoaXMuX2RlY29yYXRpb25UeXBlU3VidHlwZXNbZGVjb3JhdGlvblR5cGVdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHN1YlR5cGUgaW4gc3ViVHlwZXMpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW1vdmVEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uVHlwZSArICctJyArIHN1YlR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzID0ge307XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFZpc2libGVSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZ2V0VmlzaWJsZVJhbmdlcygpO1xuXHR9XG5cblx0cHVibGljIGdldFZpc2libGVSYW5nZXNQbHVzVmlld3BvcnRBYm92ZUJlbG93KCk6IFJhbmdlW10ge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmdldFZpc2libGVSYW5nZXNQbHVzVmlld3BvcnRBYm92ZUJlbG93KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V2hpdGVzcGFjZXMoKTogSUVkaXRvcldoaXRlc3BhY2VbXSB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRXaGl0ZXNwYWNlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldFZlcnRpY2FsT2Zmc2V0QWZ0ZXJQb3NpdGlvbihtb2RlbERhdGE6IE1vZGVsRGF0YSwgbW9kZWxMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGVsQ29sdW1uOiBudW1iZXIsIGluY2x1ZGVWaWV3Wm9uZXM6IGJvb2xlYW4pOiBudW1iZXIge1xuXHRcdGNvbnN0IG1vZGVsUG9zaXRpb24gPSBtb2RlbERhdGEubW9kZWwudmFsaWRhdGVQb3NpdGlvbih7XG5cdFx0XHRsaW5lTnVtYmVyOiBtb2RlbExpbmVOdW1iZXIsXG5cdFx0XHRjb2x1bW46IG1vZGVsQ29sdW1uXG5cdFx0fSk7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gbW9kZWxEYXRhLnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG1vZGVsUG9zaXRpb24pO1xuXHRcdHJldHVybiBtb2RlbERhdGEudmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRBZnRlckxpbmVOdW1iZXIodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsIGluY2x1ZGVWaWV3Wm9uZXMpO1xuXHR9XG5cblx0cHVibGljIGdldFRvcEZvckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyLCBpbmNsdWRlVmlld1pvbmVzOiBib29sZWFuID0gZmFsc2UpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiBDb2RlRWRpdG9yV2lkZ2V0Ll9nZXRWZXJ0aWNhbE9mZnNldEZvclBvc2l0aW9uKHRoaXMuX21vZGVsRGF0YSwgbGluZU51bWJlciwgMSwgaW5jbHVkZVZpZXdab25lcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VG9wRm9yUG9zaXRpb24obGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIENvZGVFZGl0b3JXaWRnZXQuX2dldFZlcnRpY2FsT2Zmc2V0Rm9yUG9zaXRpb24odGhpcy5fbW9kZWxEYXRhLCBsaW5lTnVtYmVyLCBjb2x1bW4sIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRWZXJ0aWNhbE9mZnNldEZvclBvc2l0aW9uKG1vZGVsRGF0YTogTW9kZWxEYXRhLCBtb2RlbExpbmVOdW1iZXI6IG51bWJlciwgbW9kZWxDb2x1bW46IG51bWJlciwgaW5jbHVkZVZpZXdab25lczogYm9vbGVhbiA9IGZhbHNlKTogbnVtYmVyIHtcblx0XHRjb25zdCBtb2RlbFBvc2l0aW9uID0gbW9kZWxEYXRhLm1vZGVsLnZhbGlkYXRlUG9zaXRpb24oe1xuXHRcdFx0bGluZU51bWJlcjogbW9kZWxMaW5lTnVtYmVyLFxuXHRcdFx0Y29sdW1uOiBtb2RlbENvbHVtblxuXHRcdH0pO1xuXHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IG1vZGVsRGF0YS52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFBvc2l0aW9uKTtcblx0XHRyZXR1cm4gbW9kZWxEYXRhLnZpZXdNb2RlbC52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcih2aWV3UG9zaXRpb24ubGluZU51bWJlciwgaW5jbHVkZVZpZXdab25lcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Qm90dG9tRm9yTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIsIGluY2x1ZGVWaWV3Wm9uZXM6IGJvb2xlYW4gPSBmYWxzZSk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIENvZGVFZGl0b3JXaWRnZXQuX2dldFZlcnRpY2FsT2Zmc2V0QWZ0ZXJQb3NpdGlvbih0aGlzLl9tb2RlbERhdGEsIGxpbmVOdW1iZXIsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCBpbmNsdWRlVmlld1pvbmVzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbDtcblx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlcjtcblx0XHRjb25zdCBwb3MgPSBQb3NpdGlvbi5saWZ0KHBvc2l0aW9uKTtcblx0XHRpZiAoY29vcmRpbmF0ZXNDb252ZXJ0ZXIubW9kZWxQb3NpdGlvbklzVmlzaWJsZShwb3MpKSB7XG5cdFx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSBjb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHBvcyk7XG5cdFx0XHRyZXR1cm4gdmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0TGluZUhlaWdodEZvckxpbmVOdW1iZXIodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBzZXRIaWRkZW5BcmVhcyhyYW5nZXM6IElSYW5nZVtdLCBzb3VyY2U/OiB1bmtub3duLCBmb3JjZVVwZGF0ZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbERhdGE/LnZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhyYW5nZXMubWFwKHIgPT4gUmFuZ2UubGlmdChyKSksIHNvdXJjZSwgZm9yY2VVcGRhdGUpO1xuXHR9XG5cblx0cHVibGljIGdldFZpc2libGVDb2x1bW5Gcm9tUG9zaXRpb24ocmF3UG9zaXRpb246IElQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiByYXdQb3NpdGlvbi5jb2x1bW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9tb2RlbERhdGEubW9kZWwudmFsaWRhdGVQb3NpdGlvbihyYXdQb3NpdGlvbik7XG5cdFx0Y29uc3QgdGFiU2l6ZSA9IHRoaXMuX21vZGVsRGF0YS5tb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZTtcblxuXHRcdHJldHVybiBDdXJzb3JDb2x1bW5zLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKHRoaXMuX21vZGVsRGF0YS5tb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSwgcG9zaXRpb24uY29sdW1uLCB0YWJTaXplKSArIDE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhdHVzYmFyQ29sdW1uKHJhd1Bvc2l0aW9uOiBJUG9zaXRpb24pOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gcmF3UG9zaXRpb24uY29sdW1uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLnZhbGlkYXRlUG9zaXRpb24ocmF3UG9zaXRpb24pO1xuXHRcdGNvbnN0IHRhYlNpemUgPSB0aGlzLl9tb2RlbERhdGEubW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemU7XG5cblx0XHRyZXR1cm4gQ3Vyc29yQ29sdW1ucy50b1N0YXR1c2JhckNvbHVtbih0aGlzLl9tb2RlbERhdGEubW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlciksIHBvc2l0aW9uLmNvbHVtbiwgdGFiU2l6ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UG9zaXRpb24oKTogUG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmdldFBvc2l0aW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0UG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbiwgc291cmNlOiBzdHJpbmcgPSAnYXBpJyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghUG9zaXRpb24uaXNJUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuc2V0U2VsZWN0aW9ucyhzb3VyY2UsIFt7XG5cdFx0XHRzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRzZWxlY3Rpb25TdGFydENvbHVtbjogcG9zaXRpb24uY29sdW1uLFxuXHRcdFx0cG9zaXRpb25MaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0cG9zaXRpb25Db2x1bW46IHBvc2l0aW9uLmNvbHVtblxuXHRcdH1dKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRSZXZlYWxSYW5nZShtb2RlbFJhbmdlOiBSYW5nZSwgdmVydGljYWxUeXBlOiBWZXJ0aWNhbFJldmVhbFR5cGUsIHJldmVhbEhvcml6b250YWw6IGJvb2xlYW4sIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFSYW5nZS5pc0lSYW5nZShtb2RlbFJhbmdlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdH1cblx0XHRjb25zdCB2YWxpZGF0ZWRNb2RlbFJhbmdlID0gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLnZhbGlkYXRlUmFuZ2UobW9kZWxSYW5nZSk7XG5cdFx0Y29uc3Qgdmlld1JhbmdlID0gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxSYW5nZVRvVmlld1JhbmdlKHZhbGlkYXRlZE1vZGVsUmFuZ2UpO1xuXG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5yZXZlYWxSYW5nZSgnYXBpJywgcmV2ZWFsSG9yaXpvbnRhbCwgdmlld1JhbmdlLCB2ZXJ0aWNhbFR5cGUsIHNjcm9sbFR5cGUpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbEFsbEN1cnNvcnMocmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiwgbWluaW1hbFJldmVhbD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnJldmVhbEFsbEN1cnNvcnMoJ2FwaScsIHJldmVhbEhvcml6b250YWwsIG1pbmltYWxSZXZlYWwpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbExpbmUobGluZU51bWJlcjogbnVtYmVyLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbExpbmUobGluZU51bWJlciwgVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSwgc2Nyb2xsVHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZUluQ2VudGVyKGxpbmVOdW1iZXI6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxMaW5lKGxpbmVOdW1iZXIsIFZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXIsIHNjcm9sbFR5cGUpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGxpbmVOdW1iZXI6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxMaW5lKGxpbmVOdW1iZXIsIFZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCwgc2Nyb2xsVHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZU5lYXJUb3AobGluZU51bWJlcjogbnVtYmVyLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbExpbmUobGluZU51bWJlciwgVmVydGljYWxSZXZlYWxUeXBlLk5lYXJUb3AsIHNjcm9sbFR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIHJldmVhbFR5cGU6IFZlcnRpY2FsUmV2ZWFsVHlwZSwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIGxpbmVOdW1iZXIgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZFJldmVhbFJhbmdlKFxuXHRcdFx0bmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIDEpLFxuXHRcdFx0cmV2ZWFsVHlwZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsUG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxQb3NpdGlvbihcblx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSxcblx0XHRcdHRydWUsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxQb3NpdGlvbkluQ2VudGVyKHBvc2l0aW9uOiBJUG9zaXRpb24sIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsUG9zaXRpb24oXG5cdFx0XHRwb3NpdGlvbixcblx0XHRcdFZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXIsXG5cdFx0XHR0cnVlLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsUG9zaXRpb25JbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHBvc2l0aW9uOiBJUG9zaXRpb24sIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsUG9zaXRpb24oXG5cdFx0XHRwb3NpdGlvbixcblx0XHRcdFZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCxcblx0XHRcdHRydWUsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxQb3NpdGlvbk5lYXJUb3AocG9zaXRpb246IElQb3NpdGlvbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxQb3NpdGlvbihcblx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLk5lYXJUb3AsXG5cdFx0XHR0cnVlLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uLCB2ZXJ0aWNhbFR5cGU6IFZlcnRpY2FsUmV2ZWFsVHlwZSwgcmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUpOiB2b2lkIHtcblx0XHRpZiAoIVBvc2l0aW9uLmlzSVBvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmRSZXZlYWxSYW5nZShcblx0XHRcdG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiksXG5cdFx0XHR2ZXJ0aWNhbFR5cGUsXG5cdFx0XHRyZXZlYWxIb3Jpem9udGFsLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VsZWN0aW9ucygpOiBTZWxlY3Rpb25bXSB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpO1xuXHR9XG5cblx0cHVibGljIHNldFNlbGVjdGlvbihyYW5nZTogSVJhbmdlLCBzb3VyY2U/OiBzdHJpbmcpOiB2b2lkO1xuXHRwdWJsaWMgc2V0U2VsZWN0aW9uKGVkaXRvclJhbmdlOiBSYW5nZSwgc291cmNlPzogc3RyaW5nKTogdm9pZDtcblx0cHVibGljIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IElTZWxlY3Rpb24sIHNvdXJjZT86IHN0cmluZyk6IHZvaWQ7XG5cdHB1YmxpYyBzZXRTZWxlY3Rpb24oZWRpdG9yU2VsZWN0aW9uOiBTZWxlY3Rpb24sIHNvdXJjZT86IHN0cmluZyk6IHZvaWQ7XG5cdHB1YmxpYyBzZXRTZWxlY3Rpb24oc29tZXRoaW5nOiB1bmtub3duLCBzb3VyY2U/OiBzdHJpbmcpOiB2b2lkO1xuXHRwdWJsaWMgc2V0U2VsZWN0aW9uKHNvbWV0aGluZzogdW5rbm93biwgc291cmNlOiBzdHJpbmcgPSAnYXBpJyk6IHZvaWQge1xuXHRcdGNvbnN0IGlzU2VsZWN0aW9uID0gU2VsZWN0aW9uLmlzSVNlbGVjdGlvbihzb21ldGhpbmcpO1xuXHRcdGNvbnN0IGlzUmFuZ2UgPSBSYW5nZS5pc0lSYW5nZShzb21ldGhpbmcpO1xuXG5cdFx0aWYgKCFpc1NlbGVjdGlvbiAmJiAhaXNSYW5nZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdH1cblxuXHRcdGlmIChpc1NlbGVjdGlvbikge1xuXHRcdFx0dGhpcy5fc2V0U2VsZWN0aW9uSW1wbChzb21ldGhpbmcsIHNvdXJjZSk7XG5cdFx0fSBlbHNlIGlmIChpc1JhbmdlKSB7XG5cdFx0XHQvLyBhY3QgYXMgaWYgaXQgd2FzIGFuIElSYW5nZVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uOiBJU2VsZWN0aW9uID0ge1xuXHRcdFx0XHRzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IHNvbWV0aGluZy5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0Q29sdW1uOiBzb21ldGhpbmcuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdHBvc2l0aW9uTGluZU51bWJlcjogc29tZXRoaW5nLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdHBvc2l0aW9uQ29sdW1uOiBzb21ldGhpbmcuZW5kQ29sdW1uXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fc2V0U2VsZWN0aW9uSW1wbChzZWxlY3Rpb24sIHNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U2VsZWN0aW9uSW1wbChzZWw6IElTZWxlY3Rpb24sIHNvdXJjZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbihzZWwuc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyLCBzZWwuc2VsZWN0aW9uU3RhcnRDb2x1bW4sIHNlbC5wb3NpdGlvbkxpbmVOdW1iZXIsIHNlbC5wb3NpdGlvbkNvbHVtbik7XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKHNvdXJjZSwgW3NlbGVjdGlvbl0pO1xuXHR9XG5cblx0cHVibGljIHJldmVhbExpbmVzKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsTGluZXMoXG5cdFx0XHRzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbExpbmVzSW5DZW50ZXIoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxMaW5lcyhcblx0XHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRcdGVuZExpbmVOdW1iZXIsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuQ2VudGVyLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZXNJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsTGluZXMoXG5cdFx0XHRzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZXNOZWFyVG9wKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsTGluZXMoXG5cdFx0XHRzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLk5lYXJUb3AsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbExpbmVzKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIHZlcnRpY2FsVHlwZTogVmVydGljYWxSZXZlYWxUeXBlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2Ygc3RhcnRMaW5lTnVtYmVyICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgZW5kTGluZU51bWJlciAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kUmV2ZWFsUmFuZ2UoXG5cdFx0XHRuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCAxLCBlbmRMaW5lTnVtYmVyLCAxKSxcblx0XHRcdHZlcnRpY2FsVHlwZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsUmFuZ2UocmFuZ2U6IElSYW5nZSwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgsIHJldmVhbFZlcnRpY2FsSW5DZW50ZXI6IGJvb2xlYW4gPSBmYWxzZSwgcmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxSYW5nZShcblx0XHRcdHJhbmdlLFxuXHRcdFx0cmV2ZWFsVmVydGljYWxJbkNlbnRlciA/IFZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXIgOiBWZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLFxuXHRcdFx0cmV2ZWFsSG9yaXpvbnRhbCxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFJhbmdlSW5DZW50ZXIocmFuZ2U6IElSYW5nZSwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxSYW5nZShcblx0XHRcdHJhbmdlLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcixcblx0XHRcdHRydWUsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocmFuZ2U6IElSYW5nZSwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxSYW5nZShcblx0XHRcdHJhbmdlLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFJhbmdlTmVhclRvcChyYW5nZTogSVJhbmdlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFJhbmdlKFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcCxcblx0XHRcdHRydWUsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxSYW5nZU5lYXJUb3BJZk91dHNpZGVWaWV3cG9ydChyYW5nZTogSVJhbmdlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFJhbmdlKFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFJhbmdlQXRUb3AocmFuZ2U6IElSYW5nZSwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxSYW5nZShcblx0XHRcdHJhbmdlLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLlRvcCxcblx0XHRcdHRydWUsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbFJhbmdlKHJhbmdlOiBJUmFuZ2UsIHZlcnRpY2FsVHlwZTogVmVydGljYWxSZXZlYWxUeXBlLCByZXZlYWxIb3Jpem9udGFsOiBib29sZWFuLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSk6IHZvaWQge1xuXHRcdGlmICghUmFuZ2UuaXNJUmFuZ2UocmFuZ2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZFJldmVhbFJhbmdlKFxuXHRcdFx0UmFuZ2UubGlmdChyYW5nZSksXG5cdFx0XHR2ZXJ0aWNhbFR5cGUsXG5cdFx0XHRyZXZlYWxIb3Jpem9udGFsLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VsZWN0aW9ucyhyYW5nZXM6IHJlYWRvbmx5IElTZWxlY3Rpb25bXSwgc291cmNlOiBzdHJpbmcgPSAnYXBpJywgcmVhc29uID0gQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghcmFuZ2VzIHx8IHJhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKCFTZWxlY3Rpb24uaXNJU2VsZWN0aW9uKHJhbmdlc1tpXSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnNldFNlbGVjdGlvbnMoc291cmNlLCByYW5nZXMsIHJlYXNvbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29udGVudFdpZHRoKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRDb250ZW50V2lkdGgoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTY3JvbGxXaWR0aCgpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0U2Nyb2xsV2lkdGgoKTtcblx0fVxuXHRwdWJsaWMgZ2V0U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbExlZnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZW50SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Nyb2xsSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRTY3JvbGxIZWlnaHQoKTtcblx0fVxuXHRwdWJsaWMgZ2V0U2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Nyb2xsTGVmdChuZXdTY3JvbGxMZWZ0OiBudW1iZXIsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuSW1tZWRpYXRlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdTY3JvbGxMZWZ0ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnZpZXdMYXlvdXQuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0c2Nyb2xsTGVmdDogbmV3U2Nyb2xsTGVmdFxuXHRcdH0sIHNjcm9sbFR5cGUpO1xuXHR9XG5cdHB1YmxpYyBzZXRTY3JvbGxUb3AobmV3U2Nyb2xsVG9wOiBudW1iZXIsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuSW1tZWRpYXRlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdTY3JvbGxUb3AgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbih7XG5cdFx0XHRzY3JvbGxUb3A6IG5ld1Njcm9sbFRvcFxuXHRcdH0sIHNjcm9sbFR5cGUpO1xuXHR9XG5cdHB1YmxpYyBzZXRTY3JvbGxQb3NpdGlvbihwb3NpdGlvbjogZWRpdG9yQ29tbW9uLklOZXdTY3JvbGxQb3NpdGlvbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5JbW1lZGlhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnZpZXdMYXlvdXQuc2V0U2Nyb2xsUG9zaXRpb24ocG9zaXRpb24sIHNjcm9sbFR5cGUpO1xuXHR9XG5cdHB1YmxpYyBoYXNQZW5kaW5nU2Nyb2xsQW5pbWF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnZpZXdMYXlvdXQuaGFzUGVuZGluZ1Njcm9sbEFuaW1hdGlvbigpO1xuXHR9XG5cblx0cHVibGljIHNhdmVWaWV3U3RhdGUoKTogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBjb250cmlidXRpb25zU3RhdGUgPSB0aGlzLl9jb250cmlidXRpb25zLnNhdmVWaWV3U3RhdGUoKTtcblx0XHRjb25zdCBjdXJzb3JTdGF0ZSA9IHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuc2F2ZUN1cnNvclN0YXRlKCk7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5zYXZlU3RhdGUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3Vyc29yU3RhdGU6IGN1cnNvclN0YXRlLFxuXHRcdFx0dmlld1N0YXRlOiB2aWV3U3RhdGUsXG5cdFx0XHRjb250cmlidXRpb25zU3RhdGU6IGNvbnRyaWJ1dGlvbnNTdGF0ZVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgcmVzdG9yZVZpZXdTdGF0ZShzOiBlZGl0b3JDb21tb24uSUVkaXRvclZpZXdTdGF0ZSB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvZGVFZGl0b3JTdGF0ZSA9IHMgYXMgZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgbnVsbDtcblx0XHRpZiAoY29kZUVkaXRvclN0YXRlICYmIGNvZGVFZGl0b3JTdGF0ZS5jdXJzb3JTdGF0ZSAmJiBjb2RlRWRpdG9yU3RhdGUudmlld1N0YXRlKSB7XG5cdFx0XHRjb25zdCBjdXJzb3JTdGF0ZSA9IDx1bmtub3duPmNvZGVFZGl0b3JTdGF0ZS5jdXJzb3JTdGF0ZTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGN1cnNvclN0YXRlKSkge1xuXHRcdFx0XHRpZiAoY3Vyc29yU3RhdGUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwucmVzdG9yZUN1cnNvclN0YXRlKDxlZGl0b3JDb21tb24uSUN1cnNvclN0YXRlW10+Y3Vyc29yU3RhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnJlc3RvcmVDdXJzb3JTdGF0ZShbPGVkaXRvckNvbW1vbi5JQ3Vyc29yU3RhdGU+Y3Vyc29yU3RhdGVdKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY29udHJpYnV0aW9ucy5yZXN0b3JlVmlld1N0YXRlKGNvZGVFZGl0b3JTdGF0ZS5jb250cmlidXRpb25zU3RhdGUgfHwge30pO1xuXHRcdFx0Y29uc3QgcmVkdWNlZFN0YXRlID0gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5yZWR1Y2VSZXN0b3JlU3RhdGUoY29kZUVkaXRvclN0YXRlLnZpZXdTdGF0ZSk7XG5cdFx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5yZXN0b3JlU3RhdGUocmVkdWNlZFN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlSW5pdGlhbGl6ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2V0Vmlld01vZGVsKCk/LnZpc2libGVMaW5lc1N0YWJpbGl6ZWQoKTtcblx0fVxuXG5cdHB1YmxpYyBvblZpc2libGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxEYXRhPy52aWV3LnJlZnJlc2hGb2N1c1N0YXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgb25IaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsRGF0YT8udmlldy5yZWZyZXNoRm9jdXNTdGF0ZSgpO1xuXHR9XG5cblx0cHVibGljIGdldENvbnRyaWJ1dGlvbjxUIGV4dGVuZHMgZWRpdG9yQ29tbW9uLklFZGl0b3JDb250cmlidXRpb24+KGlkOiBzdHJpbmcpOiBUIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KGlkKSBhcyBUIHwgbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3Rpb25zKCk6IGVkaXRvckNvbW1vbi5JRWRpdG9yQWN0aW9uW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2FjdGlvbnMudmFsdWVzKCkpO1xuXHR9XG5cblx0cHVibGljIGdldFN1cHBvcnRlZEFjdGlvbnMoKTogZWRpdG9yQ29tbW9uLklFZGl0b3JBY3Rpb25bXSB7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuZ2V0QWN0aW9ucygpO1xuXG5cdFx0cmVzdWx0ID0gcmVzdWx0LmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uLmlzU3VwcG9ydGVkKCkpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3Rpb24oaWQ6IHN0cmluZyk6IGVkaXRvckNvbW1vbi5JRWRpdG9yQWN0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvbnMuZ2V0KGlkKSB8fCBudWxsO1xuXHR9XG5cblx0cHVibGljIHRyaWdnZXIoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBoYW5kbGVySWQ6IHN0cmluZywgcGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuXHRcdHBheWxvYWQgPSBwYXlsb2FkIHx8IHt9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX29uV2lsbFRyaWdnZXJFZGl0b3JPcGVyYXRpb25FdmVudC5maXJlKHsgc291cmNlOiBzb3VyY2UsIGhhbmRsZXJJZDogaGFuZGxlcklkLCBwYXlsb2FkOiBwYXlsb2FkIH0pO1xuXHRcdFx0dGhpcy5fYmVnaW5VcGRhdGUoKTtcblxuXHRcdFx0c3dpdGNoIChoYW5kbGVySWQpIHtcblx0XHRcdFx0Y2FzZSBlZGl0b3JDb21tb24uSGFuZGxlci5Db21wb3NpdGlvblN0YXJ0OlxuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgZWRpdG9yQ29tbW9uLkhhbmRsZXIuQ29tcG9zaXRpb25FbmQ6XG5cdFx0XHRcdFx0dGhpcy5fZW5kQ29tcG9zaXRpb24oc291cmNlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgZWRpdG9yQ29tbW9uLkhhbmRsZXIuVHlwZToge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSA8UGFydGlhbDxlZGl0b3JDb21tb24uVHlwZVBheWxvYWQ+PnBheWxvYWQ7XG5cdFx0XHRcdFx0dGhpcy5fdHlwZShzb3VyY2UsIGFyZ3MudGV4dCB8fCAnJyk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgZWRpdG9yQ29tbW9uLkhhbmRsZXIuUmVwbGFjZVByZXZpb3VzQ2hhcjoge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSA8UGFydGlhbDxlZGl0b3JDb21tb24uUmVwbGFjZVByZXZpb3VzQ2hhclBheWxvYWQ+PnBheWxvYWQ7XG5cdFx0XHRcdFx0dGhpcy5fY29tcG9zaXRpb25UeXBlKHNvdXJjZSwgYXJncy50ZXh0IHx8ICcnLCBhcmdzLnJlcGxhY2VDaGFyQ250IHx8IDAsIDAsIDApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIGVkaXRvckNvbW1vbi5IYW5kbGVyLkNvbXBvc2l0aW9uVHlwZToge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSA8UGFydGlhbDxlZGl0b3JDb21tb24uQ29tcG9zaXRpb25UeXBlUGF5bG9hZD4+cGF5bG9hZDtcblx0XHRcdFx0XHR0aGlzLl9jb21wb3NpdGlvblR5cGUoc291cmNlLCBhcmdzLnRleHQgfHwgJycsIGFyZ3MucmVwbGFjZVByZXZDaGFyQ250IHx8IDAsIGFyZ3MucmVwbGFjZU5leHRDaGFyQ250IHx8IDAsIGFyZ3MucG9zaXRpb25EZWx0YSB8fCAwKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBlZGl0b3JDb21tb24uSGFuZGxlci5QYXN0ZToge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSA8UGFydGlhbDxlZGl0b3JCcm93c2VyLlBhc3RlUGF5bG9hZD4+cGF5bG9hZDtcblx0XHRcdFx0XHR0aGlzLl9wYXN0ZShzb3VyY2UsIGFyZ3MudGV4dCB8fCAnJywgYXJncy5wYXN0ZU9uTmV3TGluZSB8fCBmYWxzZSwgYXJncy5tdWx0aWN1cnNvclRleHQgfHwgbnVsbCwgYXJncy5tb2RlIHx8IG51bGwsIGFyZ3MuY2xpcGJvYXJkRXZlbnQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIGVkaXRvckNvbW1vbi5IYW5kbGVyLkN1dDpcblx0XHRcdFx0XHR0aGlzLl9jdXQoc291cmNlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuZ2V0QWN0aW9uKGhhbmRsZXJJZCk7XG5cdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuKHBheWxvYWQpKS50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3RyaWdnZXJFZGl0b3JDb21tYW5kKHNvdXJjZSwgaGFuZGxlcklkLCBwYXlsb2FkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3RyaWdnZXJDb21tYW5kKGhhbmRsZXJJZCwgcGF5bG9hZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2VuZFVwZGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfdHJpZ2dlckNvbW1hbmQoaGFuZGxlcklkOiBzdHJpbmcsIHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChoYW5kbGVySWQsIHBheWxvYWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRDb21wb3NpdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmluQ29tcG9zaXRpb24gPSB0cnVlO1xuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdHRoaXMuX29uRGlkQ29tcG9zaXRpb25TdGFydC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmRDb21wb3NpdGlvbihzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmluQ29tcG9zaXRpb24gPSBmYWxzZTtcblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmVuZENvbXBvc2l0aW9uKHNvdXJjZSk7XG5cdFx0dGhpcy5fb25EaWRDb21wb3NpdGlvbkVuZC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF90eXBlKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgdGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgdGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNvdXJjZSA9PT0gJ2tleWJvYXJkJykge1xuXHRcdFx0dGhpcy5fb25XaWxsVHlwZS5maXJlKHRleHQpO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnR5cGUodGV4dCwgc291cmNlKTtcblx0XHRpZiAoc291cmNlID09PSAna2V5Ym9hcmQnKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFR5cGUuZmlyZSh0ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21wb3NpdGlvblR5cGUoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0ZXh0OiBzdHJpbmcsIHJlcGxhY2VQcmV2Q2hhckNudDogbnVtYmVyLCByZXBsYWNlTmV4dENoYXJDbnQ6IG51bWJlciwgcG9zaXRpb25EZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUodGV4dCwgcmVwbGFjZVByZXZDaGFyQ250LCByZXBsYWNlTmV4dENoYXJDbnQsIHBvc2l0aW9uRGVsdGEsIHNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9wYXN0ZShzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHRleHQ6IHN0cmluZywgcGFzdGVPbk5ld0xpbmU6IGJvb2xlYW4sIG11bHRpY3Vyc29yVGV4dDogc3RyaW5nW10gfCBudWxsLCBtb2RlOiBzdHJpbmcgfCBudWxsLCBjbGlwYm9hcmRFdmVudD86IENsaXBib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbDtcblx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gdmlld01vZGVsLmdldFNlbGVjdGlvbigpLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHR2aWV3TW9kZWwucGFzdGUodGV4dCwgcGFzdGVPbk5ld0xpbmUsIG11bHRpY3Vyc29yVGV4dCwgc291cmNlKTtcblx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0aWYgKHNvdXJjZSA9PT0gJ2tleWJvYXJkJykge1xuXHRcdFx0dGhpcy5fb25EaWRQYXN0ZS5maXJlKHtcblx0XHRcdFx0Y2xpcGJvYXJkRXZlbnQsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbiwgZW5kUG9zaXRpb24ubGluZU51bWJlciwgZW5kUG9zaXRpb24uY29sdW1uKSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogbW9kZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3V0KHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuY3V0KHNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF90cmlnZ2VyRWRpdG9yQ29tbWFuZChzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGhhbmRsZXJJZDogc3RyaW5nLCBwYXlsb2FkOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb21tYW5kKGhhbmRsZXJJZCk7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdHBheWxvYWQgPSBwYXlsb2FkIHx8IHt9O1xuXHRcdFx0aWYgKGlzT2JqZWN0KHBheWxvYWQpKSB7XG5cdFx0XHRcdChwYXlsb2FkIGFzIHsgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkIH0pLnNvdXJjZSA9IHNvdXJjZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRQcm9taXNlLnJlc29sdmUoY29tbWFuZC5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCB0aGlzLCBwYXlsb2FkKSkudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIF9nZXRWaWV3TW9kZWwoKTogSVZpZXdNb2RlbCB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgcHVzaFVuZG9TdG9wKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdC8vIHJlYWQgb25seSBlZGl0b3IgPT4gc29ycnkhXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS5tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgcG9wVW5kb1N0b3AoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0Ly8gcmVhZCBvbmx5IGVkaXRvciA9PiBzb3JyeSFcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLm1vZGVsLnBvcFN0YWNrRWxlbWVudCgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGVkaXQoZWRpdDogVGV4dEVkaXQsIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmV4ZWN1dGVFZGl0cyhyZWFzb24sIGVkaXQucmVwbGFjZW1lbnRzLm1hcDxJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24+KGUgPT4gKHsgcmFuZ2U6IGUucmFuZ2UsIHRleHQ6IGUudGV4dCB9KSksIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgZXhlY3V0ZUVkaXRzKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCB8IFRleHRNb2RlbEVkaXRTb3VyY2UsIGVkaXRzOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSwgZW5kQ3Vyc29yU3RhdGU/OiBJQ3Vyc29yU3RhdGVDb21wdXRlciB8IFNlbGVjdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0Ly8gcmVhZCBvbmx5IGVkaXRvciA9PiBzb3JyeSFcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgY3Vyc29yU3RhdGVDb21wdXRlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXI7XG5cdFx0aWYgKCFlbmRDdXJzb3JTdGF0ZSkge1xuXHRcdFx0Y3Vyc29yU3RhdGVDb21wdXRlciA9ICgpID0+IG51bGw7XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGVuZEN1cnNvclN0YXRlKSkge1xuXHRcdFx0Y3Vyc29yU3RhdGVDb21wdXRlciA9ICgpID0+IGVuZEN1cnNvclN0YXRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXJzb3JTdGF0ZUNvbXB1dGVyID0gZW5kQ3Vyc29yU3RhdGU7XG5cdFx0fVxuXG5cdFx0bGV0IHNvdXJjZVN0cjogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRsZXQgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlO1xuXG5cdFx0aWYgKHNvdXJjZSBpbnN0YW5jZW9mIFRleHRNb2RlbEVkaXRTb3VyY2UpIHtcblx0XHRcdHJlYXNvbiA9IHNvdXJjZTtcblx0XHRcdHNvdXJjZVN0ciA9IHNvdXJjZS5tZXRhZGF0YS5zb3VyY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlYXNvbiA9IEVkaXRTb3VyY2VzLnVua25vd24oeyBuYW1lOiBzb3VyY2UgfSk7XG5cdFx0XHRzb3VyY2VTdHIgPSBzb3VyY2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25CZWZvcmVFeGVjdXRlRWRpdC5maXJlKHsgc291cmNlOiBzb3VyY2VTdHIgPz8gdW5kZWZpbmVkIH0pO1xuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZXhlY3V0ZUVkaXRzKHNvdXJjZVN0ciwgZWRpdHMsIGN1cnNvclN0YXRlQ29tcHV0ZXIsIHJlYXNvbik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZXhlY3V0ZUNvbW1hbmQoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBjb21tYW5kOiBlZGl0b3JDb21tb24uSUNvbW1hbmQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQsIHNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgZXhlY3V0ZUNvbW1hbmRzKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgY29tbWFuZHM6IGVkaXRvckNvbW1vbi5JQ29tbWFuZFtdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5leGVjdXRlQ29tbWFuZHMoY29tbWFuZHMsIHNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKGRlY29yYXRpb25zPzogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10pOiBFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24ge1xuXHRcdHJldHVybiBuZXcgRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uKHRoaXMsIGRlY29yYXRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBjaGFuZ2VEZWNvcmF0aW9uczxUPihjYWxsYmFjazogKGNoYW5nZUFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yKSA9PiBUKTogVCB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHQvLyBjYWxsYmFjayB3aWxsIG5vdCBiZSBjYWxsZWRcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLmNoYW5nZURlY29yYXRpb25zKGNhbGxiYWNrLCB0aGlzLl9pZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZURlY29yYXRpb25zKGxpbmVOdW1iZXI6IG51bWJlcik6IElNb2RlbERlY29yYXRpb25bXSB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLmdldExpbmVEZWNvcmF0aW9ucyhsaW5lTnVtYmVyLCB0aGlzLl9pZCwgZmlsdGVyVmFsaWRhdGlvbkRlY29yYXRpb25zKG9wdGlvbnMpLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMob3B0aW9ucykpO1xuXHR9XG5cblx0cHVibGljIGdldERlY29yYXRpb25zSW5SYW5nZShyYW5nZTogUmFuZ2UpOiBJTW9kZWxEZWNvcmF0aW9uW10gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS5tb2RlbC5nZXREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2UsIHRoaXMuX2lkLCBmaWx0ZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMob3B0aW9ucyksIGZpbHRlckZvbnREZWNvcmF0aW9ucyhvcHRpb25zKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rm9udFNpemVBdFBvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmdldEZvbnRTaXplQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWRcblx0ICovXG5cdHB1YmxpYyBkZWx0YURlY29yYXRpb25zKG9sZERlY29yYXRpb25zOiBzdHJpbmdbXSwgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdKTogc3RyaW5nW10ge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKG9sZERlY29yYXRpb25zLmxlbmd0aCA9PT0gMCAmJiBuZXdEZWNvcmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBvbGREZWNvcmF0aW9ucztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLmRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnMsIG5ld0RlY29yYXRpb25zLCB0aGlzLl9pZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbklkczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCBkZWNvcmF0aW9uSWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX21vZGVsRGF0YS5tb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMoZGVjb3JhdGlvbklkcywgW10pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHNldERlY29yYXRpb25zQnlUeXBlKGRlc2NyaXB0aW9uOiBzdHJpbmcsIGRlY29yYXRpb25UeXBlS2V5OiBzdHJpbmcsIGRlY29yYXRpb25PcHRpb25zOiBlZGl0b3JDb21tb24uSURlY29yYXRpb25PcHRpb25zW10pOiByZWFkb25seSBzdHJpbmdbXSB7XG5cblx0XHRjb25zdCBuZXdEZWNvcmF0aW9uc1N1YlR5cGVzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xuXHRcdGNvbnN0IG9sZERlY29yYXRpb25zU3ViVHlwZXMgPSB0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzW2RlY29yYXRpb25UeXBlS2V5XSB8fCB7fTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzW2RlY29yYXRpb25UeXBlS2V5XSA9IG5ld0RlY29yYXRpb25zU3ViVHlwZXM7XG5cblx0XHRjb25zdCBuZXdNb2RlbERlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uT3B0aW9uIG9mIGRlY29yYXRpb25PcHRpb25zKSB7XG5cdFx0XHRsZXQgdHlwZUtleSA9IGRlY29yYXRpb25UeXBlS2V5O1xuXHRcdFx0aWYgKGRlY29yYXRpb25PcHRpb24ucmVuZGVyT3B0aW9ucykge1xuXHRcdFx0XHQvLyBpZGVudGlmeSBjdXN0b20gcmVuZGVyIG9wdGlvbnMgYnkgYSBoYXNoIGNvZGUgb3ZlciBhbGwga2V5cyBhbmQgdmFsdWVzXG5cdFx0XHRcdC8vIEZvciBjdXN0b20gcmVuZGVyIG9wdGlvbnMgcmVnaXN0ZXIgYSBkZWNvcmF0aW9uIHR5cGUgaWYgbmVjZXNzYXJ5XG5cdFx0XHRcdGNvbnN0IHN1YlR5cGUgPSBoYXNoKGRlY29yYXRpb25PcHRpb24ucmVuZGVyT3B0aW9ucykudG9TdHJpbmcoMTYpO1xuXHRcdFx0XHQvLyBUaGUgZmFjdCB0aGF0IGBkZWNvcmF0aW9uVHlwZUtleWAgYXBwZWFycyBpbiB0aGUgdHlwZUtleSBoYXMgbm8gaW5mbHVlbmNlXG5cdFx0XHRcdC8vIGl0IGlzIGp1c3QgYSBtZWNoYW5pc20gdG8gZ2V0IHByZWRpY3RhYmxlIGFuZCB1bmlxdWUga2V5cyAocmVwZWF0YWJsZSBmb3IgdGhlIHNhbWUgb3B0aW9ucyBhbmQgdW5pcXVlIGFjcm9zcyBjbGllbnRzKVxuXHRcdFx0XHR0eXBlS2V5ID0gZGVjb3JhdGlvblR5cGVLZXkgKyAnLScgKyBzdWJUeXBlO1xuXHRcdFx0XHRpZiAoIW9sZERlY29yYXRpb25zU3ViVHlwZXNbc3ViVHlwZV0gJiYgIW5ld0RlY29yYXRpb25zU3ViVHlwZXNbc3ViVHlwZV0pIHtcblx0XHRcdFx0XHQvLyBkZWNvcmF0aW9uIHR5cGUgZGlkIG5vdCBleGlzdCBiZWZvcmUsIHJlZ2lzdGVyIG5ldyBvbmVcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlckRlY29yYXRpb25UeXBlKGRlc2NyaXB0aW9uLCB0eXBlS2V5LCBkZWNvcmF0aW9uT3B0aW9uLnJlbmRlck9wdGlvbnMsIGRlY29yYXRpb25UeXBlS2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXdEZWNvcmF0aW9uc1N1YlR5cGVzW3N1YlR5cGVdID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9wdHMgPSB0aGlzLl9yZXNvbHZlRGVjb3JhdGlvbk9wdGlvbnModHlwZUtleSwgISFkZWNvcmF0aW9uT3B0aW9uLmhvdmVyTWVzc2FnZSk7XG5cdFx0XHRpZiAoZGVjb3JhdGlvbk9wdGlvbi5ob3Zlck1lc3NhZ2UpIHtcblx0XHRcdFx0b3B0cy5ob3Zlck1lc3NhZ2UgPSBkZWNvcmF0aW9uT3B0aW9uLmhvdmVyTWVzc2FnZTtcblx0XHRcdH1cblx0XHRcdG5ld01vZGVsRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBkZWNvcmF0aW9uT3B0aW9uLnJhbmdlLCBvcHRpb25zOiBvcHRzIH0pO1xuXHRcdH1cblxuXHRcdC8vIHJlbW92ZSBkZWNvcmF0aW9uIHN1YiB0eXBlcyB0aGF0IGFyZSBubyBsb25nZXIgdXNlZCwgZGVyZWdpc3RlciBkZWNvcmF0aW9uIHR5cGUgaWYgbmVjZXNzYXJ5XG5cdFx0Zm9yIChjb25zdCBzdWJUeXBlIGluIG9sZERlY29yYXRpb25zU3ViVHlwZXMpIHtcblx0XHRcdGlmICghbmV3RGVjb3JhdGlvbnNTdWJUeXBlc1tzdWJUeXBlXSkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uVHlwZUtleSArICctJyArIHN1YlR5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBhbGwgZGVjb3JhdGlvbnNcblx0XHRjb25zdCBvbGREZWNvcmF0aW9uc0lkcyA9IHRoaXMuX2RlY29yYXRpb25UeXBlS2V5c1RvSWRzW2RlY29yYXRpb25UeXBlS2V5XSB8fCBbXTtcblx0XHR0aGlzLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHRoaXMuX2RlY29yYXRpb25UeXBlS2V5c1RvSWRzW2RlY29yYXRpb25UeXBlS2V5XSA9IGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnNJZHMsIG5ld01vZGVsRGVjb3JhdGlvbnMpKTtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHNbZGVjb3JhdGlvblR5cGVLZXldIHx8IFtdO1xuXHR9XG5cblx0cHVibGljIHNldERlY29yYXRpb25zQnlUeXBlRmFzdChkZWNvcmF0aW9uVHlwZUtleTogc3RyaW5nLCByYW5nZXM6IElSYW5nZVtdKTogdm9pZCB7XG5cblx0XHQvLyByZW1vdmUgZGVjb3JhdGlvbiBzdWIgdHlwZXMgdGhhdCBhcmUgbm8gbG9uZ2VyIHVzZWQsIGRlcmVnaXN0ZXIgZGVjb3JhdGlvbiB0eXBlIGlmIG5lY2Vzc2FyeVxuXHRcdGNvbnN0IG9sZERlY29yYXRpb25zU3ViVHlwZXMgPSB0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzW2RlY29yYXRpb25UeXBlS2V5XSB8fCB7fTtcblx0XHRmb3IgKGNvbnN0IHN1YlR5cGUgaW4gb2xkRGVjb3JhdGlvbnNTdWJUeXBlcykge1xuXHRcdFx0dGhpcy5fcmVtb3ZlRGVjb3JhdGlvblR5cGUoZGVjb3JhdGlvblR5cGVLZXkgKyAnLScgKyBzdWJUeXBlKTtcblx0XHR9XG5cdFx0dGhpcy5fZGVjb3JhdGlvblR5cGVTdWJ0eXBlc1tkZWNvcmF0aW9uVHlwZUtleV0gPSB7fTtcblxuXHRcdGNvbnN0IG9wdHMgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWModGhpcy5fcmVzb2x2ZURlY29yYXRpb25PcHRpb25zKGRlY29yYXRpb25UeXBlS2V5LCBmYWxzZSkpO1xuXHRcdGNvbnN0IG5ld01vZGVsRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gbmV3IEFycmF5PElNb2RlbERlbHRhRGVjb3JhdGlvbj4ocmFuZ2VzLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0bmV3TW9kZWxEZWNvcmF0aW9uc1tpXSA9IHsgcmFuZ2U6IHJhbmdlc1tpXSwgb3B0aW9uczogb3B0cyB9O1xuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBhbGwgZGVjb3JhdGlvbnNcblx0XHRjb25zdCBvbGREZWNvcmF0aW9uc0lkcyA9IHRoaXMuX2RlY29yYXRpb25UeXBlS2V5c1RvSWRzW2RlY29yYXRpb25UeXBlS2V5XSB8fCBbXTtcblx0XHR0aGlzLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHRoaXMuX2RlY29yYXRpb25UeXBlS2V5c1RvSWRzW2RlY29yYXRpb25UeXBlS2V5XSA9IGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnNJZHMsIG5ld01vZGVsRGVjb3JhdGlvbnMpKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVEZWNvcmF0aW9uc0J5VHlwZShkZWNvcmF0aW9uVHlwZUtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gcmVtb3ZlIGRlY29yYXRpb25zIGZvciB0eXBlIGFuZCBzdWIgdHlwZVxuXHRcdGNvbnN0IG9sZERlY29yYXRpb25zSWRzID0gdGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHNbZGVjb3JhdGlvblR5cGVLZXldO1xuXHRcdGlmIChvbGREZWNvcmF0aW9uc0lkcykge1xuXHRcdFx0dGhpcy5jaGFuZ2VEZWNvcmF0aW9ucyhhY2Nlc3NvciA9PiBhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKG9sZERlY29yYXRpb25zSWRzLCBbXSkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHMuaGFzT3duUHJvcGVydHkoZGVjb3JhdGlvblR5cGVLZXkpKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHNbZGVjb3JhdGlvblR5cGVLZXldO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGVjb3JhdGlvblR5cGVTdWJ0eXBlcy5oYXNPd25Qcm9wZXJ0eShkZWNvcmF0aW9uVHlwZUtleSkpIHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fZGVjb3JhdGlvblR5cGVTdWJ0eXBlc1tkZWNvcmF0aW9uVHlwZUtleV07XG5cdFx0XHRmb3IgKGNvbnN0IHN1YlR5cGUgb2YgT2JqZWN0LmtleXMoaXRlbXMpKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZURlY29yYXRpb25UeXBlKGRlY29yYXRpb25UeXBlS2V5ICsgJy0nICsgc3ViVHlwZSk7XG5cdFx0XHR9XG5cdFx0XHRkZWxldGUgdGhpcy5fZGVjb3JhdGlvblR5cGVTdWJ0eXBlc1tkZWNvcmF0aW9uVHlwZUtleV07XG5cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGF5b3V0SW5mbygpOiBFZGl0b3JMYXlvdXRJbmZvIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0cmV0dXJuIGxheW91dEluZm87XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlT3ZlcnZpZXdSdWxlcihjc3NDbGFzc05hbWU6IHN0cmluZyk6IGVkaXRvckJyb3dzZXIuSU92ZXJ2aWV3UnVsZXIgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3LmNyZWF0ZU92ZXJ2aWV3UnVsZXIoY3NzQ2xhc3NOYW1lKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250YWluZXJEb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tRWxlbWVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlldy5kb21Ob2RlLmRvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5kZWxlZ2F0ZVZlcnRpY2FsU2Nyb2xsYmFyUG9pbnRlckRvd24oYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHB1YmxpYyBkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5kZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQoZGltZW5zaW9uPzogSURpbWVuc2lvbiwgcG9zdHBvbmVSZW5kZXJpbmc6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24ub2JzZXJ2ZUNvbnRhaW5lcihkaW1lbnNpb24pO1xuXHRcdGlmICghcG9zdHBvbmVSZW5kZXJpbmcpIHtcblx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcuZm9jdXMoKTtcblx0fVxuXG5cdHB1YmxpYyBoYXNUZXh0Rm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXcuaXNGb2N1c2VkKCk7XG5cdH1cblxuXHRwdWJsaWMgaGFzV2lkZ2V0Rm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXcuaXNXaWRnZXRGb2N1c2VkKCk7XG5cdH1cblxuXHRwdWJsaWMgYWRkQ29udGVudFdpZGdldCh3aWRnZXQ6IGVkaXRvckJyb3dzZXIuSUNvbnRlbnRXaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXREYXRhOiBJQ29udGVudFdpZGdldERhdGEgPSB7XG5cdFx0XHR3aWRnZXQ6IHdpZGdldCxcblx0XHRcdHBvc2l0aW9uOiB3aWRnZXQuZ2V0UG9zaXRpb24oKVxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5fY29udGVudFdpZGdldHMuaGFzT3duUHJvcGVydHkod2lkZ2V0LmdldElkKCkpKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ092ZXJ3cml0aW5nIGEgY29udGVudCB3aWRnZXQgd2l0aCB0aGUgc2FtZSBpZDonICsgd2lkZ2V0LmdldElkKCkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRlbnRXaWRnZXRzW3dpZGdldC5nZXRJZCgpXSA9IHdpZGdldERhdGE7XG5cblx0XHRpZiAodGhpcy5fbW9kZWxEYXRhICYmIHRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcuYWRkQ29udGVudFdpZGdldCh3aWRnZXREYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0Q29udGVudFdpZGdldCh3aWRnZXQ6IGVkaXRvckJyb3dzZXIuSUNvbnRlbnRXaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRJZCA9IHdpZGdldC5nZXRJZCgpO1xuXHRcdGlmICh0aGlzLl9jb250ZW50V2lkZ2V0cy5oYXNPd25Qcm9wZXJ0eSh3aWRnZXRJZCkpIHtcblx0XHRcdGNvbnN0IHdpZGdldERhdGEgPSB0aGlzLl9jb250ZW50V2lkZ2V0c1t3aWRnZXRJZF07XG5cdFx0XHR3aWRnZXREYXRhLnBvc2l0aW9uID0gd2lkZ2V0LmdldFBvc2l0aW9uKCk7XG5cdFx0XHRpZiAodGhpcy5fbW9kZWxEYXRhICYmIHRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5sYXlvdXRDb250ZW50V2lkZ2V0KHdpZGdldERhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb250ZW50V2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JQ29udGVudFdpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldElkID0gd2lkZ2V0LmdldElkKCk7XG5cdFx0aWYgKHRoaXMuX2NvbnRlbnRXaWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldElkKSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0RGF0YSA9IHRoaXMuX2NvbnRlbnRXaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9jb250ZW50V2lkZ2V0c1t3aWRnZXRJZF07XG5cdFx0XHRpZiAodGhpcy5fbW9kZWxEYXRhICYmIHRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5yZW1vdmVDb250ZW50V2lkZ2V0KHdpZGdldERhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhZGRPdmVybGF5V2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JT3ZlcmxheVdpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldERhdGE6IElPdmVybGF5V2lkZ2V0RGF0YSA9IHtcblx0XHRcdHdpZGdldDogd2lkZ2V0LFxuXHRcdFx0cG9zaXRpb246IHdpZGdldC5nZXRQb3NpdGlvbigpXG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLl9vdmVybGF5V2lkZ2V0cy5oYXNPd25Qcm9wZXJ0eSh3aWRnZXQuZ2V0SWQoKSkpIHtcblx0XHRcdGNvbnNvbGUud2FybignT3ZlcndyaXRpbmcgYW4gb3ZlcmxheSB3aWRnZXQgd2l0aCB0aGUgc2FtZSBpZC4nKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vdmVybGF5V2lkZ2V0c1t3aWRnZXQuZ2V0SWQoKV0gPSB3aWRnZXREYXRhO1xuXHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5hZGRPdmVybGF5V2lkZ2V0KHdpZGdldERhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBsYXlvdXRPdmVybGF5V2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JT3ZlcmxheVdpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldElkID0gd2lkZ2V0LmdldElkKCk7XG5cdFx0aWYgKHRoaXMuX292ZXJsYXlXaWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldElkKSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0RGF0YSA9IHRoaXMuX292ZXJsYXlXaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdHdpZGdldERhdGEucG9zaXRpb24gPSB3aWRnZXQuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LmxheW91dE92ZXJsYXlXaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZU92ZXJsYXlXaWRnZXQod2lkZ2V0OiBlZGl0b3JCcm93c2VyLklPdmVybGF5V2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0SWQgPSB3aWRnZXQuZ2V0SWQoKTtcblx0XHRpZiAodGhpcy5fb3ZlcmxheVdpZGdldHMuaGFzT3duUHJvcGVydHkod2lkZ2V0SWQpKSB7XG5cdFx0XHRjb25zdCB3aWRnZXREYXRhID0gdGhpcy5fb3ZlcmxheVdpZGdldHNbd2lkZ2V0SWRdO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX292ZXJsYXlXaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LnJlbW92ZU92ZXJsYXlXaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZEdseXBoTWFyZ2luV2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JR2x5cGhNYXJnaW5XaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXREYXRhOiBJR2x5cGhNYXJnaW5XaWRnZXREYXRhID0ge1xuXHRcdFx0d2lkZ2V0OiB3aWRnZXQsXG5cdFx0XHRwb3NpdGlvbjogd2lkZ2V0LmdldFBvc2l0aW9uKClcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuX2dseXBoTWFyZ2luV2lkZ2V0cy5oYXNPd25Qcm9wZXJ0eSh3aWRnZXQuZ2V0SWQoKSkpIHtcblx0XHRcdGNvbnNvbGUud2FybignT3ZlcndyaXRpbmcgYSBnbHlwaCBtYXJnaW4gd2lkZ2V0IHdpdGggdGhlIHNhbWUgaWQuJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzW3dpZGdldC5nZXRJZCgpXSA9IHdpZGdldERhdGE7XG5cblx0XHRpZiAodGhpcy5fbW9kZWxEYXRhICYmIHRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcuYWRkR2x5cGhNYXJnaW5XaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGxheW91dEdseXBoTWFyZ2luV2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JR2x5cGhNYXJnaW5XaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRJZCA9IHdpZGdldC5nZXRJZCgpO1xuXHRcdGlmICh0aGlzLl9nbHlwaE1hcmdpbldpZGdldHMuaGFzT3duUHJvcGVydHkod2lkZ2V0SWQpKSB7XG5cdFx0XHRjb25zdCB3aWRnZXREYXRhID0gdGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdHdpZGdldERhdGEucG9zaXRpb24gPSB3aWRnZXQuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LmxheW91dEdseXBoTWFyZ2luV2lkZ2V0KHdpZGdldERhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW1vdmVHbHlwaE1hcmdpbldpZGdldCh3aWRnZXQ6IGVkaXRvckJyb3dzZXIuSUdseXBoTWFyZ2luV2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0SWQgPSB3aWRnZXQuZ2V0SWQoKTtcblx0XHRpZiAodGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldElkKSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0RGF0YSA9IHRoaXMuX2dseXBoTWFyZ2luV2lkZ2V0c1t3aWRnZXRJZF07XG5cdFx0XHRkZWxldGUgdGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LnJlbW92ZUdseXBoTWFyZ2luV2lkZ2V0KHdpZGdldERhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjaGFuZ2VWaWV3Wm9uZXMoY2FsbGJhY2s6IChhY2Nlc3NvcjogZWRpdG9yQnJvd3Nlci5JVmlld1pvbmVDaGFuZ2VBY2Nlc3NvcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcuY2hhbmdlKGNhbGxiYWNrKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUYXJnZXRBdENsaWVudFBvaW50KGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKTogZWRpdG9yQnJvd3Nlci5JTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3LmdldFRhcmdldEF0Q2xpZW50UG9pbnQoY2xpZW50WCwgY2xpZW50WSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24ocmF3UG9zaXRpb246IElQb3NpdGlvbik6IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLnZhbGlkYXRlUG9zaXRpb24ocmF3UG9zaXRpb24pO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblxuXHRcdGNvbnN0IHRvcCA9IENvZGVFZGl0b3JXaWRnZXQuX2dldFZlcnRpY2FsT2Zmc2V0Rm9yUG9zaXRpb24odGhpcy5fbW9kZWxEYXRhLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pIC0gdGhpcy5nZXRTY3JvbGxUb3AoKTtcblx0XHRjb25zdCBsZWZ0ID0gdGhpcy5fbW9kZWxEYXRhLnZpZXcuZ2V0T2Zmc2V0Rm9yQ29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikgKyBsYXlvdXRJbmZvLmdseXBoTWFyZ2luV2lkdGggKyBsYXlvdXRJbmZvLmxpbmVOdW1iZXJzV2lkdGggKyBsYXlvdXRJbmZvLmRlY29yYXRpb25zV2lkdGggLSB0aGlzLmdldFNjcm9sbExlZnQoKTtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvcDogdG9wLFxuXHRcdFx0bGVmdDogbGVmdCxcblx0XHRcdGhlaWdodFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0T2Zmc2V0Rm9yQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3LmdldE9mZnNldEZvckNvbHVtbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIGdldFdpZHRoT2ZMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXcuZ2V0TGluZVdpZHRoKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIHJlc2V0TGluZVdpZHRoQ2FjaGVzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcucmVzZXRMaW5lV2lkdGhDYWNoZXMoKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoZm9yY2VSZWRyYXc6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5iYXRjaEV2ZW50cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9tb2RlbERhdGEhLnZpZXcucmVuZGVyKHRydWUsIGZvcmNlUmVkcmF3KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXJBc3luYyhmb3JjZVJlZHJhdzogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmJhdGNoRXZlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMuX21vZGVsRGF0YSEudmlldy5yZW5kZXIoZmFsc2UsIGZvcmNlUmVkcmF3KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRBcmlhT3B0aW9ucyhvcHRpb25zOiBlZGl0b3JCcm93c2VyLklFZGl0b3JBcmlhT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcuc2V0QXJpYU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlGb250SW5mbyh0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0YXBwbHlGb250SW5mbyh0YXJnZXQsIHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0QmFubmVyKGRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCwgZG9tTm9kZUhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Jhbm5lckRvbU5vZGUgJiYgdGhpcy5fZG9tRWxlbWVudC5jb250YWlucyh0aGlzLl9iYW5uZXJEb21Ob2RlKSkge1xuXHRcdFx0dGhpcy5fYmFubmVyRG9tTm9kZS5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9iYW5uZXJEb21Ob2RlID0gZG9tTm9kZTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnNldFJlc2VydmVkSGVpZ2h0KGRvbU5vZGUgPyBkb21Ob2RlSGVpZ2h0IDogMCk7XG5cblx0XHRpZiAodGhpcy5fYmFubmVyRG9tTm9kZSkge1xuXHRcdFx0dGhpcy5fZG9tRWxlbWVudC5wcmVwZW5kKHRoaXMuX2Jhbm5lckRvbU5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfYXR0YWNoTW9kZWwobW9kZWw6IElUZXh0TW9kZWwgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWxEYXRhID0gbnVsbDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsaXN0ZW5lcnNUb1JlbW92ZTogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdFx0dGhpcy5fZG9tRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtbW9kZS1pZCcsIG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbi5zZXRJc0RvbWluYXRlZEJ5TG9uZ0xpbmVzKG1vZGVsLmlzRG9taW5hdGVkQnlMb25nTGluZXMoKSk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbi5zZXRNb2RlbExpbmVDb3VudChtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cblx0XHRjb25zdCBhdHRhY2hlZFZpZXcgPSBtb2RlbC5vbkJlZm9yZUF0dGFjaGVkKCk7XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSBuZXcgVmlld01vZGVsKFxuXHRcdFx0dGhpcy5faWQsXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRET01MaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LmNyZWF0ZShkb20uZ2V0V2luZG93KHRoaXMuX2RvbUVsZW1lbnQpKSxcblx0XHRcdE1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkuY3JlYXRlKHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucyksXG5cdFx0XHQoY2FsbGJhY2spID0+IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3codGhpcy5fZG9tRWxlbWVudCksIGNhbGxiYWNrKSxcblx0XHRcdHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHRoaXMuX3RoZW1lU2VydmljZSxcblx0XHRcdGF0dGFjaGVkVmlldyxcblx0XHRcdHtcblx0XHRcdFx0YmF0Y2hDaGFuZ2VzOiAoY2IpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYmVnaW5VcGRhdGUoKTtcblx0XHRcdFx0XHRcdHJldHVybiBjYigpO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lbmRVcGRhdGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIFNvbWVvbmUgbWlnaHQgZGVzdHJveSB0aGUgbW9kZWwgZnJvbSB1bmRlciB0aGUgZWRpdG9yLCBzbyBwcmV2ZW50IGFueSBleGNlcHRpb25zIGJ5IHNldHRpbmcgYSBudWxsIG1vZGVsXG5cdFx0bGlzdGVuZXJzVG9SZW1vdmUucHVzaChtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHRoaXMuc2V0TW9kZWwobnVsbCkpKTtcblxuXHRcdGxpc3RlbmVyc1RvUmVtb3ZlLnB1c2godmlld01vZGVsLm9uRXZlbnQoKGUpID0+IHtcblx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuQ29udGVudFNpemVDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ29udGVudFNpemVDaGFuZ2UuZmlyZShlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Gb2N1c0NoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yVGV4dEZvY3VzLnNldFZhbHVlKGUuaGFzRm9jdXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLldpZGdldEZvY3VzQ2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXRGb2N1cy5zZXRWYWx1ZShlLmhhc0ZvY3VzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5TY3JvbGxDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2Nyb2xsQ2hhbmdlLmZpcmUoZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuVmlld1pvbmVzQ2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdab25lcy5maXJlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuSGlkZGVuQXJlYXNDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGlkZGVuQXJlYXMuZmlyZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLlJlYWRPbmx5RWRpdEF0dGVtcHQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRBdHRlbXB0UmVhZE9ubHlFZGl0LmZpcmUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5DdXJzb3JTdGF0ZUNoYW5nZWQ6IHtcblx0XHRcdFx0XHRpZiAoZS5yZWFjaGVkTWF4Q3Vyc29yQ291bnQpIHtcblxuXHRcdFx0XHRcdFx0Y29uc3QgbXVsdGlDdXJzb3JMaW1pdCA9IHRoaXMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5tdWx0aUN1cnNvckxpbWl0KTtcblx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2N1cnNvcnMubWF4aW11bScsIFwiVGhlIG51bWJlciBvZiBjdXJzb3JzIGhhcyBiZWVuIGxpbWl0ZWQgdG8gezB9LiBDb25zaWRlciB1c2luZyBbZmluZCBhbmQgcmVwbGFjZV0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvY29kZWJhc2ljcyNfZmluZC1hbmQtcmVwbGFjZSkgZm9yIGxhcmdlciBjaGFuZ2VzIG9yIGluY3JlYXNlIHRoZSBlZGl0b3IgbXVsdGkgY3Vyc29yIGxpbWl0IHNldHRpbmcuXCIsIG11bHRpQ3Vyc29yTGltaXQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZSwgW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6ICdGaW5kIGFuZCBSZXBsYWNlJyxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdlZGl0b3IuYWN0aW9uLnN0YXJ0RmluZFJlcGxhY2VBY3Rpb24nKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdnb1RvU2V0dGluZycsICdJbmNyZWFzZSBNdWx0aSBDdXJzb3IgTGltaXQnKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5nczInLCB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHF1ZXJ5OiAnZWRpdG9yLm11bHRpQ3Vyc29yTGltaXQnXG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uczogUG9zaXRpb25bXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBlLnNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uc1tpXSA9IGUuc2VsZWN0aW9uc1tpXS5nZXRQb3NpdGlvbigpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGUxOiBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogcG9zaXRpb25zWzBdLFxuXHRcdFx0XHRcdFx0c2Vjb25kYXJ5UG9zaXRpb25zOiBwb3NpdGlvbnMuc2xpY2UoMSksXG5cdFx0XHRcdFx0XHRyZWFzb246IGUucmVhc29uLFxuXHRcdFx0XHRcdFx0c291cmNlOiBlLnNvdXJjZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbi5maXJlKGUxKTtcblxuXHRcdFx0XHRcdGNvbnN0IGUyOiBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50ID0ge1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uOiBlLnNlbGVjdGlvbnNbMF0sXG5cdFx0XHRcdFx0XHRzZWNvbmRhcnlTZWxlY3Rpb25zOiBlLnNlbGVjdGlvbnMuc2xpY2UoMSksXG5cdFx0XHRcdFx0XHRtb2RlbFZlcnNpb25JZDogZS5tb2RlbFZlcnNpb25JZCxcblx0XHRcdFx0XHRcdG9sZFNlbGVjdGlvbnM6IGUub2xkU2VsZWN0aW9ucyxcblx0XHRcdFx0XHRcdG9sZE1vZGVsVmVyc2lvbklkOiBlLm9sZE1vZGVsVmVyc2lvbklkLFxuXHRcdFx0XHRcdFx0c291cmNlOiBlLnNvdXJjZSxcblx0XHRcdFx0XHRcdHJlYXNvbjogZS5yZWFzb25cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uLmZpcmUoZTIpO1xuXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Nb2RlbERlY29yYXRpb25zQ2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMuZmlyZShlLmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Nb2RlbExhbmd1YWdlQ2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9kb21FbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1tb2RlLWlkJywgbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UuZmlyZShlLmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Nb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbi5maXJlKGUuZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLk1vZGVsQ29udGVudENoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbENvbnRlbnQuZmlyZShlLmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Nb2RlbE9wdGlvbnNDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxPcHRpb25zLmZpcmUoZS5ldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuTW9kZWxUb2tlbnNDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxUb2tlbnMuZmlyZShlLmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Nb2RlbExpbmVIZWlnaHRDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGluZUhlaWdodC5maXJlKGUuZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLk1vZGVsRm9udENoYW5nZWRFdmVudDpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZvbnQuZmlyZShlLmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBbdmlldywgaGFzUmVhbFZpZXddID0gdGhpcy5fY3JlYXRlVmlldyh2aWV3TW9kZWwpO1xuXHRcdGlmIChoYXNSZWFsVmlldykge1xuXHRcdFx0dGhpcy5fZG9tRWxlbWVudC5hcHBlbmRDaGlsZCh2aWV3LmRvbU5vZGUuZG9tTm9kZSk7XG5cblx0XHRcdGxldCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fY29udGVudFdpZGdldHMpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGtleXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0SWQgPSBrZXlzW2ldO1xuXHRcdFx0XHR2aWV3LmFkZENvbnRlbnRXaWRnZXQodGhpcy5fY29udGVudFdpZGdldHNbd2lkZ2V0SWRdKTtcblx0XHRcdH1cblxuXHRcdFx0a2V5cyA9IE9iamVjdC5rZXlzKHRoaXMuX292ZXJsYXlXaWRnZXRzKTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBrZXlzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldElkID0ga2V5c1tpXTtcblx0XHRcdFx0dmlldy5hZGRPdmVybGF5V2lkZ2V0KHRoaXMuX292ZXJsYXlXaWRnZXRzW3dpZGdldElkXSk7XG5cdFx0XHR9XG5cblx0XHRcdGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl9nbHlwaE1hcmdpbldpZGdldHMpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGtleXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0SWQgPSBrZXlzW2ldO1xuXHRcdFx0XHR2aWV3LmFkZEdseXBoTWFyZ2luV2lkZ2V0KHRoaXMuX2dseXBoTWFyZ2luV2lkZ2V0c1t3aWRnZXRJZF0pO1xuXHRcdFx0fVxuXG5cdFx0XHR2aWV3LnJlbmRlcihmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR2aWV3LmRvbU5vZGUuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2RhdGEtdXJpJywgbW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHQvLyBDb25uZWN0IGNsaXBib2FyZCBldmVudHMgZnJvbSBWaWV3XG5cdFx0XHRsaXN0ZW5lcnNUb1JlbW92ZS5wdXNoKHZpZXcub25XaWxsQ29weShlID0+IHRoaXMuX29uV2lsbENvcHkuZmlyZShlKSkpO1xuXHRcdFx0bGlzdGVuZXJzVG9SZW1vdmUucHVzaCh2aWV3Lm9uV2lsbEN1dChlID0+IHRoaXMuX29uV2lsbEN1dC5maXJlKGUpKSk7XG5cdFx0XHRsaXN0ZW5lcnNUb1JlbW92ZS5wdXNoKHZpZXcub25XaWxsUGFzdGUoZSA9PiB0aGlzLl9vbldpbGxQYXN0ZS5maXJlKGUpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbW9kZWxEYXRhID0gbmV3IE1vZGVsRGF0YShtb2RlbCwgdmlld01vZGVsLCB2aWV3LCBoYXNSZWFsVmlldywgbGlzdGVuZXJzVG9SZW1vdmUsIGF0dGFjaGVkVmlldyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZVZpZXcodmlld01vZGVsOiBWaWV3TW9kZWwpOiBbVmlldywgYm9vbGVhbl0ge1xuXHRcdGxldCBjb21tYW5kRGVsZWdhdGU6IElDb21tYW5kRGVsZWdhdGU7XG5cdFx0aWYgKHRoaXMuaXNTaW1wbGVXaWRnZXQpIHtcblx0XHRcdGNvbW1hbmREZWxlZ2F0ZSA9IHtcblx0XHRcdFx0cGFzdGU6ICh0ZXh0OiBzdHJpbmcsIHBhc3RlT25OZXdMaW5lOiBib29sZWFuLCBtdWx0aWN1cnNvclRleHQ6IHN0cmluZ1tdIHwgbnVsbCwgbW9kZTogc3RyaW5nIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Bhc3RlKCdrZXlib2FyZCcsIHRleHQsIHBhc3RlT25OZXdMaW5lLCBtdWx0aWN1cnNvclRleHQsIG1vZGUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0eXBlOiAodGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fdHlwZSgna2V5Ym9hcmQnLCB0ZXh0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcG9zaXRpb25UeXBlOiAodGV4dDogc3RyaW5nLCByZXBsYWNlUHJldkNoYXJDbnQ6IG51bWJlciwgcmVwbGFjZU5leHRDaGFyQ250OiBudW1iZXIsIHBvc2l0aW9uRGVsdGE6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbXBvc2l0aW9uVHlwZSgna2V5Ym9hcmQnLCB0ZXh0LCByZXBsYWNlUHJldkNoYXJDbnQsIHJlcGxhY2VOZXh0Q2hhckNudCwgcG9zaXRpb25EZWx0YSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN0YXJ0Q29tcG9zaXRpb246ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuZENvbXBvc2l0aW9uOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1dDogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2N1dCgna2V5Ym9hcmQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29tbWFuZERlbGVnYXRlID0ge1xuXHRcdFx0XHRwYXN0ZTogKHRleHQ6IHN0cmluZywgcGFzdGVPbk5ld0xpbmU6IGJvb2xlYW4sIG11bHRpY3Vyc29yVGV4dDogc3RyaW5nW10gfCBudWxsLCBtb2RlOiBzdHJpbmcgfCBudWxsKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGF5bG9hZDogZWRpdG9yQnJvd3Nlci5QYXN0ZVBheWxvYWQgPSB7IHRleHQsIHBhc3RlT25OZXdMaW5lLCBtdWx0aWN1cnNvclRleHQsIG1vZGUgfTtcblx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChlZGl0b3JDb21tb24uSGFuZGxlci5QYXN0ZSwgcGF5bG9hZCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR5cGU6ICh0ZXh0OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwYXlsb2FkOiBlZGl0b3JDb21tb24uVHlwZVBheWxvYWQgPSB7IHRleHQgfTtcblx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChlZGl0b3JDb21tb24uSGFuZGxlci5UeXBlLCBwYXlsb2FkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcG9zaXRpb25UeXBlOiAodGV4dDogc3RyaW5nLCByZXBsYWNlUHJldkNoYXJDbnQ6IG51bWJlciwgcmVwbGFjZU5leHRDaGFyQ250OiBudW1iZXIsIHBvc2l0aW9uRGVsdGE6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdC8vIFRyeSBpZiBwb3NzaWJsZSB0byBnbyB0aHJvdWdoIHRoZSBleGlzdGluZyBgcmVwbGFjZVByZXZpb3VzQ2hhcmAgY29tbWFuZFxuXHRcdFx0XHRcdGlmIChyZXBsYWNlTmV4dENoYXJDbnQgfHwgcG9zaXRpb25EZWx0YSkge1xuXHRcdFx0XHRcdFx0Ly8gbXVzdCBiZSBoYW5kbGVkIHRocm91Z2ggdGhlIG5ldyBjb21tYW5kXG5cdFx0XHRcdFx0XHRjb25zdCBwYXlsb2FkOiBlZGl0b3JDb21tb24uQ29tcG9zaXRpb25UeXBlUGF5bG9hZCA9IHsgdGV4dCwgcmVwbGFjZVByZXZDaGFyQ250LCByZXBsYWNlTmV4dENoYXJDbnQsIHBvc2l0aW9uRGVsdGEgfTtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGVkaXRvckNvbW1vbi5IYW5kbGVyLkNvbXBvc2l0aW9uVHlwZSwgcGF5bG9hZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBheWxvYWQ6IGVkaXRvckNvbW1vbi5SZXBsYWNlUHJldmlvdXNDaGFyUGF5bG9hZCA9IHsgdGV4dCwgcmVwbGFjZUNoYXJDbnQ6IHJlcGxhY2VQcmV2Q2hhckNudCB9O1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZWRpdG9yQ29tbW9uLkhhbmRsZXIuUmVwbGFjZVByZXZpb3VzQ2hhciwgcGF5bG9hZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdGFydENvbXBvc2l0aW9uOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZWRpdG9yQ29tbW9uLkhhbmRsZXIuQ29tcG9zaXRpb25TdGFydCwge30pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmRDb21wb3NpdGlvbjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGVkaXRvckNvbW1vbi5IYW5kbGVyLkNvbXBvc2l0aW9uRW5kLCB7fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1dDogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGVkaXRvckNvbW1vbi5IYW5kbGVyLkN1dCwge30pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdVc2VySW5wdXRFdmVudHMgPSBuZXcgVmlld1VzZXJJbnB1dEV2ZW50cyh2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdHZpZXdVc2VySW5wdXRFdmVudHMub25LZXlEb3duID0gKGUpID0+IHRoaXMuX29uS2V5RG93bi5maXJlKGUpO1xuXHRcdHZpZXdVc2VySW5wdXRFdmVudHMub25LZXlVcCA9IChlKSA9PiB0aGlzLl9vbktleVVwLmZpcmUoZSk7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbkNvbnRleHRNZW51ID0gKGUpID0+IHRoaXMuX29uQ29udGV4dE1lbnUuZmlyZShlKTtcblx0XHR2aWV3VXNlcklucHV0RXZlbnRzLm9uTW91c2VNb3ZlID0gKGUpID0+IHRoaXMuX29uTW91c2VNb3ZlLmZpcmUoZSk7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbk1vdXNlTGVhdmUgPSAoZSkgPT4gdGhpcy5fb25Nb3VzZUxlYXZlLmZpcmUoZSk7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbk1vdXNlRG93biA9IChlKSA9PiB0aGlzLl9vbk1vdXNlRG93bi5maXJlKGUpO1xuXHRcdHZpZXdVc2VySW5wdXRFdmVudHMub25Nb3VzZVVwID0gKGUpID0+IHRoaXMuX29uTW91c2VVcC5maXJlKGUpO1xuXHRcdHZpZXdVc2VySW5wdXRFdmVudHMub25Nb3VzZURyYWcgPSAoZSkgPT4gdGhpcy5fb25Nb3VzZURyYWcuZmlyZShlKTtcblx0XHR2aWV3VXNlcklucHV0RXZlbnRzLm9uTW91c2VEcm9wID0gKGUpID0+IHRoaXMuX29uTW91c2VEcm9wLmZpcmUoZSk7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbk1vdXNlRHJvcENhbmNlbGVkID0gKGUpID0+IHRoaXMuX29uTW91c2VEcm9wQ2FuY2VsZWQuZmlyZShlKTtcblx0XHR2aWV3VXNlcklucHV0RXZlbnRzLm9uTW91c2VXaGVlbCA9IChlKSA9PiB0aGlzLl9vbk1vdXNlV2hlZWwuZmlyZShlKTtcblxuXHRcdGNvbnN0IHZpZXcgPSBuZXcgVmlldyhcblx0XHRcdHRoaXMuX2RvbUVsZW1lbnQsXG5cdFx0XHR0aGlzLmdldElkKCksXG5cdFx0XHRjb21tYW5kRGVsZWdhdGUsXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLFxuXHRcdFx0dGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSxcblx0XHRcdHZpZXdNb2RlbCxcblx0XHRcdHZpZXdVc2VySW5wdXRFdmVudHMsXG5cdFx0XHR0aGlzLl9vdmVyZmxvd1dpZGdldHNEb21Ob2RlLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHR0aGlzLl91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHRyZXR1cm4gW3ZpZXcsIHRydWVdO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9wb3N0RGV0YWNoTW9kZWxDbGVhbnVwKGRldGFjaGVkTW9kZWw6IElUZXh0TW9kZWwgfCBudWxsKTogdm9pZCB7XG5cdFx0ZGV0YWNoZWRNb2RlbD8ucmVtb3ZlQWxsRGVjb3JhdGlvbnNXaXRoT3duZXJJZCh0aGlzLl9pZCk7XG5cdH1cblxuXHRwcml2YXRlIF9kZXRhY2hNb2RlbCgpOiBJVGV4dE1vZGVsIHwgbnVsbCB7XG5cdFx0dGhpcy5fY29udHJpYnV0aW9uc0Rpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jb250cmlidXRpb25zRGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxEYXRhLm1vZGVsO1xuXHRcdGNvbnN0IHJlbW92ZURvbU5vZGUgPSB0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcgPyB0aGlzLl9tb2RlbERhdGEudmlldy5kb21Ob2RlLmRvbU5vZGUgOiBudWxsO1xuXG5cdFx0dGhpcy5fbW9kZWxEYXRhLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tb2RlbERhdGEgPSBudWxsO1xuXG5cdFx0dGhpcy5fZG9tRWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2RhdGEtbW9kZS1pZCcpO1xuXHRcdGlmIChyZW1vdmVEb21Ob2RlICYmIHRoaXMuX2RvbUVsZW1lbnQuY29udGFpbnMocmVtb3ZlRG9tTm9kZSkpIHtcblx0XHRcdHJlbW92ZURvbU5vZGUucmVtb3ZlKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9iYW5uZXJEb21Ob2RlICYmIHRoaXMuX2RvbUVsZW1lbnQuY29udGFpbnModGhpcy5fYmFubmVyRG9tTm9kZSkpIHtcblx0XHRcdHRoaXMuX2Jhbm5lckRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRGVjb3JhdGlvblR5cGUoZGVzY3JpcHRpb246IHN0cmluZywga2V5OiBzdHJpbmcsIG9wdGlvbnM6IGVkaXRvckNvbW1vbi5JRGVjb3JhdGlvblJlbmRlck9wdGlvbnMsIHBhcmVudFR5cGVLZXk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKGRlc2NyaXB0aW9uLCBrZXksIG9wdGlvbnMsIHBhcmVudFR5cGVLZXksIHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRGVjb3JhdGlvblR5cGUoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5yZW1vdmVEZWNvcmF0aW9uVHlwZShrZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZURlY29yYXRpb25PcHRpb25zKHR5cGVLZXk6IHN0cmluZywgd3JpdGFibGU6IGJvb2xlYW4pOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnJlc29sdmVEZWNvcmF0aW9uT3B0aW9ucyh0eXBlS2V5LCB3cml0YWJsZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGVsZW1ldHJ5RGF0YSgpOiBvYmplY3QgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90ZWxlbWV0cnlEYXRhO1xuXHR9XG5cblx0cHVibGljIGhhc01vZGVsKCk6IHRoaXMgaXMgZWRpdG9yQnJvd3Nlci5JQWN0aXZlQ29kZUVkaXRvciB7XG5cdFx0cmV0dXJuICh0aGlzLl9tb2RlbERhdGEgIT09IG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93RHJvcEluZGljYXRvckF0KHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSxcblx0XHRcdG9wdGlvbnM6IENvZGVFZGl0b3JXaWRnZXQuZHJvcEludG9FZGl0b3JEZWNvcmF0aW9uT3B0aW9uc1xuXHRcdH1dO1xuXG5cdFx0dGhpcy5fZHJvcEludG9FZGl0b3JEZWNvcmF0aW9ucy5zZXQobmV3RGVjb3JhdGlvbnMpO1xuXHRcdHRoaXMucmV2ZWFsUG9zaXRpb24ocG9zaXRpb24sIGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZURyb3BJbmRpY2F0b3IoKTogdm9pZCB7XG5cdFx0dGhpcy5fZHJvcEludG9FZGl0b3JEZWNvcmF0aW9ucy5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljIHNldENvbnRleHRWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IENvbnRleHRLZXlWYWx1ZSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShrZXksIHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2JlZ2luVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50ZXIrKztcblx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnRlciA9PT0gMSkge1xuXHRcdFx0dGhpcy5fb25CZWdpblVwZGF0ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5kVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50ZXItLTtcblx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnRlciA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb25FbmRVcGRhdGUuZmlyZSgpO1xuXHRcdH1cblx0fVxufVxuXG5sZXQgRURJVE9SX0lEID0gMDtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMge1xuXHQvKipcblx0ICogSXMgdGhpcyBhIHNpbXBsZSB3aWRnZXQgKG5vdCBhIHJlYWwgY29kZSBlZGl0b3IpP1xuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGlzU2ltcGxlV2lkZ2V0PzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJpYnV0aW9ucyB0byBpbnN0YW50aWF0ZS5cblx0ICogV2hlbiBwcm92aWRlZCwgb25seSB0aGUgY29udHJpYnV0aW9ucyBpbmNsdWRlZCB3aWxsIGJlIGluc3RhbnRpYXRlZC5cblx0ICogVG8gaW5jbHVkZSB0aGUgZGVmYXVsdHMsIHRob3NlIG11c3QgYmUgcHJvdmlkZWQgYXMgd2VsbCB2aWEgWy4uLkVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKCldXG5cdCAqIERlZmF1bHRzIHRvIEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKCkuXG5cdCAqL1xuXHRjb250cmlidXRpb25zPzogSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uW107XG5cblx0LyoqXG5cdCAqIFRlbGVtZXRyeSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGlzIENvZGVFZGl0b3JXaWRnZXQuXG5cdCAqIERlZmF1bHRzIHRvIG51bGwuXG5cdCAqL1xuXHR0ZWxlbWV0cnlEYXRhPzogb2JqZWN0O1xuXG5cdC8qKlxuXHQgKiBUaGUgSUQgb2YgdGhlIGNvbnRleHQgbWVudS5cblx0ICogRGVmYXVsdHMgdG8gTWVudUlkLlNpbXBsZUVkaXRvckNvbnRleHQgb3IgTWVudUlkLkVkaXRvckNvbnRleHQgZGVwZW5kaW5nIG9uIHdoZXRoZXIgdGhlIHdpZGdldCBpcyBzaW1wbGUuXG5cdCAqL1xuXHRjb250ZXh0TWVudUlkPzogTWVudUlkO1xuXG5cdC8qKlxuXHQgKiBEZWZpbmUgZXh0cmEgY29udGV4dCBrZXlzIHRoYXQgd2lsbCBiZSBkZWZpbmVkIGluIHRoZSBjb250ZXh0IHNlcnZpY2Vcblx0ICogZm9yIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRjb250ZXh0S2V5VmFsdWVzPzogUmVjb3JkPHN0cmluZywgQ29udGV4dEtleVZhbHVlPjtcbn1cblxuY2xhc3MgTW9kZWxEYXRhIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSB2aWV3TW9kZWw6IFZpZXdNb2RlbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlldzogVmlldyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGFzUmVhbFZpZXc6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpc3RlbmVyc1RvUmVtb3ZlOiBJRGlzcG9zYWJsZVtdLFxuXHRcdHB1YmxpYyByZWFkb25seSBhdHRhY2hlZFZpZXc6IElBdHRhY2hlZFZpZXcsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLmxpc3RlbmVyc1RvUmVtb3ZlKTtcblx0XHR0aGlzLm1vZGVsLm9uQmVmb3JlRGV0YWNoZWQodGhpcy5hdHRhY2hlZFZpZXcpO1xuXHRcdGlmICh0aGlzLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHR0aGlzLnZpZXcuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLnZpZXdNb2RlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBCb29sZWFuRXZlbnRWYWx1ZSB7XG5cdE5vdFNldCxcblx0RmFsc2UsXG5cdFRydWVcbn1cblxuZXhwb3J0IGNsYXNzIEJvb2xlYW5FdmVudEVtaXR0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUb1RydWU6IEVtaXR0ZXI8dm9pZD47XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVRvVHJ1ZTogRXZlbnQ8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUb0ZhbHNlOiBFbWl0dGVyPHZvaWQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VUb0ZhbHNlOiBFdmVudDx2b2lkPjtcblxuXHRwcml2YXRlIF92YWx1ZTogQm9vbGVhbkV2ZW50VmFsdWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZW1pdHRlck9wdGlvbnM6IEVtaXR0ZXJPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUb1RydWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPih0aGlzLl9lbWl0dGVyT3B0aW9ucykpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VUb1RydWUgPSB0aGlzLl9vbkRpZENoYW5nZVRvVHJ1ZS5ldmVudDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRvRmFsc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPih0aGlzLl9lbWl0dGVyT3B0aW9ucykpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VUb0ZhbHNlID0gdGhpcy5fb25EaWRDaGFuZ2VUb0ZhbHNlLmV2ZW50O1xuXHRcdHRoaXMuX3ZhbHVlID0gQm9vbGVhbkV2ZW50VmFsdWUuTm90U2V0O1xuXHR9XG5cblx0cHVibGljIHNldFZhbHVlKF92YWx1ZTogYm9vbGVhbikge1xuXHRcdGNvbnN0IHZhbHVlID0gKF92YWx1ZSA/IEJvb2xlYW5FdmVudFZhbHVlLlRydWUgOiBCb29sZWFuRXZlbnRWYWx1ZS5GYWxzZSk7XG5cdFx0aWYgKHRoaXMuX3ZhbHVlID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdGlmICh0aGlzLl92YWx1ZSA9PT0gQm9vbGVhbkV2ZW50VmFsdWUuVHJ1ZSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUb1RydWUuZmlyZSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fdmFsdWUgPT09IEJvb2xlYW5FdmVudFZhbHVlLkZhbHNlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRvRmFsc2UuZmlyZSgpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEEgcmVndWxhciBldmVudCBlbWl0dGVyIHRoYXQgYWxzbyBtYWtlcyBzdXJlIGNvbnRyaWJ1dGlvbnMgYXJlIGluc3RhbnRpYXRlZCBpZiBuZWNlc3NhcnlcbiAqL1xuY2xhc3MgSW50ZXJhY3Rpb25FbWl0dGVyPFQ+IGV4dGVuZHMgRW1pdHRlcjxUPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0aW9uczogQ29kZUVkaXRvckNvbnRyaWJ1dGlvbnMsXG5cdFx0ZGVsaXZlcnlRdWV1ZTogRXZlbnREZWxpdmVyeVF1ZXVlXG5cdCkge1xuXHRcdHN1cGVyKHsgZGVsaXZlcnlRdWV1ZSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGZpcmUoZXZlbnQ6IFQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250cmlidXRpb25zLm9uQmVmb3JlSW50ZXJhY3Rpb25FdmVudCgpO1xuXHRcdHN1cGVyLmZpcmUoZXZlbnQpO1xuXHR9XG59XG5cbmNsYXNzIEVkaXRvckNvbnRleHRLZXlzTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2ltcGxlSW5wdXQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRJbnB1dEZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yVGV4dEZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFiTW92ZXNGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlYWRvbmx5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5EaWZmRWRpdG9yOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yQ29sdW1uU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzTXVsdGlwbGVTZWxlY3Rpb25zOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzTm9uRW1wdHlTZWxlY3Rpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5VbmRvOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FuUmVkbzogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnZWRpdG9ySWQnLCBlZGl0b3IuZ2V0SWQoKSk7XG5cblx0XHR0aGlzLl9lZGl0b3JTaW1wbGVJbnB1dCA9IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclNpbXBsZUlucHV0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZWRpdG9yRm9jdXMgPSBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3RleHRJbnB1dEZvY3VzID0gRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9lZGl0b3JUZXh0Rm9jdXMgPSBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl90YWJNb3Zlc0ZvY3VzID0gRWRpdG9yQ29udGV4dEtleXMudGFiTW92ZXNGb2N1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2VkaXRvclJlYWRvbmx5ID0gRWRpdG9yQ29udGV4dEtleXMucmVhZE9ubHkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9pbkRpZmZFZGl0b3IgPSBFZGl0b3JDb250ZXh0S2V5cy5pbkRpZmZFZGl0b3IuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9lZGl0b3JDb2x1bW5TZWxlY3Rpb24gPSBFZGl0b3JDb250ZXh0S2V5cy5jb2x1bW5TZWxlY3Rpb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNNdWx0aXBsZVNlbGVjdGlvbnMgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZVNlbGVjdGlvbnMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNOb25FbXB0eVNlbGVjdGlvbiA9IEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY2FuVW5kbyA9IEVkaXRvckNvbnRleHRLZXlzLmNhblVuZG8uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jYW5SZWRvID0gRWRpdG9yQ29udGV4dEtleXMuY2FuUmVkby5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoKSA9PiB0aGlzLl91cGRhdGVGcm9tQ29uZmlnKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKCkgPT4gdGhpcy5fdXBkYXRlRnJvbVNlbGVjdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4gdGhpcy5fdXBkYXRlRnJvbUZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMuX3VwZGF0ZUZyb21Gb2N1cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHRoaXMuX3VwZGF0ZUZyb21Gb2N1cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQmx1ckVkaXRvclRleHQoKCkgPT4gdGhpcy5fdXBkYXRlRnJvbUZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLl91cGRhdGVGcm9tTW9kZWwoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKCkgPT4gdGhpcy5fdXBkYXRlRnJvbU1vZGVsKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihUYWJGb2N1cy5vbkRpZENoYW5nZVRhYkZvY3VzKCh0YWJGb2N1c01vZGU6IGJvb2xlYW4pID0+IHRoaXMuX3RhYk1vdmVzRm9jdXMuc2V0KHRhYkZvY3VzTW9kZSkpKTtcblxuXHRcdHRoaXMuX3VwZGF0ZUZyb21Db25maWcoKTtcblx0XHR0aGlzLl91cGRhdGVGcm9tU2VsZWN0aW9uKCk7XG5cdFx0dGhpcy5fdXBkYXRlRnJvbUZvY3VzKCk7XG5cdFx0dGhpcy5fdXBkYXRlRnJvbU1vZGVsKCk7XG5cblx0XHR0aGlzLl9lZGl0b3JTaW1wbGVJbnB1dC5zZXQodGhpcy5fZWRpdG9yLmlzU2ltcGxlV2lkZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZyb21Db25maWcoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb25zKCk7XG5cblx0XHR0aGlzLl90YWJNb3Zlc0ZvY3VzLnNldChvcHRpb25zLmdldChFZGl0b3JPcHRpb24udGFiRm9jdXNNb2RlKSB8fCBUYWJGb2N1cy5nZXRUYWJGb2N1c01vZGUoKSk7XG5cdFx0dGhpcy5fZWRpdG9yUmVhZG9ubHkuc2V0KG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZWFkT25seSkpO1xuXHRcdHRoaXMuX2luRGlmZkVkaXRvci5zZXQob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmluRGlmZkVkaXRvcikpO1xuXHRcdHRoaXMuX2VkaXRvckNvbHVtblNlbGVjdGlvbi5zZXQob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmNvbHVtblNlbGVjdGlvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRnJvbVNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoIXNlbGVjdGlvbnMpIHtcblx0XHRcdHRoaXMuX2hhc011bHRpcGxlU2VsZWN0aW9ucy5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzTm9uRW1wdHlTZWxlY3Rpb24ucmVzZXQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faGFzTXVsdGlwbGVTZWxlY3Rpb25zLnNldChzZWxlY3Rpb25zLmxlbmd0aCA+IDEpO1xuXHRcdFx0dGhpcy5faGFzTm9uRW1wdHlTZWxlY3Rpb24uc2V0KHNlbGVjdGlvbnMuc29tZShzID0+ICFzLmlzRW1wdHkoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZyb21Gb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JGb2N1cy5zZXQodGhpcy5fZWRpdG9yLmhhc1dpZGdldEZvY3VzKCkgJiYgIXRoaXMuX2VkaXRvci5pc1NpbXBsZVdpZGdldCk7XG5cdFx0dGhpcy5fZWRpdG9yVGV4dEZvY3VzLnNldCh0aGlzLl9lZGl0b3IuaGFzVGV4dEZvY3VzKCkgJiYgIXRoaXMuX2VkaXRvci5pc1NpbXBsZVdpZGdldCk7XG5cdFx0dGhpcy5fdGV4dElucHV0Rm9jdXMuc2V0KHRoaXMuX2VkaXRvci5oYXNUZXh0Rm9jdXMoKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVGcm9tTW9kZWwoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHR0aGlzLl9jYW5VbmRvLnNldChCb29sZWFuKG1vZGVsICYmIG1vZGVsLmNhblVuZG8oKSkpO1xuXHRcdHRoaXMuX2NhblJlZG8uc2V0KEJvb2xlYW4obW9kZWwgJiYgbW9kZWwuY2FuUmVkbygpKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvck1vZGVDb250ZXh0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ0lkOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNDb21wbGV0aW9uSXRlbVByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzQ29kZUFjdGlvbnNQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0NvZGVMZW5zUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNEZWZpbml0aW9uUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNEZWNsYXJhdGlvblByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzSW1wbGVtZW50YXRpb25Qcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1R5cGVEZWZpbml0aW9uUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNIb3ZlclByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0RvY3VtZW50U3ltYm9sUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNSZWZlcmVuY2VQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1JlbmFtZVByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNEb2N1bWVudFNlbGVjdGlvbkZvcm1hdHRpbmdQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc011bHRpcGxlRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNNdWx0aXBsZURvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzU2lnbmF0dXJlSGVscFByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzSW5sYXlIaW50c1Byb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNJbkVtYmVkZGVkRWRpdG9yOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fbGFuZ0lkID0gRWRpdG9yQ29udGV4dEtleXMubGFuZ3VhZ2VJZC5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNDb21wbGV0aW9uSXRlbVByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzQ29tcGxldGlvbkl0ZW1Qcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNDb2RlQWN0aW9uc1Byb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzQ29kZUFjdGlvbnNQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNDb2RlTGVuc1Byb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzQ29kZUxlbnNQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNEZWZpbml0aW9uUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNEZWZpbml0aW9uUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzRGVjbGFyYXRpb25Qcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0RlY2xhcmF0aW9uUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzSW1wbGVtZW50YXRpb25Qcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0ltcGxlbWVudGF0aW9uUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzVHlwZURlZmluaXRpb25Qcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc1R5cGVEZWZpbml0aW9uUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzSG92ZXJQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0hvdmVyUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0RvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzRG9jdW1lbnRTeW1ib2xQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0RvY3VtZW50U3ltYm9sUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzUmVmZXJlbmNlUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNSZWZlcmVuY2VQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNSZW5hbWVQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc1JlbmFtZVByb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc1NpZ25hdHVyZUhlbHBQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc1NpZ25hdHVyZUhlbHBQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNJbmxheUhpbnRzUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNJbmxheUhpbnRzUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNEb2N1bWVudFNlbGVjdGlvbkZvcm1hdHRpbmdQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0RvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc011bHRpcGxlRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZURvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc011bHRpcGxlRG9jdW1lbnRTZWxlY3Rpb25Gb3JtYXR0aW5nUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZURvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2lzSW5FbWJlZGRlZEVkaXRvciA9IEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHRoaXMuX3VwZGF0ZSgpO1xuXG5cdFx0Ly8gdXBkYXRlIHdoZW4gbW9kZWwvbW9kZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKHVwZGF0ZSkpO1xuXG5cdFx0Ly8gdXBkYXRlIHdoZW4gcmVnaXN0cmllcyBjaGFuZ2Vcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlQWN0aW9uUHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVMZW5zUHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVjbGFyYXRpb25Qcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW1wbGVtZW50YXRpb25Qcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UudHlwZURlZmluaXRpb25Qcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaG92ZXJQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5zaWduYXR1cmVIZWxwUHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGF5SGludHNQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblxuXHRcdHVwZGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRyZXNldCgpIHtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFuZ0lkLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNDb21wbGV0aW9uSXRlbVByb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNDb2RlQWN0aW9uc1Byb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNDb2RlTGVuc1Byb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNEZWZpbml0aW9uUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0RlY2xhcmF0aW9uUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0ltcGxlbWVudGF0aW9uUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc1R5cGVEZWZpbml0aW9uUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0hvdmVyUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0RvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0RvY3VtZW50U3ltYm9sUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc1JlZmVyZW5jZVByb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNSZW5hbWVQcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0RvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNTaWduYXR1cmVIZWxwUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2lzSW5FbWJlZGRlZEVkaXRvci5yZXNldCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCkge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5yZXNldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFuZ0lkLnNldChtb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdFx0dGhpcy5faGFzQ29tcGxldGlvbkl0ZW1Qcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzQ29kZUFjdGlvbnNQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzQ29kZUxlbnNQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc0RlZmluaXRpb25Qcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzRGVjbGFyYXRpb25Qcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVjbGFyYXRpb25Qcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc0ltcGxlbWVudGF0aW9uUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmltcGxlbWVudGF0aW9uUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNUeXBlRGVmaW5pdGlvblByb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS50eXBlRGVmaW5pdGlvblByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzSG92ZXJQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaG92ZXJQcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc0RvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNEb2N1bWVudFN5bWJvbFByb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzUmVmZXJlbmNlUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzUmVuYW1lUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzU2lnbmF0dXJlSGVscFByb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5zaWduYXR1cmVIZWxwUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNJbmxheUhpbnRzUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGF5SGludHNQcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc0RvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIuaGFzKG1vZGVsKSB8fCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc0RvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc011bHRpcGxlRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5hbGwobW9kZWwpLmxlbmd0aCArIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLmFsbChtb2RlbCkubGVuZ3RoID4gMSk7XG5cdFx0XHR0aGlzLl9oYXNNdWx0aXBsZURvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5hbGwobW9kZWwpLmxlbmd0aCA+IDEpO1xuXHRcdFx0dGhpcy5faXNJbkVtYmVkZGVkRWRpdG9yLnNldChtb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLndhbGtUaHJvdWdoU25pcHBldCB8fCBtb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZUNoYXRDb2RlQmxvY2spO1xuXHRcdH0pO1xuXHR9XG59XG5cblxuY2xhc3MgRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIGltcGxlbWVudHMgZWRpdG9yQ29tbW9uLklFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24ge1xuXG5cdHByaXZhdGUgX2RlY29yYXRpb25JZHM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX2lzQ2hhbmdpbmdEZWNvcmF0aW9uczogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHB1YmxpYyBnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25JZHMubGVuZ3RoO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBlZGl0b3JCcm93c2VyLklDb2RlRWRpdG9yLFxuXHRcdGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShkZWNvcmF0aW9ucykgJiYgZGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5zZXQoZGVjb3JhdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvbkRpZENoYW5nZShsaXN0ZW5lcjogKGU6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50KSA9PiB1bmtub3duLCB0aGlzQXJncz86IHVua25vd24sIGRpc3Bvc2FibGVzPzogSURpc3Bvc2FibGVbXSB8IERpc3Bvc2FibGVTdG9yZSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9ucygoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzQ2hhbmdpbmdEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsaXN0ZW5lci5jYWxsKHRoaXNBcmdzLCBlKTtcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmFuZ2UoaW5kZXg6IG51bWJlcik6IFJhbmdlIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChpbmRleCA+PSB0aGlzLl9kZWNvcmF0aW9uSWRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS5nZXREZWNvcmF0aW9uUmFuZ2UodGhpcy5fZGVjb3JhdGlvbklkc1tpbmRleF0pO1xuXHR9XG5cblx0cHVibGljIGdldFJhbmdlcygpOiBSYW5nZVtdIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBSYW5nZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uSWQgb2YgdGhpcy5fZGVjb3JhdGlvbklkcykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoZGVjb3JhdGlvbklkKTtcblx0XHRcdGlmIChyYW5nZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChyYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgaGFzKGRlY29yYXRpb246IElNb2RlbERlY29yYXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbklkcy5pbmNsdWRlcyhkZWNvcmF0aW9uLmlkKTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGVjb3JhdGlvbklkcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZXQoW10pO1xuXHR9XG5cblx0cHVibGljIHNldChuZXdEZWNvcmF0aW9uczogcmVhZG9ubHkgSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10pOiBzdHJpbmdbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzQ2hhbmdpbmdEZWNvcmF0aW9ucyA9IHRydWU7XG5cdFx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25JZHMgPSBhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMuX2RlY29yYXRpb25JZHMsIG5ld0RlY29yYXRpb25zKTtcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc0NoYW5naW5nRGVjb3JhdGlvbnMgPSBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25JZHM7XG5cdH1cblxuXHRwdWJsaWMgYXBwZW5kKG5ld0RlY29yYXRpb25zOiByZWFkb25seSBJTW9kZWxEZWx0YURlY29yYXRpb25bXSk6IHN0cmluZ1tdIHtcblx0XHRsZXQgbmV3RGVjb3JhdGlvbklkczogc3RyaW5nW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faXNDaGFuZ2luZ0RlY29yYXRpb25zID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0bmV3RGVjb3JhdGlvbklkcyA9IGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMoW10sIG5ld0RlY29yYXRpb25zKTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbklkcyA9IHRoaXMuX2RlY29yYXRpb25JZHMuY29uY2F0KG5ld0RlY29yYXRpb25JZHMpO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzQ2hhbmdpbmdEZWNvcmF0aW9ucyA9IGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3RGVjb3JhdGlvbklkcztcblx0fVxufVxuXG5jb25zdCBzcXVpZ2dseVN0YXJ0ID0gZW5jb2RlVVJJQ29tcG9uZW50KGA8c3ZnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zycgdmlld0JveD0nMCAwIDYgMycgZW5hYmxlLWJhY2tncm91bmQ9J25ldyAwIDAgNiAzJyBoZWlnaHQ9JzMnIHdpZHRoPSc2Jz48ZyBmaWxsPSdgKTtcbmNvbnN0IHNxdWlnZ2x5RW5kID0gZW5jb2RlVVJJQ29tcG9uZW50KGAnPjxwb2x5Z29uIHBvaW50cz0nNS41LDAgMi41LDMgMS4xLDMgNC4xLDAnLz48cG9seWdvbiBwb2ludHM9JzQsMCA2LDIgNiwwLjYgNS40LDAnLz48cG9seWdvbiBwb2ludHM9JzAsMiAxLDMgMi40LDMgMCwwLjYnLz48L2c+PC9zdmc+YCk7XG5cbmZ1bmN0aW9uIGdldFNxdWlnZ2x5U1ZHRGF0YShjb2xvcjogQ29sb3IpIHtcblx0cmV0dXJuIHNxdWlnZ2x5U3RhcnQgKyBlbmNvZGVVUklDb21wb25lbnQoY29sb3IudG9TdHJpbmcoKSkgKyBzcXVpZ2dseUVuZDtcbn1cblxuY29uc3QgZG90ZG90ZG90U3RhcnQgPSBlbmNvZGVVUklDb21wb25lbnQoYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGhlaWdodD1cIjNcIiB3aWR0aD1cIjEyXCI+PGcgZmlsbD1cImApO1xuY29uc3QgZG90ZG90ZG90RW5kID0gZW5jb2RlVVJJQ29tcG9uZW50KGBcIj48Y2lyY2xlIGN4PVwiMVwiIGN5PVwiMVwiIHI9XCIxXCIvPjxjaXJjbGUgY3g9XCI1XCIgY3k9XCIxXCIgcj1cIjFcIi8+PGNpcmNsZSBjeD1cIjlcIiBjeT1cIjFcIiByPVwiMVwiLz48L2c+PC9zdmc+YCk7XG5cbmZ1bmN0aW9uIGdldERvdERvdERvdFNWR0RhdGEoY29sb3I6IENvbG9yKSB7XG5cdHJldHVybiBkb3Rkb3Rkb3RTdGFydCArIGVuY29kZVVSSUNvbXBvbmVudChjb2xvci50b1N0cmluZygpKSArIGRvdGRvdGRvdEVuZDtcbn1cblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgZXJyb3JGb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yRXJyb3JGb3JlZ3JvdW5kKTtcblx0aWYgKGVycm9yRm9yZWdyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAuJHtDbGFzc05hbWUuRWRpdG9yRXJyb3JEZWNvcmF0aW9ufSB7IGJhY2tncm91bmQ6IHVybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwke2dldFNxdWlnZ2x5U1ZHRGF0YShlcnJvckZvcmVncm91bmQpfVwiKSByZXBlYXQteCBib3R0b20gbGVmdDsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGA6cm9vdCB7IC0tbW9uYWNvLWVkaXRvci1lcnJvci1kZWNvcmF0aW9uOiB1cmwoXCJkYXRhOmltYWdlL3N2Zyt4bWwsJHtnZXRTcXVpZ2dseVNWR0RhdGEoZXJyb3JGb3JlZ3JvdW5kKX1cIik7IH1gKTtcblx0fVxuXHRjb25zdCB3YXJuaW5nRm9yZWdyb3VuZCA9IHRoZW1lLmdldENvbG9yKGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kKTtcblx0aWYgKHdhcm5pbmdGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC4ke0NsYXNzTmFtZS5FZGl0b3JXYXJuaW5nRGVjb3JhdGlvbn0geyBiYWNrZ3JvdW5kOiB1cmwoXCJkYXRhOmltYWdlL3N2Zyt4bWwsJHtnZXRTcXVpZ2dseVNWR0RhdGEod2FybmluZ0ZvcmVncm91bmQpfVwiKSByZXBlYXQteCBib3R0b20gbGVmdDsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGA6cm9vdCB7IC0tbW9uYWNvLWVkaXRvci13YXJuaW5nLWRlY29yYXRpb246IHVybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwke2dldFNxdWlnZ2x5U1ZHRGF0YSh3YXJuaW5nRm9yZWdyb3VuZCl9XCIpOyB9YCk7XG5cdH1cblx0Y29uc3QgaW5mb0ZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JJbmZvRm9yZWdyb3VuZCk7XG5cdGlmIChpbmZvRm9yZWdyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAuJHtDbGFzc05hbWUuRWRpdG9ySW5mb0RlY29yYXRpb259IHsgYmFja2dyb3VuZDogdXJsKFwiZGF0YTppbWFnZS9zdmcreG1sLCR7Z2V0U3F1aWdnbHlTVkdEYXRhKGluZm9Gb3JlZ3JvdW5kKX1cIikgcmVwZWF0LXggYm90dG9tIGxlZnQ7IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgOnJvb3QgeyAtLW1vbmFjby1lZGl0b3ItaW5mby1kZWNvcmF0aW9uOiB1cmwoXCJkYXRhOmltYWdlL3N2Zyt4bWwsJHtnZXRTcXVpZ2dseVNWR0RhdGEoaW5mb0ZvcmVncm91bmQpfVwiKTsgfWApO1xuXHR9XG5cdGNvbnN0IGhpbnRGb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9ySGludEZvcmVncm91bmQpO1xuXHRpZiAoaGludEZvcmVncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IgLiR7Q2xhc3NOYW1lLkVkaXRvckhpbnREZWNvcmF0aW9ufSB7IGJhY2tncm91bmQ6IHVybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwke2dldERvdERvdERvdFNWR0RhdGEoaGludEZvcmVncm91bmQpfVwiKSBuby1yZXBlYXQgYm90dG9tIGxlZnQ7IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgOnJvb3QgeyAtLW1vbmFjby1lZGl0b3ItaGludC1kZWNvcmF0aW9uOiB1cmwoXCJkYXRhOmltYWdlL3N2Zyt4bWwsJHtnZXREb3REb3REb3RTVkdEYXRhKGhpbnRGb3JlZ3JvdW5kKX1cIik7IH1gKTtcblx0fVxuXHRjb25zdCB1bm5lY2Vzc2FyeUZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JVbm5lY2Vzc2FyeUNvZGVPcGFjaXR5KTtcblx0aWYgKHVubmVjZXNzYXJ5Rm9yZWdyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvci5zaG93VW51c2VkIC4ke0NsYXNzTmFtZS5FZGl0b3JVbm5lY2Vzc2FyeUlubGluZURlY29yYXRpb259IHsgb3BhY2l0eTogJHt1bm5lY2Vzc2FyeUZvcmVncm91bmQucmdiYS5hfTsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGA6cm9vdCB7IC0tbW9uYWNvLWVkaXRvci11bm5lY2Vzc2FyeS1kZWNvcmF0aW9uLW9wYWNpdHk6ICR7dW5uZWNlc3NhcnlGb3JlZ3JvdW5kLnJnYmEuYX07IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFJckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFvRCxnQ0FBZ0M7QUFDN0YsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBMEMsZUFBZTtBQUNsRSxTQUFTLGVBQWU7QUFDeEIsT0FBTztBQUNQLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMkJBQXVEO0FBQ2hFLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsZ0NBQWdFO0FBQ3pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXlFLFlBQVk7QUFDckYsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFFeEMsU0FBc0QsY0FBeUYsdUJBQXVCLG1D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
