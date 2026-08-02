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
import * as nls from "../../../../nls.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { createCancelablePromise, Delayer, first } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { matchesScheme, Schemas } from "../../../../base/common/network.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isDiffEditor } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, registerModelAndPositionCommand } from "../../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { registerEditorFeature } from "../../../common/editorFeatures.js";
import { score } from "../../../common/languageSelector.js";
import { shouldSynchronizeModel } from "../../../common/model.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ITextModelService } from "../../../common/services/resolverService.js";
import { getHighlightDecorationOptions } from "./highlightDecorations.js";
import { TextualMultiDocumentHighlightFeature } from "./textualHighlightProvider.js";
const ctxHasWordHighlights = new RawContextKey("hasWordHighlights", false);
function getOccurrencesAtPosition(registry, model, position, token) {
  const orderedByScore = registry.ordered(model);
  return first(orderedByScore.map((provider) => () => {
    return Promise.resolve(provider.provideDocumentHighlights(model, position, token)).then(void 0, onUnexpectedExternalError);
  }), (result) => result !== void 0 && result !== null).then((result) => {
    if (result) {
      const map = new ResourceMap();
      map.set(model.uri, result);
      return map;
    }
    return new ResourceMap();
  });
}
function getOccurrencesAcrossMultipleModels(registry, model, position, token, otherModels) {
  const orderedByScore = registry.ordered(model);
  return first(orderedByScore.map((provider) => () => {
    const filteredModels = otherModels.filter((otherModel) => {
      return shouldSynchronizeModel(otherModel);
    }).filter((otherModel) => {
      return score(provider.selector, otherModel.uri, otherModel.getLanguageId(), true, void 0, void 0) > 0;
    });
    return Promise.resolve(provider.provideMultiDocumentHighlights(model, position, filteredModels, token)).then(void 0, onUnexpectedExternalError);
  }), (result) => result !== void 0 && result !== null);
}
class OccurenceAtPositionRequest {
  constructor(_model, _selection, _wordSeparators) {
    this._model = _model;
    this._selection = _selection;
    this._wordSeparators = _wordSeparators;
    this._wordRange = this._getCurrentWordRange(_model, _selection);
    this._result = null;
  }
  get result() {
    if (!this._result) {
      this._result = createCancelablePromise((token) => this._compute(this._model, this._selection, this._wordSeparators, token));
    }
    return this._result;
  }
  _getCurrentWordRange(model, selection) {
    const word = model.getWordAtPosition(selection.getPosition());
    if (word) {
      return new Range(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
    }
    return null;
  }
  isValid(model, selection, decorations) {
    const lineNumber = selection.startLineNumber;
    const startColumn = selection.startColumn;
    const endColumn = selection.endColumn;
    const currentWordRange = this._getCurrentWordRange(model, selection);
    let requestIsValid = Boolean(this._wordRange && this._wordRange.equalsRange(currentWordRange));
    for (let i = 0, len = decorations.length; !requestIsValid && i < len; i++) {
      const range = decorations.getRange(i);
      if (range && range.startLineNumber === lineNumber) {
        if (range.startColumn <= startColumn && range.endColumn >= endColumn) {
          requestIsValid = true;
        }
      }
    }
    return requestIsValid;
  }
  cancel() {
    this.result.cancel();
  }
}
class SemanticOccurenceAtPositionRequest extends OccurenceAtPositionRequest {
  constructor(model, selection, wordSeparators, providers) {
    super(model, selection, wordSeparators);
    this._providers = providers;
  }
  _compute(model, selection, wordSeparators, token) {
    return getOccurrencesAtPosition(this._providers, model, selection.getPosition(), token).then((value) => {
      if (!value) {
        return new ResourceMap();
      }
      return value;
    });
  }
}
class MultiModelOccurenceRequest extends OccurenceAtPositionRequest {
  constructor(model, selection, wordSeparators, providers, otherModels) {
    super(model, selection, wordSeparators);
    this._providers = providers;
    this._otherModels = otherModels;
  }
  _compute(model, selection, wordSeparators, token) {
    return getOccurrencesAcrossMultipleModels(this._providers, model, selection.getPosition(), token, this._otherModels).then((value) => {
      if (!value) {
        return new ResourceMap();
      }
      return value;
    });
  }
}
function computeOccurencesAtPosition(registry, model, selection, wordSeparators) {
  return new SemanticOccurenceAtPositionRequest(model, selection, wordSeparators, registry);
}
function computeOccurencesMultiModel(registry, model, selection, wordSeparators, otherModels) {
  return new MultiModelOccurenceRequest(model, selection, wordSeparators, registry, otherModels);
}
registerModelAndPositionCommand("_executeDocumentHighlights", async (accessor, model, position) => {
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const map = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, position, CancellationToken.None);
  return map?.get(model.uri);
});
let WordHighlighter = class {
  constructor(editor, providers, multiProviders, contextKeyService, textModelService, codeEditorService, configurationService, logService) {
    this.toUnhook = new DisposableStore();
    this.workerRequestTokenId = 0;
    this.workerRequestCompleted = false;
    this.workerRequestValue = new ResourceMap();
    this.lastCursorPositionChangeTime = 0;
    this.renderDecorationsTimer = void 0;
    this.runDelayer = this.toUnhook.add(new Delayer(50));
    this.editor = editor;
    this.providers = providers;
    this.multiDocumentProviders = multiProviders;
    this.codeEditorService = codeEditorService;
    this.textModelService = textModelService;
    this.configurationService = configurationService;
    this.logService = logService;
    this._hasWordHighlights = ctxHasWordHighlights.bindTo(contextKeyService);
    this._ignorePositionChangeEvent = false;
    this.occurrencesHighlightEnablement = this.editor.getOption(EditorOption.occurrencesHighlight);
    this.occurrencesHighlightDelay = this.configurationService.getValue("editor.occurrencesHighlightDelay");
    this.model = this.editor.getModel();
    this.toUnhook.add(editor.onDidChangeCursorPosition((e) => {
      if (this._ignorePositionChangeEvent) {
        return;
      }
      if (this.occurrencesHighlightEnablement === "off") {
        return;
      }
      this.runDelayer.trigger(() => {
        this._onPositionChanged(e);
      }).catch(onUnexpectedError);
    }));
    this.toUnhook.add(editor.onDidFocusEditorText((e) => {
      if (this.occurrencesHighlightEnablement === "off") {
        return;
      }
      if (!this.workerRequest) {
        this.runDelayer.trigger(() => {
          this._run();
        }).catch(onUnexpectedError);
      }
    }));
    this.toUnhook.add(editor.onDidChangeModelContent((e) => {
      if (!matchesScheme(this.model.uri, "output")) {
        this._stopAll();
      }
    }));
    this.toUnhook.add(editor.onDidChangeModel((e) => {
      if (!e.newModelUrl && e.oldModelUrl) {
        this._stopSingular();
      } else if (WordHighlighter.query) {
        this._run();
      }
    }));
    this.toUnhook.add(editor.onDidChangeConfiguration((e) => {
      const newEnablement = this.editor.getOption(EditorOption.occurrencesHighlight);
      if (this.occurrencesHighlightEnablement !== newEnablement) {
        this.occurrencesHighlightEnablement = newEnablement;
        switch (newEnablement) {
          case "off":
            this._stopAll();
            break;
          case "singleFile":
            this._stopAll(WordHighlighter.query?.modelInfo?.modelURI);
            break;
          case "multiFile":
            if (WordHighlighter.query) {
              this._run(true);
            }
            break;
          default:
            console.warn("Unknown occurrencesHighlight setting value:", newEnablement);
            break;
        }
      }
    }));
    this.toUnhook.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.occurrencesHighlightDelay")) {
        const newDelay = configurationService.getValue("editor.occurrencesHighlightDelay");
        if (this.occurrencesHighlightDelay !== newDelay) {
          this.occurrencesHighlightDelay = newDelay;
        }
      }
    }));
    this.toUnhook.add(editor.onDidBlurEditorWidget(() => {
      const activeEditor = this.codeEditorService.getFocusedCodeEditor();
      if (!activeEditor) {
        this._stopAll();
      } else if (activeEditor.getModel()?.uri.scheme === Schemas.vscodeNotebookCell && this.editor.getModel()?.uri.scheme !== Schemas.vscodeNotebookCell) {
        this._stopAll();
      }
    }));
    this.decorations = this.editor.createDecorationsCollection();
    this.workerRequestTokenId = 0;
    this.workerRequest = null;
    this.workerRequestCompleted = false;
    this.lastCursorPositionChangeTime = 0;
    this.renderDecorationsTimer = void 0;
    if (WordHighlighter.query) {
      this._run();
    }
  }
  hasDecorations() {
    return this.decorations.length > 0;
  }
  restore(delay) {
    if (this.occurrencesHighlightEnablement === "off") {
      return;
    }
    this.runDelayer.cancel();
    this.runDelayer.trigger(() => {
      this._run(false, delay);
    }).catch(onUnexpectedError);
  }
  trigger() {
    this.runDelayer.cancel();
    this._run(false, 0);
  }
  stop() {
    if (this.occurrencesHighlightEnablement === "off") {
      return;
    }
    this._stopAll();
  }
  _getSortedHighlights() {
    return this.decorations.getRanges().sort(Range.compareRangesUsingStarts);
  }
  moveNext() {
    const highlights = this._getSortedHighlights();
    const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
    const newIndex = (index + 1) % highlights.length;
    const dest = highlights[newIndex];
    try {
      this._ignorePositionChangeEvent = true;
      this.editor.setPosition(dest.getStartPosition());
      this.editor.revealRangeInCenterIfOutsideViewport(dest);
      const word = this._getWord();
      if (word) {
        const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
        alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
      }
    } finally {
      this._ignorePositionChangeEvent = false;
    }
  }
  moveBack() {
    const highlights = this._getSortedHighlights();
    const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
    const newIndex = (index - 1 + highlights.length) % highlights.length;
    const dest = highlights[newIndex];
    try {
      this._ignorePositionChangeEvent = true;
      this.editor.setPosition(dest.getStartPosition());
      this.editor.revealRangeInCenterIfOutsideViewport(dest);
      const word = this._getWord();
      if (word) {
        const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
        alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
      }
    } finally {
      this._ignorePositionChangeEvent = false;
    }
  }
  _removeSingleDecorations() {
    if (!this.editor.hasModel()) {
      return;
    }
    const currentDecorationIDs = WordHighlighter.storedDecorationIDs.get(this.editor.getModel().uri);
    if (!currentDecorationIDs) {
      return;
    }
    this.editor.removeDecorations(currentDecorationIDs);
    WordHighlighter.storedDecorationIDs.delete(this.editor.getModel().uri);
    if (this.decorations.length > 0) {
      this.decorations.clear();
      this._hasWordHighlights.set(false);
    }
  }
  _removeAllDecorations(preservedModel) {
    const currentEditors = this.codeEditorService.listCodeEditors();
    const deleteURI = [];
    for (const editor of currentEditors) {
      if (!editor.hasModel() || isEqual(editor.getModel().uri, preservedModel)) {
        continue;
      }
      const currentDecorationIDs = WordHighlighter.storedDecorationIDs.get(editor.getModel().uri);
      if (!currentDecorationIDs) {
        continue;
      }
      editor.removeDecorations(currentDecorationIDs);
      deleteURI.push(editor.getModel().uri);
      const editorHighlighterContrib = WordHighlighterContribution.get(editor);
      if (!editorHighlighterContrib?.wordHighlighter) {
        continue;
      }
      if (editorHighlighterContrib.wordHighlighter.decorations.length > 0) {
        editorHighlighterContrib.wordHighlighter.decorations.clear();
        editorHighlighterContrib.wordHighlighter.workerRequest = null;
        editorHighlighterContrib.wordHighlighter._hasWordHighlights.set(false);
      }
    }
    for (const uri of deleteURI) {
      WordHighlighter.storedDecorationIDs.delete(uri);
    }
  }
  _stopSingular() {
    this._removeSingleDecorations();
    if (this.editor.hasTextFocus()) {
      if (this.editor.getModel()?.uri.scheme !== Schemas.vscodeNotebookCell && WordHighlighter.query?.modelInfo?.modelURI.scheme !== Schemas.vscodeNotebookCell) {
        WordHighlighter.query = null;
        this._run();
      } else {
        if (WordHighlighter.query?.modelInfo) {
          WordHighlighter.query.modelInfo = null;
        }
      }
    }
    if (this.renderDecorationsTimer !== void 0) {
      clearTimeout(this.renderDecorationsTimer);
      this.renderDecorationsTimer = void 0;
    }
    if (this.workerRequest !== null) {
      this.workerRequest.cancel();
      this.workerRequest = null;
    }
    if (!this.workerRequestCompleted) {
      this.workerRequestTokenId++;
      this.workerRequestCompleted = true;
    }
  }
  _stopAll(preservedModel) {
    this._removeAllDecorations(preservedModel);
    if (this.renderDecorationsTimer !== void 0) {
      clearTimeout(this.renderDecorationsTimer);
      this.renderDecorationsTimer = void 0;
    }
    if (this.workerRequest !== null) {
      this.workerRequest.cancel();
      this.workerRequest = null;
    }
    if (!this.workerRequestCompleted) {
      this.workerRequestTokenId++;
      this.workerRequestCompleted = true;
    }
  }
  _onPositionChanged(e) {
    if (this.occurrencesHighlightEnablement === "off") {
      this._stopAll();
      return;
    }
    if (e.source !== "api" && e.reason !== CursorChangeReason.Explicit) {
      this._stopAll();
      return;
    }
    this._run();
  }
  _getWord() {
    const editorSelection = this.editor.getSelection();
    const lineNumber = editorSelection.startLineNumber;
    const startColumn = editorSelection.startColumn;
    if (this.model.isDisposed()) {
      return null;
    }
    return this.model.getWordAtPosition({
      lineNumber,
      column: startColumn
    });
  }
  getOtherModelsToHighlight(model) {
    if (!model) {
      return [];
    }
    const isNotebookEditor = model.uri.scheme === Schemas.vscodeNotebookCell;
    if (isNotebookEditor) {
      const currentModels2 = [];
      const currentEditors2 = this.codeEditorService.listCodeEditors();
      for (const editor of currentEditors2) {
        const tempModel = editor.getModel();
        if (tempModel && tempModel !== model && tempModel.uri.scheme === Schemas.vscodeNotebookCell) {
          currentModels2.push(tempModel);
        }
      }
      return currentModels2;
    }
    const currentModels = [];
    const currentEditors = this.codeEditorService.listCodeEditors();
    for (const editor of currentEditors) {
      if (!isDiffEditor(editor)) {
        continue;
      }
      const diffModel = editor.getModel();
      if (!diffModel) {
        continue;
      }
      if (model === diffModel.modified) {
        currentModels.push(diffModel.modified);
      }
    }
    if (currentModels.length) {
      return currentModels;
    }
    if (this.occurrencesHighlightEnablement === "singleFile") {
      return [];
    }
    for (const editor of currentEditors) {
      const tempModel = editor.getModel();
      const isValidModel = tempModel && tempModel !== model;
      if (isValidModel) {
        currentModels.push(tempModel);
      }
    }
    return currentModels;
  }
  async _run(multiFileConfigChange, delay) {
    const hasTextFocus = this.editor.hasTextFocus();
    if (!hasTextFocus) {
      if (!WordHighlighter.query) {
        this._stopAll();
        return;
      }
    } else {
      const editorSelection = this.editor.getSelection();
      if (!editorSelection || editorSelection.startLineNumber !== editorSelection.endLineNumber) {
        WordHighlighter.query = null;
        this._stopAll();
        return;
      }
      const startColumn = editorSelection.startColumn;
      const endColumn = editorSelection.endColumn;
      const word = this._getWord();
      if (!word || word.startColumn > startColumn || word.endColumn < endColumn) {
        WordHighlighter.query = null;
        this._stopAll();
        return;
      }
      WordHighlighter.query = {
        modelInfo: {
          modelURI: this.model.uri,
          selection: editorSelection
        }
      };
    }
    this.lastCursorPositionChangeTime = (/* @__PURE__ */ new Date()).getTime();
    if (isEqual(this.editor.getModel().uri, WordHighlighter.query.modelInfo?.modelURI)) {
      if (!multiFileConfigChange) {
        const currentModelDecorationRanges = this.decorations.getRanges();
        for (const storedRange of currentModelDecorationRanges) {
          if (storedRange.containsPosition(this.editor.getPosition())) {
            return;
          }
        }
      }
      this._stopAll(multiFileConfigChange ? this.model.uri : void 0);
      const myRequestId = ++this.workerRequestTokenId;
      this.workerRequestCompleted = false;
      const otherModelsToHighlight = this.getOtherModelsToHighlight(this.editor.getModel());
      if (!WordHighlighter.query || !WordHighlighter.query.modelInfo) {
        return;
      }
      const queryModelRef = await this.textModelService.createModelReference(WordHighlighter.query.modelInfo.modelURI);
      try {
        this.workerRequest = this.computeWithModel(queryModelRef.object.textEditorModel, WordHighlighter.query.modelInfo.selection, otherModelsToHighlight);
        this.workerRequest?.result.then((data) => {
          if (myRequestId === this.workerRequestTokenId) {
            this.workerRequestCompleted = true;
            this.workerRequestValue = data || [];
            this._beginRenderDecorations(delay ?? this.occurrencesHighlightDelay);
          }
        }, onUnexpectedError);
      } catch (e) {
        this.logService.error("Unexpected error during occurrence request. Log: ", e);
      } finally {
        queryModelRef.dispose();
      }
    } else if (this.model.uri.scheme === Schemas.vscodeNotebookCell) {
      const myRequestId = ++this.workerRequestTokenId;
      this.workerRequestCompleted = false;
      if (!WordHighlighter.query || !WordHighlighter.query.modelInfo) {
        return;
      }
      const queryModelRef = await this.textModelService.createModelReference(WordHighlighter.query.modelInfo.modelURI);
      try {
        this.workerRequest = this.computeWithModel(queryModelRef.object.textEditorModel, WordHighlighter.query.modelInfo.selection, [this.model]);
        this.workerRequest?.result.then((data) => {
          if (myRequestId === this.workerRequestTokenId) {
            this.workerRequestCompleted = true;
            this.workerRequestValue = data || [];
            this._beginRenderDecorations(delay ?? this.occurrencesHighlightDelay);
          }
        }, onUnexpectedError);
      } catch (e) {
        this.logService.error("Unexpected error during occurrence request. Log: ", e);
      } finally {
        queryModelRef.dispose();
      }
    }
  }
  computeWithModel(model, selection, otherModels) {
    if (!otherModels.length) {
      return computeOccurencesAtPosition(this.providers, model, selection, this.editor.getOption(EditorOption.wordSeparators));
    } else {
      return computeOccurencesMultiModel(this.multiDocumentProviders, model, selection, this.editor.getOption(EditorOption.wordSeparators), otherModels);
    }
  }
  _beginRenderDecorations(delay) {
    const currentTime = (/* @__PURE__ */ new Date()).getTime();
    const minimumRenderTime = this.lastCursorPositionChangeTime + delay;
    if (currentTime >= minimumRenderTime) {
      this.renderDecorationsTimer = void 0;
      this.renderDecorations();
    } else {
      this.renderDecorationsTimer = setTimeout(() => {
        this.renderDecorations();
      }, minimumRenderTime - currentTime);
    }
  }
  renderDecorations() {
    this.renderDecorationsTimer = void 0;
    const currentEditors = this.codeEditorService.listCodeEditors();
    for (const editor of currentEditors) {
      const editorHighlighterContrib = WordHighlighterContribution.get(editor);
      if (!editorHighlighterContrib) {
        continue;
      }
      const newDecorations = [];
      const uri = editor.getModel()?.uri;
      if (uri && this.workerRequestValue.has(uri)) {
        const oldDecorationIDs = WordHighlighter.storedDecorationIDs.get(uri);
        const newDocumentHighlights = this.workerRequestValue.get(uri);
        if (newDocumentHighlights) {
          for (const highlight of newDocumentHighlights) {
            if (!highlight.range) {
              continue;
            }
            newDecorations.push({
              range: highlight.range,
              options: getHighlightDecorationOptions(highlight.kind)
            });
          }
        }
        let newDecorationIDs = [];
        editor.changeDecorations((changeAccessor) => {
          newDecorationIDs = changeAccessor.deltaDecorations(oldDecorationIDs ?? [], newDecorations);
        });
        WordHighlighter.storedDecorationIDs = WordHighlighter.storedDecorationIDs.set(uri, newDecorationIDs);
        if (newDecorations.length > 0) {
          editorHighlighterContrib.wordHighlighter?.decorations.set(newDecorations);
          editorHighlighterContrib.wordHighlighter?._hasWordHighlights.set(true);
        }
      }
    }
    this.workerRequest = null;
  }
  dispose() {
    this._stopSingular();
    this.toUnhook.dispose();
  }
};
WordHighlighter.storedDecorationIDs = new ResourceMap();
WordHighlighter.query = null;
WordHighlighter = __decorateClass([
  __decorateParam(4, ITextModelService),
  __decorateParam(5, ICodeEditorService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILogService)
], WordHighlighter);
let WordHighlighterContribution = class extends Disposable {
  static get(editor) {
    return editor.getContribution(WordHighlighterContribution.ID);
  }
  constructor(editor, contextKeyService, languageFeaturesService, codeEditorService, textModelService, configurationService, logService) {
    super();
    this._wordHighlighter = null;
    const createWordHighlighterIfPossible = () => {
      if (editor.hasModel() && !editor.getModel().isTooLargeForTokenization() && editor.getModel().uri.scheme !== Schemas.accessibleView) {
        this._wordHighlighter = new WordHighlighter(editor, languageFeaturesService.documentHighlightProvider, languageFeaturesService.multiDocumentHighlightProvider, contextKeyService, textModelService, codeEditorService, configurationService, logService);
      }
    };
    this._register(editor.onDidChangeModel((e) => {
      if (this._wordHighlighter) {
        if (!e.newModelUrl && e.oldModelUrl?.scheme !== Schemas.vscodeNotebookCell) {
          this.wordHighlighter?.stop();
        }
        this._wordHighlighter.dispose();
        this._wordHighlighter = null;
      }
      createWordHighlighterIfPossible();
    }));
    createWordHighlighterIfPossible();
  }
  get wordHighlighter() {
    return this._wordHighlighter;
  }
  saveViewState() {
    if (this._wordHighlighter && this._wordHighlighter.hasDecorations()) {
      return true;
    }
    return false;
  }
  moveNext() {
    this._wordHighlighter?.moveNext();
  }
  moveBack() {
    this._wordHighlighter?.moveBack();
  }
  restoreViewState(state) {
    if (this._wordHighlighter && state) {
      this._wordHighlighter.restore(250);
    }
  }
  stopHighlighting() {
    this._wordHighlighter?.stop();
  }
  dispose() {
    if (this._wordHighlighter) {
      this._wordHighlighter.dispose();
      this._wordHighlighter = null;
    }
    super.dispose();
  }
};
WordHighlighterContribution.ID = "editor.contrib.wordHighlighter";
WordHighlighterContribution = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILogService)
], WordHighlighterContribution);
class WordHighlightNavigationAction extends EditorAction {
  constructor(next, opts) {
    super(opts);
    this._isNext = next;
  }
  run(accessor, editor) {
    const controller = WordHighlighterContribution.get(editor);
    if (!controller) {
      return;
    }
    if (this._isNext) {
      controller.moveNext();
    } else {
      controller.moveBack();
    }
  }
}
class NextWordHighlightAction extends WordHighlightNavigationAction {
  constructor() {
    super(true, {
      id: "editor.action.wordHighlight.next",
      label: nls.localize2("wordHighlight.next.label", "Go to Next Symbol Highlight"),
      precondition: ctxHasWordHighlights,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyCode.F7,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class PrevWordHighlightAction extends WordHighlightNavigationAction {
  constructor() {
    super(false, {
      id: "editor.action.wordHighlight.prev",
      label: nls.localize2("wordHighlight.previous.label", "Go to Previous Symbol Highlight"),
      precondition: ctxHasWordHighlights,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Shift | KeyCode.F7,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class TriggerWordHighlightAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.wordHighlight.trigger",
      label: nls.localize2("wordHighlight.trigger.label", "Trigger Symbol Highlight"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: 0,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    const controller = WordHighlighterContribution.get(editor);
    if (!controller) {
      return;
    }
    controller.restoreViewState(true);
  }
}
registerEditorContribution(WordHighlighterContribution.ID, WordHighlighterContribution, EditorContributionInstantiation.Eager);
registerEditorAction(NextWordHighlightAction);
registerEditorAction(PrevWordHighlightAction);
registerEditorAction(TriggerWordHighlightAction);
registerEditorFeature(TextualMultiDocumentHighlightFeature);
export {
  WordHighlighterContribution,
  getOccurrencesAcrossMultipleModels,
  getOccurrencesAtPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3dvcmRIaWdobGlnaHRlci9icm93c2VyL3dvcmRIaWdobGlnaHRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVsYXllciwgZmlyc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc1NjaGVtZSwgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgSUFjdGlvbk9wdGlvbnMsIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJNb2RlbEFuZFBvc2l0aW9uQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uLCBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yLCBJRWRpdG9yQ29udHJpYnV0aW9uLCBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckVkaXRvckZlYXR1cmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRIaWdobGlnaHQsIERvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsIE11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgc2NvcmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VTZWxlY3Rvci5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIHNob3VsZFN5bmNocm9uaXplTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEhpZ2hsaWdodERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi9oaWdobGlnaHREZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXh0dWFsTXVsdGlEb2N1bWVudEhpZ2hsaWdodEZlYXR1cmUgfSBmcm9tICcuL3RleHR1YWxIaWdobGlnaHRQcm92aWRlci5qcyc7XG5cbmNvbnN0IGN0eEhhc1dvcmRIaWdobGlnaHRzID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2hhc1dvcmRIaWdobGlnaHRzJywgZmFsc2UpO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0T2NjdXJyZW5jZXNBdFBvc2l0aW9uKHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPiB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3Qgb3JkZXJlZEJ5U2NvcmUgPSByZWdpc3RyeS5vcmRlcmVkKG1vZGVsKTtcblxuXHQvLyBpbiBvcmRlciBvZiBzY29yZSBhc2sgdGhlIG9jY3VycmVuY2VzIHByb3ZpZGVyXG5cdC8vIHVudGlsIHNvbWVvbmUgcmVzcG9uc2Ugd2l0aCBhIGdvb2QgcmVzdWx0XG5cdC8vIChnb29kID0gbm9uIHVuZGVmaW5lZCBhbmQgbm9uIG51bGwgdmFsdWUpXG5cdC8vIChyZXN1bHQgb2Ygc2l6ZSA9PSAwIGlzIHZhbGlkLCBubyBoaWdobGlnaHRzIGlzIGEgdmFsaWQvZXhwZWN0ZWQgcmVzdWx0IC0tIG5vdCBhIHNpZ25hbCB0byBmYWxsIGJhY2sgdG8gb3RoZXIgcHJvdmlkZXJzKVxuXHRyZXR1cm4gZmlyc3Q8RG9jdW1lbnRIaWdobGlnaHRbXSB8IG51bGwgfCB1bmRlZmluZWQ+KG9yZGVyZWRCeVNjb3JlLm1hcChwcm92aWRlciA9PiAoKSA9PiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShwcm92aWRlci5wcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKG1vZGVsLCBwb3NpdGlvbiwgdG9rZW4pKVxuXHRcdFx0LnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKTtcblx0fSksIChyZXN1bHQpOiByZXN1bHQgaXMgRG9jdW1lbnRIaWdobGlnaHRbXSA9PiByZXN1bHQgIT09IHVuZGVmaW5lZCAmJiByZXN1bHQgIT09IG51bGwpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRjb25zdCBtYXAgPSBuZXcgUmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4oKTtcblx0XHRcdG1hcC5zZXQobW9kZWwudXJpLCByZXN1bHQpO1xuXHRcdFx0cmV0dXJuIG1hcDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPigpO1xuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE9jY3VycmVuY2VzQWNyb3NzTXVsdGlwbGVNb2RlbHMocmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PE11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgb3RoZXJNb2RlbHM6IElUZXh0TW9kZWxbXSk6IFByb21pc2U8UmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4gfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IG9yZGVyZWRCeVNjb3JlID0gcmVnaXN0cnkub3JkZXJlZChtb2RlbCk7XG5cblx0Ly8gaW4gb3JkZXIgb2Ygc2NvcmUgYXNrIHRoZSBvY2N1cnJlbmNlcyBwcm92aWRlclxuXHQvLyB1bnRpbCBzb21lb25lIHJlc3BvbnNlIHdpdGggYSBnb29kIHJlc3VsdFxuXHQvLyAoZ29vZCA9IG5vbiB1bmRlZmluZWQgYW5kIG5vbiBudWxsIFJlc291cmNlTWFwKVxuXHQvLyAocmVzdWx0IG9mIHNpemUgPT0gMCBpcyB2YWxpZCwgbm8gaGlnaGxpZ2h0cyBpcyBhIHZhbGlkL2V4cGVjdGVkIHJlc3VsdCAtLSBub3QgYSBzaWduYWwgdG8gZmFsbCBiYWNrIHRvIG90aGVyIHByb3ZpZGVycylcblx0cmV0dXJuIGZpcnN0PFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+IHwgbnVsbCB8IHVuZGVmaW5lZD4ob3JkZXJlZEJ5U2NvcmUubWFwKHByb3ZpZGVyID0+ICgpID0+IHtcblx0XHRjb25zdCBmaWx0ZXJlZE1vZGVscyA9IG90aGVyTW9kZWxzLmZpbHRlcihvdGhlck1vZGVsID0+IHtcblx0XHRcdHJldHVybiBzaG91bGRTeW5jaHJvbml6ZU1vZGVsKG90aGVyTW9kZWwpO1xuXHRcdH0pLmZpbHRlcihvdGhlck1vZGVsID0+IHtcblx0XHRcdHJldHVybiBzY29yZShwcm92aWRlci5zZWxlY3Rvciwgb3RoZXJNb2RlbC51cmksIG90aGVyTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkgPiAwO1xuXHRcdH0pO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZU11bHRpRG9jdW1lbnRIaWdobGlnaHRzKG1vZGVsLCBwb3NpdGlvbiwgZmlsdGVyZWRNb2RlbHMsIHRva2VuKSlcblx0XHRcdC50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcik7XG5cdH0pLCAocmVzdWx0KTogcmVzdWx0IGlzIFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+ID0+IHJlc3VsdCAhPT0gdW5kZWZpbmVkICYmIHJlc3VsdCAhPT0gbnVsbCk7XG59XG5cbmludGVyZmFjZSBJT2NjdXJlbmNlQXRQb3NpdGlvblJlcXVlc3Qge1xuXHRyZWFkb25seSByZXN1bHQ6IFByb21pc2U8UmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4+O1xuXHRpc1ZhbGlkKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24pOiBib29sZWFuO1xuXHRjYW5jZWwoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElXb3JkSGlnaGxpZ2h0ZXJRdWVyeSB7XG5cdG1vZGVsSW5mbzoge1xuXHRcdG1vZGVsVVJJOiBVUkk7XG5cdFx0c2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdH0gfCBudWxsO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCBpbXBsZW1lbnRzIElPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd29yZFJhbmdlOiBSYW5nZSB8IG51bGw7XG5cdHByaXZhdGUgX3Jlc3VsdDogQ2FuY2VsYWJsZVByb21pc2U8UmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4+IHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbCwgcHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHByaXZhdGUgcmVhZG9ubHkgX3dvcmRTZXBhcmF0b3JzOiBzdHJpbmcpIHtcblx0XHR0aGlzLl93b3JkUmFuZ2UgPSB0aGlzLl9nZXRDdXJyZW50V29yZFJhbmdlKF9tb2RlbCwgX3NlbGVjdGlvbik7XG5cdFx0dGhpcy5fcmVzdWx0ID0gbnVsbDtcblx0fVxuXG5cdGdldCByZXN1bHQoKSB7XG5cdFx0aWYgKCF0aGlzLl9yZXN1bHQpIHtcblx0XHRcdHRoaXMuX3Jlc3VsdCA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoaXMuX2NvbXB1dGUodGhpcy5fbW9kZWwsIHRoaXMuX3NlbGVjdGlvbiwgdGhpcy5fd29yZFNlcGFyYXRvcnMsIHRva2VuKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2NvbXB1dGUobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+PjtcblxuXHRwcml2YXRlIF9nZXRDdXJyZW50V29yZFJhbmdlKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbik6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpKTtcblx0XHRpZiAod29yZCkge1xuXHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGlzVmFsaWQobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBkZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbik6IGJvb2xlYW4ge1xuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBzZWxlY3Rpb24uc3RhcnRDb2x1bW47XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gc2VsZWN0aW9uLmVuZENvbHVtbjtcblx0XHRjb25zdCBjdXJyZW50V29yZFJhbmdlID0gdGhpcy5fZ2V0Q3VycmVudFdvcmRSYW5nZShtb2RlbCwgc2VsZWN0aW9uKTtcblxuXHRcdGxldCByZXF1ZXN0SXNWYWxpZCA9IEJvb2xlYW4odGhpcy5fd29yZFJhbmdlICYmIHRoaXMuX3dvcmRSYW5nZS5lcXVhbHNSYW5nZShjdXJyZW50V29yZFJhbmdlKSk7XG5cblx0XHQvLyBFdmVuIGlmIHdlIGFyZSBvbiBhIGRpZmZlcmVudCB3b3JkLCBpZiB0aGF0IHdvcmQgaXMgaW4gdGhlIGRlY29yYXRpb25zIHJhbmdlcywgdGhlIHJlcXVlc3QgaXMgc3RpbGwgdmFsaWRcblx0XHQvLyAoU2FtZSBzeW1ib2wpXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGRlY29yYXRpb25zLmxlbmd0aDsgIXJlcXVlc3RJc1ZhbGlkICYmIGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBkZWNvcmF0aW9ucy5nZXRSYW5nZShpKTtcblx0XHRcdGlmIChyYW5nZSAmJiByYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0aWYgKHJhbmdlLnN0YXJ0Q29sdW1uIDw9IHN0YXJ0Q29sdW1uICYmIHJhbmdlLmVuZENvbHVtbiA+PSBlbmRDb2x1bW4pIHtcblx0XHRcdFx0XHRyZXF1ZXN0SXNWYWxpZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVxdWVzdElzVmFsaWQ7XG5cdH1cblxuXHRwdWJsaWMgY2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMucmVzdWx0LmNhbmNlbCgpO1xuXHR9XG59XG5cbmNsYXNzIFNlbWFudGljT2NjdXJlbmNlQXRQb3NpdGlvblJlcXVlc3QgZXh0ZW5kcyBPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPjtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcsIHByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8RG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj4pIHtcblx0XHRzdXBlcihtb2RlbCwgc2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9ycyk7XG5cdFx0dGhpcy5fcHJvdmlkZXJzID0gcHJvdmlkZXJzO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jb21wdXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPj4ge1xuXHRcdHJldHVybiBnZXRPY2N1cnJlbmNlc0F0UG9zaXRpb24odGhpcy5fcHJvdmlkZXJzLCBtb2RlbCwgc2VsZWN0aW9uLmdldFBvc2l0aW9uKCksIHRva2VuKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIE11bHRpTW9kZWxPY2N1cmVuY2VSZXF1ZXN0IGV4dGVuZHMgT2NjdXJlbmNlQXRQb3NpdGlvblJlcXVlc3Qge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnM6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PE11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX290aGVyTW9kZWxzOiBJVGV4dE1vZGVsW107XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nLCBwcm92aWRlcnM6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PE11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj4sIG90aGVyTW9kZWxzOiBJVGV4dE1vZGVsW10pIHtcblx0XHRzdXBlcihtb2RlbCwgc2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9ycyk7XG5cdFx0dGhpcy5fcHJvdmlkZXJzID0gcHJvdmlkZXJzO1xuXHRcdHRoaXMuX290aGVyTW9kZWxzID0gb3RoZXJNb2RlbHM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NvbXB1dGUobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+PiB7XG5cdFx0cmV0dXJuIGdldE9jY3VycmVuY2VzQWNyb3NzTXVsdGlwbGVNb2RlbHModGhpcy5fcHJvdmlkZXJzLCBtb2RlbCwgc2VsZWN0aW9uLmdldFBvc2l0aW9uKCksIHRva2VuLCB0aGlzLl9vdGhlck1vZGVscykudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4oKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9KTtcblx0fVxufVxuXG5cbmZ1bmN0aW9uIGNvbXB1dGVPY2N1cmVuY2VzQXRQb3NpdGlvbihyZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8RG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZyk6IElPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB7XG5cdHJldHVybiBuZXcgU2VtYW50aWNPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdChtb2RlbCwgc2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9ycywgcmVnaXN0cnkpO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlT2NjdXJlbmNlc011bHRpTW9kZWwocmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PE11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZywgb3RoZXJNb2RlbHM6IElUZXh0TW9kZWxbXSk6IElPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB7XG5cdHJldHVybiBuZXcgTXVsdGlNb2RlbE9jY3VyZW5jZVJlcXVlc3QobW9kZWwsIHNlbGVjdGlvbiwgd29yZFNlcGFyYXRvcnMsIHJlZ2lzdHJ5LCBvdGhlck1vZGVscyk7XG59XG5cbnJlZ2lzdGVyTW9kZWxBbmRQb3NpdGlvbkNvbW1hbmQoJ19leGVjdXRlRG9jdW1lbnRIaWdobGlnaHRzJywgYXN5bmMgKGFjY2Vzc29yLCBtb2RlbCwgcG9zaXRpb24pID0+IHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3QgbWFwID0gYXdhaXQgZ2V0T2NjdXJyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdHJldHVybiBtYXA/LmdldChtb2RlbC51cmkpO1xufSk7XG5cbmNsYXNzIFdvcmRIaWdobGlnaHRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8RG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgbXVsdGlEb2N1bWVudFByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSB0b1VuaG9vayA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblxuXHRwcml2YXRlIG9jY3VycmVuY2VzSGlnaGxpZ2h0RW5hYmxlbWVudDogc3RyaW5nO1xuXHRwcml2YXRlIG9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXk6IG51bWJlcjtcblxuXHRwcml2YXRlIHdvcmtlclJlcXVlc3RUb2tlbklkOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHdvcmtlclJlcXVlc3Q6IElPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB8IG51bGw7XG5cdHByaXZhdGUgd29ya2VyUmVxdWVzdENvbXBsZXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHdvcmtlclJlcXVlc3RWYWx1ZTogUmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4gPSBuZXcgUmVzb3VyY2VNYXAoKTtcblxuXHRwcml2YXRlIGxhc3RDdXJzb3JQb3NpdGlvbkNoYW5nZVRpbWU6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVuZGVyRGVjb3JhdGlvbnNUaW1lcjogVGltZW91dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNXb3JkSGlnaGxpZ2h0czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2lnbm9yZVBvc2l0aW9uQ2hhbmdlRXZlbnQ6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBydW5EZWxheWVyOiBEZWxheWVyPHZvaWQ+ID0gdGhpcy50b1VuaG9vay5hZGQobmV3IERlbGF5ZXI8dm9pZD4oNTApKTtcblxuXHRwcml2YXRlIHN0YXRpYyBzdG9yZWREZWNvcmF0aW9uSURzOiBSZXNvdXJjZU1hcDxzdHJpbmdbXT4gPSBuZXcgUmVzb3VyY2VNYXAoKTtcblx0cHJpdmF0ZSBzdGF0aWMgcXVlcnk6IElXb3JkSGlnaGxpZ2h0ZXJRdWVyeSB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdFx0cHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPixcblx0XHRtdWx0aVByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPixcblx0XHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5wcm92aWRlcnMgPSBwcm92aWRlcnM7XG5cdFx0dGhpcy5tdWx0aURvY3VtZW50UHJvdmlkZXJzID0gbXVsdGlQcm92aWRlcnM7XG5cblx0XHR0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlID0gY29kZUVkaXRvclNlcnZpY2U7XG5cdFx0dGhpcy50ZXh0TW9kZWxTZXJ2aWNlID0gdGV4dE1vZGVsU2VydmljZTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblxuXHRcdHRoaXMuX2hhc1dvcmRIaWdobGlnaHRzID0gY3R4SGFzV29yZEhpZ2hsaWdodHMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9pZ25vcmVQb3NpdGlvbkNoYW5nZUV2ZW50ID0gZmFsc2U7XG5cdFx0dGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLm9jY3VycmVuY2VzSGlnaGxpZ2h0KTtcblx0XHR0aGlzLm9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2VkaXRvci5vY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5Jyk7XG5cdFx0dGhpcy5tb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHR0aGlzLnRvVW5ob29rLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZTogSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faWdub3JlUG9zaXRpb25DaGFuZ2VFdmVudCkge1xuXHRcdFx0XHQvLyBXZSBhcmUgY2hhbmdpbmcgdGhlIHBvc2l0aW9uID0+IGlnbm9yZSB0aGlzIGV2ZW50XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHRFbmFibGVtZW50ID09PSAnb2ZmJykge1xuXHRcdFx0XHQvLyBFYXJseSBleGl0IGlmIG5vdGhpbmcgbmVlZHMgdG8gYmUgZG9uZSFcblx0XHRcdFx0Ly8gTGVhdmUgc29tZSBmb3JtIG9mIGVhcmx5IGV4aXQgY2hlY2sgaGVyZSBpZiB5b3Ugd2lzaCB0byBjb250aW51ZSBiZWluZyBhIGN1cnNvciBwb3NpdGlvbiBjaGFuZ2UgbGlzdGVuZXIgOylcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJ1bkRlbGF5ZXIudHJpZ2dlcigoKSA9PiB7IHRoaXMuX29uUG9zaXRpb25DaGFuZ2VkKGUpOyB9KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9Vbmhvb2suYWRkKGVkaXRvci5vbkRpZEZvY3VzRWRpdG9yVGV4dCgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHRFbmFibGVtZW50ID09PSAnb2ZmJykge1xuXHRcdFx0XHQvLyBFYXJseSBleGl0IGlmIG5vdGhpbmcgbmVlZHMgdG8gYmUgZG9uZVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy53b3JrZXJSZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMucnVuRGVsYXllci50cmlnZ2VyKCgpID0+IHsgdGhpcy5fcnVuKCk7IH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b1VuaG9vay5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRpZiAoIW1hdGNoZXNTY2hlbWUodGhpcy5tb2RlbC51cmksICdvdXRwdXQnKSkge1xuXHRcdFx0XHR0aGlzLl9zdG9wQWxsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9Vbmhvb2suYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsKChlKSA9PiB7XG5cdFx0XHRpZiAoIWUubmV3TW9kZWxVcmwgJiYgZS5vbGRNb2RlbFVybCkge1xuXHRcdFx0XHR0aGlzLl9zdG9wU2luZ3VsYXIoKTtcblx0XHRcdH0gZWxzZSBpZiAoV29yZEhpZ2hsaWdodGVyLnF1ZXJ5KSB7XG5cdFx0XHRcdHRoaXMuX3J1bigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvVW5ob29rLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdFbmFibGVtZW50ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5vY2N1cnJlbmNlc0hpZ2hsaWdodCk7XG5cdFx0XHRpZiAodGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgIT09IG5ld0VuYWJsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgPSBuZXdFbmFibGVtZW50O1xuXHRcdFx0XHRzd2l0Y2ggKG5ld0VuYWJsZW1lbnQpIHtcblx0XHRcdFx0XHRjYXNlICdvZmYnOlxuXHRcdFx0XHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnc2luZ2xlRmlsZSc6XG5cdFx0XHRcdFx0XHR0aGlzLl9zdG9wQWxsKFdvcmRIaWdobGlnaHRlci5xdWVyeT8ubW9kZWxJbmZvPy5tb2RlbFVSSSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdtdWx0aUZpbGUnOlxuXHRcdFx0XHRcdFx0aWYgKFdvcmRIaWdobGlnaHRlci5xdWVyeSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9ydW4odHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0Y29uc29sZS53YXJuKCdVbmtub3duIG9jY3VycmVuY2VzSGlnaGxpZ2h0IHNldHRpbmcgdmFsdWU6JywgbmV3RW5hYmxlbWVudCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvVW5ob29rLmFkZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5vY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5JykpIHtcblx0XHRcdFx0Y29uc3QgbmV3RGVsYXkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdlZGl0b3Iub2NjdXJyZW5jZXNIaWdobGlnaHREZWxheScpO1xuXHRcdFx0XHRpZiAodGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5ICE9PSBuZXdEZWxheSkge1xuXHRcdFx0XHRcdHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHREZWxheSA9IG5ld0RlbGF5O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9Vbmhvb2suYWRkKGVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0Ly8gbG9naWMgaXMgYXMgZm9sbG93c1xuXHRcdFx0Ly8gLSBkaWRCbHVyID0+IGFjdGl2ZSBudWxsID0+IHN0b3BhbGxcblx0XHRcdC8vIC0gZGlkQmx1ciA9PiBhY3RpdmUgbmIgICA9PiBpZiB0aGlzLmVkaXRvciBpcyBub3RlYm9vaywgZG8gbm90aGluZyAobmV3IGNlbGwsIHNvIHdlIGRvbid0IHdhbnQgdG8gc3RvcEFsbClcblx0XHRcdC8vICAgICAgICAgICAgICBhY3RpdmUgbmIgICA9PiBpZiB0aGlzLmVkaXRvciBpcyBOT1QgbmIsICAgc3RvcEFsbFxuXG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0XHRpZiAoIWFjdGl2ZUVkaXRvcikgeyAvLyBjbGlja2VkIGludG8gbmIgY2VsbCBsaXN0LCBvdXRsaW5lLCB0ZXJtaW5hbCwgZXRjXG5cdFx0XHRcdHRoaXMuX3N0b3BBbGwoKTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aXZlRWRpdG9yLmdldE1vZGVsKCk/LnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsICYmIHRoaXMuZWRpdG9yLmdldE1vZGVsKCk/LnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7IC8vIHN3aXRjaGVkIHRhYnMgZnJvbSBub24tbmIgdG8gbmJcblx0XHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmVkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLndvcmtlclJlcXVlc3RUb2tlbklkID0gMDtcblx0XHR0aGlzLndvcmtlclJlcXVlc3QgPSBudWxsO1xuXHRcdHRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCA9IGZhbHNlO1xuXG5cdFx0dGhpcy5sYXN0Q3Vyc29yUG9zaXRpb25DaGFuZ2VUaW1lID0gMDtcblx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBpZiB0aGVyZSBpcyBhIHF1ZXJ5IGFscmVhZHksIGhpZ2hsaWdodCBvZmYgdGhhdCBxdWVyeVxuXHRcdGlmIChXb3JkSGlnaGxpZ2h0ZXIucXVlcnkpIHtcblx0XHRcdHRoaXMuX3J1bigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYXNEZWNvcmF0aW9ucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuZGVjb3JhdGlvbnMubGVuZ3RoID4gMCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzdG9yZShkZWxheTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHRFbmFibGVtZW50ID09PSAnb2ZmJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucnVuRGVsYXllci5jYW5jZWwoKTtcblx0XHR0aGlzLnJ1bkRlbGF5ZXIudHJpZ2dlcigoKSA9PiB7IHRoaXMuX3J1bihmYWxzZSwgZGVsYXkpOyB9KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHRwdWJsaWMgdHJpZ2dlcigpIHtcblx0XHR0aGlzLnJ1bkRlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5fcnVuKGZhbHNlLCAwKTsgLy8gaW1tZWRpYXRlIHJlbmRlcmluZyAoZGVsYXkgPSAwKVxuXHR9XG5cblx0cHVibGljIHN0b3AoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHRFbmFibGVtZW50ID09PSAnb2ZmJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0b3BBbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNvcnRlZEhpZ2hsaWdodHMoKTogUmFuZ2VbXSB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMuZGVjb3JhdGlvbnMuZ2V0UmFuZ2VzKClcblx0XHRcdFx0LnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgbW92ZU5leHQoKSB7XG5cdFx0Y29uc3QgaGlnaGxpZ2h0cyA9IHRoaXMuX2dldFNvcnRlZEhpZ2hsaWdodHMoKTtcblx0XHRjb25zdCBpbmRleCA9IGhpZ2hsaWdodHMuZmluZEluZGV4KChyYW5nZSkgPT4gcmFuZ2UuY29udGFpbnNQb3NpdGlvbih0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpKSk7XG5cdFx0Y29uc3QgbmV3SW5kZXggPSAoKGluZGV4ICsgMSkgJSBoaWdobGlnaHRzLmxlbmd0aCk7XG5cdFx0Y29uc3QgZGVzdCA9IGhpZ2hsaWdodHNbbmV3SW5kZXhdO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pZ25vcmVQb3NpdGlvbkNoYW5nZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFBvc2l0aW9uKGRlc3QuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdHRoaXMuZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChkZXN0KTtcblx0XHRcdGNvbnN0IHdvcmQgPSB0aGlzLl9nZXRXb3JkKCk7XG5cdFx0XHRpZiAod29yZCkge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGluZUNvbnRlbnQoZGVzdC5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRhbGVydChgJHtsaW5lQ29udGVudH0sICR7bmV3SW5kZXggKyAxfSBvZiAke2hpZ2hsaWdodHMubGVuZ3RofSBmb3IgJyR7d29yZC53b3JkfSdgKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faWdub3JlUG9zaXRpb25DaGFuZ2VFdmVudCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBtb3ZlQmFjaygpIHtcblx0XHRjb25zdCBoaWdobGlnaHRzID0gdGhpcy5fZ2V0U29ydGVkSGlnaGxpZ2h0cygpO1xuXHRcdGNvbnN0IGluZGV4ID0gaGlnaGxpZ2h0cy5maW5kSW5kZXgoKHJhbmdlKSA9PiByYW5nZS5jb250YWluc1Bvc2l0aW9uKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpKTtcblx0XHRjb25zdCBuZXdJbmRleCA9ICgoaW5kZXggLSAxICsgaGlnaGxpZ2h0cy5sZW5ndGgpICUgaGlnaGxpZ2h0cy5sZW5ndGgpO1xuXHRcdGNvbnN0IGRlc3QgPSBoaWdobGlnaHRzW25ld0luZGV4XTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faWdub3JlUG9zaXRpb25DaGFuZ2VFdmVudCA9IHRydWU7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRQb3NpdGlvbihkZXN0LmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoZGVzdCk7XG5cdFx0XHRjb25zdCB3b3JkID0gdGhpcy5fZ2V0V29yZCgpO1xuXHRcdFx0aWYgKHdvcmQpIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb250ZW50KGRlc3Quc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0YWxlcnQoYCR7bGluZUNvbnRlbnR9LCAke25ld0luZGV4ICsgMX0gb2YgJHtoaWdobGlnaHRzLmxlbmd0aH0gZm9yICcke3dvcmQud29yZH0nYCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lnbm9yZVBvc2l0aW9uQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVTaW5nbGVEZWNvcmF0aW9ucygpOiB2b2lkIHtcblx0XHQvLyByZXR1cm4gaWYgbm8gbW9kZWxcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50RGVjb3JhdGlvbklEcyA9IFdvcmRIaWdobGlnaHRlci5zdG9yZWREZWNvcmF0aW9uSURzLmdldCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cdFx0aWYgKCFjdXJyZW50RGVjb3JhdGlvbklEcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yLnJlbW92ZURlY29yYXRpb25zKGN1cnJlbnREZWNvcmF0aW9uSURzKTtcblx0XHRXb3JkSGlnaGxpZ2h0ZXIuc3RvcmVkRGVjb3JhdGlvbklEcy5kZWxldGUodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS51cmkpO1xuXG5cdFx0aWYgKHRoaXMuZGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0dGhpcy5faGFzV29yZEhpZ2hsaWdodHMuc2V0KGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVBbGxEZWNvcmF0aW9ucyhwcmVzZXJ2ZWRNb2RlbD86IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRFZGl0b3JzID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKTtcblx0XHRjb25zdCBkZWxldGVVUkkgPSBbXTtcblx0XHQvLyBpdGVyYXRlIG92ZXIgZWRpdG9ycyBhbmQgc3RvcmUgbW9kZWxzIGluIGN1cnJlbnRNb2RlbHNcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBjdXJyZW50RWRpdG9ycykge1xuXHRcdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSB8fCBpc0VxdWFsKGVkaXRvci5nZXRNb2RlbCgpLnVyaSwgcHJlc2VydmVkTW9kZWwpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50RGVjb3JhdGlvbklEcyA9IFdvcmRIaWdobGlnaHRlci5zdG9yZWREZWNvcmF0aW9uSURzLmdldChlZGl0b3IuZ2V0TW9kZWwoKS51cmkpO1xuXHRcdFx0aWYgKCFjdXJyZW50RGVjb3JhdGlvbklEcykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0ZWRpdG9yLnJlbW92ZURlY29yYXRpb25zKGN1cnJlbnREZWNvcmF0aW9uSURzKTtcblx0XHRcdGRlbGV0ZVVSSS5wdXNoKGVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cblx0XHRcdGNvbnN0IGVkaXRvckhpZ2hsaWdodGVyQ29udHJpYiA9IFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5nZXQoZWRpdG9yKTtcblx0XHRcdGlmICghZWRpdG9ySGlnaGxpZ2h0ZXJDb250cmliPy53b3JkSGlnaGxpZ2h0ZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlZGl0b3JIaWdobGlnaHRlckNvbnRyaWIud29yZEhpZ2hsaWdodGVyLmRlY29yYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZWRpdG9ySGlnaGxpZ2h0ZXJDb250cmliLndvcmRIaWdobGlnaHRlci5kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHRlZGl0b3JIaWdobGlnaHRlckNvbnRyaWIud29yZEhpZ2hsaWdodGVyLndvcmtlclJlcXVlc3QgPSBudWxsO1xuXHRcdFx0XHRlZGl0b3JIaWdobGlnaHRlckNvbnRyaWIud29yZEhpZ2hsaWdodGVyLl9oYXNXb3JkSGlnaGxpZ2h0cy5zZXQoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIGRlbGV0ZVVSSSkge1xuXHRcdFx0V29yZEhpZ2hsaWdodGVyLnN0b3JlZERlY29yYXRpb25JRHMuZGVsZXRlKHVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFNpbmd1bGFyKCk6IHZvaWQge1xuXHRcdC8vIFJlbW92ZSBhbnkgZXhpc3RpbmcgZGVjb3JhdGlvbnMgKyBhIHBvc3NpYmxlIHF1ZXJ5LCBhbmQgcmUgLSBydW4gdG8gdXBkYXRlIGRlY29yYXRpb25zXG5cdFx0dGhpcy5fcmVtb3ZlU2luZ2xlRGVjb3JhdGlvbnMoKTtcblxuXHRcdGlmICh0aGlzLmVkaXRvci5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yLmdldE1vZGVsKCk/LnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsICYmIFdvcmRIaWdobGlnaHRlci5xdWVyeT8ubW9kZWxJbmZvPy5tb2RlbFVSSS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7IC8vIGNsZWFyIHF1ZXJ5IGlmIGZvY3VzZWQgbm9uLW5iIGVkaXRvclxuXHRcdFx0XHRXb3JkSGlnaGxpZ2h0ZXIucXVlcnkgPSBudWxsO1xuXHRcdFx0XHR0aGlzLl9ydW4oKTsgLy8gVE9ETzogQFlveW9rcmF6eSAtLSBpbnZlc3RpZ2F0ZSB3aHkgd2UgbmVlZCBhIGZ1bGwgcmVydW4gaGVyZS4gbGlrZWx5IGFkZHJlc3NlZCBhIGNhc2UvcGF0Y2ggaW4gdGhlIGZpcnN0IGl0ZXJhdGlvbiBvZiB0aGlzIGZlYXR1cmVcblx0XHRcdH0gZWxzZSB7IC8vIHJlbW92ZSBtb2RlbEluZm8gdG8gYWNjb3VudCBmb3IgbmIgY2VsbCBiZWluZyBkaXNwb3NlZFxuXHRcdFx0XHRpZiAoV29yZEhpZ2hsaWdodGVyLnF1ZXJ5Py5tb2RlbEluZm8pIHtcblx0XHRcdFx0XHRXb3JkSGlnaGxpZ2h0ZXIucXVlcnkubW9kZWxJbmZvID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENhbmNlbCBhbnkgcmVuZGVyRGVjb3JhdGlvbnNUaW1lclxuXHRcdGlmICh0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMucmVuZGVyRGVjb3JhdGlvbnNUaW1lcik7XG5cdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FuY2VsIGFueSB3b3JrZXIgcmVxdWVzdFxuXHRcdGlmICh0aGlzLndvcmtlclJlcXVlc3QgIT09IG51bGwpIHtcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdC5jYW5jZWwoKTtcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gSW52YWxpZGF0ZSBhbnkgd29ya2VyIHJlcXVlc3QgY2FsbGJhY2tcblx0XHRpZiAoIXRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCkge1xuXHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0VG9rZW5JZCsrO1xuXHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0Q29tcGxldGVkID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wQWxsKHByZXNlcnZlZE1vZGVsPzogVVJJKTogdm9pZCB7XG5cdFx0Ly8gUmVtb3ZlIGFueSBleGlzdGluZyBkZWNvcmF0aW9uc1xuXHRcdC8vIFRPRE86IEBZb3lva3JhenkgLS0gdGhpcyB0cmlnZ2VycyBhcyBub3RlYm9va3Mgc2Nyb2xsLCBjYXVzaW5nIGhpZ2hsaWdodHMgdG8gZGlzYXBwZWFyIG1vbWVudGFyaWx5LlxuXHRcdC8vIG1heWJlIGEgbmIgdHlwZSBjaGVjaz9cblx0XHR0aGlzLl9yZW1vdmVBbGxEZWNvcmF0aW9ucyhwcmVzZXJ2ZWRNb2RlbCk7XG5cblx0XHQvLyBDYW5jZWwgYW55IHJlbmRlckRlY29yYXRpb25zVGltZXJcblx0XHRpZiAodGhpcy5yZW5kZXJEZWNvcmF0aW9uc1RpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIpO1xuXHRcdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9uc1RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENhbmNlbCBhbnkgd29ya2VyIHJlcXVlc3Rcblx0XHRpZiAodGhpcy53b3JrZXJSZXF1ZXN0ICE9PSBudWxsKSB7XG5cdFx0XHR0aGlzLndvcmtlclJlcXVlc3QuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLndvcmtlclJlcXVlc3QgPSBudWxsO1xuXHRcdH1cblxuXHRcdC8vIEludmFsaWRhdGUgYW55IHdvcmtlciByZXF1ZXN0IGNhbGxiYWNrXG5cdFx0aWYgKCF0aGlzLndvcmtlclJlcXVlc3RDb21wbGV0ZWQpIHtcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdFRva2VuSWQrKztcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25Qb3NpdGlvbkNoYW5nZWQoZTogSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBkaXNhYmxlZFxuXHRcdGlmICh0aGlzLm9jY3VycmVuY2VzSGlnaGxpZ2h0RW5hYmxlbWVudCA9PT0gJ29mZicpIHtcblx0XHRcdHRoaXMuX3N0b3BBbGwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBpZ25vcmUgdHlwaW5nICYgb3RoZXJcblx0XHQvLyBuZWVkIHRvIGNoZWNrIGlmIHRoZSBtb2RlbCBpcyBhIG5vdGVib29rIGNlbGwsIHNob3VsZCBub3Qgc3RvcCBpZiBuYlxuXHRcdGlmIChlLnNvdXJjZSAhPT0gJ2FwaScgJiYgZS5yZWFzb24gIT09IEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCkge1xuXHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3J1bigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0V29yZCgpOiBJV29yZEF0UG9zaXRpb24gfCBudWxsIHtcblx0XHRjb25zdCBlZGl0b3JTZWxlY3Rpb24gPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gZWRpdG9yU2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IGVkaXRvclNlbGVjdGlvbi5zdGFydENvbHVtbjtcblxuXHRcdGlmICh0aGlzLm1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0V29yZEF0UG9zaXRpb24oe1xuXHRcdFx0bGluZU51bWJlcjogbGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogc3RhcnRDb2x1bW5cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3RoZXJNb2RlbHNUb0hpZ2hsaWdodChtb2RlbDogSVRleHRNb2RlbCk6IElUZXh0TW9kZWxbXSB7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIG5vdGVib29rIGNhc2Vcblx0XHRjb25zdCBpc05vdGVib29rRWRpdG9yID0gbW9kZWwudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGw7XG5cdFx0aWYgKGlzTm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlbHM6IElUZXh0TW9kZWxbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY3VycmVudEVkaXRvcnMgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpO1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgY3VycmVudEVkaXRvcnMpIHtcblx0XHRcdFx0Y29uc3QgdGVtcE1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdGlmICh0ZW1wTW9kZWwgJiYgdGVtcE1vZGVsICE9PSBtb2RlbCAmJiB0ZW1wTW9kZWwudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdFx0XHRjdXJyZW50TW9kZWxzLnB1c2godGVtcE1vZGVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGN1cnJlbnRNb2RlbHM7XG5cdFx0fVxuXG5cdFx0Ly8gaW5saW5lIGNhc2Vcblx0XHQvLyA/IGN1cnJlbnQgd29ya3Mgd2hlbiBoaWdobGlnaHRpbmcgb3V0c2lkZSBvZiBhbiBpbmxpbmUgZGlmZiwgaGlnaGxpZ2h0aW5nIGluLlxuXHRcdC8vID8gYnJva2VuIHdoZW4gaGlnaGxpZ2h0aW5nIHdpdGhpbiBhIGRpZmYgZWRpdG9yLiBoaWdobGlnaHRpbmcgdGhlIG1haW4gZWRpdG9yIGRvZXMgbm90IHdvcmtcblx0XHQvLyA/IGVkaXRvciBncm91cCBzZXJ2aWNlIGNvdWxkIGJlIHVzZWZ1bCBoZXJlXG5cdFx0Y29uc3QgY3VycmVudE1vZGVsczogSVRleHRNb2RlbFtdID0gW107XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvcnMgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGN1cnJlbnRFZGl0b3JzKSB7XG5cdFx0XHRpZiAoIWlzRGlmZkVkaXRvcihlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGlmZk1vZGVsID0gKGVkaXRvciBhcyBJRGlmZkVkaXRvcikuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghZGlmZk1vZGVsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGVsID09PSBkaWZmTW9kZWwubW9kaWZpZWQpIHsgLy8gZW1iZWRkZWQgaW5saW5lIGNoYXQgZGlmZiB3b3VsZCBwYXNzIHRoaXMsIGFsbG93aW5nIGhpZ2hsaWdodHNcblx0XHRcdFx0Ly8/IGN1cnJlbnRNb2RlbHMucHVzaChkaWZmTW9kZWwub3JpZ2luYWwpO1xuXHRcdFx0XHRjdXJyZW50TW9kZWxzLnB1c2goZGlmZk1vZGVsLm1vZGlmaWVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGN1cnJlbnRNb2RlbHMubGVuZ3RoKSB7IC8vIG5vIG1hdGNoaW5nIGVkaXRvcnMgaGF2ZSBiZWVuIGZvdW5kXG5cdFx0XHRyZXR1cm4gY3VycmVudE1vZGVscztcblx0XHR9XG5cblx0XHQvLyBtdWx0aS1kb2MgT0ZGXG5cdFx0aWYgKHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHRFbmFibGVtZW50ID09PSAnc2luZ2xlRmlsZScpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBtdWx0aS1kb2MgT05cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBjdXJyZW50RWRpdG9ycykge1xuXHRcdFx0Y29uc3QgdGVtcE1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRcdGNvbnN0IGlzVmFsaWRNb2RlbCA9IHRlbXBNb2RlbCAmJiB0ZW1wTW9kZWwgIT09IG1vZGVsO1xuXG5cdFx0XHRpZiAoaXNWYWxpZE1vZGVsKSB7XG5cdFx0XHRcdGN1cnJlbnRNb2RlbHMucHVzaCh0ZW1wTW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudE1vZGVscztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bihtdWx0aUZpbGVDb25maWdDaGFuZ2U/OiBib29sZWFuLCBkZWxheT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgaGFzVGV4dEZvY3VzID0gdGhpcy5lZGl0b3IuaGFzVGV4dEZvY3VzKCk7XG5cdFx0aWYgKCFoYXNUZXh0Rm9jdXMpIHsgLy8gbmV3IG5iIGNlbGwgc2Nyb2xsZWQgaW4sIGRpZENoYW5nZU1vZGVsIGZpcmVzXG5cdFx0XHRpZiAoIVdvcmRIaWdobGlnaHRlci5xdWVyeSkgeyAvLyBubyBwcmV2aW91cyBxdWVyeSwgbm90aGluZyB0byBoaWdobGlnaHQgb2ZmIG9mXG5cdFx0XHRcdHRoaXMuX3N0b3BBbGwoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7IC8vIGhhcyB0ZXh0IGZvY3VzXG5cdFx0XHRjb25zdCBlZGl0b3JTZWxlY3Rpb24gPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdFx0Ly8gaWdub3JlIG11bHRpbGluZSBzZWxlY3Rpb25cblx0XHRcdGlmICghZWRpdG9yU2VsZWN0aW9uIHx8IGVkaXRvclNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IGVkaXRvclNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFdvcmRIaWdobGlnaHRlci5xdWVyeSA9IG51bGw7XG5cdFx0XHRcdHRoaXMuX3N0b3BBbGwoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IGVkaXRvclNlbGVjdGlvbi5zdGFydENvbHVtbjtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IGVkaXRvclNlbGVjdGlvbi5lbmRDb2x1bW47XG5cblx0XHRcdGNvbnN0IHdvcmQgPSB0aGlzLl9nZXRXb3JkKCk7XG5cblx0XHRcdC8vIFRoZSBzZWxlY3Rpb24gbXVzdCBiZSBpbnNpZGUgYSB3b3JkIG9yIHN1cnJvdW5kIG9uZSB3b3JkIGF0IG1vc3Rcblx0XHRcdGlmICghd29yZCB8fCB3b3JkLnN0YXJ0Q29sdW1uID4gc3RhcnRDb2x1bW4gfHwgd29yZC5lbmRDb2x1bW4gPCBlbmRDb2x1bW4pIHtcblx0XHRcdFx0Ly8gbm8gcHJldmlvdXMgcXVlcnksIG5vdGhpbmcgdG8gaGlnaGxpZ2h0XG5cdFx0XHRcdFdvcmRIaWdobGlnaHRlci5xdWVyeSA9IG51bGw7XG5cdFx0XHRcdHRoaXMuX3N0b3BBbGwoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRXb3JkSGlnaGxpZ2h0ZXIucXVlcnkgPSB7XG5cdFx0XHRcdG1vZGVsSW5mbzoge1xuXHRcdFx0XHRcdG1vZGVsVVJJOiB0aGlzLm1vZGVsLnVyaSxcblx0XHRcdFx0XHRzZWxlY3Rpb246IGVkaXRvclNlbGVjdGlvbixcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblxuXHRcdHRoaXMubGFzdEN1cnNvclBvc2l0aW9uQ2hhbmdlVGltZSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG5cblx0XHRpZiAoaXNFcXVhbCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaSwgV29yZEhpZ2hsaWdodGVyLnF1ZXJ5Lm1vZGVsSW5mbz8ubW9kZWxVUkkpKSB7IC8vIG9ubHkgdHJpZ2dlciBuZXcgd29ya2VyIHJlcXVlc3RzIGZyb20gdGhlIHByaW1hcnkgbW9kZWwgdGhhdCBpbml0aWF0ZWQgdGhlIHF1ZXJ5XG5cdFx0XHQvLyBjYXNlIGQpXG5cblx0XHRcdC8vIGNoZWNrIGlmIHRoZSBuZXcgcXVlcmllZCB3b3JkIGlzIGNvbnRhaW5lZCBpbiB0aGUgcmFuZ2Ugb2YgYSBzdG9yZWQgZGVjb3JhdGlvbiBmb3IgdGhpcyBtb2RlbFxuXHRcdFx0aWYgKCFtdWx0aUZpbGVDb25maWdDaGFuZ2UpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudE1vZGVsRGVjb3JhdGlvblJhbmdlcyA9IHRoaXMuZGVjb3JhdGlvbnMuZ2V0UmFuZ2VzKCk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc3RvcmVkUmFuZ2Ugb2YgY3VycmVudE1vZGVsRGVjb3JhdGlvblJhbmdlcykge1xuXHRcdFx0XHRcdGlmIChzdG9yZWRSYW5nZS5jb250YWluc1Bvc2l0aW9uKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIHN0b3AgYWxsIHByZXZpb3VzIGFjdGlvbnMgaWYgbmV3IHdvcmQgaXMgaGlnaGxpZ2h0ZWRcblx0XHRcdC8vIGlmIHdlIHRyaWdnZXIgdGhlIHJ1biBvZmYgYSBzZXR0aW5nIGNoYW5nZSAtPiBtdWx0aWZpbGUgaGlnaGxpZ2h0aW5nLCB3ZSBkbyBub3Qgd2FudCB0byByZW1vdmUgZGVjb3JhdGlvbnMgZnJvbSB0aGlzIG1vZGVsXG5cdFx0XHR0aGlzLl9zdG9wQWxsKG11bHRpRmlsZUNvbmZpZ0NoYW5nZSA/IHRoaXMubW9kZWwudXJpIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgbXlSZXF1ZXN0SWQgPSArK3RoaXMud29ya2VyUmVxdWVzdFRva2VuSWQ7XG5cdFx0XHR0aGlzLndvcmtlclJlcXVlc3RDb21wbGV0ZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3Qgb3RoZXJNb2RlbHNUb0hpZ2hsaWdodCA9IHRoaXMuZ2V0T3RoZXJNb2RlbHNUb0hpZ2hsaWdodCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpKTtcblxuXHRcdFx0Ly8gd2hlbiByZWFjaGluZyBoZXJlLCB0aGVyZSBhcmUgdHdvIHBvc3NpYmxlIHN0YXRlcy5cblx0XHRcdC8vIFx0XHQxKSB3ZSBoYXZlIHRleHQgZm9jdXMsIGFuZCBhIHZhbGlkIHF1ZXJ5IHdhcyB1cGRhdGVkLlxuXHRcdFx0Ly8gXHRcdDIpIHdlIGRvIG5vdCBoYXZlIHRleHQgZm9jdXMsIGFuZCBhIHZhbGlkIHF1ZXJ5IGlzIGNhY2hlZC5cblx0XHRcdC8vIHRoZSBxdWVyeSB3aWxsIEFMV0FZUyBoYXZlIHRoZSBjb3JyZWN0IGRhdGEgZm9yIHRoZSBjdXJyZW50IGhpZ2hsaWdodCByZXF1ZXN0LCBzbyBpdCBjYW4gYWx3YXlzIGJlIHBhc3NlZCB0byB0aGUgd29ya2VyUmVxdWVzdCBzYWZlbHlcblx0XHRcdGlmICghV29yZEhpZ2hsaWdodGVyLnF1ZXJ5IHx8ICFXb3JkSGlnaGxpZ2h0ZXIucXVlcnkubW9kZWxJbmZvKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlcnlNb2RlbFJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShXb3JkSGlnaGxpZ2h0ZXIucXVlcnkubW9kZWxJbmZvLm1vZGVsVVJJKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMud29ya2VyUmVxdWVzdCA9IHRoaXMuY29tcHV0ZVdpdGhNb2RlbChxdWVyeU1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwsIFdvcmRIaWdobGlnaHRlci5xdWVyeS5tb2RlbEluZm8uc2VsZWN0aW9uLCBvdGhlck1vZGVsc1RvSGlnaGxpZ2h0KTtcblx0XHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0Py5yZXN1bHQudGhlbihkYXRhID0+IHtcblx0XHRcdFx0XHRpZiAobXlSZXF1ZXN0SWQgPT09IHRoaXMud29ya2VyUmVxdWVzdFRva2VuSWQpIHtcblx0XHRcdFx0XHRcdHRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLndvcmtlclJlcXVlc3RWYWx1ZSA9IGRhdGEgfHwgW107XG5cdFx0XHRcdFx0XHR0aGlzLl9iZWdpblJlbmRlckRlY29yYXRpb25zKGRlbGF5ID8/IHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHREZWxheSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignVW5leHBlY3RlZCBlcnJvciBkdXJpbmcgb2NjdXJyZW5jZSByZXF1ZXN0LiBMb2c6ICcsIGUpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cXVlcnlNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMubW9kZWwudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdC8vIG5ldyB3b3JkSGlnaGxpZ2h0ZXIgY29taW5nIGZyb20gYSBkaWZmZXJlbnQgbW9kZWwsIE5PVCB0aGUgcXVlcnkgbW9kZWwsIG5lZWQgdG8gY3JlYXRlIGEgdGV4dE1vZGVsIHJlZlxuXG5cdFx0XHRjb25zdCBteVJlcXVlc3RJZCA9ICsrdGhpcy53b3JrZXJSZXF1ZXN0VG9rZW5JZDtcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCA9IGZhbHNlO1xuXG5cdFx0XHRpZiAoIVdvcmRIaWdobGlnaHRlci5xdWVyeSB8fCAhV29yZEhpZ2hsaWdodGVyLnF1ZXJ5Lm1vZGVsSW5mbykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1ZXJ5TW9kZWxSZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoV29yZEhpZ2hsaWdodGVyLnF1ZXJ5Lm1vZGVsSW5mby5tb2RlbFVSSSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLndvcmtlclJlcXVlc3QgPSB0aGlzLmNvbXB1dGVXaXRoTW9kZWwocXVlcnlNb2RlbFJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBXb3JkSGlnaGxpZ2h0ZXIucXVlcnkubW9kZWxJbmZvLnNlbGVjdGlvbiwgW3RoaXMubW9kZWxdKTtcblx0XHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0Py5yZXN1bHQudGhlbihkYXRhID0+IHtcblx0XHRcdFx0XHRpZiAobXlSZXF1ZXN0SWQgPT09IHRoaXMud29ya2VyUmVxdWVzdFRva2VuSWQpIHtcblx0XHRcdFx0XHRcdHRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLndvcmtlclJlcXVlc3RWYWx1ZSA9IGRhdGEgfHwgW107XG5cdFx0XHRcdFx0XHR0aGlzLl9iZWdpblJlbmRlckRlY29yYXRpb25zKGRlbGF5ID8/IHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHREZWxheSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignVW5leHBlY3RlZCBlcnJvciBkdXJpbmcgb2NjdXJyZW5jZSByZXF1ZXN0LiBMb2c6ICcsIGUpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cXVlcnlNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlV2l0aE1vZGVsKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgb3RoZXJNb2RlbHM6IElUZXh0TW9kZWxbXSk6IElPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB8IG51bGwge1xuXHRcdGlmICghb3RoZXJNb2RlbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gY29tcHV0ZU9jY3VyZW5jZXNBdFBvc2l0aW9uKHRoaXMucHJvdmlkZXJzLCBtb2RlbCwgc2VsZWN0aW9uLCB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBjb21wdXRlT2NjdXJlbmNlc011bHRpTW9kZWwodGhpcy5tdWx0aURvY3VtZW50UHJvdmlkZXJzLCBtb2RlbCwgc2VsZWN0aW9uLCB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSwgb3RoZXJNb2RlbHMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2JlZ2luUmVuZGVyRGVjb3JhdGlvbnMoZGVsYXk6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblx0XHRjb25zdCBtaW5pbXVtUmVuZGVyVGltZSA9IHRoaXMubGFzdEN1cnNvclBvc2l0aW9uQ2hhbmdlVGltZSArIGRlbGF5O1xuXG5cdFx0aWYgKGN1cnJlbnRUaW1lID49IG1pbmltdW1SZW5kZXJUaW1lKSB7XG5cdFx0XHQvLyBTeW5jaHJvbm91c1xuXHRcdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9uc1RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9ucygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBBc3luY2hyb25vdXNcblx0XHRcdHRoaXMucmVuZGVyRGVjb3JhdGlvbnNUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25zKCk7XG5cdFx0XHR9LCAobWluaW11bVJlbmRlclRpbWUgLSBjdXJyZW50VGltZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9uc1RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdC8vIGNyZWF0ZSBuZXcgbG9vcCwgaXRlcmF0ZSBvdmVyIGN1cnJlbnQgZWRpdG9ycyB1c2luZyB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpLFxuXHRcdC8vIGlmIHRoZSBVUkkgb2YgdGhhdCBjb2RlRWRpdG9yIGlzIGluIHRoZSBtYXAsIHRoZW4gYWRkIHRoZSBkZWNvcmF0aW9ucyB0byB0aGUgZGVjb3JhdGlvbnMgYXJyYXlcblx0XHQvLyB0aGVuIHNldCB0aGUgZGVjb3JhdGlvbnMgZm9yIHRoZSBlZGl0b3Jcblx0XHRjb25zdCBjdXJyZW50RWRpdG9ycyA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCk7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgY3VycmVudEVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGVkaXRvckhpZ2hsaWdodGVyQ29udHJpYiA9IFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5nZXQoZWRpdG9yKTtcblx0XHRcdGlmICghZWRpdG9ySGlnaGxpZ2h0ZXJDb250cmliKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXdEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IHVyaSA9IGVkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRpZiAodXJpICYmIHRoaXMud29ya2VyUmVxdWVzdFZhbHVlLmhhcyh1cmkpKSB7XG5cdFx0XHRcdGNvbnN0IG9sZERlY29yYXRpb25JRHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkID0gV29yZEhpZ2hsaWdodGVyLnN0b3JlZERlY29yYXRpb25JRHMuZ2V0KHVyaSk7XG5cdFx0XHRcdGNvbnN0IG5ld0RvY3VtZW50SGlnaGxpZ2h0cyA9IHRoaXMud29ya2VyUmVxdWVzdFZhbHVlLmdldCh1cmkpO1xuXHRcdFx0XHRpZiAobmV3RG9jdW1lbnRIaWdobGlnaHRzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBoaWdobGlnaHQgb2YgbmV3RG9jdW1lbnRIaWdobGlnaHRzKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWhpZ2hsaWdodC5yYW5nZSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG5ld0RlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogaGlnaGxpZ2h0LnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiBnZXRIaWdobGlnaHREZWNvcmF0aW9uT3B0aW9ucyhoaWdobGlnaHQua2luZClcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBuZXdEZWNvcmF0aW9uSURzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRlZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbklEcyA9IGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbklEcyA/PyBbXSwgbmV3RGVjb3JhdGlvbnMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0V29yZEhpZ2hsaWdodGVyLnN0b3JlZERlY29yYXRpb25JRHMgPSBXb3JkSGlnaGxpZ2h0ZXIuc3RvcmVkRGVjb3JhdGlvbklEcy5zZXQodXJpLCBuZXdEZWNvcmF0aW9uSURzKTtcblxuXHRcdFx0XHRpZiAobmV3RGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGVkaXRvckhpZ2hsaWdodGVyQ29udHJpYi53b3JkSGlnaGxpZ2h0ZXI/LmRlY29yYXRpb25zLnNldChuZXdEZWNvcmF0aW9ucyk7XG5cdFx0XHRcdFx0ZWRpdG9ySGlnaGxpZ2h0ZXJDb250cmliLndvcmRIaWdobGlnaHRlcj8uX2hhc1dvcmRIaWdobGlnaHRzLnNldCh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNsZWFyIHRoZSB3b3JrZXIgcmVxdWVzdCB3aGVuIGRlY29yYXRpb25zIGFyZSBjb21wbGV0ZWRcblx0XHR0aGlzLndvcmtlclJlcXVlc3QgPSBudWxsO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcFNpbmd1bGFyKCk7XG5cdFx0dGhpcy50b1VuaG9vay5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLndvcmRIaWdobGlnaHRlcic7XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbiB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbj4oV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLklEKTtcblx0fVxuXG5cdHByaXZhdGUgX3dvcmRIaWdobGlnaHRlcjogV29yZEhpZ2hsaWdodGVyIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3dvcmRIaWdobGlnaHRlciA9IG51bGw7XG5cdFx0Y29uc3QgY3JlYXRlV29yZEhpZ2hsaWdodGVySWZQb3NzaWJsZSA9ICgpID0+IHtcblx0XHRcdGlmIChlZGl0b3IuaGFzTW9kZWwoKSAmJiAhZWRpdG9yLmdldE1vZGVsKCkuaXNUb29MYXJnZUZvclRva2VuaXphdGlvbigpICYmIGVkaXRvci5nZXRNb2RlbCgpLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMuYWNjZXNzaWJsZVZpZXcpIHtcblx0XHRcdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyID0gbmV3IFdvcmRIaWdobGlnaHRlcihlZGl0b3IsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgY29udGV4dEtleVNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UsIGNvZGVFZGl0b3JTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3dvcmRIaWdobGlnaHRlcikge1xuXHRcdFx0XHRpZiAoIWUubmV3TW9kZWxVcmwgJiYgZS5vbGRNb2RlbFVybD8uc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCkgeyAvLyBoYXBwZW5zIHdoZW4gc3dpdGNoaW5nIHRhYnMgdG8gYSBub3RlYm9vayB0aGF0IGhhcyBmb2N1cyBpbiB0aGUgY2VsbCBsaXN0LCBubyBuZXcgbW9kZWwgVVJJICh0aGlzIGFsc28gZG9lc24ndCBtYWtlIGl0IHRvIHRoZSB3b3JkSGlnaGxpZ2h0ZXIsIGJjIG5vIGVkaXRvci5oYXNNb2RlbClcblx0XHRcdFx0XHR0aGlzLndvcmRIaWdobGlnaHRlcj8uc3RvcCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyID0gbnVsbDtcblx0XHRcdH1cblx0XHRcdGNyZWF0ZVdvcmRIaWdobGlnaHRlcklmUG9zc2libGUoKTtcblx0XHR9KSk7XG5cdFx0Y3JlYXRlV29yZEhpZ2hsaWdodGVySWZQb3NzaWJsZSgpO1xuXHR9XG5cblx0cHVibGljIGdldCB3b3JkSGlnaGxpZ2h0ZXIoKTogV29yZEhpZ2hsaWdodGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmRIaWdobGlnaHRlcjtcblx0fVxuXG5cdHB1YmxpYyBzYXZlVmlld1N0YXRlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl93b3JkSGlnaGxpZ2h0ZXIgJiYgdGhpcy5fd29yZEhpZ2hsaWdodGVyLmhhc0RlY29yYXRpb25zKCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgbW92ZU5leHQoKSB7XG5cdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyPy5tb3ZlTmV4dCgpO1xuXHR9XG5cblx0cHVibGljIG1vdmVCYWNrKCkge1xuXHRcdHRoaXMuX3dvcmRIaWdobGlnaHRlcj8ubW92ZUJhY2soKTtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlVmlld1N0YXRlKHN0YXRlOiBib29sZWFuIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dvcmRIaWdobGlnaHRlciAmJiBzdGF0ZSkge1xuXHRcdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyLnJlc3RvcmUoMjUwKTsgLy8gMjUwIG1zIGRlbGF5IHRvIHJlc3RvcmluZyB2aWV3IHN0YXRlLCBzaW5jZSBvbmx5IGV4dHMgY2FsbCB0aGlzXG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0b3BIaWdobGlnaHRpbmcoKSB7XG5cdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyPy5zdG9wKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd29yZEhpZ2hsaWdodGVyKSB7XG5cdFx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyID0gbnVsbDtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cblxuY2xhc3MgV29yZEhpZ2hsaWdodE5hdmlnYXRpb25BY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTmV4dDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihuZXh0OiBib29sZWFuLCBvcHRzOiBJQWN0aW9uT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdHMpO1xuXHRcdHRoaXMuX2lzTmV4dCA9IG5leHQ7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNOZXh0KSB7XG5cdFx0XHRjb250cm9sbGVyLm1vdmVOZXh0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRyb2xsZXIubW92ZUJhY2soKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTmV4dFdvcmRIaWdobGlnaHRBY3Rpb24gZXh0ZW5kcyBXb3JkSGlnaGxpZ2h0TmF2aWdhdGlvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi53b3JkSGlnaGxpZ2h0Lm5leHQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3dvcmRIaWdobGlnaHQubmV4dC5sYWJlbCcsIFwiR28gdG8gTmV4dCBTeW1ib2wgSGlnaGxpZ2h0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBjdHhIYXNXb3JkSGlnaGxpZ2h0cyxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5GNyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBQcmV2V29yZEhpZ2hsaWdodEFjdGlvbiBleHRlbmRzIFdvcmRIaWdobGlnaHROYXZpZ2F0aW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi53b3JkSGlnaGxpZ2h0LnByZXYnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3dvcmRIaWdobGlnaHQucHJldmlvdXMubGFiZWwnLCBcIkdvIHRvIFByZXZpb3VzIFN5bWJvbCBIaWdobGlnaHRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IGN0eEhhc1dvcmRIaWdobGlnaHRzLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkY3LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFRyaWdnZXJXb3JkSGlnaGxpZ2h0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLndvcmRIaWdobGlnaHQudHJpZ2dlcicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignd29yZEhpZ2hsaWdodC50cmlnZ2VyLmxhYmVsJywgXCJUcmlnZ2VyIFN5bWJvbCBIaWdobGlnaHRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRyb2xsZXIucmVzdG9yZVZpZXdTdGF0ZSh0cnVlKTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uSUQsIFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5FYWdlcik7IC8vIGVhZ2VyIGJlY2F1c2UgaXQgdXNlcyBgc2F2ZVZpZXdTdGF0ZWAvYHJlc3RvcmVWaWV3U3RhdGVgXG5yZWdpc3RlckVkaXRvckFjdGlvbihOZXh0V29yZEhpZ2hsaWdodEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihQcmV2V29yZEhpZ2hsaWdodEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUcmlnZ2VyV29yZEhpZ2hsaWdodEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckZlYXR1cmUoVGV4dHVhbE11bHRpRG9jdW1lbnRIaWdobGlnaHRGZWF0dXJlKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYTtBQUN0QixTQUE0Qix5QkFBeUIsU0FBUyxhQUFhO0FBQzNFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLGlDQUFpQztBQUM3RCxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZSxlQUFlO0FBQ3ZDLFNBQVMsZUFBZTtBQUV4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQixvQkFBb0IscUJBQXFCO0FBRS9ELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXlDLG9CQUFvQjtBQUM3RCxTQUFTLGNBQWMsaUNBQWlELHNCQUFzQiw0QkFBNEIsdUNBQXVDO0FB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
