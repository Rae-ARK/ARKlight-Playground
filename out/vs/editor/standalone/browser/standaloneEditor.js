import { mainWindow } from "../../../base/browser/window.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { splitLines } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import "./standalone-tokens.css";
import { FontMeasurements } from "../../browser/config/fontMeasurements.js";
import { EditorCommand } from "../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { createWebWorker as actualCreateWebWorker } from "./standaloneWebWorker.js";
import { ApplyUpdateResult, ConfigurationChangedEvent, EditorOptions } from "../../common/config/editorOptions.js";
import { EditorZoom } from "../../common/config/editorZoom.js";
import { BareFontInfo, FontInfo } from "../../common/config/fontInfo.js";
import { EditorType } from "../../common/editorCommon.js";
import * as languages from "../../common/languages.js";
import { ILanguageService } from "../../common/languages/language.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../common/languages/modesRegistry.js";
import { NullState, nullTokenize } from "../../common/languages/nullTokenize.js";
import { FindMatch, TextModelResolvedOptions } from "../../common/model.js";
import { IModelService } from "../../common/services/model.js";
import * as standaloneEnums from "../../common/standalone/standaloneEnums.js";
import { Colorizer } from "./colorizer.js";
import { StandaloneDiffEditor2, StandaloneEditor, createTextModel } from "./standaloneCodeEditor.js";
import { StandaloneKeybindingService, StandaloneServices } from "./standaloneServices.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { MenuId, MenuRegistry } from "../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { MultiDiffEditorWidget } from "../../browser/widget/multiDiffEditor/multiDiffEditorWidget.js";
import { IWebWorkerService } from "../../../platform/webWorker/browser/webWorkerService.js";
function create(domElement, options, override) {
  const instantiationService = StandaloneServices.initialize(override || {});
  return instantiationService.createInstance(StandaloneEditor, domElement, options);
}
function onDidCreateEditor(listener) {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.onCodeEditorAdd((editor) => {
    listener(editor);
  });
}
function onDidCreateDiffEditor(listener) {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.onDiffEditorAdd((editor) => {
    listener(editor);
  });
}
function getEditors() {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.listCodeEditors();
}
function getDiffEditors() {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.listDiffEditors();
}
function createDiffEditor(domElement, options, override) {
  const instantiationService = StandaloneServices.initialize(override || {});
  return instantiationService.createInstance(StandaloneDiffEditor2, domElement, options);
}
function createMultiFileDiffEditor(domElement, override) {
  const instantiationService = StandaloneServices.initialize(override || {});
  return new MultiDiffEditorWidget(domElement, {}, void 0, instantiationService);
}
function addCommand(descriptor) {
  if (typeof descriptor.id !== "string" || typeof descriptor.run !== "function") {
    throw new Error("Invalid command descriptor, `id` and `run` are required properties!");
  }
  return CommandsRegistry.registerCommand(descriptor.id, descriptor.run);
}
function addEditorAction(descriptor) {
  if (typeof descriptor.id !== "string" || typeof descriptor.label !== "string" || typeof descriptor.run !== "function") {
    throw new Error("Invalid action descriptor, `id`, `label` and `run` are required properties!");
  }
  const precondition = ContextKeyExpr.deserialize(descriptor.precondition);
  const run = (accessor, ...args) => {
    return EditorCommand.runEditorCommand(accessor, args, precondition, (accessor2, editor, args2) => Promise.resolve(descriptor.run(editor, ...args2)));
  };
  const toDispose = new DisposableStore();
  toDispose.add(CommandsRegistry.registerCommand(descriptor.id, run));
  if (descriptor.contextMenuGroupId) {
    const menuItem = {
      command: {
        id: descriptor.id,
        title: descriptor.label
      },
      when: precondition,
      group: descriptor.contextMenuGroupId,
      order: descriptor.contextMenuOrder || 0
    };
    toDispose.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
  }
  if (Array.isArray(descriptor.keybindings)) {
    const keybindingService = StandaloneServices.get(IKeybindingService);
    if (!(keybindingService instanceof StandaloneKeybindingService)) {
      console.warn("Cannot add keybinding because the editor is configured with an unrecognized KeybindingService");
    } else {
      const keybindingsWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(descriptor.keybindingContext));
      toDispose.add(keybindingService.addDynamicKeybindings(descriptor.keybindings.map((keybinding) => {
        return {
          keybinding,
          command: descriptor.id,
          when: keybindingsWhen
        };
      })));
    }
  }
  return toDispose;
}
function addKeybindingRule(rule) {
  return addKeybindingRules([rule]);
}
function addKeybindingRules(rules) {
  const keybindingService = StandaloneServices.get(IKeybindingService);
  if (!(keybindingService instanceof StandaloneKeybindingService)) {
    console.warn("Cannot add keybinding because the editor is configured with an unrecognized KeybindingService");
    return Disposable.None;
  }
  return keybindingService.addDynamicKeybindings(rules.map((rule) => {
    return {
      keybinding: rule.keybinding,
      command: rule.command,
      commandArgs: rule.commandArgs,
      when: ContextKeyExpr.deserialize(rule.when)
    };
  }));
}
function createModel(value, language, uri) {
  const languageService = StandaloneServices.get(ILanguageService);
  const languageId = languageService.getLanguageIdByMimeType(language) || language;
  return createTextModel(
    StandaloneServices.get(IModelService),
    languageService,
    value,
    languageId,
    uri
  );
}
function setModelLanguage(model, mimeTypeOrLanguageId) {
  const languageService = StandaloneServices.get(ILanguageService);
  const languageId = languageService.getLanguageIdByMimeType(mimeTypeOrLanguageId) || mimeTypeOrLanguageId || PLAINTEXT_LANGUAGE_ID;
  model.setLanguage(languageService.createById(languageId));
}
function setModelMarkers(model, owner, markers) {
  if (model) {
    const markerService = StandaloneServices.get(IMarkerService);
    markerService.changeOne(owner, model.uri, markers);
  }
}
function removeAllMarkers(owner) {
  const markerService = StandaloneServices.get(IMarkerService);
  markerService.changeAll(owner, []);
}
function getModelMarkers(filter) {
  const markerService = StandaloneServices.get(IMarkerService);
  return markerService.read(filter);
}
function onDidChangeMarkers(listener) {
  const markerService = StandaloneServices.get(IMarkerService);
  return markerService.onMarkerChanged(listener);
}
function getModel(uri) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.getModel(uri);
}
function getModels() {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.getModels();
}
function onDidCreateModel(listener) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.onModelAdded(listener);
}
function onWillDisposeModel(listener) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.onModelRemoved(listener);
}
function onDidChangeModelLanguage(listener) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.onModelLanguageChanged((e) => {
    listener({
      model: e.model,
      oldLanguage: e.oldLanguageId
    });
  });
}
function createWebWorker(opts) {
  return actualCreateWebWorker(StandaloneServices.get(IModelService), StandaloneServices.get(IWebWorkerService), opts);
}
function colorizeElement(domNode, options) {
  const languageService = StandaloneServices.get(ILanguageService);
  const themeService = StandaloneServices.get(IStandaloneThemeService);
  return Colorizer.colorizeElement(themeService, languageService, domNode, options).then(() => {
    themeService.registerEditorContainer(domNode);
  });
}
function colorize(text, languageId, options) {
  const languageService = StandaloneServices.get(ILanguageService);
  const themeService = StandaloneServices.get(IStandaloneThemeService);
  themeService.registerEditorContainer(mainWindow.document.body);
  return Colorizer.colorize(languageService, text, languageId, options);
}
function colorizeModelLine(model, lineNumber, tabSize = 4) {
  const themeService = StandaloneServices.get(IStandaloneThemeService);
  themeService.registerEditorContainer(mainWindow.document.body);
  return Colorizer.colorizeModelLine(model, lineNumber, tabSize);
}
function getSafeTokenizationSupport(language) {
  const tokenizationSupport = languages.TokenizationRegistry.get(language);
  if (tokenizationSupport) {
    return tokenizationSupport;
  }
  return {
    getInitialState: () => NullState,
    tokenize: (line, hasEOL, state) => nullTokenize(language, state)
  };
}
function tokenize(text, languageId) {
  languages.TokenizationRegistry.getOrCreate(languageId);
  const tokenizationSupport = getSafeTokenizationSupport(languageId);
  const lines = splitLines(text);
  const result = [];
  let state = tokenizationSupport.getInitialState();
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = lines[i];
    const tokenizationResult = tokenizationSupport.tokenize(line, true, state);
    result[i] = tokenizationResult.tokens;
    state = tokenizationResult.endState;
  }
  return result;
}
function defineTheme(themeName, themeData) {
  const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
  standaloneThemeService.defineTheme(themeName, themeData);
}
function setTheme(themeName) {
  const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
  standaloneThemeService.setTheme(themeName);
}
function remeasureFonts() {
  FontMeasurements.clearAllFontInfos();
}
function registerCommand(id, handler) {
  return CommandsRegistry.registerCommand({ id, handler });
}
function registerLinkOpener(opener) {
  const openerService = StandaloneServices.get(IOpenerService);
  return openerService.registerOpener({
    async open(resource) {
      if (typeof resource === "string") {
        resource = URI.parse(resource);
      }
      return opener.open(resource);
    }
  });
}
function registerEditorOpener(opener) {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.registerCodeEditorOpenHandler(async (input, source, sideBySide) => {
    if (!source) {
      return null;
    }
    const selection = input.options?.selection;
    let selectionOrPosition;
    if (selection && typeof selection.endLineNumber === "number" && typeof selection.endColumn === "number") {
      selectionOrPosition = selection;
    } else if (selection) {
      selectionOrPosition = { lineNumber: selection.startLineNumber, column: selection.startColumn };
    }
    if (await opener.openCodeEditor(source, input.resource, selectionOrPosition)) {
      return source;
    }
    return null;
  });
}
function createMonacoEditorAPI() {
  return {
    // methods
    // eslint-disable-next-line local/code-no-any-casts
    create,
    // eslint-disable-next-line local/code-no-any-casts
    getEditors,
    // eslint-disable-next-line local/code-no-any-casts
    getDiffEditors,
    // eslint-disable-next-line local/code-no-any-casts
    onDidCreateEditor,
    // eslint-disable-next-line local/code-no-any-casts
    onDidCreateDiffEditor,
    // eslint-disable-next-line local/code-no-any-casts
    createDiffEditor,
    // eslint-disable-next-line local/code-no-any-casts
    addCommand,
    // eslint-disable-next-line local/code-no-any-casts
    addEditorAction,
    // eslint-disable-next-line local/code-no-any-casts
    addKeybindingRule,
    // eslint-disable-next-line local/code-no-any-casts
    addKeybindingRules,
    // eslint-disable-next-line local/code-no-any-casts
    createModel,
    // eslint-disable-next-line local/code-no-any-casts
    setModelLanguage,
    // eslint-disable-next-line local/code-no-any-casts
    setModelMarkers,
    // eslint-disable-next-line local/code-no-any-casts
    getModelMarkers,
    removeAllMarkers,
    // eslint-disable-next-line local/code-no-any-casts
    onDidChangeMarkers,
    // eslint-disable-next-line local/code-no-any-casts
    getModels,
    // eslint-disable-next-line local/code-no-any-casts
    getModel,
    // eslint-disable-next-line local/code-no-any-casts
    onDidCreateModel,
    // eslint-disable-next-line local/code-no-any-casts
    onWillDisposeModel,
    // eslint-disable-next-line local/code-no-any-casts
    onDidChangeModelLanguage,
    // eslint-disable-next-line local/code-no-any-casts
    createWebWorker,
    // eslint-disable-next-line local/code-no-any-casts
    colorizeElement,
    // eslint-disable-next-line local/code-no-any-casts
    colorize,
    // eslint-disable-next-line local/code-no-any-casts
    colorizeModelLine,
    // eslint-disable-next-line local/code-no-any-casts
    tokenize,
    // eslint-disable-next-line local/code-no-any-casts
    defineTheme,
    // eslint-disable-next-line local/code-no-any-casts
    setTheme,
    remeasureFonts,
    registerCommand,
    registerLinkOpener,
    // eslint-disable-next-line local/code-no-any-casts
    registerEditorOpener,
    // enums
    AccessibilitySupport: standaloneEnums.AccessibilitySupport,
    ContentWidgetPositionPreference: standaloneEnums.ContentWidgetPositionPreference,
    CursorChangeReason: standaloneEnums.CursorChangeReason,
    DefaultEndOfLine: standaloneEnums.DefaultEndOfLine,
    EditorAutoIndentStrategy: standaloneEnums.EditorAutoIndentStrategy,
    EditorOption: standaloneEnums.EditorOption,
    EndOfLinePreference: standaloneEnums.EndOfLinePreference,
    EndOfLineSequence: standaloneEnums.EndOfLineSequence,
    MinimapPosition: standaloneEnums.MinimapPosition,
    MinimapSectionHeaderStyle: standaloneEnums.MinimapSectionHeaderStyle,
    MouseTargetType: standaloneEnums.MouseTargetType,
    OverlayWidgetPositionPreference: standaloneEnums.OverlayWidgetPositionPreference,
    OverviewRulerLane: standaloneEnums.OverviewRulerLane,
    GlyphMarginLane: standaloneEnums.GlyphMarginLane,
    RenderLineNumbersType: standaloneEnums.RenderLineNumbersType,
    RenderMinimap: standaloneEnums.RenderMinimap,
    ScrollbarVisibility: standaloneEnums.ScrollbarVisibility,
    ScrollType: standaloneEnums.ScrollType,
    TextEditorCursorBlinkingStyle: standaloneEnums.TextEditorCursorBlinkingStyle,
    TextEditorCursorStyle: standaloneEnums.TextEditorCursorStyle,
    TrackedRangeStickiness: standaloneEnums.TrackedRangeStickiness,
    WrappingIndent: standaloneEnums.WrappingIndent,
    InjectedTextCursorStops: standaloneEnums.InjectedTextCursorStops,
    PositionAffinity: standaloneEnums.PositionAffinity,
    ShowLightbulbIconMode: standaloneEnums.ShowLightbulbIconMode,
    TextDirection: standaloneEnums.TextDirection,
    // classes
    // eslint-disable-next-line local/code-no-any-casts
    ConfigurationChangedEvent,
    // eslint-disable-next-line local/code-no-any-casts
    BareFontInfo,
    // eslint-disable-next-line local/code-no-any-casts
    FontInfo,
    // eslint-disable-next-line local/code-no-any-casts
    TextModelResolvedOptions,
    // eslint-disable-next-line local/code-no-any-casts
    FindMatch,
    // eslint-disable-next-line local/code-no-any-casts
    ApplyUpdateResult,
    // eslint-disable-next-line local/code-no-any-casts
    EditorZoom,
    // eslint-disable-next-line local/code-no-any-casts
    createMultiFileDiffEditor,
    // vars
    EditorType,
    // eslint-disable-next-line local/code-no-any-casts
    EditorOptions
  };
}
export {
  addCommand,
  addEditorAction,
  addKeybindingRule,
  addKeybindingRules,
  colorize,
  colorizeElement,
  colorizeModelLine,
  create,
  createDiffEditor,
  createModel,
  createMonacoEditorAPI,
  createMultiFileDiffEditor,
  createWebWorker,
  defineTheme,
  getDiffEditors,
  getEditors,
  getModel,
  getModelMarkers,
  getModels,
  onDidChangeMarkers,
  onDidChangeModelLanguage,
  onDidCreateDiffEditor,
  onDidCreateEditor,
  onDidCreateModel,
  onWillDisposeModel,
  registerCommand,
  registerEditorOpener,
  registerLinkOpener,
  remeasureFonts,
  removeAllMarkers,
  setModelLanguage,
  setModelMarkers,
  setTheme,
  tokenize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZUVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgc3BsaXRMaW5lcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAnLi9zdGFuZGFsb25lLXRva2Vucy5jc3MnO1xuaW1wb3J0IHsgRm9udE1lYXN1cmVtZW50cyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY29uZmlnL2ZvbnRNZWFzdXJlbWVudHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29tbWFuZCwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnRlcm5hbFdlYldvcmtlck9wdGlvbnMsIE1vbmFjb1dlYldvcmtlciwgY3JlYXRlV2ViV29ya2VyIGFzIGFjdHVhbENyZWF0ZVdlYldvcmtlciB9IGZyb20gJy4vc3RhbmRhbG9uZVdlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBBcHBseVVwZGF0ZVJlc3VsdCwgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3Jab29tIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3Jab29tLmpzJztcbmltcG9ydCB7IEJhcmVGb250SW5mbywgRm9udEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRvclR5cGUsIElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlLCBudWxsVG9rZW5pemUgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBGaW5kTWF0Y2gsIElUZXh0TW9kZWwsIFRleHRNb2RlbFJlc29sdmVkT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCAqIGFzIHN0YW5kYWxvbmVFbnVtcyBmcm9tICcuLi8uLi9jb21tb24vc3RhbmRhbG9uZS9zdGFuZGFsb25lRW51bXMuanMnO1xuaW1wb3J0IHsgQ29sb3JpemVyLCBJQ29sb3JpemVyRWxlbWVudE9wdGlvbnMsIElDb2xvcml6ZXJPcHRpb25zIH0gZnJvbSAnLi9jb2xvcml6ZXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvbkRlc2NyaXB0b3IsIElTdGFuZGFsb25lQ29kZUVkaXRvciwgSVN0YW5kYWxvbmVEaWZmRWRpdG9yLCBJU3RhbmRhbG9uZURpZmZFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zLCBJU3RhbmRhbG9uZUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMsIFN0YW5kYWxvbmVEaWZmRWRpdG9yMiwgU3RhbmRhbG9uZUVkaXRvciwgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi9zdGFuZGFsb25lQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3ZlcnJpZGVTZXJ2aWNlcywgU3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlLCBTdGFuZGFsb25lU2VydmljZXMgfSBmcm9tICcuL3N0YW5kYWxvbmVTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdGFuZGFsb25lVGhlbWVEYXRhLCBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zdGFuZGFsb25lVGhlbWUuanMnO1xuaW1wb3J0IHsgSU1lbnVJdGVtLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElNYXJrZXIsIElNYXJrZXJEYXRhLCBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElXZWJXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2ViV29ya2VyL2Jyb3dzZXIvd2ViV29ya2VyU2VydmljZS5qcyc7XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IGVkaXRvciB1bmRlciBgZG9tRWxlbWVudGAuXG4gKiBgZG9tRWxlbWVudGAgc2hvdWxkIGJlIGVtcHR5IChub3QgY29udGFpbiBvdGhlciBkb20gbm9kZXMpLlxuICogVGhlIGVkaXRvciB3aWxsIHJlYWQgdGhlIHNpemUgb2YgYGRvbUVsZW1lbnRgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlKGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zPzogSVN0YW5kYWxvbmVFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zLCBvdmVycmlkZT86IElFZGl0b3JPdmVycmlkZVNlcnZpY2VzKTogSVN0YW5kYWxvbmVDb2RlRWRpdG9yIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuaW5pdGlhbGl6ZShvdmVycmlkZSB8fCB7fSk7XG5cdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdGFuZGFsb25lRWRpdG9yLCBkb21FbGVtZW50LCBvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYW4gZWRpdG9yIGlzIGNyZWF0ZWQuXG4gKiBDcmVhdGluZyBhIGRpZmYgZWRpdG9yIG1pZ2h0IGNhdXNlIHRoaXMgbGlzdGVuZXIgdG8gYmUgaW52b2tlZCB3aXRoIHRoZSB0d28gZWRpdG9ycy5cbiAqIEBldmVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gb25EaWRDcmVhdGVFZGl0b3IobGlzdGVuZXI6IChjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcikgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdHJldHVybiBjb2RlRWRpdG9yU2VydmljZS5vbkNvZGVFZGl0b3JBZGQoKGVkaXRvcikgPT4ge1xuXHRcdGxpc3RlbmVyKGVkaXRvcik7XG5cdH0pO1xufVxuXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhbiBkaWZmIGVkaXRvciBpcyBjcmVhdGVkLlxuICogQGV2ZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkRpZENyZWF0ZURpZmZFZGl0b3IobGlzdGVuZXI6IChkaWZmRWRpdG9yOiBJRGlmZkVkaXRvcikgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdHJldHVybiBjb2RlRWRpdG9yU2VydmljZS5vbkRpZmZFZGl0b3JBZGQoKGVkaXRvcikgPT4ge1xuXHRcdGxpc3RlbmVyKDxJRGlmZkVkaXRvcj5lZGl0b3IpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBHZXQgYWxsIHRoZSBjcmVhdGVkIGVkaXRvcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZGl0b3JzKCk6IHJlYWRvbmx5IElDb2RlRWRpdG9yW10ge1xuXHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0cmV0dXJuIGNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpO1xufVxuXG4vKipcbiAqIEdldCBhbGwgdGhlIGNyZWF0ZWQgZGlmZiBlZGl0b3JzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGlmZkVkaXRvcnMoKTogcmVhZG9ubHkgSURpZmZFZGl0b3JbXSB7XG5cdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRyZXR1cm4gY29kZUVkaXRvclNlcnZpY2UubGlzdERpZmZFZGl0b3JzKCk7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IGRpZmYgZWRpdG9yIHVuZGVyIGBkb21FbGVtZW50YC5cbiAqIGBkb21FbGVtZW50YCBzaG91bGQgYmUgZW1wdHkgKG5vdCBjb250YWluIG90aGVyIGRvbSBub2RlcykuXG4gKiBUaGUgZWRpdG9yIHdpbGwgcmVhZCB0aGUgc2l6ZSBvZiBgZG9tRWxlbWVudGAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaWZmRWRpdG9yKGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zPzogSVN0YW5kYWxvbmVEaWZmRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucywgb3ZlcnJpZGU/OiBJRWRpdG9yT3ZlcnJpZGVTZXJ2aWNlcyk6IElTdGFuZGFsb25lRGlmZkVkaXRvciB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmluaXRpYWxpemUob3ZlcnJpZGUgfHwge30pO1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhbmRhbG9uZURpZmZFZGl0b3IyLCBkb21FbGVtZW50LCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU11bHRpRmlsZURpZmZFZGl0b3IoZG9tRWxlbWVudDogSFRNTEVsZW1lbnQsIG92ZXJyaWRlPzogSUVkaXRvck92ZXJyaWRlU2VydmljZXMpIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuaW5pdGlhbGl6ZShvdmVycmlkZSB8fCB7fSk7XG5cdHJldHVybiBuZXcgTXVsdGlEaWZmRWRpdG9yV2lkZ2V0KGRvbUVsZW1lbnQsIHt9LCB1bmRlZmluZWQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcbn1cblxuLyoqXG4gKiBEZXNjcmlwdGlvbiBvZiBhIGNvbW1hbmQgY29udHJpYnV0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmREZXNjcmlwdG9yIHtcblx0LyoqXG5cdCAqIEFuIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBjb250cmlidXRlZCBjb21tYW5kLlxuXHQgKi9cblx0aWQ6IHN0cmluZztcblx0LyoqXG5cdCAqIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBleGVjdXRlZCB3aGVuIHRoZSBjb21tYW5kIGlzIHRyaWdnZXJlZC5cblx0ICovXG5cdHJ1bjogSUNvbW1hbmRIYW5kbGVyO1xufVxuXG4vKipcbiAqIEFkZCBhIGNvbW1hbmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb21tYW5kKGRlc2NyaXB0b3I6IElDb21tYW5kRGVzY3JpcHRvcik6IElEaXNwb3NhYmxlIHtcblx0aWYgKCh0eXBlb2YgZGVzY3JpcHRvci5pZCAhPT0gJ3N0cmluZycpIHx8ICh0eXBlb2YgZGVzY3JpcHRvci5ydW4gIT09ICdmdW5jdGlvbicpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbW1hbmQgZGVzY3JpcHRvciwgYGlkYCBhbmQgYHJ1bmAgYXJlIHJlcXVpcmVkIHByb3BlcnRpZXMhJyk7XG5cdH1cblx0cmV0dXJuIENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGRlc2NyaXB0b3IuaWQsIGRlc2NyaXB0b3IucnVuKTtcbn1cblxuLyoqXG4gKiBBZGQgYW4gYWN0aW9uIHRvIGFsbCBlZGl0b3JzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWRkRWRpdG9yQWN0aW9uKGRlc2NyaXB0b3I6IElBY3Rpb25EZXNjcmlwdG9yKTogSURpc3Bvc2FibGUge1xuXHRpZiAoKHR5cGVvZiBkZXNjcmlwdG9yLmlkICE9PSAnc3RyaW5nJykgfHwgKHR5cGVvZiBkZXNjcmlwdG9yLmxhYmVsICE9PSAnc3RyaW5nJykgfHwgKHR5cGVvZiBkZXNjcmlwdG9yLnJ1biAhPT0gJ2Z1bmN0aW9uJykpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYWN0aW9uIGRlc2NyaXB0b3IsIGBpZGAsIGBsYWJlbGAgYW5kIGBydW5gIGFyZSByZXF1aXJlZCBwcm9wZXJ0aWVzIScpO1xuXHR9XG5cblx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZGVzY3JpcHRvci5wcmVjb25kaXRpb24pO1xuXHRjb25zdCBydW4gPSAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRyZXR1cm4gRWRpdG9yQ29tbWFuZC5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBhcmdzLCBwcmVjb25kaXRpb24sIChhY2Nlc3NvciwgZWRpdG9yLCBhcmdzKSA9PiBQcm9taXNlLnJlc29sdmUoZGVzY3JpcHRvci5ydW4oZWRpdG9yLCAuLi5hcmdzKSkpO1xuXHR9O1xuXG5cdGNvbnN0IHRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHQvLyBSZWdpc3RlciB0aGUgY29tbWFuZFxuXHR0b0Rpc3Bvc2UuYWRkKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGRlc2NyaXB0b3IuaWQsIHJ1bikpO1xuXG5cdC8vIFJlZ2lzdGVyIHRoZSBjb250ZXh0IG1lbnUgaXRlbVxuXHRpZiAoZGVzY3JpcHRvci5jb250ZXh0TWVudUdyb3VwSWQpIHtcblx0XHRjb25zdCBtZW51SXRlbTogSU1lbnVJdGVtID0ge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogZGVzY3JpcHRvci5pZCxcblx0XHRcdFx0dGl0bGU6IGRlc2NyaXB0b3IubGFiZWxcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBwcmVjb25kaXRpb24sXG5cdFx0XHRncm91cDogZGVzY3JpcHRvci5jb250ZXh0TWVudUdyb3VwSWQsXG5cdFx0XHRvcmRlcjogZGVzY3JpcHRvci5jb250ZXh0TWVudU9yZGVyIHx8IDBcblx0XHR9O1xuXHRcdHRvRGlzcG9zZS5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCBtZW51SXRlbSkpO1xuXHR9XG5cblx0Ly8gUmVnaXN0ZXIgdGhlIGtleWJpbmRpbmdzXG5cdGlmIChBcnJheS5pc0FycmF5KGRlc2NyaXB0b3Iua2V5YmluZGluZ3MpKSB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0aWYgKCEoa2V5YmluZGluZ1NlcnZpY2UgaW5zdGFuY2VvZiBTdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UpKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ0Nhbm5vdCBhZGQga2V5YmluZGluZyBiZWNhdXNlIHRoZSBlZGl0b3IgaXMgY29uZmlndXJlZCB3aXRoIGFuIHVucmVjb2duaXplZCBLZXliaW5kaW5nU2VydmljZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nc1doZW4gPSBDb250ZXh0S2V5RXhwci5hbmQocHJlY29uZGl0aW9uLCBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShkZXNjcmlwdG9yLmtleWJpbmRpbmdDb250ZXh0KSk7XG5cdFx0XHR0b0Rpc3Bvc2UuYWRkKGtleWJpbmRpbmdTZXJ2aWNlLmFkZER5bmFtaWNLZXliaW5kaW5ncyhkZXNjcmlwdG9yLmtleWJpbmRpbmdzLm1hcCgoa2V5YmluZGluZykgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtleWJpbmRpbmcsXG5cdFx0XHRcdFx0Y29tbWFuZDogZGVzY3JpcHRvci5pZCxcblx0XHRcdFx0XHR3aGVuOiBrZXliaW5kaW5nc1doZW5cblx0XHRcdFx0fTtcblx0XHRcdH0pKSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRvRGlzcG9zZTtcbn1cblxuLyoqXG4gKiBBIGtleWJpbmRpbmcgcnVsZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJS2V5YmluZGluZ1J1bGUge1xuXHRrZXliaW5kaW5nOiBudW1iZXI7XG5cdGNvbW1hbmQ/OiBzdHJpbmcgfCBudWxsO1xuXHRjb21tYW5kQXJncz86IGFueTtcblx0d2hlbj86IHN0cmluZyB8IG51bGw7XG59XG5cbi8qKlxuICogQWRkIGEga2V5YmluZGluZyBydWxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWRkS2V5YmluZGluZ1J1bGUocnVsZTogSUtleWJpbmRpbmdSdWxlKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gYWRkS2V5YmluZGluZ1J1bGVzKFtydWxlXSk7XG59XG5cbi8qKlxuICogQWRkIGtleWJpbmRpbmcgcnVsZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGRLZXliaW5kaW5nUnVsZXMocnVsZXM6IElLZXliaW5kaW5nUnVsZVtdKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblx0aWYgKCEoa2V5YmluZGluZ1NlcnZpY2UgaW5zdGFuY2VvZiBTdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UpKSB7XG5cdFx0Y29uc29sZS53YXJuKCdDYW5ub3QgYWRkIGtleWJpbmRpbmcgYmVjYXVzZSB0aGUgZWRpdG9yIGlzIGNvbmZpZ3VyZWQgd2l0aCBhbiB1bnJlY29nbml6ZWQgS2V5YmluZGluZ1NlcnZpY2UnKTtcblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0cmV0dXJuIGtleWJpbmRpbmdTZXJ2aWNlLmFkZER5bmFtaWNLZXliaW5kaW5ncyhydWxlcy5tYXAoKHJ1bGUpID0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2V5YmluZGluZzogcnVsZS5rZXliaW5kaW5nLFxuXHRcdFx0Y29tbWFuZDogcnVsZS5jb21tYW5kLFxuXHRcdFx0Y29tbWFuZEFyZ3M6IHJ1bGUuY29tbWFuZEFyZ3MsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShydWxlLndoZW4pLFxuXHRcdH07XG5cdH0pKTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgZWRpdG9yIG1vZGVsLlxuICogWW91IGNhbiBzcGVjaWZ5IHRoZSBsYW5ndWFnZSB0aGF0IHNob3VsZCBiZSBzZXQgZm9yIHRoaXMgbW9kZWwgb3IgbGV0IHRoZSBsYW5ndWFnZSBiZSBpbmZlcnJlZCBmcm9tIHRoZSBgdXJpYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1vZGVsKHZhbHVlOiBzdHJpbmcsIGxhbmd1YWdlPzogc3RyaW5nLCB1cmk/OiBVUkkpOiBJVGV4dE1vZGVsIHtcblx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlNaW1lVHlwZShsYW5ndWFnZSkgfHwgbGFuZ3VhZ2U7XG5cdHJldHVybiBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0U3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTW9kZWxTZXJ2aWNlKSxcblx0XHRsYW5ndWFnZVNlcnZpY2UsXG5cdFx0dmFsdWUsXG5cdFx0bGFuZ3VhZ2VJZCxcblx0XHR1cmlcblx0KTtcbn1cblxuLyoqXG4gKiBDaGFuZ2UgdGhlIGxhbmd1YWdlIGZvciBhIG1vZGVsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0TW9kZWxMYW5ndWFnZShtb2RlbDogSVRleHRNb2RlbCwgbWltZVR5cGVPckxhbmd1YWdlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZUlkID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeU1pbWVUeXBlKG1pbWVUeXBlT3JMYW5ndWFnZUlkKSB8fCBtaW1lVHlwZU9yTGFuZ3VhZ2VJZCB8fCBQTEFJTlRFWFRfTEFOR1VBR0VfSUQ7XG5cdG1vZGVsLnNldExhbmd1YWdlKGxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKGxhbmd1YWdlSWQpKTtcbn1cblxuLyoqXG4gKiBTZXQgdGhlIG1hcmtlcnMgZm9yIGEgbW9kZWwuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRNb2RlbE1hcmtlcnMobW9kZWw6IElUZXh0TW9kZWwsIG93bmVyOiBzdHJpbmcsIG1hcmtlcnM6IElNYXJrZXJEYXRhW10pOiB2b2lkIHtcblx0aWYgKG1vZGVsKSB7XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1hcmtlclNlcnZpY2UpO1xuXHRcdG1hcmtlclNlcnZpY2UuY2hhbmdlT25lKG93bmVyLCBtb2RlbC51cmksIG1hcmtlcnMpO1xuXHR9XG59XG5cbi8qKlxuICogUmVtb3ZlIGFsbCBtYXJrZXJzIG9mIGFuIG93bmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlQWxsTWFya2Vycyhvd25lcjogc3RyaW5nKSB7XG5cdGNvbnN0IG1hcmtlclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNYXJrZXJTZXJ2aWNlKTtcblx0bWFya2VyU2VydmljZS5jaGFuZ2VBbGwob3duZXIsIFtdKTtcbn1cblxuLyoqXG4gKiBHZXQgbWFya2VycyBmb3Igb3duZXIgYW5kL29yIHJlc291cmNlXG4gKlxuICogQHJldHVybnMgbGlzdCBvZiBtYXJrZXJzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RlbE1hcmtlcnMoZmlsdGVyOiB7IG93bmVyPzogc3RyaW5nOyByZXNvdXJjZT86IFVSSTsgdGFrZT86IG51bWJlciB9KTogSU1hcmtlcltdIHtcblx0Y29uc3QgbWFya2VyU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1hcmtlclNlcnZpY2UpO1xuXHRyZXR1cm4gbWFya2VyU2VydmljZS5yZWFkKGZpbHRlcik7XG59XG5cbi8qKlxuICogRW1pdHRlZCB3aGVuIG1hcmtlcnMgY2hhbmdlIGZvciBhIG1vZGVsLlxuICogQGV2ZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkRpZENoYW5nZU1hcmtlcnMobGlzdGVuZXI6IChlOiByZWFkb25seSBVUklbXSkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbWFya2VyU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1hcmtlclNlcnZpY2UpO1xuXHRyZXR1cm4gbWFya2VyU2VydmljZS5vbk1hcmtlckNoYW5nZWQobGlzdGVuZXIpO1xufVxuXG4vKipcbiAqIEdldCB0aGUgbW9kZWwgdGhhdCBoYXMgYHVyaWAgaWYgaXQgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TW9kZWwodXJpOiBVUkkpOiBJVGV4dE1vZGVsIHwgbnVsbCB7XG5cdGNvbnN0IG1vZGVsU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1vZGVsU2VydmljZSk7XG5cdHJldHVybiBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwodXJpKTtcbn1cblxuLyoqXG4gKiBHZXQgYWxsIHRoZSBjcmVhdGVkIG1vZGVscy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZGVscygpOiBJVGV4dE1vZGVsW10ge1xuXHRjb25zdCBtb2RlbFNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRyZXR1cm4gbW9kZWxTZXJ2aWNlLmdldE1vZGVscygpO1xufVxuXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhIG1vZGVsIGlzIGNyZWF0ZWQuXG4gKiBAZXZlbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uRGlkQ3JlYXRlTW9kZWwobGlzdGVuZXI6IChtb2RlbDogSVRleHRNb2RlbCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0cmV0dXJuIG1vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQobGlzdGVuZXIpO1xufVxuXG4vKipcbiAqIEVtaXR0ZWQgcmlnaHQgYmVmb3JlIGEgbW9kZWwgaXMgZGlzcG9zZWQuXG4gKiBAZXZlbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uV2lsbERpc3Bvc2VNb2RlbChsaXN0ZW5lcjogKG1vZGVsOiBJVGV4dE1vZGVsKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBtb2RlbFNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRyZXR1cm4gbW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKGxpc3RlbmVyKTtcbn1cblxuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBkaWZmZXJlbnQgbGFuZ3VhZ2UgaXMgc2V0IHRvIGEgbW9kZWwuXG4gKiBAZXZlbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZShsaXN0ZW5lcjogKGU6IHsgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWw7IHJlYWRvbmx5IG9sZExhbmd1YWdlOiBzdHJpbmcgfSkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0cmV0dXJuIG1vZGVsU2VydmljZS5vbk1vZGVsTGFuZ3VhZ2VDaGFuZ2VkKChlKSA9PiB7XG5cdFx0bGlzdGVuZXIoe1xuXHRcdFx0bW9kZWw6IGUubW9kZWwsXG5cdFx0XHRvbGRMYW5ndWFnZTogZS5vbGRMYW5ndWFnZUlkXG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyB3ZWIgd29ya2VyIHRoYXQgaGFzIG1vZGVsIHN5bmNpbmcgY2FwYWJpbGl0aWVzIGJ1aWx0IGluLlxuICogU3BlY2lmeSBhbiBBTUQgbW9kdWxlIHRvIGxvYWQgdGhhdCB3aWxsIGBjcmVhdGVgIGFuIG9iamVjdCB0aGF0IHdpbGwgYmUgcHJveGllZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdlYldvcmtlcjxUIGV4dGVuZHMgb2JqZWN0PihvcHRzOiBJSW50ZXJuYWxXZWJXb3JrZXJPcHRpb25zKTogTW9uYWNvV2ViV29ya2VyPFQ+IHtcblx0cmV0dXJuIGFjdHVhbENyZWF0ZVdlYldvcmtlcjxUPihTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNb2RlbFNlcnZpY2UpLCBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElXZWJXb3JrZXJTZXJ2aWNlKSwgb3B0cyk7XG59XG5cbi8qKlxuICogQ29sb3JpemUgdGhlIGNvbnRlbnRzIG9mIGBkb21Ob2RlYCB1c2luZyBhdHRyaWJ1dGUgYGRhdGEtbGFuZ2AuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb2xvcml6ZUVsZW1lbnQoZG9tTm9kZTogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IElDb2xvcml6ZXJFbGVtZW50T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRjb25zdCB0aGVtZVNlcnZpY2UgPSA8U3RhbmRhbG9uZVRoZW1lU2VydmljZT5TdGFuZGFsb25lU2VydmljZXMuZ2V0KElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlKTtcblx0cmV0dXJuIENvbG9yaXplci5jb2xvcml6ZUVsZW1lbnQodGhlbWVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGRvbU5vZGUsIG9wdGlvbnMpLnRoZW4oKCkgPT4ge1xuXHRcdHRoZW1lU2VydmljZS5yZWdpc3RlckVkaXRvckNvbnRhaW5lcihkb21Ob2RlKTtcblx0fSk7XG59XG5cbi8qKlxuICogQ29sb3JpemUgYHRleHRgIHVzaW5nIGxhbmd1YWdlIGBsYW5ndWFnZUlkYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbG9yaXplKHRleHQ6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nLCBvcHRpb25zOiBJQ29sb3JpemVyT3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGNvbnN0IHRoZW1lU2VydmljZSA9IDxTdGFuZGFsb25lVGhlbWVTZXJ2aWNlPlN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpO1xuXHR0aGVtZVNlcnZpY2UucmVnaXN0ZXJFZGl0b3JDb250YWluZXIobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5KTtcblx0cmV0dXJuIENvbG9yaXplci5jb2xvcml6ZShsYW5ndWFnZVNlcnZpY2UsIHRleHQsIGxhbmd1YWdlSWQsIG9wdGlvbnMpO1xufVxuXG4vKipcbiAqIENvbG9yaXplIGEgbGluZSBpbiBhIG1vZGVsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29sb3JpemVNb2RlbExpbmUobW9kZWw6IElUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyID0gNCk6IHN0cmluZyB7XG5cdGNvbnN0IHRoZW1lU2VydmljZSA9IDxTdGFuZGFsb25lVGhlbWVTZXJ2aWNlPlN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpO1xuXHR0aGVtZVNlcnZpY2UucmVnaXN0ZXJFZGl0b3JDb250YWluZXIobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5KTtcblx0cmV0dXJuIENvbG9yaXplci5jb2xvcml6ZU1vZGVsTGluZShtb2RlbCwgbGluZU51bWJlciwgdGFiU2l6ZSk7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmZ1bmN0aW9uIGdldFNhZmVUb2tlbml6YXRpb25TdXBwb3J0KGxhbmd1YWdlOiBzdHJpbmcpOiBPbWl0PGxhbmd1YWdlcy5JVG9rZW5pemF0aW9uU3VwcG9ydCwgJ3Rva2VuaXplRW5jb2RlZCc+IHtcblx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydCA9IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5nZXQobGFuZ3VhZ2UpO1xuXHRpZiAodG9rZW5pemF0aW9uU3VwcG9ydCkge1xuXHRcdHJldHVybiB0b2tlbml6YXRpb25TdXBwb3J0O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKSA9PiBOdWxsU3RhdGUsXG5cdFx0dG9rZW5pemU6IChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpID0+IG51bGxUb2tlbml6ZShsYW5ndWFnZSwgc3RhdGUpXG5cdH07XG59XG5cbi8qKlxuICogVG9rZW5pemUgYHRleHRgIHVzaW5nIGxhbmd1YWdlIGBsYW5ndWFnZUlkYFxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9rZW5pemUodGV4dDogc3RyaW5nLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBsYW5ndWFnZXMuVG9rZW5bXVtdIHtcblx0Ly8gTmVlZGVkIGluIG9yZGVyIHRvIGdldCB0aGUgbW9kZSByZWdpc3RlcmVkIGZvciBzdWJzZXF1ZW50IGxvb2stdXBzXG5cdGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5nZXRPckNyZWF0ZShsYW5ndWFnZUlkKTtcblxuXHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0ID0gZ2V0U2FmZVRva2VuaXphdGlvblN1cHBvcnQobGFuZ3VhZ2VJZCk7XG5cdGNvbnN0IGxpbmVzID0gc3BsaXRMaW5lcyh0ZXh0KTtcblx0Y29uc3QgcmVzdWx0OiBsYW5ndWFnZXMuVG9rZW5bXVtdID0gW107XG5cdGxldCBzdGF0ZSA9IHRva2VuaXphdGlvblN1cHBvcnQuZ2V0SW5pdGlhbFN0YXRlKCk7XG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcblx0XHRjb25zdCB0b2tlbml6YXRpb25SZXN1bHQgPSB0b2tlbml6YXRpb25TdXBwb3J0LnRva2VuaXplKGxpbmUsIHRydWUsIHN0YXRlKTtcblxuXHRcdHJlc3VsdFtpXSA9IHRva2VuaXphdGlvblJlc3VsdC50b2tlbnM7XG5cdFx0c3RhdGUgPSB0b2tlbml6YXRpb25SZXN1bHQuZW5kU3RhdGU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBEZWZpbmUgYSBuZXcgdGhlbWUgb3IgdXBkYXRlIGFuIGV4aXN0aW5nIHRoZW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVGhlbWUodGhlbWVOYW1lOiBzdHJpbmcsIHRoZW1lRGF0YTogSVN0YW5kYWxvbmVUaGVtZURhdGEpOiB2b2lkIHtcblx0Y29uc3Qgc3RhbmRhbG9uZVRoZW1lU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpO1xuXHRzdGFuZGFsb25lVGhlbWVTZXJ2aWNlLmRlZmluZVRoZW1lKHRoZW1lTmFtZSwgdGhlbWVEYXRhKTtcbn1cblxuLyoqXG4gKiBTd2l0Y2hlcyB0byBhIHRoZW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0VGhlbWUodGhlbWVOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3Qgc3RhbmRhbG9uZVRoZW1lU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpO1xuXHRzdGFuZGFsb25lVGhlbWVTZXJ2aWNlLnNldFRoZW1lKHRoZW1lTmFtZSk7XG59XG5cbi8qKlxuICogQ2xlYXJzIGFsbCBjYWNoZWQgZm9udCBtZWFzdXJlbWVudHMgYW5kIHRyaWdnZXJzIHJlLW1lYXN1cmVtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtZWFzdXJlRm9udHMoKTogdm9pZCB7XG5cdEZvbnRNZWFzdXJlbWVudHMuY2xlYXJBbGxGb250SW5mb3MoKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGNvbW1hbmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZywgaGFuZGxlcjogKGFjY2Vzc29yOiBhbnksIC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoeyBpZCwgaGFuZGxlciB9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGlua09wZW5lciB7XG5cdG9wZW4ocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGhhbmRsZXIgdGhhdCBpcyBjYWxsZWQgd2hlbiBhIGxpbmsgaXMgb3BlbmVkIGluIGFueSBlZGl0b3IuIFRoZSBoYW5kbGVyIGNhbGxiYWNrIHNob3VsZCByZXR1cm4gYHRydWVgIGlmIHRoZSBsaW5rIHdhcyBoYW5kbGVkIGFuZCBgZmFsc2VgIG90aGVyd2lzZS5cbiAqIFRoZSBoYW5kbGVyIHRoYXQgd2FzIHJlZ2lzdGVyZWQgbGFzdCB3aWxsIGJlIGNhbGxlZCBmaXJzdCB3aGVuIGEgbGluayBpcyBvcGVuZWQuXG4gKlxuICogUmV0dXJucyBhIGRpc3Bvc2FibGUgdGhhdCBjYW4gdW5yZWdpc3RlciB0aGUgb3BlbmVyIGFnYWluLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJMaW5rT3BlbmVyKG9wZW5lcjogSUxpbmtPcGVuZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0cmV0dXJuIG9wZW5lclNlcnZpY2UucmVnaXN0ZXJPcGVuZXIoe1xuXHRcdGFzeW5jIG9wZW4ocmVzb3VyY2U6IHN0cmluZyB8IFVSSSkge1xuXHRcdFx0aWYgKHR5cGVvZiByZXNvdXJjZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmVzb3VyY2UgPSBVUkkucGFyc2UocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG9wZW5lci5vcGVuKHJlc291cmNlKTtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gb2JqZWN0IHRoYXQgY2FuIGhhbmRsZSBlZGl0b3Igb3BlbiBvcGVyYXRpb25zIChlLmcuIHdoZW4gXCJnbyB0byBkZWZpbml0aW9uXCIgaXMgY2FsbGVkXG4gKiB3aXRoIGEgcmVzb3VyY2Ugb3RoZXIgdGhhbiB0aGUgY3VycmVudCBtb2RlbCkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGVFZGl0b3JPcGVuZXIge1xuXHQvKipcblx0ICogQ2FsbGJhY2sgdGhhdCBpcyBpbnZva2VkIHdoZW4gYSByZXNvdXJjZSBvdGhlciB0aGFuIHRoZSBjdXJyZW50IG1vZGVsIHNob3VsZCBiZSBvcGVuZWQgKGUuZy4gd2hlbiBcImdvIHRvIGRlZmluaXRpb25cIiBpcyBjYWxsZWQpLlxuXHQgKiBUaGUgY2FsbGJhY2sgc2hvdWxkIHJldHVybiBgdHJ1ZWAgaWYgdGhlIHJlcXVlc3Qgd2FzIGhhbmRsZWQgYW5kIGBmYWxzZWAgb3RoZXJ3aXNlLlxuXHQgKiBAcGFyYW0gc291cmNlIFRoZSBjb2RlIGVkaXRvciBpbnN0YW5jZSB0aGF0IGluaXRpYXRlZCB0aGUgcmVxdWVzdC5cblx0ICogQHBhcmFtIHJlc291cmNlIFRoZSBVUkkgb2YgdGhlIHJlc291cmNlIHRoYXQgc2hvdWxkIGJlIG9wZW5lZC5cblx0ICogQHBhcmFtIHNlbGVjdGlvbk9yUG9zaXRpb24gQW4gb3B0aW9uYWwgcG9zaXRpb24gb3Igc2VsZWN0aW9uIGluc2lkZSB0aGUgbW9kZWwgY29ycmVzcG9uZGluZyB0byBgcmVzb3VyY2VgIHRoYXQgY2FuIGJlIHVzZWQgdG8gc2V0IHRoZSBjdXJzb3IuXG5cdCAqL1xuXHRvcGVuQ29kZUVkaXRvcihzb3VyY2U6IElDb2RlRWRpdG9yLCByZXNvdXJjZTogVVJJLCBzZWxlY3Rpb25PclBvc2l0aW9uPzogSVJhbmdlIHwgSVBvc2l0aW9uKTogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgaGFuZGxlciB0aGF0IGlzIGNhbGxlZCB3aGVuIGEgcmVzb3VyY2Ugb3RoZXIgdGhhbiB0aGUgY3VycmVudCBtb2RlbCBzaG91bGQgYmUgb3BlbmVkIGluIHRoZSBlZGl0b3IgKGUuZy4gXCJnbyB0byBkZWZpbml0aW9uXCIpLlxuICogVGhlIGhhbmRsZXIgY2FsbGJhY2sgc2hvdWxkIHJldHVybiBgdHJ1ZWAgaWYgdGhlIHJlcXVlc3Qgd2FzIGhhbmRsZWQgYW5kIGBmYWxzZWAgb3RoZXJ3aXNlLlxuICpcbiAqIFJldHVybnMgYSBkaXNwb3NhYmxlIHRoYXQgY2FuIHVucmVnaXN0ZXIgdGhlIG9wZW5lciBhZ2Fpbi5cbiAqXG4gKiBJZiBubyBoYW5kbGVyIGlzIHJlZ2lzdGVyZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3IgaXMgdG8gZG8gbm90aGluZyBmb3IgbW9kZWxzIG90aGVyIHRoYW4gdGhlIGN1cnJlbnRseSBhdHRhY2hlZCBvbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckVkaXRvck9wZW5lcihvcGVuZXI6IElDb2RlRWRpdG9yT3BlbmVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0cmV0dXJuIGNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyQ29kZUVkaXRvck9wZW5IYW5kbGVyKGFzeW5jIChpbnB1dDogSVRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBzb3VyY2U6IElDb2RlRWRpdG9yIHwgbnVsbCwgc2lkZUJ5U2lkZT86IGJvb2xlYW4pID0+IHtcblx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGlucHV0Lm9wdGlvbnM/LnNlbGVjdGlvbjtcblx0XHRsZXQgc2VsZWN0aW9uT3JQb3NpdGlvbjogSVJhbmdlIHwgSVBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChzZWxlY3Rpb24gJiYgdHlwZW9mIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc2VsZWN0aW9uLmVuZENvbHVtbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdHNlbGVjdGlvbk9yUG9zaXRpb24gPSA8SVJhbmdlPnNlbGVjdGlvbjtcblx0XHR9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuXHRcdFx0c2VsZWN0aW9uT3JQb3NpdGlvbiA9IHsgbGluZU51bWJlcjogc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgY29sdW1uOiBzZWxlY3Rpb24uc3RhcnRDb2x1bW4gfTtcblx0XHR9XG5cdFx0aWYgKGF3YWl0IG9wZW5lci5vcGVuQ29kZUVkaXRvcihzb3VyY2UsIGlucHV0LnJlc291cmNlLCBzZWxlY3Rpb25PclBvc2l0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHNvdXJjZTsgLy8gcmV0dXJuIHNvdXJjZSBlZGl0b3IgdG8gaW5kaWNhdGUgdGhhdCB0aGlzIGhhbmRsZXIgaGFzIHN1Y2Nlc3NmdWxseSBoYW5kbGVkIHRoZSBvcGVuaW5nXG5cdFx0fVxuXHRcdHJldHVybiBudWxsOyAvLyBmYWxsYmFjayB0byBvdGhlciByZWdpc3RlcmVkIGhhbmRsZXJzXG5cdH0pO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9uYWNvRWRpdG9yQVBJKCk6IHR5cGVvZiBtb25hY28uZWRpdG9yIHtcblx0cmV0dXJuIHtcblx0XHQvLyBtZXRob2RzXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y3JlYXRlOiA8YW55PmNyZWF0ZSxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRnZXRFZGl0b3JzOiA8YW55PmdldEVkaXRvcnMsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Z2V0RGlmZkVkaXRvcnM6IDxhbnk+Z2V0RGlmZkVkaXRvcnMsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0b25EaWRDcmVhdGVFZGl0b3I6IDxhbnk+b25EaWRDcmVhdGVFZGl0b3IsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0b25EaWRDcmVhdGVEaWZmRWRpdG9yOiA8YW55Pm9uRGlkQ3JlYXRlRGlmZkVkaXRvcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjcmVhdGVEaWZmRWRpdG9yOiA8YW55PmNyZWF0ZURpZmZFZGl0b3IsXG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhZGRDb21tYW5kOiA8YW55PmFkZENvbW1hbmQsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YWRkRWRpdG9yQWN0aW9uOiA8YW55PmFkZEVkaXRvckFjdGlvbixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhZGRLZXliaW5kaW5nUnVsZTogPGFueT5hZGRLZXliaW5kaW5nUnVsZSxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhZGRLZXliaW5kaW5nUnVsZXM6IDxhbnk+YWRkS2V5YmluZGluZ1J1bGVzLFxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y3JlYXRlTW9kZWw6IDxhbnk+Y3JlYXRlTW9kZWwsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0c2V0TW9kZWxMYW5ndWFnZTogPGFueT5zZXRNb2RlbExhbmd1YWdlLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHNldE1vZGVsTWFya2VyczogPGFueT5zZXRNb2RlbE1hcmtlcnMsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Z2V0TW9kZWxNYXJrZXJzOiA8YW55PmdldE1vZGVsTWFya2Vycyxcblx0XHRyZW1vdmVBbGxNYXJrZXJzOiByZW1vdmVBbGxNYXJrZXJzLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9uRGlkQ2hhbmdlTWFya2VyczogPGFueT5vbkRpZENoYW5nZU1hcmtlcnMsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Z2V0TW9kZWxzOiA8YW55PmdldE1vZGVscyxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRnZXRNb2RlbDogPGFueT5nZXRNb2RlbCxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvbkRpZENyZWF0ZU1vZGVsOiA8YW55Pm9uRGlkQ3JlYXRlTW9kZWwsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0b25XaWxsRGlzcG9zZU1vZGVsOiA8YW55Pm9uV2lsbERpc3Bvc2VNb2RlbCxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2U6IDxhbnk+b25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlLFxuXG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjcmVhdGVXZWJXb3JrZXI6IDxhbnk+Y3JlYXRlV2ViV29ya2VyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbG9yaXplRWxlbWVudDogPGFueT5jb2xvcml6ZUVsZW1lbnQsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29sb3JpemU6IDxhbnk+Y29sb3JpemUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29sb3JpemVNb2RlbExpbmU6IDxhbnk+Y29sb3JpemVNb2RlbExpbmUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0dG9rZW5pemU6IDxhbnk+dG9rZW5pemUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0ZGVmaW5lVGhlbWU6IDxhbnk+ZGVmaW5lVGhlbWUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0c2V0VGhlbWU6IDxhbnk+c2V0VGhlbWUsXG5cdFx0cmVtZWFzdXJlRm9udHM6IHJlbWVhc3VyZUZvbnRzLFxuXHRcdHJlZ2lzdGVyQ29tbWFuZDogcmVnaXN0ZXJDb21tYW5kLFxuXG5cdFx0cmVnaXN0ZXJMaW5rT3BlbmVyOiByZWdpc3RlckxpbmtPcGVuZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJFZGl0b3JPcGVuZXI6IDxhbnk+cmVnaXN0ZXJFZGl0b3JPcGVuZXIsXG5cblx0XHQvLyBlbnVtc1xuXHRcdEFjY2Vzc2liaWxpdHlTdXBwb3J0OiBzdGFuZGFsb25lRW51bXMuQWNjZXNzaWJpbGl0eVN1cHBvcnQsXG5cdFx0Q29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZTogc3RhbmRhbG9uZUVudW1zLkNvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsXG5cdFx0Q3Vyc29yQ2hhbmdlUmVhc29uOiBzdGFuZGFsb25lRW51bXMuQ3Vyc29yQ2hhbmdlUmVhc29uLFxuXHRcdERlZmF1bHRFbmRPZkxpbmU6IHN0YW5kYWxvbmVFbnVtcy5EZWZhdWx0RW5kT2ZMaW5lLFxuXHRcdEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneTogc3RhbmRhbG9uZUVudW1zLkVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSxcblx0XHRFZGl0b3JPcHRpb246IHN0YW5kYWxvbmVFbnVtcy5FZGl0b3JPcHRpb24sXG5cdFx0RW5kT2ZMaW5lUHJlZmVyZW5jZTogc3RhbmRhbG9uZUVudW1zLkVuZE9mTGluZVByZWZlcmVuY2UsXG5cdFx0RW5kT2ZMaW5lU2VxdWVuY2U6IHN0YW5kYWxvbmVFbnVtcy5FbmRPZkxpbmVTZXF1ZW5jZSxcblx0XHRNaW5pbWFwUG9zaXRpb246IHN0YW5kYWxvbmVFbnVtcy5NaW5pbWFwUG9zaXRpb24sXG5cdFx0TWluaW1hcFNlY3Rpb25IZWFkZXJTdHlsZTogc3RhbmRhbG9uZUVudW1zLk1pbmltYXBTZWN0aW9uSGVhZGVyU3R5bGUsXG5cdFx0TW91c2VUYXJnZXRUeXBlOiBzdGFuZGFsb25lRW51bXMuTW91c2VUYXJnZXRUeXBlLFxuXHRcdE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2U6IHN0YW5kYWxvbmVFbnVtcy5PdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLFxuXHRcdE92ZXJ2aWV3UnVsZXJMYW5lOiBzdGFuZGFsb25lRW51bXMuT3ZlcnZpZXdSdWxlckxhbmUsXG5cdFx0R2x5cGhNYXJnaW5MYW5lOiBzdGFuZGFsb25lRW51bXMuR2x5cGhNYXJnaW5MYW5lLFxuXHRcdFJlbmRlckxpbmVOdW1iZXJzVHlwZTogc3RhbmRhbG9uZUVudW1zLlJlbmRlckxpbmVOdW1iZXJzVHlwZSxcblx0XHRSZW5kZXJNaW5pbWFwOiBzdGFuZGFsb25lRW51bXMuUmVuZGVyTWluaW1hcCxcblx0XHRTY3JvbGxiYXJWaXNpYmlsaXR5OiBzdGFuZGFsb25lRW51bXMuU2Nyb2xsYmFyVmlzaWJpbGl0eSxcblx0XHRTY3JvbGxUeXBlOiBzdGFuZGFsb25lRW51bXMuU2Nyb2xsVHlwZSxcblx0XHRUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZTogc3RhbmRhbG9uZUVudW1zLlRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLFxuXHRcdFRleHRFZGl0b3JDdXJzb3JTdHlsZTogc3RhbmRhbG9uZUVudW1zLlRleHRFZGl0b3JDdXJzb3JTdHlsZSxcblx0XHRUcmFja2VkUmFuZ2VTdGlja2luZXNzOiBzdGFuZGFsb25lRW51bXMuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyxcblx0XHRXcmFwcGluZ0luZGVudDogc3RhbmRhbG9uZUVudW1zLldyYXBwaW5nSW5kZW50LFxuXHRcdEluamVjdGVkVGV4dEN1cnNvclN0b3BzOiBzdGFuZGFsb25lRW51bXMuSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMsXG5cdFx0UG9zaXRpb25BZmZpbml0eTogc3RhbmRhbG9uZUVudW1zLlBvc2l0aW9uQWZmaW5pdHksXG5cdFx0U2hvd0xpZ2h0YnVsYkljb25Nb2RlOiBzdGFuZGFsb25lRW51bXMuU2hvd0xpZ2h0YnVsYkljb25Nb2RlLFxuXHRcdFRleHREaXJlY3Rpb246IHN0YW5kYWxvbmVFbnVtcy5UZXh0RGlyZWN0aW9uLFxuXG5cdFx0Ly8gY2xhc3Nlc1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQ6IDxhbnk+Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRCYXJlRm9udEluZm86IDxhbnk+QmFyZUZvbnRJbmZvLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdEZvbnRJbmZvOiA8YW55PkZvbnRJbmZvLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFRleHRNb2RlbFJlc29sdmVkT3B0aW9uczogPGFueT5UZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0RmluZE1hdGNoOiA8YW55PkZpbmRNYXRjaCxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRBcHBseVVwZGF0ZVJlc3VsdDogPGFueT5BcHBseVVwZGF0ZVJlc3VsdCxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRFZGl0b3Jab29tOiA8YW55PkVkaXRvclpvb20sXG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjcmVhdGVNdWx0aUZpbGVEaWZmRWRpdG9yOiA8YW55PmNyZWF0ZU11bHRpRmlsZURpZmZFZGl0b3IsXG5cblx0XHQvLyB2YXJzXG5cdFx0RWRpdG9yVHlwZTogRWRpdG9yVHlwZSxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRFZGl0b3JPcHRpb25zOiA8YW55PkVkaXRvck9wdGlvbnNcblxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLHVC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
