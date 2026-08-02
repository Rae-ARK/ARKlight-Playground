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
import { timeout } from "../../../../../base/common/async.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, derived } from "../../../../../base/common/observable.js";
import { buildHistoryFromTasks, renderSwimlanes } from "../../../../../base/test/common/executionGraph.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { createTraceLogger } from "../../../../../base/test/common/virtualScheduling/index.js";
import { IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { CoreEditingCommands, CoreNavigationCommands } from "../../../../browser/coreCommands.js";
import { IBulkEditService } from "../../../../browser/services/bulkEditService.js";
import { IRenameSymbolTrackerService, NullRenameSymbolTrackerService } from "../../../../browser/services/renameSymbolTrackerService.js";
import { TextEdit } from "../../../../common/core/edits/textEdit.js";
import { Range } from "../../../../common/core/range.js";
import { PositionOffsetTransformer } from "../../../../common/core/text/positionToOffset.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { IModelService } from "../../../../common/services/model.js";
import { ITextModelService } from "../../../../common/services/resolverService.js";
import { withAsyncTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { InlineCompletionsController } from "../../browser/controller/inlineCompletionsController.js";
import { InlineSuggestionsView } from "../../browser/view/inlineSuggestionsView.js";
class MockInlineCompletionsProvider {
  constructor(enableForwardStability = false) {
    this.enableForwardStability = enableForwardStability;
    this.returnValue = [];
    this.delayMs = 0;
    this.callHistory = new Array();
    this.calledTwiceIn50Ms = false;
    this._onDidChangeEmitter = new Emitter();
    this.onDidChangeInlineCompletions = this._onDidChangeEmitter.event;
    this.lastTimeMs = void 0;
  }
  setReturnValue(value, delayMs = 0) {
    this.returnValue = value ? [value] : [];
    this.delayMs = delayMs;
  }
  setReturnValues(values, delayMs = 0) {
    this.returnValue = values;
    this.delayMs = delayMs;
  }
  getAndClearCallHistory() {
    const history = [...this.callHistory];
    this.callHistory = [];
    return history;
  }
  assertNotCalledTwiceWithin50ms() {
    if (this.calledTwiceIn50Ms) {
      throw new Error("provideInlineCompletions has been called at least twice within 50ms. This should not happen.");
    }
  }
  /**
   * Fire an onDidChange event with an optional change hint.
   */
  fireOnDidChange(changeHint) {
    this._onDidChangeEmitter.fire(changeHint);
  }
  async provideInlineCompletions(model, position, context, token) {
    const currentTimeMs = (/* @__PURE__ */ new Date()).getTime();
    if (this.lastTimeMs && currentTimeMs - this.lastTimeMs < 50) {
      this.calledTwiceIn50Ms = true;
    }
    this.lastTimeMs = currentTimeMs;
    this.callHistory.push({
      position: position.toString(),
      triggerKind: context.triggerKind,
      text: model.getValue(),
      ...context.changeHint !== void 0 ? { changeHint: context.changeHint } : {}
    });
    const result = new Array();
    for (const v of this.returnValue) {
      const x = { ...v };
      if (!x.range) {
        x.range = model.getFullModelRange();
      }
      result.push(x);
    }
    if (this.delayMs > 0) {
      await timeout(this.delayMs);
    }
    return { items: result, enableForwardStability: this.enableForwardStability };
  }
  disposeInlineCompletions() {
  }
  handleItemDidShow() {
  }
}
class MockSearchReplaceCompletionsProvider {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
  }
  add(search, replace) {
    this._map.set(search, replace);
  }
  async provideInlineCompletions(model, position, context, token) {
    const text = model.getValue();
    for (const [search, replace] of this._map) {
      const idx = text.indexOf(search);
      if (idx !== -1) {
        const range = Range.fromPositions(model.getPositionAt(idx), model.getPositionAt(idx + search.length));
        return {
          items: [
            { range, insertText: replace, isInlineEdit: true }
          ]
        };
      }
    }
    return { items: [] };
  }
  disposeInlineCompletions() {
  }
  handleItemDidShow() {
  }
}
class InlineEditContext extends Disposable {
  constructor(model, editor, _logger) {
    super();
    this.editor = editor;
    this._logger = _logger;
    this.prettyViewStates = new Array();
    const edit = derived((reader) => {
      const state = model.state.read(reader);
      return state ? new TextEdit(state.edits) : void 0;
    });
    this._register(autorun((reader) => {
      const e = edit.read(reader);
      let view;
      if (e) {
        view = e.toString(this.editor.getValue());
      } else {
        view = void 0;
      }
      this.prettyViewStates.push(view);
    }));
  }
  getAndClearViewStates() {
    const arr = [...this.prettyViewStates];
    this.prettyViewStates.length = 0;
    this._logger?.log(`getAndClearViewStates() => ${JSON.stringify(arr)}`);
    return arr;
  }
}
class GhostTextContext extends Disposable {
  constructor(model, editor, _logger) {
    super();
    this.editor = editor;
    this._logger = _logger;
    this.prettyViewStates = new Array();
    this._register(autorun((reader) => {
      const ghostText = model.primaryGhostText.read(reader);
      let view;
      if (ghostText) {
        view = ghostText.render(this.editor.getValue(), true);
      } else {
        view = this.editor.getValue();
      }
      if (this._currentPrettyViewState !== view) {
        this.prettyViewStates.push(view);
      }
      this._currentPrettyViewState = view;
    }));
  }
  get currentPrettyViewState() {
    return this._currentPrettyViewState;
  }
  getAndClearViewStates() {
    const arr = [...this.prettyViewStates];
    this.prettyViewStates.length = 0;
    this._logger?.log(`getAndClearViewStates() => ${JSON.stringify(arr)}`);
    return arr;
  }
  keyboardType(text) {
    this._logger?.log(`keyboardType(${JSON.stringify(text)})`);
    this.editor.trigger("keyboard", "type", { text });
  }
  cursorUp() {
    this.editor.runCommand(CoreNavigationCommands.CursorUp, null);
  }
  cursorRight() {
    this.editor.runCommand(CoreNavigationCommands.CursorRight, null);
  }
  cursorLeft() {
    this.editor.runCommand(CoreNavigationCommands.CursorLeft, null);
  }
  cursorDown() {
    this.editor.runCommand(CoreNavigationCommands.CursorDown, null);
  }
  cursorLineEnd() {
    this.editor.runCommand(CoreNavigationCommands.CursorLineEnd, null);
  }
  leftDelete() {
    this.editor.runCommand(CoreEditingCommands.DeleteLeft, null);
  }
}
async function withAsyncTestCodeEditorAndInlineCompletionsModel(text, options, callback) {
  const logs = [];
  const logger = createTraceLogger(logs);
  return await runWithFakedTimers({
    useFakeTimers: options.fakeClock,
    onHistory: options.logTimeTrace ? (history) => {
      const mode = options.fakeClock ? "virtual time" : "real time";
      const out = history.length === 0 && logs.length === 0 ? `[time trace ${mode}] (no events)` : `[time trace ${mode}] ${history.length} events, ${logs.length} log lines
${renderSwimlanes(buildHistoryFromTasks(history, history[0]?.time ?? 0, logs))}`;
      console.log(out);
    } : void 0
  }, async () => {
    const disposableStore = new DisposableStore();
    try {
      if (options.provider) {
        const languageFeaturesService = new LanguageFeaturesService();
        if (!options.serviceCollection) {
          options.serviceCollection = new ServiceCollection();
        }
        options.serviceCollection.set(ILanguageFeaturesService, languageFeaturesService);
        options.serviceCollection.set(IAccessibilitySignalService, {
          playSignal: async () => {
          },
          isSoundEnabled(signal) {
            return false;
          }
        });
        options.serviceCollection.set(IBulkEditService, {
          apply: async () => {
            throw new Error("IBulkEditService.apply not implemented");
          },
          hasPreviewHandler: () => {
            throw new Error("IBulkEditService.hasPreviewHandler not implemented");
          },
          setPreviewHandler: () => {
            throw new Error("IBulkEditService.setPreviewHandler not implemented");
          },
          _serviceBrand: void 0
        });
        options.serviceCollection.set(ITextModelService, new SyncDescriptor(MockTextModelService));
        options.serviceCollection.set(IDefaultAccountService, {
          _serviceBrand: void 0,
          onDidChangeDefaultAccount: Event.None,
          onDidChangePolicyData: Event.None,
          policyData: null,
          currentDefaultAccount: null,
          copilotTokenInfo: null,
          onDidChangeCopilotTokenInfo: Event.None,
          managedSettingsFetchStatus: null,
          managedSettingsFetchedAt: null,
          managedSettingsRawResponse: null,
          getDefaultAccount: async () => null,
          setDefaultAccountProvider: () => {
          },
          getDefaultAccountAuthenticationProvider: () => {
            return { id: "mockProvider", name: "Mock Provider", enterprise: false };
          },
          resolveGitHubUrl: (path) => `https://github.com/${path}`,
          refresh: async () => {
            return null;
          },
          signIn: async () => {
            return null;
          },
          signOut: async () => {
          }
        });
        options.serviceCollection.set(IRenameSymbolTrackerService, new NullRenameSymbolTrackerService());
        const d = languageFeaturesService.inlineCompletionsProvider.register({ pattern: "**" }, options.provider);
        disposableStore.add(d);
      }
      let result;
      await withAsyncTestCodeEditor(text, options, async (editor, editorViewModel, instantiationService) => {
        instantiationService.stubInstance(InlineSuggestionsView, {
          shouldShowHoverAtViewZone: () => false,
          dispose: () => {
          }
        });
        const controller = instantiationService.createInstance(InlineCompletionsController, editor);
        const model = controller.model.get();
        const context = new GhostTextContext(model, editor, logger);
        try {
          result = await callback({ editor, editorViewModel, model, context, store: disposableStore, logger });
        } finally {
          context.dispose();
          model.dispose();
          controller.dispose();
        }
      });
      if (options.provider instanceof MockInlineCompletionsProvider) {
        options.provider.assertNotCalledTwiceWithin50ms();
      }
      return result;
    } finally {
      disposableStore.dispose();
    }
  });
}
class AnnotatedString {
  constructor(src, annotations = ["\u2193"]) {
    const markers = findMarkers(src, annotations);
    this.value = markers.textWithoutMarkers;
    this.markers = markers.results;
  }
  getMarkerOffset(markerIdx = 0) {
    if (markerIdx >= this.markers.length) {
      throw new BugIndicatingError(`Marker index ${markerIdx} out of bounds`);
    }
    return this.markers[markerIdx].idx;
  }
}
function findMarkers(text, markers) {
  const results = [];
  let textWithoutMarkers = "";
  markers.sort((a, b) => b.length - a.length);
  let pos = 0;
  for (let i = 0; i < text.length; ) {
    let foundMarker = false;
    for (const marker of markers) {
      if (text.startsWith(marker, i)) {
        results.push({ mark: marker, idx: pos });
        i += marker.length;
        foundMarker = true;
        break;
      }
    }
    if (!foundMarker) {
      textWithoutMarkers += text[i];
      pos++;
      i++;
    }
  }
  return { results, textWithoutMarkers };
}
class AnnotatedText extends AnnotatedString {
  constructor() {
    super(...arguments);
    this._transformer = new PositionOffsetTransformer(this.value);
  }
  getMarkerPosition(markerIdx = 0) {
    return this._transformer.getPosition(this.getMarkerOffset(markerIdx));
  }
}
let MockTextModelService = class {
  constructor(_modelService) {
    this._modelService = _modelService;
  }
  async createModelReference(resource) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      throw new Error(`MockTextModelService: Model not found for ${resource.toString()}`);
    }
    return {
      object: {
        textEditorModel: model,
        getLanguageId: () => model.getLanguageId(),
        isReadonly: () => false,
        isDisposed: () => model.isDisposed(),
        isResolved: () => true,
        onWillDispose: model.onWillDispose,
        resolve: async () => {
        },
        createSnapshot: () => model.createSnapshot(),
        dispose: () => {
        }
      },
      dispose: () => {
      }
    };
  }
  registerTextModelContentProvider() {
    throw new Error("MockTextModelService.registerTextModelContentProvider not implemented");
  }
  canHandleResource() {
    return false;
  }
};
MockTextModelService = __decorateClass([
  __decorateParam(0, IModelService)
], MockTextModelService);
export {
  AnnotatedString,
  AnnotatedText,
  GhostTextContext,
  InlineEditContext,
  MockInlineCompletionsProvider,
  MockSearchReplaceCompletionsProvider,
  withAsyncTestCodeEditorAndInlineCompletionsModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL3Rlc3QvYnJvd3Nlci91dGlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGJ1aWxkSGlzdG9yeUZyb21UYXNrcywgcmVuZGVyU3dpbWxhbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9leGVjdXRpb25HcmFwaC5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlVHJhY2VMb2dnZXIsIElUcmFjZUxvZ0VudHJ5LCBJVHJhY2VMb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3ZpcnR1YWxTY2hlZHVsaW5nL2luZGV4LmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzLCBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSwgTnVsbFJlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9yZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC9wb3NpdGlvblRvT2Zmc2V0LmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCwgSW5saW5lQ29tcGxldGlvbiwgSW5saW5lQ29tcGxldGlvbkNvbnRleHQsIElubGluZUNvbXBsZXRpb25zLCBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IElUZXN0Q29kZUVkaXRvciwgVGVzdENvZGVFZGl0b3JJbnN0YW50aWF0aW9uT3B0aW9ucywgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2RlbC9pbmxpbmVDb21wbGV0aW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25zVmlldyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlldy9pbmxpbmVTdWdnZXN0aW9uc1ZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIgaW1wbGVtZW50cyBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIHtcblx0cHJpdmF0ZSByZXR1cm5WYWx1ZTogSW5saW5lQ29tcGxldGlvbltdID0gW107XG5cdHByaXZhdGUgZGVsYXlNczogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIGNhbGxIaXN0b3J5ID0gbmV3IEFycmF5PHVua25vd24+KCk7XG5cdHByaXZhdGUgY2FsbGVkVHdpY2VJbjUwTXMgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJSW5saW5lQ29tcGxldGlvbkNoYW5nZUhpbnQgfCB2b2lkPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbmxpbmVDb21wbGV0aW9uczogRXZlbnQ8SUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50IHwgdm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGVuYWJsZUZvcndhcmRTdGFiaWxpdHkgPSBmYWxzZSxcblx0KSB7IH1cblxuXHRwdWJsaWMgc2V0UmV0dXJuVmFsdWUodmFsdWU6IElubGluZUNvbXBsZXRpb24gfCB1bmRlZmluZWQsIGRlbGF5TXM6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHR0aGlzLnJldHVyblZhbHVlID0gdmFsdWUgPyBbdmFsdWVdIDogW107XG5cdFx0dGhpcy5kZWxheU1zID0gZGVsYXlNcztcblx0fVxuXG5cdHB1YmxpYyBzZXRSZXR1cm5WYWx1ZXModmFsdWVzOiBJbmxpbmVDb21wbGV0aW9uW10sIGRlbGF5TXM6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHR0aGlzLnJldHVyblZhbHVlID0gdmFsdWVzO1xuXHRcdHRoaXMuZGVsYXlNcyA9IGRlbGF5TXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpIHtcblx0XHRjb25zdCBoaXN0b3J5ID0gWy4uLnRoaXMuY2FsbEhpc3RvcnldO1xuXHRcdHRoaXMuY2FsbEhpc3RvcnkgPSBbXTtcblx0XHRyZXR1cm4gaGlzdG9yeTtcblx0fVxuXG5cdHB1YmxpYyBhc3NlcnROb3RDYWxsZWRUd2ljZVdpdGhpbjUwbXMoKSB7XG5cdFx0aWYgKHRoaXMuY2FsbGVkVHdpY2VJbjUwTXMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigncHJvdmlkZUlubGluZUNvbXBsZXRpb25zIGhhcyBiZWVuIGNhbGxlZCBhdCBsZWFzdCB0d2ljZSB3aXRoaW4gNTBtcy4gVGhpcyBzaG91bGQgbm90IGhhcHBlbi4nKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRmlyZSBhbiBvbkRpZENoYW5nZSBldmVudCB3aXRoIGFuIG9wdGlvbmFsIGNoYW5nZSBoaW50LlxuXHQgKi9cblx0cHVibGljIGZpcmVPbkRpZENoYW5nZShjaGFuZ2VIaW50PzogSUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50KTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoY2hhbmdlSGludCk7XG5cdH1cblxuXHRwcml2YXRlIGxhc3RUaW1lTXM6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRhc3luYyBwcm92aWRlSW5saW5lQ29tcGxldGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgY29udGV4dDogSW5saW5lQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SW5saW5lQ29tcGxldGlvbnM+IHtcblx0XHRjb25zdCBjdXJyZW50VGltZU1zID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0aWYgKHRoaXMubGFzdFRpbWVNcyAmJiBjdXJyZW50VGltZU1zIC0gdGhpcy5sYXN0VGltZU1zIDwgNTApIHtcblx0XHRcdHRoaXMuY2FsbGVkVHdpY2VJbjUwTXMgPSB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLmxhc3RUaW1lTXMgPSBjdXJyZW50VGltZU1zO1xuXG5cdFx0dGhpcy5jYWxsSGlzdG9yeS5wdXNoKHtcblx0XHRcdHBvc2l0aW9uOiBwb3NpdGlvbi50b1N0cmluZygpLFxuXHRcdFx0dHJpZ2dlcktpbmQ6IGNvbnRleHQudHJpZ2dlcktpbmQsXG5cdFx0XHR0ZXh0OiBtb2RlbC5nZXRWYWx1ZSgpLFxuXHRcdFx0Li4uKGNvbnRleHQuY2hhbmdlSGludCAhPT0gdW5kZWZpbmVkID8geyBjaGFuZ2VIaW50OiBjb250ZXh0LmNoYW5nZUhpbnQgfSA6IHt9KSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgQXJyYXk8SW5saW5lQ29tcGxldGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IHYgb2YgdGhpcy5yZXR1cm5WYWx1ZSkge1xuXHRcdFx0Y29uc3QgeCA9IHsgLi4udiB9O1xuXHRcdFx0aWYgKCF4LnJhbmdlKSB7XG5cdFx0XHRcdHgucmFuZ2UgPSBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goeCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGVsYXlNcyA+IDApIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQodGhpcy5kZWxheU1zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBpdGVtczogcmVzdWx0LCBlbmFibGVGb3J3YXJkU3RhYmlsaXR5OiB0aGlzLmVuYWJsZUZvcndhcmRTdGFiaWxpdHkgfTtcblx0fVxuXHRkaXNwb3NlSW5saW5lQ29tcGxldGlvbnMoKSB7IH1cblx0aGFuZGxlSXRlbURpZFNob3coKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vY2tTZWFyY2hSZXBsYWNlQ29tcGxldGlvbnNQcm92aWRlciBpbXBsZW1lbnRzIElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIge1xuXHRwcml2YXRlIF9tYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdHB1YmxpYyBhZGQoc2VhcmNoOiBzdHJpbmcsIHJlcGxhY2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21hcC5zZXQoc2VhcmNoLCByZXBsYWNlKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVJbmxpbmVDb21wbGV0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBjb250ZXh0OiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJbmxpbmVDb21wbGV0aW9ucz4ge1xuXHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdGZvciAoY29uc3QgW3NlYXJjaCwgcmVwbGFjZV0gb2YgdGhpcy5fbWFwKSB7XG5cdFx0XHRjb25zdCBpZHggPSB0ZXh0LmluZGV4T2Yoc2VhcmNoKTtcblx0XHRcdC8vIHJlcGxhY2UgaWR4Li4uaWR4K3RleHQubGVuZ3RoIHdpdGggcmVwbGFjZVxuXHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKG1vZGVsLmdldFBvc2l0aW9uQXQoaWR4KSwgbW9kZWwuZ2V0UG9zaXRpb25BdChpZHggKyBzZWFyY2gubGVuZ3RoKSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdHsgcmFuZ2UsIGluc2VydFRleHQ6IHJlcGxhY2UsIGlzSW5saW5lRWRpdDogdHJ1ZSB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBpdGVtczogW10gfTtcblx0fVxuXHRkaXNwb3NlSW5saW5lQ29tcGxldGlvbnMoKSB7IH1cblx0aGFuZGxlSXRlbURpZFNob3coKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRDb250ZXh0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBwcmV0dHlWaWV3U3RhdGVzID0gbmV3IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbDogSW5saW5lQ29tcGxldGlvbnNNb2RlbCwgcHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgcHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyPzogSVRyYWNlTG9nZ2VyKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVkaXQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBzdGF0ZSA/IG5ldyBUZXh0RWRpdChzdGF0ZS5lZGl0cykgOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSAqL1xuXHRcdFx0Y29uc3QgZSA9IGVkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0bGV0IHZpZXc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0dmlldyA9IGUudG9TdHJpbmcodGhpcy5lZGl0b3IuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2aWV3ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnByZXR0eVZpZXdTdGF0ZXMucHVzaCh2aWV3KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCk6IChzdHJpbmcgfCB1bmRlZmluZWQpW10ge1xuXHRcdGNvbnN0IGFyciA9IFsuLi50aGlzLnByZXR0eVZpZXdTdGF0ZXNdO1xuXHRcdHRoaXMucHJldHR5Vmlld1N0YXRlcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2xvZ2dlcj8ubG9nKGBnZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSA9PiAke0pTT04uc3RyaW5naWZ5KGFycil9YCk7XG5cdFx0cmV0dXJuIGFycjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR2hvc3RUZXh0Q29udGV4dCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJldHR5Vmlld1N0YXRlcyA9IG5ldyBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+KCk7XG5cdHByaXZhdGUgX2N1cnJlbnRQcmV0dHlWaWV3U3RhdGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCBjdXJyZW50UHJldHR5Vmlld1N0YXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50UHJldHR5Vmlld1N0YXRlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElubGluZUNvbXBsZXRpb25zTW9kZWwsIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcj86IElUcmFjZUxvZ2dlcikge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSAqL1xuXHRcdFx0Y29uc3QgZ2hvc3RUZXh0ID0gbW9kZWwucHJpbWFyeUdob3N0VGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRsZXQgdmlldzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGdob3N0VGV4dCkge1xuXHRcdFx0XHR2aWV3ID0gZ2hvc3RUZXh0LnJlbmRlcih0aGlzLmVkaXRvci5nZXRWYWx1ZSgpLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZpZXcgPSB0aGlzLmVkaXRvci5nZXRWYWx1ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFByZXR0eVZpZXdTdGF0ZSAhPT0gdmlldykge1xuXHRcdFx0XHR0aGlzLnByZXR0eVZpZXdTdGF0ZXMucHVzaCh2aWV3KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnJlbnRQcmV0dHlWaWV3U3RhdGUgPSB2aWV3O1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbmRDbGVhclZpZXdTdGF0ZXMoKTogKHN0cmluZyB8IHVuZGVmaW5lZClbXSB7XG5cdFx0Y29uc3QgYXJyID0gWy4uLnRoaXMucHJldHR5Vmlld1N0YXRlc107XG5cdFx0dGhpcy5wcmV0dHlWaWV3U3RhdGVzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fbG9nZ2VyPy5sb2coYGdldEFuZENsZWFyVmlld1N0YXRlcygpID0+ICR7SlNPTi5zdHJpbmdpZnkoYXJyKX1gKTtcblx0XHRyZXR1cm4gYXJyO1xuXHR9XG5cblx0cHVibGljIGtleWJvYXJkVHlwZSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXI/LmxvZyhga2V5Ym9hcmRUeXBlKCR7SlNPTi5zdHJpbmdpZnkodGV4dCl9KWApO1xuXHRcdHRoaXMuZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ3R5cGUnLCB7IHRleHQgfSk7XG5cdH1cblxuXHRwdWJsaWMgY3Vyc29yVXAoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBjdXJzb3JSaWdodCgpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yUmlnaHQsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGN1cnNvckxlZnQoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxlZnQsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGN1cnNvckRvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd24sIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGN1cnNvckxpbmVFbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxpbmVFbmQsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGxlZnREZWxldGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCB7XG5cdGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yO1xuXHRlZGl0b3JWaWV3TW9kZWw6IFZpZXdNb2RlbDtcblx0bW9kZWw6IElubGluZUNvbXBsZXRpb25zTW9kZWw7XG5cdGNvbnRleHQ6IEdob3N0VGV4dENvbnRleHQ7XG5cdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxvZ2dlcjogSVRyYWNlTG9nZ2VyO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsPFQ+KFxuXHR0ZXh0OiBzdHJpbmcsXG5cdG9wdGlvbnM6IFRlc3RDb2RlRWRpdG9ySW5zdGFudGlhdGlvbk9wdGlvbnMgJiB7IHByb3ZpZGVyPzogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcjsgZmFrZUNsb2NrPzogYm9vbGVhbjsgbG9nVGltZVRyYWNlPzogYm9vbGVhbiB9LFxuXHRjYWxsYmFjazogKGFyZ3M6IElXaXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0Y29uc3QgbG9nczogSVRyYWNlTG9nRW50cnlbXSA9IFtdO1xuXHRjb25zdCBsb2dnZXIgPSBjcmVhdGVUcmFjZUxvZ2dlcihsb2dzKTtcblx0cmV0dXJuIGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7XG5cdFx0dXNlRmFrZVRpbWVyczogb3B0aW9ucy5mYWtlQ2xvY2ssXG5cdFx0b25IaXN0b3J5OiBvcHRpb25zLmxvZ1RpbWVUcmFjZSA/IGhpc3RvcnkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZSA9IG9wdGlvbnMuZmFrZUNsb2NrID8gJ3ZpcnR1YWwgdGltZScgOiAncmVhbCB0aW1lJztcblx0XHRcdGNvbnN0IG91dDogc3RyaW5nID0gaGlzdG9yeS5sZW5ndGggPT09IDAgJiYgbG9ncy5sZW5ndGggPT09IDBcblx0XHRcdFx0PyBgW3RpbWUgdHJhY2UgJHttb2RlfV0gKG5vIGV2ZW50cylgXG5cdFx0XHRcdDogYFt0aW1lIHRyYWNlICR7bW9kZX1dICR7aGlzdG9yeS5sZW5ndGh9IGV2ZW50cywgJHtsb2dzLmxlbmd0aH0gbG9nIGxpbmVzXFxuJHtyZW5kZXJTd2ltbGFuZXMoYnVpbGRIaXN0b3J5RnJvbVRhc2tzKGhpc3RvcnksIGhpc3RvcnlbMF0/LnRpbWUgPz8gMCwgbG9ncykpfWA7XG5cdFx0XHQvLyBQcmVmaXggaXMgYWxsb3dsaXN0ZWQgaW4gdGhlIHRlc3QgcmVuZGVyZXIncyBkaWFnbm9zdGljLW91dHB1dCBmaWx0ZXIuXG5cdFx0XHRjb25zb2xlLmxvZyhvdXQpO1xuXHRcdH0gOiB1bmRlZmluZWQsXG5cdH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKG9wdGlvbnMucHJvdmlkZXIpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKTtcblx0XHRcdFx0aWYgKCFvcHRpb25zLnNlcnZpY2VDb2xsZWN0aW9uKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wdGlvbnMuc2VydmljZUNvbGxlY3Rpb24uc2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbi5zZXQoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0cGxheVNpZ25hbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRcdGlzU291bmRFbmFibGVkKHNpZ25hbDogdW5rbm93bikgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0XHRcdH0gYXMgYW55KTtcblx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbi5zZXQoSUJ1bGtFZGl0U2VydmljZSwge1xuXHRcdFx0XHRcdGFwcGx5OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSUJ1bGtFZGl0U2VydmljZS5hcHBseSBub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRcdFx0XHRoYXNQcmV2aWV3SGFuZGxlcjogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0lCdWxrRWRpdFNlcnZpY2UuaGFzUHJldmlld0hhbmRsZXIgbm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0XHRcdFx0c2V0UHJldmlld0hhbmRsZXI6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdJQnVsa0VkaXRTZXJ2aWNlLnNldFByZXZpZXdIYW5kbGVyIG5vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG9wdGlvbnMuc2VydmljZUNvbGxlY3Rpb24uc2V0KElUZXh0TW9kZWxTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTW9ja1RleHRNb2RlbFNlcnZpY2UpKTtcblx0XHRcdFx0b3B0aW9ucy5zZXJ2aWNlQ29sbGVjdGlvbi5zZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSwge1xuXHRcdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlUG9saWN5RGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRwb2xpY3lEYXRhOiBudWxsLFxuXHRcdFx0XHRcdGN1cnJlbnREZWZhdWx0QWNjb3VudDogbnVsbCxcblx0XHRcdFx0XHRjb3BpbG90VG9rZW5JbmZvOiBudWxsLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mbzogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1czogbnVsbCxcblx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQ6IG51bGwsXG5cdFx0XHRcdFx0bWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2U6IG51bGwsXG5cdFx0XHRcdFx0Z2V0RGVmYXVsdEFjY291bnQ6IGFzeW5jICgpID0+IG51bGwsXG5cdFx0XHRcdFx0c2V0RGVmYXVsdEFjY291bnRQcm92aWRlcjogKCkgPT4geyB9LFxuXHRcdFx0XHRcdGdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcjogKCkgPT4geyByZXR1cm4geyBpZDogJ21vY2tQcm92aWRlcicsIG5hbWU6ICdNb2NrIFByb3ZpZGVyJywgZW50ZXJwcmlzZTogZmFsc2UgfTsgfSxcblx0XHRcdFx0XHRyZXNvbHZlR2l0SHViVXJsOiAocGF0aDogc3RyaW5nKSA9PiBgaHR0cHM6Ly9naXRodWIuY29tLyR7cGF0aH1gLFxuXHRcdFx0XHRcdHJlZnJlc2g6IGFzeW5jICgpID0+IHsgcmV0dXJuIG51bGw7IH0sXG5cdFx0XHRcdFx0c2lnbkluOiBhc3luYyAoKSA9PiB7IHJldHVybiBudWxsOyB9LFxuXHRcdFx0XHRcdHNpZ25PdXQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG9wdGlvbnMuc2VydmljZUNvbGxlY3Rpb24uc2V0KElSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSwgbmV3IE51bGxSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSgpKTtcblxuXHRcdFx0XHRjb25zdCBkID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5yZWdpc3Rlcih7IHBhdHRlcm46ICcqKicgfSwgb3B0aW9ucy5wcm92aWRlcik7XG5cdFx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoZCk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXN1bHQ6IFQ7XG5cdFx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcih0ZXh0LCBvcHRpb25zLCBhc3luYyAoZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShJbmxpbmVTdWdnZXN0aW9uc1ZpZXcsIHtcblx0XHRcdFx0XHRzaG91bGRTaG93SG92ZXJBdFZpZXdab25lOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLCBlZGl0b3IpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGNvbnRyb2xsZXIubW9kZWwuZ2V0KCkhO1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gbmV3IEdob3N0VGV4dENvbnRleHQobW9kZWwsIGVkaXRvciwgbG9nZ2VyKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCBjYWxsYmFjayh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCwgc3RvcmU6IGRpc3Bvc2FibGVTdG9yZSwgbG9nZ2VyIH0pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGNvbnRleHQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRjb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChvcHRpb25zLnByb3ZpZGVyIGluc3RhbmNlb2YgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIpIHtcblx0XHRcdFx0b3B0aW9ucy5wcm92aWRlci5hc3NlcnROb3RDYWxsZWRUd2ljZVdpdGhpbjUwbXMoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdCE7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIEFubm90YXRlZFN0cmluZyB7XG5cdHB1YmxpYyByZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWFya2VyczogeyBtYXJrOiBzdHJpbmc7IGlkeDogbnVtYmVyIH1bXTtcblxuXHRjb25zdHJ1Y3RvcihzcmM6IHN0cmluZywgYW5ub3RhdGlvbnM6IHN0cmluZ1tdID0gWydcdTIxOTMnXSkge1xuXHRcdGNvbnN0IG1hcmtlcnMgPSBmaW5kTWFya2VycyhzcmMsIGFubm90YXRpb25zKTtcblx0XHR0aGlzLnZhbHVlID0gbWFya2Vycy50ZXh0V2l0aG91dE1hcmtlcnM7XG5cdFx0dGhpcy5tYXJrZXJzID0gbWFya2Vycy5yZXN1bHRzO1xuXHR9XG5cblx0Z2V0TWFya2VyT2Zmc2V0KG1hcmtlcklkeCA9IDApOiBudW1iZXIge1xuXHRcdGlmIChtYXJrZXJJZHggPj0gdGhpcy5tYXJrZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcihgTWFya2VyIGluZGV4ICR7bWFya2VySWR4fSBvdXQgb2YgYm91bmRzYCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1hcmtlcnNbbWFya2VySWR4XS5pZHg7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmluZE1hcmtlcnModGV4dDogc3RyaW5nLCBtYXJrZXJzOiBzdHJpbmdbXSk6IHtcblx0cmVzdWx0czogeyBtYXJrOiBzdHJpbmc7IGlkeDogbnVtYmVyIH1bXTtcblx0dGV4dFdpdGhvdXRNYXJrZXJzOiBzdHJpbmc7XG59IHtcblx0Y29uc3QgcmVzdWx0czogeyBtYXJrOiBzdHJpbmc7IGlkeDogbnVtYmVyIH1bXSA9IFtdO1xuXHRsZXQgdGV4dFdpdGhvdXRNYXJrZXJzID0gJyc7XG5cblx0bWFya2Vycy5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKTtcblxuXHRsZXQgcG9zID0gMDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDspIHtcblx0XHRsZXQgZm91bmRNYXJrZXIgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IG1hcmtlciBvZiBtYXJrZXJzKSB7XG5cdFx0XHRpZiAodGV4dC5zdGFydHNXaXRoKG1hcmtlciwgaSkpIHtcblx0XHRcdFx0cmVzdWx0cy5wdXNoKHsgbWFyazogbWFya2VyLCBpZHg6IHBvcyB9KTtcblx0XHRcdFx0aSArPSBtYXJrZXIubGVuZ3RoO1xuXHRcdFx0XHRmb3VuZE1hcmtlciA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWZvdW5kTWFya2VyKSB7XG5cdFx0XHR0ZXh0V2l0aG91dE1hcmtlcnMgKz0gdGV4dFtpXTtcblx0XHRcdHBvcysrO1xuXHRcdFx0aSsrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IHJlc3VsdHMsIHRleHRXaXRob3V0TWFya2VycyB9O1xufVxuXG5leHBvcnQgY2xhc3MgQW5ub3RhdGVkVGV4dCBleHRlbmRzIEFubm90YXRlZFN0cmluZyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zZm9ybWVyID0gbmV3IFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIodGhpcy52YWx1ZSk7XG5cblx0Z2V0TWFya2VyUG9zaXRpb24obWFya2VySWR4ID0gMCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNmb3JtZXIuZ2V0UG9zaXRpb24odGhpcy5nZXRNYXJrZXJPZmZzZXQobWFya2VySWR4KSk7XG5cdH1cbn1cblxuY2xhc3MgTW9ja1RleHRNb2RlbFNlcnZpY2UgaW1wbGVtZW50cyBJVGV4dE1vZGVsU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTW9ja1RleHRNb2RlbFNlcnZpY2U6IE1vZGVsIG5vdCBmb3VuZCBmb3IgJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdHRleHRFZGl0b3JNb2RlbDogbW9kZWwsXG5cdFx0XHRcdGdldExhbmd1YWdlSWQ6ICgpID0+IG1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdFx0aXNSZWFkb25seTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGlzRGlzcG9zZWQ6ICgpID0+IG1vZGVsLmlzRGlzcG9zZWQoKSxcblx0XHRcdFx0aXNSZXNvbHZlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0b25XaWxsRGlzcG9zZTogbW9kZWwub25XaWxsRGlzcG9zZSxcblx0XHRcdFx0cmVzb2x2ZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRjcmVhdGVTbmFwc2hvdDogKCkgPT4gbW9kZWwuY3JlYXRlU25hcHNob3QoKSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXHR9XG5cblx0cmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoKTogbmV2ZXIge1xuXHRcdHRocm93IG5ldyBFcnJvcignTW9ja1RleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIgbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRjYW5IYW5kbGVSZXNvdXJjZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBRXhCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSx1QkFBbUM7QUFDeEQsU0FBUyxTQUFTLGVBQWU7QUFFakMsU0FBUyx1QkFBdUIsdUJBQXVCO0FBQ3ZELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXVEO0FBQ2hFLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCLDhCQUE4QjtBQUM1RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QixzQ0FBc0M7QUFDNUUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUNBQWlDO0FBRzFDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW1DLHlCQUF5QjtBQUU1RCxTQUE4RCwrQkFBK0I7QUFDN0YsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyw2QkFBNkI7QUFFL0IsTUFBTSw4QkFBbUU7QUFBQSxFQVUvRSxZQUNpQix5QkFBeUIsT0FDeEM7QUFEZTtBQVZqQixTQUFRLGNB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
