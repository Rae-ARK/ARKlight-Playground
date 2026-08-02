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
import "./media/editorstatus.css";
import { localize, localize2 } from "../../../../nls.js";
import { getWindowById, runAtThisOrScheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { format, compare, splitLines } from "../../../../base/common/strings.js";
import { extname, basename, isEqual } from "../../../../base/common/resources.js";
import { areFunctions, assertReturnsDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { toAction } from "../../../../base/common/actions.js";
import { Language } from "../../../../base/common/platform.js";
import { UntitledTextEditorInput } from "../../../services/untitled/common/untitledTextEditorInput.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { Disposable, MutableDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EndOfLineSequence } from "../../../../editor/common/model.js";
import { TrimTrailingWhitespaceAction } from "../../../../editor/contrib/linesOperations/browser/linesOperations.js";
import { IndentUsingSpaces, IndentUsingTabs, ChangeTabDisplaySize, DetectIndentation, IndentationToSpacesAction, IndentationToTabsAction } from "../../../../editor/contrib/indentation/browser/indentation.js";
import { BaseBinaryResourceEditor } from "./binaryEditor.js";
import { BinaryResourceDiffEditor } from "./binaryDiffEditor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IFileService, FILES_ASSOCIATIONS_CONFIG } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { EncodingMode, ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { SUPPORTED_ENCODINGS } from "../../../services/textfile/common/encoding.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { deepClone } from "../../../../base/common/objects.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { Schemas } from "../../../../base/common/network.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { getIconClassesForLanguageId } from "../../../../editor/common/services/getIconClasses.js";
import { Promises, timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { IMarkerService, MarkerSeverity, IMarkerData } from "../../../../platform/markers/common/markers.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { AutomaticLanguageDetectionLikelyWrongId, ILanguageDetectionService } from "../../../services/languageDetection/common/languageDetectionWorkerService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { TabFocus } from "../../../../editor/browser/config/tabFocus.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { InputMode } from "../../../../editor/common/inputMode.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
class SideBySideEditorEncodingSupport {
  constructor(primary, secondary) {
    this.primary = primary;
    this.secondary = secondary;
  }
  getEncoding() {
    return this.primary.getEncoding();
  }
  async setEncoding(encoding, mode) {
    await Promises.settled([this.primary, this.secondary].map((editor) => editor.setEncoding(encoding, mode)));
  }
}
class SideBySideEditorLanguageSupport {
  constructor(primary, secondary) {
    this.primary = primary;
    this.secondary = secondary;
  }
  setLanguageId(languageId, source) {
    [this.primary, this.secondary].forEach((editor) => editor.setLanguageId(languageId, source));
  }
}
function toEditorWithEncodingSupport(input) {
  if (input instanceof UntitledTextEditorInput) {
    return input;
  }
  if (input instanceof SideBySideEditorInput) {
    const primaryEncodingSupport = toEditorWithEncodingSupport(input.primary);
    const secondaryEncodingSupport = toEditorWithEncodingSupport(input.secondary);
    if (primaryEncodingSupport && secondaryEncodingSupport) {
      return new SideBySideEditorEncodingSupport(primaryEncodingSupport, secondaryEncodingSupport);
    }
    return primaryEncodingSupport;
  }
  const encodingSupport = input;
  if (areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding)) {
    return encodingSupport;
  }
  return null;
}
function toEditorWithLanguageSupport(input) {
  if (input instanceof UntitledTextEditorInput) {
    return input;
  }
  if (input instanceof SideBySideEditorInput) {
    const primaryLanguageSupport = toEditorWithLanguageSupport(input.primary);
    const secondaryLanguageSupport = toEditorWithLanguageSupport(input.secondary);
    if (primaryLanguageSupport && secondaryLanguageSupport) {
      return new SideBySideEditorLanguageSupport(primaryLanguageSupport, secondaryLanguageSupport);
    }
    return primaryLanguageSupport;
  }
  const languageSupport = input;
  if (typeof languageSupport.setLanguageId === "function") {
    return languageSupport;
  }
  return null;
}
class StateChange {
  constructor() {
    this.indentation = false;
    this.selectionStatus = false;
    this.languageId = false;
    this.languageStatus = false;
    this.encoding = false;
    this.EOL = false;
    this.tabFocusMode = false;
    this.inputMode = false;
    this.columnSelectionMode = false;
    this.metadata = false;
  }
  combine(other) {
    this.indentation = this.indentation || other.indentation;
    this.selectionStatus = this.selectionStatus || other.selectionStatus;
    this.languageId = this.languageId || other.languageId;
    this.languageStatus = this.languageStatus || other.languageStatus;
    this.encoding = this.encoding || other.encoding;
    this.EOL = this.EOL || other.EOL;
    this.tabFocusMode = this.tabFocusMode || other.tabFocusMode;
    this.inputMode = this.inputMode || other.inputMode;
    this.columnSelectionMode = this.columnSelectionMode || other.columnSelectionMode;
    this.metadata = this.metadata || other.metadata;
  }
  hasChanges() {
    return this.indentation || this.selectionStatus || this.languageId || this.languageStatus || this.encoding || this.EOL || this.tabFocusMode || this.inputMode || this.columnSelectionMode || this.metadata;
  }
}
class State {
  get selectionStatus() {
    return this._selectionStatus;
  }
  get languageId() {
    return this._languageId;
  }
  get encoding() {
    return this._encoding;
  }
  get EOL() {
    return this._EOL;
  }
  get indentation() {
    return this._indentation;
  }
  get tabFocusMode() {
    return this._tabFocusMode;
  }
  get inputMode() {
    return this._inputMode;
  }
  get columnSelectionMode() {
    return this._columnSelectionMode;
  }
  get metadata() {
    return this._metadata;
  }
  update(update) {
    const change = new StateChange();
    switch (update.type) {
      case "selectionStatus":
        if (this._selectionStatus !== update.selectionStatus) {
          this._selectionStatus = update.selectionStatus;
          change.selectionStatus = true;
        }
        break;
      case "indentation":
        if (this._indentation !== update.indentation) {
          this._indentation = update.indentation;
          change.indentation = true;
        }
        break;
      case "languageId":
        if (this._languageId !== update.languageId) {
          this._languageId = update.languageId;
          change.languageId = true;
        }
        break;
      case "encoding":
        if (this._encoding !== update.encoding) {
          this._encoding = update.encoding;
          change.encoding = true;
        }
        break;
      case "EOL":
        if (this._EOL !== update.EOL) {
          this._EOL = update.EOL;
          change.EOL = true;
        }
        break;
      case "tabFocusMode":
        if (this._tabFocusMode !== update.tabFocusMode) {
          this._tabFocusMode = update.tabFocusMode;
          change.tabFocusMode = true;
        }
        break;
      case "inputMode":
        if (this._inputMode !== update.inputMode) {
          this._inputMode = update.inputMode;
          change.inputMode = true;
        }
        break;
      case "columnSelectionMode":
        if (this._columnSelectionMode !== update.columnSelectionMode) {
          this._columnSelectionMode = update.columnSelectionMode;
          change.columnSelectionMode = true;
        }
        break;
      case "metadata":
        if (this._metadata !== update.metadata) {
          this._metadata = update.metadata;
          change.metadata = true;
        }
        break;
    }
    return change;
  }
}
let TabFocusMode = class extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.registerListeners();
    const tabFocusModeConfig = configurationService.getValue("editor.tabFocusMode") === true;
    TabFocus.setTabFocusMode(tabFocusModeConfig);
  }
  registerListeners() {
    this._register(TabFocus.onDidChangeTabFocus((tabFocusMode) => this._onDidChange.fire(tabFocusMode)));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.tabFocusMode")) {
        const tabFocusModeConfig = this.configurationService.getValue("editor.tabFocusMode") === true;
        TabFocus.setTabFocusMode(tabFocusModeConfig);
        this._onDidChange.fire(tabFocusModeConfig);
      }
    }));
  }
};
TabFocusMode = __decorateClass([
  __decorateParam(0, IConfigurationService)
], TabFocusMode);
class StatusInputMode extends Disposable {
  constructor() {
    super();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    InputMode.setInputMode("insert");
    this._register(InputMode.onDidChangeInputMode((inputMode) => this._onDidChange.fire(inputMode)));
  }
}
const nlsSingleSelectionRange = localize("singleSelectionRange", "Ln {0}, Col {1} ({2} selected)");
const nlsSingleSelection = localize("singleSelection", "Ln {0}, Col {1}");
const nlsMultiSelectionRange = localize("multiSelectionRange", "{0} selections ({1} characters selected)");
const nlsMultiSelection = localize("multiSelection", "{0} selections");
const nlsEOLLF = localize("endOfLineLineFeed", "LF");
const nlsEOLCRLF = localize("endOfLineCarriageReturnLineFeed", "CRLF");
let EditorStatus = class extends Disposable {
  constructor(targetWindowId, editorService, quickInputService, languageService, textFileService, statusbarService, instantiationService, configurationService) {
    super();
    this.targetWindowId = targetWindowId;
    this.editorService = editorService;
    this.quickInputService = quickInputService;
    this.languageService = languageService;
    this.textFileService = textFileService;
    this.statusbarService = statusbarService;
    this.configurationService = configurationService;
    this.tabFocusModeElement = this._register(new MutableDisposable());
    this.inputModeElement = this._register(new MutableDisposable());
    this.columnSelectionModeElement = this._register(new MutableDisposable());
    this.indentationElement = this._register(new MutableDisposable());
    this.selectionElement = this._register(new MutableDisposable());
    this.encodingElement = this._register(new MutableDisposable());
    this.eolElement = this._register(new MutableDisposable());
    this.languageElement = this._register(new MutableDisposable());
    this.metadataElement = this._register(new MutableDisposable());
    this.state = new State();
    this.toRender = void 0;
    this.activeEditorListeners = this._register(new DisposableStore());
    this.delayedRender = this._register(new MutableDisposable());
    this.currentMarkerStatus = this._register(instantiationService.createInstance(ShowCurrentMarkerInStatusbarContribution));
    this.tabFocusMode = this._register(instantiationService.createInstance(TabFocusMode));
    this.inputMode = this._register(instantiationService.createInstance(StatusInputMode));
    this.registerCommands();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.editorService.onDidActiveEditorChange(() => this.updateStatusBar()));
    this._register(this.textFileService.untitled.onDidChangeEncoding((model) => this.onResourceEncodingChange(model.resource)));
    this._register(this.textFileService.files.onDidChangeEncoding((model) => this.onResourceEncodingChange(model.resource)));
    this._register(Event.runAndSubscribe(this.tabFocusMode.onDidChange, (tabFocusMode) => {
      if (tabFocusMode !== void 0) {
        this.onTabFocusModeChange(tabFocusMode);
      } else {
        this.onTabFocusModeChange(this.configurationService.getValue("editor.tabFocusMode"));
      }
    }));
    this._register(Event.runAndSubscribe(this.inputMode.onDidChange, (inputMode) => this.onInputModeChange(inputMode ?? "insert")));
  }
  registerCommands() {
    this._register(CommandsRegistry.registerCommand({ id: `changeEditorIndentation${this.targetWindowId}`, handler: () => this.showIndentationPicker() }));
  }
  async showIndentationPicker() {
    const activeTextEditorControl = getCodeEditor(this.editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      return this.quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
    }
    if (this.editorService.activeEditor?.isReadonly()) {
      return this.quickInputService.pick([{ label: localize("noWritableCodeEditor", "The active code editor is read-only.") }]);
    }
    const picks = [
      assertReturnsDefined(activeTextEditorControl.getAction(IndentUsingSpaces.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(IndentUsingTabs.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(ChangeTabDisplaySize.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(DetectIndentation.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(IndentationToSpacesAction.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(IndentationToTabsAction.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(TrimTrailingWhitespaceAction.ID))
    ].map((a) => {
      return {
        id: a.id,
        label: a.label,
        detail: Language.isDefaultVariant() || a.label === a.alias ? void 0 : a.alias,
        run: () => {
          activeTextEditorControl.focus();
          a.run();
        }
      };
    });
    picks.splice(3, 0, { type: "separator", label: localize("indentConvert", "convert file") });
    picks.unshift({ type: "separator", label: localize("indentView", "change view") });
    const action = await this.quickInputService.pick(picks, { placeHolder: localize("pickAction", "Select Action"), matchOnDetail: true });
    return action?.run();
  }
  updateTabFocusModeElement(visible) {
    if (visible) {
      if (!this.tabFocusModeElement.value) {
        const text = localize("tabFocusModeEnabled", "Tab Moves Focus");
        this.tabFocusModeElement.value = this.statusbarService.addEntry({
          name: localize("status.editor.tabFocusMode", "Accessibility Mode"),
          text,
          ariaLabel: text,
          tooltip: localize("disableTabMode", "Disable Accessibility Mode"),
          command: "editor.action.toggleTabFocusMode",
          kind: "prominent"
        }, "status.editor.tabFocusMode", StatusbarAlignment.RIGHT, 100.7);
      }
    } else {
      this.tabFocusModeElement.clear();
    }
  }
  updateInputModeElement(inputMode) {
    if (inputMode === "overtype") {
      if (!this.inputModeElement.value) {
        const text = localize("inputModeOvertype", "OVR");
        const name = localize("status.editor.enableInsertMode", "Enable Insert Mode");
        this.inputModeElement.value = this.statusbarService.addEntry({
          name,
          text,
          ariaLabel: text,
          tooltip: name,
          command: "editor.action.toggleOvertypeInsertMode",
          kind: "prominent"
        }, "status.editor.inputMode", StatusbarAlignment.RIGHT, 100.6);
      }
    } else {
      this.inputModeElement.clear();
    }
  }
  updateColumnSelectionModeElement(visible) {
    if (visible) {
      if (!this.columnSelectionModeElement.value) {
        const text = localize("columnSelectionModeEnabled", "Column Selection");
        this.columnSelectionModeElement.value = this.statusbarService.addEntry({
          name: localize("status.editor.columnSelectionMode", "Column Selection Mode"),
          text,
          ariaLabel: text,
          tooltip: localize("disableColumnSelectionMode", "Disable Column Selection Mode"),
          command: "editor.action.toggleColumnSelection",
          kind: "prominent"
        }, "status.editor.columnSelectionMode", StatusbarAlignment.RIGHT, 100.8);
      }
    } else {
      this.columnSelectionModeElement.clear();
    }
  }
  updateSelectionElement(text) {
    if (!text) {
      this.selectionElement.clear();
      return;
    }
    const editorURI = getCodeEditor(this.editorService.activeTextEditorControl)?.getModel()?.uri;
    if (editorURI?.scheme === Schemas.vscodeNotebookCell) {
      this.selectionElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.selection", "Editor Selection"),
      text,
      ariaLabel: text,
      tooltip: localize("gotoLine", "Go to Line/Column"),
      command: "workbench.action.gotoLine"
    };
    this.updateElement(this.selectionElement, props, "status.editor.selection", StatusbarAlignment.RIGHT, 100.5);
  }
  updateIndentationElement(text) {
    if (!text) {
      this.indentationElement.clear();
      return;
    }
    const editorURI = getCodeEditor(this.editorService.activeTextEditorControl)?.getModel()?.uri;
    if (editorURI?.scheme === Schemas.vscodeNotebookCell) {
      this.indentationElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.indentation", "Editor Indentation"),
      text,
      ariaLabel: text,
      tooltip: localize("selectIndentation", "Select Indentation"),
      command: `changeEditorIndentation${this.targetWindowId}`
    };
    this.updateElement(this.indentationElement, props, "status.editor.indentation", StatusbarAlignment.RIGHT, 100.4);
  }
  updateEncodingElement(text) {
    if (!text) {
      this.encodingElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.encoding", "Editor Encoding"),
      text,
      ariaLabel: text,
      tooltip: localize("selectEncoding", "Select Encoding"),
      command: "workbench.action.editor.changeEncoding"
    };
    this.updateElement(this.encodingElement, props, "status.editor.encoding", StatusbarAlignment.RIGHT, 100.3);
  }
  updateEOLElement(text) {
    if (!text) {
      this.eolElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.eol", "Editor End of Line"),
      text,
      ariaLabel: text,
      tooltip: localize("selectEOL", "Select End of Line Sequence"),
      command: "workbench.action.editor.changeEOL"
    };
    this.updateElement(this.eolElement, props, "status.editor.eol", StatusbarAlignment.RIGHT, 100.2);
  }
  updateLanguageIdElement(text) {
    if (!text) {
      this.languageElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.mode", "Editor Language"),
      text,
      ariaLabel: text,
      tooltip: localize("selectLanguageMode", "Select Language Mode"),
      command: "workbench.action.editor.changeLanguageMode"
    };
    this.updateElement(this.languageElement, props, "status.editor.mode", StatusbarAlignment.RIGHT, 100.1);
  }
  updateMetadataElement(text) {
    if (!text) {
      this.metadataElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.info", "File Information"),
      text,
      ariaLabel: text,
      tooltip: localize("fileInfo", "File Information")
    };
    this.updateElement(this.metadataElement, props, "status.editor.info", StatusbarAlignment.RIGHT, 100);
  }
  updateElement(element, props, id, alignment, priority) {
    if (!element.value) {
      element.value = this.statusbarService.addEntry(props, id, alignment, priority);
    } else {
      element.value.update(props);
    }
  }
  updateState(update) {
    const changed = this.state.update(update);
    if (!changed.hasChanges()) {
      return;
    }
    if (!this.toRender) {
      this.toRender = changed;
      this.delayedRender.value = runAtThisOrScheduleAtNextAnimationFrame(getWindowById(this.targetWindowId, true).window, () => {
        this.delayedRender.clear();
        const toRender = this.toRender;
        this.toRender = void 0;
        if (toRender) {
          this.doRenderNow();
        }
      });
    } else {
      this.toRender.combine(changed);
    }
  }
  doRenderNow() {
    this.updateTabFocusModeElement(!!this.state.tabFocusMode);
    this.updateInputModeElement(this.state.inputMode);
    this.updateColumnSelectionModeElement(!!this.state.columnSelectionMode);
    this.updateIndentationElement(this.state.indentation);
    this.updateSelectionElement(this.state.selectionStatus);
    this.updateEncodingElement(this.state.encoding);
    this.updateEOLElement(this.state.EOL ? this.state.EOL === "\r\n" ? nlsEOLCRLF : nlsEOLLF : void 0);
    this.updateLanguageIdElement(this.state.languageId);
    this.updateMetadataElement(this.state.metadata);
  }
  getSelectionLabel(info) {
    if (!info?.selections) {
      return void 0;
    }
    if (info.selections.length === 1) {
      if (info.charactersSelected) {
        return format(nlsSingleSelectionRange, info.selections[0].positionLineNumber, info.selections[0].positionColumn, info.charactersSelected);
      }
      return format(nlsSingleSelection, info.selections[0].positionLineNumber, info.selections[0].positionColumn);
    }
    if (info.charactersSelected) {
      return format(nlsMultiSelectionRange, info.selections.length, info.charactersSelected);
    }
    if (info.selections.length > 0) {
      return format(nlsMultiSelection, info.selections.length);
    }
    return void 0;
  }
  updateStatusBar() {
    const activeInput = this.editorService.activeEditor;
    const activeEditorPane = this.editorService.activeEditorPane;
    const activeCodeEditor = activeEditorPane ? getCodeEditor(activeEditorPane.getControl()) ?? void 0 : void 0;
    this.onColumnSelectionModeChange(activeCodeEditor);
    this.onSelectionChange(activeCodeEditor);
    this.onLanguageChange(activeCodeEditor, activeInput);
    this.onEOLChange(activeCodeEditor);
    this.onEncodingChange(activeEditorPane, activeCodeEditor);
    this.onIndentationChange(activeCodeEditor);
    this.onMetadataChange(activeEditorPane);
    this.currentMarkerStatus.update(activeCodeEditor);
    this.activeEditorListeners.clear();
    if (activeEditorPane) {
      this.activeEditorListeners.add(activeEditorPane.onDidChangeControl(() => {
        this.updateStatusBar();
      }));
    }
    if (activeCodeEditor) {
      this.activeEditorListeners.add(activeCodeEditor.onDidChangeConfiguration((event) => {
        if (event.hasChanged(EditorOption.columnSelection)) {
          this.onColumnSelectionModeChange(activeCodeEditor);
        }
      }));
      this.activeEditorListeners.add(Event.defer(activeCodeEditor.onDidChangeCursorPosition)(() => {
        this.onSelectionChange(activeCodeEditor);
        this.currentMarkerStatus.update(activeCodeEditor);
      }));
      this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelLanguage(() => {
        this.onLanguageChange(activeCodeEditor, activeInput);
      }));
      this.activeEditorListeners.add(Event.accumulate(activeCodeEditor.onDidChangeModelContent)((e) => {
        this.onEOLChange(activeCodeEditor);
        this.currentMarkerStatus.update(activeCodeEditor);
        const selections = activeCodeEditor.getSelections();
        if (selections) {
          for (const inner of e) {
            for (const change of inner.changes) {
              if (selections.some((selection) => Range.areIntersecting(selection, change.range))) {
                this.onSelectionChange(activeCodeEditor);
                break;
              }
            }
          }
        }
      }));
      this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelOptions(() => {
        this.onIndentationChange(activeCodeEditor);
      }));
    } else if (activeEditorPane instanceof BaseBinaryResourceEditor || activeEditorPane instanceof BinaryResourceDiffEditor) {
      const binaryEditors = [];
      if (activeEditorPane instanceof BinaryResourceDiffEditor) {
        const primary = activeEditorPane.getPrimaryEditorPane();
        if (primary instanceof BaseBinaryResourceEditor) {
          binaryEditors.push(primary);
        }
        const secondary = activeEditorPane.getSecondaryEditorPane();
        if (secondary instanceof BaseBinaryResourceEditor) {
          binaryEditors.push(secondary);
        }
      } else {
        binaryEditors.push(activeEditorPane);
      }
      for (const editor of binaryEditors) {
        this.activeEditorListeners.add(editor.onDidChangeMetadata(() => {
          this.onMetadataChange(activeEditorPane);
        }));
        this.activeEditorListeners.add(editor.onDidOpenInPlace(() => {
          this.updateStatusBar();
        }));
      }
    }
  }
  onLanguageChange(editorWidget, editorInput) {
    const info = { type: "languageId", languageId: void 0 };
    if (editorWidget && editorInput && toEditorWithLanguageSupport(editorInput)) {
      const textModel = editorWidget.getModel();
      if (textModel) {
        const languageId = textModel.getLanguageId();
        info.languageId = this.languageService.getLanguageName(languageId) ?? void 0;
      }
    }
    this.updateState(info);
  }
  onIndentationChange(editorWidget) {
    const update = { type: "indentation", indentation: void 0 };
    if (editorWidget) {
      const model = editorWidget.getModel();
      if (model) {
        const modelOpts = model.getOptions();
        update.indentation = modelOpts.insertSpaces ? modelOpts.tabSize === modelOpts.indentSize ? localize("spacesSize", "Spaces: {0}", modelOpts.indentSize) : localize("spacesAndTabsSize", "Spaces: {0} (Tab Size: {1})", modelOpts.indentSize, modelOpts.tabSize) : localize({ key: "tabSize", comment: ["Tab corresponds to the tab key"] }, "Tab Size: {0}", modelOpts.tabSize);
      }
    }
    this.updateState(update);
  }
  onMetadataChange(editor) {
    const update = { type: "metadata", metadata: void 0 };
    if (editor instanceof BaseBinaryResourceEditor || editor instanceof BinaryResourceDiffEditor) {
      update.metadata = editor.getMetadata();
    }
    this.updateState(update);
  }
  onColumnSelectionModeChange(editorWidget) {
    const info = { type: "columnSelectionMode", columnSelectionMode: false };
    if (editorWidget?.getOption(EditorOption.columnSelection)) {
      info.columnSelectionMode = true;
    }
    this.updateState(info);
  }
  onSelectionChange(editorWidget) {
    const info = /* @__PURE__ */ Object.create(null);
    if (editorWidget) {
      info.selections = editorWidget.getSelections() || [];
      info.charactersSelected = 0;
      const textModel = editorWidget.getModel();
      if (textModel) {
        for (const selection of info.selections) {
          if (typeof info.charactersSelected !== "number") {
            info.charactersSelected = 0;
          }
          info.charactersSelected += textModel.getCharacterCountInRange(selection);
        }
      }
      if (info.selections.length === 1) {
        const editorPosition = editorWidget.getPosition();
        const selectionClone = new Selection(
          info.selections[0].selectionStartLineNumber,
          info.selections[0].selectionStartColumn,
          info.selections[0].positionLineNumber,
          editorPosition ? editorWidget.getStatusbarColumn(editorPosition) : info.selections[0].positionColumn
        );
        info.selections[0] = selectionClone;
      }
    }
    this.updateState({ type: "selectionStatus", selectionStatus: this.getSelectionLabel(info) });
  }
  onEOLChange(editorWidget) {
    const info = { type: "EOL", EOL: void 0 };
    if (editorWidget && !editorWidget.getOption(EditorOption.readOnly)) {
      const codeEditorModel = editorWidget.getModel();
      if (codeEditorModel) {
        info.EOL = codeEditorModel.getEOL();
      }
    }
    this.updateState(info);
  }
  onEncodingChange(editor, editorWidget) {
    if (editor && !this.isActiveEditor(editor)) {
      return;
    }
    const info = { type: "encoding", encoding: void 0 };
    if (editor && editorWidget?.hasModel()) {
      const encodingSupport = editor.input ? toEditorWithEncodingSupport(editor.input) : null;
      if (encodingSupport) {
        const rawEncoding = encodingSupport.getEncoding();
        const encodingInfo = typeof rawEncoding === "string" ? SUPPORTED_ENCODINGS[rawEncoding] : void 0;
        if (encodingInfo) {
          info.encoding = encodingInfo.labelShort;
        } else {
          info.encoding = rawEncoding;
        }
      }
    }
    this.updateState(info);
  }
  onResourceEncodingChange(resource) {
    const activeEditorPane = this.editorService.activeEditorPane;
    if (activeEditorPane) {
      const activeResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
      if (activeResource && isEqual(activeResource, resource)) {
        const activeCodeEditor = getCodeEditor(activeEditorPane.getControl()) ?? void 0;
        return this.onEncodingChange(activeEditorPane, activeCodeEditor);
      }
    }
  }
  onTabFocusModeChange(tabFocusMode) {
    const info = { type: "tabFocusMode", tabFocusMode };
    this.updateState(info);
  }
  onInputModeChange(inputMode) {
    const info = { type: "inputMode", inputMode };
    this.updateState(info);
  }
  isActiveEditor(control) {
    const activeEditorPane = this.editorService.activeEditorPane;
    return !!activeEditorPane && activeEditorPane === control;
  }
};
EditorStatus = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IConfigurationService)
], EditorStatus);
let EditorStatusContribution = class extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    for (const part of editorGroupService.parts) {
      this.createEditorStatus(part);
    }
    this._register(editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.createEditorStatus(part)));
  }
  createEditorStatus(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
    disposables.add(scopedInstantiationService.createInstance(EditorStatus, part.windowId));
  }
};
EditorStatusContribution.ID = "workbench.contrib.editorStatus";
EditorStatusContribution = __decorateClass([
  __decorateParam(0, IEditorGroupsService)
], EditorStatusContribution);
let ShowCurrentMarkerInStatusbarContribution = class extends Disposable {
  constructor(statusbarService, markerService, configurationService) {
    super();
    this.statusbarService = statusbarService;
    this.markerService = markerService;
    this.configurationService = configurationService;
    this.editor = void 0;
    this.markers = [];
    this.currentMarker = null;
    this.statusBarEntryAccessor = this._register(new MutableDisposable());
    this._register(markerService.onMarkerChanged((changedResources) => this.onMarkerChanged(changedResources)));
    this._register(Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("problems.showCurrentInStatus"))(() => this.updateStatus()));
  }
  update(editor) {
    this.editor = editor;
    this.updateMarkers();
    this.updateStatus();
  }
  updateStatus() {
    const previousMarker = this.currentMarker;
    this.currentMarker = this.getMarker();
    if (this.hasToUpdateStatus(previousMarker, this.currentMarker)) {
      if (this.currentMarker) {
        const line = splitLines(this.currentMarker.message)[0];
        const text = `${this.getType(this.currentMarker)} ${line}`;
        if (!this.statusBarEntryAccessor.value) {
          this.statusBarEntryAccessor.value = this.statusbarService.addEntry({ name: localize("currentProblem", "Current Problem"), text, ariaLabel: text }, "statusbar.currentProblem", StatusbarAlignment.LEFT);
        } else {
          this.statusBarEntryAccessor.value.update({ name: localize("currentProblem", "Current Problem"), text, ariaLabel: text });
        }
      } else {
        this.statusBarEntryAccessor.clear();
      }
    }
  }
  hasToUpdateStatus(previousMarker, currentMarker) {
    if (!currentMarker) {
      return true;
    }
    if (!previousMarker) {
      return true;
    }
    return IMarkerData.makeKey(previousMarker) !== IMarkerData.makeKey(currentMarker);
  }
  getType(marker) {
    switch (marker.severity) {
      case MarkerSeverity.Error:
        return "$(error)";
      case MarkerSeverity.Warning:
        return "$(warning)";
      case MarkerSeverity.Info:
        return "$(info)";
    }
    return "";
  }
  getMarker() {
    if (!this.configurationService.getValue("problems.showCurrentInStatus")) {
      return null;
    }
    if (!this.editor) {
      return null;
    }
    const model = this.editor.getModel();
    if (!model) {
      return null;
    }
    const position = this.editor.getPosition();
    if (!position) {
      return null;
    }
    return this.markers.find((marker) => Range.containsPosition(marker, position)) || null;
  }
  onMarkerChanged(changedResources) {
    if (!this.editor) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    if (model && !changedResources.some((r) => isEqual(model.uri, r))) {
      return;
    }
    this.updateMarkers();
  }
  updateMarkers() {
    if (!this.editor) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    if (model) {
      this.markers = this.markerService.read({
        resource: model.uri,
        severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info
      });
      this.markers.sort(this.compareMarker);
    } else {
      this.markers = [];
    }
    this.updateStatus();
  }
  compareMarker(a, b) {
    let res = compare(a.resource.toString(), b.resource.toString());
    if (res === 0) {
      res = MarkerSeverity.compare(a.severity, b.severity);
    }
    if (res === 0) {
      res = Range.compareRangesUsingStarts(a, b);
    }
    return res;
  }
};
ShowCurrentMarkerInStatusbarContribution = __decorateClass([
  __decorateParam(0, IStatusbarService),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IConfigurationService)
], ShowCurrentMarkerInStatusbarContribution);
const _ChangeLanguageAction = class _ChangeLanguageAction extends Action2 {
  constructor() {
    super({
      id: _ChangeLanguageAction.ID,
      title: localize2("changeMode", "Change Language Mode"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyM)
      },
      precondition: ContextKeyExpr.not("notebookEditorFocused"),
      metadata: {
        description: localize("changeLanguageMode.description", "Change the language mode of the active text editor."),
        args: [
          {
            name: localize("changeLanguageMode.arg.name", "The name of the language mode to change to."),
            constraint: (value) => typeof value === "string"
          }
        ]
      }
    });
  }
  async run(accessor, languageMode) {
    const quickInputService = accessor.get(IQuickInputService);
    const editorService = accessor.get(IEditorService);
    const languageService = accessor.get(ILanguageService);
    const languageDetectionService = accessor.get(ILanguageDetectionService);
    const textFileService = accessor.get(ITextFileService);
    const preferencesService = accessor.get(IPreferencesService);
    const configurationService = accessor.get(IConfigurationService);
    const telemetryService = accessor.get(ITelemetryService);
    const commandService = accessor.get(ICommandService);
    const galleryService = accessor.get(IExtensionGalleryService);
    const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    const textModel = activeTextEditorControl.getModel();
    const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    let currentLanguageName;
    let currentLanguageId;
    if (textModel) {
      currentLanguageId = textModel.getLanguageId();
      currentLanguageName = languageService.getLanguageName(currentLanguageId) ?? void 0;
    }
    let hasLanguageSupport = !!resource;
    if (resource?.scheme === Schemas.untitled && !textFileService.untitled.get(resource)?.hasAssociatedFilePath) {
      hasLanguageSupport = false;
    }
    const languages = languageService.getSortedRegisteredLanguageNames();
    const picks = languages.map(({ languageName, languageId }) => {
      const extensions = languageService.getExtensions(languageId).join(" ");
      let description;
      if (currentLanguageName === languageName) {
        description = localize("languageDescription", "({0}) - Configured Language", languageId);
      } else {
        description = localize("languageDescriptionConfigured", "({0})", languageId);
      }
      return {
        id: languageId,
        label: languageName,
        meta: extensions,
        iconClasses: getIconClassesForLanguageId(languageId),
        description
      };
    });
    picks.unshift({ type: "separator", label: localize("languagesPicks", "languages (identifier)") });
    let configureLanguageAssociations;
    let configureLanguageSettings;
    let galleryAction;
    if (hasLanguageSupport && resource) {
      const ext = extname(resource) || basename(resource);
      if (galleryService.isEnabled()) {
        galleryAction = toAction({
          id: "workbench.action.showLanguageExtensions",
          label: localize("showLanguageExtensions", "Search Marketplace Extensions for '{0}'...", ext),
          run: () => commandService.executeCommand("workbench.extensions.action.showExtensionsForLanguage", ext)
        });
        picks.unshift(galleryAction);
      }
      configureLanguageSettings = { label: localize("configureModeSettings", "Configure '{0}' language based settings...", currentLanguageName) };
      picks.unshift(configureLanguageSettings);
      configureLanguageAssociations = { label: localize("configureAssociationsExt", "Configure File Association for '{0}'...", ext) };
      picks.unshift(configureLanguageAssociations);
    }
    const autoDetectLanguage = { label: localize("autoDetect", "Auto Detect") };
    if (textModel && textModel.getValueLength() > 0) {
      picks.unshift(autoDetectLanguage);
    }
    const pick = typeof languageMode === "string" ? { label: languageMode } : await quickInputService.pick(picks, { placeHolder: localize("pickLanguage", "Select Language Mode"), matchOnDescription: true });
    if (!pick) {
      return;
    }
    if (pick === galleryAction) {
      galleryAction.run();
      return;
    }
    if (pick === configureLanguageAssociations) {
      if (resource) {
        this.configureFileAssociation(resource, languageService, quickInputService, configurationService);
      }
      return;
    }
    if (pick === configureLanguageSettings) {
      preferencesService.openUserSettings({ jsonEditor: true, revealSetting: { key: `[${currentLanguageId ?? null}]`, edit: true } });
      return;
    }
    const activeEditor = editorService.activeEditor;
    if (activeEditor) {
      const languageSupport = toEditorWithLanguageSupport(activeEditor);
      if (languageSupport) {
        let languageSelection;
        let detectedLanguage;
        if (pick === autoDetectLanguage) {
          if (textModel) {
            const resource2 = EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
            if (resource2) {
              let languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource2, textModel.getLineContent(1)) ?? void 0;
              if (!languageId || languageId === "unknown") {
                detectedLanguage = await languageDetectionService.detectLanguage(resource2);
                languageId = detectedLanguage;
              }
              if (languageId) {
                languageSelection = languageService.createById(languageId);
              }
            }
          }
        } else {
          languageSelection = languageService.createById(pick.id);
          if (resource) {
            languageDetectionService.detectLanguage(resource).then((detectedLanguageId) => {
              const chosenLanguageId = languageService.getLanguageIdByLanguageName(pick.label) || "unknown";
              if (detectedLanguageId === currentLanguageId && currentLanguageId !== chosenLanguageId) {
                const modelPreference = configurationService.getValue("workbench.editor.preferHistoryBasedLanguageDetection") ? "history" : "classic";
                telemetryService.publicLog2(AutomaticLanguageDetectionLikelyWrongId, {
                  currentLanguageId: currentLanguageName ?? "unknown",
                  nextLanguageId: pick.label,
                  lineCount: textModel?.getLineCount() ?? -1,
                  modelPreference
                });
              }
            });
          }
        }
        if (typeof languageSelection !== "undefined") {
          languageSupport.setLanguageId(languageSelection.languageId, _ChangeLanguageAction.ID);
          if (resource?.scheme === Schemas.untitled) {
            const modelPreference = configurationService.getValue("workbench.editor.preferHistoryBasedLanguageDetection") ? "history" : "classic";
            telemetryService.publicLog2("setUntitledDocumentLanguage", {
              to: languageSelection.languageId,
              from: currentLanguageId ?? "none",
              modelPreference
            });
          }
        }
      }
      activeTextEditorControl.focus();
    }
  }
  configureFileAssociation(resource, languageService, quickInputService, configurationService) {
    const extension = extname(resource);
    const base = basename(resource);
    const currentAssociation = languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(base));
    const languages = languageService.getSortedRegisteredLanguageNames();
    const picks = languages.map(({ languageName, languageId }) => {
      return {
        id: languageId,
        label: languageName,
        iconClasses: getIconClassesForLanguageId(languageId),
        description: languageId === currentAssociation ? localize("currentAssociation", "Current Association") : void 0
      };
    });
    setTimeout(
      async () => {
        const language = await quickInputService.pick(picks, { placeHolder: localize("pickLanguageToConfigure", "Select Language Mode to Associate with '{0}'", extension || base) });
        if (language) {
          const fileAssociationsConfig = configurationService.inspect(FILES_ASSOCIATIONS_CONFIG);
          let associationKey;
          if (extension && base[0] !== ".") {
            associationKey = `*${extension}`;
          } else {
            associationKey = base;
          }
          let target = ConfigurationTarget.USER;
          if (fileAssociationsConfig.workspaceValue?.[associationKey]) {
            target = ConfigurationTarget.WORKSPACE;
          }
          const currentAssociations = deepClone(target === ConfigurationTarget.WORKSPACE ? fileAssociationsConfig.workspaceValue : fileAssociationsConfig.userValue) || /* @__PURE__ */ Object.create(null);
          currentAssociations[associationKey] = language.id;
          configurationService.updateValue(FILES_ASSOCIATIONS_CONFIG, currentAssociations, target);
        }
      },
      50
      /* quick input is sensitive to being opened so soon after another */
    );
  }
};
_ChangeLanguageAction.ID = "workbench.action.editor.changeLanguageMode";
let ChangeLanguageAction = _ChangeLanguageAction;
class ChangeEOLAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.editor.changeEOL",
      title: localize2("changeEndOfLine", "Change End of Line Sequence"),
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const quickInputService = accessor.get(IQuickInputService);
    const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    if (editorService.activeEditor?.isReadonly()) {
      await quickInputService.pick([{ label: localize("noWritableCodeEditor", "The active code editor is read-only.") }]);
      return;
    }
    let textModel = activeTextEditorControl.getModel();
    const EOLOptions = [
      { label: nlsEOLLF, eol: EndOfLineSequence.LF },
      { label: nlsEOLCRLF, eol: EndOfLineSequence.CRLF }
    ];
    const selectedIndex = textModel?.getEOL() === "\n" ? 0 : 1;
    const eol = await quickInputService.pick(EOLOptions, { placeHolder: localize("pickEndOfLine", "Select End of Line Sequence"), activeItem: EOLOptions[selectedIndex] });
    if (eol) {
      const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
      if (activeCodeEditor?.hasModel() && !editorService.activeEditor?.isReadonly()) {
        textModel = activeCodeEditor.getModel();
        textModel.pushStackElement();
        textModel.pushEOL(eol.eol);
        textModel.pushStackElement();
      }
    }
    activeTextEditorControl.focus();
  }
}
class ChangeEncodingAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.editor.changeEncoding",
      title: localize2("changeEncoding", "Change File Encoding"),
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const quickInputService = accessor.get(IQuickInputService);
    const fileService = accessor.get(IFileService);
    const textFileService = accessor.get(ITextFileService);
    const textResourceConfigurationService = accessor.get(ITextResourceConfigurationService);
    const dialogService = accessor.get(IDialogService);
    const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    const activeEditorPane = editorService.activeEditorPane;
    if (!activeEditorPane) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    const encodingSupport = toEditorWithEncodingSupport(activeEditorPane.input);
    if (!encodingSupport) {
      await quickInputService.pick([{ label: localize("noFileEditor", "No file active at this time") }]);
      return;
    }
    const saveWithEncodingPick = { label: localize("saveWithEncoding", "Save with Encoding") };
    const reopenWithEncodingPick = { label: localize("reopenWithEncoding", "Reopen with Encoding") };
    if (!Language.isDefaultVariant()) {
      const saveWithEncodingAlias = "Save with Encoding";
      if (saveWithEncodingAlias !== saveWithEncodingPick.label) {
        saveWithEncodingPick.detail = saveWithEncodingAlias;
      }
      const reopenWithEncodingAlias = "Reopen with Encoding";
      if (reopenWithEncodingAlias !== reopenWithEncodingPick.label) {
        reopenWithEncodingPick.detail = reopenWithEncodingAlias;
      }
    }
    let action;
    if (encodingSupport instanceof UntitledTextEditorInput) {
      action = saveWithEncodingPick;
    } else if (activeEditorPane.input.isReadonly()) {
      action = reopenWithEncodingPick;
    } else {
      action = await quickInputService.pick([reopenWithEncodingPick, saveWithEncodingPick], { placeHolder: localize("pickAction", "Select Action"), matchOnDetail: true });
    }
    if (!action) {
      return;
    }
    await timeout(50);
    const resource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (!resource || !fileService.hasProvider(resource) && resource.scheme !== Schemas.untitled) {
      return;
    }
    let guessedEncoding = void 0;
    if (fileService.hasProvider(resource)) {
      const content = await textFileService.readStream(resource, {
        autoGuessEncoding: true,
        candidateGuessEncodings: textResourceConfigurationService.getValue(resource, "files.candidateGuessEncodings")
      });
      guessedEncoding = content.encoding;
    }
    const isReopenWithEncoding = action === reopenWithEncodingPick;
    const configuredEncoding = textResourceConfigurationService.getValue(resource, "files.encoding");
    let directMatchIndex;
    let aliasMatchIndex;
    const picks = Object.keys(SUPPORTED_ENCODINGS).sort((k1, k2) => {
      if (k1 === configuredEncoding) {
        return -1;
      } else if (k2 === configuredEncoding) {
        return 1;
      }
      return SUPPORTED_ENCODINGS[k1].order - SUPPORTED_ENCODINGS[k2].order;
    }).filter((k) => {
      if (k === guessedEncoding && guessedEncoding !== configuredEncoding) {
        return false;
      }
      return !isReopenWithEncoding || !SUPPORTED_ENCODINGS[k].encodeOnly;
    }).map((key, index) => {
      if (key === encodingSupport.getEncoding()) {
        directMatchIndex = index;
      } else if (SUPPORTED_ENCODINGS[key].alias === encodingSupport.getEncoding()) {
        aliasMatchIndex = index;
      }
      return { id: key, label: SUPPORTED_ENCODINGS[key].labelLong, description: key };
    });
    const items = picks.slice();
    if (guessedEncoding && configuredEncoding !== guessedEncoding && SUPPORTED_ENCODINGS[guessedEncoding]) {
      picks.unshift({ type: "separator" });
      picks.unshift({ id: guessedEncoding, label: SUPPORTED_ENCODINGS[guessedEncoding].labelLong, description: localize("guessedEncoding", "Guessed from content") });
    }
    const encoding = await quickInputService.pick(picks, {
      placeHolder: isReopenWithEncoding ? localize("pickEncodingForReopen", "Select File Encoding to Reopen File") : localize("pickEncodingForSave", "Select File Encoding to Save with"),
      activeItem: items[typeof directMatchIndex === "number" ? directMatchIndex : typeof aliasMatchIndex === "number" ? aliasMatchIndex : -1]
    });
    if (!encoding) {
      return;
    }
    if (!editorService.activeEditorPane) {
      return;
    }
    const activeEncodingSupport = toEditorWithEncodingSupport(editorService.activeEditorPane.input);
    if (typeof encoding.id !== "undefined" && activeEncodingSupport) {
      if (isReopenWithEncoding && editorService.activeEditorPane.input.isDirty()) {
        const { confirmed } = await dialogService.confirm({
          message: localize("reopenWithEncodingWarning", "Do you want to revert the active text editor and reopen with a different encoding?"),
          detail: localize("reopenWithEncodingDetail", "This will discard any unsaved changes."),
          primaryButton: localize("reopen", "Discard Changes and Reopen")
        });
        if (!confirmed) {
          return;
        }
        await editorService.activeEditorPane.input.revert(editorService.activeEditorPane.group.id);
      }
      await activeEncodingSupport.setEncoding(encoding.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode);
    }
    activeTextEditorControl.focus();
  }
}
export {
  ChangeEOLAction,
  ChangeEncodingAction,
  ChangeLanguageAction,
  EditorStatusContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JTdGF0dXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvZWRpdG9yc3RhdHVzLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldFdpbmRvd0J5SWQsIHJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZm9ybWF0LCBjb21wYXJlLCBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhcmVGdW5jdGlvbnMsIGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVudGl0bGVkVGV4dEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElGaWxlRWRpdG9ySW5wdXQsIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElFZGl0b3JQYW5lLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRyaW1UcmFpbGluZ1doaXRlc3BhY2VBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9saW5lc09wZXJhdGlvbnMvYnJvd3Nlci9saW5lc09wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSW5kZW50VXNpbmdTcGFjZXMsIEluZGVudFVzaW5nVGFicywgQ2hhbmdlVGFiRGlzcGxheVNpemUsIERldGVjdEluZGVudGF0aW9uLCBJbmRlbnRhdGlvblRvU3BhY2VzQWN0aW9uLCBJbmRlbnRhdGlvblRvVGFic0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2luZGVudGF0aW9uL2Jyb3dzZXIvaW5kZW50YXRpb24uanMnO1xuaW1wb3J0IHsgQmFzZUJpbmFyeVJlc291cmNlRWRpdG9yIH0gZnJvbSAnLi9iaW5hcnlFZGl0b3IuanMnO1xuaW1wb3J0IHsgQmluYXJ5UmVzb3VyY2VEaWZmRWRpdG9yIH0gZnJvbSAnLi9iaW5hcnlEaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgRklMRVNfQVNTT0NJQVRJT05TX0NPTkZJRyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UsIElMYW5ndWFnZVNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlLCBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRW5jb2RpbmdNb2RlLCBJRW5jb2RpbmdTdXBwb3J0LCBJTGFuZ3VhZ2VTdXBwb3J0LCBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBTVVBQT1JURURfRU5DT0RJTkdTIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgZ2V0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXNGb3JMYW5ndWFnZUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50LCBJU3RhdHVzYmFyRW50cnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgSU1hcmtlclNlcnZpY2UsIE1hcmtlclNldmVyaXR5LCBJTWFya2VyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aWNMYW5ndWFnZURldGVjdGlvbkxpa2VseVdyb25nQ2xhc3NpZmljYXRpb24sIEF1dG9tYXRpY0xhbmd1YWdlRGV0ZWN0aW9uTGlrZWx5V3JvbmdJZCwgSUF1dG9tYXRpY0xhbmd1YWdlRGV0ZWN0aW9uTGlrZWx5V3JvbmdEYXRhLCBJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGFuZ3VhZ2VEZXRlY3Rpb24vY29tbW9uL2xhbmd1YWdlRGV0ZWN0aW9uV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFRhYkZvY3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL3RhYkZvY3VzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJRWRpdG9yUGFydCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnB1dE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2lucHV0TW9kZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuXG5jbGFzcyBTaWRlQnlTaWRlRWRpdG9yRW5jb2RpbmdTdXBwb3J0IGltcGxlbWVudHMgSUVuY29kaW5nU3VwcG9ydCB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcHJpbWFyeTogSUVuY29kaW5nU3VwcG9ydCwgcHJpdmF0ZSBzZWNvbmRhcnk6IElFbmNvZGluZ1N1cHBvcnQpIHsgfVxuXG5cdGdldEVuY29kaW5nKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucHJpbWFyeS5nZXRFbmNvZGluZygpOyAvLyBhbHdheXMgcmVwb3J0IGZyb20gbW9kaWZpZWQgKHJpZ2h0IGhhbmQpIHNpZGVcblx0fVxuXG5cdGFzeW5jIHNldEVuY29kaW5nKGVuY29kaW5nOiBzdHJpbmcsIG1vZGU6IEVuY29kaW5nTW9kZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW3RoaXMucHJpbWFyeSwgdGhpcy5zZWNvbmRhcnldLm1hcChlZGl0b3IgPT4gZWRpdG9yLnNldEVuY29kaW5nKGVuY29kaW5nLCBtb2RlKSkpO1xuXHR9XG59XG5cbmNsYXNzIFNpZGVCeVNpZGVFZGl0b3JMYW5ndWFnZVN1cHBvcnQgaW1wbGVtZW50cyBJTGFuZ3VhZ2VTdXBwb3J0IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHByaW1hcnk6IElMYW5ndWFnZVN1cHBvcnQsIHByaXZhdGUgc2Vjb25kYXJ5OiBJTGFuZ3VhZ2VTdXBwb3J0KSB7IH1cblxuXHRzZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZywgc291cmNlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0W3RoaXMucHJpbWFyeSwgdGhpcy5zZWNvbmRhcnldLmZvckVhY2goZWRpdG9yID0+IGVkaXRvci5zZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQsIHNvdXJjZSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvRWRpdG9yV2l0aEVuY29kaW5nU3VwcG9ydChpbnB1dDogRWRpdG9ySW5wdXQpOiBJRW5jb2RpbmdTdXBwb3J0IHwgbnVsbCB7XG5cblx0Ly8gVW50aXRsZWQgVGV4dCBFZGl0b3Jcblx0aWYgKGlucHV0IGluc3RhbmNlb2YgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQpIHtcblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cblxuXHQvLyBTaWRlIGJ5IFNpZGUgKGRpZmYpIEVkaXRvclxuXHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpIHtcblx0XHRjb25zdCBwcmltYXJ5RW5jb2RpbmdTdXBwb3J0ID0gdG9FZGl0b3JXaXRoRW5jb2RpbmdTdXBwb3J0KGlucHV0LnByaW1hcnkpO1xuXHRcdGNvbnN0IHNlY29uZGFyeUVuY29kaW5nU3VwcG9ydCA9IHRvRWRpdG9yV2l0aEVuY29kaW5nU3VwcG9ydChpbnB1dC5zZWNvbmRhcnkpO1xuXG5cdFx0aWYgKHByaW1hcnlFbmNvZGluZ1N1cHBvcnQgJiYgc2Vjb25kYXJ5RW5jb2RpbmdTdXBwb3J0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNpZGVCeVNpZGVFZGl0b3JFbmNvZGluZ1N1cHBvcnQocHJpbWFyeUVuY29kaW5nU3VwcG9ydCwgc2Vjb25kYXJ5RW5jb2RpbmdTdXBwb3J0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJpbWFyeUVuY29kaW5nU3VwcG9ydDtcblx0fVxuXG5cdC8vIEZpbGUgb3IgUmVzb3VyY2UgRWRpdG9yXG5cdGNvbnN0IGVuY29kaW5nU3VwcG9ydCA9IGlucHV0IGFzIElGaWxlRWRpdG9ySW5wdXQ7XG5cdGlmIChhcmVGdW5jdGlvbnMoZW5jb2RpbmdTdXBwb3J0LnNldEVuY29kaW5nLCBlbmNvZGluZ1N1cHBvcnQuZ2V0RW5jb2RpbmcpKSB7XG5cdFx0cmV0dXJuIGVuY29kaW5nU3VwcG9ydDtcblx0fVxuXG5cdC8vIFVuc3VwcG9ydGVkIGZvciBhbnkgb3RoZXIgZWRpdG9yXG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiB0b0VkaXRvcldpdGhMYW5ndWFnZVN1cHBvcnQoaW5wdXQ6IEVkaXRvcklucHV0KTogSUxhbmd1YWdlU3VwcG9ydCB8IG51bGwge1xuXG5cdC8vIFVudGl0bGVkIFRleHQgRWRpdG9yXG5cdGlmIChpbnB1dCBpbnN0YW5jZW9mIFVudGl0bGVkVGV4dEVkaXRvcklucHV0KSB7XG5cdFx0cmV0dXJuIGlucHV0O1xuXHR9XG5cblx0Ly8gU2lkZSBieSBTaWRlIChkaWZmKSBFZGl0b3Jcblx0aWYgKGlucHV0IGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0Y29uc3QgcHJpbWFyeUxhbmd1YWdlU3VwcG9ydCA9IHRvRWRpdG9yV2l0aExhbmd1YWdlU3VwcG9ydChpbnB1dC5wcmltYXJ5KTtcblx0XHRjb25zdCBzZWNvbmRhcnlMYW5ndWFnZVN1cHBvcnQgPSB0b0VkaXRvcldpdGhMYW5ndWFnZVN1cHBvcnQoaW5wdXQuc2Vjb25kYXJ5KTtcblxuXHRcdGlmIChwcmltYXJ5TGFuZ3VhZ2VTdXBwb3J0ICYmIHNlY29uZGFyeUxhbmd1YWdlU3VwcG9ydCkge1xuXHRcdFx0cmV0dXJuIG5ldyBTaWRlQnlTaWRlRWRpdG9yTGFuZ3VhZ2VTdXBwb3J0KHByaW1hcnlMYW5ndWFnZVN1cHBvcnQsIHNlY29uZGFyeUxhbmd1YWdlU3VwcG9ydCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByaW1hcnlMYW5ndWFnZVN1cHBvcnQ7XG5cdH1cblxuXHQvLyBGaWxlIG9yIFJlc291cmNlIEVkaXRvclxuXHRjb25zdCBsYW5ndWFnZVN1cHBvcnQgPSBpbnB1dCBhcyBJRmlsZUVkaXRvcklucHV0O1xuXHRpZiAodHlwZW9mIGxhbmd1YWdlU3VwcG9ydC5zZXRMYW5ndWFnZUlkID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0cmV0dXJuIGxhbmd1YWdlU3VwcG9ydDtcblx0fVxuXG5cdC8vIFVuc3VwcG9ydGVkIGZvciBhbnkgb3RoZXIgZWRpdG9yXG5cdHJldHVybiBudWxsO1xufVxuXG5pbnRlcmZhY2UgSUVkaXRvclNlbGVjdGlvblN0YXR1cyB7XG5cdHNlbGVjdGlvbnM/OiBTZWxlY3Rpb25bXTtcblx0Y2hhcmFjdGVyc1NlbGVjdGVkPzogbnVtYmVyO1xufVxuXG5jbGFzcyBTdGF0ZUNoYW5nZSB7XG5cdGluZGVudGF0aW9uOiBib29sZWFuID0gZmFsc2U7XG5cdHNlbGVjdGlvblN0YXR1czogYm9vbGVhbiA9IGZhbHNlO1xuXHRsYW5ndWFnZUlkOiBib29sZWFuID0gZmFsc2U7XG5cdGxhbmd1YWdlU3RhdHVzOiBib29sZWFuID0gZmFsc2U7XG5cdGVuY29kaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdEVPTDogYm9vbGVhbiA9IGZhbHNlO1xuXHR0YWJGb2N1c01vZGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0aW5wdXRNb2RlOiBib29sZWFuID0gZmFsc2U7XG5cdGNvbHVtblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0bWV0YWRhdGE6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb21iaW5lKG90aGVyOiBTdGF0ZUNoYW5nZSkge1xuXHRcdHRoaXMuaW5kZW50YXRpb24gPSB0aGlzLmluZGVudGF0aW9uIHx8IG90aGVyLmluZGVudGF0aW9uO1xuXHRcdHRoaXMuc2VsZWN0aW9uU3RhdHVzID0gdGhpcy5zZWxlY3Rpb25TdGF0dXMgfHwgb3RoZXIuc2VsZWN0aW9uU3RhdHVzO1xuXHRcdHRoaXMubGFuZ3VhZ2VJZCA9IHRoaXMubGFuZ3VhZ2VJZCB8fCBvdGhlci5sYW5ndWFnZUlkO1xuXHRcdHRoaXMubGFuZ3VhZ2VTdGF0dXMgPSB0aGlzLmxhbmd1YWdlU3RhdHVzIHx8IG90aGVyLmxhbmd1YWdlU3RhdHVzO1xuXHRcdHRoaXMuZW5jb2RpbmcgPSB0aGlzLmVuY29kaW5nIHx8IG90aGVyLmVuY29kaW5nO1xuXHRcdHRoaXMuRU9MID0gdGhpcy5FT0wgfHwgb3RoZXIuRU9MO1xuXHRcdHRoaXMudGFiRm9jdXNNb2RlID0gdGhpcy50YWJGb2N1c01vZGUgfHwgb3RoZXIudGFiRm9jdXNNb2RlO1xuXHRcdHRoaXMuaW5wdXRNb2RlID0gdGhpcy5pbnB1dE1vZGUgfHwgb3RoZXIuaW5wdXRNb2RlO1xuXHRcdHRoaXMuY29sdW1uU2VsZWN0aW9uTW9kZSA9IHRoaXMuY29sdW1uU2VsZWN0aW9uTW9kZSB8fCBvdGhlci5jb2x1bW5TZWxlY3Rpb25Nb2RlO1xuXHRcdHRoaXMubWV0YWRhdGEgPSB0aGlzLm1ldGFkYXRhIHx8IG90aGVyLm1ldGFkYXRhO1xuXHR9XG5cblx0aGFzQ2hhbmdlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRlbnRhdGlvblxuXHRcdFx0fHwgdGhpcy5zZWxlY3Rpb25TdGF0dXNcblx0XHRcdHx8IHRoaXMubGFuZ3VhZ2VJZFxuXHRcdFx0fHwgdGhpcy5sYW5ndWFnZVN0YXR1c1xuXHRcdFx0fHwgdGhpcy5lbmNvZGluZ1xuXHRcdFx0fHwgdGhpcy5FT0xcblx0XHRcdHx8IHRoaXMudGFiRm9jdXNNb2RlXG5cdFx0XHR8fCB0aGlzLmlucHV0TW9kZVxuXHRcdFx0fHwgdGhpcy5jb2x1bW5TZWxlY3Rpb25Nb2RlXG5cdFx0XHR8fCB0aGlzLm1ldGFkYXRhO1xuXHR9XG59XG5cbnR5cGUgU3RhdGVEZWx0YSA9IChcblx0eyB0eXBlOiAnc2VsZWN0aW9uU3RhdHVzJzsgc2VsZWN0aW9uU3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuXHR8IHsgdHlwZTogJ2xhbmd1YWdlSWQnOyBsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuXHR8IHsgdHlwZTogJ2VuY29kaW5nJzsgZW5jb2Rpbmc6IHN0cmluZyB8IHVuZGVmaW5lZCB9XG5cdHwgeyB0eXBlOiAnRU9MJzsgRU9MOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuXHR8IHsgdHlwZTogJ2luZGVudGF0aW9uJzsgaW5kZW50YXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCB9XG5cdHwgeyB0eXBlOiAndGFiRm9jdXNNb2RlJzsgdGFiRm9jdXNNb2RlOiBib29sZWFuIH1cblx0fCB7IHR5cGU6ICdjb2x1bW5TZWxlY3Rpb25Nb2RlJzsgY29sdW1uU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB9XG5cdHwgeyB0eXBlOiAnbWV0YWRhdGEnOyBtZXRhZGF0YTogc3RyaW5nIHwgdW5kZWZpbmVkIH1cblx0fCB7IHR5cGU6ICdpbnB1dE1vZGUnOyBpbnB1dE1vZGU6ICdvdmVydHlwZScgfCAnaW5zZXJ0JyB9XG4pO1xuXG5jbGFzcyBTdGF0ZSB7XG5cblx0cHJpdmF0ZSBfc2VsZWN0aW9uU3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBzZWxlY3Rpb25TdGF0dXMoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NlbGVjdGlvblN0YXR1czsgfVxuXG5cdHByaXZhdGUgX2xhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGxhbmd1YWdlSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2xhbmd1YWdlSWQ7IH1cblxuXHRwcml2YXRlIF9lbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgZW5jb2RpbmcoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2VuY29kaW5nOyB9XG5cblx0cHJpdmF0ZSBfRU9MOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBFT0woKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX0VPTDsgfVxuXG5cdHByaXZhdGUgX2luZGVudGF0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBpbmRlbnRhdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faW5kZW50YXRpb247IH1cblxuXHRwcml2YXRlIF90YWJGb2N1c01vZGU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGdldCB0YWJGb2N1c01vZGUoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl90YWJGb2N1c01vZGU7IH1cblxuXHRwcml2YXRlIF9pbnB1dE1vZGU6ICdvdmVydHlwZScgfCAnaW5zZXJ0JyB8IHVuZGVmaW5lZDtcblx0Z2V0IGlucHV0TW9kZSgpOiAnb3ZlcnR5cGUnIHwgJ2luc2VydCcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faW5wdXRNb2RlOyB9XG5cblx0cHJpdmF0ZSBfY29sdW1uU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Z2V0IGNvbHVtblNlbGVjdGlvbk1vZGUoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jb2x1bW5TZWxlY3Rpb25Nb2RlOyB9XG5cblx0cHJpdmF0ZSBfbWV0YWRhdGE6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IG1ldGFkYXRhKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9tZXRhZGF0YTsgfVxuXG5cdHVwZGF0ZSh1cGRhdGU6IFN0YXRlRGVsdGEpOiBTdGF0ZUNoYW5nZSB7XG5cdFx0Y29uc3QgY2hhbmdlID0gbmV3IFN0YXRlQ2hhbmdlKCk7XG5cblx0XHRzd2l0Y2ggKHVwZGF0ZS50eXBlKSB7XG5cdFx0XHRjYXNlICdzZWxlY3Rpb25TdGF0dXMnOlxuXHRcdFx0XHRpZiAodGhpcy5fc2VsZWN0aW9uU3RhdHVzICE9PSB1cGRhdGUuc2VsZWN0aW9uU3RhdHVzKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uU3RhdHVzID0gdXBkYXRlLnNlbGVjdGlvblN0YXR1cztcblx0XHRcdFx0XHRjaGFuZ2Uuc2VsZWN0aW9uU3RhdHVzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnaW5kZW50YXRpb24nOlxuXHRcdFx0XHRpZiAodGhpcy5faW5kZW50YXRpb24gIT09IHVwZGF0ZS5pbmRlbnRhdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuX2luZGVudGF0aW9uID0gdXBkYXRlLmluZGVudGF0aW9uO1xuXHRcdFx0XHRcdGNoYW5nZS5pbmRlbnRhdGlvbiA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2xhbmd1YWdlSWQnOlxuXHRcdFx0XHRpZiAodGhpcy5fbGFuZ3VhZ2VJZCAhPT0gdXBkYXRlLmxhbmd1YWdlSWQpIHtcblx0XHRcdFx0XHR0aGlzLl9sYW5ndWFnZUlkID0gdXBkYXRlLmxhbmd1YWdlSWQ7XG5cdFx0XHRcdFx0Y2hhbmdlLmxhbmd1YWdlSWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdlbmNvZGluZyc6XG5cdFx0XHRcdGlmICh0aGlzLl9lbmNvZGluZyAhPT0gdXBkYXRlLmVuY29kaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fZW5jb2RpbmcgPSB1cGRhdGUuZW5jb2Rpbmc7XG5cdFx0XHRcdFx0Y2hhbmdlLmVuY29kaW5nID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnRU9MJzpcblx0XHRcdFx0aWYgKHRoaXMuX0VPTCAhPT0gdXBkYXRlLkVPTCkge1xuXHRcdFx0XHRcdHRoaXMuX0VPTCA9IHVwZGF0ZS5FT0w7XG5cdFx0XHRcdFx0Y2hhbmdlLkVPTCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ3RhYkZvY3VzTW9kZSc6XG5cdFx0XHRcdGlmICh0aGlzLl90YWJGb2N1c01vZGUgIT09IHVwZGF0ZS50YWJGb2N1c01vZGUpIHtcblx0XHRcdFx0XHR0aGlzLl90YWJGb2N1c01vZGUgPSB1cGRhdGUudGFiRm9jdXNNb2RlO1xuXHRcdFx0XHRcdGNoYW5nZS50YWJGb2N1c01vZGUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdpbnB1dE1vZGUnOlxuXHRcdFx0XHRpZiAodGhpcy5faW5wdXRNb2RlICE9PSB1cGRhdGUuaW5wdXRNb2RlKSB7XG5cdFx0XHRcdFx0dGhpcy5faW5wdXRNb2RlID0gdXBkYXRlLmlucHV0TW9kZTtcblx0XHRcdFx0XHRjaGFuZ2UuaW5wdXRNb2RlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnY29sdW1uU2VsZWN0aW9uTW9kZSc6XG5cdFx0XHRcdGlmICh0aGlzLl9jb2x1bW5TZWxlY3Rpb25Nb2RlICE9PSB1cGRhdGUuY29sdW1uU2VsZWN0aW9uTW9kZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbHVtblNlbGVjdGlvbk1vZGUgPSB1cGRhdGUuY29sdW1uU2VsZWN0aW9uTW9kZTtcblx0XHRcdFx0XHRjaGFuZ2UuY29sdW1uU2VsZWN0aW9uTW9kZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ21ldGFkYXRhJzpcblx0XHRcdFx0aWYgKHRoaXMuX21ldGFkYXRhICE9PSB1cGRhdGUubWV0YWRhdGEpIHtcblx0XHRcdFx0XHR0aGlzLl9tZXRhZGF0YSA9IHVwZGF0ZS5tZXRhZGF0YTtcblx0XHRcdFx0XHRjaGFuZ2UubWV0YWRhdGEgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGFuZ2U7XG5cdH1cbn1cblxuY2xhc3MgVGFiRm9jdXNNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3RvcihASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cblx0XHRjb25zdCB0YWJGb2N1c01vZGVDb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLnRhYkZvY3VzTW9kZScpID09PSB0cnVlO1xuXHRcdFRhYkZvY3VzLnNldFRhYkZvY3VzTW9kZSh0YWJGb2N1c01vZGVDb25maWcpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihUYWJGb2N1cy5vbkRpZENoYW5nZVRhYkZvY3VzKHRhYkZvY3VzTW9kZSA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKHRhYkZvY3VzTW9kZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci50YWJGb2N1c01vZGUnKSkge1xuXHRcdFx0XHRjb25zdCB0YWJGb2N1c01vZGVDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3IudGFiRm9jdXNNb2RlJykgPT09IHRydWU7XG5cdFx0XHRcdFRhYkZvY3VzLnNldFRhYkZvY3VzTW9kZSh0YWJGb2N1c01vZGVDb25maWcpO1xuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGFiRm9jdXNNb2RlQ29uZmlnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuY2xhc3MgU3RhdHVzSW5wdXRNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjwnb3ZlcnR5cGUnIHwgJ2luc2VydCc+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdElucHV0TW9kZS5zZXRJbnB1dE1vZGUoJ2luc2VydCcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKElucHV0TW9kZS5vbkRpZENoYW5nZUlucHV0TW9kZShpbnB1dE1vZGUgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShpbnB1dE1vZGUpKSk7XG5cdH1cbn1cblxuY29uc3QgbmxzU2luZ2xlU2VsZWN0aW9uUmFuZ2UgPSBsb2NhbGl6ZSgnc2luZ2xlU2VsZWN0aW9uUmFuZ2UnLCBcIkxuIHswfSwgQ29sIHsxfSAoezJ9IHNlbGVjdGVkKVwiKTtcbmNvbnN0IG5sc1NpbmdsZVNlbGVjdGlvbiA9IGxvY2FsaXplKCdzaW5nbGVTZWxlY3Rpb24nLCBcIkxuIHswfSwgQ29sIHsxfVwiKTtcbmNvbnN0IG5sc011bHRpU2VsZWN0aW9uUmFuZ2UgPSBsb2NhbGl6ZSgnbXVsdGlTZWxlY3Rpb25SYW5nZScsIFwiezB9IHNlbGVjdGlvbnMgKHsxfSBjaGFyYWN0ZXJzIHNlbGVjdGVkKVwiKTtcbmNvbnN0IG5sc011bHRpU2VsZWN0aW9uID0gbG9jYWxpemUoJ211bHRpU2VsZWN0aW9uJywgXCJ7MH0gc2VsZWN0aW9uc1wiKTtcbmNvbnN0IG5sc0VPTExGID0gbG9jYWxpemUoJ2VuZE9mTGluZUxpbmVGZWVkJywgXCJMRlwiKTtcbmNvbnN0IG5sc0VPTENSTEYgPSBsb2NhbGl6ZSgnZW5kT2ZMaW5lQ2FycmlhZ2VSZXR1cm5MaW5lRmVlZCcsIFwiQ1JMRlwiKTtcblxuY2xhc3MgRWRpdG9yU3RhdHVzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0YWJGb2N1c01vZGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBpbnB1dE1vZGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb2x1bW5TZWxlY3Rpb25Nb2RlRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5kZW50YXRpb25FbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBzZWxlY3Rpb25FbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbmNvZGluZ0VsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVvbEVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWV0YWRhdGFFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRNYXJrZXJTdGF0dXM6IFNob3dDdXJyZW50TWFya2VySW5TdGF0dXNiYXJDb250cmlidXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgdGFiRm9jdXNNb2RlOiBUYWJGb2N1c01vZGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXRNb2RlOiBTdGF0dXNJbnB1dE1vZGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdGF0ZSA9IG5ldyBTdGF0ZSgpO1xuXHRwcml2YXRlIHRvUmVuZGVyOiBTdGF0ZUNoYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZUVkaXRvckxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsYXllZFJlbmRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRhcmdldFdpbmRvd0lkOiBudW1iZXIsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmN1cnJlbnRNYXJrZXJTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaG93Q3VycmVudE1hcmtlckluU3RhdHVzYmFyQ29udHJpYnV0aW9uKSk7XG5cdFx0dGhpcy50YWJGb2N1c01vZGUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYWJGb2N1c01vZGUpKTtcblx0XHR0aGlzLmlucHV0TW9kZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YXR1c0lucHV0TW9kZSkpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckNvbW1hbmRzKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVTdGF0dXNCYXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLnVudGl0bGVkLm9uRGlkQ2hhbmdlRW5jb2RpbmcobW9kZWwgPT4gdGhpcy5vblJlc291cmNlRW5jb2RpbmdDaGFuZ2UobW9kZWwucmVzb3VyY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMub25EaWRDaGFuZ2VFbmNvZGluZyhtb2RlbCA9PiB0aGlzLm9uUmVzb3VyY2VFbmNvZGluZ0NoYW5nZSgobW9kZWwucmVzb3VyY2UpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLnRhYkZvY3VzTW9kZS5vbkRpZENoYW5nZSwgKHRhYkZvY3VzTW9kZSkgPT4ge1xuXHRcdFx0aWYgKHRhYkZvY3VzTW9kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMub25UYWJGb2N1c01vZGVDaGFuZ2UodGFiRm9jdXNNb2RlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMub25UYWJGb2N1c01vZGVDaGFuZ2UodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLnRhYkZvY3VzTW9kZScpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuaW5wdXRNb2RlLm9uRGlkQ2hhbmdlLCAoaW5wdXRNb2RlKSA9PiB0aGlzLm9uSW5wdXRNb2RlQ2hhbmdlKGlucHV0TW9kZSA/PyAnaW5zZXJ0JykpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb21tYW5kcygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7IGlkOiBgY2hhbmdlRWRpdG9ySW5kZW50YXRpb24ke3RoaXMudGFyZ2V0V2luZG93SWR9YCwgaGFuZGxlcjogKCkgPT4gdGhpcy5zaG93SW5kZW50YXRpb25QaWNrZXIoKSB9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dJbmRlbnRhdGlvblBpY2tlcigpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGdldENvZGVFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRpZiAoIWFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm9FZGl0b3InLCBcIk5vIHRleHQgZWRpdG9yIGFjdGl2ZSBhdCB0aGlzIHRpbWVcIikgfV0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yPy5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdHJldHVybiB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdub1dyaXRhYmxlQ29kZUVkaXRvcicsIFwiVGhlIGFjdGl2ZSBjb2RlIGVkaXRvciBpcyByZWFkLW9ubHkuXCIpIH1dKTtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrczogUXVpY2tQaWNrSW5wdXQ8SVF1aWNrUGlja0l0ZW0gJiB7IHJ1bigpOiB2b2lkIH0+W10gPSBbXG5cdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZChhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRBY3Rpb24oSW5kZW50VXNpbmdTcGFjZXMuSUQpKSxcblx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldEFjdGlvbihJbmRlbnRVc2luZ1RhYnMuSUQpKSxcblx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldEFjdGlvbihDaGFuZ2VUYWJEaXNwbGF5U2l6ZS5JRCkpLFxuXHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0QWN0aW9uKERldGVjdEluZGVudGF0aW9uLklEKSksXG5cdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZChhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRBY3Rpb24oSW5kZW50YXRpb25Ub1NwYWNlc0FjdGlvbi5JRCkpLFxuXHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0QWN0aW9uKEluZGVudGF0aW9uVG9UYWJzQWN0aW9uLklEKSksXG5cdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZChhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRBY3Rpb24oVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUFjdGlvbi5JRCkpXG5cdFx0XS5tYXAoKGE6IElFZGl0b3JBY3Rpb24pID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBhLmlkLFxuXHRcdFx0XHRsYWJlbDogYS5sYWJlbCxcblx0XHRcdFx0ZGV0YWlsOiAoTGFuZ3VhZ2UuaXNEZWZhdWx0VmFyaWFudCgpIHx8IGEubGFiZWwgPT09IGEuYWxpYXMpID8gdW5kZWZpbmVkIDogYS5hbGlhcyxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0YWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZm9jdXMoKTtcblx0XHRcdFx0XHRhLnJ1bigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0cGlja3Muc3BsaWNlKDMsIDAsIHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnaW5kZW50Q29udmVydCcsIFwiY29udmVydCBmaWxlXCIpIH0pO1xuXHRcdHBpY2tzLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdpbmRlbnRWaWV3JywgXCJjaGFuZ2Ugdmlld1wiKSB9KTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywgeyBwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BpY2tBY3Rpb24nLCBcIlNlbGVjdCBBY3Rpb25cIiksIG1hdGNoT25EZXRhaWw6IHRydWUgfSk7XG5cdFx0cmV0dXJuIGFjdGlvbj8ucnVuKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRhYkZvY3VzTW9kZUVsZW1lbnQodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRpZiAoIXRoaXMudGFiRm9jdXNNb2RlRWxlbWVudC52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gbG9jYWxpemUoJ3RhYkZvY3VzTW9kZUVuYWJsZWQnLCBcIlRhYiBNb3ZlcyBGb2N1c1wiKTtcblx0XHRcdFx0dGhpcy50YWJGb2N1c01vZGVFbGVtZW50LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLmVkaXRvci50YWJGb2N1c01vZGUnLCBcIkFjY2Vzc2liaWxpdHkgTW9kZVwiKSxcblx0XHRcdFx0XHR0ZXh0LFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGlzYWJsZVRhYk1vZGUnLCBcIkRpc2FibGUgQWNjZXNzaWJpbGl0eSBNb2RlXCIpLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlZGl0b3IuYWN0aW9uLnRvZ2dsZVRhYkZvY3VzTW9kZScsXG5cdFx0XHRcdFx0a2luZDogJ3Byb21pbmVudCdcblx0XHRcdFx0fSwgJ3N0YXR1cy5lZGl0b3IudGFiRm9jdXNNb2RlJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuNyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGFiRm9jdXNNb2RlRWxlbWVudC5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5wdXRNb2RlRWxlbWVudChpbnB1dE1vZGU6ICdvdmVydHlwZScgfCAnaW5zZXJ0JyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChpbnB1dE1vZGUgPT09ICdvdmVydHlwZScpIHtcblx0XHRcdGlmICghdGhpcy5pbnB1dE1vZGVFbGVtZW50LnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBsb2NhbGl6ZSgnaW5wdXRNb2RlT3ZlcnR5cGUnLCAnT1ZSJyk7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBsb2NhbGl6ZSgnc3RhdHVzLmVkaXRvci5lbmFibGVJbnNlcnRNb2RlJywgXCJFbmFibGUgSW5zZXJ0IE1vZGVcIik7XG5cdFx0XHRcdHRoaXMuaW5wdXRNb2RlRWxlbWVudC52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeSh7XG5cdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHR0ZXh0LFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdFx0XHR0b29sdGlwOiBuYW1lLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlZGl0b3IuYWN0aW9uLnRvZ2dsZU92ZXJ0eXBlSW5zZXJ0TW9kZScsXG5cdFx0XHRcdFx0a2luZDogJ3Byb21pbmVudCdcblx0XHRcdFx0fSwgJ3N0YXR1cy5lZGl0b3IuaW5wdXRNb2RlJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuNik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW5wdXRNb2RlRWxlbWVudC5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29sdW1uU2VsZWN0aW9uTW9kZUVsZW1lbnQodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRpZiAoIXRoaXMuY29sdW1uU2VsZWN0aW9uTW9kZUVsZW1lbnQudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGxvY2FsaXplKCdjb2x1bW5TZWxlY3Rpb25Nb2RlRW5hYmxlZCcsIFwiQ29sdW1uIFNlbGVjdGlvblwiKTtcblx0XHRcdFx0dGhpcy5jb2x1bW5TZWxlY3Rpb25Nb2RlRWxlbWVudC52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeSh7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5lZGl0b3IuY29sdW1uU2VsZWN0aW9uTW9kZScsIFwiQ29sdW1uIFNlbGVjdGlvbiBNb2RlXCIpLFxuXHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkaXNhYmxlQ29sdW1uU2VsZWN0aW9uTW9kZScsIFwiRGlzYWJsZSBDb2x1bW4gU2VsZWN0aW9uIE1vZGVcIiksXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VkaXRvci5hY3Rpb24udG9nZ2xlQ29sdW1uU2VsZWN0aW9uJyxcblx0XHRcdFx0XHRraW5kOiAncHJvbWluZW50J1xuXHRcdFx0XHR9LCAnc3RhdHVzLmVkaXRvci5jb2x1bW5TZWxlY3Rpb25Nb2RlJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuOCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29sdW1uU2VsZWN0aW9uTW9kZUVsZW1lbnQuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNlbGVjdGlvbkVsZW1lbnQodGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHR0aGlzLnNlbGVjdGlvbkVsZW1lbnQuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JVUkkgPSBnZXRDb2RlRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk/LmdldE1vZGVsKCk/LnVyaTtcblx0XHRpZiAoZWRpdG9yVVJJPy5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGlvbkVsZW1lbnQuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9wczogSVN0YXR1c2JhckVudHJ5ID0ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5lZGl0b3Iuc2VsZWN0aW9uJywgXCJFZGl0b3IgU2VsZWN0aW9uXCIpLFxuXHRcdFx0dGV4dCxcblx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdnb3RvTGluZScsIFwiR28gdG8gTGluZS9Db2x1bW5cIiksXG5cdFx0XHRjb21tYW5kOiAnd29ya2JlbmNoLmFjdGlvbi5nb3RvTGluZSdcblx0XHR9O1xuXG5cdFx0dGhpcy51cGRhdGVFbGVtZW50KHRoaXMuc2VsZWN0aW9uRWxlbWVudCwgcHJvcHMsICdzdGF0dXMuZWRpdG9yLnNlbGVjdGlvbicsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAwLjUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbmRlbnRhdGlvbkVsZW1lbnQodGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHR0aGlzLmluZGVudGF0aW9uRWxlbWVudC5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvclVSSSA9IGdldENvZGVFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKT8uZ2V0TW9kZWwoKT8udXJpO1xuXHRcdGlmIChlZGl0b3JVUkk/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdHRoaXMuaW5kZW50YXRpb25FbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvcHM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLmluZGVudGF0aW9uJywgXCJFZGl0b3IgSW5kZW50YXRpb25cIiksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NlbGVjdEluZGVudGF0aW9uJywgXCJTZWxlY3QgSW5kZW50YXRpb25cIiksXG5cdFx0XHRjb21tYW5kOiBgY2hhbmdlRWRpdG9ySW5kZW50YXRpb24ke3RoaXMudGFyZ2V0V2luZG93SWR9YFxuXHRcdH07XG5cblx0XHR0aGlzLnVwZGF0ZUVsZW1lbnQodGhpcy5pbmRlbnRhdGlvbkVsZW1lbnQsIHByb3BzLCAnc3RhdHVzLmVkaXRvci5pbmRlbnRhdGlvbicsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAwLjQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFbmNvZGluZ0VsZW1lbnQodGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHR0aGlzLmVuY29kaW5nRWxlbWVudC5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3BzOiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLmVkaXRvci5lbmNvZGluZycsIFwiRWRpdG9yIEVuY29kaW5nXCIpLFxuXHRcdFx0dGV4dCxcblx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZWxlY3RFbmNvZGluZycsIFwiU2VsZWN0IEVuY29kaW5nXCIpLFxuXHRcdFx0Y29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLmNoYW5nZUVuY29kaW5nJ1xuXHRcdH07XG5cblx0XHR0aGlzLnVwZGF0ZUVsZW1lbnQodGhpcy5lbmNvZGluZ0VsZW1lbnQsIHByb3BzLCAnc3RhdHVzLmVkaXRvci5lbmNvZGluZycsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAwLjMpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFT0xFbGVtZW50KHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0dGhpcy5lb2xFbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvcHM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLmVvbCcsIFwiRWRpdG9yIEVuZCBvZiBMaW5lXCIpLFxuXHRcdFx0dGV4dCxcblx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZWxlY3RFT0wnLCBcIlNlbGVjdCBFbmQgb2YgTGluZSBTZXF1ZW5jZVwiKSxcblx0XHRcdGNvbW1hbmQ6ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRvci5jaGFuZ2VFT0wnXG5cdFx0fTtcblxuXHRcdHRoaXMudXBkYXRlRWxlbWVudCh0aGlzLmVvbEVsZW1lbnQsIHByb3BzLCAnc3RhdHVzLmVkaXRvci5lb2wnLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIDEwMC4yKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFuZ3VhZ2VJZEVsZW1lbnQodGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHR0aGlzLmxhbmd1YWdlRWxlbWVudC5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3BzOiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLmVkaXRvci5tb2RlJywgXCJFZGl0b3IgTGFuZ3VhZ2VcIiksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NlbGVjdExhbmd1YWdlTW9kZScsIFwiU2VsZWN0IExhbmd1YWdlIE1vZGVcIiksXG5cdFx0XHRjb21tYW5kOiAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3IuY2hhbmdlTGFuZ3VhZ2VNb2RlJ1xuXHRcdH07XG5cblx0XHR0aGlzLnVwZGF0ZUVsZW1lbnQodGhpcy5sYW5ndWFnZUVsZW1lbnQsIHByb3BzLCAnc3RhdHVzLmVkaXRvci5tb2RlJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuMSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1ldGFkYXRhRWxlbWVudCh0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHRoaXMubWV0YWRhdGFFbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvcHM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLmluZm8nLCBcIkZpbGUgSW5mb3JtYXRpb25cIiksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2ZpbGVJbmZvJywgXCJGaWxlIEluZm9ybWF0aW9uXCIpXG5cdFx0fTtcblxuXHRcdHRoaXMudXBkYXRlRWxlbWVudCh0aGlzLm1ldGFkYXRhRWxlbWVudCwgcHJvcHMsICdzdGF0dXMuZWRpdG9yLmluZm8nLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIDEwMCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVsZW1lbnQoZWxlbWVudDogTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+LCBwcm9wczogSVN0YXR1c2JhckVudHJ5LCBpZDogc3RyaW5nLCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudCwgcHJpb3JpdHk6IG51bWJlcikge1xuXHRcdGlmICghZWxlbWVudC52YWx1ZSkge1xuXHRcdFx0ZWxlbWVudC52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShwcm9wcywgaWQsIGFsaWdubWVudCwgcHJpb3JpdHkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbGVtZW50LnZhbHVlLnVwZGF0ZShwcm9wcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0ZSh1cGRhdGU6IFN0YXRlRGVsdGEpOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VkID0gdGhpcy5zdGF0ZS51cGRhdGUodXBkYXRlKTtcblx0XHRpZiAoIWNoYW5nZWQuaGFzQ2hhbmdlcygpKSB7XG5cdFx0XHRyZXR1cm47IC8vIE5vdGhpbmcgcmVhbGx5IGNoYW5nZWRcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudG9SZW5kZXIpIHtcblx0XHRcdHRoaXMudG9SZW5kZXIgPSBjaGFuZ2VkO1xuXG5cdFx0XHR0aGlzLmRlbGF5ZWRSZW5kZXIudmFsdWUgPSBydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZ2V0V2luZG93QnlJZCh0aGlzLnRhcmdldFdpbmRvd0lkLCB0cnVlKS53aW5kb3csICgpID0+IHtcblx0XHRcdFx0dGhpcy5kZWxheWVkUmVuZGVyLmNsZWFyKCk7XG5cblx0XHRcdFx0Y29uc3QgdG9SZW5kZXIgPSB0aGlzLnRvUmVuZGVyO1xuXHRcdFx0XHR0aGlzLnRvUmVuZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodG9SZW5kZXIpIHtcblx0XHRcdFx0XHR0aGlzLmRvUmVuZGVyTm93KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvUmVuZGVyLmNvbWJpbmUoY2hhbmdlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1JlbmRlck5vdygpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVRhYkZvY3VzTW9kZUVsZW1lbnQoISF0aGlzLnN0YXRlLnRhYkZvY3VzTW9kZSk7XG5cdFx0dGhpcy51cGRhdGVJbnB1dE1vZGVFbGVtZW50KHRoaXMuc3RhdGUuaW5wdXRNb2RlKTtcblx0XHR0aGlzLnVwZGF0ZUNvbHVtblNlbGVjdGlvbk1vZGVFbGVtZW50KCEhdGhpcy5zdGF0ZS5jb2x1bW5TZWxlY3Rpb25Nb2RlKTtcblx0XHR0aGlzLnVwZGF0ZUluZGVudGF0aW9uRWxlbWVudCh0aGlzLnN0YXRlLmluZGVudGF0aW9uKTtcblx0XHR0aGlzLnVwZGF0ZVNlbGVjdGlvbkVsZW1lbnQodGhpcy5zdGF0ZS5zZWxlY3Rpb25TdGF0dXMpO1xuXHRcdHRoaXMudXBkYXRlRW5jb2RpbmdFbGVtZW50KHRoaXMuc3RhdGUuZW5jb2RpbmcpO1xuXHRcdHRoaXMudXBkYXRlRU9MRWxlbWVudCh0aGlzLnN0YXRlLkVPTCA/IHRoaXMuc3RhdGUuRU9MID09PSAnXFxyXFxuJyA/IG5sc0VPTENSTEYgOiBubHNFT0xMRiA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy51cGRhdGVMYW5ndWFnZUlkRWxlbWVudCh0aGlzLnN0YXRlLmxhbmd1YWdlSWQpO1xuXHRcdHRoaXMudXBkYXRlTWV0YWRhdGFFbGVtZW50KHRoaXMuc3RhdGUubWV0YWRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3Rpb25MYWJlbChpbmZvOiBJRWRpdG9yU2VsZWN0aW9uU3RhdHVzKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWluZm8/LnNlbGVjdGlvbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGluZm8uc2VsZWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGlmIChpbmZvLmNoYXJhY3RlcnNTZWxlY3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gZm9ybWF0KG5sc1NpbmdsZVNlbGVjdGlvblJhbmdlLCBpbmZvLnNlbGVjdGlvbnNbMF0ucG9zaXRpb25MaW5lTnVtYmVyLCBpbmZvLnNlbGVjdGlvbnNbMF0ucG9zaXRpb25Db2x1bW4sIGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZvcm1hdChubHNTaW5nbGVTZWxlY3Rpb24sIGluZm8uc2VsZWN0aW9uc1swXS5wb3NpdGlvbkxpbmVOdW1iZXIsIGluZm8uc2VsZWN0aW9uc1swXS5wb3NpdGlvbkNvbHVtbik7XG5cdFx0fVxuXG5cdFx0aWYgKGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm4gZm9ybWF0KG5sc011bHRpU2VsZWN0aW9uUmFuZ2UsIGluZm8uc2VsZWN0aW9ucy5sZW5ndGgsIGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkKTtcblx0XHR9XG5cblx0XHRpZiAoaW5mby5zZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBmb3JtYXQobmxzTXVsdGlTZWxlY3Rpb24sIGluZm8uc2VsZWN0aW9ucy5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1c0JhcigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVJbnB1dCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGNvbnN0IGFjdGl2ZUNvZGVFZGl0b3IgPSBhY3RpdmVFZGl0b3JQYW5lID8gZ2V0Q29kZUVkaXRvcihhY3RpdmVFZGl0b3JQYW5lLmdldENvbnRyb2woKSkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gVXBkYXRlIGFsbCBzdGF0ZXNcblx0XHR0aGlzLm9uQ29sdW1uU2VsZWN0aW9uTW9kZUNoYW5nZShhY3RpdmVDb2RlRWRpdG9yKTtcblx0XHR0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdHRoaXMub25MYW5ndWFnZUNoYW5nZShhY3RpdmVDb2RlRWRpdG9yLCBhY3RpdmVJbnB1dCk7XG5cdFx0dGhpcy5vbkVPTENoYW5nZShhY3RpdmVDb2RlRWRpdG9yKTtcblx0XHR0aGlzLm9uRW5jb2RpbmdDaGFuZ2UoYWN0aXZlRWRpdG9yUGFuZSwgYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0dGhpcy5vbkluZGVudGF0aW9uQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdHRoaXMub25NZXRhZGF0YUNoYW5nZShhY3RpdmVFZGl0b3JQYW5lKTtcblx0XHR0aGlzLmN1cnJlbnRNYXJrZXJTdGF0dXMudXBkYXRlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXG5cdFx0Ly8gRGlzcG9zZSBvbGQgYWN0aXZlIGVkaXRvciBsaXN0ZW5lcnNcblx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5jbGVhcigpO1xuXG5cdFx0Ly8gQXR0YWNoIG5ldyBsaXN0ZW5lcnMgdG8gYWN0aXZlIGVkaXRvclxuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQoYWN0aXZlRWRpdG9yUGFuZS5vbkRpZENoYW5nZUNvbnRyb2woKCkgPT4ge1xuXHRcdFx0XHQvLyBTaW5jZSBvdXIgZWRpdG9yIHN0YXR1cyBpcyBtYWlubHkgb2JzZXJ2aW5nIHRoZVxuXHRcdFx0XHQvLyBhY3RpdmUgZWRpdG9yIGNvbnRyb2wsIGRvIGEgZnVsbCB1cGRhdGUgd2hlbmV2ZXJcblx0XHRcdFx0Ly8gdGhlIGNvbnRyb2wgY2hhbmdlcy5cblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXNCYXIoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBBdHRhY2ggbmV3IGxpc3RlbmVycyB0byBhY3RpdmUgY29kZSBlZGl0b3Jcblx0XHRpZiAoYWN0aXZlQ29kZUVkaXRvcikge1xuXG5cdFx0XHQvLyBIb29rIExpc3RlbmVyIGZvciBDb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChhY3RpdmVDb2RlRWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZXZlbnQ6IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmNvbHVtblNlbGVjdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLm9uQ29sdW1uU2VsZWN0aW9uTW9kZUNoYW5nZShhY3RpdmVDb2RlRWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBIb29rIExpc3RlbmVyIGZvciBTZWxlY3Rpb24gY2hhbmdlc1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKEV2ZW50LmRlZmVyKGFjdGl2ZUNvZGVFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbikoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRNYXJrZXJTdGF0dXMudXBkYXRlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBIb29rIExpc3RlbmVyIGZvciBsYW5ndWFnZSBjaGFuZ2VzXG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQoYWN0aXZlQ29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uTGFuZ3VhZ2VDaGFuZ2UoYWN0aXZlQ29kZUVkaXRvciwgYWN0aXZlSW5wdXQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBIb29rIExpc3RlbmVyIGZvciBjb250ZW50IGNoYW5nZXNcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChFdmVudC5hY2N1bXVsYXRlKGFjdGl2ZUNvZGVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQpKGUgPT4ge1xuXHRcdFx0XHR0aGlzLm9uRU9MQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRNYXJrZXJTdGF0dXMudXBkYXRlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBhY3RpdmVDb2RlRWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGlubmVyIG9mIGUpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGlubmVyLmNoYW5nZXMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHNlbGVjdGlvbnMuc29tZShzZWxlY3Rpb24gPT4gUmFuZ2UuYXJlSW50ZXJzZWN0aW5nKHNlbGVjdGlvbiwgY2hhbmdlLnJhbmdlKSkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEhvb2sgTGlzdGVuZXIgZm9yIGNvbnRlbnQgb3B0aW9ucyBjaGFuZ2VzXG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQoYWN0aXZlQ29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsT3B0aW9ucygoKSA9PiB7XG5cdFx0XHRcdHRoaXMub25JbmRlbnRhdGlvbkNoYW5nZShhY3RpdmVDb2RlRWRpdG9yKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgYmluYXJ5IGVkaXRvcnNcblx0XHRlbHNlIGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgQmFzZUJpbmFyeVJlc291cmNlRWRpdG9yIHx8IGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBCaW5hcnlSZXNvdXJjZURpZmZFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGJpbmFyeUVkaXRvcnM6IEJhc2VCaW5hcnlSZXNvdXJjZUVkaXRvcltdID0gW107XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIEJpbmFyeVJlc291cmNlRGlmZkVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5ID0gYWN0aXZlRWRpdG9yUGFuZS5nZXRQcmltYXJ5RWRpdG9yUGFuZSgpO1xuXHRcdFx0XHRpZiAocHJpbWFyeSBpbnN0YW5jZW9mIEJhc2VCaW5hcnlSZXNvdXJjZUVkaXRvcikge1xuXHRcdFx0XHRcdGJpbmFyeUVkaXRvcnMucHVzaChwcmltYXJ5KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlY29uZGFyeSA9IGFjdGl2ZUVkaXRvclBhbmUuZ2V0U2Vjb25kYXJ5RWRpdG9yUGFuZSgpO1xuXHRcdFx0XHRpZiAoc2Vjb25kYXJ5IGluc3RhbmNlb2YgQmFzZUJpbmFyeVJlc291cmNlRWRpdG9yKSB7XG5cdFx0XHRcdFx0YmluYXJ5RWRpdG9ycy5wdXNoKHNlY29uZGFyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJpbmFyeUVkaXRvcnMucHVzaChhY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgYmluYXJ5RWRpdG9ycykge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTWV0YWRhdGEoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMub25NZXRhZGF0YUNoYW5nZShhY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChlZGl0b3Iub25EaWRPcGVuSW5QbGFjZSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXNCYXIoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25MYW5ndWFnZUNoYW5nZShlZGl0b3JXaWRnZXQ6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkLCBlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvOiBTdGF0ZURlbHRhID0geyB0eXBlOiAnbGFuZ3VhZ2VJZCcsIGxhbmd1YWdlSWQ6IHVuZGVmaW5lZCB9O1xuXG5cdFx0Ly8gV2Ugb25seSBzdXBwb3J0IHRleHQgYmFzZWQgZWRpdG9yc1xuXHRcdGlmIChlZGl0b3JXaWRnZXQgJiYgZWRpdG9ySW5wdXQgJiYgdG9FZGl0b3JXaXRoTGFuZ3VhZ2VTdXBwb3J0KGVkaXRvcklucHV0KSkge1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk7XG5cdFx0XHRpZiAodGV4dE1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0XHRpbmZvLmxhbmd1YWdlSWQgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2VJZCkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU3RhdGUoaW5mbyk7XG5cdH1cblxuXHRwcml2YXRlIG9uSW5kZW50YXRpb25DaGFuZ2UoZWRpdG9yV2lkZ2V0OiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHVwZGF0ZTogU3RhdGVEZWx0YSA9IHsgdHlwZTogJ2luZGVudGF0aW9uJywgaW5kZW50YXRpb246IHVuZGVmaW5lZCB9O1xuXG5cdFx0aWYgKGVkaXRvcldpZGdldCkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRjb25zdCBtb2RlbE9wdHMgPSBtb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0XHRcdHVwZGF0ZS5pbmRlbnRhdGlvbiA9IChcblx0XHRcdFx0XHRtb2RlbE9wdHMuaW5zZXJ0U3BhY2VzXG5cdFx0XHRcdFx0XHQ/IG1vZGVsT3B0cy50YWJTaXplID09PSBtb2RlbE9wdHMuaW5kZW50U2l6ZVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzcGFjZXNTaXplJywgXCJTcGFjZXM6IHswfVwiLCBtb2RlbE9wdHMuaW5kZW50U2l6ZSlcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnc3BhY2VzQW5kVGFic1NpemUnLCBcIlNwYWNlczogezB9IChUYWIgU2l6ZTogezF9KVwiLCBtb2RlbE9wdHMuaW5kZW50U2l6ZSwgbW9kZWxPcHRzLnRhYlNpemUpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKHsga2V5OiAndGFiU2l6ZScsIGNvbW1lbnQ6IFsnVGFiIGNvcnJlc3BvbmRzIHRvIHRoZSB0YWIga2V5J10gfSwgXCJUYWIgU2l6ZTogezB9XCIsIG1vZGVsT3B0cy50YWJTaXplKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU3RhdGUodXBkYXRlKTtcblx0fVxuXG5cdHByaXZhdGUgb25NZXRhZGF0YUNoYW5nZShlZGl0b3I6IElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdXBkYXRlOiBTdGF0ZURlbHRhID0geyB0eXBlOiAnbWV0YWRhdGEnLCBtZXRhZGF0YTogdW5kZWZpbmVkIH07XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgQmFzZUJpbmFyeVJlc291cmNlRWRpdG9yIHx8IGVkaXRvciBpbnN0YW5jZW9mIEJpbmFyeVJlc291cmNlRGlmZkVkaXRvcikge1xuXHRcdFx0dXBkYXRlLm1ldGFkYXRhID0gZWRpdG9yLmdldE1ldGFkYXRhKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdGF0ZSh1cGRhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbHVtblNlbGVjdGlvbk1vZGVDaGFuZ2UoZWRpdG9yV2lkZ2V0OiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGluZm86IFN0YXRlRGVsdGEgPSB7IHR5cGU6ICdjb2x1bW5TZWxlY3Rpb25Nb2RlJywgY29sdW1uU2VsZWN0aW9uTW9kZTogZmFsc2UgfTtcblxuXHRcdGlmIChlZGl0b3JXaWRnZXQ/LmdldE9wdGlvbihFZGl0b3JPcHRpb24uY29sdW1uU2VsZWN0aW9uKSkge1xuXHRcdFx0aW5mby5jb2x1bW5TZWxlY3Rpb25Nb2RlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVN0YXRlKGluZm8pO1xuXHR9XG5cblx0cHJpdmF0ZSBvblNlbGVjdGlvbkNoYW5nZShlZGl0b3JXaWRnZXQ6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5mbzogSUVkaXRvclNlbGVjdGlvblN0YXR1cyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHQvLyBXZSBvbmx5IHN1cHBvcnQgdGV4dCBiYXNlZCBlZGl0b3JzXG5cdFx0aWYgKGVkaXRvcldpZGdldCkge1xuXG5cdFx0XHQvLyBDb21wdXRlIHNlbGVjdGlvbihzKVxuXHRcdFx0aW5mby5zZWxlY3Rpb25zID0gZWRpdG9yV2lkZ2V0LmdldFNlbGVjdGlvbnMoKSB8fCBbXTtcblxuXHRcdFx0Ly8gQ29tcHV0ZSBzZWxlY3Rpb24gbGVuZ3RoXG5cdFx0XHRpbmZvLmNoYXJhY3RlcnNTZWxlY3RlZCA9IDA7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICh0ZXh0TW9kZWwpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2YgaW5mby5zZWxlY3Rpb25zKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBpbmZvLmNoYXJhY3RlcnNTZWxlY3RlZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkID0gMDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpbmZvLmNoYXJhY3RlcnNTZWxlY3RlZCArPSB0ZXh0TW9kZWwuZ2V0Q2hhcmFjdGVyQ291bnRJblJhbmdlKHNlbGVjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29tcHV0ZSB0aGUgdmlzaWJsZSBjb2x1bW4gZm9yIG9uZSBzZWxlY3Rpb24uIFRoaXMgd2lsbCBwcm9wZXJseSBoYW5kbGUgdGFicyBhbmQgdGhlaXIgY29uZmlndXJlZCB3aWR0aHNcblx0XHRcdGlmIChpbmZvLnNlbGVjdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBvc2l0aW9uID0gZWRpdG9yV2lkZ2V0LmdldFBvc2l0aW9uKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uQ2xvbmUgPSBuZXcgU2VsZWN0aW9uKFxuXHRcdFx0XHRcdGluZm8uc2VsZWN0aW9uc1swXS5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0aW5mby5zZWxlY3Rpb25zWzBdLnNlbGVjdGlvblN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdGluZm8uc2VsZWN0aW9uc1swXS5wb3NpdGlvbkxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZWRpdG9yUG9zaXRpb24gPyBlZGl0b3JXaWRnZXQuZ2V0U3RhdHVzYmFyQ29sdW1uKGVkaXRvclBvc2l0aW9uKSA6IGluZm8uc2VsZWN0aW9uc1swXS5wb3NpdGlvbkNvbHVtblxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGluZm8uc2VsZWN0aW9uc1swXSA9IHNlbGVjdGlvbkNsb25lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU3RhdGUoeyB0eXBlOiAnc2VsZWN0aW9uU3RhdHVzJywgc2VsZWN0aW9uU3RhdHVzOiB0aGlzLmdldFNlbGVjdGlvbkxhYmVsKGluZm8pIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVPTENoYW5nZShlZGl0b3JXaWRnZXQ6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5mbzogU3RhdGVEZWx0YSA9IHsgdHlwZTogJ0VPTCcsIEVPTDogdW5kZWZpbmVkIH07XG5cblx0XHRpZiAoZWRpdG9yV2lkZ2V0ICYmICFlZGl0b3JXaWRnZXQuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdGNvbnN0IGNvZGVFZGl0b3JNb2RlbCA9IGVkaXRvcldpZGdldC5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKGNvZGVFZGl0b3JNb2RlbCkge1xuXHRcdFx0XHRpbmZvLkVPTCA9IGNvZGVFZGl0b3JNb2RlbC5nZXRFT0woKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVN0YXRlKGluZm8pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVuY29kaW5nQ2hhbmdlKGVkaXRvcjogSUVkaXRvclBhbmUgfCB1bmRlZmluZWQsIGVkaXRvcldpZGdldDogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoZWRpdG9yICYmICF0aGlzLmlzQWN0aXZlRWRpdG9yKGVkaXRvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmZvOiBTdGF0ZURlbHRhID0geyB0eXBlOiAnZW5jb2RpbmcnLCBlbmNvZGluZzogdW5kZWZpbmVkIH07XG5cblx0XHQvLyBXZSBvbmx5IHN1cHBvcnQgdGV4dCBiYXNlZCBlZGl0b3JzIHRoYXQgaGF2ZSBhIG1vZGVsIGFzc29jaWF0ZWRcblx0XHQvLyBUaGlzIGVuc3VyZXMgd2UgZG8gbm90IHNob3cgdGhlIGVuY29kaW5nIHBpY2tlciB3aGlsZSBhbiBlZGl0b3Jcblx0XHQvLyBpcyBzdGlsbCBsb2FkaW5nLlxuXHRcdGlmIChlZGl0b3IgJiYgZWRpdG9yV2lkZ2V0Py5oYXNNb2RlbCgpKSB7XG5cdFx0XHRjb25zdCBlbmNvZGluZ1N1cHBvcnQ6IElFbmNvZGluZ1N1cHBvcnQgfCBudWxsID0gZWRpdG9yLmlucHV0ID8gdG9FZGl0b3JXaXRoRW5jb2RpbmdTdXBwb3J0KGVkaXRvci5pbnB1dCkgOiBudWxsO1xuXHRcdFx0aWYgKGVuY29kaW5nU3VwcG9ydCkge1xuXHRcdFx0XHRjb25zdCByYXdFbmNvZGluZyA9IGVuY29kaW5nU3VwcG9ydC5nZXRFbmNvZGluZygpO1xuXHRcdFx0XHRjb25zdCBlbmNvZGluZ0luZm8gPSB0eXBlb2YgcmF3RW5jb2RpbmcgPT09ICdzdHJpbmcnID8gU1VQUE9SVEVEX0VOQ09ESU5HU1tyYXdFbmNvZGluZ10gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChlbmNvZGluZ0luZm8pIHtcblx0XHRcdFx0XHRpbmZvLmVuY29kaW5nID0gZW5jb2RpbmdJbmZvLmxhYmVsU2hvcnQ7IC8vIGlmIHdlIGhhdmUgYSBsYWJlbCwgdGFrZSBpdCBmcm9tIHRoZXJlXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5mby5lbmNvZGluZyA9IHJhd0VuY29kaW5nOyAvLyBvdGhlcndpc2UgdXNlIGl0IHJhd1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdGF0ZShpbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgb25SZXNvdXJjZUVuY29kaW5nQ2hhbmdlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdFx0aWYgKGFjdGl2ZVJlc291cmNlICYmIGlzRXF1YWwoYWN0aXZlUmVzb3VyY2UsIHJlc291cmNlKSkge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVDb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcihhY3RpdmVFZGl0b3JQYW5lLmdldENvbnRyb2woKSkgPz8gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLm9uRW5jb2RpbmdDaGFuZ2UoYWN0aXZlRWRpdG9yUGFuZSwgYWN0aXZlQ29kZUVkaXRvcik7IC8vIG9ubHkgdXBkYXRlIGlmIHRoZSBlbmNvZGluZyBjaGFuZ2VkIGZvciB0aGUgYWN0aXZlIHJlc291cmNlXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRhYkZvY3VzTW9kZUNoYW5nZSh0YWJGb2N1c01vZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvOiBTdGF0ZURlbHRhID0geyB0eXBlOiAndGFiRm9jdXNNb2RlJywgdGFiRm9jdXNNb2RlIH07XG5cdFx0dGhpcy51cGRhdGVTdGF0ZShpbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgb25JbnB1dE1vZGVDaGFuZ2UoaW5wdXRNb2RlOiAnaW5zZXJ0JyB8ICdvdmVydHlwZScpOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvOiBTdGF0ZURlbHRhID0geyB0eXBlOiAnaW5wdXRNb2RlJywgaW5wdXRNb2RlIH07XG5cdFx0dGhpcy51cGRhdGVTdGF0ZShpbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgaXNBY3RpdmVFZGl0b3IoY29udHJvbDogSUVkaXRvclBhbmUpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHRyZXR1cm4gISFhY3RpdmVFZGl0b3JQYW5lICYmIGFjdGl2ZUVkaXRvclBhbmUgPT09IGNvbnRyb2w7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvclN0YXR1c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuZWRpdG9yU3RhdHVzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGVkaXRvckdyb3VwU2VydmljZS5wYXJ0cykge1xuXHRcdFx0dGhpcy5jcmVhdGVFZGl0b3JTdGF0dXMocGFydCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydChwYXJ0ID0+IHRoaXMuY3JlYXRlRWRpdG9yU3RhdHVzKHBhcnQpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVkaXRvclN0YXR1cyhwYXJ0OiBJRWRpdG9yUGFydCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdEV2ZW50Lm9uY2UocGFydC5vbldpbGxEaXNwb3NlKSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRTY29wZWRJbnN0YW50aWF0aW9uU2VydmljZShwYXJ0KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yU3RhdHVzLCBwYXJ0LndpbmRvd0lkKSk7XG5cdH1cbn1cblxuY2xhc3MgU2hvd0N1cnJlbnRNYXJrZXJJblN0YXR1c2JhckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzQmFyRW50cnlBY2Nlc3NvcjogTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+O1xuXHRwcml2YXRlIGVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWFya2VyczogSU1hcmtlcltdID0gW107XG5cdHByaXZhdGUgY3VycmVudE1hcmtlcjogSU1hcmtlciB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zdGF0dXNCYXJFbnRyeUFjY2Vzc29yID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKGNoYW5nZWRSZXNvdXJjZXMgPT4gdGhpcy5vbk1hcmtlckNoYW5nZWQoY2hhbmdlZFJlc291cmNlcykpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Byb2JsZW1zLnNob3dDdXJyZW50SW5TdGF0dXMnKSkoKCkgPT4gdGhpcy51cGRhdGVTdGF0dXMoKSkpO1xuXHR9XG5cblx0dXBkYXRlKGVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvciA9IGVkaXRvcjtcblxuXHRcdHRoaXMudXBkYXRlTWFya2VycygpO1xuXHRcdHRoaXMudXBkYXRlU3RhdHVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1cygpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c01hcmtlciA9IHRoaXMuY3VycmVudE1hcmtlcjtcblx0XHR0aGlzLmN1cnJlbnRNYXJrZXIgPSB0aGlzLmdldE1hcmtlcigpO1xuXHRcdGlmICh0aGlzLmhhc1RvVXBkYXRlU3RhdHVzKHByZXZpb3VzTWFya2VyLCB0aGlzLmN1cnJlbnRNYXJrZXIpKSB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50TWFya2VyKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBzcGxpdExpbmVzKHRoaXMuY3VycmVudE1hcmtlci5tZXNzYWdlKVswXTtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGAke3RoaXMuZ2V0VHlwZSh0aGlzLmN1cnJlbnRNYXJrZXIpfSAke2xpbmV9YDtcblx0XHRcdFx0aWYgKCF0aGlzLnN0YXR1c0JhckVudHJ5QWNjZXNzb3IudmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLnN0YXR1c0JhckVudHJ5QWNjZXNzb3IudmFsdWUgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoeyBuYW1lOiBsb2NhbGl6ZSgnY3VycmVudFByb2JsZW0nLCBcIkN1cnJlbnQgUHJvYmxlbVwiKSwgdGV4dCwgYXJpYUxhYmVsOiB0ZXh0IH0sICdzdGF0dXNiYXIuY3VycmVudFByb2JsZW0nLCBTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0dXNCYXJFbnRyeUFjY2Vzc29yLnZhbHVlLnVwZGF0ZSh7IG5hbWU6IGxvY2FsaXplKCdjdXJyZW50UHJvYmxlbScsIFwiQ3VycmVudCBQcm9ibGVtXCIpLCB0ZXh0LCBhcmlhTGFiZWw6IHRleHQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc3RhdHVzQmFyRW50cnlBY2Nlc3Nvci5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFzVG9VcGRhdGVTdGF0dXMocHJldmlvdXNNYXJrZXI6IElNYXJrZXIgfCBudWxsLCBjdXJyZW50TWFya2VyOiBJTWFya2VyIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGlmICghY3VycmVudE1hcmtlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCFwcmV2aW91c01hcmtlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIElNYXJrZXJEYXRhLm1ha2VLZXkocHJldmlvdXNNYXJrZXIpICE9PSBJTWFya2VyRGF0YS5tYWtlS2V5KGN1cnJlbnRNYXJrZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUeXBlKG1hcmtlcjogSU1hcmtlcik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChtYXJrZXIuc2V2ZXJpdHkpIHtcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuRXJyb3I6IHJldHVybiAnJChlcnJvciknO1xuXHRcdFx0Y2FzZSBNYXJrZXJTZXZlcml0eS5XYXJuaW5nOiByZXR1cm4gJyQod2FybmluZyknO1xuXHRcdFx0Y2FzZSBNYXJrZXJTZXZlcml0eS5JbmZvOiByZXR1cm4gJyQoaW5mbyknO1xuXHRcdH1cblxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFya2VyKCk6IElNYXJrZXIgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3Byb2JsZW1zLnNob3dDdXJyZW50SW5TdGF0dXMnKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5tYXJrZXJzLmZpbmQobWFya2VyID0+IFJhbmdlLmNvbnRhaW5zUG9zaXRpb24obWFya2VyLCBwb3NpdGlvbikpIHx8IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIG9uTWFya2VyQ2hhbmdlZChjaGFuZ2VkUmVzb3VyY2VzOiByZWFkb25seSBVUklbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbCAmJiAhY2hhbmdlZFJlc291cmNlcy5zb21lKHIgPT4gaXNFcXVhbChtb2RlbC51cmksIHIpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlTWFya2VycygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNYXJrZXJzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0dGhpcy5tYXJrZXJzID0gdGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoe1xuXHRcdFx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdFx0XHRzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5FcnJvciB8IE1hcmtlclNldmVyaXR5Lldhcm5pbmcgfCBNYXJrZXJTZXZlcml0eS5JbmZvXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMubWFya2Vycy5zb3J0KHRoaXMuY29tcGFyZU1hcmtlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFya2VycyA9IFtdO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU3RhdHVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXBhcmVNYXJrZXIoYTogSU1hcmtlciwgYjogSU1hcmtlcik6IG51bWJlciB7XG5cdFx0bGV0IHJlcyA9IGNvbXBhcmUoYS5yZXNvdXJjZS50b1N0cmluZygpLCBiLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChyZXMgPT09IDApIHtcblx0XHRcdHJlcyA9IE1hcmtlclNldmVyaXR5LmNvbXBhcmUoYS5zZXZlcml0eSwgYi5zZXZlcml0eSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlcyA9PT0gMCkge1xuXHRcdFx0cmVzID0gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEsIGIpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYW5nZUxhbmd1YWdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLmNoYW5nZUxhbmd1YWdlTW9kZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYW5nZUxhbmd1YWdlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhbmdlTW9kZScsICdDaGFuZ2UgTGFuZ3VhZ2UgTW9kZScpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlNKVxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIubm90KCdub3RlYm9va0VkaXRvckZvY3VzZWQnKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhbmdlTGFuZ3VhZ2VNb2RlLmRlc2NyaXB0aW9uJywgXCJDaGFuZ2UgdGhlIGxhbmd1YWdlIG1vZGUgb2YgdGhlIGFjdGl2ZSB0ZXh0IGVkaXRvci5cIiksXG5cdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnY2hhbmdlTGFuZ3VhZ2VNb2RlLmFyZy5uYW1lJywgXCJUaGUgbmFtZSBvZiB0aGUgbGFuZ3VhZ2UgbW9kZSB0byBjaGFuZ2UgdG8uXCIpLFxuXHRcdFx0XHRcdFx0Y29uc3RyYWludDogKHZhbHVlOiB1bmtub3duKSA9PiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBsYW5ndWFnZU1vZGU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZURldGVjdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0RmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgZ2FsbGVyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRpZiAoIWFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm9FZGl0b3InLCBcIk5vIHRleHQgZWRpdG9yIGFjdGl2ZSBhdCB0aGlzIHRpbWVcIikgfV0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cblx0XHQvLyBDb21wdXRlIGxhbmd1YWdlXG5cdFx0bGV0IGN1cnJlbnRMYW5ndWFnZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY3VycmVudExhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGV4dE1vZGVsKSB7XG5cdFx0XHRjdXJyZW50TGFuZ3VhZ2VJZCA9IHRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRjdXJyZW50TGFuZ3VhZ2VOYW1lID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShjdXJyZW50TGFuZ3VhZ2VJZCkgPz8gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBoYXNMYW5ndWFnZVN1cHBvcnQgPSAhIXJlc291cmNlO1xuXHRcdGlmIChyZXNvdXJjZT8uc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkICYmICF0ZXh0RmlsZVNlcnZpY2UudW50aXRsZWQuZ2V0KHJlc291cmNlKT8uaGFzQXNzb2NpYXRlZEZpbGVQYXRoKSB7XG5cdFx0XHRoYXNMYW5ndWFnZVN1cHBvcnQgPSBmYWxzZTsgLy8gbm8gY29uZmlndXJhdGlvbiBmb3IgdW50aXRsZWQgcmVzb3VyY2VzIChlLmcuIFwiVW50aXRsZWQtMVwiKVxuXHRcdH1cblxuXHRcdC8vIEFsbCBsYW5ndWFnZXMgYXJlIHZhbGlkIHBpY2tzXG5cdFx0Y29uc3QgbGFuZ3VhZ2VzID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldFNvcnRlZFJlZ2lzdGVyZWRMYW5ndWFnZU5hbWVzKCk7XG5cdFx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0W10gPSBsYW5ndWFnZXNcblx0XHRcdC5tYXAoKHsgbGFuZ3VhZ2VOYW1lLCBsYW5ndWFnZUlkIH0pID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGxhbmd1YWdlU2VydmljZS5nZXRFeHRlbnNpb25zKGxhbmd1YWdlSWQpLmpvaW4oJyAnKTtcblx0XHRcdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChjdXJyZW50TGFuZ3VhZ2VOYW1lID09PSBsYW5ndWFnZU5hbWUpIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdsYW5ndWFnZURlc2NyaXB0aW9uJywgXCIoezB9KSAtIENvbmZpZ3VyZWQgTGFuZ3VhZ2VcIiwgbGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnbGFuZ3VhZ2VEZXNjcmlwdGlvbkNvbmZpZ3VyZWQnLCBcIih7MH0pXCIsIGxhbmd1YWdlSWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogbGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRsYWJlbDogbGFuZ3VhZ2VOYW1lLFxuXHRcdFx0XHRcdG1ldGE6IGV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0aWNvbkNsYXNzZXM6IGdldEljb25DbGFzc2VzRm9yTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvblxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHRwaWNrcy51bnNoaWZ0KHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbGFuZ3VhZ2VzUGlja3MnLCBcImxhbmd1YWdlcyAoaWRlbnRpZmllcilcIikgfSk7XG5cblx0XHQvLyBPZmZlciBhY3Rpb24gdG8gY29uZmlndXJlIHZpYSBzZXR0aW5nc1xuXHRcdGxldCBjb25maWd1cmVMYW5ndWFnZUFzc29jaWF0aW9uczogSVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbmZpZ3VyZUxhbmd1YWdlU2V0dGluZ3M6IElRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBnYWxsZXJ5QWN0aW9uOiBJQWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChoYXNMYW5ndWFnZVN1cHBvcnQgJiYgcmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGV4dCA9IGV4dG5hbWUocmVzb3VyY2UpIHx8IGJhc2VuYW1lKHJlc291cmNlKTtcblxuXHRcdFx0aWYgKGdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdGdhbGxlcnlBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNob3dMYW5ndWFnZUV4dGVuc2lvbnMnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2hvd0xhbmd1YWdlRXh0ZW5zaW9ucycsIFwiU2VhcmNoIE1hcmtldHBsYWNlIEV4dGVuc2lvbnMgZm9yICd7MH0nLi4uXCIsIGV4dCksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dFeHRlbnNpb25zRm9yTGFuZ3VhZ2UnLCBleHQpXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRwaWNrcy51bnNoaWZ0KGdhbGxlcnlBY3Rpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25maWd1cmVMYW5ndWFnZVNldHRpbmdzID0geyBsYWJlbDogbG9jYWxpemUoJ2NvbmZpZ3VyZU1vZGVTZXR0aW5ncycsIFwiQ29uZmlndXJlICd7MH0nIGxhbmd1YWdlIGJhc2VkIHNldHRpbmdzLi4uXCIsIGN1cnJlbnRMYW5ndWFnZU5hbWUpIH07XG5cdFx0XHRwaWNrcy51bnNoaWZ0KGNvbmZpZ3VyZUxhbmd1YWdlU2V0dGluZ3MpO1xuXHRcdFx0Y29uZmlndXJlTGFuZ3VhZ2VBc3NvY2lhdGlvbnMgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlQXNzb2NpYXRpb25zRXh0JywgXCJDb25maWd1cmUgRmlsZSBBc3NvY2lhdGlvbiBmb3IgJ3swfScuLi5cIiwgZXh0KSB9O1xuXHRcdFx0cGlja3MudW5zaGlmdChjb25maWd1cmVMYW5ndWFnZUFzc29jaWF0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gT2ZmZXIgdG8gXCJBdXRvIERldGVjdFwiLCBidXQgb25seSBpZiB0aGUgZG9jdW1lbnQgaXMgbm90IGVtcHR5LlxuXHRcdGNvbnN0IGF1dG9EZXRlY3RMYW5ndWFnZTogSVF1aWNrUGlja0l0ZW0gPSB7IGxhYmVsOiBsb2NhbGl6ZSgnYXV0b0RldGVjdCcsIFwiQXV0byBEZXRlY3RcIikgfTtcblx0XHRpZiAodGV4dE1vZGVsICYmIHRleHRNb2RlbC5nZXRWYWx1ZUxlbmd0aCgpID4gMCkge1xuXHRcdFx0cGlja3MudW5zaGlmdChhdXRvRGV0ZWN0TGFuZ3VhZ2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2sgPSB0eXBlb2YgbGFuZ3VhZ2VNb2RlID09PSAnc3RyaW5nJyA/IHsgbGFiZWw6IGxhbmd1YWdlTW9kZSB9IDogYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywgeyBwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BpY2tMYW5ndWFnZScsIFwiU2VsZWN0IExhbmd1YWdlIE1vZGVcIiksIG1hdGNoT25EZXNjcmlwdGlvbjogdHJ1ZSB9KTtcblx0XHRpZiAoIXBpY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGljayA9PT0gZ2FsbGVyeUFjdGlvbikge1xuXHRcdFx0Z2FsbGVyeUFjdGlvbi5ydW4oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVc2VyIGRlY2lkZWQgdG8gcGVybWFuZW50bHkgY29uZmlndXJlIGFzc29jaWF0aW9ucywgcmV0dXJuIHJpZ2h0IGFmdGVyXG5cdFx0aWYgKHBpY2sgPT09IGNvbmZpZ3VyZUxhbmd1YWdlQXNzb2NpYXRpb25zKSB7XG5cdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5jb25maWd1cmVGaWxlQXNzb2NpYXRpb24ocmVzb3VyY2UsIGxhbmd1YWdlU2VydmljZSwgcXVpY2tJbnB1dFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVc2VyIGRlY2lkZWQgdG8gY29uZmlndXJlIHNldHRpbmdzIGZvciBjdXJyZW50IGxhbmd1YWdlXG5cdFx0aWYgKHBpY2sgPT09IGNvbmZpZ3VyZUxhbmd1YWdlU2V0dGluZ3MpIHtcblx0XHRcdHByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKHsganNvbkVkaXRvcjogdHJ1ZSwgcmV2ZWFsU2V0dGluZzogeyBrZXk6IGBbJHtjdXJyZW50TGFuZ3VhZ2VJZCA/PyBudWxsfV1gLCBlZGl0OiB0cnVlIH0gfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hhbmdlIGxhbmd1YWdlIGZvciBhY3RpdmUgZWRpdG9yXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VTdXBwb3J0ID0gdG9FZGl0b3JXaXRoTGFuZ3VhZ2VTdXBwb3J0KGFjdGl2ZUVkaXRvcik7XG5cdFx0XHRpZiAobGFuZ3VhZ2VTdXBwb3J0KSB7XG5cblx0XHRcdFx0Ly8gRmluZCBsYW5ndWFnZVxuXHRcdFx0XHRsZXQgbGFuZ3VhZ2VTZWxlY3Rpb246IElMYW5ndWFnZVNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGRldGVjdGVkTGFuZ3VhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHBpY2sgPT09IGF1dG9EZXRlY3RMYW5ndWFnZSkge1xuXHRcdFx0XHRcdGlmICh0ZXh0TW9kZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRcdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0XHQvLyBEZXRlY3QgbGFuZ3VhZ2VzIHNpbmNlIHdlIGFyZSBpbiBhbiB1bnRpdGxlZCBmaWxlXG5cdFx0XHRcdFx0XHRcdGxldCBsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBsYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlLCB0ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQoMSkpID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKCFsYW5ndWFnZUlkIHx8IGxhbmd1YWdlSWQgPT09ICd1bmtub3duJykge1xuXHRcdFx0XHRcdFx0XHRcdGRldGVjdGVkTGFuZ3VhZ2UgPSBhd2FpdCBsYW5ndWFnZURldGVjdGlvblNlcnZpY2UuZGV0ZWN0TGFuZ3VhZ2UocmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRcdGxhbmd1YWdlSWQgPSBkZXRlY3RlZExhbmd1YWdlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChsYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2VTZWxlY3Rpb24gPSBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYW5ndWFnZVNlbGVjdGlvbiA9IGxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKHBpY2suaWQpO1xuXG5cdFx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHQvLyBmaXJlIGFuZCBmb3JnZXQgdG8gbm90IHNsb3cgdGhpbmdzIGRvd25cblx0XHRcdFx0XHRcdGxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZS5kZXRlY3RMYW5ndWFnZShyZXNvdXJjZSkudGhlbihkZXRlY3RlZExhbmd1YWdlSWQgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjaG9zZW5MYW5ndWFnZUlkID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShwaWNrLmxhYmVsKSB8fCAndW5rbm93bic7XG5cdFx0XHRcdFx0XHRcdGlmIChkZXRlY3RlZExhbmd1YWdlSWQgPT09IGN1cnJlbnRMYW5ndWFnZUlkICYmIGN1cnJlbnRMYW5ndWFnZUlkICE9PSBjaG9zZW5MYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhleSBkaWRuJ3QgY2hvb3NlIHRoZSBkZXRlY3RlZCBsYW5ndWFnZSAod2hpY2ggc2hvdWxkIGFsc28gYmUgdGhlIGFjdGl2ZSBsYW5ndWFnZSBpZiBhdXRvbWF0aWMgZGV0ZWN0aW9uIGlzIGVuYWJsZWQpXG5cdFx0XHRcdFx0XHRcdFx0Ly8gdGhlbiB0aGUgYXV0b21hdGljIGxhbmd1YWdlIGRldGVjdGlvbiB3YXMgbGlrZWx5IHdyb25nIGFuZCB0aGUgdXNlciBpcyBjb3JyZWN0aW5nIGl0LiBJbiB0aGlzIGNhc2UsIHdlIHdhbnQgdGVsZW1ldHJ5LlxuXHRcdFx0XHRcdFx0XHRcdC8vIEtlZXAgdHJhY2sgb2Ygd2hhdCBtb2RlbCB3YXMgcHJlZmVycmVkIGFuZCBsZW5ndGggb2YgaW5wdXQgdG8gaGVscCB0cmFjayBkb3duIHBvdGVudGlhbCBkaWZmZXJlbmNlcyBiZXR3ZWVuIHRoZSByZXN1bHQgcXVhbGl0eSBhY3Jvc3MgbW9kZWxzIGFuZCBjb250ZW50IHNpemUuXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbW9kZWxQcmVmZXJlbmNlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5lZGl0b3IucHJlZmVySGlzdG9yeUJhc2VkTGFuZ3VhZ2VEZXRlY3Rpb24nKSA/ICdoaXN0b3J5JyA6ICdjbGFzc2ljJztcblx0XHRcdFx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SUF1dG9tYXRpY0xhbmd1YWdlRGV0ZWN0aW9uTGlrZWx5V3JvbmdEYXRhLCBBdXRvbWF0aWNMYW5ndWFnZURldGVjdGlvbkxpa2VseVdyb25nQ2xhc3NpZmljYXRpb24+KEF1dG9tYXRpY0xhbmd1YWdlRGV0ZWN0aW9uTGlrZWx5V3JvbmdJZCwge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y3VycmVudExhbmd1YWdlSWQ6IGN1cnJlbnRMYW5ndWFnZU5hbWUgPz8gJ3Vua25vd24nLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmV4dExhbmd1YWdlSWQ6IHBpY2subGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRsaW5lQ291bnQ6IHRleHRNb2RlbD8uZ2V0TGluZUNvdW50KCkgPz8gLTEsXG5cdFx0XHRcdFx0XHRcdFx0XHRtb2RlbFByZWZlcmVuY2UsXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENoYW5nZSBsYW5ndWFnZVxuXHRcdFx0XHRpZiAodHlwZW9mIGxhbmd1YWdlU2VsZWN0aW9uICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdGxhbmd1YWdlU3VwcG9ydC5zZXRMYW5ndWFnZUlkKGxhbmd1YWdlU2VsZWN0aW9uLmxhbmd1YWdlSWQsIENoYW5nZUxhbmd1YWdlQWN0aW9uLklEKTtcblxuXHRcdFx0XHRcdGlmIChyZXNvdXJjZT8uc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRcdFx0XHR0eXBlIFNldFVudGl0bGVkRG9jdW1lbnRMYW5ndWFnZUV2ZW50ID0geyB0bzogc3RyaW5nOyBmcm9tOiBzdHJpbmc7IG1vZGVsUHJlZmVyZW5jZTogc3RyaW5nIH07XG5cdFx0XHRcdFx0XHR0eXBlIFNldFVudGl0bGVkRG9jdW1lbnRMYW5ndWFnZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0XHRvd25lcjogJ1R5bGVyTGVvbmhhcmR0Jztcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ0hlbHBzIHVuZGVyc3RhbmQgd2hhdCB0aGUgYXV0b21hdGljIGxhbmd1YWdlIGRldGVjdGlvbiBkb2VzIGZvciB1bnRpdGxlZCBmaWxlcyc7XG5cdFx0XHRcdFx0XHRcdHRvOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7XG5cdFx0XHRcdFx0XHRcdFx0cHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0Jztcblx0XHRcdFx0XHRcdFx0XHRvd25lcjogJ1R5bGVyTGVvbmhhcmR0Jztcblx0XHRcdFx0XHRcdFx0XHRjb21tZW50OiAnSGVscCB1bmRlcnN0YW5kIGVmZmVjdGl2ZW5lc3Mgb2YgYXV0b21hdGljIGxhbmd1YWdlIGRldGVjdGlvbic7XG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGZyb206IHtcblx0XHRcdFx0XHRcdFx0XHRjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJztcblx0XHRcdFx0XHRcdFx0XHRwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnO1xuXHRcdFx0XHRcdFx0XHRcdG93bmVyOiAnVHlsZXJMZW9uaGFyZHQnO1xuXHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdIZWxwIHVuZGVyc3RhbmQgZWZmZWN0aXZlbmVzcyBvZiBhdXRvbWF0aWMgbGFuZ3VhZ2UgZGV0ZWN0aW9uJztcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0bW9kZWxQcmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7XG5cdFx0XHRcdFx0XHRcdFx0cHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0Jztcblx0XHRcdFx0XHRcdFx0XHRvd25lcjogJ1R5bGVyTGVvbmhhcmR0Jztcblx0XHRcdFx0XHRcdFx0XHRjb21tZW50OiAnSGVscCB1bmRlcnN0YW5kIGVmZmVjdGl2ZW5lc3Mgb2YgYXV0b21hdGljIGxhbmd1YWdlIGRldGVjdGlvbic7XG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0Y29uc3QgbW9kZWxQcmVmZXJlbmNlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5lZGl0b3IucHJlZmVySGlzdG9yeUJhc2VkTGFuZ3VhZ2VEZXRlY3Rpb24nKSA/ICdoaXN0b3J5JyA6ICdjbGFzc2ljJztcblx0XHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTZXRVbnRpdGxlZERvY3VtZW50TGFuZ3VhZ2VFdmVudCwgU2V0VW50aXRsZWREb2N1bWVudExhbmd1YWdlQ2xhc3NpZmljYXRpb24+KCdzZXRVbnRpdGxlZERvY3VtZW50TGFuZ3VhZ2UnLCB7XG5cdFx0XHRcdFx0XHRcdHRvOiBsYW5ndWFnZVNlbGVjdGlvbi5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0XHRmcm9tOiBjdXJyZW50TGFuZ3VhZ2VJZCA/PyAnbm9uZScsXG5cdFx0XHRcdFx0XHRcdG1vZGVsUHJlZmVyZW5jZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29uZmlndXJlRmlsZUFzc29jaWF0aW9uKHJlc291cmNlOiBVUkksIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dG5hbWUocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGJhc2UgPSBiYXNlbmFtZShyZXNvdXJjZSk7XG5cdFx0Y29uc3QgY3VycmVudEFzc29jaWF0aW9uID0gbGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZShVUkkuZmlsZShiYXNlKSk7XG5cblx0XHRjb25zdCBsYW5ndWFnZXMgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKTtcblx0XHRjb25zdCBwaWNrczogSVF1aWNrUGlja0l0ZW1bXSA9IGxhbmd1YWdlcy5tYXAoKHsgbGFuZ3VhZ2VOYW1lLCBsYW5ndWFnZUlkIH0pID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBsYW5ndWFnZUlkLFxuXHRcdFx0XHRsYWJlbDogbGFuZ3VhZ2VOYW1lLFxuXHRcdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXNGb3JMYW5ndWFnZUlkKGxhbmd1YWdlSWQpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogKGxhbmd1YWdlSWQgPT09IGN1cnJlbnRBc3NvY2lhdGlvbikgPyBsb2NhbGl6ZSgnY3VycmVudEFzc29jaWF0aW9uJywgXCJDdXJyZW50IEFzc29jaWF0aW9uXCIpIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0c2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZSA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrTGFuZ3VhZ2VUb0NvbmZpZ3VyZScsIFwiU2VsZWN0IExhbmd1YWdlIE1vZGUgdG8gQXNzb2NpYXRlIHdpdGggJ3swfSdcIiwgZXh0ZW5zaW9uIHx8IGJhc2UpIH0pO1xuXHRcdFx0aWYgKGxhbmd1YWdlKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVBc3NvY2lhdGlvbnNDb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHt9PihGSUxFU19BU1NPQ0lBVElPTlNfQ09ORklHKTtcblxuXHRcdFx0XHRsZXQgYXNzb2NpYXRpb25LZXk6IHN0cmluZztcblx0XHRcdFx0aWYgKGV4dGVuc2lvbiAmJiBiYXNlWzBdICE9PSAnLicpIHtcblx0XHRcdFx0XHRhc3NvY2lhdGlvbktleSA9IGAqJHtleHRlbnNpb259YDsgLy8gb25seSB1c2UgXCIqLmV4dFwiIGlmIHRoZSBmaWxlIHBhdGggaXMgaW4gdGhlIGZvcm0gb2YgPG5hbWU+LjxleHQ+XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXNzb2NpYXRpb25LZXkgPSBiYXNlOyAvLyBvdGhlcndpc2UgdXNlIHRoZSBiYXNlbmFtZSAoZS5nLiAuZ2l0aWdub3JlLCBEb2NrZXJmaWxlKVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIGFzc29jaWF0aW9uIGlzIGFscmVhZHkgYmVpbmcgbWFkZSBpbiB0aGUgd29ya3NwYWNlLCBtYWtlIHN1cmUgdG8gdGFyZ2V0IHdvcmtzcGFjZSBzZXR0aW5nc1xuXHRcdFx0XHRsZXQgdGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdFx0XHRpZiAoZmlsZUFzc29jaWF0aW9uc0NvbmZpZy53b3Jrc3BhY2VWYWx1ZT8uW2Fzc29jaWF0aW9uS2V5IGFzIGtleW9mIHR5cGVvZiBmaWxlQXNzb2NpYXRpb25zQ29uZmlnLndvcmtzcGFjZVZhbHVlXSkge1xuXHRcdFx0XHRcdHRhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHdyaXRlIGludG8gdGhlIHZhbHVlIG9mIHRoZSB0YXJnZXQgYW5kIG5vdCB0aGUgbWVyZ2VkIHZhbHVlIGZyb20gVVNFUiBhbmQgV09SS1NQQUNFIGNvbmZpZ1xuXHRcdFx0XHRjb25zdCBjdXJyZW50QXNzb2NpYXRpb25zID0gZGVlcENsb25lKCh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSA/IGZpbGVBc3NvY2lhdGlvbnNDb25maWcud29ya3NwYWNlVmFsdWUgOiBmaWxlQXNzb2NpYXRpb25zQ29uZmlnLnVzZXJWYWx1ZSkgfHwgT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdFx0Y3VycmVudEFzc29jaWF0aW9uc1thc3NvY2lhdGlvbktleV0gPSBsYW5ndWFnZS5pZDtcblxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShGSUxFU19BU1NPQ0lBVElPTlNfQ09ORklHLCBjdXJyZW50QXNzb2NpYXRpb25zLCB0YXJnZXQpO1xuXHRcdFx0fVxuXHRcdH0sIDUwIC8qIHF1aWNrIGlucHV0IGlzIHNlbnNpdGl2ZSB0byBiZWluZyBvcGVuZWQgc28gc29vbiBhZnRlciBhbm90aGVyICovKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNoYW5nZUVPTEVudHJ5IGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRlb2w6IEVuZE9mTGluZVNlcXVlbmNlO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhbmdlRU9MQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRvci5jaGFuZ2VFT0wnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhbmdlRW5kT2ZMaW5lJywgJ0NoYW5nZSBFbmQgb2YgTGluZSBTZXF1ZW5jZScpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGdldENvZGVFZGl0b3IoZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0aWYgKCFhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkge1xuXHRcdFx0YXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhbeyBsYWJlbDogbG9jYWxpemUoJ25vRWRpdG9yJywgXCJObyB0ZXh0IGVkaXRvciBhY3RpdmUgYXQgdGhpcyB0aW1lXCIpIH1dKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I/LmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0YXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhbeyBsYWJlbDogbG9jYWxpemUoJ25vV3JpdGFibGVDb2RlRWRpdG9yJywgXCJUaGUgYWN0aXZlIGNvZGUgZWRpdG9yIGlzIHJlYWQtb25seS5cIikgfV0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB0ZXh0TW9kZWwgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgRU9MT3B0aW9uczogSUNoYW5nZUVPTEVudHJ5W10gPSBbXG5cdFx0XHR7IGxhYmVsOiBubHNFT0xMRiwgZW9sOiBFbmRPZkxpbmVTZXF1ZW5jZS5MRiB9LFxuXHRcdFx0eyBsYWJlbDogbmxzRU9MQ1JMRiwgZW9sOiBFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkSW5kZXggPSAodGV4dE1vZGVsPy5nZXRFT0woKSA9PT0gJ1xcbicpID8gMCA6IDE7XG5cblx0XHRjb25zdCBlb2wgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKEVPTE9wdGlvbnMsIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrRW5kT2ZMaW5lJywgXCJTZWxlY3QgRW5kIG9mIExpbmUgU2VxdWVuY2VcIiksIGFjdGl2ZUl0ZW06IEVPTE9wdGlvbnNbc2VsZWN0ZWRJbmRleF0gfSk7XG5cdFx0aWYgKGVvbCkge1xuXHRcdFx0Y29uc3QgYWN0aXZlQ29kZUVkaXRvciA9IGdldENvZGVFZGl0b3IoZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0XHRpZiAoYWN0aXZlQ29kZUVkaXRvcj8uaGFzTW9kZWwoKSAmJiAhZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I/LmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0XHR0ZXh0TW9kZWwgPSBhY3RpdmVDb2RlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdHRleHRNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHRcdHRleHRNb2RlbC5wdXNoRU9MKGVvbC5lb2wpO1xuXHRcdFx0XHR0ZXh0TW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmZvY3VzKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYW5nZUVuY29kaW5nQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRvci5jaGFuZ2VFbmNvZGluZycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGFuZ2VFbmNvZGluZycsICdDaGFuZ2UgRmlsZSBFbmNvZGluZycpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRpZiAoIWFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm9FZGl0b3InLCBcIk5vIHRleHQgZWRpdG9yIGFjdGl2ZSBhdCB0aGlzIHRpbWVcIikgfV0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHRhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm9FZGl0b3InLCBcIk5vIHRleHQgZWRpdG9yIGFjdGl2ZSBhdCB0aGlzIHRpbWVcIikgfV0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuY29kaW5nU3VwcG9ydDogSUVuY29kaW5nU3VwcG9ydCB8IG51bGwgPSB0b0VkaXRvcldpdGhFbmNvZGluZ1N1cHBvcnQoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0aWYgKCFlbmNvZGluZ1N1cHBvcnQpIHtcblx0XHRcdGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdub0ZpbGVFZGl0b3InLCBcIk5vIGZpbGUgYWN0aXZlIGF0IHRoaXMgdGltZVwiKSB9XSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZVdpdGhFbmNvZGluZ1BpY2s6IElRdWlja1BpY2tJdGVtID0geyBsYWJlbDogbG9jYWxpemUoJ3NhdmVXaXRoRW5jb2RpbmcnLCBcIlNhdmUgd2l0aCBFbmNvZGluZ1wiKSB9O1xuXHRcdGNvbnN0IHJlb3BlbldpdGhFbmNvZGluZ1BpY2s6IElRdWlja1BpY2tJdGVtID0geyBsYWJlbDogbG9jYWxpemUoJ3Jlb3BlbldpdGhFbmNvZGluZycsIFwiUmVvcGVuIHdpdGggRW5jb2RpbmdcIikgfTtcblxuXHRcdGlmICghTGFuZ3VhZ2UuaXNEZWZhdWx0VmFyaWFudCgpKSB7XG5cdFx0XHRjb25zdCBzYXZlV2l0aEVuY29kaW5nQWxpYXMgPSAnU2F2ZSB3aXRoIEVuY29kaW5nJztcblx0XHRcdGlmIChzYXZlV2l0aEVuY29kaW5nQWxpYXMgIT09IHNhdmVXaXRoRW5jb2RpbmdQaWNrLmxhYmVsKSB7XG5cdFx0XHRcdHNhdmVXaXRoRW5jb2RpbmdQaWNrLmRldGFpbCA9IHNhdmVXaXRoRW5jb2RpbmdBbGlhcztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVvcGVuV2l0aEVuY29kaW5nQWxpYXMgPSAnUmVvcGVuIHdpdGggRW5jb2RpbmcnO1xuXHRcdFx0aWYgKHJlb3BlbldpdGhFbmNvZGluZ0FsaWFzICE9PSByZW9wZW5XaXRoRW5jb2RpbmdQaWNrLmxhYmVsKSB7XG5cdFx0XHRcdHJlb3BlbldpdGhFbmNvZGluZ1BpY2suZGV0YWlsID0gcmVvcGVuV2l0aEVuY29kaW5nQWxpYXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGFjdGlvbjogSVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGVuY29kaW5nU3VwcG9ydCBpbnN0YW5jZW9mIFVudGl0bGVkVGV4dEVkaXRvcklucHV0KSB7XG5cdFx0XHRhY3Rpb24gPSBzYXZlV2l0aEVuY29kaW5nUGljaztcblx0XHR9IGVsc2UgaWYgKGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQuaXNSZWFkb25seSgpKSB7XG5cdFx0XHRhY3Rpb24gPSByZW9wZW5XaXRoRW5jb2RpbmdQaWNrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3Rpb24gPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFtyZW9wZW5XaXRoRW5jb2RpbmdQaWNrLCBzYXZlV2l0aEVuY29kaW5nUGlja10sIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrQWN0aW9uJywgXCJTZWxlY3QgQWN0aW9uXCIpLCBtYXRjaE9uRGV0YWlsOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGlmICghYWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGltZW91dCg1MCk7IC8vIHF1aWNrIGlucHV0IGlzIHNlbnNpdGl2ZSB0byBiZWluZyBvcGVuZWQgc28gc29vbiBhZnRlciBhbm90aGVyXG5cblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGlmICghcmVzb3VyY2UgfHwgKCFmaWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkgJiYgcmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLnVudGl0bGVkKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBlbmNvZGluZyBkZXRlY3Rpb24gb25seSBwb3NzaWJsZSBmb3IgcmVzb3VyY2VzIHRoZSBmaWxlIHNlcnZpY2UgY2FuIGhhbmRsZSBvciB0aGF0IGFyZSB1bnRpdGxlZFxuXHRcdH1cblxuXHRcdGxldCBndWVzc2VkRW5jb2Rpbmc6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGV4dEZpbGVTZXJ2aWNlLnJlYWRTdHJlYW0ocmVzb3VyY2UsIHtcblx0XHRcdFx0YXV0b0d1ZXNzRW5jb2Rpbmc6IHRydWUsXG5cdFx0XHRcdGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShyZXNvdXJjZSwgJ2ZpbGVzLmNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzJylcblx0XHRcdH0pO1xuXHRcdFx0Z3Vlc3NlZEVuY29kaW5nID0gY29udGVudC5lbmNvZGluZztcblx0XHR9XG5cblx0XHRjb25zdCBpc1Jlb3BlbldpdGhFbmNvZGluZyA9IChhY3Rpb24gPT09IHJlb3BlbldpdGhFbmNvZGluZ1BpY2spO1xuXG5cdFx0Y29uc3QgY29uZmlndXJlZEVuY29kaW5nID0gdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocmVzb3VyY2UsICdmaWxlcy5lbmNvZGluZycpO1xuXG5cdFx0bGV0IGRpcmVjdE1hdGNoSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWxpYXNNYXRjaEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBBbGwgZW5jb2RpbmdzIGFyZSB2YWxpZCBwaWNrc1xuXHRcdGNvbnN0IHBpY2tzOiBRdWlja1BpY2tJbnB1dFtdID0gT2JqZWN0LmtleXMoU1VQUE9SVEVEX0VOQ09ESU5HUylcblx0XHRcdC5zb3J0KChrMSwgazIpID0+IHtcblx0XHRcdFx0aWYgKGsxID09PSBjb25maWd1cmVkRW5jb2RpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH0gZWxzZSBpZiAoazIgPT09IGNvbmZpZ3VyZWRFbmNvZGluZykge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFNVUFBPUlRFRF9FTkNPRElOR1NbazFdLm9yZGVyIC0gU1VQUE9SVEVEX0VOQ09ESU5HU1trMl0ub3JkZXI7XG5cdFx0XHR9KVxuXHRcdFx0LmZpbHRlcihrID0+IHtcblx0XHRcdFx0aWYgKGsgPT09IGd1ZXNzZWRFbmNvZGluZyAmJiBndWVzc2VkRW5jb2RpbmcgIT09IGNvbmZpZ3VyZWRFbmNvZGluZykge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gZG8gbm90IHNob3cgZW5jb2RpbmcgaWYgaXQgaXMgdGhlIGd1ZXNzZWQgZW5jb2RpbmcgdGhhdCBkb2VzIG5vdCBtYXRjaCB0aGUgY29uZmlndXJlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuICFpc1Jlb3BlbldpdGhFbmNvZGluZyB8fCAhU1VQUE9SVEVEX0VOQ09ESU5HU1trXS5lbmNvZGVPbmx5OyAvLyBoaWRlIHRob3NlIHRoYXQgY2FuIG9ubHkgYmUgdXNlZCBmb3IgZW5jb2RpbmcgaWYgd2UgYXJlIGFib3V0IHRvIGRlY29kZVxuXHRcdFx0fSlcblx0XHRcdC5tYXAoKGtleSwgaW5kZXgpID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gZW5jb2RpbmdTdXBwb3J0LmdldEVuY29kaW5nKCkpIHtcblx0XHRcdFx0XHRkaXJlY3RNYXRjaEluZGV4ID0gaW5kZXg7XG5cdFx0XHRcdH0gZWxzZSBpZiAoU1VQUE9SVEVEX0VOQ09ESU5HU1trZXldLmFsaWFzID09PSBlbmNvZGluZ1N1cHBvcnQuZ2V0RW5jb2RpbmcoKSkge1xuXHRcdFx0XHRcdGFsaWFzTWF0Y2hJbmRleCA9IGluZGV4O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgaWQ6IGtleSwgbGFiZWw6IFNVUFBPUlRFRF9FTkNPRElOR1Nba2V5XS5sYWJlbExvbmcsIGRlc2NyaXB0aW9uOiBrZXkgfTtcblx0XHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBwaWNrcy5zbGljZSgpIGFzIElRdWlja1BpY2tJdGVtW107XG5cblx0XHQvLyBJZiB3ZSBoYXZlIGEgZ3Vlc3NlZCBlbmNvZGluZywgc2hvdyBpdCBmaXJzdCB1bmxlc3MgaXQgbWF0Y2hlcyB0aGUgY29uZmlndXJlZCBlbmNvZGluZ1xuXHRcdGlmIChndWVzc2VkRW5jb2RpbmcgJiYgY29uZmlndXJlZEVuY29kaW5nICE9PSBndWVzc2VkRW5jb2RpbmcgJiYgU1VQUE9SVEVEX0VOQ09ESU5HU1tndWVzc2VkRW5jb2RpbmddKSB7XG5cdFx0XHRwaWNrcy51bnNoaWZ0KHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRwaWNrcy51bnNoaWZ0KHsgaWQ6IGd1ZXNzZWRFbmNvZGluZywgbGFiZWw6IFNVUFBPUlRFRF9FTkNPRElOR1NbZ3Vlc3NlZEVuY29kaW5nXS5sYWJlbExvbmcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ3Vlc3NlZEVuY29kaW5nJywgXCJHdWVzc2VkIGZyb20gY29udGVudFwiKSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBlbmNvZGluZyA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBpc1Jlb3BlbldpdGhFbmNvZGluZyA/IGxvY2FsaXplKCdwaWNrRW5jb2RpbmdGb3JSZW9wZW4nLCBcIlNlbGVjdCBGaWxlIEVuY29kaW5nIHRvIFJlb3BlbiBGaWxlXCIpIDogbG9jYWxpemUoJ3BpY2tFbmNvZGluZ0ZvclNhdmUnLCBcIlNlbGVjdCBGaWxlIEVuY29kaW5nIHRvIFNhdmUgd2l0aFwiKSxcblx0XHRcdGFjdGl2ZUl0ZW06IGl0ZW1zW3R5cGVvZiBkaXJlY3RNYXRjaEluZGV4ID09PSAnbnVtYmVyJyA/IGRpcmVjdE1hdGNoSW5kZXggOiB0eXBlb2YgYWxpYXNNYXRjaEluZGV4ID09PSAnbnVtYmVyJyA/IGFsaWFzTWF0Y2hJbmRleCA6IC0xXVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFlbmNvZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlRW5jb2RpbmdTdXBwb3J0ID0gdG9FZGl0b3JXaXRoRW5jb2RpbmdTdXBwb3J0KGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0aWYgKHR5cGVvZiBlbmNvZGluZy5pZCAhPT0gJ3VuZGVmaW5lZCcgJiYgYWN0aXZlRW5jb2RpbmdTdXBwb3J0KSB7XG5cblx0XHRcdC8vIFJlLW9wZW4gd2l0aCBlbmNvZGluZyBkb2VzIG5vdCB3b3JrIG9uIGRpcnR5IGVkaXRvcnMsIGFzayB0byByZXZlcnRcblx0XHRcdGlmIChpc1Jlb3BlbldpdGhFbmNvZGluZyAmJiBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUuaW5wdXQuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdyZW9wZW5XaXRoRW5jb2RpbmdXYXJuaW5nJywgXCJEbyB5b3Ugd2FudCB0byByZXZlcnQgdGhlIGFjdGl2ZSB0ZXh0IGVkaXRvciBhbmQgcmVvcGVuIHdpdGggYSBkaWZmZXJlbnQgZW5jb2Rpbmc/XCIpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Jlb3BlbldpdGhFbmNvZGluZ0RldGFpbCcsIFwiVGhpcyB3aWxsIGRpc2NhcmQgYW55IHVuc2F2ZWQgY2hhbmdlcy5cIiksXG5cdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ3Jlb3BlbicsIFwiRGlzY2FyZCBDaGFuZ2VzIGFuZCBSZW9wZW5cIilcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUuaW5wdXQucmV2ZXJ0KGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5ncm91cC5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldCBuZXcgZW5jb2Rpbmdcblx0XHRcdGF3YWl0IGFjdGl2ZUVuY29kaW5nU3VwcG9ydC5zZXRFbmNvZGluZyhlbmNvZGluZy5pZCwgaXNSZW9wZW5XaXRoRW5jb2RpbmcgPyBFbmNvZGluZ01vZGUuRGVjb2RlIDogRW5jb2RpbmdNb2RlLkVuY29kZSk7XG5cdFx0fVxuXG5cdFx0YWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZm9jdXMoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGVBQWUsK0NBQStDO0FBQ3ZFLFNBQVMsUUFBUSxTQUFTLGtCQUFrQjtBQUM1QyxTQUFTLFNBQVMsVUFBVSxlQUFlO0FBQzNDLFNBQVMsY0FBYyw0QkFBNEI7QUFDbkQsU0FBUyxXQUFXO0FBQ3BCLFNBQWtCLGdCQUFnQjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtCQUErQjtBQUN4QyxTQUEyQix3QkFBcUMsd0JBQXdCO0FBRXhGLFNBQVMsWUFBWSxtQkFBbUIsdUJBQXVCO0FBRS9ELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUJBQW1CLGlCQUFpQixzQkFBc0IsbUJBQW1CLDJCQUEyQiwrQkFBK0I7QUFDaEosU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxz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
